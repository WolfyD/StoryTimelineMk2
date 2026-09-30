# 03 — Bridge Protocol (Vue ↔ C# via WebView2)

All communication between the Vue 3 SPA and the WinForms host flows through WebView2's JSON
message channel. There is no HTTP server and no RPC library — just three small pieces:

| Side | File | Role |
|------|------|------|
| Frontend | `Frontend/src/bridge/api.ts` | `BackendAPI` object: `send()` (fire-and-forget), `request()` (request-response), plus one typed wrapper method per action. Also installs the single global `message` listener. |
| Backend | `Bridge/BridgeMessage.cs` | DTO for incoming messages: `action` (string), `payload` (`JsonElement`), `messageId` (`int?`). |
| Backend | `Bridge/MessageRouter.cs` | Subscribes to `CoreWebView2.WebMessageReceived`, deserializes into `BridgeMessage`, dispatches on the `action` string in `RouteMessage()`, and answers via `ReplyToVue()` / `SendToVue()`. |

Each WinForms window (`f_Main`, `f_Timeline`, `f_AddEditItem`, `f_Calendar`) hosts its own
WebView2 and constructs its own `MessageRouter`, so every window is an independent bridge
endpoint. The router optionally receives the parent `Form` so handlers can drive window state
(minimize, fullscreen, drag).

## 1. Wire Format

### Vue → C# (both patterns)

```json
{ "action": "SaveItem", "payload": { ... }, "messageId": 42 }
```

- `action` — dispatch key, matched **exactly** (case-sensitive) in `RouteMessage()`.
- `payload` — arbitrary JSON; C# receives it as a raw `JsonElement`.
- `messageId` — present only for `request()`; a monotonically increasing counter
  (`++messageCounter`) starting at 1, scoped per page load.

### C# → Vue: reply to a request (`ReplyToVue`)

```json
{ "messageId": 42, "payload": { "status": "ok", "itemId": "..." } }
```

Note: replies carry **no `action` field** — correlation is purely by `messageId`.

### C# → Vue: unprompted push (`SendToVue`)

```json
{ "action": "ItemSaved", "payload": { "Item": { ... } } }
```

Pushes carry **no `messageId`**.

## 2. The Two Frontend Patterns

### Fire-and-forget — `BackendAPI.send(action, payload)`

Posts `{ action, payload }` (no `messageId`) via `window.chrome.webview.postMessage`. If the
bridge is absent (e.g. running in a plain browser), the call is a silent no-op. Used for
actions with only side effects: window chrome, opening native windows, toggles.

### Request-response — `BackendAPI.request<T>(action, payload)`

1. Increments `messageCounter`, stores the promise's `resolve` in a
   `Map<number, (data) => void>` (`pendingRequests`).
2. Posts `{ action, payload, messageId }`.
3. The global listener matches an incoming `data.messageId` against the map, calls
   `resolve(data.payload)`, and deletes the entry.

If the bridge is absent, `request()` logs `[Bridge Offline] Cannot request <action>` and
immediately resolves with `null`.

### Frontend listener dispatch (installed once at module load)

```
message event →
  has data.messageId AND it's pending?  → resolve that request with data.payload
  else has data.action?                 → push dispatch:
        'InitReload' → useTimelineStore().loadTimelines()
        'ItemSaved'  → useTimelineStore().upsertItem(data.payload.Item)
        (all action pushes, handled or not, are console.logged as "Unprompted C# Push")
  else                                  → silently ignored
```

## 3. C#-to-Vue Push Mechanism

- `MessageRouter.SendToVue(action, payload)` (public) serializes `{ action, payload }`.
  Used for unsolicited pushes. Returns `false` when the page could not be reached.
- `MessageRouter.ReplyToVue(messageId, payload)` (private) serializes `{ messageId, payload }`.
  Used by every request handler.
- Both go through the private `Post(response, context)`, the only caller of
  `_webView.PostWebMessageAsJson()`. Once the WebView2 control is disposed (browser process
  killed, window torn down) that throws `InvalidOperationException`; `Post` logs it
  (`Logger.Error`) and returns `false` instead of letting it escape into callers such as
  `f_Timeline`'s `FormClosing`, where it used to leave a black window that could not be closed.

### Push actions currently sent

| Push action | Sent from | Payload | Frontend effect |
|-------------|-----------|---------|-----------------|
| `InitReload` | `Forms/f_Timeline.cs` (line ~135): when the timeline window closes/returns, it calls `mainForm._messageRouter.SendToVue("InitReload")` on the **main window's** router | none (`payload: null`) | `timelineStore.loadTimelines()` — refreshes the project list |
| `ItemSaved` | `HandleSaveItem` in the **edit window's** router, relayed through `f_AddEditItem.NotifyCallback` — a delegate wired in `HandleOpenAddEditItemWindow` as `(action, payload) => SendToVue(action, payload)` so the push lands in the **opener's** (timeline's) WebView2 | `{ Item: TimelineItem }` (PascalCase — C# serialization) | `timelineStore.upsertItem(payload.Item)` — updates the canvas without a full reload |
| `CalendarsChanged` | `HandleOpenCalendarEditorWindow`: the opener's router sends it when the `f_Calendar` editor closes | `{}` | `api.ts` re-dispatches it as a `calendars-changed` window event; `SelectCalendarModal`, `EditTimelineModal` and `CalendarManagerModal` reload their calendar lists |
| `CloseRequested` | `f_AddEditItem.OnFormClosing` (user pressed the window's X, Alt+F4, …) — sent to the **edit window's own** WebView2 | `{}` | `EditItem.vue` runs its dirty check: clean → `WindowClose`; dirty → "Discard changes?" modal. WinForms only hides the form once `WindowClose` arrives (`ConfirmedClose`) |
| `TagsChanged` | `BridgeHub.Broadcast` from `HandleRenameTag`, `HandleMergeTag` and `HandleDeleteTag`, to every page | `{ Id, Into: { TagId, TagName } \| null }` — what tag `Id` became: itself renamed, the tag it merged into, or `null` for deleted | `timelineStore.syncTag` retags `itemTagMap` and `allTimelineTags` (an item already carrying the survivor just loses the old one); the Archive reloads its tag list |
| `NoteSaved` | `BridgeHub.Broadcast` from `HandleSaveNote`, to every page | the saved note (`NoteItem`, PascalCase) | `timelineStore.syncNote` — updates it, or adds it when it is this timeline's and not there yet |
| `NoteDeleted` | `BridgeHub.Broadcast` from `HandleDeleteNote`, to every page | `{ NoteId }` | `timelineStore.removeNote` |
| `HiddenRangesChanged` | `BridgeHub.Broadcast` from `HandleSaveHiddenRange` and `HandleDeleteHiddenRange`, to every page | `{ TimelineId, Ranges: HiddenRange[] }` — the timeline's whole list after the change | `api.ts` calls `timelineStore.setHiddenRanges` when `TimelineId` is the store's timeline, so a range restored in the Archive comes back on the canvas |
| `SetTreeRoot` | `f_Relations.ShowTree`, from `HandleOpenFamilyTreeWindow` when the family tree window is already open — to that window only | `{ CharacterId }` | `RelationsApp` (in `only=tree` mode) re-roots the genogram. The relations window ignores it and keeps listening to `FocusCharacter`. |
| `ZoomChanged` | `f_Timeline.OnZoomFactorChanged` — every WebView2 `ZoomFactorChanged` (Ctrl+wheel, F10, settings Save) after it has been persisted to the timeline's `UseCustomScaling` / `CustomScale` (100% only clears the flag; the last real scale is kept so F10 can restore it) | `{ useCustomScaling, customScale }` | `TimelineApp.onHostPush` copies both into `store.settings` so a later settings Save does not put the old zoom back |

Any other pushed action is logged to the console and otherwise ignored.

## 4. Complete Action Reference

Legend for **Direction**: `req` = request-response (`request()`, has `messageId`); `f&f` =
fire-and-forget (`send()`, no reply expected). All payload property names below are exact.
Response objects come from C# anonymous objects, so lowercase names (`status`, `itemId`) stay
lowercase while serialized domain models keep their C# PascalCase names.

### 4.1 Timeline list / project management

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetAllTimelines` | req | `GetAllTimelines()` (also called by `ImportDatabase()`) | `{ args: [] }` (payload ignored) | `HandleGetAllTimelines` | `{ status: "ok", data: TimelineInfo[] }` | |
| `ImportDB` | req | `ImportDatabase()` | `{ args: [] }` (ignored) | `HandleImportDB` | `{ status: "ok" }` | Runs `DatabaseImporter.HandleDBImport()` (native file dialog). Always replies `ok`. Frontend then re-fetches `GetAllTimelines`. |
| `CreateProject` | req | `CreateNewProject(title, author?, calendarId?)` | `{ title, author, calendarId }` | `HandleCreateProject` | `number` — new timeline id, or `-1` if title empty | Response is a bare number, not an object. |
| `OpenTimeline` | f&f | `OpenTimeline(id)` / `send('OpenTimeline', { id, readOnly: true })` | `{ id, readOnly? }` | `HandleOpenTimeline` | none | Opens `f_Timeline` window, hides `f_Main`. `readOnly: true` (BL-66, from `ReferenceTimelineModal`) opens a second, read-only timeline window next to the active one — the page gets `&readOnly=1` or `readOnly` in the `SetTimelineId` push. |
| `GetTimelineData` | req | `LoadTimelineData(id)` | `{ id }` | `HandleGetTimelineData` | `FullTimelineProject` (`Project`, `Items`, `Notes`, `HiddenRanges`, `ItemTags`, `ItemCharacters`, `Characters`, `ItemStoryRefs`, `ItemsWithPictures`) or `null` if `id` isn't an int | The big "load everything" call for the timeline canvas. |
| `GetTimelineItems` | req | — (no frontend caller) | `{ timelineId }` | `HandleGetTimelineItems` | `TimelineItem[]` | Routed and handled, but unused by current frontend code. |
| `DeleteTimeline` | req | `DeleteTimeline(id)` | `{ id }` | `HandleDeleteTimeline` | `{ status: "ok" }` | No try/catch — an exception surfaces as a MessageBox and the promise never resolves (see §5). |
| `DuplicateTimeline` | req | `DuplicateTimeline(id, newTitle)` | `{ id, newTitle }` | `HandleDuplicateTimeline` | `{ status: "ok", newId }` \| `{ status: "error", message }` | `newTitle` defaults to `"Duplicate"` if null. |
| `SaveTimelineInfo` | req | `SaveTimelineInfo(id, title, author, description, startYear, color, calendarId?)` | `{ id, title, author, description, startYear, color, calendarId }` | `HandleSaveTimelineInfo` | `{ status: "ok" }` | `color` and `calendarId` optional (`TryGetProperty`). |
| `ExportTimeline` | req | `ExportTimeline(id, includeIds)` | `{ id, includeIds }` | `HandleExportTimeline` | `{ status: "ok" }` \| `{ status: "cancelled" }` | Opens native `SaveFileDialog`, writes JSON (`exportVersion: 1`). `cancelled` when the user dismisses the dialog. |
| `ShiftTimelineItems` | req | `ShiftTimelineItems(timelineId, delta)` | `{ timelineId, delta }` | `HandleShiftTimelineItems` | `{ status: "ok", affected }` \| `{ status: "error", message }` | `delta == 0` short-circuits with `affected: 0`. |
| `SetTimelineItemsLodMask` | req | `SetTimelineItemsLodMask(timelineId, mask)` | `{ timelineId, mask }` | `HandleSetTimelineItemsLodMask` | `{ status: "ok", affected }` \| `{ status: "error", message }` | `ItemRepo.SetLodMask` — one `UPDATE` of `lod_visibility_mask` for every item of the timeline. Caller reloads the timeline. |
| `BulkEditItems` | req | `BulkEditItems(edit)` | `{ ids, importance?, color?, lodMask?, addTag?, removeTagId?, addStoryId?, removeStoryId? }` | `HandleBulkEditItems` | `{ status: "ok", affected }` | BL-88, the Archive's bulk edit. `ItemRepo.BulkEdit` changes every item in one transaction; a field left out is left alone. `color: ""` takes the colour off; character birth/death items (types 7–9) keep theirs. `addTag` is trimmed and lower-cased, and made when new. Importance outside 1–10 throws. Broadcasts `ItemSaved` for each id after the commit. |

### 4.2 Edit item window

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `OpenAddEditItemWindow` | f&f | — (`BackendAPI.send(...)` directly from `pages/TimelineApp.vue`) | `{ timelineId, itemId, typeId, year?, granularity? }` (all optional on the C# side; defaults: `timelineId=0`, `itemId=null`, `typeId=1`) | `HandleOpenAddEditItemWindow` | none | Opens `f_AddEditItem` via `Show()` (not `ShowDialog()` — nested COM loop breaks `EnsureCoreWebView2Async`). Wires `NotifyCallback` so the child window can push `ItemSaved` back to this WebView2. |
| `GetItemForEdit` | req | `GetItemForEdit(timelineId, itemId, typeId = 1)` | `{ timelineId, itemId, typeId }` | `HandleGetItemForEdit` | `{ Item, Tags, Characters, StoryRefs, ChapterRefs, Calendar, Pictures }` (PascalCase) | `itemId` null/empty → returns a fresh unsaved `TimelineItem` with the given `TimelineId`/`TypeId`, the timeline's `DefaultItemColor` and its `default_lod_mask` misc setting (255 when unset). `Calendar` comes from the timeline. |
| `SaveItem` | req | `SaveItem(item, tagNames, characterAppearances, storyRefs, chapterRefs)` | `{ item: TimelineItem, tagNames: string[], characterAppearances: { CharacterId, Role }[], storyRefs: string[], chapterRefs: string[] }` | `HandleSaveItem` | `{ status: "ok", itemId }` \| `{ status: "error", message, detail }` | Deserialized case-insensitively into `SaveItemPayload`. On success also pushes `ItemSaved` to the opener window via `NotifyCallback` (see §3). |
| `DeleteItem` | req | `DeleteItem(itemId)` | `{ itemId }` | `HandleDeleteItem` | `{ status: "ok" }` | No try/catch. |
| `SearchTags` | req | `SearchTags(query)` | `{ query }` | `HandleSearchTags` | `Tag[]` | |
| `GetTagList` | req | `GetTagList()` | `{}` | `HandleGetTagList` | `{ Id, Name, UsageCount }[]` | Tags manager (`TagManagerModal.vue`). |
| `RenameTag` | req | `RenameTag(id, name)` | `{ id, name }` | `HandleRenameTag` | `{ status: "ok" }` \| `{ status: "error", message }` | Name is lower-cased/trimmed; collisions and empty names come back as errors. |
| `DeleteTag` | req | `DeleteTag(id)` | `{ id }` | `HandleDeleteTag` | `{ status: "ok", unlinked }` \| `{ status: "error", message }` | Removes the tag from every item first; `unlinked` is that count. |
| `MergeTag` | req | `MergeTag(fromId, intoId)` | `{ fromId, intoId }` | `HandleMergeTag` | `{ status: "ok" }` | Every item carrying `fromId` carries `intoId` instead (one link when it had both), and `fromId` is deleted. Throws when `intoId` is gone or the same tag. Archive Tags tab (BL-88). Rename, merge and delete all broadcast `TagsChanged` (§3). |
| `GetTimelineCharacters` | req | `GetTimelineCharacters(timelineId)` | `{ timelineId }` | `HandleGetTimelineCharacters` | `CharacterItem[]` | The year calendar reads it once on open for birthdays and death anniversaries (BL-88). |
| `OpenFamilyTreeWindow` | req | `OpenFamilyTreeWindow(timelineId, characterId)` | `{ timelineId, characterId }` | `HandleOpenFamilyTreeWindow` | `{ status: "ok" }` | BL-88. A second `f_Relations` with `TreeOnly`: `relations.html?…&only=tree` shows the genogram alone, no sidebar. One at a time; a second call re-roots it with the `SetTreeRoot` push (§3) and brings it forward. Not pre-warmed, no sidebar icon, closes with the timeline. Browser build: popup `storytimeline-family-tree`. Called from the Archive's Characters tab, the Characters window and a portrait's right-click menu. |
| `GetTimelineStories` | req | `GetTimelineStories(timelineId)` | `{ timelineId }` | `HandleGetTimelineStories` | `Story[]` | **Quirk:** handler ignores `timelineId` and returns *all* stories (`StoryRepo.GetAllStories()`). |
| `SearchBooks` | req | `SearchBooks(query)` | `{ query }` | `HandleSearchBooks` | `Book[]` | |
| `GetBookChapters` | req | `GetBookChapters(bookId)` | `{ bookId }` | `HandleGetBookChapters` | `Chapter[]` | |

### 4.2a Archive — stories and books (BL-88)

In `DataActions`, so the browser build has them too. Every write broadcasts **`StoriesChanged`** (empty
payload) to every open page: the Archive reloads, the item editor refreshes its story picker, and
`api.ts` patches the timeline store's story titles (`syncStories`).

| Action | Dir | Frontend method | Payload | Response | Notes |
|--------|-----|-----------------|---------|----------|-------|
| `GetArchiveStories` | req | `GetArchiveStories(timelineId)` | `{ timelineId }` | `Story[]` with `NextStoryId`, `Characters`, `LocationIds`, `BookIds`, `ChapterIds`, `OtherTimelineRefs` | All stories — the page picks which to list. |
| `SaveStory` | req | `SaveStory(story, timelineId?)` | `{ story, timelineId? }` | `{ status: "ok", story }` | Send `Id: ''` for a new story; the reply carries the made id. Setting `PreviousStoryId` unlinks that story's other follower. With `timelineId`, `NextStoryId` is written onto the next story too. No `timelineId` = the row only, links and next untouched. |
| `DeleteStory` | req | `DeleteStory(id)` | `{ id }` | `{ status: "ok" }` | Reaches every timeline. |
| `GetArchiveBooks` | req | `GetArchiveBooks(timelineId)` | `{ timelineId }` | `Book[]` with `Chapters[].ItemIds`, `OtherTimelineRefs` | |
| `SaveBook` | req | `SaveBook(book)` | the **Book object itself** | `{ status: "ok", book }` | `Id: ''` for new. |
| `SaveChapter` | req | `SaveChapter(chapter)` | the **Chapter object itself** | `{ status: "ok", chapter }` | `Id: ''` for new. |
| `DeleteBook` | req | `DeleteBook(id)` | `{ id }` | `{ status: "ok" }` | Its chapters and their item links go too. |
| `DeleteChapter` | req | `DeleteChapter(id)` | `{ id }` | `{ status: "ok" }` | |
| `GetArchiveMedia` | req | `GetArchiveMedia(timelineId)` | `{ timelineId }` | `MediaItem[]` with `Uses[]` (`Kind` item/map/portrait, `Id`, `Name`, `TypeId`, `Here`) | This timeline's pictures and the unused ones. |
| `SavePictureInfo` | req | `SavePictureInfo(id, title, description)` | `{ id, title, description }` | `{ status: "ok" }` | |
| `DeletePicture` | req | `DeletePicture(id, timelineId)` | `{ id, timelineId }` | `{ status: "ok" }` | Reaches every timeline: items, maps and portraits lose it. Broadcasts `ItemSaved` for each of this timeline's shown items that had it. |
| `BulkEditMedia` | req | `BulkEditMedia(edit)` | `{ ids, attachTo?, detachFrom? }` | `{ status: "ok", affected }` | The Media tab's *Edit multiple*. `attachTo` (an item id) links every picture to it; `detachFrom` (a timeline id) unlinks them from that timeline's items, character birth/death items (type 7) excepted. Nothing is pruned. One transaction; broadcasts `ItemSaved` for each item changed. |
| `BulkRelate` | req | `BulkRelate(bulk)` | `{ ids, otherId, relationshipType, tickedFirst, relationshipModifier, relationshipDegree, replace, timelineId }` | `{ status: "ok", affected }` | The Characters tab's *Edit multiple*: relates each of `ids` to `otherId`, undated. A tie already there keeps its dates and notes and takes the modifier and degree. `replace` first drops each one's ties of that kind, at that end, to anyone else. `otherId` among `ids` is skipped. No broadcast. |
| `BulkEditPlaces` | req | `BulkEditPlaces(edit)` | `{ ids, mapIds?, color?, resetLook?, moveTo? }` | `{ status: "ok", affected }` | The Places tab's *Edit multiple*. `ids` are places, `mapIds` top-level maps. `color: ""` takes the colour off; `resetLook` nulls `marker_style`. `moveTo` (a map id) moves the places there at the same x/y fraction, and gives each top-level map a door on it at 0.5/0.5 named after it. One transaction, refused whole when something would go under a map inside it. No broadcast: the map window listens for none. |

A handler that throws replies with an error, which rejects the promise (`api.ts` logs and shows it).

### 4.3 Calendar

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetCalendarList` | req | `GetCalendarList()` | `{}` | `HandleGetCalendarList` | `{ Id, Name, UsageCount }[]` | `UsageCount` = timelines using the calendar. |
| `GetCalendarById` | req | `GetCalendarById(id)` | `{ id }` | `HandleGetCalendarById` | `Calendar` | An unknown id throws; the router's safety net logs `Bridge/GetCalendarById` with the stack and the promise rejects. |
| `SaveCalendar` | req | `SaveCalendar(calendar)` | the **calendar object itself** (not wrapped) — deserialized into `CalendarItem` | `HandleSaveCalendar` | `{ status: "ok" }` \| `{ status: "error", message }` | Saves calendar + its LOD profile (`SaveCalendarWithLod`). |
| `CreateCalendar` | req | `CreateCalendar(cloneFrom = 'cal_default_gregorian')` | `{ cloneFrom }` | `HandleCreateCalendar` | `{ status: "ok", calendarId }` \| `{ status: "error", message }` | Clones the source calendar *and* its LOD profile with new GUIDs; name is `"New Calendar"`. |
| `DeleteCalendar` | req | `DeleteCalendar(id)` | `{ id }` | `HandleDeleteCalendar` | `{ status: "ok", reassigned }` \| `{ status: "error", message }` | Timelines that used it switch to the default Gregorian calendar (`reassigned` = how many); the default calendar itself cannot be deleted. Only offered from `CalendarManagerModal`. |
| `ExportCalendar` | req | `ExportCalendar({ id } \| { calendar })` | `{ id }` (stored calendar) or `{ calendar }` (a `SaveCalendar`-shaped object — the editor's unsaved state) | `HandleExportCalendar` | `{ status: "ok", path }` \| `{ status: "cancelled" }` \| `{ status: "error", message }` | Native `SaveFileDialog`; writes `CalendarExporter.ToJson` (calendar names + `yearDefinition` object + `lodProfile { name, profile[] }`, nested JSON inlined). |
| `ImportCalendar` | req | `ImportCalendar()` | `{}` | `HandleImportCalendar` | `{ status: "ok", calendarId, name, nameCollision }` \| `{ status: "cancelled" }` \| `{ status: "error", message }` | Native `OpenFileDialog`; `CalendarExporter.Import` validates the file (format tag, name, year definition, LOD profile with a YEARS level) and saves a **new** calendar + LOD profile (new ids, name kept). `nameCollision` = another calendar already had that name (case-insensitive). |
| `OpenCalendarEditorWindow` | f&f | — (`send()` from `SelectCalendarModal.vue`, `CalendarManagerModal.vue`, `EditTimelineModal.vue`) | `{ calendarId }` (nullable) | `HandleOpenCalendarEditorWindow` | none | Opens `f_Calendar`. |

### 4.4 Settings, fonts, layout presets

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `SaveSettings` | req | `SaveSettings(payload)` | `{ timelineId, font, fontSizeScale, pixelsPerSubtick, showGuides, displayRadius, isFullscreen, useCustomScaling, customScale, layoutPresetId }` | `HandleSaveSettings` | `{ status: "ok" }` | Every field except `timelineId` is optional on the C# side (`TryGetProperty`, merged into existing settings). Side effects: applies fullscreen state to the parent form and sets the WebView2 `ZoomFactor` via `f_Timeline.SetZoom` (saved scale, or 1.0 when off). |
| `GetSystemFonts` | req | `GetSystemFonts()` | `{}` | `HandleGetSystemFonts` | `string[]` (sorted font family names) | |
| `GetLayoutSettingsList` | req | `GetLayoutSettingsList()` | `{}` | `HandleGetLayoutSettingsList` | `{ Id, Name }[]` | |
| `GetLayoutSettingsById` | req | `GetLayoutSettingsById(id)` | `{ id }` (defaults to `"ls_default"`) | `HandleGetLayoutSettingsById` | `LayoutSettings` \| `null` on error | Errors are swallowed into a `null` reply — no error shape. |
| `CreateLayoutPreset` | req | `CreateLayoutPreset(name, cloneFrom = 'ls_default')` | `{ name, cloneFrom }` | `HandleCreateLayoutPreset` | `{ status: "ok", preset: { Id, Name }, layoutSettings }` \| `{ status: "error", message }` | Clones an existing preset with a new GUID. |
| `SaveLayoutSettings` | req | `SaveLayoutSettings(ls)` | the **LayoutSettings object itself** (not wrapped) | `HandleSaveLayoutSettings` | `{ status: "ok", layoutSettings }` \| `{ status: "error", message }` | |
| `ResetLayoutPreset` | req | `ResetLayoutPreset(id)` | `{ id }` | `HandleResetLayoutPreset` | `{ status: "ok", layoutSettings }` \| `{ status: "error", message, detail }` | Calls `DbInitializer.ResetBuiltinPreset(id)` then re-reads. |
| `ToggleFullscreen` | f&f | — (`send()` from `TimelineApp.vue`, keybinding) | `{ timelineId }` | `HandleToggleFullscreen` | none | Flips + persists `IsFullscreen`, applies window state. No-op if `timelineId` is 0 or no parent form. |
| `ToggleCustomScaling` | f&f | — (`send()` from `TimelineApp.vue`, keybinding) | `{ timelineId }` | `HandleToggleCustomScaling` | none | Flips + persists `UseCustomScaling`, then `f_Timeline.SetZoom` (saved scale or 1.0) — native browser zoom, the same one Ctrl+wheel drives. |

### 4.5 Filter rules & presets

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetFilterRules` | req | `GetFilterRules(timelineId)` | `{ timelineId }` | `HandleGetFilterRules` | `{ status: "ok", rules: FilterRule[] }` \| `{ status: "error", detail }` | |
| `SaveFilterRule` | req | `SaveFilterRule(rule)` | the **FilterRule object itself** (not wrapped) | `HandleSaveFilterRule` | `{ status: "ok" }` \| `{ status: "error", detail }` | |
| `DeleteFilterRule` | req | `DeleteFilterRule(id)` | `{ id }` (string) | `HandleDeleteFilterRule` | `{ status: "ok" }` \| `{ status: "error", detail }` | |
| `GetFilterPresets` | req | `GetFilterPresets()` | `{}` | `HandleGetFilterPresets` | `{ status: "ok", presets: FilterPreset[] }` \| `{ status: "error", detail }` | Presets are global (not per-timeline). |
| `SaveFilterPreset` | req | `SaveFilterPreset(preset)` | the **FilterPreset object itself** (not wrapped) | `HandleSaveFilterPreset` | `{ status: "ok" }` \| `{ status: "error", detail }` | |
| `DeleteFilterPreset` | req | `DeleteFilterPreset(id)` | `{ id }` (string) | `HandleDeleteFilterPreset` | `{ status: "ok" }` \| `{ status: "error", detail }` | |

### 4.6 Window chrome (borderless windows)

All fire-and-forget; all no-ops when the router has no `_parentForm`; all marshal onto the UI
thread with `BeginInvoke`.

| Action | Dir | Frontend method | Payload | Backend handler | Effect |
|--------|-----|-----------------|---------|-----------------|--------|
| `WindowMinimize` | f&f | `WindowMinimize()` | `{}` | `HandleWindowMinimize` | `WindowState = Minimized` |
| `WindowMaximizeRestore` | f&f | `WindowMaximizeRestore()` | `{}` | `HandleWindowMaximizeRestore` | Toggle Maximized ↔ Normal |
| `WindowClose` | f&f | `WindowClose()` | `{}` | `HandleWindowClose` | `Form.Close()` |
| `WindowStartDrag` | f&f | `WindowStartDrag()` | `{}` | `HandleWindowStartDrag` | `BorderlessFormBase.StartWindowDrag()` |

### 4.7 Timeline notes

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `SaveNote` | req | `SaveNote(note)` | the **TimelineNote object itself** (not wrapped) — deserialized into `NoteItem` | `HandleSaveNote` | `{ status: "ok", noteId }` | Broadcasts `NoteSaved` (§3), so the Notes panel follows an edit made in the Archive. |
| `DeleteNote` | req | `DeleteNote(noteId)` | `{ noteId }` | `HandleDeleteNote` | `{ status: "ok" }` | Broadcasts `NoteDeleted`. |

Both throw on failure; the router's safety net logs it and replies with the error.

### 4.8 Hidden ranges

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetHiddenRanges` | req | `GetHiddenRanges(timelineId)` | `{ timelineId }` | `HandleGetHiddenRanges` | `HiddenRange[]` | |
| `SaveHiddenRange` | req | `SaveHiddenRange(timelineId, startYear, endYear, label = null, id = 0)` | `{ timelineId, startYear, endYear, label, id }` | `HandleSaveHiddenRange` | `{ status: "ok", range: HiddenRange }` | `id = 0` inserts; nonzero updates. Reply includes the saved id. Broadcasts `HiddenRangesChanged` (§3). |
| `DeleteHiddenRange` | req | `DeleteHiddenRange(id)` | `{ id }` (int) | `HandleDeleteHiddenRange` | `{ status: "ok" }` | Broadcasts `HiddenRangesChanged`. The Archive's MISC → Hidden ranges restores with it. |

Both throw on failure, as does `ShiftTimelineItems`; the router's safety net logs the stack and replies with the error.

### 4.8a Work history (BL-33, BL-88)

| Action | Dir | Frontend method | Payload | Response | Notes |
|--------|-----|-----------------|---------|----------|-------|
| `GetSessionHistory` | req | `GetSessionHistory(timelineId)` | `{ timelineId }` | `{ status: "ok", history: { timelineTitle, lastExportedAt, lastExportDay, emptyDays, days[] } }` | `days` are the days that changed something plus today, newest first. `emptyDays` counts the sealed days that changed nothing, which are left out. |
| `GetSessionChanges` | req | `GetSessionChanges(timelineId, days?)` | `{ timelineId, days? }` | `{ status: "ok", summary }` | Without `days`, today alone. |
| `PruneSessionDays` | req | `PruneSessionDays(timelineId)` | `{ timelineId }` | `{ status: "ok", pruned }` | Drops the sealed days that changed nothing. |
| `MergeSessionDays` | req | `MergeSessionDays(timelineId, days)` | `{ timelineId, days }` | `{ status: "ok", history }` | Folds two or more neighbouring sealed days into one, newest edit winning. Throws for today, for days that aren't next to each other, or for days on both sides of the last export. |

### 4.9 Images / media

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `AddImageToItem` | req | `AddImageToItem(itemId)` | `{ itemId }` | `HandleAddImageToItem` | `{ status: "ok", Pictures: MediaItem[] }` \| `{ status: "cancelled" }` \| `{ status: "error", message }` | Opens native multi-select `OpenFileDialog`; imports each file into the media folder and links it. Note the mixed casing: `status` lowercase, `Pictures` PascalCase. |
| `GetAllPictures` | req | `GetAllPictures()` | `{}` | `HandleGetAllPictures` | `MediaItem[]` | |
| `LinkImageToItem` | req | `LinkImageToItem(pictureId, itemId)` | `{ pictureId, itemId }` | `HandleLinkImageToItem` | `{ status: "ok" }` \| `{ status: "error", message }` | Links an existing picture. |
| `RemoveImageFromItem` | req | `RemoveImageFromItem(pictureId, itemId)` | `{ pictureId, itemId }` | `HandleRemoveImageFromItem` | `{ status: "ok" }` \| `{ status: "error", message }` | Unlinks and prunes the media row if orphaned (`UnlinkAndPruneImage`). |

### 4.10 App config / data folder

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetAppConfig` | req | `GetAppConfig()` | `{}` | `HandleGetAppConfig` | `{ DataRoot, DbPath, MediaFolder }` (PascalCase) | |
| `BrowseDataFolder` | req | `BrowseDataFolder()` | `{}` | `HandleBrowseDataFolder` | `{ path: string \| null }` | Native `FolderBrowserDialog`; `path: null` on cancel. |
| `SetDataRoot` | req | `SetDataRoot(path)` | `{ path }` | `HandleSetDataRoot` | `{ status: "ok", path }` \| `{ status: "error", message }` | Points config at the folder and re-runs `DbInitializer.Initialize()` — does **not** copy data. |
| `MoveDataFolder` | req | `MoveDataFolder(path)` | `{ path }` | `HandleMoveDataFolder` | `{ status: "ok", path }` \| `{ status: "error", message }` | Copies `timeline.sqlite` + `Media/` to the new folder first, then switches. |
| `OpenDataFolder` | f&f | `OpenDataFolder()` | `{}` | `HandleOpenDataFolder` | none | Launches Explorer at `DataRoot`. |
| `CreateBackup` | req | `CreateBackup(includeMedia)` | `{ includeMedia }` | `HandleCreateBackup` | `{ status: "ok", path }` \| `{ status: "cancelled" }` \| `{ status: "error", message }` | Native folder picker → copies DB (+ optionally media) into `StoryTimeline_Backup_<timestamp>/`, then opens Explorer there. |

### 4.11 Misc settings (key-value store)

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetMiscSetting` | req | `GetMiscSetting(key, timelineId = 0)` | `{ key, timelineId }` | `HandleGetMiscSetting` | `{ status: "ok", value: string \| null }` \| `{ status: "error", detail }` | `timelineId = 0` means app-global. |
| `SetMiscSetting` | req | `SetMiscSetting(key, value, timelineId = 0)` | `{ key, value, timelineId }` | `HandleSetMiscSetting` | `{ status: "ok" }` \| `{ status: "error", detail }` | |

## 5. Known Protocol Quirks

- **`request()` never rejects and never times out.** The promise only resolves when a reply
  with a matching `messageId` arrives. If a handler throws before replying (several handlers
  have no try/catch — e.g. `DeleteTimeline`, `SaveTimelineInfo`, `DeleteItem`,
  `SearchTags`, `GetBookChapters`, `ExportTimeline`, `AddImageToItem`'s pre-dialog code),
  the exception is caught by `OnWebMessageReceived`'s outer try, shown to the user as a
  misleading `"Failed to parse message from Vue: ..."` MessageBox, no reply is sent, and the
  awaiting promise + its `pendingRequests` entry leak forever.
- **Bridge-offline fallback resolves `null`.** Outside WebView2 (plain browser / tests),
  every `request()` resolves `null as T` immediately — callers get `null` where the type says
  otherwise.
- **Unknown actions are silently dropped** on both sides. Backend: the `default` branch just
  `Console.WriteLine`s and sends no reply (a `request()` for a typo'd action hangs forever).
  Frontend: an unrecognized push action is only `console.log`ged; a message with neither a
  pending `messageId` nor an `action` is ignored entirely.
- **Payload casing is asymmetric.**
  - Vue → C# request payloads use **camelCase** keys (`timelineId`, `itemId`, `startYear`).
  - Handlers that whole-payload-deserialize (`SaveItem`, `SaveNote`, `SaveCalendar`,
    `SaveLayoutSettings`, `SaveFilterRule`, `SaveFilterPreset`) use
    `PropertyNameCaseInsensitive = true`, so either casing works there.
  - Handlers that read fields manually via `Payload.GetProperty("...")` are
    **case-sensitive** — the exact camelCase names in §4 are mandatory.
  - C# → Vue: `JsonSerializer` uses default naming, so serialized domain models come back
    **PascalCase** (`Item`, `Pictures`, `DataRoot`, `Id`, `Name`) while anonymous-object
    envelope fields are lowercase (`status`, `itemId`, `newId`, `rules`, `presets`). Some
    replies mix both in one object (e.g. `AddImageToItem` → `{ status, Pictures }`).
- **Success/error shapes can differ per action.** `GetLayoutSettingsById` returns `null` on
  failure; `CreateProject` returns a bare number. There is no uniform envelope.
- **`GetTimelineStories` ignores its `timelineId`** and returns all stories globally.
- **`messageId` counters are per-window.** Each WebView2 page has its own counter starting at
  1; correlation only works because each window pairs with its own `MessageRouter`.
- **Native dialogs block the reply.** `ImportDB`, `ExportTimeline`, `AddImageToItem`,
  `BrowseDataFolder`, `CreateBackup` open modal Win32 dialogs inside the message handler, so
  the awaiting promise stays pending until the user closes the dialog.
- **Vestigial `{ args: [] }` payloads.** `ImportDB` and `GetAllTimelines` send
  `{ args: [] }`; the backend never reads it.
- **`GetTimelineItems` is dead on the frontend** — routed and handled in C#, but no current
  frontend code sends it.

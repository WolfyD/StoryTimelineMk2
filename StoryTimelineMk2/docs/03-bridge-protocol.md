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

- `MessageRouter.SendToVue(action, payload)` (public) serializes `{ action, payload }` and
  calls `_webView.PostWebMessageAsJson()`. Used for unsolicited pushes.
- `MessageRouter.ReplyToVue(messageId, payload)` (private) serializes `{ messageId, payload }`.
  Used by every request handler.

### Push actions currently sent

| Push action | Sent from | Payload | Frontend effect |
|-------------|-----------|---------|-----------------|
| `InitReload` | `Forms/f_Timeline.cs` (line ~135): when the timeline window closes/returns, it calls `mainForm._messageRouter.SendToVue("InitReload")` on the **main window's** router | none (`payload: null`) | `timelineStore.loadTimelines()` — refreshes the project list |
| `ItemSaved` | `HandleSaveItem` in the **edit window's** router, relayed through `f_AddEditItem.NotifyCallback` — a delegate wired in `HandleOpenAddEditItemWindow` as `(action, payload) => SendToVue(action, payload)` so the push lands in the **opener's** (timeline's) WebView2 | `{ Item: TimelineItem }` (PascalCase — C# serialization) | `timelineStore.upsertItem(payload.Item)` — updates the canvas without a full reload |

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
| `OpenTimeline` | f&f | `OpenTimeline(id)` | `{ id }` | `HandleOpenTimeline` | none | Opens `f_Timeline` window, hides `f_Main`. |
| `GetTimelineData` | req | `LoadTimelineData(id)` | `{ id }` | `HandleGetTimelineData` | `FullTimelineProject` (`Project`, `Items`, `Notes`, `HiddenRanges`, `ItemTags`, `ItemCharacters`, `Characters`, `ItemStoryRefs`, `ItemsWithPictures`) or `null` if `id` isn't an int | The big "load everything" call for the timeline canvas. |
| `GetTimelineItems` | req | — (no frontend caller) | `{ timelineId }` | `HandleGetTimelineItems` | `TimelineItem[]` | Routed and handled, but unused by current frontend code. |
| `DeleteTimeline` | req | `DeleteTimeline(id)` | `{ id }` | `HandleDeleteTimeline` | `{ status: "ok" }` | No try/catch — an exception surfaces as a MessageBox and the promise never resolves (see §5). |
| `DuplicateTimeline` | req | `DuplicateTimeline(id, newTitle)` | `{ id, newTitle }` | `HandleDuplicateTimeline` | `{ status: "ok", newId }` \| `{ status: "error", message }` | `newTitle` defaults to `"Duplicate"` if null. |
| `SaveTimelineInfo` | req | `SaveTimelineInfo(id, title, author, description, startYear, color, calendarId?)` | `{ id, title, author, description, startYear, color, calendarId }` | `HandleSaveTimelineInfo` | `{ status: "ok" }` | `color` and `calendarId` optional (`TryGetProperty`). |
| `ExportTimeline` | req | `ExportTimeline(id, includeIds)` | `{ id, includeIds }` | `HandleExportTimeline` | `{ status: "ok" }` \| `{ status: "cancelled" }` | Opens native `SaveFileDialog`, writes JSON (`exportVersion: 1`). `cancelled` when the user dismisses the dialog. |
| `ShiftTimelineItems` | req | `ShiftTimelineItems(timelineId, delta)` | `{ timelineId, delta }` | `HandleShiftTimelineItems` | `{ status: "ok", affected }` \| `{ status: "error", message }` | `delta == 0` short-circuits with `affected: 0`. |

### 4.2 Edit item window

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `OpenAddEditItemWindow` | f&f | — (`BackendAPI.send(...)` directly from `pages/TimelineApp.vue`) | `{ timelineId, itemId, typeId, year?, granularity? }` (all optional on the C# side; defaults: `timelineId=0`, `itemId=null`, `typeId=1`) | `HandleOpenAddEditItemWindow` | none | Opens `f_AddEditItem` via `Show()` (not `ShowDialog()` — nested COM loop breaks `EnsureCoreWebView2Async`). Wires `NotifyCallback` so the child window can push `ItemSaved` back to this WebView2. |
| `GetItemForEdit` | req | `GetItemForEdit(timelineId, itemId, typeId = 1)` | `{ timelineId, itemId, typeId }` | `HandleGetItemForEdit` | `{ Item, Tags, Characters, StoryRefs, ChapterRefs, Calendar, Pictures }` (PascalCase) | `itemId` null/empty → returns a fresh unsaved `TimelineItem` with the given `TimelineId`/`TypeId`. `Calendar` comes from the timeline. |
| `SaveItem` | req | `SaveItem(item, tagNames, characterAppearances, storyRefs, chapterRefs)` | `{ item: TimelineItem, tagNames: string[], characterAppearances: { CharacterId, Role }[], storyRefs: string[], chapterRefs: string[] }` | `HandleSaveItem` | `{ status: "ok", itemId }` \| `{ status: "error", message, detail }` | Deserialized case-insensitively into `SaveItemPayload`. On success also pushes `ItemSaved` to the opener window via `NotifyCallback` (see §3). |
| `DeleteItem` | req | `DeleteItem(itemId)` | `{ itemId }` | `HandleDeleteItem` | `{ status: "ok" }` | No try/catch. |
| `SearchTags` | req | `SearchTags(query)` | `{ query }` | `HandleSearchTags` | `Tag[]` | |
| `GetTimelineCharacters` | req | `GetTimelineCharacters(timelineId)` | `{ timelineId }` | `HandleGetTimelineCharacters` | `CharacterItem[]` | |
| `GetTimelineStories` | req | `GetTimelineStories(timelineId)` | `{ timelineId }` | `HandleGetTimelineStories` | `Story[]` | **Quirk:** handler ignores `timelineId` and returns *all* stories (`StoryRepo.GetAllStories()`). |
| `SearchBooks` | req | `SearchBooks(query)` | `{ query }` | `HandleSearchBooks` | `Book[]` | |
| `GetBookChapters` | req | `GetBookChapters(bookId)` | `{ bookId }` | `HandleGetBookChapters` | `Chapter[]` | |

### 4.3 Calendar

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetCalendarList` | req | `GetCalendarList()` | `{}` | `HandleGetCalendarList` | `{ Id, Name }[]` | |
| `GetCalendarById` | req | `GetCalendarById(id)` | `{ id }` | `HandleGetCalendarById` | `Calendar` \| `{ status: "error", message }` | Error shape differs from the success shape — callers must sniff for `status`. |
| `SaveCalendar` | req | `SaveCalendar(calendar)` | the **calendar object itself** (not wrapped) — deserialized into `CalendarItem` | `HandleSaveCalendar` | `{ status: "ok" }` \| `{ status: "error", message }` | Saves calendar + its LOD profile (`SaveCalendarWithLod`). |
| `CreateCalendar` | req | `CreateCalendar(cloneFrom = 'cal_default_gregorian')` | `{ cloneFrom }` | `HandleCreateCalendar` | `{ status: "ok", calendarId }` \| `{ status: "error", message }` | Clones the source calendar *and* its LOD profile with new GUIDs; name is `"New Calendar"`. |
| `DeleteCalendar` | req | `DeleteCalendar(id)` | `{ id }` | `HandleDeleteCalendar` | `{ status: "ok" }` \| `{ status: "error", message }` | |
| `OpenCalendarEditorWindow` | f&f | — (`send()` from `SelectCalendarModal.vue`, `CalendarManagerModal.vue`, `EditTimelineModal.vue`) | `{ calendarId }` (nullable) | `HandleOpenCalendarEditorWindow` | none | Opens `f_Calendar`. |

### 4.4 Settings, fonts, layout presets

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `SaveSettings` | req | `SaveSettings(payload)` | `{ timelineId, font, fontSizeScale, pixelsPerSubtick, showGuides, displayRadius, isFullscreen, useCustomScaling, customScale, layoutPresetId }` | `HandleSaveSettings` | `{ status: "ok" }` | Every field except `timelineId` is optional on the C# side (`TryGetProperty`, merged into existing settings). Side effects: applies fullscreen state to the parent form and injects `document.documentElement.style.zoom` via `ExecuteScriptAsync`. |
| `GetSystemFonts` | req | `GetSystemFonts()` | `{}` | `HandleGetSystemFonts` | `string[]` (sorted font family names) | |
| `GetLayoutSettingsList` | req | `GetLayoutSettingsList()` | `{}` | `HandleGetLayoutSettingsList` | `{ Id, Name }[]` | |
| `GetLayoutSettingsById` | req | `GetLayoutSettingsById(id)` | `{ id }` (defaults to `"ls_default"`) | `HandleGetLayoutSettingsById` | `LayoutSettings` \| `null` on error | Errors are swallowed into a `null` reply — no error shape. |
| `CreateLayoutPreset` | req | `CreateLayoutPreset(name, cloneFrom = 'ls_default')` | `{ name, cloneFrom }` | `HandleCreateLayoutPreset` | `{ status: "ok", preset: { Id, Name }, layoutSettings }` \| `{ status: "error", message }` | Clones an existing preset with a new GUID. |
| `SaveLayoutSettings` | req | `SaveLayoutSettings(ls)` | the **LayoutSettings object itself** (not wrapped) | `HandleSaveLayoutSettings` | `{ status: "ok", layoutSettings }` \| `{ status: "error", message }` | |
| `ResetLayoutPreset` | req | `ResetLayoutPreset(id)` | `{ id }` | `HandleResetLayoutPreset` | `{ status: "ok", layoutSettings }` \| `{ status: "error", message, detail }` | Calls `DbInitializer.ResetBuiltinPreset(id)` then re-reads. |
| `ToggleFullscreen` | f&f | — (`send()` from `TimelineApp.vue`, keybinding) | `{ timelineId }` | `HandleToggleFullscreen` | none | Flips + persists `IsFullscreen`, applies window state. No-op if `timelineId` is 0 or no parent form. |
| `ToggleCustomScaling` | f&f | — (`send()` from `TimelineApp.vue`, keybinding) | `{ timelineId }` | `HandleToggleCustomScaling` | none | Flips + persists `UseCustomScaling`, re-injects CSS zoom. |

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
| `SaveNote` | req | `SaveNote(note)` | the **TimelineNote object itself** (not wrapped) — deserialized into `NoteItem` | `HandleSaveNote` | `{ status: "ok", noteId }` \| `{ status: "error", message }` | |
| `DeleteNote` | req | `DeleteNote(noteId)` | `{ noteId }` | `HandleDeleteNote` | `{ status: "ok" }` \| `{ status: "error", message }` | |

### 4.8 Hidden ranges

| Action | Dir | Frontend method | Payload | Backend handler | Response | Notes |
|--------|-----|-----------------|---------|-----------------|----------|-------|
| `GetHiddenRanges` | req | `GetHiddenRanges(timelineId)` | `{ timelineId }` | `HandleGetHiddenRanges` | `HiddenRange[]` | |
| `SaveHiddenRange` | req | `SaveHiddenRange(timelineId, startYear, endYear, label = null, id = 0)` | `{ timelineId, startYear, endYear, label, id }` | `HandleSaveHiddenRange` | `{ status: "ok", range: HiddenRange }` \| `{ status: "error", message }` | `id = 0` inserts; nonzero updates. Reply includes the saved id. |
| `DeleteHiddenRange` | req | `DeleteHiddenRange(id)` | `{ id }` (int) | `HandleDeleteHiddenRange` | `{ status: "ok" }` \| `{ status: "error", message }` | |

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
- **Success/error shapes can differ per action.** `GetCalendarById` returns a `Calendar` on
  success but `{ status: "error" }` on failure; `GetLayoutSettingsById` returns `null` on
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

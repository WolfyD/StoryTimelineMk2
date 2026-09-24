# 05 — Frontend Pages

This document describes the top-level Vue pages under `Frontend/src/` — what mounts them, what hosts them, their layout, state, interactions, modals, and load-time data flow. All facts below are verified against the source.

## Entry Points Overview

Vite builds seven HTML entry points (`Frontend/vite.config.ts` → `build.rollupOptions.input`). Each entry file follows the identical bootstrap pattern: import `assets/main.scss`, `createApp(<RootComponent>)`, `app.use(createPinia())`, `app.mount('#app')`, then fade out and remove the `#app-loading` splash element.

| Entry TS file | HTML entry | Root component | WinForms host | URL query params |
|---|---|---|---|---|
| `src/main.ts` | `index.html` | `App.vue` | `Forms/f_Main.cs` | none |
| `src/timeline.ts` | `timeline.html` | `pages/TimelineApp.vue` | `Forms/f_Timeline.cs` | `?id=<timelineId>` |
| `src/editItem.ts` | `editItem.html` | `pages/EditItem.vue` | `Forms/f_AddEditItem.cs` | `?timelineId=` + (`itemId` \| `typeId`,`year`,`granularity`) |
| `src/calendar.ts` | `calendar.html` | `pages/CalendarApp.vue` | `Forms/f_Calendar.cs` | `?calendarId=<guid>` (absent = new calendar) |
| `src/yearCalendar.ts` | `yearCalendar.html` | `pages/YearCalendarApp.vue` | `Forms/f_YearCalendar.cs` | `?timelineId=&year=` |
| `src/characters.ts` | `characters.html` | `pages/CharactersApp.vue` | `Forms/f_Characters.cs` | `?timelineId=` + optional `characterId` |
| `src/relations.ts` | `relations.html` | `pages/RelationsApp.vue` | `Forms/f_Relations.cs` | `?timelineId=` + optional `characterId` |
| `src/settings.ts` | `settings.html` | `pages/SettingsApp.vue` | **none** (no form navigates to `settings.html`) | n/a |

Each form navigates to `Frontend/dist/<entry>.html` in Release, or `http://localhost:5173/<entry>.html` in Debug, appending its query string.

---

## App.vue — Project Launcher (`index.html`)

### Purpose
The main project-list / launcher screen shown when the app starts. Lists all timelines, creates new projects, imports/exports the database, and opens app-level settings and the calendar manager. Hosted by `f_Main`.

### Layout

```
+--------------------------------------------------+
| WindowTitleBar  "Story Timeline"                 |
+--------------------------------------------------+
| SplashTitle (logo/title art)                     |
+--------------------------------------------------+
| ProjectContainer (list of timeline projects)     |
+--------------------------------------------------+
| [import][export][calendars][gear]   (+)→[title | cal☑ | ▶] |
|  import-export-container            new-project-container   |
+--------------------------------------------------+
```

The new-project container is a collapsed `(+)` button that animates open (width transition) into an inline form: project-name text input, custom-calendar checkbox, and a "start" play button.

### State

| Kind | Name | Purpose |
|---|---|---|
| local ref | `newProjectOpen` | new-project bar expanded/collapsed |
| local ref | `showAppSettings` | AppSettingsModal visibility |
| local ref | `showCalendarManager` | CalendarManagerModal visibility |
| local ref | `newProjectTitle` | new project name input |
| local ref | `hasCustomCal` | "has custom calendar" checkbox |
| local ref | `showAuthorModal`, `showCalendarModal` | modal visibility for the create-flow |
| local ref | `pendingTitle`, `pendingAuthor`, `pendingCalendarId` | staged values during the create-flow |
| store | `store.projects` (timelineStore) | the project list rendered by `ProjectContainer` |
| localStorage | `lastAuthor` | remembered author name, read on create and written after save |

No URL query params are consumed.

### User Interactions

| Interaction | Handler | Effect |
|---|---|---|
| Import icon (`PhTrayArrowDown`) click | `HandleImportDatabase` | `BackendAPI.ImportDatabase()` → bridge `ImportDB`, then `GetAllTimelines`; result written to `store.projects` |
| Export icon (`PhTrayArrowUp`) click | `HandleExportDatabase` | **Also calls `BackendAPI.ImportDatabase()`** — the export handler is currently identical to import (apparent placeholder/bug) |
| Calendar icon (`PhCalendarBlank`) click | — | opens `CalendarManagerModal` |
| Gear icon (`PhGear`) click | — | opens `AppSettingsModal` |
| `(+)` button click | `HandleToggleNewProject` | toggles `newProjectOpen` (button rotates to an ✕) |
| Project name text input | `v-model` | `newProjectTitle` |
| Custom-calendar checkbox | `v-model` | `hasCustomCal` |
| Play button (`PhPlayCircle`) click | `HandleStartProject` | starts the create flow (below) |
| `ProjectContainer` emits `refresh` | `HandleGetTimelines` | bridge `GetAllTimelines` → `store.projects` |

**Create-project flow** (`HandleStartProject` → `doCreateTimeline`):
1. Title defaults to `'New Project'`; author is prefilled from `localStorage.lastAuthor`.
2. If no author → `AuthorReminderModal` (emits `set(author)` or `skip`).
3. Else/then, if `hasCustomCal` → `SelectCalendarModal` (emits `selected(calId)` or `skipped`).
4. `doCreateTimeline()` → `BackendAPI.CreateNewProject(title, author, calendarId?)` → bridge `CreateProject`; saves `lastAuthor` to localStorage; resets the form; refreshes via `GetAllTimelines`.

### Modals

| Modal | Opened by | Role |
|---|---|---|
| `AppSettingsModal` | gear icon | app-level settings; emits `refresh` → reload project list |
| `AuthorReminderModal` | create flow, when no remembered author | asks for author name |
| `SelectCalendarModal` | create flow, when `hasCustomCal` | pick an existing custom calendar for the new project |
| `CalendarManagerModal` | calendar icon | manage stored calendars |

### Data Flow on Load
1. `window.onload` → `HandleGetTimelines()` → bridge `GetAllTimelines` → `store.projects`. (Single call; nothing else fires on mount.)

---

## TimelineApp.vue — Timeline Workspace (`timeline.html`)

### Purpose
The main timeline workspace: the Konva canvas plus surrounding panels (gallery / notes / data), minimap, filter system, navigation and status bars. Hosted by `f_Timeline`, which passes `?id=<timelineId>`.

### Layout

```
+------------------------------------------------------------------+
| WindowTitleBar (store.title)                                     |
+---+--------------------------------------------------------------+
| A | #timeline-header   Title / Author  (+ project color strip)   |
| c +--------------------------------------------------------------+
| t | Splitpanes (horizontal)                                      |
| i |  +--------------------------------------------------------+  |
| v |  | #timeline-data (40%) — nested vertical Splitpanes:     |  |
| i |  |  [Gallery 27%] | [Notes 27%] | [DataPanel 46%]         |  |
| t |  +--------------------------------------------------------+  |
| y |  | #timeline-main (80%) — TimelineCanvas (Konva)          |  |
|   |  +--------------------------------------------------------+  |
| S +--------------------------------------------------------------+
| t | #timeline-overview — TimelineMinimap (100px)                 |
| r +--------------------------------------------------------------+
| i | #timeline-nav  [undo bar?] Jump-to-year [input][→]  LoD -/+  |
| p +--------------------------------------------------------------+
|   | #timeline-info  Current year | Items x/y | Visible || FPS   |
+---+--------------------------------------------------------------+
```

`TimelineActivityStrip` is a vertical strip on the left (filter toggle, settings, and an `actions` slot hosting `TimelineActionsMenu`). `TimelineFilterPanel` renders when `store.filterPanelOpen` is true.

### State

| Kind | Name | Purpose |
|---|---|---|
| local ref | `loadError` | true when no `?id` param was provided (shows error screen) |
| local ref | `timelineCanvasRef` | handle to `TimelineCanvas` (exposes `jumpToYear`, `animateJumpToYear`, `updateStageSize`, layers) |
| local ref | `showSettings` | `TimelineSettingsModal` visibility |
| local ref | `showFilterSetup` | `TimelineFilterSetupModal` visibility |
| local ref | `viewItemId` | item shown in `TimelineItemViewModal` |
| local ref | `lightboxUrl` | full-screen picture lightbox URL |
| local ref | `jumpYear`, `jumpInputRef` | jump-to-year input; a watcher mirrors `store.currentNowYear` into `jumpYear` unless the input is focused |
| store | `title`, `author`, `currentProject`, `settings`, `layoutSettings`, `items`, `filteredItems`, `dimmableItems`, `visibleItems`, `fps`, `currentNowYear`, `currentLodTitle`, `filterPanelOpen`, `lastDeleted`, `isLoading` | central timeline state |
| URL | `?id` | timeline id, parsed in `HandleLoadTimeline` |

### User Interactions

| Interaction | Handler | Effect |
|---|---|---|
| Canvas item click | `onItemClick` | `BackendAPI.send('OpenAddEditItemWindow', { timelineId, itemId })` — C# opens `f_AddEditItem` |
| Canvas "view item" | `onViewItem` | Pictures (TypeId 4): bridge `GetItemForEdit`, then show lightbox (`https://media.app/<FilePath>`). Others: set `viewItemId` → `TimelineItemViewModal` |
| Canvas "add item" (double-click/empty space) | `onAddItem` | `BackendAPI.send('OpenAddEditItemWindow', { timelineId, typeId, year: absoluteTime, granularity: lodIndex })` |
| Activity strip: filter toggle | — | `store.setFilterPanelOpen(!store.filterPanelOpen)` → persists via bridge `SetMiscSetting('filter_panel_open', …)` |
| Activity strip: open settings | — | `showSettings = true` → `TimelineSettingsModal` |
| `TimelineActionsMenu` emits `shift-complete(delta)` | `onShiftComplete` | reload via `store.loadTimelineData(id)` then `animateJumpToYear(currentNowYear + delta)` |
| `TimelineFilterPanel` emits `open-setup` | — | `showFilterSetup = true` → `TimelineFilterSetupModal` |
| Jump-to-year input: Enter, or `→` button | `jump` → `jumpTo(year)` | `timelineCanvasRef.animateJumpToYear(year)` if `layoutSettings.TimelineAnimateOnJumpToYear`, else `jumpToYear(year)` |
| Minimap emits `jump-to-year` | `jumpTo` | same animate/plain jump logic |
| LoD `-` / `+` buttons | — | `store.lodZoomOut` / `store.lodZoomIn` (store mutations changing current LOD level) |
| Undo bar "↩ Undo" (visible when `store.lastDeleted`) | `undoDelete` | `BackendAPI.SaveItem(deleted item + tags/chars/stories/chapters)`; on `ok` → `store.addItem(item)` + `store.clearLastDeleted()` |
| Undo bar "✕" | — | `store.clearLastDeleted()` |
| Keyboard shortcuts (BL-39) | `useShortcuts('timeline', …)` | one handler per registry id in `utils/shortcuts.ts` (see doc 07 §6c): `←`/`→` hold-to-pan (`keyPan` rAF loop → `canvas.applyPan`, `settings.KeyboardPanSpeed` px/s, Shift ×3, `keyup`/window `blur` stop it), `↑`/`↓` → `canvas.stepTick`, `+`/`-` LOD zoom, `Home`/`End` → `jumpToEdge` (boundary item 8/9 else first/last item), `G` focus jump box, `N` → `ItemTypePickerModal` → `onTypePicked` → `onAddItem(type, store.centerAbsoluteTime, store.currentLodIndex)`, `Shift+N` last type, `Ctrl+Z` undo, `F`/`T`/`Y`/`M`/`Shift+M`/`Ctrl+,`/`Ctrl+Shift+A` panels, `F1`/`F2` help/shortcuts, `F10`/`F11` bridge `ToggleCustomScaling`/`ToggleFullscreen` |
| Splitpane splitter drag / window resize | `handleResizeEvent` | rAF + throttle (100 ms) + debounce (100 ms) calls to `timelineCanvasRef.updateStageSize(gridLayer, uiLayer)` |
| Lightbox backdrop click | — | `lightboxUrl = null` (image itself uses `@click.stop`) |

### Modals

| Modal | Trigger | Role |
|---|---|---|
| `TimelineSettingsModal` | activity strip settings button | edit timeline settings + layout settings (receives `store.settings`, `store.layoutSettings`) |
| `TimelineFilterSetupModal` | filter panel "setup" | create/edit filter rules |
| `TimelineItemViewModal` | canvas view-item on non-picture items | read-only item view |
| Picture lightbox (Teleport to body) | view-item on a Picture item | full-screen image |
| `ShortcutsModal` (`context="timeline"`) | `F2`, `?` flyout → Shortcuts | the registry, current window first |
| `ItemTypePickerModal` | `N` | pick a type by click / `1`–`5` / `E P A I O`; `N` repeats `lastTypeId` |
| `ReferenceTimelineModal` | `R`, strip "Reference timeline" | lists the other timelines; each row can be drawn underneath this one (`store.loadReference`) or opened read-only in a new window (`OpenTimeline { id, readOnly: true }`); shows the active underlay (calendar warning, display-only shift, Remove) |

### Read-only reference window (BL-66)
`store.readOnly` is set from `?readOnly=1` (cold start) or the `SetTimelineId` push's `readOnly` (pre-warmed; the URL is rewritten to include it so F5 keeps it). Effects: title bar suffix " (reference)"; `TimelineActivityStrip` gets `readOnly` and hides the actions slot, year calendar, Tags, Mass add, Reference and Settings; `onItemClick` (Shift+click / context-menu Edit) routes to `onViewItem`; `onAddItem` is a no-op; the `rw()` wrapper makes `N`, `Shift+N`, `Ctrl+Z`, `T`, `Y`, `Shift+M`, `Ctrl+,`, `Ctrl+Shift+A` and `R` return `false`; mini mode is not persisted; the `SetCalendarYear` watcher is silent (the year-calendar slot belongs to the active timeline). `TimelineCanvas`, `TimelineItemViewModal` and `TimelineNotesPanel` read `store.readOnly` themselves (context menus keep only the distance tools, boundary flags are inert, no Edit button, no note input / edit / delete). Filters still work and still persist — they are view preferences.

### Reference underlay (BL-66 step 2)
`store.reference` (`{ project, items, shift }`, session-only) is set by `ReferenceTimelineModal` via `store.loadReference(id)` — the same `GetTimelineData` read, boundaries dropped, nothing on the active state touched. `TimelineCanvas` draws those items ghosted (opacity 0.4) on a `referenceLayer` under the grid and the active items, on the active timeline's time→x mapping plus `shift` years; they ignore filters, the minimap and mini mode. Alt+click on a ghost emits `viewReferenceItem` → `refViewItemId` → `TimelineItemViewModal` with the reference timeline's id and `view-only` (no Edit button, badge says "· reference"); a plain click or right-click on a ghost behaves like empty canvas. `TimelineDataPanel` lists the in-range reference items in its own "Reference — <title>" section below the active ones (View button → the same view-only modal, no locate/pulse). The strip's Reference button gets the green tool-active styling while an underlay is on. A different calendar is a warning in the modal, never a block.

### Data Flow on Load
1. `onMounted` → `HandleLoadTimeline()`: parse `?id` (and `?readOnly=1` → `store.readOnly`); if missing → `loadError = true` (error screen).
2. `store.loadTimelineData(id)` → bridge **`GetTimelineData`** — populates title, author, items, settings, layoutSettings, currentProject, calendar, hiddenRanges, notes, and builds tag/character/story/picture filter maps.
3. Then, inside the store, a `Promise.all` of four bridge calls: **`GetFilterRules(id)`**, **`GetMiscSetting('filter_and_mode', id)`**, **`GetMiscSetting('filter_panel_open', id)`**, **`GetMiscSetting('filter_display_mode', 0)`**; finally the LOD profile is parsed from `Project.Calendar.LodProfile.Profile` and the current LOD index is set to the YEARS level.
4. `onMounted` also registers `window.onresize` plus the `keyup` / `blur` listeners that stop hold-to-pan (removed in `onBeforeUnmount`); the shortcut `keydown` listener is owned by `useShortcuts`.

---

## EditItem.vue — Item Add/Edit Form (`editItem.html`)

### Purpose
The add/edit window for a single `TimelineItem` (Event, Period, Age, Picture, Note, Bookmark), including tags, character appearances, story refs, book/chapter refs, and images. Hosted by `f_AddEditItem`.

### URL Query Params

| Param | Meaning |
|---|---|
| `timelineId` | owning timeline (int) |
| `itemId` | existing item to edit; **absent ⇒ new item** (`isNew`) |
| `typeId` | default type for new items (default 1 = Event) |
| `year` | default absolute time for new items |
| `granularity` | default `CreationGranularity` (LOD index, default 3) |

### Layout

```
+----------------------------------------------------------+
| WindowTitleBar (item title or type name; no maximize)    |
+----------------------------------------------------------+
| HEADER: [TYPE pill]        [Cancel][Save]     [id: 8chr] |
|         Title input                                      |
|         Description textarea         | Color picker      |
+---------------------------+------------------------------+
| DATE & RANGE (left)       | DETAILS (right)              |
|  Type ▾ | Granularity ▾   |  Content textarea            |
|  LOD visibility toggles   |  Importance slider | ☑ notes |
|  Start: LodDateInput      |  Side ▾ |☑ Centered |☑ title |
|  End:   LodDateInput      |  Tags (chips + autocomplete) |
|  (End only for Period/Age)|                              |
+---------------------------+------------------------------+
| FOOTER sections:                                         |
|  Images (grid + Add Image)                               |
|  Item Notes (collapsible, closed; private textarea)      |
|  Characters (collapsible; avatar+role list + picker)     |
|  Stories & Books (collapsible; story chips, book search) |
+----------------------------------------------------------+
```

### State

| Group | Refs |
|---|---|
| Core item | `item` (full `TimelineItem`, new items get `crypto.randomUUID()` id), `isNew` |
| Dates | `startYear`, `startSubYear`, `endYear`, `endSubYear` (written back to `item` on save) |
| Associations | `tags`, `characterAppearances`, `storyRefs`, `chapterRefs`, `images` |
| Lookups | `allCharacters`, `allStories`, `lodProfile` (parsed from calendar's `LodProfile.Profile` JSON), `monthNames` (parsed from `YearDefinition.month_definition`) |
| UI | `isLoading`, `isSaving`, `saveError`, `isCharExpanded`, `isStoryExpanded` |
| Tags UI | `tagInputValue`, `tagSuggestions`, `topTags`, `tagInputFocused` (+ 200 ms debounce) |
| Pickers | `showCharPicker`, `charPickerFilter`, `pendingCharId`, `pendingCharRole`; `showStoryPicker`; `showImagePicker` |
| Books | `bookSearchValue`, `bookSuggestions` (250 ms debounce), `selectedBook`, `bookChapters`, `selectedChapterId` |
| Lightbox | `lightboxSrc` |
| Computed | `isRangeType` (TypeId 2 or 3 → shows End date), `filteredCharacters` (not-yet-linked + name filter) |

No Pinia store is used — this page is fully self-contained over the bridge.

### User Interactions

| Interaction | Handler | Effect |
|---|---|---|
| **Save** button | `save(true)` | writes `startYear/endYear` back to item; computes `AbsoluteStart/AbsoluteEnd = Year + subYear × stepFraction` (from the LOD level matching `CreationGranularity`); bridge **`SaveItem`** with tag names, `{CharacterId, Role}` pairs, story ids, chapter ids. On `status==='ok'` → `window.close()`; else shows `saveError` |
| **Cancel** button / window X (`CloseRequested` push) / Escape | `requestClose` | `BackendAPI.WindowClose()` when clean; otherwise a `ConfirmModal` ("Discard changes?") whose Discard sends `WindowClose` |
| Keyboard (BL-39) | `useShortcuts('edit', …)` | `Ctrl+S` / `Ctrl+Enter` save, `Esc` closes an open picker overlay else `requestClose` (in a text field the first `Esc` only blurs), `Tab` / `Shift+Tab` walk `titleRef → descRef → endDateRef` (first input, Period/Age only) `→ tagInputRef` and return `false` (native Tab) from anywhere else, `F1` / `F2` open `HelpModal` / `ShortcutsModal`. `loadData` focuses the title after `nextTick` |
| Title / Description / Content / Color / Importance slider / "Show in notes" checkbox / Item Notes textarea | `v-model` | direct `item` field edits |
| Side segmented buttons / Centered / Show title (own row; each only for the types it applies to) | `item.Placement` / `v-model` | Auto sends 0 and the backend picks the emptier side on save |
| Type select | `v-model item.TypeId` | switching to Period/Age reveals the End date row |
| Date granularity select | `v-model item.CreationGranularity` | changes which LOD level drives sub-year steps |
| LOD visibility toggle buttons (one per LOD level) | `toggleLodVisibility(i)` | XORs bit `1<<i` in `item.LodVisibilityMask` |
| `LodDateInput` (Start / End) | `@update:year` / `@update:subtick` | update `startYear/startSubYear/endYear/endSubYear` |
| Tag input typing | `onTagInput` | 200 ms debounce → bridge **`SearchTags(query)`** → `tagSuggestions` |
| Tag input **Enter** | `onTagKeydown` → `addTagByName` | adds trimmed lowercase tag chip (dedup) |
| Tag input focus (empty) | `onTagFocus` | shows `topTags` (top 8 from `SearchTags('')`) |
| Tag suggestion mousedown | `addTagFromSuggestion` | adds tag chip |
| Tag chip "×" | `removeTag(i)` | removes chip |
| "+ Add character" | `openCharPicker` | opens in-page picker overlay |
| Picker: click character / role input / **Add** | `confirmAddCharacter` | pushes `{CharacterId, CharacterName, CharacterColor, Role}` to `characterAppearances` |
| Character row role input | inline `@input` | updates `app.Role` |
| Character row "×" | `removeCharacterAppearance(i)` | removes appearance |
| "+ Link story" | toggles `showStoryPicker` | inline checkbox list of `allStories` |
| Story checkbox | `toggleStory` | add/remove `{StoryId, StoryTitle}` in `storyRefs` |
| Story chip "×" | `removeStoryRef(i)` | removes ref |
| Book search typing | `onBookSearchInput` | 250 ms debounce → bridge **`SearchBooks(query)`**; resets selected book/chapters |
| Book suggestion mousedown | `selectBook` | bridge **`GetBookChapters(bookId)`** → `bookChapters` |
| Chapter select + "+ Add" | `addChapterRef` | pushes `{ChapterId, ChapterNumber, ChapterTitle, BookId, BookTitle}` (dedup) |
| Chapter ref "×" | `removeChapterRef(i)` | removes ref |
| "+ Add Image" | `addImage` | if `isNew`: `save(false)` first (persist without closing), then opens `ImagePickerModal` |
| `ImagePickerModal` emits `linked(pictures)` | `onImageLinked` | appends new `MediaItem`s (dedup by Id) |
| Image thumb "×" | `removeImage` | bridge **`RemoveImageFromItem(pictureId, itemId)`** then removes locally |
| Image thumb click | `openLightbox` | full-screen lightbox (`https://media.app/<FilePath>`); backdrop click closes |
| Collapsible headers (Item Notes, Characters, Stories & Books) | toggle `isNotesExpanded` / `isCharExpanded` / `isStoryExpanded` | expand/collapse sections |

### Modals

| Modal / overlay | Purpose |
|---|---|
| `ImagePickerModal` | pick/link media items to the item; receives `already-linked` ids |
| `ConfirmModal` (`showDiscard`) | discard-changes question on Cancel / X / Escape when the form is dirty |
| Character picker overlay (in-page, not a component) | filter + select a character and optional role |
| Image lightbox (Teleport to body) | full-screen image preview |

### Data Flow on Load
1. `onMounted` → `Promise.all` of three bridge calls (parallel): **`GetItemForEdit(timelineId, itemId, defaultType)`**, **`GetTimelineCharacters(timelineId)`**, **`GetTimelineStories(timelineId)`**.
2. From `GetItemForEdit`: existing items replace `item`; new items get defaults from query params. Tags/Characters/StoryRefs/ChapterRefs/Pictures fill association refs. `Calendar.LodProfile.Profile` (JSON string) → `lodProfile`; `Calendar.YearDefinition` → `monthNames`.
3. Sub-year positions are derived: `subYear = round((Absolute − Year) / stepFraction)` clamped to `[0, 1/step − 1]`.
4. `isLoading = false`, then a fire-and-forget **`SearchTags('')`** fills `topTags` (first 8).

---

## CalendarApp.vue — Calendar Editor (`calendar.html`)

> **Export** (header, next to Cancel/Save) runs the same validation as Save, then `BackendAPI.ExportCalendar({ calendar: buildPayload() })` — the on-screen state, saved or not. Errors land in `saveError`.

### Purpose
Full editor for a custom calendar system: metadata/era names, LOD profile, months, week structure, seasons, and memorable days. Serializes everything into the `YearDefinition` JSON + a `LodProfile` and saves via one bridge call. Hosted by `f_Calendar` with optional `?calendarId=`; no param means creating a new calendar.

### Layout

```
+--------------------------------------------------------------+
| WindowTitleBar (calendar name; no maximize)                  |
+--------------------------------------------------------------+
| HEADER: [id/‘New Calendar’] [name input]   [Cancel][Save]    |
+------------------------------+-------------------------------+
| LEFT COLUMN                  | RIGHT COLUMN                  |
|  ▸ Calendar Info (i)         |  ▸ Week Structure (☑ enable)  |
|    short/alt name, eras      |    days/week, day names,      |
|  ▸ LOD Profile (Sort|Auto|i) |    weekend flags              |
|    table: key, step, drag ⠿ |  ▸ Seasons (☑ enable)         |
|    + Add Level form          |    color track, table, DOY    |
|  ▸ Months (i)                |  ▸ Memorable Days (☑ enable)  |
|    year length, month table  |    cards: fixed/weekly/rel.   |
+------------------------------+-------------------------------+
| [Season DOY modal — overlay]                                 |
+--------------------------------------------------------------+
```

Every section header has a collapse chevron (`toggleCollapse(key)`) and most have an italic "i" help button (`toggleHelp(key)`) that shows a help bubble.

### State

| Group | Refs |
|---|---|
| Meta | `calId` (param or new UUID), `lodProfileId`, `calName`, `shortName`, `alternateName`, `nameBefore0`, `nameAfter0`, `lodProfileName` |
| LOD | `lodLevels: LodLevel[]`, `useFractions` (½ vs decimal input), `lodManuallyEdited` (blocks auto-sync), add-form (`showAddLodForm`, `addLodKey`, `addLodStep`), drag (`lodDragIndex`, `lodDragOver`) |
| Year | `yearLength` (auto = sum of month lengths), `isScalingMonths` guard flag |
| Months | `months: {name, shortName, length, season}[]`, `monthsHaveShortName` |
| Weeks | `hasWeekDef`, `weekLength`, `daysHaveNames`, `dayNames`, `daysHaveShortNames`, `dayShortNames`, `weekendDays` |
| Seasons | `hasSeasons`, `seasonsHaveShortName`, `seasons: {name, shortName, start, end, significance}[]`, computed `seasonSegments` (colored proportional track), DOY modal (`showSeasonDoyModal`, `seasonStartInput`) |
| Memorable days | `hasMemorableDays`, `memorableDays: {id, name, color, type: fixed\|weekly\|relative, start/end month+day, isRange, weekDays, rule}[]`, computed `dayLabelsForPicker` |
| UI | `isLoading`, `isSaving`, `saveError`, `openHelp`, `collapsed` |
| URL | `?calendarId` → `isNew` when absent |

**Reactive couplings (watchers):**
- `months` (deep) → recompute `yearLength` as the sum of month lengths (unless `isScalingMonths`).
- `weekLength` → grow/shrink `dayNames`/`dayShortNames`, drop out-of-range `weekendDays`.
- `[months, hasSeasons, seasons, hasWeekDef, weekLength, yearLength]` (deep) → `syncLodStepFractions()` recalculates SEASONS/MONTHS/WEEKS/DAYS step fractions — skipped once `lodManuallyEdited` is true.

No Pinia store usage.

### User Interactions

| Interaction | Handler | Effect |
|---|---|---|
| **Save** | `save` | validates (name required; ≥1 LOD level; must contain a `YEARS` level) → bridge **`SaveCalendar`** with `{Id, Name, ShortName, AlternateName, NameBefore0, NameAfter0, LodProfileId, YearDefinition: buildYearDefinition(), LodProfile:{Id, Name, Profile: JSON}}`; on `ok` → `window.close()` |
| **Cancel** | — | `BackendAPI.WindowClose()` |
| Section title click | `toggleCollapse(key)` | collapse/expand section body |
| "i" button | `toggleHelp(key)` | show/hide help bubble for that section |
| LOD "Sort" | `sortLodByStep` | sort levels by step fraction descending, re-index; marks manually edited |
| LOD "Auto LOD" | `autoSetLod` | rebuild default levels (MILLENNIA/CENTURIES/DECADES/YEARS + SEASONS/MONTHS/WEEKS/DAYS derived from current definitions); clears `lodManuallyEdited` |
| ½ / 1.0 toggle in Step column header | — | toggles `useFractions` (fraction text input using continued-fraction `toFraction`/`parseFraction` vs plain number input) |
| Format Key text input (with datalist of known keys) | `@input`/`@change` | edits `lod.formatKey`; sets `lodManuallyEdited` |
| Step Fraction input | `updateStepFraction` / `v-model.number` | edits `lod.stepFraction`; sets `lodManuallyEdited` |
| **Drag-to-reorder** LOD rows (⠿ handle, whole `<tr>` draggable) | `onLodDragStart/Over/Drop/End` | HTML5 drag moves the row and re-indexes; sets `lodManuallyEdited` |
| LOD row "×" | `removeLodLevelManual(i)` | removes level — the `YEARS` row is locked (🔒, cannot be removed) |
| "+ Add Level" | `openAddLodForm` → `confirmAddLod` | inline form (key + step); `YEARS` cannot be added again |
| Year Length number input | `onYearLengthInput` | proportionally rescales all month lengths (last month absorbs rounding) |
| Months: "Short names" checkbox, per-month name/short/days/season inputs, "×", "+ Add Month" | `v-model`, `removeMonth`, `addMonth` | edit month table |
| Weeks: Enabled checkbox, days-per-week, "Day names"/"Short names" checkboxes, day name inputs, weekend checkboxes | `v-model`, `toggleWeekend(d)` | edit week structure; without day names only weekend indices are shown |
| Seasons: Enabled checkbox, "Short names", per-season name/short/start/end/significance, "×", "+ Add Season" | `v-model`, `removeSeason`, `addSeason` | edit seasons; colored proportional track visualizes segments |
| Seasons "Auto DOY" | `openSeasonDoyModal` → `applySeasonDOY` | modal asks for first day of season 1, then divides `yearLength` evenly across seasons (wrapping start/end day-of-year) |
| Memorable Days: Enabled checkbox; one color-dot chip per day; **Manage days…** | `openMemDays(id?)` | opens `MemorableDaysModal` (on that day, or the first) |
| `MemorableDaysModal` Add / Delete | `addMemorableDay`, `removeMemorableDayById` | the page owns the list; the modal edits the day objects live (fixed → `CalendarDayPicker` + Range, weekly → `WeekDayPicker`, relative → `RelativeRuleEditor`) |
| DOY modal backdrop click / Cancel | — | close modal |

### Modals
- **Memorable Days modal** (`MemorableDaysModal`, `showMemDays` / `memDayId`): list + editor for memorable days; see `06-frontend-components.md`.
- **Season DOY modal** (in-page overlay): auto-calculates season start/end days from a single "first day of season 1" input.

### Data Flow on Load
1. `onMounted`: if `calendarId` present → bridge **`GetCalendarById(id)`**; fills metadata, parses `LodProfile.Profile` JSON into `lodLevels`, and `parseYearDefinition(cal.YearDefinition)` fills months/weeks/seasons/memorable days.
2. If new: seeds 12 × 30-day months and the 4 default LOD levels (MILLENNIA 1000, CENTURIES 100, DECADES 10, YEARS 1).
3. `isLoading = false`. No other bridge calls until Save.

---

## SettingsApp.vue — Stub (`settings.html`)

### Purpose (actual state of the code)
`settings.html` is declared as a Vite build entry and `settings.ts` mounts `SettingsApp.vue`, **but no WinForms form navigates to `settings.html`** — a repo-wide search of `Forms/*.cs` finds hosts only for `index.html`, `timeline.html`, `editItem.html`, and `calendar.html`. The component itself is leftover boilerplate, not a real settings page:

- Declares props `itemId: number`, `initialTitle: string` and emits `close` / `updated` — props that nothing supplies when mounted as a page root.
- State: `localTitle` ref, `isSaving` ref, and an unused `useTimelineStore()` instance.
- One interaction: a "Save Changes" button that fire-and-forgets `BackendAPI.send('UpdateItemTitle', { id, newTitle })` and emits `close`; a "✕" button that emits `close`; a single Title text input.
- `onMounted` only logs to the console; no bridge calls fire on load.
- No modals.

The application's real settings UIs live elsewhere: `AppSettingsModal` (opened from `App.vue`) and `TimelineSettingsModal` (opened from `TimelineApp.vue`). Treat `SettingsApp.vue` as a placeholder pending a real implementation or removal.

---

## RelationsApp.vue — Relations (`relations.html`)

### Purpose
BL-73, BL-76, BL-77. The cast as a web rather than a list. Seven views over the same data, all on
the same Konva stage with the same node rendering, so switching is a re-layout, not a different
screen:

| Mode | Button | What it lays out |
|---|---|---|
| `clusters` | Knots | The spring sim with the knots shoved apart, each under a named blob |
| `matrix` | Matrix | Adjacency grid, factions blocked on the diagonal |
| `tree` | Genogram | Hourglass generations from parent/spouse, everything else overlaid |
| `arc` | Arc | One axis by birth year, ties as bows — family above, the rest below |
| `sociogram` | Sociogram | A box per faction in a ring, boundary-crossing ties picked out |
| `chord` | Chord | Groups round a circle, ribbons as thick as the ties between them |
| `chain` | Chain | The shortest route between two people, each with a ring of their other ties |

`clusters` is the only view that runs the sim, so `isForce` doubles as "is this the view
`paintGraph` paints" — there was a second computed saying exactly that until **Graph**, **Rings**
and **Rows** were cut (2026-09-24). Everything else builds its own shapes and never moves them
again. Graph was indistinguishable from Knots once Knots worked, and a BFS rank is not a fact
about a story: `radialLayout` and `layeredLayout` went with their views.

### Layout
A `WindowTitleBar`, a sidebar and the stage filling the rest. The sidebar starts at 260px and is
dragged by `.side-grip`, a 5px strip beside it, wired up by `useSideWidth(key, fallback, min, max)`
in `composables/useSideWidth.ts`: `startResize` captures the pointer on the strip, so the drag
survives the cursor crossing the canvas, and since the panel starts at the left edge of the page
the pointer's own `clientX` *is* the width — clamped to 200–560 and written to `localStorage` on
release. Per machine rather than per timeline: how wide a panel of names wants to be is about the
monitor in front of you, not about the story. The stage's `ResizeObserver` picks the rest up.

The CSS `resize` property would have been free, but its grip sits in the element's bottom-right
corner — on a full-height panel that is the bottom of the window, where nobody looks for it.

The Characters window's list uses the same composable and the same `.side-grip` class, under the
key `charactersSideWidth`; its `.ch-body` grid takes the width inline as
`${listWidth}px 5px 1fr`. The strip's own styling lives in `assets/main.scss` beside the other
shared chrome, with both `flex` and `width` set so it works in a flex row and a grid column.

Sidebar, top to bottom: a seven-button mode grid with a one-line hint for the current view, a
search box that centres the stage on a match, the knots' distance slider and the arc's spread
slider (that view only), the chord's Factions/Kinds toggle and its pick list (that view only), the
sociogram's crossing-ties slider and a note when it has no factions to draw, the chain's *Side
circles* checkbox (each in that view only), an "as of year" checkbox with a range scrubber, a category legend whose checkboxes hide kinds, a
two-picker "How are they related?" readout — which is also what the chain view draws — the
selected character's ties worded from their end, and the list of characters no relation mentions.
The unpin controls only show in the knots.

Over the stage's top-right corner sit two buttons, **Copy** and **Save**, which take the picture
(`stageBlob()`): `stage.toCanvas({ pixelRatio: 2 })` onto a canvas pre-filled with `--app-bg`,
since Konva draws on transparency and a PNG of a dark chart on nothing is unreadable wherever it
is pasted. Copy needs `ClipboardItem`, which is guarded for. Both say so afterwards through
`notice`, a line that clears itself after 2.5s, next to where `error` prints and dimmer.

### State
| Group | Refs |
|---|---|
| Data | `characters`, `relations`, `types`, `loading`, `error` |
| View | `mode` (`clusters` \| `matrix` \| `tree` \| `arc` \| `sociogram` \| `chord` \| `chain`), `selectedId`, `treeRootId`, `search`, `menu` + `menuId`, `notice`, `arcSpread`, `knotRoom`, `crossFade`, `haloOn`, `chordBy`, `chordPick` |
| Filters | `yearOn`, `year`, `hiddenCategories`, `treeShown`, `pathFrom`, `pathTo` |
| Context | `timelineId` (a **ref** — the pre-warmed window is navigated before the id is known) |

All the maths lives in two canvas-free, unit-tested modules. `utils/relationsGraph.ts`
(`src/test/utils/relationsGraph.test.ts`): the spring sim and its optional knot gravity, the BFS
shortest path and its plain-English wording, the generation layout and its union nodes.
`utils/relationsLayouts.ts` (`src/test/utils/relationsLayouts.test.ts`): ids and edges in,
positions out — `communities()` (label propagation), `clusterSeed()`, `matrixOrder()`,
`arcLayout()`, `sociogramLayout()`, `chordLayout()`, `chainLayout()` and `convexHull()`.

`hiddenCategories` lists what to **hide** and `treeShown` lists what to **show**: the genogram's
checkboxes only decide what is laid over a chart that is always drawn, and they start empty, so
they cannot be the same list. `toggleCategory()` picks whichever one is behind the checkbox in
this view. Keeping them apart is also what stops a blanked genogram overlay from emptying
`visibleEdges` and telling the path finder that nobody is related to anybody.

### Knots (`clusters`)
`communities()` (label propagation) says who is in which knot and `clusterSeed()` starts them in
separate rings; what keeps them separate is in `stepForces`. Pulling each member toward its own
knot's centroid was never enough on its own — nothing pushed two centroids apart, and the global
pull toward the stage centre stacked them, so the knots settled concentric and the view was
indistinguishable from `graph`. Centroids now shove each other: a knot claims `clusterRoom` (46px)
per √member, and any pair closer than the sum splits the shortfall, applied to every member
equally so the knot moves as one.

`clusterRepulsion` sets a *distance*, not a speed. The shove is opposed by the centre gravity the
whole way and settles where they cancel, so the constant decides how close to the wanted gap the
knots actually get — at 0.12 they stopped ~180px short and still overlapped, at 0.3 the worst pair
on the test cast is 39px short of 365.

`clusterRoom` is not a constant but the *Knot distance* slider, `KNOT_ROOM` mapping 0–100 onto
14–160px per √member, **geometrically** (`min * (max / min) ** (v / 100)`). The dial was 14–78
until it was asked to go further (2026-09-24); stretching the top linearly would have dragged the
midpoint from 46px to 87 and changed what every existing timeline looked like on reopening, where
a geometric dial keeps 50 at ~47px — the module default, and where the measured numbers below were
taken. Changing it calls `kick()` rather
than `buildGraph()` — the knots have not changed, only how much room they want, and a rebuild
would discard a layout the writer had dragged into shape — and re-arms `fitOnSettle`, because the
picture changes size. `knotRoomPx()` turns the 0–100 into px per √member over **two** geometric
halves, `min`→`mid` and `mid`→`max` (14 / 46 / 200): the top of the range has been raised twice
(78 → 160 → 200, both asked for), and on a single curve each of those would have dragged the
midpoint up with it and changed what every saved setting drew on reopening. Two halves pin 50 at
46px for good. Measured on the test cast the mean gap between knots runs 288 / 306 / 373 /
477 / 565px at 0 / 25 / 50 / 75 / 100 of the old 14–160 dial, with the fitted zoom falling
0.97 → 0.51 to match; on the 14–200 dial the whole layout measures 882 / 1114 / 3492px wide at
0 / 50 / 100 and the fit follows it down, 1 → 0.72 → 0.21. The top of the range buys daylight at
the price of a smaller picture. Near the top the knots stop short of
what they ask for (11 of 21 pairs on the test cast, worst by 154px) because seven mutual
constraints plus centre gravity cannot all be satisfied at once; the picture still grows
monotonically, which is what the control promises. This, `arcSpread` and `crossFade` persist per timeline
through `rememberedSlider(key, what, fallback)`, a small factory over
`GetMiscSetting`/`SetMiscSetting` that debounces the write, starts at `fallback` if the read
fails, and only surfaces a *write* failure — losing a setting you deliberately moved is the one
you would notice.

The dial does a second thing, and has to. Ties that *leave* a knot are what holds the knots open:
with the centroids shoved 1200px apart, a cross-knot tie is a spring stretched a thousand past its
150px rest length, and that beats the pull back toward a member's own centroid — so the cross-tied
members get dragged out to the rim and the knot smears toward its neighbours instead of staying a
knot. Measured at the top of the dial, the median knot doubled, 202 → 442px, and the biggest
tripled to 1019px, while the singletons sat unchanged at ~160. So `stepForces` reads
`slack = max(1, clusterRoom / CLUSTER_ROOM)` and gives a tie whose two ends are in different knots
that much extra rest length, and exactly as much less pull (`linkStrength / slack`) as it gained
reach — a tie that has to stretch further should not stretch harder. Never the other way: at or
below the dial's midpoint `slack` is 1 and every number is what it was before this existed, which
is what three of the unit tests pin down. After it the median knot runs 202 / 203 / 217px across
the dial and the biggest 293 / 366 / 530, with the layout still 3311px wide at 100 — the knots
keep their size and the space between them is what grows.

`paintHulls()` draws the blob behind each knot, in its own group in front of nothing and behind
the links, `listening: false` so it never eats a click meant for a character. The blob is
`convexHull()` stroked `HULL_PAD * 2` wide with round joins and caps — the stroke *is* the
padding, so there is no offsetting maths and the corners round themselves. It runs inside the sim
loop, so the shapes are rebuilt only when the knots change and every other frame just moves the
points. Knots of one get no blob (`HULL_MIN`); a knot of two draws as a capsule, since
`convexHull` hands back fewer than three points unchanged and the caller only closes the path at
three or more. Hues are spread evenly round the wheel rather than hashed through
`categoryColor` — a hash collides, and two neighbouring knots in the same colour defeats the
view. Each blob is labelled with its best-connected member ("Bran Grimsby and 25 others").

Knots shoved apart run wider than the stage, so this is the one force view that fits itself —
once, when the sim first settles after `buildGraph`. Refitting on every settle would yank the view
from under anyone who had just dragged somebody, because a drag reheats the sim. The other views
that draw their own shapes never reach `paintHulls`, so `rebuild()` hides the hull group; without
that, switching to the chord left the last knots drawn underneath it.

### The matrix (`matrix`)
`matrixOrder(ids, edges, clusters, factionOf)` decides the order rows and columns go in, so the
blocks that mean something land on the diagonal. **Faction first**, because a faction is a fact the
writer wrote down and a knot is one the file guessed — biggest house first, ties by name, and
everyone with no faction last. Inside a faction it falls back to knot-then-degree, which is the
whole order when no factions exist. Ties keep their input order, which is why the page hands it a
cast already sorted by name.

Clicking is how the grid asks the question it cannot answer itself: **a cell** puts the row's
person into *Relation A* and the column's into *Relation B* and leaves the finder to spell the
relation out; **a name down the side** sets A, **across the top** sets B, and either also selects.
The diagonal is nobody's relation with themselves, so it just selects. **The pair you picked is
marked**: a faint band along A's row and B's column, and a white outline on both of the symmetric
cells — drawn over the coloured squares, because an empty cell is exactly the pair you ask about
to find out there is nothing there. Without it a click off the diagonal changed two dropdowns and
nothing on the grid, and on an eighty-row grid the bands are how you find the square again. It is
one transparent
`Konva.Rect` over the whole grid rather than a listening rect per pair — every square answers,
including the empty ones, and "how are these two related" is a question you ask precisely about
the pairs with no line between them.

**Show the route** (`showPath`, session-only, shared with the genogram) draws the finder's answer
on the grid as a staircase. `pathRoute` is `shortestPath().nodes` kept *in order* — `pathNodes`, the set the other
views trace with, is now derived from it, since a set cannot say which step came third. Each step
is ringed at the square where its two people meet and numbered in reading order, and the elbow
joining one step to the next turns on the diagonal square of the person the two steps have in
common, which is what going *through* somebody looks like on a grid. Gated on
`pathRoute.length > 2`: two people directly related are already the pair mark above, and drawing
a one-step staircase over it says the same thing twice. On an eighty-row grid at the fitted zoom
the ring is what you see first and the numbers want a zoom in, which is the right way round —
the ring answers "where", the number answers "in what order".

The stage is `draggable`, so a pan that starts on the grid still fires `click` on it afterwards
and would set a pair every time the view was shoved sideways. One `panned` flag at the stage level
(`mousedown` clears it, `dragmove` sets it) catches every pan however it started, because Konva
bubbles the stage's own drag.

### The genogram (`tree`)
`hourglassLayout()` places the generations and their union nodes; everything else is decoration
`buildTree()` adds on top.

`overlayEdges(edges, present)` is the rest of the web: every tie that is neither `PARENT_KINDS`
nor `SPOUSE_KINDS` and has both ends on the chart. Each draws through `bowPoints()` — a three-
point curve, inset by `FRAME_R` so it stops at the discs rather than under them — or
`jaggedPoints()` for the `hostile` category, whose teeth are forced to zero at both ends for the
same reason. Both survive coincident endpoints (the layout can produce them before a row spreads),
which is what the `Number.isFinite` test pins down. `overlayFade(distance)` drops a tie's opacity
from 0.9 to 0.25 between two and ten `TREE_ROW` of reach; an eighty-person cast is otherwise a
hairball of full-strength diagonals.

`genderFrame()` puts the genogram shape — square `M`, circle `F`, diamond otherwise, via the same
`genderKey()` the relation wording uses — *around* the shared portrait disc rather than replacing
it, so `buildNode()` stays the one node renderer for all six views. `deathCross()` is added when
`lifeStateAt(c, asOfYear ?? +Infinity)` says dead: with the scrubber off the cross is a fact about
the person, with it on it is a fact about that year.

`buildTree()` tracks the node bounds and ends in `fitOrHold()`, which it used to leave alone —
the chart inherited the previous view's zoom. `fitOrHold(minX, minY, maxX, maxY, focus, floor)`
fits with `fitStage()` while the result stays at or above `floor`; below that it holds `floor`,
centres on `focus` and runs both axes through `clampPan()` so the content keeps covering the
stage. The genogram's floor is `MIN_READABLE_SCALE` (0.45) and its focus is the root. An
eighty-person cast that is one bloodline lays out around 8000px wide, so the floor is the usual
branch. `clampPan()` lives in `relationsGraph.ts` and is unit-tested; content smaller than the
stage on an axis is centred rather than pinned to an edge.

**Show the route on the chart** is the same `showPath` checkbox the matrix uses, and the only
view-specific thing about it is where the route comes from. The genogram draws one hourglass
around one root, so `shortestPath()` is run over a *filtered* edge list — both ends in `at` (the
chart's own position map) and not in a category `treeShown` has hidden — rather than over
`visibleEdges` whole. A path through the full web can step through people this chart never drew,
and a numbered trail with gaps in it is worse than none; filtering also keeps the legend honest,
since a category it has hidden is not a step the route may take. Gated on both ends being on the
chart, which is why the hint says so.

Each step is traced along the chart's *own* elbows rather than cut straight across it: the union
joining the two is looked up, and each end contributes either a parent's drop into the union node
or a child's rise to the sibling bar — the same two shapes `buildTree()` already drew, which is
why `barAt` remembers each union's bar `y` as the elbows go down. A step with no union between it
(a friendship, a rivalry) falls back to the `bowPoints()` curve the overlay drew it as, and takes
the `tension: 0.5` that turns three points into a bow; an elbow keeps `tension: 0`, since it is
already the shape it means. The rings and numbers go into `nodeGroup` *after* every face, the
same fix the chain's step wording needed, and are numbered per person so the digits count off the
names in the sidebar's sentence.

The scrubber and the legend are shown in this view too (they were `mode !== 'tree'` until the
genogram read either). Note the asymmetry: `visibleEdges` gates the **overlay**, but the chart
itself comes from `hourglassLayout(characters, relations, root)` — unfiltered, because hiding
`family` would otherwise leave nothing to overlay onto. The legend says so in a hint.

### The arc (`arc`)
`arcLayout(ids, years, spread, gap)` places everyone on `y = 0` in birth order. `spread` (the
sidebar slider, 0–100, divided by 100) blends between even spacing and true-to-the-year; a
left-to-right pass guarantees `ARC_GAP` minimum separation whatever the blend asks for. Full
spread scales off the **median** step between consecutive births — the smallest step would let one
pair born a year apart in a centuries-wide cast stretch the axis into whitespace. Characters with
no birth year are bucketed past `undatedFrom`, drawn behind a dashed fence with a caption.

`buildArc()` draws each visible edge with `bowPoints(l, r, 0, above ? -rise : rise)` at
`tension: 0.5`. A left-to-right chord makes `bowPoints`' perpendicular offset vertical, so a
negative bow arcs above and a positive one below; `above` is `category === 'family'`. `rise` is
42% of the span, clamped to `[30, ARC_RISE_MAX]`. With someone selected, their ties stay at 0.85
and the rest drop to 0.1.

**Rows by generation** (`arcRows`, a session-only checkbox) keeps `arcLayout`'s x positions and
writes `p.y = generationOf(relations, ids) * ARC_ROW` onto them before anything is drawn, so the
axis line, the undated fence, the bows, the discs and the fit all follow from the one array.
`generationOf()` lives in `relationsGraph.ts` beside the genogram's kin helpers: 0 for anyone
whose parents are not in the cast, one more per step of descent, spouses levelled to the later of
the pair. It is a *longest* path — a character with a grandparent and a parent on screen belongs
under the parent — relaxed in bounded rounds rather than topologically sorted, because nothing
stops a writer making somebody their own great-grandparent; the depth is capped at the size of the
cast so a cycle flattens instead of climbing until the rounds run out. In rows the bow is capped
at `ARC_ROW * 0.45` rather than `ARC_RISE_MAX`, or it wanders into the discs of the row below.

Each node's name — the `Konva.Text` `buildNode()` tags `name: 'label'`, which exists for this —
moves above the disc and alternates between two rows, so the nearest name on the same row is two
people away and has two gaps of room. The birth year goes under it in grey. The alternation is
counted **along each row** rather than by position in the list: once the rows are on, the person
to your left is not the one before you in birth order.

The arc passes `floor = 1` to `fitOrHold()`: the genogram's shape still reads at 0.45, but an arc
is a row of names and years and nothing else, so it holds 1 and pans. It also passes the layer's
own `getClientRect({ skipTransform: true })` rather than bounds derived from the constants — a
real cast is nearly all `family`, so reserving symmetric room for the bows would centre the axis
in a half-empty stage.

### The sociogram (`sociogram`)
`sociogramLayout(groups, loose)` puts one box per faction at equal angles on a ring and everyone
with no faction on a ring outside it. The `factions` computed splits the cast on
`Faction?.trim()` and sorts the groups alphabetically, so the ring keeps its order across
sessions. Box size comes from a roughly square grid of `SOCIO_CELL_W`×`SOCIO_CELL_H` member
cells plus `SOCIO_HEADER` for the label the caller draws.

The ring radius is solved over **every pair** of boxes, not just neighbours: each box is treated
as the disc covering it, two boxes `steps` apart have `2R·sin(π·steps/n)` between their centres,
and the largest radius any pair asks for wins. Neighbour-only sizing never asks about the two
biggest boxes facing each other across the middle.

`buildSociogram()` draws the boxes into `linkGroup` first, so ties draw over them. Edges are
straight — `bowPoints(a, b, NODE_R, 0)` with no tension — because a crossing tie is read by where
it lands and the ring already leaves it an empty middle to be seen in. A tie is internal only when
both ends share the same *named* faction, so the unaffiliated cross by definition. Internal ties
draw at `SOCIO_INSIDE` (0.12) against 0.85 for crossings; with somebody selected their own ties go
to 0.9 and everyone else keeps their value at `SOCIO_BACKDROP` (0.35) of it, rather than being
flattened — the window always opens with a character selected, so an override would hide the
contrast the view exists for.

The *Crossing ties* slider (`crossFade`, 0–100, default 100) scales `SOCIO_CROSS` (0.85), the
opacity a tie that leaves its box draws at. It starts where the view was before the slider existed
— the crossings are the point of it — and exists for the cast where every house deals with every
other, whose middle fills in solid and hides the boxes the view is about. The selected
character's own ties stay at 0.9 whatever it says: turning the background down should not take
away the threads you asked for.

Unlike the genogram and the arc this view calls `fitStage()` with no floor: a ring is read whole,
and holding a minimum scale just clips it.

### The chord circle (`chord`)
`chordLayout(names, counts)` takes a symmetric matrix and returns the arcs, the ribbons and the
radius. **An arc is as wide as the group's tie-ends, not its headcount** — a house of forty who
keep to themselves earns less of the circle than a house of five everybody deals with. An
internal tie spends two ends, both on the same arc, which is what gives a self-contained group
its width. Gaps are `CHORD_PAD` but never more than a third of the circle between them, and the
radius grows with the cast (`CHORD_PX_PER_END`) so a hundred ribbons are not squeezed through the
same gap. Every arc is filled by its own ribbons end to end with no gap and no overlap; that is
the invariant the unit tests pin.

`chordMatrix` builds the matrix two ways. **Factions**: an arc per faction plus a `No faction`
arc, `counts[i][j]` the number of relations running between them. **Kinds**: an arc per relation
category, but counted *per person*, not per pair — `counts[i][j]` is how many characters have
both kinds of tie and `counts[i][i]` how many have only that one. The pair-level reading (how
many pairs are family *and* hostile) was the original design and was dropped after checking the
live data: 298 relations across 298 distinct pairs, not one carrying two categories, so that
chart is always empty.

`buildChord()` draws ribbons as custom `Konva.Shape`s — two arcs on the inner radius joined by
quadratics through the origin — and puts them in `nodeGroup`, not `linkGroup`, because
`linkGroup` is `listening: false` and here the ribbon is the thing you click. Own loops draw
first so crossings sit over them, and take `CHORD_SELF` (0.2) against `CHORD_REST` (0.62), the
same internal/crossing contrast the sociogram makes. Clicking an arc or a ribbon lifts it to
`CHORD_LIT` (0.85), drops the rest to `CHORD_BACKDROP` (0.14) and lists what it is made of;
clicking it again, clicking empty stage, or changing mode or grouping lets go.

The fit is computed from the radius and the stage rather than measured, and labels are sized
`CHORD_LABEL_PX / scale` so names stay a constant 13 screen px however big the cast. Measuring
would not work anyway: a custom `Konva.Shape` with a `sceneFunc` reports a 0×0 client rect, so
ribbons are invisible to `getClientRect` and can only be found through `stage.getIntersection`.

### The chain (`chain`)
The view for the question the sidebar has always asked in prose. `G.shortestPath` gives the route
between *Relation A* and *Relation B*; `chainLayout(path, edges)` lays it left to right at
`CHAIN_GAP` and fans everyone else each of them is directly tied to around them at `CHAIN_HALO_R`.

- **Nobody is drawn twice.** A neighbour two people on the route share is placed once, at the
  earlier of them — two circles for one person read as two people.
- **A satellite says a tie exists, not what it connects to.** One thin spoke to whoever on the
  route knows them, and nothing else: the first cut of this view drew every edge between everyone
  on the picture and buried the one line it is about under the mesh (2026-09-24). The mesh is what
  the knots are for.
- **The fan skips the horizontal.** Half go above the chain and half below, over arcs of
  ±(35°–145°); a satellite at dead level would sit on the one line this chart cannot afford to
  lose, and on the words written along it.
- **Past `CHAIN_HALO_MAX` (5) the least connected are dropped**, and the last slot in the ring
  becomes a dashed `+n` instead of a sixth face — always the same five circles, one of them saying
  how many you are not seeing. A hub hanging off the route says more about where it runs than a
  walk-on does, which is why the cut is by degree.

Satellites are `buildNode()` scaled to `HALO_SCALE` with the name label **destroyed** and the
selection ring counter-scaled: five names round one person run into each other at any radius that
still fits between two chain members, so the disc's initials carry it and a click says who in
full. They keep the portrait, the double-click and the right-click menu, because a satellite is a
character. The *Side circles* checkbox (`haloOn`) drops the lot for the route on its own.

Each step of the route is labelled with `relationLabel()` read from the *left* end, so the chart
reads left to right whichever way round the relation happens to have been written down. The labels
are added to `nodeGroup` **last of all**, after the discs: what a step is called is the sentence
this view exists to draw, and in `linkGroup` it was written underneath the very circles it
names. With no
route — or no pair picked — the stage says so instead, which is `pathText` where there is one.

**Everything is draggable**, and `dragChain()` is what keeps the picture honest afterwards: it
holds the lines (`chainLines`), the words over them (`chainWords`) and each ring (`chainRing`) as
id pairs rather than coordinates, and reads the positions back out of `shapes` on every
`dragmove`. Drag someone on the route and their ring travels with them at its stored offset; drag
a satellite and the offset is rewritten, so it stays where you put it the next time its owner
moves. A route of six people with a ring each will overlap somewhere, and letting you shove one
aside is cheaper than a placer clever enough never to need it.

The knots run the sim on a `requestAnimationFrame` loop that `kick()` reheats and
`tick()` cools: `stepForces` takes an `alpha` the caller decays by `ALPHA_DECAY` each frame, and
the loop exits at `ALPHA_MIN` or once `moved` — a sum over the nodes, so the bar scales with the
cast — drops below `simNodes.length * 0.05`. Cooling is the one that guarantees a stop; a big
enough web never quite settles on its own. The sim also caps the push between any pair and each
node's speed, without which a close pair flings itself across the stage and the graph never
recovers. The year scrubber reheats to 0.4 rather than 1, so dragging it does not keep the layout
moving under the writer's hand.

### User Interactions
| Action | Effect |
|---|---|
| Click a node | Select; a white ring marks them in every view that draws discs. In the knots everything more than one hop away also dims; the matrix re-bands their row and column, the genogram re-roots on them |
| Double-click | `OpenCharactersWindow(timelineId, characterId)` |
| Right-click a character | Menu: their timeline, open in characters, centre the tree here, unpin, then **Relation A** / **Relation B**. Rings them, but moves nothing |
| Right-click the background | Menu: **Fit to window**, **Unpin all** |
| Click a matrix cell or edge name | Sets the pair, or the one end, the finder and the chain view read |
| Drag a node | Pins it; the sim leaves it alone and the position is saved (debounced) |
| Wheel / drag the background | Zoom about the pointer / pan |
| "As of year" | Relations outside their span vanish; the unborn fade to 0.12 and the dead to 0.45, so the layout does not jump |
| Copy / Save (stage corner) | The picture to the clipboard, or to `relations-<mode>.png` |

The browser's own context menu is suppressed over the whole window except inside `input`,
`textarea` and `select`, where it is the only cut and paste a WebView offers: the native menu is a
list of things to do to a *web page* — reload it, view its source, save the canvas — and none of
them are true of this window. Both menus are one `menu` ref, `{ x, y, id }`, with `id: ''` meaning
the one about the view; `menuId` is the same thing typed, because narrowing `menu?.id` in the
template is not worth the fight. The **Relation A / B** pair is in the character menu because a
right-click on a person should always offer at least that — it is how you pick the two ends of a
chain from any view, including the ones with no dropdown in reach.

Konva fires `click` for **every** mouse button — there is no button test anywhere in its
`_pointerup`, which turns a right-click into `contextmenu` *and* `click`. The node handler
therefore opens with `if ('button' in evt.evt && evt.evt.button !== 0) return`, asking whether
there is a button at all first because a tap carries none. That alone is not enough: the menu
handler sets `selectedId` so you can see whose menu it is, and the watcher below re-lays out and
re-fits three of the views, which would walk the character out from under the cursor that picked
them. A `menuPick` flag, set by the menu handler and cleared on every `mousedown` (which always
runs before both), makes that one watcher pass ring and stop.

The selection is marked by a `'sel'` circle `buildNode()` adds to every character, built hidden
unless it is them and flipped by `markSelection()` — so a view that re-lays out under the click
gets the mark for free and one that does not still gets it. `holdSelection()` then pans the stage
to centre them **only if they have gone off it**: the genogram re-roots under a click and the arc
and the sociogram re-thread, so the person you just picked can end up past the edge, but a view
that already shows them should not lurch every time you click. It is skipped in the knots, where
the sim goes on moving everyone for a second or two after a build and the hold would aim at where
somebody was. `focusCharacter()` — search and sidebar clicks — falls back from `simNodes` to the
drawn shape's own position, which is the only answer the laid-out views have.

Pinned positions live in `misc_settings` under the key `relations_positions`, the arc's spread
under `relations_arc_spread`, the knot distance under `relations_knot_room` and the sociogram's
crossing opacity under `relations_cross_fade`, all scoped to the timeline — no table of their own.
They follow the same shape: a `load*` that logs and falls back rather than blocking the window, and a
600ms-debounced `save*Soon` that surfaces a failure in `error`.

### Data Flow on Load
1. `timelineId` comes from the query string, or later from a `SetRelationsContext` host push when
   the window was pre-warmed (`Forms/f_Relations.cs`).
2. One bridge call, **`GetTimelineRelations(timelineId)`** → `{ Characters, Relations, Types }`.
3. `GetMiscSetting('relations_positions', timelineId)` restores the pinned nodes.
4. A `FocusCharacter` broadcast re-centres an already-open window on a different character.

---

## Cross-Page Notes

- **Window chrome**: every real page renders `WindowTitleBar` (custom title bar; the WinForms windows are borderless). Edit-style windows (`EditItem`, `CalendarApp`) pass `:show-maximize="false"`.
- **Closing**: Save paths use `window.close()`; Cancel paths use `BackendAPI.WindowClose()` (bridge `WindowClose` message to the host form). `EditItem` asks first when dirty (`ConfirmModal`); the host re-activates its owner before hiding, so closing never brings an Alt-Tabbed third app to the front.
- **Media URLs**: images are served through the WebView2 virtual host `https://media.app/<FilePath>` (used by both `TimelineApp` and `EditItem` lightboxes/thumbnails).
- **Store usage**: only `App.vue` and `TimelineApp.vue` meaningfully use `timelineStore`; `EditItem.vue` and `CalendarApp.vue` are self-contained over `BackendAPI`.

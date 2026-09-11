# 05 — Frontend Pages

This document describes the top-level Vue pages under `Frontend/src/` — what mounts them, what hosts them, their layout, state, interactions, modals, and load-time data flow. All facts below are verified against the source.

## Entry Points Overview

Vite builds five HTML entry points (`Frontend/vite.config.ts` → `build.rollupOptions.input`). Each entry file follows the identical bootstrap pattern: import `assets/main.scss`, `createApp(<RootComponent>)`, `app.use(createPinia())`, `app.mount('#app')`, then fade out and remove the `#app-loading` splash element.

| Entry TS file | HTML entry | Root component | WinForms host | URL query params |
|---|---|---|---|---|
| `src/main.ts` | `index.html` | `App.vue` | `Forms/f_Main.cs` | none |
| `src/timeline.ts` | `timeline.html` | `pages/TimelineApp.vue` | `Forms/f_Timeline.cs` | `?id=<timelineId>` |
| `src/editItem.ts` | `editItem.html` | `pages/EditItem.vue` | `Forms/f_AddEditItem.cs` | `?timelineId=` + (`itemId` \| `typeId`,`year`,`granularity`) |
| `src/calendar.ts` | `calendar.html` | `pages/CalendarApp.vue` | `Forms/f_Calendar.cs` | `?calendarId=<guid>` (absent = new calendar) |
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
| Jump-to-year input: Enter, or `→` button | `jump` | `timelineCanvasRef.animateJumpToYear(year)` if `layoutSettings.TimelineAnimateOnJumpToYear`, else `jumpToYear(year)` |
| Minimap emits `jump-to-year` | `onMinimapJump` | same animate/plain jump logic |
| LoD `-` / `+` buttons | — | `store.lodZoomOut` / `store.lodZoomIn` (store mutations changing current LOD level) |
| Undo bar "↩ Undo" (visible when `store.lastDeleted`) | `undoDelete` | `BackendAPI.SaveItem(deleted item + tags/chars/stories/chapters)`; on `ok` → `store.addItem(item)` + `store.clearLastDeleted()` |
| Undo bar "✕" | — | `store.clearLastDeleted()` |
| **F11** keydown | `onHotkey` | `BackendAPI.send('ToggleFullscreen', { timelineId })` |
| **F10** keydown | `onHotkey` | `BackendAPI.send('ToggleCustomScaling', { timelineId })` |
| Splitpane splitter drag / window resize | `handleResizeEvent` | rAF + throttle (100 ms) + debounce (100 ms) calls to `timelineCanvasRef.updateStageSize(gridLayer, uiLayer)` |
| Lightbox backdrop click | — | `lightboxUrl = null` (image itself uses `@click.stop`) |

### Modals

| Modal | Trigger | Role |
|---|---|---|
| `TimelineSettingsModal` | activity strip settings button | edit timeline settings + layout settings (receives `store.settings`, `store.layoutSettings`) |
| `TimelineFilterSetupModal` | filter panel "setup" | create/edit filter rules |
| `TimelineItemViewModal` | canvas view-item on non-picture items | read-only item view |
| Picture lightbox (Teleport to body) | view-item on a Picture item | full-screen image |

### Data Flow on Load
1. `onMounted` → `HandleLoadTimeline()`: parse `?id`; if missing → `loadError = true` (error screen).
2. `store.loadTimelineData(id)` → bridge **`GetTimelineData`** — populates title, author, items, settings, layoutSettings, currentProject, calendar, hiddenRanges, notes, and builds tag/character/story/picture filter maps.
3. Then, inside the store, a `Promise.all` of four bridge calls: **`GetFilterRules(id)`**, **`GetMiscSetting('filter_and_mode', id)`**, **`GetMiscSetting('filter_panel_open', id)`**, **`GetMiscSetting('filter_display_mode', 0)`**; finally the LOD profile is parsed from `Project.Calendar.LodProfile.Profile` and the current LOD index is set to the YEARS level.
4. `onMounted` also registers `window.onresize` and the `keydown` hotkey listener (removed in `onBeforeUnmount`).

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
|  Start: LodDateInput      |  Tags (chips + autocomplete) |
|  End:   LodDateInput      |                              |
|  (End only for Period/Age)|                              |
+---------------------------+------------------------------+
| FOOTER sections:                                         |
|  Images (grid + Add Image)                               |
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
| **Cancel** button | `cancel` | `BackendAPI.WindowClose()` (bridge `WindowClose`) |
| Title / Description / Content / Color / Importance slider / "Show in notes" checkbox | `v-model` | direct `item` field edits |
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
| Collapsible headers (Characters, Stories & Books) | toggle `isCharExpanded` / `isStoryExpanded` | expand/collapse sections |

### Modals

| Modal / overlay | Purpose |
|---|---|
| `ImagePickerModal` | pick/link media items to the item; receives `already-linked` ids |
| Character picker overlay (in-page, not a component) | filter + select a character and optional role |
| Image lightbox (Teleport to body) | full-screen image preview |

### Data Flow on Load
1. `onMounted` → `Promise.all` of three bridge calls (parallel): **`GetItemForEdit(timelineId, itemId, defaultType)`**, **`GetTimelineCharacters(timelineId)`**, **`GetTimelineStories(timelineId)`**.
2. From `GetItemForEdit`: existing items replace `item`; new items get defaults from query params. Tags/Characters/StoryRefs/ChapterRefs/Pictures fill association refs. `Calendar.LodProfile.Profile` (JSON string) → `lodProfile`; `Calendar.YearDefinition` → `monthNames`.
3. Sub-year positions are derived: `subYear = round((Absolute − Year) / stepFraction)` clamped to `[0, 1/step − 1]`.
4. `isLoading = false`, then a fire-and-forget **`SearchTags('')`** fills `topTags` (first 8).

---

## CalendarApp.vue — Calendar Editor (`calendar.html`)

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
| Memorable Days: Enabled checkbox, "+ Add Day", per-day color/name/type select, "×" | `addMemorableDay`, `removeMemorableDay` | edit memorable-day cards |
| Memorable day type = `fixed` | `CalendarDayPicker` + "Range" checkbox | picks start (and optional end) month/day |
| Memorable day type = `weekly` (disabled unless week structure enabled) | `WeekDayPicker` | picks day-of-week indices |
| Memorable day type = `relative` | `RelativeRuleEditor` | rule editor (can reference seasons, months, weekdays, other memorable days) |
| DOY modal backdrop click / Cancel | — | close modal |

### Modals
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

## Cross-Page Notes

- **Window chrome**: every real page renders `WindowTitleBar` (custom title bar; the WinForms windows are borderless). Edit-style windows (`EditItem`, `CalendarApp`) pass `:show-maximize="false"`.
- **Closing**: Save paths use `window.close()`; Cancel paths use `BackendAPI.WindowClose()` (bridge `WindowClose` message to the host form).
- **Media URLs**: images are served through the WebView2 virtual host `https://media.app/<FilePath>` (used by both `TimelineApp` and `EditItem` lightboxes/thumbnails).
- **Store usage**: only `App.vue` and `TimelineApp.vue` meaningfully use `timelineStore`; `EditItem.vue` and `CalendarApp.vue` are self-contained over `BackendAPI`.

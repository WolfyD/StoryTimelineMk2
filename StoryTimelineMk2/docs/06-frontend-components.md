# Frontend Components Reference

Complete reference for every Vue component in `Frontend/src/components/` (31 components, alphabetical). Each section documents the component's purpose, its exact public contract (props / emits / slots / `defineExpose`), key internal behaviour, consumers, and gotchas.

Conventions used throughout this document:

- **Media URLs** — images are loaded through the WebView2 virtual host `https://media.app/<FilePath>`, which the C# host maps to the media folder on disk.
- **Modal pattern** — nearly all modals are a fixed `position: fixed; inset: 0` backdrop with `@click.self="emit('close')"` so clicking the dimmed area closes the dialog. Only some use `<Teleport to="body">` (noted per component).
- **"Data range"** — the highlighted band around the NOW line; several panels compute "in range" as `TimelineDataRangeWidth / 2 / TimelineTickDistance * lodStepFraction` in absolute-time units around `store.centerAbsoluteTime`.

---

## AppSettingsModal.vue

**Purpose** — Application-level settings dialog: shows the current data root folder, lets the user browse to a new folder and either copy the data there ("Copy data here & switch") or just point the app at it ("Use this folder"), open the folder in Explorer, and create a manual timestamped backup (optionally including media files).

| Contract | Details |
|---|---|
| Props | *(none)* |
| Emits | `close: []`, `refresh: []` (fired after a successful folder move/switch so the parent reloads timelines) |
| Slots / Expose | *(none)* |

**Key behaviour**

- On mount calls `BackendAPI.GetAppConfig()` and shows `cfg.DataRoot`.
- `browse()` → `BackendAPI.BrowseDataFolder()` (native folder dialog); result stored in `pendingPath` (readonly text input).
- `copyAndSwitch()` → `BackendAPI.MoveDataFolder(path)`; `justSwitch()` → `BackendAPI.SetDataRoot(path)`. Both emit `refresh` on `status === 'ok'`.
- `createBackup()` → `BackendAPI.CreateBackup(includeMedia)`; a `cancelled` status is silently ignored (user closed the native dialog).
- Success feedback auto-clears after 4 s; errors persist. A single `isBusy` flag disables all action buttons.

**Used by** — `App.vue` (project list window).

**Gotchas** — the action buttons only appear when `pendingPath !== currentRoot`; "Use this folder" loads whatever data already exists at the destination and never deletes old files (warned inline).

---

## AuthorReminderModal.vue

**Purpose** — Small prompt shown when a timeline has no author set; lets the user type one or skip.

| Contract | Details |
|---|---|
| Props | *(none)* |
| Emits | `set: [string]` (the entered author name), `skip: []` |
| Slots / Expose | *(none)* |

**Key behaviour** — Enter in the input triggers `set`; backdrop click and the X button emit `skip`. No validation — an empty string can be emitted via `set`.

**Used by** — `App.vue` (`@set="onAuthorResult"`, `@skip="onAuthorResult('')"`); unit-tested in `src/test/components/AuthorReminderModal.test.ts`.

**Gotchas** — the parent treats *both* events through the same handler, passing `''` for skip; the modal itself does not distinguish "empty set" from "skip".

---

## CalendarDayPicker.vue

**Purpose** — Custom-calendar-aware date picker rendering one month at a time as a week-aligned grid. Supports single-date and two-click range selection (start then end).

| Contract | Details |
|---|---|
| Props | `startMonth: number`, `startDay: number`, `endMonth: number`, `endDay: number`, `isRange: boolean`, `months: { name; length }[]`, `weekLength: number`, `dayLabels?: string[]`, `weekendDays?: number[]` |
| Emits | `select: [{ startMonth, startDay, endMonth, endDay }]` |
| Slots / Expose | *(none)* |

**Key behaviour**

- Week alignment is *year-consistent*: the leading blank cells for a month are `(sum of lengths of previous months) % weekLength`, so day-of-week columns line up across months.
- Range mode is a two-click state machine (`pickingEnd`): first click emits a collapsed range (start = end) and arms the end pick; second click emits the full range, **swapping ends if the second click is before the first**. A hint line shows "Click start date" / "Click end date".
- Dates are compared as packed ints `month * 100_000 + day` for range classification (`is-start` / `is-end` / `in-range` CSS classes).
- Weekend columns come from `weekendDays`, falling back to columns 5–6 when `weekLength === 7`.
- Month navigation is clamped to `[0, months.length - 1]` — no year wrap.

**Used by** — `pages/CalendarApp.vue` (calendar editor, for fixed memorable days); tested in `CalendarDayPicker.test.ts`.

**Gotchas** — `viewMonth` syncs from `props.startMonth` on change, and `pickingEnd` resets when `isRange` toggles; the packed-int scheme (100 000) differs from CalendarMonthGrid's (10 000) — they are independent encodings, not shared.

---

## CalendarManagerModal.vue

**Purpose** — Lists all calendars with View / Edit actions and a "New Calendar" button. The management hub reachable from the project list.

| Contract | Details |
|---|---|
| Props | *(none)* |
| Emits | `close: []` |
| Slots / Expose | *(none; teleports to `body`)* |

**Key behaviour**

- Loads `BackendAPI.GetCalendarList()` on mount; manual refresh button re-fetches.
- **View** opens a nested `CalendarViewModal` (rendered as a sibling inside the same Teleport, higher z-index) with `viewingId`.
- **Edit** and **New** don't navigate in-page — they call `BackendAPI.send('OpenCalendarEditorWindow', { calendarId })`, which opens a *separate WinForms window* hosting `CalendarApp`.
- The view modal's `edit` event closes the viewer and forwards to the same native-window opener.

**Used by** — `App.vue` (`showCalendarManager` flag).

**Gotchas** — after editing in the external window, this list does **not** auto-refresh; the user must press the refresh button (unlike EditTimelineModal / SelectCalendarModal, which refresh on window focus).

---

## CalendarMonthGrid.vue

**Purpose** — Renders a single month as a compact table (used 12-up in the year view) with weekend highlighting and colored dots + hover tooltip for memorable days.

| Contract | Details |
|---|---|
| Props | `monthName: string`, `monthIndex: number`, `days: number`, `weekLength: number`, `dayLabels: string[]`, `weekendDays: number[]`, `memorableDays?: MemDayMarker[]` |
| Emits | *(none — purely presentational)* |
| Slots / Expose | Exports the `MemDayMarker` interface (`id, name, color, type: 'fixed'|'weekly'|'relative', startMonth, startDay, endMonth, endDay, isRange, weekDays`) |

**Key behaviour**

- Day labels abbreviate to 2 chars, or 1 char when `weekLength > 10`.
- Rows always start at column 0 (no year-offset alignment — unlike CalendarDayPicker).
- `markersForCell(day, col)` matches: **fixed** single dates, **fixed ranges** as packed `month*10000 + day` (including year-wrapping ranges where `start > end`), and **weekly** markers by column index. **`relative` markers are never shown** (they need a year anchor to resolve).
- Tooltip is pure CSS (`.cell-wrap:hover .cell-tooltip`), positioned above the cell.

**Used by** — `CalendarYearView.vue` only.

**Gotchas** — `markersForCell` is called three times per cell in the template (visibility check, dots, tooltip); fine for a 12-month grid but worth knowing. Weekly matching uses `colIndex % weekLength`, which is just `colIndex` given the table layout.

---

## CalendarViewModal.vue

**Purpose** — Read-only inspector for one calendar: basic info/eras, months table (with season chips), week-day chips, seasons table, LOD profile levels, and memorable days with human-readable rule descriptions. Offers "Year View" and "Edit" actions.

| Contract | Details |
|---|---|
| Props | `calendarId: string` |
| Emits | `close: []`, `edit: [id: string]` |
| Slots / Expose | *(none; teleports to `body`, z-index 1100 — above CalendarManagerModal's 1000)* |

**Key behaviour**

- On mount fetches `BackendAPI.GetCalendarById(calendarId)` and parses two JSON blobs:
  - `YearDefinition` → `parseYD()` extracts `length`, `month_definition` (keyed by stringified index), `week_definition` (`days_have_names`, `days`, `weekend`), `season_definition`, and `memorable_days`.
  - `LodProfile.Profile` → `LodLevel[]` (accepts either a JSON string or an already-parsed array).
- Memorable-day rows describe themselves: fixed → "MonthName, day N" (or range), weekly → joined day names, relative → `describeRule()` from `@/utils/relativeRule` with a context of season/month/day/mem-day names.
- Seasons get colors from a fixed 8-color `SEASON_PALETTE` cycled by index.
- "Year View" opens `CalendarYearView` as a sibling overlay.

**Used by** — `CalendarManagerModal.vue`.

**Gotchas** — all JSON parsing is wrapped in silent `try/catch` — a malformed `YearDefinition` renders an empty calendar rather than an error. `month_definition` is an object keyed `"0"`, `"1"`, … not an array.

---

## CalendarYearView.vue

**Purpose** — Full-year overview modal: a 3-column grid of `CalendarMonthGrid` cards for every month of the calendar.

| Contract | Details |
|---|---|
| Props | `calendarName: string`, `months: { name; length }[]`, `weekLength: number`, `dayLabels: string[]`, `weekendDays: number[]`, `memorableDays?: MemDayMarker[]` |
| Emits | `close: []` |
| Slots / Expose | *(none; teleports to `body`, z-index 1200 — top of the calendar modal stack)* |

**Key behaviour** — normalizes `dayLabels` to exactly `weekLength` entries (generating `D1…Dn` if the count mismatches) before passing down. Purely compositional otherwise.

**Used by** — `CalendarViewModal.vue`.

**Gotchas** — the modal z-index stack is Manager (1000) → View (1100) → Year (1200); all three can be open simultaneously.

---

## ConfirmDeleteModal.vue

**Purpose** — Destructive-action confirmation for deleting a timeline, with a warning icon and explanatory sub-text.

| Contract | Details |
|---|---|
| Props | `title: string` (timeline title shown in bold) |
| Emits | `close: []`, `confirm: []` |
| Slots / Expose | *(none)* |

**Used by** — `ProjectContainer.vue`.

**Gotchas** — the component itself performs no deletion; the parent calls `BackendAPI.DeleteTimeline` on `confirm`. No busy state — double clicks are possible in theory.

---

## DuplicateTimelineModal.vue

**Purpose** — Prompts for the new title when duplicating a timeline; defaults to `<original>_duplicate`.

| Contract | Details |
|---|---|
| Props | `originalTitle: string` |
| Emits | `close: []`, `confirm: [newTitle: string]` (trimmed) |
| Slots / Expose | *(none)* |

**Key behaviour** — Enter confirms, Escape closes; button disabled while empty/whitespace or once working (`isWorking` flips on confirm and shows "Duplicating…" — it never resets because the parent unmounts the modal when done).

**Used by** — `ProjectContainer.vue`.

---

## EditTimelineModal.vue

**Purpose** — Edits a timeline's metadata: title, author, description, start year, color tag, and assigned calendar (with inline access to the calendar editor window).

| Contract | Details |
|---|---|
| Props | `timeline: TimelineProject` |
| Emits | `close: []`, `saved: []` |
| Slots / Expose | *(none)* |

**Key behaviour**

- Copies the timeline into a local `reactive` so edits are uncommitted until Save; calendar id falls back through `timeline.CalendarId || timeline.Calendar?.Id || ''`.
- Save calls `BackendAPI.SaveTimelineInfo(id, title, author, description, startYear, color || null, calendarId || undefined)`; title is required.
- **Calendar editor round-trip**: "Edit"/"+ New" open the native calendar editor window (`OpenCalendarEditorWindow`). A `window focus` listener detects the return (`calEditorWasOpened` flag), re-fetches the calendar list, and **auto-selects any calendar Id that wasn't in the previous list** (i.e. a freshly created one).

**Used by** — `ProjectContainer.vue`.

**Gotchas** — the color input can be cleared with the × button (sends `null` to the backend); the focus-refresh only fires if the editor was opened from this modal.

---

## ExportTimelineModal.vue

**Purpose** — Confirms JSON export of a timeline with a single option: include internal IDs (for later re-import).

| Contract | Details |
|---|---|
| Props | `title: string` |
| Emits | `close: []`, `confirm: [includeIds: boolean]` |
| Slots / Expose | *(none)* |

**Used by** — `ProjectContainer.vue` (which then calls `BackendAPI.ExportTimeline(id, includeIds)`; the native save dialog is backend-side).

**Gotchas** — like DuplicateTimelineModal, `isWorking` never resets; the parent is expected to unmount the modal after export.

---

## FontPicker.vue

**Purpose** — Searchable font combobox: a text input with a filtered dropdown (max 60 entries), full keyboard navigation, used for every font-family setting in the app.

| Contract | Details |
|---|---|
| Props | `modelValue: string`, `fonts: string[]`, `placeholder?: string` |
| Emits | `update:modelValue: [string]` (v-model compatible) |
| Slots / Expose | *(none)* |

**Key behaviour**

- Two modes tracked by `isTyping`: on focus (not typing) the dropdown shows the **first 60 fonts unfiltered**; once the user types, it filters case-insensitively (still capped at 60).
- Keyboard: ArrowUp/Down move `highlightIndex`, Enter selects the highlighted entry, Escape closes.
- Options use `@mousedown.prevent` so selection wins the race against input blur; blur additionally waits **150 ms** before closing and reverting the input text to `modelValue` (discarding an uncommitted search string).

**Used by** — `TimelineSettingsModal.vue` (general font, event-box font, tick-marker font, data-panel font).

**Gotchas** — the 150 ms blur timeout is what makes click-selection work; the component never validates that `modelValue` exists in `fonts`.

---

## ImagePickerModal.vue

**Purpose** — Media library picker for attaching images to an item: search, multi-select from existing pictures, or import new files, then link the selection to the item.

| Contract | Details |
|---|---|
| Props | `itemId: string`, `alreadyLinked: string[]` (picture Ids already attached — rendered dimmed with a green check, not selectable) |
| Emits | `close: []`, `linked: [pictures: MediaItem[]]` |
| Slots / Expose | *(none)* |

**Key behaviour**

- Loads `BackendAPI.GetAllPictures()` on mount; search filters on `Title` or `FileName`.
- Selection is toggle-on-click; already-linked pictures are inert.
- **Add** runs `BackendAPI.LinkImageToItem(pictureId, itemId)` in parallel (`Promise.all`) and emits `linked` with only the successfully linked `MediaItem`s.
- **Import New File…** calls `BackendAPI.AddImageToItem(itemId)` (native file dialog + link in one step); new pictures are unshifted into the local grid and emitted via `linked`.
- Thumbnails load from `https://media.app/<FilePath>`; on error the `src` is blanked.

**Used by** — `pages/EditItem.vue`.

**Gotchas** — `selectableCount` filters `selectedIds` by "not linked" even though linked ids can never enter the selection — a defensive no-op. The parent decides whether to close after `linked` (the modal doesn't self-close).

---

## LodDateInput.vue

**Purpose** — LOD-aware date entry: renders exactly the fields relevant to the current zoom level (Year always; Season, Month, Day, or Week depending on `lodIndex`) and encodes the sub-year portion into a single `subtick` value.

| Contract | Details |
|---|---|
| Props | `lodIndex: number`, `lodProfile: LodLevel[]`, `monthNames: string[]` (12 names or fallback to Gregorian), `year: number`, `subtick: number`, `label: string` |
| Emits | `update:year: [number]`, `update:subtick: [number]` (v-model:year / v-model:subtick compatible) |
| Slots / Expose | *(none)* |

**Key behaviour**

- Hard-coded LOD index semantics (matching the default profile): 0 Millennia, 1 Centuries, 2 Decades, 3 Years, 4 Seasons, 5 Months, 6 Weeks, 7 Days. Year input `step` is 1000/100/10/1 accordingly.
- **Subtick encoding varies by LOD**: at SEASONS it's the season index (0–3); at MONTHS the month index; at WEEKS the 0-based week index (displayed 1-based, max 52); at DAYS it's the **0-based day-of-year**, decomposed to month + day-of-month using a fixed non-leap Gregorian table `MONTH_LENGTHS = [31,28,…]`.
- Changing month at DAYS LOD keeps the current day but clamps it to the new month's length, then re-encodes day-of-year.

**Used by** — `pages/EditItem.vue` (start and end date rows).

**Gotchas** — day/month math **always assumes the Gregorian month-length table**, even when `monthNames` come from a custom calendar; custom month lengths are not consulted here. Only 12 month names are accepted (`length === 12` check), otherwise Gregorian names are used.

---

## ProjectContainer.vue

**Purpose** — The project list on the start screen: one row per timeline (color dot + title, click to open) with an expanding per-row action group (Edit / Export / Duplicate / Delete) behind a 3-dot toggle, plus all four action modals.

| Contract | Details |
|---|---|
| Props | `timelines: TimelineProject[] \| null` |
| Emits | `refresh: []` (after delete / duplicate / edit-save) |
| Slots / Expose | *(none)* |

**Key behaviour**

- Row click → `BackendAPI.OpenTimeline(id)` (opens the timeline WinForms window). Action buttons use `@click.stop` so they don't open the timeline.
- One menu open at a time (`openMenuId`); opening a modal closes the menu. The action group animates width (34 px → 175 px) with staggered opacity/translate on the hidden buttons.
- Owns the modal lifecycle for `ConfirmDeleteModal`, `DuplicateTimelineModal`, `ExportTimelineModal`, `EditTimelineModal` (one `*Target` ref each; only one can be truthy at a time in practice) and performs the corresponding `BackendAPI` calls (`DeleteTimeline`, `DuplicateTimeline`, `ExportTimeline`).

**Used by** — `App.vue`.

**Gotchas** — export does **not** emit `refresh` (nothing changed); the other three do. `openMenuId` is typed `number` because timeline Ids are numeric. The component imports a Google Font (`Gelasio`) via CSS `@import` — requires network on first load.

---

## RelativeRuleEditor.vue

**Purpose** — Structured editor for a memorable-day `RelativeRule`: pick a base (a period like year/month, or an anchor like a season boundary / another memorable day), day offset, optional "find next weekday" search with ordinal, and a duration span — with a live natural-language preview.

| Contract | Details |
|---|---|
| Props | `modelValue: RelativeRule`, `seasons: { name; start; end }[]`, `hasSeasons: boolean`, `months: { name; length }[]`, `hasWeekDef: boolean`, `weekLength: number`, `dayLabels?: string[]`, `weekendDays?: number[]`, `otherMemDays: { id; name }[]` |
| Emits | `update:modelValue: [RelativeRule]` (v-model; always a fresh merged object via `patch()`) |
| Slots / Expose | *(none)* |

**Key behaviour**

- `patch(changes)` spreads `{ ...modelValue, ...changes }` — the rule object is immutable from the editor's perspective.
- Switching base type actively **clears the fields of the other branch** (e.g. choosing `period` unsets `anchorType/anchorIndex/anchorId`), keeping the serialized rule minimal. Anchor default is `season-start` when seasons exist, else `memorable-day`.
- Weekday search toggle seeds `weekdays: [0], ordinal: 1` when enabled and clears both when disabled; the weekday chips are a nested `WeekDayPicker`. Ordinal options are 1st–5th and `-1` = Last.
- Preview computed by `describeRule()` (`@/utils/relativeRule`) with a name context built from props.
- `periodMonth` select value `''` maps to `null` = "Every month".

**Used by** — `pages/CalendarApp.vue` (memorable day type "relative"); `WeekDayPicker` internally.

**Gotchas** — the "memorable-day" anchor option is disabled when `otherMemDays` is empty (prevents self-referencing rules with no target); span is clamped to `>= 1`.

---

## SelectCalendarModal.vue

**Purpose** — Prompts the user to pick a calendar for a timeline that has none (or skip), with refresh and "+ Create New" (opens the native calendar editor window).

| Contract | Details |
|---|---|
| Props | *(none)* |
| Emits | `selected: [string]` (calendar Id), `skipped: []` |
| Slots / Expose | *(none)* |

**Key behaviour** — loads the calendar list on mount; the refresh button re-fetches and **auto-selects a newly appeared calendar** (diff against previous Id set — same pattern as EditTimelineModal, but manual rather than focus-triggered). Select is disabled until something is chosen.

**Used by** — `App.vue`; tested in `SelectCalendarModal.test.ts`.

---

## SplashTitle.vue

**Purpose** — The animated "Story Timeline" heading on the start screen: a 5-stop gradient clipped to the text, cycling positions over 12 s.

| Contract | Details |
|---|---|
| Props / Emits / Slots / Expose | *(none — template + CSS only, no script block)* |

**Used by** — `App.vue`.

**Gotchas** — imports the `Cinzel` Google Font via CSS `@import` (network dependency); text uses `-webkit-background-clip: text` with transparent fill.

---

## TimelineActionsMenu.vue

**Purpose** — The "⋮" actions popover anchored to the activity strip: manages **hidden time ranges** (list / add / delete) and **Shift All Items** (move every item by ±N years).

| Contract | Details |
|---|---|
| Props | *(none — reads `useTimelineStore()` directly)* |
| Emits | `shiftComplete: [delta: number]` |
| Slots | *(none)* |
| Expose | `openMenu()` — allows the parent to open the popover programmatically |

**Key behaviour**

- **Popover positioning** — plain CSS: `position: absolute; top: 0; left: calc(100% + 4px)` relative to the trigger's wrapper, i.e. it flies out to the *right* of the 48 px activity strip. Fixed width 340 px, z-index 600. No flipping/clamping logic — it assumes room to the right.
- **Dismissal** — a document-level `mousedown` listener closes the popover when the click target is outside `rootEl`; Escape also closes. Listeners are registered on mount and removed on unmount.
- **Hidden ranges** — seeds local state from `store.hiddenRanges`; add validates (both years present, end > start) then `BackendAPI.SaveHiddenRange(timelineId, start, end, label|null)`, inserts sorted by `StartYear`, and pushes the new list into the store (`store.setHiddenRanges`) so the canvas re-renders. Delete mirrors this via `BackendAPI.DeleteHiddenRange`.
- **Shift** — `BackendAPI.ShiftTimelineItems(timelineId, delta)`; success shows "Shifted N items by ±delta years." and emits `shiftComplete` so the parent can reload items.

**Used by** — `pages/TimelineApp.vue`, slotted into `TimelineActivityStrip`'s `actions` slot.

**Gotchas** — local `hiddenRanges` is a snapshot copied at setup; it stays in sync only because this component is the sole writer while open. The shift button is disabled for `0`/empty via `!shiftDelta` (which also disables for `NaN`).

---

## TimelineActivityStrip.vue

**Purpose** — The 48 px vertical VS Code-style navigation strip on the left edge of the timeline window: actions slot (3-dot menu), filter toggle, nav icons (Timeline active; Characters/Map/Search/Statistics ghosted "coming soon"), and a settings gear pinned to the bottom.

| Contract | Details |
|---|---|
| Props | `filterActive: boolean` (green "tool active" styling on the funnel) |
| Emits | `toggle-filter: []`, `open-settings: []` |
| Slots | `actions` — rendered at the very top (TimelineApp puts `TimelineActionsMenu` here) |
| Expose | *(none)* |

**Key behaviour** — `navItems` is a static local array; unavailable items get `pointer-events: none`, reduced opacity, and `tabindex="-1"`. Active/tool-active states are shown by a 2 px left border + gradient background (indigo for section, green for filter). Filter icon weight switches to `fill` when active.

**Used by** — `pages/TimelineApp.vue`.

**Gotchas** — nav icons other than Timeline do nothing by design; the strip renders no routing logic at all.

---

## TimelineCanvas.vue

**Purpose** — The heart of the app: a Konva-based infinite horizontal timeline canvas. Renders tick grid + labels, item nodes (events, periods, ages, pictures, notes dots, bookmarks, boundary markers), hidden-range break strips, the NOW line, a snapping cursor line, tooltips, and rich context menus. Handles panning, tick-stepped wheel navigation, LOD zoom animation, boundary clamping, dimming for filters, and item CRUD initiated from the canvas.

### Contract

| Contract | Details |
|---|---|
| Props | `timelineItems: TimelineItem[] \| null` (the visible/filtered set), `dimmableItems?: TimelineItem[]`, `timelineSettings: TimelineSettings \| null`, `layoutSettings: LayoutSettings \| null`, `timelineInfo: TimelineProject` |
| Emits | `itemClick: [itemId: string]` (context-menu **Edit**), `viewItem: [itemId: string]` (left-click on an item), `addItem: [typeId: number, absoluteTime: number, lodIndex: number]` (context-menu add) |
| Slots | *(none)* |
| Expose | `animateJumpToYear(targetYear, durationMs = 600)`, `jumpToYear(targetYear)`, `updateStageSize()`, `refreshItems()`, plus raw `gridLayer` and `uiLayer` Konva layers |

### Konva layer structure

Created at module scope and stacked at mount time:

```
Stage (fills containerRef)
 ├─ uiLayer               NOW line + labels, center axis, data-range band (RenderUiLayer)
 ├─ gridLayer             ticks + tick labels, break strips, expanded-range stripes, note dots
 ├─ cursorLayer           snapping cursor line + year/fraction labels
 ├─ itemLayer             stemsMaster (Konva.Group) + boxesMaster (Konva.Group) + bookmark groups
 ├─ boundaryOverlayLayer  start/end boundary lines + clickable flags (always above items)
 └─ tooltipLayer          single Konva.Label tooltip (topmost)
```

The order of `gridLayer` / `cursorLayer` / `itemLayer` **flips** based on `layoutSettings.TimelineTickMarkerTextAlwaysOnTop`: when true the grid is added *after* items so tick labels draw on top. Stems and boxes live in two master groups so all stems render beneath all boxes regardless of item order.

### Viewport model and coordinate math

- `viewport` (reactive): `width`, `height`, `centerTime` (absolute time at the horizontal center = the NOW line), and `lodStepFraction` (the physical step used by the math, decoupled from the store so it can be animated).
- All time↔pixel conversion goes through `getXFromTime` / `getTimeFromX` / `absoluteToVisual` / `visualToAbsolute` from `utils/timelineLayout`, which fold **hidden ranges** into a "visual time" axis where each active hidden range collapses to a fixed `BREAK_TICKS`-wide strip.
- Boundary items (TypeId 8 = start, 9 = end) define `getBoundaries()`; `clampToBoundaries()` constrains `centerTime` on drag, wheel, jump, and initial mount.

### How items become nodes (render/update cycle)

`renderWithDimming(ls)` is the top-level item pass. It reads visible items from `props.timelineItems ?? store.items` and dimmed items **directly from `store.dimmableItems`** (deliberately not from props, to dodge a Vue flush race — see gotchas), concatenates them, and calls `renderItems(items, ls, dimmedIdSet?)`:

1. Items are sorted by absolute start, then per item:
   - Skipped if the current LOD bit is not set in `LodVisibilityMask` (`mask & (1 << lodIndex)`).
   - Hidden (cached node `visible(false)`) if fully inside an active hidden range or entirely outside the boundaries.
   - Culled if outside the viewport ± 400 px buffer (for ranges, both ends checked).
   - Boundary items (8/9) are skipped here — they render in `boundaryOverlayLayer` inside `renderGrid`.
2. **Bookmarks (TypeId 6)** get a bespoke node: full-height dashed `Konva.Line` + center `Konva.Circle`, cached in `bookmarkNodeCache`, with hover thickening. Node ids are `bookmark-<itemId>`.
3. Everything else goes through `buildNode(id, typeName, title, color, stemsMaster, boxesMaster, ls)` from `utils/timelineNodes`, cached in `nodeCache` keyed by item id. Built once, then only repositioned via `updateAbsolutePositions(...)` on subsequent frames — this cache is the core performance strategy. Ages/Periods/Pictures also get an on-build hover tooltip; Pictures kick off `loadPictureImage()` (fetches the item's first picture via `GetItemForEdit(timelineId, itemId, 4)`, loads it through `Konva.Image.fromURL` for correct WebView2 URL resolution, caches the `HTMLImageElement` in `pictureImageCache`, and sets it on the cached box).
4. **Vertical lane assignment**: Ages sit centered on the axis; everything else calls `getAssignedLane(...)` (from `timelineLayout`) with a `lockedLanes: Map<string, LaneLock>` collision cache. `ItemIndex` parity decides above/below the axis (assigned on mount: periods and events get separate 1-based counters). `lockedLanes` is cleared whenever geometry-affecting state changes (LOD, resize, filters, hidden ranges, deletes) so lanes re-pack.
5. Dimmed items get `opacity 0.25` and `listening(false)` (hover/click disabled); nodes not touched this pass are hidden, and `store.setVisibleItems(count)` is updated. `itemLayer.batchDraw()` finishes the frame.

`renderGrid(gridLayer, ls)` rebuilds the grid from scratch each call (`destroyChildren`): tick loop bounds are computed in **visual** time so iteration count stays ~`viewport.width / tickDistance` no matter how huge a hidden range is; each visual tick is converted back to absolute, snapped to the step grid, deduplicated, and skipped if inside a hidden range or break strip. Labels use `store.activeFormatRegistry[currentLod.formatKey]`. It then draws collapsed break strips (dark rect + edge lines + label + "↔" expand button), expanded ranges (striped overlay + "⟨ collapse ⟩" button; toggled ids live in `expandedRangeIds`), note dots from `store.notes`, and finally the boundary overlays (green Start / red End full-height lines with clickable flag rects whose Konva ids are `boundary-<itemId>`; the flag x-positions are also mirrored into `boundaryStartPx`/`boundaryEndPx` refs that drive **CSS `backdrop-filter: blur` overlay divs** for the out-of-bounds areas).

### Pan / zoom handling

- **Pan (drag)**: `mousedown` arms dragging; movement beyond a 5 px threshold sets `hasDragged` (which suppresses the click that follows). Each frame converts `deltaX` px → visual time → new clamped `centerTime`. Rendering uses a **drift optimization**: instead of re-rendering per frame, `gridLayer`/`itemLayer`/`boundaryOverlayLayer` are simply translated by `panDrift` px; only when `|panDrift| > 300` (`DRIFT_THRESHOLD`) does a full `renderGrid` + `renderWithDimming` happen (which resets layer x to 0). The grid pre-renders `GRID_EXTRA_PX = 500` px beyond each edge so the buffer never runs dry between re-renders.
- **Wheel**: not smooth-scroll — it *steps* the center to the nearest next/previous tick (`findNearestTick`), skipping over hidden ranges (`skipHiddenRange` lands on the first tick strictly outside). Shift+wheel steps whole years when the LOD step is sub-year. Horizontal wheel (`deltaX`) also steps.
- **Zoom (LOD)**: not handled by the canvas input at all — the parent changes `store.currentLodIndex`, and a watcher animates `viewport.lodStepFraction` from the old step to the new step over `TimelineLodChangeAnimationLength` ms with cubic ease-out, re-rendering grid+items **and clearing `lockedLanes` every animation frame** so boxes dynamically dodge each other as spacing compresses/expands. With animation disabled it snaps and re-renders items after a 100 ms timeout.
- **Programmatic**: `jumpToYear` (instant) and `animateJumpToYear` (eased) are exposed; the parent uses them for minimap clicks and year-jump UI.

### Cursor, hit detection, and context menus

- **Cursor marker**: on mousemove (when not dragging) a red vertical line snaps to the nearest LOD tick (`Math.round(rawTime / step) * step`); holding **Shift disables snapping** and shows the raw year plus an italic fractional suffix (measured with an offscreen 2D canvas so the fraction sits exactly after the year text). The line occupies only the half (top/bottom) the mouse is in; the label flips left of the line when it wouldn't fit on the right. A watcher re-runs the cursor when `centerTime`/`lodStepFraction` change without mouse movement.
- **Hit detection** is done by Konva node **id prefix**, not hit shapes: `box-`, `label-`, `stem-`, `bookmark-` map back to an item id (`targetId.split('-').slice(1).join('-')` — ids are UUIDs containing dashes), `boundary-` maps to a boundary item.
- **Left click**: item → `emit('viewItem', id)` (read-only modal); boundary flag → opens the remove menu; clicks after a real drag are swallowed via `hasDragged`.
- **Context menu** (`contextmenu` on stage): a reactive `contextMenu` object with `type: 'addItems' | 'item' | 'boundary'`, positioned at the pointer but clamped to the window (`positionMenu(clientX, clientY, menuW, menuH)`), rendered via `<Teleport to="body">` above a full-screen invisible backdrop that closes it. Menu contents:
  - *Empty canvas* (`addItems`): Event / Period / Age / Picture / Note (each emits `addItem` with the snapped — or Shift-unsnapped — absolute time and current LOD), Distance From/To setters, and a CSS-hover **"Special" flyout submenu** (`.has-submenu:hover .submenu { display:flex }`, opening to the right) with Bookmark, Timeline Start, Timeline End (start/end disabled when they already exist).
  - *Item*: Edit (emits `itemClick`), Distance From/To (uses the item's absolute start/end), "Calculate Distance" (both at once, only for Periods/Ages), Delete.
  - *Boundary*: Remove marker.
- Distance setters write to `store.setDistanceFrom/To` and switch the notes panel to the distance tab (`store.setNotesDistanceTab('distance')`).

### Canvas-initiated mutations

`addBookmark`, `addBoundaryItem(8|9)` construct full `TimelineItem` objects (with `crypto.randomUUID()`, current LOD as `CreationGranularity`) and persist via `BackendAPI.SaveItem`, then `store.addItem` + re-render. `deleteItem` first snapshots the item **with all relations** via `GetItemForEdit` into `store.setLastDeleted` (undo support), then `BackendAPI.DeleteItem` + `store.removeItem` + cache cleanup. `removeBoundaryItem` also re-clamps the viewport.

### Watchers (what triggers re-renders)

| Watched | Reaction |
|---|---|
| `props.layoutSettings` | Nuclear: clear all caches (nodes, bookmarks, picture-loading, lanes, master groups) and rebuild grid + UI + items |
| `store.items` (first load) | Clamp viewport to boundaries if needed |
| `props.timelineItems`, `store.filterDisplayMode`, `store.dimmableItems` | Clear lanes, re-render items |
| `store.hiddenRanges` (deep) | Clear lanes, re-render grid + items |
| `store.currentLodIndex` | Animated / instant LOD transition (above) |
| `store.items.length` growth | Re-render items (undo-delete path) |
| `viewport.centerTime` / `lodStepFraction` | Refresh cursor marker under a stationary mouse |

Also: an FPS tracker samples every 20 ms and pushes a 100-sample average to `store.setFpsDisplay`; `updateCurrentYearInStore` mirrors `centerTime` → `store.centerAbsoluteTime` and floors it into `store.nowYear` (cached to avoid redundant store writes). Cleanup on unmount removes key listeners, clears the FPS interval, destroys the stage and all caches.

**Used by** — `pages/TimelineApp.vue` only (with `ref="timelineCanvasRef"` for the exposed jump/refresh/resize API).

**Gotchas**

- TimelineApp binds `:dimmed-items="store.dimmableItems"` but the declared prop is `dimmableItems` — the prop binding never matches, which is *why* `renderWithDimming` reads dimmed items straight from the store (the inline comment frames this as a flush-race workaround; effectively the store is the real channel and the prop is dead).
- `props.timelineSettings` is declared but never read inside the component.
- There is **no ResizeObserver** — the parent must call the exposed `updateStageSize()` on pane resize (TimelineApp does this from the splitpane resize event).
- Escape/keyboard handlers for Shift are window-level; window `mouseup` ends drags even outside the canvas.
- `renderGrid` resets `panDrift` and layer x to 0 — any code path that renders the grid mid-drag silently re-bases the drift optimization.
- `jumpToYear` calls `parseInt(targetYear)` on a number (works via coercion, but fractional targets floor through `Math.floor(parseInt(...))` for the store year only; `centerTime` keeps the fraction).
- The mount-time `ItemIndex` assignment mutates `props.timelineItems` in place (parity → above/below axis), so lane sides are stable per session but re-derived each mount.

---

## TimelineDataPanel.vue

**Purpose** — The reading pane ("what's under the NOW line"): renders in-range items as a document — Ages as H1 headers, Periods as H2 sub-headers, other items as cards with description/content and an optional circular thumbnail that opens a lightbox. Fully theme-able via LayoutSettings CSS variables.

| Contract | Details |
|---|---|
| Props | `layoutSettings: LayoutSettings \| null` |
| Emits | *(none)* |
| Slots / Expose | *(none)* |

**Key behaviour**

- "In range" = item intersects the data-range band around `store.centerAbsoluteTime` (see conventions above); source is `store.filteredItems`, so the panel respects active filters.
- Three sorted groups: Ages (TypeId 3), Periods (2), Others (everything except 2/3/6/8/9), each ordered by `Importance` desc, then distance from center asc.
- **Picture fetch is debounced 300 ms** after the in-range set changes (drag protection). Cache semantics: `Map<itemId, string | null>` where a temporary `undefined as any` sentinel marks "fetch in flight", `null` means "no picture". Fetches use `GetItemForEdit` and take the first picture.
- Theming: 8 CSS custom properties (`--dp-bg`, `--dp-card`, `--dp-h1..h4`, `--dp-ff`, `--dp-fs`) fed from `DataPanel*` LayoutSettings with warm parchment defaults.

**Used by** — `pages/TimelineApp.vue` (right pane of the top splitpane).

**Gotchas** — the picture cache never invalidates during a session; newly attached images won't appear until reload. Each visible item costs one `GetItemForEdit` round-trip on first sight.

---

## TimelineFilterPanel.vue

**Purpose** — The horizontal filter chip bar under the header: every filter rule is a chip whose state cycles neutral → positive → negative on click, plus an AND/OR combinator toggle, "Clear", and a preset save/load dropdown.

| Contract | Details |
|---|---|
| Props | *(none — store-driven)* |
| Emits | `openSetup: []` (gear → open TimelineFilterSetupModal) |
| Slots / Expose | *(none)* |

**Key behaviour**

- Chip anatomy: `chip-body` (click = cycle state via `store.setFilterRuleState`) and a separate `chip-remove` X (only on non-neutral chips, resets to neutral) so deactivating never accidentally cycles. Negative chips get a line-through label; color-dimension chips render their parsed hex swatch (`ParamsJson.hex`, `#888888` fallback).
- AND/OR toggle only renders when **more than one positive** rule exists (`store.setFilterAndMode`).
- Presets: dropdown is plain `position: absolute` under the save icon (`top: calc(100% + 4px); right: 0`, z-index 100); save → `store.saveFilterPreset(name)`, load → `store.loadFilterPreset(id)`, delete → `store.deleteFilterPreset(id)`. Presets are loaded on mount.

**Used by** — `pages/TimelineApp.vue` (shown when `store.filterPanelOpen`).

**Gotchas** — the preset dropdown has no outside-click handler; it closes only via save/load/Escape-in-input or re-clicking the disk icon. Filtering itself happens in the store (`filteredItems` / `dimmableItems`), not here.

---

## TimelineFilterSetupModal.vue

**Purpose** — Rule authoring UI for the filter system: shows current rules (with delete) and a grid of "add" blocks — one per dimension: item type, tag, character, story, keyword, importance, time/year, boolean flags, LOD visibility, and color-with-tolerance (including a palette harvested from item colors).

| Contract | Details |
|---|---|
| Props | *(none)* |
| Emits | `close: []` |
| Slots / Expose | *(none; teleports to `body`)* |

**Key behaviour**

- Each add-block builds a `FilterRule` `{ Id: 'fr_' + 12-char uuid fragment, TimelineId, Dimension, ParamsJson, Label, State: 'neutral', SortOrder: rules.length }` and persists it via `store.upsertFilterRule` — **new rules start neutral** (no immediate filtering effect).
- Pickers are populated from the store: `usedTypeIds` (only types that actually occur in items), `allTimelineTags`, `allTimelineCharacters` (chips tinted with character color), `allTimelineStories` (block hidden when empty), `lodProfile`, `allTimelineColors` (palette swatches).
- Param shapes per dimension: `{typeId}`, `{tagId}`, `{characterId}`, `{storyId}`, `{query}`, `{op,value}`, `{op,year,year2?}` (op `between` adds the second field), `{field}` (has_picture / has_tags / show_in_notes), `{lodIndex}`, `{hex,tolerance}`.

**Used by** — `pages/TimelineApp.vue` (opened from TimelineFilterPanel's gear).

**Gotchas** — labels are baked at creation time (e.g. `Tag: Villains`); renaming a tag later leaves stale chip labels. `SortOrder` is just `rules.length`, so deleting mid-list creates duplicates (harmless — order only).

---

## TimelineGalleryPanel.vue

**Purpose** — Image strip for the current view: collects all pictures attached to in-range items and shows them as a thumbnail grid or an interactive "cascade" card stack, with a lightbox.

| Contract | Details |
|---|---|
| Props | `layoutSettings: LayoutSettings \| null` |
| Emits | *(none)* |
| Slots / Expose | *(none)* |

**Key behaviour**

- In-range logic identical to TimelineDataPanel (data-range band), applied to `store.items` (not `filteredItems`), excluding bookmarks/boundaries (6/8/9).
- On in-range change (debounced 300 ms) fetches every item's pictures via `GetItemForEdit` sequentially and flattens to `{ url, title, itemTitle }` entries; resets `cascadeIndex`.
- **Cascade mode**: `cascadeOrder` rotates indices so the current card is *last in DOM* (top of stack); back cards are offset 6 px/4 px per depth with decreasing opacity; clicking the front card opens the lightbox, "Next ›" advances circularly.

**Used by** — `pages/TimelineApp.vue` (left pane of the top splitpane).

**Gotchas** — unlike the data panel there is **no cache**: every in-range change re-fetches all pictures for all in-range items. It also ignores filters (reads `store.items`).

---

## TimelineItemViewModal.vue

**Purpose** — Read-only item detail modal (opened by left-clicking an item on the canvas): type badge, color strip, dates, description, notes, tags, characters (with role + color dot), story refs, chapter refs, and image thumbnails.

| Contract | Details |
|---|---|
| Props | `itemId: string`, `timelineId: number` |
| Emits | `close: []` |
| Slots / Expose | *(none; teleports to `body`, z-index 9000)* |

**Key behaviour** — single `GetItemForEdit(timelineId, itemId)` fetch on mount fills everything; the item's `Color` is injected as `--item-color` for the left strip. `TYPE_NAMES` maps all nine TypeIds. Sections render conditionally on content.

**Used by** — `pages/TimelineApp.vue` (`viewItemId` state, fed by TimelineCanvas's `viewItem` emit); tested in `TimelineItemViewModal.test.ts`.

**Gotchas** — the modal fetches fresh data every open (no cache); date display is year-granular only (`Year`–`EndYear`), ignoring subtick precision.

---

## TimelineMinimap.vue

**Purpose** — The overview bar at the bottom of the timeline window: its own small Konva stage drawing a density histogram, the timeline axis, ages, lane-packed periods, event stems, hoverable/clickable bookmarks, boundary arrows, the NOW line, and the current viewport window. Clicking a bookmark jumps the main canvas.

| Contract | Details |
|---|---|
| Props | *(none — store-driven)* |
| Emits | `jumpToYear: [year: number]` (bookmark click; payload is the bookmark's `AbsoluteStart`) |
| Slots / Expose | *(none)* |

**Key behaviour**

- Two layers (`layer`, `tooltipLayer`), both fully rebuilt (`destroyChildren`) on every `render()` — a full immediate-mode redraw, unlike the main canvas's node cache.
- Range = boundary markers if present, else min/max of item extents; `buildToX` maps absolute time → pixels with 36 px margins.
- Draw order: 80-bucket density histogram (excludes bookmarks) → axis line → ages straddling the line → periods stacked below via greedy lane packing (first lane whose right edge ≤ new left) with a start-triangle above the line → event/picture/note/character stems+dots → bookmarks (stem + diamond + oversized invisible hit rect, hover tooltip + pointer cursor, click emits) → inward boundary arrows → red NOW line → translucent blue viewport rect (width derived from `store.viewportWidthPx`, tick distance, and LOD step).
- Active filters dim non-matching shapes to 0.22 opacity (`fo()` helper against `store.filteredItems`).
- A `ResizeObserver` resizes the stage and re-renders; a watcher re-renders on `items`, `filteredItems`, `centerAbsoluteTime`, `viewportWidthPx`, `currentLodIndex`.

**Used by** — `pages/TimelineApp.vue` (`@jump-to-year="onMinimapJump"` → the canvas's exposed jump API).

**Gotchas** — `tooltipLabel` is recreated inside every `render()` (safe because `tooltipLayer.destroyChildren()` runs first). Hidden ranges are **not** collapsed here — minimap x-positions are linear absolute time, so it can disagree spatially with the main canvas when hidden ranges exist. Background color comes from `TimelineCanvasBackgroundColor`.

---

## TimelineNotesPanel.vue

**Purpose** — Two-tab side panel: **Notes** (create/edit/view/delete free-floating notes pinned to the current center time, listing only notes in range) and **Distance** (shows the From/To measurement points set from canvas context menus, with approximate or specific-breakdown formatting). Theme-able via `NotesPanel*` LayoutSettings.

| Contract | Details |
|---|---|
| Props | `layoutSettings: LayoutSettings \| null` |
| Emits | *(none)* |
| Slots / Expose | *(none)* |

**Key behaviour**

- The active tab lives **in the store** (`store.notesDistanceTab`) so the canvas context menu can switch to the Distance tab remotely when a From/To point is set.
- Notes: `addNote` creates `{ Id: uuid, NoteContents, TimelineId, NearestYear: floor(center), AbsoluteTime: center, ... }` via `BackendAPI.SaveNote`, then `store.addNote` (with the backend-returned id). Ctrl+Enter submits. Edit is inline (textarea swap); view opens a teleported mini-modal. In-range filter uses the data-range band.
- Distance: `formatPoint` renders `year + sub-label` using the current LOD's formatter from the static `FormatRegistry`; `distanceText` is either **approximate** (single unit chosen by the current LOD format key — millennia…days) or **specific** (a years/months/weeks/days breakdown using 12 months, 4.33 weeks/month, 7 days/week approximations) toggled by a checkbox. Clear buttons null the store values.

**Used by** — `pages/TimelineApp.vue` (middle pane of the top splitpane); tested in `TimelineNotesPanel.test.ts`.

**Gotchas** — the "specific" breakdown assumes Gregorian-ish ratios regardless of custom calendar; days are suppressed whenever months > 0. `formatYear` shows fractional times as `1995 .25`-style suffixes.

---

## TimelineSettingsModal.vue

**Purpose** — The big per-timeline settings dialog: general settings (font, scales, guides, filtered-item display mode), layout preset selection/creation/reset, and every `LayoutSettings` knob grouped into sections (Event Boxes, Periods & Ages, Timeline, Tick Markers, Now Line, Hover Line, Data Range, Notes Panel, Data Panel, Animations, Window) — with a live search that highlights and scrolls to matching labels.

| Contract | Details |
|---|---|
| Props | `settings?: TimelineSettings`, `layoutSettings?: LayoutSettings` |
| Emits | `close: []` |
| Slots / Expose | *(none)* |

**Key behaviour**

- Two reactive mirrors: `local` (per-timeline `TimelineSettings` + `selectedLayoutId`) and `localLayout` (a fully defaulted `LayoutSettings` built by `initLayout()`, which supplies a hard-coded default for **every** field — this doubles as the canonical default table).
- On mount loads layout presets + system fonts in parallel (`GetLayoutSettingsList`, `GetSystemFonts` → fed to `FontPicker`s). Escape closes (window keydown listener).
- Switching preset (`selectedLayoutId` watcher) fetches that preset's values via `GetLayoutSettingsById` and `Object.assign`s them into `localLayout`. "New preset" clones the current one via `CreateLayoutPreset(name, sourceId)` and auto-selects it. Built-in presets (`ls_default`, `ls_dark`) show a "Reset to defaults" button → `ResetLayoutPreset` (errors are alert()-ed with details).
- **Search**: a watcher on `searchQuery` does direct DOM classwork — removes all `.search-hl`, then adds it to `.section-title` and `.s-label` elements whose text matches, and smooth-scrolls the first match into view. No virtualization; purely cosmetic.
- **Data-range color + alpha**: `TimelineDataRangeColor` supports `#RGBA`/`#RRGGBBAA`; `parseHexAlpha`/`buildHexAlpha` split it into an RGB color input + a 0–100% opacity slider that recombine via a watcher.
- **Save** runs `SaveSettings` (per-timeline) and `SaveLayoutSettings(localLayout)` in parallel; on double success it writes the values back into `store.settings`, sets `store.setLayoutSettings(...)` (which triggers the canvas's nuclear layout watcher), and closes. Filter display mode radios write to the store immediately (not part of Save).

**Used by** — `pages/TimelineApp.vue`; tested in `TimelineSettingsModal.test.ts`.

**Gotchas** — `localLayout.Id` is overwritten with `selectedLayoutId` at save time, so edits are always saved onto the currently selected preset. The filtered-items radio takes effect instantly and is *not* rolled back on Cancel. The search highlight manipulates DOM classes outside Vue's render model (safe because those nodes are static).

---

## WeekDayPicker.vue

**Purpose** — Multi-select chip row of week-day indices (0-based) sized by `weekLength`, used for weekly memorable days and relative-rule weekday searches.

| Contract | Details |
|---|---|
| Props | `modelValue: number[]`, `weekLength: number`, `dayLabels?: string[]` |
| Emits | `update:modelValue: [number[]]` (always a new sorted array) |
| Slots / Expose | *(none)* |

**Key behaviour** — toggle adds/removes the index and emits a sorted copy (never mutates the prop). Labels fall back to `D1…Dn`. `weekLength === 0` renders an italic "No week defined" note.

**Used by** — `RelativeRuleEditor.vue`, `pages/CalendarApp.vue`; tested in `WeekDayPicker.test.ts`.

---

## WindowTitleBar.vue

**Purpose** — Custom chrome for the borderless WinForms windows: draggable region with animated brand orb, title + subtitle, and native minimize / maximize-restore / close buttons wired through the bridge.

| Contract | Details |
|---|---|
| Props | `title?: string` (default "Story Timeline"), `subtitle?: string`, `showMaximize?: boolean` (default `true`) |
| Emits | *(none — all actions go straight to `BackendAPI`)* |
| Slots / Expose | *(none)* |

**Key behaviour**

- Buttons call `BackendAPI.WindowMinimize()` / `WindowMaximizeRestore()` / `WindowClose()`. Double-click on the drag region also toggles maximize.
- **Native drag**: `mousedown.left` on the drag region calls `BackendAPI.WindowStartDrag()`; the C# side does `ReleaseCapture` + `SendMessage(WM_NCLBUTTONDOWN, HTCAPTION)` so Windows' native move loop handles the drag with zero lag (WebView2 intercepts `WM_NCHITTEST`, hence this workaround).
- The bar is exactly **36 px tall and must match `BorderlessFormBase.TitleBarHeight`** on the C# side (noted in a style comment).

**Used by** — `pages/TimelineApp.vue`, `pages/EditItem.vue`, `pages/CalendarApp.vue`.

**Gotchas** — `isMaximized` is purely local optimistic state (toggled before the native call); if the window is maximized by other means the restore icon can desync.

---

## Component usage map (quick reference)

| Component | Consumers |
|---|---|
| AppSettingsModal | App.vue |
| AuthorReminderModal | App.vue |
| CalendarDayPicker | pages/CalendarApp.vue |
| CalendarManagerModal | App.vue |
| CalendarMonthGrid | CalendarYearView |
| CalendarViewModal | CalendarManagerModal |
| CalendarYearView | CalendarViewModal |
| ConfirmDeleteModal | ProjectContainer |
| DuplicateTimelineModal | ProjectContainer |
| EditTimelineModal | ProjectContainer |
| ExportTimelineModal | ProjectContainer |
| FontPicker | TimelineSettingsModal |
| ImagePickerModal | pages/EditItem.vue |
| LodDateInput | pages/EditItem.vue |
| ProjectContainer | App.vue |
| RelativeRuleEditor | pages/CalendarApp.vue |
| SelectCalendarModal | App.vue |
| SplashTitle | App.vue |
| TimelineActionsMenu | pages/TimelineApp.vue (in TimelineActivityStrip `actions` slot) |
| TimelineActivityStrip | pages/TimelineApp.vue |
| TimelineCanvas | pages/TimelineApp.vue |
| TimelineDataPanel | pages/TimelineApp.vue |
| TimelineFilterPanel | pages/TimelineApp.vue |
| TimelineFilterSetupModal | pages/TimelineApp.vue |
| TimelineGalleryPanel | pages/TimelineApp.vue |
| TimelineItemViewModal | pages/TimelineApp.vue |
| TimelineMinimap | pages/TimelineApp.vue |
| TimelineNotesPanel | pages/TimelineApp.vue |
| TimelineSettingsModal | pages/TimelineApp.vue |
| WeekDayPicker | RelativeRuleEditor, pages/CalendarApp.vue |
| WindowTitleBar | pages/TimelineApp.vue, pages/EditItem.vue, pages/CalendarApp.vue |

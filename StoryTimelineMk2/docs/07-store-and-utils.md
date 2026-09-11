# 07 — Store and Core Utilities

This chapter documents the frontend "core": the central Pinia store, the shared type
definitions, and the pure-logic utility modules that power the timeline canvas.

Files covered (all under `Frontend/src/`):

| File | Role |
|------|------|
| `stores/timelineStore.ts` | Central Pinia store — all shared timeline state |
| `types/models.ts` | TypeScript interfaces mirroring the C# domain classes |
| `utils/timelineLayout.ts` | Pure math: time↔pixel mapping, hidden-range collapsing, lane packing, date-format registry |
| `utils/timelineNodes.ts` | Konva node builders + positioning for timeline items |
| `utils/filterMatcher.ts` | Filter rule evaluation engine |
| `utils/relativeRule.ts` | Relative-date rule model for "memorable days" |
| `calendar.ts` | Vite entry point for the Calendar editor window |

---

## 1. `stores/timelineStore.ts` — the Pinia store

Defined with the *setup-store* syntax: `defineStore('timeline', () => { ... })`.
Everything returned from the setup function is public; `refs` become state,
`computed`s become getters, functions become actions.

One private module-level interface exists:

```ts
interface LastDeletedState {
    item: TimelineItem;
    tagNames: string[];
    characterAppearances: { CharacterId: string; Role: string | null }[];
    storyRefs: string[];
    chapterRefs: string[];
}
```

It is the snapshot kept for the 30-second "undo delete" window.

### 1.1 State — Projects & current timeline

| Field | Type | Purpose |
|-------|------|---------|
| `projects` | `TimelineProject[]` | All timelines, shown in the project list (index.html) |
| `currentProject` | `TimelineProject` | The fully loaded project currently open |
| `title` | `string` | Title of the current project (initial `'Loading...'`) |
| `author` | `string` | Author of the current project (initial `'Loading...'`) |
| `settings` | `TimelineSettings \| undefined` | Per-timeline settings (fonts, window geometry, canvas settings) |
| `layoutSettings` | `LayoutSettings \| undefined` | Visual template used by the canvas (box/stem/tick styling) |
| `isLoading` | `boolean` | `true` until the first `loadTimelineData` completes |

### 1.2 State — Items & viewport

| Field | Type | Purpose |
|-------|------|---------|
| `items` | `TimelineItem[]` | All items of the current timeline |
| `currentNowYear` | `number` | Integer year at the center of the screen (the NOW line) |
| `centerAbsoluteTime` | `number` | *Fractional* center position (e.g. `1495.8`) — unlike `currentNowYear`, not floored |
| `zoomLevel` | `number` | Zoom factor (default `1.0`) |
| `viewportWidthPx` | `number` | Pixel width of the main timeline canvas; consumed by the minimap |
| `fps` | `number` | Frames-per-second readout for the debug/status display |
| `visibleItems` | `number` | Count of items currently rendered, for the status display |
| `hiddenRanges` | `HiddenRange[]` | Collapsed time spans, kept sorted ascending by `StartYear` |
| `lastDeleted` | `LastDeletedState \| null` | Undo snapshot of the most recently deleted item (auto-clears after 30 s via the private `_undoTimer`) |
| `ItemTypes` | `string[]` (constant) | Type names indexed by `TypeId - 1`: `Event, Period, Age, Picture, Note, Bookmark, Character, Timeline_start, Timeline_end` |

### 1.3 State — Notes & distance panel

| Field | Type | Purpose |
|-------|------|---------|
| `notes` | `TimelineNote[]` | Timeline notes, kept sorted by `AbsoluteTime` |
| `distanceFrom` | `number \| null` | Start point of the distance-measuring tool |
| `distanceTo` | `number \| null` | End point of the distance-measuring tool |
| `notesDistanceTab` | `'notes' \| 'distance'` | Which tab is active in the notes/distance side panel |

### 1.4 State — LOD & calendar

| Field | Type | Purpose |
|-------|------|---------|
| `currentLodIndex` | `number` | Index of the active LOD level (default `3`) |
| `currentLodTitle` | `string` | `formatKey` of the active LOD level (default `'Year'`) |
| `lodProfile` | `LodLevel[]` | Parsed LOD profile of the current calendar |
| `calendar` | `Calendar \| undefined` | The current timeline's calendar (raw `YearDefinition` JSON string inside) |

### 1.5 State — Filters

| Field | Type | Purpose |
|-------|------|---------|
| `allTimelineTags` | `{ TagId: number; TagName: string }[]` | Distinct tags used in this timeline (sorted by name) |
| `allTimelineCharacters` | `CharacterItem[]` | All characters of the timeline (sorted by name) |
| `allTimelineStories` | `{ StoryId: string; StoryTitle: string }[]` | Distinct stories referenced by items (sorted by title) |
| `allTimelineColors` | `string[]` | Distinct item colors, lower-cased, truncated to `#rrggbb`, sorted |
| `itemTagMap` | `Map<string, ItemTagLink[]>` | ItemId → its tag links |
| `itemCharacterMap` | `Map<string, ItemCharacterLink[]>` | ItemId → its character links |
| `itemStoryMap` | `Map<string, ItemStoryRefLink[]>` | ItemId → its story-reference links |
| `itemPictureSet` | `Set<string>` | Ids of items that have at least one picture |
| `filterRules` | `FilterRule[]` | The rules for the current timeline |
| `filterAndMode` | `boolean` | `true` = positive rules combine with AND, `false` = OR |
| `filterDisplayMode` | `'hidden' \| 'dimmed'` | Whether filtered-out items disappear or render dimmed (global setting, timeline id `0`) |
| `filterPanelOpen` | `boolean` | Persisted open/closed state of the filter panel |
| `filterPresets` | `FilterPreset[]` | Saved global rule sets |

### 1.6 Getters (computed)

| Getter | Derivation | Purpose |
|--------|-----------|---------|
| `pastItems` | `items` where `Year < currentNowYear` | Items left of the NOW line (used by the Konva layout algorithm) |
| `futureItems` | `items` where `Year >= currentNowYear` | Items right of the NOW line |
| `_filterResults` *(private)* | `buildItemDataMap(...)` → `applyFilters(items, filterRules, filterAndMode, dataMap)` | Single evaluation of the filter engine; yields `{ visible, dimmed }` |
| `filteredItems` | `_filterResults.visible` | Items that pass the filters |
| `dimmableItems` | `_filterResults.dimmed` when `filterDisplayMode === 'dimmed'`, else `[]` | Items to render at reduced opacity |
| `calendarConfig` | Parses `calendar.YearDefinition` JSON | Produces a `CalendarFormatConfig` (`yearLength`, `weekLength`, `months[]` with cumulative `startDay`, `seasons[]`); falls back to `DEFAULT_CALENDAR_CONFIG` (Gregorian) on missing/invalid JSON |
| `activeFormatRegistry` | `buildFormatRegistry(calendarConfig)` | The date-format function table used to label ticks at each LOD |

### 1.7 Actions — data loading

| Action | Backend calls | Mutates |
|--------|--------------|---------|
| `loadTimelines()` | `BackendAPI.request("GetAllTimelines")` | `projects` |
| `loadTimelineData(id)` | `BackendAPI.LoadTimelineData(id)`, then in parallel `GetFilterRules(tlId)`, `GetMiscSetting('filter_and_mode', tlId)`, `GetMiscSetting('filter_panel_open', tlId)`, `GetMiscSetting('filter_display_mode', 0)` | Populates virtually everything: `title`, `author`, `items`, `settings`, `layoutSettings`, `currentProject`, `calendar`, `hiddenRanges` (sorted), `notes` (sorted), the three item-link maps + `itemPictureSet`, the four `allTimeline*` lists, `filterRules`, `filterAndMode`, `filterPanelOpen`, `filterDisplayMode`, `lodProfile` (parsed from `Calendar.LodProfile.Profile` JSON), `currentLodIndex`/`currentLodTitle` (reset to the level whose `formatKey` contains "year"), and finally `isLoading = false`. Errors are caught and logged (`console.error`). |
| `setProjects(newProjects)` | — | `projects` |
| `loadItems(newItems)` | — | `items` (wholesale replace) |

### 1.8 Actions — items

| Action | Backend calls | Mutates |
|--------|--------------|---------|
| `addItem(item)` | — | Pushes onto `items` |
| `upsertItem(item)` | — | Replaces by `Id` if present; else pushes and re-sorts `items` by `AbsoluteStart` |
| `removeItem(id)` | — | Filters `items` by `Id` |
| `setLastDeleted(data)` | — | Sets `lastDeleted`; (re)starts a 30 s timer that clears it |
| `clearLastDeleted()` | — | Clears `lastDeleted` and cancels the timer |

Persistence of items is *not* done here — components call the bridge (`SaveItem`, etc.)
themselves and then sync the store with `upsertItem`/`removeItem`.

### 1.9 Actions — viewport / display setters

All plain setters with no backend calls:

| Action | Mutates |
|--------|---------|
| `setNowYear(year)` | `currentNowYear` |
| `setCenterAbsoluteTime(t)` | `centerAbsoluteTime` |
| `setViewportWidth(w)` | `viewportWidthPx` |
| `setFpsDisplay(fps)` | `fps` |
| `setVisibleItems(count)` | `visibleItems` |
| `setDistanceFrom(v)` / `setDistanceTo(v)` | `distanceFrom` / `distanceTo` |
| `setNotesDistanceTab(tab)` | `notesDistanceTab` |
| `setHiddenRanges(ranges)` | `hiddenRanges` |
| `setLayoutSettings(ls)` | `layoutSettings` |

### 1.10 Actions — notes

| Action | Mutates |
|--------|---------|
| `addNote(note)` | Pushes onto `notes` and re-sorts by `AbsoluteTime` |
| `updateNote(note)` | Replaces the note with matching `Id` in place |
| `removeNote(noteId)` | Filters `notes` by `Id` |

(Backend persistence for notes is handled by the calling component.)

### 1.11 Actions — filters

| Action | Backend calls | Mutates |
|--------|--------------|---------|
| `setFilterRuleState(id, state)` | `SaveFilterRule(updated)` | Replaces the rule with new `State` |
| `upsertFilterRule(rule)` | `SaveFilterRule(rule)` | Replaces by `Id`, or appends and re-sorts by `SortOrder` |
| `deleteFilterRule(id)` | `DeleteFilterRule(id)` | Removes the rule |
| `clearAllFilters()` | `SaveFilterRule(r)` for every rule | Sets every rule's `State` to `'neutral'` (rules are kept, just deactivated) |
| `setFilterAndMode(mode)` | `SetMiscSetting('filter_and_mode', '1'/'0', timelineId)` | `filterAndMode` |
| `setFilterDisplayMode(mode)` | `SetMiscSetting('filter_display_mode', mode, 0)` — note timeline id `0`: this setting is global | `filterDisplayMode` |
| `setFilterPanelOpen(open)` | `SetMiscSetting('filter_panel_open', '1'/'0', timelineId)` | `filterPanelOpen` |
| `loadFilterPresets()` | `GetFilterPresets()` | `filterPresets` |
| `saveFilterPreset(name)` | `SaveFilterPreset(preset)` | Appends a new preset — `Id` from `crypto.randomUUID()`, `RulesJson` = current rules serialized with `TimelineId` zeroed, `AndMode` from `filterAndMode` |
| `loadFilterPreset(presetId)` | `SaveFilterRule` for each restored rule + `SetMiscSetting('filter_and_mode', …)` | Parses `RulesJson`, reassigns fresh `Id`s, retargets `TimelineId` to the current timeline, renumbers `SortOrder`; sets `filterRules` and `filterAndMode` |
| `deleteFilterPreset(id)` | `DeleteFilterPreset(id)` | Removes from `filterPresets` |

### 1.12 Actions — LOD zoom

| Action | Behavior |
|--------|----------|
| `lodZoomIn()` | Sorts `lodProfile` by `index`, steps to the *next* (finer) level, updating `currentLodIndex`/`currentLodTitle` |
| `lodZoomOut()` | Same but steps to the *previous* (coarser) level |

---

## 2. `types/models.ts` — domain interfaces

These interfaces are the JSON contract with the C# backend: property names use C#
PascalCase and match the Dapper-mapped classes in `Database/` one-to-one, so
`JSON.parse` on the bridge produces correctly typed objects with no mapping layer.

| Interface | Mirrors (C#) | Notes |
|-----------|--------------|-------|
| `TimelineProjectContainer` | — (frontend-only wrapper) | `{ data: TimelineProject[] }` — response shape of `GetAllTimelines` |
| `TimelineProject` | `Database/TimelineInfo.cs` | `Id`, `Title`, `Author`, `Description`, `StartYear`, `Color`, `CalendarId` + nested `Calendar`, `Settings`, `LayoutSettings` |
| `TimelineSettings` | `Database/SettingsItem.cs` | `Font`, `FontSizeScale`, `PixelsPerSubtick`, `CustomCss`, `UseCustomCss`, `IsFullscreen`, `ShowGuides`, window size/position (4 fields), `UseCustomScaling`, `CustomScale`, `DisplayRadius`, `CanvasSettings` |
| `CanvasSettingsObject` | JSON blob inside `SettingsItem` | `showYearMarkers`, `fontFamily`, `fontSize`, `fontStyle`, `textColor`, `textOffsetX/Y`, `letterSpacing`, `defaultSplitterDistance` (camelCase — serialized as JSON, not a Dapper row) |
| `TimelineNote` | `Database/NoteItem.cs` | `Id`, `NoteContents`, `ConnectedItemId`, `TimelineId`, `NearestYear`, `AbsoluteTime`, `UpdatedAt` |
| `HiddenRange` | `Database/HiddenRangeItem.cs` | `Id`, `TimelineId`, `StartYear`, `EndYear`, `Label` |
| `ItemTagLink` | `ItemTagLink` in `Database/FullTimelineProject.cs` | `ItemId`, `TagId`, `TagName` |
| `ItemCharacterLink` | `ItemCharacterLink` in `Database/FullTimelineProject.cs` | `ItemId`, `CharacterId`, `CharacterName`, `CharacterColor` |
| `ItemStoryRefLink` | `ItemStoryRefLink` in `Database/FullTimelineProject.cs` | `ItemId`, `StoryId`, `StoryTitle` |
| `FilterState` (type alias) | — | `'positive' \| 'negative' \| 'neutral'` |
| `FilterRule` | `Database/FilterRuleItem.cs` | `Id`, `TimelineId`, `Dimension`, `ParamsJson`, `Label`, `State`, `SortOrder` |
| `FilterPreset` | `Database/FilterPresetItem.cs` | `Id`, `Name`, `RulesJson`, `AndMode` (0/1), optional `CreatedAt` |
| `FullTimelineProject` | `Database/FullTimelineProject.cs` | The `LoadTimelineData` payload: `Project`, `Items`, `Notes`, `HiddenRanges`, `ItemTags`, `ItemCharacters`, `Characters`, `ItemStoryRefs`, `ItemsWithPictures` (string ids) |
| `Calendar` | `Database/CalendarItem.cs` | `Id`, `Name`, `ShortName`, `AlternateName`, `NameBefore0`, `NameAfter0`, `LodProfileId`, `YearDefinition` (JSON string), nested `LodProfile` |
| `MonthDef` / `WeekDef` / `SeasonDef` / `YearDefinition` | — (frontend-only) | Typed shape of the `YearDefinition` JSON string (see §6) |
| `TimelineItem` | `Database/TimelineItem.cs` | See below |
| `KonvaGroupObject` | — (frontend-only) | Pairs a `Konva.Group` with its `TimelineItem` |
| `LodProfile` | `Database/LodItem.cs` | `Id`, `Name`, `Profile` — over the bridge `Profile` arrives as a JSON *string* that is parsed into `LodLevel[]` |
| `LodLevel` | JSON element inside `LodProfile.Profile` | `index`, `formatKey` (e.g. `'YEARS'`), `stepFraction` (years per tick, e.g. `1/365` for days) |
| `CharacterItem` | `Database/CharacterItem.cs` | `Id`, `Name`, `Nicknames`, `Aliases`, `Race`, `Description`, `Color`, `Importance`, `TimelineId` |
| `Tag` | `Database/TagItem.cs` | `Id`, `Name` |
| `Story` | `Database/StoryItem.cs` | `Id`, `Title`, `Description` |
| `Book` | `Database/BookItem.cs` | `Id`, `Title`, `Author` |
| `Chapter` | `Database/ChapterItem.cs` | `Id`, `BookId`, `Number`, `Title` |
| `ItemCharacterAppearance` | `ItemRepo.ItemCharacterAppearanceRow` | `CharacterId`, `CharacterName`, `CharacterColor`, `Role` |
| `ItemChapterRef` | `ItemRepo.ItemChapterRefRow` | `ChapterId`, `ChapterNumber`, `ChapterTitle`, `BookId`, `BookTitle` |
| `ItemStoryRef` | `ItemRepo.ItemStoryRefRow` | `StoryId`, `StoryTitle` |
| `MediaItem` | `Database/MediaItem.cs` | `Id`, `FilePath`, `FileName`, `FileSize`, `FileType`, `Width`, `Height`, `Title`, `Description`, `CreatedAt` |
| `ItemForEdit` | Payload assembled in `Bridge/MessageRouter.cs` (`HandleGetItemForEdit`) | `Item`, `Tags`, `Characters`, `StoryRefs`, `ChapterRefs`, `Calendar`, `Pictures` — everything the edit window needs |
| `LayoutSettings` | `Database/LayoutSettingsItem.cs` | ~70 styling knobs, see below |

### `TimelineItem` fields

| Field | Meaning |
|-------|---------|
| `Id` | UUID string |
| `Title` / `Description` / `Content` | Text fields |
| `StoryId` | Optional owning story |
| `TypeId` | 1=Event, 2=Period, 3=Age, 4=Picture, 5=Note, 6=Bookmark, 7=Character, 8=Timeline_start, 9=Timeline_end |
| `Year` / `EndYear` | Integer temporal position (start/end) |
| `AbsoluteStart` / `AbsoluteEnd` | Pre-computed fractional year positions (e.g. `1495.5` = mid-year) — the values the canvas math actually uses |
| `BookTitle` / `Chapter` / `Page` | Legacy source-reference text fields |
| `Color` | Hex color |
| `CreationGranularity` | LOD level the item was created at |
| `TimelineId` / `ItemIndex` | Owning timeline + ordering index |
| `ShowInNotes` | Whether the item surfaces in the notes panel |
| `Importance` | 1–10 weight used by importance filters |
| `MinLodLevel` / `LodVisibilityMask` | LOD visibility controls; the mask is a bitfield (bit *n* = visible at LOD index *n*, default `255`) |

### `LayoutSettings` groups

- **Event boxes**: width/height, stem offset, border color/width/radius, padding, Y margin, text color, background, font family/size, ellipsis toggle, color strip (`…ShowColor`, `…ShowColorOnBottom`), hover highlight + color.
- **Ages & periods**: heights, corner rounding, period Y margin/offset.
- **Box types** (Character/Note/Image): render as square box vs normal event, box width, show image.
- **Canvas misc**: background color, NOW line (show/show-text/color/style), tick distance/width/`NonYearTicksSmaller`, tick-marker font settings + always-on-top, hover line (show/color/style/width), edge margin, data-range strip (width/visible/color), jump-to-year and LOD-change animation toggles + durations, tick & axis colors.
- **Notes panel / data panel**: background, card background, text/heading/accent colors, H1–H4 colors, fonts and sizes.

---

## 3. `utils/timelineLayout.ts` — the coordinate system

A pure math module ("Handles spatial coordinates, time translation, and 1D collision
packing"). No Vue, no Konva.

### 3.1 The coordinate model

Time is a single **absolute time** axis measured in fractional years:
`absoluteTime = year + fractionOfYear`. Items carry this pre-computed as
`AbsoluteStart` / `AbsoluteEnd` (subticks were removed from the schema in BL-02;
the fraction of a year is now the sub-year unit).

Pixel mapping is *center-anchored*:

```
x = viewportWidth/2 + ((visualTime − visualCenter) / activeLodStep) × TimelineTickDistance
```

- `centerTime` — the absolute time at the middle of the screen (store: `centerAbsoluteTime`).
- `activeLodStep` — the active LOD level's `stepFraction` (years per tick: `1000` for millennia, `1` for years, `1/365` for days).
- `layoutSettings.TimelineTickDistance` — pixels between two adjacent ticks.

So **pixels-per-year = TimelineTickDistance / activeLodStep**: zooming is done by
switching LOD level (changing `activeLodStep`), not by scaling a transform. The
legacy `TimelineSettings.PixelsPerSubtick` is retained in settings, but current
zoom math is LOD-driven. `TICK_SPACING = 100` is exported only for legacy imports.

### 3.2 Hidden-range collapsing

A `HiddenRange` collapses `(EndYear − StartYear)` years of real time into a fixed
visual "break strip" of `BREAK_TICKS = 0.3` tick-widths (30 px at
`TimelineTickDistance=100`, `step=1` — scales with zoom). Two inverse mappings
translate between real ("absolute") and on-screen ("visual") time. Ranges **must be
sorted ascending by `StartYear`** (the store sorts them on load).

**`absoluteToVisual(t, ranges, step): number`** — walks ranges left of `t`,
accumulating a negative offset of `(hiddenSize − breakSize)` per fully passed range,
where `breakSize = BREAK_TICKS × step`. If `t` falls *inside* a range it is mapped
proportionally into the break strip:
`visual = StartYear + offset + ((t − StartYear)/hiddenSize) × breakSize`.

**`visualToAbsolute(v, ranges, step): number`** — the exact inverse: computes each
range's visual start/end, accumulates the same shrinkage, and interpolates back out
of the break strip when `v` lands within one.

### 3.3 Exported functions

| Export | Signature | Purpose |
|--------|-----------|---------|
| `CalendarFormatConfig` (interface) | `{ yearLength, weekLength, months: {name, shortName, startDay}[], seasons: {name, start, end}[] }` | Calendar shape needed for tick labeling |
| `DEFAULT_CALENDAR_CONFIG` | constant | Gregorian: 365-day year, 7-day week, 12 months with cumulative `startDay`, 4 seasons |
| `FormatRegistryType` (type) | `Record<string, (year, fraction) => string>` | Map of LOD `formatKey` → label formatter |
| `buildFormatRegistry(cfg)` | `(CalendarFormatConfig) => FormatRegistryType` | Builds formatters for `MILLENNIA`, `CENTURIES`, `DECADES`, `YEARS` (all `floor(y)`; millennia adds `s`), `QUARTERS` (`Q1…Q4`), `SEASONS` (season name by day-of-year, supports wrap-around seasons), `MONTHS` (short month name by `startDay` lookup), `WEEKS` (`W{n}` from day/weekLength), `DAYS` (`Day {n}`). Sub-year keys return the plain year when `fraction === 0` so year boundaries stay labeled |
| `FormatRegistry` | constant | Pre-built Gregorian registry (legacy direct imports) |
| `BREAK_TICKS` | `0.3` | Visual width of a collapsed range, in tick-widths |
| `absoluteToVisual(t, ranges, step)` | `(number, HiddenRange[], number) => number` | Real → on-screen time (see §3.2) |
| `visualToAbsolute(v, ranges, step)` | `(number, HiddenRange[], number) => number` | On-screen → real time (inverse) |
| `TICK_SPACING` | `100` | Legacy constant |
| `getXFromTime(absoluteTime, centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges?)` | `=> number` | Absolute time → screen X. Applies `absoluteToVisual` to both the time and the center, then the center-anchored formula above |
| `getTimeFromX(x, centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges?)` | `=> number` | Screen X → absolute time (inverse, ends with `visualToAbsolute`) |
| `isLeftOfNow(xPos, viewportWidth)` | `=> boolean` | Is the X left of the screen center (NOW line)? Decides which side an event box hangs on |
| `LaneLock` (interface) | `{ laneIndex, isAbove, absoluteStart, absoluteEnd, isCenterOut }` | A persisted lane assignment |
| `getAssignedLane(itemId, xPos, width, isAboveLine, isCenterOut, absoluteStart, absoluteEnd, centerTime, activeLodStep, viewportHeight, viewportWidth, lockedLanes, layoutSettings, hiddenRanges?)` | `=> number` (Y offset from center) | 1D collision packing (see §3.4) |

### 3.4 The 1D packing engine

`getAssignedLane` assigns each item a stable *lane* so overlapping items stack
instead of colliding:

1. If `itemId` is already in `lockedLanes` (a `Map<string, LaneLock>` owned by the
   caller), the existing lane is just converted to Y — lanes are sticky per render
   session.
2. Otherwise it scans lane `0, 1, 2, …` for the first lane with no collision among
   locks that share the same `isCenterOut` and `isAbove` group:
   - **Periods/Ages (`isCenterOut = true`)** — exact bounding-box overlap test on
     pixel intervals derived via `getXFromTime` of both items' start/end.
   - **Events (`isCenterOut = false`)** — stem-distance test: collision when the
     two anchor Xs are closer than `width + 15` px.
   - Failsafe stops at lane 50.
3. The winning lane is locked into the map, then converted to pixels by the private
   `convertLaneIndexToY`:
   - Periods grow **outward from the axis**: `TimelinePeriodYOffset + laneIndex × TimelinePeriodYMargin`.
   - Events grow **inward from the viewport edge**: start at
     `viewportHeight/2 − (boxHeight if below) − 10` and step in by
     `laneIndex × (TimelineEventBoxHeight + TimelineEventYMargin)`.
   - The result is negated for `isAbove` (screen Y up = negative offset from center).

---

## 4. `utils/timelineNodes.ts` — Konva node builders

Three exported functions build and position the Konva shapes for each item. Shapes
are routed to two z-index "master" groups the caller owns: `stemsMaster` (below)
and `boxesMaster` (above), so all stems render under all boxes.

### `buildNode(id, typeName, title, color, stemsMaster, boxesMaster, layoutSettings)`

Returns an `elements` object holding shape references (`box`, and per type `stem` /
`label`). Fallback color: `#ffffff` for Events, `#888888` otherwise. Three branches
by `typeName`:

| Type | Shapes | Styling knobs used |
|------|--------|--------------------|
| `Age` / `Period` | One `Konva.Rect` (`box-{id}`), no stem, vertically center-anchored via `offsetY = height/2` | `TimelineAgeHeight` / `TimelinePeriodHeight`, `TimelineAgeCornerRounding` / `TimelinePeriodCornerRounding`; filled with the item color |
| `Picture` | `Konva.Line` stem (colored with the item color, width 2) + square `Konva.Image` (`box-{id}`, image set later by the caller, translucent black fill placeholder, corner radius 4) | `TimelineBoxTypesBoxWidth` (falls back to `TimelineEventBoxHeight`), `TimelineEventBorderWidth` |
| everything else (Event, Note, Bookmark, Character, …) | `Konva.Line` stem + `Konva.Rect` box + `Konva.Text` label (`label-{id}`, centered, `wrap:'none'`, padding auto-computed to vertically center: `boxHeight/2 − fontSize/2`) | `TimelineEventBoxWidth/Height`, `TimelineEventBackgroundColor`, `TimelineEventBorderColor/Width` (also stem color), corner radius 4, `TimelineEventTextColor`, `TimelineEventFontFamily/FontSize`, `TimelineEventTextUseEllipsis` |

Hover behavior is wired on `box` (and `label` when present):

- Ages/Periods scale to `scaleY: 1.3` over 0.15 s (EaseOut), back to 1 on leave.
- Other types get a glow (`shadowColor = TimelineEventHoverColor ?? '#ffffff'`,
  `shadowBlur: 15`) on box *and* stem when `TimelineEventHasHoverHighlight` is on.
- Cursor switches to `pointer` / `default`.

### `setNodeVisibility(elements, isVisible)`

Toggles `.visible()` on whichever of `box`, `label`, `stem` exist — used for LOD
and filter culling without rebuilding nodes.

### `updateAbsolutePositions(elements, typeName, anchorX, endX, targetY, boxWidth, isLeft, stageCenterY, layoutSettings)`

Positions the shapes in absolute stage coordinates each frame:

- **Age/Period** — box spans `anchorX → endX` (`width = max(1, endX − anchorX)`);
  Periods above the axis are shifted up by their height; the final Y adds
  `height/2` because the rect's anchor is its vertical center.
- **Picture** — square of side `boxWidth` centered horizontally on the stem
  (`x = anchorX − size/2`); the stem is a straight vertical line from the axis
  (`stageCenterY`) to the box's near edge.
- **Default (event-style)** — the box hangs left or right of its anchor
  (`isLeft ? anchorX − boxWidth : anchorX`), nudged toward the stem by
  `TimelineEventBoxStemOffset` percent of the box width; the label tracks the box;
  the stem runs diagonally from `(anchorX, stageCenterY)` to the box's
  stem-side edge at `targetY`.

---

## 5. Filters — `utils/filterMatcher.ts` + `types` `FilterRule`

### 5.1 The rule model

A `FilterRule` = `{ Id, TimelineId, Dimension, ParamsJson, Label, State, SortOrder }`.
`State` is tri-state (`FilterState`):

| State | Effect |
|-------|--------|
| `'positive'` | Item must match (combined with other positives via AND/OR per `filterAndMode`) |
| `'negative'` | Matching items are excluded — negatives always win over positives |
| `'neutral'` | Rule is inert (kept in the list but ignored) |

`Dimension` selects the matcher; `ParamsJson` carries its parameters:

| Dimension | Params | Match condition |
|-----------|--------|-----------------|
| `type` | `{ typeId }` | `item.TypeId === typeId` |
| `tag` | `{ tagId }` | Item has that tag |
| `character` | `{ characterId }` | Item has that character appearance |
| `story` | `{ storyId }` | Item references that story |
| `keyword` | `{ query }` | Case-insensitive substring of `Title`, `Description`, or `Content` (empty query never matches) |
| `importance` | `{ op: '>'\|'<'\|'=', value }` | Compare against `item.Importance ?? 5` |
| `time_range` | `{ op: '>'\|'<'\|'='\|'between', year, year2? }` | Against `AbsoluteStart`/`AbsoluteEnd`: `>` = ends after `year`; `<` = starts before `year`; `=` = `year` falls within the span; `between` = span intersects `[year, year2 ?? year]` |
| `boolean` | `{ field }` | `has_picture` (item in picture set), `has_tags` (≥1 tag), `show_in_notes` (`!!item.ShowInNotes`) |
| `lod_level` | `{ lodIndex }` | Bit test: `(LodVisibilityMask ?? 255) & (1 << lodIndex)` |
| `color` | `{ hex, tolerance? = 10 }` | Per-channel RGB distance ≤ tolerance vs `item.Color` (invalid hex on either side → no match) |

Unknown dimensions and unparseable `ParamsJson` return `false`.

### 5.2 Exported functions

| Export | Signature | Purpose |
|--------|-----------|---------|
| `FilterItemData` (interface) | `{ item, tagIds: number[], characterIds: string[], storyIds: string[], hasPicture }` | Pre-flattened per-item lookup data |
| `matchesRule(rule, data)` | `=> boolean` | Evaluates one rule against one item (table above) |
| `applyFilters(items, rules, andMode, itemDataMap)` | `=> { visible: TimelineItem[]; dimmed: TimelineItem[] }` | The engine. If no positive *and* no negative rules → everything visible. Per item: no data entry → visible; matches any negative → dimmed; no positives → visible; else visible iff `every` (andMode) / `some` (orMode) positive matches, otherwise dimmed |
| `buildItemDataMap(items, itemTagMap, itemCharacterMap, itemStoryMap, pictureSet)` | `=> Map<string, FilterItemData>` | Flattens the store's link maps into per-item id arrays |

"Dimmed" is the raw excluded set; whether it renders dimmed or fully hidden is the
store's `filterDisplayMode` (see `dimmableItems`).

---

## 6. `utils/relativeRule.ts` — relative-date rules

Powers "memorable days" of type `relative` in the calendar editor: dates defined
relative to a recurring base rather than a fixed month/day (e.g. *"The third
Thursday of every month"*, *"2 days after the start of Spring"*).

### 6.1 The `RelativeRule` model

```ts
interface RelativeRule {
    baseType: 'period' | 'anchor'
    // baseType = 'period'
    periodType?: 'year' | 'month'
    periodMonth?: number | null   // null = every month, 0-N = a specific month
    // baseType = 'anchor'
    anchorType?: 'season-start' | 'season-end' | 'memorable-day'
    anchorIndex?: number          // 0-based season index
    anchorId?: string             // id of another memorable day
    offsetDays: number            // ±N days from the base (0 = on the base)
    weekdays?: number[]           // 0-based day-of-week indices
    ordinal?: number              // 1-5, or -1 = "last"
    span: number                  // consecutive days the event lasts (≥ 1)
}
```

Semantics: start from the **base** (start of every year / every month / a specific
month, or an anchor: a season's start or end, or another memorable day), apply
`offsetDays`, then — if `weekdays` + `ordinal` are set — find the *ordinal*-th
occurrence of those weekday(s) **on or after** that point. `span` stretches the
result over consecutive days. Rules can chain via `anchorType: 'memorable-day'` +
`anchorId` (e.g. "2 days after Easter").

### 6.2 Exports

| Export | Purpose |
|--------|---------|
| `defaultRelativeRule()` | Factory: `{ baseType:'period', periodType:'month', periodMonth:null, offsetDays:0, span:1 }` — "the start of every month" |
| `DescribeContext` (interface) | Names needed for prose: `seasonNames`, `monthNames`, `dayLabels`, `memDayNames` (id → name) |
| `describeRule(rule, ctx)` | Pure function rendering the rule as an English sentence, e.g. `"The third Thursday of every month"`, `"The first Sunday on or after 2 days after the start of Spring"`, `"1 day before the start of Winter"`, appending `", lasting N days"` when `span > 1`. Missing names fall back to `Month N` / `Season N` / `D{n}` / `'a memorable day'`; ordinals map 1–5 → first…fifth and −1 → last |

---

## 7. `calendar.ts` and the calendar system

### 7.1 `calendar.ts` — entry point only

`Frontend/src/calendar.ts` contains **no calendar math**. It is the Vite entry for
`calendar.html` (the Calendar editor window): it imports `assets/main.scss`,
creates the Vue app with `CalendarApp.vue` + Pinia, mounts on `#app`, and
fades/removes the `#app-loading` splash element.

The actual calendar math is distributed across:

- `pages/CalendarApp.vue` — authoring: parses/serializes `YearDefinition`, edits LOD profiles and memorable days, saves via `BackendAPI.SaveCalendar`.
- `stores/timelineStore.ts` → `calendarConfig` — consumption: parses the loaded calendar into a `CalendarFormatConfig`.
- `utils/timelineLayout.ts` → `buildFormatRegistry` — formatting: turns that config into tick-label functions.

### 7.2 The `YearDefinition` JSON

Stored as a JSON string in `Calendar.YearDefinition` (C#: `CalendarItem`). Shape
(typed loosely by the `YearDefinition`/`MonthDef`/`WeekDef`/`SeasonDef` interfaces,
authored by `CalendarApp.vue`'s `buildYearDefinition()`):

```jsonc
{
  "length": 365,                      // days per year
  "months": 12,                       // month count
  "month_definition": {
    "months_have_short_name": true,
    "0": { "name": "January", "short_name": "Jan", "length": 31, "season": 0 },
    "1": { ... }                      // keyed by stringified index
  },
  "week_definition": {                // optional
    "length": 7,
    "days_have_names": true,  "days":       ["Monday", ...],
    "days_have_short_names": true, "days_short": ["Mon", ...],
    "weekend": [5, 6]                 // 0-based indices
  },
  "seasons": 4,                       // optional, with season_definition
  "season_definition": {
    "seasons_have_short_name": false,
    "0": { "name": "Spring", "start": 0, "end": 91, "significance": "..." }
    // start/end are day-of-year; a season may wrap past year end (start > end)
  },
  "memorable_days": [                 // optional
    { "id": "...", "name": "...", "color": "#e8944a",
      "type": "fixed" | "weekly" | "relative",
      "startMonth": 0, "startDay": 1, "endMonth": 0, "endDay": 1, "isRange": false,
      "weekDays": [],                 // for type = "weekly"
      "rule": { /* RelativeRule, for type = "relative" */ } }
  ]
}
```

Day-of-year is the universal internal unit: months are reduced to cumulative
`startDay` offsets, seasons are `[start, end]` day ranges (wrap-around supported),
and a date fraction `f` converts as `day = round(f × yearLength)`.

### 7.3 LOD profiles

A `LodProfile` (C#: `LodItem`) holds `Profile`: a JSON array of `LodLevel`s —
`{ index, formatKey, stepFraction }`. `stepFraction` is the tick step in **years**
(`1000` millennia … `1` years … `1/12`-ish months … `1/365` days; the editor
accepts fraction strings like `1/52` via continued-fraction conversion). The
editor requires at least one level and a `YEARS` level, and renumbers `index`
sequentially on save. The store keeps `currentLodIndex` and steps through the
sorted profile with `lodZoomIn`/`lodZoomOut`; the active level's `stepFraction`
becomes `activeLodStep` in all `timelineLayout` math, and its `formatKey` selects
the label function from the format registry.

### 7.4 Date formatting pipeline

```
Calendar.YearDefinition (JSON string)
   └─ store.calendarConfig            → { yearLength, weekLength, months[+startDay], seasons }
        └─ buildFormatRegistry(cfg)   → { MILLENNIA: fn, …, DAYS: fn }
             └─ registry[currentLod.formatKey](year, fraction) → tick label
```

Every formatter takes `(year, fraction)` where `fraction ∈ [0, 1)` is the position
within the year; sub-year formatters print the bare year at `fraction === 0` so
year boundaries remain labeled, and custom month/season/week names flow through
from the calendar definition automatically.

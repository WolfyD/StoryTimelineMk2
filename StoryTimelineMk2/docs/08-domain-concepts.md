# Domain Concepts

This document describes the conceptual model of StoryTimelineMk2 — the domain vocabulary and the rules behind it that a new developer must understand before touching the timeline canvas, the item editor, or the database layer.

Source of truth for everything below:

- `StoryTimeline.Data/Database/TimelineItem.cs`, `StoryTimeline.Data/Database/CalendarItem.cs`, `StoryTimeline.Data/Database/LodItem.cs`, `StoryTimeline.Data/Database/LayoutSettingsItem.cs`, `StoryTimeline.Data/Database/FilterRuleItem.cs`, `StoryTimeline.Data/Database/DbInitializer.cs`
- `Frontend/src/types/models.ts`, `Frontend/src/utils/timelineLayout.ts`, `Frontend/src/utils/filterMatcher.ts`, `Frontend/src/utils/relativeRule.ts`

---

## 1. TimelineItem

`TimelineItem` is the core entity of the application. Every visible thing on the timeline canvas — an event box, a period bar, an age band, a bookmark flag, even the start/end markers of the timeline itself — is a row in the `items` table.

### 1.1 The nine TypeIds

Seeded in `DbInitializer.SeedDefaultData()` (`item_types` table):

| TypeId | Name | Nature | Rendering / behavior |
|--------|------|--------|----------------------|
| 1 | **Event** | Point in time | Titled box connected to the axis by a **stem** (a Konva line). Packed into lanes above/below the axis, pushed inward from the viewport edges. |
| 2 | **Period** | Span of time | Horizontal rounded bar spanning `AbsoluteStart → AbsoluteEnd`, laid out **center-out** from the axis (no stem). Treated as a range type in the editor (`isRangeType`: TypeId 2 or 3). |
| 3 | **Age** | Era / large span | Like a Period but taller (`TimelineAgeHeight`) and used for large-scale eras; shown as background context in the minimap and data panel. Also a range type. |
| 4 | **Picture** | Point in time | A "box type": rendered as a square image box centered on its stem (when `TimelineBoxTypesShowAsBox` is on). Clicking it in the project view opens the image. |
| 5 | **Note** | Point in time | A "box type" annotation; can also surface in the Notes panel (`ShowInNotes`). |
| 6 | **Bookmark** | Point of interest | Rendered by a dedicated code path in `TimelineCanvas.vue` (marker/flag, not a lane-packed box); also drawn on the minimap for quick navigation. |
| 7 | **Character** | Person/entity marker | A "box type" that can show the character's image; distinct from the `characters` table — this is the character's *presence on the canvas*. |
| 8 | **Timeline_start** | Boundary | Synthetic marker titled "Timeline Start" (green `#22c55e`). Skipped by the normal item render loop; drawn as a boundary marker and used by the minimap to compute the timeline's extent. |
| 9 | **Timeline_end** | Boundary | Same as above, titled "Timeline End" (red `#ef4444`). |

"Box types" (Picture, Note, Character) are governed by the `TimelineBoxTypes*` layout settings: `TimelineBoxTypesShowAsBox` (square box vs. normal event box), `TimelineBoxTypesBoxWidth`, and `TimelineBoxTypesShowImage`.

### 1.2 Temporal fields and fraction-based positioning

```
Year          int      integer start year
EndYear       int      integer end year (== Year for point items)
AbsoluteStart double   pre-computed fractional time, e.g. 1204.25
AbsoluteEnd   double   pre-computed fractional time
```

The canvas **never** does calendar math at render time. All positioning uses `AbsoluteStart`/`AbsoluteEnd`, which encode time as:

```
absoluteTime = year + (fraction of the year elapsed)
```

So *mid-March of year 1204* in a 365-day calendar is roughly `1204 + 73/365 ≈ 1204.2`. The fraction is computed **when the item is saved** (`EditItem.vue`):

```ts
const step = lod.stepFraction            // e.g. 0.08333… for MONTHS
item.AbsoluteStart = item.Year + startSubYear * step
item.AbsoluteEnd   = item.EndYear + endSubYear * step
```

`timelineLayout.ts` then converts absolute time to pixels purely linearly (`getXFromTime` / `getTimeFromX`), with hidden-range compression applied in between (see §6). Legacy databases that predate `AbsoluteStart` are backfilled on startup by `DbInitializer.ApplyColumnMigrations()` (old schemas used a now-removed `subtick` column, `year + subtick/10`).

### 1.3 CreationGranularity

`CreationGranularity` records **which LOD level the item's date was entered at** — it is the index of a level in the timeline's LOD profile (0 = Millennia … 7 = Days in the default profile; the editor defaults to 3 = Years).

It matters because:

- The item editor uses it to pick the `stepFraction` when converting the sub-year UI position to `AbsoluteStart`/`AbsoluteEnd`, and to reverse that conversion when re-opening an item.
- The `LodDateInput` component shows date fields appropriate to that granularity (a "Days"-granularity item gets month/day pickers; a "Years" item just gets a year).

In short: granularity is about *how precisely the author specified the date*, independent of the zoom level at which the item is displayed.

### 1.4 Visibility fields

| Field | Meaning |
|-------|---------|
| `LodVisibilityMask` | Bitmask; bit *i* set means the item is visible at LOD index *i* (default `255` = all levels). This is the current visibility mechanism. |
| `MinLodLevel` | Legacy threshold ("visible at LOD ≥ N"), superseded by the mask but kept for older DBs. |
| `Importance` | 1–10 scale (default 5); filterable dimension, used for prioritization. |
| `ShowInNotes` | Whether the item surfaces in the Notes panel. |

---

## 2. Custom calendar system

A **Calendar** defines what a "year" means for a timeline. Each timeline references one calendar (`timelines.calendar_id`, default `cal_default_gregorian`).

### 2.1 CalendarItem fields

| Field | Purpose |
|-------|---------|
| `Name` / `ShortName` / `AlternateName` | Display names ("Gregorian", "Greg.", "Western Calendar") |
| `NameBefore0` / `NameAfter0` | Era suffixes around year 0 ("BCE" / "CE") |
| `LodProfileId` / `LodProfile` | The LOD profile paired with this calendar (see §3) |
| `YearDefinition` | JSON string describing the year's structure |

### 2.2 YearDefinition JSON

The default Gregorian calendar seeded by `DbInitializer`:

```json
{
  "length": 365,
  "months": 12,
  "month_definition": {
    "months_have_short_name": true,
    "0": { "name": "January",  "short_name": "Jan", "length": 31, "season": 3 },
    "1": { "name": "February", "short_name": "Feb", "length": 28, "season": 3 },
    "...": "…one numbered entry per month…"
  },
  "seasons": 4,
  "season_definition": {
    "seasons_have_short_name": false,
    "0": { "name": "Spring", "start": 60,  "end": 151 },
    "1": { "name": "Summer", "start": 152, "end": 243, "significance": "hottest" },
    "2": { "name": "Fall",   "start": 244, "end": 334 },
    "3": { "name": "Winter", "start": 335, "end": 59,  "significance": "coldest" }
  },
  "week_definition": {
    "length": 7,
    "days_have_names": true,
    "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "days_have_short_names": true,
    "days_short": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "weekend": [5, 6]
  }
}
```

Key points:

- `length` is the total number of **days in a year** — the denominator for all day↔fraction conversions.
- Months are keyed by 0-based index and carry their own `length`; month start-days are derived by summing lengths.
- Seasons are day ranges and may **wrap around year end** (Winter: start 335, end 59) — season lookup code handles `start > end`.
- Weeks are independent of months: a week is simply `week_definition.length` consecutive days.
- Everything is optional except `length` (see the `YearDefinition` interface in `types/models.ts`): a fantasy calendar can have no months, no seasons, or a 10-day week.

### 2.3 Year-0 offset and era names

The `timeline_calendars` table links a timeline to a calendar with a `year_0_at_default` offset, letting a story calendar place its year 0 at an arbitrary point relative to the default. Around year 0, dates display with the calendar's `NameBefore0` / `NameAfter0` era names (e.g. `312 BCE` vs `312 CE`).

### 2.4 Internal representation vs. display

A date is stored internally as **(integer year, fraction of year)** — ultimately just the `AbsoluteStart` float. For display, `buildFormatRegistry(cfg)` in `timelineLayout.ts` turns a `CalendarFormatConfig` (year length, week length, month start-days, season ranges — all derived from `YearDefinition`) into a registry of formatter functions keyed by format key:

```ts
'MONTHS': (y, f) => f === 0 ? `${Math.floor(y)}` : monthLabel(f)
// monthLabel: day = round(f * yearLength) → find the month whose startDay range contains it
```

So the same absolute time `1204.2` renders as `1204` at the Years level, `Spring` at Seasons, `Mar` at Months, `W11` at Weeks, and `Day 74` at Days.

The calendar editor also supports **memorable days** (named recurring days such as holidays) that can be defined either as fixed dates or by *relative rules* (see §5.4).

---

## 3. LOD (Level of Detail) profiles

An **LOD profile** defines the zoom-level ladder for a calendar: which time step each zoom level uses and how tick labels are formatted there.

### 3.1 Storage

Profiles live in the `lod_profiles` table (`id`, `name`, `profile`), where `profile` is a JSON array of levels. A calendar references its profile via `lod_profile_id` — so the profile travels with the Calendar attached to a timeline (this is what CLAUDE.md means by "stored as JSON in the Calendar field"). Frontend types: `LodProfile { Id, Name, Profile: LodLevel[] }`, `LodLevel { index, formatKey, stepFraction }`.

### 3.2 The default ladder (`lod_default`, "Standard Gregorian Scale")

| index | formatKey | stepFraction | One tick equals |
|-------|-----------|--------------|-----------------|
| 0 | `MILLENNIA` | 1000 | 1000 years |
| 1 | `CENTURIES` | 100 | 100 years |
| 2 | `DECADES` | 10 | 10 years |
| 3 | `YEARS` | 1 | 1 year |
| 4 | `SEASONS` | 0.25 | ¼ year |
| 5 | `MONTHS` | 0.08333… | 1/12 year |
| 6 | `WEEKS` | 0.01923… | 1/52 year |
| 7 | `DAYS` | 0.00274… | 1/365 year |

`stepFraction` is the **active LOD step** used everywhere in canvas math: `getXFromTime` maps time to pixels as `(Δt / activeLodStep) * TimelineTickDistance`, so one tick is always `TimelineTickDistance` pixels wide regardless of zoom level.

### 3.3 What LOD drives

1. **Tick labeling** — `formatKey` selects a formatter from the format registry (§2.4). At year boundaries (`fraction === 0`) sub-year levels fall back to the plain year number.
2. **Item visibility** — each item's `LodVisibilityMask` is tested against the current LOD index: `(mask & (1 << lodIndex)) !== 0`. Authors can make an item appear only when zoomed in to Days, or only at Century scale, etc.
3. **Date entry granularity** — `CreationGranularity` is an index into this ladder (§1.3).
4. **Zoom animation** — `TimelineAnimateLodChange` / `TimelineLodChangeAnimationLength` control the transition when the active level changes.

Custom calendars can define entirely different ladders (e.g. no weeks, or "Eras → Cycles → Turnings").

---

## 4. LayoutSettings

A **LayoutSettings** record (`layout_settings` table, `LayoutSettingsItem.cs` / `LayoutSettings` interface) is a reusable, named visual preset for timeline rendering. Timelines reference one via `timelines.layout_settings_id`.

What a preset controls, by group:

| Group | Settings (representative) |
|-------|---------------------------|
| **Event boxes** | box width/height, stem offset, border color/width/radius, padding, Y margin, text color/font/size, ellipsis truncation, color strip placement (`ShowColorOnBottom`: thin strip at bottom vs. near stem side), hover highlight + color |
| **Ages & Periods** | age height and corner rounding; period height, corner rounding, Y margin (spacing between stacked period lanes), Y offset (distance of first lane from the axis) |
| **Box types** (Picture/Note/Character) | show as square box vs. normal event, box width, show image inside |
| **Canvas & axis** | canvas background color, tick color, axis color, tick distance (px per tick), tick width, smaller non-year ticks, tick marker font/style/color/size |
| **Now line** | show line/text, color, line style (dashed/solid) |
| **Hover line** | the line that snaps to the nearest year under the cursor: show, color, style, width |
| **Data range strip** | width, visibility, color |
| **Animations** | animate jump-to-year + duration; animate LOD change + duration |
| **Notes panel** | background, card background, text/heading/accent colors, font size |
| **Data panel** (upper-right item display) | background, card background, H1–H4 colors, font family/size |

Two built-in presets are seeded and self-heal on startup:

- **`ls_default`** ("Default (Light)") — light parchment theme (`#f1e7d5` canvas). It is the schema-level default for both `timelines.layout_settings_id` and `settings.default_layout_settings_id`.
- **`ls_dark`** ("Dark") — slate theme (`#0f172a` canvas).

`DbInitializer.ResetBuiltinPreset(id)` restores either built-in to factory values via UPDATE (never DELETE, since timelines hold FK references to them).

---

## 5. Filter system

Filters decide which items are fully **visible** and which are **dimmed** on the canvas. Backend: `FilterRuleItem.cs`, tables `timeline_filter_rules` and `filter_presets`. Frontend: `filterMatcher.ts`.

### 5.1 Rules and states

A `FilterRule` is `{ Id, TimelineId, Dimension, ParamsJson, Label, State, SortOrder }`. Each rule is in one of three states:

| State | Effect |
|-------|--------|
| `neutral` | Rule is defined but inactive; ignored by matching |
| `positive` | Include: item must match (any-of by default, all-of in AND mode) |
| `negative` | Exclude: matching items are dimmed, and negatives **always win** over positives |

`applyFilters()` semantics: if any negative rule matches, the item is dimmed. Otherwise, if there are no positive rules the item is visible; with positive rules, `andMode` chooses `every` vs. `some`. Items are never removed — non-matching items go into the `dimmed` list, keeping spatial context.

### 5.2 Rule dimensions (kinds)

From `matchesRule()`; `ParamsJson` shapes shown inline:

| Dimension | Params | Matches when |
|-----------|--------|--------------|
| `type` | `{ "typeId": 2 }` | `item.TypeId === typeId` |
| `tag` | `{ "tagId": 7 }` | item has that tag |
| `character` | `{ "characterId": "…" }` | character appears in item |
| `story` | `{ "storyId": "…" }` | item references that story |
| `keyword` | `{ "query": "dragon" }` | case-insensitive substring in Title, Description, or Content |
| `importance` | `{ "op": ">", "value": 7 }` | `>` / `<` / `=` against `Importance` |
| `time_range` | `{ "op": "between", "year": 1200, "year2": 1300 }` | `>` / `<` / `=` / `between` against `AbsoluteStart`/`AbsoluteEnd` |
| `boolean` | `{ "field": "has_picture" }` | `has_picture`, `has_tags`, or `show_in_notes` |
| `lod_level` | `{ "lodIndex": 4 }` | item's `LodVisibilityMask` has that bit set |
| `color` | `{ "hex": "#aa3311", "tolerance": 10 }` | per-channel RGB distance ≤ tolerance from `item.Color` |

### 5.3 Presets

`FilterPreset { Id, Name, RulesJson, AndMode }` — a **globally** stored, named bundle of rules (the `filter_presets` table has no `timeline_id`), so a preset built on one timeline can be applied to any other. Active rules, by contrast, are per-timeline rows in `timeline_filter_rules`.

### 5.4 Relative rules (calendar-relative recurring days)

`utils/relativeRule.ts` defines `RelativeRule`, used by the calendar editor to define **memorable days** that recur by rule rather than fixed date:

```ts
interface RelativeRule {
  baseType: 'period' | 'anchor'
  periodType?: 'year' | 'month'        // period base: start of every year / month
  periodMonth?: number | null           // null = every month, N = a specific month
  anchorType?: 'season-start' | 'season-end' | 'memorable-day'
  anchorIndex?: number                  // season index
  anchorId?: string                     // another memorable day (rules can chain)
  offsetDays: number                    // ±N days from the base
  weekdays?: number[]                   // optional weekday constraint…
  ordinal?: number                      // …with 1–5 or -1 ("last")
  span: number                          // consecutive days the event lasts
}
```

`describeRule()` renders these as human-readable phrases: *"The third Thursday of every month"*, *"1 day before the start of Winter"*, *"2 days after Easter, lasting 3 days"*. Note that a memorable day can anchor on another memorable day, allowing derived holidays.

---

## 6. Hidden ranges

A **HiddenRange** (`timeline_hidden_ranges`: `{ TimelineId, StartYear, EndYear, Label }`) marks a stretch of years the author wants collapsed — e.g. a 10,000-year gap between two story arcs.

The canvas does not delete that time; it **compresses** it. In `timelineLayout.ts`:

```ts
export const BREAK_TICKS = 0.3;  // a hidden range collapses to 0.3 tick-widths
```

`absoluteToVisual(t, ranges, step)` maps absolute time to "visual time": every hidden range that lies fully before `t` shrinks to `BREAK_TICKS * step` (30 px at the default 100 px tick distance — and it scales with zoom, since `step` is the active LOD step). A time *inside* a hidden range is mapped proportionally into that thin break strip, so nothing is ever unreachable. `visualToAbsolute` is the exact inverse, used to turn mouse positions back into time. All coordinate functions (`getXFromTime` / `getTimeFromX`) route through this pair, so events, ticks, and hit-testing all agree about compressed regions, which render with a break indicator on the axis.

---

## 7. Relationships

Items connect to the rest of the world model through link tables (all `ON DELETE CASCADE`):

| Relationship | Table | Shape |
|--------------|-------|-------|
| **Tags** | `item_tags` | Many-to-many with global `tags` (unique names). Filterable via the `tag` dimension. |
| **Character appearances** | `item_character_appearances` | Many-to-many with `characters`, plus a freetext `role` ("narrator", "victim", …). Frontend type: `ItemCharacterAppearance { CharacterId, CharacterName, CharacterColor, Role }`. Supersedes the older `item_characters` table (which had a `relationship_type` defaulting to `'appears'`). |
| **Story references** | `item_story_refs` | Many-to-many between items and `stories`, in addition to the item's primary `StoryId` column. |
| **Chapter references** | `item_chapters` | Many-to-many with `chapters`; a chapter belongs to a `book` (`chapters.book_id`), and books group stories via `book_stories`. Frontend type: `ItemChapterRef { ChapterId, ChapterNumber, ChapterTitle, BookId, BookTitle }`. |
| **Pictures** | `item_pictures` | Many-to-many with the `pictures` media table; drives the `has_picture` filter and Picture-type rendering. |
| **Character↔character** | `character_relationships` | Between characters (not items): typed, optionally bidirectional, with strength/degree/modifier — the basis of relationship graphs. |

The editor loads all of this at once as `ItemForEdit { Item, Tags, Characters, StoryRefs, ChapterRefs, Calendar, Pictures }`.

---

## 8. Glossary

| Term | Definition |
|------|------------|
| **Absolute time** | A single float encoding a date: `year + fraction-of-year` (e.g. `1204.25`). Stored per item as `AbsoluteStart`/`AbsoluteEnd`; the canvas's only time currency. |
| **Age** | TypeId 3 — a large era rendered as a tall spanning band; a range type. |
| **Anchor** | In a relative rule, the base moment an offset is measured from: a season start/end or a memorable day. |
| **Axis** | The horizontal center line of the canvas that ticks and stems attach to. |
| **Bookmark** | TypeId 6 — a marked point of interest with its own marker rendering; shown on the minimap for navigation. |
| **Box type** | Collective name for Picture, Note, and Character items, which can render as square image boxes instead of standard event boxes (`TimelineBoxTypes*` settings). |
| **Break strip** | The thin (0.3 tick-widths) visual gap a hidden range collapses into. |
| **Calendar** | A named definition of what a year is: length in days, months, seasons, weeks, era names around year 0, plus an attached LOD profile. |
| **CreationGranularity** | The LOD index at which an item's date was authored; selects the `stepFraction` for converting editor input to absolute time. |
| **Data panel** | The upper-right panel showing details of the selected/hovered item; themed via `DataPanel*` layout settings. |
| **Dimmed** | Filter outcome for non-matching items: rendered de-emphasized rather than removed. |
| **Filter preset** | A globally saved, named bundle of filter rules (`RulesJson` + `AndMode`) applicable to any timeline. |
| **Filter rule** | A per-timeline predicate on one dimension (type, tag, keyword, …) with a state of neutral/positive/negative. |
| **Granularity** | See CreationGranularity — precision of an authored date, distinct from display zoom. |
| **Hidden range** | A per-timeline year span collapsed on the canvas into a break strip, with an optional label. |
| **Hover line** | The vertical guide line that snaps to the nearest year under the cursor. |
| **Importance** | 1–10 significance score on items and characters (default 5); filterable. |
| **Lane** | One packing row above or below the axis. Events pack edge-inward with stem-distance collision; periods pack center-outward with bounding-box collision (`getAssignedLane`). |
| **Layout settings / layout preset** | A reusable named visual theme controlling boxes, stems, ticks, colors, panels, and animations. Built-ins: `ls_default`, `ls_dark`. |
| **LOD (Level of Detail)** | The zoom-level system. Each level has an `index`, a `formatKey` (label formatting), and a `stepFraction` (time per tick). |
| **LOD profile** | The JSON ladder of LOD levels attached to a calendar (default: Millennia → Centuries → Decades → Years → Seasons → Months → Weeks → Days). |
| **LodVisibilityMask** | Per-item bitmask: bit *i* set ⇒ item visible at LOD index *i*. Supersedes `MinLodLevel`. |
| **Memorable day** | A named recurring calendar day (holiday, festival), defined by fixed date or by a RelativeRule; usable as an anchor for other rules. |
| **Minimap** | The overview strip showing the whole timeline extent (derived from the TypeId 8/9 boundary items) with ages, periods, and bookmarks. |
| **Notes panel** | The panel listing item notes; items opt in via `ShowInNotes`. |
| **Now line** | The vertical line marking the current focus year at viewport center. |
| **Period** | TypeId 2 — a span of time rendered as a horizontal bar; a range type. |
| **Relative rule** | A declarative recipe for a recurring day: base (period or anchor) ± offset days, optional Nth-weekday constraint, and a span. |
| **Season** | A named day-range within the year (may wrap across year end); drives the SEASONS format level. |
| **Stem** | The Konva line connecting an event/box-type item's box to its exact anchor point on the axis. Ages and periods have no stems. |
| **Step / stepFraction** | Amount of time represented by one tick at a given LOD level (e.g. 0.25 year at Seasons). |
| **Subtick** | *Legacy.* Old sub-year integer unit (`year + subtick/10`); removed from the schema (BL-02) and migrated into `AbsoluteStart`/`AbsoluteEnd`. |
| **Tick** | An axis gradation; always `TimelineTickDistance` pixels apart, representing one LOD step of time. |
| **Timeline boundaries** | TypeIds 8/9 — the synthetic Timeline_start / Timeline_end marker items defining the timeline's extent. |
| **TimelineItem** | The core entity: any dated thing on the canvas (see §1). |
| **Year 0 offset** | `year_0_at_default` in `timeline_calendars`: where a calendar's year 0 sits relative to the default; era names `NameBefore0`/`NameAfter0` label the two sides. |
| **YearDefinition** | The JSON structure on a Calendar defining year length, months, seasons, and weeks. |

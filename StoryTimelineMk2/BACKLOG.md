# StoryTimelineMk2 — Backlog

---

## [BL-01] Tick label precision failure at large year values

**Status:** Fixed. `Math.round` applied in `buildFormatRegistry` (`timelineLayout.ts`). Broken step-snapping block reverted from `TimelineCanvas.vue`.

### Problem

At large absolute year values (observed from ~year 1,500 onwards), sub-year tick labels on the timeline grid show the wrong unit (e.g., "Day 187" where "Day 188" should appear, or duplicate day labels with adjacent days skipped).

The symptom worsens predictably with distance from year 0: near year 0 labels are always correct; near year 1,500,000 many are wrong.

### Root cause

The grid tick loop iterates using `i * stepFraction` where `i` is a global tick index spanning the entire timeline. For a 200-day calendar at year 1,500,000, `i ≈ 300,000,000`. Floating-point multiplication accumulates an error of ~±3×10⁻⁸ in the fractional part of the result.

When the formatter then does `Math.floor(fraction * yearLength)`, the day index is computed from a value like `186.9999...` instead of `187.000...`, giving the wrong day.

Near year 0 the tick indices are small (~187 for day 188), so the accumulated error is ~1×10⁻¹⁴ — well below the threshold to affect `Math.floor`. Hence no visible issues there.

### Why all other systems are unaffected

- **Items** — `AbsoluteStart = Year + Subtick * stepFraction` where `Subtick` is a small integer (≤ yearLength). No large-index accumulation.
- **Drag/pan** — single `getTimeFromX` computation, no accumulation.
- **Jump/wheel navigation** — sets `centerTime` directly or via a single `(index ± 1) * step` computation.
- **Distance points** — snap via `Math.round(time / step) * step`, tiny absolute error.
- **Cursor label** — same formatter but cursor already snaps to grid; the error is the same order and handled by Math.round in the snap itself.

### Proposed fix

Two targeted changes, nothing else:

1. In `buildFormatRegistry` (`timelineLayout.ts`), change `Math.floor(f * yearLength)` to `Math.round(f * yearLength)` in all sub-year formatters (DAYS, WEEKS, MONTHS, SEASONS). `Math.round` absorbs the accumulated float error (always << ±0.5 of a day for any realistic year/calendar combination) and gives the correct unit label.

2. Ensure `targetStep` in `renderGrid` is always exactly `currentLod.stepFraction` — do not alter it. The entire coordinate system (`getXFromTime`, `absoluteToVisual`, `visualToAbsolute`) is built around a single consistent step value. Diverging `targetStep` from `step` sends ticks to visually wrong positions.

### Action required before fixing

A step-snapping block was added to `TimelineCanvas.vue` (around line 389) that changes `targetStep` and is actively making things worse ("all numbers are off"). **This must be reverted first.** The specific code to remove:

```typescript
{
    const cfg = store.calendarConfig;
    if (currentLod.formatKey === 'DAYS' && cfg.yearLength > 0) {
        const daysPerTick = Math.max(1, Math.round(targetStep * cfg.yearLength));
        targetStep = daysPerTick / cfg.yearLength;
    } else if (currentLod.formatKey === 'WEEKS' && ...) { ... }
}
```

---

## [BL-02] Subtick system redesign

**Status:** Design discussion, no implementation started.

### Background

Items currently store their timeline position as:

```
AbsoluteStart = Year + Subtick * LOD_StepFraction(CreationGranularity)
```

Where `Subtick` is an integer from 0 up to `round(1 / stepFraction) - 1`, representing which "slot" within the year the item was placed at the LOD level active during creation.

The previous application version stored `Subtick` as 0–9 (exactly 10 positions per year), and the import SQL uses `Year + Subtick / 10.0`. The current version extended this to allow more positions based on the LOD step, but the concept is the same.

### Problems with the current model

1. **Position is tied to the LOD profile, not to the calendar.** If you change the LOD step fractions, stored positions shift. If the calendar's step for DAYS was 1/365 at creation time and is later 1/200, the item is now at a different day.

2. **`Subtick` carries no calendar meaning.** It is an index into an evenly-spaced grid derived from the LOD step. You cannot read "Subtick 47" and know which month or day it is without knowing the step fraction at creation time.

3. **Import is approximate.** The legacy 0–9 Subtick is mapped to `Subtick / 10.0`, which is a fraction of a year with no connection to calendar months or days.

4. **Cross-calendar items have semantically undefined positions.** An item at `Subtick = 94` in a timeline using a 365-day LOD step represents day 94. In a 200-day calendar it would represent a different day — or not even a valid day if Subtick > yearLength.

### Proposed new model

Store position as direct calendar coordinates:

| Field | Type | Meaning |
|-------|------|---------|
| `Year` | int | Calendar year (unchanged) |
| `DayOfYear` | int | 0-indexed day within the year (0 to yearLength − 1) |

`AbsoluteStart` becomes a computed value: `Year + DayOfYear / yearLength`.

This has several benefits:
- Position has an unambiguous calendar meaning independent of any LOD profile
- `DayOfYear / yearLength` involves only small integers (DayOfYear < yearLength), so float precision is excellent at any year value
- The label for an item's date is trivially `Day (DayOfYear + 1)` without any floating-point lookup
- Future sub-day precision can be added as `TimeOfDay` without changing the model

**What granularity is stored?** The `CreationGranularity` (LOD index) stays as a metadata hint for display purposes (e.g., should this item's date show down to the day, month, or just the year?). But the stored position is always at the finest available granularity for that LOD level — DayOfYear for a DAYS creation, or `0` for a YEARS creation.

### Migration path from old Subtick

**Legacy import (Subtick 0–9):**
```
DayOfYear = round(Subtick * yearLength / 10)
```
Maps each of the 10 positions to the nearest calendar day.

**Current Subtick (0 to ~maxSubticks):**
```
DayOfYear = round(Subtick * yearLength * stepFraction)
           = round(Subtick * 1)          -- when step = 1/yearLength
           = Subtick                      -- exact, no conversion needed
```
When the creation LOD step was `1/yearLength` (i.e., one step per day), `Subtick` is already `DayOfYear`. For LODs with coarser steps (WEEKS, MONTHS), round to the nearest day.

### Open questions for design session

- Should changing the calendar's `yearLength` cause items with `DayOfYear > newYearLength` to be clamped, deleted, or warned about?
- Should `AbsoluteStart` remain a stored field (cached) or be computed every time from `(Year, DayOfYear)`?  Stored is faster but must be invalidated if calendar changes.
- For MONTHS or SEASONS granularity, should we store `MonthIndex + DayOfMonth` instead of just `DayOfYear`, or is `DayOfYear` always sufficient?
- How does the edit UI (`LodDateInput`) change? Currently it lets the user pick a subtick index; it should instead let them pick a calendar day (from a month/day picker or a day-of-year number).

---

## [BL-03] Filter system for timeline items

**Status:** Done. Full rule-based filter system: 3-state chips (neutral/positive/negative), 10 filter dimensions (type, tag, character, story, keyword, importance, time range, boolean flags, LOD level, color), AND/OR mode toggle, named presets, dimmed-vs-hidden display mode (in Settings → General). Rules, AND mode, panel state, and display mode all persist to SQLite. Canvas renders dimmed items at opacity 0.25 with events disabled.

Filter items visible on the timeline canvas by type, tag, character relation, or any combination. Fully user-configurable, combinable (AND/OR logic).

> **Aside:** The interesting design question here is persistence and placement. Filters probably live in a collapsible panel alongside the timeline, not a modal — you want to toggle them rapidly while looking at the canvas. The data side is easy since everything is already loaded in the Pinia store; filtering is a client-side computed property. Character-relation filtering is the only join that touches the DB (or can be preloaded into the store). The tricky part is AND/OR logic — a simple "show all checked types" is easy; "show items tagged X AND assigned to character Y" needs a proper filter expression. I'd start with a simple checkbox panel (types + tags + character presence) and add expression logic later. Also worth thinking about whether active filters should be serialized into the URL so you can share/bookmark a particular view.

---

## [BL-04] Hidden timeline sections — UX overhaul

**Status:** Pending.

The current system for collapsing/hiding spans of timeline is clumsy and visually ugly. Needs redesign of both the interaction model and the visual representation of the break.

> **Aside:** The current break indicator (a narrow compressed strip) is easy to miss and hard to interact with. Two separate problems here: (1) how you *define* a hidden range — right now this is probably done through a settings modal with raw year numbers, which is not intuitive; ideally you'd drag-select a span directly on the canvas and right-click → "Collapse this range". (2) how the break *looks* — a more deliberate visual treatment (e.g. a jagged scissor-cut line, a clearly labelled "X years hidden" badge, a hatched pattern) would make it obvious that time is compressed here and not just an empty stretch. I'd also add a hover-expand interaction: hovering the break badge temporarily reveals the compressed range at reduced scale, like a tooltip timeline.

---

## [BL-05] LOD visibility — per-level toggle instead of "visible from"

**Status:** Done. Bitmask DB column, canvas check, and EditItem per-level toggles were already implemented. Fixed `lod_visibility_mask` being dropped during timeline duplication (`TimelineRepo.cs`).

Replace the current "visible from LOD X and below" cutoff with a fully independent per-level on/off toggle, so any subset of LOD levels can be active simultaneously.

> **Aside:** This is a clean improvement. The current model assumes LOD levels form a strict stack — if you're showing weeks, you're also showing months, years, etc. But a user might only want to see years and days, skipping months entirely. Implementation is straightforward: `visibleLodLevels: Set<number>` instead of `minLodLevel: number`. The canvas tick renderer just checks membership instead of `>=`. The tricky edge case is zoom transitions: if the current zoom level lands on a disabled LOD, the canvas needs a fallback (snap to nearest enabled level above or below). Worth defining that behavior explicitly before implementing.

---

## [BL-06] Image selection — multi-select support

**Status:** Done. `ImagePickerModal.vue` already uses `selectedIds: string[]`, links all selected in parallel, and emits an array. `EditItem.vue` already handles the array in `onImageLinked`. No changes needed.

The image picker currently allows selecting only one image at a time despite the item model supporting multiple. The "1 image selected" label is a leftover from a partially-implemented multi-select intent.

> **Aside:** This is relatively contained. The picker modal needs checkboxes instead of a radio-style single tap. The "selected" state needs to become an array of IDs. The "1 image selected" label becomes "N images selected". The backend already supports multiple images per item (the `images` array in EditItem is already a list and SaveItemWithTags presumably writes all of them). Worth confirming the DB schema (item_pictures table) is already set up for multiple rows per item — from context it appears to be, but should be verified before starting.

---

## [BL-07] Calendar change — item position behavior

**Status:** Design decision required before implementation.

When a timeline's calendar is changed (e.g. from 365-day to 200-day), sub-year items have positions that may no longer align to valid ticks in the new calendar. Decide: snap to nearest valid tick, or allow floating positions?

> **Aside:** My recommendation is snap-to-nearest, with a warning dialog before the change is applied listing how many items will be affected and their new positions. Floating items are worse — they create invisible or mislabelled ticks and confuse the canvas layout math. The snap formula is simple: `newDayOfYear = round(oldAbsoluteStart_fraction * newYearLength)`, clamped to `[0, newYearLength - 1]`. Items at YEAR granularity are unaffected. Items at MONTHS/SEASONS granularity snap to the first day of the nearest equivalent month/season in the new calendar (harder to define for custom calendars — may just snap to day). One open question: should this be reversible? If you switch calendars twice, positions may drift each time. A "store original absolute fraction" field would let you recompute from scratch on any calendar change, but adds schema complexity.

---

## [BL-08] New "actions" menu in timeline toolbar

**Status:** Done. `TimelineActionsMenu.vue` — popover with hidden ranges and shift date — is implemented and wired into the timeline header.

A new menu button in the timeline screen (next to the gear icon) for non-settings actions: hiding sections, and future operations like Shift Date.

> **Aside:** Clean separation of concerns — the gear is for persistent settings, the new menu is for one-off operations on the current timeline. A simple dropdown or popover (not a full modal) is the right widget. Worth thinking about keyboard shortcuts for the most common actions. This is a prerequisite for BL-09 (Shift Date) and BL-04 (hiding sections) — get the container right first so both features have a home.

---

## [BL-09] Shift Date function

**Status:** Done. Implemented inside `TimelineActionsMenu.vue` — shift input with backend call to `ShiftTimelineItems`, reloads data and animates to new position on success.

A modal triggered from the actions menu that shifts every item in the current timeline by N years (positive or negative), moving the entire content along the time axis.

> **Aside:** The implementation is deceptively simple on the backend: one SQL UPDATE adding N to `year`, `end_year`, `absolute_start`, and `absolute_end` for all items where `timeline_id = X`. Edge cases to think about: (1) boundary items (type 8 and 9, the timeline start/end markers) — should they shift too? Probably yes, otherwise the timeline bounds become wrong. (2) What if shifting pushes items to year 0 or negative? The calendar may or may not support negative years depending on the `YearZeroOffset` config. (3) Sub-year precision: since we're adding whole years to `absolute_start`, the fractional part is preserved exactly — no rounding needed. (4) The canvas should reload after the shift, same as any other bulk change.

---

## [BL-10] New items appear on canvas without full reload

**Status:** Done. Backend already sends `ItemSaved` push with full item after save; frontend listener calls `store.upsertItem()`; canvas watcher re-renders reactively. `NotifyCallback` wired at window open time.

After saving a new item in the EditItem window, it should appear on the timeline canvas immediately rather than requiring a full data reload.

> **Aside:** The current flow is: EditItem saves → closes → sends `InitReload` to the timeline window → full `GetTimelineData` refetch. The fix is to send a targeted `ItemSaved` message instead (or in addition), containing the full item payload. The timeline Pinia store appends the new item (or replaces the existing one for edits) and the canvas re-renders. The main complication is that the canvas layout (lane assignment, collision packing) currently runs on the full item set — adding one item means the lanes for potentially many items could shift. An incremental update that only recomputes affected lanes is the efficient solution, but a full re-layout of the existing dataset (without a round trip to the DB) would be a good intermediate step. Also: the EditItem window currently closes itself after save (`window.close()`), which means it's the timeline that needs to react to the close event and trigger the update — or the editItem bridge can post the item payload before closing.

---

## [BL-11] Settings search

**Status:** Done. `TimelineSettingsModal.vue` already has `searchQuery` ref, `watch` that highlights `.section-title` and `.s-label` elements with `.search-hl`, scrolls to first match, and the search input is in the modal header with `v-model="searchQuery"`.

A sticky search/filter input at the top of the settings page that helps the user locate a specific setting by name.

> **Aside:** Option C (highlight + scroll to match) is the best UX for a settings panel with many sections. Option B (hide non-matching) is faster for power users but disorienting in a settings context because the user loses the structural overview — they don't know what they're *not* seeing. A hybrid is ideal: show all sections always, but scroll to and visually highlight (animated border or background pulse — gentle, not flashy given the migraine consideration) the first matching setting, with prev/next arrows if there are multiple matches. Minimum viable version: just a simple `Ctrl+F`-style filter that scrolls to section headers containing the search term. Sticky positioning is CSS `position: sticky; top: 0` on the input — trivial to implement.

---

## [BL-12] Usage statistics and milestones

**Status:** Pending. Long-term feature.

Track app usage (session length, focus time, items added, timeline density, etc.) and display in a dedicated statistics screen. Optionally: milestone achievements / character progression as a gamified in-joke.

> **Aside:** The statistics data collection is best done in two layers: (1) session-level events stored in memory (start time, focus/blur timestamps via `window` events, item-add count) flushed to the DB on close; (2) aggregate DB queries for historical stats (items per timeline, density distributions, active days). The statistics screen can use a charting library — Chart.js is the obvious lightweight choice given we're already using Vue; Recharts if we want more control. The achievements system is genuinely fun and worth doing right — a small set of carefully chosen milestones ("first item", "100 items", "first import", "timeline spanning 1000 years", etc.) with cosmetic unlocks. Store earned achievements in a DB table with timestamp. The "character progression" angle is interesting — could tie achievement points to an in-universe character who grows alongside the writer's project. Keep this entirely optional and silent (no pop-ups, just discoverable in the stats screen) to avoid being annoying.

---

## [BL-13] Configurable incremental backup system

**Status:** Pending. Depends on evaluating scope.

Replace/supplement the current manual full-copy backup with a more granular change-tracking system, similar in spirit to git — only recording what changed since the last recorded state.

> **Aside:** Full git-style content-addressable storage is probably overkill. A practical middle ground: on each app close (or on a configurable interval), write a "change journal" file containing only the rows that differ from the last snapshot. Rows are identified by ID + a hash or modification timestamp. The "last recorded state" can just be a stored hash of each row's content in a `backup_state` table — on backup, compare current rows against stored hashes, write only changed/added/deleted rows to the journal. Restoring means replaying the journal or reverting to the snapshot. The most important thing to get right is the restore UX — it should be a browsable history ("show me the state from 3 sessions ago") not just a single rollback point. SQLite's WAL mode actually gives you some of this for free within a session, but across sessions you need the journal approach. Worth also keeping the manual full-copy backup as a "nuclear option" alongside this.

---

## [BL-14] Top-level menu system

**Status:** Pending. Architectural feature.

A persistent top-of-screen menu bar (or equivalent) providing navigation to all screens: item management, search, export options, map screen, characters, statistics, etc.

> **Aside:** This is an architectural decision as much as a feature. Currently the app uses separate WinForms windows for different views, which means each has its own WebView2 instance, its own state, and its own load time. A top menu that navigates within a single SPA would be faster and more cohesive, but requires collapsing the multi-window model. I'd suggest a hybrid: keep separate windows for the timeline canvas (which genuinely benefits from being its own resizable window) but move everything else into a single SPA shell with in-page navigation. The menu itself: a thin horizontal bar at the top with icon + label buttons (Timeline, Characters, Map, Search, Statistics, Export). This is a prerequisite for several other BL items that need a "home" screen.

---

## [BL-15] Characters module

**Status:** Pending. Large feature.

Full character management: create/edit characters with biography fields, birth/death dates, states (alive/deceased/unknown), attachment to timeline items, exportable as a character-specific event timeline, and filterable.

> **Aside:** The DB schema already has `characters` and `character_appearances` tables, so the data layer is partially in place. The main work is the UI. Key screens needed: (1) character list with search/filter; (2) character detail/edit form (biography, dates, color, portrait image); (3) character appearances timeline — a filtered view of the main timeline showing only items where that character appears, which is essentially just BL-03 filter applied to one character. The "state" system (born/alive/deceased) should tie into the item dates where possible — if a character has a "death" event, the state should auto-update. The "export as timeline" feature is high value: it lets a writer hand a character's journey to someone else without exposing the full world history.

---

## [BL-16] The Map feature

**Status:** Pending. Major long-term feature.

A multi-layer interactive map screen: a world map containing regions, each region drillable into a sub-map, locations pinned on each map, locations linked to items/events, time-scrubbing to animate events and character movement across the map over time.

> **Aside:** This is the most architecturally complex feature in the backlog by a significant margin. The data model alone needs careful design: a tree of map layers (world → region → sub-region), map images per layer (uploaded by the user), locations (x/y coordinates on a specific layer's image), and associations between locations and timeline items / characters. The time dimension is what makes this special — a scrubber that moves through the timeline and highlights which events are "current", with character movement paths drawn as animated lines between locations. For the canvas, Konva.js could handle this (we already use it for the timeline) but something like OpenLayers or Leaflet would give better image-overlay and zoom/pan behavior for map-style navigation. I'd strongly recommend a dedicated design sprint for this one before any code is written — the scope is large enough that getting the data model wrong early would be expensive to undo. Start with static display (locations visible on map, click to see linked events) before tackling the time animation.

---

## [BL-17] Character relations screen

**Status:** Pending. Depends on BL-15 (Characters module).

A visual network graph showing characters and their relationships (family, rival, ally, etc.), centered on a selected character, with relationship types as labeled edges.

> **Aside:** This is a graph visualization problem. Konva.js can draw this but a dedicated force-directed graph library (D3.js `d3-force`, or vis.js Network) would produce much better layouts automatically. The data model needs a `character_relationships` table: `(character_a_id, character_b_id, relationship_type, notes, start_year?, end_year?)`. Relationship types should be configurable (not hardcoded), since every story world has its own social structures. The UX pattern of "center on a selected character and show their direct connections" is the right starting point — expanding outward one degree at a time (click a connected character to recenter). A full graph of all characters at once becomes unreadable quickly. Worth also thinking about time: if relationships have start/end years, the graph should respond to the timeline's current time position (or have its own time scrubber) to show the relational state at a given point in the story.

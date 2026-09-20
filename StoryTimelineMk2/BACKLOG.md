# StoryTimelineMk2 — Backlog

Grouped by size, not by number: BL numbers are permanent and a new item always gets the next
free one whatever group it lands in. Move an item between groups by moving its section.

---

# Small — 1.0.3 candidates

What is left of the 1.0.3 pass; finished items are under Done.

## [BL-66] Reference timeline — read-only window or underlay

**Status:** Step 1 done for 1.0.3 (2026-09-20): `ReferenceTimelineModal` (strip button + `R`)
sends `OpenTimeline { id, readOnly: true }`; `f_Timeline.ReadOnly` → `&readOnly=1` / `SetTimelineId`
payload → `store.readOnly`, which hides every add / edit / delete affordance (strip, context
menus, boundary flags, item view Edit, note input), routes Shift+click / Edit to the view popup,
keeps filters and the distance tools, skips the update check and window-state persistence, and
never steers the active timeline's year calendar. Host: `FormClosing` returns early while another
visible `f_Timeline` is open, and a read-only window skips `NotifyTimelineClosing`.
Step 2 done for 1.0.3 (2026-09-20): `store.reference` (`loadReference` / `clearReference`,
session-only) → `TimelineCanvas.referenceLayer` (ghosts at 0.4 under grid + items, active time→x
mapping + display-only `shift`, own lanes/caches, no filters / minimap / mini mode, Alt+click →
`viewReferenceItem` → view-only `TimelineItemViewModal`, plain / right-click inert), a
"Reference — <title>" section in `TimelineDataPanel`, calendar-mismatch warning (never blocks) and
Remove in `ReferenceTimelineModal`, tool-active Reference button on the strip. Not done: shift is
not persisted; ghost pictures are frames without images; no locate / pulse for reference items.

Writers often need a second timeline for reference while working in one. New activity-strip icon
**Open reference timeline** (and `R`): a modal lists the other timelines and offers two ways to
open the chosen one.

### Step 1 — read-only window

A second `f_Timeline` opened with a `readOnly` flag (URL param → `TimelineApp`): no add / edit
affordances, no drag, no context-menu add, items open in the view popup only. Host fixes needed:
`F_Timeline_FormClosing` must not return to `f_Main` / prewarm while another timeline window is
still open, and `NotifyTimelineClosing` must only close the closing window's own children.

### Step 2 — underlay

The reference timeline's items are drawn on their own Konva layer under the active timeline's
items, semi-transparent, through the active timeline's time → x mapping (so hidden ranges and
zoom apply to them too). Rules:

- Different calendars are **allowed**, with a warning in the modal that the data may come out
  misaligned (different year lengths, week structure, year 0). The user decides — they may only
  use the Years LOD, or have near-identical calendars.
- Optional **shift by N years** in the modal: display-only offset applied when opened, never
  saved to the reference timeline.
- Reference items ignore the active timeline's filters and are not on the minimap.
- Hover shows the tooltip; `Alt`+click opens the item in the view popup (never the edit window).
- The data panel gets a separate **Reference** section below the active timeline's data.
- Closing the underlay = a button in the strip icon's flyout / the same modal.

---

## [BL-60] Calendar window — more functionality

**Status:** First item done (1.0.3): the month grids (`CalendarMonthGrid.vue`, used by the
year-calendar window and the timeline's calendar overlay) are `user-select: none`, so dragging
across days no longer highlights the numbers. Open for more; nothing else defined yet. (1.0.3
also added **Export** to the editor header via BL-59.)

The calendar windows (`f_YearCalendar` / `YearCalendarApp.vue`, `f_Calendar` / `CalendarApp.vue`)
need more than they have today; ideas to be collected here as they come up.

- ~~Day numbers should not be selectable as text~~ — done (1.0.3).
- Later: click events on days (open / add items on that date, jump the timeline there).

---

## [BL-39] Extended keyboard shortcuts

**Status:** Done for 1.0.3 (2026-09-20); `R` landed with BL-66 step 1. Shipped as designed with
two deviations: the type picker's Note key is `O` (`N` = last type, `P` = Period), and the pan
speed setting lives in Timeline settings → **General** next to the mouse pan settings
(`settings.keyboard_pan_speed`, migration 7). Also added: the `?` flyout's Shortcuts entry, F1 /
F2 in the edit and both calendar windows, title autofocus on open, and Ctrl+Z actually wired
(it was documented in Help but never implemented). Power-user set still empty.

Common timeline actions should have keyboard shortcuts so power users never need to reach for
the mouse for routine operations.

### Architecture — fixed keys now, user-remappable later

- `utils/shortcuts.ts` is the single registry: `{ id, keys, group, label, context, inInputs? }`
  per shortcut (`keys` is a normalised chord such as `Ctrl+Shift+S`, `F2`, `ArrowLeft`).
- Each window calls `useShortcuts(context, handlers)`: one `keydown` listener that normalises
  the chord, looks it up, applies the focus rule and calls `handlers[id]`. Handlers are the
  functions that already exist (`store.lodZoomIn`, `toggleMiniMode`, `showSettings = true` …).
- The **Shortcuts** modal (F2, and the third entry in the `?` flyout beside Help / About)
  renders straight from the registry, grouped, so it can never drift from what fires.
- Later: the registry's `keys` become defaults, user overrides live in app settings, the same
  modal gets an edit mode. No handler changes.

### Focus rules

- While an input / textarea / select / contenteditable has focus only Ctrl/Alt chords and
  F-keys fire; bare letters, digits, Space and arrows belong to the field.
- `Esc` in a field blurs it (next key is a timeline shortcut again); elsewhere it closes the
  topmost modal / menu as today.
- While a modal is open, timeline shortcuts are off except `Esc` (`BaseModal` keeps an open
  counter).

### Shortcuts

**Timeline window**

| Group | Shortcut | Action |
| ----- | -------- | ------ |
| Navigation | `←` / `→` | pan at a constant pace while held (setting: Timeline settings → General → Keyboard Pan Speed, px/s) |
| | `Shift+←` / `Shift+→` | pan 3× faster |
| | `↑` / `↓` | forward / back one tick (same code as the wheel) |
| | `Shift+↑` / `Shift+↓` | forward / back one year (same as Shift+wheel) |
| | `+` / `-` | zoom in / out one LOD |
| | `Home` / `End` | jump to the timeline start / end boundary if the timeline has them, otherwise to the first / last item |
| | `G` | focus the jump-to-year box |
| Items | `N` | new item — opens the type picker (see flow below) |
| | `Shift+N` | new item of the last used type, no picker |
| | `Ctrl+Z` | undo last deletion (was documented, now implemented) |
| Panels / windows | `F` | filter panel |
| | `T` | tags |
| | `Y` | year calendar |
| | `M` | mini mode |
| | `Shift+M` | mass add items |
| | `R` | open a reference timeline (BL-66 step 1 — done) |
| | `Ctrl+,` | timeline settings |
| | `Ctrl+Shift+A` | actions menu |
| App | `F1` / `F2` | Help / Shortcuts |
| | `F10` / `F11` | custom scaling / fullscreen (exist) |
| | `Esc` | close / blur |

**Edit item window**

| Shortcut | Action |
| -------- | ------ |
| `Ctrl+S` | save and close (exists); `Ctrl+Enter` inside a text field does the same |
| `Esc` | cancel (exists) |
| `Tab` power path | title → description → end date (Period / Age only) → tags; Shift+Tab reverses it; after tags Tab follows normal order |
| `F1` / `F2` | Help / Shortcuts (also from the calendar windows) |

### Streamlined add flow

`N` opens a small type picker (Event / Period / Age / Picture / Note, canvas-menu order) with key
hints: `1`–`5` or `E P A I O` (Note is `O`); `N` again = last used type; `Esc` cancels. The choice opens the
edit window through the existing `OpenAddEditItemWindow` with `typeId`, `year` = current NOW
year and `granularity` = current LOD. The title is focused and selected on open, the Tab power
path leads through the fields that matter, `Ctrl+S` saves and closes, focus returns to the
timeline (1.0.3 fix). `Shift+N` skips the picker. The last type is remembered per session.

Space was rejected as the add key: it re-fires whichever button last had focus and every
checkbox / button would need guarding.

### Power-user set

A second, larger tier of shortcuts for power users, on top of the table above. List to be
filled in as they come up (2026-09-19):

- _(none yet)_

---

## [BL-23] App icon

**Status:** Placeholder in place. Pending commission of final artwork.

The application currently uses a placeholder icon. A proper icon (`.ico` with
16/32/48/256px variants, plus a matching `favicon` for the WebView2 shell) should be
provided.

> In the `.csproj`, set `<ApplicationIcon>` to the `.ico` path. The icon will appear in the
> taskbar, Alt-Tab switcher, and the title bar of any non-borderless window. For the
> borderless windows a small SVG/PNG version can be shown in the Vue title bar next to the
> window title.

---

# Major — 1.1.0

New moving parts; each needs its own design pass before code.

## [BL-18] Audit follow-ups — known issues deliberately not fixed yet (good to know)

**Status:** Substantially resolved; moved to 1.1.0 (2026-09-20) because what is left is
internal. All 10 planned items addressed; since then also done: 30 s bridge request timeout
(FC-C1, `api.ts`), deleted items' Konva nodes destroyed (TC-H1), minimap static + dynamic layers
(TC-H2), icon convention settled — CLAUDE.md now says Phosphor for everything new, Remix only
survives in the older components, no sweep. Still open, none user-visible: status-discriminated
bridge response types (FC-C1 deeper fix), heavy handlers on the UI thread (H1 — only
`CheckForUpdates` uses `Task.Run`), gallery panel re-fetching `GetItemForEdit` (TC-H5), z-index
token scale.

### Data integrity — RESOLVED

- ~~**V2 backup import silently drops entire tables** (DB-C2)~~ — **Fixed.** `DatabaseImporter.ImportV2Backup` now restores lod_profiles, layout_settings, filter_presets, notes, timeline_hidden_ranges, and timeline_filter_rules. Copy order correct.
- ~~**V1 import writes character↔event links into a dead table** (DB-H1)~~ — **Fixed.** V1 import now maps `item_characters` → `item_character_appearances` correctly.
- ~~**`SetDataRoot` can silently create a fresh empty DB** (L5)~~ — **Mitigated.** `AppSettingsModal.vue` shows a warning before the action ("Use this folder will load whatever data already exists there") and informs the user after if `isNewDb` is true. Not a blocking issue.

### Bridge / architecture (still pending)

- **`request()` offline path now rejects** (FC-C1 partial): the `resolve(null)` in the no-WebView2
  branch is replaced by `reject(Error)`, and a hung request rejects after 30 s. The deeper fix (status-discriminated response types
  so backend error payloads also reject) is still pending — callers must still manually check
  `?.status === 'error'` for production error responses.
- **All handlers run synchronously on the UI thread** (H1): a big timeline load or media-folder
  move freezes the window. Wants `Task.Run` + marshalled replies for the heavy handlers.
- ~~**`ShowDialog` inside WebMessageReceived** (H2)~~ — **Fixed.** All dialog calls wrapped in `BeginInvoke`.
- ~~**`MoveDataFolder`/`CreateBackup` copy a live SQLite file** (H5)~~ — **Fixed.** `CreateBackup` uses `VACUUM INTO`; `MoveDataFolder` now uses `ItemRepo.VacuumInto()` instead of `File.Copy`.
- ~~**`GetTimelineStories` name is misleading** (CT-M1)~~ — **Fixed.** Renamed to `GetAllStories`.

### Dead weight — RESOLVED

- ~~**`SettingsApp.vue` is broken boilerplate** (PG-C2)~~ — **Deleted.** `SettingsApp.vue`, `settings.ts`, `settings.html` removed; vite entry removed.
- ~~**Dead layout settings render in the Settings UI but are consumed nowhere** (TC-C2)~~ — **Fixed.** Hover Line group, `TimelineJumpToYearAnimationLength`, `TimelineTickMarkerFontSize`, `TimelineNonYearTicksSmaller` are all wired into the canvas.
- ~~**Dead backend code**: `SaveItemWithTags` in `Database/ItemRepo.cs`~~ — **Deleted.** Method removed entirely. `GetTimelineItems` and `InsertDefaultPreset` already removed.
  Note: `relationship_types`, `timeline_calendars`, and `item_characters` are reserved schema
  for future modules (BL-17 character relations, multi-calendar support, character event links)
  — not dead, do not remove.

### Custom-calendar correctness (core-feature gaps)

- ~~**`LodDateInput` hardcodes Gregorian month lengths** (MD-H3)~~ — **Fixed.** `MONTH_LENGTHS` and `SEASON_NAMES` constants removed. New props `monthLengths`, `seasonNames`, `weekCount` added. `EditItem.vue` now calls `parseCalendarDef(YearDefinition)` and passes all four values to both date inputs.
- ~~**NotesPanel distance math hardcodes Gregorian** (TC-M13/FC-H4)~~ — **Fixed.** `formatSpecific` now decomposes via `store.calendarConfig.months` (actual month lengths from `startDay` differences) and `cfg.weekLength`. `formatApproximate` uses `cfg.yearLength`, `cfg.months.length`, `cfg.seasons.length`, and derived weeks-per-year. `formatPoint` now uses `store.activeFormatRegistry` instead of the static module-level `FormatRegistry`.

### Store correctness — RESOLVED

- ~~**`loadFilterPreset` resurrects old rules** (FC-H1)~~ — **Fixed.** DB writes (delete old, save new) now complete before in-memory state is updated, so a failure leaves the store consistent with what's actually in the DB.
- ~~**Concurrent `loadTimelineData` calls tear state** (FC-H2)~~ — **Fixed.** Sequence token check added after the second `await Promise.all` (filter rules + misc settings), not just after the first bridge call.
- ~~**Filter data maps go stale after item edits** (FC-H3)~~ — **Fixed.** `upsertItem` now accepts tag/character/story link arrays and `hasPicture` flag; `ItemSaved` push extended in `HandleSaveItem` to include `ItemRepo.GetItemLinksById()` output so all four filter maps stay current after every save.

### Performance (canvas stack)

- ~~**Minimap rebuilds its entire Konva scene per mouse-move** (TC-H2)~~ — **Fixed.**
  `TimelineMinimap.vue` keeps a static content layer and a `dynamicLayer` for the NOW line /
  viewport rect.
- ~~**Deleted items' Konva nodes are hidden, never destroyed** (TC-H1)~~ — **Fixed.** `evictNode()`
  in `TimelineCanvas.vue` destroys the cached nodes on delete and on `upsertItem`.
- **DataPanel + GalleryPanel double-fetch `GetItemForEdit` per item per pan** (TC-H5): the data
  panel has its own `pictureCache`; the gallery panel still fetches on its own. Wants one shared
  cache keyed by item id.

### Styling consolidation (staged plan in AUDIT_FINDINGS §8)

- ~~**No design tokens; three competing accent systems; two surface systems** (ST-H1–H4): ~230
  colour literals, 9 backdrop darknesses, a z-index ladder with real conflicts, no global
  font-family (some windows fall back to serif).~~ **DONE** — `:root` token block in `main.scss`
  (`--app-bg/surface/border/text/accent` family + new `--app-save-accent`, `--app-danger`);
  `font-family: system-ui` + global scrollbar rule added; 18 component/page `<style>` sections
  swept; `canvasTheme.ts` created so Konva reads tokens at runtime; `applyAppTheme` clears
  canvas cache on theme change; `ChromeTheme` (TS + C#) includes save-accent. Remaining bare
  literals are intentional: DB-stored LayoutSettings defaults (TimelineSettingsModal script),
  canvas context-menu semantic colours (dark-canvas overlay), and data-driven item colour
  fallbacks. z-index scale and icon convention sweep deferred — separate effort.
- ~~**`BaseModal` extraction** (MD-H1/H2): ~700 lines of duplicated modal chrome across 11 modals
  with inconsistent Escape/backdrop/z-index behaviour.~~ **DONE** — `BaseModal.vue` created; 12 of 13
  modals converted (backdrop + panel + Escape key + `#header`/`#footer` slots). `TimelineItemViewModal`
  intentionally skipped (themed viewer, incompatible design).
- ~~**Icon convention**: 19 of 20 modal/picker files contradict the CLAUDE.md Remix-vs-Phosphor
  rule — at this scale, decide whether to fix the components or change the convention.~~
  **Settled (2026-09-20)** — the convention changed to match the code: Phosphor for everything
  new, Remix stays in the older components until touched. No sweep.

---

## [BL-15] Characters module

**Status:** Pending. Large feature.

Full character management: create/edit characters with biography fields, birth/death dates, states (alive/deceased/unknown), attachment to timeline items, exportable as a character-specific event timeline, and filterable.

> **Aside:** The DB schema already has `characters` and `character_appearances` tables, so the data layer is partially in place. The main work is the UI. Key screens needed: (1) character list with search/filter; (2) character detail/edit form (biography, dates, color, portrait image); (3) character appearances timeline — a filtered view of the main timeline showing only items where that character appears, which is essentially just BL-03 filter applied to one character. The "state" system (born/alive/deceased) should tie into the item dates where possible — if a character has a "death" event, the state should auto-update. The "export as timeline" feature is high value: it lets a writer hand a character's journey to someone else without exposing the full world history.

---

## [BL-17] Character relations screen

**Status:** Pending. Depends on BL-15 (Characters module).

A visual network graph showing characters and their relationships (family, rival, ally, etc.), centered on a selected character, with relationship types as labeled edges.

> **Aside:** This is a graph visualization problem. Konva.js can draw this but a dedicated force-directed graph library (D3.js `d3-force`, or vis.js Network) would produce much better layouts automatically. The data model needs a `character_relationships` table: `(character_a_id, character_b_id, relationship_type, notes, start_year?, end_year?)`. Relationship types should be configurable (not hardcoded), since every story world has its own social structures. The UX pattern of "center on a selected character and show their direct connections" is the right starting point — expanding outward one degree at a time (click a connected character to recenter). A full graph of all characters at once becomes unreadable quickly. Worth also thinking about time: if relationships have start/end years, the graph should respond to the timeline's current time position (or have its own time scrubber) to show the relational state at a given point in the story.

---

## [BL-44] Integer time model for ticks, labels and item positions

**Status:** Pending. Agreed design; separate effort from the per-LOD label fixes.

Tick labels are derived by rounding a floating-point year fraction back to a calendar unit
(`toDayRaw = Math.round(f * yearLength)` in `buildFormatRegistry`, `timelineLayout.ts`), and each
LOD carries a free-form `stepFraction` (`1/seasons.length`, `weekLength/yearLength`, user-typed
values like `1/525600`). Any fraction that does not divide the calendar evenly produces wrong or
useless labels — a 3-season calendar's SEASONS LOD only ever shows the first season, a minutes LOD
labels nothing meaningful.

Replace the fraction-first model with an integer one:

- Canonical sub-year unit is integer **day-of-year** (0-based) derived from the calendar
  (`YearDefinition`). Every LOD is a list of *boundary days* computed from the calendar rather than
  a fraction: MONTHS → each month's start day, SEASONS → each season's start day, WEEKS →
  `k * weekLength`, DAYS → every day. `stepFraction` survives only as the zoom scale that decides
  which LOD is active.
- `renderGrid` (`TimelineCanvas.vue`) iterates whole years, then that LOD's boundary days within
  each visible year, instead of stepping `i * targetStep` and rounding.
- Label formatters take `(year, day)` — no rounding path.
- `EditItem.vue` / `LodDateInput.vue` store day-of-year; `AbsoluteStart = year + day / yearLength`
  (same for end). Items saved at MONTHS/SEASONS granularity under the old model
  (`Year + monthIndex / 12`) need a one-time re-snap migration to the nearest boundary day.
- Sub-day LODs (hours/minutes) are out of scope; the model should not prevent adding a
  `dayFraction` later.

---

## [BL-41] Dual year labels (year offset)

**Status:** Pending. Do after BL-44 (integer time model) — no point reworking the axis labels
twice.

Let a timeline show a second year numbering: below the axis the native years (0, 1, 2 …) and
above it the same ticks with a configurable offset (e.g. 1450, 1451, 1452 …), so writers can
work in an in-world era while keeping a real-world (or second calendar) reference.

- Per-timeline setting: `year_offset` (integer) + `year_offset_label` (optional short prefix /
  suffix such as "AD" or "AE"), edited in Timeline Settings.
- `renderGrid` draws the offset label mirrored above the axis for YEARS-and-coarser ticks;
  sub-year LODs keep a single label row (the offset only changes the year part).
- Cursor label and jump-to-year input keep working in native years; the offset is display-only.
- Related to the reserved `timeline_calendars` table (multi-calendar) — a full second calendar
  is out of scope here, this is a pure numeric offset.

---

## [BL-63] Full-calendar view of memorable days

**Status:** Pending. Later — after BL-46.

A large calendar view (year grid, `CalendarYearView.vue` / `CalendarMonthGrid.vue` already draw
one) that shows every memorable day of the calendar in place, as an alternative to the editor's
list. Possibly the same view doubles as the editor: click a day to add / edit a memorable day.

---

## [BL-42] Data panel and image panel — display options and pop-out windows

**Status:** Pending. Needs design discussion before implementation.

The data panel (`TimelineDataPanel.vue`) and gallery panel (`TimelineGalleryPanel.vue`) are
locked into the splitpanes layout and always show the same row / tile layout. Investigate:

- Custom display logic: user-selectable row density (compact / normal / cards), column choice,
  sort key, and which item types are listed; gallery tile size and grouping (by item, by year).
- Pop-out: open either panel in its own borderless WinForms window (same pattern as
  `f_YearCalendar` — own HTML entry point, `OpenXWindow` bridge action, position persisted in
  `settings`), kept in sync with the timeline viewport via push messages.
- Decide whether the popped-out panel replaces or duplicates the in-window one.

---

## [BL-13] Configurable incremental backup system

**Status:** Pending. Depends on evaluating scope.

Replace/supplement the current manual full-copy backup with a more granular change-tracking system, similar in spirit to git — only recording what changed since the last recorded state.

> **Aside:** Full git-style content-addressable storage is probably overkill. A practical middle ground: on each app close (or on a configurable interval), write a "change journal" file containing only the rows that differ from the last snapshot. Rows are identified by ID + a hash or modification timestamp. The "last recorded state" can just be a stored hash of each row's content in a `backup_state` table — on backup, compare current rows against stored hashes, write only changed/added/deleted rows to the journal. Restoring means replaying the journal or reverting to the snapshot. The most important thing to get right is the restore UX — it should be a browsable history ("show me the state from 3 sessions ago") not just a single rollback point. SQLite's WAL mode actually gives you some of this for free within a session, but across sessions you need the journal approach. Worth also keeping the manual full-copy backup as a "nuclear option" alongside this.

---

## [BL-12] Usage statistics and milestones

**Status:** Framework done. Content pending. Deferred — collaborative effort required for achievement definitions, character tier content, and portrait assets.

Stats DB (`usage.sqlite` next to exe), session tracking, fire-and-forget item/activity event recording, DB-driven achievement definitions, character progression tables, achievement/milestone toast system (Steam-style lower-right + shimmer top-center), Web Audio chimes, DevTools console helpers (`window.__stl`), app settings toggles, and Vitest coverage all in place.

Remaining: fill in real achievement definitions (flavor text, trigger criteria), real DnD character definitions with tier ladders, and character portrait images in `Resources/`.

> **Aside:** The statistics data collection is best done in two layers: (1) session-level events stored in memory (start time, focus/blur timestamps via `window` events, item-add count) flushed to the DB on close; (2) aggregate DB queries for historical stats (items per timeline, density distributions, active days). The statistics screen can use a charting library — Chart.js is the obvious lightweight choice given we're already using Vue; Recharts if we want more control. The achievements system is genuinely fun and worth doing right — a small set of carefully chosen milestones ("first item", "100 items", "first import", "timeline spanning 1000 years", etc.) with cosmetic unlocks. Store earned achievements in a DB table with timestamp. The "character progression" angle is interesting — could tie achievement points to an in-universe character who grows alongside the writer's project. Keep this entirely optional and silent (no pop-ups, just discoverable in the stats screen) to avoid being annoying.

---

# Long-term / deferred

## [BL-53] Power-user console

**Status:** Deferred (2026-09-20) — no console-only features exist yet, so step 2 waits until
there are commands worth a console. Step 1 stays as is: `__stl.lodLevels()` and
`__stl.setAllLodMask(levels)` (BL-54) joined the `__stl` helpers and `__stl.help()` lists them;
levels are named (`['years','decades']` or `'all'`, prefixes accepted), never a raw bitmask.

Today the DevTools console exposes `window.__stl` helpers (`devHelpers.ts`). Two steps:

1. Grow that into a documented power-user namespace (`__stl.<command>`), starting with BL-54.
2. Later: an in-app toggleable command console (hotkey, small overlay at the bottom of the
   timeline window) that runs the same commands without DevTools, with completion and history.

---

## [BL-16] The Map feature

**Status:** Pending. Major long-term feature.

A multi-layer interactive map screen: a world map containing regions, each region drillable into a sub-map, locations pinned on each map, locations linked to items/events, time-scrubbing to animate events and character movement across the map over time.

> **Aside:** This is the most architecturally complex feature in the backlog by a significant margin. The data model alone needs careful design: a tree of map layers (world → region → sub-region), map images per layer (uploaded by the user), locations (x/y coordinates on a specific layer's image), and associations between locations and timeline items / characters. The time dimension is what makes this special — a scrubber that moves through the timeline and highlights which events are "current", with character movement paths drawn as animated lines between locations. For the canvas, Konva.js could handle this (we already use it for the timeline) but something like OpenLayers or Leaflet would give better image-overlay and zoom/pan behavior for map-style navigation. I'd strongly recommend a dedicated design sprint for this one before any code is written — the scope is large enough that getting the data model wrong early would be expensive to undo. Start with static display (locations visible on map, click to see linked events) before tackling the time animation.

---

## [BL-31] Celestial data — lunar cycles, stars, and astrophysical calculations

**Status:** Pending. Long-term / speculative — nice to have, not critical.

Allow a world's calendar to define one or more moons and notable celestial bodies. The app
computes and displays phase information on the calendar views (BL-28, BL-29) so a writer can
track which moon is full on any given story day without manual arithmetic.

### Data model (proposed)

Stored as JSON in a new `celestial_config` column on the `timelines` table (or a sibling
`timeline_celestial` table if multiple bodies per timeline is cleaner).

**Moon definition:**

```json
{
  "name": "Aethon",
  "synodicPeriodDays": 28.5,
  "phaseOffsetDays": 0,
  "color": "#e8d5a3"
}
```

- `synodicPeriodDays` — full cycle length in calendar days (fractional allowed).
- `phaseOffsetDays` — the day-of-absolute-time at which this moon was at new moon (phase = 0).
  Lets the writer "anchor" the cycle to a specific story date.
- `color` — optional tint for the phase icon.

**Star / celestial event definition:**

```json
{
  "name": "The Wandering Eye",
  "type": "recurring",
  "periodDays": 365,
  "firstOccurrenceDayOfYear": 180,
  "durationDays": 3,
  "description": "Visible at dusk for 3 days each year"
}
```

Recurring events repeat every `periodDays` days starting from `firstOccurrenceDayOfYear`.
One-off events have `type: "fixed"` with an absolute day.

### Phase calculation

For a moon at absolute day `D`:

```ts
phaseAngle = ((D - phaseOffsetDays) % synodicPeriodDays) / synodicPeriodDays  // 0..1
```

Map to 8 standard phases: new (0), waxing crescent, first quarter, waxing gibbous, full (0.5),
waning gibbous, last quarter, waning crescent. Phase icons are SVG — a circle with a
light/dark hemisphere split at the computed angle, rendered purely in CSS/SVG (no image
assets needed).

### Calendar integration (BL-28 / BL-29)

- In the calendar overlay (BL-28) and year calendar (BL-29), each day cell can show a row
  of small phase icons (one per moon) beneath the day number.
- Hovering a phase icon shows a tooltip: moon name + phase name + days to next full/new moon.
- Recurring celestial events appear as a small coloured dot on their active days, with a
  hover tooltip giving the event name and description.
- A settings toggle (per calendar, not global) controls whether celestial data is shown —
  off by default so it doesn't clutter the default calendar view.

### Configuration UI

A new "Celestial" section in the timeline's calendar settings (alongside months, seasons,
weeks). Add / remove moons and recurring events. Each moon has: name, synodic period, phase
anchor date picker, colour. The anchor date picker reuses `LodDateInput` at DAY granularity.

### Scope notes

- No orbital mechanics beyond the synodic phase formula — no elliptical orbits, no
  gravitational interactions, no eclipse prediction. Pure periodic phase arithmetic.
- Tidal effects, planetary visibility windows, and constellation tracking are explicitly
  out of scope (interesting but too open-ended for now).
- The formula works for any `synodicPeriodDays` value, including non-integer periods, so a
  world with a 13.7-day moon and a 41-day moon works correctly.

---

## [BL-33] Session changes export and import collision screen

**Status:** Pending — nice-to-have, defer to post-v2.0.

### Session changes export

A per-session diff export that captures every insert, update, and delete made to a single
timeline during one open-to-close session. The resulting file (`.stlc` — StoryTimeline
Changes) can be handed to a co-writer, who applies it to their own copy of the same timeline.

**Mechanism (preferred approach — no triggers):**

At session open, snapshot the timeline's item rows into a temp table. On export, diff current
state against the snapshot:

```text
op=insert  → row exists now, did not exist in snapshot
op=update  → row exists in both, differs
op=delete  → row existed in snapshot, no longer exists
```

The resulting change file carries the full row for inserts/updates, and just the ID + `"delete"`
marker for removals. Applying it on the receiving side: upsert inserts/updates, hard-delete
deleteds. Scope: items, item_tags, item_story_refs, item_character_appearances. Not timelines
or settings (those are per-installation, not per-session changes).

**Alternative (trigger-based):** `AFTER INSERT / UPDATE / BEFORE DELETE` triggers write
`(table, row_id, op, ts)` rows to a `change_log` table. Higher write overhead, richer
intra-session granularity (every individual edit recorded, not just net result). Prefer the
snapshot diff approach unless replay fidelity becomes important.

### Import collision screen

When applying a session changes file, detect rows where `op=update` or `op=delete` and the
local copy was also modified since the session export timestamp. Present a simple side-by-side
comparison (incoming vs local) with per-item radio buttons: **Keep incoming / Keep local /
Skip**. Default: keep incoming (last write wins). A "Select all incoming" / "Select all local"
bulk toggle keeps the flow fast for users who just want to accept everything.

This screen applies equally to any future import path that involves per-item merging (not just
session changes).

---

## [BL-34] In-app manual / help system

**Status:** Pending — important but not urgent, defer to post-v2.0.

A tabbed, searchable in-app manual covering every module. Accessible via a Help button in the
main toolbar and a `?` button in each major panel (deep-links to the relevant tab).

### Structure

One top-level tab per module:

| Tab | Covers |
| --- | --- |
| Getting started | Installation, first timeline, key concepts |
| Timelines | Creating, editing, calendar settings, layout settings |
| Items | Events, periods, ages, notes, bookmarks, pictures |
| Characters | Character cards, relationships, appearances |
| Stories & books | Story/book/chapter linking, cross-references |
| Canvas | Zoom, pan, LOD, filters, minimap, performant panning |
| Export & backup | All four export types, import behaviour, backup schedule |
| Keyboard shortcuts | Full reference table |
| Changelog | Version history, notable changes |

### Content format

Markdown rendered inside a scrollable panel (same WebView2 surface, a new HTML entry point
`help.html`). Source files live in `Frontend/src/help/` — one `.md` per tab, compiled into
the Vue bundle at build time. This keeps the help content version-controlled and diffable
alongside the feature code that it documents.

### Search

A single text input searches across all tab content. Matches highlight inline; the tab
containing the most matches activates first.

### Deep-linking

Each section header has an anchor. The `?` buttons in individual panels send
`OpenHelp({ tab: 'canvas', anchor: 'lod' })` through the bridge, which opens the help window
and scrolls to the right section.

---

## [BL-07] Calendar change — item position behavior

**Status:** Deferred — probably not important to revisit.

When a timeline's calendar is changed (e.g. from 365-day to 200-day), sub-year items have positions that may no longer align to valid ticks in the new calendar. Decide: snap to nearest valid tick, or allow floating positions?

> **Aside:** My recommendation is snap-to-nearest, with a warning dialog before the change is applied listing how many items will be affected and their new positions. Floating items are worse — they create invisible or mislabelled ticks and confuse the canvas layout math. The snap formula is simple: `newDayOfYear = round(oldAbsoluteStart_fraction * newYearLength)`, clamped to `[0, newYearLength - 1]`. Items at YEAR granularity are unaffected. Items at MONTHS/SEASONS granularity snap to the first day of the nearest equivalent month/season in the new calendar (harder to define for custom calendars — may just snap to day). One open question: should this be reversible? If you switch calendars twice, positions may drift each time. A "store original absolute fraction" field would let you recompute from scratch on any calendar change, but adds schema complexity.

---

# Done

Kept for the record, in number order.

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

**Status:** Done. Subtick columns removed from DB schema (`DbInitializer.cs`), clone SQLs (`TimelineRepo.cs`), and all import paths (`DatabaseImporter.cs`). V1 legacy import computes `absolute_start = year + subtick/10.0` inline before inserting (no subtick written to destination). V2 ATTACH import detects and computes absolute_start from subtick when source has it. `ApplyLegacyMigrations` simplified — no subtick references remain. All tests updated and passing.

### Background

Items currently store their timeline position as:

```text
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

| Field       | Type | Meaning                                              |
|-------------|------|------------------------------------------------------|
| `Year`      | int  | Calendar year (unchanged)                            |
| `DayOfYear` | int  | 0-indexed day within the year (0 to yearLength - 1)  |

`AbsoluteStart` becomes a computed value: `Year + DayOfYear / yearLength`.

This has several benefits:

- Position has an unambiguous calendar meaning independent of any LOD profile
- `DayOfYear / yearLength` involves only small integers (DayOfYear < yearLength), so float precision is excellent at any year value
- The label for an item's date is trivially `Day (DayOfYear + 1)` without any floating-point lookup
- Future sub-day precision can be added as `TimeOfDay` without changing the model

**What granularity is stored?** The `CreationGranularity` (LOD index) stays as a metadata hint for display purposes (e.g., should this item's date show down to the day, month, or just the year?). But the stored position is always at the finest available granularity for that LOD level — DayOfYear for a DAYS creation, or `0` for a YEARS creation.

### Migration path from old Subtick

**Legacy import (Subtick 0–9):**

```text
DayOfYear = round(Subtick * yearLength / 10)
```

Maps each of the 10 positions to the nearest calendar day.

**Current Subtick (0 to ~maxSubticks):**

```text
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

**Status:** Done. Collapsed strip renders as dark translucent rect with solid 2px side borders (no diagonal stripes). Expanded zone renders as faint diagonal-stripe overlay across the full height with dark solid borders and a dark pill collapse button with white text. Scroll wheel and shift-scroll skip over hidden ranges using `skipHiddenRange()` (snaps to first tick strictly outside the range). Tick grid misalignment after hidden ranges fixed by snapping each visual tick's `visualToAbsolute()` result to the nearest absolute grid position (`seenAbsTicks` Set deduplicates).

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

## [BL-14] Top-level menu system

**Status:** Closed (2026-09-20) — superseded by the icon sidebar. The left activity strip
(`TimelineActivityStrip.vue`, BL-38 era) is the app's navigation: Timeline active, Characters /
Map / Search / Statistics ghosted until their modules exist, help flyout and settings at the
bottom. No top menu bar is planned; new sections get a sidebar icon instead.

A persistent top-of-screen menu bar (or equivalent) providing navigation to all screens: item management, search, export options, map screen, characters, statistics, etc.

> **Aside:** This is an architectural decision as much as a feature. Currently the app uses separate WinForms windows for different views, which means each has its own WebView2 instance, its own state, and its own load time. A top menu that navigates within a single SPA would be faster and more cohesive, but requires collapsing the multi-window model. I'd suggest a hybrid: keep separate windows for the timeline canvas (which genuinely benefits from being its own resizable window) but move everything else into a single SPA shell with in-page navigation. The menu itself: a thin horizontal bar at the top with icon + label buttons (Timeline, Characters, Map, Search, Statistics, Export). This is a prerequisite for several other BL items that need a "home" screen.

---

## [BL-19] Thinner resize border rim

**Status:** Done. `ResizeBorder` constant in `BorderlessFormBase.cs` reduced from 5 → 2.

The borderless window's resize rim (currently 5px sides + 5px bottom via `Padding`) is visible
as a dark strip. Reduce to 1–2px so it is a subtle hit-target only, not a visible border.

> The padding value lives in `BorderlessFormBase.cs` (`Padding(5,0,5,5)`). WM_NCHITTEST
> already returns HTLEFT/HTRIGHT/HTBOTTOM for any pixel within that rim, so reducing the value
> directly shrinks both the visual size and the hit-target width equally. Test resize usability
> at 1px vs 2px — 1px can be hard to grab reliably on high-DPI displays.

---

## [BL-20] Review and remove CreationGranularity field

**Status:** Closed — field is actively used, keep it.

Grep confirmed `CreationGranularity` is load-bearing: it records which LOD level the item's
date was entered at (0=Millennia … 7=Days), drives the sub-year step fraction used to compute
`AbsoluteStart`/`AbsoluteEnd` on save, feeds the `<select>` in the edit form, and is passed
as `:lodIndex` to two `LodDateInput` instances. Removing it would break date precision for
all sub-year items. No action needed.

---

## [BL-21] Title-bar double-click to maximize / restore

**Status:** Already done. `WindowTitleBar.vue` has `@dblclick="toggleMaximize"` on the drag
region and `toggleMaximize()` calls `BackendAPI.WindowMaximizeRestore()`, which routes to
`HandleWindowMaximizeRestore` in `MessageRouter.cs`. No work needed.

---

## [BL-22] Theme / colour scheme settings for the window chrome

**Status:** Done. Full `AppThemeModal.vue` with colour pickers for 10+ chrome properties (appBg, appSurface, appBorder, appText, etc.), dark/light presets, live preview via `applyAppTheme()`, and persistence through `SaveChromeTheme`.

Now that the title bar and resize rim are rendered by Vue, the window chrome participates
in the same theming system as the rest of the UI. A settings panel section (or a dedicated
"Window theme" picker) should expose at minimum: title bar background colour, title bar
text/icon colour, border rim colour. Bonus: pre-built dark/light/accent presets that cascade
into the existing timeline colour tokens.

> This is the natural companion to the design-token consolidation work in BL-18 (ST-H1–H4).
> Doing that token sweep first will make the chrome theme settings much cheaper to implement.

---

## [BL-24] Save and restore window maximized state

**Status:** Done. `window_maximized` column added to settings table (`DbInitializer.cs`), `WindowMaximized` property added to `SettingsItem.cs`, `SaveAppWindowState` updated in `SettingsRepo.cs`, `PersistWindowState` uses `RestoreBounds` when maximized, `RestoreWindowState` applies `FormWindowState.Maximized` on load (`f_Main.cs`).

Window size and position are already persisted via `AppConfig`, but the maximized state is
not. On relaunch after quitting while maximized, the window opens in normal size at the last
normal-size position.

> In `f_Main.cs` (and `f_Timeline.cs` if it has its own persistence), save
> `WindowState == FormWindowState.Maximized` to `AppConfig` on `FormClosing`, and on load
> call `WindowState = FormWindowState.Maximized` before `Show()` if the flag is set.
> Restore position/size from normal-bounds only — don't save maximized pixel dimensions.

---

## [BL-25] Bottom padding on the data/notes panel

**Status:** Done. `TimelineNotesPanel.vue` notes-list and dist-panel got 24px bottom padding. `TimelineDataPanel.vue` uses a `data-panel-spacer` div (80px, workaround for the Chromium flexbox overflow+padding-bottom bug).

The bottom of the data/notes panel content is flush against the panel edge with no breathing
room. Add a few pixels of bottom padding so the last item in the list doesn't feel clipped.

> The fix is a single CSS rule on the panel's scroll container. Likely `.notes-list` or
> `.data-panel-content` — inspect the rendered DOM to confirm the right selector.

---

## [BL-26] Data-panel item quick-view (pulsing highlight + read-only open)

**Status:** Done. Concentric-circle SVG focus button on each data-panel row, `store.pulseItem()` highlights the canvas node, `TimelineItemViewModal` opens read-only preview after 1 second. All wired up in `TimelineDataPanel.vue`.

Each item row in the data panel should show a small "focus" affordance — two concentric
circles (SVG, ~16×16px) — on hover. Clicking it should: (1) give the corresponding timeline
node a 1-second CSS pulse highlight to locate it visually, then (2) open the item in a
read-only view (not the full edit form).

> Implementation sketch:
>
> - Add an SVG icon in the row's hover-reveal slot (opacity: 0 → 1 on `.data-row:hover`).
> - On click, emit an event (or call a store action) with the item's id; `TimelineCanvas.vue`
>   adds a temporary CSS class / Konva animation to that node for 1 second.
> - "Read-only open" needs either a `readonly` prop on `EditItem.vue` that disables all inputs
>   and hides Save, or a separate lightweight `ViewItem` overlay — the latter is cleaner.
> - The bridge action `GetItemForEdit` already returns the full item; reuse it.

---

## [BL-27] Image lightbox open/close animation

**Status:** Done. `<Transition :css="false">` with four JS hooks (`onLbBeforeEnter/Enter/BeforeLeave/Leave`) in `TimelineDataPanel.vue`. Enter scales from `scale(0.05)` at the thumbnail's `getBoundingClientRect` center; leave reverses. Backdrop fades independently. `transform-origin` computed from thumbnail rect vs. image layout dimensions.

When an image in the gallery or data panel is clicked to open the lightbox, it should animate
smoothly (scale from the thumbnail's position/size up to the full view) rather than appearing
instantly. The close action should reverse the animation.

> Konva's `Tween` or a CSS `transform: scale()` transition on the lightbox overlay can handle
> this. If the lightbox is a DOM overlay (not a Konva layer), a CSS approach is simpler:
> set `transform-origin` to the thumbnail's viewport position, start at `scale(0.1)` with
> `opacity: 0`, transition to `scale(1)` + `opacity: 1`. The challenge is computing the
> origin point from the thumbnail's `getBoundingClientRect`. A Vue `<Transition>` with
> custom enter/leave hooks is the idiomatic approach.

---

## [BL-28] Toolstrip calendar overlay

**Status:** Done (canvas band overlay). Konva `Rect` bands rendered on the `gridLayer` background, showing one LOD level deeper than the current zoom (seasons at year-LOD, months at season-LOD, weeks at month-LOD, days at week-LOD). LOD detection uses step-fraction thresholds derived from `calendarConfig` (no hardcoded format key strings). Hidden in mini view. Toggle + 4 RGBA color controls (season/month/week/day) added to Timeline Settings modal. Five new DB columns in `layout_settings` with schema migration and preset defaults.

A new toggle in the left activity strip (calendar icon). When active, a floating panel appears
anchored to the upper-left corner of the timeline canvas. The panel shows a standard monthly
calendar grid that is always aware of the custom calendar system (`YearDefinition` — month
names, month lengths, any week structure).

### LOD-aware display

| Current LOD | What the calendar shows |
| --- | --- |
| Year / Millennium / Era | Month grid only — current month highlighted, no day/week selection |
| Season | **Season view** — four (or N) season tiles arranged horizontally or in a 2×2 grid, styled similarly to the calendar setup view. The active season tile gets a soft red highlight. Season boundaries are derived from `YearDefinition.seasons` (or evenly divided from `yearLength` if no explicit seasons are defined). |
| Month | Month grid, current month cell highlighted |
| Week | Month grid with the current week's row highlighted in soft red |
| Day or finer | Month grid with the exact current day cell highlighted in soft red |

"Current" means the calendar position corresponding to `store.centerAbsoluteTime`. The panel
must convert the absolute fraction to `(year, dayOfYear)` using the active calendar's
`yearLength`, then map `dayOfYear` to `(monthIndex, dayOfMonth)` using the calendar's
`monthLengths` array. For the season view, map `dayOfYear` to the season whose day-range
contains it.

### Animation / scroll behaviour

The highlight position should update with a soft CSS transition (`transition: background 0.35s ease`)
so that during rapid timeline scrolling the highlight fades between positions rather than
snapping. The panel itself should appear/disappear with a quick `opacity` + `translateY` fade
(`200ms ease`). Updates to the highlighted cell should be **debounced** (~150 ms) so the
calendar isn't recomputing every wheel event during fast scroll.

### Implementation sketch

- New toggle entry in the activity strip alongside the existing icons (use a calendar Phosphor
  icon for section/feature, Remix icon if it's purely a control).
- `CalendarOverlay.vue` — standalone floating component, `position: fixed`, top-left of the
  timeline canvas area. Receives `centerAbsoluteTime`, `lodIndex`, and the `YearDefinition`
  as props (or reads from the Pinia store directly).
- Month grid built from `monthLengths` — no hardcoded Gregorian assumptions.
- Highlighted cell / row determined by converting `centerAbsoluteTime` fraction to calendar
  coordinates; recomputed in a `computed` (or `watchEffect` with debounce).
- The panel's toggle state lives in the timeline's `LayoutSettings` or as a local UI ref —
  doesn't need to persist to DB unless it should survive page reload (probably not necessary).
- Season view is a separate layout mode — not a month grid with something highlighted, but
  a dedicated N-tile display reusing the visual language of the calendar setup screen (tile
  name, colour swatch if seasons are coloured, day-range label). The active tile animates
  with the same debounced soft-fade as the calendar highlight.
- If the calendar has no month structure (flat day-of-year only), fall back to showing a
  linear strip of day numbers for the current "month-sized" window instead of a grid.

---

## [BL-29] Toolstrip year-calendar window

**Status:** Done. Step 3 (gallery panel calendar tab): `CalendarPanel.vue` added as a third tab in `TimelineGalleryPanel.vue` with LOD-aware calendar context. Step 4 (floating year calendar window): `f_YearCalendar.cs` borderless WinForms form added with `yearCalendar.html` / `YearCalendarApp.vue` entry point; `PhCalendarDots` toggle button added to `TimelineActivityStrip`; `OpenYearCalendarWindow` / `GetItemsForYear` / `SetCalendarYear` bridge actions added; `CalendarMonthGrid` extended with `itemDots` prop for timeline-item highlighting; `ItemRepo.GetItemsByYear` added; year-calendar window position persisted in settings table. The previously-listed "Step 5 (CC-1/CC-2)" items are bridge error-path issues tracked under BL-18, not year-calendar specific.

A new toggle in the left activity strip (multi-calendar / year-grid icon — Phosphor, as it
represents a section/feature). Clicking it opens a dedicated side window (`f_YearCalendar.cs`,
a new borderless WinForms window) showing the full year calendar grid — identical in layout
to the year view already present in the calendar setup screen — but read-only for now.

### Content

- Full 12-month (or N-month for custom calendars) grid for the displayed year.
- Days that correspond to timeline items are **highlighted** (background tint using the item's
  colour or a default accent). Multiple items on the same day stack — show a count badge or
  dot cluster rather than overlapping.
- **Hover tooltips** on highlighted days: list item titles (and optionally types) for that day.
- The year shown in the calendar header tracks `store.centerAbsoluteTime`: when the user
  scrolls the timeline past a year boundary the calendar window year updates automatically.
  Use a debounce (~300 ms) so it doesn't flip mid-scroll.

### Window / integration

- The window is non-modal, stays open alongside the timeline window. Opened/closed via the
  toolstrip toggle; remembers its last position.
- Communication: the timeline sends a `SetCalendarYear` push message (fire-and-forget) whenever
  the debounced year changes; `MessageRouter.cs` forwards it to the calendar window's
  WebView2. The calendar window listens on the Vue side via `window.chrome.webview`.
- Item data: on open (and on year change) the calendar window calls `GetItemsForYear` (new
  bridge action) which returns items whose `Year` equals the requested year. Only year-level
  matching is needed for the day highlight; no sub-year precision required initially.
- The calendar grid itself is the existing Vue calendar component reused with a `readonly`
  prop; no new grid code should be written.

### Future work (not in scope now)

- Clicking a highlighted day could open a mini list of items.
- Navigation arrows in the header to manually step years without moving the timeline.
- Printing / export of the year view as an image.

---

## [BL-30] Day-of-week origin calculation for calendar grids

**Status:** Done. `year_start_dow` field exists in `YearDefinition` interface and is parsed into `calendarConfig.yearStartDow` (defaulting to 0 = Monday per user decision — no config UI needed). `getYearStartDow()` and `monthStartCol()` in `calendarMath.ts` consume the value. No separate DB column is needed; the field lives inside the calendar's `year_definition` JSON.

Currently the calendar grid renders all months starting on column 0 (Monday/first day of
week), which is only correct for year 0. In a custom calendar with `yearLength` days, each
year starts `yearLength mod 7` columns further along than the previous year, so M1 D1 of
year N lands on a different day of the week than M1 D1 of year 0. Without accounting for
this, every grid row is shifted by the wrong offset and days appear under the wrong weekday
column.

### Required function

```ts
getYearStartDow(year: number, yearLength: number, baseStartDow: number): number
  // → (baseStartDow + year * yearLength) % 7
```

`baseStartDow` is the day-of-week (0 = first configured weekday) on which M1 D1 of year 0
falls. This should be a configurable value stored in `YearDefinition` (new field
`YearStartDayOfWeek: number`, defaulting to 0).

### Cascade through the grid

Once the year-start DOW is known:

1. M1 D1 is placed in column `yearStartDow`.
2. Each subsequent month's start column is `(yearStartDow + cumulative days before that month) % 7`.
3. Weeks wrap normally — no calendar-specific logic beyond the start offset.

This is a pure utility function; it belongs in `utils/calendarMath.ts` (new file, or
alongside existing calendar helpers). Both `CalendarOverlay.vue` (BL-28) and the year
calendar window (BL-29) consume it.

### Schema change

Add `year_start_day_of_week INTEGER DEFAULT 0` to the `timelines` table via the standard
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration in `DbInitializer.cs`. Expose it through
`TimelineItem` / `YearDefinition` and the `GetTimelineData` bridge response.

---

## [BL-32] Minimised timeline mode — data-first layout

**Status:** Done. Toggle button in `TimelineActivityStrip.vue`, `isMinimised` ref in `TimelineApp.vue` gates the splitpanes layout, `miniMode` prop wired into `TimelineCanvas.vue` with dedicated mini layer (pin-head stems), `SaveTimelineMinimised` bridge action persists state via `SettingsRepo`, `timeline_minimised` DB column in `settings` table.

A collapse/minimise button on the timeline strip. When activated, the timeline shrinks to a
fixed 100 px rail at the bottom of the workspace and the data panel expands to fill the freed
space. The timeline becomes a lightweight visual reference; the data panel becomes the primary
reading surface.

### Visual spec (minimised state)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Data panel  ←  ~80 % window width  (or 50 % when side panel)  │
│                                                                 │
│                    [item cards / notes / etc.]                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Timeline rail  ←  100 px fixed height                          │
│  ┌──────────── Age bar ────────────────────────────────────────┐ │
│  │▓▓▓▓ Period ▓▓▓▓▓▓▓   Era/Period strips (stacked, top)       │ │
│  ├──────── timeline axis ──────────────────────────────────────┤ │
│  │  ┃  ┃  ┃  ┃  ┃  ┃  ┃   Items as pin-head lines (bottom)    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Timeline rail layout (top → bottom):**

1. **Age / era bands** — Age and Period items rendered as flat colour bars stacked above the
   axis. Heights TBD; exact stacking order is: Age at the top (tallest), Periods below,
   all fitting within the 100 px budget.
2. **Axis** — the standard tick/label row, abbreviated to year-level labels only at this size.
3. **Items** — rendered as pin-head stems: a thin vertical line rising from the axis to a
   filled circle at the top. No box, no label. On hover, a compact tooltip shows title,
   type, and date.

**Data panel width in minimised mode:**

| Side panel active? | Data panel width  |
|--------------------|-------------------|
| No                 | ~80 % of window   |
| Yes (map, etc.)    | ~50 % of window   |

The side-panel slot is reserved for future toggleable content (map view, statistics, custom
data). The exact toggle mechanism for the side panel is out of scope for this item.

### Behaviour

- A single button in the timeline activity strip (or title bar) toggles minimised ↔ normal.
- Minimised state is persisted per-timeline in settings so it survives reopens.
- All existing canvas interactions (scroll, zoom, item click/view) still work in minimised
  mode; hover tooltips replace the click-to-view card.
- The Splitpanes divider between data panel and timeline rail is hidden (or disabled) while
  minimised so the 100 px height is fixed.

### Implementation notes

- Add `TimelineMinimised: boolean` to `SettingsItem` / `SettingsRepo`.
- In `TimelineApp.vue`, a computed `isMinimised` drives:
  - The Splitpanes split ratio (`timeline-main` pane shrinks to a fixed size).
  - A CSS class on `#timeline-main` that constrains height and switches `TimelineCanvas` to
    "mini" render mode.
- `TimelineCanvas.vue` receives a `miniMode: boolean` prop:
  - Skips box/label nodes entirely; draws stems + circles via a new `buildMiniNode()` in
    `timelineNodes.ts`.
  - Age/Period bars rendered as `Konva.Rect` strips in a dedicated layer above the axis.
  - Hover on a mini node opens a lightweight `Konva.Label` tooltip (no bridge call needed if
    `TimelineItem` data is already in the store).
- Age/Period bar layout needs a simple greedy stack algorithm to avoid overlap (similar to
  the existing period Y-offset logic but constrained to the 100 px budget).

### Deferred decisions

- Exact pixel budget per layer (Age bar height, Period bar height, axis height, pin area).
- Whether the hover tooltip is a Konva label or a DOM overlay (DOM is easier to theme).
- Whether a "side panel" toggle lives in the activity strip or is a separate affordance.

---

## [BL-35] Proper versioning

**Status:** Done. One version number, propagated by `release.ps1` to `StoryTimelineMk2.csproj`
(`Version` / `AssemblyVersion` / `FileVersion`), `app.manifest`, `Frontend/package.json` and
`Installer/InstallerContext.cs`. The frontend reads `__APP_VERSION__` (Vite define from
`package.json`), the update checker reads the assembly version. See `RELEASING.md`.

Establish a single version source of truth for the application. Currently no version number
is defined anywhere — the csproj has no `<Version>` and the frontend has no version field.

### Proposed approach

- Set `<Version>`, `<AssemblyVersion>`, and `<FileVersion>` in `StoryTimelineMk2.csproj`.
- Expose the version to the frontend via a bridge action (`GetAppVersion`) or by injecting it
  into the WebView2 environment at startup as a meta tag / window global.
- The version string should follow semver (`MAJOR.MINOR.PATCH`). Start at `1.0.0`.
- CI / release workflow (if added later) can bump the patch automatically on each build.

> The csproj version fields map directly to Windows file properties (right-click → Properties
> → Details) and to the assembly's `AssemblyInformationalVersion`. A single set-and-forget
> change; no runtime complexity. The bridge exposure is needed so the About modal (BL-37) can
> display it without hardcoding.

---

## [BL-36] Rename output executable

**Status:** Done. `<AssemblyName>StoryTimeline</AssemblyName>` set in `.csproj`; `<RootNamespace>StoryTimelineMk2</RootNamespace>` preserved so existing C# namespaces are unchanged. Output exe is now `StoryTimeline.exe`.

The published executable is currently named `StoryTimelineMk2.exe` — a development codename,
not a user-facing product name. Rename to something presentable (e.g. `StoryTimeline.exe`).

### Rename changes required

- Set `<AssemblyName>StoryTimeline</AssemblyName>` in the `.csproj`. This controls the output
  `.exe` / `.dll` name without renaming the project or any source files.
- Update `BUILD.md` to reflect the new binary name.
- Check that `AppConfig` or any path that references the exe name by string is updated.

> `<AssemblyName>` and the csproj filename / folder name are independent. The project can stay
> in its current folder under its current `.csproj` name while the output binary uses a cleaner
> name. No source files need to move.

---

## [BL-37] Application manifest — product identity

**Status:** Done. `app.manifest` created with Per-Monitor V2 DPI awareness, `asInvoker` UAC, and Windows 10 compatibility GUID. `<Product>Story Timeline</Product>` set in `.csproj`. Remaining optional fields (`Company`, `Copyright`, `Description`, `NeutralLanguage`) not yet set.

Set up the Windows application manifest and assembly attributes so the app presents with a
proper product name, company/creator, copyright notice, and description in all the standard
places (Windows file properties, Task Manager, Add/Remove Programs, UAC prompt).

### Manifest changes required

- In the `.csproj`, populate: `<Product>`, `<Company>`, `<Copyright>`, `<Description>`,
  `<NeutralLanguage>`.
- Confirm `<ApplicationManifest>` points to (or generates) a manifest that declares:
  - `dpiAware` / `dpiAwareness` (already set, but worth verifying in context of the manifest).
  - `requestedExecutionLevel` as `asInvoker` (no UAC elevation).
- Optionally add a `[assembly: AssemblyProduct(...)]` etc. in `Program.cs` if the csproj
  properties alone don't flow through to the manifest.

> These are purely metadata changes — no runtime behaviour is affected. Payoff: the app looks
> professional in file properties, Task Manager shows "StoryTimeline" not the exe path, and
> any future installer / MSIX packaging picks up the metadata automatically.

---

## [BL-38] Help and About system

**Status:** Done. `?` button at the bottom of the activity strip opens a Help / About flyout
(`TimelineActivityStrip.vue`). `HelpModal.vue` is the simplified single-page help (navigation,
items, filters, calendar, time breaks, import/export, keyboard shortcuts); `AboutModal.vue` shows
the version (`__APP_VERSION__`), art credit and "Check for updates". Both are Vue modals rather
than a separate `f_Help` window; the full manual remains BL-34.

A `?` button at the bottom of the left activity strip opens a small submenu with two items:
**Help** and **About**.

### Help window

A dedicated WebView2 window (`f_Help.cs`) showing in-app documentation. See BL-34 for the
full specification. For an initial implementation, a simplified single-page version is
acceptable: one scrollable page covering the main concepts (timeline, items, calendar, LOD,
panning, filters) with a search bar.

### About modal

A Vue modal (not a new WinForms window) overlaid on the main window. Content:

- App name and version (fetched from BL-35's `GetAppVersion` bridge action, or from the
  version string injected at startup).
- Creator / author name.
- A one-sentence description.
- Build date (optional).
- Links: GitHub repo (if public), bug report.
- A small version of the app icon (BL-23).

### Activity strip button

- Icon: `?` rendered as a Phosphor `PhQuestion` component (it represents an app section, so
  Phosphor per the icon convention).
- Positioned at the bottom of the left strip, separated from the feature icons by a divider.
- Click opens a small popover menu anchored to the button with two items: "Help" and "About".

> The About modal is entirely frontend — no backend call needed if the version is injected at
> startup. The Help window reuses the existing WebView2 infrastructure; it's a new
> `BorderlessFormBase` subclass with its own entry point (`help.html`).

---

## [BL-40] Force item side (above / below the timeline)

**Status:** Done (1.0.3). `items.placement` (migration 2, `0` auto / `1` above / `2` below);
`ItemRepo.SaveItemFull` picks the emptier side whenever it receives `0` (new items, and items set
back to Auto), `renderItems` honours `Placement` before the parity fallback, and the Edit Item
window has an Auto / Above / Below segmented toggle next to Importance (hidden for ages, bookmarks,
characters and boundaries).

Originally an item's side was `ItemIndex % 2` (`TimelineCanvas.vue` → `isAboveLine`), i.e. creation
order decided it and the user had no say. Add a per-item placement setting: **Auto** (current
behaviour), **Above**, **Below**.

- ~~New `items.placement` column (schema migration, `0 = auto, 1 = above, 2 = below`), exposed on
  `TimelineItem`~~ — done, including the Edit Item toggle. `0` means "pick again on save": "Auto"
  in the UI sends `0` and the backend chooses the emptier side.
- ~~`renderItems` reads it before the parity fallback~~ — done; lane packing (`getAssignedLane`) is
  unchanged — the forced side just fixes `isAboveLine`.
- Mini mode ignores it (pins have no side).

---

## [BL-43] Shrink / hide the timeline title header

**Status:** Done (1.0.3). "Title Header" select (Full / Compact / Hidden) in the timeline settings
modal's Window section, stored in `settings.header_mode` (migration 3) and saved through the
existing `SaveSettings` action. Compact is a single small left-aligned title line; Hidden removes
the strip (the window title bar still shows the title).

`#timeline-header` (`TimelineApp.vue`) takes a fixed strip at the top of the timeline window for
the title, author and colour strip. Add a compact mode (single line, smaller type) and a way to
hide it entirely, persisted per timeline in `settings` like `timeline_minimised` (BL-32). A
hidden header should still expose the title somewhere (window title bar already has it).

---

## [BL-45] Mass add items

**Status:** Done (1.0.3). `components/MassAddItemsModal.vue`, opened from the activity strip
(`PhListPlus`, `open-mass-add`). Type is a 4-way segmented toggle (Event / Period / Age / Note);
Period and Age get a To-year stepper that follows From + 1 until touched. Reversed years are
swapped, equal years become a one-year range. Remember year is on by default; Shift + / Shift −
step the year from anywhere in the modal (title box included). Queued rows are clickable to edit
(Add → Update, plus Cancel). Finished saves sequentially through the existing `SaveItem` with the
edit window's new-item defaults, then reloads the timeline; a failed save keeps the unsaved rows
listed and shows the error. Closing with unsaved rows asks first via `ConfirmModal`.

New side-panel entry opening a small **"Mass add items"** modal. Left side: title, type and a
Year / from–to input. Each *Add* pushes the item onto a list on the right; the user keeps adding
until they press *Finished*, at which point all listed items are saved to the timeline in one go.

- Type persists between adds; changing it is remembered for the next item.
- Start year persists when a **Remember year** checkbox is on, with a `[-] [ YEAR ] [+]` stepper for
  quick adjustment.
- Items in the right-hand list should be removable before finishing.

---

## [BL-46] Collapsible "Memorable days" section

**Status:** Done (1.0.3). The section collapses via `toggleCollapse('memdays')` with an entry count
badge while collapsed. The per-day cards moved out of the section into
`components/MemorableDaysModal.vue` (list on the left, colour / name / type / picker on the right,
live edits, Add Day / Delete / Close); the section body is a row of colour-dot chips (click = open
the modal on that day) plus **Manage days…**.

The Memorable Days list in the calendar editor (`CalendarApp.vue`) grows with the calendar and
pushes everything below it down. Make the section collapsible like the editor's other sections
(`toggleCollapse`), with the count shown while collapsed. A full-calendar view of all memorable
days is BL-63.

---

## [BL-47] Filter rules cannot be deleted

**Status:** Done (1.0.3). While the filter setup modal is open every chip shows a red `X` that
deletes the rule (`removeRule` → `store.deleteFilterRule`); with it closed the `X` is the old
deactivate control on active chips only. Presets keep their own rule snapshots, so a deleted rule
never breaks a preset.

Once a filter chip exists there is no way to remove it. `TimelineFilterPanel.vue` has
`removeRule()` → `store.deleteFilterRule()` but nothing in the template calls it: the chip's `X`
(`.chip-remove`) only appears on active chips and merely sets the state back to neutral.

- Add a real delete affordance — e.g. `X` on neutral chips deletes, or a trash action in the
  chip's context / the filter setup modal — and keep "deactivate" on active chips.
- Presets referencing a deleted rule must still load (drop the missing rule silently or rebuild
  it from the preset's stored rule data).

---

## [BL-48] Calendar editor LOD auto-sync re-adds removed levels, out of order

**Status:** Done (1.0.3). `syncLodStepFractions()` keeps a set of levels the saved profile lacks
(seeded on load: SEASONS / MONTHS / WEEKS that the year definition would want but the profile
does not have) and never re-adds those; a level it does add is inserted at its place in
step-fraction order instead of appended. Profiles already saved out of order are left as they are
(items store the LOD *index*) — use the editor's sort button if wanted.

Two reported symptoms, one cause in `CalendarApp.vue`:

1. Remove an LOD level in the calendar editor, save, reopen → the level is back.
2. A calendar whose LOD list reads MILLENNIA, CENTURIES, DECADES, YEARS, MONTHS, WEEKS, SEASONS;
   the edit window's Date Granularity dropdown shows that order and "Months" behaves like weeks.

`syncLodStepFractions()` runs from a deep watcher on months / seasons / weeks / year length whenever
`lodManuallyEdited` is false. That flag is session-only and starts false, so on **load**
`parseYearDefinition()` triggers the watcher and the sync re-adds every missing SEASONS / MONTHS /
WEEKS row. Re-added rows are `push`ed to the **end** and then re-indexed sequentially, which is
why SEASONS lands after WEEKS. `CreationGranularity` is the LOD *index*, so a mis-ordered profile
shifts what every granularity means.

Fix (one place): do not auto-sync during load (only on user edits), and when the sync does add a
row, insert it sorted by `stepFraction` descending (the manual sort at line ~55 already does this)
before re-indexing. Then decide what to do with profiles already saved out of order — re-sorting
changes indices, and items store the index, so a repair must remap `creation_granularity` too.

---

## [BL-49] Most common tags in the add/edit item window

**Status:** Done (1.0.3). `TagRepo.GetTopTags(timelineId, limit)` (usage desc, name asc, scoped
to the timeline) behind a `GetTopTags` bridge action; `EditItem.vue` renders up to 8 as dashed
"+ tag" chips under the tag input, minus tags already on the item. Replaced the old on-focus
dropdown, which showed the first 8 tags alphabetically across all timelines.

Below the Tags section in `EditItem.vue`, show the N (≈8) most-used tags of the current timeline
as click-to-add chips, hiding ones already on the item. Backend: `TagRepo.GetAllWithUsage()`
already exists (Tags manager); scope it per timeline or add a `GetTopTags(timelineId, limit)`.

---

## [BL-50] Number inputs adjust with the mouse wheel when focused

**Status:** Done (1.0.3). `utils/numberInputStepping.ts` — one delegated `wheel` + `keydown`
listener per window (installed from every entry point) that calls the native `stepUp`/`stepDown`
on the focused number input, fires `input`/`change` so both `v-model` and `:value`+`@change`
react, and swallows the event. Arrow keys go through the same path (with `preventDefault`) so they
step deterministically — no code path that blocked the native arrow stepping was found, so the
report is covered rather than root-caused.

The `<input type="number">` fields (years, subticks, importance, settings values). Reported: some
of them — especially in the add/edit item window — step with neither the mouse wheel nor the
up/down arrow keys.

- Wheel: Chromium never steps a number input on wheel. When the input is focused, wheel up/down
  should step the value (respecting `step` / `min` / `max`) and swallow the event so the page /
  canvas behind does not scroll. One global directive applied to every number input, not
  per-component handlers.
- Arrow keys: these work natively, so find which inputs break them — candidates are fields bound
  with `:value` + `@change` (`LodDateInput.vue`), a `keydown` handler that prevents default, or
  inputs that are really `type="text"`.

---

## [BL-51] "Item Notes" — hidden per-item data

**Status:** Done (1.0.3). Migration step 6 adds `items.item_notes TEXT` (nullable);
`TimelineItem.ItemNotes` round-trips through `SaveItemFull`, timeline duplication and the
column-generic export/import. Edit window: its own collapsed **Item Notes** section below Images
(same collapsible pattern as Characters / Stories). Nothing renders it. Attachments can hang off
the same column/concept later.

A free-text field on items that is stored but never rendered on the canvas, data panel or view
modal: a place for the writer's own bookkeeping. New `items.item_notes TEXT` column (schema
migration), textarea in `EditItem.vue` (collapsed by default), included in copy / export /
import. Later: attachments (PDF and other documents) hang off the same concept — keep the field
name generic enough for that.

---

## [BL-52] Default LOD visibility for new items

**Status:** Done (1.0.3). Stored per timeline in `misc_settings` under `default_lod_mask`
(`utils/timelinePrefs.ts`, no migration). Timeline Settings → General → "New Items Visible At" is
a summary chip ("All levels" / "Years, Months" / "No levels") that opens
`components/LodMaskModal.vue` — a checklist with the full level names and All / None. The
three-letter `LodMaskToggles` stay in the edit window. The backend's new-item
stub in `HandleGetItemForEdit` carries the mask, so `EditItem.vue` picks it up the same way it
picks up the default colour.

Timeline Settings gets a "New items are visible at" row of per-LOD toggles (same control as the
edit window's per-level toggles, BL-05). New items start with that mask instead of 255. Stored per
timeline (`misc_settings` or a `layout_settings`-independent timeline column — it is a timeline
preference, not a layout template value).

---

## [BL-54] Set the LOD visibility of every item in a timeline

**Status:** Done (1.0.3). `ItemRepo.SetLodMask(timelineId, mask)` (one `UPDATE`, all items of the
timeline) behind `SetTimelineItemsLodMask`. Two front ends: the Actions menu ("Set Visibility Of
All Items" — a **Set visibility…** button opens `LodMaskModal` in run-it-yourself mode, whose red
**Apply to N items** button does the update, then `store.loadTimelineData`) and
`__stl.setAllLodMask(levels)` for the console (BL-53 step 1), which takes level names.

Power-user command (BL-53) — and possibly a Timeline Settings / actions-menu entry — that
rewrites `lod_visibility_mask` for all items of the current timeline to a given mask, e.g.
"years and weeks only". Bridge action `SetTimelineItemsLodMask(timelineId, mask)`, one `UPDATE`,
canvas reload afterwards. Confirm before applying — it overwrites per-item settings.

---

## [BL-55] Centered items — box centered on the stem

**Status:** Done (1.0.3). `items.centered` (migration 4) → `TimelineItem.Centered`, "Centered"
checkbox under the Side toggle in the edit window (events and notes only), and
`updateAbsolutePositions` takes a trailing `centered` flag: box at `anchorX - width/2`, no stem
offset, stem straight up/down. Lane packing needed no change — the event collision check was
already symmetric around the anchor.

Per-item option (next to the side toggle from BL-40) that centers the item box on its stem
instead of the default sideways offset. `renderItems` / `timelineNodes.ts` box x-position; lane
packing should account for the wider footprint on both sides of the stem.

---

## [BL-56] Quick edit — Shift+click opens the edit window

**Status:** Done (1.0.3). Both canvas click handlers (normal and mini mode) emit the existing
`itemClick` (→ `OpenAddEditItemWindow`) instead of `viewItem` when Shift is held. Listed in the
Help modal's editing and shortcut tables.

Shift+clicking an item on the canvas opens it in the edit window directly, skipping the
view modal / context menu. `TimelineCanvas.vue` click handler → `OpenAddEditItemWindow`. Document
in BL-39's shortcut table.

---

## [BL-57] Edit window title-bar X skips the discard guard

**Status:** Done (1.0.3). `WindowTitleBar` takes an optional `closeHandler` prop; `EditItem.vue`
passes `requestClose`, so the X now asks "Discard changes?" like Cancel / Escape / WinForms X.

The 1.0.2 "Discard changes?" guard covers Cancel, Escape and the WinForms close path
(`OnFormClosing` → `CloseRequested` push), but the X in the Vue title bar (`WindowTitleBar.vue`
`close()` → `BackendAPI.WindowClose()`) goes straight to `ConfirmedClose()` and never asks.

Fix: let the title bar defer the close to the page — e.g. an optional `beforeClose` prop /
`close-request` event that `EditItem.vue` routes into `requestClose()`; other windows keep the
direct close.

---

## [BL-59] Calendar export / import

**Status:** Done (1.0.3). `Database/CalendarExporter.cs` (`ToJson` / `Import`) behind
`ExportCalendar` / `ImportCalendar` (native file dialogs). File: `{ format: "storytimeline-calendar",
version: 1, name…, yearDefinition: {…}, lodProfile: { name, profile: […] } }` with the nested JSON
inlined. Manager: per-row **Export** + footer **Import Calendar** (new ids, name kept, collision
reported in the notice line). Editor: **Export** in the header exports the on-screen state (validated
like Save). Import into the editor form was skipped — the manager's import covers it.

Export a calendar (year definition, LOD profile, memorable days) to a single JSON file and import
one from a file, so writers working on the same world can share it. Entry points in the calendar
manager (`CalendarManagerModal.vue`) and the calendar editor window. Import creates a new
calendar (new id) — never overwrites — and reports name collisions.

---

## [BL-61] Picture items — optional title on the timeline

**Status:** Done (1.0.3). Per-item: `items.show_title` (migration 5) → `TimelineItem.ShowTitle`,
"Show title" checkbox in the edit window for pictures. `buildNode` takes a trailing `showTitle`
and adds a `Konva.Label` (translucent tag + text) that `updateAbsolutePositions` pins to the
bottom edge of the image — footprint unchanged, so lane packing is untouched.

Picture-type items (`TypeId` 4) render only the image on the canvas. Add a per-item (or
per-layout) option to show the title as well, like event boxes do. `timelineNodes.ts` picture
node builder + edit window checkbox.

---

## [BL-62] Configurable colour swatches

**Status:** Done (1.0.3). `utils/timelinePrefs.ts` — 12 hex strings stored per timeline in
`misc_settings` under `color_swatches` (existing `Get/SetMiscSetting` bridge, no migration);
malformed values fall back to the defaults. Timeline Settings → General shows a chip of 12 colour
dots that opens `components/SwatchEditorModal.vue` (12 pickers, Reset to defaults, Cancel / Apply);
`EditItem.vue` loads them per timeline. The filter colour rule builds its palette from the colours
actually in use (`store.allTimelineColors`), not these 12, so it was left alone.

The 12 quick-pick colours in the edit window (`COLOR_PALETTE` in `EditItem.vue`) are hardcoded.
Add a "Colour swatches" row to Timeline Settings — 12 colour pickers with a "reset to defaults"
button — stored per timeline, and have `EditItem.vue` read them from the timeline instead of the
constant. Also used by any other palette that shows the same 12 (filter colour rule).

---

## [BL-64] Taller description box in the edit item window

**Status:** Done (1.0.3). The Description textarea in `EditItem.vue` is `rows="7"` (~130 px);
still resizable.

---

## [BL-65] Data panel keeps multi-line whitespace

**Status:** Done (1.0.3). `white-space: pre-wrap` on the four description / content classes in
`TimelineDataPanel.vue`.

`TimelineDataPanel.vue` renders `item.Description` / `item.Content` in plain `div`s, so line
breaks and indentation collapse. Add `white-space: pre-wrap` to `.data-age-desc`,
`.data-period-desc`, `.data-item-desc` and `.data-item-content` (the view modal and notes panel
already do this).

---

# StoryTimelineMk2 — Backlog

Grouped by size, not by number: BL numbers are permanent and a new item always gets the next
free one whatever group it lands in. Move an item between groups by moving its section.

Signing and distribution (BL-69 Microsoft Store, BL-70 SignPath) live in
`BACKLOG_SIGNING.md` — a separate track, picked up separately.

---

# Small

Left over from the 1.0.3 pass and not tied to a version. Finished items are under Done.

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
Remove in `ReferenceTimelineModal`, tool-active Reference button on the strip.
Step 3 done for 1.1.1 (2026-09-23): ghosts now pack around the active timeline's lanes instead of
hiding underneath its items (`getAssignedLane` takes a read-only `avoidLanes` map, so the active
pass packs exactly as before); a real age drawn over a reference age gets diagonal slits in the
ghost's color across the overlapping stretch only (`refStripeLayer` in `TimelineCanvas`); and the
chosen reference plus its shift are remembered per timeline in `misc_settings`
(`reference_timeline`, restored by `loadTimelineData`, dropped with a message in the modal when it
will not load). Not done, by decision: ghost pictures are still frames without images; no locate /
pulse for reference items.

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

## [BL-77] Relation views that tell you something

**Status:** Done 2026-09-24 for 1.1.1. All five steps — schema, Genogram, Arc, Sociogram and
Chord; see the sections below. **Knots was reprieved the same day** and fixed rather than cut
(asked for 2026-09-24). Rings and Rows are gone, Grid is the Matrix and has its interactions, and
a batch of ten further changes asked for the same day is in the last section.

BL-76 added four views on the strength of "it is a different arrangement of the same nodes".
Reviewed side by side, three of them do not earn their place: **Graph and Knots are visually
indistinguishable** (the cluster gravity is too weak to read against the spring forces — fixed
2026-09-24 instead of cutting the view, see the end), and
**Rings and Rows show shape without meaning** — a BFS rank is not a fact about the story. Grid
and the family tree are the two worth keeping. Four replacements, all of which answer a question
a writer actually has:

1. **Genogram** *(done)* — the family tree, but carrying the relations it currently throws away. It is
   built from `parent` / `step-parent` / `spouse` only; everything else between two people on it
   is drawn as nothing. Keep the hourglass layout, overlay the rest as styled connectors (the
   `hostile` category and `RelationshipModifier` — estranged, secret, adoptive, former, alleged —
   each get their own line treatment), add gendered node shapes and a death mark.
2. **Arc** *(done)* — everyone on one axis, ties as arcs above it. **Axis = birth year** (decided
   2026-09-23); people with no birth year bucket at one end rather than being dropped.
3. **Sociogram** *(done)* — replaces Knots. Hard faction boxes rather than gravity wells, with the
   ties that cross a boundary drawn to stand out. Needs `characters.faction`, which is why the
   schema went first.
4. **Chord** *(done)* — factions (and later locations) round the circle, ribbon weight = how many
   ties cross between them.

**Grid keeps its place and gets the interactions it is missing** *(done 2026-09-24)*, and is
called **Matrix** now — "grid" was the drawing, not the reading. A square already tells you two
people are connected and says nothing about how; the finder already answers that and sits three
feet away unused. So the matrix was wired to it rather than given a second way to say the same
thing (decided 2026-09-24):

- **Click a cell** → the row's person into *From*, the column's into *To*. The finder panel then
  names both and spells the relation out, and the traced path follows you into the other views.
- **Click a name on the side** → *From*. **On the top** → *To*. One fixed job per axis, nothing to
  remember and no hidden click-order state. Selection still moves to whoever was clicked, so the
  row-and-column banding keeps working.
- **Rows go by faction first**, biggest faction leading and the unaffiliated last, knots and then
  degree inside each — a block labelled *House Varden* is worth more than a block that merely
  hangs together. `matrixOrder` takes the faction map as an optional argument, so with no factions
  it is exactly the old knot order.

Fixed here: the cell hit-test subtracted the gutter **twice**. `getRelativePointerPosition()` on
the grid sheet is already relative to the sheet, whose origin *is* the grid's top-left corner, so
every click read about seven rows up and to the left of itself and clicks near the top-left
silently did nothing at all (`order[-3]` is `undefined`). Verified live before and after.

**Cut when the replacements land** *(done 2026-09-24)*: Rings and Rows are gone, and
`radialLayout` and `layeredLayout` went with them — nothing else had picked them up. Knots was on
this list until 2026-09-24, when the decision went the other way: the view was worth keeping if it
could be made to *show* the knots, which it now does.

Build order: Genogram, then Arc, then Sociogram and Chord.

### Step 1 — schema (done 2026-09-24, migration 17)

`characters.faction` (TEXT, free text like `race`, with a datalist of the names already used in
the timeline so a cast is not split between two spellings of the same house). Searchable in the
character list; the grouping key for Sociogram and Chord.

`characters.birth_location_id`, `characters.death_location_id` and `items.location_id` were added
in the same step as groundwork for **BL-16** — no UI, nothing reads them. See the note on BL-16:
that feature owns whether they survive as they are.

### Step 2 — Genogram (done 2026-09-24)

The `tree` view, renamed. The hourglass layout is untouched; what changed is what is drawn on it.

- Everything that is not descent or marriage between two people already on the chart is overlaid:
  a bowed curve in its category colour, carrying the same width-by-closeness and dash-by-modifier
  the other views use. Hostile ties draw as a sawtooth instead of a curve.
- Overlaid ties fade with the distance they cross — full within two generations, a quarter past
  about ten. Without it an eighty-person cast is a hairball of long diagonals.
- Node shapes: square for a man, circle for a woman, diamond for anyone else, read through the
  same `genderKey` the relation wording uses. Drawn as a frame *around* the portrait disc, so a
  face is still a face.
- A cross through the frame means dead. With the scrubber off that is anyone with a death date;
  with it on, anyone dead by that year.
- The chart fits itself to the stage on build — it used to inherit whatever zoom the previous
  view left behind. The fit stops at `TREE_MIN_SCALE` (0.45), below which a portrait is a dot:
  past that it opens at the root instead, panned by `clampPan()` so the stage is never half blank
  with chart still off the edge. A cast that is one connected family lays out ~8000px wide, so
  this is the normal case, not the exception.

New in `relationsGraph.ts`: `overlayEdges()`, `bowPoints()`, `jaggedPoints()` — all unit-tested.

The year scrubber and the category legend used to be hidden in this view and are now shown in
it, since the genogram reads both (decided 2026-09-24). Hiding a category takes away the overlaid
ties of that kind only — the tree itself is drawn from `relations` unfiltered, because hiding
`family` would otherwise leave no chart to hide anything on.

### Step 3 — Arc (done 2026-09-24)

The whole cast on one horizontal axis in birth order, ties as bowed curves. `family` arcs above
the line, everything else below — two halves to spend instead of one, and which side a curve is
on already says what kind it is without reading its colour.

- **Spacing is a slider, not a decision.** Asked for 2026-09-24: even spacing is readable but
  says nothing, true-to-the-year is honest but bunches a cast written in three generations into
  three knots. `arcLayout(ids, years, spread, gap)` blends between them, and a left-to-right pass
  guarantees nobody ends up closer than `gap` whatever the blend says — which is what keeps a
  proportional axis readable at all. How wide a year is at full spread comes from the **median**
  step between consecutive births, not the smallest: one pair born a year apart in a cast
  spanning centuries would otherwise blow the axis out to whitespace.
- The slider persists per timeline in `misc_settings` under `relations_arc_spread`, next to
  `relations_positions`.
- Characters with no birth year are not dropped and not guessed at: they wait past a dashed fence
  at the right-hand end, captioned.
- Names alternate between two rows above the discs, so a full name has two gaps of room rather
  than one; the birth year sits under the name in grey.
- Selecting someone leaves their ties lit and drops everyone else's to 0.1. On an eighty-person
  cast that is the only way to follow one person's threads across the width.
- The view never zooms out: `fitOrHold(..., floor = 1)`. The genogram can stand 0.45 because its
  shape still reads when the faces have gone; an arc is a row of names and years and nothing
  else, so it holds 1 and pans. The fit block at the end of `buildTree()` was lifted into
  `fitOrHold()` for this, and the arc passes Konva's own `getClientRect()` rather than bounds
  guessed from the constants — the bows are nearly all on one side on a real cast, and reserving
  symmetric room for them centres the axis in a half-empty stage.

New in `relationsLayouts.ts`: `arcLayout()` and `ArcLayout`, unit-tested. **Not** exercised live:
the undated bucket and its fence — every character in the test timeline has a birth year, so only
the unit tests cover that branch.

### Step 4 — Sociogram (done 2026-09-24)

One box per faction in a ring, everyone with no faction on a ring outside it. Decided 2026-09-24
from four questions: a ring of boxes rather than a packed grid, the unaffiliated loose around the
outside rather than in a box of their own, and the ties *inside* a box dimmed rather than the
crossing ones highlighted — same contrast, but it leaves the crossings in their own category
colours instead of repainting them.

- **The ring is what makes a crossing legible**: every box faces an open middle, so a line leaving
  one has nothing to hide behind. Boxes sit at equal angles in alphabetical order — spacing them
  by size would reorder the ring every time somebody changed houses, and a chart that moves under
  you is one you cannot learn.
- **Sizing the ring uses every pair, not just the neighbours.** Each box is treated as the disc
  that covers it; two boxes `steps` apart have `2R·sin(π·steps/n)` between their centres, so each
  pair names a radius and the largest wins. Neighbour-only sizing never asks about the two big
  boxes facing each other across the middle. The layout test pins the pairwise gap directly,
  because whether that gap being too small clips the *rectangles* depends on which way round they
  happen to sit — it does not on the 5-faction test cast, and the bug would have shipped.
- **A tie is internal only when both ends are in the same named faction.** Nobody shares a box
  with the unaffiliated, so every one of their ties counts as a crossing, which is right.
- **Selecting somebody dims the rest rather than replacing the contrast.** The window always opens
  with the first character selected, so an override would mean the crossing contrast the view
  exists for is never what you see first. Their ties go to 0.9 and everyone else keeps their
  crossing/internal value at 35% of it.
- **This view fits, with no floor under it.** The genogram and the arc hold a minimum scale and
  pan because they are read a branch at a time; a ring is read whole. Held at the genogram's 0.45
  the test cast's ring was simply clipped, which is not a ring.

The cast generator now hands out factions by surname rather than per person, so a house mostly
shares one and the people who marry in bring another — which is what produces crossing ties to
look at instead of a uniform mesh. One slot in the list is empty, so some of the cast belong to
nothing.

Live on the 80-person test cast: 5 boxes (35 / 12 / 12 / 8 / 1 members) with no overlaps, 12
unaffiliated on the outer ring, 296 ties splitting 138 crossing / 158 internal, whole ring inside
the stage at scale 0.295, no console errors. The empty case was checked too, by clearing the
factions: no boxes, all 80 on one ring, and the sidebar note explaining how to get a box.

New in `relationsLayouts.ts`: `sociogramLayout()`, `SociogramBox`, `SociogramLayout` and
`SOCIO_HEADER`, unit-tested.

### Step 5 — Chord (done 2026-09-24)

Groups round a circle, each arc as wide as the group has ties, joined by ribbons as thick as the
number running between them. Decided 2026-09-24 from four questions: factions round the circle
with a toggle to relation category, ribbons weighted by tie count, a group's own ties drawn as a
loop on its own arc, and a click highlighting *and* listing what the ribbon is made of.

- **An arc is as wide as the group's ties, not its headcount.** A house of forty who keep to
  themselves earns less of the circle than a house of five everybody deals with — which is the
  only reading of "who matters here" this chart can honestly give. An internal tie spends two
  tie-ends, both of them on the same arc, so a group that only talks to itself still gets its
  width.
- **The second mode is not what was asked for, because the data cannot carry it.** "Relation
  category round the circle" was meant to be pair-level: how many pairs are family *and* hostile.
  Checked against the live database first — 298 relations across 298 distinct pairs, and **not
  one pair carries more than one category**, so that chart renders empty every time. Kinds mode
  is therefore *person*-level: an arc per category, and a ribbon between two of them is the
  people who have both kinds of tie. `race` is the obvious alternative second dimension if the
  pair-level reading is ever wanted back.
- **A group's own loop gets 0.2 opacity against 0.62 for a crossing** — the same call the
  sociogram makes, for the same reason. On the test cast the Merchant League's internal ties are
  125 of its 224, and at equal weight that one loop is the whole picture.
- **The fit is computed, not measured.** Labels are laid out in whatever world units come to a
  fixed 13 screen pixels (`fontSize = 13 / scale`), so the names stay readable on a big cast
  instead of shrinking with the circle. Measuring the drawn ring would not have worked anyway: a
  custom `Konva.Shape` with a `sceneFunc` reports a 0×0 client rect, so the ribbons are invisible
  to `getClientRect` — which is also why the probe that verified this had to sweep
  `stage.getIntersection` rather than aim at a bounding box.
- **The ribbons had to move out of `linkGroup`.** It is built `listening: false`, which is right
  for the views with hundreds of edges nobody can click and wrong for the one where the ribbon is
  the thing you click. They are drawn into `nodeGroup` instead, own loops first so the crossings
  sit over them. Arcs and ribbons occupy different radii, so nothing is hidden by the reorder.

Fixed on the way: `.rel-block--grow` was a class with **no CSS at all**, so the tie list shrank
below its own content in the sidebar's column flex and painted over the year slider and the
finder. It now holds its height and scrolls its own rows — which also fixes the same latent
overlap on the selected-character block.

Live on the 80-person test cast: 6 arcs (5 factions + "No faction"), 16 ribbons, 344.53° of arc
with the rest exactly `CHORD_PAD` of gap, labels at exactly 13 screen px, whole circle in the
stage at scale 0.38, no console errors. Clicking a crossing gave "City Watch ↔ Merchant League —
38 ties" with 38 rows, the loop gave "Inside Merchant League — 125 ties", the arc gave "Merchant
League — 224 ties", and kinds mode gave "family only — 46 characters"; clicking the same shape
again lets go, and switching mode or grouping clears the pick.

New in `relationsLayouts.ts`: `chordLayout()`, `ChordArc`, `ChordRibbon`, `ChordLayout` and
`CHORD_BAND`, unit-tested — including that each arc is filled by its own ribbons end to end with
no gap and no overlap, which is the invariant the whole picture rests on. Spans are laid out in
group order rather than sorted to minimise crossings; `ponytail:` note in the file says to sort
by target angle if a project ever reaches fifty factions.

### Knots, kept rather than cut (2026-09-24)

Reprieved on the condition it actually separate the groups. It does now, and the diagnosis was
not the one in the original write-up: the cluster gravity was not *too weak*, it was pulling the
wrong way round. `stepForces` only ever pulled each member toward **its own knot's centroid** —
nothing pushed two centroids apart, and the global pull toward the stage centre was actively
stacking them. So the knots settled concentric, laced through each other, and the view came out
indistinguishable from the plain graph. `clusterSeed` had separated them at t=0 and the sim spent
the next two hundred frames undoing it.

- **Centroids now shove each other.** Each knot claims `clusterRoom` (46px) per √member — a knot
  of forty is not forty times wider than a knot of one — and any pair closer than the sum splits
  the shortfall between them, big knot and small alike. Applied to every member equally, so a
  knot moves as one rather than being torn open on the way.
- **`clusterRepulsion` is a *distance* knob, not a speed one.** The shove fights the pull to the
  stage centre the whole way and settles where the two cancel, so the constant decides how close
  to `want` the knots actually get. At the first value (0.12) they stopped ~180px short and still
  overlapped; at 0.3 the worst pair on the test cast is 39px short of a 365px target.
- **The view fits itself once, on the way in.** Knots shoved apart run wider than the stage, and
  the force views never fitted because they had always relied on centre gravity to contain them.
  Refitting on *every* settle would yank the view out from under anyone who had just dragged
  somebody, since a drag reheats the sim — so the flag is set in `buildGraph` and cleared the
  first time the sim stops.
- **The distance is a slider, not a constant.** `clusterRoom` is what the *Knot distance* control
  writes, 14px per √member at the bottom of the range to **200px** at the top — 78px until
  2026-09-24, then 160, then 200 when "maybe up to 200" was asked for the same day. The dial is
  two **geometric** halves either side of a fixed midpoint (`knotRoomPx`): on one curve each of
  those two raises would have dragged the middle of the dial up with it — 46px to 87, then to 53 —
  and changed what every existing timeline drew on reopening. Two halves pin 50 at 46px whatever
  the top says. Measured on the test cast the mean gap between knots ran 288 → 306 → 373 → 477 →
  565px across the old range; on the current one the whole layout measures 882 / 1114 / 3492px
  wide at 0 / 50 / 100 and the fit follows it down, 1 → 0.72 → 0.21, so the top of the range
  buys daylight at the price of a smaller picture. Moving it reheats the
  sim rather than rebuilding: the knots have not changed, only how much room they want, and a
  rebuild would throw away a layout the writer had spent a while dragging into shape. The setting
  is remembered per timeline, through the same `rememberedSlider` helper as the arc spread.
- **Hues are spread evenly round the wheel, not hashed.** `categoryColor`'s hash was the lazy
  reuse and it was the wrong call here: it collided, and two knots side by side in the same dusty
  pink is the one thing this view cannot afford.
- **A knot of one is a stray, not a group** (`HULL_MIN = 2`), so loners get no blob. A knot of two
  draws as a capsule, because `convexHull` returns fewer than three points as they are and the
  caller only closes the path at three or more.

The blob itself needs no offsetting maths: it is the convex hull stroked `HULL_PAD * 2` wide with
round joins and caps, so the stroke *is* the padding and the corners come rounded for free. Hulls
live in their own group behind the links, `listening: false` — a blob that ate the click meant for
the character standing on it would be worse than no blob. The views that draw their own shapes
never reach `paintHulls`, so `rebuild()` hides the group; otherwise switching to the chord left
the last knots sitting underneath it.

Each knot is named after whoever in it has the most ties ("Bran Grimsby and 25 others") — "Knot 3"
says nothing, and the best-connected member is usually why the rest of them are in it.

Live on the 80-person test cast: 7 knots (26 / 20 / 8 / 8 / 7 / 7 / 4), each its own colour and
name, whole layout inside the stage at scale 0.8, no console errors.

New in `relationsLayouts.ts`: `convexHull()` and `HULL_PAD`, unit-tested — the inside dropped, the
points in order round the outside, collinear points dropped, and the degenerate knots of one and
two. `relationsGraph.ts` gained `clusterRepulsion` and `clusterRoom`, with a test that two knots
started all but on top of each other end up with every member nearer its own middle than the
other's — and actually apart, not merely sorted.

### The batch of ten (2026-09-24)

Asked for in one go after the five steps landed, once the whole set could be looked at side by
side. Four of them are in the sections above (knot distance, the matrix's interactions and
rename, cutting Rings and Rows); the rest are here.

- **Right-click is the app's menu now, everywhere in the window.** The native one is suppressed
  over the whole page except inside text inputs, where "paste" is the only menu anybody wants.
  Right-clicking a character gives *Their timeline*, *Open in characters*, *Centre the genogram
  here*, *Unpin* (knots only) and — below a rule, in **every** view — *Relation A* and *Relation
  B*. Right-clicking the background gives *Fit to window* and *Unpin all*. The two ends of the
  finder are on the character menu unconditionally because the whole point of spotting somebody in
  a chart of eighty is that you may not find them twice.
- **Copy and Save moved to buttons in the top-right corner of the stage**, roughly where the
  native menu's "Save image as…" used to be — the bottom left is the error line's, and the views
  fill from there. `ClipboardItem` is missing outside a secure context, so a `file://` build says
  "use Save instead" rather than throwing about `undefined`.
- **The genogram's overlay starts unticked.** All three kind boxes off: a chart you have to clear
  before you can read it is one nobody reads twice. Held in `treeShown` (what to *show*) rather
  than in `hiddenCategories` (what to hide), so switching views cannot carry a blank overlay into
  the knots and an empty list needs nothing seeded from `categories`, which does not exist until
  the cast loads.
- **The selected character is ringed, and kept on screen.** A white ring is built into every disc
  in every view, hidden unless it is them, so a view that re-lays out under the click gets the
  mark for free and one that does not still gets it. `holdSelection()` re-centres the stage **only
  when they are actually off the edge** — a view that already shows them should not lurch every
  time you click.
- **The sociogram has a *Crossing ties* slider.** It starts at 100, which is exactly what the view
  looked like before it existed, because the crossings are the point of it. On a cast where every
  house deals with every other the middle of the ring fills in solid, and turning them down is the
  only way to see the boxes at all. Remembered per timeline like the arc spread and the knot room.
  Measured live on the test cast: the 136 crossing lines go 0.297 → 0.149 → 0 across the slider
  while the 153 internal ones hold 0.042 and the selected character's seven hold 0.9, which is the
  invariant — the slider fades the crossings only, and the selection contrast survives it.

### The chain (new view, 2026-09-24)

The seventh mode. Two people picked in the finder, the route between them laid left to right, each
step written over its line, and round everybody on the way the people *they* are directly related
to. It answers the question the finder's sentence cannot: not just how two people connect, but
what else is hanging off the connection.

**Simplified the same day, on sight of the first cut.** It drew every edge between everyone on the
picture, which buried the one line the view exists for under a mesh — the mesh is what the knots
are for. What it draws now (asked for 2026-09-24):

- **A satellite says a tie exists, not what it connects to**: one thin spoke to whoever on the
  route knows them, and nothing else.
- **Five satellites at most** (`CHAIN_HALO_MAX`, was 8), least-connected dropped first, and the
  last slot becomes a dashed `+n` — a hub hanging off the route says more about where it runs than
  a walk-on does, which is why the cut is by degree.
- **Initials only.** The name label is destroyed on a satellite: five names round one person run
  into each other at any radius that still fits between two chain members. A click says who in
  full, and they keep the portrait, the double-click and the right-click menu, because a satellite
  is a character.
- **Wider apart** — `CHAIN_GAP` 250 → 330, `CHAIN_HALO_R` 88 → 104 — and the fan angles moved off
  the horizontal to ±35–145°, since the chain's own line *and* the words written along it run
  there.
- **Everything is draggable.** `dragChain()` holds the lines, the words over them and each ring as
  id pairs rather than coordinates and reads positions back out of `shapes` on every `dragmove`:
  drag someone on the route and their ring travels with them; drag a satellite and its offset is
  rewritten, so it stays where you put it the next time its owner moves. A route of six people
  with a ring each will overlap somewhere, and letting you shove one aside is cheaper than a
  placer clever enough never to need it.
- **A *Side circles* checkbox** (`haloOn`) drops the lot for the route on its own.

New in `relationsLayouts.ts`: `chainLayout()`, `ChainStep`, `CHAIN_GAP`, `CHAIN_HALO_R` and
`CHAIN_HALO_MAX`, unit-tested. Live on the 80-person test cast: the route with
its relation words, 16 satellites over 19 lines, the checkbox taking them to 0 and back, and a
drag carrying a ring with it.

### Seen and said, 2026-09-24 (second pass)

Six off a screenshot review of the finished set, plus four asked for while they were being
built. The sidebar one is two bullets because the Characters list got the same grip.

- **The sidebar is draggable.** 200–560px off a 5px grip, remembered in `localStorage` per
  machine. Per machine and not per timeline on purpose: how wide a column of names wants to be is
  about the monitor you are at, not about the story. The CSS `resize` property was the free
  option and lost on placement — its grip is in the element's bottom-right corner, which on a
  full-height panel is the bottom of the window, where nobody looks.
- **The matrix marks the square you picked.** A click off the diagonal filled the two dropdowns
  and changed nothing on the grid. Now A's row and B's column get a faint band and both symmetric
  cells get a white outline, drawn *over* the coloured squares — an empty cell is exactly the pair
  you ask about to find out there is nothing there.
- **The chain's step wording draws over the discs**, not under them. It was in `linkGroup`, which
  is behind the nodes by design, so *mentor of* was being written underneath the very circles it
  named. The labels go into `nodeGroup` last of all instead.
- **Knot distance reaches 200** — see the knots section for the two-part dial that made room for
  it without moving the middle.
- **The arc stacks into rows by generation**, on a checkbox in its sidebar block. "Separate on
  generations or something" was asked for and then pinned down to one row per generation, birth
  order still running left to right. The generation is `generationOf()` in `relationsGraph.ts`,
  next to the genogram's kin helpers and reusing `collectKin`: longest path down from whoever has
  no parents in the cast, couples levelled onto one row, capped at the size of the cast so a
  writer who makes somebody their own great-grandparent flattens the chart instead of hanging the
  window. Unit-tested six ways; live on the test cast it comes out 3 rows of 35 / 50 / 15 people.
- **The Characters list drags too**, off one `useSideWidth()` composable and one `.side-grip`
  class in `main.scss` rather than a second copy of the grip above. Relations 260 → 400 → 260,
  Characters 260 → 420 → clamped 560 → clamped 200 → 260, both remembered, no console errors.

- **Knot distance now loosens the ties between knots instead of pulling the knots apart.**
  Asked for as "keep the tighter knots but with looser external connections", and it turned out
  to be the same bug: cross-knot springs stretched ~1000px past rest were beating the pull toward
  a member's own centroid, so at the top of the dial the median knot doubled (202 → 442px) and the
  biggest tripled (1019px). A cross-knot tie now gets the extra room as rest length and gives up
  as much pull as it gained reach. Median 202 / 203 / 217px across the dial afterwards; below the
  midpoint nothing changes at all, which three unit tests hold down.
- **The matrix can draw the route.** A *Show the route on the grid* checkbox under the finder:
  each step of the A→B answer is ringed at the square where its two people meet and numbered in
  order, with a dashed elbow between steps turning on the diagonal square of whoever they have in
  common. Only with a middle step — a direct pair is the existing pair mark. `pathNodes` is now
  derived from an ordered `pathRoute`, since a set cannot say which step came third.
- **Only a left click re-roots the genogram.** A right-click was re-rooting the chart *and*
  opening the menu, walking the character out from under the cursor that had just picked them.
  Konva fires `click` for every mouse button — there is no button test anywhere in its
  `_pointerup` — so the node handler takes `evt.evt.button !== 0` as its cue to stand down, asking
  whether there *is* a button first because a tap carries none. The menu handler sets a `menuPick`
  flag that makes the `selectedId` watcher ring the person and stop, rather than re-laying out and
  re-fitting three views; `mousedown` clears it, and always runs before both. Checked live on a
  100-person chart: right-click opens the menu with the root and the view held and the ring moved,
  middle-click does nothing at all, left-click still re-roots.
- **The genogram can draw the route too.** The matrix checkbox became `showPath` and serves both
  views. The difference is that the genogram is one hourglass around one root, not the whole cast,
  so the route is searched **inside this chart**: only edges with both ends drawn here, minus any
  category the legend has hidden. A shortest path through the whole web could otherwise step
  through people who are not on screen, and a numbered trail with gaps in it is worse than none.
  Each step is traced along the chart's *own* elbows — down into the union, along the sibling bar
  — because a straight line from a grandparent to a grandchild says nothing about how they are
  related; a non-kin step takes the bow the overlay already drew it as. Live: 14 people ringed and
  numbered 1–14 with 26 highlight segments, matching the sidebar's sentence name for name.

The sociogram's inter-group dimming was the one thing on the list already built: the *Crossing
ties* slider is what was meant.

---

# Major — 1.2.0

New moving parts; each needs its own design pass before code. This group was 1.1.0 until
2026-09-21, when 1.1.0 was refocused on the browser build and signing.

## [BL-18] Audit follow-ups — known issues deliberately not fixed yet (good to know)

**Status:** Resolved. Moved to 1.1.0 (2026-09-20), then to 1.2.0 (2026-09-21), because what was
left was internal. All 10 planned items addressed; since then also done: 30 s bridge request timeout
(FC-C1, `api.ts`), deleted items' Konva nodes destroyed (TC-H1), minimap static + dynamic layers
(TC-H2), icon convention settled — CLAUDE.md now says Phosphor for everything new, Remix only
survives in the older components, no sweep. The last four — the FC-C1 deeper fix, heavy handlers
on the UI thread (H1), the panels' double `GetItemForEdit` (TC-H5) and the z-index token scale —
were done for 1.1.1 (2026-09-23); see the sections below. Nothing known is left open.

### Data integrity — RESOLVED

- ~~**V2 backup import silently drops entire tables** (DB-C2)~~ — **Fixed.** `DatabaseImporter.ImportV2Backup` now restores lod_profiles, layout_settings, filter_presets, notes, timeline_hidden_ranges, and timeline_filter_rules. Copy order correct.
- ~~**V1 import writes character↔event links into a dead table** (DB-H1)~~ — **Fixed.** V1 import now maps `item_characters` → `item_character_appearances` correctly.
- ~~**`SetDataRoot` can silently create a fresh empty DB** (L5)~~ — **Mitigated.** `AppSettingsModal.vue` shows a warning before the action ("Use this folder will load whatever data already exists there") and informs the user after if `isNewDb` is true. Not a blocking issue.

### Bridge / architecture — RESOLVED

- ~~**`request()` resolves on backend error payloads** (FC-C1)~~ — **Fixed.** The offline path and
  a 30 s timeout already rejected; since 1.1.1 a reply carrying `status: 'error'` rejects too, with
  the backend `message` on the `Error` and the whole payload (including `detail`, the C# stack, and
  per-action flags such as `reported`) on `err.payload`. The hand-written `?.status === 'error'`
  checks were swept in the same pass, and an `unhandledrejection` listener in `api.ts` shows the
  last uncaught one rather than leaving it in the console.
- ~~**Desktop handlers run synchronously on the UI thread** (H1)~~ — **Fixed.** `MessageRouter`
  queues every message onto one static `Task` chain (`_dataPump`) instead of running it in the
  WebView2 event: data-layer actions run there, and only what needs a window, a file dialog or a
  shell hops back via `RunOnUi`. One chain across every window keeps the arrival order and the
  one-at-a-time SQLite access the UI thread used to give for free; the three callbacks that reach
  back into WinForms (`OnSettingsApplied`, `OnChromeThemeApplied`, `OnImportMigrationFailed`)
  marshal themselves. Narrowed by BL-68: the server host already ran `DataActions` off any UI
  thread, so this was the WinForms host alone.
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

### Type checking — RESOLVED

- ~~**`npm run build` fails its own type-check**: 194 `vue-tsc` errors, so the build script was
  only ever run as `vite build`.~~ **Fixed (2026-09-23).** 139 of them were the test suite being
  checked against the app's config: `tsconfig.app.json` excluded `src/**/__tests__/*`, a path that
  has never existed here — the tests live in `src/test/`. The exclude is correct now and
  `tsconfig.vitest.json` checks the suite with `noUncheckedIndexedAccess` off (an `arr[0]` in a
  fixture is not a finding) and Node's globals for the Playwright specs. The remaining 55 were
  hand-fixed rather than silenced, and four were real: `renderGrid` threw on a null
  `layoutSettings`, a missing `YEARS` formatter crashed the grid draw, a `let` assigned only inside
  callbacks was read back as `never` so the settings search never scrolled, and three e2e capture
  hooks were `if (cond)\n  ;(expr)` — the semicolon was the if-body, so they always fired.
  `npm run build` runs the type-check again.

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
- ~~**DataPanel + GalleryPanel double-fetch `GetItemForEdit` per item per pan** (TC-H5)~~ —
  **Fixed.** `utils/itemDetails.ts` holds one `WeakMap<TimelineItem, Promise<ItemForEdit|null>>`
  that both panels read through, so an item is fetched once however many panels want it and the
  gallery stops re-fetching on every pan. Keyed by the item object rather than its id: `upsertItem`
  replaces the object on save, which drops that entry by itself, so there is nothing to
  invalidate by hand.

### Styling consolidation (staged plan in AUDIT_FINDINGS §8)

- ~~**No design tokens; three competing accent systems; two surface systems** (ST-H1–H4): ~230
  color literals, 9 backdrop darknesses, a z-index ladder with real conflicts, no global
  font-family (some windows fall back to serif).~~ **DONE** — `:root` token block in `main.scss`
  (`--app-bg/surface/border/text/accent` family + new `--app-save-accent`, `--app-danger`);
  `font-family: system-ui` + global scrollbar rule added; 18 component/page `<style>` sections
  swept; `canvasTheme.ts` created so Konva reads tokens at runtime; `applyAppTheme` clears
  canvas cache on theme change; `ChromeTheme` (TS + C#) includes save-accent. Remaining bare
  literals are intentional: DB-stored LayoutSettings defaults (TimelineSettingsModal script),
  canvas context-menu semantic colors (dark-canvas overlay), and data-driven item color
  fallbacks. Icon convention settled in CLAUDE.md instead of a sweep.
- ~~**z-index ladder with real conflicts** (part of ST-H3)~~ — **Fixed for 1.1.1.** The app-wide
  rungs are named in `main.scss` — `--z-modal`, `--z-notification`, `--z-lightbox`,
  `--z-menu-backdrop`, `--z-menu`, `--z-menu-sub` — and the twelve raw 9000/9001/9500/9998/9999/10000
  literals now use them. Stacking that only matters inside one component stays a plain small
  number there, on purpose.
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

**Status:** Done for 1.1.1 (2026-09-24). Design agreed with the user; **all six phases (0–5)
done**, plus the six phase-2 follow-ups the user asked for after using it and the two phase-3 ones
below. Phase 5 is BL-17, shipped as BL-73 (the window), BL-76 and BL-77 (the views). What is left
is "Later, not in this plan" at the end of the design — optional ideas the user has for this area,
never specified because the phases were not finished until now. Worth a conversation before 1.1.1
closes.
Six phases below, each shippable on its own. Phases 4 and 5 are BL-17.
**Priority:** 1

Full character management: create/edit characters with biography fields, birth/death dates, states (alive/deceased/unknown), attachment to timeline items, exportable as a character-specific event timeline, and filterable.

> **Aside:** The DB schema already has `characters` and `character_appearances` tables, so the data layer is partially in place. The main work is the UI. Key screens needed: (1) character list with search/filter; (2) character detail/edit form (biography, dates, color, portrait image); (3) character appearances timeline — a filtered view of the main timeline showing only items where that character appears, which is essentially just BL-03 filter applied to one character. The "state" system (born/alive/deceased) should tie into the item dates where possible — if a character has a "death" event, the state should auto-update. The "export as timeline" feature is high value: it lets a writer hand a character's journey to someone else without exposing the full world history.


### Agreed design (2026-09-23)

Decided with the user before any code. Six phases, ordered so nothing is blocked by a later one.

**What already exists, and does not need building:** the `characters`, `character_relationships`,
`relationship_types` and `item_character_appearances` tables are all in `MainDbMigrations`, with
`character_relationships` ported from v1 (type, custom type, degree, modifier, strength,
bidirectional, notes). `CharacterRepo` already has `SaveCharacter`, `DeleteCharacter`,
`GetCharactersByTimeline` and `GetNetwork(timelineId, startCharId, maxDepth)`. None of the write
methods are routed onto the bridge, which is why there is currently **no way to create a character
in the app at all** — every character in a live database arrived through a v1 import.

**Decisions taken:**

- The character screen gets its **own window**, the calendar-editor pattern: `f_Characters.cs` +
  `characters.html` + `CharactersApp.vue` + a sixth vite entry, opened from the activity strip.
  It can then stay open beside the timeline.
- Characters get a **portrait** and an explicit **state**. State is null by default, meaning
  "derive it from `death_year`" — the column is an override, not something to keep up to date.
- `name` splits into **`first_name` / `last_name`**. Existing characters split on the last space
  and stay editable; with this user base a heuristic they can correct beats a migration that asks
  questions.
- **Show on timeline** on the character creates a birth item and a death item, and **the character
  owns them**: editing a date moves the item, unticking the box deletes both, and the items open
  read-only on the timeline with a link back to the character. One source of truth, no drift.
- Character names in an item's text **highlight live and attach on blur**. The textareas stay
  plain `<textarea>` over plain text; the live highlight comes from a mirror `<div>` behind a
  transparent-background textarea (same font, padding and wrapping, matches wrapped in `<mark>`).
  Attaching on blur rather than per keystroke keeps the Characters list from reshuffling
  mid-sentence. Known ceiling: the mirror must match the textarea's metrics exactly or the
  highlight drifts, and the taller boxes need scroll sync.
- Matching is **whole words across every name field** — first, last, full, nicknames, aliases.
  Accepted cost: a character called "Will" or "Mark" will occasionally grab a verb, which is why a
  detected link the user deletes has to stay deleted.
- The matcher is built as **`utils/entityMatcher.ts`, taking a name list**, not as character-specific
  code, so BL-16 can point it at place names later ("Clockwork went to Taiom" attaching Clockwork
  and giving Taiom an event). Detected links are marked as detected in the edit window either way,
  so it is always obvious what the app did on its own.

#### Phase 0 — schema and bridge reach — **DONE (2026-09-23)**

Migration 9 (`V9_CharacterDetails`): `characters.first_name` / `last_name` (backfilled by splitting
`name` on its last space), `portrait_picture_id` (pointing at the existing `pictures` table, so
`MediaRepo.ImportAndSaveMedia` does the copy and thumbnail), `state`, `show_on_timeline`,
`birth_item_id` / `death_item_id` (exactly two items, so two columns beat a join table). Plus
`item_character_appearances.auto_detected` and the `character_link_dismissals` table, so a detected
link the user removes does not come back on the next blur.

`name` stayed as a stored column, derived: `CharacterRepo.SaveCharacter` joins the two halves back
into it on every save, so every existing read (`ORDER BY name`, the appearance lists, the EditItem
picker) needed no sweep. A caller that only knows a full name — the v1 importer — gets it split
instead. Renaming therefore goes through the halves, not through `name`.

Bridge: `SaveCharacter` and `DeleteCharacter` in `DataActions`, `SetCharacterPortrait` in
`MessageRouter` (file dialog, so host-side; it also deletes the picture it replaced, since a
portrait is never shared and `UnlinkAndPruneImage` only prunes item links).

Two departures from the plan, both deliberate:
- **`GetCharacterForEdit` was not built.** `GetTimelineCharacters` already returns whole rows, so
  the window has everything the form needs without a second round trip. It becomes worth adding in
  phase 2, when there are appearances to fetch alongside, and phase 4 for relations.
- **`SetCharacterPortrait` is desktop-only.** The browser host needs the upload half instead, the
  way `AddImagesToItem` pairs with `AddImageToItem` — worth writing when someone runs it there.

#### Phase 1 — the character window — **DONE (2026-09-23)**

Own window on the calendar-editor shell: `Forms/f_Characters.cs` + `characters.html` +
`CharactersApp.vue` + a sixth Vite entry, opened by `OpenCharactersWindow` from the Characters
button in the activity strip. One window per app, closed with the timeline. List + detail split:
the list carries portraits, the form covers every column plus portrait, state, the split names,
color and importance, and birth/death go through `LodDateInput` on the timeline's own calendar.

Migration 10 (`V10_CharacterDatePrecision`): `birth_subtick` / `birth_granularity` and the death
pair. A year alone cannot place an item — the canvas works in `absolute_start = year + subtick *
lodStep` — so a character has to carry the same pair every item carries. Step 9 may already be
stamped in a running database, hence a new step rather than an edit to that one.

*Show on timeline* lives in `utils/characterItems.ts`: `planGeneratedItems` settles the two item
ids *before* the character is written (so one save stores them) and hands back the ids to drop;
`buildGeneratedItem` places each end. The items are built frontend-side and written with the
existing `SaveItem` / `DeleteItem`, which already do tags, appearances, placement, session logging
and the `ItemSaved` broadcast. The portrait is linked to both items through `LinkImageToItem`, so
they carry the face; replacing a portrait deletes the picture row, which cascades the old link away.

Departures from the plan, all deliberate:
- **Generated items are `TypeId: 1` (Event).** Type 7 "Character" still has no renderer; phase 2
  owns that call, as recorded below. *(Phase 2 took it: they are `TypeId: 7` now.)*
- **`DeleteCharacter` is back to `void`.** Ownership moved to the caller: `HandleDeleteCharacter`
  reads the row with the new `GetCharacter` and deletes the portrait file and both generated items
  itself, since those live in other repos. Replacing a portrait was already covered in phase 0, by
  `SetPortrait` returning the picture it replaced.
- **`SetCharacterPortrait` is no longer desktop-only** — the phase 0 open detail, closed.
  `SetCharacterPortraitFromPath` in `DataActions.App.cs` plus a `pickFiles`/`upload` handler in
  `browserHost.ts` give the browser build the same picker.
- **`ItemDeleted` is now broadcast.** Deleting only replied to the caller, so unticking the box
  left a ghost on an open canvas until reload; `api.ts` answers it with `store.removeItem`. Every
  deletion benefits, not only this one.
- **New `GetTimelineCalendar` action**, so the window gets the calendar and LOD profile without
  pulling the whole project. `parseCalendarDef` moved out of `EditItem.vue` into
  `utils/calendarDef.ts` to be shared.
- **`PortraitPath`** rides along on every character read (`LEFT JOIN pictures`), so a list of
  faces costs no lookup each.
- **No prewarm, no saved window position, no F1/F2.** The window opens from a button, once per
  session; shortcuts would mean widening `ShortcutContext` and `CONTEXT_TITLES`, which is more
  than this phase asked for.
- **Generated items still open as ordinary items.** Opening one read-only with a link back to the
  character is a canvas concern, left for later.

Checks: 451 .NET tests, 616 vitest (6 new, `characterItems.test.ts`).

#### Phase 2 — appearances both ways, and the matcher — **DONE (2026-09-23)**

**Item type 7 is the character type** — the user's call, taken at the start of the phase. Generated
birth and death items are `TypeId: 7`, so three "type 7 is not an item" assumptions had to come out:
the `type_id != 7` filters in `ItemRepo.GetItemsByTimeline` / `GetItemsByYear`, the same filter in
`SessionChanges.Load`, and `7` in EditItem's `hasSide` exclusion list. Checked against the user's
live database first — no type-7 rows exist, so nothing was resurrected. On the canvas they reuse
the Picture geometry and image loader through one shared predicate,
`timelineNodes.isPortraitType(typeName)`, and differ only in being round: a portrait disc on a
stem, falling back to the character's color when there is no portrait. Filterable as *Character*,
and the type shows in the editor's dropdown but is disabled unless the item already is one.

**Both directions of the appearance list.** `CharacterRepo.GetAppearances` is the reverse of
`ItemRepo.GetItemCharacterAppearances`; the character form lists every item with its role, a row
click jumps the timeline to it and the pencil opens the item editor. Cross-window focus is a
`FocusTimelineItem` broadcast carrying `{ItemId, AbsoluteStart}` — the absolute position travels
with the message, so the timeline window does not need the item loaded to jump to it.

**The matcher.** `utils/entityMatcher.ts` takes `{id, names[], color}` and returns matches with
offsets: whole-word, case-insensitive, longest name first, and `\p{L}\p{N}_` lookarounds instead
of `\b` so accented names are not matched inside longer words. Characters are adapted to it by
`characterEntity()`, which also splits the comma-separated nickname and alias fields.
`components/HighlightedTextarea.vue` draws the matches in a mirror `<div>` under a
transparent-background textarea and attaches on blur; Description and Content use it, Notes stays
plain. Detected links are marked with a wand in the character list, stored with
`auto_detected = 1`, and removing one writes a `character_link_dismissals` row so the next blur
leaves it alone. Re-attaching by hand clears that row, inside `SaveItemFull` where the manual
appearance is written.

Departures from the plan, all deliberate:
- **Removing *any* appearance dismisses it**, not only a detected one. A hand-added link the
  matcher then re-adds on the next blur would be the same annoyance, and a manual add takes the
  dismissal back again.
- **`+ New "<name>"` saves immediately.** The picker's filter text becomes the name and
  `SaveCharacter` splits it, so the new character exists before the item is saved — an item that
  is then cancelled leaves a character behind, which is the cheaper of the two wrong answers.
- **No debounce on the highlight.** Matching runs in a `computed` over the whole field; at the
  length these fields run to it is not measurable. Ceiling noted in the component.
- **The mirror duplicates the field metrics** rather than inheriting them — a scoped parent style
  cannot reach inside a child component. If they drift the highlight drifts with them.
- **The highlight does not use the character's color raw.** The first build did, and the first
  character it met was `#00011f`: against the dark field the wash came out darker than the
  background and the underline was invisible, so it read as "the matcher does not highlight". The
  color is now clamped to a lightness floor in HSL, which keeps the hue that tells characters
  apart. `HighlightedTextarea.test.ts` holds that floor.

Checks: 452 .NET tests (1 new: the detected-link round trip), 626 vitest (10 new:
`entityMatcher.test.ts`, `HighlightedTextarea.test.ts`), 194 vue-tsc errors (the baseline at the time; cleared right after, see BL-18),
`vite build` clean.

#### Phase 2 follow-ups — **DONE (2026-09-23)**

Six things the user asked for after living with phase 2 for an afternoon. All approved before any
code, in this order:

1. **Edit character, from the item.** A birth or death item's real editor is the character, so the
   canvas context menu and the item view modal both offer *Edit character* on a type-7 item.
   Shift-click and *Edit item* are untouched — the user was explicit that those stay item edit.
   `CharacterRepo.GetCharacterIdByItem` answers the new `GetCharacterIdForItem` action (both hosts,
   since it lives in `DataActions`); `OpenCharactersWindow` grew an optional `characterId` rather
   than a second action — a fresh window gets it on the query string, an open one gets a
   `FocusCharacter` broadcast, the `FocusTimelineItem` pattern in reverse.
2. **The characters window prewarms**, on the `f_Calendar` pattern: after the timeline window
   settles, and again whenever the characters window is closed. The phase-1 "no prewarm" note is
   gone with it.
3. **`characters.use_highlight_color`** (migration 11). A portrait with transparency sat straight
   on the character's color and drowned the face. The disc is neutral now and the color rides
   the ring and the stem; ticking *Use highlight color* on the character puts the fill back.
   Off by default, existing rows included. The flag reaches the canvas as a `LEFT JOIN` on
   `GetItemsByTimeline` — the alternative was a bridge call per character on screen.
4. **Captions fold to two rows.** Picture captions and character names wrap instead of losing
   their second half to an ellipsis, and are cut at two rows. The strip only claims the height it
   uses, so a one-line name still shows one line of picture.
5. **Portraits claim the lanes they actually cover.** A portrait is as tall as it is wide — two or
   three event boxes — and grows from its lane towards the axis, so events were being packed into
   lanes it was already sitting in and drawn through its face. `LaneLock` carries a `laneSpan` and
   the collision test compares bands instead of single lanes; `laneSpanFor()` does the arithmetic.
   Reference ghosts pack the same way.
6. **The name highlight has padding and a border.** An inline span cannot take horizontal padding
   without shifting the text off the textarea it mirrors, so the breathing room is `box-shadow`
   spread — a 2px ring in the wash color, a 1px border outside it — plus vertical padding, which
   a line box ignores.

Departures worth recording:
- **`GetCharacterIdForItem` resolves in `TimelineApp`, not the canvas.** `TimelineCanvas` emits an
  item id and knows nothing about characters, which is how it stayed through phase 2.
- **`use_highlight_color` defaults to off**, so every existing character changes appearance on
  upgrade. The feature is unreleased, and the default the user complained about is the one being
  left behind.

Checks: 453 .NET tests (1 new: the flag joins onto the character's items), 636 vitest (7 new:
lane spans, `laneSpanFor`, the neutral disc, the wrapping caption, the highlight ring, the two
*Edit character* modal cases), 194 vue-tsc errors (the baseline at the time; cleared right after, see BL-18), `vite build` clean.

#### Phase 3 — the character's own timeline — **DONE (2026-09-23)**

An **appearances window**: BL-66's read-only timeline narrowed to one character, opened from the
“Appears in” header on the character form and from *Their timeline* on a right-clicked portrait.
`OpenTimeline` carries a `characterId` alongside `readOnly`, so it rides the plumbing that already
existed — `f_Timeline.CharacterId` → `&characterId=` (cold start) or the `SetTimelineId` payload
(prewarmed) → `store.characterFocusId`, and the browser host adds the same query parameter.

Two departures from the plan, both deliberate:

- **The items are narrowed, not the filter.** `loadTimelineData` drops everything the character has
  nothing to do with, and `upsertItem` turns away the same items when an edit broadcast arrives from
  the main window. The filter would only have narrowed the canvas; this way the minimap, the notes
  panel, the export and the item count agree with each other. The predicate (`belongsToFocus`) keeps
  their appearances, their birth and death items, and the boundary markers that carry the timeline's
  extent.
- **The export is reached from inside that window**, not from new UI on the character form: the
  strip's export button is shown there (`allowExport`, since the window is otherwise read-only) and
  `ExportTimeline` picks up `store.characterFocus`. The session-changes tab is hidden there — a
  per-day diff of the whole timeline does not belong in one character's export. The file is named
  “*Timeline* - *Character*.stlm”.

Server-side the filter is one `WHERE` clause in `TimelineExporter.ExportToZip`: every other table in
the archive is derived from the exported item ids, so tags, stories, pictures and appearance rows
follow without any further filtering. Both hosts pass it (`MessageRouter`, `FileEndpoints`).

#### Phase 3 follow-ups — **DONE (2026-09-23)**

Both asked for after using the appearances window.

- **A caption font size of its own, twice over.** A portrait's caption is a generated sentence
  (“The birth of *full name*”) and overflowed the disc at the event font size, which a picture's
  own title never does — so the user chose two settings rather than one. Migration 12 adds
  `timeline_picture_caption_font_size` and `timeline_character_caption_font_size` to
  `layout_settings`, both backfilled from `timeline_event_font_size` so no existing timeline
  changes appearance on upgrade. `buildNode` branches on the same `round` flag it already uses for
  the disc, and the two-row clamp follows the size in use. New settings section, *Pictures &
  Portraits* — the `TimelineBoxTypes*` fields still have no control and did not grow one here.
- **The character lifeline.** In an appearances window, a wave along the centre axis in the
  character's color, from birth to death. Wavy rather than a bar so it reads where it passes under
  an age band and is never mistaken for the axis it rides on; with an end the character has no date
  for, the whole wave is dashed and runs off that edge of the window, because an unrecorded death is
  not a short life — and the phase is anchored to the dated end so that one still holds still. Drawn
  per frame in its own layer under the items, on the same `getXFromTime` mapping as everything else,
  and phase-anchored to the start of the life so it travels with the character instead of crawling
  underneath them while panning. Positions come from the character's own dates via
  `characterAbsolute` (extracted from `buildGeneratedItem`), so the lifeline is right even when
  *Show on timeline* is off and there are no birth/death items at all. Ages drop to 0.55 opacity in
  that window only, so the life shows through the bands it runs under.
  Defaults chosen, none of them settings yet: amplitude 7px, wavelength 44px, sampled every 4px.

**Deferred to after phase 4 — DONE (2026-09-23), differently.** Family members show on a
character's own timeline as the portraits they already are: `loadKinItemIds` in `timelineStore`
reads the focus character's relations once at load and keeps the birth/death items of everyone
they are tied to, so `belongsToFocus` lets them through. Not smaller and not dimmed — the items
already draw as portraits, and a second size for them would have been a rendering path of its own
for no reading the normal one does not give. Relations, not surnames: an in-law belongs, a
namesake does not.

#### Phase 4 — relations, as a list (BL-17) — **DONE (2026-09-23)**

**Decided (2026-09-23):** the relations designer is a **panel in the Characters window**, not a
window of its own — the same place the character being related is already open.

Repo over `character_relationships` plus a section on the character form: A → type → B.

- **One row per pair, not one per direction** — a deliberate deviation from the plan's "other
  side's row generated when it is bidirectional". `relationship_types` already carries `a_to_b`,
  `b_to_a` and `one_way`, so direction is a property of the kind: the panel reads the row from
  whichever end is open (`relationLabel` in `utils/characterRelations.ts`) and there is no mirror
  row to keep in step, or to leave behind when one side is deleted.
- **Migration 13** seeds the starter set the user picked — family (parent/child, sibling, spouse)
  and social (ally, rival, mentor/student) — and gives a relation optional dates at both ends:
  `start_year` / `end_year` nullable beside the `subtick` + `granularity` pair every dated thing
  here carries. NULL means "for as long as both were here", which is what most relations are: a
  son is one from birth. Dates are for the ones that are not — adopted, estranged, remarried.
- **A kind editor** folds out of the panel header: name, the two readings, a group, delete.
  Deleting a kind leaves the relations that used it showing its raw id rather than silently
  cutting somebody out of a family tree. Ids are slugged from the name once, on the way in,
  because relations store them.
- Backend is `CharacterRepo` (six methods, beside `GetAppearances`) plus six `DataActions` cases,
  so both hosts get it; `GetCharacterRelations` returns relations and kinds in one round trip.

#### Phase 4, round two — what the user asked for after using it (2026-09-23) — **DONE**

- **Twenty kinds, not six.** Migration 14 seeds the vocabulary v1 offered: family out to
  grandparent, aunt/uncle, cousin, the steps, the halves and the in-laws, plus friend, best
  friend, colleague, neighbor, acquaintance and enemy beside the social six. `OR IGNORE`, so a
  database that already carries an id keeps the user's wording.
- **Gendered wording.** `relationship_types` gained `a_to_b_f` / `a_to_b_m` / `b_to_a_f` /
  `b_to_a_m`, filled only where English has a word — *mother of* / *father of*, nothing at all
  for cousin — and `characters` gained a free-text `gender` with a suggestion list behind it.
  `relationLabel` picks the gendered phrase when it has one and falls back to the neutral reading
  otherwise, so a gender outside the two English has words for reads neutrally by design.
- **`CharacterRelateModal`** replaces the inline form: every other character as a searchable row
  with portrait, years and state, the chosen kind spelled out both ways round with each end's own
  gender, a swap button, and the existing relations listed beside it to edit or delete. The kind
  editor moved into it, four wording fields wider.
- **`CharacterFamilyModal`** — the same-last-name banner. `familyGuesses` pairs every member and
  guesses from the birth years (`GENERATION_YEARS = 16` apart → parent, closer → sibling); each
  row is re-kindable, swappable and untickable. Pairs that are already related are shown but
  never ticked, which is how duplicates are kept out — `SaveRelationship` has no pair dedupe, so
  that is the UI's job. The check fans `GetCharacterRelations` over the family (small N) and
  compares `pairKey`s; if the family ever stops being small, that is one backend call to add.

#### Phase 5 — the relations graph (BL-17)

Centred on one character, one degree at a time, click to recentre; `GetNetwork` already walks the
graph, so this is rendering. Two calls to make with the user when the phase starts, not before:
the layout library (`d3-force` against drawing it in Konva, which the app already ships), and
whether the graph answers to the timeline's current year — **that one is answered**: phase 4 gave
relations optional `start_year` / `end_year`, so the graph can dim what had not begun or had
already ended, and treat an undated relation as always true.

#### Later, not in this plan

The user has further optional ideas for this area, to be specified when the phases above are done.

---

## [BL-17] Character relations screen

**Status:** Done for 1.1.1 (2026-09-24). **Phase 4 done (2026-09-23)**, including its second
round: twenty seeded kinds, gendered wording, the relate modal, the same-last-name family
suggestion, and family on a character's own timeline. A third round the same day followed the user
living with it: kin portraits draw at `KIN_SCALE` (0.6) and 0.8 opacity so the window still reads
as one person's, and `#timeline-center` takes an inset ring in the focus character's color — CSS on
the page, so the browser build gets it too.
**Phase 5, the graph, shipped 2026-09-23/24**: BL-73 is the window, BL-76 added four views and
BL-77 replaced the ones that said nothing, leaving seven. The open call recorded here — `d3-force`
against drawing it in Konva — went to **Konva**: `stepForces` in `relationsGraph.ts` is the whole
simulation, no dependency added, and six of the seven views are laid out rather than simulated.
**Priority:** 1 (same track as BL-15, last in line)

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
  `settings`), kept in sync with the timeline viewport via push messages. Since BL-68 that is two
  hosts: the browser build turns the same `OpenXWindow` into a `window.open` pop-up, so the design
  has to say what "position persisted" means where the host cannot place a window.
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

## [BL-60] Calendar window — more functionality

**Status:** Put away for later (2026-09-23) — the one defined item is done and nothing else
has been specified, so there is nothing to pick up. First item done (1.0.3): the month grids (`CalendarMonthGrid.vue`, used by the
year-calendar window and the timeline's calendar overlay) are `user-select: none`, so dragging
across days no longer highlights the numbers. Open for more; nothing else defined yet. (1.0.3
also added **Export** to the editor header via BL-59.)

The calendar windows (`f_YearCalendar` / `YearCalendarApp.vue`, `f_Calendar` / `CalendarApp.vue`)
need more than they have today; ideas to be collected here as they come up.

- ~~Day numbers should not be selectable as text~~ — done (1.0.3).
- Later: click events on days (open / add items on that date, jump the timeline there).

---

## [BL-23] App icon

**Status:** Put away for later (2026-09-23). Placeholder in place, and the real work is not
ours — it waits on the commissioned artwork.

The application currently uses a placeholder icon. A proper icon (`.ico` with
16/32/48/256px variants, plus a matching `favicon`) should be provided.

Since BL-68 the favicon is visible rather than incidental: the browser build shows it on every
tab, and there are five entry points (`index`, `timeline`, `editItem`, `calendar`,
`yearCalendar`) that would all carry it.

> In the `.csproj`, set `<ApplicationIcon>` to the `.ico` path. The icon will appear in the
> taskbar, Alt-Tab switcher, and the title bar of any non-borderless window. For the
> borderless windows a small SVG/PNG version can be shown in the Vue title bar next to the
> window title.

---

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

> **Columns are already waiting for this (migration 17).** `characters.birth_location_id`,
> `characters.death_location_id` and `items.location_id` were added ahead of time so the relations
> views could be built without a second migration later. They are TEXT, have no foreign key and
> nothing reads or writes them — placeholders, not a decision. **This feature owns them:** if the
> design lands on a junction table, or on coordinates rather than ids, change or drop them in the
> step that builds locations. Do not treat them as a constraint.

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
- Recurring celestial events appear as a small colored dot on their active days, with a
  hover tooltip giving the event name and description.
- A settings toggle (per calendar, not global) controls whether celestial data is shown —
  off by default so it doesn't clutter the default calendar view.

### Configuration UI

A new "Celestial" section in the timeline's calendar settings (alongside months, seasons,
weeks). Add / remove moons and recurring events. Each moon has: name, synodic period, phase
anchor date picker, color. The anchor date picker reuses `LodDateInput` at DAY granularity.

### Scope notes

- No orbital mechanics beyond the synodic phase formula — no elliptical orbits, no
  gravitational interactions, no eclipse prediction. Pure periodic phase arithmetic.
- Tidal effects, planetary visibility windows, and constellation tracking are explicitly
  out of scope (interesting but too open-ended for now).
- The formula works for any `synodicPeriodDays` value, including non-integer periods, so a
  world with a 13.7-day moon and a 41-day moon works correctly.

---

## [BL-34] In-app manual / help system

**Status:** Pending — important but not urgent, defer to post-v2.0. Partly covered in the
meantime by the F1 help modal, which was brought up to date for 1.1.0 and already carries the
strip, shortcuts, sharing and Low resource mode; this item is the searchable, deep-linkable
version of it, not a first attempt. A `help.html` entry point now has to be served by both hosts
(the WinForms window and the server's static file list), as BL-68's five entry points are.

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

## [BL-22] Theme / color scheme settings for the window chrome

**Status:** Done. Full `AppThemeModal.vue` with color pickers for 10+ chrome properties (appBg, appSurface, appBorder, appText, etc.), dark/light presets, live preview via `applyAppTheme()`, and persistence through `SaveChromeTheme`.

Now that the title bar and resize rim are rendered by Vue, the window chrome participates
in the same theming system as the rest of the UI. A settings panel section (or a dedicated
"Window theme" picker) should expose at minimum: title bar background color, title bar
text/icon color, border rim color. Bonus: pre-built dark/light/accent presets that cascade
into the existing timeline color tokens.

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
  name, color swatch if seasons are colored, day-range label). The active tile animates
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
  color or a default accent). Multiple items on the same day stack — show a count badge or
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

1. **Age / era bands** — Age and Period items rendered as flat color bars stacked above the
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

## [BL-33] Session changes export and import collision screen

**Status:** Done for 1.1.0 (2026-09-22). Snapshot diff, not triggers. A session turned out to be a
**day**, not an app run: the `session_days` log survives closing the app, and the export screen
lets the user tick which days go in the file.

`StoryTimeline.Data/Database/SessionChanges.cs` is the whole engine. `EnsureSnapshot(timelineId)`
is called from `HandleGetTimelineData`, so opening a timeline starts — or resumes — today's row in
the `session_days` log (see below). An item's `Signature` is a JSON array of the fields a
co-writer would see plus its tags, story refs, chapter refs and character appearances — `created_at`
and `updated_at` are left out, or every row would read as changed. `type_id = 7` rows are skipped:
those are character cards, and `GetItemsByTimeline` skips them too.

Links travel as the **full desired set**, not as add/remove pairs, so applying is a replace and
`ItemRepo.SaveItemFull` is reused verbatim — there is no second copy of the save logic. Links
pointing at a character, story or chapter the receiving copy does not have are dropped and counted
in `SessionApplyResult.Dropped` rather than failing a foreign key and losing the item.

A collision is: the local row exists **and** its `updated_at` no longer equals the
`baselineUpdatedAt` carried in the file (the shared ancestor both copies started from), or, for an
insert, the id is already here.

Actions: `GetSessionChanges` / `PreviewSessionChanges` / `ApplySessionChanges` in `DataActions`,
`ExportSessionChanges` / `BrowseAndPreviewSessionChanges` in `MessageRouter` (they need a file
dialog), and an `ExportSessionChanges` branch in `FileEndpoints` for the browser build.

**Shipped with two choices, not three.** BL-33 called for *Keep incoming / Keep local / Skip*, but
without somewhere to persist a deferred decision "Skip" does exactly what "Keep local" does — the
row is left as it is and the file is not consulted again. Add the third when a deferred-decisions
store exists.

**A session is a day, and it lives in the database.** `session_days` (migration 8) holds one row
per day a timeline was worked on. Only the open day carries a `baseline` — `{itemId: {s, u, t}}`,
all a diff needs — and when a later day opens, `EnsureSnapshot` seals it: the baseline is replaced
by that day's net change set plus its counts, and any older row left open by a crash is sealed
empty. One baseline per timeline, ever, so the log stays small however long the history runs, and
closing the app no longer loses the day's work.

`Build(timelineId, days)` takes any set of days, contiguous or not, and `Merge` folds them oldest
to newest: the newest version of an item wins, but the ancestor comes from the **oldest** day in
the range — the version the other copy still has. Taking the newest day's ancestor would make
every row read as a collision. An item written and deleted inside the range is left out entirely,
because the other copy never saw it.

`session_exports` records where the last export stopped, which is what *everything since the last
export* selects; `GetSessionHistory` returns the day list and that marker together. Exporting a
partial range moves the marker to the newest day exported, so deliberately skipped older days stay
skipped.

### Session changes export

*The original ask, kept for the reasoning. What shipped is above; the one thing that changed is
that a session is a calendar day, not an open-to-close app run.*

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
snapshot diff approach unless replay fidelity becomes important. — *Not taken; the snapshot diff
shipped.*

### Import collision screen

When applying a session changes file, detect rows where `op=update` or `op=delete` and the
local copy was also modified since the session export timestamp. Present a simple side-by-side
comparison (incoming vs local) with per-item radio buttons: **Keep incoming / Keep local /
Skip**. Default: keep incoming (last write wins). A "Select all incoming" / "Select all local"
bulk toggle keeps the flow fast for users who just want to accept everything.

This screen applies equally to any future import path that involves per-item merging (not just
session changes).

**Built as `SessionChangesImportModal.vue`.** Every row carries a pair of checkbox-styled radios,
**Incoming** / **Local**, defaulting to Incoming, plus *Take incoming for all* / *Keep local for
all* at the top and a running tally. The side-by-side grid only appears on the rows that collide —
elsewhere there is nothing to compare — and the fields that actually differ are highlighted.

The choice is offered even on a row this copy does not have, because `Apply` treats
`decisions[id] == "local"` as `Kept++; continue;` for *any* op: "Local" on an incoming insert means
"do not add it", which is a real choice, not a no-op. Under each row a sentence spells out what the
current pick does (“Overwrite my version with theirs” / “Leave it out — nothing is added here”),
and a short block above defines the two words, because *incoming* and *local* mean nothing to a
writer. Reached from the database menu on the project list: **Import Changes**.

The matching export is a **tab** on the existing Export dialog (`ExportTimelineModal.vue`), reached
from a new export button on the timeline's activity strip, just above the `?`. The *My work* tab
lists the days newest first with each day's counts; the ticks are the single source of truth and
the two `<input type="date">` boxes and the *Everything since the last export on …* / *All of it*
buttons only rewrite them. Under the list are the merged counts and titles — what the file will
actually contain — recomputed whenever the selection changes. Nothing is written until Export.

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

## [BL-39] Extended keyboard shortcuts

**Status:** Done for 1.0.3 (2026-09-20); `R` landed with BL-66 step 1. Shipped as designed with
two deviations: the type picker's Note key is `O` (`N` = last type, `P` = Period), and the pan
speed setting lives in Timeline settings → **General** next to the mouse pan settings
(`settings.keyboard_pan_speed`, migration 7). Also added: the `?` flyout's Shortcuts entry, F1 /
F2 in the edit and both calendar windows, title autofocus on open, and Ctrl+Z actually wired
(it was documented in Help but never implemented). Power-user set still empty.

**Remapping done for 1.1.0 (2026-09-22).** `Shortcut.fixed` marks the conventions the user cannot
take away (Esc, Enter, Ctrl+S, Ctrl+Enter, F1 / F2 / F10 / F11, arrows, Tab, Ctrl+Z); everything
else is remappable. `keysOf(s)` resolves a shortcut to its chords, an override replacing every
default chord; `conflictOf` and `rejectChord` validate a new one. Overrides are keyed
`` `${context}:${id}` `` — `id` alone is not unique (`help`, `save`, `shortcuts` repeat) — and
`utils/shortcutOverrides.ts` stores the whole table as one JSON blob under the misc setting
`shortcut_overrides` at timeline 0, so nothing changed on the C# side. `useShortcuts` builds its
lookup table in a `computed`, so a remap is live on the next key press without a reload. The
Shortcuts modal grew a **Customise…** mode: click a row, press the chord, Backspace restores the
default, Esc cancels the capture — the capture listener is capture-phase with
`stopImmediatePropagation()` so Esc does not reach `BaseModal` and close the list. The type
picker's letters come from the registry entries `pickEvent` / `pickPeriod` / `pickAge` /
`pickPicture` / `pickNote`, with 1–5 always working as a fallback, and the "repeat last type"
key follows whatever `addItem` is mapped to.

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
- Done in 1.1.0: the registry's `keys` are the defaults, user overrides live in app settings
  (`shortcut_overrides`, timeline 0), and the same modal grew an edit mode. No handler changes.

### Focus rules

- While an input / textarea / select / contenteditable has focus only Ctrl/Alt chords and
  F-keys fire; bare letters, digits, Space and arrows belong to the field.
- `Esc` in a field blurs it (next key is a timeline shortcut again); elsewhere it closes the
  topmost modal / menu as today.
- While a modal is open, timeline shortcuts are off except `Esc` (`useModalGuard` keeps a stack;
  see BL-71 for why it is a stack and not a counter).

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
the title, author and color strip. Add a compact mode (single line, smaller type) and a way to
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
`components/MemorableDaysModal.vue` (list on the left, color / name / type / picker on the right,
live edits, Add Day / Delete / Close); the section body is a row of color-dot chips (click = open
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
picks up the default color.

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

## [BL-62] Configurable color swatches

**Status:** Done (1.0.3). `utils/timelinePrefs.ts` — 12 hex strings stored per timeline in
`misc_settings` under `color_swatches` (existing `Get/SetMiscSetting` bridge, no migration);
malformed values fall back to the defaults. Timeline Settings → General shows a chip of 12 color
dots that opens `components/SwatchEditorModal.vue` (12 pickers, Reset to defaults, Cancel / Apply);
`EditItem.vue` loads them per timeline. The filter color rule builds its palette from the colors
actually in use (`store.allTimelineColors`), not these 12, so it was left alone.

The 12 quick-pick colors in the edit window (`COLOR_PALETTE` in `EditItem.vue`) are hardcoded.
Add a "Color swatches" row to Timeline Settings — 12 color pickers with a "reset to defaults"
button — stored per timeline, and have `EditItem.vue` read them from the timeline instead of the
constant. Also used by any other palette that shows the same 12 (filter color rule).

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
## [BL-67] Cross-platform data layer

**Status:** Done (2026-09-21). `StoryTimeline.Data/` is a plain `net10.0` class library holding the
whole `Database/` tree plus `Logger` and `AppConfig`; the WinForms project references it and both
build with zero warnings. The five host couplings are resolved:

- Thumbnails run on SkiaSharp (`MediaRepo.WriteThumb`), covered by `MediaRepoThumbTests`. WebP now
  thumbnails too — the skip existed only because GDI+ had no decoder.
- `StatsDbInitializer` uses `AppContext.BaseDirectory` instead of `Application.StartupPath`.
- A failed config read raises `AppConfig.OnLoadError`; `Program.cs` supplies the MessageBox.
- The import file dialog moved to the host as `Database/DatabaseImportUI.cs`; `DatabaseImporter.Import`
  stayed in the library.
- `SchemaMigrator` reads `AppInfo.Version` (entry assembly) rather than the host's `UpdateChecker`,
  which now delegates to it.

382 .NET tests pass and the app boots and migrates a fresh database unchanged. Left for BL-68:
`SkiaSharp.NativeAssets.Linux` / `.macOS` once a non-Windows publish exists.

Move `Database/` out of the WinForms project into a class library targeting plain `net10.0` (no
`-windows`), so the same repositories run on macOS and Linux. The layer is ~5,600 LOC and only two
files are OS-bound:

- `Database/MediaRepo.cs` — `System.Drawing.Drawing2D` / `.Imaging` for thumbnailing. Replace with
  ImageSharp or SkiaSharp (both cross-platform and AGPL-compatible).
- `Database/StatsDbInitializer.cs:10` — `Application.StartupPath` → `AppContext.BaseDirectory`.

Dapper and Microsoft.Data.Sqlite are already cross-platform; SQLitePCLRaw ships its native bundle
per-RID, so a self-contained publish per platform covers it.

> **Aside:** do this first and alone. It is a mechanical move with `StoryTimelineMk2.Tests` behind
> it, so it can land and be verified before any server work starts — the WinForms app keeps
> referencing the library and should not notice the difference.

---

## [BL-68] Local server + browser build (Mac / Linux support)

**Status:** Done for 1.1.0 (2026-09-22). Design pass done (2026-09-21) — decisions, measured action split and
phases below. **Phases 1 to 4 done**; phase 5 (browser fit-and-finish) started 2026-09-22 and
closed its audit list on the same day. The macOS artifact has been run on the target Mac, and
every release is checked there before it is published. A browser now reaches every screen, not
just the data-only ones: windows open as pop-ups, file dialogs as `<input type="file">`, exports
as downloads, and a release now produces a self-contained server for Windows, Linux and both
kinds of Mac.

Ship a second host: an ASP.NET Core binary the user runs locally that serves the built SPA and
answers the same action names the WebView2 bridge answers today. Data stays on the user's machine
— this is not hosted SaaS. Driver: a $99/yr Apple developer certificate is not affordable, so a
native Mac build is out.

### Decisions (2026-09-21)

- **Scope: Mac and Linux only.** Windows keeps the WinForms + WebView2 app unchanged, so the
  platform that has users carries no regression risk, and a host-bound feature may simply hide in
  the browser instead of needing a full substitute.
- **Transport: one WebSocket at `/bridge`.** Every handler already writes to a sink
  (`ReplyToVue` → `Post` → `PostWebMessageAsJson`), and `StatsService` already keeps a weak-ref
  registry of live WebViews to broadcast achievements to — so "a client registry with
  `Post(object)`" is the shape the code already has, and that is a WebSocket hub. Swapping
  `postMessage` for `ws.send` and the message listener for `ws.onmessage` leaves the correlation
  map, the 30s timeout and the unprompted-push branch in `api.ts` untouched. Per-action HTTP would
  need request/response reshaping *plus* a second channel for pushes. Bytes stay on plain HTTP:
  `POST /upload`, `GET /download/{token}`, `GET /media/*`.
- **Binding: loopback only (127.0.0.1), no auth.** Nothing on the LAN can reach it, so there is
  nothing to log in to.
- **Packaging: self-contained per RID** (osx-arm64, osx-x64, linux-x64). No prerequisite install,
  at roughly 90–110 MB per download before compression — bigger than the Windows offline
  installer, and that is accepted.
- **Windows: `window.open`.** The five Vite entry points already carry their state in query
  strings. In-page panels are a later item if the popup model proves annoying in practice.
- **macOS: shipped unsigned, quarantine cleared by hand (2026-09-21).** A binary downloaded
  through a browser carries `com.apple.quarantine`, and macOS refuses it with "the developer
  cannot be verified" until it is notarized — which needs the same $99/yr Apple account this
  whole item exists to avoid. Exactly one person will run the Mac build, so they clear it with
  `xattr -dr com.apple.quarantine <file>` and the install notes say so. No Apple account, no
  notarization, no `.app` bundle. Revisit only if the app is ever sold.

### Action split (measured)

63 of the 94 actions are pure data and port unchanged. The 31 host-bound ones are six problems,
not one:

| Group | Actions | Browser substitute |
|---|---|---|
| Window chrome | `WindowMinimize` / `MaximizeRestore` / `GetMaximized` / `Close` / `StartDrag` / `SetTopMost`, `ToggleFullscreen`, `ToggleCustomScaling` | Custom title bar hidden; Fullscreen API; CSS `zoom` for custom scaling; topmost drops |
| Open a window | `OpenTimeline`, `OpenAddEditItemWindow`, `OpenCalendarEditorWindow`, `OpenYearCalendarWindow` | `window.open` on the matching entry point, same query string the form builds |
| File in | `AddImageToItem`, `ImportCalendar`, `BrowseAndPreviewImport`, `BrowseAndPreviewTimelineImport`, `ExecuteImportDB` | `<input type="file">` → upload → the *existing* path-taking handler runs unchanged |
| File out | `ExportTimeline`, `ExportCalendar`, `ExportFullDB` | Write the temp file server-side, reply with a download URL |
| Folder / shell | `BrowseDataFolder`, `OpenDataFolder`, `OpenBackupsFolder`, `OpenExternalUrl` | `OpenExternalUrl` → `window.open`; the three folder actions have no browser equivalent and hide |
| Fonts / updater | `GetSystemFonts`, `CheckForUpdates`, `SkipVersion` | `SKFontManager.Default.FontFamilies` — Skia already ships from BL-67. The update *check* is portable HTTP; only installing is not |

Five more are mixed — `SaveItem`, `SaveSettings`, `SaveChromeTheme`, `ToggleCustomScaling` and
`SetCalendarYear` do real data work plus one host side-effect (`SaveChromeTheme` saves the config,
then repaints every `BorderlessFormBase`). Each splits cleanly; the side-effect is a no-op on the
server.

### Phases

1. **Shared bridge core.** ✅ Done (2026-09-21). `StoryTimeline.Data/Bridge/` now holds
   `IBridgeChannel`, `BridgeHub` and `DataActions` — 57 handlers (798 lines) moved verbatim out of
   `MessageRouter`, which keeps the 37 that need a window, a dialog or a shell and tries
   `_data.TryHandle(message)` first. `Post` is gone: replies and pushes both go through
   `Bridge/WebViewChannel.cs`, and `StatsService` broadcasts achievements through `BridgeHub`
   instead of its own WebView list. Two host hooks were needed — `DataActions.SystemPrefersDark`
   (a registry read, wired in `Program.cs`) and `SaveItemPayload`, which stayed with the still
   host-bound `SaveItem`. No user-visible change. 396 .NET tests pass, 14 of them new
   (`StoryTimelineMk2.Tests/Bridge/`): hub register/dedupe/unregister/weak-ref/dead-channel
   behaviour, all 57 data actions still dispatched, all 37 host actions still refused, and
   round-trips through a fake channel.
2. **Server host.** ✅ Done (2026-09-21). `StoryTimeline.Server` (`Microsoft.NET.Sdk.Web`,
   `net10.0`) binds 127.0.0.1 only and serves the built SPA, `/media` and a `/bridge` WebSocket
   that hands each message to the phase-1 `DataActions`. One `BridgeSession` per open page:
   an unbounded outbox drains to the socket (a WebSocket allows one send at a time), messages
   are handled in order, and a host-only action answers `{status:"error"}` rather than leaving
   the page's promise to time out. `api.ts` picks its transport at load — WebView2 when
   `window.chrome.webview` exists, the WebSocket otherwise — and rejects everything in flight
   when that socket closes. `release.ps1 -Dev` now publishes `release\dev\win\` (WinForms) and
   `release\dev\web\` (server + `wwwroot`). 416 .NET tests pass, 20 of them new
   (`StoryTimelineMk2.Tests/Server/`: arg parsing, SPA resolution, a real Kestrel on a real
   socket answering a real `ClientWebSocket`), plus 546 frontend tests, 6 of them new
   (`src/test/bridge/transport.test.ts`).
3. **Browser substitutes.** ✅ Done (2026-09-21). `Frontend/src/bridge/browserHost.ts` is the
   browser's stand-in for the WinForms host: one table keyed by the same 25 action names, which
   `api.ts` consults before anything reaches the socket. Windows become named `window.open`
   pop-ups on the matching entry point with the query string the form builds (and a re-open
   steers the window already there, the way the host reuses its form); window chrome becomes the
   Fullscreen API plus no-ops for minimise, drag and topmost; file dialogs become a hidden
   `<input type="file">` whose file goes to `POST /upload` and comes back as a path the existing
   handler reads unchanged; exports become `POST /export` plus an `<a download>`; fonts come from
   `queryLocalFonts()` with a web-safe fallback when the user has not granted it; `OpenExternalUrl`
   is a tab and the three folder actions report the path instead. Cross-window pushes
   (`CalendarsChanged`, `SetCalendarYear`, `YearCalendarClosed`) travel by `window.postMessage`.
   Components now subscribe to pushes through the new `BackendAPI.onHostMessage()` rather than
   `chrome.webview` directly — `TimelineApp.vue` did that unguarded, which threw on mount and was
   why a browser showed little past the splash screen. 15 actions that needed no window, or only
   a hook back into one, moved from the host half to `DataActions` along the way. 420 .NET tests
   and 547 frontend tests pass, 18 of them new (`src/test/bridge/browserHost.test.ts`, upload and
   export endpoints in `Server/BridgeServerTests.cs`).
   The `mediaUrl()` helper came forward into phase 2 (`Frontend/src/utils/mediaUrl.ts`, 10 call
   sites across 7 files) — without it every image in the browser build points at a virtual host
   that only WebView2 serves, which would have made a phase-2 test look broken for the wrong
   reason.
4. **Done (2026-09-21; launcher and §13 link 2026-09-22).** `release.ps1` no longer
   hardcodes `-r win-x64`: `PublishServer` takes a RID and step 3 runs it for `win-x64`,
   `linux-x64`, `osx-arm64` and `osx-x64`, all cross-published from Windows with no Mac in the
   loop and no code change of any kind. A full release now emits eight artifacts instead of four;
   `-Dev` emits `win`, `web-win` and `web-linux` (no macOS, since it cannot be run here anyway).
   What the packaging pass settled:
   - **Nothing for macOS natives.** SkiaSharp 4.152.1 pulls `SkiaSharp.NativeAssets.macOS` in
     transitively, so `libSkiaSharp.dylib` resolves on its own. (Adding it by hand was a 2.x-era
     requirement and is not needed here.)
   - **Linux needed one package ref, now added.** The `linux-x64` restore resolved only
     `libe_sqlite3.so` — SkiaSharp ships transitive natives for macOS and Win32 only — so
     `MediaRepo`'s thumbnailing would have thrown `DllNotFoundException` at runtime while the
     build stayed green. `SkiaSharp.NativeAssets.Linux` 4.152.1 is now in
     `StoryTimeline.Data.csproj`.
   - **The executable bit takes two tars.** `.zip` cannot carry it, but `.tar.gz` alone does not
     solve it either: NTFS has no executable bit to record, and Windows' own bsdtar has no
     `--mode` to force one, so it writes 0644 and the binary will not start on the other side.
     Git for Windows' GNU tar does have `--mode`, but it reads `C:\` as a remote host without
     `--force-local` and has no `gzip` to shell out to. So GNU tar writes a plain `.tar` with
     `--mode=a+rx --owner=root:0 --group=root:0`, and bsdtar gzips it through its `@archive`
     syntax. Verified: entries come out `-rwxr-xr-x root/root`. This is the one place the release
     needs Git for Windows installed, and the script fails with that message if it is not.
   - **A start shortcut, not an auto-opening launcher (2026-09-22).** `PublishServer` now writes
     one next to the binary, so every call site — release and `-Dev` — gets it: *Start Story
     Timeline.command* on macOS (what Finder double-clicks), `start-story-timeline.sh` on Linux,
     *Start Story Timeline.cmd* on Windows. Each one `cd`s to its own folder and runs the server,
     which is all the user asked for; opening the browser on top of that (`open` / `xdg-open`) was
     deliberately left out. The scripts are written LF by a new `WriteLf` — a CRLF shebang reads as
     "bad interpreter" — and the tar's existing `--mode=a+rx` lands them executable.
   - **Source link done (2026-09-22).** About now carries a *source for v{version}* link to
     `github.com/WolfyD/StoryTimelineMk2/tree/v<version>`, the tag of the version actually running,
     which is what AGPL §13 asks of a program people reach over a network. It goes through
     `OpenExternalUrl`, so it is a shell open on the desktop and a tab in the browser.

   Paths already port: `AppConfig` and `Logger` go through
   `Environment.SpecialFolder.LocalApplicationData`, not `%LOCALAPPDATA%`.
5. **Browser fit-and-finish.** In progress (2026-09-22). The audit that opened this phase is in
   the 2026-09-22 session notes; what has landed so far:
   - **Ctrl+C now stops the server.** `/bridge` passed only `context.RequestAborted` to
     `BridgeSession.RunAsync`, and that token fires on client disconnect, never on shutdown — so
     an open tab kept its WebSocket in flight and Kestrel waited out the host's full 30s shutdown
     timeout. Measured at 30,041 ms before, under 1 s after. Fixed by linking
     `IHostApplicationLifetime.ApplicationStopping` into the token
     (`StoryTimeline.Server/ServerApp.cs`); regression test
     `BridgeServerTests.AnOpenPageDoesNotHoldUpShutdown` asserts shutdown-with-an-open-page
     finishes in under 5 s.
   - **The title bar knows which host it is in.** `WindowTitleBar.vue` drops pin / minimise /
     maximise in a browser (the tab does those) and shows instead the one control the page is
     missing: **Back** on a page that replaced the project list, **×** on a pop-up — both routed
     through the existing `WindowClose` → `browserHost.closeWindow()`, which already tells those
     two cases apart. The desktop branch is untouched. Phosphor icons; 5 new tests.
   - **The window title is the tab title.** Nothing set `document.title` anywhere, so every
     browser tab read `Story Timeline` (or the file name). The same component now writes
     `<title> — Story Timeline` from its `title` prop, which every page already passes.
   - **Shortcuts are labelled the Mac way on a Mac.** `chordOf()` already folded `metaKey` into
     `Ctrl+`, so ⌘ chords always fired — only the labels lied. `utils/shortcuts.ts` now exports
     `IS_MAC` / `MOD` / `ALT` and `chordParts()` maps the modifiers to ⌘ / ⌥ / ⇧; the shortcuts
     list, Help, the notes placeholder, the scaling hint and the Save hint all go through them, so
     one file knows the key names. The shortcuts list also explains macOS's F-key hijacking.
   - **On-screen scroll controls** (`store.onScreenControls`, App settings → Appearance, off by
     default). Two round hold-to-scroll buttons over the canvas edges, driving the same rAF pan
     loop the arrow keys use — `startPan` was split into `panBy(dir, fast)` so there is still only
     one loop. Pointer capture on press, so a pointer that slides off a held button cannot leave it
     panning. The wrapper is `pointer-events: none`, so the canvas underneath is untouched.
   - **The pan speed sits next to the FPS counter**, editing the existing per-timeline
     `KeyboardPanSpeed` (clamped 50–5000) through a new `store.savePanSpeed()` — the settings modal
     still owns the same value, so the two cannot drift apart.
     Both new settings are app-wide and ride the existing `SetMiscSetting(key, value, 0)`
     key-value store, so **no C# changes were needed**.
   - **Low resource mode** (`store.lowResourceMode`, App settings → Performance, off by default).
     Named after JetBrains' Power Saver mode — deliberately not a judgement on the machine. Four
     gates, chosen for what actually costs frames on the 2020 Intel MacBook Air:
     1. the canvas layers are drawn at `pixelRatio` 1 instead of the display's (a Retina screen
        doubles both axes, so a frame pushes 4× the pixels) — by far the biggest win;
     2. `updateCursor()` returns early, so the marker that follows the pointer stops re-rendering
        a Vue overlay on every `mousemove`;
     3. `animateJumpToYear()` falls through to `jumpToYear()` — gated inside the canvas rather
        than at the call sites, so every caller gets it;
     4. a LOD change skips its tween, which re-packed lanes and redrew the grid every frame;
     plus the minimap is not rendered (it redrew its dynamic layer on every pan frame).
     The pixel ratio is set once the layers exist, so the setting needs the timeline window
     reopened — App Settings lives in the project-list window and the two have separate stores.
     Not done: `perfectDrawEnabled(false)` / `shadowForStrokeEnabled(false)`, which are per-shape
     and would mean touching every builder in `timelineNodes.ts`. Worth measuring against the FPS
     counter before paying for it.
   - **Simpler items in low resource mode** — `buildNode()` takes a trailing `lowRes` flag (a
     param, not a store import, so the util stays pure; two production call sites):
     1. `Konva.pixelRatio = 1` alongside the per-layer clamp. The clamp only covered the layers
        that existed at setup; `cache()` passes `Konva.pixelRatio` to the two offscreen canvases
        it allocates, so cached bitmaps were still 4× on a Retina screen. The global closes that
        and covers the minimap and mini-mode stages too.
     2. The item color is painted onto the event box's existing stroke (min width 2, so a
        zero-border layout still shows it) instead of a second `Konva.Rect` per item — events
        drop from 4 nodes to 3. `updateAbsolutePositions()` already guards on `elements.colorStrip`,
        so it needed no change.
     3. Hover is an instant 1.06× grow on the box and its label instead of the shadow-plus-`cache()`
        highlight, and Age/Period's `scaleY: 1.3` is set directly rather than tweened. The growth
        is anchored at the node's corner, not its centre: centring needs a position offset that
        `updateAbsolutePositions()` overwrites on the next pan frame. A picture's caption is not
        scaled — it hangs off the bottom edge rather than sharing the box's origin.
   - **The audit list is closed (2026-09-22).**
     - *`beforeunload` on the edit window.* A browser tab's own close, ⌘/Ctrl+W and Back never
       reached `requestClose()`, so an unsaved item went with them silently. `EditItem` now hangs
       the existing `isDirty()` off a `beforeunload` listener, registered on mount and removed on
       unmount, and only under `IS_BROWSER_HOST` (new export from `api.ts`) — the desktop host
       already routes its X through `requestClose()` and would just stack a second prompt.
     - *Ctrl+wheel double-acting.* Both wheel listeners — the Konva stage and
       `numberInputStepping` — acted on a wheel the host was already reading as zoom, so one
       gesture did two things. Both now ignore a wheel with Ctrl or ⌘ held, which also covers a
       Mac trackpad pinch (it arrives as `ctrlKey`).
     - *"Open in Explorer".* New `utils/platform.ts` owns `IS_MAC` (moved from `shortcuts.ts`,
       which re-exports it), `IS_WINDOWS` and `FILE_MANAGER` — Finder / Explorer / "your file
       manager". App settings' two folder buttons and the browser host's folder alert read it.
     - *The Windows-only fallback font list.* `WEB_SAFE_FONTS` offered Segoe UI and Calibri to a
       Mac that has neither. It is now a common set plus a per-platform one (Mac, Windows or the
       fontconfig/Liberation families on Linux) plus the generic CSS names. Only the fallback
       changed; `queryLocalFonts()` still wins where the user grants it.

---

## [BL-72] Ages and periods that run off the edge

**Status:** Done (2026-09-23), reopened and finished 2026-09-24 — see "What 2026-09-23 got wrong".

A user asked for spans that carry on into the past or the future without the timeline being
stretched to a year nobody means. `items.open_start` / `items.open_end` (migration 15) — two flags
rather than a direction enum, because "open at both ends" is a real answer and an enum would need
four values to say the same thing. Only ages and periods offer them (`hasOpenEnds` in `EditItem`,
type 2 or 3); everything else ignores the columns.

The open side draws a `Konva.Line` arrowhead — `placeOpenArrow` in `timelineNodes.ts` sets its
points and gradient endpoints in absolute stage coordinates, the way the portrait stems already do.

### What 2026-09-23 got wrong

Three things, all found by the user rather than by us, and worth keeping written down because two
of them were *decisions* we made on their behalf and one was a plain bug.

**The option was unreachable for ages.** `hasOpenEnds` was right — types 2 and 3 — but the `.row`
holding the two checkboxes was gated on `hasSide || hasStemBox || TypeId === 4`, and an age is none
of those. So a period offered the checkboxes and an age hid the whole row, which is why the user
reported the option as simply absent. `hasOpenEnds` is now in that `v-if` too. The lesson is dull
and repeatable: a new field's own `v-if` is not enough, the container's has to admit it.

**The fade was ours, not theirs.** The original ask said *optional* fade and we shipped it always
on, reasoning that a square arrowhead reads as a decoration. That reasoning still holds as a
default — the arrow is now solid, since an age whose end is merely undated still happened at full
strength — but "it trails off" is a claim about the story, and the writer is the one entitled to
make it. Hence `items.open_fade` (migration 18) and a third checkbox, shown only once a side is
actually open.

**The fade stopped at the arrow.** It now runs into the bar: half alpha at the point, full color a
year in, both on the head and on the bar itself. One gradient on each, sharing endpoints, rather
than a fade on the head meeting a solid bar at a seam. The head's is absolute and the bar's is in
the Rect's local space, because the box is the one shape here that carries a position — a mismatch
that cost half an hour the first time. A year is measured per item in `TimelineCanvas.yearPx`, not
assumed as a constant, so a hidden range between here and there does not skew it; below a pixel a
year it rounds to nothing, which is correct.

**And the arrow pointed the wrong way round.** The head used to sit with its base on the date and
its point a headlength past it, so the arrow marked a year nobody meant. The point is now *on* the
date and the head runs back from there over the last stretch of the span.

### The head is the bar's end, not a lid on it

A fourth round, and the most useful one to have written down, because the fix that looked right on
a solid bar was visibly wrong on a faded one. The head was *overlaid*: the bar still ran its full
length underneath, and at 50% alpha the bar's own square edge showed through the triangle as a
vertical line. The user's words for it: "it's like the end of the line turns into an arrow not
really an overlay".

So the bar now stops short and the head occupies that length. Four things had to move together:

- **One head length, computed once** (`headLength`) and passed to both the box and the arrow, so
  they cannot disagree about where they meet. Capped at `span / sides`, so two heads on a short age
  meet in the middle instead of overrunning each other.
- **The box is shortened and shifted** by a head length per open side — `x = anchorX + lenStart`,
  `width = span - lenStart - lenEnd` — so head and bar abut exactly. Exactly, not overlapping: two
  translucent fills over each other double-darken, which is the same class of bug as the edge.
- **The bar's gradient endpoints are the two dates, not the shortened bar's edges** (local
  `-lenStart` → `span - lenStart`). That is what makes the seam invisible: the arrow's alpha at its
  base and the bar's at its local 0 are the same number, because they are the same point on the
  same ramp. Konva clamps outside its endpoints, so a gradient running past the shape is fine.
- **The corner radius goes square on the open side only**, via Konva's array form
  `[topLeft, topRight, bottomRight, bottomLeft]`. A rounded corner sits just inboard of the head's
  base, and a triangle is widest at its base and covers nothing beyond it, so a round corner there
  leaves a notch. The closed side keeps its radius.

Checked live on both: a solid period open at both ends runs `-3430..722` with heads `-3454` and
`746`, `cornerRadius [0,0,0,0]`; a faded age gets heads of 48px, a bar of 904 between them, and a
gradient spanning local `-48 → 952` — the two dates, 1000px apart, a year being 100. Open at one
end only, the same period keeps `cornerRadius [10, 0, 0, 10]`.

### The orphaned arrowhead

Reported right after the above: toggling *Fade out* either way left a second arrowhead stuck to the
canvas, floating at fixed screen coordinates. `evictNode` in `TimelineCanvas` destroyed `box`,
`label`, `stem` and `colorStrip` by name, so the two new `arrow*` shapes were dropped from the
cache without being taken off the layer — they kept whatever absolute points they last had, which
is why the ghost did not move with the timeline.

Fixed at the root rather than by adding two more names: `evictNode` now destroys every Konva node
in the cached element object, so the next shape anyone adds to `buildNode` is covered without
anyone remembering to come back here. `fade` is the one non-node value in there and the
`instanceof` skips it. The other two teardown paths were already fine — the layout-settings watcher
and `clearReferenceNodes` both call `destroyChildren()` on the layers.

Checked live: ten fade toggles on an open period leave the stage at 4 arrow nodes and 69 shapes,
the same as one toggle. Before the fix that was 20 orphans.

ponytail: the head is no longer part of the bar's hit area, so a click on the last 24px of an open
span misses. Nobody aims at an arrow tip; give the head a hit region if anyone does.

The ask was the **timeline canvas**, and that is where it is: `TimelineCanvas` passes
`OpenStart` / `OpenEnd` / `OpenFade` into `buildNode` for both the live items and the reference
ghosts. The
minimap still draws the bar square — at 8–14px an arrowhead is a smear, so the two views disagree
by choice, not by omission. That is a note to ourselves, not an unmet request; revisit only if
anyone notices.

ponytail: `open_start` / `open_end` / `open_fade` are not carried by `DatabaseImporter`,
`TimelineExporter` or `TimelineRepo.DuplicateTimeline` — pre-existing for the first two flags, and
the third inherits it. An open-ended age comes back closed from an import, an export or a
duplicate. Small and mechanical to fix; not fixed here because it is nothing to do with what was
asked and the three belong in one pass with whatever else those three have drifted apart on.

---

## [BL-73] Character relations window — graph and family tree

**Status:** Done for 1.1.1 (2026-09-23). BL-17 phase 5.

Shipped as described. `relations.html` / `pages/RelationsApp.vue`, hosted by `Forms/f_Relations.cs`
with the same two-stage pre-warm the characters window uses (`SetRelationsContext` pushes the ids
in after the page is already up). One round trip feeds it: `GetTimelineRelations` returns the
characters, the relations and the kinds together, because the window draws all three and splitting
it would only mean three waits.

All the maths is in `utils/relationsGraph.ts` — canvas-free and covered by
`src/test/utils/relationsGraph.test.ts` (19 tests): the spring sim on four nodes and on a crowded
hundred, the BFS shortest path and its gendered wording, the generation assignment and the union
nodes. Pinned node positions live in
`misc_settings` under `relations_positions`, scoped to the timeline, rather than a table of their
own.

Two things worth knowing. The year scrubber **dims** rather than hides — the unborn to 0.12, the
dead to 0.45 — because hiding makes the layout jump under the writer's hand as they drag. And the
tree is built only from `parent` / `step-parent` and `spouse`: a grandparent tie says nothing about
the generation between the two, so letting it into the layout would put people on the wrong row.

**The sim has to be made to stop (fixed 2026-09-23).** With a cast of eighty or more, Graph and
Knots never settled: `moved` was still climbing after four thousand ticks, so the loop never exited
and the layout writhed. Repulsion goes as 1/d² with nothing bounding it, so one pair landing on top
of each other flung itself across the stage, hit a third node and set the whole graph off. Three
changes in `stepForces`: the per-pair push is capped, so does a node's speed per tick, and the
caller now passes a decaying `alpha` (`ALPHA_DECAY` / `ALPHA_MIN`, about two hundred ticks from a
kick) that scales the movement — settling is not guaranteed for an arbitrary web, cooling is. The
stop threshold in `RelationsApp` was also a fixed `moved > 0.8`, which is a *sum over the nodes*:
at eighty it demanded a hundredth of a pixel each. It now scales with the cast. Measured over
generated groups, 20 to 250 people, both views settle in 116–184 ticks with no node flung off.

ponytail: repulsion is O(n²) — every pair, every frame. Fine for a cast of a few hundred; a
Barnes-Hut quadtree is the upgrade if a project ever needs thousands.

One new entry point (`relations.html`) with two modes over the same data and the same node
rendering, on Konva — no new dependency, because a spring sim is about thirty lines and a
generation-row layout about forty.

**Graph mode.** Force-directed, drag-to-pin with positions persisted per timeline. The feature it
is built around is a year scrubber: `character_relationships` already carries `start_year` /
`end_year`, so showing the web *as of* a year costs almost nothing and is the thing no other tool
gives a writer. Also: click a node and everything more than one hop away dims; edges colored by
`relationship_types.type` with per-category toggles; a "how is X related to Y" shortest-path
readout that spells the chain out in the gendered wording; search that pulls a match to centre;
double-click → characters window, right-click → *Their timeline*, reusing the existing menu; a
sidebar listing characters with no relations at all.

**Tree mode.** An hourglass chart — selected character in the middle, ancestors up, descendants
down, one row per generation. The convention that matters is the **union node**: a family tree is a
DAG, not a tree, because a child has two parents, so each couple gets a small connector that
parents drop into and children hang off. Without it the lines cross as soon as anyone on screen has
both parents. Orthogonal elbow connectors, which is both the genealogical convention and the easier
thing to follow. Generations being fixed rows means only horizontal ordering is left: lay out the
children, centre the parent over them.

---

## [BL-71] Modals: drag-safe backdrop and a definite yes / no key

**Status:** Done for 1.1.0 (2026-09-22).

Two faults every modal shared. Selecting text inside a modal and releasing the mouse outside it
closed the modal — a DOM `click` fires on the nearest common ancestor of `mousedown` and `mouseup`,
so `@click.self` on the backdrop matched a drag that merely *ended* there. And keyboard support
stopped at the window: a prompt had no definite yes, and several modals had no Esc at all.

Both live in `utils/modal.ts` now, so a new modal cannot forget half of it:

- `backdropClose(close)` remembers whether the *press* landed on the backdrop and only closes then.
  Exported on its own for modals that sit inline in a page and have no lifecycle of their own
  (`CalendarApp`'s day-of-year prompt).
- `useModal(close, confirm?)` adds Esc → close and Enter → the footer's `[data-primary]` button.
  Enter is left to the field when the field does something with it (`<textarea>`, contenteditable,
  or an input marked `data-enter-self` — tag boxes, preset-name boxes and the like). Ctrl+Enter
  confirms anyway. The edit window is deliberately excluded: there Ctrl+S saves and Enter does not.
- `BaseModal` calls it, and paints the `↵` / `Esc` badges from `data-primary` / `data-cancel`
  through `:slotted()`, so each modal only had to mark which button is which.
- `useModalGuard` became a stack of symbols rather than a counter, and returns an `isTop`
  predicate. That also fixed a pre-existing bug: with a counter, a nested dialog and the modal
  underneath it both acted on the same Esc.

`AppThemeModal`, `CalendarYearView` and `ImagePickerModal` had bespoke backdrops with no Esc and no
guard at all; they use `useModal` now too.

---

## [BL-74] __stl cast generators — a web worth laying out

**Status:** Done for 1.1.1 (2026-09-23). The generator gained factions, a depth floor and then a
depth *setting* 2026-09-24 — see the end.

The relations window was built against a five-person fixture, which says nothing about what two
hundred characters look like. Six new console commands generate one, and two clear up after them:

- `__stl.createCharacters(n)` — n people, mostly in small families, with social ties thrown across
  the lot and a few left unconnected on purpose (the window has a panel for exactly those).
- `__stl.createFamily(n, gens)` — one family down the generations: a founding couple, their
  children, the people some of those children marry, and so on. Blood keeps the surname,
  in-marrying spouses keep their own, and spouse ties are dated so the year scrubber has something
  to move through. `gens` says how many generations to spread the n people over; left out it is
  one per eight people.
- `__stl.createPlausibleGroup(n)` — a cast that reads like a real file rather than a shape: one main
  line at least five generations deep, smaller families married into it, and the aunts, uncles,
  cousins and in-laws that fall out of all that. Each family is built around the marriage that joins
  it on — an unmarried person already in the web sets the era, so the family's own unmarried child
  comes out their age — which is why nearly everyone is reachable through blood or marriage rather
  than a friendship, and why a second cousin sits four steps from a first.
- `__stl.connectCharacters()` — one tie between two random unrelated people.
- `__stl.connectClusters()` — one tie between the two biggest disconnected groups.
- `__stl.clearTestCast()` — deletes them again. Every generated character carries a marker in
  `notes`; their relations go with them, because `character_relationships` cascades on delete.
- `__stl.clearCharacters(n)` — deletes every character on the timeline, generated or not. It will
  not run until you pass the count back, so a mistyped command in the wrong window cannot empty a
  real timeline.

The shapes are in `utils/devCast.ts`, pure and tested (`src/test/utils/devCast.test.ts`, 17 tests:
sizes, no self-ties, no duplicate pairs, children born after their parents, connected components,
the derived kinds and their pair order, and the five-generation and cousin guarantees).

Two things are worth knowing about the group. `planFamily` takes a `minGenerations` and holds back a
child and a spouse for every generation still owed, or a wide first generation spends the whole
budget and the line stops three deep; it holds back three more for a second line of descent, because
a family with one line has no cousins in it — everyone is someone's parent or child. And
`planKinship` writes only about a third of the ties it derives (a file where every cousin is written
down does not look like one a person kept), but always keeps at least one of every kind it found.
The saving is a frontend loop over `SaveCharacter` / `SaveCharacterRelation` rather than a new
bridge action, so it works in the browser build too.

`installDevHelpers()` now also runs on the relations page, where the timeline id comes from the
query string rather than the store.

### The generator, revisited 2026-09-24

Two changes, both for the sociogram's sake and both in `devCast.ts`:

- **Factions are handed out by surname, not per person.** A house mostly shares one and the people
  who marry in bring another with them, which is what gives the sociogram crossing ties to draw
  instead of a uniform mesh. One slot in the list is empty, so part of the cast belongs to nothing.
  Same surname, same faction, every run — a family that reshuffles its loyalties is no test.
- **`minGenerations` now has a floor of one generation per eight people**, whether or not the
  caller asks. Left to the dice a big family came out as a single enormous sibling set, and seventy
  brothers is a far stranger thing to write than great-grandparents. A floor, not a setting: a
  caller wanting more depth than that still gets it.

The depth floor took three goes to get right, because the headcount has to land *exactly* and the
reserve leaks in more than one place. Worth knowing if it is ever touched again: the reserve is two
people per generation still owed, and **every loop that adds a person has to respect it** — the
child loop, the spouse loop, and the forced carry-the-line child, which is worth exactly one couple
per generation rather than one per couple. The generation cap also has to sit well past `minGens`:
while depth is owed a generation only adds the two people carrying the line, so the rest of the
headcount is spent in the generations after the depth is paid, and a tight cap strands it. A soak
over every size from 2 to 400, fifty families each, held both the exact headcount and the depth.

### A depth you can ask for, 2026-09-24

`createFamily` now takes a second argument: **how many generations to spread the people over**. The
floor above could only ever push a family *deeper*, so "forty people across three generations" —
the obvious thing to want once the arc could stack into rows — was unaskable: forty asked for five
and got five. `planFamily` gained a `generations` opt that beats both the floor and the default,
leaving `minGenerations` alone for the one caller that wants a floor (`planPlausibleGroup`).

Three things had to give for a target depth to hold, and they are worth knowing together:

- **The descent is capped**, `maxGens = gens - 1`, so the loop stops going down with headcount
  still in hand rather than spending it on another generation.
- **The width takes over.** A fixed one-to-five children cannot fit forty people into three
  generations, so under a cap each generation claims its share of whoever is unplaced, split over
  the couples in it and the generations left to go. That is why `40 over 2` comes out 2/38 — one
  enormous sibling set is exactly what two generations of forty people *is*.
- **A top-up catches the remainder**, round-robin over the couples the loop reached, because the
  cap can strand people the width did not quite spend. Every couple the loop touched is one the cap
  allows children, so the top-up cannot deepen the family by accident. It is unconditional: in the
  uncapped path the headcount already lands on its own and it does nothing.

Two smaller things. The second line's grandchild is skipped at a depth of two — a cousin stands a
generation below the line and there is nowhere to put one — and the top-up makes those people back
up as siblings instead. And the ask is capped at `n / 2`, since carrying a line down one generation
costs a couple: `createFamily(6, 30)` gives three rows, not thirty. One reads as two, a couple
being a couple rather than a family.

Checked both ways, which is the point of a generator whose output another feature reads: the
headcount and the depth land exactly for 40/2, 40/3, 40/6, 12/4, 80/3 and 200/4 in unit tests, and
in the running app the arc's own `generationOf()` — a different algorithm, in a different module,
written for the chart rather than for the fixture — counts the same rows back.

ponytail: one round trip per row, so a 200-strong cast takes a second or two. A batch bridge action
if that ever stops being fast enough.

---

## [BL-75] Shared characters, relations that mean something, and finer dates

**Status:** Done for 1.1.1 (2026-09-23).

One schema pass (migration 16) over three things that all wanted the same table touched.

**Shared characters.** `characters.shared` — ticked, the character appears in every timeline's
cast; `timeline_id` stays as where they were made. `GetCharactersByTimeline` matches
`timeline_id = @Id OR shared = 1`, and `GetRelationshipsByTimeline` joins both ends through
`characters` instead of filtering on the relation's own `timeline_id`, so a shared character
brings their web with them — but only the ties whose other end is also in the cast.

**Relation meaning.** `custom_relationship_type` and `is_bidirectional` dropped: the first was
dead once kinds became rows, the second never meant anything, since a relation is stored once and
read from both ends. The three that stayed got a job:

- `relationship_strength` (0–100, default 50) → `edgeWidth` for the line and a `0.4 + s/100`
  factor on the spring, so close people sit closer in the laid-out web.
- `relationship_modifier` — *estranged, secret, adoptive, former, alleged* → leads the wording and
  picks the dash pattern (`edgeDash`: long for secret/alleged, short for estranged/former).
- `relationship_degree` — *half-, step-, great-, once removed* → reads into the label; a trailing
  hyphen prefixes the noun, anything else follows it and before "of".

Both fold in through `qualify()` inside `relationLabel`, so the panel, the relate modal, the
family modal, the graph and the path description all say it without a call-site change.

**Dates, the BL-02 way.** `absolute_start` / `absolute_end` on both `characters` and
`character_relationships`; `birth_subtick` / `death_subtick` / `start_subtick` / `end_subtick`
dropped. The migration reads each timeline's LOD profile out of `lod_profiles.profile` and emits
one `CASE granularity WHEN … END` per column, so each table takes one UPDATE per timeline rather
than one per level. A NULL year propagates to a NULL absolute, which is exactly "no date". The
subtick is now derived in the editor (`utils/lodDates.ts`, shared by the character form and the
relate modal) — the year/granularity pair is still what `LodDateInput` binds to.

Two robustness gaps surfaced under test and were fixed at the root: a timeline whose LOD profile
is empty or unreadable would have produced `CASE x ELSE y END` with no `WHEN`, a SQLite syntax
error (now a bare `1.0`), and a pre-1.0.1 file has no `birth_year` at all to read (`Col()`
substitutes the literal `NULL`).

`SchemaMigratorTests` builds a genuine v15 file with `Steps.Take(15)` and runs the real backfill
against it; `CharacterRepoTests` covers a shared character appearing in another timeline without
leaving their own, and their relations travelling with them.

ponytail: the backfill is one UPDATE per timeline per table — fine for a writer's database, and
it only ever runs once per file.

---

## [BL-76] Four more ways to look at the same web

**Status:** Done for 1.1.1 (2026-09-23).

The relations window had a force graph and a family tree. Four views added between them, all over
the same data, the same Konva stage, the same selection and the same node drawings — only the
positions differ, so nothing new had to be plumbed through.

- **Knots** — the force graph with community detection behind it: `communities()` labels everyone,
  `clusterSeed()` starts each knot in its own patch of the stage, and `stepForces` gained a
  `clusterOf` / `clusterGravity` option that pulls members toward their knot's centroid every step.
- **Rings** — `radialLayout()`: BFS from the selected character, one ring per step out, closest
  ties expanded first so a family stays side by side, alternate rings turned half a slot so the
  spokes do not line up into false columns. Anyone unreachable goes on an outer ring rather than
  being dropped. Clicking someone re-centres on them.
- **Rows** — `layeredLayout()`: BFS ranks from the best-connected character (or the selected one),
  four barycentre sweeps to stop the connectors crossing into a hedge, and edges drawn as
  down/across/down elbows. Each disconnected group starts its own run.
- **Grid** — an adjacency matrix: `matrixOrder()` puts the big knots first and the best-connected
  first inside each, so the blocks that mean something sit on the diagonal. Cell brightness is
  closeness, every fifth line is drawn heavier, and the selected character's row and column are
  banded. Both axes of names are clickable.

BL-77 cut Rings and Rows on 2026-09-24 and renamed Grid to **Matrix**; what follows is what
was built here, not what is in the window now.

Rings and the grid rebuild on selection — re-centring is the point of one and re-banding the point
of the other. Rows stays frozen, so a click does not reshuffle the diagram under the cursor. The
one-hop dimming is now limited to the two force views: in a fixed layout the shape is the answer,
and greying out everyone but one person hides it, so there the selection gets a thicker ring
instead.

The plan named `graphology` + `graphology-communities-louvain` and `@dagrejs/dagre`. All three
skipped: label propagation is about forty lines and finds the same families on a cast this size,
and BFS ranks plus barycentre ordering is about fifty. `Frontend/src/utils/relationsLayouts.ts` is
pure — ids and edges in, positions out — and covered by 14 tests over a two-triangles-and-a-loner
fixture.

ponytail: label propagation, not Louvain (can smear a dense web into one knot — upgrade is
graphology-communities-louvain); BFS + barycentre, not full Sugiyama (no dummy nodes, so a tie
that skips three rows draws as one long elbow — upgrade is dagre). Named in the source at both
sites.

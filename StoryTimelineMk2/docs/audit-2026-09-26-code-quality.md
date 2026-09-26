# Code quality audit — 2026-09-26

Code smells and where refactoring is advised, with KISS and SOLID in sight.

Companion to [audit-2026-09-26-robustness.md](audit-2026-09-26-robustness.md), which covers
defects. This document covers *shape*: nothing here is broken, but some of it will make the next
feature more expensive than it needs to be.

**Short version:** the architecture is sound and the discipline is unusually good for a solo
project — zero TODO/FIXME/HACK markers in ~50,000 lines, a correctly-shaped migration system,
consistent repositories, and comments that explain *why*. The problems are all in the same family:
**things repeated because there is no single place to put them**, and **three Vue files that have
absorbed too much**. Neither is urgent. Both get worse if BL-16 lands on top of them.

---

## Ranked by payoff ÷ effort

### 1. `DefaultTypeMap.MatchNamesWithUnderscores = true` — set 17 times

It is a **global, process-wide, idempotent** Dapper flag. Setting it in every repository's
*instance* constructor means it is re-assigned on every `new XxxRepo()` — which, as item 2 shows,
is a lot.

Sixteen of the seventeen sites are instance constructors:

```
BookRepo:13   CalendarRepo:14   CharacterRepo:15   FilterPresetRepo:13
FilterRuleRepo:13   HiddenRangeRepo:13   ItemRepo:16   LayoutSettingsRepo:12
LodRepo:14   MediaRepo:23   NoteRepo:12   SettingsRepo:12
StoryRepo:15   TagRepo:15   TimelineRepo:15   (+ DbTestHelper:41)
```

One site already does it correctly — [SessionChanges.cs:161](../StoryTimeline.Data/Database/SessionChanges.cs#L161):

```csharp
// Same global flag every repo sets in its constructor; this class maps items without
// going through one first, so absolute_start would not reach AbsoluteStart.
static SessionChanges() => DefaultTypeMap.MatchNamesWithUnderscores = true;
```

That comment is the diagnosis. The repos have made a global setting look like per-object state.

**Fix:** set it once in `DbInitializer`'s static constructor and delete the other fifteen lines.
Fifteen deletions, no behaviour change, no risk. *DRY.*

### 2. 104 `new XxxRepo()` calls in non-test code

`HandleGetTimelineData` alone constructs five:

```csharp
TimelineRepo repo      = new TimelineRepo();
ItemRepo     item_repo = new ItemRepo();
NoteRepo     notes_repo = new NoteRepo();
…
HiddenRanges = new HiddenRangeRepo().GetByTimeline(gtd_timeline_id).ToArray(),
Characters   = new CharacterRepo().GetCharactersByTimeline(gtd_timeline_id).ToArray(),
```

This is *not* an argument for a DI container — that is a rung too high for a two-user desktop app,
and injecting interfaces with exactly one implementation each would be the classic over-correction.
The repos are stateless-ish and cheap; construction is not the cost.

The actual cost is that every repository carries a constructor whose only job is to read
`DbInitializer.GetConnectionString()` and set the global flag from item 1. Fix item 1 and most of
these constructors become empty, at which point the noise mostly evaporates on its own.

**Fix:** do item 1, then reassess. Do not build an abstraction for this.

### 3. `DataActions.TryHandle` — 75 cases in one switch

[DataActions.cs](../StoryTimeline.Data/Bridge/DataActions.cs) routes 75 actions in a single
`switch`; `DataActions.App.cs` adds 17 more behind the `default:`. 1,169 lines in the first file.

This is the clearest SRP violation in the codebase — one type owns every data operation the
application can perform. But the *dispatch* is not the problem; a flat switch is the right, boring
choice and a command-bus rewrite would be a strict downgrade in readability.

The problem is that the 75 **handler bodies** live in the same file as the dispatch.

**Fix:** keep the switch exactly as it is, and split the handlers into partials by domain —
`DataActions.Characters.cs`, `DataActions.Calendar.cs`, `DataActions.Filters.cs`,
`DataActions.Session.cs`. `DataActions.App.cs` already proves the pattern works here. Mechanical,
reviewable, and it makes BL-16's map actions a new file rather than lines 76–90 of an existing one.

### 4. Three Vue files hold ~7,500 lines between them

Non-test source is 49,987 lines. The distribution:

| File | Lines |
|------|-------|
| `RelationsApp.vue` | 3,031 |
| `TimelineCanvas.vue` | 2,550 |
| `EditItem.vue` | 1,992 |
| `CalendarApp.vue` | 1,546 |
| `MainDbMigrations.cs` | 1,526 |
| `TimelineSettingsModal.vue` | 1,419 |
| `TimelineApp.vue` | 1,245 |
| `DataActions.cs` | 1,169 |
| `MessageRouter.cs` | 1,051 |
| `CharactersApp.vue` | 1,011 |

`MainDbMigrations.cs` is a **false positive** — an ordered, append-only list of migration steps is
*supposed* to grow forever, and splitting it would break the one property that makes it safe. Leave
it alone.

The Vue files are the real finding. The top three are single-file components carrying state,
business logic, canvas rendering, event handling and template in one `<script setup>`.

**Fix, lowest-risk first:** pull pure functions out into `utils/` — they are testable in isolation
and the extraction is mechanical. `TimelineCanvas.vue` is the best candidate because
`utils/timelineLayout.ts` and `utils/timelineNodes.ts` already exist as the destination; the pattern
is established, just under-used. Composables (`useLodAnimation`, `useRelationsLayout`) are the next
step, not the first one.

BL-16's Konva renderer will want to live in `TimelineCanvas.vue`. That is the argument for doing
this *before* the map, not after.

### 5. 25 native dialog sites

`window.alert` / `window.confirm` / `window.prompt`, against a standing project rule and against
`ConfirmModal.vue`'s own opening comment:

> *replaces `window.confirm()`, which cannot be themed and looks nothing like the rest.*

Worst offender: [browserHost.ts:330](../Frontend/src/browserHost.ts#L330) — a `window.confirm`
**gating a destructive DB import**. That is the single most consequential decision in the app
behind the one control that cannot be styled, cannot be tested, and blocks the renderer thread.

Others: `App.vue` (7 sites, including the DB import/export paths), `api.ts:73,166`,
`browserHost.ts:213,358`, `timelineStore.ts:104,340,592`, `ExportTimelineModal.vue:140`,
`TimelineItemViewModal.vue:48`, `TimelineNotesPanel.vue:97`, `TimelineSettingsModal.vue:158`,
`TimelineApp.vue:55,179`.

**Fix:** `ConfirmModal` already exists — this is reuse, not new UI. Start with `browserHost.ts:330`
and the `App.vue` import/export paths; the rest can go opportunistically. Note that `api.ts`'s two
sites are the bridge-failure fallback, which may legitimately need to work when the app's own UI is
the thing that is broken — keep those, and say so in a comment.

### 6. `_filterResults` rebuilds the whole item map on every single-item save

[timelineStore.ts](../Frontend/src/stores/timelineStore.ts). The computed calls `buildItemDataMap`
over *all* items whenever any of the four link maps is replaced — and `upsertItem` replaces them
wholesale on every item save.

So saving one item rebuilds the map for every item. Invisible at a few hundred items; it is exactly
the kind of thing that becomes the reported "the app got slow" at a few thousand.

**Fix:** have `upsertItem` patch the four maps in place rather than replacing them. Smaller diff
than memoising the computed, and it fixes the cause instead of the symptom.

### 7. `watch(() => [...(props.timelineItems ?? [])], …)`

[TimelineCanvas.vue:488](../Frontend/src/components/TimelineCanvas.vue#L488). The spread copies the
entire array **on every evaluation** so the watcher can compare identity. O(n) allocation per check,
and it behaves like a shallow-deep watch without declaring itself one — the next reader has to work
out that the spread *is* the mechanism.

**Fix:** `watch(() => props.timelineItems, …, { deep: false })` plus an explicit length/version
check, or watch a cheap derived key. Either way, say in a comment what is actually being compared.

### 8. `SessionChanges` loads the whole timeline four to six times per call

Tracing `History(timelineId)`:

```
History → EnsureSnapshot → Seal     → Load()   ← full items + 4 link queries
                         → Snapshot → Load()   ← again
        → Summarise → Build → EnsureSnapshot   ← again
                            → Diff  → Load()   ← again
```

Every `Load` opens its own `SqliteConnection` and runs five queries. The export screen pays this to
render one list.

The logic is *correct* — the layering is what costs. `EnsureSnapshot` is called defensively at the
top of `History`, `Build` and `Summarise`, and each is also reachable from the others.

**Fix:** have the public entry points call `EnsureSnapshot` once and pass an open connection and a
single `Load()` result down to the private helpers. Contained to one file.

### 9. `CharacterRepo` holds four nested DTOs

[CharacterRepo.cs](../StoryTimeline.Data/Database/CharacterRepo.cs) — `CharacterEdge` (line 97),
`CharacterAppearance` (156), `CharacterRelationship` (203), `RelationshipType` (237), all nested in
the repo class, against the project's own `Database/*Item.cs` convention that every other domain
type follows.

**Fix:** move them to top-level files next to `CharacterItem.cs`. Mechanical.

### 10. Two things with no production caller — *questions, not deletions*

Flagging these as **questions** rather than findings, because the reserved-schema rule applies and I
would rather ask than assume:

**`CharacterRepo.GetNetwork`** ([line 104](../StoryTimeline.Data/Database/CharacterRepo.cs#L104)) —
the only callers are `CharacterRepoTests.cs:363` and `:616`. It also does an O(V·E) linear scan of
every edge per dequeued node, under a comment saying it is *"extremely fast in C#"* — true at
today's character counts, and not a property worth relying on silently.

**`RelationshipTypeItem.cs`** — zero references anywhere in the repo, and stale: it lacks the
`AToBF` / `AToBM` / `BToAF` / `BToAM` fields the rest of the relationship code uses.

> To be clear about scope: the `relationship_types` **table** is reserved and live. This is about
> the C# class only, and about `GetNetwork` only.

**Question for you:** are either of these reserved for a future module (a relations analysis view,
shortest-path-between-characters)? If yes they should say so in a comment, and `RelationshipTypeItem`
should be brought up to date with the four directional fields so it is not a trap later. If no,
they are deletions.

### 11. The `docs/` folder has two overlapping sets

```
01-architecture.md      ←→  architecture.md
02-database.md          ←→  data-model.md
03-bridge-protocol.md   ←→  bridge-api.md
05-frontend-pages.md    ←→  frontend.md
04-windows-host.md          overview.md
06-frontend-components.md   development.md
07-store-and-utils.md
08-domain-concepts.md
09-testing.md
10-migrations.md
README.md
```

A numbered, ordered set and an unnumbered one covering four of the same subjects. Whichever is
stale is actively misleading — documentation that disagrees with itself is worse than none.

**Fix:** pick the numbered set (it is complete and ordered), fold anything unique out of the other
six, delete them. `feature-world-locations-maps.md` is a live design doc and stays.

### 12. Empty and near-empty root folders

| Folder | Contents |
|--------|----------|
| `Models/` | *(empty)* |
| `src/` | *(empty)* |
| `Database/` | `DatabaseImportUI.cs` only |

`Models/` and `src/` are leftovers. `Database/` holding a single WinForms-dependent file next to the
real `StoryTimeline.Data/Database/` invites someone to put a repository in the wrong one.

**Fix:** delete the two empty folders; move `DatabaseImportUI.cs` into `Forms/` where its WinForms
dependency belongs, and drop the root `Database/`.

### 13. The test suite spends 42% of its time constructing DOMs

Vitest's own hint, from the verified run:

> *happy-dom was created 53 times · 130.75s total, 42% of tracked time — create it once per worker
> with `pool: 'vmThreads'` (keeps per-file isolation) or `isolate: false` (shares it across files).*

**Fix:** one line in `vitest.config.ts`. `pool: 'vmThreads'` keeps per-file isolation, so it is the
safe one. Suite is 880 tests across 53 files; this is the cheapest win in this document.

### 14. `_dataPump` is static but documented as per-window

[MessageRouter.cs:34-40](../Bridge/MessageRouter.cs#L34-L40):

```csharp
/// BL-18 (H1): where data-layer actions run, instead of on the UI thread. One chain for
/// every window's router, so messages still run one at a time and in arrival order —
/// ponytail: a continuation chain, not a worker with a queue. If one slow action ever has
/// to stop holding up the rest, give the read-only actions a second chain.
private static Task _dataPump = Task.CompletedTask;
```

The design is deliberate and the upgrade path is named, so this is a **note, not a defect**: one
chain for the whole process means a slow action in any window blocks every other window's bridge
traffic. That ceiling is currently being hit by synchronous thumbnail generation (M4 in the
robustness report) — worth knowing which of the two to fix when it bites.

The wording *"One chain for every window's router"* reads as "one chain per window" on first pass.
Worth rewording to "one chain shared by every window's router".

---

## What is good, and why it is worth naming

Audits that only list problems give a false picture of a codebase. This one is above average, and
the specific things that make it so are worth protecting.

**Zero TODO / FIXME / HACK / XXX in ~50,000 lines of non-test source.** Verified. This is rare
enough that it is the strongest single signal in this report — nothing has been deferred by comment
and then forgotten.

**`ponytail:` comments name a ceiling *and* an upgrade path.** Not "this is hacky" but "here is
exactly when this stops working and what to do then":

- `SessionChanges.cs:617` — *"SaveItemFull opens its own connection and transaction per item… A session diff is tens of rows; wrap the loop in one transaction when that stops being true."*
- `SessionChanges.cs:224` — why `OR IGNORE`, and what a backwards clock would do.
- `MediaRepo.cs:68` — which EXIF orientations are handled and which are deliberately not.
- `AboutModal.vue:53` — *"hand-listed… If it ever drifts from package.json, generate it at build time rather than growing this."*

This is how a known limitation should be recorded. It made this audit substantially faster.

**Comments explain *why*, not *what*.** [EditItem.vue:359-363](../Frontend/src/pages/EditItem.vue#L359-L363)
is the model — it documents the bug the error handling exists to prevent:

```ts
// A bare console.error here meant the form came up blank and looked like an empty item:
// `item.value` is still the default from the top of this function, carrying a fresh UUID,
// so saving it wrote a new untitled item at year 0 instead of editing the real one.
// Say so, and refuse to save until the load has actually succeeded.
```

**The migration system is the right shape.** Ordered, append-only, `PRAGMA user_version`,
per-step transaction, resumable, refuses newer schemas. The thing most projects get wrong, this one
got right early.

**The repository pattern is applied consistently** — one repo per table group, Dapper, no leakage of
SQL into handlers.

**Test coverage is real:** 880 frontend tests across 53 files, 469 .NET tests. Both green.

**`StoryTimeline.Data` targets plain `net10.0`** with no WinForms dependency, which is what makes
the browser build possible at all. That boundary has held.

---

## Suggested order

Grouped by what they cost. Nothing here is urgent; everything here is cheaper now than after BL-16.

**Free, do them whenever (a single sitting):**
1. Item 1 — one `MatchNamesWithUnderscores`, delete fifteen
2. Item 13 — `pool: 'vmThreads'` in the vitest config
3. Item 12 — delete the two empty folders, move `DatabaseImportUI.cs`
4. Item 11 — fold the duplicate docs down to one set
5. Item 9 — move `CharacterRepo`'s four DTOs to their own files
6. Item 14 — reword the `_dataPump` comment

**Worth doing before BL-16 touches the same files:**

7. Item 3 — split `DataActions` handlers into domain partials *(the map adds actions here)*
8. Item 4 — extract pure functions out of `TimelineCanvas.vue` into `utils/` *(the map renderer lands here)*
9. Item 5 — `browserHost.ts:330` and `App.vue`'s import/export confirms → `ConfirmModal`

**When the numbers justify it:**

10. Item 6 — `upsertItem` patches the link maps instead of replacing them
11. Item 7 — the spread-in-a-watcher
12. Item 8 — `SessionChanges` connection and load reuse

**Needs your answer first:**

13. Item 10 — is `GetNetwork` / `RelationshipTypeItem` reserved for a future module, or dead?

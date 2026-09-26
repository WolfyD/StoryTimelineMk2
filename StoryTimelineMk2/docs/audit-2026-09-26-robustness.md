# Robustness audit — 2026-09-26

Does the app cover its failures? Is every error logged and shown? Do backups, exports and
imports work? Did characters/relations break anything? Is anything slowing the UI down?

Method: reading, plus both test suites. **The app was never launched** — nothing here is a
runtime observation. Scope and gaps are listed at the end.

**Short version:** the C# half is disciplined and, in places, genuinely excellent. The frontend
half has no global error net and no path to the log file at all, which is the single largest
gap against the project's own stated rule. Characters and relations did *not* introduce an error-
handling regression — they are among the better-behaved code in the repo.

---

## High

### H1 — The frontend has no global error handler

Confirmed absent across all of `Frontend/src`:

| Net | Occurrences |
|-----|-------------|
| `app.config.errorHandler` | 0 |
| `window.onerror` | 0 |
| `window.addEventListener('error', …)` | 0 (the only `'error'` listener is on the WebSocket, [api.ts:125](Frontend/src/bridge/api.ts#L125)) |
| `unhandledrejection` | 1 — and it early-returns |

```ts
window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason as BridgeError | undefined;
    if (!err?.bridge) return;      // ← everything non-bridge is silently dropped
    event.preventDefault();
    alertBridgeFailure(err.message);
});
```

So a throw in a render function, a Konva event handler, a watcher, or a computed — anything
that isn't a rejected bridge call — reaches nothing. In a Release WebView2 build there is no
DevTools console to reach. The user gets a frozen or blank panel and no message.

**Fix:** register `app.config.errorHandler` and a `window` `'error'` listener in the seven entry
mains, and drop the `if (!err?.bridge) return` guard so the rejection net covers everything.

### H2 — Nothing in the frontend reaches the log file

81 `console.error` calls across 27 files. `Logger` is C#-only; there is no bridge action that
writes a frontend error to `app.log`. Half the application has no forensic trail.

This is worth stating plainly because [Logger.cs](StoryTimeline.Data/Logger.cs) opens by
declaring the rule:

> *all errors must be logged with full stack trace and shown to the user — `Debug.WriteLine`
> vanishes in Release builds, so error paths route through here instead.*

The C# side honours that rule almost everywhere. The frontend honours the "shown to the user"
half (see the note below — it is better than the raw `console.error` count suggests) and none of
the "logged" half.

**Fix:** one new data action — `LogFrontendError { message, stack, context }` → `Logger.Error`.
H1's handlers call it. Existing `console.error` sites can adopt it incrementally.

> **Correcting a first impression:** the 81 `console.error` calls are *not* 81 silent failures. I
> checked the body of every catch that contains one. The large majority also set a user-visible
> `error.value` or call `alert`. The genuinely silent ones are listed in L3, and two of those are
> silent by documented design. The gap is the *logging*, not the user notice.

### H3 — Applying session changes deletes rows with no backup and no transaction

[SessionChanges.cs:572-631](StoryTimeline.Data/Database/SessionChanges.cs#L572-L631). `Apply`
walks a co-writer's `.stlc` file and, per entry, calls `repo.DeleteItem(change.Id)` or
`repo.SaveItemFull(…)`. The per-item transaction ceiling is already known and documented:

```csharp
// ponytail: SaveItemFull opens its own connection and transaction per item, so a
// failure halfway leaves the earlier items applied. A session diff is tens of
// rows; wrap the loop in one transaction when that stops being true.
```

The part that is *not* covered is the backup. Compare:

| Operation | Pre-flight safety |
|-----------|-------------------|
| Schema migration | `PRAGMA quick_check`, then a **verified** backup, then per-step transactions |
| DB import | snapshot to scratch, migrate the scratch copy, preview conflicts, then merge |
| **Session apply** | **nothing** |

Applying a `.stlc` is the one operation that **deletes user rows on the authority of an external
file**, and it is the only one that takes no backup first. A half-applied merge has no way back.

**Fix:** `BackupService.CreateBackup()` before the loop. It already exists and is already verified
— this is reuse, not new code. The single-transaction wrap is the nicer fix but the bigger diff.

### H4 — Three bare `catch { }` in the V1 legacy import path

[DatabaseImporter.cs](StoryTimeline.Data/Database/DatabaseImporter.cs) — these are the only
*undocumented* silent swallows in the C# codebase. Every other bare catch in the repo is a
labelled best-effort cleanup (`catch { /* best-effort */ }` on a temp-file delete), which is fine.

| Line | Swallows |
|------|----------|
| 393 | a per-item insert failure — items vanish with no count and no log |
| **454** | **the entire `characters` + `item_character_appearances` + `character_relationships` block** |
| 475 | `item_story_refs` |

Line 454 is the serious one: one failure anywhere in that block silently drops *every* character,
*every* appearance and *every* relationship from a V1 import, and the import then reports success.

Additionally, [line 542-547](StoryTimeline.Data/Database/DatabaseImporter.cs#L542-L547):

```csharp
catch (Exception ex)
{
    System.Diagnostics.Debug.WriteLine(ex.Message);   // invisible in Release
    transaction.Rollback();
    throw;
}
```

`Debug.WriteLine` is exactly what `Logger.cs`'s docstring names as the thing to stop doing. The
rethrow means the failure still surfaces, so the impact is a lost stack trace rather than a lost
error — but it should be `Logger.Error`.

---

## Medium

### M1 — `lodAnim` is never cancelled on unmount

[TimelineCanvas.vue:522, 553, 557-558](Frontend/src/components/TimelineCanvas.vue#L552-L558).
The handle is cancelled only when the *next* LOD change starts:

```ts
if (lodAnim) cancelAnimationFrame(lodAnim);
lodAnim = requestAnimationFrame(step);
```

`onBeforeUnmount` ([2175-2191](Frontend/src/components/TimelineCanvas.vue#L2175-L2191)) cancels
`_fpsRafId`, `_jumpRafId` and `_midMouseRafId`, then calls `stage?.destroy()`. `lodAnim` is not in
that list. Closing the timeline window mid-animation leaves up to `TimelineLodChangeAnimationLength`
(default 300ms) of frames calling `clearLanes()`, `renderGrid()` and `renderWithDimming()` against
a destroyed stage.

Same class, same function — [line 563](Frontend/src/components/TimelineCanvas.vue#L563):

```ts
setTimeout(()=>{ renderWithDimming(props.layoutSettings!); }, 100)
```

No handle is kept, so this cannot be cancelled either. It is the *non-animated* branch, so it fires
on every LOD change whenever animation is off or `lowResourceMode` is on — the low-resource path is
the one with the uncancellable timer. The `100` is also unexplained.

**Fix:** add `lodAnim` to the unmount cancel list; store the timeout handle and clear it there too.

### M2 — `loadFilterPreset` destroys before it creates

[timelineStore.ts ~598](Frontend/src/stores/timelineStore.ts#L598):

```ts
const oldRules = filterRules.value;
// Persist to DB before updating in-memory state so a failure leaves the store consistent
await Promise.all(oldRules.map(r => BackendAPI.DeleteFilterRule(r.Id)));
await Promise.all([...rules.map(r => BackendAPI.SaveFilterRule(r)), ...]);
```

The comment describes the intent; the order achieves the opposite. If any save in the second batch
fails, the old rules are already deleted and the preset is half-applied with nothing to roll back to.

**Fix:** save the new rules first, then delete the old ones — or do both in one backend action.

### M3 — `clearAllFilters` fires N floating promises

[timelineStore.ts:614](Frontend/src/stores/timelineStore.ts#L614):

```ts
filterRules.value.forEach(r => BackendAPI.SaveFilterRule(r));
```

Not awaited, no catch. These are bridge calls, so a rejection *does* carry `bridge: true` and does
reach the global net — but the 5s dedupe means only the first of N is shown, and the UI has already
rendered as if every save succeeded.

### M4 — Thumbnails are generated synchronously on the shared data pump

[MediaRepo.cs:32-57](StoryTimeline.Data/Database/MediaRepo.cs#L32-L57). `WithThumbs` calls
`EnsureThumb` per row, and `EnsureThumb` decodes and rescales the image on a cache miss. It runs on
every `GetAllMedia` and every `GetItemPictures`.

That work lands on `_dataPump`, which is **`static`** ([MessageRouter.cs:40](Bridge/MessageRouter.cs#L40)) —
one continuation chain for the entire process, not one per window. So the first open of a large
media library decodes every image on that chain and *every window's* bridge traffic queues behind it.

The pump itself is sound (`Dispatch` catches everything, so the chain never faults), and the
single-chain design is a documented deliberate choice with a named upgrade path. The problem is
specifically that image decoding was put on it.

**Fix:** generate thumbnails lazily off the pump, or pre-warm them once on import rather than on read.

### M5 — The log file never rotates

[Logger.cs](StoryTimeline.Data/Logger.cs) has no size check, no roll and no trim — confirmed, zero
matches for any rotation logic. `%LOCALAPPDATA%\StoryTimelineMk2_Data\logs\app.log` grows without
bound.

This compounds with M4: `EnsureThumb` logs one `Logger.Error` per undecodable image *per call*, so a
single unreadable file in the library writes a stack trace every time the picture list is opened.

**Fix:** roll at a few MB, keep two or three files. ~10 lines in `WriteLine`.

### M6 — Character save is a non-atomic four-step sequence

[CharactersApp.vue:214-266](Frontend/src/pages/CharactersApp.vue#L214-L266):
`planGeneratedItems(c)` mutates ids → `SaveCharacter` persists them → `writeItems` deletes dropped
ids and saves each generated item → `linkPortraitToItems`.

A failure between steps 2 and 3 leaves a `characters` row whose `birth_item_id` / `death_item_id`
points at no `items` row. The error *is* shown (`error.value = \`Save failed: ${ex}\``), so the user
knows the save failed — but not that the row is now inconsistent, and a retry starts from the
half-written state.

Worth flagging now because BL-16's decision to keep birth/death events regardless of timeline
visibility makes this sequence longer, not shorter.

### M7 — `ImportAndSaveMedia` never sets Width/Height

[MediaRepo.cs:116-132](StoryTimeline.Data/Database/MediaRepo.cs#L116-L132). The `MediaItem` is built
without `Width` or `Height`, but the INSERT passes `@Width, @Height`. Every `pictures` row is written
with 0×0.

Either the columns matter and this is a data bug, or nothing reads them and they are dead columns —
in which case this belongs in the code-quality report instead. I did not trace every consumer.

### M8 — `DeleteMedia` deletes the row before the file

[MediaRepo.cs:174-191](StoryTimeline.Data/Database/MediaRepo.cs#L174-L191). The DB row goes first,
then `File.Delete`. If the file is locked (a viewer has it open), the row is gone and the file is
orphaned on disk with nothing left pointing at it.

**Fix:** delete the file first, or catch and log so the orphan is at least recorded.

---

## Low

### L1 — Backups are sorted by filesystem timestamp, not by their own filename

[BackupService.cs](StoryTimeline.Data/Database/BackupService.cs). `PruneOldBackups` and
`GetRecentBackups` both `.OrderByDescending(File.GetCreationTime)`, while the filename already
carries a sortable `timeline_yyyyMMdd_HHmmss`. Copy or restore the backup folder and every
creation time becomes "now" — the prune then keeps the 20 most recently *copied* files, which may
be the 20 oldest backups.

**Fix:** sort on the substring. Rung 6 — one line.

### L2 — Two idioms for `VACUUM INTO`

`BackupService` parameterises it (`"VACUUM INTO @path"`);
[DatabaseImporter.cs:249](StoryTimeline.Data/Database/DatabaseImporter.cs#L249) interpolates it
(`$"VACUUM INTO '{scratchPath}'"`). The path is app-generated from a GUID so this is not an
injection vector, but the unparameterised form breaks on a data root containing an apostrophe, and
two idioms for one operation is the kind of thing that gets copied.

### L3 — The genuinely silent frontend catches

Having checked all 81, these are the ones that tell the user nothing:

| Location | What is swallowed | Verdict |
|----------|-------------------|---------|
| [CalendarApp.vue:442](Frontend/src/pages/CalendarApp.vue#L442) | `Failed to parse YearDefinition` | **Should speak.** A corrupt calendar definition silently falls back to defaults; the user sees their custom calendar quietly revert. |
| [api.ts:830](Frontend/src/bridge/api.ts#L830) | unreadable message from the host | Low impact, but it is the bridge — worth a log once H2 lands. |
| [timelinePrefs.ts:13, 42](Frontend/src/utils/timelinePrefs.ts#L13) | a preference that won't load | **Leave it.** Documented: *"losing a color swatch is not worth an error dialog over the window it was opening."* Correct call. |
| [itemDetails.ts:20](Frontend/src/utils/itemDetails.ts#L20) | a failed detail fetch, cached as null | **Leave it.** Documented: retrying on every pan would hammer a backend that just said no. Correct call. |

---

## What is sound — and worth not breaking

Stated plainly, because most of this is better than the average codebase of this size.

**`Bridge/MessageRouter.cs` — the centralised net.** Every dispatched message is wrapped:

```csharp
catch (Exception ex)
{
    Logger.Error($"Bridge/{message.Action}", ex);
    if (message.MessageId != null)
        ReplyToVue(message.MessageId, new { status = "error", message = ex.Message, detail = ex.ToString() });
    if (_parentForm is { IsDisposed: false, IsHandleCreated: true })
        _parentForm.BeginInvoke((MethodInvoker)(() => MessageBox.Show(...)));
}
```

Full stack trace to the log, a rejection the frontend can act on, and a dialog — all three legs of
the rule, in one place. Unknown actions also reply, so a typo'd action name fails visibly instead of
hanging a promise forever. `Dispatch`'s catch also means the `_dataPump` chain can never fault.

**`SchemaMigrator.cs` — the strongest code in the repo.** Refuses newer-schema databases, runs
`PRAGMA quick_check` before touching anything, writes a *verified* pre-migration backup, runs each
step in its own transaction committing `PRAGMA user_version` with it, is resumable after an
interruption, and wraps every failure in a typed `MigrationException(info, stage, backupPath, …)`
that carries the backup path to the user. This is the standard H3 should be held to.

**`f_ErrorReport`** — deliberately plain-chrome so it works when WebView2 or the DB is the thing
that is down, with Copy report / Open log folder / Open backups folder.

**`StoryTimeline.Server`** — every path logs through `Logger`: `Bridge/Serialize`, `Bridge/Receive`,
`Bridge/Pump`, `Bridge/Parse`, `Bridge/Route`, `Server/Upload`, `Server/Export/*`. Actions missing
from the browser build log a `Warn` rather than failing silently. The browser build is not the weak
spot.

**Characters and relations did not regress anything.** This was a specific concern in the brief, so
it deserves a specific answer. [RelationsApp.vue](Frontend/src/pages/RelationsApp.vue) is the newest
large page and *every one* of its catches sets a user-visible `error.value` alongside the console
call — including the fire-and-forget ones (`SetMiscSetting(...).catch(ex => { error.value = … })`).
`CharacterRepo` is covered by tests. The character/relations work is, if anything, better-behaved
than the code it sits next to. Its one real weakness is M6.

**Backups / export / import.** `ImportFromZip` runs in one transaction, rolls back on any failure,
and cleans its temp dir in `finally`. `GetZipPreview` and `GetImportPreview` both surface id
collisions *before* anything destructive runs, which is what makes the cascade-delete-on-id-collision
behaviour acceptable rather than dangerous. Zip-slip is handled — `ExtractMedia` checks the resolved
path against the root, and `ZipFile.ExtractToDirectory` validates on its own. The V1 legacy path
(H4) is the exception, not the rule.

**`SessionChanges.EnsureSnapshot`** handles the interrupted-seal case explicitly, which is the kind
of thing that usually gets missed: stale open days are neutralised rather than being credited with
every day that has passed since.

**Tests.** Both suites verified green by running them:

| Suite | Result |
|-------|--------|
| Frontend (`npm run test`) | **880 passed / 880**, 53 files, exit 0, 33.4s |
| .NET (`StoryTimelineMk2.Tests`) | **469 passed / 469**, 0 failed, 0 skipped, 1m34s |

---

## Scope and gaps

Named honestly rather than implied as coverage.

- **Nothing was tested at runtime.** The app was not launched. Every finding is from reading.
- **`EditItem.vue`** (1992 lines) — I read the load and save paths only.
- **`RelationsApp.vue`** (3031 lines) — I checked every catch; I did not read the rendering internals.
- **`MainDbMigrations.cs`** (1526 lines) — I verified the migrator framework, not each of the 21 steps.
- **M7** — I did not trace whether anything reads `pictures.width` / `pictures.height`.
- **.NET tests** — the earlier run I reported as passing did **not** pass: it exited 0 but the build
  failed with `MSB3027`/`MSB3021` because Visual Studio and a running `StoryTimeline.exe` held
  `StoryTimeline.Data.dll`. No test summary was emitted. A clean re-run was started after the app
  was closed; its result is not in this document.

## Suggested order

Both H1 and H2 are the same change and fix the largest gap — do them together. H3 is one line of
reuse. H4 is three lines. None of the High items is a large diff.

1. H1 + H2 — global error handler + `LogFrontendError` bridge action
2. H3 — `BackupService.CreateBackup()` before `SessionChanges.Apply`
3. H4 — log-and-count the three bare catches; swap `Debug.WriteLine` for `Logger.Error`
4. M1 — cancel `lodAnim` and the timeout on unmount
5. M2, M3 — filter ordering and the floating promises
6. M5 — log rotation (cheap, and it makes everything above more useful)
7. The rest as convenient

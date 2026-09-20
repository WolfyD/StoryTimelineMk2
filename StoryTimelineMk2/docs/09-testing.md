# 09 — Testing

StoryTimelineMk2 has four test layers, from fast isolated unit tests up to full-stack tests that drive the real WinForms app over the Chrome DevTools Protocol (CDP).

## Test Pyramid Overview

| Layer | Framework | Location | What it exercises | What it trusts (does NOT test) |
|---|---|---|---|---|
| **C# repository tests** | xUnit 2.9 + real SQLite | `StoryTimelineMk2.Tests/Database/` | Every `*Repo` class, `DbInitializer` schema creation/seeding, `DatabaseImporter` — against a real on-disk SQLite file in a temp dir | The bridge (`MessageRouter`), WinForms code, and the frontend |
| **Vitest unit / component tests** | Vitest 5 + happy-dom + @vue/test-utils | `Frontend/src/test/{utils,stores,bridge,components,pages}/` | Canvas math (`timelineLayout`), Konva node builders, Pinia store logic, `bridge/api.ts` message correlation, Vue component rendering/emits | The C# backend entirely — `window.chrome.webview` and `BackendAPI` are mocked |
| **Playwright mocked E2E** | Playwright + Chromium (headless) | `Frontend/src/test/e2e/` | The full Vue SPA in a real browser: page boot, DOM wiring, user flows — with all bridge calls answered by canned data | Backend correctness; that the mock responses match what C# actually sends |
| **Playwright "real" E2E** | Playwright over CDP | `Frontend/src/test/e2e-real/` | The whole stack: WinForms windows → WebView2 → `MessageRouter` → repos → a real seeded SQLite DB | Nothing — this is the top of the pyramid (but it is slow, sequential, and Windows-only) |

## Running Each Suite

### 1. C# repository tests

```powershell
# from repo root
dotnet test StoryTimelineMk2.Tests
```

- Project: `StoryTimelineMk2.Tests/StoryTimelineMk2.Tests.csproj` — `net10.0-windows`, xUnit 2.9.3, `xunit.runner.visualstudio`, `coverlet.collector` (coverage), references the main `StoryTimelineMk2.csproj`.
- No prerequisites. Each test creates its own temp database (see conventions below); nothing touches `%LOCALAPPDATA%`. Two exceptions, both self-cleaning: `StatsRepoTests` wipe/re-seed `usage.sqlite` next to the test binary (its path is fixed by `StatsDbInitializer.GetStatsDbPath()`), and the auto-backup tests in `BackupServiceTests` snapshot and restore `%APPDATA%\StoryTimelineMk2\config.json` because `CheckAndAutoBackup` calls `AppConfig.Save()`.

### 2. Vitest unit / component tests

```bash
# from Frontend/
npm run test            # vitest run (one-shot)
npm run test:watch      # vitest watch mode
npm run test:coverage   # vitest run --coverage (v8 provider)
```

- Config: `Frontend/vitest.config.ts` — environment `happy-dom`, `globals: true`, setup file `src/test/setup.ts`.
- No dev server, no backend, no browser needed. Both Playwright folders (`src/test/e2e/**`, `src/test/e2e-real/**`) are excluded so `npm run test` never collects them.

### 3. Playwright mocked E2E

```bash
# from Frontend/
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI mode
```

- Config: `Frontend/playwright.config.ts` — `testDir: ./src/test/e2e`, single Chromium project, `baseURL: http://localhost:5173`.
- Prerequisite: none beyond `npm install` — the `webServer` block auto-starts `npm run dev` (or reuses an already-running dev server).

### 4. Playwright real E2E

```powershell
# step 1 — from repo root: build + launch the app with an isolated DB and CDP enabled
powershell scripts\Start-E2EApp.ps1            # optional: -Port 9222 -DataRoot <path> -KeepData
```

```bash
# step 2 — from Frontend/
npm run test:e2e:real       # headless
npm run test:e2e:real:ui    # Playwright UI mode
```

- Config: `Frontend/playwright.real.config.ts` — `testDir: ./src/test/e2e-real`, `workers: 1`, `fullyParallel: false` (all tests share one live app instance), `retries: 0`, single project `real-app` with **no browser launch** (connection happens in fixtures).
- Prerequisites: Windows, .NET 10 SDK, WebView2 runtime, and the app started via `Start-E2EApp.ps1` **before** running tests. The Vite dev server is auto-started by the config's `webServer` block (the Debug build of the app navigates to `http://localhost:5173`). `python` or `python3` on PATH is **required** — the launcher uses its bundled `sqlite3` module to build the seed database.

## The Bridge Mock (mocked E2E)

`Frontend/src/test/e2e/bridge-mock.ts` fakes the WebView2 bridge entirely inside the browser. Every mocked spec calls it before navigation:

```ts
test.beforeEach(async ({ page }) => {
  await injectBridgeMock(page)
  await page.goto('/')
})
```

How it works:

1. `injectBridgeMock(page)` uses `page.addInitScript()` so the mock exists **before Vue boots**.
2. It installs a fake `window.chrome.webview` object with `postMessage` / `addEventListener` / `removeEventListener`.
3. A `MOCK_RESPONSES` table maps action names (`GetAllTimelines`, `GetTimelineData`, `GetItemForEdit`, `SaveItem`, `SaveNote`, `GetSystemFonts`, ~40 more) to canned payloads shaped like the real C# replies (PascalCase keys, JSON-string `YearDefinition`, full `LayoutSettings`, etc.).
4. When the app calls `postMessage`, the mock extracts `action` and `messageId`, then on `setTimeout(0)` (next tick, mimicking real async bridge I/O) dispatches a synthetic `MessageEvent` to all registered listeners with `{ messageId, payload }` (correlated request) or `{ action, payload }` (broadcast). Unknown actions get a `null` payload.

This mirrors the handshake in `Frontend/src/bridge/api.ts` exactly, so `BackendAPI.request()` resolves normally. The Vitest layer has its own simpler stub: `src/test/setup.ts` replaces `window.chrome.webview` with `vi.fn()` no-ops (component tests additionally `vi.mock('@/bridge/api')` when they need resolved values).

## The Real E2E Setup

"Real" means: **real WinForms app, real WebView2 windows, real `MessageRouter`, real repos, real SQLite database** — only the database *location* and *content* are test-controlled.

### `scripts/Start-E2EApp.ps1` (run first, from repo root)

1. Kills stale `StoryTimeline` / `msedgewebview2` processes to free port 9222.
2. Sets `STORYTIMELINE_DATA_ROOT` to an isolated folder (default `%TEMP%\StoryTimelineE2E`) so tests never touch the user's real database. Wiped each run unless `-KeepData` is passed.
3. **Builds the seed DB** at `<DataRoot>\timeline.sqlite` (skipped if one exists, i.e. with `-KeepData`): applies the frozen 1.0.1 schema fixture `StoryTimelineMk2.Tests\Fixtures\main_schema_v0_1.0.1.sql` (schema version 0) and then `scripts\e2e-seed.sql` (two timelines, ten items, two characters, one note, windowed 1280×800 settings rows). Because the seed is a genuine pre-versioning database, every run also exercises the real upgrade path: on startup the app writes `backups\pre v… migration backup - <timestamp>.sqlite` and migrates in place (see [10-migrations.md](10-migrations.md)).
4. Sets `STORYTIMELINE_REMOTE_DEBUG_PORT=9222` so all WebView2 windows share one browser process exposing a CDP endpoint; clears the shared WebView2 test cache at `%LOCALAPPDATA%\StoryTimelineMk2_Cache\test-shared`.
5. Runs `dotnet build -c Debug` and launches `bin\Debug\net10.0-windows\StoryTimeline.exe` with those env vars via `ProcessStartInfo`.

### `global-setup.ts`

Runs once before any test: polls `http://localhost:9222/json/version` (20 attempts × 500 ms) and fails fast with instructions to run `Start-E2EApp.ps1` if the app isn't up.

### `fixtures.ts`

- `appBrowser` (worker-scoped): `chromium.connectOverCDP('http://localhost:9222')` — attaches to the app's existing WebView2 browser instead of launching one.
- `appContext` (worker-scoped): the first (only) browser context.
- `mainPage`: locates the main window's page by URL role (`findPageByRole` — main = the page that is *not* `timeline.html` / `editItem.html` / `settings.html` / `calendar.html`) and brings it to front.
- `pageErrors` (test-scoped): collects `console.error` and uncaught exceptions from all current and future pages; `waitForNewPage(ctx, role, timeout, errors)` polls for a window the app opens (e.g. the timeline window after clicking a project row) and appends collected errors to its timeout message.

Specs import `test`/`expect` from `./fixtures`, not from `@playwright/test`.

## Coverage Map

### Backend (C#)

| Source | Test file |
|---|---|
| `Database/ItemRepo.cs` | `StoryTimelineMk2.Tests/Database/ItemRepoTests.cs` |
| `Database/TimelineRepo.cs` | `TimelineRepoTests.cs` |
| `Database/CalendarRepo.cs` | `CalendarRepoTests.cs` |
| `Database/LodRepo.cs` | `LodRepoTests.cs` |
| `Database/NoteRepo.cs` | `NoteRepoTests.cs` |
| `Database/HiddenRangeRepo.cs` | `HiddenRangeRepoTests.cs` |
| `Database/StoryRepo.cs` | `StoryRepoTests.cs` |
| `Database/BookRepo.cs` | `BookRepoTests.cs` |
| `Database/SettingsRepo.cs` | `SettingsRepoTests.cs` |
| `Database/LayoutSettingsRepo.cs` | `LayoutSettingsRepoTests.cs` |
| `Database/CharacterRepo.cs` | `CharacterRepoTests.cs` |
| `Database/TagRepo.cs` | `TagRepoTests.cs` |
| `Database/MediaRepo.cs` | `MediaRepoTests.cs` — incl. import/copy, thumbnail generation (256px cap, no upscale, webp skipped, fallback to original), lazy thumb backfill, delete cleanup |
| `Database/MiscSettingsRepo.cs` | `MiscSettingsRepoTests.cs` |
| `Database/FilterRuleRepo.cs` | `FilterRuleRepoTests.cs` |
| `Database/FilterPresetRepo.cs` | `FilterPresetRepoTests.cs` |
| `Database/StatsRepo.cs`, `Database/StatsDbInitializer.cs` | `StatsRepoTests.cs` (uses its own `StatsDbContext`, see above) |
| `Database/BackupService.cs` | `BackupServiceTests.cs` — manual + auto backup, restore, retention |
| `Database/TimelineExporter.cs` | `TimelineExporterTests.cs` |
| `Database/DbInitializer.cs` | `DbInitializerTests.cs` — schema, seeds, migrations, `ResetBuiltinPreset` |
| `Database/Migrations/*` (`SchemaMigrator`, `MainDbMigrations`, `StatsDbMigrations`) | `SchemaMigratorTests.cs` — chain numbering + release tags, `AppVersionOf`, fresh DB stamped, idempotent re-run, newer-version refusal (file untouched), v0 fixture → same schema as fresh (columns, FKs, indexes) with rows kept + legacy NULLs normalised, pre-1.0.0 dev schema (subtick, INTEGER note ids, missing columns), verified restorable pre-migration backup with the `pre v1.0.1-v{current} …` name, prune exemption, `VerifyBackup` rejects garbage / wrong version / missing tables, abort-before-change on `quick_check` failure and on unwritable backup, every stage logged to `app.log`, failing-step rollback/resume, failure report carries backup + old version, stats DB: fixture → fresh schema with `(usage stats)` backup, newer-version refusal. Fixtures in `StoryTimelineMk2.Tests/Fixtures/*.sql` are frozen 1.0.1 dumps (copied to the output dir by the csproj) — never edit them by hand |
| `Database/DatabaseImporter.cs` | `DatabaseImporterTests.cs` — v1 legacy import, preview, v2 migrate-then-merge (old-schema backup gets new-column defaults, real `CreateBackup` round-trip, newer-version backup refused as `MigrationException` with the picked path and no scratch file left behind, scratch cleaned up on success) |
| `ErrorReport.cs` | `ErrorReportTests.cs` — migration report lists database, schema/app versions, stage, backup (or "not modified"), log path, inner exception + stack; plain exceptions get type/message/stack |
| Cross-table scenarios | `DbStressTests.cs` — backup/restore round-trips across every table, cascade deletes, multi-checkpoint restore, full lifecycle |
| **Gaps** | Every public method on every `Database/*` class is exercised except `DatabaseImporter.HandleDBImport` (opens a file dialog). `Bridge/MessageRouter.cs` and everything under `Forms/` (incl. `f_ErrorReport`) have **no unit tests at all** (covered only indirectly by real E2E). |

### Frontend (Vitest)

| Source | Test file(s) |
|---|---|
| `utils/timelineLayout.ts` | `test/utils/timelineLayout.test.ts`, `timelineLayout.extended.test.ts` |
| `utils/timelineNodes.ts` | `test/utils/timelineNodes.test.ts` |
| `utils/relativeRule.ts` | `test/utils/relativeRule.test.ts` |
| `stores/timelineStore.ts` | `test/stores/timelineStore.test.ts`, `timelineStore.extended.test.ts` |
| `bridge/api.ts` | `test/bridge/api.test.ts` |
| `pages/TimelineApp.vue` | `test/components/TimelineApp.test.ts` |
| `pages/EditItem.vue` | `test/components/EditItem.test.ts` |
| `pages/CalendarApp.vue` | `test/pages/CalendarApp.test.ts` |
| `components/TimelineNotesPanel.vue` | `test/components/TimelineNotesPanel.test.ts` |
| `components/TimelineSettingsModal.vue` | `test/components/TimelineSettingsModal.test.ts` |
| `components/TimelineItemViewModal.vue` | `test/components/TimelineItemViewModal.test.ts` |
| `components/AuthorReminderModal.vue` | `test/components/AuthorReminderModal.test.ts` |
| `components/SelectCalendarModal.vue` | `test/components/SelectCalendarModal.test.ts` |
| `components/WeekDayPicker.vue` | `test/components/WeekDayPicker.test.ts` |
| `components/CalendarDayPicker.vue` | `test/components/CalendarDayPicker.test.ts` |
| **Gaps** | `utils/filterMatcher.ts` (no unit test despite being pure logic — easy win). `pages/SettingsApp.vue`. ~24 untested components, notably `TimelineCanvas.vue` (Konva canvas — only E2E coverage), `TimelineMinimap`, `TimelineDataPanel`, `TimelineGalleryPanel`, `TimelineFilterPanel` / `TimelineFilterSetupModal`, `ProjectContainer`, `LodDateInput`, `RelativeRuleEditor`, `CalendarManagerModal` / `CalendarMonthGrid` / `CalendarYearView` / `CalendarViewModal`, `AppSettingsModal`, `FontPicker`, `ImagePickerModal`, and the small modals (`ConfirmDelete`, `DuplicateTimeline`, `ExportTimeline`, `EditTimeline`). |

### E2E specs

| Suite | Spec files |
|---|---|
| Mocked (`test/e2e/`) | `timeline-app.spec.ts`, `timeline-canvas.spec.ts`, `edit-item.spec.ts`, `settings.spec.ts` |
| Real (`test/e2e-real/`) | `main-app.spec.ts`, `main-management.spec.ts`, `timeline.spec.ts`, `timeline-navigation.spec.ts`, `timeline-items.spec.ts`, `timeline-actions.spec.ts`, `timeline-canvas.spec.ts`, `timeline-canvas-interaction.spec.ts`, `timeline-filter.spec.ts`, `timeline-settings.spec.ts`, `timeline-gallery.spec.ts`, `timeline-notes.spec.ts`, `timeline-reference.spec.ts`, `calendar.spec.ts`, `calendar-switching.spec.ts` |

## Conventions for New Tests

### C# repo tests

- Put the test class in `StoryTimelineMk2.Tests/Database/`, decorated with `[Collection("Database")]`. The collection (defined in `DbTestHelper.cs`) has `DisableParallelization = true` — DB tests **must** run serially because repos capture the connection string from the `AppConfig` singleton at construction time.
- Per test: `using var ctx = new DbTestContext();` **before** constructing the repo under test. `DbTestContext` points `AppConfig.Instance.DataRoot` at a fresh temp dir, runs `DbInitializer.Initialize()` (full schema + seed), sets Dapper's `MatchNamesWithUnderscores`, and deletes the dir on dispose.
- Seed FK parents by hand with raw Dapper SQL (see `ItemRepoTests.SeedTimeline`); use `ctx.OpenConnection()` for direct verification queries.

### Vitest

- Files live under `Frontend/src/test/<mirror-of-src-path>/<Name>.test.ts` (`.test.ts`, not `.spec.ts` — `.spec.ts` is reserved for Playwright).
- `window.chrome.webview` is already stubbed globally by `src/test/setup.ts`. For components that await bridge results, `vi.mock('@/bridge/api', ...)` **before** importing the component.
- Use `@vue/test-utils` `mount` + `flushPromises`, and `createPinia()` / `setActivePinia()` per test. Build bulky domain objects (e.g. `LayoutSettings`) with a local `make*(overrides)` factory helper.

### Mocked E2E

- New specs go in `Frontend/src/test/e2e/*.spec.ts`; always `await injectBridgeMock(page)` in `beforeEach` **before** `page.goto()`.
- If the flow under test uses a bridge action not yet mocked, add it to `MOCK_RESPONSES` in `bridge-mock.ts`, matching the real C# reply shape (PascalCase keys).

### Real E2E

- Import `test`, `expect` (and `waitForNewPage`) from `./fixtures`, never from `@playwright/test` directly.
- Tests share one live app + DB and run sequentially — make created data unique (`` `E2E Timeline ${Date.now()}` ``), don't assume a pristine DB (assert "at least one row", not exact counts), and use `waitForNewPage(appContext, 'timeline' | 'editItem' | ..., timeout, pageErrors)` when a click opens a new WinForms window.
- The `pageErrors` fixture surfaces console errors / uncaught exceptions — reference it in tests that open new windows so failures carry diagnostics.
- Seed-data changes go in `scripts/e2e-seed.sql` (plain `INSERT`s against the frozen 1.0.1 schema — keep them generic, the specs only assume "at least one timeline with a few items around year 0"); the DB is rebuilt on each `Start-E2EApp.ps1` run, use `-KeepData` while iterating to skip that.
- Selector conventions: modals rendered through `BaseModal` expose `.bm-backdrop`, `.bm-panel`, `.bm-header`, `.bm-title`, `.bm-close`, `.bm-footer`; a component's own body stays `.modal-body`. `CalendarManagerModal` uses the `#header` slot, so it keeps `.modal-title` and its own `.icon-btn[title="Close"]`.
- Keyboard (BL-39): while focus is in a text / number field the first `Escape` only leaves the field (`useShortcuts`) — press it twice to cancel the edit window or close a modal after `fill()`. The data panel's per-row View / Locate buttons are hover-revealed, so `hover()` the row before clicking.

# StoryTimelineMk2 — Architecture

## 1. Project Overview

StoryTimelineMk2 is a **Windows desktop application for creative writers** to visualize and manage story timelines. Writers create one or more timelines per project, place items on them (events, periods, ages, pictures, notes, bookmarks, characters), and view everything on a zoomable canvas with configurable custom calendars and level-of-detail (LOD) date formatting.

Technically it is a **hybrid desktop app**:

- **Host**: .NET 10 WinForms application (`StoryTimelineMk2.csproj`, `<TargetFramework>net10.0-windows</TargetFramework>`, `<OutputType>WinExe</OutputType>`).
- **UI**: A Vue 3 single-page application (Pinia for state, Konva.js for the canvas) embedded in each window via **WebView2** (Chromium).
- **Persistence**: SQLite accessed through **Dapper** repositories (`Dapper 2.1.79`, `Microsoft.Data.Sqlite 10.0.8`, `Microsoft.Web.WebView2 1.0.3967.48` — see `StoryTimelineMk2.csproj:14-16`).
- **Communication**: JSON messages over the WebView2 `window.chrome.webview` bridge, correlated by `messageId`.

There is no web server in production — the frontend is a static Vite build loaded from disk, and all "backend" logic runs in-process in the WinForms host.

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WinForms Host (.NET 10)                             │
│  Program.cs ──▶ f_Main ──opens──▶ f_Timeline / f_AddEditItem / f_Calendar   │
│                  │                        │                                 │
│                  │  (each window hosts its own WebView2 control)            │
│                  ▼                        ▼                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   WebView2 (Chromium runtime)                         │  │
│  │   environment via WebView2EnvironmentFactory.GetAsync(subfolder)      │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                 Vue 3 SPA (Vite build)                          │  │  │
│  │  │  entry points: index.html / timeline.html / editItem.html /     │  │  │
│  │  │                settings.html / calendar.html                    │  │  │
│  │  │  pages/  components/  stores/timelineStore.ts (Pinia)           │  │  │
│  │  │  utils/timelineLayout.ts + timelineNodes.ts (Konva canvas)      │  │  │
│  │  │                          │                                      │  │  │
│  │  │            bridge/api.ts (BackendAPI.request / .send)           │  │  │
│  │  └──────────────────────────┼──────────────────────────────────────┘  │  │
│  │                             │ window.chrome.webview.postMessage       │  │
│  │                             │ { action, payload, messageId }          │  │
│  └─────────────────────────────┼─────────────────────────────────────────┘  │
│                                ▼                                            │
│              Bridge/MessageRouter.cs  (RouteMessage → ReplyToVue)           │
│                                │                                            │
│                                ▼                                            │
│   Database/*Repo.cs  (ItemRepo, TimelineRepo, CharacterRepo, CalendarRepo,  │
│      LodRepo, LayoutSettingsRepo, SettingsRepo, TagRepo, StoryRepo, …)      │
│                                │  Dapper                                    │
│                                ▼                                            │
│        SQLite  —  %LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite      │
│        (path resolved by AppConfig; schema created by DbInitializer)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Additional data channel: `f_Timeline` and `f_AddEditItem` map the media folder to the virtual host `https://media.app/` via `SetVirtualHostNameToFolderMapping` (`Forms/f_Timeline.cs:43-46`, `Forms/f_AddEditItem.cs:50-53`) so the Vue app can display images stored under `<DataRoot>\Media`.

### Bridge protocol

- **Frontend** — `Frontend/src/bridge/api.ts`: `BackendAPI.send(action, payload)` is fire-and-forget; `BackendAPI.request<T>(action, payload)` assigns an incrementing `messageId`, stores a resolver in a `pendingRequests` map, and posts `{ action, payload, messageId }` (`api.ts:27-46`).
- **Backend** — `Bridge/MessageRouter.cs`: each window constructs a `MessageRouter(CoreWebView2, parentForm)` (`MessageRouter.cs:20`). Incoming messages are deserialized into `Bridge/BridgeMessage.cs` and dispatched by a `switch` on the `action` string in `RouteMessage()` (`MessageRouter.cs:41`); replies go back through `ReplyToVue(messageId, payload)`.
- Typical actions: `GetTimelineData`, `SaveItem`, `GetAllTimelines`, `GetTimelineCharacters`, `GetTimelineStories`, `SearchBooks`, `ImportDB`, `OpenAddEditItemWindow`, `SaveSettings`, `SaveLayoutSettings`.
- The router also opens native windows on request: it constructs `new f_Timeline()` (`MessageRouter.cs:174`), `new f_AddEditItem { … }` (`MessageRouter.cs:246`), and `new f_Calendar { CalendarId = … }` (`MessageRouter.cs:799`).

## 3. Vite Entry Points and Their Host Windows

`Frontend/vite.config.ts:20-28` defines **five** Rollup inputs (CLAUDE.md mentions four; `calendar.html` was added later):

| HTML entry | Bootstrap file | Vue root component | WinForms host window | Query params passed by host |
|---|---|---|---|---|
| `index.html` | `src/main.ts` | `App.vue` (project list / main shell) | `Forms/f_Main.cs` | none |
| `timeline.html` | `src/timeline.ts` | `pages/TimelineApp.vue` (Konva canvas) | `Forms/f_Timeline.cs` | `?id={TimelineId}` (`f_Timeline.cs:57`) |
| `editItem.html` | `src/editItem.ts` | `pages/EditItem.vue` | `Forms/f_AddEditItem.cs` | `?timelineId=…&itemId=…` or `&typeId=…&year=…&granularity=…` (`f_AddEditItem.cs:57-69`) |
| `calendar.html` | `src/calendar.ts` | `pages/CalendarApp.vue` | `Forms/f_Calendar.cs` | `?calendarId=…` (`f_Calendar.cs:33`) |
| `settings.html` | `src/settings.ts` | `pages/SettingsApp.vue` | *No WinForms window navigates to it currently.* It is reachable on the dev server (`/settings.html`) and exercised by E2E tests (`Frontend/src/test/e2e/settings.spec.ts`). In-app timeline settings are shown as a modal instead (`components/TimelineSettingsModal.vue` inside `TimelineApp.vue`). |

### Dev vs. release URL loading

Two different strategies are used:

- **`f_Main` — compile-time switch** (`Forms/f_Main.cs:88-108`): under `#if DEBUG` it enables DevTools and navigates to `http://localhost:5173` (the Vite dev server, `f_Main.cs:13`); otherwise it disables DevTools/context menus and navigates to `{Application.StartupPath}\Frontend\dist\index.html`, showing a "Production UI files are missing" warning if the file does not exist.
- **`f_Timeline`, `f_AddEditItem`, `f_Calendar` — runtime file check**: each builds `{Application.StartupPath}\Frontend\dist\<entry>.html`; if that file **exists** it navigates to the local file (plus query string), otherwise it falls back to `http://localhost:5173/<entry>.html` (`f_Timeline.cs:56-66`, `f_AddEditItem.cs:71-75`, `f_Calendar.cs:35-39`).

Note: the `.csproj` explicitly excludes `Frontend\**` from the build (`StoryTimelineMk2.csproj:37-40`), so **nothing copies `dist/` into the output folder automatically** — for a release, `Frontend/dist` must be built with `npm run build` and placed at `Frontend\dist` relative to the executable.

## 4. Startup Sequence

1. **`Program.cs:11` — `Main()`** (`[STAThread]`):
   1. `ApplicationConfiguration.Initialize()` — standard WinForms bootstrapping (DPI, default font).
   2. `DbInitializer.Initialize()` (`Database/DbInitializer.cs:15`) — opens a `SqliteConnection` using `AppConfig`'s connection string (creating the `DataRoot` directory first, `DbInitializer.cs:8-13`) and executes `CREATE TABLE IF NOT EXISTS …` for the full schema (timelines, calendars, lod_profiles, items, tags, layout_settings, …).
   3. `Application.Run(new Forms.f_Main())` — starts the message loop with the main window.
2. **`f_Main` constructor** (`Forms/f_Main.cs:18-27`) — `InitializeComponent()`, borderless style (inherits `Forms/BorderlessFormBase.cs`), wires `Load`/resize/move handlers.
3. **`F_Main_Load`** (`Forms/f_Main.cs:29-47`):
   1. `RestoreWindowState()` — reads saved window position/size from `SettingsRepo.GetOrCreateAppSettings()` and clamps it on-screen (`f_Main.cs:49-66`).
   2. `WebView2EnvironmentFactory.GetAsync("main")` — obtains a `CoreWebView2Environment` (see §6).
   3. `webView21.EnsureCoreWebView2Async(webEnvironment)` — initializes the Chromium runtime.
   4. `new MessageRouter(webView21.CoreWebView2, this)` — subscribes to `WebMessageReceived` and starts routing bridge messages (`f_Main.cs:39`).
   5. `LoadFrontend()` — navigates to the dev server or `Frontend\dist\index.html` (§3). Any initialization failure is surfaced via `MessageBox` (`f_Main.cs:43-46`).
4. **Frontend boot** — the entry script (e.g. `src/main.ts`) creates the Vue app, installs Pinia, mounts `#app`, and fades out the loading splash (see `src/calendar.ts:1-14` for the pattern). Pages then call `BackendAPI.request(...)` to pull data from C#.
5. **Secondary windows** — opened on demand from the SPA through bridge actions handled in `MessageRouter` (e.g. opening a timeline creates `f_Timeline` with `TimelineId` set; its own `Load` handler repeats steps 3.2–3.5 with its own environment subfolder, media virtual-host mapping, `WindowCloseRequested` → host close, and a one-shot `NavigationCompleted` hook that applies custom CSS zoom, `f_Timeline.cs:33-75`).

## 5. AppConfig (`AppConfig.cs`)

Singleton (`AppConfig.Instance`, double-checked-locked, `AppConfig.cs:24-33`) that resolves where all user data lives.

| Concern | Value |
|---|---|
| Config file | `%APPDATA%\StoryTimelineMk2\config.json` (`AppConfig.cs:8-12`) |
| Stored content | A single JSON property: `"dataRoot"` (`AppConfig.cs:17-18`), written indented by `Save()` (`AppConfig.cs:56-61`) |
| Default data root | `%LOCALAPPDATA%\StoryTimelineMk2_Data` (`AppConfig.cs:20-22`) |
| Database path | `<DataRoot>\timeline.sqlite` (`GetDbPath()`, `AppConfig.cs:63`) |
| Media folder | `<DataRoot>\Media` (`GetMediaFolder()`, `AppConfig.cs:64`) |
| Connection string | `Data Source=<DataRoot>\timeline.sqlite` (`AppConfig.cs:65`) |

Load precedence (`AppConfig.Load()`, `AppConfig.cs:35-54`):

1. **`STORYTIMELINE_DATA_ROOT` environment variable always wins** — used by the E2E test launcher to point the app at an isolated database without touching the user's real `config.json`.
2. Otherwise `config.json` is deserialized if it exists and has a non-blank `dataRoot`.
3. Otherwise defaults are used (deserialization errors are swallowed and fall back to defaults).

## 6. WebView2EnvironmentFactory (`WebView2EnvironmentFactory.cs`)

A small static factory that decides how `CoreWebView2Environment` instances are created (`WebView2EnvironmentFactory.cs:17-64`). Every window calls `GetAsync(subfolder)` instead of letting WebView2 pick defaults.

- **Normal mode** (no `STORYTIMELINE_REMOTE_DEBUG_PORT` env var): each window gets its **own private environment** with a per-window cache folder `%LOCALAPPDATA%\StoryTimelineMk2_Cache\<subfolder>` — subfolders `"main"`, `"timeline"`, `"edit"`, `"calendar"`. Each window therefore runs in its own isolated browser process.
- **Test mode** (`STORYTIMELINE_REMOTE_DEBUG_PORT` set): a **single shared environment** is created once (guarded by a `SemaphoreSlim`) with cache folder `…\StoryTimelineMk2_Cache\test-shared` and `--remote-debugging-port={port}` added to the browser arguments. All windows then share one browser process and one CDP endpoint, so **Playwright can connect once and see every page** — this is what `scripts/Start-E2EApp.ps1` sets up (port 9222, isolated `STORYTIMELINE_DATA_ROOT`, seed DB copied from `Misc\timeline.db`).

Why it exists: without it, multi-window CDP testing would be impossible (each private environment exposes its own — or no — debugging port), while normal users keep fully isolated per-window browser state.

## 7. Build, Run, and Test

### Frontend (run from `Frontend/`)

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173 (hot reload)
npm run build        # type-check (vue-tsc) + vite build → dist/ (5 HTML entries)
npm run type-check   # vue-tsc --build
npm run lint         # oxlint --fix, then eslint --fix
npm run format       # prettier on src/
```

(Scripts defined in `Frontend/package.json:6-23`. Requires Node `^20.19.0 || >=22.12.0`.)

### Backend (.NET, repo root)

```bash
dotnet build                  # Debug
dotnet build -c Release      # Release
dotnet test                   # runs StoryTimelineMk2.Tests (unit tests; InternalsVisibleTo is configured in StoryTimelineMk2.csproj:21-25)
```

### Running the full app

- **Debug**: start `npm run dev` in `Frontend/`, then run the project (e.g. from Visual Studio). `f_Main` loads `http://localhost:5173`; secondary windows also fall back to the dev server when `Frontend\dist\<entry>.html` is absent next to the exe.
- **Release**: run `npm run build` in `Frontend/`, build with `dotnet build -c Release`, and ensure `Frontend\dist\` sits next to the executable (`Application.StartupPath`) — the csproj does **not** copy it (§3).

### Frontend tests (from `Frontend/`)

```bash
npm run test              # Vitest unit tests (vitest run)
npm run test:coverage     # Vitest with V8 coverage
npm run test:e2e          # Playwright against the dev server (playwright.config.ts)
npm run test:e2e:real     # Playwright against the real WinForms app over CDP
                          # (playwright.real.config.ts; launch the app first with
                          #  scripts/Start-E2EApp.ps1, which sets
                          #  STORYTIMELINE_DATA_ROOT + STORYTIMELINE_REMOTE_DEBUG_PORT=9222)
```

## 8. Repository Layout

| Path | Purpose |
|---|---|
| `Program.cs` | Application entry point: WinForms init → `DbInitializer.Initialize()` → run `f_Main` |
| `AppConfig.cs` | Data-root/config singleton (§5) |
| `WebView2EnvironmentFactory.cs` | Per-window vs. shared WebView2 environment creation (§6) |
| `StoryTimelineMk2.csproj` | .NET 10 WinForms project; Dapper, Microsoft.Data.Sqlite, WebView2 packages; excludes `Frontend\**` and `StoryTimelineMk2.Tests\**` from compilation |
| `Bridge/` | `MessageRouter.cs` (action dispatch + replies) and `BridgeMessage.cs` (message DTO) |
| `Database/` | Dapper repositories (`*Repo.cs`), domain models (`*Item.cs`, `TimelineInfo.cs`, `FullTimelineProject.cs`), `DbInitializer.cs` (schema), `DatabaseImporter.cs` (legacy DB import) |
| `Forms/` | WinForms windows: `f_Main`, `f_Timeline`, `f_AddEditItem`, `f_Calendar`, shared `BorderlessFormBase` + designer files |
| `Frontend/` | Vue 3 SPA: `src/pages/`, `src/components/`, `src/stores/timelineStore.ts`, `src/bridge/api.ts`, `src/types/models.ts`, `src/utils/` (canvas math + Konva builders), `src/test/` (unit + `e2e/` + `e2e-real/`); five HTML entries; Vite/Vitest/Playwright/ESLint configs |
| `docs/` | Project documentation (this file, `architecture.md`, `bridge-api.md`, `data-model.md`, `development.md`, `frontend.md`, `overview.md`, feature specs) |
| `Misc/` | `timeline.db` — seed database copied into the isolated data root by the E2E launcher |
| `scripts/` | `Start-E2EApp.ps1` — builds and launches the app configured for real-app Playwright testing |
| `StoryTimelineMk2.Tests/` | .NET unit test project (has access to internals via `InternalsVisibleTo`) |
| `Models/` | Empty placeholder folder (declared in the csproj, no files) |
| `src/` | Empty leftover folder (no files) |
| `.claude/` | Claude Code local settings |
| `bin/`, `obj/` | Build output (generated) |

### Runtime file locations (outside the repo)

| Location | Contents |
|---|---|
| `%APPDATA%\StoryTimelineMk2\config.json` | App config (`dataRoot`) |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\` | `timeline.sqlite` + `Media\` (default data root) |
| `%LOCALAPPDATA%\StoryTimelineMk2_Cache\` | WebView2 browser caches (`main`, `timeline`, `edit`, `calendar`, `test-shared`) |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

StoryTimelineMk2 is a Windows desktop application for creative writers to visualize and manage story timelines. It embeds a Vue 3 SPA inside a WinForms host via WebView2 (Chromium), with SQLite for persistence.

## Commands

### Frontend (run from `Frontend/`)
```bash
npm install
npm run dev          # Dev server at http://localhost:5173 (hot reload)
npm run build        # Production build → dist/ (multiple HTML entry points)
npm run type-check   # vue-tsc type checking
npm run lint         # oxlint + eslint --fix
npm run format       # Prettier
```

### Backend (.NET)
```bash
dotnet build                  # Debug build
dotnet build -c Release       # Release build
```

### Running the full app
- **Debug**: Open `.csproj` in Visual Studio and run. The app loads `http://localhost:5173` automatically (start `npm run dev` first).
- **Release**: App loads `dist/index.html` from `bin/Release/.../Frontend/dist/` — run `npm run build` before releasing.

## Architecture

**Hybrid: WinForms host + embedded Vue 3 SPA**

```
WinForms (f_Main, f_Timeline, f_AddEditItem)
  └── WebView2 (Chromium)
        └── Vue 3 SPA (Pinia + Konva.js)
              └── bridge/api.ts  ← JSON messaging ↔  Bridge/MessageRouter.cs
                                                            └── StoryTimeline.Data/ (SQLite + Dapper)
```

### Bridge / Messaging

All frontend↔backend communication uses `window.chrome.webview` JSON messages:
- **Frontend**: `Frontend/src/bridge/api.ts` — `BackendAPI.request(action, payload)` sends a message and awaits a correlated response.
- **Backend**: `Bridge/MessageRouter.cs` — `RouteMessage()` dispatches on `action` string (e.g. `GetTimelineData`, `SaveItem`, `OpenAddEditItemWindow`) and replies via `ReplyToVue()`.

Key actions: `GetTimelineData`, `SaveItem`, `GetTimelineCharacters`, `GetTimelineStories`, `SearchBooks`, `ImportDB`, `OpenAddEditItemWindow`.

### Frontend Structure (`Frontend/src/`)

| Path | Purpose |
|------|---------|
| `pages/` | Top-level page components: `TimelineApp.vue`, `EditItem.vue`, `SettingsApp.vue` |
| `components/` | Reusable components — `TimelineCanvas` (Konva.js canvas), `LodDateInput`, etc. |
| `stores/timelineStore.ts` | Pinia store — central state for current timeline, items, settings |
| `bridge/api.ts` | All calls to C# backend go through here |
| `types/models.ts` | TypeScript interfaces for all domain objects |
| `utils/timelineLayout.ts` | Canvas math: converting time values to pixel positions |
| `utils/timelineNodes.ts` | Konva node builders for timeline elements |

### Multiple Entry Points (Vite)

The build produces three HTML files, each loaded by a different WinForms window:
- `index.html` → `TimelineApp` (main project list / timeline viewer)
- `timeline.html` → timeline canvas
- `editItem.html` → `EditItem`

### Backend Structure

| Path | Purpose |
|------|---------|
| `StoryTimeline.Data/` | Class library on plain `net10.0` — the whole data layer plus `Logger` and `AppConfig`. No WinForms dependency: it has to run on macOS and Linux for the browser build (BL-68). |
| `StoryTimeline.Data/Database/*Repo.cs` | Repository pattern over SQLite via Dapper (ItemRepo, TimelineRepo, CharacterRepo, …) |
| `StoryTimeline.Data/Database/*Item.cs` | Domain model classes |
| `StoryTimeline.Data/Database/DbInitializer.cs` | Schema creation on first run |
| `Bridge/MessageRouter.cs` | Routes WebView2 messages to handlers |
| `Forms/` | WinForms windows (f_Main, f_Timeline, f_AddEditItem) |
| `Program.cs` | Entry point |

SQLite database lives at `%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite`. WebView2 cache at `%LOCALAPPDATA%\StoryTimelineMk2_Cache\`.

## Key Domain Concepts

**TimelineItem** — core entity with:
- Temporal position: `Year`, `Subtick`, `EndYear`, `EndSubtick` + pre-computed `AbsoluteStart`/`AbsoluteEnd` fractions used by canvas math.
- `TypeId`: 1=Event, 2=Period, 3=Age, 4=Picture, 5=Note, 6=Bookmark, 7=Character, 8–9=Timeline boundaries.
- Relationships: tags, character appearances, story references, chapter references.

**LodProfile** (Level of Detail) — controls date formatting at different zoom levels (Millennia → Days). Stored as JSON in the `Calendar` field of a Timeline.

**Calendar** — custom calendar system with configurable months/weeks/days (`YearDefinition` JSON). Year 0 offset is configurable.

**LayoutSettings** — reusable visual templates for timeline rendering (box styles, stem styles, tick colors, animations).

## Icon Convention

- **Phosphor** (`@phosphor-icons/vue` components) is the icon set for everything new: UI chrome (close, add, delete, edit, form actions), the navigation strip, section icons and domain concepts.
- **Remix Icons** (`<i class="ri-*">`) survive only in older components (`TimelineCanvas` context menu, `TimelineNotesPanel`, `WindowTitleBar`, `LightboxOverlay`, `AboutModal`, a few others). Do not add new Remix uses; swap to Phosphor when you are editing one of those icons anyway.

## Workflow

Whenever a backlog item (BL-xx) is fully or partially completed, read `BACKLOG.md` and update the relevant item's **Status** field to accurately reflect what was done. Do not wait to be asked.

Whenever a user-visible feature or fix lands, add a bullet to `releases/<version>.md` for the version currently in `StoryTimelineMk2.csproj` (create the file if the version was just bumped). It is the GitHub release body — write it for users, not developers. Do not wait to be asked.

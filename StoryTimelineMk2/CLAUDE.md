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
                                                            └── Database/ (SQLite + Dapper)
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

The build produces four HTML files, each loaded by a different WinForms window:
- `index.html` → `TimelineApp` (main project list / timeline viewer)
- `timeline.html` → timeline canvas
- `settings.html` → `SettingsApp`
- `editItem.html` → `EditItem`

### Backend Structure

| Path | Purpose |
|------|---------|
| `Database/*Repo.cs` | Repository pattern over SQLite via Dapper (ItemRepo, TimelineRepo, CharacterRepo, …) |
| `Database/*Item.cs` | Domain model classes |
| `Database/DbInitializer.cs` | Schema creation on first run |
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

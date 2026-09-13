# StoryTimeline Mk2

A Windows desktop application for creative writers to visualize and manage their story timelines.

---

## What It Does

StoryTimeline lets you build a scrollable, zoomable timeline of your story's events, periods, characters, and more. Think of it as a visual calendar for your fictional world — with support for custom calendar systems, multi-story organization, and a rich set of item types.

### Key features

- **Timeline canvas** — pan and zoom through your story's history; items are rendered via Konva.js with smooth animation and level-of-detail scaling
- **Custom calendars** — define your own months, week lengths, and day counts; Year 0 offset is configurable per timeline
- **Item types** — Events, Periods, Ages, Characters, Bookmarks, Notes, Pictures, and boundary markers
- **Multi-story / multi-character** — organize items by story and character, filter and highlight relationships
- **Level of Detail (LOD)** — date labels automatically adapt from Millennia down to Days as you zoom in
- **Layout settings** — reusable visual templates control colors, box styles, stem styles, axis appearance
- **Export / import** — backup and restore the full database; export individual timelines
- **Statistics** — writing session tracking with milestones and achievements

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Host | WinForms (.NET 10, Windows) |
| Renderer | WebView2 (Chromium embedded) |
| Frontend | Vue 3 + Vite, Pinia, Konva.js |
| Persistence | SQLite via Dapper |
| Bridge | JSON messaging over `window.chrome.webview` |

---

## Architecture

The app is a hybrid: a thin WinForms shell hosts a full Chromium browser via WebView2, which renders a Vue 3 SPA. The C# side and the Vue side communicate through a JSON message bridge.

```
WinForms (f_Main, f_Timeline, f_AddEditItem, f_Calendar)
  └── WebView2
        └── Vue 3 SPA (Pinia + Konva.js)
              └── bridge/api.ts  ←→  Bridge/MessageRouter.cs
                                           └── Database/ (SQLite + Dapper)
```

**Bridge**: `BackendAPI.request(action, payload)` in `Frontend/src/bridge/api.ts` sends a JSON message and awaits a correlated response. `Bridge/MessageRouter.cs` on the C# side dispatches on the `action` string and replies via `ReplyToVue()`.

**Multiple windows**: Each WinForms window hosts its own WebView2 instance pointing to a different HTML entry point (`index.html`, `timeline.html`, `editItem.html`, `calendar.html`).

**Release serving**: In release builds, all four pages are served via a virtual host (`https://app.local/`) mapped to the `Frontend/dist/` folder using WebView2's `SetVirtualHostNameToFolderMapping`. This gives the page a real HTTPS origin and avoids file:// CORS restrictions.

---

## Frontend Layout (`Frontend/src/`)

| Path | Purpose |
|------|---------|
| `pages/` | Top-level page components: `TimelineApp.vue`, `EditItem.vue`, `SettingsApp.vue` |
| `components/TimelineCanvas.vue` | Konva.js canvas — all timeline rendering |
| `components/LodDateInput.vue` | Date input aware of the current LOD level |
| `stores/timelineStore.ts` | Pinia store — central state (current timeline, items, settings) |
| `bridge/api.ts` | All calls to C# go through here |
| `types/models.ts` | TypeScript interfaces for all domain objects |
| `utils/timelineLayout.ts` | Canvas math: time values → pixel positions |
| `utils/timelineNodes.ts` | Konva node builders for timeline elements |

---

## Getting Started

See **[BUILD.md](BUILD.md)** for full prerequisites, dev setup, and release build instructions.

**Quick start (development):**

```bash
# Terminal 1 — frontend dev server
cd Frontend
npm install
npm run dev        # http://localhost:5173

# Visual Studio — open StoryTimelineMk2.slnx and press F5
```

The WinForms app detects the Vite dev server and connects automatically. Changes in `Frontend/src/` hot-reload in the running app.

---

## Data Locations

| Path | Contents |
|------|----------|
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite` | SQLite database |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\logs\app.log` | Application log |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\backups\` | Auto/manual backups |
| `%LOCALAPPDATA%\StoryTimelineMk2_Cache\` | WebView2 browser cache |

---

## Key Domain Concepts

**TimelineItem** — the core entity. Has a temporal position (`Year`, `Subtick`, optional end), a `TypeId` (1=Event, 2=Period, 3=Age, 4=Picture, 5=Note, 6=Bookmark, 7=Character, 8–9=boundaries), and relationships to tags, characters, stories, and chapters.

**LodProfile** (Level of Detail) — a set of zoom breakpoints that control date formatting. Stored as JSON on the timeline. At high zoom the labels show days; at low zoom they show millennia.

**Calendar** — configurable month/week/day structure via a `YearDefinition` JSON blob. Each timeline can have its own calendar.

**LayoutSettings** — a named visual template (colors, box style, stem style, tick appearance) that can be applied to any timeline.

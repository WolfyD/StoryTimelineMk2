# Architecture

## High-level design

Story Timeline Mk2 is a **hybrid desktop + web** application. A Windows Forms shell (C#) hosts an embedded Chromium browser (WebView2) that renders a full Vue 3 application. The two sides talk over a JSON message bridge.

```text
┌─────────────────────────────────────────────────────┐
│              Windows Forms process (C#)             │
│                                                     │
│  f_Main ──── WebView2 ──────────── Vue 3 frontend   │
│  f_Timeline   │                    (Konva canvas)   │
│               │  JSON messages                      │
│           MessageRouter                             │
│               │                                     │
│          Database layer                             │
│          (Dapper / SQLite)                          │
└─────────────────────────────────────────────────────┘
```

## Windows Forms layer (`Forms/`)

Three forms are defined:

| Form | Role |
| --- | --- |
| `f_Main` | Application entry window; shows project list via WebView2 |
| `f_Timeline` | Full timeline viewer window; hosts the Konva canvas via WebView2 |
| `f_AddEditItem` | Modal dialog for adding or editing a timeline item |

`f_Main` and `f_Timeline` each own a `WebView2` control and a `MessageRouter` instance. The router wires itself to `CoreWebView2.WebMessageReceived` at construction time.

In **debug** mode `f_Main` navigates to `http://localhost:5173` (Vite dev server) with DevTools enabled. In **production** mode it navigates to `<Application.StartupPath>/Frontend/dist/index.html` with DevTools and the default context menu disabled.

## Message bridge (`Bridge/`)

Communication between C# and Vue is asynchronous JSON over the WebView2 message channel.

**Vue → C# (request):**

```json
{ "action": "GetTimelineData", "payload": { "id": 3 }, "messageId": 7 }
```

**C# → Vue (reply):**

```json
{ "messageId": 7, "payload": { ... } }
```

`messageId` lets the TypeScript side match each reply to the `Promise` that requested it (see `pendingRequests` map in `Frontend/src/bridge/api.ts`).

C# can also push unprompted messages to Vue (e.g., `InitReload` after a database import) by calling `MessageRouter.SendToVue(action, payload)` directly.

All routing logic lives in `Bridge/MessageRouter.cs`. Supported actions:

| Action | Handler |
| --- | --- |
| `GetTimelineData` | Fetches a full `FullTimelineProject` aggregate |
| `GetAllTimelines` | Lists all timeline project summaries |
| `CreateProject` | Creates a new timeline in the database |
| `OpenTimeline` | Opens `f_Timeline` for a given timeline id |
| `GetTimelineItems` | Returns items for a specific timeline |
| `ImportDB` | Triggers `DatabaseImporter.HandleDBImport()` |
| `OpenAddEditItemWindow` | Shows `f_AddEditItem` modal |
| `OpenSettings` | (stub — not yet implemented) |

**Known inconsistency:** `timelineStore.loadTimelines()` sends the action `"GetTimelines"`, but `MessageRouter` only handles `"GetAllTimelines"`. These are mismatched and the store call will silently fail.

## Database layer (`StoryTimeline.Data/Database/`)

All data access goes through repository classes. Each repo uses `Dapper` for SQL execution against the SQLite file located at:

```text
%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite
```

The schema is created (and seeded with defaults) by `DbInitializer.cs` on first run.

Key repositories:

| Repository | Managed data |
| --- | --- |
| `TimelineRepo` | Timeline projects |
| `ItemRepo` | Events, periods, ages, notes, characters |
| `CharacterRepo` | Character entities |
| `NoteRepo` | Rich-text notes |
| `TagRepo` | Tags + item–tag join |
| `CalendarRepo` | Custom calendar definitions |
| `LayoutSettingsRepo` | Visual customization profiles |
| `SettingsRepo` | User preferences |
| `MediaRepo` | Picture assets + item–picture join |
| `RelationshipTypeRepo` | Character relationship types |

`FullTimelineProject.cs` is a plain aggregate container (not a repo) that groups a `TimelineProject`, its `TimelineItem[]`, and its `TimelineNote[]` for a single round-trip response.

## Frontend (`Frontend/`)

The Vue app has three entry points built by Vite:

| Entry | HTML file | Purpose |
| --- | --- | --- |
| Main | `index.html` | Project list (`App.vue` → `ProjectContainer.vue`) |
| Timeline | `timeline.html` | Timeline viewer (`TimelineApp.vue` → `TimelineCanvas.vue`) |
| Settings | `settings.html` | Settings page (stub) |

**Vite config note:** `vite.config.ts` has a duplicate key bug — both `settings.html` and `timeline.html` use the key `"settings"` in `rollupOptions.input`, so only `index.html` and `timeline.html` are reliably built.

### State flow for the timeline viewer

1. `TimelineApp.vue` mounts and calls `BackendAPI.LoadTimelineData(id)`.
2. C# replies with the `FullTimelineProject` aggregate.
3. `useTimelineStore().loadTimelineData(id)` fetches and stores it in Pinia.
4. `TimelineCanvas.vue` reads from the store and builds Konva nodes via `timelineNodes.ts`.
5. Layout math (coordinates, lane collision packing) lives in `timelineLayout.ts`.

### Level-of-Detail (LOD)

The canvas has eight zoom levels from `MILLENNIA` down to `DAYS`. The active LOD step determines:

- How many pixels represent one unit of time (`pixelsPerSubtick`).
- Which items are visible (`MinLodLevel` threshold on each item).
- How tick markers are formatted on the axis.

LOD change and "jump to year" transitions can be animated; animation lengths are controlled per `LayoutSettings`.

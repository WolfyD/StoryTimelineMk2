# Frontend

The frontend is a Vue 3 + TypeScript application built with Vite. It lives entirely in `Frontend/` and communicates with the C# backend through the WebView2 message bridge.

## Entry points

Vite is configured with three separate HTML entry points, each producing an independent page that the corresponding Windows Form loads into its WebView2 control.

| Entry HTML | Initializer | Root component | Purpose |
| --- | --- | --- | --- |
| `index.html` | `src/main.ts` | `App.vue` | Project list (main window) |
| `timeline.html` | `src/timeline.ts` | `pages/TimelineApp.vue` | Timeline canvas (timeline window) |
| `settings.html` | `src/settings.ts` | `pages/SettingsApp.vue` | Settings (stub) |

**Vite config note:** `vite.config.ts` has a duplicate key bug — `settings` and `timeline` both use the key `"settings"` in `rollupOptions.input`, so `timeline.html` silently overwrites the settings entry. Only `index.html` and `timeline.html` are reliably built.

## Components

### `App.vue`

Root component for the main window. Renders `SplashTitle.vue` and `ProjectContainer.vue`.

### `ProjectContainer.vue`

Displays the list of existing timeline projects and provides controls to create a new project or import a database. Calls `BackendAPI.GetAllTimelines()` on mount, `BackendAPI.CreateNewProject(title)` on create, and `BackendAPI.OpenTimeline(id)` to open a project.

### `pages/TimelineApp.vue`

Root component for the timeline window. On mount, reads a `timelineId` value passed from C# (via a query parameter or a WebView2 shared variable), then calls `BackendAPI.LoadTimelineData(id)` and writes the result into `useTimelineStore()`.

### `components/TimelineCanvas.vue`

The main rendering component. It:

1. Reads `TimelineItem[]`, `LayoutSettings`, `LodProfile`, and other state from Pinia.
2. Calls `timelineNodes.ts` helpers to build Konva `Group` objects for each visible item.
3. Calls `timelineLayout.ts` to compute canvas coordinates and resolve lane collisions.
4. Renders tick marks, the "now" line, the hover line, and the data-range indicator.
5. Handles mouse events for pan, zoom, and hover.

## State (`stores/timelineStore.ts`)

A single Pinia store holds all runtime state. State is exposed directly (Setup Store style).

| State field | Type | Description |
| --- | --- | --- |
| `projects` | `TimelineProject[]` | All projects (used on main window) |
| `currentProject` | `TimelineProject` | Active timeline project |
| `items` | `TimelineItem[]` | Items for the active timeline |
| `title` / `author` | `string` | Convenience fields mirroring `currentProject` |
| `settings` | `TimelineSettings` | Per-project settings |
| `layoutSettings` | `LayoutSettings` | Visual layout profile |
| `calendar` | `Calendar` | Active calendar |
| `lodProfile` | `LodLevel[]` | Zoom levels parsed from calendar's LOD profile JSON |
| `currentLodIndex` | `number` | Index into `lodProfile` (default: 3 = YEARS) |
| `currentLodTitle` | `string` | Display name of current LOD (e.g. `"YEARS"`) |
| `currentNowYear` | `number` | Center year of the visible canvas |
| `zoomLevel` | `number` | Raw zoom multiplier |
| `isLoading` | `boolean` | True while awaiting bridge response |
| `fps` / `visibleItems` | `number` | Performance display counters |

Computed:

- `pastItems` — items where `year < currentNowYear`
- `futureItems` — items where `year >= currentNowYear`

Actions:

- `loadTimelines()` — sends `"GetTimelines"` to C# and stores results. **Note:** the MessageRouter handles the action as `"GetAllTimelines"` — these names are currently mismatched (likely a bug).
- `loadTimelineData(id)` — calls `BackendAPI.LoadTimelineData(id)`, populates all state fields. The `LodProfile.Profile` field arrives as a JSON string and is parsed inline.
- `lodZoomIn()` / `lodZoomOut()` — step `currentLodIndex` up or down through `lodProfile`.
- `setNowYear(year)`, `addItem(item)`, `removeItem(id)`, `loadItems(items[])`, `setFpsDisplay(fps)`

Constant exposed by the store:

```ts
ItemTypes = ["Event","Period","Age","Picture","Note","Bookmark","Character","Timeline_start","Timeline_end"]
```

## Bridge API (`bridge/api.ts`)

`BackendAPI` is a plain object that wraps WebView2 messaging. Two primitives:

- `send(action, payload)` — fire and forget (no reply expected).
- `request<T>(action, payload): Promise<T>` — sends a message with a `messageId` and returns a `Promise` that resolves when C# replies with the matching id.

A `Map<number, resolve>` (`pendingRequests`) maps live message ids to their `Promise` resolve functions. An event listener on `window.chrome.webview` dispatches incoming messages to the correct resolver or handles unprompted C# pushes.

When the bridge is not available (e.g., running in a plain browser during development), `request()` logs a warning and resolves with `null` so the app does not crash.

## Utilities

### `utils/timelineLayout.ts`

Pure math helpers:

- **Coordinate conversion** — translates year + subtick values to canvas x positions using the active `pixelsPerSubtick` and `StartYear`.
- **Lane collision packing** — a 1D bin-packing algorithm that assigns event boxes to horizontal lanes so they do not overlap. Items with higher `Importance` values get lower (closer to the axis) lanes.

### `utils/timelineNodes.ts`

Konva node factory functions. Each function takes a `TimelineItem` and `LayoutSettings` and returns a `Konva.Group` containing the stem line, event box, and label text. Separate builders exist for event boxes, period bars, age bars, and the character/note box variant.

## Styling

Global styles are in `src/assets/main.scss` (compiled with Sass). Per-project custom CSS can be injected at runtime when `TimelineSettings.UseCustomCss` is true; the CSS string stored in `TimelineSettings.CustomCss` is inserted into a `<style>` tag by `TimelineApp.vue`.

## Dependencies

| Package | Purpose |
| --- | --- |
| `vue` 3.5 | UI framework |
| `pinia` 3 | State management |
| `konva` 10 + `vue-konva` | HTML5 canvas rendering |
| `splitpanes` 4 | Resizable panel layout |
| `@phosphor-icons/vue` | Icon set |
| `sass` | SCSS compilation |
| `vite` 8 | Build tool + dev server |
| `typescript` 6 + `vue-tsc` | Type checking |
| `oxlint` + `eslint` | Linting |
| `prettier` | Formatting |

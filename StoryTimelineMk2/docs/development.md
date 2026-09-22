# Development Guide

## Prerequisites

| Tool | Version |
| --- | --- |
| .NET SDK | 10.0 |
| Node.js | 20.19.0+ or 22.12.0+ |
| Visual Studio / Rider | any recent version with .NET support |
| WebView2 Runtime | ships with Windows 11; installer available for Windows 10 |

## Running in development mode

The backend detects `DEBUG` builds and loads the frontend from the Vite dev server instead of from disk. This enables hot module replacement (HMR) for instant Vue updates without restarting the C# process.

**Step 1 — Start the Vite dev server:**

```bash
cd Frontend
npm install       # first time only
npm run dev       # starts at http://localhost:5173
```

**Step 2 — Run the C# app:**

Open the solution in Visual Studio and press F5, or:

```bash
dotnet build
dotnet run
```

The WebView2 controls in `f_Main` and `f_Timeline` will point to `localhost:5173` in debug mode.

## Building for production

**Step 1 — Build the frontend:**

```bash
cd Frontend
npm run build     # runs type-check + vite build, output → Frontend/dist/
```

**Step 2 — Publish the C# app:**

```bash
dotnet publish -c Release
```

In production mode `f_Main` navigates WebView2 to `<Application.StartupPath>/Frontend/dist/index.html` from disk. DevTools and the default context menu are disabled. No external runtime is required beyond the WebView2 runtime.

## Frontend scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | Run `vue-tsc` without emitting |
| `npm run lint` | Run oxlint then eslint (both with auto-fix) |
| `npm run format` | Prettier over `src/` |

## File locations at runtime

| Path | Content |
| --- | --- |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite` | Application database |
| `%LOCALAPPDATA%\StoryTimelineMk2_Cache` | WebView2 browser cache |

## Project structure quick reference

```text
StoryTimelineMk2/         ← C# project root
├── Program.cs
├── Bridge/
│   ├── MessageRouter.cs  ← central action dispatcher
│   └── BridgeMessage.cs  ← message DTO
├── StoryTimeline.Data/
│   ├── DbInitializer.cs  ← schema creation + seed data
│   ├── *Repo.cs          ← one repo per entity type
│   └── FullTimelineProject.cs
├── Forms/
│   ├── f_Main.*
│   ├── f_Timeline.*
│   └── f_AddEditItem.*
└── Frontend/
    ├── index.html
    ├── timeline.html
    ├── settings.html
    ├── vite.config.ts
    └── src/
        ├── bridge/api.ts         ← BackendAPI (Vue → C#)
        ├── stores/timelineStore.ts
        ├── types/models.ts       ← all TS interfaces
        ├── utils/timelineLayout.ts
        ├── utils/timelineNodes.ts
        ├── pages/TimelineApp.vue
        └── components/TimelineCanvas.vue
```

## Adding a new bridge action

1. **C# side** — add a `case "YourAction":` branch in `MessageRouter.RouteMessage()` and implement a `HandleYourAction(BridgeMessage message)` method that calls `ReplyToVue(message.MessageId, result)`.

2. **TypeScript side** — add a method to the `BackendAPI` object in `Frontend/src/bridge/api.ts`:

   ```ts
   async YourAction(param: string) {
       return await this.request<YourReturnType>("YourAction", { param });
   }
   ```

3. Call the method from any Vue component or Pinia action.

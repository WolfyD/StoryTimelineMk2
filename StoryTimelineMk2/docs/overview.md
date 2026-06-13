# Story Timeline Mk2 — Overview

Story Timeline Mk2 is a Windows desktop application for creating, managing, and visualizing complex timelines. It targets authors, worldbuilders, game designers, and historians who need to plan and navigate events across large spans of time with precision.

## What it does

- Create multiple independent timeline **projects**, each with its own calendar system and settings.
- Add **items** (events, periods, ages, characters, notes) to a timeline with exact temporal positions.
- Visualize everything on a zoomable, interactive **canvas** that uses a Level-of-Detail (LOD) system — zooming out compresses time into centuries or millennia; zooming in shows individual days.
- Attach **notes**, **tags**, **pictures**, and **character relationships** to items.
- Customize every visual aspect of the timeline through **layout settings**.
- Import/export SQLite databases for backup or sharing.

## Tech stack at a glance

| Layer | Technology |
|---|---|
| Desktop host | C# / .NET 10 / Windows Forms |
| Embedded browser | Microsoft WebView2 (Chromium) |
| UI framework | Vue 3 + TypeScript + Vite |
| Canvas rendering | Konva (HTML5 Canvas) |
| State management | Pinia |
| Database | SQLite via Dapper ORM |

## Project layout

```
StoryTimelineMk2/
├── Program.cs              # Entry point
├── Bridge/                 # C# ↔ Vue message layer
├── Database/               # Repos, schema init, data classes
├── Forms/                  # Windows Forms windows
└── Frontend/               # Vue 3 app (built with Vite)
    └── src/
        ├── bridge/         # TypeScript API to C#
        ├── components/     # Vue components
        ├── pages/          # Top-level page components
        ├── stores/         # Pinia state
        ├── types/          # TypeScript interfaces
        └── utils/          # Layout math and Konva node builders
```

See [architecture.md](architecture.md) for how these layers interact, [data-model.md](data-model.md) for schema details, and [development.md](development.md) for how to build and run the project.

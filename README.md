# Story Timeline

A Windows desktop application for creative writers to visualize and manage their story timelines.

> Build a scrollable, zoomable timeline of your fictional world — events, ages, characters, periods, and more — with full support for custom calendar systems.

---

## What is it?

Story Timeline gives you a visual canvas for your story's history. Whether you're writing a fantasy epic with a thousand-year backstory or a contemporary thriller with a tight 48-hour window, you can map it all out, navigate it fluidly, and keep your facts straight.

Items sit on an interactive timeline you can pan and zoom freely. Zoom out to see the shape of an Age; zoom in to see the day-by-day sequence of a battle. Date labels adapt automatically to whatever level of detail makes sense at your current zoom level.

---

## Features

- **Zoomable, pannable canvas** — smooth navigation from millennia down to individual days, rendered via Konva.js
- **Custom calendar systems** — define your own months, week lengths, and day counts; Year 0 offset is configurable per timeline
- **Rich item types** — Events, Periods, Ages, Characters, Notes, Bookmarks, Pictures, and timeline boundary markers
- **Multi-story and multi-character** — organize items by story arc and character, filter and highlight relationships
- **Level of Detail (LOD)** — date labels automatically switch between Millennia / Centuries / Decades / Years / Months / Weeks / Days as you zoom
- **Layout templates** — named visual presets control colors, box styles, stem styles, and axis appearance
- **Gallery and notes panels** — attach images and long-form notes to any timeline item
- **Statistics** — writing session tracking with milestones
- **Export / import** — back up and restore the full database; import from previous versions
- **Dark theme** — easy on the eyes during long writing sessions

---

## Requirements

- Windows 10 or later (64-bit)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually already installed on Windows 10/11)

---

## Installation

Download the latest installer from the [Releases](../../releases/latest) page and run it. The installer handles everything, including Start Menu and Desktop shortcuts.

To uninstall, use **Add or Remove Programs** in Windows Settings, or re-run the installer.

---

## Data

Your data is stored locally and never sent anywhere.

| Location | Contents |
| -------- | -------- |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite` | Your timeline database |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\backups\` | Auto and manual backups |
| `%LOCALAPPDATA%\StoryTimelineMk2_Cache\` | Browser cache (safe to delete) |

---

## For Developers

See [StoryTimelineMk2/README.md](StoryTimelineMk2/README.md) for architecture overview and [StoryTimelineMk2/BUILD.md](StoryTimelineMk2/BUILD.md) for build and release instructions.

The app is a hybrid: a WinForms shell hosts a Chromium browser (WebView2) rendering a Vue 3 SPA, with C# ↔ Vue communication over a JSON message bridge. SQLite via Dapper for persistence.

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE) for details.

In short: use it for anything, study it, share it, change it. If you distribute it — or run a
modified version as a network service — the people who receive it get the source and the same
licence.

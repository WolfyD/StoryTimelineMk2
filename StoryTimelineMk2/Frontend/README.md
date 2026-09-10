# Story Timeline — Frontend

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

---

## Testing

### Unit tests (Vitest)

Fast, in-process tests with a mocked store. No app or browser needed.

```sh
npm run test          # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Tests live in `src/test/unit/`.

---

### Mock-based E2E tests (Playwright)

Playwright tests that load the Vue pages in a real browser but mock all C# bridge
calls in JavaScript. No WinForms app required.

```sh
npm run test:e2e       # headless
npm run test:e2e:ui    # visual Playwright UI
```

Tests live in `src/test/e2e/`.

---

### Real E2E tests (Playwright + live WinForms app)

Full-stack tests: Playwright connects to the running WinForms app via Chrome
DevTools Protocol (CDP) and drives the real Vue UI against the real C# bridge
and SQLite database.

#### Prerequisites

- .NET SDK (same version as the project)
- Node 20+ and `npm install` already done
- Playwright browsers installed: `npx playwright install chromium`

#### Step 1 — Start the app

From the **project root** (`StoryTimelineMk2/`), run once per test session:

```powershell
.\scripts\Start-E2EApp.ps1
```

This will:

1. Kill any stale app / WebView2 processes (frees CDP port 9222)
2. Create an isolated test database at `%TEMP%\StoryTimelineE2E\timeline.sqlite`
   seeded from `Misc/timeline.db` — your real database is never touched
3. Build the project in Debug
4. Launch the app with `STORYTIMELINE_REMOTE_DEBUG_PORT=9222` so all WebView2
   windows share one browser process and expose a single CDP endpoint

Leave the app window open while running tests.

Optional flags:

```powershell
.\scripts\Start-E2EApp.ps1 -Port 9333          # use a different CDP port
.\scripts\Start-E2EApp.ps1 -KeepData           # reuse existing test DB (skip re-seed)
```

#### Step 2 — Run the tests

From `Frontend/`:

```sh
npm run test:e2e:real       # headless
npm run test:e2e:real:ui    # visual Playwright UI (recommended for debugging)
```

Tests live in `src/test/e2e-real/`. The suite currently covers:

| Test | What it checks |
| --- | --- |
| Page loads and shows heading | Main app renders |
| Seed DB timelines visible | Project list populates from DB |
| Create new timeline | Save round-trip through C# bridge |
| Click row → timeline window | WinForms opens f_Timeline; CDP sees the new page |
| Timeline workspace rendered | `#timeline-workspace` and header visible |
| Canvas layers present | Konva renders at least one `<canvas>` |
| Notes / Distance tabs | Panel tabs exist and are labelled correctly |
| Jump-to-year input | Accepts value and survives Enter key |
| LOD zoom buttons | Buttons present and clickable without crash |
| Distance tab switch | Tab becomes active on click |

#### How test isolation works

| Concern | Mechanism |
| --- | --- |
| Database | `STORYTIMELINE_DATA_ROOT` env var → isolated `%TEMP%\StoryTimelineE2E\` |
| WebView2 cache | Separate `test-shared` subfolder, cleared by the start script |
| CDP connection | `chromium.connectOverCDP('http://localhost:9222')` (shared environment) |
| Page routing | `findPageByRole()` matches pages by URL suffix (`timeline.html`, etc.) |

#### Debugging failures

Run with `--ui` to use the Playwright visual debugger. If a test times out
waiting for a window to appear, the error message includes any browser console
errors collected during the wait — these usually point directly to the C#-side
exception that prevented the window from opening.

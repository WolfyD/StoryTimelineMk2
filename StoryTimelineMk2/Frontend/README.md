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

Tests live in `src/test/e2e-real/`. The suite covers:

**`calendar.spec.ts`** — Calendar Manager and Calendar Editor

| Test | What it checks |
| --- | --- |
| "Manage Calendars" opens modal | `.modal-panel` with "Calendars" title appears |
| Calendar list populated | At least one `.cal-row` from seed DB |
| View and Edit buttons on each row | Both `.action-btn` buttons present per row |
| "New Calendar" footer button | `.new-btn` visible |
| Close / backdrop dismisses modal | Modal hidden after click |
| Refresh reloads list | Rows still visible after refresh click |
| Edit opens calendar editor window | `calendar.html` page loads |
| New Calendar opens blank editor | `id-label` shows "New Calendar" |
| Editor `.cal-root` rendered | Page fully loaded |
| Name input pre-filled | Non-empty value for existing calendar |
| ID label not "New Calendar" | Existing calendar shows its UUID fragment |
| Save / Cancel buttons visible | Both `btn-primary` and `btn-secondary` present |
| Cancel closes the window | WinForms form closes on click |
| Calendar Info section collapsible | Body hides/shows on `.section-title-group` click |
| Help (i) button shows `.help-bubble` | `.info-btn.active` and `.help-bubble` visible |
| LOD table rows present | At least one LOD level in seed calendar |
| LOD table headers | "Format Key" and "Step" columns |
| Sort / Auto LOD buttons clickable | Table intact after click |
| Fraction toggle switches display | `.frac-btn` text changes between ½ and 1.0 |
| "Add Level" shows add form | `.add-lod-row` appears |
| Add form Cancel | Form hidden after cancel |
| Can add a DAYS LOD level | Row count increases after Add |
| Delete non-locked LOD row | Row count decreases after × click |
| Months table pre-populated | `tbody tr` count > 0 |
| Months header columns | "Name" and "Days" present |
| Year length positive | `input[type=number]` has positive value |
| "Add Month" appends row | Row count increases by 1 |
| New month row editable | Name and days inputs accept text |
| Month delete removes last added | Row count returns to original |
| Short names checkbox adds column | "Short" appears in table header |
| Week section visible | Section rendered |
| Enable checkbox toggles week | Days-per-week input appears when enabled |
| Day names checkbox shows name table | `table.data-table` appears when checked |
| Seasons section visible | Section rendered |
| Enable checkbox toggles seasons | Add Season button appears when enabled |
| Add Season appends row | Row count increases |
| Season row inputs | Name, start, end, delete all visible |
| Auto DOY opens modal | `.doy-panel` visible, Cancel dismisses |
| Season track shown when seasons defined | `.season-track` visible |
| Clearing name → save error | `.save-error` appears on save |
| New calendar ID label | Shows "New Calendar" |
| New calendar name default | Input contains "New Calendar" |
| Save new calendar with valid data | No `.save-error` after save |
| Cancel new calendar | Window closes; name not in manager list |

**`main-app.spec.ts`** — Main project list

| Test | What it checks |
| --- | --- |
| Page loads and shows heading | Main app renders |
| Seed DB timelines visible | Project list populates from DB |
| Create new timeline | Save round-trip through C# bridge |
| Click row → timeline window | WinForms opens f_Timeline; CDP sees the new page |

**`main-management.spec.ts`** — Project management

| Test | What it checks |
| --- | --- |
| Row ellipsis menu | Toggle opens/closes action buttons |
| Edit / Export / Duplicate / Delete buttons | All four visible in menu |
| Delete modal | Opens, Cancel dismisses, backdrop dismisses |
| Edit modal | Opens with title/author inputs, Cancel dismisses |
| Duplicate modal | Opens with `_duplicate`-suffixed input, Cancel dismisses |
| New project form | Toggle expands input; new timeline appears in list |
| Import/export icons | Bottom bar icons visible |

**`timeline.spec.ts`** — Timeline canvas basics

| Test | What it checks |
| --- | --- |
| Timeline workspace rendered | `#timeline-workspace` and header visible |
| Canvas layers present | Konva renders at least one `<canvas>` |
| Notes / Distance tabs | Panel tabs exist and are labelled correctly |
| Jump-to-year input | Accepts value and survives Enter key |
| LOD zoom buttons | Buttons present and clickable without crash |
| Distance tab switch | Tab becomes active on click |

**`timeline-navigation.spec.ts`** — Navigation controls

| Test | What it checks |
| --- | --- |
| Info bar item/visible counts | `Items:` and `Visible:` text present |
| FPS counter | `FPS:` shown in right info bar |
| All data panes rendered | Images, Notes, Contents panes visible |
| Minimap | `#timeline-overview` present |
| LOD label | `LoD level:` text in LOD container |
| LOD zoom in/out | Both buttons clickable; app stable after click |
| LOD level changes | Round-trip zoom changes the label text |
| Jump-to-year (positive) | Accepts `1000`, no crash |
| Jump-to-year (negative) | Accepts `-500`, no crash |
| Jump button | Triggers navigation without crash |
| Current-year readout | `Current year:` updates after jump |
| Header title | `h1` not empty |
| Settings / filter / actions buttons | All visible in header |
| Undo bar absent | Bar hidden when nothing has been deleted |

**`timeline-filter.spec.ts`** — Filter panel and setup modal

| Test | What it checks |
| --- | --- |
| Toggle button presence | `.header-icon-btn[title="Toggle filter panel"]` visible |
| Toggle opens / closes panel | `.filter-panel` visibility cycles |
| Gear + floppy buttons | Both icon buttons visible in open panel |
| Setup modal opens with title | `.fsetup-modal` with "Filter Setup" heading |
| Setup modal close button | Modal dismissed by X button |
| "Add new rules" blocks | Item Type, Keyword blocks present |
| Empty-state message | Shown when no rules defined |
| Add keyword rule | Rule appears in active-rules list |
| Add type rule | Rule appears in list |
| Delete rule | Rule removed from list |
| Chip appears after rule | `.filter-chip` with correct label shown in panel |
| Chip-remove button | Chip removed; rule deleted |
| Chip state cycling | neutral → positive → negative → neutral |
| Clear active filters | Resets all chips to neutral; button hidden |
| AND/OR toggle | Appears with 2+ positive chips; click changes label |
| Floppy opens preset dropdown | `.preset-dropdown` and `.preset-name-input` visible |
| Save and delete preset | Preset row appears; delete removes it |

**`timeline-actions.spec.ts`** — Actions menu (hidden ranges & shift)

| Test | What it checks |
| --- | --- |
| Trigger button visible | `.actions-trigger` in header area |
| Popover opens on click | `.actions-popover` visible |
| Close button dismisses | X button closes popover |
| Escape key closes | ESC dismisses popover |
| Click-outside closes | Clicking header title closes popover |
| Popover sections present | Hidden Ranges and Shift All Items sections |
| Range form inputs | 2× number + 1× text input + Add button |
| Shift form | `.shift-input` + Shift button |
| Range validation (empty) | Error shown when both inputs empty |
| Range validation (end ≤ start) | Error contains "greater" |
| Error cleared on success | After fixing inputs the error disappears |
| Add range → row appears | `.range-row` with label visible |
| Range shows start/end years | `.range-years` content correct |
| Delete range | Row removed |
| Empty-ranges message | Shown when no ranges defined |
| Shift disabled when empty | Button disabled with no delta |
| Shift enabled with value | Button enabled after filling shift input |
| Shift shows success message | `.shift-ok` with "Shifted" text appears |

**`timeline-notes.spec.ts`** — Notes panel CRUD

| Test | What it checks |
| --- | --- |
| Notes pane visible | `#timeline-data-notes` present |
| Two tabs present | Notes and Distance |
| Notes tab active by default | `.tab-btn.active` is Notes |
| Switch to Distance | Distance tab gets `.active` class |
| Switch back to Notes | Notes tab re-activates |
| Textarea and Add button visible | Both present on Notes tab |
| Add note creates entry | `.note-entry` with typed text appears |
| Textarea cleared after add | Input resets to empty |
| Edit button activates edit mode | `.note-save-btn` appears; text updates |
| Delete note | Entry removed from `.notes-list` |
| Notes list container | `.notes-list` always present |
| Multiple notes | Three notes added simultaneously; each visible |

**`timeline-gallery.spec.ts`** — Gallery panel

| Test | What it checks |
| --- | --- |
| Gallery pane visible | `#timeline-data-images` rendered |
| Gallery toolbar visible | `.gallery-toolbar` present |
| Mode buttons present | At least one `.gallery-mode-btn` |
| Switching modes | All mode buttons clickable; no crash |
| Empty/grid/cascade state | At least one of the three content states present |
| Mode button activatable | First and second buttons accept clicks |
| Next button (cascade) | Clicked if visible; no crash |

**`timeline-settings.spec.ts`** — Timeline settings modal

| Test | What it checks |
| --- | --- |
| Settings button visible | `.header-icon-btn[title="Settings"]` in header |
| Modal opens | `.modal-panel` appears |
| Modal title | "Settings" in header |
| Close button | X dismisses modal |
| Escape key | Closes modal |
| Search bar | `.search-input` visible |
| Scrollable body with sections | `.modal-body` and `.section-title` present |
| Search highlights | Typing "font" highlights matching labels |
| Clearing search removes highlights | No `.search-hl` elements after clear |
| Select elements present | Layout preset dropdown (at least one) |
| Color inputs present | At least one `input[type="color"]` |
| Checkboxes present | At least one `input[type="checkbox"]` |
| Backdrop click closes | `.modal-backdrop` click dismissed |

**`timeline-canvas-interaction.spec.ts`** — Canvas drag, zoom, and minimap

| Test | What it checks |
| --- | --- |
| Drag right pans to earlier years | Mouse drag changes `Current year:` readout |
| Drag left pans to later years | Two opposite drags produce different year values |
| Multi-direction drag no crash | Workspace and header survive rapid drag sequence |
| Scroll down zooms out | `LoD level:` label present after downward scroll |
| Scroll up zooms in | LOD changes after zoom-out + zoom-in sequence |
| Zoom round-trip restores LOD | Same wheel delta up + down → same LOD label |
| Zoom out reduces visible count | `Visible:` count decreases after zooming out far |
| Minimap present | `#timeline-overview` visible |
| Minimap click pans canvas | Click on minimap edge causes year readout to shift |
| Minimap drag scrolls view | Dragging the minimap viewport updates year position |
| Pan then zoom no crash | Combined pan+zoom sequence leaves workspace intact |

**`timeline-items.spec.ts`** — Timeline items and canvas interaction

| Test | What it checks |
| --- | --- |
| Non-zero item count | `Items: N` where N > 0 in info bar |
| Visible count shown | `Visible:` present in info bar |
| Canvas elements exist | At least one `<canvas>` inside `#timeline-main` |
| Undo bar absent | `#undo-delete-bar` not shown initially |
| Canvas item click (best-effort) | If item hit: view modal opens, close works |
| View modal backdrop close | `.view-modal-backdrop` click closes modal |
| View modal content | `.vm-type-badge` and `.vm-title` visible when modal opens |
| Double-click may open edit window | If edit page appears: Cancel/Save buttons verified |

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

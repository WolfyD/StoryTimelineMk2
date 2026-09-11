# 04 — The WinForms Host Layer

StoryTimelineMk2 is a hybrid desktop app: every window is a thin WinForms shell whose
entire client area is a `WebView2` control rendering one of the Vite HTML entry points.
The host layer's job is window chrome (borderless frames, drag, resize, fullscreen),
WebView2 environment plumbing, window-state persistence, and inter-window wiring.

Entry point: `Program.cs:11` — `Main()` initializes WinForms config, runs
`DbInitializer.Initialize()` (`Program.cs:17`), then starts the message loop with
`Application.Run(new Forms.f_Main())` (`Program.cs:19`). When `f_Main` closes, the
process exits (unless `f_Timeline` calls `Application.Exit()` itself, see below).

---

## 1. Window Inventory

| Form | Purpose | HTML entry (Vue root) | WebView2 field | Opened by | Closed by |
|------|---------|----------------------|----------------|-----------|-----------|
| `f_Main` | Project list / launcher. The application's main form — its lifetime is the process lifetime. | `index.html` → `App.vue` (via `src/main.ts`) | `webView21` (`f_Main.Designer.cs:31`) | `Program.cs:19` at startup | User close → app exits. **Hidden**, not closed, while a timeline is open. |
| `f_Timeline` | Timeline canvas viewer/editor for one timeline (`TimelineId` property, `f_Timeline.cs:17`). | `timeline.html?id={TimelineId}` → `TimelineApp.vue` (via `src/timeline.ts`) | `wv_Timeline` | Bridge action `OpenTimeline` → `MessageRouter.HandleOpenTimeline` (`MessageRouter.cs:166`) | Title-bar close (`WindowClose` bridge action) or JS `window.close()`; on `FormClosing` it re-shows `f_Main` (`f_Timeline.cs:121`) |
| `f_AddEditItem` | Add/edit dialog for a single timeline item. Carries `TimelineId`, `ItemId` (null = new), `DefaultTypeId`, `DefaultYear`, `DefaultGranularity` (`f_AddEditItem.cs:15-27`). | `editItem.html?timelineId=…&itemId=…` or `…&typeId=…&year=…&granularity=…` → `EditItem.vue` | `wv_AddEditItem` | Bridge action `OpenAddEditItemWindow` → `MessageRouter.cs:225` (uses `Show()`, **not** `ShowDialog()` — see §4.4) | Vue calls `BackendAPI.WindowClose()` (`EditItem.vue:410`) or `window.close()` → `WindowCloseRequested` (`f_AddEditItem.cs:44`) |
| `f_Calendar` | Custom calendar editor. Carries `CalendarId` (`f_Calendar.cs:15`). | `calendar.html?calendarId=…` → `CalendarApp.vue` | `wv_Calendar` | Bridge action `OpenCalendarEditorWindow` → `MessageRouter.cs:793` | `WindowClose` bridge action or `window.close()` → `WindowCloseRequested` (`f_Calendar.cs:29`) |

Notes:

- All four forms derive from `BorderlessFormBase` and set `FormBorderStyle.None` in
  their constructors (e.g. `f_Main.cs:21`, `f_Timeline.cs:24`, `f_AddEditItem.cs:35`,
  `f_Calendar.cs:20`).
- There is **no WinForms parent/owner relationship** between windows. `f_Timeline` and
  `f_Calendar`/`f_AddEditItem` are free top-level windows opened with `Show()`. The
  only cross-window links are: (a) `MessageRouter` scanning `Application.OpenForms`
  by name to find `f_Main` (`MessageRouter.cs:168-172`, `f_Timeline.cs:126-131`), and
  (b) the `NotifyCallback` delegate handed to `f_AddEditItem` (§5).
- Every form constructs its own `MessageRouter(coreWebView2, this)` after WebView2
  init, so each window has an independent bridge with `_parentForm` pointing at itself.
- `settings.html` / `SettingsApp.vue` exists as a Vite entry but has no dedicated
  WinForms host form — settings UI is reached inside the existing windows.
- Designer differences worth knowing: `f_Main` has `AllowExternalDrop = false`
  (`f_Main.Designer.cs:37`); the other three allow drops. `f_AddEditItem` and
  `f_Calendar` use `StartPosition = CenterScreen` (`f_AddEditItem.Designer.cs:56`,
  `f_Calendar.Designer.cs:36`). All set the WebView2 `DefaultBackgroundColor` to
  `#0f172a` so there is no white flash before the page paints.

---

## 2. BorderlessFormBase Deep-Dive

`Forms/BorderlessFormBase.cs` implements the entire custom window system. Each derived
form sets `FormBorderStyle = None`; the base class then reconstructs the three native
behaviors a borderless window loses — resize, maximize bounds, and caption drag.

### 2.1 Constants that must stay in sync

```
BorderlessFormBase.cs:34   public  const int TitleBarHeight = 36;  // px — must match WindowTitleBar.vue
BorderlessFormBase.cs:35   private const int ResizeBorder   = 5;   // px — must equal Padding.Left/Right/Bottom
BorderlessFormBase.cs:36   private const int CornerRadius   = 8;   // px — top-left/top-right rounding
```

The Vue counterpart hard-codes the same height: `.title-bar { height: 36px; }` with
the comment "must match BorderlessFormBase.TitleBarHeight" (`WindowTitleBar.vue:72`).
If either side changes, hit-testing and the visual cap drift apart. The base-class
`BackColor` `#060c19` (`BorderlessFormBase.cs:51`) is likewise pinned to the title
bar's gradient start color (`WindowTitleBar.vue:81`) so the resize rim is invisible.

### 2.2 Resize via the padding rim + WM_NCHITTEST

WebView2 is `DockStyle.Fill`, and a Chromium child window swallows mouse messages —
the form's `WndProc` would never see the edges. The trick (`BorderlessFormBase.cs:44-52`):

```
Padding = new Padding(5, 0, 5, 5);   // left, TOP=0, right, bottom
```

The 5 px rim on left/right/bottom is form surface, not WebView2, so `WM_NCHITTEST`
(`BorderlessFormBase.cs:129-154`) reaches the form there. The handler converts the
screen coords from `LPARAM`, then returns `HTTOPLEFT` / `HTTOP` / `HTRIGHT` / … for
points inside the 5 px band, and `HTCLIENT` otherwise. Windows then runs its native
resize loop. Top padding is 0 so the web title bar sits flush with the window edge —
top-edge resizing still works because the hit-test math uses `pt.Y < ResizeBorder`
over the client area, which at the top is the 5 px sliver before WebView2 captures
the mouse (in practice the top band overlaps the web title bar's first pixels).

When maximized, `OnSizeChanged` collapses the padding to 0 (`BorderlessFormBase.cs:60-67`)
and the hit-test skips the edge checks entirely (`BorderlessFormBase.cs:135`) — no
resize handles on a maximized window.

### 2.3 WM_GETMINMAXINFO — work-area maximize and the IsFullscreenMode flag

A borderless window that maximizes normally covers the taskbar. The override at
`BorderlessFormBase.cs:118-127` intercepts `WM_GETMINMAXINFO` and clamps
`ptMaxPosition`/`ptMaxSize` to `Screen.FromHandle(Handle).WorkingArea` — maximize
stops at the taskbar.

The clamp is skipped when `IsFullscreenMode` is true (`BorderlessFormBase.cs:38,118`):
in that case default borderless-maximize behavior covers the *entire* screen,
taskbar included. That flag is what turns "maximize" into "fullscreen" — same
`FormWindowState.Maximized`, different bounds. It is set by:

- `MessageRouter.HandleToggleFullscreen` (`MessageRouter.cs:567-568`)
- `MessageRouter.HandleSaveSettings` when `isFullscreen` is in the payload (`MessageRouter.cs:496-497`)
- `f_Timeline.RestoreWindowState` when the persisted setting says fullscreen (`f_Timeline.cs:94-98`)

### 2.4 Rounded top corners via Region

`ApplyRoundedRegion()` (`BorderlessFormBase.cs:69-90`) builds a `GraphicsPath` with
two 8 px arcs at the top corners and square sides/bottom, and assigns it as the
window `Region`. It is reapplied on `OnHandleCreated` and every `OnSizeChanged`.
When maximized the region is cleared (`Region = null`, `BorderlessFormBase.cs:75-79`)
because clipped corners would leave transparent gaps at the screen edges.

### 2.5 Bridge-driven drag: StartWindowDrag

WebView2 also eats mouse input over the title bar, so caption drag is re-implemented
through the bridge:

```
WindowTitleBar.vue:22-25        @mousedown.left on .title-bar__drag
        │  BackendAPI.WindowStartDrag()          (api.ts:302 — fire-and-forget send)
        ▼
MessageRouter.cs:623-631        HandleWindowStartDrag → BeginInvoke on UI thread
        ▼
BorderlessFormBase.cs:96-100    StartWindowDrag():
                                  ReleaseCapture();                      // free WebView2's mouse capture
                                  SendMessage(Handle, WM_NCLBUTTONDOWN,
                                              HTCAPTION, 0);             // native move loop takes over
```

Because the OS runs the modal move loop, dragging has zero lag/jitter — the web side
only fires the initial mousedown. Double-click on the drag region maps to
maximize/restore in Vue (`WindowTitleBar.vue:34` → `WindowMaximizeRestore`).

### 2.6 The Vue WindowTitleBar counterpart

`Frontend/src/components/WindowTitleBar.vue` renders the caption: brand orb, title/
subtitle, and minimize / maximize-restore / close buttons that call the four bridge
chrome actions defined in `api.ts:299-302` and routed at `MessageRouter.cs:80-83`:

| Vue call | Bridge action | Handler | Effect |
|----------|---------------|---------|--------|
| `minimize()` | `WindowMinimize` | `MessageRouter.cs:599` | `WindowState = Minimized` |
| `toggleMaximize()` | `WindowMaximizeRestore` | `MessageRouter.cs:606` | Toggle `Maximized`/`Normal` |
| `close()` | `WindowClose` | `MessageRouter.cs:617` | `_parentForm.Close()` |
| `onDragStart()` | `WindowStartDrag` | `MessageRouter.cs:623` | §2.5 |

All four handlers marshal to the UI thread with `BeginInvoke` since
`WebMessageReceived` may not arrive on it. Caveat: `isMaximized` in the Vue component
is local optimistic state (`WindowTitleBar.vue:13,16`) — it is not synced back from
the form, so it can desync if the window is restored by other means (e.g. F11 exit).

---

## 3. Window Lifecycle

### 3.1 Opening a timeline: f_Main hides, f_Timeline takes over

```
 App.vue (index.html in f_Main)                     WinForms
 ─────────────────────────────                      ────────
 user clicks a project
   │ BackendAPI.send('OpenTimeline', {id})
   ▼
 MessageRouter.HandleOpenTimeline (MessageRouter.cs:166)
   │  scan Application.OpenForms for "f_Main"       (cs:168-172)
   │  new f_Timeline { TimelineId = id }            (cs:174-177)
   │  TimelineForm.Show()                           (cs:179)
   │  if (TimelineForm.Visible) mainForm.Hide()     (cs:180-181)
   ▼
 f_Timeline.F_Timeline_Load (f_Timeline.cs:33)
   │  RestoreWindowState()  ← per-timeline size/pos/fullscreen (cs:77-99)
   │  WebView2 env "timeline" + EnsureCoreWebView2Async
   │  map https://media.app → media folder          (cs:41-46)
   │  new MessageRouter(core, this)
   │  WindowCloseRequested → Invoke(Close)          (cs:51)
   │  Navigate(timeline.html?id={TimelineId})       (cs:56-66)
   ▼
 NavigationCompleted (once) → apply persisted CSS zoom if
   UseCustomScaling (cs:69-75)
```

`f_Main` stays alive but hidden — it still owns the application message loop.

### 3.2 Closing the timeline: f_Main returns

`f_Timeline.F_Timeline_FormClosing` (`f_Timeline.cs:121-142`):

```
 Close (title-bar X → WindowClose bridge → Form.Close(),
        or JS window.close() → WindowCloseRequested → Invoke(Close))
   │
   ▼ FormClosing
   ├─ stop move-timer, PersistWindowState()          (cs:123-124)
   ├─ find "f_Main" in Application.OpenForms         (cs:126-131)
   ├─ found:  mainForm._messageRouter.SendToVue("InitReload")  // refresh project list
   │          mainForm.Show()                        (cs:135-137)
   └─ not found: Application.Exit()                  (cs:140)
```

`WindowCloseRequested` wiring per form: `f_Timeline.cs:51` and `f_Calendar.cs:29`
use `Invoke((MethodInvoker)Close)` (the event can fire off the UI thread);
`f_AddEditItem.cs:44` calls `Close()` directly. This hook exists so JavaScript
`window.close()` closes the WinForms host — needed for E2E test cleanup
(comment at `f_Timeline.cs:50`).

### 3.3 Fullscreen toggle (F11) end-to-end

```
 TimelineApp.vue:145-148   keydown F11 → preventDefault
   │ BackendAPI.send('ToggleFullscreen', { timelineId })
   ▼
 MessageRouter.HandleToggleFullscreen (MessageRouter.cs:554-581)
   │  settings = SettingsRepo.GetOrCreateSettings(timelineId)
   │  settings.IsFullscreen = !settings.IsFullscreen   ← persisted immediately
   │  BeginInvoke on the form:
   │     bf.IsFullscreenMode = goFullscreen            ← flips WM_GETMINMAXINFO clamp
   │     entering:  if already Maximized → set Normal first,   // forces a fresh
   │                then WindowState = Maximized               // WM_GETMINMAXINFO
   │     leaving:   WindowState = Normal
   ▼
 BorderlessFormBase.WndProc
   fullscreen: clamp skipped → covers whole screen incl. taskbar
   maximize:   clamp applied → covers WorkingArea only
```

The Normal→Maximized bounce when entering (`MessageRouter.cs:572-574`) matters:
Windows only sends `WM_GETMINMAXINFO` on the transition, so a window that is already
work-area-maximized must restore first for the unclamped (full-screen) bounds to take
effect. The same pattern appears in `HandleSaveSettings` (`MessageRouter.cs:499-509`).
On next launch, `f_Timeline.RestoreWindowState` re-enters fullscreen from the
persisted flag (`f_Timeline.cs:94-98`). F10 similarly toggles custom CSS scaling
(`TimelineApp.vue:149-152` → `MessageRouter.cs:583`).

### 3.4 Window-state persistence

`f_Main` and `f_Timeline` persist position/size (app-wide vs per-timeline):

- Restore on load with off-screen clamping (`f_Main.cs:49-66`, `f_Timeline.cs:77-99`).
- Save on `ResizeEnd`, and on `LocationChanged` debounced by a 500 ms
  `System.Windows.Forms.Timer` (`f_Main.cs:16,70-80`; `f_Timeline.cs:19,103-113`) —
  `LocationChanged` fires continuously during a drag, so the timer restarts until the
  window settles.
- Saves are skipped unless `WindowState == Normal` (`f_Main.cs:84`, `f_Timeline.cs:117`)
  so a maximized/fullscreen session doesn't clobber the remembered normal bounds.

`f_AddEditItem` and `f_Calendar` do not persist state; they open centered
(`StartPosition.CenterScreen`).

---

## 4. WebView2 Setup

### 4.1 Environment creation — WebView2EnvironmentFactory

All forms obtain their environment via
`WebView2EnvironmentFactory.GetAsync(subfolder)` (`WebView2EnvironmentFactory.cs:25`):

- **Normal mode** (`STORYTIMELINE_REMOTE_DEBUG_PORT` unset): each window gets its own
  isolated browser process with a private cache folder
  `%LOCALAPPDATA%\StoryTimelineMk2_Cache\{main|timeline|edit|calendar}`
  (`WebView2EnvironmentFactory.cs:29-37`).
- **Test mode** (env var set): a single shared environment is created once behind a
  `SemaphoreSlim`, with `--remote-debugging-port={port}` and cache folder
  `…\StoryTimelineMk2_Cache\test-shared` (`WebView2EnvironmentFactory.cs:42-62`).
  One browser process means Playwright's single CDP connection sees every window's page.

### 4.2 EnsureCoreWebView2Async pattern

Every form follows the same async `Load` handler sequence — nothing may touch
`CoreWebView2` before the await completes:

```
1. var env = await WebView2EnvironmentFactory.GetAsync("...");
2. await webViewControl.EnsureCoreWebView2Async(env);
3. (timeline/edit) SetVirtualHostNameToFolderMapping("media.app", mediaFolder, Allow)
     — folder is Directory.CreateDirectory'd first because the mapping call throws
       if it doesn't exist (f_Timeline.cs:41-46, f_AddEditItem.cs:46-53)
4. _messageRouter = new MessageRouter(core, this);
5. hook WindowCloseRequested / NavigationCompleted as needed
6. Navigate(url)
```

Only `f_Main` wraps this in try/catch with a `MessageBox` on failure (`f_Main.cs:33-46`).

### 4.3 Dev vs prod URL selection

- `f_Main`: compile-time. `#if DEBUG` navigates `http://localhost:5173` with DevTools
  enabled; `#else` loads `{StartupPath}\Frontend\dist\index.html` with DevTools and
  context menus disabled, warning if the build is missing (`f_Main.cs:88-108`).
- `f_Timeline` / `f_AddEditItem` / `f_Calendar`: runtime file check. If
  `{StartupPath}\Frontend\dist\{page}.html` exists it is loaded, otherwise the
  matching `http://localhost:5173/{page}.html` dev URL — query string appended in
  both branches (`f_Timeline.cs:56-66`, `f_AddEditItem.cs:71-75`, `f_Calendar.cs:35-39`).
  Note the asymmetry: in a Debug build that has a stale `dist/` output next to the
  exe, the secondary windows will prefer the stale files while `f_Main` uses the dev
  server.

Context is passed to the SPA exclusively via query parameters (`?id=`, `?timelineId=`,
`?itemId=`, `?typeId=`, `?year=` (round-trip "R" format, invariant culture —
`f_AddEditItem.cs:66`), `?granularity=`, `?calendarId=`).

### 4.4 The ShowDialog / E_ABORT pitfall

From `MessageRouter.cs:259-262` (`HandleOpenAddEditItemWindow`):

```csharp
// Use Show() instead of ShowDialog(): calling ShowDialog from inside a
// WebView2 WebMessageReceived handler creates a nested COM message loop
// that causes EnsureCoreWebView2Async in the new window to E_ABORT.
addEditItemWindow.Show();
```

Bridge handlers run inside `CoreWebView2.WebMessageReceived`. Opening a modal dialog
there nests a message loop while WebView2's COM reentrancy state is live, and the
*new* window's `EnsureCoreWebView2Async` fails with `E_ABORT`. Rule for this codebase:
**never call `ShowDialog()` on a WebView2-hosting form from a bridge handler** — use
`Show()` + `Activate()` (also done for `f_Calendar`, `MessageRouter.cs:799-801`).
Plain native dialogs (`OpenFileDialog` etc., e.g. `MessageRouter.cs:705`) are fine.
Modality is therefore faked: edit windows are modeless, and consistency is handled by
push updates (§5) instead of blocking the caller.

---

## 5. The NotifyCallback Mechanism

Problem: an item saved in `f_AddEditItem` must appear on the timeline canvas in
`f_Timeline` (a different window, different browser process) without reloading the
whole timeline. The two WebView2s cannot talk to each other directly, so the hosts
bridge it with a plain delegate:

```
 f_Timeline's WebView2 (TimelineApp.vue)
   │  'OpenAddEditItemWindow' bridge msg
   ▼
 f_Timeline's MessageRouter (router A)
   │  creates f_AddEditItem and injects:
   │  addEditItemWindow.NotifyCallback =
   │        (action, payload) => SendToVue(action, payload);   // closes over router A
   │                                                (MessageRouter.cs:257)
   ▼
 f_AddEditItem (EditItem.vue) … user edits, clicks Save
   │  'SaveItem' bridge msg → f_AddEditItem's MessageRouter (router B)
   ▼
 HandleSaveItem (MessageRouter.cs:328)
   │  ItemRepo.SaveItemFull(...)
   │  ReplyToVue(ok, itemId)                          → back to EditItem.vue
   │  if (_parentForm is f_AddEditItem addEdit
   │      && addEdit.NotifyCallback != null)          (MessageRouter.cs:343-347)
   │        savedItem = itemRepo.GetItemById(savedId)   // re-read: full computed row
   │        addEdit.NotifyCallback("ItemSaved", { Item = savedItem })
   ▼
 router A.SendToVue("ItemSaved", …)  →  f_Timeline's WebView2
   → TimelineApp handles the push and updates the canvas in place
```

Key points:

- `NotifyCallback` is `Action<string, object>` on the form (`f_AddEditItem.cs:30`),
  hidden from the designer. It is the *opener's* router captured in a closure — the
  save handler running in router B ends up posting into window A's WebView2.
- Router B reaches the callback through its `_parentForm` (`MessageRouter.cs:343`):
  the same `Form` reference passed at construction doubles as the channel back out.
- The saved item is re-fetched from the DB before pushing (`MessageRouter.cs:345`)
  so the timeline receives the canonical row (computed `AbsoluteStart`/`AbsoluteEnd`
  etc.), not the raw payload the editor sent.
- The callback is null-safe: when the edit page is opened by something without a
  callback (or hosted standalone in dev), saving simply skips the push.
- The `ItemSaved` push is one-way and unsolicited (no `MessageId` correlation) —
  it uses the same `SendToVue` channel as `InitReload` (§3.2).

using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using System.ComponentModel;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Timeline : BorderlessFormBase
    {
        private MessageRouter? _messageRouter;
        private Database.SettingsItem _savedSettings = null!;
        private bool _preNavComplete = false;
        private bool _didPreNavigate = false;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        /// <summary>BL-66: a reference window — same page, opened next to the active timeline; the
        /// frontend hides every edit affordance and the host never writes this timeline's window state.</summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool ReadOnly { get; set; }

        /// <summary>BL-15 phase 3: an appearances window — the same read-only page narrowed to one
        /// character's items. Null for every other window, including a prewarmed one reused here.</summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? CharacterId { get; set; }

        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        public f_Timeline()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;

            Load += F_Timeline_Load;
            FormClosing += F_Timeline_FormClosing;
            ResizeEnd += F_Timeline_ResizeEnd;
            LocationChanged += F_Timeline_LocationChanged;
            _moveTimer.Tick += MoveTimer_Tick;
        }

        // ── Pre-warm: initialise WebView2 before the user requests the window ──
        private static f_Timeline? _prewarmed;
        private static bool _isPrewarming;

        internal static void BeginPrewarm()
        {
            if (_prewarmed != null || _isPrewarming) return;
            _isPrewarming = true;
            Logger.Info("f_Timeline.Prewarm", "BeginPrewarm called");
            _ = DoPrewarmAsync();
        }

        private static async Task DoPrewarmAsync()
        {
            try
            {
                var form = new f_Timeline();
                _ = form.Handle; // force HWND without Show()
                Logger.Info("f_Timeline.Prewarm", "EnsureCoreWebView2Async starting");
                var env = await WebView2EnvironmentFactory.GetAsync("timeline");
                await form.wv_Timeline.EnsureCoreWebView2Async(env);
                form.wv_Timeline.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
                Logger.Info("f_Timeline.Prewarm", "EnsureCoreWebView2Async complete");

                // Pre-navigate so Vue bootstraps in the background (release builds only)
                string distPath = System.IO.Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (System.IO.Directory.Exists(distPath))
                {
                    var coreWV = form.wv_Timeline.CoreWebView2!;
                    string mediaFolder = AppConfig.Instance.GetMediaFolder();
                    System.IO.Directory.CreateDirectory(mediaFolder);
                    coreWV.SetVirtualHostNameToFolderMapping("media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.SetVirtualHostNameToFolderMapping("app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    // Router must exist before Navigate: Vue fires WindowGetMaximized/GetAppConfig on mount
                    form._messageRouter = new MessageRouter(coreWV, form);
                    coreWV.NavigationCompleted += (_, _) =>
                    {
                        form._preNavComplete = true;
                        Logger.Info("f_Timeline.Prewarm", "Pre-navigation complete");
                    };
                    coreWV.Navigate("https://app.local/timeline.html");
                    form._didPreNavigate = true;
                    Logger.Info("f_Timeline.Prewarm", "Pre-navigation started");
                }

                _prewarmed = form;
                Logger.Info("f_Timeline.Prewarm", "Pre-warm ready");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Timeline.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        internal static f_Timeline? TakePrewarmed()
        {
            var form = _prewarmed;
            _prewarmed = null;
            if (form is { IsDisposed: true })
            {
                Logger.Info("f_Timeline.TakePrewarmed", "pre-warmed form was disposed — creating fresh");
                return null;
            }
            Logger.Info("f_Timeline.TakePrewarmed", form != null ? "using pre-warmed instance" : "no pre-warm ready — creating fresh");
            return form;
        }

        private async void F_Timeline_Load(object? sender, EventArgs e)
        {
            // async void: an unhandled exception here crashes the app — and the main
            // window is already hidden by HandleOpenTimeline, so the user would be
            // stranded with no visible window. Catch, log, show, close (which re-shows main).
            try
            {
                RestoreWindowState();

                bool wasPrewarmed = wv_Timeline.CoreWebView2 != null;

                if (!wasPrewarmed)
                {
                    Logger.Info("f_Timeline.Load", "WebView2 not pre-warmed — calling EnsureCoreWebView2Async");
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("timeline");
                    await wv_Timeline.EnsureCoreWebView2Async(webEnvironment);
                    Logger.Info("f_Timeline.Load", "EnsureCoreWebView2Async complete");
                }
                else
                {
                    Logger.Info("f_Timeline.Load", "WebView2 already initialized (pre-warmed)");
                }
                var coreWV = wv_Timeline.CoreWebView2!;
                wv_Timeline.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping("media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter ??= new MessageRouter(coreWV, this);
                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);
                if (!ReadOnly) _ = FireUpdateCheckAsync();

                // Native browser zoom (what Ctrl+wheel drives). CSS zoom on <html> scaled the page
                // but not the viewport, so the bottom of the window was cut off.
                if (_savedSettings is { UseCustomScaling: true, CustomScale: > 0 })
                    wv_Timeline.ZoomFactor = _savedSettings.CustomScale;
                wv_Timeline.ZoomFactorChanged += OnZoomFactorChanged;

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");

                if (wasPrewarmed && _didPreNavigate)
                {
                    // Vue is already bootstrapping in the background.
                    // Send the real timeline ID — Vue is listening for this push.
                    string idMsg = JsonSerializer.Serialize(new { action = "SetTimelineId", payload = new { id = TimelineId, readOnly = ReadOnly, characterId = CharacterId } });

                    void SendId()
                    {
                        Logger.Info("f_Timeline.Load", $"Sending SetTimelineId={TimelineId} to pre-warmed page");
                        coreWV.PostWebMessageAsString(idMsg);
                    }

                    if (_preNavComplete)
                    {
                        Logger.Info("f_Timeline.Load", "Pre-navigation already complete — sending immediately");
                        SendId();
                    }
                    else
                    {
                        Logger.Info("f_Timeline.Load", "Pre-navigation still in progress — queuing SetTimelineId for NavigationCompleted");
                        coreWV.NavigationCompleted += (_, navArgs) =>
                        {
                            Logger.Info("f_Timeline.Load", $"NavigationCompleted (pre-warm path, success={navArgs.IsSuccess})");
                            SendId();
                        };
                    }
                }
                else
                {
                    // Cold start (or dev mode) — navigate with ?id= in the URL
                    coreWV.NavigationCompleted += OnNavigationCompleted;

                    Logger.Info("f_Timeline.Load", "Navigate starting");
                    string query = $"?id={TimelineId}" + (ReadOnly ? "&readOnly=1" : "")
                                 + (string.IsNullOrEmpty(CharacterId) ? "" : $"&characterId={CharacterId}");
                    if (Directory.Exists(distPath))
                    {
                        coreWV.SetVirtualHostNameToFolderMapping("app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                        coreWV.Navigate($"https://app.local/timeline.html{query}");
                    }
                    else
                    {
                        coreWV.Navigate($"http://localhost:5173/timeline.html{query}");
                    }
                }

                // Stagger child pre-warms so Chromium starts are spread over ~600 ms
                _ = PrewarmChildWindowsAsync();
            }
            catch (Exception ex)
            {
                Logger.Error("f_Timeline.Load", ex);
                MessageBox.Show($"Failed to open the timeline window:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }

        private static async Task PrewarmChildWindowsAsync()
        {
            await Task.Delay(400); // let timeline page start rendering first
            f_AddEditItem.BeginPrewarm();
            await Task.Delay(200);
            f_YearCalendar.BeginPrewarm();
            await Task.Delay(200);
            f_Calendar.BeginPrewarm();
            await Task.Delay(200);
            f_Characters.BeginPrewarm();
            await Task.Delay(400); // start next timeline pre-warm last so it's ready before the user closes
            BeginPrewarm();
        }

        private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            // Fire only once (the initial page load)
            wv_Timeline.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
            Logger.Info("f_Timeline.Load", $"NavigationCompleted (success={e.IsSuccess})");
        }

        internal void SetZoom(double zoom) => wv_Timeline.ZoomFactor = zoom;

        private void OnZoomFactorChanged(object? sender, EventArgs e)
        {
            // Ctrl+wheel, F10 and the settings field all land here — remember the zoom per timeline.
            // 100% only clears the flag; the last real scale stays so F10 can bring it back.
            if (TimelineId == 0) return;
            double zoom = Math.Round(wv_Timeline.ZoomFactor, 2);
            var repo = new SettingsRepo();
            var s = repo.GetOrCreateSettings(TimelineId);
            s.UseCustomScaling = zoom != 1.0;
            if (zoom != 1.0) s.CustomScale = (float)zoom;
            repo.SaveSettings(s);
            // Keep the page's copy in step, or the next settings Save would put the old zoom back.
            wv_Timeline.CoreWebView2?.PostWebMessageAsString(JsonSerializer.Serialize(new
            {
                action = "ZoomChanged",
                payload = new { useCustomScaling = s.UseCustomScaling, customScale = s.CustomScale }
            }));
        }

        private void RestoreWindowState()
        {
            var repo = new SettingsRepo();
            _savedSettings = repo.GetOrCreateSettings(TimelineId);

            if (_savedSettings.WindowSizeX > 0 && _savedSettings.WindowSizeY > 0)
            {
                var screen = Screen.FromPoint(new Point(_savedSettings.WindowPositionX, _savedSettings.WindowPositionY));
                var target = new Point(_savedSettings.WindowPositionX, _savedSettings.WindowPositionY);

                target.X = Math.Max(screen.WorkingArea.Left, Math.Min(target.X, screen.WorkingArea.Right - 100));
                target.Y = Math.Max(screen.WorkingArea.Top, Math.Min(target.Y, screen.WorkingArea.Bottom - 100));

                this.Size = new Size(_savedSettings.WindowSizeX, _savedSettings.WindowSizeY);
                this.Location = target;
            }

            if (_savedSettings.IsFullscreen)
            {
                IsFullscreenMode = true;
                this.WindowState = FormWindowState.Maximized;
            }
        }

        private void F_Timeline_ResizeEnd(object? sender, EventArgs e) => PersistWindowState();

        private void F_Timeline_LocationChanged(object? sender, EventArgs e)
        {
            _moveTimer.Stop();
            _moveTimer.Start();
        }

        private void MoveTimer_Tick(object? sender, EventArgs e)
        {
            _moveTimer.Stop();
            PersistWindowState();
        }

        private void PersistWindowState()
        {
            if (ReadOnly || this.WindowState != FormWindowState.Normal || IsManuallyMaximized) return;
            new SettingsRepo().SaveWindowState(TimelineId, this.Left, this.Top, this.Width, this.Height);
        }

        private void F_Timeline_FormClosing(object? sender, FormClosingEventArgs e)
        {
            _moveTimer.Stop();
            PersistWindowState();

            // Close all connected child windows (year calendar, calendar editor, edit item).
            // A reference window (BL-66) has none of its own — the active timeline's stay open.
            if (!ReadOnly) MessageRouter.NotifyTimelineClosing();

            // Another timeline window is still up (a reference, or the active one when a reference
            // closes): just close — main comes back when the last one goes.
            foreach (Form f in Application.OpenForms)
                if (f is f_Timeline other && other != this && other.Visible) return;

            f_Main? mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main")
                    mainForm = f as f_Main;
            }

            // _messageRouter is null if main's WebView2 init failed; SendToVue is false when its
            // WebView2 has since died (browser process gone). Either way there is no main page to
            // go back to — showing it would just be a black window — so end the app instead.
            if (mainForm != null && mainForm._messageRouter?.SendToVue("InitReload") == true)
            {
                mainForm.Show();
                // Pre-warm a fresh timeline instance for the next session
                BeginPrewarm();
            }
            else
            {
                Application.Exit();
            }
        }

        private async Task FireUpdateCheckAsync()
        {
            try
            {
                // Small delay so WebView2 navigation finishes before we push a banner
                await Task.Delay(3000);
                var info = await UpdateChecker.CheckAsync();
                if (info == null) return;

                BeginInvoke((MethodInvoker)(() =>
                    _messageRouter?.SendToVue("UpdateAvailable", new
                    {
                        version = info.Version,
                        url     = info.Url,
                    })));
            }
            catch (Exception ex)
            {
                Logger.Warn("f_Timeline/UpdateCheck", ex.Message);
            }
        }
    }
}

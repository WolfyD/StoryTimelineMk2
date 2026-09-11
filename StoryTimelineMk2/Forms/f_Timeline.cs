using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Timeline : BorderlessFormBase
    {
        private MessageRouter _messageRouter;
        private Database.SettingsItem _savedSettings;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

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

        private async void F_Timeline_Load(object? sender, EventArgs e)
        {
            // async void: an unhandled exception here crashes the app — and the main
            // window is already hidden by HandleOpenTimeline, so the user would be
            // stranded with no visible window. Catch, log, show, close (which re-shows main).
            try
            {
                RestoreWindowState();

                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("timeline");

                await wv_Timeline.EnsureCoreWebView2Async(webEnvironment);

                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                wv_Timeline.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "media.app",
                    mediaFolder,
                    CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter = new MessageRouter(wv_Timeline.CoreWebView2, this);

                // Let JavaScript window.close() close the WinForms host (needed for E2E test cleanup)
                wv_Timeline.CoreWebView2.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                // Apply CSS zoom once the page finishes loading
                wv_Timeline.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

                string prodPath = Path.Combine(Application.StartupPath, "Frontend", "dist", "timeline.html");
                string query = $"?id={TimelineId}";

                if (File.Exists(prodPath))
                {
                    wv_Timeline.CoreWebView2.Navigate(prodPath + query);
                }
                else
                {
                    wv_Timeline.CoreWebView2.Navigate($"http://localhost:5173/timeline.html{query}");
                }
            }
            catch (Exception ex)
            {
                Logger.Error("f_Timeline.Load", ex);
                MessageBox.Show($"Failed to open the timeline window:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            // Fire only once (the initial page load)
            wv_Timeline.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
            if (_savedSettings != null && _savedSettings.UseCustomScaling && _savedSettings.CustomScale > 0)
                _ = wv_Timeline.CoreWebView2.ExecuteScriptAsync($"document.documentElement.style.zoom = '{_savedSettings.CustomScale:F2}'");
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
            if (this.WindowState != FormWindowState.Normal) return;
            new SettingsRepo().SaveWindowState(TimelineId, this.Left, this.Top, this.Width, this.Height);
        }

        private void F_Timeline_FormClosing(object? sender, FormClosingEventArgs e)
        {
            _moveTimer.Stop();
            PersistWindowState();

            f_Main mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main")
                    mainForm = f as f_Main;
            }

            if (mainForm != null)
            {
                // _messageRouter is null if main's WebView2 init failed — an NRE here
                // would be an unhandled exception inside FormClosing.
                mainForm._messageRouter?.SendToVue("InitReload");
                mainForm.Show();
            }
            else
            {
                Application.Exit();
            }
        }
    }
}

using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.Drawing;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Main : BorderlessFormBase
    {
        public MessageRouter _messageRouter = null!;
        private const string ViteDevServerUrl = "http://localhost:5173";

        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        internal event Action? ReadyToShow;

        public f_Main()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;

            FormClosed += (_, _) => StatsService.CloseSession();
            ResizeEnd += F_Main_ResizeEnd;
            LocationChanged += F_Main_LocationChanged;
            _moveTimer.Tick += MoveTimer_Tick;
        }

        /// <summary>
        /// Initialises WebView2 and navigates while the form is still hidden.
        /// Fires <see cref="ReadyToShow"/> when the first navigation completes so the
        /// caller can close the splash and show this window.
        /// Must be called after the WinForms SynchronizationContext is installed
        /// (i.e. via BeginInvoke, not directly from a constructor).
        /// </summary>
        internal async void StartLoading()
        {
            // Force HWNDs to exist — required by EnsureCoreWebView2Async and
            // by RestoreWindowState (MaximizeToWindowScreen uses Handle).
            _ = Handle;
            _ = webView21.Handle;

            RestoreWindowState();

            try
            {
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("main");
                await webView21.EnsureCoreWebView2Async(webEnvironment);
                webView21.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                _messageRouter = new MessageRouter(webView21.CoreWebView2, this);
                StatsService.OpenSession();

                webView21.CoreWebView2.NavigationCompleted += OnInitialNavigationCompleted;
                LoadFrontend();

                _ = PrewarmTimelineAsync();
            }
            catch (Exception ex)
            {
                Logger.Error("f_Main.StartLoading", ex);
                MessageBox.Show($"WebView2 failed to initialize: {ex.Message}");
                ReadyToShow?.Invoke(); // close splash even on failure so the user isn't stuck
            }
        }

        private void OnInitialNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            webView21.CoreWebView2.NavigationCompleted -= OnInitialNavigationCompleted;
            // Defer via BeginInvoke so Show() runs after this event handler returns.
            BeginInvoke(() => ReadyToShow?.Invoke());
        }

        private void RestoreWindowState()
        {
            var repo = new SettingsRepo();
            var saved = repo.GetOrCreateAppSettings();

            if (saved.WindowSizeX > 0 && saved.WindowSizeY > 0)
            {
                var screen = Screen.FromPoint(new Point(saved.WindowPositionX, saved.WindowPositionY));
                var target = new Point(saved.WindowPositionX, saved.WindowPositionY);

                target.X = Math.Max(screen.WorkingArea.Left, Math.Min(target.X, screen.WorkingArea.Right - 100));
                target.Y = Math.Max(screen.WorkingArea.Top, Math.Min(target.Y, screen.WorkingArea.Bottom - 100));

                this.Size = new Size(saved.WindowSizeX, saved.WindowSizeY);
                this.Location = target;
            }

            if (saved.WindowMaximized)
                MaximizeToWindowScreen();
        }

        private void F_Main_ResizeEnd(object? sender, EventArgs e) => PersistWindowState();

        private void F_Main_LocationChanged(object? sender, EventArgs e)
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
            bool maximized = IsManuallyMaximized || this.WindowState == FormWindowState.Maximized;
            var b = GetRestoreBounds();
            new SettingsRepo().SaveAppWindowState(b.Left, b.Top, b.Width, b.Height, maximized);
        }

        private static async Task PrewarmTimelineAsync()
        {
            await Task.Delay(600); // let the main window fully render first
            Forms.f_Timeline.BeginPrewarm();
        }

        private void LoadFrontend()
        {
#if DEBUG
            webView21.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView21.CoreWebView2.Navigate(ViteDevServerUrl);
#else
            webView21.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView21.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");

            if (Directory.Exists(distPath))
            {
                webView21.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                webView21.CoreWebView2.Navigate("https://app.local/index.html");
            }
            else
            {
                MessageBox.Show("Production UI files are missing. Make sure you ran 'npm run build' in the Frontend directory.", "Missing Assets", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
#endif
        }
    }
}

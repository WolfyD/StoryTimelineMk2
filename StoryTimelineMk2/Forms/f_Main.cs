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
        public MessageRouter _messageRouter;
        private const string ViteDevServerUrl = "http://localhost:5173";


        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        public f_Main()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;

            Load += F_Main_Load;
            ResizeEnd += F_Main_ResizeEnd;
            LocationChanged += F_Main_LocationChanged;
            _moveTimer.Tick += MoveTimer_Tick;
        }

        private async void F_Main_Load(object? sender, EventArgs e)
        {
            RestoreWindowState();

            try
            {
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("main");

                await webView21.EnsureCoreWebView2Async(webEnvironment);

                _messageRouter = new MessageRouter(webView21.CoreWebView2, this);

                LoadFrontend();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"WebView2 failed to initialize: {ex.Message}");
            }
        }

        private void RestoreWindowState()
        {
            var repo = new SettingsRepo();
            var saved = repo.GetOrCreateAppSettings();

            if (saved.WindowSizeX > 0 && saved.WindowSizeY > 0)
            {
                var screen = Screen.FromPoint(new Point(saved.WindowPositionX, saved.WindowPositionY));
                var target = new Point(saved.WindowPositionX, saved.WindowPositionY);

                // Clamp so the window is never fully off-screen.
                target.X = Math.Max(screen.WorkingArea.Left, Math.Min(target.X, screen.WorkingArea.Right - 100));
                target.Y = Math.Max(screen.WorkingArea.Top, Math.Min(target.Y, screen.WorkingArea.Bottom - 100));

                this.Size = new Size(saved.WindowSizeX, saved.WindowSizeY);
                this.Location = target;
            }

            if (saved.WindowMaximized)
                this.WindowState = FormWindowState.Maximized;
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
            bool maximized = this.WindowState == FormWindowState.Maximized;
            // When maximized, save the restore-bounds so position/size survive the session.
            var b = maximized ? this.RestoreBounds : this.Bounds;
            new SettingsRepo().SaveAppWindowState(b.Left, b.Top, b.Width, b.Height, maximized);
        }

        private void LoadFrontend()
        {
#if DEBUG
            webView21.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView21.CoreWebView2.Navigate(ViteDevServerUrl);
#else
            webView21.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView21.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            string prodFilePath = Path.Combine(Application.StartupPath, "Frontend", "dist", "index.html");

            if (File.Exists(prodFilePath))
            {
                webView21.CoreWebView2.Navigate(prodFilePath);
            }
            else
            {
                MessageBox.Show("Production UI files are missing. Make sure you ran 'npm run build' in the Frontend directory.", "Missing Assets", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
#endif
        }
    }
}

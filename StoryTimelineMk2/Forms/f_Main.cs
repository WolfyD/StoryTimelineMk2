using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.Drawing;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Main : Form
    {
        public MessageRouter _messageRouter;
        private const string ViteDevServerUrl = "http://localhost:5173";


        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        public f_Main()
        {
            InitializeComponent();

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
                string cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Cache", "main");
                var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);

                await webView21.EnsureCoreWebView2Async(webEnvironment);

                _messageRouter = new MessageRouter(webView21.CoreWebView2);

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
            if (this.WindowState != FormWindowState.Normal) return;
            new SettingsRepo().SaveAppWindowState(this.Left, this.Top, this.Width, this.Height);
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

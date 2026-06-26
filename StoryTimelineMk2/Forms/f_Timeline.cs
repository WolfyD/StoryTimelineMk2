using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Timeline : Form
    {
        private MessageRouter _messageRouter;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        public f_Timeline()
        {
            InitializeComponent();

            Load += F_Timeline_Load;
            FormClosing += F_Timeline_FormClosing;
            ResizeEnd += F_Timeline_ResizeEnd;
            LocationChanged += F_Timeline_LocationChanged;
            _moveTimer.Tick += MoveTimer_Tick;
        }

        private async void F_Timeline_Load(object? sender, EventArgs e)
        {
            RestoreWindowState();

            string cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Cache", "timeline");
            var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);

            await wv_Timeline.EnsureCoreWebView2Async(webEnvironment);

            _messageRouter = new MessageRouter(wv_Timeline.CoreWebView2);

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

        private void RestoreWindowState()
        {
            var repo = new SettingsRepo();
            var saved = repo.GetOrCreateSettings(TimelineId);

            if (saved.WindowSizeX > 0 && saved.WindowSizeY > 0)
            {
                var screen = Screen.FromPoint(new Point(saved.WindowPositionX, saved.WindowPositionY));
                var target = new Point(saved.WindowPositionX, saved.WindowPositionY);

                target.X = Math.Max(screen.WorkingArea.Left, Math.Min(target.X, screen.WorkingArea.Right - 100));
                target.Y = Math.Max(screen.WorkingArea.Top, Math.Min(target.Y, screen.WorkingArea.Bottom - 100));

                this.Size = new Size(saved.WindowSizeX, saved.WindowSizeY);
                this.Location = target;
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
                mainForm._messageRouter.SendToVue("InitReload");
                mainForm.Show();
            }
            else
            {
                Application.Exit();
            }
        }
    }
}

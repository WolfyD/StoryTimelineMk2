using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Database;
using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_YearCalendar : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;
        private readonly System.Windows.Forms.Timer _moveTimer = new() { Interval = 500 };

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? CalendarId { get; set; }

        public f_YearCalendar()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_YearCalendar_Load;
            FormClosed += F_YearCalendar_FormClosed;
            LocationChanged += (_, _) => { _moveTimer.Stop(); _moveTimer.Start(); };
            ResizeEnd += (_, _) => PersistWindowState();
            _moveTimer.Tick += (_, _) => { _moveTimer.Stop(); PersistWindowState(); };
        }

        private async void F_YearCalendar_Load(object? sender, EventArgs e)
        {
            try
            {
                RestoreWindowState();

                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("yearCalendar");
                await wv_YearCalendar.EnsureCoreWebView2Async(webEnvironment);

                wv_YearCalendar.CoreWebView2.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                _messageRouter = new MessageRouter(wv_YearCalendar.CoreWebView2, this);

                var query = $"?timelineId={TimelineId}";
                if (!string.IsNullOrEmpty(CalendarId))
                    query += $"&calendarId={Uri.EscapeDataString(CalendarId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    wv_YearCalendar.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    wv_YearCalendar.CoreWebView2.Navigate($"https://app.local/yearCalendar.html{query}");
                }
                else
                    wv_YearCalendar.CoreWebView2.Navigate($"http://localhost:5173/yearCalendar.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_YearCalendar.Load", ex);
                MessageBox.Show($"Failed to open the year calendar window:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        public void SendYearUpdate(int year)
        {
            if (_messageRouter == null) return;
            try
            {
                _messageRouter.SendToVue("SetCalendarYear", new { year });
            }
            catch (Exception ex)
            {
                Logger.Error("f_YearCalendar.SendYearUpdate", ex);
            }
        }

        private void RestoreWindowState()
        {
            var settings = new SettingsRepo().GetOrCreateSettings(TimelineId);
            int x = settings.YearCalendarPositionX;
            int y = settings.YearCalendarPositionY;
            int w = settings.YearCalendarSizeX;
            int h = settings.YearCalendarSizeY;

            if (w > 0 && h > 0)
            {
                this.Size = new Size(w, h);
                var screen = Screen.FromPoint(new Point(x, y));
                var pt = new Point(
                    Math.Max(screen.WorkingArea.Left, Math.Min(x, screen.WorkingArea.Right  - 100)),
                    Math.Max(screen.WorkingArea.Top,  Math.Min(y, screen.WorkingArea.Bottom - 100)));
                this.Location = pt;
            }
            else
            {
                // Default: right of the screen, near the top
                var screen = Screen.PrimaryScreen ?? Screen.AllScreens[0];
                this.Size = new Size(720, 640);
                this.Location = new Point(
                    screen.WorkingArea.Right - 740,
                    screen.WorkingArea.Top + 60);
            }
        }

        private void PersistWindowState()
        {
            if (this.WindowState != FormWindowState.Normal) return;
            new SettingsRepo().SaveYearCalendarWindowState(TimelineId, this.Left, this.Top, this.Width, this.Height);
        }

        private void F_YearCalendar_FormClosed(object? sender, FormClosedEventArgs e)
        {
            _moveTimer.Stop();
            PersistWindowState();
        }
    }
}

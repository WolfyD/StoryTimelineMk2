using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Calendar : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? CalendarId { get; set; }

        public f_Calendar()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_Calendar_Load;
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }

        private async void F_Calendar_Load(object? sender, EventArgs e)
        {
            // async void: unhandled exceptions here crash the app. Catch, log, show, close.
            try
            {
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("calendar");
                await wv_Calendar.EnsureCoreWebView2Async(webEnvironment);

                wv_Calendar.CoreWebView2.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                _messageRouter = new MessageRouter(wv_Calendar.CoreWebView2, this);

                var query = string.IsNullOrEmpty(CalendarId) ? "" : $"?calendarId={Uri.EscapeDataString(CalendarId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    wv_Calendar.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    wv_Calendar.CoreWebView2.Navigate($"https://app.local/calendar.html{query}");
                }
                else
                    wv_Calendar.CoreWebView2.Navigate($"http://localhost:5173/calendar.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Calendar.Load", ex);
                MessageBox.Show($"Failed to open the calendar editor:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
    }
}

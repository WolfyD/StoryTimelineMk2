using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.Drawing;
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

        // ── Pre-warm: initialise WebView2 before the user requests the window ──
        private static f_Calendar? _prewarmed;
        private static bool _isPrewarming;

        internal static void BeginPrewarm()
        {
            if (_prewarmed != null || _isPrewarming) return;
            _isPrewarming = true;
            _ = DoPrewarmAsync();
        }

        private static async Task DoPrewarmAsync()
        {
            try
            {
                var form = new f_Calendar();
                _ = form.Handle; // force HWND without Show()
                var env = await WebView2EnvironmentFactory.GetAsync("calendar");
                await form.wv_Calendar.EnsureCoreWebView2Async(env);
                _prewarmed = form;
            }
            catch (Exception ex)
            {
                Logger.Error("f_Calendar.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        internal static f_Calendar? TakePrewarmed()
        {
            var form = _prewarmed;
            _prewarmed = null;
            if (form is { IsDisposed: true }) return null;
            return form;
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
                if (wv_Calendar.CoreWebView2 == null)
                {
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("calendar");
                    await wv_Calendar.EnsureCoreWebView2Async(webEnvironment);
                }
                var coreWV = wv_Calendar.CoreWebView2!;
                wv_Calendar.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                _messageRouter = new MessageRouter(coreWV, this);

                var query = string.IsNullOrEmpty(CalendarId) ? "" : $"?calendarId={Uri.EscapeDataString(CalendarId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/calendar.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/calendar.html{query}");
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

using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Calendar : Form
    {
        private MessageRouter _messageRouter;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string CalendarId { get; set; }

        public f_Calendar()
        {
            InitializeComponent();
            Load += F_Calendar_Load;
        }

        private async void F_Calendar_Load(object? sender, EventArgs e)
        {
            string cacheFolder = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "StoryTimelineMk2_Cache", "calendar");

            var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);
            await wv_Calendar.EnsureCoreWebView2Async(webEnvironment);

            wv_Calendar.CoreWebView2.WindowCloseRequested += (_, _) => Close();

            _messageRouter = new MessageRouter(wv_Calendar.CoreWebView2);

            var query = string.IsNullOrEmpty(CalendarId) ? "" : $"?calendarId={Uri.EscapeDataString(CalendarId)}";

            string prodPath = Path.Combine(Application.StartupPath, "Frontend", "dist", "calendar.html");
            if (File.Exists(prodPath))
                wv_Calendar.CoreWebView2.Navigate(prodPath + query);
            else
                wv_Calendar.CoreWebView2.Navigate($"http://localhost:5173/calendar.html{query}");
        }
    }
}

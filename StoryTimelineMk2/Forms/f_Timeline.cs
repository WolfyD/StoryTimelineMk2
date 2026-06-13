using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_Timeline : Form
    {
        private MessageRouter _messageRouter;
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        public f_Timeline()
        {
            InitializeComponent();
            Load += F_Timeline_Load;
            FormClosing += F_Timeline_FormClosing;
        }

        private async void F_Timeline_Load(object? sender, EventArgs e)
        {
            string cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Cache");
            var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);

            // 1. Initialize the Chromium engine
            await wv_Timeline.EnsureCoreWebView2Async(webEnvironment);

            // 2. NOW CoreWebView2 exists. Safe to initialize the router.
            _messageRouter = new MessageRouter(wv_Timeline.CoreWebView2);

            // 3. Bind the Vue message listener directly to the Router
            // Note: Using wv_Timeline consistently instead of the undefined webView
            wv_Timeline.CoreWebView2.WebMessageReceived += _messageRouter.OnWebMessageReceived;

            // 4. Load the Frontend
            string prodPath = Path.Combine(Application.StartupPath, "Frontend", "dist", "timeline.html");
            string query = $"?id={TimelineId}";

            if (File.Exists(prodPath))
            {
                wv_Timeline.CoreWebView2.Navigate(prodPath + query); // Production
            }
            else
            {
                wv_Timeline.CoreWebView2.Navigate($"http://localhost:5173/timeline.html{query}"); // Dev Server
            }
        }

        private void F_Timeline_FormClosing(object? sender, FormClosingEventArgs e)
        {
            f_Main mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main")
                {
                    mainForm = f as f_Main;
                }
            }

            if (mainForm != null)
            {
                var mr = mainForm._messageRouter;
                mr.SendToVue("InitReload");
                mainForm.Show();
            }
            else
            {
                Application.Exit();
            }
        }
    }
}

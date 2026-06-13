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
    public partial class f_AddEditItem : Form
    {
        private MessageRouter _messageRouter;
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TypeId { get; set; }


        public f_AddEditItem()
        {
            InitializeComponent();
            Load += AddEditItem_Load;
        }

        async private void AddEditItem_Load(object? sender, EventArgs e)
        {
            string cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Cache");
            var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);

            // 1. Initialize the Chromium engine
            await wv_AddEditItem.EnsureCoreWebView2Async(webEnvironment);

            // 2. NOW CoreWebView2 exists. Safe to initialize the router.
            _messageRouter = new MessageRouter(wv_AddEditItem.CoreWebView2);

            // 3. Bind the Vue message listener directly to the Router
            // Note: Using wv_Timeline consistently instead of the undefined webView
            wv_AddEditItem.CoreWebView2.WebMessageReceived += _messageRouter.OnWebMessageReceived;

            // 4. Load the Frontend
            string prodPath = Path.Combine(Application.StartupPath, "Frontend", "dist", "editItem.html");
            string query = $"?id={TimelineId}";

            if (File.Exists(prodPath))
            {
                wv_AddEditItem.CoreWebView2.Navigate(prodPath + query); // Production
            }
            else
            {
                wv_AddEditItem.CoreWebView2.Navigate($"http://localhost:5173/editItem.html{query}"); // Dev Server
            }
        }
    }
}

using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Text;
using System.Windows.Forms;
using static System.Runtime.InteropServices.JavaScript.JSType;


namespace StoryTimelineMk2.Forms
{
    public partial class f_Main : Form
    {
        public MessageRouter _messageRouter;
        private const string ViteDevServerUrl = "http://localhost:5173";

        public f_Main()
        {
            InitializeComponent();

            Load += F_Main_Load;
        }

        private async void F_Main_Load(object? sender, EventArgs e)
        {
            try
            {
                string cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Cache");
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

        private void LoadFrontend()
        {
#if DEBUG
            // --- DEVELOPMENT MODE ---
            // Enables right-click inspect and points the browser to your live Vite server.
            // This allows Hot Module Replacement (HMR) to update the UI instantly when you save a Vue file.
            webView21.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView21.CoreWebView2.Navigate(ViteDevServerUrl);
#else
            // --- PRODUCTION MODE ---
            // Locks down the browser and loads the static, compiled HTML files from your hard drive.
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

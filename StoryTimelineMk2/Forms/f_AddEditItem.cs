using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_AddEditItem : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? ItemId { get; set; }  // null for new items

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int DefaultTypeId { get; set; } = 1;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public double? DefaultYear { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int? DefaultGranularity { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public Action<string, object>? NotifyCallback { get; set; }

        public f_AddEditItem()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += AddEditItem_Load;
        }

        async private void AddEditItem_Load(object? sender, EventArgs e)
        {
            // async void: unhandled exceptions here crash the app. Catch, log, show, close.
            try
            {
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("edit");
                await wv_AddEditItem.EnsureCoreWebView2Async(webEnvironment);

                wv_AddEditItem.CoreWebView2.WindowCloseRequested += (_, _) => Close();

                // Map the media folder so Vue can load images via https://media.app/{filename}
                // Ensure the folder exists — SetVirtualHostNameToFolderMapping throws if it doesn't
                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                wv_AddEditItem.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "media.app",
                    mediaFolder,
                    CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter = new MessageRouter(wv_AddEditItem.CoreWebView2, this);

                var query = $"?timelineId={TimelineId}";
                if (!string.IsNullOrEmpty(ItemId))
                {
                    query += $"&itemId={Uri.EscapeDataString(ItemId)}";
                }
                else
                {
                    query += $"&typeId={DefaultTypeId}";
                    if (DefaultYear.HasValue)
                        query += $"&year={DefaultYear.Value.ToString("R", System.Globalization.CultureInfo.InvariantCulture)}";
                    if (DefaultGranularity.HasValue)
                        query += $"&granularity={DefaultGranularity.Value}";
                }

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    wv_AddEditItem.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    wv_AddEditItem.CoreWebView2.Navigate($"https://app.local/editItem.html{query}");
                }
                else
                    wv_AddEditItem.CoreWebView2.Navigate($"http://localhost:5173/editItem.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_AddEditItem.Load", ex);
                MessageBox.Show($"Failed to open the item editor:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
    }
}

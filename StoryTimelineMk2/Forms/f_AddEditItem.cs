using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_AddEditItem : Form
    {
        private MessageRouter _messageRouter;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string ItemId { get; set; }  // null for new items

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int DefaultTypeId { get; set; } = 1;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int? DefaultYear { get; set; }

        public f_AddEditItem()
        {
            InitializeComponent();
            Load += AddEditItem_Load;
        }

        async private void AddEditItem_Load(object? sender, EventArgs e)
        {
            string cacheFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "StoryTimelineMk2_Cache", "edit");

            var webEnvironment = await CoreWebView2Environment.CreateAsync(null, cacheFolder);
            await wv_AddEditItem.EnsureCoreWebView2Async(webEnvironment);

            wv_AddEditItem.CoreWebView2.WindowCloseRequested += (_, _) => Close();

            _messageRouter = new MessageRouter(wv_AddEditItem.CoreWebView2);

            var query = $"?timelineId={TimelineId}";
            if (!string.IsNullOrEmpty(ItemId))
            {
                query += $"&itemId={Uri.EscapeDataString(ItemId)}";
            }
            else
            {
                query += $"&typeId={DefaultTypeId}";
                if (DefaultYear.HasValue)
                    query += $"&year={DefaultYear.Value}";
            }

            string prodPath = Path.Combine(Application.StartupPath, "Frontend", "dist", "editItem.html");
            if (File.Exists(prodPath))
                wv_AddEditItem.CoreWebView2.Navigate(prodPath + query);
            else
                wv_AddEditItem.CoreWebView2.Navigate($"http://localhost:5173/editItem.html{query}");
        }
    }
}

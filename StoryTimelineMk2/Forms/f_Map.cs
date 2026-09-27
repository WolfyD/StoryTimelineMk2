using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    /// <summary>
    /// BL-16: the map window — the same borderless WebView2 shell as the relations window, pointed at
    /// one more SPA entry point.
    /// ponytail: the pre-warm stops at the Chromium process; unlike relations there is no
    /// pre-navigate-and-push-the-ids, so the page keeps getting everything from its query string. Add
    /// the second stage (and a SetMapContext push) if opening the window still feels slow.
    /// ponytail: no saved window position — it opens centred.
    /// </summary>
    public partial class f_Map : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        /// <summary>Map to open on. Null starts on the timeline's first root map.</summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? MapId { get; set; }

        public f_Map()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_Map_Load;
        }

        // ── Pre-warm: initialise WebView2 before the user requests the window ──
        private static f_Map? _prewarmed;
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
                var form = new f_Map();
                _ = form.Handle; // force HWND without Show()
                var env = await WebView2EnvironmentFactory.GetAsync("map");
                await form.wv_Map.EnsureCoreWebView2Async(env);
                _prewarmed = form;
            }
            catch (Exception ex)
            {
                Logger.Error("f_Map.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        internal static f_Map? TakePrewarmed()
        {
            var form = _prewarmed;
            _prewarmed = null;
            if (form is { IsDisposed: true }) return null;
            return form;
        }

        private async void F_Map_Load(object? sender, EventArgs e)
        {
            try
            {
                if (wv_Map.CoreWebView2 == null)
                {
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("map");
                    await wv_Map.EnsureCoreWebView2Async(webEnvironment);
                }
                var coreWV = wv_Map.CoreWebView2!;
                wv_Map.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                // The map image and its derived views are served from the media folder, same origin
                // as every other picture in the app.
                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping(
                    "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter ??= new MessageRouter(coreWV, this);

                var query = $"?timelineId={TimelineId}";
                if (!string.IsNullOrEmpty(MapId))
                    query += $"&mapId={Uri.EscapeDataString(MapId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/map.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/map.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Map.Load", ex);
                MessageBox.Show($"Failed to open the map window:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }
    }
}

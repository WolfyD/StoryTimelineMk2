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
    /// BL-15: the characters window. Same shell as the calendar editor — a borderless form that is
    /// nothing but a WebView2 pointed at one more SPA entry point.
    /// ponytail: no saved window position — it opens centred.
    /// </summary>
    public partial class f_Characters : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        /// <summary>Character to open on, when the window was opened from one. Null selects nothing.</summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? CharacterId { get; set; }

        public f_Characters()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_Characters_Load;
        }

        // ── Pre-warm: initialise WebView2 before the user requests the window ──
        private static f_Characters? _prewarmed;
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
                var form = new f_Characters();
                _ = form.Handle; // force HWND without Show()
                var env = await WebView2EnvironmentFactory.GetAsync("characters");
                await form.wv_Characters.EnsureCoreWebView2Async(env);
                _prewarmed = form;
            }
            catch (Exception ex)
            {
                Logger.Error("f_Characters.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        internal static f_Characters? TakePrewarmed()
        {
            var form = _prewarmed;
            _prewarmed = null;
            if (form is { IsDisposed: true }) return null;
            return form;
        }

        private async void F_Characters_Load(object? sender, EventArgs e)
        {
            try
            {
                if (wv_Characters.CoreWebView2 == null)
                {
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("characters");
                    await wv_Characters.EnsureCoreWebView2Async(webEnvironment);
                }
                var coreWV = wv_Characters.CoreWebView2!;
                wv_Characters.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                // Portraits are served from the media folder, same as every other window.
                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping(
                    "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter = new MessageRouter(coreWV, this);

                var query = $"?timelineId={TimelineId}";
                if (!string.IsNullOrEmpty(CharacterId))
                    query += $"&characterId={Uri.EscapeDataString(CharacterId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/characters.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/characters.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Characters.Load", ex);
                MessageBox.Show($"Failed to open the characters window:\n\n{ex}", "Error",
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

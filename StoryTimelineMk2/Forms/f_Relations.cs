using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Bridge;
using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    /// <summary>
    /// BL-73: the relations window — the same borderless WebView2 shell as the characters window,
    /// pointed at one more SPA entry point.
    /// ponytail: no saved window position — it opens centred.
    /// </summary>
    public partial class f_Relations : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        /// <summary>The pre-warm already loaded the page, so Load pushes the ids instead of navigating.</summary>
        private bool _didPreNavigate;
        private bool _preNavComplete;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        /// <summary>Character to centre the graph and the family tree on. Null picks the first.</summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? CharacterId { get; set; }

        public f_Relations()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_Relations_Load;
        }

        // ── Pre-warm: initialise WebView2 before the user requests the window ──
        private static f_Relations? _prewarmed;
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
                var form = new f_Relations();
                _ = form.Handle; // force HWND without Show()
                var env = await WebView2EnvironmentFactory.GetAsync("relations");
                await form.wv_Relations.EnsureCoreWebView2Async(env);

                // Same two-stage warm as the characters window: the Chromium process is only half
                // of it, and the fetch/parse/mount/handshake is the half the user actually waits
                // on. Pre-navigate now, push the ids later as SetRelationsContext.
                // Release builds only: in dev there is no dist and Vite serves from localhost.
                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    var coreWV = form.wv_Relations.CoreWebView2!;
                    form.wv_Relations.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
                    string mediaFolder = AppConfig.Instance.GetMediaFolder();
                    Directory.CreateDirectory(mediaFolder);
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    // The router must exist before Navigate: the page calls the bridge on mount.
                    form._messageRouter = new MessageRouter(coreWV, form);
                    coreWV.NavigationCompleted += (_, _) => form._preNavComplete = true;
                    coreWV.Navigate("https://app.local/relations.html");
                    form._didPreNavigate = true;
                }

                _prewarmed = form;
            }
            catch (Exception ex)
            {
                Logger.Error("f_Relations.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        internal static f_Relations? TakePrewarmed()
        {
            var form = _prewarmed;
            _prewarmed = null;
            if (form is { IsDisposed: true }) return null;
            return form;
        }

        private async void F_Relations_Load(object? sender, EventArgs e)
        {
            try
            {
                if (wv_Relations.CoreWebView2 == null)
                {
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("relations");
                    await wv_Relations.EnsureCoreWebView2Async(webEnvironment);
                }
                var coreWV = wv_Relations.CoreWebView2!;
                wv_Relations.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                // Portraits are served from the media folder, same as every other window.
                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping(
                    "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter ??= new MessageRouter(coreWV, this);

                if (_didPreNavigate)
                {
                    // The page is already up and waiting on this push for the ids it could not get
                    // from a query string it was navigated without.
                    string idMsg = JsonSerializer.Serialize(new
                    {
                        action = "SetRelationsContext",
                        payload = new { timelineId = TimelineId, characterId = CharacterId },
                    });
                    void SendContext()
                    {
                        Logger.Info("f_Relations.Load", $"Sending SetRelationsContext={TimelineId}");
                        coreWV.PostWebMessageAsString(idMsg);
                    }

                    if (_preNavComplete) SendContext();
                    else coreWV.NavigationCompleted += (_, _) => SendContext();
                    return;
                }

                var query = $"?timelineId={TimelineId}";
                if (!string.IsNullOrEmpty(CharacterId))
                    query += $"&characterId={Uri.EscapeDataString(CharacterId)}";

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/relations.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/relations.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Relations.Load", ex);
                MessageBox.Show($"Failed to open the relations window:\n\n{ex}", "Error",
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

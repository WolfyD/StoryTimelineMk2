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
    public partial class f_AddEditItem : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string? ItemId { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int DefaultTypeId { get; set; } = 1;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public double? DefaultYear { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int? DefaultGranularity { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public Action<string, object>? NotifyCallback { get; set; }

        private bool _isForceClosing = false;
        private bool _isPageReady = false; // true once the first navigation has completed

        public f_AddEditItem()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += AddEditItem_Load;
        }

        // ── Singleton: the window is hidden instead of closed and reused ──────────
        private static f_AddEditItem? _instance;

        // ── Pre-warm: initialize WebView2 before the user first requests the window ──
        private static f_AddEditItem? _prewarmed;
        private static bool _isPrewarming;

        internal static void BeginPrewarm()
        {
            if (_instance != null && !_instance.IsDisposed) return; // singleton already live
            if (_prewarmed != null || _isPrewarming) return;
            _isPrewarming = true;
            _ = DoPrewarmAsync();
        }

        private static async Task DoPrewarmAsync()
        {
            try
            {
                var form = new f_AddEditItem();
                _ = form.Handle; // force HWND without Show()
                var env = await WebView2EnvironmentFactory.GetAsync("edit");
                await form.wv_AddEditItem.EnsureCoreWebView2Async(env);
                form.wv_AddEditItem.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
                _prewarmed = form;
            }
            catch (Exception ex)
            {
                Logger.Error("f_AddEditItem.Prewarm", ex);
            }
            finally
            {
                _isPrewarming = false;
            }
        }

        /// <summary>
        /// Returns the singleton, promoting the pre-warmed form to singleton if available.
        /// </summary>
        internal static f_AddEditItem GetOrCreate()
        {
            if (_instance != null && !_instance.IsDisposed)
                return _instance;

            var prewarmed = _prewarmed;
            _prewarmed = null;
            _instance = (prewarmed != null && !prewarmed.IsDisposed) ? prewarmed : new f_AddEditItem();
            return _instance;
        }

        /// <summary>
        /// Force-closes the singleton (used by NotifyTimelineClosing). Bypasses hide-instead-of-close.
        /// </summary>
        internal static void ForceCloseInstance()
        {
            if (_instance == null || _instance.IsDisposed || !_instance.IsHandleCreated) return;
            _instance.BeginInvoke((MethodInvoker)_instance.ForceClose);
        }

        /// <summary>
        /// Forces this window to actually close, bypassing the hide-instead-of-close intercept.
        /// </summary>
        public void ForceClose()
        {
            _isForceClosing = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Allow system-initiated closes and owner-closing through.
            // Intercept everything else (user close, Vue WindowClose) → hide instead.
            if (!_isForceClosing
                && e.CloseReason != CloseReason.ApplicationExitCall
                && e.CloseReason != CloseReason.WindowsShutDown
                && e.CloseReason != CloseReason.FormOwnerClosing)
            {
                e.Cancel = true;
                Hide();
                return;
            }
            base.OnFormClosing(e);
        }

        /// <summary>
        /// Updates params for the window. If the page is already live, pushes a LoadItem
        /// message so Vue resets state instantly and refetches — no page reload needed.
        /// Otherwise, AddEditItem_Load handles the first navigation on Show().
        /// </summary>
        public void ReopenWithParams(int timelineId, string? itemId, int typeId, double? year, int? granularity)
        {
            TimelineId = timelineId;
            ItemId = itemId;
            DefaultTypeId = typeId;
            DefaultYear = year;
            DefaultGranularity = granularity;

            if (wv_AddEditItem.CoreWebView2 != null && _isPageReady)
            {
                // Vue is already running — push new params. Vue immediately sets isLoading=true
                // (hiding stale content) then re-fetches. No Chromium teardown, no V8, no Vue bootstrap.
                var msg = JsonSerializer.Serialize(new
                {
                    action = "LoadItem",
                    payload = new { timelineId, itemId, typeId, year, granularity }
                });
                wv_AddEditItem.CoreWebView2.PostWebMessageAsString(msg);
            }
            // else: first Show() triggers AddEditItem_Load which navigates normally
        }

        private string BuildUrl()
        {
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
            return Directory.Exists(distPath)
                ? $"https://app.local/editItem.html{query}"
                : $"http://localhost:5173/editItem.html{query}";
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }

        private async void AddEditItem_Load(object? sender, EventArgs e)
        {
            // async void: unhandled exceptions here crash the app. Catch, log, show, close.
            try
            {
                if (wv_AddEditItem.CoreWebView2 == null)
                {
                    var webEnvironment = await WebView2EnvironmentFactory.GetAsync("edit");
                    await wv_AddEditItem.EnsureCoreWebView2Async(webEnvironment);
                }
                var coreWV = wv_AddEditItem.CoreWebView2!;

                wv_AddEditItem.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping(
                    "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter = new MessageRouter(coreWV, this);

                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);

                coreWV.NavigationCompleted += (_, navArgs) =>
                {
                    if (navArgs.IsSuccess) _isPageReady = true;
                };
                coreWV.Navigate(BuildUrl());
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

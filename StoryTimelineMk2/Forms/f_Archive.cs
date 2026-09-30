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
    /// BL-88: the Archive — every item, story, picture, character, place and tag of the open timeline,
    /// in one window that stays up while you act on it. Owned by the timeline window: it closes with it.
    /// Deletes wait in the page's trash until the window closes, so a close from the title bar or the
    /// sidebar goes through the page first (<c>CloseRequested</c>), the way the item editor's does.
    /// ponytail: no pre-warm and no remembered bounds — it opens centred on the timeline. Add either
    /// once opening it feels slow or people keep moving it to the same place.
    /// </summary>
    public partial class f_Archive : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;
        private bool _closeConfirmed;   // the page has dealt with its trash — see OnFormClosing
        private bool _isPageReady;      // until the page is up there is no trash to ask about

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        public f_Archive()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_Archive_Load;
        }

        private async void F_Archive_Load(object? sender, EventArgs e)
        {
            try
            {
                CenterToParent();

                // The map's environment: the Archive shows pictures and places, and a warm process.
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("map");
                await wv_Archive.EnsureCoreWebView2Async(webEnvironment);
                var coreWV = wv_Archive.CoreWebView2!;
                wv_Archive.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)ConfirmedClose);

                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                Directory.CreateDirectory(mediaFolder);
                coreWV.SetVirtualHostNameToFolderMapping(
                    "media.app", mediaFolder, CoreWebView2HostResourceAccessKind.Allow);

                _messageRouter ??= new MessageRouter(coreWV, this);

                coreWV.NavigationCompleted += (_, navArgs) =>
                {
                    if (navArgs.IsSuccess) _isPageReady = true;
                };

                var query = $"?timelineId={TimelineId}";
                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/archive.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/archive.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_Archive.Load", ex);
                MessageBox.Show($"Failed to open the Archive:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                ConfirmedClose();
            }
        }

        /// <summary>Close asked for by the page itself, which has already dealt with its trash.</summary>
        public void ConfirmedClose()
        {
            _closeConfirmed = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // The title-bar X, Alt+F4 and the sidebar icon: the page lists what it is about to delete
            // and answers with WindowClose. Its owner closing, or Windows, drops the trash instead.
            if (!_closeConfirmed && _isPageReady
                && e.CloseReason != CloseReason.ApplicationExitCall
                && e.CloseReason != CloseReason.WindowsShutDown
                && e.CloseReason != CloseReason.FormOwnerClosing)
            {
                e.Cancel = true;
                _messageRouter.SendToVue("CloseRequested", new { });
                return;
            }
            base.OnFormClosing(e);
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }
    }
}

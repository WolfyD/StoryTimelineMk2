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
    /// BL-16: the map's cast — who to follow, what a range adds up to — in a window of its own, so it
    /// can sit on a second screen instead of crowding the map's sidebar. Owned by the map window: it
    /// closes with it. Everything it shows comes from the map over the <c>MapCast</c> broadcast.
    /// ponytail: no pre-warm. It runs in the map's own browser environment, so the Chromium process is
    /// already up by the time it is asked for; add one if opening it still feels slow.
    /// </summary>
    public partial class f_MapCast : BorderlessFormBase
    {
        private MessageRouter _messageRouter = null!;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public int TimelineId { get; set; }

        /// <summary>
        /// False when the clock coming on opened it: it appears without taking the focus, rather than
        /// taking it and handing it back, which blinks the map's title bar.
        /// </summary>
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool ActivateOnShow { get; set; } = true;

        protected override bool ShowWithoutActivation => !ActivateOnShow;

        public f_MapCast()
        {
            InitializeComponent();
            FormBorderStyle = FormBorderStyle.None;
            Load += F_MapCast_Load;
            FormClosed += (_, _) => SaveBounds();
        }

        private async void F_MapCast_Load(object? sender, EventArgs e)
        {
            try
            {
                PlaceWindow();

                // The map's environment: same browser process, so this one starts warm.
                var webEnvironment = await WebView2EnvironmentFactory.GetAsync("map");
                await wv_MapCast.EnsureCoreWebView2Async(webEnvironment);
                var coreWV = wv_MapCast.CoreWebView2!;
                wv_MapCast.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);

                coreWV.WindowCloseRequested += (_, _) => Invoke((MethodInvoker)Close);

                _messageRouter ??= new MessageRouter(coreWV, this);

                var query = $"?timelineId={TimelineId}";
                string distPath = Path.Combine(Application.StartupPath, "Frontend", "dist");
                if (Directory.Exists(distPath))
                {
                    coreWV.SetVirtualHostNameToFolderMapping(
                        "app.local", distPath, CoreWebView2HostResourceAccessKind.Allow);
                    coreWV.Navigate($"https://app.local/mapCast.html{query}");
                }
                else
                    coreWV.Navigate($"http://localhost:5173/mapCast.html{query}");
            }
            catch (Exception ex)
            {
                Logger.Error("f_MapCast.Load", ex);
                MessageBox.Show($"Failed to open the cast window:\n\n{ex}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        /// <summary>
        /// Where it was left, on whichever screen that was. A screen that has since gone is caught by
        /// the base class's off-screen guard, which re-centres it.
        /// </summary>
        private void PlaceWindow()
        {
            var saved = AppConfig.Instance.MapCastBounds;
            if (saved is { Length: 4 } && saved[2] > 0 && saved[3] > 0)
            {
                Bounds = new Rectangle(saved[0], saved[1], saved[2], saved[3]);
                return;
            }
            // First time: down the right-hand edge of the screen the map is on.
            var wa = (Owner != null ? Screen.FromControl(Owner) : Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;
            Size = new Size(380, Math.Min(760, wa.Height - 80));
            Location = new Point(wa.Right - Width - 20, wa.Top + 40);
        }

        private void SaveBounds()
        {
            try
            {
                var b = GetRestoreBounds();
                AppConfig.Instance.MapCastBounds = new[] { b.X, b.Y, b.Width, b.Height };
                AppConfig.Instance.Save();
            }
            catch (Exception ex)
            {
                Logger.Error("f_MapCast.SaveBounds", ex);
                MessageBox.Show($"Could not remember where the cast window was:\n\n{ex.Message}\n\n" +
                    $"The full details were written to the error log:\n{Logger.LogPath}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public override void PropagateTopMost(bool topmost)
        {
            base.PropagateTopMost(topmost);
            _messageRouter?.SendToVue("TopMostChanged", new { isTopmost = topmost });
        }
    }
}

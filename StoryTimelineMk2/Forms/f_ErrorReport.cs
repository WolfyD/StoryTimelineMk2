using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    /// <summary>
    /// Plain, standard-chrome dialog for failures the user needs to act on or send to the developer:
    /// the full <see cref="ErrorReport"/> text in a read-only box with Copy / Open log folder /
    /// Open backups folder. Deliberately not a BorderlessFormBase — it must work when the rest of the
    /// app (WebView2, database) is unavailable.
    /// </summary>
    public sealed class f_ErrorReport : Form
    {
        public static void ShowReport(string title, Exception ex)
        {
            using var form = new f_ErrorReport(title, ErrorReport.Build(title, ex));
            form.ShowDialog();
        }

        private f_ErrorReport(string title, string report)
        {
            Text          = "Story Timeline — error report";
            StartPosition = FormStartPosition.CenterScreen;
            Size          = new Size(820, 560);
            MinimumSize   = new Size(520, 320);
            MinimizeBox   = false;
            ShowIcon      = false;
            ShowInTaskbar = true;

            var heading = new Label
            {
                Text     = title + Environment.NewLine + "Please copy this report and send it along when asking for help.",
                Dock     = DockStyle.Top,
                AutoSize = false,
                Height   = 56,
                Padding  = new Padding(12, 10, 12, 0),
            };

            var buttons = new FlowLayoutPanel
            {
                Dock          = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height        = 46,
                Padding       = new Padding(8, 6, 8, 6),
            };
            void Add(string text, Action onClick)
            {
                var b = new Button { Text = text, AutoSize = true, Margin = new Padding(4, 0, 4, 0) };
                b.Click += (_, _) => onClick();
                buttons.Controls.Add(b);
            }
            Add("Close", Close);
            Add("Open backups folder", () => OpenFolder(AppConfig.Instance.GetBackupsFolder()));
            Add("Open log folder",     () => OpenFolder(Path.GetDirectoryName(Logger.LogPath)!));
            Add("Copy report",         () => Clipboard.SetText(report));

            var box = new TextBox
            {
                Multiline  = true,
                ReadOnly   = true,
                WordWrap   = false,
                ScrollBars = ScrollBars.Both,
                Dock       = DockStyle.Fill,
                Font       = new Font("Consolas", 9f),
                Text       = report,
            };

            Controls.Add(box);
            Controls.Add(buttons);
            Controls.Add(heading);
            box.BringToFront();
            box.Select(0, 0);
        }

        private static void OpenFolder(string folder)
        {
            try
            {
                Directory.CreateDirectory(folder);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Logger.Error("f_ErrorReport", ex);
                MessageBox.Show($"Could not open {folder}:\n\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

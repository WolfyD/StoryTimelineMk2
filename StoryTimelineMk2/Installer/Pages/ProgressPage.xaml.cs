using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using StoryTimelineInstaller.Services;

namespace StoryTimelineInstaller.Pages;

public partial class ProgressPage : UserControl
{
    public ProgressPage()
    {
        InitializeComponent();
    }

    /// Maps a step's own 0–100 progress onto the [lo, hi] slice of the overall bar.
    private IProgress<(int percent, string message)> Scaled(int lo, int hi) =>
        new Progress<(int percent, string message)>(update =>
        {
            Dispatcher.Invoke(() =>
            {
                ProgressBar.Value = lo + (hi - lo) * update.percent / 100.0;
                StatusLabel.Text  = update.message;
                LogBox.AppendText(update.message + "\n");
            });
            InstallerLog.Write($"[{update.percent,3}%] {update.message}");
        });

    public async Task StartAsync(InstallerMode mode, MainWindow parentWindow)
    {
        var progress = Scaled(0, 100);

        try
        {
            if (mode == InstallerMode.Install)
            {
                ProgressTitle.Text = "Installing Story Timeline...";
                int start = 0;
                InstallerLog.Write($"[install] start: dir={InstallerContext.Current.InstallDir} selfContained={InstallerContext.PayloadIsSelfContained} desktop={InstallerContext.Current.CreateDesktopShortcut} startMenu={InstallerContext.Current.CreateStartMenuShortcut}");

                if (InstallerContext.Current.NeedsDotnetRuntime && InstallerContext.Current.InstallDotnetRuntime)
                {
                    Dispatcher.Invoke(() => LogBox.AppendText(".NET Desktop Runtime not found, downloading...\n"));
                    await DotnetRuntimeService.DownloadAndInstallAsync(Scaled(start, start + 20), CancellationToken.None);
                    start += 20;
                }

                if (!WebView2Service.IsInstalled())
                {
                    Dispatcher.Invoke(() => LogBox.AppendText("WebView2 not found, downloading runtime...\n"));
                    await WebView2Service.DownloadAndInstallAsync(Scaled(start, start + 10), CancellationToken.None);
                    start += 10;
                }

                var destDir = InstallerContext.Current.InstallDir;
                await InstallService.InstallAsync(destDir, Scaled(start, 100), CancellationToken.None);
            }
            else
            {
                Dispatcher.Invoke(() => ProgressTitle.Text = "Uninstalling Story Timeline...");
                var installDir = InstallerContext.Current.InstalledDir
                              ?? InstallerContext.Current.InstallDir;
                await InstallService.UninstallAsync(installDir, progress, CancellationToken.None);
            }

            Dispatcher.Invoke(() =>
            {
                ProgressBar.Value  = 100;
                ProgressTitle.Text = mode == InstallerMode.Install
                    ? "Installation complete!"
                    : "Uninstall complete!";
                StatusLabel.Text = mode == InstallerMode.Install
                    ? "Story Timeline has been installed successfully."
                    : "Story Timeline has been removed from your computer.";
            });

            parentWindow.OnInstallComplete();
        }
        catch (Exception ex)
        {
            InstallerLog.Write($"[error] {ex}");
            Dispatcher.Invoke(() =>
            {
                ProgressTitle.Text       = mode == InstallerMode.Install
                    ? "Installation failed" : "Uninstall failed";
                StatusLabel.Foreground   = (Brush)Application.Current.Resources["DangerBrush"];
                StatusLabel.Text         = $"Error: {ex.Message}" +
                    (InstallerLog.FilePath != null ? $"\nSee {InstallerLog.FilePath}" : "");
                LogBox.AppendText($"\nERROR: {ex}\n");
            });
        }
    }
}

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

    public async Task StartAsync(InstallerMode mode, MainWindow parentWindow)
    {
        var progress = new Progress<(int percent, string message)>(update =>
        {
            Dispatcher.Invoke(() =>
            {
                ProgressBar.Value = update.percent;
                StatusLabel.Text  = update.message;
                LogBox.AppendText(update.message + "\n");
            });
        });

        try
        {
            if (mode == InstallerMode.Install)
            {
                ProgressTitle.Text = "Installing Story Timeline...";

                if (!WebView2Service.IsInstalled())
                {
                    Dispatcher.Invoke(() =>
                    {
                        StatusLabel.Text = "Downloading WebView2 runtime...";
                        LogBox.AppendText("WebView2 not found, downloading runtime...\n");
                    });

                    var wv2Progress = new Progress<(int percent, string message)>(update =>
                    {
                        Dispatcher.Invoke(() =>
                        {
                            ProgressBar.Value = update.percent / 5;
                            StatusLabel.Text  = update.message;
                            LogBox.AppendText(update.message + "\n");
                        });
                    });

                    await WebView2Service.DownloadAndInstallAsync(wv2Progress, CancellationToken.None);
                    Dispatcher.Invoke(() => LogBox.AppendText("WebView2 installed successfully.\n"));
                }

                var destDir = InstallerContext.Current.InstallDir;
                await InstallService.InstallAsync(destDir, progress, CancellationToken.None);
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
            Dispatcher.Invoke(() =>
            {
                ProgressTitle.Text       = mode == InstallerMode.Install
                    ? "Installation failed" : "Uninstall failed";
                StatusLabel.Foreground   = (Brush)Application.Current.Resources["DangerBrush"];
                StatusLabel.Text         = $"Error: {ex.Message}";
                LogBox.AppendText($"\nERROR: {ex}\n");
            });
        }
    }
}

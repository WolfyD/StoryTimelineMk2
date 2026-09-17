using System.Windows;
using StoryTimelineInstaller.Services;

namespace StoryTimelineInstaller;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        ThemeService.Apply(this);

        if (e.Args.Contains("/uninstall", StringComparer.OrdinalIgnoreCase))
            InstallerContext.Current.Mode = InstallerMode.Uninstall;

        InstallerContext.Current.CheckExistingInstall();

        var window = new MainWindow();
        window.Show();
    }
}

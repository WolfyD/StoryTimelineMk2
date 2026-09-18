using System.Windows;
using System.Windows.Threading;
using StoryTimelineInstaller.Services;

namespace StoryTimelineInstaller;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Catch any crash and show it instead of silently closing the process
        DispatcherUnhandledException += OnUnhandledException;

        ThemeService.Apply(this);
        InstallerContext.Current.CheckExistingInstall();

        var ctx = InstallerContext.Current;
        InstallerLog.Write($"==== Story Timeline installer v{InstallerContext.AppVersion} " +
            $"(testBuild={InstallerContext.IsTestBuild}, selfContained={InstallerContext.PayloadIsSelfContained}) ====");
        InstallerLog.Write($"[app] args=[{string.Join(" ", e.Args)}] os={Environment.OSVersion} x64proc={Environment.Is64BitProcess} " +
            $"exe={System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName}");
        InstallerLog.Write($"[app] existing install: version={ctx.InstalledVersion ?? "(none)"} dir={ctx.InstalledDir ?? "(none)"}");

        bool isUninstall = e.Args.Contains("/uninstall", StringComparer.OrdinalIgnoreCase);
        bool isQuiet     = e.Args.Contains("/quiet",     StringComparer.OrdinalIgnoreCase);

        if (isUninstall)
        {
            InstallerContext.Current.Mode = InstallerMode.Uninstall;

            if (isQuiet)
            {
                // Headless path — used by winget, scripts, and /quiet flag
                var installDir = InstallerContext.Current.InstalledDir
                              ?? InstallerContext.Current.InstallDir;
                var noop = new Progress<(int, string)>(_ => { });
                try { await InstallService.UninstallAsync(installDir, noop, CancellationToken.None); }
                catch { }
                Shutdown();
                return;
            }
        }

        new MainWindow().Show();
    }

    private void OnUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        InstallerLog.Write($"[fatal] {e.Exception}");
        var msg = $"An unexpected error occurred and the installer must close.\n\n" +
                  $"{e.Exception.GetType().Name}: {e.Exception.Message}\n\n" +
                  $"{e.Exception.StackTrace}";
        System.Windows.MessageBox.Show(msg, "Story Timeline Installer", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
        Shutdown(1);
    }
}

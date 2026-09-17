using Microsoft.Win32;
using System.Runtime.InteropServices;

namespace StoryTimelineInstaller.Services;

public static class InstallService
{
    public static async Task InstallAsync(
        string sourceDir,
        string destDir,
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var allFiles = Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories)
            .Where(f => !Path.GetFileName(f).Equals("StoryTimelineInstaller.exe",
                StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Directory.CreateDirectory(destDir);

        for (int i = 0; i < allFiles.Length; i++)
        {
            ct.ThrowIfCancellationRequested();
            var srcFile = allFiles[i];
            var relative = Path.GetRelativePath(sourceDir, srcFile);
            var dstFile = Path.Combine(destDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(dstFile)!);
            File.Copy(srcFile, dstFile, overwrite: true);
            int pct = (int)((i + 1.0) / allFiles.Length * 70);
            progress.Report((pct, $"Copying {Path.GetFileName(srcFile)}..."));
            await Task.Yield();
        }

        progress.Report((72, "Copying installer..."));
        var installerSrc = Environment.ProcessPath
            ?? System.Reflection.Assembly.GetExecutingAssembly().Location;
        var installerDst = Path.Combine(destDir, "StoryTimelineInstaller.exe");
        if (File.Exists(installerSrc))
            File.Copy(installerSrc, installerDst, overwrite: true);
        await Task.Yield();

        progress.Report((80, "Writing registry entries..."));
        WriteRegistry(destDir, installerDst);
        await Task.Yield();

        progress.Report((86, "Creating Start Menu shortcut..."));
        if (InstallerContext.Current.CreateStartMenuShortcut)
        {
            var startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
                "Programs", "Story Timeline");
            Directory.CreateDirectory(startMenuDir);
            var mainExe = Path.Combine(destDir, "StoryTimeline.exe");
            CreateShortcut(Path.Combine(startMenuDir, "Story Timeline.lnk"), mainExe, destDir);
        }
        await Task.Yield();

        progress.Report((92, "Creating Desktop shortcut..."));
        if (InstallerContext.Current.CreateDesktopShortcut)
        {
            var desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            var mainExe = Path.Combine(destDir, "StoryTimeline.exe");
            CreateShortcut(Path.Combine(desktopDir, "Story Timeline.lnk"), mainExe, destDir);
        }
        await Task.Yield();

        progress.Report((100, "Installation complete!"));
    }

    private static void WriteRegistry(string installDir, string installerDst)
    {
        using var key = Registry.LocalMachine.CreateSubKey(InstallerContext.RegistryKey);
        key.SetValue("DisplayName", InstallerContext.AppName);
        key.SetValue("DisplayVersion", InstallerContext.AppVersion);
        key.SetValue("Publisher", InstallerContext.GitHubOwner);
        key.SetValue("InstallLocation", installDir);
        key.SetValue("DisplayIcon", Path.Combine(installDir, "StoryTimeline.exe"));
        key.SetValue("UninstallString", $"\"{installerDst}\" /uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("URLInfoAbout",
            $"https://github.com/{InstallerContext.GitHubOwner}/{InstallerContext.GitHubRepo}");
        try
        {
            var dirInfo = new DirectoryInfo(installDir);
            long totalBytes = dirInfo.GetFiles("*", SearchOption.AllDirectories).Sum(f => f.Length);
            key.SetValue("EstimatedSize", (int)(totalBytes / 1024), RegistryValueKind.DWord);
        }
        catch { }
    }

    private static void CreateShortcut(string linkPath, string targetPath, string workDir)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;

        dynamic? shell = null;
        dynamic? shortcut = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            if (shell == null) return;
            shortcut = shell.CreateShortcut(linkPath);
            shortcut.TargetPath = targetPath;
            shortcut.WorkingDirectory = workDir;
            shortcut.Save();
        }
        finally
        {
            if (shortcut != null) Marshal.ReleaseComObject(shortcut);
            if (shell != null) Marshal.ReleaseComObject(shell);
        }
    }

    public static async Task UninstallAsync(
        string installDir,
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        progress.Report((10, "Removing shortcuts..."));
        RemoveShortcuts();
        await Task.Yield();

        progress.Report((20, "Removing registry entries..."));
        try { Registry.LocalMachine.DeleteSubKey(InstallerContext.RegistryKey, false); } catch { }
        await Task.Yield();

        progress.Report((30, "Removing user data..."));
        if (!InstallerContext.Current.KeepUserData)
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            TryDeleteDirectory(Path.Combine(localAppData, InstallerContext.DataDir));
            TryDeleteDirectory(Path.Combine(localAppData, InstallerContext.CacheDir));
        }
        await Task.Yield();

        progress.Report((80, "Scheduling removal of installation directory..."));
        ScheduleSelfDelete(installDir);
        await Task.Yield();

        progress.Report((100, "Uninstall complete!"));
        await Task.Delay(200, ct);
    }

    private static void RemoveShortcuts()
    {
        var startMenuDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
            "Programs", "Story Timeline");
        TryDeleteDirectory(startMenuDir);

        var desktopLink = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            "Story Timeline.lnk");
        if (File.Exists(desktopLink))
            try { File.Delete(desktopLink); } catch { }
    }

    private static void TryDeleteDirectory(string dir)
    {
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { }
    }

    private static void ScheduleSelfDelete(string installDir)
    {
        try
        {
            var tempBat = Path.Combine(Path.GetTempPath(), "st_uninstall.cmd");
            var escaped = installDir.Replace("\"", "\"\"");
            var lines = new[]
            {
                "@echo off",
                ":loop",
                $"rd /s /q \"{escaped}\" 2>nul",
                $"if exist \"{escaped}\" (",
                "  timeout /t 1 >nul",
                "  goto loop",
                ")",
                "del \"%~f0\""
            };
            File.WriteAllLines(tempBat, lines);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = tempBat,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                CreateNoWindow = true,
                UseShellExecute = true
            });
        }
        catch { }
    }
}

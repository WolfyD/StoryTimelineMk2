using Microsoft.Win32;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;

namespace StoryTimelineInstaller.Services;

public static class InstallService
{
    public static async Task InstallAsync(
        string destDir,
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("AppFiles.zip", StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException(
                "AppFiles.zip was not found in the installer resources.\n" +
                "The installer must be built via release.ps1, not directly via dotnet build.");

        using var resourceStream = assembly.GetManifestResourceStream(resourceName)!;
        using var zip = new ZipArchive(resourceStream, ZipArchiveMode.Read);

        var entries = zip.Entries.Where(e => !string.IsNullOrEmpty(e.Name)).ToArray();
        int total = entries.Length;
        InstallerLog.Write($"[install] resource {resourceName}: {total} files -> {destDir}");

        Directory.CreateDirectory(destDir);

        for (int i = 0; i < entries.Length; i++)
        {
            ct.ThrowIfCancellationRequested();
            var entry = entries[i];
            var destPath = Path.Combine(destDir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);
            entry.ExtractToFile(destPath, overwrite: true);
            int pct = (int)((i + 1.0) / total * 70);
            progress.Report((pct, $"Installing {entry.Name}..."));
            await Task.Yield();
        }

        progress.Report((72, "Copying installer..."));
        var installerSrc = System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? string.Empty;
        var installerDst = Path.Combine(destDir, "StoryTimelineInstaller.exe");
        InstallerLog.Write($"[install] uninstaller copy: {installerSrc} -> {installerDst}");
        if (File.Exists(installerSrc))
            File.Copy(installerSrc, installerDst, overwrite: true);
        await Task.Yield();

        progress.Report((80, "Writing registry entries..."));
        InstallerLog.Write($"[install] registry HKLM\\{InstallerContext.RegistryKey}");
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
        key.SetValue("UninstallString",      $"\"{installerDst}\" /uninstall");
        key.SetValue("QuietUninstallString", $"\"{installerDst}\" /uninstall /quiet");
        key.SetValue("NoModify",  1, RegistryValueKind.DWord);
        key.SetValue("NoRepair",  1, RegistryValueKind.DWord);
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
        InstallerLog.Write($"[install] shortcut {linkPath} -> {targetPath}");
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) { InstallerLog.Write("[install] WScript.Shell ProgID not found, shortcut skipped"); return; }

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

        InstallerLog.Write($"[uninstall] dir={installDir} keepUserData={InstallerContext.Current.KeepUserData}");
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

        progress.Report((80, "Removing installation files..."));
        CleanupInstallDir(installDir);
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

    // Win32: schedule a file/dir for deletion on next reboot (for locked files)
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool MoveFileEx(string lpExistingFileName, string? lpNewFileName, int dwFlags);
    private const int MOVEFILE_DELAY_UNTIL_REBOOT = 4;

    private static void CleanupInstallDir(string installDir)
    {
        if (!Directory.Exists(installDir)) return;

        // Delete all files immediately; anything locked (e.g. running installer exe)
        // gets scheduled for deletion on next reboot via MoveFileEx.
        foreach (var file in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
        {
            try { File.Delete(file); }
            catch
            {
                InstallerLog.Write($"[uninstall] locked, delete on reboot: {file}");
                try { MoveFileEx(file, null, MOVEFILE_DELAY_UNTIL_REBOOT); } catch { }
            }
        }

        // Remove subdirectories deepest-first
        foreach (var dir in Directory.GetDirectories(installDir, "*", SearchOption.AllDirectories)
                                      .OrderByDescending(d => d.Length))
        {
            try { Directory.Delete(dir); } catch { }
        }

        // Try to remove the root install dir — succeeds when all files were deleted above
        try { Directory.Delete(installDir); }
        catch
        {
            // Dir still contains the locked running installer exe.
            // Launch a small bat that retries after the process exits.
            ScheduleDirDelete(installDir);
            // Belt-and-suspenders: also mark it for reboot cleanup
            try { MoveFileEx(installDir, null, MOVEFILE_DELAY_UNTIL_REBOOT); } catch { }
        }
    }

    private static void ScheduleDirDelete(string installDir)
    {
        try
        {
            var tempBat = Path.Combine(Path.GetTempPath(), "st_uninstall.cmd");
            // Escape any embedded quotes and strip trailing slashes so rd works correctly
            var escaped = installDir.TrimEnd('\\', '/').Replace("\"", "\"\"");
            string[] lines =
            [
                "@echo off",
                "set /a TRIES=0",
                ":loop",
                $"rd /s /q \"{escaped}\" 2>nul",
                // Use trailing backslash in if-exist so cmd tests for a DIRECTORY, not a file
                $"if exist \"{escaped}\\\" (",
                "  set /a TRIES+=1",
                "  if %TRIES% lss 30 (",
                "    timeout /t 1 /nobreak >nul 2>&1",
                "    goto loop",
                "  )",
                ")",
                "del \"%~f0\""
            ];
            File.WriteAllLines(tempBat, lines, System.Text.Encoding.ASCII);
            // Use cmd.exe /c explicitly — more reliable than shell-executing .cmd when elevated
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName        = "cmd.exe",
                Arguments       = $"/c \"{tempBat}\"",
                WindowStyle     = System.Diagnostics.ProcessWindowStyle.Hidden,
                CreateNoWindow  = true,
                UseShellExecute = false
            });
        }
        catch { }
    }
}

using Microsoft.Win32;

namespace StoryTimelineInstaller.Services;

/// Detects / installs the .NET Desktop Runtime the framework-dependent app needs.
public static class DotnetRuntimeService
{
    // Must match the app's TargetFramework major version (net10.0-windows).
    private const string RuntimeMajor = "10";
    private const string SharedFxKey =
        @"SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App";
    private const string DownloadUrl =
        "https://aka.ms/dotnet/" + RuntimeMajor + ".0/windowsdesktop-runtime-win-x64.exe";

    public static bool IsInstalled()
    {
        try
        {
            // The dotnet MSIs are 32-bit, so the keys live under WOW6432Node (Registry32 view).
            using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry32);
            using var key  = hklm.OpenSubKey(SharedFxKey);
            var versions   = key?.GetValueNames() ?? [];
            bool found     = versions.Any(v => v.StartsWith(RuntimeMajor + "."));
            InstallerLog.Write($"[dotnet] HKLM\\{SharedFxKey}: [{string.Join(", ", versions)}] -> {RuntimeMajor}.x found={found}");
#if TEST_BUILD
            InstallerLog.Write("[dotnet] TEST BUILD: reporting runtime as missing to force the download");
            return false;
#else
            return found;
#endif
        }
        catch (Exception ex) { InstallerLog.Write($"[dotnet] registry check failed: {ex}"); return false; }
    }

    public static Task DownloadAndInstallAsync(
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
        => Bootstrapper.DownloadAndRunAsync(
            DownloadUrl, "windowsdesktop-runtime-win-x64.exe", "/install /quiet /norestart",
            $".NET {RuntimeMajor} Desktop Runtime", progress, ct);
}

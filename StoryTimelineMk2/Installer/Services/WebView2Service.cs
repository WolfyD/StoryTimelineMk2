using Microsoft.Win32;

namespace StoryTimelineInstaller.Services;

public static class WebView2Service
{
    private const string WebView2GuidLM =
        @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    private const string WebView2GuidCU =
        @"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    private const string BootstrapperUrl =
        "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    public static bool IsInstalled()
    {
        return CheckKey(Registry.LocalMachine, WebView2GuidLM)
            || CheckKey(Registry.CurrentUser, WebView2GuidCU);
    }

    private static bool CheckKey(RegistryKey root, string path)
    {
        try
        {
            using var key = root.OpenSubKey(path);
            if (key == null) return false;
            var pv = key.GetValue("pv") as string;
            InstallerLog.Write($"[webview2] {path}: pv={pv ?? "(null)"}");
            return !string.IsNullOrEmpty(pv) && pv != "0.0.0.0";
        }
        catch { return false; }
    }

    public static Task DownloadAndInstallAsync(
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
        => Bootstrapper.DownloadAndRunAsync(
            BootstrapperUrl, "MicrosoftEdgeWebview2Setup.exe", "/install",
            "WebView2 runtime", progress, ct);
}

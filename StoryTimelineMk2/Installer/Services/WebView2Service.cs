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
            return !string.IsNullOrEmpty(pv) && pv != "0.0.0.0";
        }
        catch { return false; }
    }

    public static async Task DownloadAndInstallAsync(
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
    {
        var tempFile = Path.Combine(Path.GetTempPath(), "MicrosoftEdgeWebview2Setup.exe");

        progress.Report((10, "Downloading WebView2 bootstrapper..."));
        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "StoryTimeline-Installer/1.0");

        using var response = await httpClient.GetAsync(
            BootstrapperUrl, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength ?? -1L;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileStream = new FileStream(
            tempFile, FileMode.Create, FileAccess.Write, FileShare.None);

        var buffer = new byte[81920];
        long downloaded = 0;
        int read;
        while ((read = await stream.ReadAsync(buffer, ct)) > 0)
        {
            await fileStream.WriteAsync(buffer.AsMemory(0, read), ct);
            downloaded += read;
            if (total > 0)
            {
                int pct = 10 + (int)(downloaded * 50.0 / total);
                progress.Report((pct, $"Downloading WebView2... {downloaded / 1024:N0} KB"));
            }
        }
        fileStream.Close();

        progress.Report((60, "Installing WebView2 runtime..."));
        var proc = System.Diagnostics.Process.Start(
            new System.Diagnostics.ProcessStartInfo
            {
                FileName = tempFile,
                Arguments = "/install",
                UseShellExecute = true,
                Verb = "runas"
            });
        if (proc != null)
            await proc.WaitForExitAsync(ct);

        progress.Report((100, "WebView2 installed."));
        try { File.Delete(tempFile); } catch { }
    }
}

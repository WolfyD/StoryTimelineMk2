using System.Diagnostics;

namespace StoryTimelineInstaller.Services;

/// Downloads a redistributable installer to %TEMP% and runs it. Shared by the
/// WebView2 and .NET runtime prerequisite steps.
public static class Bootstrapper
{
    public static async Task DownloadAndRunAsync(
        string url,
        string fileName,
        string arguments,
        string label,
        IProgress<(int percent, string message)> progress,
        CancellationToken ct)
    {
        var tempFile = Path.Combine(Path.GetTempPath(), fileName);
        InstallerLog.Write($"[bootstrap] {label}: GET {url} -> {tempFile}");

        progress.Report((10, $"Downloading {label}..."));
        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "StoryTimeline-Installer/1.0");

        using var response = await httpClient.GetAsync(
            url, HttpCompletionOption.ResponseHeadersRead, ct);
        InstallerLog.Write($"[bootstrap] {label}: HTTP {(int)response.StatusCode} from {response.RequestMessage?.RequestUri}, Content-Length={response.Content.Headers.ContentLength?.ToString() ?? "?"}");
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength ?? -1L;
        var sw    = System.Diagnostics.Stopwatch.StartNew();
        using (var stream = await response.Content.ReadAsStreamAsync())
        using (var fileStream = new FileStream(tempFile, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            var buffer = new byte[81920];
            long downloaded = 0;
            int read, lastPct = -1;
            while ((read = await stream.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
            {
                await fileStream.WriteAsync(buffer, 0, read, ct);
                downloaded += read;
                if (total > 0)
                {
                    int pct = 10 + (int)(downloaded * 50.0 / total);
                    if (pct == lastPct) continue;   // one report per percent, not per 80 KB chunk
                    lastPct = pct;
                    progress.Report((pct, $"Downloading {label}... {downloaded / 1024:N0} KB"));
                }
            }
        }

        InstallerLog.Write($"[bootstrap] {label}: downloaded {new System.IO.FileInfo(tempFile).Length:N0} bytes in {sw.Elapsed.TotalSeconds:F1}s");

        progress.Report((60, $"Installing {label}..."));
        InstallerLog.Write($"[bootstrap] {label}: running \"{tempFile}\" {arguments}");
        using var proc = Process.Start(new ProcessStartInfo
        {
            FileName        = tempFile,
            Arguments       = arguments,
            UseShellExecute = true,
            Verb            = "runas"
        });
        if (proc != null)
        {
            await Task.Run(() => proc.WaitForExit(), ct);
            InstallerLog.Write($"[bootstrap] {label}: exit code {proc.ExitCode}");
            // 3010 = success, reboot required; 1638 = a newer version is already installed
            if (proc.ExitCode != 0 && proc.ExitCode != 3010 && proc.ExitCode != 1638)
                throw new InvalidOperationException(
                    $"{label} installer exited with code {proc.ExitCode}.");
        }

        progress.Report((100, $"{label} installed."));
        try { File.Delete(tempFile); } catch { }
    }
}

using System.Text.Json;

namespace StoryTimelineInstaller.Services;

public record ReleaseInfo(string TagName, string HtmlUrl, string? DownloadUrl, string Body);

public static class UpdateService
{
    public static async Task<ReleaseInfo?> GetLatestReleaseAsync(CancellationToken ct)
    {
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("User-Agent", "StoryTimeline-Installer/1.0");

            var url = $"https://api.github.com/repos/{InstallerContext.GitHubOwner}" +
                      $"/{InstallerContext.GitHubRepo}/releases/latest";
            using var response = await client.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return null;

            using var doc = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = doc.RootElement;

            var tagName  = root.GetProperty("tag_name").GetString() ?? "";
            var htmlUrl  = root.GetProperty("html_url").GetString() ?? "";
            var body     = root.TryGetProperty("body", out var bodyEl)
                           ? bodyEl.GetString() ?? "" : "";

            string? downloadUrl = null;
            if (root.TryGetProperty("assets", out var assets))
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    var name = asset.TryGetProperty("name", out var np)
                               ? np.GetString() ?? "" : "";
                    if (name.Contains("installer", StringComparison.OrdinalIgnoreCase)
                        && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                    {
                        downloadUrl = asset.TryGetProperty("browser_download_url", out var up)
                                      ? up.GetString() : null;
                        break;
                    }
                }
            }

            return new ReleaseInfo(tagName, htmlUrl, downloadUrl, body);
        }
        catch { return null; }
    }

    public static bool IsNewer(string remoteTag, string currentVersion)
    {
        try
        {
            var remote = remoteTag.TrimStart('v', 'V');
            if (Version.TryParse(remote, out var rv) && Version.TryParse(currentVersion, out var cv))
                return rv > cv;
        }
        catch { }
        return false;
    }
}

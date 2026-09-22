using System.Net.Http;
using System.Reflection;
using System.Text.Json;

namespace StoryTimelineMk2;

public record UpdateInfo(string Version, string Url, string? Notes);

public static class UpdateChecker
{
    private const string GitHubOwner = "WolfyD";
    private const string GitHubRepo  = "StoryTimelineMk2";

    public static string CurrentVersion { get; } =
        Assembly.GetExecutingAssembly().GetName().Version is { } v
            ? $"{v.Major}.{v.Minor}.{v.Build}"
            : "0.0.0";

    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

    private static readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(10),
    };

    static UpdateChecker()
    {
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"StoryTimeline/{CurrentVersion}");
    }

    // Cached per session so multiple callers don't re-hit the API.
    private static UpdateInfo? _sessionResult;
    private static bool _sessionChecked;

    public static async Task<UpdateInfo?> CheckAsync(bool forceCheck = false)
    {
        if (_sessionChecked && !forceCheck) return _sessionResult;

        var cfg = AppConfig.Instance;
        if (!ShouldCheck(cfg, forceCheck)) return _sessionResult;

        try
        {
            var url  = $"https://api.github.com/repos/{GitHubOwner}/{GitHubRepo}/releases/latest";
            var json = await _http.GetStringAsync(url);
            using var doc  = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var tag     = root.GetProperty("tag_name").GetString() ?? string.Empty;
            var htmlUrl = root.GetProperty("html_url").GetString() ?? string.Empty;
            var notes   = root.TryGetProperty("body", out var b) ? b.GetString() : null;

            cfg.LastUpdateCheck = DateTime.UtcNow;
            cfg.Save();
            _sessionChecked = true;

            if (!IsNewer(tag, CurrentVersion))
            {
                _sessionResult = null;
                return null;
            }

            var version = tag.TrimStart('v', 'V');

            if (ShouldSkip(cfg, version) && !forceCheck)
            {
                _sessionResult = null;
                return null;
            }

            _sessionResult = new UpdateInfo(version, htmlUrl, notes);
            return _sessionResult;
        }
        catch (Exception ex)
        {
            Logger.Warn("UpdateChecker", $"Check failed (non-fatal): {ex.Message}");
            _sessionChecked = true;
            return null;
        }
    }

    public static void SkipVersion(string version)
    {
        AppConfig.Instance.SkippedVersion = version;
        AppConfig.Instance.Save();
        _sessionResult  = null;
    }

    // ── Internal helpers — kept internal so tests can reach them ──────────────

    internal static bool IsNewer(string remoteTag, string currentVersion)
    {
        var remote = remoteTag.TrimStart('v', 'V');
        return Version.TryParse(remote, out var rv) &&
               Version.TryParse(currentVersion, out var cv) &&
               rv > cv;
    }

    internal static bool ShouldCheck(AppConfig cfg, bool forceCheck)
    {
        if (forceCheck) return true;
        if (!cfg.AutoCheckUpdates) return false;
        if (!cfg.LastUpdateCheck.HasValue) return true;
        return DateTime.UtcNow - cfg.LastUpdateCheck.Value >= CheckInterval;
    }

    internal static bool ShouldSkip(AppConfig cfg, string version)
        => !string.IsNullOrEmpty(cfg.SkippedVersion) &&
           cfg.SkippedVersion.Equals(version, StringComparison.OrdinalIgnoreCase);

    // Allow tests to reset session state between runs.
    internal static void ResetSession()
    {
        _sessionResult  = null;
        _sessionChecked = false;
    }
}

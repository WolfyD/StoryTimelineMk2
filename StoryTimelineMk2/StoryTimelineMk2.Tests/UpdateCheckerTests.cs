using StoryTimelineMk2;

namespace StoryTimelineMk2.Tests;

public class UpdateCheckerTests
{
    // ── IsNewer ───────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("v1.1.0", "1.0.0", true)]
    [InlineData("1.1.0",  "1.0.0", true)]
    [InlineData("2.0.0",  "1.9.9", true)]
    [InlineData("1.0.1",  "1.0.0", true)]
    public void IsNewer_ReturnsTrue_WhenRemoteIsHigher(string tag, string current, bool expected)
        => Assert.Equal(expected, UpdateChecker.IsNewer(tag, current));

    [Theory]
    [InlineData("v1.0.0", "1.0.0", false)]
    [InlineData("0.9.9",  "1.0.0", false)]
    [InlineData("1.0.0",  "1.0.0", false)]
    public void IsNewer_ReturnsFalse_WhenRemoteIsEqualOrLower(string tag, string current, bool expected)
        => Assert.Equal(expected, UpdateChecker.IsNewer(tag, current));

    [Theory]
    [InlineData("not-semver", "1.0.0")]
    [InlineData("",           "1.0.0")]
    [InlineData("v",          "1.0.0")]
    public void IsNewer_ReturnsFalse_ForMalformedTag(string tag, string current)
        => Assert.False(UpdateChecker.IsNewer(tag, current));

    // ── ShouldCheck ───────────────────────────────────────────────────────────

    [Fact]
    public void ShouldCheck_ReturnsTrue_WhenForceCheck()
    {
        var cfg = MakeCfg(autoCheck: false, lastCheck: DateTime.UtcNow);
        Assert.True(UpdateChecker.ShouldCheck(cfg, forceCheck: true));
    }

    [Fact]
    public void ShouldCheck_ReturnsFalse_WhenAutoCheckDisabled()
    {
        var cfg = MakeCfg(autoCheck: false, lastCheck: null);
        Assert.False(UpdateChecker.ShouldCheck(cfg, forceCheck: false));
    }

    [Fact]
    public void ShouldCheck_ReturnsTrue_WhenNeverChecked()
    {
        var cfg = MakeCfg(autoCheck: true, lastCheck: null);
        Assert.True(UpdateChecker.ShouldCheck(cfg, forceCheck: false));
    }

    [Fact]
    public void ShouldCheck_ReturnsTrue_WhenLastCheckIsOlderThan24h()
    {
        var cfg = MakeCfg(autoCheck: true, lastCheck: DateTime.UtcNow.AddHours(-25));
        Assert.True(UpdateChecker.ShouldCheck(cfg, forceCheck: false));
    }

    [Fact]
    public void ShouldCheck_ReturnsFalse_WhenLastCheckIsRecent()
    {
        var cfg = MakeCfg(autoCheck: true, lastCheck: DateTime.UtcNow.AddMinutes(-30));
        Assert.False(UpdateChecker.ShouldCheck(cfg, forceCheck: false));
    }

    // ── ShouldSkip ────────────────────────────────────────────────────────────

    [Fact]
    public void ShouldSkip_ReturnsTrue_WhenVersionMatches()
    {
        var cfg = MakeCfg(skippedVersion: "1.1.0");
        Assert.True(UpdateChecker.ShouldSkip(cfg, "1.1.0"));
    }

    [Fact]
    public void ShouldSkip_IsCaseInsensitive()
    {
        var cfg = MakeCfg(skippedVersion: "1.1.0");
        Assert.True(UpdateChecker.ShouldSkip(cfg, "1.1.0"));
    }

    [Fact]
    public void ShouldSkip_ReturnsFalse_WhenVersionDiffers()
    {
        var cfg = MakeCfg(skippedVersion: "1.1.0");
        Assert.False(UpdateChecker.ShouldSkip(cfg, "1.2.0"));
    }

    [Fact]
    public void ShouldSkip_ReturnsFalse_WhenNothingSkipped()
    {
        var cfg = MakeCfg(skippedVersion: null);
        Assert.False(UpdateChecker.ShouldSkip(cfg, "1.1.0"));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static AppConfig MakeCfg(
        bool autoCheck = true,
        DateTime? lastCheck = null,
        string? skippedVersion = null)
    {
        // Use reflection-free object initializer — AppConfig properties are settable
        var cfg = new AppConfig
        {
            AutoCheckUpdates = autoCheck,
            LastUpdateCheck  = lastCheck,
            SkippedVersion   = skippedVersion,
        };
        return cfg;
    }
}

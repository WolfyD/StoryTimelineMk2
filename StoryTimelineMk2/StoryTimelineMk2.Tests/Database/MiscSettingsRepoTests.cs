using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class MiscSettingsRepoTests
{
    [Fact]
    public void Get_ReturnsNull_WhenKeyMissing()
    {
        using var ctx = new DbTestContext();
        var repo = new MiscSettingsRepo();

        Assert.Null(repo.Get("nope"));
    }

    [Fact]
    public void Set_ThenGet_RoundTrips()
    {
        using var ctx = new DbTestContext();
        var repo = new MiscSettingsRepo();

        repo.Set("theme", "dark");

        Assert.Equal("dark", repo.Get("theme"));
    }

    [Fact]
    public void Set_OverwritesExistingValue_WithoutDuplicatingRows()
    {
        using var ctx = new DbTestContext();
        var repo = new MiscSettingsRepo();
        repo.Set("theme", "dark");

        repo.Set("theme", "light");

        Assert.Equal("light", repo.Get("theme"));
        using var db = ctx.OpenConnection();
        Assert.Equal(1, db.QuerySingle<int>("SELECT COUNT(*) FROM misc_settings WHERE key = 'theme'"));
    }

    [Fact]
    public void Set_ScopesValuesByTimelineId()
    {
        using var ctx = new DbTestContext();
        var repo = new MiscSettingsRepo();

        repo.Set("zoom", "app");
        repo.Set("zoom", "tl5", timelineId: 5);

        Assert.Equal("app", repo.Get("zoom"));
        Assert.Equal("tl5", repo.Get("zoom", timelineId: 5));
        Assert.Null(repo.Get("zoom", timelineId: 6));
    }

    [Fact]
    public void Delete_RemovesOnlyThatTimelineScope()
    {
        using var ctx = new DbTestContext();
        var repo = new MiscSettingsRepo();
        repo.Set("zoom", "app");
        repo.Set("zoom", "tl5", timelineId: 5);

        repo.Delete("zoom", timelineId: 5);

        Assert.Null(repo.Get("zoom", timelineId: 5));
        Assert.Equal("app", repo.Get("zoom"));
    }
}

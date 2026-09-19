using StoryTimelineMk2.Database;
using Microsoft.Data.Sqlite;
using Dapper;
using System.Windows.Forms;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// usage.sqlite lives next to the executable (Application.StartupPath), not under DataRoot,
/// so this context wipes and re-seeds that file instead of using DbTestContext.
/// </summary>
public sealed class StatsDbContext : IDisposable
{
    public string DbPath { get; } = StatsDbInitializer.GetStatsDbPath();

    public StatsDbContext()
    {
        Wipe();
        StatsDbInitializer.Initialize();
    }

    public SqliteConnection OpenConnection()
    {
        var conn = new SqliteConnection($"Data Source={DbPath}");
        conn.Open();
        return conn;
    }

    private void Wipe()
    {
        SqliteConnection.ClearAllPools();
        if (File.Exists(DbPath)) File.Delete(DbPath);
    }

    public void Dispose() => Wipe();
}

[Collection("Database")]
public class StatsRepoTests
{
    // ── StatsDbInitializer ────────────────────────────────────────────────────

    [Fact]
    public void GetStatsDbPath_IsUsageSqlite_NextToExecutable()
    {
        string path = StatsDbInitializer.GetStatsDbPath();

        Assert.Equal("usage.sqlite", Path.GetFileName(path));
        Assert.Equal(Application.StartupPath.TrimEnd(Path.DirectorySeparatorChar), Path.GetDirectoryName(path));
    }

    [Fact]
    public void Initialize_SeedsTestDefs_AndIsIdempotent()
    {
        using var ctx = new StatsDbContext();

        StatsDbInitializer.Initialize();

        using var db = ctx.OpenConnection();
        Assert.Equal(2, db.QuerySingle<int>("SELECT COUNT(*) FROM achievement_defs"));
        Assert.Equal(1, db.QuerySingle<int>("SELECT COUNT(*) FROM character_defs"));
        Assert.Equal(2, db.QuerySingle<int>("SELECT COUNT(*) FROM character_tier_defs"));
        Assert.Equal(1, db.QuerySingle<int>("SELECT COUNT(*) FROM character_event_contributions"));
    }

    // ── Sessions ──────────────────────────────────────────────────────────────

    [Fact]
    public void OpenSession_ReturnsIncreasingIds_AndStoresStart()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        long first = repo.OpenSession();
        long second = repo.OpenSession();

        Assert.True(first > 0);
        Assert.True(second > first);
        using var db = ctx.OpenConnection();
        Assert.False(string.IsNullOrEmpty(db.QuerySingle<string>("SELECT started_at FROM usage_sessions WHERE id = @Id", new { Id = first })));
        Assert.Null(db.QuerySingle<string?>("SELECT ended_at FROM usage_sessions WHERE id = @Id", new { Id = first }));
    }

    [Fact]
    public void CloseSession_SetsEndedAt_AndDurationFromStart()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        long id = repo.OpenSession();
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE usage_sessions SET started_at = @Start WHERE id = @Id",
            new { Start = DateTime.UtcNow.AddSeconds(-90).ToString("O"), Id = id });

        repo.CloseSession(id);

        Assert.False(string.IsNullOrEmpty(db.QuerySingle<string?>("SELECT ended_at FROM usage_sessions WHERE id = @Id", new { Id = id })));
        int duration = db.QuerySingle<int>("SELECT duration_seconds FROM usage_sessions WHERE id = @Id", new { Id = id });
        Assert.InRange(duration, 90, 100);
    }

    // ── Events ────────────────────────────────────────────────────────────────

    [Fact]
    public void RecordItemEvent_StoresRow()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        long session = repo.OpenSession();

        repo.RecordItemEvent(session, "created", itemTypeId: 2, timelineId: 7);

        using var db = ctx.OpenConnection();
        var row = db.QuerySingle("SELECT * FROM item_events");
        Assert.Equal(session, (long)row.session_id);
        Assert.Equal("created", (string)row.event_type);
        Assert.Equal(2L, (long)row.item_type_id);
        Assert.Equal(7L, (long)row.timeline_id);
        Assert.False(string.IsNullOrEmpty((string)row.occurred_at));
    }

    [Fact]
    public void RecordItemEvent_AllowsNullTimeline()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        long session = repo.OpenSession();

        repo.RecordItemEvent(session, "deleted", itemTypeId: 1, timelineId: null);

        using var db = ctx.OpenConnection();
        Assert.Null(db.QuerySingle<int?>("SELECT timeline_id FROM item_events"));
    }

    [Fact]
    public void RecordActivityEvent_StoresRow()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        long session = repo.OpenSession();

        repo.RecordActivityEvent(session, "export");

        using var db = ctx.OpenConnection();
        var row = db.QuerySingle("SELECT * FROM activity_events");
        Assert.Equal(session, (long)row.session_id);
        Assert.Equal("export", (string)row.event_type);
        Assert.False(string.IsNullOrEmpty((string)row.occurred_at));
    }

    // ── Achievement definitions ───────────────────────────────────────────────

    [Fact]
    public void GetAchievementDef_ReturnsSeededDef()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        var def = repo.GetAchievementDef("test_achievement");

        Assert.NotNull(def);
        Assert.Equal("Test Achievement", def.Title);
        Assert.Equal("achievement", def.Tier);
        Assert.Equal("test", def.TriggerType);
        Assert.Equal(9999, def.SortOrder);
        Assert.True(def.IsActive);
    }

    [Fact]
    public void GetAchievementDef_ReturnsNull_ForUnknownOrInactiveKey()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE achievement_defs SET is_active = 0 WHERE achievement_key = 'test_milestone'");

        Assert.Null(repo.GetAchievementDef("nope"));
        Assert.Null(repo.GetAchievementDef("test_milestone"));
    }

    [Fact]
    public void GetAllDefs_ReturnsOnlyActive_OrderedBySortOrder()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO achievement_defs (achievement_key, title, flavor_text, tier, trigger_type, sort_order, is_active)
                     VALUES ('early', 'Early', '', 'achievement', 'test', 1, 1),
                            ('hidden', 'Hidden', '', 'achievement', 'test', 2, 0)");

        var defs = repo.GetAllDefs().ToList();

        Assert.Equal(["early", "test_achievement", "test_milestone"], defs.Select(d => d.AchievementKey).ToList());
    }

    [Fact]
    public void GetRandomDef_ReturnsActiveDefOfRequestedTier()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        var def = repo.GetRandomDef("milestone");

        Assert.NotNull(def);
        Assert.Equal("test_milestone", def.AchievementKey);
        Assert.Null(repo.GetRandomDef("legendary"));
    }

    // ── Earned achievements ───────────────────────────────────────────────────

    [Fact]
    public void MarkEarned_ThenIsEarned_ReturnsTrue_AndKeepsFirstContext()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        Assert.False(repo.IsEarned("test_achievement"));

        repo.MarkEarned("test_achievement", contextValue: 5);
        repo.MarkEarned("test_achievement", contextValue: 99); // INSERT OR IGNORE — first win sticks

        Assert.True(repo.IsEarned("test_achievement"));
        using var db = ctx.OpenConnection();
        Assert.Equal(1, db.QuerySingle<int>("SELECT COUNT(*) FROM achievements_earned"));
        Assert.Equal(5, db.QuerySingle<int>("SELECT context_value FROM achievements_earned WHERE achievement_key = 'test_achievement'"));
    }

    // ── Character definitions ─────────────────────────────────────────────────

    [Fact]
    public void GetCharacterDef_ReturnsSeededCharacter_OrNull()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        var def = repo.GetCharacterDef("test_character");

        Assert.NotNull(def);
        Assert.Equal("Test Character", def.CharacterName);
        Assert.False(string.IsNullOrEmpty(def.Description));
        Assert.Null(repo.GetCharacterDef("nope"));
    }

    [Fact]
    public void GetCharacterTiers_ReturnsTiersOrderedByNumber()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        var tiers = repo.GetCharacterTiers("test_character").ToList();

        Assert.Equal([1, 2], tiers.Select(t => t.TierNumber).ToList());
        Assert.Equal([5, 20], tiers.Select(t => t.PointsRequired).ToList());
        Assert.Equal("Apprentice Chronicler", tiers[0].Title);
        Assert.Empty(repo.GetCharacterTiers("nope"));
    }

    [Fact]
    public void GetContributionsForEvent_MatchesWildcardAndExactItemType_Only()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO character_event_contributions (character_key, event_type, item_type_id, points)
                     VALUES ('test_character', 'created', 2, 3),
                            ('test_character', 'created', 4, 9),
                            ('test_character', 'deleted', NULL, 1)");

        var forPeriod = repo.GetContributionsForEvent("created", 2).ToList();

        Assert.Equal(2, forPeriod.Count); // seeded wildcard (NULL) + the exact type-2 row
        Assert.Contains(forPeriod, c => c.ItemTypeId == null && c.Points == 1);
        Assert.Contains(forPeriod, c => c.ItemTypeId == 2 && c.Points == 3);
        Assert.Single(repo.GetContributionsForEvent("created", 1)); // wildcard only
        Assert.Empty(repo.GetContributionsForEvent("renamed", 2));
    }

    // ── Character progress ────────────────────────────────────────────────────

    [Fact]
    public void AddCharacterPoints_InsertsThenAccumulates()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        Assert.Null(repo.GetCharacterProgress("test_character"));

        repo.AddCharacterPoints("test_character", 3);
        repo.AddCharacterPoints("test_character", 4);

        var progress = repo.GetCharacterProgress("test_character");
        Assert.NotNull(progress);
        Assert.Equal(7, progress.PointsTotal);
        Assert.Equal(0, progress.HighestTierReached);
        Assert.False(string.IsNullOrEmpty(progress.LastUpdated));
    }

    [Fact]
    public void UpdateHighestTier_SetsTier_OnExistingProgress()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();
        repo.AddCharacterPoints("test_character", 5);

        repo.UpdateHighestTier("test_character", 1);

        Assert.Equal(1, repo.GetCharacterProgress("test_character")!.HighestTierReached);
    }

    [Fact]
    public void UpdateHighestTier_IsNoOp_WithoutProgressRow()
    {
        using var ctx = new StatsDbContext();
        var repo = new StatsRepo();

        repo.UpdateHighestTier("test_character", 2);

        Assert.Null(repo.GetCharacterProgress("test_character"));
    }
}

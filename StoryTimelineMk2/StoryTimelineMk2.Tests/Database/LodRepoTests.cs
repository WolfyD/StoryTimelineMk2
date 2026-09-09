using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class LodRepoTests
{
    private static LodItem MakeLod(string? id = null) => new()
    {
        Id = id ?? Guid.NewGuid().ToString(),
        Name = "Test LOD Profile",
        Profile = "[{\"index\":0,\"formatKey\":\"YEARS\",\"stepFraction\":1}]"
    };

    // ── GetAll ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetAll_ReturnsAtLeastTheDefaultProfile_OnFreshDb()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var all = repo.GetAll().ToList();

        Assert.Contains(all, l => l.Id == "lod_default");
    }

    [Fact]
    public void GetAll_ReturnsAllProfiles_AfterInsertion()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = MakeLod();
        repo.SaveLodProfile(lod);

        var all = repo.GetAll().ToList();

        Assert.Contains(all, l => l.Id == lod.Id);
    }

    [Fact]
    public void GetAll_IsOrderedByName()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        repo.SaveLodProfile(new LodItem { Id = "z-lod", Name = "ZZZ Profile", Profile = "[]" });
        repo.SaveLodProfile(new LodItem { Id = "a-lod", Name = "AAA Profile", Profile = "[]" });

        var all = repo.GetAll().ToList();
        var names = all.Select(l => l.Name).ToList();

        Assert.Equal(names.OrderBy(n => n).ToList(), names);
    }

    // ── GetLodById ────────────────────────────────────────────────────────────

    [Fact]
    public void GetLodById_ReturnsDefaultProfile_WhenRequestingDefaultId()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = repo.GetLodById("lod_default");

        Assert.NotNull(lod);
        Assert.Equal("lod_default", lod.Id);
        Assert.Equal("Standard Gregorian Scale", lod.Name);
    }

    [Fact]
    public void GetLodById_ReturnsCorrectProfile_AfterSave()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = MakeLod("lod-test-123");
        lod.Name = "Custom Test LOD";
        repo.SaveLodProfile(lod);

        var retrieved = repo.GetLodById("lod-test-123");

        Assert.Equal("Custom Test LOD", retrieved.Name);
        Assert.Equal(lod.Profile, retrieved.Profile);
    }

    [Fact]
    public void GetLodById_Throws_WhenIdDoesNotExist()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();

        Assert.Throws<InvalidOperationException>(() => repo.GetLodById("does-not-exist"));
    }

    // ── SaveLodProfile (insert + upsert) ──────────────────────────────────────

    [Fact]
    public void SaveLodProfile_InsertsNewProfile()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = MakeLod();
        repo.SaveLodProfile(lod);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = @Id", new { lod.Id });
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveLodProfile_UpdatesExistingProfile_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = MakeLod("lod-update-test");
        repo.SaveLodProfile(lod);

        lod.Name = "Updated Name";
        lod.Profile = "[{\"updated\":true}]";
        repo.SaveLodProfile(lod);

        var retrieved = repo.GetLodById("lod-update-test");
        Assert.Equal("Updated Name", retrieved.Name);
        Assert.Equal("[{\"updated\":true}]", retrieved.Profile);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod-update-test'");
        Assert.Equal(1, count);
    }

    // ── DeleteCalendar (misnamed — actually deletes a lod_profile row) ─────────

    [Fact]
    public void DeleteCalendar_RemovesTheLodProfile()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var lod = MakeLod("lod-to-delete");
        repo.SaveLodProfile(lod);

        repo.DeleteCalendar("lod-to-delete");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod-to-delete'");
        Assert.Equal(0, count);
    }

    [Fact]
    public void DeleteCalendar_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new LodRepo();
        var ex = Record.Exception(() => repo.DeleteCalendar("does-not-exist"));
        Assert.Null(ex);
    }
}

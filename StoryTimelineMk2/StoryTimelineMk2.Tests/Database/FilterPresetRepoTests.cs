using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class FilterPresetRepoTests
{
    private static FilterPresetItem MakePreset(string name = "Preset") => new()
    {
        Id = Guid.NewGuid().ToString(),
        Name = name,
        RulesJson = "[{\"dimension\":\"tag\"}]",
        AndMode = 1,
    };

    [Fact]
    public void GetAll_ReturnsEmpty_OnFreshDatabase()
    {
        using var ctx = new DbTestContext();
        var repo = new FilterPresetRepo();

        Assert.Empty(repo.GetAll());
    }

    [Fact]
    public void Save_ThenGetAll_RoundTripsFields_AndStampsCreatedAt()
    {
        using var ctx = new DbTestContext();
        var repo = new FilterPresetRepo();
        var preset = MakePreset("Epic only");

        repo.Save(preset);

        var stored = Assert.Single(repo.GetAll());
        Assert.Equal(preset.Id, stored.Id);
        Assert.Equal("Epic only", stored.Name);
        Assert.Equal("[{\"dimension\":\"tag\"}]", stored.RulesJson);
        Assert.Equal(1, stored.AndMode);
        Assert.False(string.IsNullOrEmpty(stored.CreatedAt));
    }

    [Fact]
    public void Save_UpsertsExistingPreset()
    {
        using var ctx = new DbTestContext();
        var repo = new FilterPresetRepo();
        var preset = MakePreset();
        repo.Save(preset);

        preset.Name = "renamed";
        preset.RulesJson = "[]";
        preset.AndMode = 0;
        repo.Save(preset);

        var stored = Assert.Single(repo.GetAll());
        Assert.Equal("renamed", stored.Name);
        Assert.Equal("[]", stored.RulesJson);
        Assert.Equal(0, stored.AndMode);
    }

    [Fact]
    public void Delete_RemovesOnlyThatPreset()
    {
        using var ctx = new DbTestContext();
        var repo = new FilterPresetRepo();
        var keep = MakePreset("keep");
        var drop = MakePreset("drop");
        repo.Save(keep);
        repo.Save(drop);

        repo.Delete(drop.Id);

        var remaining = Assert.Single(repo.GetAll());
        Assert.Equal(keep.Id, remaining.Id);
    }
}

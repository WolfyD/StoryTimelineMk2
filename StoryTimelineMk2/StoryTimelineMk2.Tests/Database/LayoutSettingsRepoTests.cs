using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class LayoutSettingsRepoTests
{
    /// <summary>
    /// Creates a fully-populated LayoutSettingsItem suitable for insert/upsert tests.
    /// </summary>
    private static LayoutSettingsItem MakeLayoutSettings(string? id = null, string name = "Test Preset") => new()
    {
        Id   = id ?? Guid.NewGuid().ToString(),
        Name = name,

        TimelineEventBoxWidth             = 120,
        TimelineEventBoxHeight            = 28,
        TimelineEventBoxStemOffset        = 8,
        TimelineEventBorderColor          = "#000",
        TimelineEventBorderWidth          = 1,
        TimelineEventBorderRadius         = 3,
        TimelineEventPadding              = "5",
        TimelineEventYMargin              = 4,
        TimelineEventTextColor            = "#222",
        TimelineEventBackgroundColor      = "#fff",
        TimelineEventFontFamily           = "Verdana",
        TimelineEventFontSize             = 14,
        TimelineEventTextUseEllipsis      = true,
        TimelineEventBoxShowColor         = true,
        TimelineEventBoxShowColorOnBottom = false,
        TimelineEventHasHoverHighlight    = true,
        TimelineEventHoverColor           = "#eee",

        TimelineAgeHeight           = 25,
        TimelineAgeCornerRounding   = 4,
        TimelinePeriodHeight        = 15,
        TimelinePeriodCornerRounding= 6,
        TimelinePeriodYMargin       = 3,
        TimelinePeriodYOffset       = 28,

        TimelineBoxTypesShowAsBox = true,
        TimelineBoxTypesBoxWidth  = 90,
        TimelineBoxTypesShowImage = true,

        TimelineCanvasBackgroundColor = "#f5f5dc",
        TimelineShowNowLine           = true,
        TimelineShowNowLineText       = true,
        TimelineNowLineColor          = "#f00",
        TimelineNowLineStyle          = "dashed",

        TimelineTickDistance       = 100,
        TimelineTickWidth          = 1,
        TimelineNonYearTicksSmaller= true,

        TimelineTickMarkerFontFamily       = "Arial",
        TimelineTickMarkerFontStyle        = "normal",
        TimelineTickMarkerTextColor        = "#333",
        TimelineTickMarkerFontSize         = 12,
        TimelineTickMarkerTextAlwaysOnTop  = false,

        TimelineShowHoverLine  = true,
        TimelineHoverLineColor = "#00f",
        TimelineHoverLineStyle = "solid",
        TimelineHoverLineWidth = 1,

        TimelineEdgeMarginWidth = 10,

        TimelineDataRangeWidth       = 80,
        TimelineIsDataRangeVisible   = true,
        TimelineDataRangeColor       = "#0f02",

        TimelineAnimateOnJumpToYear        = true,
        TimelineJumpToYearAnimationLength  = 500,

        TimelineAnimateLodChange         = true,
        TimelineLodChangeAnimationLength = 150
    };

    // ── GetById ───────────────────────────────────────────────────────────────

    [Fact]
    public void GetById_ReturnsDefaultPreset_OnFreshDb()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var ls = repo.GetById("ls_default");

        Assert.NotNull(ls);
        Assert.Equal("ls_default", ls.Id);
        Assert.Equal("Default (Light)", ls.Name);
    }

    [Fact]
    public void GetById_ReturnsCorrectPreset_AfterSave()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-test-001", "My Custom Preset");
        repo.SaveLayoutSettings(preset);

        var retrieved = repo.GetById("ls-test-001");
        Assert.Equal("My Custom Preset", retrieved.Name);
        Assert.Equal(120, retrieved.TimelineEventBoxWidth);
        Assert.Equal("Verdana", retrieved.TimelineEventFontFamily);
    }

    [Fact]
    public void GetById_Throws_WhenIdDoesNotExist()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        Assert.Throws<InvalidOperationException>(() => repo.GetById("ls-does-not-exist"));
    }

    // ── GetAll ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetAll_ReturnsAtLeastDefaultPreset_OnFreshDb()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var all = repo.GetAll().ToList();

        Assert.Contains(all, ls => ls.Id == "ls_default");
    }

    [Fact]
    public void GetAll_ReturnsAllPresets_AfterInsertion()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-extra-1", "Extra One"));
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-extra-2", "Extra Two"));

        var all = repo.GetAll().ToList();
        Assert.Contains(all, ls => ls.Id == "ls-extra-1");
        Assert.Contains(all, ls => ls.Id == "ls-extra-2");
    }

    [Fact]
    public void GetAll_IsOrderedByName()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-zzz", "ZZZ Preset"));
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-aaa", "AAA Preset"));

        var all = repo.GetAll().ToList();
        var names = all.Select(ls => ls.Name).ToList();
        Assert.Equal(names.OrderBy(n => n).ToList(), names);
    }

    // ── CheckIfLayoutNameExists ───────────────────────────────────────────────

    [Fact]
    public void CheckIfLayoutNameExists_ReturnsFalse_WhenNameDoesNotExist()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        Assert.False(repo.CheckIfLayoutNameExists("This Name Does Not Exist"));
    }

    [Fact]
    public void CheckIfLayoutNameExists_ReturnsTrue_WhenDefaultPresetNameUsed()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        Assert.True(repo.CheckIfLayoutNameExists("Default (Light)"));
    }

    [Fact]
    public void CheckIfLayoutNameExists_ReturnsTrue_AfterSavingPreset()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        repo.SaveLayoutSettings(MakeLayoutSettings(name: "Unique Preset Name"));

        Assert.True(repo.CheckIfLayoutNameExists("Unique Preset Name"));
    }

    // ── SaveLayoutSettings (insert + upsert) ──────────────────────────────────

    [Fact]
    public void SaveLayoutSettings_InsertsNewPreset()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-insert-test");
        repo.SaveLayoutSettings(preset);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls-insert-test'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveLayoutSettings_UpdatesExistingPreset_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-upsert-test", "Original Name");
        repo.SaveLayoutSettings(preset);

        preset.Name = "Updated Name";
        preset.TimelineEventBoxWidth = 200;
        repo.SaveLayoutSettings(preset);

        var retrieved = repo.GetById("ls-upsert-test");
        Assert.Equal("Updated Name", retrieved.Name);
        Assert.Equal(200, retrieved.TimelineEventBoxWidth);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls-upsert-test'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveLayoutSettings_PersistsBooleanFields_Correctly()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-bool-test");
        preset.TimelineEventTextUseEllipsis      = false;
        preset.TimelineEventBoxShowColor         = false;
        preset.TimelineEventBoxShowColorOnBottom = true;
        preset.TimelineAnimateOnJumpToYear       = false;
        repo.SaveLayoutSettings(preset);

        var retrieved = repo.GetById("ls-bool-test");
        Assert.False(retrieved.TimelineEventTextUseEllipsis);
        Assert.False(retrieved.TimelineEventBoxShowColor);
        Assert.True(retrieved.TimelineEventBoxShowColorOnBottom);
        Assert.False(retrieved.TimelineAnimateOnJumpToYear);
    }

    // ── UpdateDisplayFields ───────────────────────────────────────────────────

    [Fact]
    public void UpdateDisplayFields_ChangesSpecifiedFields_LeavesOthersUnchanged()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-display-test");
        repo.SaveLayoutSettings(preset);

        repo.UpdateDisplayFields("ls-display-test", "Georgia", 18, "#111", "#222");

        var updated = repo.GetById("ls-display-test");
        Assert.Equal("Georgia", updated.TimelineTickMarkerFontFamily);
        Assert.Equal("Georgia", updated.TimelineEventFontFamily);
        Assert.Equal(18, updated.TimelineTickMarkerFontSize);
        Assert.Equal(18, updated.TimelineEventFontSize);
        Assert.Equal("#111", updated.TimelineTickMarkerTextColor);
        Assert.Equal("#222", updated.TimelineCanvasBackgroundColor);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    [Fact]
    public void Delete_RemovesPresetFromDatabase()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var preset = MakeLayoutSettings("ls-to-delete");
        repo.SaveLayoutSettings(preset);

        repo.Delete("ls-to-delete");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls-to-delete'");
        Assert.Equal(0, count);
    }

    [Fact]
    public void Delete_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        var ex = Record.Exception(() => repo.Delete("ls-nonexistent"));
        Assert.Null(ex);
    }

    [Fact]
    public void Delete_LeavesOtherPresetsIntact()
    {
        using var ctx = new DbTestContext();

        var repo = new LayoutSettingsRepo();
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-keep", "Keep Me"));
        repo.SaveLayoutSettings(MakeLayoutSettings("ls-del", "Delete Me"));

        repo.Delete("ls-del");

        using var db = ctx.OpenConnection();
        var keepCount = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls-keep'");
        Assert.Equal(1, keepCount);
    }
}

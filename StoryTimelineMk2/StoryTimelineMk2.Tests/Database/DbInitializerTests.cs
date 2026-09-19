using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class DbInitializerTests
{
    private static readonly string[] ExpectedTables =
    [
        "timelines", "timeline_calendars", "calendars", "lod_profiles", "stories",
        "item_types", "items", "notes", "pictures", "item_pictures", "settings",
        "tags", "item_tags", "characters", "relationship_types", "item_characters",
        "layout_settings", "character_relationships", "item_story_refs", "books",
        "book_stories", "chapters", "item_chapters", "timeline_hidden_ranges",
        "item_character_appearances"
    ];

    private static readonly string[] ExpectedIndexes =
    [
        "idx_items_timeline_id", "idx_items_year", "idx_item_pictures_combined",
        "idx_tags_name", "idx_char_rel_char1", "idx_char_rel_char2", "idx_char_rel_timeline",
        "idx_item_story_refs_item", "idx_item_story_refs_story", "idx_chapters_book",
        "idx_item_chapters_item", "idx_item_chapters_chapter", "idx_item_char_app_item",
        "idx_item_char_app_char", "idx_hidden_ranges_timeline", "idx_settings_timeline_id",
        "idx_characters_timeline_id", "idx_notes_timeline_id"
    ];

    [Fact]
    public void Initialize_CreatesAllExpectedTables()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var tables = db.Query<string>(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").ToList();

        foreach (var expected in ExpectedTables)
        {
            Assert.Contains(expected, tables);
        }
    }

    [Fact]
    public void Initialize_CreatesAllExpectedIndexes()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var indexes = db.Query<string>(
            "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name").ToList();

        foreach (var expected in ExpectedIndexes)
        {
            Assert.Contains(expected, indexes);
        }
    }

    [Fact]
    public void Initialize_SeedsNineItemTypes()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM item_types");
        Assert.Equal(9, count);
    }

    [Fact]
    public void Initialize_SeedsCorrectItemTypeNames()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var names = db.Query<string>("SELECT name FROM item_types ORDER BY id").ToList();

        Assert.Equal(
            ["Event", "Period", "Age", "Picture", "Note", "Bookmark", "Character", "Timeline_start", "Timeline_end"],
            names);
    }

    [Fact]
    public void Initialize_SeedsDefaultLodProfile()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod_default'");
        Assert.Equal(1, count);

        var name = db.QuerySingle<string>("SELECT name FROM lod_profiles WHERE id = 'lod_default'");
        Assert.Equal("Standard Gregorian Scale", name);
    }

    [Fact]
    public void Initialize_SeedsDefaultCalendar()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal_default_gregorian'");
        Assert.Equal(1, count);

        var cal = db.QuerySingle("SELECT name, short_name FROM calendars WHERE id = 'cal_default_gregorian'");
        Assert.Equal("Gregorian", (string)cal.name);
        Assert.Equal("Greg.", (string)cal.short_name);
    }

    [Fact]
    public void Initialize_SeedsDefaultLayoutSettings()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls_default'");
        Assert.Equal(1, count);

        var name = db.QuerySingle<string>("SELECT name FROM layout_settings WHERE id = 'ls_default'");
        Assert.Equal("Default layout settings", name);
    }

    [Fact]
    public void Initialize_CalledTwice_IsIdempotent_NoErrors()
    {
        using var ctx = new DbTestContext();

        // Second call must not throw
        var ex = Record.Exception(() => DbInitializer.Initialize());
        Assert.Null(ex);
    }

    [Fact]
    public void Initialize_CalledTwice_DoesNotDuplicateItemTypes()
    {
        using var ctx = new DbTestContext();
        DbInitializer.Initialize();

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM item_types");
        Assert.Equal(9, count);
    }

    [Fact]
    public void Initialize_CalledTwice_DoesNotDuplicateLodProfile()
    {
        using var ctx = new DbTestContext();
        DbInitializer.Initialize();

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod_default'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Initialize_CalledTwice_DoesNotDuplicateCalendar()
    {
        using var ctx = new DbTestContext();
        DbInitializer.Initialize();

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal_default_gregorian'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Initialize_CalledTwice_DoesNotDuplicateLayoutSettings()
    {
        using var ctx = new DbTestContext();
        DbInitializer.Initialize();

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE id = 'ls_default'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Initialize_DefaultLayoutSettings_HasCorrectPeriodHeight()
    {
        // The migration in SeedDefaultData sets timeline_period_height = 15 for ls_default
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var height = db.QuerySingle<int>(
            "SELECT timeline_period_height FROM layout_settings WHERE id = 'ls_default'");
        Assert.Equal(15, height);
    }

    [Fact]
    public void Initialize_DefaultCalendar_ReferencesDefaultLodProfile()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();

        var lodId = db.QuerySingle<string>(
            "SELECT lod_profile_id FROM calendars WHERE id = 'cal_default_gregorian'");
        Assert.Equal("lod_default", lodId);
    }

    // ── ResetBuiltinPreset ────────────────────────────────────────────────────

    [Theory]
    [InlineData("ls_default", "Default layout settings")]
    [InlineData("ls_dark", "Dark Mode")]
    public void ResetBuiltinPreset_RestoresBuiltinValues(string id, string expectedName)
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE layout_settings SET name = 'tampered', timeline_period_height = 999 WHERE id = @Id", new { Id = id });

        DbInitializer.ResetBuiltinPreset(id);

        Assert.Equal(expectedName, db.QuerySingle<string>("SELECT name FROM layout_settings WHERE id = @Id", new { Id = id }));
        Assert.Equal(15, db.QuerySingle<int>("SELECT timeline_period_height FROM layout_settings WHERE id = @Id", new { Id = id }));
    }

    [Fact]
    public void ResetBuiltinPreset_TouchesOnlyTheNamedPreset()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE layout_settings SET name = 'tampered' WHERE id IN ('ls_default', 'ls_dark')");

        DbInitializer.ResetBuiltinPreset("ls_default");

        Assert.Equal("Default layout settings", db.QuerySingle<string>("SELECT name FROM layout_settings WHERE id = 'ls_default'"));
        Assert.Equal("tampered", db.QuerySingle<string>("SELECT name FROM layout_settings WHERE id = 'ls_dark'"));
    }

    [Fact]
    public void ResetBuiltinPreset_IgnoresUnknownIds()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE layout_settings SET name = 'tampered' WHERE id = 'ls_default'");

        DbInitializer.ResetBuiltinPreset("ls_custom");

        Assert.Equal("tampered", db.QuerySingle<string>("SELECT name FROM layout_settings WHERE id = 'ls_default'"));
    }
}

using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class TimelineRepoTests
{
    // ── helpers ───────────────────────────────────────────────────────────────

    private static int InsertTimeline(DbTestContext ctx, string title = "My Timeline", string author = "Test Author")
    {
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO timelines (title, author, description, start_year)
            VALUES (@Title, @Author, '', 0)",
            new { Title = title, Author = author });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    // ── CreateTimeline ────────────────────────────────────────────────────────

    [Fact]
    public void CreateTimeline_ReturnsPositiveId()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int id = repo.CreateTimeline("Brand New Timeline");
        Assert.True(id > 0);
    }

    [Fact]
    public void CreateTimeline_StoresAuthor()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("Author Timeline", author: "Jane Doe");

        using var db = ctx.OpenConnection();
        var stored = db.QuerySingle<string>(
            "SELECT author FROM timelines WHERE title = 'Author Timeline'");
        Assert.Equal("Jane Doe", stored);
    }

    [Fact]
    public void CreateTimeline_DefaultsToEmptyAuthor_WhenNotProvided()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("No Author Timeline");

        using var db = ctx.OpenConnection();
        var stored = db.QuerySingle<string>(
            "SELECT author FROM timelines WHERE title = 'No Author Timeline'");
        Assert.Equal("", stored);
    }

    [Fact]
    public void CreateTimeline_StoresCalendarId()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("Calendar Timeline", calendarId: "cal_default_gregorian");

        using var db = ctx.OpenConnection();
        var stored = db.QuerySingle<string>(
            "SELECT calendar_id FROM timelines WHERE title = 'Calendar Timeline'");
        Assert.Equal("cal_default_gregorian", stored);
    }

    [Fact]
    public void CreateTimeline_DefaultsCalendarToGregorian_WhenNullProvided()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("Default Cal Timeline");

        using var db = ctx.OpenConnection();
        var stored = db.QuerySingle<string>(
            "SELECT calendar_id FROM timelines WHERE title = 'Default Cal Timeline'");
        Assert.Equal("cal_default_gregorian", stored);
    }

    [Fact]
    public void CreateTimeline_GeneratesValidHexColor()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("Color Timeline");

        using var db = ctx.OpenConnection();
        var color = db.QuerySingle<string?>(
            "SELECT color FROM timelines WHERE title = 'Color Timeline'");
        Assert.NotNull(color);
        Assert.Matches(@"^#[0-9A-Fa-f]{6}$", color);
    }

    [Fact]
    public void CreateTimeline_ReturnsMinus1_ForDuplicateTitle()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        repo.CreateTimeline("Dupe Title");
        int result = repo.CreateTimeline("Dupe Title");
        Assert.Equal(-1, result);
    }

    // ── GetAll ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetAll_ReturnsEmptyList_OnFreshDatabase()
    {
        using var ctx = new DbTestContext();

        var repo = new TimelineRepo();
        var result = repo.GetAll().ToList();

        Assert.Empty(result);
    }

    [Fact]
    public void GetAll_ReturnsAllTimelines_AfterInsertion()
    {
        using var ctx = new DbTestContext();
        InsertTimeline(ctx, "Timeline A");
        InsertTimeline(ctx, "Timeline B");

        var repo = new TimelineRepo();
        var result = repo.GetAll().ToList();

        Assert.Equal(2, result.Count);
        var titles = result.Select(t => t.Title).OrderBy(t => t).ToList();
        Assert.Equal(["Timeline A", "Timeline B"], titles);
    }

    // ── UpdateTimelineInfo / retrieval ────────────────────────────────────────

    [Fact]
    public void UpdateTimelineInfo_ChangesTitle_AndCanBeRetrieved()
    {
        using var ctx = new DbTestContext();
        int id = InsertTimeline(ctx, "Original Title");

        var repo = new TimelineRepo();
        repo.UpdateTimelineInfo(id, "New Title", "New Author", "desc", 1000, null);

        var all = repo.GetAll().ToList();
        var updated = all.First(t => t.Id == id);
        Assert.Equal("New Title", updated.Title);
        Assert.Equal("New Author", updated.Author);
    }

    // ── DeleteTimeline ────────────────────────────────────────────────────────

    [Fact]
    public void DeleteTimeline_RemovesTheTimeline()
    {
        using var ctx = new DbTestContext();
        int id = InsertTimeline(ctx, "To Delete");

        var repo = new TimelineRepo();
        repo.DeleteTimeline(id);

        var all = repo.GetAll().ToList();
        Assert.DoesNotContain(all, t => t.Id == id);
    }

    [Fact]
    public void DeleteTimeline_CascadesAndRemovesAssociatedItems()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx, "Has Items");

        // Insert an item directly
        var itemId = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO items (id, title, type_id, year, end_year, timeline_id,
                               absolute_start, absolute_end,
                               item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask)
            VALUES (@Id, 'Event', 1, 0, 0, @TlId, 0, 0, 0, 1, 5, 3, 255)",
            new { Id = itemId, TlId = tlId });

        var repo = new TimelineRepo();
        repo.DeleteTimeline(tlId);

        var itemCount = db.QuerySingle<int>(
            "SELECT COUNT(*) FROM items WHERE id = @Id", new { Id = itemId });
        Assert.Equal(0, itemCount);
    }

    // ── CheckIfTimelineTitleExists ────────────────────────────────────────────

    [Fact]
    public void CheckIfTimelineTitleExists_ReturnsFalse_ForNewTitle()
    {
        using var ctx = new DbTestContext();

        var repo = new TimelineRepo();
        Assert.False(repo.CheckIfTimelineTitleExists("Nonexistent Title"));
    }

    [Fact]
    public void CheckIfTimelineTitleExists_ReturnsTrue_ForExistingTitle()
    {
        using var ctx = new DbTestContext();
        InsertTimeline(ctx, "Existing Title");

        var repo = new TimelineRepo();
        Assert.True(repo.CheckIfTimelineTitleExists("Existing Title"));
    }

    // ── GetTimelineById ───────────────────────────────────────────────────────

    [Fact]
    public void GetTimelineById_LoadsCalendarSettingsAndLayout()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int id = repo.CreateTimeline("Loaded Timeline", author: "Me");

        var tl = repo.GetTimelineById(id);

        Assert.Equal(id, tl.Id);
        Assert.Equal("Loaded Timeline", tl.Title);
        Assert.Equal("Me", tl.Author);
        Assert.Equal("cal_default_gregorian", tl.Calendar.Id);
        Assert.Equal("lod_default", tl.Calendar.LodProfile.Id);
        Assert.Equal(id, tl.Settings.TimelineId); // settings row is created on demand
        Assert.False(string.IsNullOrEmpty(tl.LayoutSettings.Id));
    }

    [Fact]
    public void GetTimelineById_ResolvesLayoutFromAppTheme_WhenNotLocked()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int id = repo.CreateTimeline("Unlocked Timeline");

        var tl = repo.GetTimelineById(id);

        string expected = AppConfig.Instance.ChromeTheme.IsDark() ? "ls_dark" : "ls_default";
        Assert.Equal(0, tl.LayoutSettingsLocked);
        Assert.Equal(expected, tl.LayoutSettings.Id);
    }

    [Fact]
    public void GetTimelineById_UsesStoredLayout_WhenLocked()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int id = repo.CreateTimeline("Locked Timeline");
        repo.SetLayoutPreset(id, "ls_dark");

        var tl = repo.GetTimelineById(id);

        Assert.Equal(1, tl.LayoutSettingsLocked);
        Assert.Equal("ls_dark", tl.LayoutSettingsId);
        Assert.Equal("ls_dark", tl.LayoutSettings.Id);
    }

    [Fact]
    public void GetTimelineById_Throws_ForUnknownId()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();

        Assert.ThrowsAny<InvalidOperationException>(() => repo.GetTimelineById(999_999));
    }

    // ── SetLayoutPreset ───────────────────────────────────────────────────────

    [Fact]
    public void SetLayoutPreset_StoresPresetId_AndLocksIt()
    {
        using var ctx = new DbTestContext();
        int id = InsertTimeline(ctx, "Preset Timeline");

        var repo = new TimelineRepo();
        repo.SetLayoutPreset(id, "ls_dark");

        using var db = ctx.OpenConnection();
        Assert.Equal("ls_dark", db.QuerySingle<string>("SELECT layout_settings_id FROM timelines WHERE id = @Id", new { Id = id }));
        Assert.Equal(1, db.QuerySingle<int>("SELECT layout_settings_locked FROM timelines WHERE id = @Id", new { Id = id }));
    }

    // ── SaveTimeline ──────────────────────────────────────────────────────────

    [Fact]
    public void SaveTimeline_UpdatesExistingRow()
    {
        using var ctx = new DbTestContext();
        int id = InsertTimeline(ctx, "Before");

        var repo = new TimelineRepo();
        repo.SaveTimeline(new TimelineInfo { Id = id, Title = "After", Author = "A", Description = "D", StartYear = 42 });

        var tl = repo.GetAll().Single(t => t.Id == id);
        Assert.Equal("After", tl.Title);
        Assert.Equal("A", tl.Author);
        Assert.Equal("D", tl.Description);
        Assert.Equal(42, tl.StartYear);
    }

    [Fact]
    public void SaveTimeline_InsertsRow_WhenIdIsNew()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();

        repo.SaveTimeline(new TimelineInfo { Id = 777, Title = "Inserted", Author = "", Description = "", StartYear = 0 });

        var tl = repo.GetAll().Single(t => t.Id == 777);
        Assert.Equal("Inserted", tl.Title);
        Assert.Equal("cal_default_gregorian", tl.CalendarId); // column defaults still apply
    }

    // ── DuplicateTimeline ─────────────────────────────────────────────────────

    [Fact]
    public void DuplicateTimeline_ClonesRowSettingsCharactersItemsLinksAndNotes()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int src = repo.CreateTimeline("Source", author: "Auth");
        repo.UpdateTimelineInfo(src, "Source", "Auth", "desc", 1200, "#123456");
        var settingsRepo = new SettingsRepo();
        var settings = settingsRepo.GetOrCreateSettings(src);
        settings.PixelsPerSubtick = 33;
        settingsRepo.SaveSettings(settings);

        string charId = Guid.NewGuid().ToString();
        string itemId = Guid.NewGuid().ToString();
        string storyId = Guid.NewGuid().ToString();
        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO characters (id, name, color, timeline_id) VALUES (@Id, 'Alice', '#f00', @Tl)", new { Id = charId, Tl = src });
            db.Execute("INSERT INTO stories (id, title) VALUES (@Id, 'Saga')", new { Id = storyId });
            db.Execute(@"
                INSERT INTO items (id, title, type_id, year, end_year, timeline_id, absolute_start, absolute_end,
                                   item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask)
                VALUES (@Id, 'Event', 1, 1200, 1200, @Tl, 1200, 1200, 0, 1, 5, 3, 255)", new { Id = itemId, Tl = src });
            db.Execute("INSERT INTO tags (name) VALUES ('epic')");
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@Id, (SELECT id FROM tags WHERE name = 'epic'))", new { Id = itemId });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@Id, @Ch, 'lead')", new { Id = itemId, Ch = charId });
            db.Execute("INSERT INTO item_story_refs (item_id, story_id) VALUES (@Id, @St)", new { Id = itemId, St = storyId });
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, connected_item_id, nearest_year) VALUES (@Id, 'hello', @Tl, @Item, 1200)",
                new { Id = Guid.NewGuid().ToString(), Tl = src, Item = itemId });
        }

        int copy = repo.DuplicateTimeline(src, "Copy");

        Assert.True(copy > 0);
        Assert.NotEqual(src, copy);
        using var q = ctx.OpenConnection();

        var row = q.QuerySingle<TimelineInfo>("SELECT * FROM timelines WHERE id = @Id", new { Id = copy });
        Assert.Equal("Copy", row.Title);
        Assert.Equal("Auth", row.Author);
        Assert.Equal("desc", row.Description);
        Assert.Equal(1200, row.StartYear);
        Assert.Equal("#123456", row.Color);

        Assert.Equal(33, q.QuerySingle<int>("SELECT pixels_per_subtick FROM settings WHERE timeline_id = @Id", new { Id = copy }));

        string newCharId = q.QuerySingle<string>("SELECT id FROM characters WHERE timeline_id = @Id", new { Id = copy });
        Assert.NotEqual(charId, newCharId);
        Assert.Equal("Alice", q.QuerySingle<string>("SELECT name FROM characters WHERE id = @Id", new { Id = newCharId }));

        string newItemId = q.QuerySingle<string>("SELECT id FROM items WHERE timeline_id = @Id", new { Id = copy });
        Assert.NotEqual(itemId, newItemId);
        Assert.Equal("Event", q.QuerySingle<string>("SELECT title FROM items WHERE id = @Id", new { Id = newItemId }));

        // junctions follow the new item/character ids
        Assert.Equal(1, q.QuerySingle<int>("SELECT COUNT(*) FROM item_tags WHERE item_id = @Id", new { Id = newItemId }));
        Assert.Equal(newCharId, q.QuerySingle<string>("SELECT character_id FROM item_character_appearances WHERE item_id = @Id", new { Id = newItemId }));
        Assert.Equal(storyId, q.QuerySingle<string>("SELECT story_id FROM item_story_refs WHERE item_id = @Id", new { Id = newItemId }));
        Assert.Equal(newItemId, q.QuerySingle<string>("SELECT connected_item_id FROM notes WHERE timeline_id = @Id", new { Id = copy }));

        // source untouched
        Assert.Equal(itemId, q.QuerySingle<string>("SELECT id FROM items WHERE timeline_id = @Id", new { Id = src }));
        Assert.Equal(charId, q.QuerySingle<string>("SELECT id FROM characters WHERE timeline_id = @Id", new { Id = src }));
    }

    [Fact]
    public void DuplicateTimeline_RollsBack_WhenNewTitleCollides()
    {
        using var ctx = new DbTestContext();
        var repo = new TimelineRepo();
        int src = repo.CreateTimeline("Original", author: "Auth");
        repo.CreateTimeline("Taken", author: "Auth");

        // UNIQUE(title, author) — the clone must fail and leave no partial rows behind
        Assert.ThrowsAny<Exception>(() => repo.DuplicateTimeline(src, "Taken"));

        Assert.Equal(2, repo.GetAll().Count());
    }
}

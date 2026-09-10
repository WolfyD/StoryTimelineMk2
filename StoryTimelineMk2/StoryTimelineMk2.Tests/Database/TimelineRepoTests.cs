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
}

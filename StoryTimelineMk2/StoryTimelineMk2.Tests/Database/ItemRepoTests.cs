using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class ItemRepoTests
{
    // ── helpers ───────────────────────────────────────────────────────────────

    private static TimelineItem MakeItem(int timelineId, string? id = null) => new()
    {
        Id              = id ?? Guid.NewGuid().ToString(),
        Title           = "Test Event",
        Description     = "A description",
        Content         = "Some content",
        StoryId         = null,
        TypeId          = 1,
        Year            = 1500,
        EndYear         = 1500,
        AbsoluteStart   = 1500.0,
        AbsoluteEnd     = 1500.0,
        BookTitle       = "",
        Chapter         = "",
        Page            = "",
        Color           = "#ffffff",
        CreationGranularity = 1,
        TimelineId      = timelineId,
        ItemIndex       = 0,
        ShowInNotes     = true,
        Importance      = 5,
        MinLodLevel     = 3,
    };

    // Create a minimal timeline row so the FK constraint on items.timeline_id is satisfied.
    private static int SeedTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO timelines (title, author, description, start_year)
            VALUES (@Title, '', '', 0)", new { Title = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    // ── SaveItemFull / GetItemById ────────────────────────────────────────────

    [Fact]
    public void SaveItemFull_CreatesNewItem_AndReturnsId()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);

        var returnedId = repo.SaveItemFull(item, [], [], [], []);

        Assert.Equal(item.Id, returnedId);
    }

    [Fact]
    public void GetItemById_ReturnsCorrectItem_AfterSave()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        item.Title = "Unique Title 123";

        repo.SaveItemFull(item, [], [], [], []);
        var retrieved = repo.GetItemById(item.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(item.Id, retrieved.Id);
        Assert.Equal("Unique Title 123", retrieved.Title);
    }

    [Fact]
    public void SaveItemFull_WithExistingId_UpdatesRatherThanInserts()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        // Update the title and save again with the same Id
        item.Title = "Updated Title";
        repo.SaveItemFull(item, [], [], [], []);

        var retrieved = repo.GetItemById(item.Id);
        Assert.Equal("Updated Title", retrieved!.Title);

        // Verify only one row exists
        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = @Id", new { item.Id });
        Assert.Equal(1, count);
    }

    // ── GetItemTags ───────────────────────────────────────────────────────────

    [Fact]
    public void GetItemTags_ReturnsTagsLinkedToItem()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, tagNames: ["battle", "medieval"], [], [], []);

        var tags = repo.GetItemTags(item.Id).ToList();

        Assert.Equal(2, tags.Count);
        var names = tags.Select(t => t.Name).OrderBy(n => n).ToList();
        Assert.Equal(["battle", "medieval"], names);
    }

    [Fact]
    public void GetItemTags_ReturnsEmpty_WhenNoTagsLinked()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        var tags = repo.GetItemTags(item.Id).ToList();

        Assert.Empty(tags);
    }

    // ── DeleteItem ────────────────────────────────────────────────────────────

    [Fact]
    public void DeleteItem_RemovesItemFromDatabase()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        repo.DeleteItem(item.Id);

        var retrieved = repo.GetItemById(item.Id);
        Assert.Null(retrieved);
    }

    [Fact]
    public void DeleteItem_NonexistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new ItemRepo();
        // Should not throw even if the item doesn't exist
        repo.DeleteItem(Guid.NewGuid().ToString());
    }

    // ── GetItemsByTimeline ────────────────────────────────────────────────────

    [Fact]
    public void GetItemsByTimeline_ReturnsOnlyItemsForThatTimeline()
    {
        using var ctx = new DbTestContext();
        // Use distinct titles to avoid the UNIQUE(title, author) constraint
        int tl1 = SeedTimeline(ctx, "Timeline Alpha");
        int tl2 = SeedTimeline(ctx, "Timeline Beta");

        var repo = new ItemRepo();
        var item1 = MakeItem(tl1);
        var item2 = MakeItem(tl2);
        repo.SaveItemFull(item1, [], [], [], []);
        repo.SaveItemFull(item2, [], [], [], []);

        var results = repo.GetItemsByTimeline(tl1).ToList();

        Assert.Single(results);
        Assert.Equal(item1.Id, results[0].Id);
    }
}

using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class MediaRepoTests
{
    // ── helpers ───────────────────────────────────────────────────────────────

    private static int SeedTimeline(DbTestContext ctx)
    {
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO timelines (title, author, description, start_year)
            VALUES ('Test Timeline', '', '', 0)");
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static string SeedItem(DbTestContext ctx, int timelineId)
    {
        var itemId = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO items (id, title, type_id, year, end_year, timeline_id,
                               absolute_start, absolute_end, item_index,
                               show_in_notes, importance, min_lod_level, lod_visibility_mask)
            VALUES (@Id, 'Item', 1, 0, 0, @TlId, 0, 0, 0, 1, 5, 3, 255)",
            new { Id = itemId, TlId = timelineId });
        return itemId;
    }

    private static string SeedPicture(DbTestContext ctx)
    {
        var picId = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO pictures (id, file_path, file_name, file_size, file_type, width, height, title, description)
            VALUES (@Id, 'test.png', 'test.png', 1024, 'png', 100, 100, 'Test', '')",
            new { Id = picId });
        return picId;
    }

    // ── GetItemPictures ───────────────────────────────────────────────────────

    [Fact]
    public void GetItemPictures_ReturnsEmpty_WhenNoPicturesLinked()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);

        var repo = new MediaRepo();
        var pictures = repo.GetItemPictures(itemId).ToList();

        Assert.Empty(pictures);
    }

    // ── LinkPictureToItem / GetItemPictures ───────────────────────────────────

    [Fact]
    public void LinkPictureToItem_ThenGetItemPictures_ReturnsLinkedPicture()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string picId = SeedPicture(ctx);

        var repo = new MediaRepo();
        repo.LinkPictureToItem(picId, itemId);

        var pictures = repo.GetItemPictures(itemId).ToList();

        Assert.Single(pictures);
        Assert.Equal(picId, pictures[0].Id);
    }

    [Fact]
    public void LinkPictureToItem_IsIdempotent_DoesNotDuplicate()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string picId = SeedPicture(ctx);

        var repo = new MediaRepo();
        repo.LinkPictureToItem(picId, itemId);
        repo.LinkPictureToItem(picId, itemId); // second call should be a no-op (INSERT OR IGNORE)

        var pictures = repo.GetItemPictures(itemId).ToList();
        Assert.Single(pictures);
    }

    // ── UnlinkAndPruneImage ───────────────────────────────────────────────────

    [Fact]
    public void UnlinkAndPruneImage_RemovesJunction_AndDeletesOrphanedMediaRecord()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string picId = SeedPicture(ctx);

        var repo = new MediaRepo();
        repo.LinkPictureToItem(picId, itemId);

        // Unlink — picture is now orphaned so it should be pruned
        repo.UnlinkAndPruneImage(picId, itemId);

        // Junction gone
        var pics = repo.GetItemPictures(itemId).ToList();
        Assert.Empty(pics);

        // Record gone from pictures table
        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM pictures WHERE id = @Id", new { Id = picId });
        Assert.Equal(0, count);
    }

    [Fact]
    public void UnlinkAndPruneImage_DoesNotDeletePicture_WhenStillLinkedElsewhere()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string item1 = SeedItem(ctx, tlId);
        string item2 = SeedItem(ctx, tlId);
        string picId = SeedPicture(ctx);

        var repo = new MediaRepo();
        repo.LinkPictureToItem(picId, item1);
        repo.LinkPictureToItem(picId, item2);

        // Unlink from item1 only — picture still linked to item2
        repo.UnlinkAndPruneImage(picId, item1);

        // item1 no longer has it
        Assert.Empty(repo.GetItemPictures(item1));

        // item2 still has it
        Assert.Single(repo.GetItemPictures(item2));

        // Pictures record still exists
        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM pictures WHERE id = @Id", new { Id = picId });
        Assert.Equal(1, count);
    }
}

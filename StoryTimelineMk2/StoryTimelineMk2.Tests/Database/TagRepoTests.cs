using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class TagRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static string InsertItem(DbTestContext ctx, int timelineId)
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO items
            (id, title, type_id, year, end_year, timeline_id,
             absolute_start, absolute_end, subtick, end_subtick,
             original_subtick, original_end_subtick, item_index, show_in_notes, importance, min_lod_level)
            VALUES (@Id, 'Test', 1, 0, 0, @TlId, 0, 0, 0, 0, 0, 0, 0, 1, 5, 3)",
            new { Id = id, TlId = timelineId });
        return id;
    }

    // ── GetAllTags ────────────────────────────────────────────────────────────

    [Fact]
    public void GetAllTags_ReturnsEmpty_WhenNoTagsExist()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        var tags = repo.GetAllTags().ToList();

        Assert.Empty(tags);
    }

    [Fact]
    public void GetAllTags_ReturnsAllTagsAfterInsertion()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("alpha");
        repo.EnsureTagExists("beta");
        repo.EnsureTagExists("gamma");

        var tags = repo.GetAllTags().ToList();
        Assert.Equal(3, tags.Count);
    }

    [Fact]
    public void GetAllTags_ReturnsTagsOrderedByName()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("zebra");
        repo.EnsureTagExists("apple");
        repo.EnsureTagExists("mango");

        var tags = repo.GetAllTags().ToList();
        var names = tags.Select(t => t.Name).ToList();
        Assert.Equal(names.OrderBy(n => n).ToList(), names);
    }

    // ── EnsureTagExists ───────────────────────────────────────────────────────

    [Fact]
    public void EnsureTagExists_CreatesTag_WhenItDoesNotExist()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("brandnew");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM tags WHERE name = 'brandnew'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void EnsureTagExists_DoesNotCreateDuplicate_WhenCalledTwice()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("duplicate");
        repo.EnsureTagExists("duplicate");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM tags WHERE name = 'duplicate'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void EnsureTagExists_StoresTagAsLowercase()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("UPPERCASE");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM tags WHERE name = 'uppercase'");
        Assert.Equal(1, count);
    }

    // ── SearchTags ────────────────────────────────────────────────────────────

    [Fact]
    public void SearchTags_ReturnsEmpty_WhenNoTagsMatch()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("apple");
        repo.EnsureTagExists("orange");

        var results = repo.SearchTags("xyz").ToList();
        Assert.Empty(results);
    }

    [Fact]
    public void SearchTags_ReturnsMatchingTags_BySubstring()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("battle");
        repo.EnsureTagExists("battleground");
        repo.EnsureTagExists("peace");

        var results = repo.SearchTags("battle").ToList();
        Assert.Equal(2, results.Count);
        Assert.All(results, t => Assert.Contains("battle", t.Name));
    }

    [Fact]
    public void SearchTags_IsCaseInsensitive()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("dragon");

        var results = repo.SearchTags("DRAGON").ToList();
        Assert.Single(results);
    }

    [Fact]
    public void SearchTags_ReturnsAtMostTenResults()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        for (int i = 1; i <= 15; i++)
        {
            repo.EnsureTagExists($"tag-search-{i:D2}");
        }

        var results = repo.SearchTags("tag-search").ToList();
        Assert.True(results.Count <= 10);
    }

    // ── GetItemTags (via item_tags join) ──────────────────────────────────────
    // ItemRepo handles adding tags to items; we test the raw junction here.

    [Fact]
    public void EnsureTagExists_ThenLinkToItem_CanBeVerifiedDirectly()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId);

        var repo = new TagRepo();
        repo.EnsureTagExists("linked-tag");

        using var db = ctx.OpenConnection();
        var tagId = db.QuerySingle<int>("SELECT id FROM tags WHERE name = 'linked-tag'");

        db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@ItemId, @TagId)",
            new { ItemId = itemId, TagId = tagId });

        var linkedCount = db.QuerySingle<int>(
            "SELECT COUNT(*) FROM item_tags WHERE item_id = @ItemId AND tag_id = @TagId",
            new { ItemId = itemId, TagId = tagId });

        Assert.Equal(1, linkedCount);
    }

    // ── DeleteTag ─────────────────────────────────────────────────────────────

    [Fact]
    public void DeleteTag_RemovesTagFromDatabase()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("to-delete");

        using var db = ctx.OpenConnection();
        var tagId = db.QuerySingle<int>("SELECT id FROM tags WHERE name = 'to-delete'");

        repo.DeleteTag(tagId);

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM tags WHERE id = @Id", new { Id = tagId });
        Assert.Equal(0, count);
    }

    [Fact]
    public void DeleteTag_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        var ex = Record.Exception(() => repo.DeleteTag(999999));
        Assert.Null(ex);
    }

    [Fact]
    public void DeleteTag_LeavesOtherTagsIntact()
    {
        using var ctx = new DbTestContext();

        var repo = new TagRepo();
        repo.EnsureTagExists("keep-this");
        repo.EnsureTagExists("delete-this");

        using var db = ctx.OpenConnection();
        var deleteId = db.QuerySingle<int>("SELECT id FROM tags WHERE name = 'delete-this'");
        repo.DeleteTag(deleteId);

        var keepCount = db.QuerySingle<int>("SELECT COUNT(*) FROM tags WHERE name = 'keep-this'");
        Assert.Equal(1, keepCount);
    }
}

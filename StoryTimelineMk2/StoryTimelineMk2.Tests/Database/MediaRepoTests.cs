using StoryTimelineMk2.Database;
using Dapper;
using System.Drawing.Imaging;
using System.Drawing;

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

    // ── image helpers ─────────────────────────────────────────────────────────

    private static string WritePng(string path, int width, int height)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var bmp = new Bitmap(width, height);
        bmp.SetPixel(0, 0, Color.Red);
        bmp.Save(path, ImageFormat.Png);
        return path;
    }

    private static Size ReadSize(string path)
    {
        using var img = Image.FromFile(path);
        return img.Size;
    }

    private static string ThumbFile(string picId) =>
        Path.Combine(AppConfig.Instance.GetMediaFolder(), "thumbs", $"{picId}.png");

    // ── ImportAndSaveMedia ────────────────────────────────────────────────────

    [Fact]
    public void ImportAndSaveMedia_CopiesFile_InsertsRow_AndCreatesThumb()
    {
        using var ctx = new DbTestContext();
        string src = WritePng(Path.Combine(ctx.TempDir, "src", "big.png"), 1024, 512);
        var repo = new MediaRepo();

        var media = repo.ImportAndSaveMedia(src, "Big", "desc");

        Assert.Equal($"{media.Id}.png", media.FilePath); // filename only, resolved via GetFullPath
        Assert.Equal("big.png", media.FileName);
        Assert.Equal("png", media.FileType);
        Assert.Equal(new FileInfo(src).Length, media.FileSize);
        Assert.True(File.Exists(repo.GetFullPath(media.FilePath)));
        Assert.True(File.Exists(src)); // original left in place
        Assert.Equal($"thumbs/{media.Id}.png", media.ThumbPath);
        Assert.Equal(new Size(256, 128), ReadSize(ThumbFile(media.Id)));

        using var db = ctx.OpenConnection();
        Assert.Equal("Big", db.QuerySingle<string>("SELECT title FROM pictures WHERE id = @Id", new { media.Id }));
        Assert.Equal("desc", db.QuerySingle<string>("SELECT description FROM pictures WHERE id = @Id", new { media.Id }));
    }

    [Fact]
    public void ImportAndSaveMedia_Throws_WhenSourceMissing()
    {
        using var ctx = new DbTestContext();
        var repo = new MediaRepo();

        Assert.Throws<FileNotFoundException>(() => repo.ImportAndSaveMedia(Path.Combine(ctx.TempDir, "nope.png"), "", ""));
    }

    [Fact]
    public void ImportAndSaveMedia_DoesNotUpscaleSmallImages()
    {
        using var ctx = new DbTestContext();
        string src = WritePng(Path.Combine(ctx.TempDir, "src", "small.png"), 40, 20);
        var repo = new MediaRepo();

        var media = repo.ImportAndSaveMedia(src, "", "");

        Assert.Equal(new Size(40, 20), ReadSize(repo.GetFullPath(media.ThumbPath)));
    }

    // ── thumbnails on read ────────────────────────────────────────────────────

    [Fact]
    public void GetItemPictures_GeneratesThumbLazily_ForPicturesImportedBeforeThumbsExisted()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        var repo = new MediaRepo();
        string picId = Guid.NewGuid().ToString();
        WritePng(Path.Combine(AppConfig.Instance.GetMediaFolder(), $"{picId}.png"), 600, 300);
        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO pictures (id, file_path, file_name, file_size, file_type) VALUES (@Id, @Fp, 'legacy.png', 1, 'png')",
                new { Id = picId, Fp = $"{picId}.png" });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@I, @P)", new { I = itemId, P = picId });
        }
        Assert.False(File.Exists(ThumbFile(picId)));

        var pic = Assert.Single(repo.GetItemPictures(itemId));

        Assert.Equal($"thumbs/{picId}.png", pic.ThumbPath);
        Assert.Equal(new Size(256, 128), ReadSize(ThumbFile(picId)));
    }

    [Fact]
    public void GetItemPictures_FallsBackToOriginal_WhenFileCannotBeDecoded()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string picId = SeedPicture(ctx); // points at test.png, which does not exist on disk
        var repo = new MediaRepo();
        repo.LinkPictureToItem(picId, itemId);

        var pic = Assert.Single(repo.GetItemPictures(itemId));

        Assert.Equal("test.png", pic.ThumbPath);
        Assert.False(File.Exists(ThumbFile(picId)));
    }

    [Fact]
    public void GetItemPictures_SkipsThumb_ForWebp()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string picId = Guid.NewGuid().ToString();
        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO pictures (id, file_path, file_name, file_size, file_type) VALUES (@Id, 'x.webp', 'x.webp', 1, 'webp')", new { Id = picId });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@I, @P)", new { I = itemId, P = picId });
        }
        var repo = new MediaRepo();

        var pic = Assert.Single(repo.GetItemPictures(itemId));

        Assert.Equal("x.webp", pic.ThumbPath); // GDI+ cannot decode WebP; the browser shows the original
        Assert.False(File.Exists(ThumbFile(picId)));
    }

    // ── GetAllMedia ───────────────────────────────────────────────────────────

    [Fact]
    public void GetAllMedia_ReturnsEveryPicture_NewestFirst()
    {
        using var ctx = new DbTestContext();
        string older = Guid.NewGuid().ToString();
        string newer = Guid.NewGuid().ToString();
        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO pictures (id, file_path, file_name, file_size, file_type, created_at) VALUES (@Id, 'a.png', 'a.png', 1, 'png', '2024-01-01 00:00:00')", new { Id = older });
            db.Execute("INSERT INTO pictures (id, file_path, file_name, file_size, file_type, created_at) VALUES (@Id, 'b.png', 'b.png', 1, 'png', '2024-06-01 00:00:00')", new { Id = newer });
        }
        var repo = new MediaRepo();

        var all = repo.GetAllMedia().ToList();

        Assert.Equal([newer, older], all.Select(m => m.Id).ToList());
        Assert.All(all, m => Assert.False(string.IsNullOrEmpty(m.ThumbPath)));
    }

    // ── GetFullPath ───────────────────────────────────────────────────────────

    [Fact]
    public void GetFullPath_ResolvesRelativeNamesUnderMediaFolder_AndKeepsAbsolutePaths()
    {
        using var ctx = new DbTestContext();
        var repo = new MediaRepo();

        Assert.Equal(Path.Combine(AppConfig.Instance.GetMediaFolder(), "a.png"), repo.GetFullPath("a.png"));
        string legacyAbsolute = Path.Combine(ctx.TempDir, "legacy", "b.png");
        Assert.Equal(legacyAbsolute, repo.GetFullPath(legacyAbsolute));
    }

    // ── DeleteMedia ───────────────────────────────────────────────────────────

    [Fact]
    public void DeleteMedia_RemovesRow_File_Thumb_AndJunctions()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        string itemId = SeedItem(ctx, tlId);
        string src = WritePng(Path.Combine(ctx.TempDir, "src", "del.png"), 300, 300);
        var repo = new MediaRepo();
        var media = repo.ImportAndSaveMedia(src, "", "");
        repo.LinkPictureToItem(media.Id, itemId);
        string file = repo.GetFullPath(media.FilePath);
        string thumb = ThumbFile(media.Id);
        Assert.True(File.Exists(file));
        Assert.True(File.Exists(thumb));

        repo.DeleteMedia(media.Id);

        Assert.False(File.Exists(file));
        Assert.False(File.Exists(thumb));
        using var db = ctx.OpenConnection();
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM pictures WHERE id = @Id", new { media.Id }));
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM item_pictures WHERE picture_id = @Id", new { media.Id }));
    }

    [Fact]
    public void DeleteMedia_DoesNotThrow_ForUnknownId()
    {
        using var ctx = new DbTestContext();
        var repo = new MediaRepo();

        Assert.Null(Record.Exception(() => repo.DeleteMedia("does-not-exist")));
    }
}

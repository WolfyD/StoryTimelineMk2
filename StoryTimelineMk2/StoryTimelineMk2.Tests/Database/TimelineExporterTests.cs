using StoryTimelineMk2.Database;
using Dapper;
using System.IO.Compression;
using System.Text.Json;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class TimelineExporterTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private static int InsertTimeline(DbTestContext ctx, string title = "Export Test")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@title, '', '', 0)",
            new { title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static string InsertItem(DbTestContext ctx, int timelineId, string title = "Test Item")
    {
        string id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO items
            (id, title, description, type_id, year, end_year, absolute_start, absolute_end,
             timeline_id, item_index, show_in_notes, importance, min_lod_level)
            VALUES (@id, @title, '', 1, 100, 100, 100.0, 100.0, @tlId, 0, 1, 5, 3)",
            new { id, title, tlId = timelineId });
        return id;
    }

    private static string ExportTimeline(DbTestContext ctx, int timelineId,
        bool includeIds = true, bool includeMedia = false)
    {
        string zipPath = Path.Combine(ctx.TempDir, $"export_{timelineId}.stlm");
        TimelineExporter.ExportToZip(timelineId, zipPath, includeIds, includeMedia);
        return zipPath;
    }

    private static JsonDocument ReadZipJson(string zipPath, string entryName)
    {
        using var zip = ZipFile.OpenRead(zipPath);
        var entry = zip.GetEntry(entryName) ?? throw new Exception($"{entryName} not found in zip");
        using var sr = new StreamReader(entry.Open());
        return JsonDocument.Parse(sr.ReadToEnd());
    }

    // ── ExportToZip ───────────────────────────────────────────────────────────

    [Fact]
    public void ExportToZip_CreatesFile()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId);

        Assert.True(File.Exists(zip));
    }

    [Fact]
    public void ExportToZip_ContainsManifestJson()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId);

        using var zf = ZipFile.OpenRead(zip);
        Assert.Contains(zf.Entries, e => e.FullName == "manifest.json");
    }

    [Fact]
    public void ExportToZip_ContainsTimelineJson()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId);

        using var zf = ZipFile.OpenRead(zip);
        Assert.Contains(zf.Entries, e => e.FullName == "timeline.json");
    }

    [Fact]
    public void ExportToZip_ManifestHasCorrectTitle()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "My Epic Story");
        string zip = ExportTimeline(ctx, tlId);

        using var doc  = ReadZipJson(zip, "manifest.json");
        string? title  = doc.RootElement.GetProperty("timelineTitle").GetString();

        Assert.Equal("My Epic Story", title);
    }

    [Fact]
    public void ExportToZip_ManifestHasCorrectItemCount()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        InsertItem(ctx, tlId, "Item A");
        InsertItem(ctx, tlId, "Item B");
        string zip = ExportTimeline(ctx, tlId);

        using var doc  = ReadZipJson(zip, "manifest.json");
        int count      = doc.RootElement.GetProperty("itemCount").GetInt32();

        Assert.Equal(2, count);
    }

    [Fact]
    public void ExportToZip_Manifest_IncludeIds_True()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        using var doc = ReadZipJson(zip, "manifest.json");
        Assert.True(doc.RootElement.GetProperty("includeIds").GetBoolean());
    }

    [Fact]
    public void ExportToZip_Manifest_IncludeIds_False()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId, includeIds: false);

        using var doc = ReadZipJson(zip, "manifest.json");
        Assert.False(doc.RootElement.GetProperty("includeIds").GetBoolean());
    }

    [Fact]
    public void ExportToZip_Manifest_HasCorrectTimelineId()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        using var doc = ReadZipJson(zip, "manifest.json");
        long stored   = doc.RootElement.GetProperty("timelineId").GetInt64();

        Assert.Equal(tlId, stored);
    }

    // ── GetZipPreview ─────────────────────────────────────────────────────────

    [Fact]
    public void GetZipPreview_ReturnsTitle()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "Preview Title");
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        var preview = TimelineExporter.GetZipPreview(zip);

        Assert.Equal("Preview Title", preview.TimelineTitle);
    }

    [Fact]
    public void GetZipPreview_ReturnsItemCount()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        InsertItem(ctx, tlId);
        InsertItem(ctx, tlId);
        InsertItem(ctx, tlId);
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        var preview = TimelineExporter.GetZipPreview(zip);

        Assert.Equal(3, preview.ItemCount);
    }

    [Fact]
    public void GetZipPreview_HasConflict_WhenTimelineExistsInMainDb()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "Conflict Timeline");
        string zip = ExportTimeline(ctx, tlId, includeIds: true);
        // The timeline with tlId still exists in the main DB → conflict

        var preview = TimelineExporter.GetZipPreview(zip);

        Assert.True(preview.HasConflict);
        Assert.Equal("Conflict Timeline", preview.ConflictingTimelineTitle);
    }

    [Fact]
    public void GetZipPreview_NoConflict_WhenTimelineNotInMainDb()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "No Conflict");
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        // Delete the timeline so no conflict exists
        using (var db = ctx.OpenConnection())
            db.Execute("DELETE FROM timelines WHERE id = @tlId", new { tlId });

        var preview = TimelineExporter.GetZipPreview(zip);

        Assert.False(preview.HasConflict);
        Assert.Null(preview.ConflictingTimelineTitle);
    }

    [Fact]
    public void GetZipPreview_NoConflict_WhenIncludeIds_False()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx);
        string zip = ExportTimeline(ctx, tlId, includeIds: false);
        // Export without IDs — import will always create a new entry, so preview has no conflict

        var preview = TimelineExporter.GetZipPreview(zip);

        Assert.False(preview.HasConflict);
    }

    // ── ImportFromZip — with IDs ──────────────────────────────────────────────

    [Fact]
    public void ImportFromZip_WithIds_RestoresTimeline()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "Round Trip");
        string zip = ExportTimeline(ctx, tlId, includeIds: true);

        // Delete timeline so we can verify restoration
        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA foreign_keys = ON; DELETE FROM timelines WHERE id = @tlId", new { tlId });

        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        string? title = verify.QuerySingleOrDefault<string>(
            "SELECT title FROM timelines WHERE id = @tlId", new { tlId });
        Assert.Equal("Round Trip", title);
    }

    [Fact]
    public void ImportFromZip_WithIds_RestoresItems()
    {
        using var ctx = new DbTestContext();
        int tlId     = InsertTimeline(ctx, "With Items");
        string itemId = InsertItem(ctx, tlId, "Restored Item");
        string zip   = ExportTimeline(ctx, tlId, includeIds: true);

        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA foreign_keys = ON; DELETE FROM timelines WHERE id = @tlId", new { tlId });

        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        string? title = verify.QuerySingleOrDefault<string>(
            "SELECT title FROM items WHERE id = @itemId", new { itemId });
        Assert.Equal("Restored Item", title);
    }

    [Fact]
    public void ImportFromZip_WithIds_CascadeDeletesExistingData_NotInZip()
    {
        using var ctx = new DbTestContext();
        int tlId    = InsertTimeline(ctx, "Cascade Test");
        string item1 = InsertItem(ctx, tlId, "In Zip");
        string zip   = ExportTimeline(ctx, tlId, includeIds: true);

        // Add item2 AFTER export — it will NOT be in the zip
        string item2 = InsertItem(ctx, tlId, "Not In Zip");

        // Import: cascade-deletes existing timeline (removes item1 + item2), then reinserts zip data (item1 back)
        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        int item2Count = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = @id", new { id = item2 });
        int item1Count = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = @id", new { id = item1 });

        Assert.Equal(0, item2Count); // post-export item was deleted and not in zip → gone
        Assert.Equal(1, item1Count); // pre-export item was reimported from zip
    }

    // ── ImportFromZip — without IDs ───────────────────────────────────────────
    // The typical "without IDs" scenario is importing on a machine that doesn't
    // already have the timeline. Tests delete the source before importing to
    // match this case (ImportAsNew has no duplicate-title handling by design).

    [Fact]
    public void ImportFromZip_WithoutIds_CreatesTimeline()
    {
        using var ctx = new DbTestContext();
        int tlId   = InsertTimeline(ctx, "WOI Timeline");
        string zip = ExportTimeline(ctx, tlId, includeIds: false);

        // Delete source — simulates importing on a machine without this timeline
        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA foreign_keys = ON; DELETE FROM timelines WHERE id = @tlId", new { tlId });

        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        int total = verify.QuerySingle<int>(
            "SELECT COUNT(*) FROM timelines WHERE title = 'WOI Timeline'");
        Assert.Equal(1, total);
    }

    [Fact]
    public void ImportFromZip_WithoutIds_DoesNotTouchOtherTimelines()
    {
        using var ctx = new DbTestContext();

        // "Keeper" — will stay in the DB throughout
        int keeperId     = InsertTimeline(ctx, "Keeper TL");
        string keptItemId = InsertItem(ctx, keeperId, "Kept Item");

        // "Importer" — export it, delete it, then reimport
        int importerId = InsertTimeline(ctx, "Importer TL");
        string zip      = ExportTimeline(ctx, importerId, includeIds: false);
        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA foreign_keys = ON; DELETE FROM timelines WHERE id = @id", new { id = importerId });

        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        // Keeper's item must still be intact
        string? title = verify.QuerySingleOrDefault<string>(
            "SELECT title FROM items WHERE id = @id", new { id = keptItemId });
        Assert.Equal("Kept Item", title);
    }

    [Fact]
    public void ImportFromZip_WithoutIds_ImportsItems()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx, "WOI Items");
        InsertItem(ctx, tlId, "Alpha");
        InsertItem(ctx, tlId, "Beta");
        string zip = ExportTimeline(ctx, tlId, includeIds: false);

        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA foreign_keys = ON; DELETE FROM timelines WHERE id = @tlId", new { tlId });

        TimelineExporter.ImportFromZip(zip);

        using var verify = ctx.OpenConnection();
        int alphaCount = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title = 'Alpha'");
        int betaCount  = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title = 'Beta'");
        Assert.Equal(1, alphaCount);
        Assert.Equal(1, betaCount);
    }

    // ── BL-15 phase 3: the character-filtered export ──────────────────────────

    [Fact]
    public void ExportToZip_WithCharacterId_KeepsOnlyThatCharactersItems()
    {
        using var ctx = new DbTestContext();
        int tlId        = InsertTimeline(ctx, "Focus TL");
        string theirs   = InsertItem(ctx, tlId, "Theirs");
        InsertItem(ctx, tlId, "Stranger");
        string birth    = InsertItem(ctx, tlId, "Born");
        string charId   = Guid.NewGuid().ToString();

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO characters (id, name, timeline_id, birth_item_id) VALUES (@charId, 'Focus', @tlId, @birth)",
                new { charId, tlId, birth });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@theirs, @charId, 'lead')",
                new { theirs, charId });
            // A boundary marker belongs to every character: it carries the timeline's extent.
            db.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year, absolute_start, absolute_end,
                 timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES (@id, 'Start', '', 8, 0, 0, 0.0, 0.0, @tlId, 0, 1, 5, 3)",
                new { id = Guid.NewGuid().ToString(), tlId });
        }

        string zipPath = Path.Combine(ctx.TempDir, "focus.stlm");
        TimelineExporter.ExportToZip(tlId, zipPath, includeIds: true, includeMedia: false, characterId: charId);

        using var doc = ReadZipJson(zipPath, "timeline.json");
        var titles = doc.RootElement.GetProperty("items").EnumerateArray()
            .Select(i => i.GetProperty("title").GetString()).OrderBy(t => t).ToArray();

        Assert.Equal(new[] { "Born", "Start", "Theirs" }, titles);
    }
}

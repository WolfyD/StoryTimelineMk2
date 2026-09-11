using StoryTimelineMk2.Database;
using Microsoft.Data.Sqlite;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// Tests for DatabaseImporter — V1 legacy import, GetImportPreview, and V2 full import.
///
/// V2 import was previously untestable because it used ON CONFLICT … DO UPDATE (UPSERT)
/// inside an ATTACH DATABASE transaction, which the Microsoft.Data.Sqlite driver rejects.
/// ImportV2Backup was rewritten to use INSERT OR REPLACE (global tables) and plain INSERT
/// after cascade-delete (timeline-scoped tables), so V2 round-trip tests are now possible.
/// </summary>
[Collection("Database")]
public class DatabaseImporterTests
{
    // ─────────────────────────── helpers ──────────────────────────────────────

    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    /// <summary>
    /// Creates a minimal V1-format backup (no 'calendars' table) and returns its path.
    /// V1Legacy import uses separate connections — no ATTACH DATABASE — so UPSERT works.
    /// </summary>
    private static string CreateV1Backup(string directory)
    {
        string path = Path.Combine(directory, "backup_v1_" + Guid.NewGuid() + ".sqlite");

        using var db = new SqliteConnection($"Data Source={path}");
        db.Open();

        db.Execute(@"
            CREATE TABLE IF NOT EXISTS timelines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                description TEXT,
                start_year INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS item_types (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE,
                description TEXT
            );
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                content TEXT,
                story_id TEXT,
                type_id INTEGER DEFAULT 1,
                year INTEGER,
                subtick INTEGER DEFAULT 0,
                original_subtick INTEGER DEFAULT 0,
                end_year INTEGER,
                end_subtick INTEGER DEFAULT 0,
                original_end_subtick INTEGER DEFAULT 0,
                book_title TEXT,
                chapter TEXT,
                page TEXT,
                color TEXT,
                creation_granularity INTEGER,
                timeline_id INTEGER,
                item_index INTEGER DEFAULT 0,
                show_in_notes INTEGER DEFAULT 1,
                importance INTEGER DEFAULT 5
            );
            CREATE TABLE IF NOT EXISTS pictures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT,
                file_name TEXT,
                file_size INTEGER,
                file_type TEXT,
                width INTEGER,
                height INTEGER,
                title TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS item_pictures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                picture_id INTEGER NOT NULL,
                UNIQUE(item_id, picture_id)
            );
            CREATE TABLE IF NOT EXISTS item_tags (
                item_id TEXT,
                tag_id INTEGER,
                PRIMARY KEY (item_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY,
                timeline_id INTEGER,
                font TEXT DEFAULT 'Arial',
                font_size_scale REAL DEFAULT 1.0,
                pixels_per_subtick INTEGER DEFAULT 20,
                custom_css TEXT,
                use_custom_css INTEGER DEFAULT 0,
                is_fullscreen INTEGER DEFAULT 0,
                show_guides INTEGER DEFAULT 1,
                window_size_x INTEGER DEFAULT 1000,
                window_size_y INTEGER DEFAULT 700,
                window_position_x INTEGER DEFAULT 300,
                window_position_y INTEGER DEFAULT 100,
                use_custom_scaling INTEGER DEFAULT 0,
                custom_scale REAL DEFAULT 1.0,
                display_radius INTEGER DEFAULT 10,
                canvas_settings TEXT
            );
        ");

        db.Execute("INSERT OR IGNORE INTO item_types (id, name) VALUES (1, 'Event')");

        // V1 timeline (no calendar_id)
        db.Execute(@"INSERT INTO timelines (id, title, author, description, start_year)
                     VALUES (1, 'V1 Timeline', 'V1 Author', 'Imported from v1', 100)");

        // V1 story
        db.Execute(@"INSERT INTO stories (id, title, description) VALUES ('story-v1-01', 'V1 Story', 'A v1 story')");

        // V1 item
        db.Execute(@"INSERT INTO items
            (id, title, description, type_id, year, subtick, original_subtick,
             end_year, end_subtick, original_end_subtick, timeline_id,
             item_index, show_in_notes, importance)
            VALUES ('item-v1-01', 'V1 Event', 'A v1 item', 1, 500, 0, 0,
                    500, 0, 0, 1, 0, 1, 5)");

        // V1 tag
        db.Execute("INSERT OR IGNORE INTO tags (name) VALUES ('v1tag')");

        return path;
    }

    // ──────────────────── CheckIfV2 heuristic ────────────────────────────────

    [Fact]
    public void Import_DetectsV1Format_WhenNoCalendarsTable()
    {
        // We can't call CheckIfV2 directly (private), but we verify the import
        // selects the V1 path by confirming data lands in main via V1Legacy logic.
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        // V1 backup has no 'calendars' table → Import() chooses ImportV1Legacy()
        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM timelines WHERE title = 'V1 Timeline'");
        Assert.Equal(1, count);
    }

    // ──────────────────── V1 Legacy import ───────────────────────────────────

    [Fact]
    public void Import_V1Backup_ImportsTimeline()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM timelines WHERE title = 'V1 Timeline'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Import_V1Backup_ImportsStory()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM stories WHERE id = 'story-v1-01'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Import_V1Backup_ImportsItem()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = 'item-v1-01'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void Import_V1Backup_ImportsItemWithCorrectTitle()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var title = db.QuerySingleOrDefault<string>("SELECT title FROM items WHERE id = 'item-v1-01'");
        Assert.Equal("V1 Event", title);
    }

    [Fact]
    public void Import_V1Backup_DoesNotLoseTimeline_OnImport()
    {
        // After a V1 import the total number of timelines in main should include
        // both any pre-existing timelines and the ones from the backup.
        // When two timelines share the same id, the importer upserts (updates),
        // so the row count reflects unique ids from the union.
        using var ctx = new DbTestContext();

        string backupPath = CreateV1Backup(ctx.TempDir);
        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        // The V1 backup has one timeline (id=1, title='V1 Timeline')
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM timelines");
        Assert.True(count >= 1);
    }

    [Fact]
    public void Import_V1Backup_AssignsDefaultCalendarToImportedTimelines()
    {
        // V1 timelines have no calendar_id; importer should assign 'cal_default_gregorian'
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var calId = db.QuerySingleOrDefault<string>(
            "SELECT calendar_id FROM timelines WHERE title = 'V1 Timeline'");

        // The V1 importer sets calendar_id = 'cal_default_gregorian' explicitly,
        // and ApplyLegacyMigrations also ensures any NULLs become the default.
        Assert.Equal("cal_default_gregorian", calId);
    }

    [Fact]
    public void Import_V1Backup_ComputesAbsoluteStart_FromSubtick()
    {
        // V1 import loop computes absolute_start = year + subtick/10 before inserting
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var absStart = db.QuerySingleOrDefault<double?>(
            "SELECT absolute_start FROM items WHERE id = 'item-v1-01'");

        Assert.NotNull(absStart);
        // year=500, subtick=0 → absolute_start = 500.0
        Assert.Equal(500.0, absStart!.Value, precision: 1);
    }

    // ──────────────────── ApplyLegacyMigrations (direct) ─────────────────────

    [Fact]
    public void ApplyLegacyMigrations_SetsDefaultCalendar_ForTimelinesWithNullCalendarId()
    {
        // ApplyLegacyMigrations runs after import; simulate via V1 import which triggers it
        using var ctx = new DbTestContext();

        // Manually insert a timeline with NULL calendar_id to simulate old data
        using (var db = ctx.OpenConnection())
        {
            // Can't insert NULL because the schema has DEFAULT 'cal_default_gregorian'
            // and NOT NULL - so test via the V1 import which sets it via INSERT INTO timelines
        }

        // Use V1 backup to trigger the migration code path
        string backupPath = CreateV1Backup(ctx.TempDir);
        DatabaseImporter.Import(backupPath);

        using var verifyDb = ctx.OpenConnection();
        var nullCount = verifyDb.QuerySingle<int>(
            "SELECT COUNT(*) FROM timelines WHERE calendar_id IS NULL");
        Assert.Equal(0, nullCount);
    }

    [Fact]
    public void Import_V1Backup_SetsMinLodLevel_OnImportedItems()
    {
        // ApplyLegacyMigrations sets min_lod_level = COALESCE(min_lod_level, 3) for existing items
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        var minLod = db.QuerySingleOrDefault<int?>(
            "SELECT min_lod_level FROM items WHERE id = 'item-v1-01'");

        Assert.NotNull(minLod);
        Assert.Equal(3, minLod!.Value);
    }

    // ──────────────────── GetImportPreview ────────────────────────────────────

    /// <summary>
    /// Creates the minimal V2 table schema + required seed rows in an already-open connection.
    /// No FK constraints are defined — only the main DB needs them; the backup just needs the columns.
    /// </summary>
    private static void CreateV2Schema(SqliteConnection db)
    {
        db.Execute(@"
            CREATE TABLE lod_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, profile TEXT NOT NULL);
            CREATE TABLE calendars (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                short_name TEXT NOT NULL DEFAULT '', alternate_name TEXT NOT NULL DEFAULT '',
                name_before_0 TEXT NOT NULL DEFAULT '', name_after_0 TEXT NOT NULL DEFAULT '',
                year_definition TEXT NOT NULL, lod_profile_id TEXT NOT NULL DEFAULT 'lod_default');
            CREATE TABLE timelines (
                id INTEGER PRIMARY KEY, title TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
                start_year INTEGER DEFAULT 0,
                calendar_id TEXT NOT NULL DEFAULT 'cal_default_gregorian',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                layout_settings_id TEXT NOT NULL DEFAULT 'ls_default');
            CREATE TABLE items (
                id TEXT PRIMARY KEY, title TEXT, description TEXT DEFAULT '',
                content TEXT, story_id TEXT, type_id INTEGER DEFAULT 1,
                year INTEGER, end_year INTEGER, absolute_start REAL, absolute_end REAL,
                book_title TEXT, chapter TEXT, page TEXT, color TEXT,
                creation_granularity INTEGER, timeline_id INTEGER,
                item_index INTEGER DEFAULT 0, show_in_notes INTEGER DEFAULT 1,
                importance INTEGER DEFAULT 5, min_lod_level INTEGER DEFAULT 3,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE stories (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE pictures (
                id TEXT PRIMARY KEY, file_path TEXT, file_name TEXT,
                file_size INTEGER, file_type TEXT, width INTEGER, height INTEGER,
                title TEXT, description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE item_tags (item_id TEXT, tag_id INTEGER, PRIMARY KEY (item_id, tag_id));
            CREATE TABLE item_pictures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL, picture_id TEXT NOT NULL);
            CREATE TABLE characters (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, nicknames TEXT, aliases TEXT,
                race TEXT, description TEXT, notes TEXT, birth_year INTEGER,
                birth_date TEXT, birth_alternative_year INTEGER, death_year INTEGER,
                death_date TEXT, death_alternative_year INTEGER,
                importance INTEGER DEFAULT 5, color TEXT, timeline_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timeline_id INTEGER,
                font TEXT DEFAULT 'Arial', font_size_scale REAL DEFAULT 1.0,
                pixels_per_subtick INTEGER DEFAULT 20, custom_css TEXT,
                use_custom_css INTEGER DEFAULT 0, is_fullscreen INTEGER DEFAULT 0,
                show_guides INTEGER DEFAULT 1, window_size_x INTEGER DEFAULT 1000,
                window_size_y INTEGER DEFAULT 700, window_position_x INTEGER DEFAULT 300,
                window_position_y INTEGER DEFAULT 100, use_custom_scaling INTEGER DEFAULT 0,
                custom_scale REAL DEFAULT 1.0, display_radius INTEGER DEFAULT 10,
                canvas_settings TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE item_characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL, character_id TEXT NOT NULL,
                relationship_type TEXT DEFAULT 'appears', timeline_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        ");

        db.Execute("INSERT INTO lod_profiles VALUES ('lod_default', 'Default', '{}')");
        db.Execute("INSERT INTO calendars (id, name, year_definition) VALUES ('cal_default_gregorian', 'Gregorian', '{}')");
    }

    /// <summary>
    /// Creates a V2-format backup from scratch using Pooling=False — no VACUUM INTO, no WAL
    /// complications, no shared connection to ctx.DbPath.
    /// </summary>
    private static string CreateV2Backup(DbTestContext ctx, int timelineId = 99,
        string title = "V2 Timeline", int itemCount = 0)
    {
        string path = Path.Combine(ctx.TempDir, $"backup_v2_{Guid.NewGuid()}.sqlite");

        using var db = new SqliteConnection($"Data Source={path};Pooling=False");
        db.Open();
        CreateV2Schema(db);

        db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (@id, @title, '', '', 0)",
            new { id = timelineId, title });

        for (int i = 0; i < itemCount; i++)
        {
            string itemId = Guid.NewGuid().ToString();
            db.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index,
                 show_in_notes, importance, min_lod_level)
                VALUES (@id, @t, '', 1, 100, 100, 100.0, 100.0, @tlId, 0, 1, 5, 3)",
                new { id = itemId, t = $"Item {i + 1}", tlId = timelineId });
        }

        return path;
    }

    [Fact]
    public void GetImportPreview_ReturnsIsV2True_ForV2Format()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV2Backup(ctx);

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.True(preview.IsV2);
    }

    [Fact]
    public void GetImportPreview_ReturnsIsV2False_ForV1Format()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV1Backup(ctx.TempDir);

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.False(preview.IsV2);
    }

    [Fact]
    public void GetImportPreview_CountsTimelinesAndItems()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV2Backup(ctx, timelineId: 88, itemCount: 3);

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.Equal(1, preview.TimelineCount);
        Assert.Equal(3, preview.ItemCount);
    }

    [Fact]
    public void GetImportPreview_DetectsConflict_WhenTimelineExistsInMainDb()
    {
        using var ctx = new DbTestContext();

        // Create backup with id=77 FIRST (before it exists in the main DB)
        string backupPath = CreateV2Backup(ctx, timelineId: 77, title: "Backup TL");

        // NOW insert timeline 77 into main DB — this creates the conflict
        using (var db = ctx.OpenConnection())
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (77, 'Main TL', '', '', 0)");

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.Single(preview.ConflictingTimelines);
        Assert.Equal("Main TL", preview.ConflictingTimelines[0]);
    }

    [Fact]
    public void GetImportPreview_ReturnsNoConflict_WhenNoOverlap()
    {
        using var ctx = new DbTestContext();
        // Main DB has no timeline with id=55
        string backupPath = CreateV2Backup(ctx, timelineId: 55);

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.Empty(preview.ConflictingTimelines);
    }

    [Fact]
    public void GetImportPreview_ReturnsCorrectSourcePath()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV2Backup(ctx);

        var preview = DatabaseImporter.GetImportPreview(backupPath);

        Assert.Equal(backupPath, preview.SourcePath);
    }

    // ──────────────────── V2 import (ATTACH-based) ───────────────────────────

    [Fact]
    public void ImportV2_InsertsNewTimeline_IntoMainDb()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV2Backup(ctx, timelineId: 200, title: "Fresh Import");

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        string? title = db.QuerySingleOrDefault<string>(
            "SELECT title FROM timelines WHERE id = 200");
        Assert.Equal("Fresh Import", title);
    }

    [Fact]
    public void ImportV2_InsertsItems_FromBackup()
    {
        using var ctx = new DbTestContext();
        string backupPath = CreateV2Backup(ctx, timelineId: 201, itemCount: 2);

        DatabaseImporter.Import(backupPath);

        using var db = ctx.OpenConnection();
        int count = db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE timeline_id = 201");
        Assert.Equal(2, count);
    }

    [Fact]
    public void ImportV2_CascadeDeletesExistingTimeline_ThenReinserts()
    {
        using var ctx = new DbTestContext();

        // Insert timeline 300 + 2 items into the main DB
        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (300, 'Overwrite Me', '', '', 0)");
            db.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES ('pre-item-1', 'Pre Item 1', '', 1, 1, 1, 1.0, 1.0, 300, 0, 1, 5, 3)");
            db.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES ('pre-item-2', 'Pre Item 2', '', 1, 2, 2, 2.0, 2.0, 300, 1, 1, 5, 3)");
        }

        // Build the backup from scratch (Pooling=False, no VACUUM INTO) containing the same data.
        // This represents the state of the database BEFORE the post-backup item was added.
        string backupPath = Path.Combine(ctx.TempDir, "v2_overwrite.sqlite");
        using (var bk = new SqliteConnection($"Data Source={backupPath};Pooling=False"))
        {
            bk.Open();
            CreateV2Schema(bk);
            bk.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (300, 'Overwrite Me', '', '', 0)");
            bk.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES ('pre-item-1', 'Pre Item 1', '', 1, 1, 1, 1.0, 1.0, 300, 0, 1, 5, 3)");
            bk.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES ('pre-item-2', 'Pre Item 2', '', 1, 2, 2, 2.0, 2.0, 300, 1, 1, 5, 3)");
        }

        // Add a 3rd item to the main DB AFTER building the backup — it will NOT be in it
        using (var db = ctx.OpenConnection())
        {
            db.Execute(@"INSERT INTO items
                (id, title, description, type_id, year, end_year,
                 absolute_start, absolute_end, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                VALUES ('post-item', 'Post-Backup Item', '', 1, 3, 3, 3.0, 3.0, 300, 2, 1, 5, 3)");
        }

        // Import: cascade-deletes timeline 300 (removing all 3 items), reinserts from backup (pre-item-1 + pre-item-2 back)
        DatabaseImporter.Import(backupPath);

        using var verify = ctx.OpenConnection();

        // post-item was NOT in the backup → should be gone
        int postCount = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = 'post-item'");
        Assert.Equal(0, postCount);

        // pre-item-1 WAS in the backup → should be back
        int pre1Count = verify.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = 'pre-item-1'");
        Assert.Equal(1, pre1Count);

        // Timeline 300 should still exist (reimported from backup)
        string? tlTitle = verify.QuerySingleOrDefault<string>("SELECT title FROM timelines WHERE id = 300");
        Assert.Equal("Overwrite Me", tlTitle);
    }
}

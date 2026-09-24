using Dapper;
using Microsoft.Data.Sqlite;
using StoryTimelineMk2;
using StoryTimelineMk2.Database;
using System.IO.Compression;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// Stress-tests the full data system: backup/restore roundtrips across every table,
/// cascade deletes, multi-checkpoint restore, and a full lifecycle scenario.
/// Each test runs in a fresh isolated temp database (DbTestContext).
/// </summary>
[Collection("Database")]
public class DbStressTests
{
    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static int SeedTimeline(DbTestContext ctx, string title = "Timeline", string? calId = null)
    {
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO timelines (title, author, description, calendar_id, layout_settings_id)
                     VALUES (@title, 'Author', 'Desc', @cal, 'ls_default')",
            new { title, cal = calId ?? "cal_default_gregorian" });
        return (int)db.QuerySingle<long>("SELECT last_insert_rowid()");
    }

    private static string SeedItem(DbTestContext ctx, int tlId, string title = "Event",
        int typeId = 1, double absStart = 100.0)
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO items (id, title, type_id, year, absolute_start, absolute_end,
                                       timeline_id, importance)
                     VALUES (@id, @title, @typeId, @year, @s, @s, @tl, 5)",
            new { id, title, typeId, year = (int)absStart, s = absStart, tl = tlId });
        return id;
    }

    private static string SeedCharacter(DbTestContext ctx, int tlId, string name = "Character")
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO characters (id, name, timeline_id, importance) VALUES (@id, @name, @tl, 5)",
            new { id, name, tl = tlId });
        return id;
    }

    private static string SeedStory(DbTestContext ctx, string title = "Story")
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO stories (id, title) VALUES (@id, @title)", new { id, title });
        return id;
    }

    private static int SeedTag(DbTestContext ctx, string name)
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT OR IGNORE INTO tags (name) VALUES (@name)", new { name });
        return db.QuerySingle<int>("SELECT id FROM tags WHERE name = @name", new { name });
    }

    private static string SeedPicture(DbTestContext ctx, string fileName = "img.png")
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO pictures (id, file_path, file_name, file_size, file_type, width, height)
                     VALUES (@id, @path, @fn, 1024, 'image/png', 800, 600)",
            new { id, path = "/media/" + fileName, fn = fileName });
        return id;
    }

    /// <summary>
    /// Creates a custom calendar with a non-Gregorian YearDefinition and a matching LOD profile.
    /// Returns the calendar id.
    /// </summary>
    private static string SeedCalendar(DbTestContext ctx, string name = "Custom Cal")
    {
        var lodId = Guid.NewGuid().ToString();
        var calId = Guid.NewGuid().ToString();
        const string yd = @"{
            ""length"": 200,
            ""months"": 4,
            ""month_definition"": {
                ""0"": {""name"": ""Ironmoon"", ""length"": 50, ""season"": 0},
                ""1"": {""name"": ""Ashbloom"", ""length"": 50, ""season"": 0},
                ""2"": {""name"": ""Tidekin"",  ""length"": 50, ""season"": 1},
                ""3"": {""name"": ""Frostrise"", ""length"": 50, ""season"": 1}
            },
            ""seasons"": 2,
            ""season_definition"": {
                ""0"": {""name"": ""Darktide"", ""short_name"": ""DT"", ""start"": 0, ""end"": 99},
                ""1"": {""name"": ""Goldwake"", ""short_name"": ""GW"", ""start"": 100, ""end"": 199}
            },
            ""week_definition"": {
                ""length"": 5,
                ""days_have_names"": true,
                ""days"": [""Ashday"",""Tideday"",""Stoneday"",""Fireday"",""Restday""],
                ""weekend"": [3, 4]
            },
            ""year_start_dow"": 0,
            ""memorable_days"": []
        }";
        const string lod = @"[
            {""index"":0,""formatKey"":""MILLENNIA"",""stepFraction"":1000},
            {""index"":3,""formatKey"":""YEARS"",    ""stepFraction"":1},
            {""index"":7,""formatKey"":""DAYS"",     ""stepFraction"":0.005}
        ]";
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO lod_profiles (id, name, profile) VALUES (@id, @name, @lod)",
            new { id = lodId, name = name + " LOD", lod });
        var shortName = name[..4];
        db.Execute(@"INSERT INTO calendars
                     (id, name, short_name, alternate_name, name_before_0, name_after_0,
                      lod_profile_id, year_definition)
                     VALUES (@calId, @name, @shortName, '', 'Before', 'After', @lodId, @yd)",
            new { calId, name, shortName, lodId, yd });
        return calId;
    }

    private static int Count(DbTestContext ctx, string table, string? where = null)
    {
        using var db = ctx.OpenConnection();
        return db.QuerySingle<int>(
            $"SELECT COUNT(*) FROM {table}" + (where != null ? $" WHERE {where}" : ""));
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// TEST 1 — Every major entity type can be written and read back correctly.
    /// Covers: timelines, items, characters, stories, tags, pictures, notes,
    /// hidden_ranges, filter_presets, filter_rules, character_relationships,
    /// item_tags, item_character_appearances, item_pictures, item_story_refs.
    /// </summary>
    [Fact]
    public void FullEntityCrud_AllTablesPopulate_DataPersists()
    {
        using var ctx = new DbTestContext();

        var calId   = SeedCalendar(ctx, "Test Calendar");
        var tl1Id   = SeedTimeline(ctx, "Alpha Timeline", calId);
        var tl2Id   = SeedTimeline(ctx, "Beta Timeline");
        var storyId = SeedStory(ctx, "The Dark Saga");
        var tagWar  = SeedTag(ctx, "war");
        var tagMag  = SeedTag(ctx, "magic");
        var char1   = SeedCharacter(ctx, tl1Id, "Hero");
        var char2   = SeedCharacter(ctx, tl1Id, "Villain");
        var picId   = SeedPicture(ctx, "hero.png");

        var items = Enumerable.Range(0, 8)
            .Select(i => SeedItem(ctx, tl1Id, $"Event {i}", 1, 100.0 + i * 10))
            .ToList();

        using (var db = ctx.OpenConnection())
        {
            // Junctions on item 0
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = items[0], t = tagWar });
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = items[0], t = tagMag });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@i, @c, 'lead')", new { i = items[0], c = char1 });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@i, @p)", new { i = items[0], p = picId });
            db.Execute("INSERT INTO item_story_refs (item_id, story_id) VALUES (@i, @s)", new { i = items[1], s = storyId });

            // Character relationship
            db.Execute(@"INSERT INTO character_relationships
                         (character_1_id, character_2_id, relationship_type, relationship_strength, timeline_id)
                         VALUES (@c1, @c2, 'rival', 90, @tl)",
                new { c1 = char1, c2 = char2, tl = tl1Id });

            // Notes
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, absolute_time) VALUES (@id, 'A note', @tl, 100.0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });

            // Hidden range
            db.Execute("INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year, label) VALUES (@tl, 500, 600, 'Gap')",
                new { tl = tl1Id });

            // Filter preset + rule
            var presetId = Guid.NewGuid().ToString();
            db.Execute("INSERT INTO filter_presets (id, name, rules_json, and_mode) VALUES (@id, 'War Filter', '[]', 0)",
                new { id = presetId });
            db.Execute(@"INSERT INTO timeline_filter_rules (id, timeline_id, dimension, params_json, label, state, sort_order)
                         VALUES (@id, @tl, 'tag', '{}', 'War', 'positive', 0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });
        }

        // Verify every table
        Assert.Equal(2, Count(ctx, "timelines"));
        Assert.Equal(2, Count(ctx, "calendars")); // default + seeded
        Assert.Equal(8, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(2, Count(ctx, "characters", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "stories"));
        Assert.Equal(2, Count(ctx, "tags"));
        Assert.Equal(1, Count(ctx, "pictures"));
        Assert.Equal(2, Count(ctx, "item_tags", $"item_id = '{items[0]}'"));
        Assert.Equal(1, Count(ctx, "item_character_appearances", $"item_id = '{items[0]}'"));
        Assert.Equal(1, Count(ctx, "item_pictures", $"item_id = '{items[0]}'"));
        Assert.Equal(1, Count(ctx, "item_story_refs"));
        Assert.Equal(1, Count(ctx, "character_relationships"));
        Assert.Equal(1, Count(ctx, "notes", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "timeline_hidden_ranges", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "filter_presets"));
        Assert.Equal(1, Count(ctx, "timeline_filter_rules", $"timeline_id = {tl1Id}"));
    }

    /// <summary>
    /// TEST 2 — A .sqlite backup created by BackupService contains exactly the data
    /// that was in the live database at the moment of backup.
    /// </summary>
    [Fact]
    public void BackupContent_MatchesLiveStateAtCreationTime()
    {
        using var ctx = new DbTestContext();

        var calId   = SeedCalendar(ctx, "Snapped Calendar");
        var tl1Id   = SeedTimeline(ctx, "Snapshot TL", calId);
        var storyId = SeedStory(ctx, "Snapshot Story");
        var char1   = SeedCharacter(ctx, tl1Id, "Snapshot Char");
        var picId   = SeedPicture(ctx, "snap.png");
        var items   = Enumerable.Range(0, 5)
                        .Select(i => SeedItem(ctx, tl1Id, $"Snap Item {i}", 1, 10.0 + i))
                        .ToList();

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, absolute_time) VALUES (@id, 'Snap note', @tl, 10.0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });
            db.Execute("INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year) VALUES (@tl, 100, 200)", new { tl = tl1Id });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@i, @p)", new { i = items[0], p = picId });
        }

        SqliteConnection.ClearAllPools();
        var backupPath = BackupService.CreateBackup(includeMedia: false);

        using var bk = new SqliteConnection($"Data Source={backupPath};Mode=ReadOnly");
        bk.Open();

        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM timelines"));
        Assert.Equal(2,  bk.QuerySingle<int>("SELECT COUNT(*) FROM calendars"));
        Assert.Equal(5,  bk.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM stories WHERE id = @id", new { id = storyId }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM characters WHERE id = @id", new { id = char1 }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM notes WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM timeline_hidden_ranges WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM pictures WHERE id = @id", new { id = picId }));
        Assert.Equal(1,  bk.QuerySingle<int>("SELECT COUNT(*) FROM item_pictures WHERE item_id = @i", new { i = items[0] }));
    }

    /// <summary>
    /// TEST 3 — Restoring a V2 backup brings back every table that the importer
    /// is responsible for: notes, hidden_ranges, filter_presets, filter_rules,
    /// calendars, lod_profiles, layout_settings.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_AllTableTypesPreserved()
    {
        using var ctx = new DbTestContext();

        var calId = SeedCalendar(ctx, "Fantasy Cal");
        var tl1Id = SeedTimeline(ctx, "Restore TL", calId);
        var itemId = SeedItem(ctx, tl1Id, "Item A");

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, absolute_time) VALUES (@id, 'Note A', @tl, 50.0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });
            db.Execute("INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year, label) VALUES (@tl, 200, 300, 'Gap')",
                new { tl = tl1Id });
            db.Execute("INSERT INTO filter_presets (id, name, rules_json) VALUES (@id, 'P1', '[]')",
                new { id = Guid.NewGuid().ToString() });
            db.Execute(@"INSERT INTO timeline_filter_rules (id, timeline_id, dimension, params_json, label, state, sort_order)
                         VALUES (@id, @tl, 'type', '{}', 'Events', 'positive', 0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });
        }

        SqliteConnection.ClearAllPools();
        var backupPath = BackupService.CreateBackup(includeMedia: false);

        // Wipe the tables the importer must restore.
        // Disable FK checks: a pooled connection from a prior Import call may have FK=ON,
        // and the calendars table has a FK from timelines — the wipe order must be relaxed.
        using (var db = ctx.OpenConnection())
        {
            db.Execute("PRAGMA foreign_keys = OFF");
            db.Execute("DELETE FROM notes");
            db.Execute("DELETE FROM timeline_hidden_ranges");
            db.Execute("DELETE FROM filter_presets");
            db.Execute("DELETE FROM timeline_filter_rules");
            db.Execute("DELETE FROM calendars WHERE id != 'cal_default_gregorian'");
            db.Execute("DELETE FROM lod_profiles WHERE id != 'lod_default'");
        }

        Assert.Equal(0, Count(ctx, "notes"));
        Assert.Equal(0, Count(ctx, "filter_presets"));

        DatabaseImporter.Import(backupPath);

        Assert.Equal(1, Count(ctx, "notes", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "timeline_hidden_ranges", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "filter_presets"));
        Assert.Equal(1, Count(ctx, "timeline_filter_rules", $"timeline_id = {tl1Id}"));
        Assert.Equal(2, Count(ctx, "calendars")); // default + fantasy
        Assert.Equal(2, Count(ctx, "lod_profiles")); // default + fantasy
    }

    /// <summary>
    /// TEST 4 — Characters, their relationships, and character appearances on items
    /// all survive a backup/restore cycle intact.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_CharactersAndRelationships_Preserved()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Char TL");
        var itemId = SeedItem(ctx, tl1Id, "Battle");
        var c1 = SeedCharacter(ctx, tl1Id, "Kael");
        var c2 = SeedCharacter(ctx, tl1Id, "Sera");

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@i, @c, 'protagonist')",
                new { i = itemId, c = c1 });
            db.Execute(@"INSERT INTO character_relationships
                         (character_1_id, character_2_id, relationship_type, relationship_strength, timeline_id)
                         VALUES (@c1, @c2, 'ally', 80, @tl)",
                new { c1, c2, tl = tl1Id });
        }

        SqliteConnection.ClearAllPools();
        var backup = BackupService.CreateBackup(includeMedia: false);

        // Wipe character data
        using (var db = ctx.OpenConnection())
        {
            db.Execute("DELETE FROM item_character_appearances");
            db.Execute("DELETE FROM character_relationships");
            db.Execute("DELETE FROM characters");
        }

        DatabaseImporter.Import(backup);

        Assert.Equal(2, Count(ctx, "characters", $"timeline_id = {tl1Id}"));
        Assert.Equal(1, Count(ctx, "item_character_appearances", $"item_id = '{itemId}'"));
        Assert.Equal(1, Count(ctx, "character_relationships"));

        using var db2 = ctx.OpenConnection();
        var role = db2.QuerySingle<string>("SELECT role FROM item_character_appearances WHERE item_id = @i", new { i = itemId });
        Assert.Equal("protagonist", role);
        var rel = db2.QuerySingle<string>("SELECT relationship_type FROM character_relationships WHERE character_1_id = @c", new { c = c1 });
        Assert.Equal("ally", rel);
    }

    /// <summary>
    /// TEST 5 — Item junctions (tags, story refs, pictures) survive backup/restore.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_ItemJunctions_Preserved()
    {
        using var ctx = new DbTestContext();

        var tl1Id   = SeedTimeline(ctx, "Junction TL");
        var itemId  = SeedItem(ctx, tl1Id, "Junctioned Item");
        var storyId = SeedStory(ctx, "Epic Tale");
        var tagId   = SeedTag(ctx, "epic");
        var picId   = SeedPicture(ctx, "cover.png");

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = itemId, t = tagId });
            db.Execute("INSERT INTO item_story_refs (item_id, story_id) VALUES (@i, @s)", new { i = itemId, s = storyId });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@i, @p)", new { i = itemId, p = picId });
        }

        SqliteConnection.ClearAllPools();
        var backup = BackupService.CreateBackup(includeMedia: false);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("DELETE FROM item_tags");
            db.Execute("DELETE FROM item_story_refs");
            db.Execute("DELETE FROM item_pictures");
            db.Execute("DELETE FROM pictures");
            db.Execute("DELETE FROM stories");
            db.Execute("DELETE FROM tags");
        }

        DatabaseImporter.Import(backup);

        Assert.Equal(1, Count(ctx, "item_tags", $"item_id = '{itemId}'"));
        Assert.Equal(1, Count(ctx, "item_story_refs", $"item_id = '{itemId}'"));
        Assert.Equal(1, Count(ctx, "item_pictures", $"item_id = '{itemId}'"));
        Assert.Equal(1, Count(ctx, "pictures"));
        Assert.Equal(1, Count(ctx, "stories"));
        Assert.Equal(1, Count(ctx, "tags"));
    }

    /// <summary>
    /// TEST 6 — Books, chapters, and item_chapters survive backup/restore.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_BooksAndChapters_Preserved()
    {
        using var ctx = new DbTestContext();

        var tl1Id   = SeedTimeline(ctx, "Book TL");
        var itemId  = SeedItem(ctx, tl1Id, "Chapter Event");
        var storyId = SeedStory(ctx, "The Chronicle");

        var bookId    = Guid.NewGuid().ToString();
        var chapterId = Guid.NewGuid().ToString();

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO books (id, title, author) VALUES (@id, 'The Great Chronicle', 'Author')", new { id = bookId });
            db.Execute("INSERT INTO book_stories (book_id, story_id) VALUES (@b, @s)", new { b = bookId, s = storyId });
            db.Execute("INSERT INTO chapters (id, book_id, number, title) VALUES (@id, @b, 1, 'Chapter One')", new { id = chapterId, b = bookId });
            db.Execute("INSERT INTO item_chapters (item_id, chapter_id) VALUES (@i, @c)", new { i = itemId, c = chapterId });
        }

        SqliteConnection.ClearAllPools();
        var backup = BackupService.CreateBackup(includeMedia: false);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("DELETE FROM item_chapters");
            db.Execute("DELETE FROM chapters");
            db.Execute("DELETE FROM book_stories");
            db.Execute("DELETE FROM books");
        }

        DatabaseImporter.Import(backup);

        Assert.Equal(1, Count(ctx, "books"));
        Assert.Equal(1, Count(ctx, "book_stories", $"book_id = '{bookId}'"));
        Assert.Equal(1, Count(ctx, "chapters", $"book_id = '{bookId}'"));
        Assert.Equal(1, Count(ctx, "item_chapters", $"item_id = '{itemId}'"));

        using var db2 = ctx.OpenConnection();
        var title = db2.QuerySingle<string>("SELECT title FROM chapters WHERE id = @id", new { id = chapterId });
        Assert.Equal("Chapter One", title);
    }

    /// <summary>
    /// TEST 7 — A custom calendar (including its year_definition JSON and linked LOD profile)
    /// survives a backup/restore cycle with content integrity.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_CustomCalendar_YearDefinitionAndLodIntact()
    {
        using var ctx = new DbTestContext();

        var calId = SeedCalendar(ctx, "Draconic");
        var tl1Id = SeedTimeline(ctx, "Fantasy TL", calId);

        SqliteConnection.ClearAllPools();
        var backup = BackupService.CreateBackup(includeMedia: false);

        // Wipe calendar data
        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE timelines SET calendar_id = 'cal_default_gregorian'");
            db.Execute("DELETE FROM calendars WHERE id != 'cal_default_gregorian'");
            db.Execute("DELETE FROM lod_profiles WHERE id != 'lod_default'");
        }

        Assert.Equal(1, Count(ctx, "calendars"));
        DatabaseImporter.Import(backup);
        Assert.Equal(2, Count(ctx, "calendars"));
        Assert.Equal(2, Count(ctx, "lod_profiles"));

        using var db2 = ctx.OpenConnection();
        var yd = db2.QuerySingle<string>("SELECT year_definition FROM calendars WHERE id = @id", new { id = calId });
        Assert.Contains("Ironmoon",  yd);
        Assert.Contains("Darktide",  yd);
        Assert.Contains("Goldwake",  yd);
        Assert.Contains("200",       yd); // year length

        var tlCal = db2.QuerySingle<string>("SELECT calendar_id FROM timelines WHERE id = @id", new { id = tl1Id });
        Assert.Equal(calId, tlCal);
    }

    /// <summary>
    /// TEST 8 — After three backup checkpoints at different data states,
    /// restoring checkpoint 1 produces exactly the state that existed then.
    /// </summary>
    [Fact]
    public void MultipleBackups_RestoreToFirstCheckpoint_CorrectState()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Checkpoint TL");

        // Checkpoint 1: 3 items
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"CP1 Item {i}", 1, 10.0 + i);
        SqliteConnection.ClearAllPools();
        var ckpt1 = BackupService.CreateBackup(includeMedia: false);

        // Checkpoint 2: 3 more items, 1 more timeline
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"CP2 Item {i}", 1, 20.0 + i);
        SeedTimeline(ctx, "Extra TL");
        Thread.Sleep(1100); // VACUUM INTO names files by second — ensure different timestamp
        SqliteConnection.ClearAllPools();
        var ckpt2 = BackupService.CreateBackup(includeMedia: false);

        // Checkpoint 3: 3 more items, a custom calendar
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"CP3 Item {i}", 1, 30.0 + i);
        SeedCalendar(ctx, "Late Calendar");
        SqliteConnection.ClearAllPools();

        Assert.Equal(9,  Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(2,  Count(ctx, "timelines"));
        Assert.Equal(2,  Count(ctx, "calendars"));

        // Restore to checkpoint 1
        DatabaseImporter.Import(ckpt1);

        Assert.Equal(3,  Count(ctx, "items", $"timeline_id = {tl1Id}"));
        // Import only deletes timelines that ARE in the backup, so target-only timelines survive.
        Assert.Equal(2,  Count(ctx, "timelines")); // tl1 (restored) + Extra TL (not in ckpt1 → stays)
        Assert.Equal(2,  Count(ctx, "calendars")); // default + Late Calendar (not in ckpt1 → stays)

        using var db = ctx.OpenConnection();
        var titles = db.Query<string>("SELECT title FROM items WHERE timeline_id = @tl ORDER BY absolute_start", new { tl = tl1Id }).ToList();
        Assert.All(titles, t => Assert.StartsWith("CP1", t));
    }

    /// <summary>
    /// TEST 9 — Restoring checkpoint 2 gives the mid-point state, not the latest state.
    /// </summary>
    [Fact]
    public void MultipleBackups_RestoreToMidCheckpoint_CorrectState()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Mid TL");

        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"Phase1 {i}", 1, 10.0 + i);
        SqliteConnection.ClearAllPools();
        var ckpt1 = BackupService.CreateBackup(includeMedia: false);

        for (int i = 0; i < 4; i++) SeedItem(ctx, tl1Id, $"Phase2 {i}", 2, 20.0 + i);
        var calId = SeedCalendar(ctx, "Mid Calendar");
        Thread.Sleep(1100); // VACUUM INTO names files by second — ensure different timestamp
        SqliteConnection.ClearAllPools();
        var ckpt2 = BackupService.CreateBackup(includeMedia: false);

        for (int i = 0; i < 5; i++) SeedItem(ctx, tl1Id, $"Phase3 {i}", 1, 30.0 + i);
        SeedTimeline(ctx, "Phase3 Extra TL");
        SqliteConnection.ClearAllPools();

        Assert.Equal(12, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(2,  Count(ctx, "timelines"));

        DatabaseImporter.Import(ckpt2);

        Assert.Equal(7,  Count(ctx, "items", $"timeline_id = {tl1Id}")); // 3 + 4
        // Phase3 Extra TL was added after ckpt2 — it's not in the backup so it stays.
        Assert.Equal(2,  Count(ctx, "timelines")); // tl1 (restored) + Phase3 Extra TL (stays)
        Assert.Equal(2,  Count(ctx, "calendars")); // default + mid calendar

        using var db = ctx.OpenConnection();
        Assert.Equal(3, db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title LIKE 'Phase1%'"));
        Assert.Equal(4, db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title LIKE 'Phase2%'"));
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title LIKE 'Phase3%'"));
    }

    /// <summary>
    /// TEST 10 — Deleting a timeline cascade-deletes items, characters, notes,
    /// hidden ranges, and filter rules. Junction rows on those items are gone too.
    /// </summary>
    [Fact]
    public void TimelineCascadeDelete_RemovesAllLinkedData()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Doomed TL");
        var itemId = SeedItem(ctx, tl1Id, "Doomed Item");
        var charId = SeedCharacter(ctx, tl1Id, "Doomed Char");
        var tagId  = SeedTag(ctx, "doomed");

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = itemId, t = tagId });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@i, @c, 'lead')", new { i = itemId, c = charId });
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, absolute_time) VALUES (@id, 'Gone', @tl, 10.0)", new { id = Guid.NewGuid().ToString(), tl = tl1Id });
            db.Execute("INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year) VALUES (@tl, 100, 200)", new { tl = tl1Id });
            db.Execute(@"INSERT INTO timeline_filter_rules (id, timeline_id, dimension, params_json, label, state, sort_order)
                         VALUES (@id, @tl, 'type', '{}', 'X', 'positive', 0)",
                new { id = Guid.NewGuid().ToString(), tl = tl1Id });
        }

        using (var db = ctx.OpenConnection())
        {
            db.Execute("PRAGMA foreign_keys = ON");
            db.Execute("DELETE FROM timelines WHERE id = @id", new { id = tl1Id });
        }

        Assert.Equal(0, Count(ctx, "timelines",           $"id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "items",               $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "characters",          $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "notes",               $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "timeline_hidden_ranges", $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "timeline_filter_rules",  $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "item_tags",              $"item_id = '{itemId}'"));
        Assert.Equal(0, Count(ctx, "item_character_appearances", $"item_id = '{itemId}'"));
    }

    /// <summary>
    /// TEST 11 — Deleting one timeline leaves a second timeline's data completely intact.
    /// </summary>
    [Fact]
    public void TimelineCascadeDelete_PreservesOtherTimeline()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Delete Me");
        var tl2Id = SeedTimeline(ctx, "Keep Me");

        for (int i = 0; i < 5; i++) SeedItem(ctx, tl1Id, $"TL1 Item {i}", 1, 10.0 + i);
        for (int i = 0; i < 5; i++) SeedItem(ctx, tl2Id, $"TL2 Item {i}", 1, 10.0 + i);
        SeedCharacter(ctx, tl1Id, "TL1 Char");
        SeedCharacter(ctx, tl2Id, "TL2 Char");

        using (var db = ctx.OpenConnection())
        {
            db.Execute("PRAGMA foreign_keys = ON");
            db.Execute("DELETE FROM timelines WHERE id = @id", new { id = tl1Id });
        }

        Assert.Equal(5, Count(ctx, "items",      $"timeline_id = {tl2Id}"));
        Assert.Equal(1, Count(ctx, "characters", $"timeline_id = {tl2Id}"));
        Assert.Equal(0, Count(ctx, "items",      $"timeline_id = {tl1Id}"));
        Assert.Equal(0, Count(ctx, "characters", $"timeline_id = {tl1Id}"));
    }

    /// <summary>
    /// TEST 12 — Deleting an item cascades to its junction rows
    /// (item_tags, item_character_appearances, item_pictures, item_chapters).
    /// </summary>
    [Fact]
    public void ItemDelete_CascadesJunctionRows()
    {
        using var ctx = new DbTestContext();

        var tl1Id   = SeedTimeline(ctx, "Item Delete TL");
        var itemId  = SeedItem(ctx, tl1Id, "Junced Item");
        var charId  = SeedCharacter(ctx, tl1Id, "A Char");
        var tagId   = SeedTag(ctx, "deletable");
        var picId   = SeedPicture(ctx, "del.png");
        var storyId = SeedStory(ctx, "A Story");
        var bookId  = Guid.NewGuid().ToString();
        var chapId  = Guid.NewGuid().ToString();

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = itemId, t = tagId });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@i, @c, 'x')", new { i = itemId, c = charId });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@i, @p)", new { i = itemId, p = picId });
            db.Execute("INSERT INTO item_story_refs (item_id, story_id) VALUES (@i, @s)", new { i = itemId, s = storyId });
            db.Execute("INSERT INTO books (id, title) VALUES (@id, 'A Book')", new { id = bookId });
            db.Execute("INSERT INTO chapters (id, book_id, number, title) VALUES (@id, @b, 1, 'C1')", new { id = chapId, b = bookId });
            db.Execute("INSERT INTO item_chapters (item_id, chapter_id) VALUES (@i, @c)", new { i = itemId, c = chapId });
        }

        using (var db = ctx.OpenConnection())
        {
            db.Execute("PRAGMA foreign_keys = ON");
            db.Execute("DELETE FROM items WHERE id = @id", new { id = itemId });
        }

        Assert.Equal(0, Count(ctx, "item_tags",                  $"item_id = '{itemId}'"));
        Assert.Equal(0, Count(ctx, "item_character_appearances",  $"item_id = '{itemId}'"));
        Assert.Equal(0, Count(ctx, "item_pictures",              $"item_id = '{itemId}'"));
        Assert.Equal(0, Count(ctx, "item_story_refs",            $"item_id = '{itemId}'"));
        Assert.Equal(0, Count(ctx, "item_chapters",              $"item_id = '{itemId}'"));
        // Non-junction rows that existed before the item should still exist
        Assert.Equal(1, Count(ctx, "pictures", $"id = '{picId}'"));
        Assert.Equal(1, Count(ctx, "stories",  $"id = '{storyId}'"));
    }

    /// <summary>
    /// TEST 13 — Calling DbInitializer.Initialize() on an existing database is idempotent:
    /// it does not wipe user data, duplicate seed rows, or corrupt built-in presets.
    /// </summary>
    [Fact]
    public void Initialize_CalledTwice_IsIdempotentAndPreservesData()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Idem TL");
        SeedItem(ctx, tl1Id, "Idem Item");
        SeedCalendar(ctx, "Idem Calendar");

        // Second call should be a no-op for user data and seed data
        DbInitializer.Initialize();

        Assert.Equal(1, Count(ctx, "timelines"));
        Assert.Equal(1, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(2, Count(ctx, "calendars"));             // default + idem
        Assert.Equal(2, Count(ctx, "layout_settings"));       // ls_default + ls_dark — no duplicates
        Assert.Equal(1, Count(ctx, "lod_profiles", "id = 'lod_default'"));
    }

    /// <summary>
    /// TEST 14 — Restoring a backup that contains an older version of a timeline
    /// replaces the live (modified) version with the backup version.
    /// </summary>
    [Fact]
    public void RestoreFromBackup_OverwritesModifiedTimeline_WithBackupVersion()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Overwrite TL");
        for (int i = 0; i < 4; i++) SeedItem(ctx, tl1Id, $"Original {i}", 1, 10.0 + i);

        SqliteConnection.ClearAllPools();
        var backup = BackupService.CreateBackup(includeMedia: false);

        // Mutate the live DB significantly
        for (int i = 0; i < 6; i++) SeedItem(ctx, tl1Id, $"Added After {i}", 1, 50.0 + i);
        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE timelines SET title = 'Mutated TL' WHERE id = @id", new { id = tl1Id });

        Assert.Equal(10, Count(ctx, "items", $"timeline_id = {tl1Id}"));

        // Restore — should revert to 4 original items and original title
        DatabaseImporter.Import(backup);

        Assert.Equal(4, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        using var db2 = ctx.OpenConnection();
        var title = db2.QuerySingle<string>("SELECT title FROM timelines WHERE id = @id", new { id = tl1Id });
        Assert.Equal("Overwrite TL", title);
        Assert.Equal(0, db2.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE title LIKE 'Added After%'"));
    }

    /// <summary>
    /// TEST 15 — Full lifecycle stress scenario:
    /// populate all entity types → backup 1 → expand data → backup 2 → further changes
    /// → delete a timeline → restore to backup 1 → verify exact state → add more data
    /// → final backup → open final backup and verify integrity.
    /// </summary>
    [Fact]
    public void StressScenario_FullLifecycle_AllCheckpointsIntact()
    {
        using var ctx = new DbTestContext();

        // ── Phase 1: Bootstrap ────────────────────────────────────────────────
        var worldCalId = SeedCalendar(ctx, "World Calendar");
        var tl1Id      = SeedTimeline(ctx, "Main Chronicle", worldCalId);
        var tl2Id      = SeedTimeline(ctx, "Side Story");
        var storyId    = SeedStory(ctx, "The Prophecy");
        var tagWar     = SeedTag(ctx, "war");
        var tagMagic   = SeedTag(ctx, "magic");
        var hero       = SeedCharacter(ctx, tl1Id, "Kael");
        var sidekick   = SeedCharacter(ctx, tl1Id, "Sera");
        var picId      = SeedPicture(ctx, "kael.png");
        var p1Items    = Enumerable.Range(0, 6)
                           .Select(i => SeedItem(ctx, tl1Id, $"Chronicle P1 {i}", 1, 100.0 + i * 10))
                           .ToList();

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = p1Items[0], t = tagWar });
            db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@i, @t)", new { i = p1Items[0], t = tagMagic });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, role) VALUES (@i, @c, 'protagonist')", new { i = p1Items[0], c = hero });
            db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@i, @p)", new { i = p1Items[0], p = picId });
            db.Execute("INSERT INTO item_story_refs (item_id, story_id) VALUES (@i, @s)", new { i = p1Items[1], s = storyId });
            db.Execute("INSERT INTO notes (id, note_contents, timeline_id, absolute_time) VALUES (@id, 'Prophecy begins', @tl, 100.0)", new { id = Guid.NewGuid().ToString(), tl = tl1Id });
            db.Execute("INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year, label) VALUES (@tl, 150, 175, 'Dark Years')", new { tl = tl1Id });
        }

        SqliteConnection.ClearAllPools();
        var ckpt1 = BackupService.CreateBackup(includeMedia: false);

        // ── Phase 2: Expand ───────────────────────────────────────────────────
        var tl3Id    = SeedTimeline(ctx, "Third Arc");
        var villain  = SeedCharacter(ctx, tl3Id, "The Shadow");
        var altCalId = SeedCalendar(ctx, "Shadow Calendar");
        var p2Items  = Enumerable.Range(0, 5)
                         .Select(i => SeedItem(ctx, tl1Id, $"Chronicle P2 {i}", 2, 200.0 + i * 10))
                         .ToList();

        using (var db = ctx.OpenConnection())
        {
            db.Execute(@"INSERT INTO character_relationships
                         (character_1_id, character_2_id, relationship_type, relationship_strength, timeline_id)
                         VALUES (@h, @v, 'nemesis', 100, @tl)",
                new { h = hero, v = villain, tl = tl1Id });
            var bookId = Guid.NewGuid().ToString();
            var chapId = Guid.NewGuid().ToString();
            db.Execute("INSERT INTO books (id, title) VALUES (@id, 'The Shadow Codex')", new { id = bookId });
            db.Execute("INSERT INTO chapters (id, book_id, number, title) VALUES (@id, @b, 1, 'Prologue')", new { id = chapId, b = bookId });
            db.Execute("INSERT INTO item_chapters (item_id, chapter_id) VALUES (@i, @c)", new { i = p2Items[0], c = chapId });
            db.Execute("INSERT INTO filter_presets (id, name, rules_json) VALUES (@id, 'War Filter', '[]')", new { id = Guid.NewGuid().ToString() });
        }

        Assert.Equal(11, Count(ctx, "items",      $"timeline_id = {tl1Id}"));
        Assert.Equal(3,  Count(ctx, "timelines"));
        Assert.Equal(3,  Count(ctx, "calendars")); // default + world + shadow

        Thread.Sleep(1100); // VACUUM INTO names files by second — ensure different timestamp
        SqliteConnection.ClearAllPools();
        var ckpt2 = BackupService.CreateBackup(includeMedia: false);

        // ── Phase 3: Chaos — add 5 items to tl2, then delete tl2 ─────────────
        for (int i = 0; i < 5; i++) SeedItem(ctx, tl2Id, $"Side {i}", 1, 300.0 + i);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("PRAGMA foreign_keys = ON");
            db.Execute("DELETE FROM timelines WHERE id = @id", new { id = tl2Id });
        }

        Assert.Equal(0, Count(ctx, "items",      $"timeline_id = {tl2Id}"));
        Assert.Equal(2, Count(ctx, "timelines")); // tl1 + tl3

        // ── Restore to checkpoint 1 ───────────────────────────────────────────
        DatabaseImporter.Import(ckpt1);

        // Import re-inserts ckpt1's timelines (tl1+tl2) and their data.
        // tl3 was NOT in ckpt1 → stays in the target unchanged.
        // Global data (calendars, books, filter_presets) uses INSERT OR REPLACE — target-only rows are NOT deleted.
        Assert.Equal(6,  Count(ctx, "items",               $"timeline_id = {tl1Id}"));
        Assert.Equal(3,  Count(ctx, "timelines"));          // tl1+tl2 (ckpt1) + tl3 (stays)
        Assert.Equal(3,  Count(ctx, "calendars"));          // default+world (ckpt1) + shadow (stays, INSERT OR REPLACE only)
        Assert.Equal(1,  Count(ctx, "notes",               $"timeline_id = {tl1Id}"));
        Assert.Equal(1,  Count(ctx, "timeline_hidden_ranges", $"timeline_id = {tl1Id}"));
        Assert.Equal(2,  Count(ctx, "item_tags",           $"item_id = '{p1Items[0]}'"));
        Assert.Equal(1,  Count(ctx, "item_character_appearances", $"item_id = '{p1Items[0]}'"));
        Assert.Equal(1,  Count(ctx, "item_pictures",       $"item_id = '{p1Items[0]}'"));
        Assert.Equal(1,  Count(ctx, "item_story_refs",     $"item_id = '{p1Items[1]}'"));
        Assert.Equal(0,  Count(ctx, "character_relationships")); // hero cascade-deleted then restored from ckpt1 (no rels in ckpt1)
        Assert.Equal(1,  Count(ctx, "books"));                   // Shadow Codex not in ckpt1 but not cascade-deleted either
        Assert.Equal(1,  Count(ctx, "filter_presets"));          // War Filter not in ckpt1 but INSERT OR REPLACE leaves it intact

        // ── Continue from checkpoint 1: add post-restore data ─────────────────
        var postItem1 = SeedItem(ctx, tl1Id, "Post-Restore Event", 1, 500.0);
        var postItem2 = SeedItem(ctx, tl1Id, "Post-Restore Period", 2, 600.0);
        SeedTimeline(ctx, "New Arc After Restore");
        SeedCalendar(ctx, "New Calendar After Restore");

        Assert.Equal(8,  Count(ctx, "items",      $"timeline_id = {tl1Id}"));
        Assert.Equal(4,  Count(ctx, "timelines")); // tl1+tl2+tl3 (post-restore) + New Arc
        Assert.Equal(4,  Count(ctx, "calendars")); // default+world+shadow (post-restore) + New Calendar

        // ── Final backup and open to verify ───────────────────────────────────
        Thread.Sleep(1100); // VACUUM INTO names files by second — ensure different timestamp
        SqliteConnection.ClearAllPools();
        var finalBackup = BackupService.CreateBackup(includeMedia: false);

        using var finalDb = new SqliteConnection($"Data Source={finalBackup};Mode=ReadOnly");
        finalDb.Open();

        Assert.Equal(8,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(4,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM timelines"));
        Assert.Equal(4,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM calendars"));
        Assert.Equal(1,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM notes WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(1,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM timeline_hidden_ranges WHERE timeline_id = @tl", new { tl = tl1Id }));
        Assert.Equal(2,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM item_tags WHERE item_id = @i", new { i = p1Items[0] }));
        Assert.Equal(1,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM item_pictures WHERE item_id = @i", new { i = p1Items[0] }));
        Assert.Equal(2,  finalDb.QuerySingle<int>("SELECT COUNT(*) FROM characters WHERE timeline_id = @tl", new { tl = tl1Id }));
    }

    /// <summary>
    /// TEST 16 — Integrated pruning scenario: create real data across 3 phases,
    /// pad the backup folder to exceed KeepCount (20), prune, then verify:
    ///   • The oldest real backup was deleted.
    ///   • The two newest real backups survive.
    ///   • Restoring from the surviving mid-point backup gives the correct data.
    ///   • Restoring from the surviving latest backup gives the complete dataset.
    /// </summary>
    [Fact]
    public void BackupPruning_Integrated_OldestRemovedAndNewestRestoreCorrectly()
    {
        using var ctx = new DbTestContext();

        var tl1Id = SeedTimeline(ctx, "Prune TL");

        // ── Phase 1: 3 items → oldest backup ────────────────────────────────
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"Phase1 {i}", 1, 10.0 + i);
        SqliteConnection.ClearAllPools();
        var backup1 = BackupService.CreateBackup(includeMedia: false); // will be pruned

        // ── Phase 2: 3 more items → midpoint backup ──────────────────────────
        Thread.Sleep(1100);
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"Phase2 {i}", 1, 20.0 + i);
        SqliteConnection.ClearAllPools();
        var backup2 = BackupService.CreateBackup(includeMedia: false);

        // ── Phase 3: 3 more items → newest backup ────────────────────────────
        Thread.Sleep(1100);
        for (int i = 0; i < 3; i++) SeedItem(ctx, tl1Id, $"Phase3 {i}", 1, 30.0 + i);
        SqliteConnection.ClearAllPools();
        var backup3 = BackupService.CreateBackup(includeMedia: false);

        // ── Pad backup folder with 18 dummy files to trigger pruning ─────────
        // We now have 3 real files. Adding 18 more → 21 total > KeepCount (20).
        // Timestamps are set so backup1 is the absolute oldest → it gets pruned.
        var folder = AppConfig.Instance.GetBackupsFolder();
        var dummies = Enumerable.Range(0, 18)
            .Select(i => Path.Combine(folder, $"timeline_dummy{i:D3}.sqlite"))
            .ToList();
        foreach (var d in dummies)
            File.Copy(backup2, d, overwrite: true); // valid SQLite content

        // Set timestamps: backup1 oldest, dummies fill days 1-18, backup2/3 newest
        var epoch = DateTime.Now.AddDays(-25);
        File.SetCreationTime(backup1, epoch);
        for (int i = 0; i < dummies.Count; i++)
            File.SetCreationTime(dummies[i], epoch.AddDays(i + 1));
        File.SetCreationTime(backup2, epoch.AddDays(19));
        File.SetCreationTime(backup3, epoch.AddDays(20));

        // ── Verify pre-prune state ───────────────────────────────────────────
        var allFiles = Directory.GetFiles(folder, "*.sqlite");
        Assert.Equal(21, allFiles.Length);
        Assert.True(File.Exists(backup1));

        // ── Prune ─────────────────────────────────────────────────────────────
        BackupService.PruneOldBackups();

        allFiles = Directory.GetFiles(folder, "*.sqlite");
        Assert.Equal(20, allFiles.Length);          // exactly KeepCount remain
        Assert.False(File.Exists(backup1),  "oldest real backup must be pruned");
        Assert.True(File.Exists(backup2),   "midpoint backup must survive");
        Assert.True(File.Exists(backup3),   "newest backup must survive");

        // ── Restore from midpoint (backup2) and verify phase 1+2 data ────────
        DatabaseImporter.Import(backup2);

        Assert.Equal(6, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(3, Count(ctx, "items", "title LIKE 'Phase1%'"));
        Assert.Equal(3, Count(ctx, "items", "title LIKE 'Phase2%'"));
        Assert.Equal(0, Count(ctx, "items", "title LIKE 'Phase3%'"));

        // ── Restore from newest (backup3) and verify all phases present ───────
        Thread.Sleep(1100); // avoid same-second backup collision if we ever add another
        DatabaseImporter.Import(backup3);

        Assert.Equal(9, Count(ctx, "items", $"timeline_id = {tl1Id}"));
        Assert.Equal(3, Count(ctx, "items", "title LIKE 'Phase1%'"));
        Assert.Equal(3, Count(ctx, "items", "title LIKE 'Phase2%'"));
        Assert.Equal(3, Count(ctx, "items", "title LIKE 'Phase3%'"));
    }
}

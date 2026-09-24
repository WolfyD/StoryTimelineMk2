using StoryTimelineMk2;
using StoryTimelineMk2.Database;
using StoryTimelineMk2.Database.Migrations;
using Microsoft.Data.Sqlite;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// Tests for the PRAGMA user_version migration runner, the two migration chains, and the safety
/// net around them (integrity check, verified pre-migration backup, failure reporting).
///
/// The Fixtures/*.sql files are frozen dumps of the databases 1.0.1 wrote (schema version 0).
/// Every migration added later must take that fixture to the same schema a fresh database
/// gets — <see cref="MainV0Fixture_MigratesToSameSchemaAsFreshDb"/> is the test that proves it.
/// </summary>
[Collection("Database")]
public class SchemaMigratorTests
{
    // ─────────────────────────── helpers ──────────────────────────────────────

    private static string FixturePath(string name) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", name);

    private static SqliteConnection Open(string dbPath)
    {
        var db = new SqliteConnection($"Data Source={dbPath};Pooling=False");
        db.Open();
        return db;
    }

    /// <summary>Creates a database file from a frozen fixture; the connection is not pooled so the file is released on dispose.</summary>
    private static void BuildFromFixture(string dbPath, string fixture)
    {
        using var db = Open(dbPath);
        db.Execute("PRAGMA foreign_keys = OFF"); // iterdump orders tables alphabetically, so child rows precede parent tables
        db.Execute(File.ReadAllText(FixturePath(fixture)));
    }

    private static int Version(string dbPath)
    {
        using var db = Open(dbPath);
        return SchemaMigrator.GetVersion(db);
    }

    private static string QuickCheck(string dbPath)
    {
        using var db = Open(dbPath);
        return SchemaMigrator.QuickCheck(db);
    }

    private static List<string> Tables(SqliteConnection db) => db.Query<string>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").ToList();

    /// <summary>table → sorted "name type notnull default pk" per column; column order is deliberately ignored (ALTER appends).</summary>
    private static Dictionary<string, List<string>> Columns(string dbPath)
    {
        using var db = Open(dbPath);
        return Tables(db).ToDictionary(t => t, t => db.Query<string>(
            $"SELECT name || ' ' || type || ' ' || \"notnull\" || ' ' || IFNULL(dflt_value, '') || ' ' || pk FROM pragma_table_info('{t}')")
            .OrderBy(c => c).ToList());
    }

    /// <summary>table → sorted "from → table.to on_delete" per foreign key.</summary>
    private static Dictionary<string, List<string>> ForeignKeys(string dbPath)
    {
        using var db = Open(dbPath);
        return Tables(db).ToDictionary(t => t, t => db.Query<string>(
            $"SELECT \"from\" || ' -> ' || \"table\" || '.' || IFNULL(\"to\", '') || ' ' || on_delete FROM pragma_foreign_key_list('{t}')")
            .OrderBy(c => c).ToList());
    }

    /// <summary>index name → indexed columns, in order.</summary>
    private static Dictionary<string, string> Indexes(string dbPath)
    {
        using var db = Open(dbPath);
        return db.Query<string>("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .ToDictionary(i => i, i => string.Join(",", db.Query<string>($"SELECT name FROM pragma_index_info('{i}') ORDER BY seqno")));
    }

    private static void AssertSameSchema(string expectedDb, string actualDb)
    {
        var expected = Columns(expectedDb);
        var actual   = Columns(actualDb);
        Assert.Equal(expected.Keys.OrderBy(k => k), actual.Keys.OrderBy(k => k));
        foreach (var (table, cols) in expected)
            Assert.Equal(cols, actual[table]);

        var expectedFks = ForeignKeys(expectedDb);
        foreach (var (table, fks) in ForeignKeys(actualDb))
            Assert.Equal(expectedFks[table], fks);

        Assert.Equal(Indexes(expectedDb), Indexes(actualDb));
    }

    /// <summary>Replaces the live test database with one built from a fixture (the context's ctor already migrated a fresh one).</summary>
    private static void ReplaceWithFixture(string dbPath, string fixture)
    {
        SqliteConnection.ClearAllPools();
        File.Delete(dbPath);
        BuildFromFixture(dbPath, fixture);
    }

    private static string BackupsFolder => AppConfig.Instance.GetBackupsFolder();

    /// <summary>Glob for the user-facing backup name: "pre v1.0.1-v1.0.2 migration backup - 2026-09-19 14-30-05.sqlite".</summary>
    private static string BackupPattern(string fromApp, string suffix = "") =>
        $"pre v{fromApp}-v{UpdateChecker.CurrentVersion} migration backup{suffix} - ????-??-?? ??-??-??.sqlite";

    private static string SingleBackup(string fromApp, string suffix = "") =>
        Assert.Single(Directory.GetFiles(BackupsFolder, BackupPattern(fromApp, suffix)));

    private static Migration Step(int v, string name, string sql, string app = "0.9.0") =>
        new(v, name, app, m => m.Execute(sql));

    // ─────────────────────────── chains ───────────────────────────────────────

    [Fact]
    public void MigrationChains_AreNumberedConsecutivelyFromOne_AndTaggedWithAReleaseVersion()
    {
        foreach (var steps in new[] { MainDbMigrations.Steps, StatsDbMigrations.Steps })
        {
            Assert.NotEmpty(steps);
            Assert.Equal(Enumerable.Range(1, steps.Count), steps.Select(s => s.Version));
            Assert.All(steps, s => Assert.True(System.Version.TryParse(s.AppVersion, out _), $"step {s.Version} has no valid app version"));
            Assert.Equal("1.0.1", steps[0].AppVersion); // baseline = last release without schema versioning
        }
    }

    [Fact]
    public void AppVersionOf_MapsEverySchemaVersionToTheReleaseThatProducedIt()
    {
        var steps = new[] { Step(1, "a", "", "1.0.1"), Step(2, "b", "", "1.0.3"), Step(3, "c", "", "1.0.3") };

        Assert.Equal("1.0.1", SchemaMigrator.AppVersionOf(steps, 0)); // pre-versioning file
        Assert.Equal("1.0.1", SchemaMigrator.AppVersionOf(steps, 1));
        Assert.Equal("1.0.3", SchemaMigrator.AppVersionOf(steps, 2));
        Assert.Equal("1.0.3", SchemaMigrator.AppVersionOf(steps, 3));
        Assert.Equal("1.0.3", SchemaMigrator.AppVersionOf(steps, 99));
    }

    // ─────────────────────────── main DB ──────────────────────────────────────

    [Fact]
    public void FreshDb_IsStampedWithLatestVersion()
    {
        using var ctx = new DbTestContext();

        Assert.Equal(MainDbMigrations.LatestVersion, Version(ctx.DbPath));
    }

    /// <summary>
    /// V12 gave pictures and portraits a caption font size each. An upgraded timeline has to look
    /// exactly as it did, so both are backfilled from the event font size instead of keeping the
    /// column default — the seeded presets use 16, the column default is 12.
    /// </summary>
    [Fact]
    public void CaptionFontSizes_AreBackfilledFromTheEventFontSize()
    {
        using var ctx = new DbTestContext();

        using var verify = Open(ctx.DbPath);
        var rows = verify.Query<(long Event, long Picture, long Portrait)>(
            @"SELECT timeline_event_font_size,
                     timeline_picture_caption_font_size,
                     timeline_character_caption_font_size
              FROM layout_settings").ToList();

        Assert.NotEmpty(rows);
        Assert.All(rows, r => Assert.Equal((r.Event, r.Event), (r.Picture, r.Portrait)));
        Assert.Contains(rows, r => r.Event == 16);
    }

    /// <summary>
    /// V13 seeded <c>relationship_types</c>, which came over from v1 empty, and dated both ends of a
    /// relation; V14 widened the seed to the vocabulary v1 offered. An upgraded database has to reach
    /// the same kinds a fresh one gets, or the relations panel would have nothing to offer on exactly
    /// the timelines that have characters.
    /// </summary>
    [Fact]
    public void RelationshipTypes_AreSeeded_AndRelationsCarryOptionalDates()
    {
        using var ctx = new DbTestContext();

        using var verify = Open(ctx.DbPath);
        var kinds = verify.Query<string>("SELECT id FROM relationship_types ORDER BY id").ToList();
        Assert.Equal(
            new[]
            {
                "acquaintance", "ally", "aunt-uncle", "best-friend", "colleague", "cousin", "enemy",
                "friend", "grandparent", "half-sibling", "mentor", "neighbor", "parent",
                "parent-in-law", "rival", "sibling", "sibling-in-law", "spouse", "step-parent",
                "step-sibling",
            },
            kinds);

        var cols = verify.Query<string>("SELECT name FROM pragma_table_info('character_relationships')").ToList();
        foreach (string col in new[] { "start_year", "start_granularity", "end_year", "end_granularity", "absolute_start", "absolute_end" })
            Assert.Contains(col, cols);

        // Both years nullable: an undated relation is the normal one, and NULL is not year 0.
        Assert.All(
            verify.Query<long>("SELECT \"notnull\" FROM pragma_table_info('character_relationships') WHERE name IN ('start_year', 'end_year')"),
            notNull => Assert.Equal(0, notNull));
    }

    /// <summary>
    /// V14: the wording a gendered subject takes. Half the family kinds have one and half of English
    /// has none — a cousin is a cousin — so the columns exist for every kind but only some are filled,
    /// and the three V13 seeded have to be filled in on the way past rather than left neutral.
    /// </summary>
    [Fact]
    public void GenderedWording_IsSeeded_OnlyWhereEnglishHasAWord()
    {
        using var ctx = new DbTestContext();
        using var verify = Open(ctx.DbPath);

        Assert.Contains(
            "gender",
            verify.Query<string>("SELECT name FROM pragma_table_info('characters')"));

        var parent = verify.QuerySingle<(string F, string M, string RF, string RM)>(
            "SELECT a_to_b_f, a_to_b_m, b_to_a_f, b_to_a_m FROM relationship_types WHERE id = 'parent'");
        Assert.Equal(("mother of", "father of", "daughter of", "son of"), parent);

        // Seeded by V13, worded by V14 — the upgrade path is the one that can silently miss this.
        Assert.Equal(
            "wife of",
            verify.QuerySingle<string>("SELECT a_to_b_f FROM relationship_types WHERE id = 'spouse'"));

        Assert.Null(
            verify.QuerySingle<string?>("SELECT a_to_b_f FROM relationship_types WHERE id = 'cousin'"));
    }

    /// <summary>
    /// V16 (BL-75): characters and relations get the absolute_* pair items have carried since BL-02,
    /// multiplied out of the subtick through the timeline's own LOD profile, and the columns that
    /// stopped meaning anything are dropped. Built by running the chain to 15 and then the rest, so
    /// the real backfill runs against the schema it was written for.
    /// </summary>
    [Fact]
    public void CharactersAndRelations_GetAbsoluteDates_BackfilledThroughTheirOwnLodProfile()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "v15.sqlite");
        using (var db = Open(oldDb))
        {
            SchemaMigrator.Migrate(db, oldDb, MainDbMigrations.Steps.Take(15).ToList(), "test", backupFirst: false);
            db.Execute(@"
                INSERT INTO timelines (id, title, author, description, start_year) VALUES (1, 'T', '', '', 0);
                INSERT INTO characters (id, name, timeline_id, birth_year, birth_subtick, birth_granularity,
                                        death_year, death_subtick, death_granularity)
                VALUES ('c1', 'Risha', 1, 1000, 3, 5, 1050, 0, 3);
                INSERT INTO characters (id, name, timeline_id) VALUES ('c2', 'Undated', 1);
                INSERT INTO character_relationships (character_1_id, character_2_id, relationship_type,
                                                     timeline_id, start_year, start_subtick, start_granularity)
                VALUES ('c1', 'c2', 'spouse', 1, 1020, 2, 4);");
        }

        DbInitializer.Initialize(oldDb, backupFirst: false);

        Assert.Equal(MainDbMigrations.LatestVersion, Version(oldDb));
        using var verify = Open(oldDb);
        // Months is LOD 5, a step of 1/12: three months into 1000. Seasons is 4, a quarter: 1020½.
        Assert.Equal(1000 + 3 * 0.08333333333, verify.QuerySingle<double>("SELECT absolute_start FROM characters WHERE id = 'c1'"), 6);
        Assert.Equal(1050d, verify.QuerySingle<double>("SELECT absolute_end FROM characters WHERE id = 'c1'"), 6);
        Assert.Equal(1020.5, verify.QuerySingle<double>("SELECT absolute_start FROM character_relationships"), 6);
        // No year is not year 0: an undated end stays NULL on both sides.
        Assert.Null(verify.QuerySingle<double?>("SELECT absolute_start FROM characters WHERE id = 'c2'"));
        Assert.Null(verify.QuerySingle<double?>("SELECT absolute_end FROM character_relationships"));
        Assert.Equal(0L, verify.QuerySingle<long>("SELECT shared FROM characters WHERE id = 'c1'"));

        var cols = Columns(oldDb);
        foreach (string gone in new[] { "start_subtick", "end_subtick", "custom_relationship_type", "is_bidirectional" })
            Assert.DoesNotContain(cols["character_relationships"], c => c.StartsWith(gone + " "));
        foreach (string gone in new[] { "birth_subtick", "death_subtick" })
            Assert.DoesNotContain(cols["characters"], c => c.StartsWith(gone + " "));
    }

    [Fact]
    public void Initialize_IsIdempotent_OnCurrentDb()
    {
        using var ctx = new DbTestContext();
        var before = Columns(ctx.DbPath);

        DbInitializer.Initialize();

        Assert.Equal(MainDbMigrations.LatestVersion, Version(ctx.DbPath));
        Assert.Equal(before.Keys.OrderBy(k => k), Columns(ctx.DbPath).Keys.OrderBy(k => k));
        Assert.False(Directory.Exists(BackupsFolder), "no backup expected for an up-to-date (or brand-new) database");
    }

    [Fact]
    public void Initialize_RefusesDb_FromNewerAppVersion_WithoutTouchingIt()
    {
        using var ctx = new DbTestContext();
        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA user_version = 9999");

        var ex = Assert.Throws<MigrationException>(() => DbInitializer.Initialize());

        Assert.Contains("newer version", ex.Message);
        Assert.Contains("not changed", ex.Message);
        Assert.Equal("version check", ex.Stage);
        Assert.Null(ex.BackupPath);
        Assert.Equal(("timeline", ctx.DbPath, 9999, MainDbMigrations.LatestVersion),
                     (ex.Info.DbLabel, ex.Info.DbPath, ex.Info.FromVersion, ex.Info.ToVersion));
        Assert.Equal(UpdateChecker.CurrentVersion, ex.Info.ToAppVersion);
        Assert.Equal(9999, Version(ctx.DbPath));
        Assert.False(Directory.Exists(BackupsFolder));
    }

    [Fact]
    public void MainV0Fixture_MigratesToSameSchemaAsFreshDb()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "v0.sqlite");
        BuildFromFixture(oldDb, "main_schema_v0_1.0.1.sql");
        Assert.Equal(0, Version(oldDb));

        DbInitializer.Initialize(oldDb, backupFirst: false);

        Assert.Equal(MainDbMigrations.LatestVersion, Version(oldDb));
        AssertSameSchema(ctx.DbPath, oldDb);
    }

    [Fact]
    public void MainV0Fixture_KeepsRows_AndNormalisesLegacyNulls()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "v0.sqlite");
        BuildFromFixture(oldDb, "main_schema_v0_1.0.1.sql");
        using (var db = Open(oldDb))
        {
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (7, 'Old', '', '', 0)");
            db.Execute(@"INSERT INTO items (id, title, type_id, year, end_year, timeline_id, min_lod_level, absolute_start, absolute_end)
                         VALUES ('old-item', 'Old item', 1, 5, 9, 7, NULL, NULL, NULL)");
        }

        DbInitializer.Initialize(oldDb, backupFirst: false);

        using var verify = Open(oldDb);
        Assert.Equal("Old", verify.QuerySingle<string>("SELECT title FROM timelines WHERE id = 7"));
        var item = verify.QuerySingle<(int minLod, double absStart, double absEnd)>(
            "SELECT min_lod_level, absolute_start, absolute_end FROM items WHERE id = 'old-item'");
        Assert.Equal((3, 5.0, 9.0), item);
    }

    /// <summary>
    /// V2 backfills items.placement with what the canvas used to derive client-side: alternate by start
    /// order, periods on their own cycle, full-width types (age/bookmark/character/bounds) left at 0.
    /// </summary>
    [Fact]
    public void MainV0Fixture_BackfillsPlacement_AlternatingPerTimeline()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "v0.sqlite");
        BuildFromFixture(oldDb, "main_schema_v0_1.0.1.sql");
        using (var db = Open(oldDb))
        {
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (1, 'A', '', '', 0), (2, 'B', '', '', 0)");
            db.Execute(@"INSERT INTO items (id, title, type_id, year, end_year, timeline_id, absolute_start, absolute_end) VALUES
                ('e1', 'e', 1, 10, 10, 1, 10, 10), ('e2', 'e', 1, 20, 20, 1, 20, 20), ('e3', 'e', 1, 30, 30, 1, 30, 30),
                ('p1', 'p', 2, 15, 25, 1, 15, 25), ('p2', 'p', 2, 35, 45, 1, 35, 45),
                ('age', 'a', 3, 0, 99, 1, 0, 99),
                ('other', 'e', 1, 5, 5, 2, 5, 5)");
        }

        DbInitializer.Initialize(oldDb, backupFirst: false);

        using var verify = Open(oldDb);
        var placement = verify.Query<(string id, int p)>("SELECT id, placement FROM items").ToDictionary(r => r.id, r => r.p);
        Assert.Equal(1, placement["e1"]); Assert.Equal(2, placement["e2"]); Assert.Equal(1, placement["e3"]);
        Assert.Equal(1, placement["p1"]); Assert.Equal(2, placement["p2"]);
        Assert.Equal(0, placement["age"]);
        Assert.Equal(1, placement["other"]);
    }

    /// <summary>
    /// V9 splits characters.name on the last space. Everything else about the character track is new
    /// columns, which AssertSameSchema already covers.
    /// </summary>
    [Fact]
    public void MainV0Fixture_SplitsCharacterNames_OnTheLastSpace()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "v0.sqlite");
        BuildFromFixture(oldDb, "main_schema_v0_1.0.1.sql");
        using (var db = Open(oldDb))
        {
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (1, 'A', '', '', 0)");
            db.Execute(@"INSERT INTO characters (id, name, timeline_id) VALUES
                ('c1', 'Risha', 1), ('c2', 'Anna Maria Vas', 1), ('c3', '  Padded  Name  ', 1), ('c4', '', 1)");
        }

        DbInitializer.Initialize(oldDb, backupFirst: false);

        using var verify = Open(oldDb);
        var split = verify.Query<(string id, string first, string last)>(
            "SELECT id, first_name, last_name FROM characters").ToDictionary(r => r.id, r => (r.first, r.last));
        Assert.Equal(("Risha", ""), split["c1"]);
        Assert.Equal(("Anna Maria", "Vas"), split["c2"]);
        Assert.Equal(("Padded", "Name"), split["c3"]);
        Assert.Equal(("", ""), split["c4"]);
    }

    /// <summary>
    /// Databases older than 1.0.0 (dev builds): subtick columns, INTEGER note ids, columns that were added
    /// one by one. The baseline's column probing has to bring those up too. Every released build created
    /// items/characters with created_at/updated_at inline, so those are present here as well — the
    /// baseline's "ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP" branches would be rejected by SQLite
    /// (non-constant default) and can never run against a real database.
    /// </summary>
    [Fact]
    public void LegacyPre101Db_GetsMissingColumns_RecreatedNotes_AndSubtickBackfill()
    {
        using var ctx = new DbTestContext();
        string oldDb = Path.Combine(ctx.TempDir, "legacy.sqlite");
        using (var db = Open(oldDb))
        {
            db.Execute(@"
                CREATE TABLE timelines (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT, description TEXT, start_year INTEGER);
                CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT, type_id INTEGER, year INTEGER, subtick INTEGER, end_year INTEGER, end_subtick INTEGER,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE settings (id INTEGER PRIMARY KEY);
                CREATE TABLE notes (id INTEGER PRIMARY KEY, year INTEGER, subtick INTEGER, content TEXT);
                INSERT INTO timelines (id, title) VALUES (1, 'Legacy');
                INSERT INTO items (id, title, type_id, year, subtick, end_year, end_subtick) VALUES ('a', 'A', 2, 10, 5, 12, 0);
                INSERT INTO items (id, title, type_id, year, subtick, end_year, end_subtick) VALUES ('b', 'B', 1, 3, NULL, NULL, NULL);
                INSERT INTO notes (id, year, content) VALUES (1, 10, 'old note');");
        }

        DbInitializer.Initialize(oldDb, backupFirst: false);

        Assert.Equal(MainDbMigrations.LatestVersion, Version(oldDb));
        var cols = Columns(oldDb);
        Assert.Contains(cols["timelines"], c => c.StartsWith("calendar_id "));
        Assert.Contains(cols["timelines"], c => c.StartsWith("layout_settings_locked "));
        Assert.Contains(cols["items"],     c => c.StartsWith("lod_visibility_mask "));
        Assert.Contains(cols["settings"],  c => c.StartsWith("pan_speed_multiplier "));
        Assert.Contains(cols["notes"],     c => c.StartsWith("id TEXT "));     // INTEGER-id notes table dropped and recreated
        Assert.Contains(cols["notes"],     c => c.StartsWith("absolute_time "));
        using var verify = Open(oldDb);
        Assert.Equal("cal_default_gregorian", verify.QuerySingle<string>("SELECT calendar_id FROM timelines WHERE id = 1"));
        Assert.Equal((10.5, 12.0, 3), verify.QuerySingle<(double s, double e, int lod)>("SELECT absolute_start, absolute_end, min_lod_level FROM items WHERE id = 'a'"));
        Assert.Equal((3.0, 3.0),      verify.QuerySingle<(double s, double e)>("SELECT absolute_start, absolute_end FROM items WHERE id = 'b'"));
        Assert.Equal(9, verify.QuerySingle<int>("SELECT COUNT(*) FROM item_types"));
        Assert.Equal("ok", SchemaMigrator.QuickCheck(verify));
    }

    // ─────────────────────────── pre-migration backup ─────────────────────────

    [Fact]
    public void Initialize_WritesVerifiedRestorableBackup_ForOutdatedDb()
    {
        using var ctx = new DbTestContext();
        ReplaceWithFixture(ctx.DbPath, "main_schema_v0_1.0.1.sql");
        using (var db = Open(ctx.DbPath))
            db.Execute("INSERT INTO timelines (id, title, author, description, start_year) VALUES (42, 'Keep me', '', '', 0)");

        DbInitializer.Initialize();

        Assert.Equal(MainDbMigrations.LatestVersion, Version(ctx.DbPath));
        string backup = SingleBackup("1.0.1");
        Assert.Equal(0, Version(backup));
        Assert.Equal("ok", QuickCheck(backup));
        using (var db = Open(backup))
            Assert.Equal("Keep me", db.QuerySingle<string>("SELECT title FROM timelines WHERE id = 42"));

        // The backup is a complete pre-upgrade database: migrating it must work and give the current schema.
        string restored = Path.Combine(ctx.TempDir, "restored.sqlite");
        File.Copy(backup, restored);
        DbInitializer.Initialize(restored, backupFirst: false);
        AssertSameSchema(ctx.DbPath, restored);
        Assert.Contains(backup, BackupService.GetRecentBackups().Select(b => b.FullPath));
    }

    [Fact]
    public void PruneOldBackups_NeverDeletesPreMigrationBackups()
    {
        using var ctx = new DbTestContext();
        Directory.CreateDirectory(BackupsFolder);
        for (int i = 0; i < 25; i++)
            File.WriteAllText(Path.Combine(BackupsFolder, $"timeline_20240101_{i:D6}.sqlite"), "fake");
        string keep      = Path.Combine(BackupsFolder, "pre v1.0.1-v1.0.2 migration backup - 2024-01-01 00-00-00.sqlite");
        string keepStats = Path.Combine(BackupsFolder, "pre v1.0.1-v1.0.2 migration backup (usage stats) - 2024-01-01 00-00-00.sqlite");
        File.WriteAllText(keep, "fake");
        File.WriteAllText(keepStats, "fake");

        BackupService.PruneOldBackups();

        Assert.True(File.Exists(keep));
        Assert.True(File.Exists(keepStats));
        Assert.Equal(20, Directory.GetFiles(BackupsFolder, "timeline_2024*.sqlite").Length);
    }

    [Fact]
    public void VerifyBackup_RejectsGarbage_WrongVersion_AndMissingTables()
    {
        using var ctx = new DbTestContext();
        int version = Version(ctx.DbPath);
        int tables;
        using (var db = ctx.OpenConnection())
            tables = db.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'"); // incl. sqlite_sequence, as VerifyBackup counts
        string garbage = Path.Combine(ctx.TempDir, "garbage.sqlite");
        File.WriteAllText(garbage, "this is not a database");

        BackupService.VerifyBackup(ctx.DbPath, version, tables); // sanity: a good file passes
        Assert.ThrowsAny<Exception>(() => BackupService.VerifyBackup(garbage, version, tables));
        Assert.Contains("schema version", Assert.Throws<InvalidOperationException>(() => BackupService.VerifyBackup(ctx.DbPath, version + 1, tables)).Message);
        Assert.Contains("tables",         Assert.Throws<InvalidOperationException>(() => BackupService.VerifyBackup(ctx.DbPath, version, tables - 1)).Message);
    }

    [Fact]
    public void Initialize_AbortsBeforeAnyChange_WhenLiveDbFailsIntegrityCheck()
    {
        using var ctx = new DbTestContext();
        ReplaceWithFixture(ctx.DbPath, "main_schema_v0_1.0.1.sql");
        SqliteConnection.ClearAllPools();
        using (var fs = new FileStream(ctx.DbPath, FileMode.Open, FileAccess.ReadWrite))
        {
            // Overwrite the last page (some table's b-tree page) with garbage; the header (page 1) stays valid.
            fs.Seek(-4096, SeekOrigin.End);
            fs.Write(Enumerable.Repeat((byte)0xFF, 4096).ToArray());
        }
        string check;
        try { check = QuickCheck(ctx.DbPath); } catch (SqliteException e) { check = e.Message; }
        Assert.NotEqual("ok", check);

        var ex = Assert.Throws<MigrationException>(() => DbInitializer.Initialize());

        Assert.Equal("integrity check", ex.Stage);
        Assert.Contains("integrity check", ex.Message);
        Assert.Null(ex.BackupPath);
        Assert.Equal(0, Version(ctx.DbPath));
        Assert.False(Directory.Exists(BackupsFolder), "a corrupt database must not be snapshotted as a 'backup'");
    }

    [Fact]
    public void Initialize_AbortsBeforeAnyChange_WhenBackupCannotBeWritten()
    {
        using var ctx = new DbTestContext();
        ReplaceWithFixture(ctx.DbPath, "main_schema_v0_1.0.1.sql");
        File.WriteAllText(BackupsFolder, "a file where the backups folder should be");

        var ex = Assert.Throws<MigrationException>(() => DbInitializer.Initialize());

        Assert.Equal("pre-migration backup", ex.Stage);
        Assert.Contains("not changed", ex.Message);
        Assert.IsAssignableFrom<IOException>(ex.InnerException);
        Assert.Null(ex.BackupPath);
        Assert.Equal(0, Version(ctx.DbPath));
    }

    [Fact]
    public void Initialize_LogsEveryStage_ForOutdatedDb()
    {
        using var ctx = new DbTestContext();
        ReplaceWithFixture(ctx.DbPath, "main_schema_v0_1.0.1.sql");
        long before = File.Exists(Logger.LogPath) ? new FileInfo(Logger.LogPath).Length : 0;

        DbInitializer.Initialize();

        using var fs = new FileStream(Logger.LogPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        fs.Seek(before, SeekOrigin.Begin);
        string log = new StreamReader(fs).ReadToEnd();
        Assert.Contains($"timeline database {ctx.DbPath}: schema version 0 (app 1.0.1); app {UpdateChecker.CurrentVersion} supports up to {MainDbMigrations.LatestVersion}", log);
        Assert.Contains("timeline: integrity check ok", log);
        Assert.Contains("Pre-migration backup written and verified: " + SingleBackup("1.0.1"), log);
        Assert.Contains("timeline: applying migration 1 (1.0.1 baseline)", log);
        Assert.Contains("timeline: applied migration 1 (1.0.1 baseline) in ", log);
        Assert.Contains($"timeline: upgrade complete, schema version {MainDbMigrations.LatestVersion}", log);
    }

    // ─────────────────────────── runner ───────────────────────────────────────

    [Fact]
    public void Migrate_RollsBackFailingStep_AndResumesFromIt()
    {
        using var ctx = new DbTestContext();
        string path = Path.Combine(ctx.TempDir, "runner.sqlite");
        using var db = Open(path);

        var broken = new[]
        {
            Step(1, "one", "CREATE TABLE a (x)"),
            new Migration(2, "two", "0.9.0", m => { m.Execute("CREATE TABLE b (x)"); throw new Exception("boom"); }),
            Step(3, "three", "CREATE TABLE c (x)"),
        };

        var ex = Assert.Throws<MigrationException>(() => SchemaMigrator.Migrate(db, path, broken, "test", backupFirst: false));

        Assert.Equal("migration 2 (two)", ex.Stage);
        Assert.Contains("rolled back", ex.Message);
        Assert.Contains("schema version 1", ex.Message);
        Assert.Equal("boom", ex.InnerException?.Message);
        Assert.Equal((0, 3), (ex.Info.FromVersion, ex.Info.ToVersion));
        Assert.Equal(1, SchemaMigrator.GetVersion(db));
        Assert.Equal(new[] { "a" }, Tables(db));

        // Fixed build: steps 2 and 3 run, step 1 is not repeated.
        var fixed_ = new[] { Step(1, "one", "SELECT 1"), Step(2, "two", "CREATE TABLE b (x)"), Step(3, "three", "CREATE TABLE c (x)") };
        SchemaMigrator.Migrate(db, path, fixed_, "test", backupFirst: false);

        Assert.Equal(3, SchemaMigrator.GetVersion(db));
        Assert.Equal(new[] { "a", "b", "c" }, Tables(db));
    }

    [Fact]
    public void Migrate_FailingStep_LeavesBackupAndOldVersion_AndReportsBoth()
    {
        using var ctx = new DbTestContext();
        string path = Path.Combine(ctx.TempDir, "runner.sqlite");
        using (var db = Open(path))
            db.Execute("CREATE TABLE a (x); INSERT INTO a VALUES (1); PRAGMA user_version = 1");
        var steps = new[] { Step(1, "one", "SELECT 1", "0.9.0"), Step(2, "two", "CREATE TABLE b (x); INSERT INTO nope VALUES (1)", "0.9.5") };

        MigrationException ex;
        using (var db = Open(path))
            ex = Assert.Throws<MigrationException>(() => SchemaMigrator.Migrate(db, path, steps, "test", backupFirst: true, backupSuffix: " (test)"));

        string backup = SingleBackup("0.9.0", " (test)");
        Assert.Equal(backup, ex.BackupPath);
        Assert.Equal("migration 2 (two)", ex.Stage);
        Assert.Equal(("0.9.0", UpdateChecker.CurrentVersion), (ex.Info.FromAppVersion, ex.Info.ToAppVersion));
        Assert.Equal(1, Version(path));
        Assert.Equal(1, Version(backup));
        using var verify = Open(path);
        Assert.Equal(new[] { "a" }, Tables(verify));
        Assert.Equal(1, verify.QuerySingle<int>("SELECT x FROM a"));
    }

    // ─────────────────────────── stats DB ─────────────────────────────────────

    [Fact]
    public void StatsV0Fixture_MigratesToSameSchemaAsFreshDb_WithVerifiedBackup()
    {
        using var dataRoot = new DbTestContext(); // backups folder lives under the data root
        using var ctx = new StatsDbContext();
        Assert.Equal(StatsDbMigrations.LatestVersion, Version(ctx.DbPath));
        string fresh = ctx.DbPath + ".fresh";
        File.Copy(ctx.DbPath, fresh, overwrite: true);
        try
        {
            ReplaceWithFixture(ctx.DbPath, "stats_schema_v0_1.0.1.sql");
            Assert.Equal(0, Version(ctx.DbPath));

            StatsDbInitializer.Initialize();

            Assert.Equal(StatsDbMigrations.LatestVersion, Version(ctx.DbPath));
            AssertSameSchema(fresh, ctx.DbPath);
            using var db = ctx.OpenConnection();
            Assert.Equal(2, db.QuerySingle<int>("SELECT COUNT(*) FROM achievement_defs"));

            string backup = SingleBackup("1.0.1", " (usage stats)");
            Assert.Equal(0, Version(backup));
            Assert.Equal("ok", QuickCheck(backup));
        }
        finally
        {
            File.Delete(fresh);
        }
    }

    [Fact]
    public void StatsInitialize_RefusesDb_FromNewerAppVersion()
    {
        using var ctx = new StatsDbContext();
        using (var db = ctx.OpenConnection())
            db.Execute("PRAGMA user_version = 9999");

        var ex = Assert.Throws<MigrationException>(() => StatsDbInitializer.Initialize());

        Assert.Equal(("usage statistics", ctx.DbPath, "version check"), (ex.Info.DbLabel, ex.Info.DbPath, ex.Stage));
        Assert.Equal(9999, Version(ctx.DbPath));
    }
}

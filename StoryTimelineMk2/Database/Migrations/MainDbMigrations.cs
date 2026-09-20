namespace StoryTimelineMk2.Database.Migrations
{
    /// <summary>
    /// Ordered schema history of timeline.sqlite. <see cref="SchemaMigrator"/> replays every step above the
    /// file's <c>PRAGMA user_version</c>, so a fresh database and a 1.0.1 database end up identical.
    ///
    /// Rules (see docs/10-migrations.md):
    ///  - Never edit a step that has shipped; add a new one with the next number.
    ///  - A step runs exactly once per database, so plain ALTER/UPDATE is fine — no existence probing.
    ///  - Step 1 is the pre-versioning 1.0.1 initializer moved verbatim; it must stay idempotent because
    ///    every existing install reports version 0 and replays it once.
    /// </summary>
    internal static class MainDbMigrations
    {
        public static readonly IReadOnlyList<Migration> Steps = new Migration[]
        {
            new(1, "1.0.1 baseline", "1.0.1", V1_Baseline),
            new(2, "item placement", "1.0.2", V2_ItemPlacement),
            new(3, "timeline header mode", "1.0.3", V3_HeaderMode),
            new(4, "centered item boxes", "1.0.3", V4_ItemCentered),
            new(5, "picture title", "1.0.3", V5_ShowTitle),
            new(6, "item notes", "1.0.3", V6_ItemNotes),
        };

        public static int LatestVersion => Steps[^1].Version;

        // ── 1: 1.0.1 baseline ─────────────────────────────────────────────────────────────────────

        private static void V1_Baseline(MigrationDb db)
        {
            // 1. CREATE FLATTENED TABLES
            string createTablesSql = @"
                CREATE TABLE IF NOT EXISTS timelines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    description TEXT,
                    start_year INTEGER DEFAULT 0,
                    calendar_id TEXT NOT NULL DEFAULT 'cal_default_gregorian',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    layout_settings_id TEXT NOT NULL DEFAULT 'ls_default',
                    FOREIGN KEY (calendar_id) REFERENCES calendars(id),
                    FOREIGN KEY (layout_settings_id) REFERENCES layout_settings(id),
                    UNIQUE(title, author)
                );

                CREATE TABLE IF NOT EXISTS timeline_calendars (
                    id TEXT PRIMARY KEY,
                    calendar_id TEXT NOT NULL,
                    timeline_id INTEGER, 
                    year_0_at_default INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (calendar_id) REFERENCES calendars(id),
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS calendars (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    short_name TEXT NOT NULL DEFAULT '',
                    alternate_name TEXT NOT NULL DEFAULT '',
                    name_before_0 TEXT NOT NULL DEFAULT '',
                    name_after_0 TEXT NOT NULL DEFAULT '',
                    year_definition TEXT NOT NULL,
                    lod_profile_id TEXT NOT NULL DEFAULT 'lod_default',
                    FOREIGN KEY (lod_profile_id) REFERENCES lod_profiles(id)
                );

                CREATE TABLE IF NOT EXISTS lod_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    profile TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS stories (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS item_types (
                    id INTEGER PRIMARY KEY,
                    name TEXT UNIQUE,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    description TEXT,
                    content TEXT,
                    story_id TEXT,
                    type_id INTEGER DEFAULT 1,
    
                    year INTEGER,
                    end_year INTEGER,
                    absolute_start REAL,
                    absolute_end REAL,
    
                    book_title TEXT,
                    chapter TEXT,
                    page TEXT,
                    color TEXT,
                    creation_granularity INTEGER,
                    timeline_id INTEGER,
                    item_index INTEGER DEFAULT 0,
                    show_in_notes INTEGER DEFAULT 1,
                    importance INTEGER DEFAULT 5,
    
                    -- Visibility Culling
                    min_lod_level INTEGER DEFAULT 3, -- legacy threshold; superseded by lod_visibility_mask
                    lod_visibility_mask INTEGER DEFAULT 255, -- bitmask: bit i set = visible at LOD index i
    
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (story_id) REFERENCES stories(id),
                    FOREIGN KEY (type_id) REFERENCES item_types(id),
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    note_contents TEXT,
                    timeline_id INTEGER,
                    connected_item_id INTEGER,
                    nearest_year INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (connected_item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS pictures (
                    id TEXT PRIMARY KEY,
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
                    picture_id TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (picture_id) REFERENCES pictures(id) ON DELETE CASCADE,
                    UNIQUE(item_id, picture_id)
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
                    canvas_settings TEXT,
                    default_layout_settings_id TEXT NOT NULL DEFAULT 'ls_default',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS item_tags (
                    item_id TEXT,
                    tag_id INTEGER,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (item_id, tag_id)
                );

                -- NOTE: Merged standard character tables based on documentation
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    nicknames TEXT,
                    aliases TEXT,
                    race TEXT,
                    description TEXT,
                    notes TEXT,
                    birth_year INTEGER,
                    birth_date TEXT,
                    birth_alternative_year TEXT,
                    death_year INTEGER,
                    death_date TEXT,
                    death_alternative_year TEXT,
                    importance INTEGER DEFAULT 5,
                    color TEXT,
                    timeline_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS relationship_types (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT,
                    a_to_b TEXT,
                    b_to_a TEXT,
                    one_way INTEGER
                );

                CREATE TABLE IF NOT EXISTS item_characters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    character_id TEXT NOT NULL,
                    relationship_type TEXT DEFAULT 'appears',
                    timeline_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
                    UNIQUE(item_id, character_id)
                );

                CREATE TABLE IF NOT EXISTS layout_settings (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,

                    -- Event related
                    timeline_event_box_width INTEGER NOT NULL,
                    timeline_event_box_height INTEGER NOT NULL,
                    timeline_event_box_stem_offset INTEGER NOT NULL,
                    timeline_event_border_color TEXT NOT NULL,
                    timeline_event_border_width INTEGER NOT NULL,
                    timeline_event_border_radius INTEGER NOT NULL,
                    timeline_event_padding TEXT NOT NULL, -- JSON array
                    timeline_event_y_margin INTEGER NOT NULL,
                    timeline_event_text_color TEXT NOT NULL,
                    timeline_event_background_color TEXT NOT NULL,
                    timeline_event_font_family TEXT NOT NULL,
                    timeline_event_font_size INTEGER NOT NULL,
                    timeline_event_text_use_ellipsis INTEGER NOT NULL DEFAULT 1,
                    timeline_event_box_show_color INTEGER NOT NULL DEFAULT 1,
                    timeline_event_box_show_color_on_bottom INTEGER NOT NULL DEFAULT 0,
                    timeline_event_has_hover_highlight INTEGER NOT NULL DEFAULT 1,
                    timeline_event_hover_color TEXT NOT NULL,

                    -- Age and period related
                    timeline_age_height INTEGER NOT NULL,
                    timeline_age_corner_rounding INTEGER NOT NULL,
                    timeline_period_height INTEGER NOT NULL,
                    timeline_period_corner_rounding INTEGER NOT NULL,
                    timeline_period_y_margin INTEGER NOT NULL,
                    timeline_period_y_offset INTEGER NOT NULL,

                    -- Box types
                    timeline_box_types_show_as_box INTEGER NOT NULL DEFAULT 1,
                    timeline_box_types_box_width INTEGER NOT NULL,
                    timeline_box_types_show_image INTEGER NOT NULL DEFAULT 1,

                    -- Timeline misc
                    timeline_canvas_background_color TEXT NOT NULL,
                    timeline_show_now_line INTEGER NOT NULL DEFAULT 1,
                    timeline_show_now_line_text INTEGER NOT NULL DEFAULT 1,
                    timeline_now_line_color TEXT NOT NULL,
                    timeline_now_line_style TEXT NOT NULL,

                    timeline_tick_distance INTEGER NOT NULL,
                    timeline_tick_width INTEGER NOT NULL,
                    timeline_non_year_ticks_smaller INTEGER NOT NULL DEFAULT 1,

                    timeline_tick_marker_font_family TEXT NOT NULL,
                    timeline_tick_marker_font_style TEXT NOT NULL,
                    timeline_tick_marker_text_color TEXT NOT NULL,
                    timeline_tick_marker_font_size INTEGER NOT NULL,
                    timeline_tick_marker_text_always_on_top INTEGER NOT NULL DEFAULT 1,

                    timeline_show_hover_line INTEGER NOT NULL DEFAULT 1,
                    timeline_hover_line_color TEXT NOT NULL,
                    timeline_hover_line_style TEXT NOT NULL,
                    timeline_hover_line_width INTEGER NOT NULL,

                    timeline_edge_margin_width INTEGER NOT NULL,

                    timeline_data_range_width INTEGER NOT NULL,
                    timeline_is_data_range_visible INTEGER NOT NULL DEFAULT 1,
                    timeline_data_range_color TEXT NOT NULL,

                    timeline_animate_on_jump_to_year INTEGER NOT NULL DEFAULT 1,
                    timeline_jump_to_year_animation_length INTEGER NOT NULL,

                    timeline_animate_lod_change INTEGER NOT NULL DEFAULT 1,
                    timeline_lod_change_animation_length INTEGER NOT NULL,

                    timeline_calendar_overlay_enabled INTEGER NOT NULL DEFAULT 0,
                    timeline_calendar_overlay_season_color TEXT NOT NULL DEFAULT '#ffffff0a',
                    timeline_calendar_overlay_month_color TEXT NOT NULL DEFAULT '#ffffff08',
                    timeline_calendar_overlay_week_color TEXT NOT NULL DEFAULT '#ffffff06',
                    timeline_calendar_overlay_day_color TEXT NOT NULL DEFAULT '#ffffff05',

                    timeline_break_fill_color TEXT NOT NULL DEFAULT '#1a2a3c12',
                    timeline_break_border_color TEXT NOT NULL DEFAULT '#1a2a3c7d',
                    timeline_measure_line_color TEXT NOT NULL DEFAULT '#0077aa'
                );

                -- Character-to-character relationships (ported from v1, kept separate from relationship_types lookup)
                CREATE TABLE IF NOT EXISTS character_relationships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_1_id TEXT NOT NULL,
                    character_2_id TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    custom_relationship_type TEXT,
                    relationship_degree TEXT,
                    relationship_modifier TEXT,
                    relationship_strength INTEGER DEFAULT 50,
                    is_bidirectional INTEGER DEFAULT 0,
                    notes TEXT,
                    timeline_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (character_1_id) REFERENCES characters(id) ON DELETE CASCADE,
                    FOREIGN KEY (character_2_id) REFERENCES characters(id) ON DELETE CASCADE,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                -- Many-to-many between items and stories (ported from v1 item_story_refs)
                CREATE TABLE IF NOT EXISTS item_story_refs (
                    item_id TEXT NOT NULL,
                    story_id TEXT NOT NULL,
                    PRIMARY KEY (item_id, story_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
                );

                -- Book/chapter reference system (new in v2)
                CREATE TABLE IF NOT EXISTS books (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS book_stories (
                    book_id TEXT NOT NULL,
                    story_id TEXT NOT NULL,
                    PRIMARY KEY (book_id, story_id),
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY,
                    book_id TEXT NOT NULL,
                    number INTEGER NOT NULL,
                    title TEXT,
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS item_chapters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    chapter_id TEXT NOT NULL,
                    UNIQUE (item_id, chapter_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
                );

                -- Per-timeline hidden year ranges (collapsed on canvas with a break indicator)
                CREATE TABLE IF NOT EXISTS timeline_hidden_ranges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timeline_id INTEGER NOT NULL,
                    start_year INTEGER NOT NULL,
                    end_year INTEGER NOT NULL,
                    label TEXT,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                -- Event-character appearances with freetext role (replaces the old 1-to-1 item_characters purpose)
                CREATE TABLE IF NOT EXISTS item_character_appearances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    character_id TEXT NOT NULL,
                    role TEXT,
                    UNIQUE (item_id, character_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
                );

                -- Global named filter presets (retrievable from any timeline)
                CREATE TABLE IF NOT EXISTS filter_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    rules_json TEXT NOT NULL DEFAULT '[]',
                    and_mode INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Per-timeline active filter rule definitions
                CREATE TABLE IF NOT EXISTS timeline_filter_rules (
                    id TEXT PRIMARY KEY,
                    timeline_id INTEGER NOT NULL,
                    dimension TEXT NOT NULL,
                    params_json TEXT NOT NULL DEFAULT '{}',
                    label TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'neutral',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );

                -- Misc key-value store (not exported/imported); timeline_id=0 means global
                CREATE TABLE IF NOT EXISTS misc_settings (
                    key TEXT NOT NULL,
                    timeline_id INTEGER NOT NULL DEFAULT 0,
                    value TEXT,
                    PRIMARY KEY (key, timeline_id)
                );
            ";

            db.Execute(createTablesSql);
            ApplyColumnMigrations(db);
            CreateIndexes(db);
            SeedDefaultData(db);
            NormaliseLegacyRows(db);
        }

        /// <summary>
        /// Adds columns that may be missing from databases created by older app versions.
        /// Called before CreateIndexes so that indexes on new columns don't crash.
        /// </summary>
        private static void ApplyColumnMigrations(MigrationDb db)
        {
            var timelines = GetColumnSet(db, "timelines");
            var items    = GetColumnSet(db, "items");
            var chars    = GetColumnSet(db, "characters");
            var settings = GetColumnSet(db, "settings");
            var notes    = GetColumnSet(db, "notes");

            // timelines — seed DB schema predates calendar/layout_settings columns
            if (!timelines.Contains("calendar_id"))
                db.Execute("ALTER TABLE timelines ADD COLUMN calendar_id TEXT NOT NULL DEFAULT 'cal_default_gregorian'");
            if (!timelines.Contains("layout_settings_id"))
                db.Execute("ALTER TABLE timelines ADD COLUMN layout_settings_id TEXT NOT NULL DEFAULT 'ls_default'");
            if (!timelines.Contains("layout_settings_locked"))
                db.Execute("ALTER TABLE timelines ADD COLUMN layout_settings_locked INTEGER NOT NULL DEFAULT 0");

            // items — columns added progressively after initial release
            if (!items.Contains("timeline_id"))       db.Execute("ALTER TABLE items ADD COLUMN timeline_id INTEGER");
            if (!items.Contains("item_index"))         db.Execute("ALTER TABLE items ADD COLUMN item_index INTEGER DEFAULT 0");
            if (!items.Contains("show_in_notes"))      db.Execute("ALTER TABLE items ADD COLUMN show_in_notes INTEGER DEFAULT 1");
            if (!items.Contains("importance"))         db.Execute("ALTER TABLE items ADD COLUMN importance INTEGER DEFAULT 5");
            if (!items.Contains("absolute_start"))     db.Execute("ALTER TABLE items ADD COLUMN absolute_start REAL");
            if (!items.Contains("absolute_end"))       db.Execute("ALTER TABLE items ADD COLUMN absolute_end REAL");
            if (!items.Contains("min_lod_level"))      db.Execute("ALTER TABLE items ADD COLUMN min_lod_level INTEGER DEFAULT 3");
            if (!items.Contains("lod_visibility_mask"))db.Execute("ALTER TABLE items ADD COLUMN lod_visibility_mask INTEGER DEFAULT 255");
            if (!items.Contains("color"))              db.Execute("ALTER TABLE items ADD COLUMN color TEXT");
            if (!items.Contains("creation_granularity"))db.Execute("ALTER TABLE items ADD COLUMN creation_granularity INTEGER");
            if (!items.Contains("created_at"))         db.Execute("ALTER TABLE items ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            if (!items.Contains("updated_at"))         db.Execute("ALTER TABLE items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

            // characters
            if (!chars.Contains("timeline_id"))        db.Execute("ALTER TABLE characters ADD COLUMN timeline_id INTEGER");
            if (!chars.Contains("importance"))         db.Execute("ALTER TABLE characters ADD COLUMN importance INTEGER DEFAULT 5");
            if (!chars.Contains("color"))              db.Execute("ALTER TABLE characters ADD COLUMN color TEXT");
            if (!chars.Contains("created_at"))         db.Execute("ALTER TABLE characters ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            if (!chars.Contains("updated_at"))         db.Execute("ALTER TABLE characters ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

            // settings
            if (!settings.Contains("timeline_id"))       db.Execute("ALTER TABLE settings ADD COLUMN timeline_id INTEGER");
            if (!settings.Contains("window_maximized"))  db.Execute("ALTER TABLE settings ADD COLUMN window_maximized INTEGER DEFAULT 0");
            if (!settings.Contains("timeline_minimised"))         db.Execute("ALTER TABLE settings ADD COLUMN timeline_minimised INTEGER DEFAULT 0");
            if (!settings.Contains("year_calendar_position_x"))  db.Execute("ALTER TABLE settings ADD COLUMN year_calendar_position_x INTEGER DEFAULT 0");
            if (!settings.Contains("year_calendar_position_y"))  db.Execute("ALTER TABLE settings ADD COLUMN year_calendar_position_y INTEGER DEFAULT 0");
            if (!settings.Contains("year_calendar_size_x"))      db.Execute("ALTER TABLE settings ADD COLUMN year_calendar_size_x INTEGER DEFAULT 0");
            if (!settings.Contains("year_calendar_size_y"))      db.Execute("ALTER TABLE settings ADD COLUMN year_calendar_size_y INTEGER DEFAULT 0");
            if (!settings.Contains("pan_speed_multiplier"))      db.Execute("ALTER TABLE settings ADD COLUMN pan_speed_multiplier REAL DEFAULT 5.0");
            if (!settings.Contains("pan_deadzone"))               db.Execute("ALTER TABLE settings ADD COLUMN pan_deadzone INTEGER DEFAULT 100");
            if (!settings.Contains("default_item_color"))         db.Execute("ALTER TABLE settings ADD COLUMN default_item_color TEXT DEFAULT '#000000'");

            // notes — seed DB has old schema (id INTEGER, year/subtick/content) incompatible with UUID ids
            // If id column is INTEGER, drop and recreate with the current TEXT-id schema
            var notesIdType = db.QueryFirstOrDefault<string>(
                "SELECT type FROM pragma_table_info('notes') WHERE name='id'");
            if (string.Equals(notesIdType, "INTEGER", StringComparison.OrdinalIgnoreCase))
            {
                db.Execute("DROP TABLE notes");
                db.Execute(@"
                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        note_contents TEXT,
                        timeline_id INTEGER,
                        connected_item_id INTEGER,
                        nearest_year INTEGER,
                        absolute_time REAL NOT NULL DEFAULT 0,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (connected_item_id) REFERENCES items(id) ON DELETE CASCADE,
                        FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                    )");
                notes = GetColumnSet(db, "notes");
            }
            if (!notes.Contains("timeline_id"))        db.Execute("ALTER TABLE notes ADD COLUMN timeline_id INTEGER");
            if (!notes.Contains("note_contents"))      db.Execute("ALTER TABLE notes ADD COLUMN note_contents TEXT");
            if (!notes.Contains("nearest_year"))       db.Execute("ALTER TABLE notes ADD COLUMN nearest_year INTEGER");
            if (!notes.Contains("connected_item_id"))  db.Execute("ALTER TABLE notes ADD COLUMN connected_item_id INTEGER");
            if (!notes.Contains("updated_at"))         db.Execute("ALTER TABLE notes ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

            // Backfill absolute positions for items that pre-date on-save computation.
            // Only touches rows where absolute_start IS NULL (the ALTER TABLE default);
            // rows with absolute_start = 0.0 are left alone (valid year-0 items).
            var hasSubtick    = items.Contains("subtick");
            var hasEndSubtick = items.Contains("end_subtick");

            if (hasSubtick)
            {
                // Old schema: use legacy formula year + subtick/10 (matches DatabaseImporter)
                db.Execute(@"
                    UPDATE items
                    SET absolute_start = CAST(year AS REAL)
                                       + CAST(COALESCE(subtick, 0) AS REAL) / 10.0,
                        absolute_end   = COALESCE(
                                           CAST(end_year AS REAL)
                                           + CAST(COALESCE(end_subtick, 0) AS REAL) / 10.0,
                                           CAST(year AS REAL)
                                           + CAST(COALESCE(subtick, 0) AS REAL) / 10.0)
                    WHERE absolute_start IS NULL
                      AND year IS NOT NULL;
                ");
            }
            else
            {
                // Post-BL02 schema: no subtick column; use plain year
                db.Execute(@"
                    UPDATE items
                    SET absolute_start = CAST(year AS REAL),
                        absolute_end   = COALESCE(CAST(end_year AS REAL), CAST(year AS REAL))
                    WHERE absolute_start IS NULL
                      AND year IS NOT NULL;
                ");
            }
        }

        private static HashSet<string> GetColumnSet(MigrationDb db, string table)
        {
            try
            {
                return db.Query<string>($"SELECT name FROM pragma_table_info('{table}')")
                         .ToHashSet(StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static void CreateIndexes(MigrationDb db)
        {
            db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_items_timeline_id ON items(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
                CREATE INDEX IF NOT EXISTS idx_item_pictures_combined ON item_pictures(item_id, picture_id);
                CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

                CREATE INDEX IF NOT EXISTS idx_char_rel_char1 ON character_relationships(character_1_id);
                CREATE INDEX IF NOT EXISTS idx_char_rel_char2 ON character_relationships(character_2_id);
                CREATE INDEX IF NOT EXISTS idx_char_rel_timeline ON character_relationships(timeline_id);

                CREATE INDEX IF NOT EXISTS idx_item_story_refs_item ON item_story_refs(item_id);
                CREATE INDEX IF NOT EXISTS idx_item_story_refs_story ON item_story_refs(story_id);

                CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
                CREATE INDEX IF NOT EXISTS idx_item_chapters_item ON item_chapters(item_id);
                CREATE INDEX IF NOT EXISTS idx_item_chapters_chapter ON item_chapters(chapter_id);

                CREATE INDEX IF NOT EXISTS idx_item_char_app_item ON item_character_appearances(item_id);
                CREATE INDEX IF NOT EXISTS idx_item_char_app_char ON item_character_appearances(character_id);

                CREATE INDEX IF NOT EXISTS idx_hidden_ranges_timeline ON timeline_hidden_ranges(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_settings_timeline_id ON settings(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_characters_timeline_id ON characters(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_notes_timeline_id ON notes(timeline_id);

                CREATE INDEX IF NOT EXISTS idx_filter_rules_timeline ON timeline_filter_rules(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_misc_settings_key ON misc_settings(key);
            ");
        }

        private static void SeedDefaultData(MigrationDb db)
        {
            // Seed the 9 base Item Types
            var defaultTypes = new[] {
                new { Id = 1, Name = "Event", Desc = "A specific point in time" },
                new { Id = 2, Name = "Period", Desc = "A span of time" },
                new { Id = 3, Name = "Age", Desc = "A significant era or period" },
                new { Id = 4, Name = "Picture", Desc = "An image or visual record" },
                new { Id = 5, Name = "Note", Desc = "A text note or annotation" },
                new { Id = 6, Name = "Bookmark", Desc = "A marked point of interest" },
                new { Id = 7, Name = "Character", Desc = "A person or entity" },
                new { Id = 8, Name = "Timeline_start", Desc = "The start point of the timeline" },
                new { Id = 9, Name = "Timeline_end", Desc = "The end point of the timeline" }
            };

            string insertSql = "INSERT OR IGNORE INTO item_types (id, name, description) VALUES (@Id, @Name, @Desc)";
            db.Execute(insertSql, defaultTypes);

            insertSql = @"INSERT OR IGNORE INTO lod_profiles (id, name, profile)
                        VALUES ('lod_default', 'Standard Gregorian Scale', '[{""index"":0,""formatKey"":""MILLENNIA"",""stepFraction"":1000},{""index"":1,""formatKey"":""CENTURIES"",""stepFraction"":100},{""index"":2,""formatKey"":""DECADES"",""stepFraction"":10},{""index"":3,""formatKey"":""YEARS"",""stepFraction"":1},{""index"":4,""formatKey"":""SEASONS"",""stepFraction"":0.25},{""index"":5,""formatKey"":""MONTHS"",""stepFraction"":0.08333333333},{""index"":6,""formatKey"":""WEEKS"",""stepFraction"":0.01923076923},{""index"":7,""formatKey"":""DAYS"",""stepFraction"":0.00273972602}]');";

            db.Execute(insertSql);

            insertSql = @"INSERT OR IGNORE INTO calendars (id, name, short_name, alternate_name, name_before_0, name_after_0, lod_profile_id, year_definition) 
                        VALUES ('cal_default_gregorian', 'Gregorian', 'Greg.', 'Western Calendar', 'BCE', 'CE', 'lod_default', '{ ""length"": 365, ""week_definition"": { ""length"": 7, ""days_have_names"": true, ""days"": [ ""Monday"", ""Tuesday"", ""Wednesday"", ""Thursday"", ""Friday"", ""Saturday"", ""Sunday"" ], ""days_have_short_names"": true, ""days_short"": [ ""Mon"", ""Tue"", ""Wed"", ""Thu"", ""Fri"", ""Sat"", ""Sun"" ], ""weekend"": [ 5, 6 ] }, ""seasons"": 4, ""season_definition"": { ""seasons_have_short_name"": false, ""0"": { ""name"": ""Spring"", ""start"": 60, ""end"": 151 }, ""1"": { ""name"": ""Summer"", ""start"": 152, ""end"": 243, ""significance"": ""hottest"" }, ""2"": { ""name"": ""Fall"", ""start"": 244, ""end"": 334 }, ""3"": { ""name"": ""Winter"", ""start"": 335, ""end"": 59, ""significance"": ""coldest"" } }, ""months"": 12, ""month_definition"": { ""months_have_short_name"": true, ""0"": { ""name"": ""January"", ""short_name"": ""Jan"", ""length"": 31, ""season"": 3 }, ""1"": { ""name"": ""February"", ""short_name"": ""Feb"", ""length"": 28, ""season"": 3 }, ""2"": { ""name"": ""March"", ""short_name"": ""Mar"", ""length"": 31, ""season"": 0 }, ""3"": { ""name"": ""April"", ""short_name"": ""Apr"", ""length"": 30, ""season"": 0 }, ""4"": { ""name"": ""May"", ""short_name"": ""May"", ""length"": 31, ""season"": 0 }, ""5"": { ""name"": ""June"", ""short_name"": ""Jun"", ""length"": 30, ""season"": 1 }, ""6"": { ""name"": ""July"", ""short_name"": ""Jul"", ""length"": 31, ""season"": 1 }, ""7"": { ""name"": ""August"", ""short_name"": ""Aug"", ""length"": 31, ""season"": 1 }, ""8"": { ""name"": ""September"", ""short_name"": ""Sept"", ""length"": 30, ""season"": 2 }, ""9"": { ""name"": ""October"", ""short_name"": ""Oct"", ""length"": 31, ""season"": 2 }, ""10"": { ""name"": ""November"", ""short_name"": ""Nov"", ""length"": 30, ""season"": 2 }, ""11"": { ""name"": ""December"", ""short_name"": ""Dec"", ""length"": 31, ""season"": 3 } } }');";

            db.Execute(insertSql);

            insertSql = @"INSERT OR IGNORE INTO layout_settings 
                        (
                            id,
                            name,
                            timeline_event_box_width,
                            timeline_event_box_height,
                            timeline_event_box_stem_offset,
                            timeline_event_border_color,
                            timeline_event_border_width,
                            timeline_event_border_radius,
                            timeline_event_padding,
                            timeline_event_y_margin,
                            timeline_event_text_color,
                            timeline_event_background_color,
                            timeline_event_font_family,
                            timeline_event_font_size,
                            timeline_event_text_use_ellipsis,
                            timeline_event_box_show_color,
                            timeline_event_box_show_color_on_bottom,
                            timeline_event_has_hover_highlight,
                            timeline_event_hover_color,
                            timeline_age_height,
                            timeline_age_corner_rounding,
                            timeline_period_height,
                            timeline_period_corner_rounding,
                            timeline_period_y_margin,
                            timeline_period_y_offset,
                            timeline_box_types_show_as_box,
                            timeline_box_types_box_width,
                            timeline_box_types_show_image,
                            timeline_canvas_background_color,
                            timeline_show_now_line,
                            timeline_show_now_line_text,
                            timeline_now_line_color,
                            timeline_now_line_style,
                            timeline_tick_distance,
                            timeline_tick_width,
                            timeline_non_year_ticks_smaller,
                            timeline_tick_marker_font_family,
                            timeline_tick_marker_font_style,
                            timeline_tick_marker_text_color,
                            timeline_tick_marker_font_size,
                            timeline_tick_marker_text_always_on_top,
                            timeline_show_hover_line,
                            timeline_hover_line_color,
                            timeline_hover_line_style,
                            timeline_hover_line_width,
                            timeline_edge_margin_width,
                            timeline_data_range_width,
                            timeline_is_data_range_visible,
                            timeline_data_range_color,
                            timeline_animate_on_jump_to_year,
                            timeline_jump_to_year_animation_length,
                            timeline_animate_lod_change,
                            timeline_lod_change_animation_length,
                            timeline_calendar_overlay_enabled,
                            timeline_calendar_overlay_season_color,
                            timeline_calendar_overlay_month_color,
                            timeline_calendar_overlay_week_color,
                            timeline_calendar_overlay_day_color,
                            timeline_break_fill_color,
                            timeline_break_border_color,
                            timeline_measure_line_color
                        ) VALUES (
                            'ls_default',
                            'Default layout settings',
                            130,
                            30,
                            10,
                            '#44A8',
                            1,
                            3,
                            '10',
                            5,
                            '#000',
                            '#fff',
                            'Arial',
                            16,
                            1,
                            1,
                            0,
                            1,
                            '#33f',
                            30,
                            0,
                            15,
                            10,
                            20,
                            30,
                            1,
                            100,
                            1,
                            '#f1e7d5',
                            1,
                            1,
                            '#f00',
                            'dashed',
                            100,
                            1,
                            1,
                            'Arial',
                            'normal',
                            '#2a1a0e',
                            14,
                            0,
                            1,
                            '#f00',
                            'solid',
                            1,
                            10,
                            100,
                            1,
                            '#ff72',
                            1,
                            600,
                            1,
                            200,
                            0,
                            '#ffffff0a',
                            '#ffffff08',
                            '#ffffff06',
                            '#ffffff05',
                            '#1a2a3c12',
                            '#1a2a3c7d',
                            '#0077aa'
                        );";

            db.Execute(insertSql);

            // Migrations: fix default values that changed after initial seed
            db.Execute(@"
                UPDATE layout_settings SET timeline_period_height = 15
                    WHERE id = 'ls_default' AND timeline_period_height != 15;
                UPDATE layout_settings SET timeline_tick_marker_text_color = '#2a1a0e'
                    WHERE id = 'ls_default' AND timeline_tick_marker_text_color = '#fff';
            ");

            // Schema migrations: add columns that didn't exist in earlier schema versions
            AddCol(db, "timelines",       "color",                         "TEXT DEFAULT NULL");
            AddCol(db, "notes",           "absolute_time",                 "REAL NOT NULL DEFAULT 0");
            AddCol(db, "items",           "lod_visibility_mask",           "INTEGER DEFAULT 255");
            AddCol(db, "layout_settings", "timeline_tick_color",           "TEXT NOT NULL DEFAULT '#c8b9a4'");
            AddCol(db, "layout_settings", "timeline_axis_color",           "TEXT NOT NULL DEFAULT '#b5a692'");
            AddCol(db, "layout_settings", "notes_panel_background_color",  "TEXT NOT NULL DEFAULT '#0f172a'");
            AddCol(db, "layout_settings", "notes_panel_card_background_color", "TEXT NOT NULL DEFAULT '#1e293b'");
            AddCol(db, "layout_settings", "notes_panel_text_color",        "TEXT NOT NULL DEFAULT '#e2e8f0'");
            AddCol(db, "layout_settings", "notes_panel_heading_color",     "TEXT NOT NULL DEFAULT '#94a3b8'");
            AddCol(db, "layout_settings", "notes_panel_accent_color",      "TEXT NOT NULL DEFAULT '#6366f1'");
            AddCol(db, "layout_settings", "notes_panel_font_size",         "INTEGER NOT NULL DEFAULT 13");
            AddCol(db, "layout_settings", "data_panel_background_color",   "TEXT NOT NULL DEFAULT '#f5f0e8'");
            AddCol(db, "layout_settings", "data_panel_card_background_color", "TEXT NOT NULL DEFAULT '#ffffffaa'");
            AddCol(db, "layout_settings", "data_panel_h1_color",           "TEXT NOT NULL DEFAULT '#2c1f0f'");
            AddCol(db, "layout_settings", "data_panel_h2_color",           "TEXT NOT NULL DEFAULT '#3a2b1a'");
            AddCol(db, "layout_settings", "data_panel_h3_color",           "TEXT NOT NULL DEFAULT '#2c1f0f'");
            AddCol(db, "layout_settings", "data_panel_h4_color",           "TEXT NOT NULL DEFAULT '#5c4a38'");
            AddCol(db, "layout_settings", "data_panel_font_family",        "TEXT NOT NULL DEFAULT 'Georgia, serif'");
            AddCol(db, "layout_settings", "data_panel_font_size",          "INTEGER NOT NULL DEFAULT 14");
            AddCol(db, "layout_settings", "gallery_panel_background_color", "TEXT NOT NULL DEFAULT '#0f172a'");
            AddCol(db, "layout_settings", "gallery_panel_border_color",     "TEXT NOT NULL DEFAULT '#1e293b'");
            AddCol(db, "layout_settings", "gallery_panel_text_color",       "TEXT NOT NULL DEFAULT '#94a3b8'");
            AddCol(db, "layout_settings", "calendar_panel_background_color", "TEXT NOT NULL DEFAULT '#f5f0e8'");
            AddCol(db, "layout_settings", "calendar_panel_border_color",     "TEXT NOT NULL DEFAULT '#d5cec4'");
            AddCol(db, "layout_settings", "calendar_panel_text_color",       "TEXT NOT NULL DEFAULT '#5c4a38'");
            AddCol(db, "layout_settings", "calendar_panel_week_highlight_color", "TEXT NOT NULL DEFAULT '#6366f118'");
            AddCol(db, "layout_settings", "calendar_panel_day_highlight_color",  "TEXT NOT NULL DEFAULT '#6366f135'");
            AddCol(db, "layout_settings", "timeline_calendar_overlay_enabled",      "INTEGER NOT NULL DEFAULT 0");
            AddCol(db, "layout_settings", "timeline_calendar_overlay_season_color", "TEXT NOT NULL DEFAULT '#ffffff0a'");
            AddCol(db, "layout_settings", "timeline_calendar_overlay_month_color",  "TEXT NOT NULL DEFAULT '#ffffff08'");
            AddCol(db, "layout_settings", "timeline_calendar_overlay_week_color",   "TEXT NOT NULL DEFAULT '#ffffff06'");
            AddCol(db, "layout_settings", "timeline_calendar_overlay_day_color",    "TEXT NOT NULL DEFAULT '#ffffff05'");
            AddCol(db, "layout_settings", "timeline_break_fill_color",              "TEXT NOT NULL DEFAULT '#1a2a3c12'");
            AddCol(db, "layout_settings", "timeline_break_border_color",            "TEXT NOT NULL DEFAULT '#1a2a3c7d'");
            AddCol(db, "layout_settings", "timeline_measure_line_color",            "TEXT NOT NULL DEFAULT '#0077aa'");
            AddCol(db, "layout_settings", "timeline_data_range_width",              "INTEGER NOT NULL DEFAULT 100");

            // Fix dark preset data panel colors if they were created with light defaults
            db.Execute(@"
                UPDATE layout_settings SET
                    data_panel_background_color     = '#0f172a',
                    data_panel_card_background_color = '#1e293b44',
                    data_panel_h1_color             = '#e2e8f0',
                    data_panel_h2_color             = '#cbd5e1',
                    data_panel_h3_color             = '#94a3b8',
                    data_panel_h4_color             = '#64748b',
                    data_panel_font_family          = 'Arial, sans-serif',
                    data_panel_font_size            = 13
                WHERE id = 'ls_dark' AND data_panel_background_color = '#f5f0e8';
            ");

            // Fix default preset notes/gallery colors — AddCol defaults are dark; restore light values
            db.Execute(@"
                UPDATE layout_settings SET
                    notes_panel_background_color      = '#f9f7fe',
                    notes_panel_card_background_color = '#e8e4f5',
                    notes_panel_text_color            = '#1e1640',
                    notes_panel_heading_color         = '#5b4d8a',
                    notes_panel_accent_color          = '#6366f1',
                    notes_panel_font_size             = 13,
                    gallery_panel_background_color    = '#f5f0e8',
                    gallery_panel_border_color        = '#d5cec4',
                    gallery_panel_text_color          = '#5c4a38'
                WHERE id = 'ls_default' AND notes_panel_background_color = '#0f172a';
            ");

            // Align dark preset non-color fields to match light preset
            db.Execute(@"
                UPDATE layout_settings SET
                    timeline_event_font_size            = 16,
                    timeline_age_corner_rounding        = 0,
                    timeline_period_corner_rounding     = 10,
                    timeline_period_y_offset            = 30,
                    timeline_tick_distance              = 100,
                    timeline_tick_marker_font_size      = 14,
                    timeline_hover_line_style           = 'solid',
                    timeline_edge_margin_width          = 10,
                    timeline_lod_change_animation_length = 200,
                    data_panel_font_family              = 'Georgia, serif',
                    data_panel_font_size                = 14
                WHERE id = 'ls_dark';
            ");

            // Fix period_y_margin default: initial INSERT had 5, correct value is 20
            db.Execute(@"
                UPDATE layout_settings SET timeline_period_y_margin = 20
                    WHERE id IN ('ls_default', 'ls_dark') AND timeline_period_y_margin = 5;
            ");

            // Seed dark preset
            InsertDarkPreset(db);
        }

        private static bool HasColumn(MigrationDb db, string table, string column)
        {
            return db.ExecuteScalar<int>(
                $"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = '{column}'") > 0;
        }

        private static void AddCol(MigrationDb db, string table, string column, string definition)
        {
            if (!HasColumn(db, table, column))
                db.Execute($"ALTER TABLE {table} ADD COLUMN {column} {definition}");
        }

        /// <summary>
        /// Row fix-ups that used to run after every import (DatabaseImporter.ApplyLegacyMigrations) and
        /// the NULL-coalescing the V2 importer applied while copying. Doing them here means an imported
        /// backup is normalised by the same code as a live database.
        /// </summary>
        private static void NormaliseLegacyRows(MigrationDb db)
        {
            db.Execute(@"
                UPDATE timelines SET calendar_id = 'cal_default_gregorian' WHERE calendar_id IS NULL;
                UPDATE calendars SET name_before_0 = COALESCE(name_before_0, ''), name_after_0 = COALESCE(name_after_0, '')
                    WHERE name_before_0 IS NULL OR name_after_0 IS NULL;
                UPDATE items SET min_lod_level = 3 WHERE min_lod_level IS NULL;
            ");
        }

        private static void InsertDarkPreset(MigrationDb db)
        {
            db.Execute(@"INSERT OR IGNORE INTO layout_settings (
                    id, name,
                    timeline_event_box_width, timeline_event_box_height, timeline_event_box_stem_offset,
                    timeline_event_border_color, timeline_event_border_width, timeline_event_border_radius,
                    timeline_event_padding, timeline_event_y_margin,
                    timeline_event_text_color, timeline_event_background_color,
                    timeline_event_font_family, timeline_event_font_size,
                    timeline_event_text_use_ellipsis, timeline_event_box_show_color,
                    timeline_event_box_show_color_on_bottom, timeline_event_has_hover_highlight,
                    timeline_event_hover_color,
                    timeline_age_height, timeline_age_corner_rounding,
                    timeline_period_height, timeline_period_corner_rounding,
                    timeline_period_y_margin, timeline_period_y_offset,
                    timeline_box_types_show_as_box, timeline_box_types_box_width, timeline_box_types_show_image,
                    timeline_canvas_background_color,
                    timeline_show_now_line, timeline_show_now_line_text,
                    timeline_now_line_color, timeline_now_line_style,
                    timeline_tick_distance, timeline_tick_width, timeline_non_year_ticks_smaller,
                    timeline_tick_marker_font_family, timeline_tick_marker_font_style,
                    timeline_tick_marker_text_color, timeline_tick_marker_font_size,
                    timeline_tick_marker_text_always_on_top,
                    timeline_show_hover_line,
                    timeline_hover_line_color, timeline_hover_line_style, timeline_hover_line_width,
                    timeline_edge_margin_width,
                    timeline_data_range_width, timeline_is_data_range_visible, timeline_data_range_color,
                    timeline_animate_on_jump_to_year, timeline_jump_to_year_animation_length,
                    timeline_animate_lod_change, timeline_lod_change_animation_length,
                    timeline_tick_color, timeline_axis_color,
                    notes_panel_background_color, notes_panel_card_background_color,
                    notes_panel_text_color, notes_panel_heading_color,
                    notes_panel_accent_color, notes_panel_font_size,
                    data_panel_background_color, data_panel_card_background_color,
                    data_panel_h1_color, data_panel_h2_color, data_panel_h3_color, data_panel_h4_color,
                    data_panel_font_family, data_panel_font_size,
                    gallery_panel_background_color, gallery_panel_border_color, gallery_panel_text_color,
                    calendar_panel_background_color, calendar_panel_border_color, calendar_panel_text_color,
                    calendar_panel_week_highlight_color, calendar_panel_day_highlight_color,
                    timeline_calendar_overlay_enabled,
                    timeline_calendar_overlay_season_color, timeline_calendar_overlay_month_color,
                    timeline_calendar_overlay_week_color, timeline_calendar_overlay_day_color,
                    timeline_break_fill_color, timeline_break_border_color,
                    timeline_measure_line_color
                ) VALUES (
                    'ls_dark', 'Dark Mode',
                    130, 30, 10,
                    '#2d3a56', 1, 3,
                    '10', 5,
                    '#e2e8f0', '#141e33',
                    'Arial', 16,
                    1, 1,
                    0, 1,
                    '#3b6ec4',
                    30, 0,
                    15, 10,
                    20, 30,
                    1, 100, 1,
                    '#0f172a',
                    1, 1,
                    '#ef4444', 'dashed',
                    100, 1, 1,
                    'Arial', 'normal',
                    '#94a3b8', 14,
                    0,
                    1,
                    '#3b6ec4', 'solid', 1,
                    10,
                    100, 1, '#3b6ec44d',
                    1, 600,
                    1, 200,
                    '#334155', '#1e2b44',
                    '#0f172a', '#1e293b',
                    '#e2e8f0', '#94a3b8',
                    '#6366f1', 13,
                    '#0f172a', '#1e293b44',
                    '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b',
                    'Georgia, serif', 14,
                    '#0f172a', '#1e293b', '#94a3b8',
                    '#0f172a', '#1e293b', '#94a3b8',
                    '#818cf818', '#818cf835',
                    0,
                    '#ffffff10', '#ffffff0c',
                    '#ffffff08', '#ffffff06',
                    '#b4c8ff0d', '#78a0dc88',
                    '#00d4ff'
                );");
        }

        // ── 2: items.placement ────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Which side of the axis an item sits on: 0 = unassigned (canvas falls back to item_index parity),
        /// 1 = above, 2 = below. Existing items are frozen on the side the canvas already showed them:
        /// it alternated by position in (absolute_start, item_index) order, periods counted separately
        /// from everything else, and never placed ages, bookmarks, characters or boundaries.
        /// </summary>
        private static void V2_ItemPlacement(MigrationDb db)
        {
            db.Execute("ALTER TABLE items ADD COLUMN placement INTEGER NOT NULL DEFAULT 0");
            db.Execute(@"
                UPDATE items SET placement = (
                    SELECT CASE WHEN o.rn % 2 = 1 THEN 1 ELSE 2 END
                    FROM (SELECT id, ROW_NUMBER() OVER (
                              PARTITION BY timeline_id, type_id = 2
                              ORDER BY absolute_start, item_index, rowid) AS rn
                          FROM items WHERE type_id NOT IN (3, 6, 7, 8, 9)) AS o
                    WHERE o.id = items.id)
                WHERE type_id NOT IN (3, 6, 7, 8, 9)");
        }

        // ── 3: timeline header mode ──────────────────────────────────────────────────────────────

        /// <summary>How the timeline window shows its title strip: 0 = full, 1 = compact, 2 = hidden.</summary>
        private static void V3_HeaderMode(MigrationDb db)
        {
            db.Execute("ALTER TABLE settings ADD COLUMN header_mode INTEGER NOT NULL DEFAULT 0");
        }

        // ── 4: centered item boxes ───────────────────────────────────────────────────────────────

        /// <summary>Per-item flag: the box sits centered on its stem instead of offset to one side.</summary>
        private static void V4_ItemCentered(MigrationDb db)
        {
            db.Execute("ALTER TABLE items ADD COLUMN centered INTEGER NOT NULL DEFAULT 0");
        }

        // ── 5: picture title ─────────────────────────────────────────────────────────────────────

        /// <summary>Per-item flag: draw the title as a caption strip on picture items.</summary>
        private static void V5_ShowTitle(MigrationDb db)
        {
            db.Execute("ALTER TABLE items ADD COLUMN show_title INTEGER NOT NULL DEFAULT 0");
        }

        // ── 6: item notes ────────────────────────────────────────────────────────────────────────

        /// <summary>Writer's private notes on an item; stored, exported, never rendered.</summary>
        private static void V6_ItemNotes(MigrationDb db)
        {
            db.Execute("ALTER TABLE items ADD COLUMN item_notes TEXT");
        }
    }
}

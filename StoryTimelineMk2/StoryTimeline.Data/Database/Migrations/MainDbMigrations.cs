using System.Globalization;
using System.Text;
using System.Text.Json;

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
            new(7, "keyboard pan speed", "1.0.3", V7_KeyboardPanSpeed),
            new(8, "session day log", "1.1.0", V8_SessionDays),
            new(9, "character names, portrait and generated items", "1.1.1", V9_CharacterDetails),
            new(10, "character date precision", "1.1.1", V10_CharacterDatePrecision),
            new(11, "character highlight color opt-in", "1.1.1", V11_CharacterHighlightColor),
            new(12, "separate caption font sizes", "1.1.1", V12_CaptionFontSizes),
            new(13, "relationship types and dated relations", "1.1.1", V13_CharacterRelations),
            new(14, "character gender and the full relation vocabulary", "1.1.1", V14_RelationVocabulary),
            new(15, "open-ended ages and periods", "1.1.1", V15_OpenEndedSpans),
            new(16, "shared characters, relation meaning and absolute dates", "1.1.1", V16_CharacterMeaning),
            new(17, "faction, and where things happened", "1.1.1", V17_FactionAndPlace),
            new(18, "the fade on an open-ended span", "1.1.1", V18_OpenEndFade),
            new(19, "per-level tick distance", "1.1.1", V19_LodTickDistance),
            new(20, "angled axis labels", "1.1.1", V20_AngledTickLabels),
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
        /// The column to read in a backfill, or the literal <c>NULL</c> when this database has never
        /// had it. Pre-1.0.1 files were built column by column, so a source column is not a given —
        /// and NULL propagating through the arithmetic is exactly "no date", which is the truth.
        /// </summary>
        private static string Col(MigrationDb db, string table, string column) =>
            HasColumn(db, table, column) ? column : "NULL";

        /// <summary>Needs SQLite 3.35+, which Microsoft.Data.Sqlite 10 carries; no index may name the column.</summary>
        private static void DropCol(MigrationDb db, string table, string column)
        {
            if (HasColumn(db, table, column))
                db.Execute($"ALTER TABLE {table} DROP COLUMN {column}");
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

        // ── 7: keyboard pan speed ────────────────────────────────────────────────────────────────

        /// <summary>← / → hold-to-pan speed per timeline, in px/s (BL-39).</summary>
        private static void V7_KeyboardPanSpeed(MigrationDb db)
        {
            db.Execute("ALTER TABLE settings ADD COLUMN keyboard_pan_speed REAL NOT NULL DEFAULT 400");
        }

        // ── 8: session day log ──────────────────────────────────────────────────

        /// <summary>
        /// BL-33: one row per day a timeline was worked on. The day currently open holds a
        /// <c>baseline</c> — the signature of every item as it stood that morning — and nothing
        /// else; sealing the day replaces it with that day's net <c>changes</c> and their counts,
        /// which is what a range export merges. Only one baseline exists per timeline at a time,
        /// so the log stays small however long the history gets.
        /// </summary>
        private static void V8_SessionDays(MigrationDb db)
        {
            // ponytail: no FK to timelines — foreign keys are off by default on these connections,
            // so it would not cascade anyway. Orphan rows are unreachable, not harmful.
            db.Execute(@"
                CREATE TABLE session_days (
                    timeline_id INTEGER NOT NULL,
                    day         TEXT    NOT NULL,
                    started_at  TEXT    NOT NULL,
                    baseline    TEXT,
                    changes     TEXT,
                    added       INTEGER NOT NULL DEFAULT 0,
                    changed     INTEGER NOT NULL DEFAULT 0,
                    removed     INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (timeline_id, day)
                )");

            db.Execute(@"
                CREATE TABLE session_exports (
                    timeline_id INTEGER PRIMARY KEY,
                    exported_at TEXT NOT NULL,
                    through_day TEXT NOT NULL
                )");
        }

        // ── 9: character names, portrait, state, generated items ──────────────────────────────────

        /// <summary>
        /// BL-15 phase 0. Splits <c>characters.name</c> into first/last while keeping <c>name</c> itself
        /// as a derived column, so every existing read of it (ORDER BY name, the appearance lists, the
        /// EditItem picker) keeps working untouched. Adds what the character window needs beyond that:
        /// a portrait pointing at the shared <c>pictures</c> table, an explicit state, and the two items
        /// <i>Show on timeline</i> generates — exactly two, so two columns beat a join table.
        /// <c>item_character_appearances</c> learns which links the text matcher made on its own, and
        /// the dismissal table remembers the detected ones the user deleted so they do not come back.
        /// </summary>
        private static void V9_CharacterDetails(MigrationDb db)
        {
            db.Execute(@"
                ALTER TABLE characters ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
                ALTER TABLE characters ADD COLUMN last_name  TEXT NOT NULL DEFAULT '';
                ALTER TABLE characters ADD COLUMN portrait_picture_id TEXT;
                ALTER TABLE characters ADD COLUMN state TEXT;
                ALTER TABLE characters ADD COLUMN show_on_timeline INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE characters ADD COLUMN birth_item_id TEXT;
                ALTER TABLE characters ADD COLUMN death_item_id TEXT;

                ALTER TABLE item_character_appearances ADD COLUMN auto_detected INTEGER NOT NULL DEFAULT 0;");

            // ponytail: no FKs — foreign keys are off on these connections, so they would not
            // cascade anyway. A row left behind by a deleted item is unreachable, not harmful.
            db.Execute(@"
                CREATE TABLE character_link_dismissals (
                    item_id      TEXT NOT NULL,
                    character_id TEXT NOT NULL,
                    PRIMARY KEY (item_id, character_id)
                )");

            // Last space wins: "Risha" is a first name, "Anna Maria Vas" is "Anna Maria" + "Vas".
            // A guess, which is why both halves are editable afterwards — with this user base that
            // beats a migration that has to ask questions.
            foreach (var (id, name) in db.Query<(string Id, string? Name)>("SELECT id, name FROM characters"))
            {
                var (first, last) = CharacterItem.SplitName(name);
                db.Execute("UPDATE characters SET first_name = @first, last_name = @last WHERE id = @id",
                    new { first, last, id });
            }
        }

        // ── 10: character date precision ──────────────────────────────────────────────────────────

        /// <summary>
        /// BL-15 phase 1. A birth or death year alone cannot place an item: the canvas works in
        /// <c>absolute_start = year + subtick * lodStep</c>, so the character has to remember which
        /// tick inside the year, and at which LOD that tick was picked — the same pair every item
        /// carries. The legacy <c>birth_date</c> / <c>death_date</c> strings are real-world dates
        /// from the v1 import and say nothing about a custom calendar, so they are left alone.
        /// </summary>
        private static void V10_CharacterDatePrecision(MigrationDb db)
        {
            db.Execute(@"
                ALTER TABLE characters ADD COLUMN birth_subtick     INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE characters ADD COLUMN birth_granularity INTEGER NOT NULL DEFAULT 3;
                ALTER TABLE characters ADD COLUMN death_subtick     INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE characters ADD COLUMN death_granularity INTEGER NOT NULL DEFAULT 3;");
        }

        // ── 11: character highlight color ────────────────────────────────────────────────────────

        /// <summary>
        /// BL-15, after phase 2. A portrait with transparency sat straight on the character's
        /// color, which drowned the face. The disc is neutral now and the color rides the ring
        /// instead, unless the character asks for the fill back — so this defaults to off,
        /// existing rows included.
        /// </summary>
        private static void V11_CharacterHighlightColor(MigrationDb db)
        {
            db.Execute("ALTER TABLE characters ADD COLUMN use_highlight_color INTEGER NOT NULL DEFAULT 0;");
        }

        // ── 20: angled axis labels ─────────────────────────────────────────────

        /// <summary>
        /// BL-82: per-rung tick distances (step 19) mean the axis can now be tight enough that a
        /// horizontal date label runs into its neighbour. Off by default, so no existing timeline
        /// changes appearance on upgrade.
        /// </summary>
        private static void V20_AngledTickLabels(MigrationDb db)
        {
            AddCol(db, "layout_settings", "timeline_tick_marker_text_angled", "INTEGER NOT NULL DEFAULT 0");
        }

        // ── 12: caption font sizes ────────────────────────────────────────────────────────────────

        /// <summary>
        /// BL-15: a portrait's caption is a generated sentence ("The birth of &lt;full name&gt;") and
        /// overflows the disc at the event font size. Pictures and portraits get a size each, backfilled
        /// from the event size so no existing timeline changes appearance on upgrade.
        /// </summary>
        private static void V12_CaptionFontSizes(MigrationDb db)
        {
            AddCol(db, "layout_settings", "timeline_picture_caption_font_size",   "INTEGER NOT NULL DEFAULT 12");
            AddCol(db, "layout_settings", "timeline_character_caption_font_size", "INTEGER NOT NULL DEFAULT 12");
            db.Execute(@"UPDATE layout_settings
                            SET timeline_picture_caption_font_size   = timeline_event_font_size,
                                timeline_character_caption_font_size = timeline_event_font_size");
        }

        // ── 13: character relations ───────────────────────────────────────────────────────────────

        /// <summary>
        /// BL-15 phase 4 / BL-17. <c>relationship_types</c> came over from v1 but was never seeded, so
        /// there was no kind to relate two characters by. A starter set goes in — family first, because
        /// that is what the lifeline's family portraits will read — and the relation itself gains
        /// optional dates at both ends. Most relations are implied by their kind (a son is one from
        /// birth), so a NULL year means "for as long as both were here", not year 0; the subtick and
        /// granularity beside it are the same pair every dated thing in this schema carries.
        /// </summary>
        private static void V13_CharacterRelations(MigrationDb db)
        {
            foreach (string end in new[] { "start", "end" })
            {
                AddCol(db, "character_relationships", $"{end}_year",        "INTEGER");
                AddCol(db, "character_relationships", $"{end}_subtick",     "INTEGER NOT NULL DEFAULT 0");
                AddCol(db, "character_relationships", $"{end}_granularity", "INTEGER NOT NULL DEFAULT 3");
            }

            // OR IGNORE, so a database that already carries one of these ids keeps the user's wording.
            db.Execute(@"
                INSERT OR IGNORE INTO relationship_types (id, name, type, a_to_b, b_to_a, one_way) VALUES
                    ('parent',  'Parent / child',   'family', 'parent of',  'child of',   0),
                    ('sibling', 'Siblings',         'family', 'sibling of', 'sibling of', 0),
                    ('spouse',  'Spouses',          'family', 'spouse of',  'spouse of',  0),
                    ('ally',    'Allies',           'social', 'ally of',    'ally of',    0),
                    ('rival',   'Rivals',           'social', 'rival of',   'rival of',   0),
                    ('mentor',  'Mentor / student', 'social', 'mentor of',  'student of', 0)");
        }

        // ── 14: relation vocabulary ──────────────────────────────────────────────

        /// <summary>
        /// The six kinds V13 seeded were a starting point; this is the vocabulary v1 offered, folded
        /// into pairs — "parent" carries "child of" as its reverse, so one row is one relation.
        ///
        /// Half of those words are gendered in English, so the kind carries up to three phrasings per
        /// direction and the character's own <c>gender</c> picks one: "mother of" / "father of" /
        /// "parent of". Gender is free text with a suggested list behind it, because a writer's world
        /// may not use ours — anything the reader does not recognise falls back to the neutral phrase,
        /// which is also what an unstated gender gets. NULL in a gendered column means the same thing:
        /// there is no gendered word for this kind (nobody is a "female cousin").
        /// </summary>
        private static void V14_RelationVocabulary(MigrationDb db)
        {
            AddCol(db, "characters", "gender", "TEXT");

            foreach (string col in new[] { "a_to_b_f", "a_to_b_m", "b_to_a_f", "b_to_a_m" })
                AddCol(db, "relationship_types", col, "TEXT");

            // OR IGNORE: a database that already carries one of these ids keeps the user's wording.
            db.Execute(@"
                INSERT OR IGNORE INTO relationship_types
                    (id, name, type, a_to_b, b_to_a, one_way, a_to_b_f, a_to_b_m, b_to_a_f, b_to_a_m)
                VALUES
                    ('parent',         'Parent / child',              'family', 'parent of',         'child of',          0, 'mother of',         'father of',         'daughter of',       'son of'),
                    ('sibling',        'Siblings',                    'family', 'sibling of',        'sibling of',        0, 'sister of',         'brother of',        'sister of',         'brother of'),
                    ('half-sibling',   'Half-siblings',               'family', 'half-sibling of',   'half-sibling of',   0, 'half-sister of',    'half-brother of',   'half-sister of',    'half-brother of'),
                    ('grandparent',    'Grandparent / grandchild',    'family', 'grandparent of',    'grandchild of',     0, 'grandmother of',    'grandfather of',    'granddaughter of',  'grandson of'),
                    ('aunt-uncle',     'Aunt or uncle / niece or nephew', 'family', 'aunt or uncle of', 'niece or nephew of', 0, 'aunt of',        'uncle of',          'niece of',          'nephew of'),
                    ('cousin',         'Cousins',                     'family', 'cousin of',         'cousin of',         0, NULL,                NULL,                NULL,                NULL),
                    ('spouse',         'Spouses',                     'family', 'spouse of',         'spouse of',         0, 'wife of',           'husband of',        'wife of',           'husband of'),
                    ('step-parent',    'Step-parent / step-child',    'family', 'step-parent of',    'step-child of',     0, 'step-mother of',    'step-father of',    'step-daughter of',  'step-son of'),
                    ('step-sibling',   'Step-siblings',               'family', 'step-sibling of',   'step-sibling of',   0, 'step-sister of',    'step-brother of',   'step-sister of',    'step-brother of'),
                    ('parent-in-law',  'Parent-in-law / child-in-law','family', 'parent-in-law of',  'child-in-law of',   0, 'mother-in-law of',  'father-in-law of',  'daughter-in-law of','son-in-law of'),
                    ('sibling-in-law', 'Siblings-in-law',             'family', 'sibling-in-law of', 'sibling-in-law of', 0, 'sister-in-law of',  'brother-in-law of', 'sister-in-law of',  'brother-in-law of'),
                    ('friend',         'Friends',                     'social', 'friend of',         'friend of',         0, NULL, NULL, NULL, NULL),
                    ('best-friend',    'Best friends',                'social', 'best friend of',    'best friend of',    0, NULL, NULL, NULL, NULL),
                    ('acquaintance',   'Acquaintances',               'social', 'acquaintance of',   'acquaintance of',   0, NULL, NULL, NULL, NULL),
                    ('colleague',      'Colleagues',                  'social', 'colleague of',      'colleague of',      0, NULL, NULL, NULL, NULL),
                    ('neighbor',       'Neighbors',                   'social', 'neighbor of',       'neighbor of',       0, NULL, NULL, NULL, NULL),
                    ('ally',           'Allies',                      'social', 'ally of',           'ally of',           0, NULL, NULL, NULL, NULL),
                    ('rival',          'Rivals',                      'social', 'rival of',          'rival of',          0, NULL, NULL, NULL, NULL),
                    ('enemy',          'Enemies',                     'social', 'enemy of',          'enemy of',          0, NULL, NULL, NULL, NULL),
                    ('mentor',         'Mentor / student',            'social', 'mentor of',         'student of',        0, NULL, NULL, NULL, NULL)");

            // The three V13 already inserted have no gendered wording yet. Only fill what is still
            // empty, so a user who reworded one of them in between keeps their version.
            db.Execute(@"
                UPDATE relationship_types SET a_to_b_f = 'mother of', a_to_b_m = 'father of',
                                              b_to_a_f = 'daughter of', b_to_a_m = 'son of'
                WHERE id = 'parent' AND a_to_b_f IS NULL");
            db.Execute(@"
                UPDATE relationship_types SET a_to_b_f = 'sister of', a_to_b_m = 'brother of',
                                              b_to_a_f = 'sister of', b_to_a_m = 'brother of'
                WHERE id = 'sibling' AND a_to_b_f IS NULL");
            db.Execute(@"
                UPDATE relationship_types SET a_to_b_f = 'wife of', a_to_b_m = 'husband of',
                                              b_to_a_f = 'wife of', b_to_a_m = 'husband of'
                WHERE id = 'spouse' AND a_to_b_f IS NULL");
        }

        // ── 15: open-ended ages and periods ──────────────────────────────────────

        /// <summary>
        /// BL-72: an age or period that runs off into the past or the future. The alternative was
        /// stretching the timeline out to a year nobody means, so this is a property of the item and
        /// not of its dates. Two flags rather than a direction enum — "open at both ends" is a real
        /// answer, and an enum would need four values to say the same thing.
        /// </summary>
        private static void V15_OpenEndedSpans(MigrationDb db)
        {
            AddCol(db, "items", "open_start", "INTEGER NOT NULL DEFAULT 0");
            AddCol(db, "items", "open_end",   "INTEGER NOT NULL DEFAULT 0");
        }

        // ── 18: the fade on an open-ended span ──────────────────────────────

        /// <summary>
        /// BL-72 follow-up. The arrowhead shipped with its fade welded on, which is the one part of
        /// the original ask that was meant to be a choice. It is a column rather than a layout
        /// setting because it is a fact about the span: "this age trails off" and "this age runs on
        /// at full strength, we simply have not dated its end" are different claims about the story,
        /// and two ages side by side can want different answers.
        ///
        /// Defaults to 0. The fade this flag turns on is not the one that shipped — that one
        /// dissolved the arrowhead to nothing, this one takes the bar itself to half and back over
        /// the first year — so there is no old appearance to preserve.
        /// </summary>
        private static void V18_OpenEndFade(MigrationDb db)
        {
            AddCol(db, "items", "open_fade", "INTEGER NOT NULL DEFAULT 0");
        }

        // ── 19: per-level tick distance ──────────────────────────────────────────

        /// <summary>
        /// BL-80. One tick distance served every zoom level, so a millennium of history got the same
        /// 100 pixels a day does. The frontend now reads an optional <c>tickDistance</c> off each LOD
        /// level — stored in the profile JSON, so there is no column to add — and this fills in the
        /// stock spread on the Gregorian profile every install already has: the coarse rungs wider, a
        /// week and a day tighter, the middle of the ladder left to inherit.
        ///
        /// Matched on the exact baseline string rather than rewritten level by level, so a profile
        /// anyone has edited is left alone. A fresh database is seeded with the baseline by step 1 and
        /// then updated here, which is why step 1 stays as it shipped.
        /// </summary>
        private static void V19_LodTickDistance(MigrationDb db)
        {
            db.Execute(
                "UPDATE lod_profiles SET profile = @New WHERE id = 'lod_default' AND profile = @Old",
                new { Old = LodDefaultBaseline, New = LodDefaultWithTickDistance });
        }

        /// <summary>The profile string step 1 seeds, character for character — the only one step 19 touches.</summary>
        private const string LodDefaultBaseline =
            "[{\"index\":0,\"formatKey\":\"MILLENNIA\",\"stepFraction\":1000},{\"index\":1,\"formatKey\":\"CENTURIES\",\"stepFraction\":100},{\"index\":2,\"formatKey\":\"DECADES\",\"stepFraction\":10},{\"index\":3,\"formatKey\":\"YEARS\",\"stepFraction\":1},{\"index\":4,\"formatKey\":\"SEASONS\",\"stepFraction\":0.25},{\"index\":5,\"formatKey\":\"MONTHS\",\"stepFraction\":0.08333333333},{\"index\":6,\"formatKey\":\"WEEKS\",\"stepFraction\":0.01923076923},{\"index\":7,\"formatKey\":\"DAYS\",\"stepFraction\":0.00273972602}]";

        /// <summary>The same ladder with the BL-80 defaults on the rungs that wanted them.</summary>
        private const string LodDefaultWithTickDistance =
            "[{\"index\":0,\"formatKey\":\"MILLENNIA\",\"stepFraction\":1000,\"tickDistance\":300},{\"index\":1,\"formatKey\":\"CENTURIES\",\"stepFraction\":100,\"tickDistance\":200},{\"index\":2,\"formatKey\":\"DECADES\",\"stepFraction\":10,\"tickDistance\":130},{\"index\":3,\"formatKey\":\"YEARS\",\"stepFraction\":1},{\"index\":4,\"formatKey\":\"SEASONS\",\"stepFraction\":0.25},{\"index\":5,\"formatKey\":\"MONTHS\",\"stepFraction\":0.08333333333},{\"index\":6,\"formatKey\":\"WEEKS\",\"stepFraction\":0.01923076923,\"tickDistance\":50},{\"index\":7,\"formatKey\":\"DAYS\",\"stepFraction\":0.00273972602,\"tickDistance\":50}]";

        // ── 16: shared characters, relation meaning and absolute dates ───────

        /// <summary>One timeline and the LOD profile its calendar points at, for the backfill below.</summary>
        private sealed class TimelineLod
        {
            public int TimelineId { get; set; }
            public string? Profile { get; set; }
        }

        /// <summary>
        /// <c>CASE &lt;column&gt; WHEN 0 THEN 1000.0 … ELSE 1.0 END</c> — a granularity index turned into the
        /// fraction of a year it steps by, built from one timeline's own profile. A level the profile
        /// does not list falls back to a whole year, which is what an unconverted row already meant.
        /// </summary>
        private static string StepCase(string? profileJson, string column)
        {
            var whens = new StringBuilder();
            try
            {
                using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(profileJson) ? "[]" : profileJson);
                foreach (var level in doc.RootElement.EnumerateArray())
                    whens.Append($" WHEN {level.GetProperty("index").GetInt32()} THEN ")
                         .Append(level.GetProperty("stepFraction").GetDouble().ToString("R", CultureInfo.InvariantCulture));
            }
            catch (Exception ex)
            {
                // A profile we cannot read is not worth failing an upgrade over: every level then
                // reads as a whole year, which is where these dates were before subticks existed.
                Logger.Warn("MainDbMigrations", $"V16: unreadable LOD profile, treating every level as a year. {ex.Message}");
            }
            // A CASE with no WHEN is a syntax error, and an empty profile means whole years anyway.
            return whens.Length == 0 ? "1.0" : $"CASE {column}{whens} ELSE 1.0 END";
        }

        /// <summary>
        /// BL-75. Three changes to the same two tables, so they share one step:
        ///
        ///  - <c>characters.shared</c>: a character every timeline's cast includes. <c>timeline_id</c>
        ///    stays put as where they came from, so unticking it puts them back.
        ///  - Characters and relations get the <c>absolute_*</c> pair items have carried since BL-02:
        ///    the year with the subtick multiplied out by its LOD step, so a lifeline and the birth
        ///    item it belongs to land on the same pixel. The subtick columns go — the editor derives
        ///    one back from the absolute and the granularity, which is the point of storing it.
        ///  - <c>custom_relationship_type</c> and <c>is_bidirectional</c> go: kinds have been rows in
        ///    <c>relationship_types</c> since V13, and a relation is stored once for the pair either way.
        ///
        /// The backfill reads each timeline's own profile rather than assuming ours, because a step
        /// fraction belongs to the calendar — a world with ten-month years has its own.
        /// </summary>
        private static void V16_CharacterMeaning(MigrationDb db)
        {
            AddCol(db, "characters", "shared", "INTEGER NOT NULL DEFAULT 0");
            foreach (string table in new[] { "characters", "character_relationships" })
            {
                AddCol(db, table, "absolute_start", "REAL");
                AddCol(db, table, "absolute_end",   "REAL");
            }

            string bY = Col(db, "characters", "birth_year"), bS = Col(db, "characters", "birth_subtick"),
                   dY = Col(db, "characters", "death_year"), dS = Col(db, "characters", "death_subtick"),
                   sY = Col(db, "character_relationships", "start_year"), sS = Col(db, "character_relationships", "start_subtick"),
                   eY = Col(db, "character_relationships", "end_year"),   eS = Col(db, "character_relationships", "end_subtick");

            foreach (var tl in db.Query<TimelineLod>(@"
                SELECT t.id AS TimelineId, p.profile AS Profile
                FROM timelines t
                JOIN calendars c     ON c.id = t.calendar_id
                JOIN lod_profiles p  ON p.id = c.lod_profile_id"))
            {
                db.Execute($@"
                    UPDATE characters SET
                        absolute_start = {bY} + {bS} * ({StepCase(tl.Profile, Col(db, "characters", "birth_granularity"))}),
                        absolute_end   = {dY} + {dS} * ({StepCase(tl.Profile, Col(db, "characters", "death_granularity"))})
                    WHERE timeline_id = @Id", new { Id = tl.TimelineId });

                db.Execute($@"
                    UPDATE character_relationships SET
                        absolute_start = {sY} + {sS} * ({StepCase(tl.Profile, Col(db, "character_relationships", "start_granularity"))}),
                        absolute_end   = {eY} + {eS} * ({StepCase(tl.Profile, Col(db, "character_relationships", "end_granularity"))})
                    WHERE timeline_id = @Id", new { Id = tl.TimelineId });
            }

            // Rows whose timeline has no calendar to look up, and relations that never belonged to
            // one: the year on its own is still the right answer to a subtick of nothing.
            db.Execute($@"
                UPDATE characters SET absolute_start = {bY} WHERE absolute_start IS NULL AND {bY} IS NOT NULL;
                UPDATE characters SET absolute_end   = {dY} WHERE absolute_end   IS NULL AND {dY} IS NOT NULL;
                UPDATE character_relationships SET absolute_start = {sY} WHERE absolute_start IS NULL AND {sY} IS NOT NULL;
                UPDATE character_relationships SET absolute_end   = {eY} WHERE absolute_end   IS NULL AND {eY} IS NOT NULL;");

            // Strength drives how thick an edge draws and how hard its spring pulls, so it needs a
            // number rather than a NULL: 50 is the middle, and what the column already defaults to.
            db.Execute("UPDATE character_relationships SET relationship_strength = 50 WHERE relationship_strength IS NULL");

            DropCol(db, "characters", "birth_subtick");
            DropCol(db, "characters", "death_subtick");
            DropCol(db, "character_relationships", "start_subtick");
            DropCol(db, "character_relationships", "end_subtick");
            DropCol(db, "character_relationships", "custom_relationship_type");
            DropCol(db, "character_relationships", "is_bidirectional");
        }

        /// <summary>
        /// Four columns, one of them used today.
        ///
        /// <c>characters.faction</c> is free text like <c>race</c> — a writer's allegiances are
        /// their own, and a lookup table would only be a list of words with ids bolted on. It
        /// groups the cast in the relations views.
        ///
        /// The three <c>*_location_id</c> columns are groundwork for BL-16 (the Map feature) and
        /// have no UI yet. They are TEXT because that is what a location id will be once locations
        /// exist; no foreign key, for the same reason — there is no table to point at. BL-16 owns
        /// deciding whether these stay as they are or become a junction, so nothing reads them
        /// until then and they cost one ALTER TABLE each to change course.
        /// </summary>
        private static void V17_FactionAndPlace(MigrationDb db)
        {
            AddCol(db, "characters", "faction", "TEXT");
            AddCol(db, "characters", "birth_location_id", "TEXT");
            AddCol(db, "characters", "death_location_id", "TEXT");
            AddCol(db, "items", "location_id", "TEXT");
        }
    }
}

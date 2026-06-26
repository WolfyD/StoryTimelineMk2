using Microsoft.Data.Sqlite;
using Dapper;

namespace StoryTimelineMk2.Database
{
    internal class DbInitializer
    {
        public static string GetConnectionString()
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Data");
            Directory.CreateDirectory(folder);
            return $"Data Source={Path.Combine(folder, "timeline.sqlite")}";
        }

        public static void Initialize()
        {
            using var db = new SqliteConnection(GetConnectionString());
            db.Open();

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
    
                    -- Original User Inputs
                    year INTEGER,
                    subtick INTEGER,
                    original_subtick INTEGER,
                    end_year INTEGER,
                    end_subtick INTEGER,
                    original_end_subtick INTEGER,
    
                    -- New: Precomputed Fractional Time for Canvas Math
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
    
                    -- New: Visibility Culling
                    min_lod_level INTEGER DEFAULT 3, -- 3 = 'YEARS' tier in the default profile
    
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
                    birth_subtick INTEGER,
                    birth_date TEXT,
                    birth_alternative_year TEXT,
                    death_year INTEGER,
                    death_subtick INTEGER,
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
                    timeline_lod_change_animation_length INTEGER NOT NULL
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
            ";

            db.Execute(createTablesSql);
            CreateIndexes(db);
            SeedDefaultData(db);
        }

        private static void CreateIndexes(SqliteConnection db)
        {
            db.Execute(@"
                CREATE INDEX IF NOT EXISTS idx_items_timeline_id ON items(timeline_id);
                CREATE INDEX IF NOT EXISTS idx_items_year_subtick ON items(year, subtick);
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
            ");
        }

        private static void SeedDefaultData(SqliteConnection db)
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
                            timeline_lod_change_animation_length
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
                            5,
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
                            '#fff',
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
                            200
                        );";

            db.Execute(insertSql);

        }
    }
}

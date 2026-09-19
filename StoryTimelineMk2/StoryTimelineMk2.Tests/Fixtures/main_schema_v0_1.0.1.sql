-- Frozen timeline.sqlite as written by Story Timeline 1.0.1 (schema version 0, before PRAGMA user_version).
-- Generated with python sqlite3 iterdump(); do not edit by hand. Used by SchemaMigratorTests.

CREATE TABLE book_stories (
                    book_id TEXT NOT NULL,
                    story_id TEXT NOT NULL,
                    PRIMARY KEY (book_id, story_id),
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
                );
CREATE TABLE books (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
CREATE TABLE calendars (
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
INSERT INTO "calendars" VALUES('cal_default_gregorian','Gregorian','Greg.','Western Calendar','BCE','CE','{ "length": 365, "week_definition": { "length": 7, "days_have_names": true, "days": [ "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" ], "days_have_short_names": true, "days_short": [ "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" ], "weekend": [ 5, 6 ] }, "seasons": 4, "season_definition": { "seasons_have_short_name": false, "0": { "name": "Spring", "start": 60, "end": 151 }, "1": { "name": "Summer", "start": 152, "end": 243, "significance": "hottest" }, "2": { "name": "Fall", "start": 244, "end": 334 }, "3": { "name": "Winter", "start": 335, "end": 59, "significance": "coldest" } }, "months": 12, "month_definition": { "months_have_short_name": true, "0": { "name": "January", "short_name": "Jan", "length": 31, "season": 3 }, "1": { "name": "February", "short_name": "Feb", "length": 28, "season": 3 }, "2": { "name": "March", "short_name": "Mar", "length": 31, "season": 0 }, "3": { "name": "April", "short_name": "Apr", "length": 30, "season": 0 }, "4": { "name": "May", "short_name": "May", "length": 31, "season": 0 }, "5": { "name": "June", "short_name": "Jun", "length": 30, "season": 1 }, "6": { "name": "July", "short_name": "Jul", "length": 31, "season": 1 }, "7": { "name": "August", "short_name": "Aug", "length": 31, "season": 1 }, "8": { "name": "September", "short_name": "Sept", "length": 30, "season": 2 }, "9": { "name": "October", "short_name": "Oct", "length": 31, "season": 2 }, "10": { "name": "November", "short_name": "Nov", "length": 30, "season": 2 }, "11": { "name": "December", "short_name": "Dec", "length": 31, "season": 3 } } }','lod_default');
CREATE TABLE chapters (
                    id TEXT PRIMARY KEY,
                    book_id TEXT NOT NULL,
                    number INTEGER NOT NULL,
                    title TEXT,
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
                );
CREATE TABLE character_relationships (
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
CREATE TABLE characters (
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
CREATE TABLE filter_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    rules_json TEXT NOT NULL DEFAULT '[]',
                    and_mode INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
CREATE TABLE item_chapters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    chapter_id TEXT NOT NULL,
                    UNIQUE (item_id, chapter_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
                );
CREATE TABLE item_character_appearances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    character_id TEXT NOT NULL,
                    role TEXT,
                    UNIQUE (item_id, character_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
                );
CREATE TABLE item_characters (
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
CREATE TABLE item_pictures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    picture_id TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (picture_id) REFERENCES pictures(id) ON DELETE CASCADE,
                    UNIQUE(item_id, picture_id)
                );
CREATE TABLE item_story_refs (
                    item_id TEXT NOT NULL,
                    story_id TEXT NOT NULL,
                    PRIMARY KEY (item_id, story_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
                );
CREATE TABLE item_tags (
                    item_id TEXT,
                    tag_id INTEGER,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (item_id, tag_id)
                );
CREATE TABLE item_types (
                    id INTEGER PRIMARY KEY,
                    name TEXT UNIQUE,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
INSERT INTO "item_types" VALUES(1,'Event','A specific point in time','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(2,'Period','A span of time','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(3,'Age','A significant era or period','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(4,'Picture','An image or visual record','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(5,'Note','A text note or annotation','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(6,'Bookmark','A marked point of interest','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(7,'Character','A person or entity','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(8,'Timeline_start','The start point of the timeline','2026-09-18 23:06:43');
INSERT INTO "item_types" VALUES(9,'Timeline_end','The end point of the timeline','2026-09-18 23:06:43');
CREATE TABLE items (
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
CREATE TABLE layout_settings (
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
                , timeline_tick_color TEXT NOT NULL DEFAULT '#c8b9a4', timeline_axis_color TEXT NOT NULL DEFAULT '#b5a692', notes_panel_background_color TEXT NOT NULL DEFAULT '#0f172a', notes_panel_card_background_color TEXT NOT NULL DEFAULT '#1e293b', notes_panel_text_color TEXT NOT NULL DEFAULT '#e2e8f0', notes_panel_heading_color TEXT NOT NULL DEFAULT '#94a3b8', notes_panel_accent_color TEXT NOT NULL DEFAULT '#6366f1', notes_panel_font_size INTEGER NOT NULL DEFAULT 13, data_panel_background_color TEXT NOT NULL DEFAULT '#f5f0e8', data_panel_card_background_color TEXT NOT NULL DEFAULT '#ffffffaa', data_panel_h1_color TEXT NOT NULL DEFAULT '#2c1f0f', data_panel_h2_color TEXT NOT NULL DEFAULT '#3a2b1a', data_panel_h3_color TEXT NOT NULL DEFAULT '#2c1f0f', data_panel_h4_color TEXT NOT NULL DEFAULT '#5c4a38', data_panel_font_family TEXT NOT NULL DEFAULT 'Georgia, serif', data_panel_font_size INTEGER NOT NULL DEFAULT 14, gallery_panel_background_color TEXT NOT NULL DEFAULT '#0f172a', gallery_panel_border_color TEXT NOT NULL DEFAULT '#1e293b', gallery_panel_text_color TEXT NOT NULL DEFAULT '#94a3b8', calendar_panel_background_color TEXT NOT NULL DEFAULT '#f5f0e8', calendar_panel_border_color TEXT NOT NULL DEFAULT '#d5cec4', calendar_panel_text_color TEXT NOT NULL DEFAULT '#5c4a38', calendar_panel_week_highlight_color TEXT NOT NULL DEFAULT '#6366f118', calendar_panel_day_highlight_color TEXT NOT NULL DEFAULT '#6366f135');
INSERT INTO "layout_settings" VALUES('ls_default','Default layout settings',130,30,10,'#44A8',1,3,'10',5,'#000','#fff','Arial',16,1,1,0,1,'#33f',30,0,15,10,20,30,1,100,1,'#f1e7d5',1,1,'#f00','dashed',100,1,1,'Arial','normal','#2a1a0e',14,0,1,'#f00','solid',1,10,100,1,'#ff72',1,600,1,200,0,'#ffffff0a','#ffffff08','#ffffff06','#ffffff05','#1a2a3c12','#1a2a3c7d','#0077aa','#c8b9a4','#b5a692','#f9f7fe','#e8e4f5','#1e1640','#5b4d8a','#6366f1',13,'#f5f0e8','#ffffffaa','#2c1f0f','#3a2b1a','#2c1f0f','#5c4a38','Georgia, serif',14,'#f5f0e8','#d5cec4','#5c4a38','#f5f0e8','#d5cec4','#5c4a38','#6366f118','#6366f135');
INSERT INTO "layout_settings" VALUES('ls_dark','Dark Mode',130,30,10,'#2d3a56',1,3,'10',5,'#e2e8f0','#141e33','Arial',16,1,1,0,1,'#3b6ec4',30,0,15,10,20,30,1,100,1,'#0f172a',1,1,'#ef4444','dashed',100,1,1,'Arial','normal','#94a3b8',14,0,1,'#3b6ec4','solid',1,10,100,1,'#3b6ec44d',1,600,1,200,0,'#ffffff10','#ffffff0c','#ffffff08','#ffffff06','#b4c8ff0d','#78a0dc88','#00d4ff','#334155','#1e2b44','#0f172a','#1e293b','#e2e8f0','#94a3b8','#6366f1',13,'#0f172a','#1e293b44','#e2e8f0','#cbd5e1','#94a3b8','#64748b','Georgia, serif',14,'#0f172a','#1e293b','#94a3b8','#0f172a','#1e293b','#94a3b8','#818cf818','#818cf835');
CREATE TABLE lod_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    profile TEXT NOT NULL
                );
INSERT INTO "lod_profiles" VALUES('lod_default','Standard Gregorian Scale','[{"index":0,"formatKey":"MILLENNIA","stepFraction":1000},{"index":1,"formatKey":"CENTURIES","stepFraction":100},{"index":2,"formatKey":"DECADES","stepFraction":10},{"index":3,"formatKey":"YEARS","stepFraction":1},{"index":4,"formatKey":"SEASONS","stepFraction":0.25},{"index":5,"formatKey":"MONTHS","stepFraction":0.08333333333},{"index":6,"formatKey":"WEEKS","stepFraction":0.01923076923},{"index":7,"formatKey":"DAYS","stepFraction":0.00273972602}]');
CREATE TABLE misc_settings (
                    key TEXT NOT NULL,
                    timeline_id INTEGER NOT NULL DEFAULT 0,
                    value TEXT,
                    PRIMARY KEY (key, timeline_id)
                );
CREATE TABLE notes (
                    id TEXT PRIMARY KEY,
                    note_contents TEXT,
                    timeline_id INTEGER,
                    connected_item_id INTEGER,
                    nearest_year INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, absolute_time REAL NOT NULL DEFAULT 0,
                    FOREIGN KEY (connected_item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );
CREATE TABLE pictures (
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
CREATE TABLE relationship_types (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT,
                    a_to_b TEXT,
                    b_to_a TEXT,
                    one_way INTEGER
                );
CREATE TABLE settings (
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
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, window_maximized INTEGER DEFAULT 0, timeline_minimised INTEGER DEFAULT 0, year_calendar_position_x INTEGER DEFAULT 0, year_calendar_position_y INTEGER DEFAULT 0, year_calendar_size_x INTEGER DEFAULT 0, year_calendar_size_y INTEGER DEFAULT 0, pan_speed_multiplier REAL DEFAULT 5.0, pan_deadzone INTEGER DEFAULT 100, default_item_color TEXT DEFAULT '#000000',
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );
CREATE TABLE stories (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
CREATE TABLE tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
CREATE TABLE timeline_calendars (
                    id TEXT PRIMARY KEY,
                    calendar_id TEXT NOT NULL,
                    timeline_id INTEGER, 
                    year_0_at_default INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (calendar_id) REFERENCES calendars(id),
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );
CREATE TABLE timeline_filter_rules (
                    id TEXT PRIMARY KEY,
                    timeline_id INTEGER NOT NULL,
                    dimension TEXT NOT NULL,
                    params_json TEXT NOT NULL DEFAULT '{}',
                    label TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'neutral',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );
CREATE TABLE timeline_hidden_ranges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timeline_id INTEGER NOT NULL,
                    start_year INTEGER NOT NULL,
                    end_year INTEGER NOT NULL,
                    label TEXT,
                    FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
                );
CREATE TABLE timelines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    description TEXT,
                    start_year INTEGER DEFAULT 0,
                    calendar_id TEXT NOT NULL DEFAULT 'cal_default_gregorian',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    layout_settings_id TEXT NOT NULL DEFAULT 'ls_default', layout_settings_locked INTEGER NOT NULL DEFAULT 0, color TEXT DEFAULT NULL,
                    FOREIGN KEY (calendar_id) REFERENCES calendars(id),
                    FOREIGN KEY (layout_settings_id) REFERENCES layout_settings(id),
                    UNIQUE(title, author)
                );
CREATE INDEX idx_items_timeline_id ON items(timeline_id);
CREATE INDEX idx_items_year ON items(year);
CREATE INDEX idx_item_pictures_combined ON item_pictures(item_id, picture_id);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_char_rel_char1 ON character_relationships(character_1_id);
CREATE INDEX idx_char_rel_char2 ON character_relationships(character_2_id);
CREATE INDEX idx_char_rel_timeline ON character_relationships(timeline_id);
CREATE INDEX idx_item_story_refs_item ON item_story_refs(item_id);
CREATE INDEX idx_item_story_refs_story ON item_story_refs(story_id);
CREATE INDEX idx_chapters_book ON chapters(book_id);
CREATE INDEX idx_item_chapters_item ON item_chapters(item_id);
CREATE INDEX idx_item_chapters_chapter ON item_chapters(chapter_id);
CREATE INDEX idx_item_char_app_item ON item_character_appearances(item_id);
CREATE INDEX idx_item_char_app_char ON item_character_appearances(character_id);
CREATE INDEX idx_hidden_ranges_timeline ON timeline_hidden_ranges(timeline_id);
CREATE INDEX idx_settings_timeline_id ON settings(timeline_id);
CREATE INDEX idx_characters_timeline_id ON characters(timeline_id);
CREATE INDEX idx_notes_timeline_id ON notes(timeline_id);
CREATE INDEX idx_filter_rules_timeline ON timeline_filter_rules(timeline_id);
CREATE INDEX idx_misc_settings_key ON misc_settings(key);
DELETE FROM "sqlite_sequence";

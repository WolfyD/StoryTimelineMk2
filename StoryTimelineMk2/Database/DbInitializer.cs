using Microsoft.Data.Sqlite;
using Dapper;
using StoryTimelineMk2.Database.Migrations;

namespace StoryTimelineMk2.Database
{
    internal class DbInitializer
    {
        public static string GetConnectionString()
        {
            string dataRoot = AppConfig.Instance.DataRoot;
            Directory.CreateDirectory(dataRoot);
            return AppConfig.Instance.GetConnectionString();
        }

        /// <summary>Brings the live timeline.sqlite up to the current schema, snapshotting it first if it is out of date.</summary>
        public static void Initialize()
        {
            Directory.CreateDirectory(AppConfig.Instance.DataRoot);
            Initialize(AppConfig.Instance.GetDbPath(), backupFirst: true);
        }

        /// <summary>
        /// Creates or migrates the database at <paramref name="dbPath"/> (see <see cref="MainDbMigrations"/>).
        /// With <paramref name="backupFirst"/>, an existing database that needs migrating is copied to the
        /// backups folder and the copy verified before any step runs. Every failure — including a file
        /// written by a newer app version — is a <see cref="MigrationException"/> describing what happened.
        /// </summary>
        public static void Initialize(string dbPath, bool backupFirst, string dbLabel = "timeline")
        {
            using var db = new SqliteConnection($"Data Source={dbPath}");
            db.Open();
            SchemaMigrator.Migrate(db, dbPath, MainDbMigrations.Steps, dbLabel, backupFirst);
        }

        public static void ResetBuiltinPreset(string id)
        {
            if (id != "ls_default" && id != "ls_dark") return;
            using var db = new SqliteConnection(GetConnectionString());
            db.Open();
            // UPDATE instead of DELETE+INSERT to avoid FK constraint failures
            // (timelines may reference these preset ids)
            if (id == "ls_default") UpdateDefaultValues(db);
            else UpdateDarkValues(db);
        }

        private static void UpdateDefaultValues(SqliteConnection db)
        {
            db.Execute(@"UPDATE layout_settings SET
                    name = 'Default layout settings',
                    timeline_event_box_width = 130, timeline_event_box_height = 30, timeline_event_box_stem_offset = 10,
                    timeline_event_border_color = '#44A8', timeline_event_border_width = 1, timeline_event_border_radius = 3,
                    timeline_event_padding = '10', timeline_event_y_margin = 5,
                    timeline_event_text_color = '#000', timeline_event_background_color = '#fff',
                    timeline_event_font_family = 'Arial', timeline_event_font_size = 16,
                    timeline_event_text_use_ellipsis = 1, timeline_event_box_show_color = 1,
                    timeline_event_box_show_color_on_bottom = 0, timeline_event_has_hover_highlight = 1,
                    timeline_event_hover_color = '#33f',
                    timeline_age_height = 30, timeline_age_corner_rounding = 0,
                    timeline_period_height = 15, timeline_period_corner_rounding = 10,
                    timeline_period_y_margin = 20, timeline_period_y_offset = 30,
                    timeline_box_types_show_as_box = 1, timeline_box_types_box_width = 100, timeline_box_types_show_image = 1,
                    timeline_canvas_background_color = '#f1e7d5',
                    timeline_show_now_line = 1, timeline_show_now_line_text = 1,
                    timeline_now_line_color = '#f00', timeline_now_line_style = 'dashed',
                    timeline_tick_distance = 100, timeline_tick_width = 1, timeline_non_year_ticks_smaller = 1,
                    timeline_tick_marker_font_family = 'Arial', timeline_tick_marker_font_style = 'normal',
                    timeline_tick_marker_text_color = '#2a1a0e', timeline_tick_marker_font_size = 14,
                    timeline_tick_marker_text_always_on_top = 0,
                    timeline_show_hover_line = 1,
                    timeline_hover_line_color = '#f00', timeline_hover_line_style = 'solid', timeline_hover_line_width = 1,
                    timeline_edge_margin_width = 10,
                    timeline_data_range_width = 100, timeline_is_data_range_visible = 1, timeline_data_range_color = '#ff72',
                    timeline_animate_on_jump_to_year = 1, timeline_jump_to_year_animation_length = 600,
                    timeline_animate_lod_change = 1, timeline_lod_change_animation_length = 200,
                    timeline_tick_color = '#c8b9a4', timeline_axis_color = '#b5a692',
                    notes_panel_background_color = '#f9f7fe', notes_panel_card_background_color = '#e8e4f5',
                    notes_panel_text_color = '#1e1640', notes_panel_heading_color = '#5b4d8a',
                    notes_panel_accent_color = '#6366f1', notes_panel_font_size = 13,
                    data_panel_background_color = '#f5f0e8', data_panel_card_background_color = '#ffffffaa',
                    data_panel_h1_color = '#2c1f0f', data_panel_h2_color = '#3a2b1a',
                    data_panel_h3_color = '#2c1f0f', data_panel_h4_color = '#5c4a38',
                    data_panel_font_family = 'Georgia, serif', data_panel_font_size = 14,
                    gallery_panel_background_color = '#f5f0e8', gallery_panel_border_color = '#d5cec4',
                    gallery_panel_text_color = '#5c4a38',
                    calendar_panel_background_color = '#f5f0e8', calendar_panel_border_color = '#d5cec4',
                    calendar_panel_text_color = '#5c4a38',
                    calendar_panel_week_highlight_color = '#6366f118', calendar_panel_day_highlight_color = '#6366f135',
                    timeline_calendar_overlay_enabled = 0,
                    timeline_calendar_overlay_season_color = '#ffffff0a', timeline_calendar_overlay_month_color = '#ffffff08',
                    timeline_calendar_overlay_week_color = '#ffffff06', timeline_calendar_overlay_day_color = '#ffffff05',
                    timeline_break_fill_color = '#1a2a3c12', timeline_break_border_color = '#1a2a3c7d',
                    timeline_measure_line_color = '#0077aa'
                WHERE id = 'ls_default';");
        }

        private static void UpdateDarkValues(SqliteConnection db)
        {
            db.Execute(@"UPDATE layout_settings SET
                    name = 'Dark Mode',
                    timeline_event_box_width = 130, timeline_event_box_height = 30, timeline_event_box_stem_offset = 10,
                    timeline_event_border_color = '#2d3a56', timeline_event_border_width = 1, timeline_event_border_radius = 3,
                    timeline_event_padding = '10', timeline_event_y_margin = 5,
                    timeline_event_text_color = '#e2e8f0', timeline_event_background_color = '#141e33',
                    timeline_event_font_family = 'Arial', timeline_event_font_size = 16,
                    timeline_event_text_use_ellipsis = 1, timeline_event_box_show_color = 1,
                    timeline_event_box_show_color_on_bottom = 0, timeline_event_has_hover_highlight = 1,
                    timeline_event_hover_color = '#3b6ec4',
                    timeline_age_height = 30, timeline_age_corner_rounding = 0,
                    timeline_period_height = 15, timeline_period_corner_rounding = 10,
                    timeline_period_y_margin = 20, timeline_period_y_offset = 30,
                    timeline_box_types_show_as_box = 1, timeline_box_types_box_width = 100, timeline_box_types_show_image = 1,
                    timeline_canvas_background_color = '#0f172a',
                    timeline_show_now_line = 1, timeline_show_now_line_text = 1,
                    timeline_now_line_color = '#ef4444', timeline_now_line_style = 'dashed',
                    timeline_tick_distance = 100, timeline_tick_width = 1, timeline_non_year_ticks_smaller = 1,
                    timeline_tick_marker_font_family = 'Arial', timeline_tick_marker_font_style = 'normal',
                    timeline_tick_marker_text_color = '#94a3b8', timeline_tick_marker_font_size = 14,
                    timeline_tick_marker_text_always_on_top = 0,
                    timeline_show_hover_line = 1,
                    timeline_hover_line_color = '#3b6ec4', timeline_hover_line_style = 'solid', timeline_hover_line_width = 1,
                    timeline_edge_margin_width = 10,
                    timeline_data_range_width = 100, timeline_is_data_range_visible = 1, timeline_data_range_color = '#3b6ec44d',
                    timeline_animate_on_jump_to_year = 1, timeline_jump_to_year_animation_length = 600,
                    timeline_animate_lod_change = 1, timeline_lod_change_animation_length = 200,
                    timeline_tick_color = '#334155', timeline_axis_color = '#1e2b44',
                    notes_panel_background_color = '#0f172a', notes_panel_card_background_color = '#1e293b',
                    notes_panel_text_color = '#e2e8f0', notes_panel_heading_color = '#94a3b8',
                    notes_panel_accent_color = '#6366f1', notes_panel_font_size = 13,
                    data_panel_background_color = '#0f172a', data_panel_card_background_color = '#1e293b44',
                    data_panel_h1_color = '#e2e8f0', data_panel_h2_color = '#cbd5e1',
                    data_panel_h3_color = '#94a3b8', data_panel_h4_color = '#64748b',
                    data_panel_font_family = 'Georgia, serif', data_panel_font_size = 14,
                    gallery_panel_background_color = '#0f172a', gallery_panel_border_color = '#1e293b',
                    gallery_panel_text_color = '#94a3b8',
                    calendar_panel_background_color = '#0f172a', calendar_panel_border_color = '#1e293b',
                    calendar_panel_text_color = '#94a3b8',
                    calendar_panel_week_highlight_color = '#818cf818', calendar_panel_day_highlight_color = '#818cf835',
                    timeline_calendar_overlay_enabled = 0,
                    timeline_calendar_overlay_season_color = '#ffffff10', timeline_calendar_overlay_month_color = '#ffffff0c',
                    timeline_calendar_overlay_week_color = '#ffffff08', timeline_calendar_overlay_day_color = '#ffffff06',
                    timeline_break_fill_color = '#b4c8ff0d', timeline_break_border_color = '#78a0dc88',
                    timeline_measure_line_color = '#00d4ff'
                WHERE id = 'ls_dark';");
        }
    }
}
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class SettingsRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public SettingsRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public SettingsItem GetTimelineSettings(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.QueryFirst<SettingsItem>("SELECT * FROM settings WHERE timeline_id = @TimelineId LIMIT 1;", new { TimelineId = timelineId });
        }

        public void SaveSettings(SettingsItem settings)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO settings (id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css, use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y, window_position_x, window_position_y, use_custom_scaling, custom_scale, display_radius, canvas_settings, updated_at) 
                VALUES (@Id, @TimelineId, @Font, @FontSizeScale, @PixelsPerSubtick, @CustomCss, @UseCustomCss, @IsFullscreen, @ShowGuides, @WindowSizeX, @WindowSizeY, @WindowPositionX, @WindowPositionY, @UseCustomScaling, @CustomScale, @DisplayRadius, @CanvasSettings, @UpdatedAt)
                ON CONFLICT(id) DO UPDATE SET 
                    timeline_id         = excluded.timeline_id
                    font                = excluded.font
                    font_size_scale     = excluded.font_size_scale
                    pixels_per_subtick  = excluded.pixels_per_subtick
                    custom_css          = excluded.custom_css
                    use_custom_css      = excluded.use_custom_css
                    is_fullscreen       = excluded.is_fullscreen
                    show_guides         = excluded.show_guides
                    window_size_x       = excluded.window_size_x
                    window_size_y       = excluded.window_size_y
                    window_position_x   = excluded.window_position_x
                    window_position_y   = excluded.window_position_y
                    use_custom_scaling  = excluded.use_custom_scaling
                    custom_scale        = excluded.custom_scale
                    display_radius      = excluded.display_radius
                    canvas_settings     = excluded.canvas_settings
                    updated_at          = CURRENT_TIMESTAMP;";

            db.Execute(sql, settings);
        }

        public void DeleteSettings(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM settings WHERE id = @Id", new { Id = id });
        }
    }
}

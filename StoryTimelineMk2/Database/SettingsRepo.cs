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

        public SettingsItem GetOrCreateSettings(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            var settings = db.QueryFirstOrDefault<SettingsItem>(
                "SELECT * FROM settings WHERE timeline_id = @TimelineId LIMIT 1;",
                new { TimelineId = timelineId });

            if (settings == null)
            {
                settings = new SettingsItem
                {
                    TimelineId = timelineId,
                    PixelsPerSubtick = 20,
                    IsFullscreen = false,
                    ShowGuides = true,
                    WindowSizeX = 1000,
                    WindowSizeY = 700,
                    WindowPositionX = 300,
                    WindowPositionY = 100,
                    UseCustomScaling = false,
                    CustomScale = 1.0f,
                    DisplayRadius = 10,
                    CanvasSettings = "{}"
                };

                db.Execute(@"
                    INSERT INTO settings
                        (timeline_id, pixels_per_subtick,
                         is_fullscreen, show_guides, window_size_x, window_size_y,
                         window_position_x, window_position_y, use_custom_scaling, custom_scale,
                         display_radius, canvas_settings, pan_speed_multiplier, pan_deadzone, updated_at)
                    VALUES
                        (@TimelineId, @PixelsPerSubtick,
                         @IsFullscreen, @ShowGuides, @WindowSizeX, @WindowSizeY,
                         @WindowPositionX, @WindowPositionY, @UseCustomScaling, @CustomScale,
                         @DisplayRadius, @CanvasSettings, @PanSpeedMultiplier, @PanDeadzone, CURRENT_TIMESTAMP);",
                    settings);
            }

            return settings;
        }

        // Kept for call-sites that already use this name; delegates to GetOrCreateSettings.
        public SettingsItem GetTimelineSettings(int timelineId) => GetOrCreateSettings(timelineId);

        public void SaveSettings(SettingsItem settings)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                UPDATE settings SET
                    pixels_per_subtick  = @PixelsPerSubtick,
                    is_fullscreen       = @IsFullscreen,
                    show_guides         = @ShowGuides,
                    window_size_x       = @WindowSizeX,
                    window_size_y       = @WindowSizeY,
                    window_position_x   = @WindowPositionX,
                    window_position_y   = @WindowPositionY,
                    use_custom_scaling  = @UseCustomScaling,
                    custom_scale        = @CustomScale,
                    display_radius      = @DisplayRadius,
                    canvas_settings      = @CanvasSettings,
                    timeline_minimised   = @TimelineMinimised,
                    pan_speed_multiplier = @PanSpeedMultiplier,
                    pan_deadzone         = @PanDeadzone,
                    updated_at           = CURRENT_TIMESTAMP
                WHERE timeline_id = @TimelineId;",
                settings);
        }

        public void SaveWindowState(int timelineId, int x, int y, int width, int height)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                UPDATE settings SET
                    window_position_x = @X,
                    window_position_y = @Y,
                    window_size_x     = @Width,
                    window_size_y     = @Height,
                    updated_at        = CURRENT_TIMESTAMP
                WHERE timeline_id = @TimelineId;",
                new { TimelineId = timelineId, X = x, Y = y, Width = width, Height = height });
        }

        public void SaveYearCalendarWindowState(int timelineId, int x, int y, int width, int height)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                UPDATE settings SET
                    year_calendar_position_x = @X,
                    year_calendar_position_y = @Y,
                    year_calendar_size_x     = @Width,
                    year_calendar_size_y     = @Height,
                    updated_at               = CURRENT_TIMESTAMP
                WHERE timeline_id = @TimelineId;",
                new { TimelineId = timelineId, X = x, Y = y, Width = width, Height = height });
        }

        // --- App-level (no timeline) settings, stored with timeline_id = NULL ---

        public SettingsItem GetOrCreateAppSettings()
        {
            using var db = new SqliteConnection(_connString);
            var settings = db.QueryFirstOrDefault<SettingsItem>(
                "SELECT * FROM settings WHERE timeline_id IS NULL LIMIT 1;");

            if (settings == null)
            {
                settings = new SettingsItem
                {
                    PixelsPerSubtick = 20,
                    WindowSizeX = 1000,
                    WindowSizeY = 700,
                    WindowPositionX = 300,
                    WindowPositionY = 100,
                    CustomScale = 1.0f,
                    DisplayRadius = 10,
                    CanvasSettings = "{}"
                };

                db.Execute(@"
                    INSERT INTO settings
                        (pixels_per_subtick,
                         is_fullscreen, show_guides, window_size_x, window_size_y,
                         window_position_x, window_position_y, use_custom_scaling, custom_scale,
                         display_radius, canvas_settings, updated_at)
                    VALUES
                        (@PixelsPerSubtick,
                         @IsFullscreen, @ShowGuides, @WindowSizeX, @WindowSizeY,
                         @WindowPositionX, @WindowPositionY, @UseCustomScaling, @CustomScale,
                         @DisplayRadius, @CanvasSettings, CURRENT_TIMESTAMP);",
                    settings);
            }

            return settings;
        }

        public void SaveAppWindowState(int x, int y, int width, int height, bool maximized = false)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                UPDATE settings SET
                    window_position_x = @X,
                    window_position_y = @Y,
                    window_size_x     = @Width,
                    window_size_y     = @Height,
                    window_maximized  = @Maximized,
                    updated_at        = CURRENT_TIMESTAMP
                WHERE timeline_id IS NULL;",
                new { X = x, Y = y, Width = width, Height = height, Maximized = maximized });
        }

        public void DeleteSettings(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM settings WHERE id = @Id", new { Id = id });
        }
    }
}

using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class LayoutSettingsRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public LayoutSettingsRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public bool CheckIfLayoutNameExists(string name)
        {
            using var db = new SqliteConnection(_connString);

            var count = db.QuerySingle<int>("SELECT COUNT(*) FROM layout_settings WHERE name = @Name;", new { Name = name });

            return count > 0;
        }

        public IEnumerable<LayoutSettingsItem> GetAll()
        {
            using var db = new SqliteConnection(_connString);

            return db.Query<LayoutSettingsItem>("SELECT * FROM layout_settings ORDER BY name;");}

        public LayoutSettingsItem GetById(string id)
        {
            using var db = new SqliteConnection(_connString);

            return db.QueryFirst<LayoutSettingsItem>("SELECT * FROM layout_settings WHERE id = @Id LIMIT 1;", new { Id = id });
        }

        public void SaveLayoutSettings(LayoutSettingsItem settings)
        {
            using var db = new SqliteConnection(_connString);

            string sql = @"
                INSERT INTO layout_settings (
                    id,
                    name,

                    -- Event related
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

                    -- Age and period related
                    timeline_age_height,
                    timeline_age_corner_rounding,
                    timeline_period_height,
                    timeline_period_corner_rounding,
                    timeline_period_y_margin,
                    timeline_period_y_offset,

                    -- Box types
                    timeline_box_types_show_as_box,
                    timeline_box_types_box_width,
                    timeline_box_types_show_image,

                    -- Timeline misc
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
                )
                VALUES (
                    @Id,
                    @Name,

                    @TimelineEventBoxWidth,
                    @TimelineEventBoxHeight,
                    @TimelineEventBoxStemOffset,
                    @TimelineEventBorderColor,
                    @TimelineEventBorderWidth,
                    @TimelineEventBorderRadius,
                    @TimelineEventPaddingJsonArray,
                    @TimelineEventYMargin,
                    @TimelineEventTextColor,
                    @TimelineEventBackgroundColor,
                    @TimelineEventFontFamily,
                    @TimelineEventFontSize,
                    @TimelineEventTextUseEllipsis,
                    @TimelineEventBoxShowColor,
                    @TimelineEventBoxShowColorOnBottom,
                    @TimelineEventHasHoverHighlight,
                    @TimelineEventHoverColor,

                    @TimelineAgeHeight,
                    @TimelineAgeCornerRounding,
                    @TimelinePeriodHeight,
                    @TimelinePeriodCornerRounding,
                    @TimelinePeriodYMargin,
                    @TimelinePeriodYOffset,

                    @TimelineBoxTypesShowAsBox,
                    @TimelineBoxTypesBoxWidth,
                    @TimelineBoxTypesShowImage,

                    @TimelineCanvasBackgroundColor,
                    @TimelineShowNowLine,
                    @TimelineShowNowLineText,
                    @TimelineNowLineColor,
                    @TimelineNowLineStyle,

                    @TimelineTickDistance,
                    @TimelineTickWidth,
                    @TimelineNonYearTicksSmaller,

                    @TimelineTickMarkerFontFamily,
                    @TimelineTickMarkerFontStyle,
                    @TimelineTickMarkerTextColor,
                    @TimelineTickMarkerFontSize,
                    @TimelineTickMarkerTextAlwaysOnTop,

                    @TimelineShowHoverLine,
                    @TimelineHoverLineColor,
                    @TimelineHoverLineStyle,
                    @TimelineHoverLineWidth,

                    @TimelineEdgeMarginWidth,

                    @TimelineDataRangeWidth,
                    @TimelineIsDataRangeVisible,
                    @TimelineDataRangeColor,

                    @TimelineAnimateOnJumpToYear,
                    @TimelineJumpToYearAnimationLength,

                    @TimelineAnimateLodChange,
                    @TimelineLodChangeAnimationLengthIntegerNotNull
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,

                    timeline_event_box_width = excluded.timeline_event_box_width,
                    timeline_event_box_height = excluded.timeline_event_box_height,
                    timeline_event_box_stem_offset = excluded.timeline_event_box_stem_offset,
                    timeline_event_border_color = excluded.timeline_event_border_color,
                    timeline_event_border_width = excluded.timeline_event_border_width,
                    timeline_event_border_radius = excluded.timeline_event_border_radius,
                    timeline_event_padding = excluded.timeline_event_padding,
                    timeline_event_y_margin = excluded.timeline_event_y_margin,
                    timeline_event_text_color = excluded.timeline_event_text_color,
                    timeline_event_background_color = excluded.timeline_event_background_color,
                    timeline_event_font_family = excluded.timeline_event_font_family,
                    timeline_event_font_size = excluded.timeline_event_font_size,
                    timeline_event_text_use_ellipsis = excluded.timeline_event_text_use_ellipsis,
                    timeline_event_box_show_color = excluded.timeline_event_box_show_color,
                    timeline_event_box_show_color_on_bottom = excluded.timeline_event_box_show_color_on_bottom,
                    timeline_event_has_hover_highlight = excluded.timeline_event_has_hover_highlight,
                    timeline_event_hover_color = excluded.timeline_event_hover_color,

                    timeline_age_height = excluded.timeline_age_height,
                    timeline_age_corner_rounding = excluded.timeline_age_corner_rounding,
                    timeline_period_height = excluded.timeline_period_height,
                    timeline_period_corner_rounding = excluded.timeline_period_corner_rounding,
                    timeline_period_y_margin = excluded.timeline_period_y_margin,
                    timeline_period_y_offset = excluded.timeline_period_y_offset,

                    timeline_box_types_show_as_box = excluded.timeline_box_types_show_as_box,
                    timeline_box_types_box_width = excluded.timeline_box_types_box_width,
                    timeline_box_types_show_image = excluded.timeline_box_types_show_image,

                    timeline_canvas_background_color = excluded.timeline_canvas_background_color,
                    timeline_show_now_line = excluded.timeline_show_now_line,
                    timeline_show_now_line_text = excluded.timeline_show_now_line_text,
                    timeline_now_line_color = excluded.timeline_now_line_color,
                    timeline_now_line_style = excluded.timeline_now_line_style,

                    timeline_tick_distance = excluded.timeline_tick_distance,
                    timeline_tick_width = excluded.timeline_tick_width,
                    timeline_non_year_ticks_smaller = excluded.timeline_non_year_ticks_smaller,

                    timeline_tick_marker_font_family = excluded.timeline_tick_marker_font_family,
                    timeline_tick_marker_font_style = excluded.timeline_tick_marker_font_style,
                    timeline_tick_marker_text_color = excluded.timeline_tick_marker_text_color,
                    timeline_tick_marker_font_size = excluded.timeline_tick_marker_font_size,
                    timeline_tick_marker_text_always_on_top = excluded.timeline_tick_marker_text_always_on_top,

                    timeline_show_hover_line = excluded.timeline_show_hover_line,
                    timeline_hover_line_color = excluded.timeline_hover_line_color,
                    timeline_hover_line_style = excluded.timeline_hover_line_style,
                    timeline_hover_line_width = excluded.timeline_hover_line_width,

                    timeline_edge_margin_width = excluded.timeline_edge_margin_width,

                    timeline_data_range_width = excluded.timeline_data_range_width,
                    timeline_is_data_range_visible = excluded.timeline_is_data_range_visible,
                    timeline_data_range_color = excluded.timeline_data_range_color,

                    timeline_animate_on_jump_to_year = excluded.timeline_animate_on_jump_to_year,
                    timeline_jump_to_year_animation_length = excluded.timeline_jump_to_year_animation_length,

                    timeline_animate_lod_change = excluded.timeline_animate_lod_change,
                    timeline_lod_change_animation_length = excluded.timeline_lod_change_animation_length;";

            db.Execute(sql, settings);
        }

        public void Delete(string id)
        {
            using var db = new SqliteConnection(_connString);

            db.Execute(
                "DELETE FROM layout_settings WHERE id = @Id",
                new { Id = id });
        }
    }
}

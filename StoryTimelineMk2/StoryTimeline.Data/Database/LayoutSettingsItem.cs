namespace StoryTimelineMk2.Database
{
    public class LayoutSettingsItem
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;

        // Event related things
        public int TimelineEventBoxWidth { get; set; }
        public int TimelineEventBoxHeight { get; set; }
        public int TimelineEventBoxStemOffset { get; set; }
        public string TimelineEventBorderColor { get; set; } = string.Empty;
        public int TimelineEventBorderWidth { get; set; }
        public int TimelineEventBorderRadius { get; set; }
        public string TimelineEventPadding { get; set; } = string.Empty;
        public int TimelineEventYMargin { get; set; }
        public string TimelineEventTextColor { get; set; } = string.Empty;
        public string TimelineEventBackgroundColor { get; set; } = string.Empty;
        public string TimelineEventFontFamily { get; set; } = string.Empty;
        public int TimelineEventFontSize { get; set; }
        public bool TimelineEventTextUseEllipsis { get; set; }
        public bool TimelineEventBoxShowColor { get; set; }
        public bool TimelineEventBoxShowColorOnBottom { get; set; }
        public bool TimelineEventHasHoverHighlight { get; set; }
        public string TimelineEventHoverColor { get; set; } = string.Empty;

        // Age and period related
        public int TimelineAgeHeight { get; set; }
        public int TimelineAgeCornerRounding { get; set; }
        public int TimelinePeriodHeight { get; set; }
        public int TimelinePeriodCornerRounding { get; set; }
        public int TimelinePeriodYMargin { get; set; }
        public int TimelinePeriodYOffset { get; set; }

        // Box types
        public bool TimelineBoxTypesShowAsBox { get; set; }
        public int TimelineBoxTypesBoxWidth { get; set; }
        public bool TimelineBoxTypesShowImage { get; set; }
        // A caption under a picture is the file's title; under a portrait it is a generated
        // sentence, so the two need their own sizes. Defaulted, never 0 from a partial save.
        public int TimelinePictureCaptionFontSize { get; set; } = 12;
        public int TimelineCharacterCaptionFontSize { get; set; } = 12;

        // Timeline misc
        public string TimelineCanvasBackgroundColor { get; set; } = string.Empty;
        public bool TimelineShowNowLine { get; set; }
        public bool TimelineShowNowLineText { get; set; }
        public string TimelineNowLineColor { get; set; } = string.Empty;
        public string TimelineNowLineStyle { get; set; } = string.Empty;

        public int TimelineTickDistance { get; set; }
        public int TimelineTickWidth { get; set; }
        public bool TimelineNonYearTicksSmaller { get; set; }

        public string TimelineTickMarkerFontFamily { get; set; } = string.Empty;
        public string TimelineTickMarkerFontStyle { get; set; } = string.Empty;
        public string TimelineTickMarkerTextColor { get; set; } = string.Empty;
        public int TimelineTickMarkerFontSize { get; set; }
        public bool TimelineTickMarkerTextAlwaysOnTop { get; set; }
        public bool TimelineTickMarkerTextAngled { get; set; }

        public bool TimelineShowHoverLine { get; set; }
        public string TimelineHoverLineColor { get; set; } = string.Empty;
        public string TimelineHoverLineStyle { get; set; } = string.Empty;
        public int TimelineHoverLineWidth { get; set; }

        public int TimelineEdgeMarginWidth { get; set; }

        public int TimelineDataRangeWidth { get; set; }
        public bool TimelineIsDataRangeVisible { get; set; }
        public string TimelineDataRangeColor { get; set; } = string.Empty;

        public bool TimelineAnimateOnJumpToYear { get; set; }
        public int TimelineJumpToYearAnimationLength { get; set; }

        public bool TimelineAnimateLodChange { get; set; }
        public int TimelineLodChangeAnimationLength { get; set; }

        // Tick & axis line colors
        public string TimelineTickColor { get; set; } = string.Empty;
        public string TimelineAxisColor { get; set; } = string.Empty;

        // Notes panel
        public string NotesPanelBackgroundColor { get; set; } = string.Empty;
        public string NotesPanelCardBackgroundColor { get; set; } = string.Empty;
        public string NotesPanelTextColor { get; set; } = string.Empty;
        public string NotesPanelHeadingColor { get; set; } = string.Empty;
        public string NotesPanelAccentColor { get; set; } = string.Empty;
        public int NotesPanelFontSize { get; set; }

        // Data panel (upper-right item display)
        public string DataPanelBackgroundColor { get; set; } = string.Empty;
        public string DataPanelCardBackgroundColor { get; set; } = string.Empty;
        public string DataPanelH1Color { get; set; } = string.Empty;
        public string DataPanelH2Color { get; set; } = string.Empty;
        public string DataPanelH3Color { get; set; } = string.Empty;
        public string DataPanelH4Color { get; set; } = string.Empty;
        public string DataPanelFontFamily { get; set; } = string.Empty;
        public int DataPanelFontSize { get; set; }

        // Gallery panel
        public string GalleryPanelBackgroundColor { get; set; } = string.Empty;
        public string GalleryPanelBorderColor { get; set; } = string.Empty;
        public string GalleryPanelTextColor { get; set; } = string.Empty;

        // Calendar panel (gallery tab)
        public string CalendarPanelBackgroundColor { get; set; } = string.Empty;
        public string CalendarPanelBorderColor { get; set; } = string.Empty;
        public string CalendarPanelTextColor { get; set; } = string.Empty;
        public string CalendarPanelWeekHighlightColor { get; set; } = string.Empty;
        public string CalendarPanelDayHighlightColor { get; set; } = string.Empty;

        // Calendar overlay
        public bool TimelineCalendarOverlayEnabled { get; set; }
        public string TimelineCalendarOverlaySeasonColor { get; set; } = string.Empty;
        public string TimelineCalendarOverlayMonthColor { get; set; } = string.Empty;
        public string TimelineCalendarOverlayWeekColor { get; set; } = string.Empty;
        public string TimelineCalendarOverlayDayColor { get; set; } = string.Empty;

        // Time break strips
        public string TimelineBreakFillColor { get; set; } = string.Empty;
        public string TimelineBreakBorderColor { get; set; } = string.Empty;

        // Measurement overlay
        public string MeasureLineColor { get; set; } = string.Empty;
    }
}

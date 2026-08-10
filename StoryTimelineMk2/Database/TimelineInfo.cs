using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TimelineInfo
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Author { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int StartYear { get; set; }
        public string? Color { get; set; }
        public string CalendarId { get; set; } = "cal_default_gregorian";
        public CalendarItem Calendar { get; set; } = new CalendarItem();
        public SettingsItem Settings { get; set; } = new SettingsItem();
        public string LayoutSettingsId { get; set; } = string.Empty;
        public LayoutSettingsItem LayoutSettings { get; set; } = new LayoutSettingsItem();
    }
}

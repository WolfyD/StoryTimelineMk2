using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class FullTimelineProject
    {
        public TimelineInfo Project { get; set; }
        public TimelineItem[] Items { get; set; }
        public SettingsItem Settings { get; set; }
        public NoteItem[] Notes { get; set; }
        public HiddenRangeItem[] HiddenRanges { get; set; }
    }
}

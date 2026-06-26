using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TimelineItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string StoryId { get; set; }
        public int TypeId { get; set; } = 1; // Default to Event
        public int Year { get; set; }
        public int Subtick { get; set; }
        public int OriginalSubtick { get; set; }
        public int EndYear { get; set; }
        public double AbsoluteStart { get; set; }
        public double AbsoluteEnd { get; set; }
        public int EndSubtick { get; set; }
        public int OriginalEndSubtick { get; set; }
        public string BookTitle { get; set; }
        public string Chapter { get; set; }
        public string Page { get; set; }
        public string Color { get; set; }
        public int CreationGranularity { get; set; }
        public int TimelineId { get; set; }
        public int ItemIndex { get; set; }
        public bool ShowInNotes { get; set; } = true;
        public int MinLodLevel { get; set; }
        public int Importance { get; set; } = 5;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

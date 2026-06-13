using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class NoteItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string NoteContents { get; set; } = string.Empty;
        public int TimelineId { get; set; }
        public string ConnectedItemId { get; set; } = string.Empty;
        public int NearestYear { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

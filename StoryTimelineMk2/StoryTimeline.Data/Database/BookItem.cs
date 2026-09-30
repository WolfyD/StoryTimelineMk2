using System;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class BookItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Title { get; set; } = string.Empty;
        public string Author { get; set; } = null!;
        public string Description { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>Filled by <see cref="BookRepo.GetArchiveBooks"/>, in chapter order; not a column.</summary>
        public List<ChapterItem> Chapters { get; set; } = new();
        /// <summary>How many items in <i>other</i> timelines cite one of its chapters. Not a column.</summary>
        public int OtherTimelineRefs { get; set; }
    }
}

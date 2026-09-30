using System;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class ChapterItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string BookId { get; set; } = null!;
        public int Number { get; set; }
        public string Title { get; set; } = null!;

        /// <summary>This timeline's items that cite it — filled by <see cref="BookRepo.GetArchiveBooks"/>; not a column.</summary>
        public List<string> ItemIds { get; set; } = new();
    }
}

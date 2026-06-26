using System;

namespace StoryTimelineMk2.Database
{
    public class ChapterItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string BookId { get; set; }
        public int Number { get; set; }
        public string Title { get; set; }
    }
}

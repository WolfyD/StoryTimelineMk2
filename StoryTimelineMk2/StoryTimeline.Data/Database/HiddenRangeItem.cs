namespace StoryTimelineMk2.Database
{
    public class HiddenRangeItem
    {
        public int Id { get; set; }
        public int TimelineId { get; set; }
        public int StartYear { get; set; }
        public int EndYear { get; set; }
        public string? Label { get; set; }
    }
}

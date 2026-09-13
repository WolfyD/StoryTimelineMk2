namespace StoryTimelineMk2.Database
{
    public class FilterRuleItem
    {
        public string Id { get; set; } = null!;
        public int TimelineId { get; set; }
        public string Dimension { get; set; } = null!;
        public string ParamsJson { get; set; } = null!;
        public string Label { get; set; } = null!;
        public string State { get; set; } = "neutral";
        public int SortOrder { get; set; }
    }
}

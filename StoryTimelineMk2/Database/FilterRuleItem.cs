namespace StoryTimelineMk2.Database
{
    public class FilterRuleItem
    {
        public string Id { get; set; }
        public int TimelineId { get; set; }
        public string Dimension { get; set; }
        public string ParamsJson { get; set; }
        public string Label { get; set; }
        public string State { get; set; } = "neutral";
        public int SortOrder { get; set; }
    }
}

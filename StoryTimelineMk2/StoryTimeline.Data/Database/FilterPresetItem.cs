namespace StoryTimelineMk2.Database
{
    public class FilterPresetItem
    {
        public string Id { get; set; } = null!;
        public string Name { get; set; } = null!;
        public string RulesJson { get; set; } = null!;
        public int AndMode { get; set; }
        public string CreatedAt { get; set; } = null!;
    }
}

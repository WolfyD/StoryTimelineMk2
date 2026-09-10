namespace StoryTimelineMk2.Database
{
    public class FilterPresetItem
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string RulesJson { get; set; }
        public int AndMode { get; set; }
        public string CreatedAt { get; set; }
    }
}

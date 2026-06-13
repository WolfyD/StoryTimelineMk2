namespace StoryTimelineMk2.Database
{
    public class RelationshipTypeItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string AToB { get; set; } = string.Empty;
        public string BToA { get; set; } = string.Empty;
        public bool OneWay { get; set; }
    }
}

using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class ItemTagLink
    {
        public string ItemId { get; set; } = null!;
        public int TagId { get; set; }
        public string TagName { get; set; } = null!;
    }

    public class ItemCharacterLink
    {
        public string ItemId { get; set; } = null!;
        public string CharacterId { get; set; } = null!;
        public string CharacterName { get; set; } = null!;
        public string CharacterColor { get; set; } = null!;
    }

    public class ItemStoryRefLink
    {
        public string ItemId { get; set; } = null!;
        public string StoryId { get; set; } = null!;
        public string StoryTitle { get; set; } = null!;
    }

    public class FullTimelineProject
    {
        public TimelineInfo Project { get; set; } = null!;
        public TimelineItem[] Items { get; set; } = null!;
        public SettingsItem Settings { get; set; } = null!;
        public NoteItem[] Notes { get; set; } = null!;
        public HiddenRangeItem[] HiddenRanges { get; set; } = null!;
        public ItemTagLink[] ItemTags { get; set; } = null!;
        public ItemCharacterLink[] ItemCharacters { get; set; } = null!;
        public CharacterItem[] Characters { get; set; } = null!;
        public ItemStoryRefLink[] ItemStoryRefs { get; set; } = null!;
        public string[] ItemsWithPictures { get; set; } = null!;
    }
}

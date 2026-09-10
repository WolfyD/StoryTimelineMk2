using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class ItemTagLink
    {
        public string ItemId { get; set; }
        public int TagId { get; set; }
        public string TagName { get; set; }
    }

    public class ItemCharacterLink
    {
        public string ItemId { get; set; }
        public string CharacterId { get; set; }
        public string CharacterName { get; set; }
        public string CharacterColor { get; set; }
    }

    public class ItemStoryRefLink
    {
        public string ItemId { get; set; }
        public string StoryId { get; set; }
        public string StoryTitle { get; set; }
    }

    public class FullTimelineProject
    {
        public TimelineInfo Project { get; set; }
        public TimelineItem[] Items { get; set; }
        public SettingsItem Settings { get; set; }
        public NoteItem[] Notes { get; set; }
        public HiddenRangeItem[] HiddenRanges { get; set; }
        public ItemTagLink[] ItemTags { get; set; }
        public ItemCharacterLink[] ItemCharacters { get; set; }
        public CharacterItem[] Characters { get; set; }
        public ItemStoryRefLink[] ItemStoryRefs { get; set; }
        public string[] ItemsWithPictures { get; set; }
    }
}

using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class StoryItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Title { get; set; } = string.Empty;
        /// <summary>The summary.</summary>
        public string Description { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// BL-88. Status, tense and person hold one of the Archive's fixed choices, or null for "not
        /// said"; the words themselves live in the frontend, so nothing here checks them.
        /// </summary>
        public string? Status { get; set; }
        public string? Tense { get; set; }
        public string? Person { get; set; }
        public string? Genre { get; set; }
        public string? Color { get; set; }
        public int? ReadingOrder { get; set; }
        /// <summary>The story this one follows. Stories make one chain: each has at most one previous and one next.</summary>
        public string? PreviousStoryId { get; set; }
        /// <summary>
        /// Not a column: the story whose previous is this one. <see cref="StoryRepo.GetArchiveStories"/>
        /// fills it and <see cref="StoryRepo.SaveStory"/>, given a timeline, writes it back onto that story.
        /// </summary>
        public string? NextStoryId { get; set; }
        /// <summary>JSON, read and written whole: quotes, each an array of <c>{ text, speaker }</c> lines.</summary>
        public string? Quotes { get; set; }
        public string? Notes { get; set; }

        /// <summary>
        /// Filled by <see cref="StoryRepo.GetArchiveStories"/> and saved by <see cref="StoryRepo.SaveStory"/>
        /// when it is given a timeline; not columns. Characters and places are only the timeline's own.
        /// </summary>
        public List<StoryCharacterLink> Characters { get; set; } = new();
        public List<string> LocationIds { get; set; } = new();
        public List<string> BookIds { get; set; } = new();
        /// <summary>Chapters of those books it is told in; none for a book means the whole book.</summary>
        public List<string> ChapterIds { get; set; } = new();

        /// <summary>How many items in <i>other</i> timelines refer to it — the shared-story note. Not a column.</summary>
        public int OtherTimelineRefs { get; set; }
    }

    /// <summary>A character a story is about; <see cref="Pov"/> when the story is told through them.</summary>
    public class StoryCharacterLink
    {
        public string CharacterId { get; set; } = string.Empty;
        public bool Pov { get; set; }
    }
}

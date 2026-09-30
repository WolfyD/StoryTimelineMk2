using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class MediaItem
    {
        public string Id { get; set; } = null!;
        public string FilePath { get; set; } = string.Empty;
        /// <summary>Not a DB column — set by MediaRepo.EnsureThumb: "thumbs/{Id}.png", or FilePath when no thumb could be made.</summary>
        public string ThumbPath { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public int FileSize { get; set; }
        public string FileType { get; set; } = string.Empty;
        public int Width { get; set; }
        public int Height { get; set; }
        public string Title { get; set; } = null!;
        public string Description { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
        /// <summary>Not a DB column — filled by <see cref="MediaRepo.GetArchiveMedia"/> only (BL-88).</summary>
        public List<MediaUse>? Uses { get; set; }
    }

    /// <summary>One thing that shows a picture: an item, a map, or a character's portrait.</summary>
    public class MediaUse
    {
        [System.Text.Json.Serialization.JsonIgnore]
        public string PictureId { get; set; } = null!;
        /// <summary>"item", "map" or "portrait".</summary>
        public string Kind { get; set; } = null!;
        public string Id { get; set; } = null!;
        public string? Name { get; set; }
        /// <summary>Items only.</summary>
        public int? TypeId { get; set; }
        /// <summary>In the timeline asked about — a shared character's portrait counts as in every one.</summary>
        public bool Here { get; set; }
    }
}

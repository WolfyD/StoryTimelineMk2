using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class CharacterItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Nicknames { get; set; }
        public string Aliases { get; set; }
        public string Race { get; set; }
        public string Description { get; set; }
        public string Notes { get; set; }

        // Nullable integers since characters might not have known birth/death years
        public int? BirthYear { get; set; }
        public int? BirthSubtick { get; set; }
        public string BirthDate { get; set; }
        public string BirthAlternativeYear { get; set; }

        public int? DeathYear { get; set; }
        public int? DeathSubtick { get; set; }
        public string DeathDate { get; set; }
        public string DeathAlternativeYear { get; set; }

        public int Importance { get; set; } = 5;
        public string Color { get; set; }
        public int TimelineId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

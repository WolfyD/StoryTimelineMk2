using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class CharacterItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();

        /// <summary>
        /// Display name, derived from <see cref="FirstName"/> + <see cref="LastName"/> and kept in step
        /// by <c>CharacterRepo.SaveCharacter</c>. Stored rather than computed so the sorts, filters and
        /// pickers that already read it need no changes.
        /// </summary>
        public string Name { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Nicknames { get; set; } = null!;
        public string Aliases { get; set; } = null!;
        public string Race { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string Notes { get; set; } = null!;

        // Nullable integers since characters might not have known birth/death years
        public int? BirthYear { get; set; }
        public string BirthDate { get; set; } = null!;
        public string? BirthAlternativeYear { get; set; }

        public int? DeathYear { get; set; }
        public string DeathDate { get; set; } = null!;
        public string? DeathAlternativeYear { get; set; }

        // Where inside the year, and at which LOD that was picked — the pair every item carries, so
        // a generated birth/death item lands exactly where the date input said (3 = years).
        public int BirthSubtick { get; set; }
        public int BirthGranularity { get; set; } = 3;
        public int DeathSubtick { get; set; }
        public int DeathGranularity { get; set; } = 3;

        public int Importance { get; set; } = 5;
        public string Color { get; set; } = null!;

        /// <summary>A row in <c>pictures</c>, imported through MediaRepo like any item image.</summary>
        public string? PortraitPictureId { get; set; }

        /// <summary>Not a DB column — the portrait's <c>file_path</c>, joined in so a list of
        /// characters can show faces without a lookup each.</summary>
        public string? PortraitPath { get; set; }

        /// <summary>
        /// Overrides what the dates imply ("missing", "undead", …). Null — the normal case — means
        /// derive it from <see cref="DeathYear"/>, so it is not a second thing to keep up to date.
        /// </summary>
        public string? State { get; set; }

        /// <summary>Draw this character's birth and death on the timeline as two owned items.</summary>
        public bool ShowOnTimeline { get; set; }

        /// <summary>
        /// Fill the portrait disc with <see cref="Color"/> instead of leaving it neutral. Off by
        /// default: a portrait with transparency over a filled disc drowns the face, and the ring
        /// carries the colour either way.
        /// </summary>
        public bool UseHighlightColor { get; set; }
        public string? BirthItemId { get; set; }
        public string? DeathItemId { get; set; }

        public int TimelineId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// "Anna Maria Vas" → ("Anna Maria", "Vas"); "Risha" → ("Risha", ""). Splitting on the last
        /// space is a guess, which is why both halves stay editable in the character window.
        /// </summary>
        public static (string First, string Last) SplitName(string? fullName)
        {
            string name = (fullName ?? string.Empty).Trim();
            int cut = name.LastIndexOf(' ');
            return cut < 0 ? (name, string.Empty) : (name[..cut].TrimEnd(), name[(cut + 1)..]);
        }

        /// <summary>The other direction: what <see cref="Name"/> holds for a given pair of halves.</summary>
        public static string JoinName(string? first, string? last) => $"{first} {last}".Trim();
    }
}

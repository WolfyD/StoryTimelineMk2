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

        /// <summary>
        /// Free text like <see cref="Race"/>: house, guild, army, cult — whatever this world
        /// divides itself into. The relations views group the cast by it.
        /// </summary>
        public string? Faction { get; set; }
        public string Description { get; set; } = null!;
        public string Notes { get; set; } = null!;

        // Nullable integers since characters might not have known birth/death years
        public int? BirthYear { get; set; }
        public string BirthDate { get; set; } = null!;
        public string? BirthAlternativeYear { get; set; }

        public int? DeathYear { get; set; }
        public string DeathDate { get; set; } = null!;
        public string? DeathAlternativeYear { get; set; }

        // At which LOD the date was picked (3 = years), and where that put it on the timeline.
        // BL-75: the absolute is stored and the subtick is not, exactly as items have worked since
        // BL-02 — the editor derives one back from the absolute when it needs a date input to fill.
        public int BirthGranularity { get; set; } = 3;
        public int DeathGranularity { get; set; } = 3;

        /// <summary>Birth and death as timeline positions: the year plus the subtick multiplied out
        /// by its LOD step, so a lifeline and the birth item it belongs to land on the same pixel.
        /// NULL when that end has no year, which is not the same as year 0.</summary>
        public double? AbsoluteStart { get; set; }
        public double? AbsoluteEnd { get; set; }

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

        /// <summary>
        /// Free text with a suggested list behind it: a writer's world need not use ours. Only the
        /// relation wording reads it, and only to pick "mother of" over "parent of" — anything it
        /// does not recognise, including nothing at all, gets the neutral phrase.
        /// </summary>
        public string? Gender { get; set; }

        /// <summary>Draw this character's birth and death on the timeline as two owned items.</summary>
        public bool ShowOnTimeline { get; set; }

        /// <summary>
        /// Fill the portrait disc with <see cref="Color"/> instead of leaving it neutral. Off by
        /// default: a portrait with transparency over a filled disc drowns the face, and the ring
        /// carries the color either way.
        /// </summary>
        public bool UseHighlightColor { get; set; }
        public string? BirthItemId { get; set; }
        public string? DeathItemId { get; set; }

        /// <summary>
        /// Where they were born and where they died. Groundwork for BL-16 (the Map feature): these
        /// will hold location ids once locations exist. Nothing sets or reads them yet.
        /// </summary>
        public string? BirthLocationId { get; set; }
        public string? DeathLocationId { get; set; }

        public int TimelineId { get; set; }

        /// <summary>
        /// In every timeline's cast, not only <see cref="TimelineId"/>'s. That stays as where they
        /// came from, so unticking this puts them back rather than stranding them.
        /// </summary>
        public bool Shared { get; set; }

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

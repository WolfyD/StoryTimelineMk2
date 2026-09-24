using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TimelineItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string? StoryId { get; set; }
        public int TypeId { get; set; } = 1; // Default to Event
        public int Year { get; set; }
        public int EndYear { get; set; }
        public double AbsoluteStart { get; set; }
        public double AbsoluteEnd { get; set; }
        public string BookTitle { get; set; } = null!;
        public string Chapter { get; set; } = null!;
        public string Page { get; set; } = null!;
        public string Color { get; set; } = null!;
        public int CreationGranularity { get; set; }
        public int TimelineId { get; set; }
        public int ItemIndex { get; set; }
        /// <summary>0 = unassigned, 1 = above the axis, 2 = below. Picked on first save, then sticky.</summary>
        public int Placement { get; set; }
        /// <summary>Box centered on its stem instead of offset to one side (events and notes).</summary>
        public bool Centered { get; set; }
        /// <summary>Draw the title as a caption strip on the canvas (pictures only).</summary>
        public bool ShowTitle { get; set; }
        /// <summary>BL-72: the span reaches back past its start year — drawn as an arrow, not an edge.</summary>
        public bool OpenStart { get; set; }
        /// <summary>BL-72: the span carries on past its end year. Both may be set.</summary>
        public bool OpenEnd { get; set; }
        /// <summary>BL-72: soften the open side — half-transparent at the arrow tip, solid a year in.</summary>
        public bool OpenFade { get; set; }
        /// <summary>Not a column: the owning character's flag, joined in for type 7. False for everything else.</summary>
        public bool UseHighlightColor { get; set; }
        /// <summary>Writer's private notes — stored and exported, never rendered on the canvas, data panel or view modal.</summary>
        public string? ItemNotes { get; set; }

        /// <summary>
        /// Where it happened. Groundwork for BL-16 (the Map feature) — it will hold a location id
        /// once locations exist. Nothing sets or reads it yet.
        /// </summary>
        public string? LocationId { get; set; }
        public bool ShowInNotes { get; set; } = true;
        public int MinLodLevel { get; set; }
        public int LodVisibilityMask { get; set; } = 255;
        public int Importance { get; set; } = 5;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}

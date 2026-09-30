using System;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    /// <summary>
    /// BL-16: a picture with places on it. The image is a row in <c>pictures</c> rather than a path of
    /// its own, so a map travels through export, backup and import on the same machinery as every
    /// other image here.
    ///
    /// A map has no parent column. Its parent is whichever <see cref="LocationItem"/> names it in
    /// <see cref="LocationItem.ChildMapId"/> — the pin labelled "Gondor" on the world map <i>is</i> the
    /// way into the Gondor map — so a root map is one no location points at, and nesting goes as deep
    /// as the writer takes it.
    /// </summary>
    public class MapItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public int TimelineId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? PictureId { get; set; }

        /// <summary>Degrees clockwise from up: where north is on a map that was not drawn square.</summary>
        public double NorthOffset { get; set; }

        /// <summary>
        /// Where the compass rose sits and how big it is. X and Y are 0..1 of the free space in the map
        /// view, so 1,0 is the top-right corner it has always started in and a smaller window cannot put
        /// it off the edge. The size is in pixels: the rose is furniture, not part of the picture.
        /// </summary>
        public double CompassX { get; set; } = 1;
        public double CompassY { get; set; }
        public double CompassSize { get; set; } = 38;

        /// <summary>
        /// The scale bar, as the writer set it: <see cref="ScaleLength"/> units of
        /// <see cref="ScaleUnit"/> span <see cref="ScaleFraction"/> of the image's width. A new map
        /// starts at the standard 10 miles across its middle fifth, because a map with no picture yet
        /// has nothing truer to say.
        /// </summary>
        public double ScaleLength { get; set; } = 10;
        public string ScaleUnit { get; set; } = "miles";
        public double ScaleFraction { get; set; } = 0.2;

        /// <summary>
        /// How many squares across the lettered grid is — columns A, B, C… across and rows 1, 2, 3… down,
        /// so a place can be cited as D7. The rows follow from the picture's height, because the squares
        /// are square. 0 means the writer has not said and the screen draws its own default; whether the
        /// grid is shown is a button in the map window and is not stored at all.
        /// </summary>
        public int GridCols { get; set; }

        /// <summary>
        /// What the places on this map look like by default, as JSON — shape, size, colours, icon and
        /// where the label sits. A pin may override any part of it. Null means the built-in look; the
        /// shape of the object is the frontend's <c>markerStyle.ts</c> and nothing here reads into it.
        /// </summary>
        public string? MarkerStyle { get; set; }

        /// <summary>Joined in from <c>pictures</c>, so a map list can draw thumbnails without a lookup each.</summary>
        public string? PicturePath { get; set; }

        /// <summary>
        /// The image's natural size, joined in from <c>pictures</c>. The canvas needs it to turn a
        /// location's 0..1 fractions into pixels before the bitmap itself has finished loading.
        /// </summary>
        public int? PictureWidth { get; set; }
        public int? PictureHeight { get; set; }

        /// <summary>
        /// What the canvas actually draws: capped copies of the picture, so an upload of any size is
        /// affordable to display. See <see cref="MapViews"/>. Null means the copies are not written
        /// yet — the screen asks for them with <c>EnsureMapViews</c> — or that the image cannot be
        /// reduced at all, which is reported rather than drawn.
        /// Not columns; derived files, re-creatable at any time.
        /// </summary>
        public string? OverviewPath { get; set; }
        public string? DetailPath { get; set; }

        /// <summary>
        /// Why the copies could not be made, in words the writer can act on — a PNG too large to open
        /// in one block says so and says to re-export it as WebP. Null when all is well. Not a column.
        /// </summary>
        public string? ViewError { get; set; }

        public DateTime UpdatedAt { get; set; }

        /// <summary>Filled by <see cref="MapRepo.GetMaps"/>; not a column.</summary>
        public List<LocationItem> Locations { get; set; } = new();
    }

    /// <summary>
    /// A named place pinned at <see cref="X"/>/<see cref="Y"/> on <see cref="MapId"/>. Events point
    /// here through <c>items.location_id</c>, and a character's whereabouts are derived from that —
    /// they were at an event, the event has a place.
    /// </summary>
    public class LocationItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string MapId { get; set; } = string.Empty;

        /// <summary>
        /// The map this pin opens into, if the writer has drawn one. Set, and this location is both a
        /// place on its parent and a map in its own right — one row, so the two cannot drift apart.
        /// </summary>
        public string? ChildMapId { get; set; }

        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }

        /// <summary>
        /// Fractions of the map image, 0..1 on each axis — not pixels. A writer who redraws their world
        /// and uploads it at a different size keeps every pin where they put it.
        /// </summary>
        public double X { get; set; } = 0.5;
        public double Y { get; set; } = 0.5;

        public string? Color { get; set; }

        /// <summary>
        /// How much of this map's width the pin's own map covers, 0..1 — the patch of ground the child
        /// depicts, and the rectangle it grows out of when the view descends into it. Null until
        /// someone sets it: a sensible default is easier to work out on the screen, where the child's
        /// proportions are known. Height is not stored; it follows the child map's aspect.
        /// </summary>
        public double? FootprintW { get; set; }

        /// <summary>
        /// Only what this pin differs from its map's default in, as JSON — a key that is absent is a
        /// key that inherits. Null means it looks like every other place on the map.
        /// </summary>
        public string? MarkerStyle { get; set; }

        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// BL-16, the time scrubber: one thing that happened somewhere, with whoever was actually there.
    /// Not a table — a join of <c>items</c> and <c>locations</c> trimmed to what the map needs, because
    /// the scrubber runs a frame at a time and cannot fetch per pin.
    /// </summary>
    public class MapEvent
    {
        public string ItemId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public int TypeId { get; set; }
        public string? Color { get; set; }

        /// <summary>The years it spans. <c>EndYear</c> is 0 on the events that happen in one.</summary>
        public int Year { get; set; }
        public int EndYear { get; set; }
        public double AbsoluteStart { get; set; }
        public double AbsoluteEnd { get; set; }

        public string LocationId { get; set; } = string.Empty;
        /// <summary>The map that place is pinned to, so a journey can be drawn without a second lookup.</summary>
        public string MapId { get; set; } = string.Empty;

        /// <summary>Who was there — the ones marked only mentioned are left out, not flagged.</summary>
        public List<MapEventCast> Cast { get; set; } = new();
    }

    /// <summary>A character who was present at a <see cref="MapEvent"/>: enough to draw and name a dot.</summary>
    public class MapEventCast
    {
        public string CharacterId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Color { get; set; }
    }
}

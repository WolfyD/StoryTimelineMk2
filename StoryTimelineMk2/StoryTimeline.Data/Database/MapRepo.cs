using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    /// <summary>
    /// BL-16. Maps and their locations are one aggregate — a location cannot exist without a map, and
    /// the map screen wants both in the same breath — so they share a repo rather than having one each.
    /// </summary>
    public class MapRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public MapRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        /// <summary>
        /// Every map in the timeline with its pins already attached, in two queries. The tree, the
        /// breadcrumbs and the drill-through all read from this one result: a writer has tens of maps
        /// and hundreds of pins, so fetching per map would be a lot of round trips to save nothing.
        /// </summary>
        public List<MapItem> GetMaps(int timelineId)
        {
            using var db = new SqliteConnection(_connString);

            var maps = db.Query<MapItem>(@"
                SELECT m.*, p.file_path AS picture_path, p.width AS picture_width, p.height AS picture_height
                FROM maps m
                LEFT JOIN pictures p ON p.id = m.picture_id
                WHERE m.timeline_id = @TimelineId
                ORDER BY m.name", new { TimelineId = timelineId }).ToList();

            if (maps.Count == 0) return maps;

            var byId = maps.ToDictionary(m => m.Id);
            var locations = db.Query<LocationItem>(@"
                SELECT l.* FROM locations l
                JOIN maps m ON m.id = l.map_id
                WHERE m.timeline_id = @TimelineId
                ORDER BY l.name", new { TimelineId = timelineId });

            foreach (var location in locations)
            {
                if (byId.TryGetValue(location.MapId, out var map))
                    map.Locations.Add(location);
            }

            MapViews.Attach(maps);
            return maps;
        }

        /// <summary>
        /// One map with its pins, its views built and waited for. The map screen calls this for the
        /// map it is about to draw, because <see cref="GetMaps"/> deliberately does not block on
        /// generating them.
        /// </summary>
        public MapItem? GetMap(string id, bool ensureViews = true)
        {
            using var db = new SqliteConnection(_connString);

            var map = db.QuerySingleOrDefault<MapItem>(@"
                SELECT m.*, p.file_path AS picture_path, p.width AS picture_width, p.height AS picture_height
                FROM maps m
                LEFT JOIN pictures p ON p.id = m.picture_id
                WHERE m.id = @Id", new { Id = id });
            if (map == null) return null;

            map.Locations = db.Query<LocationItem>(
                "SELECT * FROM locations WHERE map_id = @Id ORDER BY name", new { Id = id }).ToList();

            if (ensureViews) MapViews.Ensure(map);
            return map;
        }

        public string SaveMap(MapItem map)
        {
            if (string.IsNullOrEmpty(map.Id)) map.Id = Guid.NewGuid().ToString();
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO maps (id, timeline_id, name, description, picture_id,
                                  north_offset, compass_x, compass_y, compass_size,
                                  scale_length, scale_unit, scale_fraction,
                                  marker_style, updated_at)
                VALUES (@Id, @TimelineId, @Name, @Description, @PictureId,
                        @NorthOffset, @CompassX, @CompassY, @CompassSize,
                        @ScaleLength, @ScaleUnit, @ScaleFraction,
                        @MarkerStyle, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    name           = excluded.name,
                    description    = excluded.description,
                    picture_id     = excluded.picture_id,
                    north_offset   = excluded.north_offset,
                    compass_x      = excluded.compass_x,
                    compass_y      = excluded.compass_y,
                    compass_size   = excluded.compass_size,
                    scale_length   = excluded.scale_length,
                    scale_unit     = excluded.scale_unit,
                    scale_fraction = excluded.scale_fraction,
                    marker_style   = excluded.marker_style,
                    updated_at     = CURRENT_TIMESTAMP;",
                new
                {
                    map.Id, map.TimelineId, map.Name, map.Description, map.PictureId,
                    map.NorthOffset, map.CompassX, map.CompassY,
                    // A rose of nothing cannot be grabbed to make it bigger again.
                    CompassSize = map.CompassSize >= 16 ? map.CompassSize : 38,
                    map.ScaleLength, map.ScaleFraction,
                    ScaleUnit = string.IsNullOrWhiteSpace(map.ScaleUnit) ? "miles" : map.ScaleUnit.Trim(),
                    MarkerStyle = Blank(map.MarkerStyle),
                });
            return map.Id;
        }

        /// <summary>
        /// The map's own pins go with it (cascade). A pin on some <i>other</i> map that opened into
        /// this one keeps its place and loses only the doorway, which is the <c>child_map_id</c> FK's
        /// ON DELETE SET NULL — deleting a map must not delete the place it depicted.
        /// </summary>
        public void DeleteMap(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM maps WHERE id = @Id", new { Id = id });
        }

        public string SaveLocation(LocationItem location)
        {
            if (string.IsNullOrEmpty(location.Id)) location.Id = Guid.NewGuid().ToString();
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO locations (id, map_id, child_map_id, name, description, x, y, color,
                                       footprint_w, marker_style, updated_at)
                VALUES (@Id, @MapId, @ChildMapId, @Name, @Description, @X, @Y, @Color,
                        @FootprintW, @MarkerStyle, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    map_id       = excluded.map_id,
                    child_map_id = excluded.child_map_id,
                    name         = excluded.name,
                    description  = excluded.description,
                    x            = excluded.x,
                    y            = excluded.y,
                    color        = excluded.color,
                    footprint_w  = excluded.footprint_w,
                    marker_style = excluded.marker_style,
                    updated_at   = CURRENT_TIMESTAMP;",
                new
                {
                    location.Id, location.MapId,
                    ChildMapId = string.IsNullOrEmpty(location.ChildMapId) ? null : location.ChildMapId,
                    location.Name, location.Description, location.X, location.Y, location.Color,
                    location.FootprintW, MarkerStyle = Blank(location.MarkerStyle),
                });
            return location.Id;
        }

        /// <summary>
        /// The events that pointed here are left alone but forget the place — the
        /// <c>trg_locations_clear_items</c> trigger does it, so it happens however the row is deleted.
        /// </summary>
        public void DeleteLocation(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM locations WHERE id = @Id", new { Id = id });
        }

        /// <summary>
        /// A marker style of "{}" or whitespace is nothing to store: an empty override and no override
        /// look the same on the map, and NULL is the one that says so without being parsed first.
        /// </summary>
        private static string? Blank(string? json)
        {
            var trimmed = json?.Trim();
            return string.IsNullOrEmpty(trimmed) || trimmed == "{}" ? null : trimmed;
        }

        /// <summary>What happened here, earliest first — the pin's detail panel.</summary>
        public IEnumerable<TimelineItem> GetLocationItems(string locationId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TimelineItem>(
                "SELECT * FROM items WHERE location_id = @LocationId ORDER BY absolute_start",
                new { LocationId = locationId });
        }
    }
}

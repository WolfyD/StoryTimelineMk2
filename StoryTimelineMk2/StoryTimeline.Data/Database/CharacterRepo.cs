using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class CharacterRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public CharacterRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        /// <summary>The portrait's path comes along so a list can show faces without a lookup each.</summary>
        private const string SelectCharacter = @"
            SELECT c.*, p.file_path AS portrait_path
            FROM characters c
            LEFT JOIN pictures p ON p.id = c.portrait_picture_id";

        /// <summary>
        /// This timeline's cast — its own characters plus every shared one, whichever timeline they
        /// came from (BL-75). A shared character keeps their origin in <c>timeline_id</c>, so this is
        /// the only place that decides they are also here.
        /// </summary>
        public IEnumerable<CharacterItem> GetCharactersByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CharacterItem>(
                $"{SelectCharacter} WHERE c.timeline_id = @TimelineId OR c.shared = 1 ORDER BY c.name",
                new { TimelineId = timelineId });
        }

        public CharacterItem? GetCharacter(string id)
        {
            using var db = new SqliteConnection(_connString);
            return db.QuerySingleOrDefault<CharacterItem>($"{SelectCharacter} WHERE c.id = @Id", new { Id = id });
        }

        public void SaveCharacter(CharacterItem character)
        {
            // BL-15: `name` is derived, and kept in step here rather than at every call site. The
            // character window sends the two halves; the v1 importer and the older callers still send
            // only a full name, so those get it split instead.
            // ponytail: one writer, so it cannot drift. If a second one ever appears, make it a view.
            if (!string.IsNullOrWhiteSpace(character.FirstName) || !string.IsNullOrWhiteSpace(character.LastName))
                character.Name = CharacterItem.JoinName(character.FirstName, character.LastName);
            else
                (character.FirstName, character.LastName) = CharacterItem.SplitName(character.Name);

            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO characters (
                    id, name, first_name, last_name, nicknames, aliases, race, faction, description, notes,
                    birth_year, birth_date, birth_alternative_year,
                    death_year, death_date, death_alternative_year,
                    importance, color, state, gender, show_on_timeline, use_highlight_color,
                    birth_granularity, death_granularity, absolute_start, absolute_end, shared,
                    birth_item_id, death_item_id, birth_location_id, death_location_id, timeline_id
                ) VALUES (
                    @Id, @Name, @FirstName, @LastName, @Nicknames, @Aliases, @Race, @Faction, @Description, @Notes,
                    @BirthYear, @BirthDate, @BirthAlternativeYear,
                    @DeathYear, @DeathDate, @DeathAlternativeYear,
                    @Importance, @Color, @State, @Gender, @ShowOnTimeline, @UseHighlightColor,
                    @BirthGranularity, @DeathGranularity, @AbsoluteStart, @AbsoluteEnd, @Shared,
                    @BirthItemId, @DeathItemId, @BirthLocationId, @DeathLocationId, @TimelineId
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, first_name = excluded.first_name, last_name = excluded.last_name,
                    nicknames = excluded.nicknames, aliases = excluded.aliases,
                    race = excluded.race, faction = excluded.faction,
                    description = excluded.description, notes = excluded.notes,
                    birth_year = excluded.birth_year,
                    birth_date = excluded.birth_date, birth_alternative_year = excluded.birth_alternative_year,
                    death_year = excluded.death_year,
                    death_date = excluded.death_date, death_alternative_year = excluded.death_alternative_year,
                    importance = excluded.importance, color = excluded.color,
                    state = excluded.state, gender = excluded.gender,
                    show_on_timeline = excluded.show_on_timeline,
                    use_highlight_color = excluded.use_highlight_color,
                    birth_granularity = excluded.birth_granularity, death_granularity = excluded.death_granularity,
                    absolute_start = excluded.absolute_start, absolute_end = excluded.absolute_end,
                    shared = excluded.shared,
                    birth_item_id = excluded.birth_item_id, death_item_id = excluded.death_item_id,
                    birth_location_id = excluded.birth_location_id, death_location_id = excluded.death_location_id,
                    updated_at = CURRENT_TIMESTAMP;
                -- portrait_picture_id is left alone: it is written by SetPortrait, which also has to
                -- clean up the file the old one pointed at.";

            db.Execute(sql, character);
        }

        // --- C# BFS Graph Traversal ---
        public class CharacterEdge
        {
            public string SourceId { get; set; } = null!;
            public string TargetId { get; set; } = null!;
            public string RelationshipType { get; set; } = null!;
        }

        public IEnumerable<string> GetNetwork(int timelineId, string startCharId, int maxDepth = 2)
        {
            using var db = new SqliteConnection(_connString);

            // Fetch all edges for this timeline once into memory (extremely fast in C#)
            var edges = db.Query<CharacterEdge>(
                "SELECT character_1_id as SourceId, character_2_id as TargetId, relationship_type as RelationshipType FROM character_relationships WHERE timeline_id = @Id",
                new { Id = timelineId }).ToList();

            var visited = new HashSet<string> { startCharId };
            var queue = new Queue<(string id, int depth)>();
            queue.Enqueue((startCharId, 0));

            // Execute standard Breadth-First Search
            while (queue.Count > 0)
            {
                var (currentId, depth) = queue.Dequeue();
                if (depth >= maxDepth) continue;

                var neighbors = edges
                    .Where(e => e.SourceId == currentId).Select(e => e.TargetId)
                    .Concat(edges.Where(e => e.TargetId == currentId).Select(e => e.SourceId));

                foreach (var neighbor in neighbors)
                {
                    if (visited.Add(neighbor)) // Only process if not already visited
                    {
                        queue.Enqueue((neighbor, depth + 1));
                    }
                }
            }

            return visited; // Returns a flat list of all connected character IDs
        }

        /// <summary>
        /// Points a character at a picture, and hands back the one it replaced so the caller can
        /// delete that file. A portrait is never shared — each pick imports its own copy — so the old
        /// row is an orphan the moment it is replaced, and MediaRepo.UnlinkAndPruneImage only knows
        /// how to prune item links.
        /// </summary>
        public string? SetPortrait(string characterId, string? pictureId)
        {
            using var db = new SqliteConnection(_connString);
            string? replaced = db.QuerySingleOrDefault<string>(
                "SELECT portrait_picture_id FROM characters WHERE id = @Id", new { Id = characterId });
            db.Execute(@"UPDATE characters SET portrait_picture_id = @PictureId, updated_at = CURRENT_TIMESTAMP
                         WHERE id = @Id", new { Id = characterId, PictureId = pictureId });
            return replaced == pictureId ? null : replaced;
        }

        /// <summary>One item a character appears in: enough to list it, color it and jump to it.</summary>
        public class CharacterAppearance
        {
            public string ItemId { get; set; } = "";
            public string Title { get; set; } = "";
            public int TypeId { get; set; }
            public int Year { get; set; }
            public double AbsoluteStart { get; set; }
            public string? Color { get; set; }
            public string? Role { get; set; }
        }

        /// <summary>
        /// The other direction of <c>item_character_appearances</c>: every item this character is in,
        /// in timeline order. The item editor writes those links; the character window reads them back.
        /// </summary>
        public IEnumerable<CharacterAppearance> GetAppearances(string characterId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CharacterAppearance>(@"
                SELECT i.id AS ItemId, i.title AS Title, i.type_id AS TypeId, i.year AS Year,
                       i.absolute_start AS AbsoluteStart, i.color AS Color, ica.role AS Role
                FROM item_character_appearances ica
                INNER JOIN items i ON i.id = ica.item_id
                WHERE ica.character_id = @Id
                ORDER BY i.absolute_start", new { Id = characterId });
        }

        /// <summary>
        /// The character a generated birth or death item belongs to, or null for any other item.
        /// The two id columns are what <i>Show on timeline</i> wrote when it made them.
        /// </summary>
        public string? GetCharacterIdByItem(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.QueryFirstOrDefault<string>(
                "SELECT id FROM characters WHERE birth_item_id = @Id OR death_item_id = @Id LIMIT 1",
                new { Id = itemId });
        }

        // ── Relations (BL-15 phase 4 / BL-17) ─────────────────────────────────────────────────

        /// <summary>
        /// One relation between two characters, stored once rather than once per direction: the type
        /// carries both readings, so which end you stand at decides the wording. Both years are
        /// optional — most relations are implied by their kind — and NULL means "as long as both were
        /// here", not year 0.
        /// </summary>
        public class CharacterRelationship
        {
            public long Id { get; set; }
            public string Character1Id { get; set; } = "";
            public string Character2Id { get; set; } = "";
            public string RelationshipType { get; set; } = "";
            public string? Notes { get; set; }
            public int? StartYear { get; set; }
            public int StartGranularity { get; set; } = 3;
            public int? EndYear { get; set; }
            public int EndGranularity { get; set; } = 3;

            /// <summary>The two ends as timeline positions, the same pair items carry (BL-75).</summary>
            public double? AbsoluteStart { get; set; }
            public double? AbsoluteEnd { get; set; }

            /// <summary>How close they are, 0–100. Draws as the line's thickness and pulls its spring.</summary>
            public int RelationshipStrength { get; set; } = 50;

            /// <summary>A state word on the tie itself — estranged, secret, adoptive, former, alleged.
            /// Reads into the wording and decides the line's dash pattern.</summary>
            public string? RelationshipModifier { get; set; }

            /// <summary>A genealogical qualifier — half-, step-, once removed — folded into the wording.</summary>
            public string? RelationshipDegree { get; set; }

            public int TimelineId { get; set; }
        }

        /// <summary>
        /// A kind of relation and how it reads each way ("parent of" / "child of"). App-wide, not per
        /// timeline: a writer who invents "liege" has it in every world. <c>OneWay</c> marks the kinds
        /// that only read from A to B, so the panel can say so instead of inventing a mirror phrase.
        /// </summary>
        public class RelationshipType
        {
            public string Id { get; set; } = "";
            public string Name { get; set; } = "";
            public string? Type { get; set; }
            public string? AToB { get; set; }
            public string? BToA { get; set; }
            /// <summary>
            /// The same phrase for a character whose gender reads female or male. NULL where English
            /// has no gendered word for the kind — which is also what an unstated gender gets.
            /// </summary>
            public string? AToBF { get; set; }
            public string? AToBM { get; set; }
            public string? BToAF { get; set; }
            public string? BToAM { get; set; }
            public int OneWay { get; set; }
        }

        /// <summary>Every relation this character is either end of.</summary>
        public IEnumerable<CharacterRelationship> GetRelationships(string characterId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CharacterRelationship>(@"
                SELECT * FROM character_relationships
                WHERE character_1_id = @Id OR character_2_id = @Id
                ORDER BY id", new { Id = characterId });
        }

        /// <summary>
        /// BL-73: every relation in the timeline, for the relations window. The graph needs the
        /// whole web at once, and a per-character query per character would be N round trips to
        /// build the same set.
        /// </summary>
        public IEnumerable<CharacterRelationship> GetRelationshipsByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            // A relation shows wherever both of its ends are in the cast, rather than where it was
            // written: a shared character brings their web with them (BL-75).
            return db.Query<CharacterRelationship>(@"
                SELECT r.* FROM character_relationships r
                JOIN characters a ON a.id = r.character_1_id
                JOIN characters b ON b.id = r.character_2_id
                WHERE (a.timeline_id = @Id OR a.shared = 1)
                  AND (b.timeline_id = @Id OR b.shared = 1)
                ORDER BY r.id", new { Id = timelineId });
        }

        /// <summary>Insert or update; the new row's id comes back either way.</summary>
        public long SaveRelationship(CharacterRelationship r)
        {
            using var db = new SqliteConnection(_connString);
            if (r.Id == 0)
                return db.QuerySingle<long>(@"
                    INSERT INTO character_relationships (
                        character_1_id, character_2_id, relationship_type, notes, timeline_id,
                        start_year, start_granularity, end_year, end_granularity,
                        absolute_start, absolute_end,
                        relationship_strength, relationship_modifier, relationship_degree
                    ) VALUES (
                        @Character1Id, @Character2Id, @RelationshipType, @Notes, @TimelineId,
                        @StartYear, @StartGranularity, @EndYear, @EndGranularity,
                        @AbsoluteStart, @AbsoluteEnd,
                        @RelationshipStrength, @RelationshipModifier, @RelationshipDegree
                    );
                    SELECT last_insert_rowid();", r);

            db.Execute(@"
                UPDATE character_relationships SET
                    character_1_id = @Character1Id, character_2_id = @Character2Id,
                    relationship_type = @RelationshipType, notes = @Notes,
                    start_year = @StartYear, start_granularity = @StartGranularity,
                    end_year = @EndYear, end_granularity = @EndGranularity,
                    absolute_start = @AbsoluteStart, absolute_end = @AbsoluteEnd,
                    relationship_strength = @RelationshipStrength,
                    relationship_modifier = @RelationshipModifier,
                    relationship_degree = @RelationshipDegree,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = @Id", r);
            return r.Id;
        }

        public void DeleteRelationship(long id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM character_relationships WHERE id = @Id", new { Id = id });
        }

        /// <summary>The kinds on offer, seeded by migration 13 and extendable by the user.</summary>
        public IEnumerable<RelationshipType> GetRelationshipTypes()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<RelationshipType>("SELECT * FROM relationship_types ORDER BY type, name");
        }

        public void SaveRelationshipType(RelationshipType t)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO relationship_types
                    (id, name, type, a_to_b, b_to_a, one_way, a_to_b_f, a_to_b_m, b_to_a_f, b_to_a_m)
                VALUES (@Id, @Name, @Type, @AToB, @BToA, @OneWay, @AToBF, @AToBM, @BToAF, @BToAM)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, type = excluded.type,
                    a_to_b = excluded.a_to_b, b_to_a = excluded.b_to_a, one_way = excluded.one_way,
                    a_to_b_f = excluded.a_to_b_f, a_to_b_m = excluded.a_to_b_m,
                    b_to_a_f = excluded.b_to_a_f, b_to_a_m = excluded.b_to_a_m", t);
        }

        /// <summary>
        /// Drops a kind. Relations already using it keep the id they were saved with — the panel shows
        /// the raw id when no type answers to it, which reads as "this kind was removed" rather than
        /// quietly deleting somebody's family tree.
        /// </summary>
        public void DeleteRelationshipType(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM relationship_types WHERE id = @Id", new { Id = id });
        }

        /// <summary>
        /// Deletes the row only. What the character owned — its portrait file and the two items
        /// <i>Show on timeline</i> generated — is cleaned up by the caller, which reads the character
        /// with <see cref="GetCharacter"/> first; those live in other repos.
        /// </summary>
        public void DeleteCharacter(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM characters WHERE id = @Id", new { Id = id });
        }
    }
}

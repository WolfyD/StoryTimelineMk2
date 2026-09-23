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

        public IEnumerable<CharacterItem> GetCharactersByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CharacterItem>(
                $"{SelectCharacter} WHERE c.timeline_id = @TimelineId ORDER BY c.name",
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
                    id, name, first_name, last_name, nicknames, aliases, race, description, notes,
                    birth_year, birth_date, birth_alternative_year,
                    death_year, death_date, death_alternative_year,
                    importance, color, state, show_on_timeline, use_highlight_color,
                    birth_subtick, birth_granularity, death_subtick, death_granularity,
                    birth_item_id, death_item_id, timeline_id
                ) VALUES (
                    @Id, @Name, @FirstName, @LastName, @Nicknames, @Aliases, @Race, @Description, @Notes,
                    @BirthYear, @BirthDate, @BirthAlternativeYear,
                    @DeathYear, @DeathDate, @DeathAlternativeYear,
                    @Importance, @Color, @State, @ShowOnTimeline, @UseHighlightColor,
                    @BirthSubtick, @BirthGranularity, @DeathSubtick, @DeathGranularity,
                    @BirthItemId, @DeathItemId, @TimelineId
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, first_name = excluded.first_name, last_name = excluded.last_name,
                    nicknames = excluded.nicknames, aliases = excluded.aliases,
                    race = excluded.race, description = excluded.description, notes = excluded.notes,
                    birth_year = excluded.birth_year,
                    birth_date = excluded.birth_date, birth_alternative_year = excluded.birth_alternative_year,
                    death_year = excluded.death_year,
                    death_date = excluded.death_date, death_alternative_year = excluded.death_alternative_year,
                    importance = excluded.importance, color = excluded.color,
                    state = excluded.state, show_on_timeline = excluded.show_on_timeline,
                    use_highlight_color = excluded.use_highlight_color,
                    birth_subtick = excluded.birth_subtick, birth_granularity = excluded.birth_granularity,
                    death_subtick = excluded.death_subtick, death_granularity = excluded.death_granularity,
                    birth_item_id = excluded.birth_item_id, death_item_id = excluded.death_item_id,
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

        /// <summary>One item a character appears in: enough to list it, colour it and jump to it.</summary>
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

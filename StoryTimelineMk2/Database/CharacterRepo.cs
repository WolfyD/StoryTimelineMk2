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

        public IEnumerable<CharacterItem> GetCharactersByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CharacterItem>("SELECT * FROM characters WHERE timeline_id = @TimelineId ORDER BY name", new { TimelineId = timelineId });
        }

        public void SaveCharacter(CharacterItem character)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO characters (
                    id, name, nicknames, aliases, race, description, notes,
                    birth_year, birth_date, birth_alternative_year,
                    death_year, death_date, death_alternative_year,
                    importance, color, timeline_id
                ) VALUES (
                    @Id, @Name, @Nicknames, @Aliases, @Race, @Description, @Notes,
                    @BirthYear, @BirthDate, @BirthAlternativeYear,
                    @DeathYear, @DeathDate, @DeathAlternativeYear,
                    @Importance, @Color, @TimelineId
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, nicknames = excluded.nicknames, aliases = excluded.aliases,
                    race = excluded.race, description = excluded.description, notes = excluded.notes,
                    birth_year = excluded.birth_year,
                    birth_date = excluded.birth_date, birth_alternative_year = excluded.birth_alternative_year,
                    death_year = excluded.death_year,
                    death_date = excluded.death_date, death_alternative_year = excluded.death_alternative_year,
                    importance = excluded.importance, color = excluded.color, updated_at = CURRENT_TIMESTAMP;";

            db.Execute(sql, character);
        }

        // --- C# BFS Graph Traversal ---
        public class CharacterEdge
        {
            public string SourceId { get; set; }
            public string TargetId { get; set; }
            public string RelationshipType { get; set; }
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

        public void DeleteCharacter(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM characters WHERE id = @Id", new { Id = id });
        }
    }
}

using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TagRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public TagRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<TagItem> GetAllTags()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TagItem>("SELECT * FROM tags ORDER BY name");
        }

        public void EnsureTagExists(string tagName)
        {
            using var db = new SqliteConnection(_connString);
            // Ignore if the tag already exists, keeping the database clean automatically
            db.Execute("INSERT OR IGNORE INTO tags (name) VALUES (@Name)", new { Name = tagName.ToLowerInvariant() });
        }

        public IEnumerable<TagItem> SearchTags(string query)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TagItem>("SELECT * FROM tags WHERE name LIKE @Query ORDER BY name LIMIT 10",
                new { Query = $"%{query.ToLowerInvariant()}%" });
        }

        /// <summary>The most-used tags of one timeline, busiest first (ties by name).</summary>
        public IEnumerable<TagItem> GetTopTags(int timelineId, int limit)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TagItem>(@"
                SELECT t.* FROM tags t
                JOIN item_tags it ON it.tag_id = t.id
                JOIN items i ON i.id = it.item_id
                WHERE i.timeline_id = @TimelineId
                GROUP BY t.id ORDER BY COUNT(*) DESC, t.name LIMIT @Limit",
                new { TimelineId = timelineId, Limit = limit });
        }

        /// <summary>Every tag with the number of items carrying it, ordered by name.</summary>
        public IEnumerable<(int Id, string Name, int UsageCount)> GetAllWithUsage()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<(int Id, string Name, int UsageCount)>(@"
                SELECT t.id, t.name, COUNT(it.item_id)
                FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id
                GROUP BY t.id ORDER BY t.name");
        }

        public void RenameTag(int id, string name)
        {
            var normalized = name.ToLowerInvariant().Trim();
            if (normalized.Length == 0) throw new ArgumentException("Tag name cannot be empty.");
            using var db = new SqliteConnection(_connString);
            if (db.ExecuteScalar<int>("SELECT COUNT(*) FROM tags WHERE name = @Name AND id <> @Id", new { Name = normalized, Id = id }) > 0)
                throw new InvalidOperationException($"A tag named '{normalized}' already exists.");
            db.Execute("UPDATE tags SET name = @Name WHERE id = @Id", new { Name = normalized, Id = id });
        }

        /// <summary>
        /// Deletes a tag and its item links (foreign keys are off in the app, so the cascade is explicit).
        /// Returns how many items lost the tag.
        /// </summary>
        public int DeleteTag(int id)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            int unlinked = db.Execute("DELETE FROM item_tags WHERE tag_id = @Id", new { Id = id }, tx);
            db.Execute("DELETE FROM tags WHERE id = @Id", new { Id = id }, tx);
            tx.Commit();
            return unlinked;
        }
    }
}

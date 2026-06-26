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

        public void DeleteTag(int id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM tags WHERE id = @Id", new { Id = id });
        }
    }
}

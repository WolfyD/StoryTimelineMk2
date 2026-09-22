using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class StoryRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public StoryRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<StoryItem> GetAllStories()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<StoryItem>("SELECT * FROM stories ORDER BY title");
        }

        public void SaveStory(StoryItem story)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO stories (id, title, description) 
                VALUES (@Id, @Title, @Description)
                ON CONFLICT(id) DO UPDATE SET 
                    title = excluded.title,
                    description = excluded.description,
                    updated_at = CURRENT_TIMESTAMP;";

            db.Execute(sql, story);
        }

        public void DeleteStory(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM stories WHERE id = @Id", new { Id = id });
        }
    }
}

using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Linq;

namespace StoryTimelineMk2.Database
{
    public class LodRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public LodRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public LodItem GetLodById(string id)
        {
            using var db = new SqliteConnection(_connString);
            return db.QuerySingle<LodItem>("SELECT * FROM lod_profiles WHERE id = @Id", new { Id = id });
        }

        public IEnumerable<LodItem> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<LodItem>("SELECT * FROM lod_profiles ORDER BY name;").ToList();
        }

        public void SaveLodProfile(LodItem lod)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO lod_profiles (id, name, profile)
                VALUES (@Id, @Name, @Profile)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    profile = excluded.profile";

            db.Execute(sql, lod);
        }

        public void DeleteCalendar(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM lod_profiles WHERE id = @Id", new { Id = id });
        }
    }
}

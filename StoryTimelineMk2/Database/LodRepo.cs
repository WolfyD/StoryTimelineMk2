using Dapper;
using Microsoft.Data.Sqlite;

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
            return db.QuerySingle<LodItem>($"SELECT * FROM lod_profiles WHERE id = '{id}'");
        }

        public void SaveLodProfile(LodItem lod)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO lod_profiles (id, name, lod_profile) 
                VALUES (@Id, @Name, @LodProfile)
                ON CONFLICT(id) DO UPDATE SET 
                    name = excluded.name,
                    lod_profile = excluded.lod_profile";

            db.Execute(sql, lod);
        }

        public void DeleteCalendar(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM lod_profiles WHERE id = @Id", new { Id = id });
        }
    }
}

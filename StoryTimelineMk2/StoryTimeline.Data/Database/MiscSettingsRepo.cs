using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class MiscSettingsRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public string Get(string key, int timelineId = 0)
        {
            using var db = new SqliteConnection(_connString);
            return db.QueryFirstOrDefault<string>(
                "SELECT value FROM misc_settings WHERE key = @Key AND timeline_id = @TlId",
                new { Key = key, TlId = timelineId })!;
        }

        public void Set(string key, string value, int timelineId = 0)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO misc_settings (key, timeline_id, value) VALUES (@Key, @TlId, @Value)
                ON CONFLICT(key, timeline_id) DO UPDATE SET value = excluded.value",
                new { Key = key, TlId = timelineId, Value = value });
        }

        public void Delete(string key, int timelineId = 0)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM misc_settings WHERE key = @Key AND timeline_id = @TlId",
                new { Key = key, TlId = timelineId });
        }
    }
}

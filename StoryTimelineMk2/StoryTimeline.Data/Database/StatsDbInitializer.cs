using Microsoft.Data.Sqlite;
using StoryTimelineMk2.Database.Migrations;

namespace StoryTimelineMk2.Database
{
    internal static class StatsDbInitializer
    {
        public static string GetStatsDbPath() =>
            Path.Combine(AppContext.BaseDirectory, "usage.sqlite");

        public static string GetConnectionString() =>
            $"Data Source={GetStatsDbPath()}";

        /// <summary>
        /// Creates or migrates usage.sqlite (see <see cref="StatsDbMigrations"/>). An out-of-date file is
        /// backed up next to the timeline backups first, marked "(usage stats)" so it is never confused with one.
        /// </summary>
        public static void Initialize()
        {
            string path = GetStatsDbPath();
            using var db = new SqliteConnection($"Data Source={path}");
            db.Open();
            SchemaMigrator.Migrate(db, path, StatsDbMigrations.Steps, "usage statistics", backupFirst: true, backupSuffix: " (usage stats)");
        }
    }
}

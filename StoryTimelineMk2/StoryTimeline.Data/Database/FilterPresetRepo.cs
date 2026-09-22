using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class FilterPresetRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public FilterPresetRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<FilterPresetItem> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<FilterPresetItem>("SELECT * FROM filter_presets ORDER BY created_at");
        }

        public void Save(FilterPresetItem preset)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO filter_presets (id, name, rules_json, and_mode)
                VALUES (@Id, @Name, @RulesJson, @AndMode)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    rules_json = excluded.rules_json,
                    and_mode = excluded.and_mode", preset);
        }

        public void Delete(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM filter_presets WHERE id = @Id", new { Id = id });
        }
    }
}

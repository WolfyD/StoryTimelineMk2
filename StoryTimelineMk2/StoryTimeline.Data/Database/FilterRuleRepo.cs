using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class FilterRuleRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public FilterRuleRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<FilterRuleItem> GetByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<FilterRuleItem>(
                "SELECT * FROM timeline_filter_rules WHERE timeline_id = @TimelineId ORDER BY sort_order",
                new { TimelineId = timelineId });
        }

        public void Save(FilterRuleItem rule)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO timeline_filter_rules (id, timeline_id, dimension, params_json, label, state, sort_order)
                VALUES (@Id, @TimelineId, @Dimension, @ParamsJson, @Label, @State, @SortOrder)
                ON CONFLICT(id) DO UPDATE SET
                    dimension = excluded.dimension,
                    params_json = excluded.params_json,
                    label = excluded.label,
                    state = excluded.state,
                    sort_order = excluded.sort_order", rule);
        }

        public void Delete(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM timeline_filter_rules WHERE id = @Id", new { Id = id });
        }

        public void DeleteAllForTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM timeline_filter_rules WHERE timeline_id = @TimelineId",
                new { TimelineId = timelineId });
        }
    }
}

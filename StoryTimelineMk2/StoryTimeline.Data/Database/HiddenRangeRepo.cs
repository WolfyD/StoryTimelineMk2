using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class HiddenRangeRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public HiddenRangeRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<HiddenRangeItem> GetByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<HiddenRangeItem>(
                "SELECT * FROM timeline_hidden_ranges WHERE timeline_id = @TimelineId ORDER BY start_year",
                new { TimelineId = timelineId });
        }

        public int Save(HiddenRangeItem item)
        {
            using var db = new SqliteConnection(_connString);
            if (item.Id == 0)
            {
                return db.QuerySingle<int>(@"
                    INSERT INTO timeline_hidden_ranges (timeline_id, start_year, end_year, label)
                    VALUES (@TimelineId, @StartYear, @EndYear, @Label);
                    SELECT last_insert_rowid();",
                    item);
            }
            else
            {
                db.Execute(@"
                    UPDATE timeline_hidden_ranges
                    SET start_year = @StartYear, end_year = @EndYear, label = @Label
                    WHERE id = @Id",
                    item);
                return item.Id;
            }
        }

        /// <summary>Returns the timeline the range was on, or null if there was no such range.</summary>
        public int? Delete(int id)
        {
            using var db = new SqliteConnection(_connString);
            var timelineId = db.QuerySingleOrDefault<int?>(
                "SELECT timeline_id FROM timeline_hidden_ranges WHERE id = @Id", new { Id = id });
            db.Execute("DELETE FROM timeline_hidden_ranges WHERE id = @Id", new { Id = id });
            return timelineId;
        }
    }
}

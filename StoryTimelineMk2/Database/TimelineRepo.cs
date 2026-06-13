using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TimelineRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public TimelineRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public bool CheckIfTimelineTitleExists(string title)
        {
            using var db = new SqliteConnection(_connString);
            var q = db.QuerySingle<int>($@"SELECT count(*) FROM timelines WHERE title='{title}';");
            return q > 0;
        }

        public int CreateTimeline(string title)
        {
            if (CheckIfTimelineTitleExists(title)) { return -1; }

            using var db = new SqliteConnection(_connString);

            TimelineInfo timelineInfo = new TimelineInfo()
            {
                Title = title,
                StartYear = 0,
                Description = "",
                Author = ""
            };

            string sql = @"INSERT INTO timelines (title, author, description, start_year, granularity)
                            VALUES (@Title, @Author, @Description, @StartYear, @Granularity)";
            db.Execute(sql, timelineInfo);

            var q = db.QuerySingle<int>("SELECT max(id) FROM timelines;");
            return q;
        }

        public IEnumerable<TimelineInfo> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TimelineInfo>("SELECT * FROM timelines ORDER BY title;");
        }

        public TimelineInfo GetTimelineById(int id)
        {
            using var db = new SqliteConnection(_connString);
            var TL = db.QueryFirst<TimelineInfo>($"SELECT * FROM timelines WHERE id='{id}' LIMIT 1;");
            var cal = new CalendarRepo().GetCalendarById(TL.CalendarId);
            var set = new SettingsRepo().GetTimelineSettings(id);
            var ls = new LayoutSettingsRepo().GetById(TL.LayoutSettingsId);
            TL.Calendar = cal;
            TL.Settings = set;
            TL.LayoutSettings = ls;
            return TL;
        }

        public void SaveTimeline(TimelineInfo timeline)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO timelines (id, title, author, description, start_year, granularity) 
                VALUES (@Id, @Title, @Author, @Description, @StartYear, @Granularity)
                ON CONFLICT(id) DO UPDATE SET 
                    title = excluded.title,
                    author = excluded.author,
                    description = excluded.description,
                    start_year = excluded.start_year,
                    granularity = excluded.granularity,
                    updated_at = CURRENT_TIMESTAMP;";
                    
            db.Execute(sql, timeline);
        }

        public void DeleteTimeline(int id)
        {
            using var db = new SqliteConnection(_connString);
            // ON DELETE CASCADE in SQLite handles dropping all associated items, characters, and settings
            db.Execute("DELETE FROM timelines WHERE id = @Id", new { Id = id });
        }
    }
}

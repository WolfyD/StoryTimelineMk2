using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class CalendarRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public CalendarRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public CalendarItem GetCalendarById(string timelineId)
        {
            using var db = new SqliteConnection(_connString);
            CalendarItem Cal = db.QuerySingle<CalendarItem>($"SELECT * FROM calendars WHERE id = '{timelineId}'");
            var Lod = new LodRepo().GetLodById(Cal.LodProfileId);
            Cal.LodProfile = Lod;
            return Cal;
        }

        public void SaveCalendar(CalendarItem calendar)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO calendars (id, name, short_name, alternate_name, name_before_0, name_after_0, default_calendar, year_0_at_default, timeline_id) 
                VALUES (@Id, @Name, @ShortName, @AlternateName, @NameBefore0, @NameAfter0, @DefaultCalendar, @Year0AtDefault, @TimelineId)
                ON CONFLICT(id) DO UPDATE SET 
                    name = excluded.name,
                    short_name = excluded.short_name,
                    alternate_name = excluded.alternate_name,
                    name_before_0 = excluded.name_before_0,
                    name_after_0 = excluded.name_after_0,
                    default_calendar = excluded.default_calendar,
                    year_0_at_default = excluded.year_0_at_default;";

            db.Execute(sql, calendar);
        }

        public void DeleteCalendar(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM calendars WHERE id = @Id", new { Id = id });
        }
    }
}

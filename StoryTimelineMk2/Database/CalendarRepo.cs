using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Linq;

namespace StoryTimelineMk2.Database
{
    public class CalendarRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public CalendarRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public CalendarItem GetCalendarById(string id)
        {
            using var db = new SqliteConnection(_connString);
            CalendarItem cal = db.QuerySingle<CalendarItem>("SELECT * FROM calendars WHERE id = @Id", new { Id = id });
            cal.LodProfile = new LodRepo().GetLodById(cal.LodProfileId);
            return cal;
        }

        public void SaveCalendar(CalendarItem calendar)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO calendars (id, name, short_name, alternate_name, name_before_0, name_after_0, lod_profile_id, year_definition)
                VALUES (@Id, @Name, @ShortName, @AlternateName, @NameBefore0, @NameAfter0, @LodProfileId, @YearDefinition)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    short_name = excluded.short_name,
                    alternate_name = excluded.alternate_name,
                    name_before_0 = excluded.name_before_0,
                    name_after_0 = excluded.name_after_0,
                    lod_profile_id = excluded.lod_profile_id,
                    year_definition = excluded.year_definition;";
            db.Execute(sql, calendar);
        }

        public void SaveCalendarWithLod(CalendarItem calendar)
        {
            new LodRepo().SaveLodProfile(calendar.LodProfile);
            calendar.LodProfileId = calendar.LodProfile.Id;
            SaveCalendar(calendar);
        }

        public IEnumerable<CalendarItem> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<CalendarItem>("SELECT * FROM calendars ORDER BY name;").ToList();
        }

        public void DeleteCalendar(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM calendars WHERE id = @Id", new { Id = id });
        }
    }
}

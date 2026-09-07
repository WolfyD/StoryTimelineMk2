using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class NoteRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public NoteRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<NoteItem> GetTimelineNotes(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<NoteItem>("SELECT * FROM notes WHERE timeline_id = @TimelineId;", new { TimelineId = timelineId });
        }

        public string SaveNote(NoteItem note)
        {
            if (string.IsNullOrEmpty(note.Id)) note.Id = Guid.NewGuid().ToString();
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO notes (id, timeline_id, connected_item_id, note_contents, nearest_year, absolute_time, updated_at)
                VALUES (@Id, @TimelineId, @ConnectedItemId, @NoteContents, @NearestYear, @AbsoluteTime, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    note_contents = excluded.note_contents,
                    nearest_year  = excluded.nearest_year,
                    absolute_time = excluded.absolute_time,
                    updated_at    = CURRENT_TIMESTAMP;";
            db.Execute(sql, new {
                note.Id,
                note.TimelineId,
                ConnectedItemId = string.IsNullOrEmpty(note.ConnectedItemId) ? (string?)null : note.ConnectedItemId,
                note.NoteContents,
                note.NearestYear,
                note.AbsoluteTime,
            });
            return note.Id;
        }

        public void DeleteNote(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM notes WHERE id = @Id", new { Id = id });
        }
    }
}

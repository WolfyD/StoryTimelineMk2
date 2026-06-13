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

        public void SaveNote(NoteItem note)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO notes (id, timeline_id, connected_item_id, note_contents, updated_at) 
                VALUES (@Id, @TimelineId, @ConnectedItemId, @NoteContents, @UpdatedAt)
                ON CONFLICT(id) DO UPDATE SET 
                    timeline_id         = excluded.timeline_id
                    connected_item_id   = excluded.connected_item_id
                    note_contents       = excluded.note_contents
                    updated_at          = CURRENT_TIMESTAMP;";

            db.Execute(sql, note);
        }

        public void DeleteNote(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM notes WHERE id = @Id", new { Id = id });
        }
    }
}

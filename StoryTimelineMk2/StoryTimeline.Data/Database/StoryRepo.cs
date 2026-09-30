using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class StoryRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public StoryRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<StoryItem> GetAllStories()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<StoryItem>("SELECT * FROM stories ORDER BY title");
        }

        /// <summary>
        /// BL-88: every story with the links the Archive edits, as seen from one timeline — its own
        /// characters (and shared ones) and its own places. Stories are global, so all of them come
        /// back; which to list is the page's call, since it already knows this timeline's references.
        /// </summary>
        public List<StoryItem> GetArchiveStories(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            var p = new { TimelineId = timelineId };

            var stories = db.Query<StoryItem>(@"
                SELECT s.*,
                       (SELECT COUNT(*) FROM item_story_refs r JOIN items i ON i.id = r.item_id
                        WHERE r.story_id = s.id AND i.timeline_id <> @TimelineId) AS other_timeline_refs,
                       -- Older rows may have two followers; a save here brings it down to one.
                       (SELECT n.id FROM stories n WHERE n.previous_story_id = s.id
                        ORDER BY n.title COLLATE NOCASE LIMIT 1) AS next_story_id
                FROM stories s
                ORDER BY s.reading_order IS NULL, s.reading_order, s.title COLLATE NOCASE", p).ToList();
            if (stories.Count == 0) return stories;

            var byId = stories.ToDictionary(s => s.Id);

            foreach (var (storyId, characterId, pov) in db.Query<(string, string, long)>(@"
                SELECT sc.story_id, sc.character_id, sc.pov FROM story_characters sc
                JOIN characters c ON c.id = sc.character_id
                WHERE c.timeline_id = @TimelineId OR c.shared = 1", p))
                if (byId.TryGetValue(storyId, out var s))
                    s.Characters.Add(new StoryCharacterLink { CharacterId = characterId, Pov = pov != 0 });

            foreach (var (storyId, locationId) in db.Query<(string, string)>(@"
                SELECT sl.story_id, sl.location_id FROM story_locations sl
                JOIN locations l ON l.id = sl.location_id
                JOIN maps m ON m.id = l.map_id
                WHERE m.timeline_id = @TimelineId", p))
                if (byId.TryGetValue(storyId, out var s)) s.LocationIds.Add(locationId);

            foreach (var (storyId, bookId) in db.Query<(string, string)>(
                "SELECT story_id, book_id FROM book_stories"))
                if (byId.TryGetValue(storyId, out var s)) s.BookIds.Add(bookId);

            foreach (var (storyId, chapterId) in db.Query<(string, string)>(
                "SELECT story_id, chapter_id FROM story_chapters"))
                if (byId.TryGetValue(storyId, out var s)) s.ChapterIds.Add(chapterId);

            return stories;
        }

        /// <summary>
        /// Upserts the story. Given a timeline, it also replaces the story's links as that timeline sees
        /// them: its characters and places (another timeline's stay put, since this one cannot show
        /// them) and its books, which are global — and its next story, so the chain can be set from
        /// either end. One transaction, so a save is all or nothing.
        /// </summary>
        public void SaveStory(StoryItem story, int? timelineId = null)
        {
            if (string.IsNullOrEmpty(story.Id)) story.Id = Guid.NewGuid().ToString();
            // A story cannot follow itself, nor come both before and after another.
            string? prev = string.IsNullOrEmpty(story.PreviousStoryId) || story.PreviousStoryId == story.Id ? null : story.PreviousStoryId;
            string? next = string.IsNullOrEmpty(story.NextStoryId) || story.NextStoryId == story.Id || story.NextStoryId == prev ? null : story.NextStoryId;
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();

            db.Execute(@"
                INSERT INTO stories (id, title, description, status, tense, person, genre, color,
                                     reading_order, previous_story_id, quotes, notes)
                VALUES (@Id, @Title, @Description, @Status, @Tense, @Person, @Genre, @Color,
                        @ReadingOrder, @PreviousStoryId, @Quotes, @Notes)
                ON CONFLICT(id) DO UPDATE SET
                    title             = excluded.title,
                    description       = excluded.description,
                    status            = excluded.status,
                    tense             = excluded.tense,
                    person            = excluded.person,
                    genre             = excluded.genre,
                    color             = excluded.color,
                    reading_order     = excluded.reading_order,
                    previous_story_id = excluded.previous_story_id,
                    quotes            = excluded.quotes,
                    notes             = excluded.notes,
                    updated_at        = CURRENT_TIMESTAMP;",
                new
                {
                    story.Id, story.Title, story.Description, story.Status, story.Tense, story.Person,
                    story.Genre, story.Color, story.ReadingOrder, story.Quotes, story.Notes,
                    PreviousStoryId = prev,
                }, tx);

            // One next per story: whatever else followed its previous no longer does.
            // ponytail: only the neighbours are kept in step; a longer loop (A→B→C→A) is allowed.
            db.Execute("UPDATE stories SET previous_story_id = NULL WHERE previous_story_id = @Prev AND id <> @Id",
                new { Prev = prev, story.Id }, tx);

            if (timelineId is int t)
            {
                // Only the Archive sends a next; the item editor's quick add must not cut the chain.
                db.Execute(@"
                    UPDATE stories SET previous_story_id = NULL WHERE previous_story_id = @Id AND id IS NOT @Next;
                    UPDATE stories SET previous_story_id = @Id WHERE id = @Next;", new { story.Id, Next = next }, tx);

                var p = new { story.Id, TimelineId = t };
                db.Execute(@"
                    DELETE FROM story_characters WHERE story_id = @Id AND character_id IN
                        (SELECT id FROM characters WHERE timeline_id = @TimelineId OR shared = 1);
                    DELETE FROM story_locations WHERE story_id = @Id AND location_id IN
                        (SELECT l.id FROM locations l JOIN maps m ON m.id = l.map_id WHERE m.timeline_id = @TimelineId);
                    DELETE FROM book_stories WHERE story_id = @Id;
                    DELETE FROM story_chapters WHERE story_id = @Id;", p, tx);

                db.Execute("INSERT OR IGNORE INTO story_characters (story_id, character_id, pov) VALUES (@StoryId, @CharacterId, @Pov)",
                    story.Characters.Select(c => new { StoryId = story.Id, c.CharacterId, Pov = c.Pov ? 1 : 0 }), tx);
                db.Execute("INSERT OR IGNORE INTO story_locations (story_id, location_id) VALUES (@StoryId, @LocationId)",
                    story.LocationIds.Select(id => new { StoryId = story.Id, LocationId = id }), tx);
                db.Execute("INSERT OR IGNORE INTO book_stories (book_id, story_id) VALUES (@BookId, @StoryId)",
                    story.BookIds.Select(id => new { StoryId = story.Id, BookId = id }), tx);
                // Only chapters of a book it is in: dropping a book drops its chapters with it.
                db.Execute(@"
                    INSERT OR IGNORE INTO story_chapters (story_id, chapter_id)
                    SELECT @StoryId, c.id FROM chapters c
                    JOIN book_stories bs ON bs.book_id = c.book_id AND bs.story_id = @StoryId
                    WHERE c.id = @ChapterId",
                    story.ChapterIds.Select(id => new { StoryId = story.Id, ChapterId = id }), tx);
            }

            tx.Commit();
        }

        /// <summary>
        /// The story and everything that points at it, in every timeline — the Archive says so before
        /// it gets here. Foreign keys are off in the app, so the cascade is spelled out.
        /// </summary>
        public void DeleteStory(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            db.Execute(@"
                DELETE FROM item_story_refs  WHERE story_id = @Id;
                DELETE FROM book_stories     WHERE story_id = @Id;
                DELETE FROM story_characters WHERE story_id = @Id;
                DELETE FROM story_locations  WHERE story_id = @Id;
                DELETE FROM story_chapters   WHERE story_id = @Id;
                UPDATE items   SET story_id = NULL          WHERE story_id = @Id;
                UPDATE stories SET previous_story_id = NULL WHERE previous_story_id = @Id;
                DELETE FROM stories WHERE id = @Id;", new { Id = id }, tx);
            tx.Commit();
        }
    }
}

using Dapper;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;

namespace StoryTimelineMk2.Database
{
    public class BookRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public BookRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<BookItem> SearchBooks(string query)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<BookItem>("SELECT * FROM books WHERE title LIKE @Query ORDER BY title LIMIT 20",
                new { Query = $"%{query}%" });
        }

        public IEnumerable<ChapterItem> GetChaptersForBook(string bookId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ChapterItem>("SELECT * FROM chapters WHERE book_id = @BookId ORDER BY number",
                new { BookId = bookId });
        }

        public string SaveBook(BookItem book)
        {
            if (string.IsNullOrEmpty(book.Id)) book.Id = Guid.NewGuid().ToString();
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO books (id, title, author, description)
                VALUES (@Id, @Title, @Author, @Description)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title, author = excluded.author,
                    description = excluded.description, updated_at = CURRENT_TIMESTAMP;",
                book);
            return book.Id;
        }

        public string SaveChapter(ChapterItem chapter)
        {
            if (string.IsNullOrEmpty(chapter.Id)) chapter.Id = Guid.NewGuid().ToString();
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO chapters (id, book_id, number, title)
                VALUES (@Id, @BookId, @Number, @Title)
                ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title;",
                chapter);
            return chapter.Id;
        }

        /// <summary>
        /// BL-88: every book with its chapters, and under each chapter the items of this timeline that
        /// cite it. Books are global like stories, so all come back and the page decides which to list.
        /// </summary>
        public List<BookItem> GetArchiveBooks(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            var p = new { TimelineId = timelineId };

            var books = db.Query<BookItem>(@"
                SELECT b.*,
                       (SELECT COUNT(*) FROM item_chapters ic
                        JOIN chapters c ON c.id = ic.chapter_id
                        JOIN items i ON i.id = ic.item_id
                        WHERE c.book_id = b.id AND i.timeline_id <> @TimelineId) AS other_timeline_refs
                FROM books b
                ORDER BY b.title COLLATE NOCASE", p).ToList();
            if (books.Count == 0) return books;

            var byBook = books.ToDictionary(b => b.Id);
            var byChapter = new Dictionary<string, ChapterItem>();
            foreach (var chapter in db.Query<ChapterItem>("SELECT * FROM chapters ORDER BY number"))
            {
                if (!byBook.TryGetValue(chapter.BookId, out var book)) continue;
                book.Chapters.Add(chapter);
                byChapter[chapter.Id] = chapter;
            }

            foreach (var (chapterId, itemId) in db.Query<(string, string)>(@"
                SELECT ic.chapter_id, ic.item_id FROM item_chapters ic
                JOIN items i ON i.id = ic.item_id
                WHERE i.timeline_id = @TimelineId", p))
                if (byChapter.TryGetValue(chapterId, out var c)) c.ItemIds.Add(itemId);

            return books;
        }

        /// <summary>The book, its chapters and every link to them. Foreign keys are off, so spelled out.</summary>
        public void DeleteBook(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            db.Execute(@"
                DELETE FROM item_chapters  WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = @Id);
                DELETE FROM story_chapters WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = @Id);
                DELETE FROM chapters       WHERE book_id = @Id;
                DELETE FROM book_stories   WHERE book_id = @Id;
                DELETE FROM books          WHERE id = @Id;", new { Id = id }, tx);
            tx.Commit();
        }

        public void DeleteChapter(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            db.Execute(@"
                DELETE FROM item_chapters  WHERE chapter_id = @Id;
                DELETE FROM story_chapters WHERE chapter_id = @Id;
                DELETE FROM chapters       WHERE id = @Id;", new { Id = id }, tx);
            tx.Commit();
        }
    }
}

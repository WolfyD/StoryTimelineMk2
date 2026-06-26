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
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                INSERT INTO chapters (id, book_id, number, title)
                VALUES (@Id, @BookId, @Number, @Title)
                ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title;",
                chapter);
            return chapter.Id;
        }
    }
}

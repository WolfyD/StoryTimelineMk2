using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class BookRepoTests
{
    private static BookItem MakeBook(string? id = null, string title = "Test Book") => new()
    {
        Id = id ?? Guid.NewGuid().ToString(),
        Title = title,
        Author = "Test Author",
        Description = "A test book"
    };

    private static ChapterItem MakeChapter(string bookId, int number = 1, string? id = null) => new()
    {
        Id = id ?? Guid.NewGuid().ToString(),
        BookId = bookId,
        Number = number,
        Title = $"Chapter {number}"
    };

    // ── SearchBooks ───────────────────────────────────────────────────────────

    [Fact]
    public void SearchBooks_ReturnsEmpty_WhenNoBooks()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var results = repo.SearchBooks("anything").ToList();

        Assert.Empty(results);
    }

    [Fact]
    public void SearchBooks_ReturnsMatchingBooks_ByTitleSubstring()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        repo.SaveBook(MakeBook(title: "Lord of the Rings"));
        repo.SaveBook(MakeBook(title: "Fellowship of the Ring"));
        repo.SaveBook(MakeBook(title: "The Hobbit"));

        var results = repo.SearchBooks("Ring").ToList();
        Assert.Equal(2, results.Count);
        Assert.All(results, b => Assert.Contains("Ring", b.Title));
    }

    [Fact]
    public void SearchBooks_ReturnsNoResults_WhenQueryDoesNotMatch()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        repo.SaveBook(MakeBook(title: "A Book About Dragons"));

        var results = repo.SearchBooks("xyz-no-match").ToList();
        Assert.Empty(results);
    }

    [Fact]
    public void SearchBooks_ReturnsAtMostTwentyResults()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        for (int i = 1; i <= 25; i++)
        {
            repo.SaveBook(MakeBook(title: $"Search Result Book {i:D2}"));
        }

        var results = repo.SearchBooks("Search Result Book").ToList();
        Assert.True(results.Count <= 20);
    }

    // ── SaveBook ──────────────────────────────────────────────────────────────

    [Fact]
    public void SaveBook_ReturnsBookId()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook("book-test-001");
        var returnedId = repo.SaveBook(book);

        Assert.Equal("book-test-001", returnedId);
    }

    [Fact]
    public void SaveBook_PersistsAllFields()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = new BookItem
        {
            Id = Guid.NewGuid().ToString(),
            Title = "Detailed Book",
            Author = "Famous Author",
            Description = "An epic tale"
        };
        repo.SaveBook(book);

        var results = repo.SearchBooks("Detailed Book").ToList();
        var retrieved = results.Single();

        Assert.Equal("Detailed Book", retrieved.Title);
        Assert.Equal("Famous Author", retrieved.Author);
        Assert.Equal("An epic tale", retrieved.Description);
    }

    [Fact]
    public void SaveBook_UpdatesExistingBook_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook("book-upsert", "Original Title");
        repo.SaveBook(book);

        book.Title = "Revised Title";
        book.Author = "New Author";
        repo.SaveBook(book);

        var results = repo.SearchBooks("Revised Title").ToList();
        Assert.Single(results);
        Assert.Equal("New Author", results[0].Author);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM books WHERE id = 'book-upsert'");
        Assert.Equal(1, count);
    }

    // ── GetChaptersForBook ────────────────────────────────────────────────────

    [Fact]
    public void GetChaptersForBook_ReturnsEmpty_WhenNoChapters()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook();
        repo.SaveBook(book);

        var chapters = repo.GetChaptersForBook(book.Id).ToList();
        Assert.Empty(chapters);
    }

    [Fact]
    public void GetChaptersForBook_ReturnsOnlyChaptersForGivenBook()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book1 = MakeBook(title: "Book One");
        var book2 = MakeBook(title: "Book Two");
        repo.SaveBook(book1);
        repo.SaveBook(book2);

        repo.SaveChapter(MakeChapter(book1.Id, 1));
        repo.SaveChapter(MakeChapter(book1.Id, 2));
        repo.SaveChapter(MakeChapter(book2.Id, 1));

        var book1Chapters = repo.GetChaptersForBook(book1.Id).ToList();
        Assert.Equal(2, book1Chapters.Count);
        Assert.All(book1Chapters, c => Assert.Equal(book1.Id, c.BookId));
    }

    [Fact]
    public void GetChaptersForBook_ReturnsChaptersOrderedByNumber()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook();
        repo.SaveBook(book);

        repo.SaveChapter(MakeChapter(book.Id, 3));
        repo.SaveChapter(MakeChapter(book.Id, 1));
        repo.SaveChapter(MakeChapter(book.Id, 2));

        var chapters = repo.GetChaptersForBook(book.Id).ToList();
        Assert.Equal(1, chapters[0].Number);
        Assert.Equal(2, chapters[1].Number);
        Assert.Equal(3, chapters[2].Number);
    }

    // ── SaveChapter ───────────────────────────────────────────────────────────

    [Fact]
    public void SaveChapter_ReturnsChapterId()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook();
        repo.SaveBook(book);

        var chapter = MakeChapter(book.Id, 1, "chapter-001");
        var returnedId = repo.SaveChapter(chapter);

        Assert.Equal("chapter-001", returnedId);
    }

    [Fact]
    public void SaveChapter_UpdatesExistingChapter_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook();
        repo.SaveBook(book);

        var chapter = MakeChapter(book.Id, 1, "ch-upsert");
        repo.SaveChapter(chapter);

        chapter.Number = 99;
        chapter.Title = "The Final Chapter";
        repo.SaveChapter(chapter);

        var chapters = repo.GetChaptersForBook(book.Id).ToList();
        Assert.Single(chapters);
        Assert.Equal(99, chapters[0].Number);
        Assert.Equal("The Final Chapter", chapters[0].Title);
    }

    // ── Cascade delete: deleting a book removes its chapters ──────────────────

    [Fact]
    public void DeletingBook_CascadesToChapters()
    {
        using var ctx = new DbTestContext();

        var repo = new BookRepo();
        var book = MakeBook("book-cascade-test");
        repo.SaveBook(book);
        repo.SaveChapter(MakeChapter(book.Id, 1));
        repo.SaveChapter(MakeChapter(book.Id, 2));

        using var db = ctx.OpenConnection();
        db.Execute("DELETE FROM books WHERE id = @Id", new { book.Id });

        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM chapters WHERE book_id = @Id", new { book.Id });
        Assert.Equal(0, count);
    }
}

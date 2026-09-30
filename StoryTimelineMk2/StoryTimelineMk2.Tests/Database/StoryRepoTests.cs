using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class StoryRepoTests
{
    private static StoryItem MakeStory(string? id = null, string title = "Test Story") => new()
    {
        Id = id ?? Guid.NewGuid().ToString(),
        Title = title,
        Description = "A test story description"
    };

    // ── GetAllStories ─────────────────────────────────────────────────────────

    [Fact]
    public void GetAllStories_ReturnsEmpty_OnFreshDatabase()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var stories = repo.GetAllStories().ToList();

        Assert.Empty(stories);
    }

    [Fact]
    public void GetAllStories_ReturnsAllStories_AfterInsertion()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        repo.SaveStory(MakeStory(title: "Story One"));
        repo.SaveStory(MakeStory(title: "Story Two"));
        repo.SaveStory(MakeStory(title: "Story Three"));

        var stories = repo.GetAllStories().ToList();
        Assert.Equal(3, stories.Count);
    }

    [Fact]
    public void GetAllStories_IsOrderedByTitle()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        repo.SaveStory(MakeStory(title: "Zebra Story"));
        repo.SaveStory(MakeStory(title: "Alpha Story"));
        repo.SaveStory(MakeStory(title: "Mango Story"));

        var stories = repo.GetAllStories().ToList();
        var titles = stories.Select(s => s.Title).ToList();

        Assert.Equal(titles.OrderBy(t => t).ToList(), titles);
    }

    // ── SaveStory (insert) ────────────────────────────────────────────────────

    [Fact]
    public void SaveStory_InsertsNewStory_WithCorrectId()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = MakeStory("story-test-id-001");
        repo.SaveStory(story);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM stories WHERE id = 'story-test-id-001'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveStory_PersistsAllFields()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = new StoryItem
        {
            Id = Guid.NewGuid().ToString(),
            Title = "Detailed Story",
            Description = "This is a very detailed description"
        };
        repo.SaveStory(story);

        var stories = repo.GetAllStories().ToList();
        var retrieved = stories.Single(s => s.Id == story.Id);

        Assert.Equal("Detailed Story", retrieved.Title);
        Assert.Equal("This is a very detailed description", retrieved.Description);
    }

    // ── SaveStory (upsert / update) ───────────────────────────────────────────

    [Fact]
    public void SaveStory_UpdatesExistingStory_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = MakeStory("story-upsert-test", "Original Title");
        repo.SaveStory(story);

        story.Title = "Updated Title";
        story.Description = "Updated description";
        repo.SaveStory(story);

        var stories = repo.GetAllStories().ToList();
        Assert.Single(stories);
        Assert.Equal("Updated Title", stories[0].Title);
        Assert.Equal("Updated description", stories[0].Description);
    }

    [Fact]
    public void SaveStory_Update_DoesNotCreateDuplicateRow()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = MakeStory("story-dup-test");
        repo.SaveStory(story);
        story.Title = "Changed";
        repo.SaveStory(story);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM stories WHERE id = 'story-dup-test'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveStory_SetsUpdatedAt_OnConflict()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = MakeStory();
        repo.SaveStory(story);

        using var db = ctx.OpenConnection();
        var initialUpdated = db.QuerySingle<DateTime>("SELECT updated_at FROM stories WHERE id = @Id", new { story.Id });

        story.Title = "Newer Title";
        repo.SaveStory(story);

        var newUpdated = db.QuerySingle<DateTime>("SELECT updated_at FROM stories WHERE id = @Id", new { story.Id });

        // updated_at should be >= initial (same second at minimum)
        Assert.True(newUpdated >= initialUpdated);
    }

    // ── DeleteStory ───────────────────────────────────────────────────────────

    [Fact]
    public void DeleteStory_RemovesStoryFromDatabase()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var story = MakeStory("story-to-delete");
        repo.SaveStory(story);

        repo.DeleteStory("story-to-delete");

        var stories = repo.GetAllStories().ToList();
        Assert.DoesNotContain(stories, s => s.Id == "story-to-delete");
    }

    [Fact]
    public void DeleteStory_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var ex = Record.Exception(() => repo.DeleteStory("nonexistent-story-id"));
        Assert.Null(ex);
    }

    [Fact]
    public void DeleteStory_LeavesOtherStoriesIntact()
    {
        using var ctx = new DbTestContext();

        var repo = new StoryRepo();
        var keepStory = MakeStory(title: "Keep Me");
        var deleteStory = MakeStory(title: "Delete Me");
        repo.SaveStory(keepStory);
        repo.SaveStory(deleteStory);

        repo.DeleteStory(deleteStory.Id);

        var stories = repo.GetAllStories().ToList();
        Assert.Single(stories);
        Assert.Equal(keepStory.Id, stories[0].Id);
    }

    // ── BL-88: the Archive's story editor ─────────────────────────────────────

    /// <summary>
    /// Stories are shared but characters are not: a save from one timeline must replace only that
    /// timeline's links and leave another timeline's alone, and a delete must take every link with it.
    /// </summary>
    [Fact]
    public void SaveStory_WithTimeline_ReplacesOnlyThatTimelinesLinks_AndDeleteCleansUp()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        int Timeline(string t)
        {
            db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@t, '', '', 0)", new { t });
            return db.QuerySingle<int>("SELECT last_insert_rowid()");
        }
        int tl1 = Timeline("One"), tl2 = Timeline("Two");
        db.Execute("INSERT INTO characters (id, name, timeline_id) VALUES ('alice', 'Alice', @tl1), ('bob', 'Bob', @tl2), ('carl', 'Carl', @tl1)", new { tl1, tl2 });
        db.Execute("INSERT INTO books (id, title) VALUES ('book', 'Book')");

        var repo = new StoryRepo();
        var story = MakeStory(title: "Shared");
        story.Status = "Drafting";
        story.Quotes = "[\"a\"]";
        story.Characters = [new() { CharacterId = "alice", Pov = true }];
        story.BookIds = ["book"];
        repo.SaveStory(story, tl1);
        story.Characters = [new() { CharacterId = "bob" }];
        repo.SaveStory(story, tl2);

        // Timeline one drops Alice for Carl; Bob, who belongs to timeline two, must survive it.
        story.Characters = [new() { CharacterId = "carl" }];
        repo.SaveStory(story, tl1);

        var seen = repo.GetArchiveStories(tl1).Single();
        Assert.Equal("Drafting", seen.Status);
        Assert.Equal("[\"a\"]", seen.Quotes);
        Assert.Equal(["carl"], seen.Characters.Select(c => c.CharacterId));
        Assert.Equal(["book"], seen.BookIds);
        Assert.Equal(["bob"], repo.GetArchiveStories(tl2).Single().Characters.Select(c => c.CharacterId));

        repo.DeleteStory(story.Id);
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM story_characters"));
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM book_stories"));
    }

    /// <summary>Stories make one chain: previous or next, set from either end, moves the neighbour with it.</summary>
    [Fact]
    public void SaveStory_KeepsOneChain_FromEitherEnd()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES ('One', '', '', 0)");
        int tl = db.QuerySingle<int>("SELECT last_insert_rowid()");
        var repo = new StoryRepo();
        StoryItem a = MakeStory("a", "A"), b = MakeStory("b", "B"), c = MakeStory("c", "C");
        foreach (var s in new[] { a, b, c }) repo.SaveStory(s, tl);
        string? Prev(string id) => db.QuerySingle<string?>("SELECT previous_story_id FROM stories WHERE id = @id", new { id });
        string? Next(string id) => repo.GetArchiveStories(tl).Single(s => s.Id == id).NextStoryId;

        a.NextStoryId = "b";                       // from the front
        repo.SaveStory(a, tl);
        Assert.Equal("a", Prev("b"));
        Assert.Equal("b", Next("a"));

        c.PreviousStoryId = "a";                   // from the back: B no longer follows A
        repo.SaveStory(c, tl);
        Assert.Null(Prev("b"));
        Assert.Equal("c", Next("a"));

        // A save without a timeline (the item editor's quick add) sends no next, and must not cut the chain.
        repo.SaveStory(new StoryItem { Id = "a", Title = "A", Description = "" });
        Assert.Equal("a", Prev("c"));

        a.NextStoryId = null;                      // cleared from the front
        repo.SaveStory(a, tl);
        Assert.Null(Prev("c"));
    }

    /// <summary>A story keeps only chapters of books it is in, and loses them with the book or the chapter.</summary>
    [Fact]
    public void SaveStory_KeepsOnlyChaptersOfItsBooks_AndChapterDeletesCleanUp()
    {
        using var ctx = new DbTestContext();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES ('One', '', '', 0)");
        int tl = db.QuerySingle<int>("SELECT last_insert_rowid()");
        db.Execute("INSERT INTO books (id, title) VALUES ('b1', 'One'), ('b2', 'Two')");
        db.Execute("INSERT INTO chapters (id, book_id, number) VALUES ('c1', 'b1', 1), ('c2', 'b1', 2), ('x1', 'b2', 1)");

        var repo = new StoryRepo();
        var story = MakeStory(title: "S");
        story.BookIds = ["b1"];
        story.ChapterIds = ["c1", "c2", "x1"];   // x1 is in a book the story is not
        repo.SaveStory(story, tl);
        Assert.Equal(["c1", "c2"], repo.GetArchiveStories(tl).Single().ChapterIds.Order());

        new BookRepo().DeleteChapter("c2");
        Assert.Equal(["c1"], repo.GetArchiveStories(tl).Single().ChapterIds);

        story.BookIds = [];
        repo.SaveStory(story, tl);
        Assert.Empty(repo.GetArchiveStories(tl).Single().ChapterIds);
    }
}

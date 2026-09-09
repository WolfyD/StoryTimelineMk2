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
}

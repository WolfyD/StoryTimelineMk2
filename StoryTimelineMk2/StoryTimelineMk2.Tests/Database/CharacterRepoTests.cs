using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class CharacterRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static CharacterItem MakeCharacter(int timelineId, string name = "Test Character") => new()
    {
        Id = Guid.NewGuid().ToString(),
        Name = name,
        Nicknames = "Nick",
        Aliases = "Alias",
        Race = "Human",
        Description = "A test character",
        Notes = "Some notes",
        BirthYear = 1000,
        BirthSubtick = 0,
        BirthDate = "1000-01-01",
        BirthAlternativeYear = null,
        DeathYear = 1080,
        DeathSubtick = 0,
        DeathDate = "1080-06-15",
        DeathAlternativeYear = null,
        Importance = 7,
        Color = "#FF0000",
        TimelineId = timelineId
    };

    // ── GetCharactersByTimeline ───────────────────────────────────────────────

    [Fact]
    public void GetCharactersByTimeline_ReturnsEmpty_WhenNoCharactersExist()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var chars = repo.GetCharactersByTimeline(tlId).ToList();

        Assert.Empty(chars);
    }

    [Fact]
    public void GetCharactersByTimeline_ReturnsOnlyCharactersForGivenTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = InsertTimeline(ctx, "Timeline One");
        int tl2 = InsertTimeline(ctx, "Timeline Two");

        var repo = new CharacterRepo();
        repo.SaveCharacter(MakeCharacter(tl1, "Character A"));
        repo.SaveCharacter(MakeCharacter(tl2, "Character B"));

        var tl1Chars = repo.GetCharactersByTimeline(tl1).ToList();
        Assert.Single(tl1Chars);
        Assert.Equal("Character A", tl1Chars[0].Name);
    }

    [Fact]
    public void GetCharactersByTimeline_ReturnsOrderedByName()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        repo.SaveCharacter(MakeCharacter(tlId, "Zelda"));
        repo.SaveCharacter(MakeCharacter(tlId, "Arthur"));
        repo.SaveCharacter(MakeCharacter(tlId, "Merlin"));

        var chars = repo.GetCharactersByTimeline(tlId).ToList();

        Assert.Equal("Arthur", chars[0].Name);
        Assert.Equal("Merlin", chars[1].Name);
        Assert.Equal("Zelda", chars[2].Name);
    }

    // ── SaveCharacter (insert) ────────────────────────────────────────────────

    [Fact]
    public void SaveCharacter_InsertsNewCharacter_WithAllFields()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "Aragorn");
        repo.SaveCharacter(character);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM characters WHERE id = @Id", new { character.Id });
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveCharacter_PersistsAllFields()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = new CharacterItem
        {
            Id = Guid.NewGuid().ToString(),
            Name = "Gandalf",
            Nicknames = "The Grey",
            Race = "Wizard",
            Description = "A powerful wizard",
            Notes = "Has a staff",
            BirthYear = -1000,
            DeathYear = null,
            Importance = 10,
            Color = "#FFFFFF",
            TimelineId = tlId
        };
        repo.SaveCharacter(character);

        var chars = repo.GetCharactersByTimeline(tlId).ToList();
        var retrieved = chars.Single(c => c.Id == character.Id);

        Assert.Equal("Gandalf", retrieved.Name);
        Assert.Equal("The Grey", retrieved.Nicknames);
        Assert.Equal("Wizard", retrieved.Race);
        Assert.Equal(-1000, retrieved.BirthYear);
        Assert.Null(retrieved.DeathYear);
        Assert.Equal(10, retrieved.Importance);
    }

    // ── SaveCharacter (update / upsert) ───────────────────────────────────────

    [Fact]
    public void SaveCharacter_UpdatesExistingCharacter_OnConflict()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "Initial Name");
        repo.SaveCharacter(character);

        character.Name = "Updated Name";
        character.Race = "Elf";
        character.Importance = 9;
        repo.SaveCharacter(character);

        var chars = repo.GetCharactersByTimeline(tlId).ToList();
        Assert.Single(chars);
        Assert.Equal("Updated Name", chars[0].Name);
        Assert.Equal("Elf", chars[0].Race);
        Assert.Equal(9, chars[0].Importance);
    }

    [Fact]
    public void SaveCharacter_Update_DoesNotCreateDuplicateRow()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "Frodo");
        repo.SaveCharacter(character);
        character.Description = "Modified";
        repo.SaveCharacter(character);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM characters WHERE id = @Id", new { character.Id });
        Assert.Equal(1, count);
    }

    // ── DeleteCharacter ───────────────────────────────────────────────────────

    [Fact]
    public void DeleteCharacter_RemovesCharacterFromDatabase()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId);
        repo.SaveCharacter(character);

        repo.DeleteCharacter(character.Id);

        var chars = repo.GetCharactersByTimeline(tlId).ToList();
        Assert.DoesNotContain(chars, c => c.Id == character.Id);
    }

    [Fact]
    public void DeleteCharacter_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new CharacterRepo();
        var ex = Record.Exception(() => repo.DeleteCharacter(Guid.NewGuid().ToString()));
        Assert.Null(ex);
    }

    [Fact]
    public void DeleteCharacter_LeavesOtherCharactersIntact()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var keep = MakeCharacter(tlId, "Keeper");
        var del = MakeCharacter(tlId, "Deleter");
        repo.SaveCharacter(keep);
        repo.SaveCharacter(del);

        repo.DeleteCharacter(del.Id);

        var chars = repo.GetCharactersByTimeline(tlId).ToList();
        Assert.Single(chars);
        Assert.Equal(keep.Id, chars[0].Id);
    }

    // ── GetNetwork (BFS) ──────────────────────────────────────────────────────

    [Fact]
    public void GetNetwork_ReturnsSelf_WhenNoRelationshipsExist()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "Loner");
        repo.SaveCharacter(character);

        var network = repo.GetNetwork(tlId, character.Id, maxDepth: 2).ToList();

        Assert.Single(network);
        Assert.Contains(character.Id, network);
    }

    [Fact]
    public void GetNetwork_ReturnsConnectedCharacters()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var c1 = MakeCharacter(tlId, "Alpha");
        var c2 = MakeCharacter(tlId, "Beta");
        repo.SaveCharacter(c1);
        repo.SaveCharacter(c2);

        using var db = ctx.OpenConnection();
        db.Execute(
            @"INSERT INTO character_relationships
              (character_1_id, character_2_id, relationship_type, timeline_id)
              VALUES (@C1, @C2, 'friend', @TlId)",
            new { C1 = c1.Id, C2 = c2.Id, TlId = tlId });

        var network = repo.GetNetwork(tlId, c1.Id, maxDepth: 2).ToList();

        Assert.Contains(c1.Id, network);
        Assert.Contains(c2.Id, network);
    }
}

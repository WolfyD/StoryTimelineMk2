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
        BirthDate = "1000-01-01",
        BirthAlternativeYear = null,
        DeathYear = 1080,
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
            Faction = "The Istari",
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
        Assert.Equal("The Istari", retrieved.Faction);
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

        // Renaming goes through the two halves now; `name` is derived from them on save.
        character.FirstName = "Updated";
        character.LastName = "Name";
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

    // ── name is derived from the two halves ───────────────────────────────────

    [Fact]
    public void SaveCharacter_DerivesName_FromFirstAndLast()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "ignored");
        character.FirstName = "Anna Maria";
        character.LastName = "Vas";
        repo.SaveCharacter(character);

        var saved = repo.GetCharactersByTimeline(tlId).Single();
        Assert.Equal("Anna Maria Vas", saved.Name);
        Assert.Equal("Anna Maria Vas", character.Name);   // the caller's copy matches what was stored
    }

    [Fact]
    public void SaveCharacter_SplitsName_WhenTheCallerOnlyKnowsAFullOne()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        repo.SaveCharacter(MakeCharacter(tlId, "Anna Maria Vas"));   // what the v1 importer sends

        var saved = repo.GetCharactersByTimeline(tlId).Single();
        Assert.Equal("Anna Maria Vas", saved.Name);
        Assert.Equal("Anna Maria", saved.FirstName);
        Assert.Equal("Vas", saved.LastName);
    }

    [Fact]
    public void SaveCharacter_PersistsTheNewCharacterWindowFields()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId, "Risha");
        character.State = "missing";
        character.ShowOnTimeline = true;
        character.BirthItemId = "birth-item";
        character.DeathItemId = "death-item";
        character.AbsoluteStart = 1000 + 47 / 12.0;
        character.BirthGranularity = 5;
        character.AbsoluteEnd = 1080;
        character.UseHighlightColor = true;
        repo.SaveCharacter(character);

        var saved = repo.GetCharactersByTimeline(tlId).Single();
        Assert.Equal("missing", saved.State);
        Assert.True(saved.ShowOnTimeline);
        Assert.Equal("birth-item", saved.BirthItemId);
        Assert.Equal("death-item", saved.DeathItemId);
        Assert.Equal(1000 + 47 / 12.0, saved.AbsoluteStart!.Value, 9);
        Assert.Equal(5, saved.BirthGranularity);
        Assert.Equal(1080, saved.AbsoluteEnd!.Value, 9);
        Assert.Equal(3, saved.DeathGranularity);
        Assert.True(saved.UseHighlightColor);
    }

    // ── portrait ──────────────────────────────────────────────────────────────

    [Fact]
    public void SetPortrait_ReturnsTheReplacedPicture_SoTheCallerCanDeleteIt()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId);
        repo.SaveCharacter(character);

        Assert.Null(repo.SetPortrait(character.Id, "pic-1"));         // nothing to replace yet
        Assert.Null(repo.SetPortrait(character.Id, "pic-1"));         // same picture: not an orphan
        Assert.Equal("pic-1", repo.SetPortrait(character.Id, "pic-2"));
        Assert.Equal("pic-2", repo.GetCharactersByTimeline(tlId).Single().PortraitPictureId);
    }

    [Fact]
    public void SaveCharacter_LeavesThePortraitAlone()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId);
        repo.SaveCharacter(character);
        repo.SetPortrait(character.Id, "pic-1");

        character.Race = "Elf";
        repo.SaveCharacter(character);   // the page never sends a portrait id back

        Assert.Equal("pic-1", repo.GetCharactersByTimeline(tlId).Single().PortraitPictureId);
    }

    /// <summary>
    /// Deleting is the row only; what the character owned is the caller's job, and GetCharacter is
    /// how it finds out — the portrait file and the two generated items all live in other repos.
    /// </summary>
    [Fact]
    public void GetCharacter_TellsTheCallerWhatToCleanUp_BeforeDeleting()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var character = MakeCharacter(tlId);
        character.BirthItemId = "birth-item";
        repo.SaveCharacter(character);
        repo.SetPortrait(character.Id, "pic-1");

        var owned = repo.GetCharacter(character.Id)!;
        Assert.Equal("pic-1", owned.PortraitPictureId);
        Assert.Equal("birth-item", owned.BirthItemId);

        repo.DeleteCharacter(character.Id);
        Assert.Null(repo.GetCharacter(character.Id));
        repo.DeleteCharacter(Guid.NewGuid().ToString());   // a stale id is a no-op, not a throw
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

    // ── Relations (BL-15 phase 4) ───────────────────────────────────────

    /// <summary>
    /// One row per pair, read from either end: the parent's panel and the child's panel both have
    /// to find it, because there is no mirror row. An undated end stays NULL rather than becoming
    /// year 0 — the difference between "since birth, as their kind implies" and "since year 0".
    /// </summary>
    [Fact]
    public void SaveRelationship_RoundTrips_AndIsFoundFromBothEnds()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var parent = MakeCharacter(tlId, "Alpha");
        var child = MakeCharacter(tlId, "Beta");
        repo.SaveCharacter(parent);
        repo.SaveCharacter(child);

        long id = repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = parent.Id,
            Character2Id = child.Id,
            RelationshipType = "parent",
            Notes = "adopted",
            StartYear = 1020,
            StartGranularity = 5,
            AbsoluteStart = 1020 + 4 / 12.0,
            RelationshipStrength = 80,
            RelationshipModifier = "adoptive",
            RelationshipDegree = "half-",
            TimelineId = tlId
        });

        Assert.NotEqual(0, id);

        var fromParent = Assert.Single(repo.GetRelationships(parent.Id));
        var fromChild = Assert.Single(repo.GetRelationships(child.Id));
        Assert.Equal(id, fromChild.Id);
        Assert.Equal("parent", fromParent.RelationshipType);
        Assert.Equal("adopted", fromParent.Notes);
        Assert.Equal(1020, fromParent.StartYear);
        Assert.Equal(1020 + 4 / 12.0, fromParent.AbsoluteStart!.Value, 9);
        Assert.Equal(5, fromParent.StartGranularity);
        Assert.Equal(80, fromParent.RelationshipStrength);
        Assert.Equal("adoptive", fromParent.RelationshipModifier);
        Assert.Equal("half-", fromParent.RelationshipDegree);
        Assert.Null(fromParent.EndYear);
        Assert.Null(fromParent.AbsoluteEnd);
    }

    // ── shared characters (BL-75) ─────────────────────────────────────────────

    [Fact]
    public void SharedCharacter_IsInEveryTimelinesCast_WithoutLeavingTheirOwn()
    {
        using var ctx = new DbTestContext();
        int home = InsertTimeline(ctx, "Home");
        int other = InsertTimeline(ctx, "Other");

        var repo = new CharacterRepo();
        var wanderer = MakeCharacter(home, "Wanderer");
        wanderer.Shared = true;
        repo.SaveCharacter(wanderer);
        repo.SaveCharacter(MakeCharacter(other, "Local"));

        Assert.Equal(new[] { "Local", "Wanderer" }, repo.GetCharactersByTimeline(other).Select(c => c.Name));
        var seenFromAway = repo.GetCharactersByTimeline(other).Single(c => c.Name == "Wanderer");
        Assert.True(seenFromAway.Shared);
        Assert.Equal(home, seenFromAway.TimelineId);   // shared, not moved

        // Unticking puts them back rather than stranding them.
        wanderer.Shared = false;
        repo.SaveCharacter(wanderer);
        Assert.Equal(new[] { "Local" }, repo.GetCharactersByTimeline(other).Select(c => c.Name));
        Assert.Single(repo.GetCharactersByTimeline(home));
    }

    [Fact]
    public void GetRelationshipsByTimeline_FollowsSharedCharacters_IntoTheirOtherTimelines()
    {
        using var ctx = new DbTestContext();
        int home = InsertTimeline(ctx, "Home");
        int other = InsertTimeline(ctx, "Other");

        var repo = new CharacterRepo();
        var a = MakeCharacter(home, "Alpha");
        var b = MakeCharacter(home, "Beta");
        a.Shared = b.Shared = true;
        repo.SaveCharacter(a);
        repo.SaveCharacter(b);
        var stayHome = MakeCharacter(home, "Gamma");
        repo.SaveCharacter(stayHome);

        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = a.Id, Character2Id = b.Id, RelationshipType = "spouse", TimelineId = home
        });
        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = a.Id, Character2Id = stayHome.Id, RelationshipType = "friend", TimelineId = home
        });

        // Both ends shared: the tie travels. One end left at home: it does not.
        Assert.Equal(new[] { "spouse" }, repo.GetRelationshipsByTimeline(other).Select(r => r.RelationshipType));
        Assert.Equal(2, repo.GetRelationshipsByTimeline(home).Count());
    }

    [Fact]
    public void SaveRelationship_UpdatesInPlace_AndDeleteRemovesIt()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var a = MakeCharacter(tlId, "Alpha");
        var b = MakeCharacter(tlId, "Beta");
        repo.SaveCharacter(a);
        repo.SaveCharacter(b);

        var rel = new CharacterRepo.CharacterRelationship
        {
            Character1Id = a.Id,
            Character2Id = b.Id,
            RelationshipType = "ally",
            TimelineId = tlId
        };
        rel.Id = repo.SaveRelationship(rel);

        rel.RelationshipType = "rival";
        rel.EndYear = 1075;
        Assert.Equal(rel.Id, repo.SaveRelationship(rel));

        var saved = Assert.Single(repo.GetRelationships(a.Id));
        Assert.Equal("rival", saved.RelationshipType);
        Assert.Equal(1075, saved.EndYear);

        repo.DeleteRelationship(rel.Id);
        Assert.Empty(repo.GetRelationships(a.Id));
    }

    /// <summary>
    /// BL-73: the relations window asks for the whole web at once, so the timeline query has to be
    /// the timeline's relations and only those — a second project's ties must not leak in.
    /// </summary>
    [Fact]
    public void GetRelationshipsByTimeline_ReturnsTheWholeWeb_AndNoOtherTimelines()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        int otherId = InsertTimeline(ctx, "Other Timeline");

        var repo = new CharacterRepo();
        var a = MakeCharacter(tlId, "Alpha");
        var b = MakeCharacter(tlId, "Beta");
        var c = MakeCharacter(tlId, "Gamma");
        var outsider = MakeCharacter(otherId, "Elsewhere");
        repo.SaveCharacter(a);
        repo.SaveCharacter(b);
        repo.SaveCharacter(c);
        repo.SaveCharacter(outsider);

        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = a.Id, Character2Id = b.Id, RelationshipType = "parent", TimelineId = tlId
        });
        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = b.Id, Character2Id = c.Id, RelationshipType = "spouse", TimelineId = tlId
        });
        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = outsider.Id, Character2Id = outsider.Id, RelationshipType = "ally", TimelineId = otherId
        });

        var web = repo.GetRelationshipsByTimeline(tlId).ToList();

        Assert.Equal(2, web.Count);
        Assert.All(web, r => Assert.Equal(tlId, r.TimelineId));
        Assert.Contains(web, r => r.RelationshipType == "parent");
        Assert.Contains(web, r => r.RelationshipType == "spouse");
        Assert.Single(repo.GetRelationshipsByTimeline(otherId));
    }

    /// <summary>
    /// The kinds are app-wide, so a user's own kind survives alongside the seeded ones, and
    /// deleting a kind leaves the relations that used it alone — they keep the id they were saved
    /// with rather than vanishing with it.
    /// </summary>
    [Fact]
    public void RelationshipTypes_AreSeeded_AndUserKindsSurviveTheRelationsThatUseThem()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new CharacterRepo();
        var a = MakeCharacter(tlId, "Alpha");
        var b = MakeCharacter(tlId, "Beta");
        repo.SaveCharacter(a);
        repo.SaveCharacter(b);

        var seeded = repo.GetRelationshipTypes().ToList();
        Assert.Contains(seeded, t => t.Id == "parent" && t.AToB == "parent of" && t.BToA == "child of");
        Assert.Contains(seeded, t => t.Id == "mentor" && t.Type == "social");

        repo.SaveRelationshipType(new CharacterRepo.RelationshipType
        {
            Id = "liege",
            Name = "Liege / sworn",
            Type = "social",
            AToB = "liege of",
            BToA = "sworn to",
            OneWay = 0
        });
        repo.SaveRelationship(new CharacterRepo.CharacterRelationship
        {
            Character1Id = a.Id,
            Character2Id = b.Id,
            RelationshipType = "liege",
            TimelineId = tlId
        });

        repo.DeleteRelationshipType("liege");

        Assert.DoesNotContain(repo.GetRelationshipTypes(), t => t.Id == "liege");
        Assert.Equal("liege", Assert.Single(repo.GetRelationships(a.Id)).RelationshipType);
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

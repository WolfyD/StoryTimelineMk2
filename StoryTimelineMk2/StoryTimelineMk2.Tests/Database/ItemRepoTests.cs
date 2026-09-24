using StoryTimelineMk2.Database;
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class ItemRepoTests
{
    // ── helpers ───────────────────────────────────────────────────────────────

    private static TimelineItem MakeItem(int timelineId, string? id = null) => new()
    {
        Id              = id ?? Guid.NewGuid().ToString(),
        Title           = "Test Event",
        Description     = "A description",
        Content         = "Some content",
        StoryId         = null,
        TypeId          = 1,
        Year            = 1500,
        EndYear         = 1500,
        AbsoluteStart   = 1500.0,
        AbsoluteEnd     = 1500.0,
        BookTitle       = "",
        Chapter         = "",
        Page            = "",
        Color           = "#ffffff",
        CreationGranularity = 1,
        TimelineId      = timelineId,
        ItemIndex       = 0,
        ShowInNotes     = true,
        Importance      = 5,
        MinLodLevel     = 3,
        LodVisibilityMask = 255,
    };

    // Create a minimal timeline row so the FK constraint on items.timeline_id is satisfied.
    private static int SeedTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute(@"
            INSERT INTO timelines (title, author, description, start_year)
            VALUES (@Title, '', '', 0)", new { Title = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    // ── SaveItemFull / GetItemById ────────────────────────────────────────────

    /// <summary>
    /// BL-72: the open-end flags (V15) and the fade that softens them (V18). The upsert names its
    /// columns one by one, so a new column that reads back fine after the insert can still be
    /// dropped by the update half — save twice.
    /// </summary>
    [Fact]
    public void SaveItemFull_RoundTripsOpenEnds_OnInsertAndUpdate()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var item = MakeItem(tlId);
        item.TypeId    = 3;   // Age
        item.OpenStart = true;
        item.OpenEnd   = false;
        item.OpenFade  = true;
        repo.SaveItemFull(item, [], [], [], []);

        var saved = repo.GetItemById(item.Id);
        Assert.True(saved.OpenStart);
        Assert.False(saved.OpenEnd);
        Assert.True(saved.OpenFade);

        saved.OpenStart = false;
        saved.OpenEnd   = true;
        saved.OpenFade  = false;
        repo.SaveItemFull(saved, [], [], [], []);

        var again = repo.GetItemById(item.Id);
        Assert.False(again.OpenStart);
        Assert.True(again.OpenEnd);
        Assert.False(again.OpenFade);
    }

    [Fact]
    public void SaveItemFull_CreatesNewItem_AndReturnsId()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);

        var returnedId = repo.SaveItemFull(item, [], [], [], []);

        Assert.Equal(item.Id, returnedId);
    }

    [Fact]
    public void GetItemById_ReturnsCorrectItem_AfterSave()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        item.Title = "Unique Title 123";

        repo.SaveItemFull(item, [], [], [], []);
        var retrieved = repo.GetItemById(item.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(item.Id, retrieved.Id);
        Assert.Equal("Unique Title 123", retrieved.Title);
    }

    [Fact]
    public void SaveItemFull_WithExistingId_UpdatesRatherThanInserts()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        // Update the title and save again with the same Id
        item.Title = "Updated Title";
        repo.SaveItemFull(item, [], [], [], []);

        var retrieved = repo.GetItemById(item.Id);
        Assert.Equal("Updated Title", retrieved!.Title);

        // Verify only one row exists
        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE id = @Id", new { item.Id });
        Assert.Equal(1, count);
    }

    // ── GetItemTags ───────────────────────────────────────────────────────────

    [Fact]
    public void GetItemTags_ReturnsTagsLinkedToItem()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, tagNames: ["battle", "medieval"], [], [], []);

        var tags = repo.GetItemTags(item.Id).ToList();

        Assert.Equal(2, tags.Count);
        var names = tags.Select(t => t.Name).OrderBy(n => n).ToList();
        Assert.Equal(["battle", "medieval"], names);
    }

    [Fact]
    public void GetItemTags_ReturnsEmpty_WhenNoTagsLinked()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        var tags = repo.GetItemTags(item.Id).ToList();

        Assert.Empty(tags);
    }

    // ── DeleteItem ────────────────────────────────────────────────────────────

    [Fact]
    public void DeleteItem_RemovesItemFromDatabase()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);

        var repo = new ItemRepo();
        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);

        repo.DeleteItem(item.Id);

        var retrieved = repo.GetItemById(item.Id);
        Assert.Null(retrieved);
    }

    [Fact]
    public void DeleteItem_NonexistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new ItemRepo();
        // Should not throw even if the item doesn't exist
        repo.DeleteItem(Guid.NewGuid().ToString());
    }

    // ── GetItemsByTimeline ────────────────────────────────────────────────────

    [Fact]
    public void GetItemsByTimeline_ReturnsOnlyItemsForThatTimeline()
    {
        using var ctx = new DbTestContext();
        // Use distinct titles to avoid the UNIQUE(title, author) constraint
        int tl1 = SeedTimeline(ctx, "Timeline Alpha");
        int tl2 = SeedTimeline(ctx, "Timeline Beta");

        var repo = new ItemRepo();
        var item1 = MakeItem(tl1);
        var item2 = MakeItem(tl2);
        repo.SaveItemFull(item1, [], [], [], []);
        repo.SaveItemFull(item2, [], [], [], []);

        var results = repo.GetItemsByTimeline(tl1).ToList();

        Assert.Single(results);
        Assert.Equal(item1.Id, results[0].Id);
    }

    // The canvas draws a character's disc from this flag, and it lives on the character, not the item.
    [Fact]
    public void GetItemsByTimeline_CarriesTheOwningCharactersHighlightFlag()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var birth = MakeItem(tl);
        birth.TypeId = 7;
        var ordinary = MakeItem(tl);
        repo.SaveItemFull(birth, [], [], [], []);
        repo.SaveItemFull(ordinary, [], [], [], []);

        string charId = SeedCharacter(ctx, tl);
        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE characters SET use_highlight_color = 1, birth_item_id = @Item WHERE id = @Id",
                new { Item = birth.Id, Id = charId });

        var byId = repo.GetItemsByTimeline(tl).ToDictionary(i => i.Id);
        Assert.True(byId[birth.Id].UseHighlightColor);
        Assert.False(byId[ordinary.Id].UseHighlightColor);
    }

    // ── detected links ────────────────────────────────────────────────────────

    [Fact]
    public void DetectedAppearance_SurvivesTheRoundTrip_AndADismissalIsTakenBackByAManualAdd()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        string charId = SeedCharacter(ctx, tl);

        repo.SaveItemFull(item, [],
            [new ItemRepo.CharacterAppearanceInput { CharacterId = charId, Role = "", AutoDetected = true }],
            [], []);
        Assert.True(repo.GetItemCharacterAppearances(item.Id).Single().AutoDetected);

        // The user takes the detected link off: the matcher has to leave them alone from now on.
        repo.DismissCharacterLink(item.Id, charId);
        repo.SaveItemFull(item, [], [], [], []);
        Assert.Equal([charId], repo.GetDismissedCharacters(item.Id));

        // Attaching them by hand is a change of mind, and clears the dismissal.
        repo.SaveItemFull(item, [],
            [new ItemRepo.CharacterAppearanceInput { CharacterId = charId, Role = "friend" }],
            [], []);
        Assert.Empty(repo.GetDismissedCharacters(item.Id));
        Assert.False(repo.GetItemCharacterAppearances(item.Id).Single().AutoDetected);
    }

    // ── relation seeding helpers ──────────────────────────────────────────────

    private static string SeedCharacter(DbTestContext ctx, int timelineId, string name = "Alice", string color = "#ff0000")
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO characters (id, name, color, timeline_id) VALUES (@Id, @Name, @Color, @TlId)",
            new { Id = id, Name = name, Color = color, TlId = timelineId });
        return id;
    }

    private static string SeedStory(DbTestContext ctx, string title = "The Saga")
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO stories (id, title) VALUES (@Id, @Title)", new { Id = id, Title = title });
        return id;
    }

    private static string SeedBook(DbTestContext ctx, string title)
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO books (id, title) VALUES (@Id, @Title)", new { Id = id, Title = title });
        return id;
    }

    private static string SeedChapter(DbTestContext ctx, string bookId, int number, string title)
    {
        var id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO chapters (id, book_id, number, title) VALUES (@Id, @BookId, @Number, @Title)",
            new { Id = id, BookId = bookId, Number = number, Title = title });
        return id;
    }

    private static string SeedPicture(DbTestContext ctx, string itemId)
    {
        var picId = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO pictures (id, file_path, file_name, file_size, file_type) VALUES (@Id, 'x.png', 'x.png', 1, 'png')",
            new { Id = picId });
        db.Execute("INSERT INTO item_pictures (item_id, picture_id) VALUES (@ItemId, @PicId)",
            new { ItemId = itemId, PicId = picId });
        return picId;
    }

    // ── GetItemsByYear ────────────────────────────────────────────────────────

    [Fact]
    public void GetItemsByYear_ReturnsOnlyItemsInThatYear_CharactersIncluded()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();
        var hit = MakeItem(tl); // year 1500
        var otherYear = MakeItem(tl); otherYear.Year = 1501; otherYear.AbsoluteStart = 1501;
        var character = MakeItem(tl); character.TypeId = 7;
        repo.SaveItemFull(hit, [], [], [], []);
        repo.SaveItemFull(otherYear, [], [], [], []);
        repo.SaveItemFull(character, [], [], [], []);

        var results = repo.GetItemsByYear(tl, 1500).ToList();

        // Type 7 is a real item since BL-15 phase 2 — a character's birth or death — so it is
        // listed like any other; only the other year is left out.
        Assert.Equal(2, results.Count);
        Assert.Contains(results, r => r.Id == hit.Id);
        Assert.Contains(results, r => r.Id == character.Id);
        Assert.DoesNotContain(results, r => r.Id == otherYear.Id);
    }

    // ── timeline-wide link getters ────────────────────────────────────────────

    [Fact]
    public void GetAllItemTagsForTimeline_ReturnsNormalisedTagLinks_OnlyForThatTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        var repo = new ItemRepo();
        var a = MakeItem(tl1); repo.SaveItemFull(a, ["Siege", " battle "], [], [], []);
        var b = MakeItem(tl2); repo.SaveItemFull(b, ["other"], [], [], []);

        var links = repo.GetAllItemTagsForTimeline(tl1).ToList();

        Assert.Equal(2, links.Count);
        Assert.All(links, l => Assert.Equal(a.Id, l.ItemId));
        Assert.All(links, l => Assert.True(l.TagId > 0));
        Assert.Equal(["battle", "siege"], links.Select(l => l.TagName).ToList()); // lower-cased, trimmed, ordered by name
    }

    [Fact]
    public void GetAllItemCharactersForTimeline_ReturnsCharacterLinks_OnlyForThatTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        string alice = SeedCharacter(ctx, tl1, "Alice", "#ff0000");
        string bob = SeedCharacter(ctx, tl2, "Bob", "#00ff00");
        var repo = new ItemRepo();
        var a = MakeItem(tl1); repo.SaveItemFull(a, [], [new() { CharacterId = alice, Role = "lead" }], [], []);
        var b = MakeItem(tl2); repo.SaveItemFull(b, [], [new() { CharacterId = bob, Role = "lead" }], [], []);

        var links = repo.GetAllItemCharactersForTimeline(tl1).ToList();

        var link = Assert.Single(links);
        Assert.Equal(a.Id, link.ItemId);
        Assert.Equal(alice, link.CharacterId);
        Assert.Equal("Alice", link.CharacterName);
        Assert.Equal("#ff0000", link.CharacterColor);
    }

    [Fact]
    public void GetAllItemStoryRefsForTimeline_ReturnsStoryLinks_OnlyForThatTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        string story = SeedStory(ctx, "The Saga");
        var repo = new ItemRepo();
        var a = MakeItem(tl1); repo.SaveItemFull(a, [], [], [story], []);
        var b = MakeItem(tl2); repo.SaveItemFull(b, [], [], [story], []);

        var links = repo.GetAllItemStoryRefsForTimeline(tl1).ToList();

        var link = Assert.Single(links);
        Assert.Equal(a.Id, link.ItemId);
        Assert.Equal(story, link.StoryId);
        Assert.Equal("The Saga", link.StoryTitle);
    }

    [Fact]
    public void GetItemsWithPicturesForTimeline_ReturnsDistinctItemIds_OnlyForThatTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        var repo = new ItemRepo();
        var twoPics = MakeItem(tl1); repo.SaveItemFull(twoPics, [], [], [], []);
        var noPics = MakeItem(tl1); repo.SaveItemFull(noPics, [], [], [], []);
        var elsewhere = MakeItem(tl2); repo.SaveItemFull(elsewhere, [], [], [], []);
        SeedPicture(ctx, twoPics.Id);
        SeedPicture(ctx, twoPics.Id);
        SeedPicture(ctx, elsewhere.Id);

        var ids = repo.GetItemsWithPicturesForTimeline(tl1).ToList();

        Assert.Equal([twoPics.Id], ids);
    }

    // ── per-item link getters ─────────────────────────────────────────────────

    [Fact]
    public void GetItemCharacterAppearances_ReturnsRoleNameAndColor_PerCharacter()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        string alice = SeedCharacter(ctx, tl, "Alice", "#ff0000");
        string bob = SeedCharacter(ctx, tl, "Bob", "#00ff00");
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [new() { CharacterId = alice, Role = "lead" }, new() { CharacterId = bob, Role = "cameo" }], [], []);

        var rows = repo.GetItemCharacterAppearances(item.Id).ToList();

        Assert.Equal(2, rows.Count);
        var aliceRow = rows.Single(r => r.CharacterId == alice);
        Assert.Equal("lead", aliceRow.Role);
        Assert.Equal("Alice", aliceRow.CharacterName);
        Assert.Equal("#ff0000", aliceRow.CharacterColor);
        Assert.Equal("cameo", rows.Single(r => r.CharacterId == bob).Role);
    }

    [Fact]
    public void GetItemStoryRefs_ReturnsStoryIdAndTitle()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        string story = SeedStory(ctx, "The Saga");
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [], [story], []);

        var refs = repo.GetItemStoryRefs(item.Id).ToList();

        var r = Assert.Single(refs);
        Assert.Equal(story, r.StoryId);
        Assert.Equal("The Saga", r.StoryTitle);
    }

    [Fact]
    public void GetItemStoryRefs_ReturnsEmpty_WhenNoneLinked()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [], [], []);

        Assert.Empty(repo.GetItemStoryRefs(item.Id));
    }

    [Fact]
    public void GetItemChapterRefs_ReturnsChapterAndBookDetails_OrderedByBookThenNumber()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        string bookA = SeedBook(ctx, "Book A");
        string bookB = SeedBook(ctx, "Book B");
        string a2 = SeedChapter(ctx, bookA, 2, "A2");
        string a1 = SeedChapter(ctx, bookA, 1, "A1");
        string b1 = SeedChapter(ctx, bookB, 1, "B1");
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [], [], [b1, a2, a1]);

        var refs = repo.GetItemChapterRefs(item.Id).ToList();

        Assert.Equal(["A1", "A2", "B1"], refs.Select(r => r.ChapterTitle).ToList());
        var first = refs[0];
        Assert.Equal(a1, first.ChapterId);
        Assert.Equal(1, first.ChapterNumber);
        Assert.Equal(bookA, first.BookId);
        Assert.Equal("Book A", first.BookTitle);
    }

    // ── GetItemLinksById ──────────────────────────────────────────────────────

    [Fact]
    public void GetItemLinksById_ReturnsTagsCharactersStoryRefsAndPictureFlag()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        string alice = SeedCharacter(ctx, tl, "Alice", "#ff0000");
        string story = SeedStory(ctx, "The Saga");
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, ["epic"], [new() { CharacterId = alice, Role = "lead" }], [story], []);
        SeedPicture(ctx, item.Id);

        var links = repo.GetItemLinksById(item.Id);

        var tag = Assert.Single(links.Tags);
        Assert.Equal(item.Id, tag.ItemId);
        Assert.Equal("epic", tag.TagName);
        var ch = Assert.Single(links.Characters);
        Assert.Equal(alice, ch.CharacterId);
        Assert.Equal("Alice", ch.CharacterName);
        Assert.Equal("#ff0000", ch.CharacterColor);
        var sr = Assert.Single(links.StoryRefs);
        Assert.Equal(story, sr.StoryId);
        Assert.Equal("The Saga", sr.StoryTitle);
        Assert.True(links.HasPicture);
    }

    [Fact]
    public void GetItemLinksById_ReturnsEmptyLinks_ForBareItem()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [], [], []);

        var links = repo.GetItemLinksById(item.Id);

        Assert.Empty(links.Tags);
        Assert.Empty(links.Characters);
        Assert.Empty(links.StoryRefs);
        Assert.False(links.HasPicture);
    }

    // ── SetLodMask ────────────────────────────────────────────────────────────

    [Fact]
    public void SetLodMask_OverwritesEveryItemOfThatTimelineOnly_AndReturnsCount()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        var repo = new ItemRepo();
        var a = MakeItem(tl1); a.LodVisibilityMask = 255;
        var b = MakeItem(tl1); b.LodVisibilityMask = 1;
        var c = MakeItem(tl2); c.LodVisibilityMask = 255;
        repo.SaveItemFull(a, [], [], [], []);
        repo.SaveItemFull(b, [], [], [], []);
        repo.SaveItemFull(c, [], [], [], []);

        int affected = repo.SetLodMask(tl1, 0b1001000);

        Assert.Equal(2, affected);
        Assert.Equal(0b1001000, repo.GetItemById(a.Id).LodVisibilityMask);
        Assert.Equal(0b1001000, repo.GetItemById(b.Id).LodVisibilityMask);
        Assert.Equal(255, repo.GetItemById(c.Id).LodVisibilityMask);
    }

    // ── ShiftItems ────────────────────────────────────────────────────────────

    [Fact]
    public void ShiftItems_MovesAllYearFields_OnlyForThatTimeline_AndReturnsCount()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        var repo = new ItemRepo();
        var a = MakeItem(tl1);
        var b = MakeItem(tl1); b.Year = 1600; b.EndYear = 1610; b.AbsoluteStart = 1600.25; b.AbsoluteEnd = 1610.5;
        var c = MakeItem(tl2);
        repo.SaveItemFull(a, [], [], [], []);
        repo.SaveItemFull(b, [], [], [], []);
        repo.SaveItemFull(c, [], [], [], []);

        int shifted = repo.ShiftItems(tl1, -100);

        Assert.Equal(2, shifted);
        var a2 = repo.GetItemById(a.Id);
        Assert.Equal(1400, a2.Year);
        Assert.Equal(1400, a2.EndYear);
        Assert.Equal(1400.0, a2.AbsoluteStart);
        Assert.Equal(1400.0, a2.AbsoluteEnd);
        var b2 = repo.GetItemById(b.Id);
        Assert.Equal(1500, b2.Year);
        Assert.Equal(1510, b2.EndYear);
        Assert.Equal(1500.25, b2.AbsoluteStart, 6);
        Assert.Equal(1510.5, b2.AbsoluteEnd, 6);
        Assert.Equal(1500, repo.GetItemById(c.Id).Year); // other timeline untouched
    }

    [Fact]
    public void ShiftItems_ReturnsZero_WhenTimelineHasNoItems()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();

        Assert.Equal(0, repo.ShiftItems(tl, 10));
    }

    // ── VacuumInto ────────────────────────────────────────────────────────────

    [Fact]
    public void VacuumInto_ReplacesExistingFile_WithStandaloneCopy_EvenWhenPathHasQuotes()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new ItemRepo();
        var item = MakeItem(tl);
        repo.SaveItemFull(item, [], [], [], []);
        string dest = Path.Combine(ctx.TempDir, "it's a copy.sqlite");
        File.WriteAllText(dest, "stale");

        repo.VacuumInto(dest);

        using (var copy = new SqliteConnection($"Data Source={dest}"))
        {
            copy.Open();
            Assert.Equal("Test Event", copy.QuerySingle<string>("SELECT title FROM items WHERE id = @Id", new { item.Id }));
        }
        SqliteConnection.ClearAllPools(); // let DbTestContext delete the temp folder
    }

    // ── Placement (side of the line) ──────────────────────────────────────────

    [Fact]
    public void SaveItemFull_AssignsPlacement_AlternatingAroundNeighbours()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var placements = new List<int>();
        for (int i = 0; i < 4; i++)
        {
            var item = MakeItem(tlId);
            item.Year = 1500 + i; item.EndYear = item.Year;
            item.AbsoluteStart = item.AbsoluteEnd = item.Year;
            repo.SaveItemFull(item, [], [], [], []);
            placements.Add(repo.GetItemById(item.Id).Placement);
        }

        Assert.Equal([1, 2, 1, 2], placements);
    }

    [Fact]
    public void SaveItemFull_HonoursExplicitSide_AndRepicksForAuto()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var first = MakeItem(tlId);
        repo.SaveItemFull(first, [], [], [], []);
        Assert.Equal(1, repo.GetItemById(first.Id).Placement);

        // An explicit side wins over auto-assignment.
        first.Placement = 2;
        repo.SaveItemFull(first, [], [], [], []);
        Assert.Equal(2, repo.GetItemById(first.Id).Placement);

        // Placement 0 ("Auto" in the edit window) makes the backend pick again.
        first.Placement = 0;
        repo.SaveItemFull(first, [], [], [], []);
        Assert.Equal(1, repo.GetItemById(first.Id).Placement);
    }

    [Fact]
    public void SaveItemFull_PersistsCentered()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);
        Assert.False(repo.GetItemById(item.Id).Centered);

        item.Centered = true;
        item.ShowTitle = true;
        repo.SaveItemFull(item, [], [], [], []);
        Assert.True(repo.GetItemById(item.Id).Centered);
        Assert.True(repo.GetItemById(item.Id).ShowTitle);
    }

    [Fact]
    public void SaveItemFull_PersistsItemNotes_AndNullIsAllowed()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var item = MakeItem(tlId);
        repo.SaveItemFull(item, [], [], [], []);
        Assert.Null(repo.GetItemById(item.Id).ItemNotes);

        item.ItemNotes = "remember: foreshadows the coup\nline two";
        repo.SaveItemFull(item, [], [], [], []);
        Assert.Equal("remember: foreshadows the coup\nline two", repo.GetItemById(item.Id).ItemNotes);
    }

    [Fact]
    public void SaveItemFull_LeavesPlacementZero_ForFullWidthTypes()
    {
        using var ctx = new DbTestContext();
        int tlId = SeedTimeline(ctx);
        var repo = new ItemRepo();

        var age = MakeItem(tlId);
        age.TypeId = 3;
        repo.SaveItemFull(age, [], [], [], []);

        Assert.Equal(0, repo.GetItemById(age.Id).Placement);
    }
}

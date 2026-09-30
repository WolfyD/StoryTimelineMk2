using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// BL-16. The three things in migration 22 that are logic rather than columns: the two-query pin
/// grouping in <see cref="MapRepo.GetMaps"/>, the trigger that stops an event pointing at a deleted
/// place, and the ON DELETE SET NULL that keeps a place when the map it opened into goes.
/// </summary>
[Collection("Database")]
public class MapRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static string InsertItem(DbTestContext ctx, int timelineId, string? locationId)
    {
        string id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO items (id, title, timeline_id, year, location_id) VALUES (@Id, 'Event', @Tl, 100, @Loc)",
            new { Id = id, Tl = timelineId, Loc = locationId });
        return id;
    }

    private static string? ItemLocation(DbTestContext ctx, string itemId)
    {
        using var db = ctx.OpenConnection();
        return db.QuerySingleOrDefault<string?>("SELECT location_id FROM items WHERE id = @Id", new { Id = itemId });
    }

    // ── GetMaps ───────────────────────────────────────────────────────────────

    [Fact]
    public void GetMaps_AttachesEachPinToItsOwnMap()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world  = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string gondor = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Gondor" });
        repo.SaveLocation(new LocationItem { MapId = world,  Name = "Gondor",       X = 0.4, Y = 0.7 });
        repo.SaveLocation(new LocationItem { MapId = world,  Name = "The Shire",    X = 0.1, Y = 0.2 });
        repo.SaveLocation(new LocationItem { MapId = gondor, Name = "Minas Tirith", X = 0.5, Y = 0.5 });

        var maps = repo.GetMaps(tlId);

        Assert.Equal(2, maps.Count);
        Assert.Equal(2, maps.Single(m => m.Id == world).Locations.Count);
        Assert.Equal("Minas Tirith", maps.Single(m => m.Id == gondor).Locations.Single().Name);
    }

    [Fact]
    public void GetMaps_ReturnsOnlyTheGivenTimelinesMaps()
    {
        using var ctx = new DbTestContext();
        int tl1 = InsertTimeline(ctx, "Alpha");
        int tl2 = InsertTimeline(ctx, "Beta");
        var repo = new MapRepo();

        string mine = repo.SaveMap(new MapItem { TimelineId = tl1, Name = "Mine" });
        string theirs = repo.SaveMap(new MapItem { TimelineId = tl2, Name = "Theirs" });
        repo.SaveLocation(new LocationItem { MapId = mine,   Name = "Here" });
        repo.SaveLocation(new LocationItem { MapId = theirs, Name = "Elsewhere" });

        var maps = repo.GetMaps(tl1);

        Assert.Single(maps);
        Assert.Equal("Here", maps[0].Locations.Single().Name);
    }

    [Fact]
    public void GetMaps_KeepsPinPositionsAsFractions()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Pin", X = 0.125, Y = 0.875 });

        var pin = repo.GetMaps(tlId).Single().Locations.Single();
        Assert.Equal(0.125, pin.X, precision: 6);
        Assert.Equal(0.875, pin.Y, precision: 6);
    }

    [Fact]
    public void GetMaps_ReturnsEmpty_WhenTheTimelineHasNoMaps()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        Assert.Empty(new MapRepo().GetMaps(tlId));
    }

    // ── Deleting a location ───────────────────────────────────────────────────

    [Fact]
    public void DeleteLocation_ClearsTheEventsThatPointedThere()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Osgiliath" });
        string itemId = InsertItem(ctx, tlId, locId);

        Assert.Equal(locId, ItemLocation(ctx, itemId));

        repo.DeleteLocation(locId);

        // The event keeps its date and forgets the place — the trigger, not a repo-side cleanup.
        Assert.Null(ItemLocation(ctx, itemId));
        Assert.NotNull(new ItemRepo().GetItemById(itemId));
    }

    [Fact]
    public void DeleteLocation_LeavesEventsAtOtherPlacesAlone()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string goneId = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Gone" });
        string keptId = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Kept" });
        string itemId = InsertItem(ctx, tlId, keptId);

        repo.DeleteLocation(goneId);

        Assert.Equal(keptId, ItemLocation(ctx, itemId));
    }

    // ── Deleting a map ────────────────────────────────────────────────────────

    [Fact]
    public void DeleteMap_TakesItsOwnPinsButKeepsTheOneThatOpenedIntoIt()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world  = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string gondor = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Gondor" });
        // The pin on the world map is the doorway into the Gondor map.
        string doorway = repo.SaveLocation(new LocationItem { MapId = world, Name = "Gondor", ChildMapId = gondor });
        repo.SaveLocation(new LocationItem { MapId = gondor, Name = "Minas Tirith" });

        repo.DeleteMap(gondor);

        var maps = repo.GetMaps(tlId);
        var remaining = Assert.Single(maps);
        Assert.Equal(world, remaining.Id);

        // Gondor is still a place on the world map; it has just stopped being a map too.
        var pin = Assert.Single(remaining.Locations);
        Assert.Equal(doorway, pin.Id);
        Assert.Null(pin.ChildMapId);
    }

    [Fact]
    public void DeleteMap_ClearsTheEventsAtItsPins()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string itemId = InsertItem(ctx, tlId, repo.SaveLocation(new LocationItem { MapId = world, Name = "Osgiliath" }));

        repo.DeleteMap(world);

        // The pin goes by the cascade, and the trigger still fires for it: the event keeps its date only.
        Assert.Null(ItemLocation(ctx, itemId));
        Assert.NotNull(new ItemRepo().GetItemById(itemId));
    }

    [Fact]
    public void GetLocationItems_ReturnsWhatHappenedThere_EarliestFirst()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Pelennor" });
        string elsewhere = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Elsewhere" });

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO items (id, title, timeline_id, year, absolute_start, location_id) VALUES ('late', 'Late', @Tl, 200, 200.0, @Loc)",
                new { Tl = tlId, Loc = locId });
            db.Execute("INSERT INTO items (id, title, timeline_id, year, absolute_start, location_id) VALUES ('early', 'Early', @Tl, 100, 100.0, @Loc)",
                new { Tl = tlId, Loc = locId });
            db.Execute("INSERT INTO items (id, title, timeline_id, year, absolute_start, location_id) VALUES ('other', 'Other', @Tl, 150, 150.0, @Loc)",
                new { Tl = tlId, Loc = elsewhere });
        }

        var items = new MapRepo().GetLocationItems(locId).ToList();

        Assert.Equal(new[] { "early", "late" }, items.Select(i => i.Id).ToArray());
    }

    // ── GetMapEvents: what the year scrubber and the paths read ───────────────

    [Fact]
    public void GetMapEvents_ReturnsOnlyWhatHappenedSomewhere_WithTheMapItIsOn()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = world, Name = "Pelennor" });
        string placed = InsertItem(ctx, tlId, locId);
        InsertItem(ctx, tlId, null);   // happened nowhere in particular

        var events = new MapRepo().GetMapEvents(tlId);

        var only = Assert.Single(events);
        Assert.Equal(placed, only.ItemId);
        Assert.Equal(locId, only.LocationId);
        Assert.Equal(world, only.MapId);
    }

    [Fact]
    public void GetMapEvents_CarriesWhoWasThere_AndLeavesOutWhoWasOnlyMentioned()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = world, Name = "Pelennor" });
        string itemId = InsertItem(ctx, tlId, locId);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO characters (id, name, color, timeline_id) VALUES ('there', 'Éowyn', '#f59e0b', @Tl)", new { Tl = tlId });
            db.Execute("INSERT INTO characters (id, name, timeline_id) VALUES ('absent', 'Denethor', @Tl)", new { Tl = tlId });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, mentioned_only) VALUES (@I, 'there', 0)", new { I = itemId });
            db.Execute("INSERT INTO item_character_appearances (item_id, character_id, mentioned_only) VALUES (@I, 'absent', 1)", new { I = itemId });
        }

        var only = Assert.Single(new MapRepo().GetMapEvents(tlId));

        var who = Assert.Single(only.Cast);
        Assert.Equal("there", who.CharacterId);
        Assert.Equal("Éowyn", who.Name);
        Assert.Equal("#f59e0b", who.Color);
    }

    [Fact]
    public void GetMapEvents_LeavesOutTheEventsOfAHiddenCharacter()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = world, Name = "Rivendell" });
        string birth = InsertItem(ctx, tlId, locId);

        using (var db = ctx.OpenConnection())
        {
            db.Execute(@"INSERT INTO characters (id, name, timeline_id, show_on_timeline, birth_item_id)
                         VALUES ('hidden', 'Arwen', @Tl, 0, @Birth)", new { Tl = tlId, Birth = birth });
        }

        // Show on timeline is off, so nothing draws them — the map included.
        Assert.Empty(new MapRepo().GetMapEvents(tlId));
        Assert.Empty(new MapRepo().GetLocationItems(locId));
    }

    // ── Saving ────────────────────────────────────────────────────────────────

    [Fact]
    public void SaveLocation_UpdatesInPlace_RatherThanAddingASecondPin()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string locId = repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Before", X = 0.1, Y = 0.1 });

        repo.SaveLocation(new LocationItem { Id = locId, MapId = mapId, Name = "After", X = 0.9, Y = 0.9 });

        var pin = Assert.Single(repo.GetMaps(tlId).Single().Locations);
        Assert.Equal("After", pin.Name);
        Assert.Equal(0.9, pin.X, precision: 6);
    }

    [Fact]
    public void SaveMap_UpdatesInPlace_AndKeepsItsPins()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Before" });
        repo.SaveLocation(new LocationItem { MapId = mapId, Name = "Pin" });

        repo.SaveMap(new MapItem { Id = mapId, TimelineId = tlId, Name = "After", Description = "Redrawn" });

        var map = Assert.Single(repo.GetMaps(tlId));
        Assert.Equal("After", map.Name);
        Assert.Equal("Redrawn", map.Description);
        Assert.Single(map.Locations);
    }

    // A new map claims the standard 10 miles across its middle fifth, and north is straight up: the
    // scale bar and the compass have something true to draw before anyone has calibrated anything.
    [Fact]
    public void SaveMap_StartsAtTheStandardScale_AndKeepsWhatTheWriterCalibrates()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });

        var fresh = Assert.Single(repo.GetMaps(tlId));
        Assert.Equal(10, fresh.ScaleLength, precision: 6);
        Assert.Equal("miles", fresh.ScaleUnit);
        Assert.Equal(0.2, fresh.ScaleFraction, precision: 6);
        Assert.Equal(0, fresh.NorthOffset, precision: 6);

        // Two points 3/8 of the image apart, told they are 50 leagues: that is the scale from now on.
        fresh.ScaleLength = 50;
        fresh.ScaleUnit = "leagues";
        fresh.ScaleFraction = 0.375;
        fresh.NorthOffset = 31.5;
        repo.SaveMap(fresh);

        var again = repo.GetMap(mapId, ensureViews: false)!;
        Assert.Equal(50, again.ScaleLength, precision: 6);
        Assert.Equal("leagues", again.ScaleUnit);
        Assert.Equal(0.375, again.ScaleFraction, precision: 6);
        Assert.Equal(31.5, again.NorthOffset, precision: 6);
    }

    // How many squares across the lettered grid is. Nothing until the writer says, because a default
    // stored as a number would be indistinguishable from one they chose — and what is stored is kept
    // inside what can be drawn and read, so a grid of one square or of five thousand never reaches a canvas.
    [Fact]
    public void SaveMap_KeepsTheGridTheWriterAskedFor_WithinWhatCanBeDrawn()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string mapId = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        Assert.Equal(0, repo.GetMap(mapId, ensureViews: false)!.GridCols);

        var fresh = repo.GetMap(mapId, ensureViews: false)!;
        fresh.GridCols = 16;
        repo.SaveMap(fresh);
        Assert.Equal(16, repo.GetMap(mapId, ensureViews: false)!.GridCols);

        fresh.GridCols = 1;
        repo.SaveMap(fresh);
        Assert.Equal(2, repo.GetMap(mapId, ensureViews: false)!.GridCols);

        fresh.GridCols = 5000;
        repo.SaveMap(fresh);
        Assert.Equal(200, repo.GetMap(mapId, ensureViews: false)!.GridCols);
    }

    // The rectangle a child map grows out of when the view descends into it. It lives on the pin,
    // because one map can hang off two pins and each is a different patch of a different parent.
    [Fact]
    public void SaveLocation_RemembersHowMuchOfTheParentTheChildMapCovers()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string city = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Ashvale" });
        string doorway = repo.SaveLocation(new LocationItem
        {
            MapId = world, Name = "Ashvale", ChildMapId = city, FootprintW = 0.08,
        });
        string plain = repo.SaveLocation(new LocationItem { MapId = world, Name = "The Long Sea" });

        var pins = repo.GetMaps(tlId).Single(m => m.Id == world).Locations;
        Assert.Equal(0.08, pins.Single(p => p.Id == doorway).FootprintW!.Value, precision: 6);
        // A place nobody has sized has no rectangle, which is not the same as a rectangle of nothing.
        Assert.Null(pins.Single(p => p.Id == plain).FootprintW);
    }

    // BL-88: pins misplaced in Asia go to North America at the same spot on the picture; a loose
    // continent map hangs under the new world map by a door in its middle; nothing goes inside itself.
    [Fact]
    public void BulkEdit_MovesPinsAndMaps_AndRefusesALoop()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        var repo = new MapRepo();

        string world = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "World" });
        string asia = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Asia" });
        string america = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "North America" });
        string city = repo.SaveMap(new MapItem { TimelineId = tlId, Name = "Boston" });
        string asiaDoor = repo.SaveLocation(new LocationItem { MapId = world, Name = "Asia", ChildMapId = asia });
        string pin = repo.SaveLocation(new LocationItem { MapId = asia, Name = "Boston", X = 0.2, Y = 0.3, ChildMapId = city, MarkerStyle = "{\"size\":30}" });

        Assert.Equal(1, repo.BulkEdit(new MapRepo.BulkPlaceEdit { Ids = [pin], MoveTo = america }));
        var moved = repo.GetMap(america, ensureViews: false)!.Locations.Single();
        Assert.Equal((pin, 0.2, 0.3), (moved.Id, moved.X, moved.Y));

        repo.BulkEdit(new MapRepo.BulkPlaceEdit { MapIds = [america], MoveTo = world });
        var door = repo.GetMap(world, ensureViews: false)!.Locations.Single(l => l.ChildMapId == america);
        Assert.Equal(("North America", 0.5, 0.5), (door.Name, door.X, door.Y));

        // The Asia door cannot go on Asia itself; the whole batch is refused, the North America door with it.
        var loop = Assert.Throws<InvalidOperationException>(() =>
            repo.BulkEdit(new MapRepo.BulkPlaceEdit { Ids = [asiaDoor, door.Id], Color = "#ff0000", MoveTo = asia }));
        Assert.Contains("Asia", loop.Message);
        // The colour went in the same transaction, so it did not stick either.
        Assert.Null(repo.GetMap(world, ensureViews: false)!.Locations.Single(l => l.Id == asiaDoor).Color);

        repo.BulkEdit(new MapRepo.BulkPlaceEdit { Ids = [pin], Color = "#00ff00", ResetLook = true });
        var looked = repo.GetMap(america, ensureViews: false)!.Locations.Single();
        Assert.Equal(("#00ff00", (string?)null), (looked.Color, looked.MarkerStyle));
        repo.BulkEdit(new MapRepo.BulkPlaceEdit { Ids = [pin], Color = "" });
        Assert.Null(repo.GetMap(america, ensureViews: false)!.Locations.Single().Color);
    }
}

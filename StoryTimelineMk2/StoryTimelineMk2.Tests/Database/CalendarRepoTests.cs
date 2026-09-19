using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class CalendarRepoTests
{
    private static LodItem MakeLod(string? id = null) => new()
    {
        Id = id ?? Guid.NewGuid().ToString(),
        Name = "Test LOD",
        Profile = "[{\"index\":0,\"formatKey\":\"YEARS\",\"stepFraction\":1}]"
    };

    private static CalendarItem MakeCalendar(string lodId, string? calId = null) => new()
    {
        Id = calId ?? Guid.NewGuid().ToString(),
        Name = "Test Calendar",
        ShortName = "TC",
        AlternateName = "Alt Name",
        NameBefore0 = "BC",
        NameAfter0 = "AD",
        LodProfileId = lodId,
        YearDefinition = "{\"length\":365}"
    };

    // ── GetAll ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetAll_ReturnsAtLeastDefaultCalendar_OnFreshDb()
    {
        using var ctx = new DbTestContext();

        var repo = new CalendarRepo();
        var all = repo.GetAll().ToList();

        Assert.Contains(all, c => c.Id == "cal_default_gregorian");
    }

    [Fact]
    public void GetAll_ReturnsAllCalendars_AfterInsertion()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod();
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        var cal = MakeCalendar(lod.Id);
        repo.SaveCalendar(cal);

        var all = repo.GetAll().ToList();
        Assert.Contains(all, c => c.Id == cal.Id);
    }

    [Fact]
    public void GetAll_IsOrderedByName()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod();
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        repo.SaveCalendar(new CalendarItem { Id = "z-cal", Name = "ZZZ Cal", LodProfileId = lod.Id, YearDefinition = "{}" });
        repo.SaveCalendar(new CalendarItem { Id = "a-cal", Name = "AAA Cal", LodProfileId = lod.Id, YearDefinition = "{}" });

        var all = repo.GetAll().ToList();
        var names = all.Select(c => c.Name).ToList();

        Assert.Equal(names.OrderBy(n => n).ToList(), names);
    }

    // ── GetCalendarById ───────────────────────────────────────────────────────

    [Fact]
    public void GetCalendarById_ReturnsDefaultCalendar_WithLodProfile()
    {
        using var ctx = new DbTestContext();

        var repo = new CalendarRepo();
        var cal = repo.GetCalendarById("cal_default_gregorian");

        Assert.NotNull(cal);
        Assert.Equal("cal_default_gregorian", cal.Id);
        Assert.Equal("Gregorian", cal.Name);
        Assert.NotNull(cal.LodProfile);
        Assert.Equal("lod_default", cal.LodProfile.Id);
    }

    [Fact]
    public void GetCalendarById_ReturnsCorrectCalendar_AfterSave()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod("lod-for-cal-test");
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        var cal = MakeCalendar(lod.Id, "cal-test-xyz");
        cal.Name = "My Fantasy Calendar";
        repo.SaveCalendar(cal);

        var retrieved = repo.GetCalendarById("cal-test-xyz");
        Assert.Equal("My Fantasy Calendar", retrieved.Name);
        Assert.Equal("BC", retrieved.NameBefore0);
        Assert.Equal("AD", retrieved.NameAfter0);
        Assert.NotNull(retrieved.LodProfile);
        Assert.Equal(lod.Id, retrieved.LodProfile.Id);
    }

    [Fact]
    public void GetCalendarById_Throws_WhenIdDoesNotExist()
    {
        using var ctx = new DbTestContext();

        var repo = new CalendarRepo();
        Assert.Throws<InvalidOperationException>(() => repo.GetCalendarById("nonexistent-calendar-id"));
    }

    // ── SaveCalendar (upsert) ─────────────────────────────────────────────────

    [Fact]
    public void SaveCalendar_InsertsNewCalendar()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod();
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        var cal = MakeCalendar(lod.Id, "cal-insert-test");
        repo.SaveCalendar(cal);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal-insert-test'");
        Assert.Equal(1, count);
    }

    [Fact]
    public void SaveCalendar_UpdatesExistingCalendar_OnConflict()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod();
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        var cal = MakeCalendar(lod.Id, "cal-upsert-test");
        repo.SaveCalendar(cal);

        cal.Name = "Updated Calendar Name";
        cal.ShortName = "UCN";
        repo.SaveCalendar(cal);

        var retrieved = repo.GetCalendarById("cal-upsert-test");
        Assert.Equal("Updated Calendar Name", retrieved.Name);
        Assert.Equal("UCN", retrieved.ShortName);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal-upsert-test'");
        Assert.Equal(1, count);
    }

    // ── SaveCalendarWithLod ───────────────────────────────────────────────────

    [Fact]
    public void SaveCalendarWithLod_SavesBothLodAndCalendar()
    {
        using var ctx = new DbTestContext();

        var lod = MakeLod("lod-inline-save");
        var cal = new CalendarItem
        {
            Id = "cal-inline-save",
            Name = "Inline Calendar",
            LodProfileId = lod.Id,
            LodProfile = lod,
            YearDefinition = "{\"length\":360}"
        };

        var repo = new CalendarRepo();
        repo.SaveCalendarWithLod(cal);

        using var db = ctx.OpenConnection();
        var lodCount = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod-inline-save'");
        var calCount = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal-inline-save'");
        Assert.Equal(1, lodCount);
        Assert.Equal(1, calCount);
    }

    // ── DeleteCalendar ────────────────────────────────────────────────────────

    [Fact]
    public void DeleteCalendar_RemovesCalendar_FromDatabase()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod();
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        var cal = MakeCalendar(lod.Id, "cal-to-delete");
        repo.SaveCalendar(cal);

        repo.DeleteCalendar("cal-to-delete");

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal-to-delete'");
        Assert.Equal(0, count);
    }

    [Fact]
    public void DeleteCalendar_LeavesReferencedLodProfileIntact()
    {
        using var ctx = new DbTestContext();

        var lodRepo = new LodRepo();
        var lod = MakeLod("lod-shared");
        lodRepo.SaveLodProfile(lod);

        var repo = new CalendarRepo();
        // Two calendars sharing the same lod
        var cal1 = MakeCalendar(lod.Id, "cal-shared-1");
        var cal2 = MakeCalendar(lod.Id, "cal-shared-2");
        repo.SaveCalendar(cal1);
        repo.SaveCalendar(cal2);

        repo.DeleteCalendar("cal-shared-1");

        // The LOD profile must still exist
        using var db = ctx.OpenConnection();
        var lodCount = db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod-shared'");
        Assert.Equal(1, lodCount);

        // The other calendar must still exist
        var cal2Count = db.QuerySingle<int>("SELECT COUNT(*) FROM calendars WHERE id = 'cal-shared-2'");
        Assert.Equal(1, cal2Count);
    }

    [Fact]
    public void DeleteCalendar_ReassignsTimelinesToDefault_AndDropsOwnLod()
    {
        using var ctx = new DbTestContext();

        var lod = MakeLod("lod-own");
        new LodRepo().SaveLodProfile(lod);
        var repo = new CalendarRepo();
        repo.SaveCalendar(MakeCalendar(lod.Id, "cal-in-use"));
        var timelines = new TimelineRepo();
        int usedId   = timelines.CreateTimeline("Uses it", calendarId: "cal-in-use");
        int otherId  = timelines.CreateTimeline("Default");

        Assert.Equal(1, repo.GetUsageCounts()["cal-in-use"]);
        int reassigned = repo.DeleteCalendar("cal-in-use");

        Assert.Equal(1, reassigned);
        Assert.Equal(CalendarRepo.DefaultCalendarId, timelines.GetTimelineById(usedId).CalendarId);
        Assert.Equal(CalendarRepo.DefaultCalendarId, timelines.GetTimelineById(otherId).CalendarId);
        using var db = ctx.OpenConnection();
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM lod_profiles WHERE id = 'lod-own'"));
        Assert.False(repo.GetUsageCounts().ContainsKey("cal-in-use"));
    }

    [Fact]
    public void DeleteCalendar_RefusesDefaultCalendar()
    {
        using var ctx = new DbTestContext();

        Assert.Throws<InvalidOperationException>(() => new CalendarRepo().DeleteCalendar(CalendarRepo.DefaultCalendarId));
        Assert.NotNull(new CalendarRepo().GetCalendarById(CalendarRepo.DefaultCalendarId));
    }
}

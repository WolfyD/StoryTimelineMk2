using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class SettingsRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    // ── GetOrCreateSettings ───────────────────────────────────────────────────

    [Fact]
    public void GetOrCreateSettings_CreatesNewRow_WhenNoneExists()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);

        Assert.NotNull(settings);
        Assert.Equal(tlId, settings.TimelineId);
    }

    [Fact]
    public void GetOrCreateSettings_ReturnsDefaultValues_OnFirstCall()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);

        Assert.Equal(20, settings.PixelsPerSubtick);
        Assert.Equal(1000, settings.WindowSizeX);
        Assert.Equal(700, settings.WindowSizeY);
        Assert.Equal(300, settings.WindowPositionX);
        Assert.Equal(100, settings.WindowPositionY);
        Assert.Equal(10, settings.DisplayRadius);
    }

    [Fact]
    public void GetOrCreateSettings_ReturnsSameRow_OnSecondCall()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var first = repo.GetOrCreateSettings(tlId);
        var second = repo.GetOrCreateSettings(tlId);

        Assert.Equal(first.TimelineId, second.TimelineId);
        Assert.Equal(first.PixelsPerSubtick, second.PixelsPerSubtick);
    }

    [Fact]
    public void GetOrCreateSettings_DoesNotCreateDuplicateRows_OnMultipleCalls()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        repo.GetOrCreateSettings(tlId);
        repo.GetOrCreateSettings(tlId);
        repo.GetOrCreateSettings(tlId);

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM settings WHERE timeline_id = @TlId", new { TlId = tlId });
        Assert.Equal(1, count);
    }

    // ── GetTimelineSettings (alias for GetOrCreateSettings) ───────────────────

    [Fact]
    public void GetTimelineSettings_BehavesIdentically_ToGetOrCreateSettings()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var s1 = repo.GetOrCreateSettings(tlId);
        var s2 = repo.GetTimelineSettings(tlId);

        Assert.Equal(s1.TimelineId, s2.TimelineId);
        Assert.Equal(s1.PixelsPerSubtick, s2.PixelsPerSubtick);
    }

    // ── SaveSettings ──────────────────────────────────────────────────────────

    [Fact]
    public void SaveSettings_PersistsChangedFields()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);

        settings.PixelsPerSubtick = 40;
        repo.SaveSettings(settings);

        var retrieved = repo.GetOrCreateSettings(tlId);
        Assert.Equal(40, retrieved.PixelsPerSubtick);
    }

    [Fact]
    public void SaveSettings_PersistsHeaderMode()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);
        Assert.Equal(0, settings.HeaderMode);   // full by default

        settings.HeaderMode = 2;
        repo.SaveSettings(settings);

        Assert.Equal(2, repo.GetOrCreateSettings(tlId).HeaderMode);
    }

    [Fact]
    public void SaveSettings_PersistsWindowState()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);

        settings.WindowSizeX = 1920;
        settings.WindowSizeY = 1080;
        settings.WindowPositionX = 50;
        settings.WindowPositionY = 25;
        repo.SaveSettings(settings);

        var retrieved = repo.GetOrCreateSettings(tlId);
        Assert.Equal(1920, retrieved.WindowSizeX);
        Assert.Equal(1080, retrieved.WindowSizeY);
        Assert.Equal(50, retrieved.WindowPositionX);
        Assert.Equal(25, retrieved.WindowPositionY);
    }

    [Fact]
    public void SaveSettings_PersistsCanvasSettings()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var settings = repo.GetOrCreateSettings(tlId);

        settings.CanvasSettings = "{\"zoom\":2.5,\"pan\":100}";
        repo.SaveSettings(settings);

        var retrieved = repo.GetOrCreateSettings(tlId);
        Assert.Equal("{\"zoom\":2.5,\"pan\":100}", retrieved.CanvasSettings);
    }

    // ── SaveWindowState ───────────────────────────────────────────────────────

    [Fact]
    public void SaveWindowState_UpdatesWindowPositionAndSize()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        repo.GetOrCreateSettings(tlId); // ensure row exists

        repo.SaveWindowState(tlId, x: 10, y: 20, width: 800, height: 600);

        var retrieved = repo.GetOrCreateSettings(tlId);
        Assert.Equal(10, retrieved.WindowPositionX);
        Assert.Equal(20, retrieved.WindowPositionY);
        Assert.Equal(800, retrieved.WindowSizeX);
        Assert.Equal(600, retrieved.WindowSizeY);
    }

    // ── GetOrCreateAppSettings ────────────────────────────────────────────────

    [Fact]
    public void GetOrCreateAppSettings_CreatesRowWithNullTimelineId_OnFirstCall()
    {
        using var ctx = new DbTestContext();

        var repo = new SettingsRepo();
        var appSettings = repo.GetOrCreateAppSettings();

        Assert.NotNull(appSettings);
        Assert.Equal(0, appSettings.TimelineId); // NULL maps to 0 via Dapper default
    }

    [Fact]
    public void GetOrCreateAppSettings_DoesNotCreateDuplicate_OnSecondCall()
    {
        using var ctx = new DbTestContext();

        var repo = new SettingsRepo();
        repo.GetOrCreateAppSettings();
        repo.GetOrCreateAppSettings();

        using var db = ctx.OpenConnection();
        var count = db.QuerySingle<int>("SELECT COUNT(*) FROM settings WHERE timeline_id IS NULL");
        Assert.Equal(1, count);
    }

    // ── SaveAppWindowState ────────────────────────────────────────────────────

    [Fact]
    public void SaveAppWindowState_UpdatesNullTimelineIdRow()
    {
        using var ctx = new DbTestContext();

        var repo = new SettingsRepo();
        repo.GetOrCreateAppSettings(); // ensure row exists

        repo.SaveAppWindowState(x: 5, y: 10, width: 1280, height: 720);

        var appSettings = repo.GetOrCreateAppSettings();
        Assert.Equal(5, appSettings.WindowPositionX);
        Assert.Equal(10, appSettings.WindowPositionY);
        Assert.Equal(1280, appSettings.WindowSizeX);
        Assert.Equal(720, appSettings.WindowSizeY);
    }

    // ── SaveYearCalendarWindowState ───────────────────────────────────────────

    [Fact]
    public void SaveYearCalendarWindowState_UpdatesYearCalendarFields_Only()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        repo.GetOrCreateSettings(tlId); // ensure row exists

        repo.SaveYearCalendarWindowState(tlId, x: 11, y: 22, width: 333, height: 444);

        var s = repo.GetOrCreateSettings(tlId);
        Assert.Equal(11, s.YearCalendarPositionX);
        Assert.Equal(22, s.YearCalendarPositionY);
        Assert.Equal(333, s.YearCalendarSizeX);
        Assert.Equal(444, s.YearCalendarSizeY);
        Assert.Equal(1000, s.WindowSizeX); // main window state untouched
        Assert.Equal(300, s.WindowPositionX);
    }

    // ── DeleteSettings ────────────────────────────────────────────────────────

    [Fact]
    public void DeleteSettings_RemovesRow_AndNextGetRecreatesDefaults()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new SettingsRepo();
        var s = repo.GetOrCreateSettings(tlId);
        s.PixelsPerSubtick = 99;
        repo.SaveSettings(s);
        // settings.id is an INTEGER rowid assigned on insert; re-read to get the stored id
        string storedId = repo.GetOrCreateSettings(tlId).Id;

        repo.DeleteSettings(storedId);

        using var db = ctx.OpenConnection();
        Assert.Equal(0, db.QuerySingle<int>("SELECT COUNT(*) FROM settings WHERE timeline_id = @TlId", new { TlId = tlId }));
        Assert.Equal(20, repo.GetOrCreateSettings(tlId).PixelsPerSubtick);
    }
}

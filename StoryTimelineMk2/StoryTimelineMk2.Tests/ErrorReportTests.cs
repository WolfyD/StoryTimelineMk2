using StoryTimelineMk2;
using StoryTimelineMk2.Database.Migrations;

namespace StoryTimelineMk2.Tests;

public class ErrorReportTests
{
    [Fact]
    public void Build_ForMigrationFailure_ListsEverythingNeededToDiagnoseIt()
    {
        var info = new MigrationInfo("timeline", @"C:\data\timeline.sqlite", 1, 3, "1.0.2", "1.0.4");
        Exception inner;
        try { throw new InvalidOperationException("no such column: mood"); } catch (Exception e) { inner = e; }
        var ex = new MigrationException(info, "migration 2 (add items.mood)", @"C:\data\backups\pre v1.0.2-v1.0.4 migration backup - 2026-09-19 14-30-05.sqlite",
                                        "timeline database migration 2 (add items.mood) failed and was rolled back; the database was left at schema version 1.", inner);

        string report = ErrorReport.Build("The timeline database could not be upgraded.", ex);

        Assert.Contains("Story Timeline — error report", report);
        Assert.Contains($"App version: {UpdateChecker.CurrentVersion}", report);
        Assert.Contains($"Log file:    {Logger.LogPath}", report);
        Assert.Contains("The timeline database could not be upgraded.", report);
        Assert.Contains(@"Database:       timeline (C:\data\timeline.sqlite)", report);
        Assert.Contains("Schema version: 1 (app 1.0.2) → 3 (app 1.0.4)", report);
        Assert.Contains("Failed stage:   migration 2 (add items.mood)", report);
        Assert.Contains(@"Backup:         C:\data\backups\pre v1.0.2-v1.0.4 migration backup - 2026-09-19 14-30-05.sqlite", report);
        Assert.Contains("left at schema version 1", report);
        Assert.Contains("no such column: mood", report);
        Assert.Contains("   at ", report); // stack trace of the inner exception
    }

    [Fact]
    public void Build_WithoutBackup_SaysTheDatabaseWasNotModified()
    {
        var ex = new MigrationException(new MigrationInfo("usage statistics", "u.sqlite", 9, 1, "1.0.1", "1.0.1"), "version check", null, "newer version");

        string report = ErrorReport.Build("t", ex);

        Assert.Contains("Backup:         none — the database was not modified", report);
        Assert.Contains("Database:       usage statistics (u.sqlite)", report);
    }

    [Fact]
    public void Build_ForOtherExceptions_IncludesTypeMessageAndStack()
    {
        Exception ex;
        try { throw new IOException("disk full"); } catch (Exception e) { ex = e; }

        string report = ErrorReport.Build("Unexpected error.", ex);

        Assert.Contains("Unexpected error.", report);
        Assert.Contains("System.IO.IOException: disk full", report);
        Assert.Contains("   at ", report);
        Assert.DoesNotContain("Schema version", report);
    }
}

using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class HiddenRangeRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static HiddenRangeItem MakeRange(int timelineId, int start = 100, int end = 200) => new()
    {
        Id = 0, // 0 = new (INSERT path)
        TimelineId = timelineId,
        StartYear = start,
        EndYear = end,
        Label = "Hidden Gap"
    };

    // ── GetByTimeline ─────────────────────────────────────────────────────────

    [Fact]
    public void GetByTimeline_ReturnsEmpty_WhenNoRangesExist()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var ranges = repo.GetByTimeline(tlId).ToList();

        Assert.Empty(ranges);
    }

    [Fact]
    public void GetByTimeline_ReturnsOnlyRangesForGivenTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = InsertTimeline(ctx, "Timeline Alpha");
        int tl2 = InsertTimeline(ctx, "Timeline Beta");

        var repo = new HiddenRangeRepo();
        repo.Save(MakeRange(tl1, 100, 200));
        repo.Save(MakeRange(tl2, 300, 400));

        var tl1Ranges = repo.GetByTimeline(tl1).ToList();
        Assert.Single(tl1Ranges);
        Assert.Equal(tl1, tl1Ranges[0].TimelineId);
    }

    [Fact]
    public void GetByTimeline_ReturnsRangesOrderedByStartYear()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        repo.Save(MakeRange(tlId, 500, 600));
        repo.Save(MakeRange(tlId, 100, 200));
        repo.Save(MakeRange(tlId, 300, 400));

        var ranges = repo.GetByTimeline(tlId).ToList();

        Assert.Equal(3, ranges.Count);
        Assert.Equal(100, ranges[0].StartYear);
        Assert.Equal(300, ranges[1].StartYear);
        Assert.Equal(500, ranges[2].StartYear);
    }

    [Fact]
    public void GetByTimeline_ReturnsMultipleRanges()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        repo.Save(MakeRange(tlId, 100, 200));
        repo.Save(MakeRange(tlId, 300, 400));

        var ranges = repo.GetByTimeline(tlId).ToList();
        Assert.Equal(2, ranges.Count);
    }

    // ── Save (insert) ─────────────────────────────────────────────────────────

    [Fact]
    public void Save_ReturnsNewId_WhenInsertingNewRange()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var range = MakeRange(tlId);
        var newId = repo.Save(range);

        Assert.True(newId > 0);
    }

    [Fact]
    public void Save_PersistsAllFields_OnInsert()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var range = new HiddenRangeItem
        {
            Id = 0,
            TimelineId = tlId,
            StartYear = 1200,
            EndYear = 1400,
            Label = "Dark Ages Gap"
        };
        var newId = repo.Save(range);

        var ranges = repo.GetByTimeline(tlId).ToList();
        var retrieved = ranges.Single(r => r.Id == newId);

        Assert.Equal(1200, retrieved.StartYear);
        Assert.Equal(1400, retrieved.EndYear);
        Assert.Equal("Dark Ages Gap", retrieved.Label);
    }

    // ── Save (update) ─────────────────────────────────────────────────────────

    [Fact]
    public void Save_UpdatesExistingRange_WhenIdIsNonZero()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var range = MakeRange(tlId, 100, 200);
        var newId = repo.Save(range);

        // Now update the range
        var updateRange = new HiddenRangeItem
        {
            Id = newId,
            TimelineId = tlId,
            StartYear = 150,
            EndYear = 250,
            Label = "Updated Label"
        };
        var returnedId = repo.Save(updateRange);

        Assert.Equal(newId, returnedId);

        var ranges = repo.GetByTimeline(tlId).ToList();
        Assert.Single(ranges);
        Assert.Equal(150, ranges[0].StartYear);
        Assert.Equal(250, ranges[0].EndYear);
        Assert.Equal("Updated Label", ranges[0].Label);
    }

    [Fact]
    public void Save_Update_DoesNotCreateDuplicateRow()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var range = MakeRange(tlId, 100, 200);
        var newId = repo.Save(range);

        var updateRange = new HiddenRangeItem { Id = newId, TimelineId = tlId, StartYear = 999, EndYear = 1000 };
        repo.Save(updateRange);

        var ranges = repo.GetByTimeline(tlId).ToList();
        Assert.Single(ranges);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    [Fact]
    public void Delete_RemovesRangeFromDatabase()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var range = MakeRange(tlId);
        var newId = repo.Save(range);

        repo.Delete(newId);

        var ranges = repo.GetByTimeline(tlId).ToList();
        Assert.Empty(ranges);
    }

    [Fact]
    public void Delete_LeavesOtherRangesIntact()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new HiddenRangeRepo();
        var keepId = repo.Save(MakeRange(tlId, 100, 200));
        var deleteId = repo.Save(MakeRange(tlId, 300, 400));

        repo.Delete(deleteId);

        var ranges = repo.GetByTimeline(tlId).ToList();
        Assert.Single(ranges);
        Assert.Equal(keepId, ranges[0].Id);
    }

    [Fact]
    public void Delete_NonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new HiddenRangeRepo();
        var ex = Record.Exception(() => repo.Delete(999999));
        Assert.Null(ex);
    }
}

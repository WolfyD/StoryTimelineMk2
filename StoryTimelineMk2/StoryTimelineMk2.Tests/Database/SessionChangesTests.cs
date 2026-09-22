using Dapper;
using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// BL-33. The diff is the whole feature: if it reports the wrong thing, a co-writer's copy gets
/// the wrong edits. Every test here takes a baseline, changes something, and checks what comes out.
/// </summary>
[Collection("Database")]
public class SessionChangesTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Session Test")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@title, '', '', 0)",
            new { title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static string InsertItem(DbTestContext ctx, int timelineId, string title)
    {
        string id = Guid.NewGuid().ToString();
        using var db = ctx.OpenConnection();
        db.Execute(@"INSERT INTO items
            (id, title, description, type_id, year, end_year, absolute_start, absolute_end,
             timeline_id, item_index, show_in_notes, importance, min_lod_level)
            VALUES (@id, @title, '', 1, 100, 100, 100.0, 100.0, @tlId, 0, 1, 5, 3)",
            new { id, title, tlId = timelineId });
        return id;
    }

    private static void Drop(DbTestContext ctx, int timelineId)
    {
        using var db = ctx.OpenConnection();
        db.Execute("DELETE FROM items WHERE timeline_id = @id", new { id = timelineId });
        db.Execute("DELETE FROM timelines WHERE id = @id", new { id = timelineId });
    }

    private static string Export(DbTestContext ctx, int timelineId)
    {
        string path = Path.Combine(ctx.TempDir, $"session_{Guid.NewGuid():N}.stlc");
        SessionChanges.Write(timelineId, path);
        return path;
    }

    [Fact]
    public void AnUntouchedSessionHasNothingToExport()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        InsertItem(ctx, tlId, "Already there");

        SessionChanges.EnsureSnapshot(tlId);
        var summary = SessionChanges.Summarise(tlId);

        Assert.Equal((0, 0, 0), (summary.Added, summary.Changed, summary.Removed));
        Assert.Empty(summary.Entries);
    }

    [Fact]
    public void AddedEditedAndDeletedItemsAreCountedSeparately()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string edited  = InsertItem(ctx, tlId, "Edited");
        string removed = InsertItem(ctx, tlId, "Removed");

        SessionChanges.EnsureSnapshot(tlId);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE items SET title = 'Edited twice' WHERE id = @id", new { id = edited });
            db.Execute("DELETE FROM items WHERE id = @id", new { id = removed });
        }
        InsertItem(ctx, tlId, "Brand new");

        var summary = SessionChanges.Summarise(tlId);

        Assert.Equal((1, 1, 1), (summary.Added, summary.Changed, summary.Removed));
        Assert.Contains(summary.Entries, e => e.Op == "delete" && e.Title == "Removed");
    }

    // A tag change touches no column on `items`, so a row-only diff would miss it entirely.
    [Fact]
    public void RetaggingAnItemCountsAsAChange()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Tagged");

        SessionChanges.EnsureSnapshot(tlId);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("INSERT INTO tags (name) VALUES ('battle')");
            db.Execute(@"INSERT INTO item_tags (item_id, tag_id)
                         VALUES (@id, (SELECT id FROM tags WHERE name = 'battle'))", new { id = itemId });
        }

        var summary = SessionChanges.Summarise(tlId);
        Assert.Equal(1, summary.Changed);
    }

    [Fact]
    public void ApplyingTheFileBringsBackTheEditAndItsTags()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Before");

        SessionChanges.EnsureSnapshot(tlId);

        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE items SET title = 'After' WHERE id = @id", new { id = itemId });
            db.Execute("INSERT INTO tags (name) VALUES ('siege')");
            db.Execute(@"INSERT INTO item_tags (item_id, tag_id)
                         VALUES (@id, (SELECT id FROM tags WHERE name = 'siege'))", new { id = itemId });
        }

        string path = Export(ctx, tlId);

        // Stand in for the co-writer's copy: put the row back the way it was and unlink the tag.
        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE items SET title = 'Before' WHERE id = @id", new { id = itemId });
            db.Execute("DELETE FROM item_tags WHERE item_id = @id", new { id = itemId });
        }

        var result = SessionChanges.Apply(path, decisions: null);

        using var check = ctx.OpenConnection();
        Assert.Equal(1, result.Applied);
        Assert.Equal("After", check.QuerySingle<string>("SELECT title FROM items WHERE id = @id", new { id = itemId }));
        Assert.Equal(1, check.QuerySingle<int>(
            "SELECT COUNT(*) FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = @id AND t.name = 'siege'",
            new { id = itemId }));
    }

    [Fact]
    public void KeepingTheLocalVersionLeavesTheRowAlone()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Before");

        SessionChanges.EnsureSnapshot(tlId);
        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE items SET title = 'After' WHERE id = @id", new { id = itemId });

        string path = Export(ctx, tlId);

        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE items SET title = 'Mine' WHERE id = @id", new { id = itemId });

        var result = SessionChanges.Apply(path, new Dictionary<string, string> { [itemId] = "local" });

        using var check = ctx.OpenConnection();
        Assert.Equal((0, 1), (result.Applied, result.Kept));
        Assert.Equal("Mine", check.QuerySingle<string>("SELECT title FROM items WHERE id = @id", new { id = itemId }));
    }

    [Fact]
    public void APreviewFlagsRowsThisCopyAlsoEdited()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string untouched = InsertItem(ctx, tlId, "Untouched here");
        string contested = InsertItem(ctx, tlId, "Both edited");

        SessionChanges.EnsureSnapshot(tlId);
        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE items SET title = title || ' (them)' WHERE id IN (@a, @b)",
                new { a = untouched, b = contested });
        }

        string path = Export(ctx, tlId);

        // Only the contested row moves on locally — updated_at no longer matches the baseline.
        using (var db = ctx.OpenConnection())
        {
            db.Execute("UPDATE items SET title = 'Mine', updated_at = '2030-01-01 00:00:00' WHERE id = @id",
                new { id = contested });
        }

        var preview = SessionChanges.Preview(path);

        Assert.Equal(1, preview.Collisions);
        var entry = Assert.Single(preview.Entries, e => e.Collision);
        Assert.Equal(contested, entry.Id);
        Assert.Equal("Mine", entry.Local!.Title);
        Assert.Equal("Both edited (them)", entry.Incoming!.Title);
    }

    // A timeline imported into another copy gets a fresh id, so the id in the file is no use there.
    [Fact]
    public void AFileWhoseTimelineIdIsGoneResolvesByName()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx, "Travelling");
        SessionChanges.EnsureSnapshot(tlId);
        InsertItem(ctx, tlId, "Added");
        string path = Export(ctx, tlId);

        Drop(ctx, tlId);
        int newId = InsertTimeline(ctx, "Travelling");

        var preview = SessionChanges.Preview(path);

        Assert.Equal(newId, preview.TargetTimelineId);
        Assert.Equal(1, preview.Added);
    }

    [Fact]
    public void AFileForAnUnknownTimelineIsRefusedByName()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx, "Gone by then");
        SessionChanges.EnsureSnapshot(tlId);
        InsertItem(ctx, tlId, "Added");
        string path = Export(ctx, tlId);

        Drop(ctx, tlId);

        Assert.Contains("Gone by then", Assert.Throws<InvalidDataException>(() => SessionChanges.Preview(path)).Message);
    }

    private static string Today => DateTime.Now.ToString("yyyy-MM-dd");

    /// <summary>Pretends the open day happened <paramref name="daysAgo"/> days ago, so the next
    /// EnsureSnapshot seals it. Cheaper than a clock seam in production code, and it exercises
    /// the real sealing path rather than a stub of it.</summary>
    private static string Backdate(DbTestContext ctx, int timelineId, int daysAgo)
    {
        string day = DateTime.Now.AddDays(-daysAgo).ToString("yyyy-MM-dd");
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE session_days SET day = @day WHERE timeline_id = @id AND changes IS NULL",
            new { day, id = timelineId });
        return day;
    }

    /// <summary>Rolls the day over: seals whatever is open and starts today.</summary>
    private static string CloseDay(DbTestContext ctx, int timelineId, int daysAgo)
    {
        string day = Backdate(ctx, timelineId, daysAgo);
        SessionChanges.EnsureSnapshot(timelineId);
        return day;
    }

    private static void Edit(DbTestContext ctx, string itemId, string title, string updatedAt)
    {
        using var db = ctx.OpenConnection();
        db.Execute("UPDATE items SET title = @title, updated_at = @updatedAt WHERE id = @id",
            new { title, updatedAt, id = itemId });
    }

    private static string UpdatedAtOf(DbTestContext ctx, string itemId)
    {
        using var db = ctx.OpenConnection();
        return db.QuerySingle<DateTime>("SELECT updated_at FROM items WHERE id = @id", new { id = itemId })
                 .ToString("yyyy-MM-dd HH:mm:ss");
    }

    private static string ExportDays(DbTestContext ctx, int timelineId, params string[] days)
    {
        string path = Path.Combine(ctx.TempDir, $"range_{Guid.NewGuid():N}.stlc");
        SessionChanges.Write(timelineId, path, days);
        return path;
    }

    // ── The day log ─────────────────────────────────────────────────────────

    [Fact]
    public void YesterdaysWorkIsSealedWhenTodayOpens()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);
        InsertItem(ctx, tlId, "Written yesterday");

        string yesterday = CloseDay(ctx, tlId, 1);

        var history = SessionChanges.History(tlId);
        Assert.Equal(new[] { Today, yesterday }, history.Days.Select(d => d.Day));

        var done = history.Days.Single(d => d.Day == yesterday);
        Assert.False(done.Open);
        Assert.Equal((1, 0, 0), (done.Added, done.Changed, done.Removed));

        // Today starts where yesterday left off: the item is no longer news.
        Assert.True(history.Days.Single(d => d.Day == Today).Open);
        Assert.Equal(0, SessionChanges.Summarise(tlId).Added);
    }

    [Fact]
    public void ADayThatChangedNothingIsNotListed()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        InsertItem(ctx, tlId, "Already there");
        SessionChanges.EnsureSnapshot(tlId);

        CloseDay(ctx, tlId, 1);   // opened it, read it, closed it

        // Only today, which is open and therefore always shown.
        var day = Assert.Single(SessionChanges.History(tlId).Days);
        Assert.Equal(Today, day.Day);
        Assert.True(day.Open);
    }

    // ── Merging a range ────────────────────────────────────────────────

    [Fact]
    public void TwoDaysOfWorkOnOneItemTravelAsOneChange()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);

        string itemId = InsertItem(ctx, tlId, "Draft");
        string dayOne = CloseDay(ctx, tlId, 2);

        Edit(ctx, itemId, "Polished", "2026-09-21 12:00:00");
        string dayTwo = CloseDay(ctx, tlId, 1);

        var change = Assert.Single(SessionChanges.Read(ExportDays(ctx, tlId, dayOne, dayTwo)).Changes);
        // Still new to the other copy, whatever it became afterwards.
        Assert.Equal("insert", change.Op);
        Assert.Equal("Polished", change.Title);
    }

    [Fact]
    public void SomethingWrittenAndThrownAwayInsideTheRangeIsNeverMentioned()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);

        string itemId = InsertItem(ctx, tlId, "False start");
        string dayOne = CloseDay(ctx, tlId, 2);

        using (var db = ctx.OpenConnection())
            db.Execute("DELETE FROM items WHERE id = @id", new { id = itemId });
        string dayTwo = CloseDay(ctx, tlId, 1);

        Assert.Empty(SessionChanges.Read(ExportDays(ctx, tlId, dayOne, dayTwo)).Changes);
    }

    [Fact]
    public void TheAncestorIsTheVersionTheOtherCopyStillHas()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Original");
        SessionChanges.EnsureSnapshot(tlId);

        string shared = UpdatedAtOf(ctx, itemId);

        Edit(ctx, itemId, "First pass", "2026-09-20 09:00:00");
        string dayOne = CloseDay(ctx, tlId, 2);

        Edit(ctx, itemId, "Second pass", "2026-09-21 09:00:00");
        string dayTwo = CloseDay(ctx, tlId, 1);

        var change = Assert.Single(SessionChanges.Read(ExportDays(ctx, tlId, dayOne, dayTwo)).Changes);
        Assert.Equal("Second pass", change.Title);
        // Day two's ancestor is day one's result, which the other copy never saw.
        Assert.Equal(shared, change.BaselineUpdatedAt);
    }

    [Fact]
    public void ASkippedDayIsLeftOutOfTheFile()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);

        InsertItem(ctx, tlId, "Monday");
        string dayOne = CloseDay(ctx, tlId, 3);

        InsertItem(ctx, tlId, "Tuesday");
        CloseDay(ctx, tlId, 2);

        InsertItem(ctx, tlId, "Wednesday");
        string dayThree = CloseDay(ctx, tlId, 1);

        var titles = SessionChanges.Read(ExportDays(ctx, tlId, dayOne, dayThree)).Changes.Select(c => c.Title);
        Assert.Equal(new[] { "Monday", "Wednesday" }, titles);
    }

    [Fact]
    public void ExportingRemembersHowFarItGot()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);

        InsertItem(ctx, tlId, "Sent");
        string dayOne = CloseDay(ctx, tlId, 2);
        InsertItem(ctx, tlId, "Not sent");
        CloseDay(ctx, tlId, 1);

        Assert.Null(SessionChanges.History(tlId).LastExportDay);
        ExportDays(ctx, tlId, dayOne);

        var history = SessionChanges.History(tlId);
        Assert.Equal(dayOne, history.LastExportDay);
        Assert.NotNull(history.LastExportedAt);
    }

    // ── A range, all the way into the other copy ───────────────────────────────────

    /// <summary>The range tests above stop at what the file says. This one applies it.</summary>
    [Fact]
    public void ApplyingARangeBringsTheItemAcrossAsYouLastLeftIt()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        SessionChanges.EnsureSnapshot(tlId);

        string itemId = InsertItem(ctx, tlId, "Draft");
        string dayOne = CloseDay(ctx, tlId, 2);

        Edit(ctx, itemId, "Polished", "2026-09-21 12:00:00");
        string dayTwo = CloseDay(ctx, tlId, 1);

        string path = ExportDays(ctx, tlId, dayOne, dayTwo);

        // Stand in for the co-writer's copy: they never had it.
        using (var db = ctx.OpenConnection())
            db.Execute("DELETE FROM items WHERE id = @id", new { id = itemId });

        var result = SessionChanges.Apply(path, decisions: null);

        using var check = ctx.OpenConnection();
        Assert.Equal(1, result.Applied);
        Assert.Equal("Polished", check.QuerySingle<string>("SELECT title FROM items WHERE id = @id", new { id = itemId }));
        // Once, not once per day in the range.
        Assert.Equal(1, check.QuerySingle<int>("SELECT COUNT(*) FROM items WHERE timeline_id = @id", new { id = tlId }));
    }

    /// <summary>
    /// The reason Merge takes the ancestor from the oldest day: a copy that has not touched the
    /// item must see no collision, however many days the range covers. Take the newest day's
    /// ancestor instead and every row in the file asks the user to choose.
    /// </summary>
    [Fact]
    public void AnUntouchedCopySeesNoCollisionFromARange()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Original");
        SessionChanges.EnsureSnapshot(tlId);

        string shared = UpdatedAtOf(ctx, itemId);   // the version both copies started from

        Edit(ctx, itemId, "First pass", "2026-09-20 09:00:00");
        string dayOne = CloseDay(ctx, tlId, 2);
        Edit(ctx, itemId, "Second pass", "2026-09-21 09:00:00");
        string dayTwo = CloseDay(ctx, tlId, 1);

        string path = ExportDays(ctx, tlId, dayOne, dayTwo);

        // The co-writer's copy, still on the shared version.
        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE items SET title = 'Original', updated_at = @shared WHERE id = @id",
                new { shared, id = itemId });

        var preview = SessionChanges.Preview(path);
        Assert.Equal(0, preview.Collisions);

        var result = SessionChanges.Apply(path, decisions: null);
        using var check = ctx.OpenConnection();
        Assert.Equal(1, result.Applied);
        Assert.Equal("Second pass", check.QuerySingle<string>("SELECT title FROM items WHERE id = @id", new { id = itemId }));
    }

    /// <summary>...and the other half: a range must not hide a collision that is really there.</summary>
    [Fact]
    public void ARangeStillFlagsARowTheOtherCopyEdited()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);
        string itemId = InsertItem(ctx, tlId, "Original");
        SessionChanges.EnsureSnapshot(tlId);

        Edit(ctx, itemId, "First pass", "2026-09-20 09:00:00");
        string dayOne = CloseDay(ctx, tlId, 2);
        Edit(ctx, itemId, "Second pass", "2026-09-21 09:00:00");
        string dayTwo = CloseDay(ctx, tlId, 1);

        string path = ExportDays(ctx, tlId, dayOne, dayTwo);

        // The co-writer wrote their own version of the same item.
        using (var db = ctx.OpenConnection())
            db.Execute("UPDATE items SET title = 'Theirs', updated_at = '2030-01-01 00:00:00' WHERE id = @id",
                new { id = itemId });

        var preview = SessionChanges.Preview(path);

        Assert.Equal(1, preview.Collisions);
        var entry = Assert.Single(preview.Entries, e => e.Collision);
        Assert.Equal("Theirs", entry.Local!.Title);
        Assert.Equal("Second pass", entry.Incoming!.Title);
    }
}

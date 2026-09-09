using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class NoteRepoTests
{
    private static int InsertTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static NoteItem MakeNote(int timelineId) => new()
    {
        Id = Guid.NewGuid().ToString(),
        TimelineId = timelineId,
        NoteContents = "Sample note content",
        NearestYear = 1500,
        AbsoluteTime = 1500.0,
        ConnectedItemId = string.Empty
    };

    // ── GetTimelineNotes ──────────────────────────────────────────────────────

    [Fact]
    public void GetTimelineNotes_ReturnsEmpty_WhenNoNotesExist()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var notes = repo.GetTimelineNotes(tlId).ToList();

        Assert.Empty(notes);
    }

    [Fact]
    public void GetTimelineNotes_ReturnsOnlyNotesForGivenTimeline()
    {
        using var ctx = new DbTestContext();
        int tl1 = InsertTimeline(ctx, "Timeline A");
        int tl2 = InsertTimeline(ctx, "Timeline B");

        var repo = new NoteRepo();
        var note1 = MakeNote(tl1);
        var note2 = MakeNote(tl2);
        repo.SaveNote(note1);
        repo.SaveNote(note2);

        var tl1Notes = repo.GetTimelineNotes(tl1).ToList();
        Assert.Single(tl1Notes);
        Assert.Equal(note1.Id, tl1Notes[0].Id);
    }

    [Fact]
    public void GetTimelineNotes_ReturnsMultipleNotes_ForSameTimeline()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        repo.SaveNote(MakeNote(tlId));
        repo.SaveNote(MakeNote(tlId));
        repo.SaveNote(MakeNote(tlId));

        var notes = repo.GetTimelineNotes(tlId).ToList();
        Assert.Equal(3, notes.Count);
    }

    // ── SaveNote (insert) ─────────────────────────────────────────────────────

    [Fact]
    public void SaveNote_ReturnsAssignedId_ForNewNote()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = MakeNote(tlId);
        var returnedId = repo.SaveNote(note);

        Assert.Equal(note.Id, returnedId);
    }

    [Fact]
    public void SaveNote_GeneratesId_WhenNoteIdIsEmpty()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = MakeNote(tlId);
        note.Id = string.Empty;

        var returnedId = repo.SaveNote(note);

        Assert.NotEmpty(returnedId);
    }

    [Fact]
    public void SaveNote_PersistsAllFields()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = new NoteItem
        {
            Id = Guid.NewGuid().ToString(),
            TimelineId = tlId,
            NoteContents = "Specific note text",
            NearestYear = 750,
            AbsoluteTime = 750.5,
            ConnectedItemId = string.Empty
        };
        repo.SaveNote(note);

        var notes = repo.GetTimelineNotes(tlId).ToList();
        var retrieved = notes.Single(n => n.Id == note.Id);

        Assert.Equal("Specific note text", retrieved.NoteContents);
        Assert.Equal(750, retrieved.NearestYear);
        Assert.Equal(750.5, retrieved.AbsoluteTime);
    }

    // ── SaveNote (update / upsert) ────────────────────────────────────────────

    [Fact]
    public void SaveNote_UpdatesExistingNote_OnConflict()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = MakeNote(tlId);
        repo.SaveNote(note);

        note.NoteContents = "Updated content";
        note.NearestYear = 2000;
        note.AbsoluteTime = 2000.0;
        repo.SaveNote(note);

        var notes = repo.GetTimelineNotes(tlId).ToList();
        Assert.Single(notes);
        Assert.Equal("Updated content", notes[0].NoteContents);
        Assert.Equal(2000, notes[0].NearestYear);
    }

    [Fact]
    public void SaveNote_PreservesAbsoluteTimeOnUpsert()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = MakeNote(tlId);
        note.AbsoluteTime = 1234.56;
        repo.SaveNote(note);

        // Upsert with a different AbsoluteTime
        note.NoteContents = "Modified";
        note.AbsoluteTime = 9999.99;
        repo.SaveNote(note);

        var notes = repo.GetTimelineNotes(tlId).ToList();
        var updated = notes.Single(n => n.Id == note.Id);
        Assert.Equal(9999.99, updated.AbsoluteTime, precision: 2);
    }

    // ── DeleteNote ────────────────────────────────────────────────────────────

    [Fact]
    public void DeleteNote_RemovesNoteFromDatabase()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var note = MakeNote(tlId);
        repo.SaveNote(note);

        repo.DeleteNote(note.Id);

        var notes = repo.GetTimelineNotes(tlId).ToList();
        Assert.DoesNotContain(notes, n => n.Id == note.Id);
    }

    [Fact]
    public void DeleteNote_OnNonExistentId_DoesNotThrow()
    {
        using var ctx = new DbTestContext();

        var repo = new NoteRepo();
        var ex = Record.Exception(() => repo.DeleteNote(Guid.NewGuid().ToString()));
        Assert.Null(ex);
    }

    [Fact]
    public void DeleteNote_LeavesOtherNotesIntact()
    {
        using var ctx = new DbTestContext();
        int tlId = InsertTimeline(ctx);

        var repo = new NoteRepo();
        var noteToKeep = MakeNote(tlId);
        var noteToDelete = MakeNote(tlId);
        repo.SaveNote(noteToKeep);
        repo.SaveNote(noteToDelete);

        repo.DeleteNote(noteToDelete.Id);

        var notes = repo.GetTimelineNotes(tlId).ToList();
        Assert.Single(notes);
        Assert.Equal(noteToKeep.Id, notes[0].Id);
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    // ── The .stlc file ───────────────────────────────────────────────────────

    public sealed class SessionCharacterRef
    {
        [JsonPropertyName("characterId")] public string CharacterId { get; set; } = "";
        [JsonPropertyName("role")]        public string Role        { get; set; } = "";
    }

    /// <summary>One item's net change over a session. Links travel as the full desired set, not
    /// as add/remove pairs — applying is then a replace, which is idempotent.</summary>
    public sealed class SessionItemChange
    {
        [JsonPropertyName("id")]    public string Id    { get; set; } = "";
        /// <summary>insert, update or delete.</summary>
        [JsonPropertyName("op")]    public string Op    { get; set; } = "update";
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        /// <summary>The row's updated_at when the session began — the common ancestor both
        /// copies started from. Null for an insert. A local row that no longer matches it has
        /// been edited on this side too, which is what makes a collision a collision.</summary>
        [JsonPropertyName("baselineUpdatedAt")] public string? BaselineUpdatedAt { get; set; }
        [JsonPropertyName("item")]        public TimelineItem?             Item        { get; set; }
        [JsonPropertyName("tags")]        public List<string>              Tags        { get; set; } = new();
        [JsonPropertyName("characters")]  public List<SessionCharacterRef> Characters  { get; set; } = new();
        [JsonPropertyName("storyRefs")]   public List<string>              StoryRefs   { get; set; } = new();
        [JsonPropertyName("chapterRefs")] public List<string>              ChapterRefs { get; set; } = new();
    }

    public sealed class SessionChangeFile
    {
        [JsonPropertyName("formatVersion")]     public string FormatVersion    { get; set; } = "1.0";
        [JsonPropertyName("kind")]              public string Kind             { get; set; } = "session-changes";
        [JsonPropertyName("exportedAt")]        public string ExportedAt       { get; set; } = "";
        [JsonPropertyName("sessionStartedAt")]  public string SessionStartedAt { get; set; } = "";
        [JsonPropertyName("timelineId")]        public int    TimelineId       { get; set; }
        [JsonPropertyName("timelineTitle")]     public string TimelineTitle    { get; set; } = "";
        [JsonPropertyName("changes")]           public List<SessionItemChange> Changes { get; set; } = new();
    }

    // ── What the two screens show ────────────────────────────────────────────

    public sealed class SessionEntry
    {
        [JsonPropertyName("id")]    public string Id    { get; set; } = "";
        [JsonPropertyName("op")]    public string Op    { get; set; } = "";
        [JsonPropertyName("title")] public string Title { get; set; } = "";
    }

    /// <summary>One day the timeline was worked on, as the export tab lists it.</summary>
    public sealed class SessionDaySummary
    {
        [JsonPropertyName("day")]       public string Day       { get; set; } = "";
        [JsonPropertyName("startedAt")] public string StartedAt { get; set; } = "";
        [JsonPropertyName("added")]     public int    Added     { get; set; }
        [JsonPropertyName("changed")]   public int    Changed   { get; set; }
        [JsonPropertyName("removed")]   public int    Removed   { get; set; }
        /// <summary>Today: still being written to, so its counts are computed live.</summary>
        [JsonPropertyName("open")]      public bool   Open      { get; set; }
    }

    /// <summary>Everything the export tab needs to offer a range: the days, newest first, and
    /// where the last export stopped.</summary>
    public sealed class SessionHistory
    {
        [JsonPropertyName("timelineTitle")]  public string  TimelineTitle  { get; set; } = "";
        [JsonPropertyName("lastExportedAt")] public string? LastExportedAt { get; set; }
        /// <summary>The newest day the last export covered; the day after it is where
        /// “everything since” starts.</summary>
        [JsonPropertyName("lastExportDay")]  public string? LastExportDay  { get; set; }
        [JsonPropertyName("days")] public List<SessionDaySummary> Days { get; set; } = new();
    }

    /// <summary>The export tab: how much the chosen days changed, before anything is written.</summary>
    public sealed class SessionChangeSummary
    {
        [JsonPropertyName("sessionStartedAt")] public string SessionStartedAt { get; set; } = "";
        [JsonPropertyName("timelineTitle")]    public string TimelineTitle    { get; set; } = "";
        [JsonPropertyName("added")]            public int    Added            { get; set; }
        [JsonPropertyName("changed")]          public int    Changed          { get; set; }
        [JsonPropertyName("removed")]          public int    Removed          { get; set; }
        [JsonPropertyName("entries")]          public List<SessionEntry> Entries { get; set; } = new();
    }

    /// <summary>One side of the collision screen. Plain strings: the screen compares, it does not
    /// re-render an item.</summary>
    public sealed class SessionSide
    {
        [JsonPropertyName("title")]       public string Title       { get; set; } = "";
        [JsonPropertyName("when")]        public string When        { get; set; } = "";
        [JsonPropertyName("description")] public string Description { get; set; } = "";
        [JsonPropertyName("tags")]        public string Tags        { get; set; } = "";
        [JsonPropertyName("updatedAt")]   public string UpdatedAt   { get; set; } = "";
    }

    public sealed class SessionChangeEntryPreview
    {
        [JsonPropertyName("id")]        public string Id        { get; set; } = "";
        [JsonPropertyName("op")]        public string Op        { get; set; } = "";
        [JsonPropertyName("title")]     public string Title     { get; set; } = "";
        /// <summary>This copy was edited too, so applying would overwrite work.</summary>
        [JsonPropertyName("collision")] public bool   Collision { get; set; }
        /// <summary>No local row: an update lands as a new item, a delete does nothing.</summary>
        [JsonPropertyName("missingLocally")] public bool MissingLocally { get; set; }
        [JsonPropertyName("incoming")] public SessionSide? Incoming { get; set; }
        [JsonPropertyName("local")]    public SessionSide? Local    { get; set; }
    }

    public sealed class SessionChangePreview
    {
        [JsonPropertyName("sourcePath")]          public string SourcePath          { get; set; } = "";
        [JsonPropertyName("timelineTitle")]       public string TimelineTitle       { get; set; } = "";
        [JsonPropertyName("exportedAt")]          public string ExportedAt          { get; set; } = "";
        [JsonPropertyName("targetTimelineId")]    public int    TargetTimelineId    { get; set; }
        [JsonPropertyName("targetTimelineTitle")] public string TargetTimelineTitle { get; set; } = "";
        [JsonPropertyName("added")]      public int Added      { get; set; }
        [JsonPropertyName("changed")]    public int Changed    { get; set; }
        [JsonPropertyName("removed")]    public int Removed    { get; set; }
        [JsonPropertyName("collisions")] public int Collisions { get; set; }
        [JsonPropertyName("entries")]    public List<SessionChangeEntryPreview> Entries { get; set; } = new();
    }

    public sealed class SessionApplyResult
    {
        [JsonPropertyName("applied")] public int Applied { get; set; }
        [JsonPropertyName("kept")]    public int Kept    { get; set; }
        /// <summary>Links to characters, stories or chapters this copy does not have.</summary>
        [JsonPropertyName("dropped")] public int Dropped { get; set; }
    }

    // ── The engine ───────────────────────────────────────────────────────────

    /// <summary>
    /// BL-33. A session is a <em>day</em>. Opening a timeline snapshots its items into that day's
    /// <c>session_days</c> row, and an export diffs the rows as they are now against that
    /// snapshot. When a later day opens, the previous one is sealed: its baseline is replaced by
    /// the net change set it produced, so the history is a short list of days and only the open
    /// one carries a full snapshot.
    ///
    /// No triggers and no change_log table — the net result of a day is what a co-writer needs,
    /// and the intermediate steps are noise. Exporting several days merges them newest-wins, with
    /// the ancestor taken from the oldest day in the range.
    /// </summary>
    public static class SessionChanges
    {
        private const string Stamp  = "yyyy-MM-dd HH:mm:ss";
        private const string DayFmt = "yyyy-MM-dd";

        // Same global flag every repo sets in its constructor; this class maps items without
        // going through one first, so absolute_start would not reach AbsoluteStart.
        static SessionChanges() => DefaultTypeMap.MatchNamesWithUnderscores = true;

        private sealed class ItemState
        {
            public TimelineItem             Item        = null!;
            public List<string>             Tags        = new();
            public List<SessionCharacterRef> Characters = new();
            public List<string>             StoryRefs   = new();
            public List<string>             ChapterRefs = new();
            public string                   UpdatedAt   = "";
            public string                   Signature   = "";
        }

        /// <summary>All a baseline needs: enough to tell whether a row moved (<c>Sig</c>), what
        /// the other copy is expected to still have (<c>UpdatedAt</c>), and what to call a row
        /// that has since been deleted (<c>Title</c>). Short names — there is one of these per
        /// item and the whole map lives in a text column.</summary>
        private sealed class BaselineRow
        {
            [JsonPropertyName("s")] public string Sig       { get; set; } = "";
            [JsonPropertyName("u")] public string UpdatedAt { get; set; } = "";
            [JsonPropertyName("t")] public string Title     { get; set; } = "";
        }

        private sealed class DayRow
        {
            public string  Day       { get; set; } = "";
            public string  StartedAt { get; set; } = "";
            public string? Baseline  { get; set; }
            public string? Changes   { get; set; }
        }

        private static string Today => DateTime.Now.ToString(DayFmt, CultureInfo.InvariantCulture);

        /// <summary>Called when a timeline is opened. Opens today's row if it is not open yet,
        /// sealing whatever day was open before with everything that happened while it was.</summary>
        public static void EnsureSnapshot(int timelineId)
        {
            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();
            EnsureSnapshot(db, timelineId);
        }

        private static void EnsureSnapshot(SqliteConnection db, int timelineId)
        {
            var open = db.Query<DayRow>(@"
                SELECT day AS Day, started_at AS StartedAt, baseline AS Baseline, changes AS Changes
                FROM session_days
                WHERE timeline_id = @id AND changes IS NULL
                ORDER BY day DESC", new { id = timelineId }).ToList();

            string today = Today;
            if (open.Count > 0 && open[0].Day == today) return;

            // Only the newest open day has a baseline that still means anything. An older one can
            // exist only if a seal was interrupted, and diffing it against today's rows would
            // credit it with every day in between.
            foreach (var stale in open.Skip(1))
                db.Execute("UPDATE session_days SET baseline = NULL, changes = '[]' WHERE timeline_id = @id AND day = @day",
                           new { id = timelineId, day = stale.Day });

            if (open.Count > 0) Seal(db, timelineId, open[0]);

            // ponytail: OR IGNORE, so a sealed row for today — only reachable if the clock went
            // backwards — is left alone rather than losing its change set. Today's edits then
            // land in the next day that opens.
            db.Execute(@"
                INSERT OR IGNORE INTO session_days (timeline_id, day, started_at, baseline)
                VALUES (@id, @day, @startedAt, @baseline)",
                new
                {
                    id        = timelineId,
                    day       = today,
                    startedAt = DateTime.Now.ToString(Stamp, CultureInfo.InvariantCulture),
                    baseline  = JsonSerializer.Serialize(Snapshot(timelineId)),
                });
        }

        /// <summary>Freezes a day: its baseline becomes the change set it produced.</summary>
        private static void Seal(SqliteConnection db, int timelineId, DayRow day)
        {
            var changes = Diff(day.Baseline, Load(timelineId));
            db.Execute(@"
                UPDATE session_days
                SET baseline = NULL, changes = @changes, added = @added, changed = @changed, removed = @removed
                WHERE timeline_id = @id AND day = @day",
                new
                {
                    id      = timelineId,
                    day     = day.Day,
                    changes = JsonSerializer.Serialize(changes),
                    added   = changes.Count(c => c.Op == "insert"),
                    changed = changes.Count(c => c.Op == "update"),
                    removed = changes.Count(c => c.Op == "delete"),
                });
        }

        /// <summary>Reads the optional <c>days</c> array out of a bridge payload. Absent or
        /// empty means today alone, which is what every caller wants as a default.</summary>
        public static List<string>? DaysFrom(JsonElement payload)
        {
            if (!payload.TryGetProperty("days", out var el) || el.ValueKind != JsonValueKind.Array)
                return null;

            var days = el.EnumerateArray()
                .Select(d => d.GetString())
                .Where(d => !string.IsNullOrWhiteSpace(d))
                .Select(d => d!)
                .ToList();

            return days.Count == 0 ? null : days;
        }

        private static Dictionary<string, BaselineRow> Snapshot(int timelineId)
            => Load(timelineId).ToDictionary(
                kv => kv.Key,
                kv => new BaselineRow
                {
                    Sig       = kv.Value.Signature,
                    UpdatedAt = kv.Value.UpdatedAt,
                    Title     = kv.Value.Item.Title,
                });

        // ── History ─────────────────────────────────────────────────────

        /// <summary>The days this timeline was worked on, newest first. Days that changed nothing
        /// are left out — opening a timeline to read it is not work.</summary>
        public static SessionHistory History(int timelineId)
        {
            EnsureSnapshot(timelineId);

            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();

            var export = db.QuerySingleOrDefault<ExportRow>(@"
                SELECT exported_at AS ExportedAt, through_day AS ThroughDay
                FROM session_exports WHERE timeline_id = @id", new { id = timelineId });

            var history = new SessionHistory
            {
                TimelineTitle  = db.QuerySingleOrDefault<string>(
                    "SELECT title FROM timelines WHERE id = @id", new { id = timelineId }) ?? "",
                LastExportedAt = export?.ExportedAt,
                LastExportDay  = export?.ThroughDay,
                Days = db.Query<SessionDaySummary>(@"
                    SELECT day AS Day, started_at AS StartedAt, added AS Added, changed AS Changed,
                           removed AS Removed, CASE WHEN changes IS NULL THEN 1 ELSE 0 END AS ""Open""
                    FROM session_days
                    WHERE timeline_id = @id AND (changes IS NULL OR added + changed + removed > 0)
                    ORDER BY day DESC", new { id = timelineId }).ToList(),
            };

            // Today's counts are not in the table — the day is still being written.
            var live = history.Days.FirstOrDefault(d => d.Open);
            if (live != null)
            {
                var now = Summarise(timelineId);
                live.Added   = now.Added;
                live.Changed = now.Changed;
                live.Removed = now.Removed;
            }
            return history;
        }

        private sealed class ExportRow
        {
            public string ExportedAt { get; set; } = "";
            public string ThroughDay { get; set; } = "";
        }

        // ── Diff ─────────────────────────────────────────────────────────────

        public static SessionChangeSummary Summarise(int timelineId, IReadOnlyList<string>? days = null)
        {
            var file = Build(timelineId, days);
            return new SessionChangeSummary
            {
                SessionStartedAt = file.SessionStartedAt,
                TimelineTitle    = file.TimelineTitle,
                Added            = file.Changes.Count(c => c.Op == "insert"),
                Changed          = file.Changes.Count(c => c.Op == "update"),
                Removed          = file.Changes.Count(c => c.Op == "delete"),
                Entries          = file.Changes
                    .Select(c => new SessionEntry { Id = c.Id, Op = c.Op, Title = c.Title })
                    .ToList(),
            };
        }

        /// <summary><paramref name="days"/> is the set of <c>yyyy-MM-dd</c> days to include; null
        /// means today alone. They need not be next to each other — the export screen lets you
        /// skip a day you would rather not send.</summary>
        public static SessionChangeFile Build(int timelineId, IReadOnlyList<string>? days = null)
        {
            EnsureSnapshot(timelineId);

            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();

            string title = db.QuerySingleOrDefault<string>(
                "SELECT title FROM timelines WHERE id = @id", new { id = timelineId }) ?? "";

            var wanted = (days ?? new[] { Today })
                .Distinct(StringComparer.Ordinal)
                .OrderBy(d => d, StringComparer.Ordinal)
                .ToList();

            var perDay    = new List<List<SessionItemChange>>();
            string started = "";
            foreach (var day in wanted)
            {
                var row = db.QuerySingleOrDefault<DayRow>(@"
                    SELECT day AS Day, started_at AS StartedAt, baseline AS Baseline, changes AS Changes
                    FROM session_days WHERE timeline_id = @id AND day = @day",
                    new { id = timelineId, day });
                if (row == null) continue;

                if (started.Length == 0) started = row.StartedAt;
                perDay.Add(row.Changes != null
                    ? JsonSerializer.Deserialize<List<SessionItemChange>>(row.Changes) ?? new()
                    : Diff(row.Baseline, Load(timelineId)));
            }

            return new SessionChangeFile
            {
                ExportedAt       = DateTime.Now.ToString(Stamp, CultureInfo.InvariantCulture),
                SessionStartedAt = started,
                TimelineId       = timelineId,
                TimelineTitle    = title,
                Changes          = Merge(perDay).OrderBy(c => c.Title, StringComparer.CurrentCultureIgnoreCase).ToList(),
            };
        }

        private static List<SessionItemChange> Diff(string? baselineJson, Dictionary<string, ItemState> now)
        {
            var before = baselineJson == null
                ? new Dictionary<string, BaselineRow>(StringComparer.Ordinal)
                : JsonSerializer.Deserialize<Dictionary<string, BaselineRow>>(baselineJson) ?? new();

            var changes = new List<SessionItemChange>();

            foreach (var (id, state) in now)
            {
                before.TryGetValue(id, out var was);
                if (was != null && was.Sig == state.Signature) continue;
                changes.Add(Change(was == null ? "insert" : "update", state, was?.UpdatedAt));
            }

            foreach (var (id, was) in before)
            {
                if (now.ContainsKey(id)) continue;
                changes.Add(new SessionItemChange
                {
                    Id                = id,
                    Op                = "delete",
                    Title             = was.Title,
                    BaselineUpdatedAt = was.UpdatedAt,
                });
            }
            return changes;
        }

        /// <summary>
        /// Folds several days, oldest first, into one change set. The newest version of an item
        /// wins, but the ancestor it is measured against comes from the <em>oldest</em> day in the
        /// range — that is the version the other copy is expected to still have, and getting it
        /// from the newest day would call every row a collision.
        /// </summary>
        private static List<SessionItemChange> Merge(List<List<SessionItemChange>> oldestFirst)
        {
            if (oldestFirst.Count == 1) return oldestFirst[0];

            var first = new Dictionary<string, SessionItemChange>(StringComparer.Ordinal);
            var last  = new Dictionary<string, SessionItemChange>(StringComparer.Ordinal);
            foreach (var day in oldestFirst)
                foreach (var change in day)
                {
                    if (!first.ContainsKey(change.Id)) first[change.Id] = change;
                    last[change.Id] = change;
                }

            var merged = new List<SessionItemChange>();
            foreach (var (id, newest) in last)
            {
                var oldest = first[id];

                // Written and thrown away inside the range: the other copy never saw it, so there
                // is nothing to tell them.
                if (oldest.Op == "insert" && newest.Op == "delete") continue;

                // Safe to mutate: every list here was deserialised for this call alone.
                if (oldest.Op == "insert")
                {
                    newest.Op                = "insert";
                    newest.BaselineUpdatedAt = null;
                }
                else
                {
                    newest.BaselineUpdatedAt = oldest.BaselineUpdatedAt;
                }
                merged.Add(newest);
            }
            return merged;
        }

        private static SessionItemChange Change(string op, ItemState state, string? baselineUpdatedAt)
            => new()
            {
                Id                = state.Item.Id,
                Op                = op,
                Title             = state.Item.Title,
                BaselineUpdatedAt = baselineUpdatedAt,
                Item              = state.Item,
                Tags              = state.Tags,
                Characters        = state.Characters,
                StoryRefs         = state.StoryRefs,
                ChapterRefs       = state.ChapterRefs,
            };

        /// <summary>Writes the file and remembers the newest day it covered, so the export screen
        /// can offer “everything since” next time.</summary>
        public static void Write(int timelineId, string destPath, IReadOnlyList<string>? days = null)
        {
            File.WriteAllText(destPath,
                JsonSerializer.Serialize(Build(timelineId, days), new JsonSerializerOptions { WriteIndented = true }));

            string through = days is { Count: > 0 } ? days.Max(StringComparer.Ordinal)! : Today;

            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();
            db.Execute(@"
                INSERT INTO session_exports (timeline_id, exported_at, through_day)
                VALUES (@id, @at, @day)
                ON CONFLICT(timeline_id) DO UPDATE
                SET exported_at = excluded.exported_at, through_day = excluded.through_day",
                new
                {
                    id  = timelineId,
                    at  = DateTime.Now.ToString(Stamp, CultureInfo.InvariantCulture),
                    day = through,
                });
        }

        // ── Read ─────────────────────────────────────────────────────────────

        public static SessionChangeFile Read(string path)
        {
            var file = JsonSerializer.Deserialize<SessionChangeFile>(File.ReadAllText(path))
                ?? throw new InvalidDataException("Not a readable .stlc file.");
            if (file.Kind != "session-changes")
                throw new InvalidDataException("Not a session changes file (.stlc).");
            return file;
        }

        public static SessionChangePreview Preview(string path)
        {
            var file  = Read(path);
            var (targetId, targetTitle) = ResolveTarget(file);
            var local = Load(targetId);

            var preview = new SessionChangePreview
            {
                SourcePath          = path,
                TimelineTitle       = file.TimelineTitle,
                ExportedAt          = file.ExportedAt,
                TargetTimelineId    = targetId,
                TargetTimelineTitle = targetTitle,
                Added               = file.Changes.Count(c => c.Op == "insert"),
                Changed             = file.Changes.Count(c => c.Op == "update"),
                Removed             = file.Changes.Count(c => c.Op == "delete"),
            };

            foreach (var change in file.Changes)
            {
                local.TryGetValue(change.Id, out var here);
                // An insert this copy already has, or an edit landing on a row this copy has also
                // touched since the shared starting point.
                bool collision = here != null
                    && (change.Op == "insert" || here.UpdatedAt != change.BaselineUpdatedAt);

                preview.Entries.Add(new SessionChangeEntryPreview
                {
                    Id             = change.Id,
                    Op             = change.Op,
                    Title          = change.Title,
                    Collision      = collision,
                    MissingLocally = here == null,
                    Incoming       = change.Item == null ? null : Side(change.Item, change.Tags, null),
                    Local          = here  == null ? null : Side(here.Item, here.Tags, here.UpdatedAt),
                });
            }

            preview.Collisions = preview.Entries.Count(e => e.Collision);
            return preview;
        }

        private static SessionSide Side(TimelineItem item, List<string> tags, string? updatedAt)
            => new()
            {
                Title       = item.Title,
                When        = item.EndYear != item.Year ? $"{item.Year} – {item.EndYear}" : item.Year.ToString(),
                Description = item.Description ?? "",
                Tags        = string.Join(", ", tags),
                UpdatedAt   = updatedAt ?? "",
            };

        // ── Apply ────────────────────────────────────────────────────────────

        /// <summary>
        /// <paramref name="decisions"/> maps an item id to "local" to keep this copy's version.
        /// Anything not named is taken from the file — BL-33's "default: keep incoming".
        /// </summary>
        public static SessionApplyResult Apply(string path, Dictionary<string, string>? decisions)
        {
            var file  = Read(path);
            var (targetId, _) = ResolveTarget(file);
            var repo  = new ItemRepo();
            var result = new SessionApplyResult();

            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();
            var knownCharacters = Ids(db, "SELECT id FROM characters");
            var knownStories    = Ids(db, "SELECT id FROM stories");
            var knownChapters   = Ids(db, "SELECT id FROM chapters");

            foreach (var change in file.Changes)
            {
                if (decisions != null && decisions.TryGetValue(change.Id, out var pick) && pick == "local")
                {
                    result.Kept++;
                    continue;
                }

                if (change.Op == "delete")
                {
                    repo.DeleteItem(change.Id);
                    result.Applied++;
                    continue;
                }

                var item = change.Item ?? throw new InvalidDataException($"'{change.Title}' carries no item row.");
                item.TimelineId = targetId;
                if (item.StoryId != null && !knownStories.Contains(item.StoryId))
                {
                    item.StoryId = null;
                    result.Dropped++;
                }

                // Links to rows this copy does not have would fail the foreign keys; the item is
                // still worth having, so they are dropped and counted.
                var characters = change.Characters.Where(c => knownCharacters.Contains(c.CharacterId)).ToList();
                var stories    = change.StoryRefs.Where(knownStories.Contains).ToList();
                var chapters   = change.ChapterRefs.Where(knownChapters.Contains).ToList();
                result.Dropped += (change.Characters.Count - characters.Count)
                                + (change.StoryRefs.Count - stories.Count)
                                + (change.ChapterRefs.Count - chapters.Count);

                // ponytail: SaveItemFull opens its own connection and transaction per item, so a
                // failure halfway leaves the earlier items applied. A session diff is tens of
                // rows; wrap the loop in one transaction when that stops being true.
                repo.SaveItemFull(item, change.Tags,
                    characters.Select(c => new ItemRepo.CharacterAppearanceInput
                    {
                        CharacterId = c.CharacterId,
                        Role        = c.Role ?? "",
                    }).ToList(),
                    stories, chapters);
                result.Applied++;
            }

            return result;
        }

        private static (int Id, string Title) ResolveTarget(SessionChangeFile file)
        {
            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();

            var title = db.QuerySingleOrDefault<string>(
                "SELECT title FROM timelines WHERE id = @id", new { id = file.TimelineId });
            if (title != null) return (file.TimelineId, title);

            // Copies made without IDs get new ones, so fall back to the name.
            var byName = db.QuerySingleOrDefault<int?>(
                "SELECT id FROM timelines WHERE title = @title", new { title = file.TimelineTitle });
            if (byName is int id) return (id, file.TimelineTitle);

            throw new InvalidDataException(
                $"No timeline called “{file.TimelineTitle}” in this copy — import the timeline itself first.");
        }

        private static HashSet<string> Ids(SqliteConnection db, string sql)
            => new(db.Query<string>(sql), StringComparer.Ordinal);

        // ── Reading the current state ────────────────────────────────────────

        private static Dictionary<string, ItemState> Load(int timelineId)
        {
            using var db = new SqliteConnection(DbInitializer.GetConnectionString());
            db.Open();

            // type 7 is a character card: CharacterRepo owns those, and GetItemsByTimeline skips
            // them too, so a session diff would otherwise report every character as an item.
            var items = db.Query<TimelineItem>(
                "SELECT * FROM items WHERE timeline_id = @id AND type_id != 7",
                new { id = timelineId }).ToList();

            var tags = Group(db, @"
                SELECT it.item_id AS ItemId, t.name AS Value
                FROM item_tags it
                INNER JOIN tags t ON t.id = it.tag_id
                INNER JOIN items i ON i.id = it.item_id
                WHERE i.timeline_id = @id", timelineId);

            var stories = Group(db, @"
                SELECT isr.item_id AS ItemId, isr.story_id AS Value
                FROM item_story_refs isr
                INNER JOIN items i ON i.id = isr.item_id
                WHERE i.timeline_id = @id", timelineId);

            var chapters = Group(db, @"
                SELECT ic.item_id AS ItemId, ic.chapter_id AS Value
                FROM item_chapters ic
                INNER JOIN items i ON i.id = ic.item_id
                WHERE i.timeline_id = @id", timelineId);

            var appearances = db.Query<AppearanceRow>(@"
                SELECT ica.item_id AS ItemId, ica.character_id AS CharacterId, ica.role AS Role
                FROM item_character_appearances ica
                INNER JOIN items i ON i.id = ica.item_id
                WHERE i.timeline_id = @id", new { id = timelineId })
                .GroupBy(r => r.ItemId)
                .ToDictionary(g => g.Key, g => g
                    .Select(r => new SessionCharacterRef { CharacterId = r.CharacterId, Role = r.Role ?? "" })
                    .OrderBy(c => c.CharacterId, StringComparer.Ordinal)
                    .ToList());

            var states = new Dictionary<string, ItemState>(StringComparer.Ordinal);
            foreach (var item in items)
            {
                var state = new ItemState
                {
                    Item        = item,
                    Tags        = tags.TryGetValue(item.Id, out var t) ? t : new(),
                    StoryRefs   = stories.TryGetValue(item.Id, out var s) ? s : new(),
                    ChapterRefs = chapters.TryGetValue(item.Id, out var c) ? c : new(),
                    Characters  = appearances.TryGetValue(item.Id, out var a) ? a : new(),
                    UpdatedAt   = item.UpdatedAt.ToString(Stamp, CultureInfo.InvariantCulture),
                };
                state.Signature = Signature(state);
                states[item.Id] = state;
            }
            return states;
        }

        private sealed class LinkRow
        {
            public string ItemId { get; set; } = "";
            public string Value  { get; set; } = "";
        }

        private sealed class AppearanceRow
        {
            public string  ItemId      { get; set; } = "";
            public string  CharacterId { get; set; } = "";
            public string? Role        { get; set; }
        }

        private static Dictionary<string, List<string>> Group(SqliteConnection db, string sql, int timelineId)
            => db.Query<LinkRow>(sql, new { id = timelineId })
                 .GroupBy(r => r.ItemId)
                 .ToDictionary(g => g.Key,
                               g => g.Select(r => r.Value).OrderBy(v => v, StringComparer.Ordinal).ToList());

        /// <summary>Everything a co-writer would see, and nothing else: created_at and updated_at
        /// move on their own, so comparing them would call every row changed.</summary>
        private static string Signature(ItemState s)
        {
            var i = s.Item;
            return JsonSerializer.Serialize(new object?[]
            {
                i.Title, i.Description, i.Content, i.StoryId, i.TypeId, i.Year, i.EndYear,
                i.AbsoluteStart, i.AbsoluteEnd, i.BookTitle, i.Chapter, i.Page, i.Color,
                i.CreationGranularity, i.TimelineId, i.ItemIndex, i.Placement, i.Centered,
                i.ShowTitle, i.ItemNotes, i.ShowInNotes, i.MinLodLevel, i.LodVisibilityMask,
                i.Importance,
                s.Tags, s.StoryRefs, s.ChapterRefs,
                s.Characters.Select(c => c.CharacterId + "\u0001" + c.Role),
            });
        }
    }
}

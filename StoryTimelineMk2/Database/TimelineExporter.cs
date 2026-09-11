using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class TimelineManifest
    {
        [JsonPropertyName("formatVersion")] public string FormatVersion { get; set; } = "1.0";
        [JsonPropertyName("exportedAt")]    public string ExportedAt    { get; set; } = "";
        [JsonPropertyName("includeIds")]    public bool   IncludeIds    { get; set; }
        [JsonPropertyName("hasMedia")]      public bool   HasMedia      { get; set; }
        [JsonPropertyName("timelineTitle")] public string TimelineTitle { get; set; } = "";
        [JsonPropertyName("itemCount")]     public int    ItemCount     { get; set; }
        [JsonPropertyName("mediaCount")]    public int    MediaCount    { get; set; }
        [JsonPropertyName("timelineId")]    public long   TimelineId    { get; set; }
    }

    public class TimelineZipPreview
    {
        [JsonPropertyName("sourcePath")]               public string  SourcePath               { get; set; } = "";
        [JsonPropertyName("timelineTitle")]            public string  TimelineTitle             { get; set; } = "";
        [JsonPropertyName("includeIds")]               public bool    IncludeIds                { get; set; }
        [JsonPropertyName("hasMedia")]                 public bool    HasMedia                  { get; set; }
        [JsonPropertyName("itemCount")]                public int     ItemCount                 { get; set; }
        [JsonPropertyName("mediaCount")]               public int     MediaCount                { get; set; }
        [JsonPropertyName("hasConflict")]              public bool    HasConflict               { get; set; }
        [JsonPropertyName("conflictingTimelineTitle")] public string? ConflictingTimelineTitle  { get; set; }
        [JsonPropertyName("timelineId")]               public long?   TimelineId                { get; set; }
    }

    internal static class TimelineExporter
    {
        // ── Export ───────────────────────────────────────────────────────────────

        public static void ExportToZip(int timelineId, string destPath, bool includeIds, bool includeMedia)
        {
            string dbPath     = AppConfig.Instance.GetDbPath();
            string mediaFolder = AppConfig.Instance.GetMediaFolder();

            using var db = new SqliteConnection($"Data Source={dbPath};Mode=ReadOnly");
            db.Open();

            var timelineRow = QueryRows(db, "SELECT * FROM timelines WHERE id = @id", new { id = timelineId })
                .FirstOrDefault() ?? throw new Exception($"Timeline {timelineId} not found.");

            string title      = Val(timelineRow, "title") ?? "Unknown";
            string? calId     = Val(timelineRow, "calendar_id");

            var itemRows     = QueryRows(db, "SELECT * FROM items WHERE timeline_id = @id", new { id = timelineId });
            var itemUuids    = itemRows.Select(r => Val(r, "id")).Where(x => x != null).Cast<string>().ToList();

            var charRows     = QueryRows(db, "SELECT * FROM characters WHERE timeline_id = @id", new { id = timelineId });
            var charUuids    = charRows.Select(r => Val(r, "id")).Where(x => x != null).Cast<string>().ToList();

            // Tags
            var tagRows        = new List<Dictionary<string, object?>>();
            var itemTagRows    = new List<Dictionary<string, object?>>();
            if (itemUuids.Any())
            {
                itemTagRows = QueryRows(db, $"SELECT * FROM item_tags WHERE item_id IN ({UL(itemUuids)})");
                var tagIds  = itemTagRows.Select(r => r.TryGetValue("tag_id", out var v) ? v : null)
                                         .Where(x => x != null).Select(x => Convert.ToInt64(x)).Distinct().ToList();
                if (tagIds.Any())
                    tagRows = QueryRows(db, $"SELECT * FROM tags WHERE id IN ({string.Join(",", tagIds)})");
            }

            // Stories
            var storyRows       = new List<Dictionary<string, object?>>();
            var itemStoryRows   = new List<Dictionary<string, object?>>();
            if (itemUuids.Any())
            {
                bool hasSr = TableExists(db, "item_story_refs");
                if (hasSr)
                {
                    itemStoryRows = QueryRows(db, $"SELECT * FROM item_story_refs WHERE item_id IN ({UL(itemUuids)})");
                    var storyUuids = itemStoryRows.Select(r => Val(r, "story_id")).Where(x => x != null).Cast<string>().Distinct().ToList();
                    var directStory = itemRows.Select(r => Val(r, "story_id")).Where(x => x != null).Cast<string>();
                    storyUuids = storyUuids.Union(directStory).ToList();
                    if (storyUuids.Any())
                        storyRows = QueryRows(db, $"SELECT * FROM stories WHERE id IN ({UL(storyUuids)})");
                }
            }

            // Pictures
            var pictureRows    = new List<Dictionary<string, object?>>();
            var itemPicRows    = new List<Dictionary<string, object?>>();
            if (itemUuids.Any())
            {
                itemPicRows = QueryRows(db, $"SELECT * FROM item_pictures WHERE item_id IN ({UL(itemUuids)})");
                var picUuids = itemPicRows.Select(r => Val(r, "picture_id")).Where(x => x != null).Cast<string>().Distinct().ToList();
                if (picUuids.Any())
                    pictureRows = QueryRows(db, $"SELECT * FROM pictures WHERE id IN ({UL(picUuids)})");
            }

            // item_character_appearances
            var icaRows  = new List<Dictionary<string, object?>>();
            if (itemUuids.Any() && TableExists(db, "item_character_appearances"))
                icaRows = QueryRows(db, $"SELECT * FROM item_character_appearances WHERE item_id IN ({UL(itemUuids)})");

            // item_characters (legacy junction)
            var icRows = new List<Dictionary<string, object?>>();
            if (itemUuids.Any() && TableExists(db, "item_characters"))
                icRows = QueryRows(db, $"SELECT * FROM item_characters WHERE item_id IN ({UL(itemUuids)})");

            // character_relationships
            var charRelRows = new List<Dictionary<string, object?>>();
            if (charUuids.Any() && TableExists(db, "character_relationships"))
                charRelRows = QueryRows(db, $"SELECT * FROM character_relationships WHERE character_1_id IN ({UL(charUuids)}) OR character_2_id IN ({UL(charUuids)})");

            // Settings
            var settingsRow = QueryRows(db, "SELECT * FROM settings WHERE timeline_id = @id", new { id = timelineId }).FirstOrDefault();

            // Hidden ranges / filter rules
            var hiddenRows  = TableExists(db, "timeline_hidden_ranges")
                ? QueryRows(db, "SELECT * FROM timeline_hidden_ranges WHERE timeline_id = @id", new { id = timelineId })
                : new();
            var filterRows  = TableExists(db, "timeline_filter_rules")
                ? QueryRows(db, "SELECT * FROM timeline_filter_rules WHERE timeline_id = @id", new { id = timelineId })
                : new();

            // Calendar + LOD
            Dictionary<string, object?>? calRow = null;
            Dictionary<string, object?>? lodRow = null;
            if (!string.IsNullOrEmpty(calId))
            {
                calRow = QueryRows(db, "SELECT * FROM calendars WHERE id = @id", new { id = calId }).FirstOrDefault();
                if (calRow != null && Val(calRow, "lod_profile_id") is string lodId)
                    lodRow = QueryRows(db, "SELECT * FROM lod_profiles WHERE id = @id", new { id = lodId }).FirstOrDefault();
            }

            // Build ZIP
            int mediaCount = 0;
            Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);
            using var zip = ZipFile.Open(destPath, ZipArchiveMode.Create);

            // Add timeline.json
            var dataObj = new
            {
                timeline                 = timelineRow,
                items                    = itemRows,
                characters               = charRows,
                tags                     = tagRows,
                stories                  = storyRows,
                itemTags                 = itemTagRows,
                itemStoryRefs            = itemStoryRows,
                itemCharacterAppearances = icaRows,
                itemCharacters           = icRows,
                itemPictures             = itemPicRows,
                characterRelationships   = charRelRows,
                pictures                 = pictureRows,
                settings                 = settingsRow,
                calendar                 = calRow,
                lodProfile               = lodRow,
                hiddenRanges             = hiddenRows,
                filterRules              = filterRows,
            };
            var dataEntry = zip.CreateEntry("timeline.json");
            using (var sw = new StreamWriter(dataEntry.Open()))
                sw.Write(JsonSerializer.Serialize(dataObj));

            // Add media files
            if (includeMedia)
                foreach (var pic in pictureRows)
                {
                    string? fp   = Val(pic, "file_path");
                    string? fn   = Val(pic, "file_name");
                    if (fp != null && fn != null && File.Exists(fp))
                    {
                        zip.CreateEntryFromFile(fp, "Media/" + fn);
                        mediaCount++;
                    }
                }

            // Add manifest.json
            var manifest = new TimelineManifest
            {
                FormatVersion = "1.0",
                ExportedAt    = DateTime.UtcNow.ToString("O"),
                IncludeIds    = includeIds,
                HasMedia      = mediaCount > 0,
                TimelineTitle = title,
                ItemCount     = itemRows.Count,
                MediaCount    = mediaCount,
                TimelineId    = timelineId,
            };
            var manifestEntry = zip.CreateEntry("manifest.json");
            using (var sw = new StreamWriter(manifestEntry.Open()))
                sw.Write(JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));
        }

        // ── Preview ──────────────────────────────────────────────────────────────

        public static TimelineZipPreview GetZipPreview(string zipPath)
        {
            using var zip = ZipFile.OpenRead(zipPath);
            var me = zip.GetEntry("manifest.json")
                ?? throw new Exception("Not a valid .stlm file (missing manifest.json).");

            TimelineManifest manifest;
            using (var sr = new StreamReader(me.Open()))
                manifest = JsonSerializer.Deserialize<TimelineManifest>(sr.ReadToEnd())
                    ?? throw new Exception("Invalid manifest.json");

            bool   hasConflict    = false;
            string? conflictTitle = null;
            if (manifest.IncludeIds && manifest.TimelineId > 0)
            {
                using var db = new SqliteConnection(DbInitializer.GetConnectionString());
                db.Open();
                conflictTitle = db.QuerySingleOrDefault<string>(
                    "SELECT title FROM timelines WHERE id = @id", new { id = manifest.TimelineId });
                hasConflict = conflictTitle != null;
            }

            return new TimelineZipPreview
            {
                SourcePath               = zipPath,
                TimelineTitle            = manifest.TimelineTitle,
                IncludeIds               = manifest.IncludeIds,
                HasMedia                 = manifest.HasMedia,
                ItemCount                = manifest.ItemCount,
                MediaCount               = manifest.MediaCount,
                HasConflict              = hasConflict,
                ConflictingTimelineTitle = conflictTitle,
                TimelineId               = manifest.IncludeIds ? manifest.TimelineId : null,
            };
        }

        // ── Import ───────────────────────────────────────────────────────────────

        public static void ImportFromZip(string zipPath)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "stlm_" + Guid.NewGuid().ToString("N"));
            try
            {
                ZipFile.ExtractToDirectory(zipPath, tempDir);
                var manifest = JsonSerializer.Deserialize<TimelineManifest>(
                    File.ReadAllText(Path.Combine(tempDir, "manifest.json")))
                    ?? throw new Exception("Invalid manifest.json");

                using var doc  = JsonDocument.Parse(File.ReadAllText(Path.Combine(tempDir, "timeline.json")));
                var root       = doc.RootElement;

                using var db   = new SqliteConnection(DbInitializer.GetConnectionString());
                db.Open();
                db.Execute("PRAGMA foreign_keys = ON");

                using var tx = db.BeginTransaction();
                try
                {
                    if (manifest.IncludeIds)
                        ImportWithIds(db, tx, root, manifest, tempDir);
                    else
                        ImportAsNew(db, tx, root, manifest, tempDir);
                    tx.Commit();
                }
                catch { tx.Rollback(); throw; }
            }
            finally
            {
                if (Directory.Exists(tempDir))
                    try { Directory.Delete(tempDir, true); } catch { /* best-effort */ }
            }
        }

        // ── ImportWithIds ────────────────────────────────────────────────────────

        private static void ImportWithIds(SqliteConnection db, SqliteTransaction tx,
            JsonElement root, TimelineManifest manifest, string tempDir)
        {
            // Cascade-delete old timeline (cascade removes items, characters, settings, etc.)
            if (manifest.TimelineId > 0)
                db.Execute("DELETE FROM timelines WHERE id = @id", new { id = manifest.TimelineId }, transaction: tx);

            // Global data (INSERT OR REPLACE keeps existing global data intact or updates it)
            BulkInsert(db, tx, "lod_profiles", GetRows(root, "lodProfile", single: true), "OR REPLACE");
            BulkInsert(db, tx, "calendars",    GetRows(root, "calendar",   single: true), "OR REPLACE");
            BulkInsert(db, tx, "stories",      GetRows(root, "stories"),                  "OR REPLACE");
            BulkInsert(db, tx, "tags",         GetRows(root, "tags"),                     "OR REPLACE");
            BulkInsert(db, tx, "pictures",     GetRows(root, "pictures"),                 "OR IGNORE");

            // Copy zip media to app Media folder and update file_path in pictures rows
            if (manifest.HasMedia)
                CopyAndUpdateMedia(db, tx, tempDir, GetRows(root, "pictures"));

            // Timeline-scoped (cascade-deleted — plain INSERT)
            BulkInsert(db, tx, "timelines",                   GetRows(root, "timeline",                 single: true));
            BulkInsert(db, tx, "items",                       GetRows(root, "items"));
            BulkInsert(db, tx, "characters",                  GetRows(root, "characters"));
            BulkInsert(db, tx, "settings",                    GetRows(root, "settings",                 single: true), "OR IGNORE");
            BulkInsert(db, tx, "item_tags",                   GetRows(root, "itemTags"),                "OR IGNORE");
            BulkInsert(db, tx, "item_pictures",               GetRows(root, "itemPictures"),            "OR IGNORE");
            BulkInsert(db, tx, "item_character_appearances",  GetRows(root, "itemCharacterAppearances"), "OR IGNORE");
            BulkInsert(db, tx, "item_characters",             GetRows(root, "itemCharacters"),           "OR IGNORE");
            BulkInsert(db, tx, "item_story_refs",             GetRows(root, "itemStoryRefs"),            "OR IGNORE");
            BulkInsert(db, tx, "character_relationships",     GetRows(root, "characterRelationships"),   "OR IGNORE");

            if (TableExistsTx(db, tx, "timeline_hidden_ranges"))
                BulkInsert(db, tx, "timeline_hidden_ranges", GetRows(root, "hiddenRanges"), "OR IGNORE");
            if (TableExistsTx(db, tx, "timeline_filter_rules"))
                BulkInsert(db, tx, "timeline_filter_rules",  GetRows(root, "filterRules"),  "OR IGNORE");
        }

        // ── ImportAsNew ──────────────────────────────────────────────────────────

        private static void ImportAsNew(SqliteConnection db, SqliteTransaction tx,
            JsonElement root, TimelineManifest manifest, string tempDir)
        {
            // Global: LOD + calendar (INSERT OR REPLACE — they keep original IDs)
            BulkInsert(db, tx, "lod_profiles", GetRows(root, "lodProfile", single: true), "OR REPLACE");
            BulkInsert(db, tx, "calendars",    GetRows(root, "calendar",   single: true), "OR REPLACE");

            // Tags by name → build id map (old int id → new int id)
            var tagIdMap = new Dictionary<long, long>();
            foreach (var row in GetRows(root, "tags"))
            {
                string  name  = row.TryGetValue("name", out var nv)  ? nv?.ToString() ?? "" : "";
                long    oldId = row.TryGetValue("id",   out var idv) ? Convert.ToInt64(idv ?? 0L) : 0;
                db.Execute("INSERT OR IGNORE INTO tags (name) VALUES (@name)", new { name }, transaction: tx);
                long newId = db.QuerySingle<long>("SELECT id FROM tags WHERE name = @name", new { name }, transaction: tx);
                if (oldId != 0) tagIdMap[oldId] = newId;
            }

            // Stories by title → build id map (old uuid → new or existing uuid)
            var storyIdMap = new Dictionary<string, string>();
            foreach (var row in GetRows(root, "stories"))
            {
                string title = row.TryGetValue("title",       out var tv) ? tv?.ToString() ?? "" : "";
                string oldId = row.TryGetValue("id",          out var iv) ? iv?.ToString() ?? "" : "";
                string desc  = row.TryGetValue("description", out var dv) ? dv?.ToString() ?? "" : "";
                string newId = Guid.NewGuid().ToString();
                db.Execute("INSERT OR IGNORE INTO stories (id, title, description) VALUES (@newId, @title, @desc)",
                    new { newId, title, desc }, transaction: tx);
                string actual = db.QuerySingle<string>("SELECT id FROM stories WHERE title = @title LIMIT 1", new { title }, transaction: tx);
                if (!string.IsNullOrEmpty(oldId)) storyIdMap[oldId] = actual;
            }

            // Insert pictures (INSERT OR IGNORE — keep original UUIDs to avoid duplication)
            BulkInsert(db, tx, "pictures", GetRows(root, "pictures"), "OR IGNORE");
            if (manifest.HasMedia)
                CopyAndUpdateMedia(db, tx, tempDir, GetRows(root, "pictures"));

            // Insert timeline without id (auto-increment)
            long newTlId = -1;
            var tlRows = GetRows(root, "timeline", single: true);
            if (tlRows.Any())
            {
                var r = Strip(tlRows[0], "id");
                string cols   = ColList(r);
                string parms  = ParamList(r);
                db.Execute($"INSERT INTO timelines ({cols}) VALUES ({parms})", ToDP(r), transaction: tx);
                newTlId = db.QuerySingle<long>("SELECT last_insert_rowid()", transaction: tx);
            }

            // Characters
            var charIdMap = new Dictionary<string, string>();
            foreach (var row in GetRows(root, "characters"))
            {
                string oldId     = row.TryGetValue("id", out var iv) ? iv?.ToString() ?? "" : "";
                string newCharId = Guid.NewGuid().ToString();
                charIdMap[oldId] = newCharId;
                var r = new Dictionary<string, object?>(row);
                r["id"]          = newCharId;
                r["timeline_id"] = newTlId;
                BulkInsert(db, tx, "characters", new() { r }, "OR IGNORE");
            }

            // Items
            var itemIdMap = new Dictionary<string, string>();
            foreach (var row in GetRows(root, "items"))
            {
                string oldId     = row.TryGetValue("id", out var iv) ? iv?.ToString() ?? "" : "";
                string newItemId = Guid.NewGuid().ToString();
                itemIdMap[oldId] = newItemId;
                var r = new Dictionary<string, object?>(row);
                r["id"]          = newItemId;
                r["timeline_id"] = newTlId;
                if (r.TryGetValue("story_id", out var sv) && sv != null &&
                    storyIdMap.TryGetValue(sv.ToString()!, out var mappedStory))
                    r["story_id"] = mappedStory;
                BulkInsert(db, tx, "items", new() { r }, "OR IGNORE");
            }

            // Settings (without id — auto-increment)
            var setRows = GetRows(root, "settings", single: true);
            if (setRows.Any())
            {
                var r = Strip(setRows[0], "id");
                r["timeline_id"] = newTlId;
                db.Execute($"INSERT OR IGNORE INTO settings ({ColList(r)}) VALUES ({ParamList(r)})", ToDP(r), transaction: tx);
            }

            // item_tags with remapped IDs
            foreach (var row in GetRows(root, "itemTags"))
            {
                string? oi = row.TryGetValue("item_id", out var iv) ? iv?.ToString() : null;
                long    ot = row.TryGetValue("tag_id",  out var tv) ? Convert.ToInt64(tv ?? 0L) : 0;
                if (oi == null || !itemIdMap.TryGetValue(oi, out var ni)) continue;
                if (!tagIdMap.TryGetValue(ot, out var nt)) continue;
                db.Execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (@item_id, @tag_id)",
                    new { item_id = ni, tag_id = nt }, transaction: tx);
            }

            // item_story_refs
            foreach (var row in GetRows(root, "itemStoryRefs"))
            {
                string? oi = row.TryGetValue("item_id",  out var iv) ? iv?.ToString() : null;
                string? os = row.TryGetValue("story_id", out var sv) ? sv?.ToString() : null;
                if (oi == null || os == null || !itemIdMap.TryGetValue(oi, out var ni)) continue;
                storyIdMap.TryGetValue(os, out var ns); ns ??= os;
                db.Execute("INSERT OR IGNORE INTO item_story_refs (item_id, story_id) VALUES (@item_id, @story_id)",
                    new { item_id = ni, story_id = ns }, transaction: tx);
            }

            // item_character_appearances
            foreach (var row in GetRows(root, "itemCharacterAppearances"))
            {
                string? oi = row.TryGetValue("item_id",      out var iv) ? iv?.ToString() : null;
                string? oc = row.TryGetValue("character_id", out var cv) ? cv?.ToString() : null;
                if (oi == null || oc == null) continue;
                if (!itemIdMap.TryGetValue(oi, out var ni) || !charIdMap.TryGetValue(oc, out var nc)) continue;
                var r = new Dictionary<string, object?>(row) { ["item_id"] = ni, ["character_id"] = nc };
                BulkInsert(db, tx, "item_character_appearances", new() { r }, "OR IGNORE");
            }

            // item_characters (legacy)
            foreach (var row in GetRows(root, "itemCharacters"))
            {
                string? oi = row.TryGetValue("item_id",      out var iv) ? iv?.ToString() : null;
                string? oc = row.TryGetValue("character_id", out var cv) ? cv?.ToString() : null;
                if (oi == null || oc == null) continue;
                if (!itemIdMap.TryGetValue(oi, out var ni) || !charIdMap.TryGetValue(oc, out var nc)) continue;
                var r = new Dictionary<string, object?>(row) { ["item_id"] = ni, ["character_id"] = nc, ["timeline_id"] = newTlId };
                BulkInsert(db, tx, "item_characters", new() { r }, "OR IGNORE");
            }

            // item_pictures
            foreach (var row in GetRows(root, "itemPictures"))
            {
                string? oi = row.TryGetValue("item_id",    out var iv) ? iv?.ToString() : null;
                string? op = row.TryGetValue("picture_id", out var pv) ? pv?.ToString() : null;
                if (oi == null || op == null || !itemIdMap.TryGetValue(oi, out var ni)) continue;
                db.Execute("INSERT OR IGNORE INTO item_pictures (item_id, picture_id) VALUES (@item_id, @picture_id)",
                    new { item_id = ni, picture_id = op }, transaction: tx);
            }

            // character_relationships (remove id → auto-increment)
            foreach (var row in GetRows(root, "characterRelationships"))
            {
                string? oc1 = row.TryGetValue("character_1_id", out var c1v) ? c1v?.ToString() : null;
                string? oc2 = row.TryGetValue("character_2_id", out var c2v) ? c2v?.ToString() : null;
                if (oc1 == null || oc2 == null) continue;
                if (!charIdMap.TryGetValue(oc1, out var nc1) || !charIdMap.TryGetValue(oc2, out var nc2)) continue;
                var r = Strip(new Dictionary<string, object?>(row) { ["character_1_id"] = nc1, ["character_2_id"] = nc2 }, "id");
                db.Execute($"INSERT OR IGNORE INTO character_relationships ({ColList(r)}) VALUES ({ParamList(r)})", ToDP(r), transaction: tx);
            }

            // Hidden ranges (no id — auto-increment)
            if (TableExistsTx(db, tx, "timeline_hidden_ranges"))
                foreach (var row in GetRows(root, "hiddenRanges"))
                {
                    var r = Strip(row, "id");
                    r["timeline_id"] = newTlId;
                    db.Execute($"INSERT OR IGNORE INTO timeline_hidden_ranges ({ColList(r)}) VALUES ({ParamList(r)})", ToDP(r), transaction: tx);
                }

            // Filter rules (new UUID)
            if (TableExistsTx(db, tx, "timeline_filter_rules"))
                foreach (var row in GetRows(root, "filterRules"))
                {
                    var r = new Dictionary<string, object?>(row);
                    r["id"]          = Guid.NewGuid().ToString();
                    r["timeline_id"] = newTlId;
                    BulkInsert(db, tx, "timeline_filter_rules", new() { r }, "OR IGNORE");
                }
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        private static List<Dictionary<string, object?>> QueryRows(SqliteConnection db, string sql, object? param = null)
            => db.Query(sql, param)
                 .Cast<IDictionary<string, object>>()
                 .Select(d => d.ToDictionary(kv => kv.Key, kv => (object?)kv.Value))
                 .ToList();

        private static bool TableExists(SqliteConnection db, string name)
            => db.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=@name", new { name }) > 0;

        private static bool TableExistsTx(SqliteConnection db, SqliteTransaction tx, string name)
            => db.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=@name",
                new { name }, transaction: tx) > 0;

        private static string? Val(Dictionary<string, object?> row, string key)
            => row.TryGetValue(key, out var v) ? v?.ToString() : null;

        private static string UL(IEnumerable<string> ids)
            => string.Join(",", ids.Select(id => $"'{id.Replace("'", "''")}'"));

        private static List<Dictionary<string, object?>> GetRows(JsonElement root, string key, bool single = false)
        {
            if (!root.TryGetProperty(key, out var el)) return new();
            if (el.ValueKind == JsonValueKind.Null)   return new();
            if (single)
                return el.ValueKind == JsonValueKind.Object ? new() { ElemToDict(el) } : new();
            if (el.ValueKind == JsonValueKind.Array)
                return el.EnumerateArray().Select(ElemToDict).ToList();
            return new();
        }

        private static Dictionary<string, object?> ElemToDict(JsonElement el)
        {
            var d = new Dictionary<string, object?>();
            foreach (var p in el.EnumerateObject())
                d[p.Name] = p.Value.ValueKind switch
                {
                    JsonValueKind.String => p.Value.GetString(),
                    JsonValueKind.Number => p.Value.TryGetInt64(out long l) ? l : p.Value.GetDouble(),
                    JsonValueKind.True   => (object?)true,
                    JsonValueKind.False  => false,
                    JsonValueKind.Null   => null,
                    _                    => p.Value.GetRawText(),
                };
            return d;
        }

        private static Dictionary<string, object?> Strip(Dictionary<string, object?> row, params string[] removeKeys)
        {
            var r = new Dictionary<string, object?>(row);
            foreach (var k in removeKeys) r.Remove(k);
            return r;
        }

        private static string ColList(Dictionary<string, object?> r)
            => string.Join(", ", r.Keys);

        private static string ParamList(Dictionary<string, object?> r)
            => string.Join(", ", r.Keys.Select(k => "@" + k));

        private static DynamicParameters ToDP(Dictionary<string, object?> row)
        {
            var dp = new DynamicParameters();
            foreach (var kv in row) dp.Add("@" + kv.Key, kv.Value);
            return dp;
        }

        private static void BulkInsert(SqliteConnection db, SqliteTransaction tx,
            string table, List<Dictionary<string, object?>> rows, string conflict = "")
        {
            var valid = rows.Where(r => r is { Count: > 0 }).ToList();
            if (!valid.Any()) return;
            var cols  = valid[0].Keys.ToList();
            string sql = $"INSERT {conflict} INTO {table} ({ColList(valid[0])}) VALUES ({ParamList(valid[0])})";
            foreach (var row in valid)
                db.Execute(sql, ToDP(row), transaction: tx);
        }

        private static void CopyAndUpdateMedia(SqliteConnection db, SqliteTransaction tx,
            string tempDir, List<Dictionary<string, object?>> pictureRows)
        {
            string mediaDir    = Path.Combine(tempDir, "Media");
            if (!Directory.Exists(mediaDir)) return;

            string targetMedia = AppConfig.Instance.GetMediaFolder();
            Directory.CreateDirectory(targetMedia);

            foreach (var pic in pictureRows)
            {
                string? picId    = Val(pic, "id");
                string? fileName = Val(pic, "file_name");
                if (picId == null || fileName == null) continue;

                string srcFile = Path.Combine(mediaDir, fileName);
                if (!File.Exists(srcFile)) continue;

                string destName = fileName;
                string destFile = Path.Combine(targetMedia, destName);
                if (File.Exists(destFile))
                {
                    destName = Path.GetFileNameWithoutExtension(fileName)
                             + "_" + Guid.NewGuid().ToString("N")[..6]
                             + Path.GetExtension(fileName);
                    destFile = Path.Combine(targetMedia, destName);
                }
                File.Copy(srcFile, destFile, overwrite: false);
                db.Execute("UPDATE pictures SET file_path = @path, file_name = @name WHERE id = @id",
                    new { path = destFile, name = destName, id = picId }, transaction: tx);
            }
        }
    }
}

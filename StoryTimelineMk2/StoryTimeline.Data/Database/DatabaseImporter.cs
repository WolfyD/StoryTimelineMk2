using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using StoryTimelineMk2.Database.Migrations;

namespace StoryTimelineMk2.Database
{
    public class ImportPreview
    {
        [JsonPropertyName("sourcePath")]           public string       SourcePath           { get; set; } = "";
        [JsonPropertyName("isV2")]                 public bool         IsV2                 { get; set; }
        [JsonPropertyName("timelineCount")]        public int          TimelineCount        { get; set; }
        [JsonPropertyName("itemCount")]            public int          ItemCount            { get; set; }
        [JsonPropertyName("conflictingTimelines")] public List<string> ConflictingTimelines { get; set; } = new();
    }

    internal class DatabaseImporter
    {
        public static ImportPreview GetImportPreview(string sourceFilePath)
        {
            // Media is not needed to count rows, so the preview only unpacks the database.
            using var source = ImportSource.Open(sourceFilePath, withMedia: false);

            bool isV2 = CheckIfV2(source.DbPath);
            using var src = new SqliteConnection($"Data Source={source.DbPath};Mode=ReadOnly;Pooling=False");
            src.Open();
            int tlCount   = src.QuerySingle<int>("SELECT COUNT(*) FROM timelines");
            int itemCount = src.QuerySingle<int>("SELECT COUNT(*) FROM items");
            var srcIds    = src.Query<long>("SELECT id FROM timelines").ToList();

            using var tgt = new SqliteConnection(DbInitializer.GetConnectionString());
            tgt.Open();
            var conflicts = srcIds
                .Select(id => tgt.QuerySingleOrDefault<string>("SELECT title FROM timelines WHERE id = @id", new { id }))
                .Where(t => t != null)
                .Cast<string>()
                .ToList();

            return new ImportPreview
            {
                // The original path, not the unpacked copy: the confirm step hands this straight
                // back to Import(), which opens the archive again for real.
                SourcePath           = sourceFilePath,
                IsV2                 = isV2,
                TimelineCount        = tlCount,
                ItemCount            = itemCount,
                ConflictingTimelines = conflicts,
            };
        }

        public static void Import(string sourceFilePath)
        {
            using var source = ImportSource.Open(sourceFilePath, withMedia: true);

            string targetFilePath = DbInitializer.GetConnectionString().Replace("Data Source=", "");

            // Detect Database Version
            bool isContemporaryV2 = CheckIfV2(source.DbPath);

            if (isContemporaryV2)
            {
                ImportV2Backup(source.DbPath, targetFilePath);
            }
            else
            {
                ImportV1Legacy(source.DbPath, targetFilePath);
            }

            // Media last: the rows that point at it are in by now, and a file left behind by a
            // failed row import would be an orphan nothing ever cleans up.
            if (source.MediaDir != null)
                CopyMedia(source.MediaDir, AppConfig.Instance.GetMediaFolder());
        }

        /// <summary>
        /// Media file names are GUIDs and thumbnails are named after the picture id, so the same name
        /// on both sides is the same file: anything already present is left alone. Nothing in the
        /// pictures rows needs rewriting, unlike the single-timeline import, which renames on collision.
        /// </summary>
        private static void CopyMedia(string sourceDir, string targetDir)
        {
            foreach (string src in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
            {
                string dest = Path.Combine(targetDir, Path.GetRelativePath(sourceDir, src));
                if (File.Exists(dest)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                File.Copy(src, dest);
            }
        }

        /// <summary>
        /// Both entry points accept either a bare database or a .stlm — a zip holding
        /// <see cref="BackupService.ArchiveDbEntry"/> and <see cref="BackupService.MediaEntryPrefix"/>.
        /// Unpacking the archive into temp turns the rest of the import back into the plain-file case;
        /// a bare database is handed straight through with nothing to clean up afterwards.
        /// </summary>
        private sealed class ImportSource : IDisposable
        {
            public string  DbPath   { get; }
            public string? MediaDir { get; }
            private readonly string? _tempDir;

            private ImportSource(string dbPath, string? mediaDir, string? tempDir)
            {
                DbPath   = dbPath;
                MediaDir = mediaDir;
                _tempDir = tempDir;
            }

            public static ImportSource Open(string path, bool withMedia)
            {
                if (!IsZip(path)) return new ImportSource(path, null, null);

                string tempDir = Path.Combine(Path.GetTempPath(), $"stl_stlm_{Guid.NewGuid():N}");
                Directory.CreateDirectory(tempDir);
                try
                {
                    using var zip = ZipFile.OpenRead(path);

                    var dbEntry = zip.GetEntry(BackupService.ArchiveDbEntry)
                        ?? throw new InvalidDataException(zip.GetEntry("timeline.json") != null
                            ? "This .stlm holds one exported timeline, not a full database — use Import Timeline for it."
                            : $"Not a Story Timeline database archive: no '{BackupService.ArchiveDbEntry}' inside.");

                    string dbPath = Path.Combine(tempDir, BackupService.ArchiveDbEntry);
                    dbEntry.ExtractToFile(dbPath);

                    string? mediaDir = withMedia ? ExtractMedia(zip, tempDir) : null;
                    return new ImportSource(dbPath, mediaDir, tempDir);
                }
                catch
                {
                    TryDeleteDir(tempDir);
                    throw;
                }
            }

            private static string? ExtractMedia(ZipArchive zip, string tempDir)
            {
                string mediaDir = Path.Combine(tempDir, "Media");
                string root     = Path.GetFullPath(mediaDir) + Path.DirectorySeparatorChar;
                bool   any      = false;

                foreach (var e in zip.Entries)
                {
                    if (e.Name.Length == 0) continue;   // a directory entry
                    if (!e.FullName.StartsWith(BackupService.MediaEntryPrefix, StringComparison.Ordinal)) continue;

                    string rel  = e.FullName[BackupService.MediaEntryPrefix.Length..]
                                   .Replace('/', Path.DirectorySeparatorChar);
                    string dest = Path.GetFullPath(Path.Combine(mediaDir, rel));
                    // A ".." in an entry name would otherwise write outside the temp folder.
                    if (!dest.StartsWith(root, StringComparison.Ordinal)) continue;

                    Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                    e.ExtractToFile(dest, overwrite: true);
                    any = true;
                }
                return any ? mediaDir : null;
            }

            /// <summary>Magic bytes, not the extension: the file picker's "All files" lets anything through.</summary>
            private static bool IsZip(string path)
            {
                // FileShare.ReadWrite, not File.OpenRead's FileShare.Read: a SQLite file the user
                // picked may well still be open somewhere, and four bytes are worth no contention.
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete);
                Span<byte> head = stackalloc byte[4];
                return fs.ReadAtLeast(head, 4, throwOnEndOfStream: false) == 4
                    && head[0] == (byte)'P' && head[1] == (byte)'K' && head[2] == 3 && head[3] == 4;
            }

            private static void TryDeleteDir(string dir)
            {
                try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { /* best-effort */ }
            }

            public void Dispose()
            {
                if (_tempDir != null) TryDeleteDir(_tempDir);
            }
        }

        private static bool CheckIfV2(string sourceFilePath)
        {
            using var db = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly;Pooling=False");
            db.Open();
            // v2 databases have the calendars table; v1 does not
            return db.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='calendars'") > 0;
        }

        /// <summary>
        /// Tables copied from a V2 backup, in FK-safe order, with the conflict policy for rows that already
        /// exist in the live database. Timeline-scoped tables are cleared by the cascade delete first, so a
        /// plain INSERT there restores the backup's version; global rows either overwrite (REPLACE: presets,
        /// lookups the backup is authoritative for) or keep the local copy (IGNORE: pictures, junctions).
        /// Tables not listed (item_types, misc_settings, relationship_types) are never imported.
        /// </summary>
        private static readonly (string Table, string Conflict)[] V2CopyPlan =
        {
            ("lod_profiles",               "OR REPLACE"),
            ("calendars",                  "OR REPLACE"),
            ("stories",                    "OR REPLACE"),
            ("tags",                       "OR REPLACE"),
            ("pictures",                   "OR IGNORE"),
            ("layout_settings",            "OR REPLACE"),
            ("filter_presets",             "OR REPLACE"),
            ("timelines",                  ""),
            ("items",                      ""),
            ("characters",                 ""),
            ("settings",                   "OR IGNORE"),
            ("item_tags",                  "OR IGNORE"),
            ("item_pictures",              "OR IGNORE"),
            ("item_characters",            "OR IGNORE"),
            ("timeline_calendars",         "OR IGNORE"),
            ("character_relationships",    "OR IGNORE"),
            ("item_story_refs",            "OR IGNORE"),
            ("books",                      "OR IGNORE"),
            ("book_stories",               "OR IGNORE"),
            ("chapters",                   "OR IGNORE"),
            ("item_chapters",              "OR IGNORE"),
            ("item_character_appearances", "OR IGNORE"),
            ("notes",                      "OR IGNORE"),
            ("timeline_hidden_ranges",     "OR IGNORE"),
            ("timeline_filter_rules",      "OR IGNORE"),
        };

        /// <summary>
        /// Snapshots the backup to a scratch file, runs the normal schema migrations on that copy, and only
        /// then merges it into the live database. Whatever app version wrote the backup, by the time rows
        /// are copied both sides have the current schema, so the copy is a plain column-for-column transfer.
        /// </summary>
        private static void ImportV2Backup(string sourceFilePath, string targetFilePath)
        {
            string scratchPath = Path.Combine(Path.GetTempPath(), $"stl_import_{Guid.NewGuid():N}.sqlite");
            try
            {
                // VACUUM INTO (rather than File.Copy) so a live database with a WAL sidecar is captured whole.
                using (var src = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly;Pooling=False"))
                {
                    src.Open();
                    src.Execute($"VACUUM INTO '{scratchPath}'");
                }

                try
                {
                    DbInitializer.Initialize(scratchPath, backupFirst: false, dbLabel: "imported backup");
                }
                catch (MigrationException ex)
                {
                    // Report the file the user picked, not the scratch copy that is deleted below.
                    throw new MigrationException(ex.Info with { DbPath = sourceFilePath }, ex.Stage, ex.BackupPath, ex.Message, ex.InnerException);
                }
                MergeMigratedBackup(scratchPath, targetFilePath);
            }
            finally
            {
                SqliteConnection.ClearAllPools();
                try { File.Delete(scratchPath); } catch { /* scratch file; best-effort */ }
            }
        }

        private static void MergeMigratedBackup(string backupPath, string targetFilePath)
        {
            using var dbTarget = new SqliteConnection($"Data Source={targetFilePath}");
            dbTarget.Open();

            // FK enforcement must be set outside the transaction for SQLite to honour cascades.
            dbTarget.Execute("PRAGMA foreign_keys = ON");

            // Release any pooled connections that might hold a native file lock on
            // sourceFilePath (e.g. from CheckIfV2 or GetImportPreview). ATTACH DATABASE
            // fails with "database BackupDb is locked" if the native handle is still open.
            SqliteConnection.ClearAllPools();

            using var tx = dbTarget.BeginTransaction();
            try
            {
                dbTarget.Execute("ATTACH DATABASE @path AS BackupDb", new { path = backupPath }, transaction: tx);

                // --- Cascade-delete timelines that exist in both backup and target ---
                // Deleting a timeline row cascades (ON DELETE CASCADE) to items, settings,
                // characters, hidden_ranges, filter_rules, timeline_calendars, and via items
                // to all junction tables.  We then re-insert everything cleanly.
                var backupIds = dbTarget.Query<long>("SELECT id FROM BackupDb.timelines", transaction: tx).ToList();
                if (backupIds.Count > 0)
                {
                    string idList = string.Join(",", backupIds);
                    dbTarget.Execute($"DELETE FROM main.timelines WHERE id IN ({idList})", transaction: tx);
                }

                foreach (var (table, conflict) in V2CopyPlan)
                {
                    // Both sides are on the current schema, but a migrated file appends ALTER-added columns
                    // at the end while a fresh one declares them inline — so copy by name, never by position.
                    var cols = dbTarget.Query<string>($"SELECT name FROM pragma_table_info('{table}')", transaction: tx)
                        .Intersect(dbTarget.Query<string>($"SELECT name FROM pragma_table_info('{table}', 'BackupDb')", transaction: tx),
                                   StringComparer.OrdinalIgnoreCase)
                        .Select(c => $"\"{c}\"")
                        .ToList();
                    if (cols.Count == 0) continue;

                    string colList = string.Join(", ", cols);
                    dbTarget.Execute($"INSERT {conflict} INTO main.{table} ({colList}) SELECT {colList} FROM BackupDb.{table}", transaction: tx);
                }

                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }

            // DETACH must run after the transaction commits: while main's write transaction
            // is open, BackupDb holds an active read transaction (from the INSERT...SELECT reads),
            // and SQLite refuses to DETACH a database that is still "in read transaction".
            dbTarget.Execute("DETACH DATABASE BackupDb");
        }

        private static void ImportV1Legacy(string sourceFilePath, string targetFilePath)
        {
            using var dbV1 = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly");
            using var dbV2 = new SqliteConnection($"Data Source={targetFilePath}");

            dbV1.Open();
            dbV2.Open();

            using var transaction = dbV2.BeginTransaction();

            try
            {
                // Timelines
                var timelines = dbV1.Query("SELECT * FROM timelines");
                foreach (var t in timelines)
                {
                    dbV2.Execute(@"
                        INSERT INTO timelines (id, title, author, description, start_year, calendar_id, layout_settings_id) 
                        VALUES (@id, @title, @author, @description, @start_year, 'cal_default_gregorian', 'ls_default')
                        ON CONFLICT(id) DO UPDATE SET title = excluded.title", (object)t, transaction);
                }

                // Stories
                var stories = dbV1.Query("SELECT * FROM stories");
                foreach (var s in stories)
                {
                    dbV2.Execute("INSERT OR IGNORE INTO stories (id, title, description) VALUES (@id, @title, @description)", (object)s, transaction);
                }

                // Tags
                var tags = dbV1.Query("SELECT * FROM tags");
                foreach (var tag in tags)
                {
                    dbV2.Execute("INSERT OR IGNORE INTO tags (id, name) VALUES (@id, @name)", (object)tag, transaction);
                }

                // Items — compute absolute_start/end from legacy subtick (0–9 scale)
                var items = dbV1.Query("SELECT * FROM items");
                foreach (var item in items)
                {
                    try
                    {
                        double absStart = (double)(item.year ?? 0) + ((double)(item.subtick ?? 0)) / 10.0;
                        double absEnd   = item.end_year != null
                            ? (double)item.end_year + ((double)(item.end_subtick ?? 0)) / 10.0
                            : absStart;
                        dbV2.Execute(@"
                        INSERT OR IGNORE INTO items (
                            id, title, description, content, story_id, type_id,
                            year, end_year, absolute_start, absolute_end,
                            book_title, chapter, page, color, creation_granularity, timeline_id,
                            item_index, show_in_notes, importance, lod_visibility_mask
                        ) VALUES (
                            @id, @title, @description, @content, @story_id, @type_id,
                            @year, @end_year, @absolute_start, @absolute_end,
                            @book_title, @chapter, @page, @color, @creation_granularity, @timeline_id,
                            @item_index, @show_in_notes, @importance, @lod_visibility_mask
                        )", new {
                            item.id, item.title, item.description, item.content, item.story_id, item.type_id,
                            item.year, item.end_year, absolute_start = absStart, absolute_end = absEnd,
                            item.book_title, item.chapter, item.page, item.color, item.creation_granularity,
                            item.timeline_id, item.item_index, item.show_in_notes, item.importance,
                            lod_visibility_mask = 248  // bits 3-7: visible at Years and finer (V1 had no LOD data)
                        }, transaction);
                    }
                    catch { }
                }

                //// Notes (Merge into items as Type 5)
                //var notes = dbV1.Query("SELECT * FROM notes");
                //foreach (var note in notes)
                //{
                //    dbV2.Execute(@"
                //        INSERT OR IGNORE INTO items (id, title, content, type_id, year, subtick, timeline_id)
                //        VALUES (@newId, 'Note', @content, 5, @year, @subtick, @timeline_id)",
                //        new { newId = Guid.NewGuid().ToString(), note.content, note.year, note.subtick, note.timeline_id }, transaction);
                //}

                // Characters
                try
                {
                    int chars = dbV1.QuerySingle<int>("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='characters';");
                    if (chars > 0)
                    {
                        var characters = dbV1.Query("SELECT * FROM characters");
                        foreach (var c in characters)
                        {
                            dbV2.Execute(@"
                        INSERT OR IGNORE INTO characters (
                            id, name, nicknames, aliases, race, description, notes,
                            birth_year, birth_date, birth_alternative_year,
                            death_year, death_date, death_alternative_year,
                            importance, color, timeline_id
                        ) VALUES (
                            @id, @name, @nicknames, @aliases, @race, @description, @notes,
                            @birth_year, @birth_date, @birth_alternative_year,
                            @death_year, @death_date, @death_alternative_year,
                            @importance, @color, @timeline_id
                        )", (object)c, transaction);
                        }

                        // Map V1 item_characters → V2 item_character_appearances (role replaces relationship_type)
                        var itemCharacters = dbV1.Query("SELECT item_id, character_id, relationship_type AS role FROM item_characters");
                        foreach (var ic in itemCharacters)
                        {
                            dbV2.Execute("INSERT OR IGNORE INTO item_character_appearances (item_id, character_id, role) VALUES (@item_id, @character_id, @role)", (object)ic, transaction);
                        }

                        var charRels = dbV1.Query("SELECT * FROM character_relationships");
                        foreach (var cr in charRels)
                        {
                            // v1 uses character_1_id / character_2_id (not character_id_1 / character_id_2)
                            dbV2.Execute(@"
                                INSERT OR IGNORE INTO character_relationships
                                    (character_1_id, character_2_id, relationship_type, custom_relationship_type,
                                     relationship_degree, relationship_modifier, relationship_strength,
                                     is_bidirectional, notes, timeline_id)
                                VALUES
                                    (@character_1_id, @character_2_id, @relationship_type, @custom_relationship_type,
                                     @relationship_degree, @relationship_modifier, @relationship_strength,
                                     @is_bidirectional, @notes, @timeline_id)",
                                (object)cr, transaction);
                        }
                    }

                }
                catch { }

                var itemTags = dbV1.Query("SELECT * FROM item_tags");
                foreach (var it in itemTags)
                {
                    dbV2.Execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (@item_id, @tag_id)", (object)it, transaction);
                }

                // item_story_refs — v1 many-to-many (items.story_id is the primary FK in v2, this preserves additional refs)
                try
                {
                    int hasRefs = dbV1.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='item_story_refs'");
                    if (hasRefs > 0)
                    {
                        var itemStoryRefs = dbV1.Query("SELECT * FROM item_story_refs");
                        foreach (var r in itemStoryRefs)
                        {
                            dbV2.Execute("INSERT OR IGNORE INTO item_story_refs (item_id, story_id) VALUES (@item_id, @story_id)", (object)r, transaction);
                        }
                    }
                }
                catch { }

                // Settings
                var settings = dbV1.Query("SELECT * FROM settings");
                foreach (var setting in settings)
                {
                    dbV2.Execute(@"
                        INSERT INTO settings (
                            id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css, 
                            use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y, 
                            window_position_x, window_position_y, use_custom_scaling, custom_scale, 
                            display_radius, canvas_settings
                        ) VALUES (
                            @id, @timeline_id, @font, @font_size_scale, @pixels_per_subtick, @custom_css, 
                            @use_custom_css, @is_fullscreen, @show_guides, @window_size_x, @window_size_y, 
                            @window_position_x, @window_position_y, @use_custom_scaling, @custom_scale, 
                            @display_radius, @canvas_settings
                        )
                        ON CONFLICT(id) DO UPDATE SET 
                            font = excluded.font, font_size_scale = excluded.font_size_scale, 
                            pixels_per_subtick = excluded.pixels_per_subtick, custom_css = excluded.custom_css, 
                            use_custom_css = excluded.use_custom_css, is_fullscreen = excluded.is_fullscreen, 
                            show_guides = excluded.show_guides, window_size_x = excluded.window_size_x, 
                            window_size_y = excluded.window_size_y, window_position_x = excluded.window_position_x, 
                            window_position_y = excluded.window_position_y, use_custom_scaling = excluded.use_custom_scaling, 
                            custom_scale = excluded.custom_scale, display_radius = excluded.display_radius, 
                            canvas_settings = excluded.canvas_settings;", (object)setting, transaction);
                }

                // Pictures (Map Integer IDs to string UUIDs)
                var mediaIdMap = new Dictionary<int, string>();
                var pictures = dbV1.Query("SELECT * FROM pictures");

                foreach (var pic in pictures)
                {
                    string newUuid = Guid.NewGuid().ToString();
                    mediaIdMap[(int)pic.id] = newUuid;

                    dbV2.Execute(@"
                        INSERT OR IGNORE INTO pictures (id, file_path, file_name, file_size, file_type, width, height, title, description) 
                        VALUES (@newUuid, @file_path, @file_name, @file_size, @file_type, @width, @height, @title, @description)",
                        new
                        {
                            newUuid,
                            pic.file_path,
                            pic.file_name,
                            pic.file_size,
                            pic.file_type,
                            pic.width,
                            pic.height,
                            pic.title,
                            pic.description
                        }, transaction);
                }

                var itemPictures = dbV1.Query("SELECT * FROM item_pictures");
                foreach (var ip in itemPictures)
                {
                    if (mediaIdMap.TryGetValue((int)ip.picture_id, out string? mappedMediaId))
                    {
                        dbV2.Execute("INSERT OR IGNORE INTO item_pictures (item_id, picture_id) VALUES (@item_id, @mappedMediaId)",
                            new { ip.item_id, mappedMediaId }, transaction);
                    }
                }

                transaction.Commit();
            }
            catch (Exception ex) 
            {
                System.Diagnostics.Debug.WriteLine(ex.Message);
                transaction.Rollback();
                throw;
            }
        }

    }
}
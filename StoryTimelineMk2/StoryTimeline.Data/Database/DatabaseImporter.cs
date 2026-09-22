using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
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
            bool isV2 = CheckIfV2(sourceFilePath);
            using var src = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly;Pooling=False");
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
                SourcePath           = sourceFilePath,
                IsV2                 = isV2,
                TimelineCount        = tlCount,
                ItemCount            = itemCount,
                ConflictingTimelines = conflicts,
            };
        }

        public static bool HandleDBImport()
        {
            try
            {
                OpenFileDialog ofd = new OpenFileDialog()
                {
                    Filter = "SQLite Files|*.sql;*.sqlite;*.sqlite3;*.db;*.db3|All Files|*.*",
                    Title = "Open DB file for import"
                };

                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    if (File.Exists(ofd.FileName))
                    {
                        Import(ofd.FileName);
                    }
                }
            }
            catch (Exception ex)
            {
                // Project rule: log full stack trace and show to the user — never
                // swallow. Before this, any import failure was reported as success.
                Logger.Error("DatabaseImporter", ex);
                Forms.f_ErrorReport.ShowReport("Database import failed.", ex);
                return false;
            }
            return true;
        }

        public static void Import(string sourceFilePath)
        {
            string targetFilePath = DbInitializer.GetConnectionString().Replace("Data Source=", "");

            // Detect Database Version
            bool isContemporaryV2 = CheckIfV2(sourceFilePath);

            if (isContemporaryV2)
            {
                ImportV2Backup(sourceFilePath, targetFilePath);
            }
            else
            {
                ImportV1Legacy(sourceFilePath, targetFilePath);
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
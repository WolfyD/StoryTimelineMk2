using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

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
                MessageBox.Show($"Database import failed:\n\n{ex}", "Import error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
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

            // After data is dumped in, ensure all legacy/missing fields are computed and backfilled
            ApplyLegacyMigrations(targetFilePath);
        }

        private static bool CheckIfV2(string sourceFilePath)
        {
            using var db = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly;Pooling=False");
            db.Open();
            // v2 databases have the calendars table; v1 does not
            return db.QuerySingle<int>("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='calendars'") > 0;
        }

        private static bool TableExistsInBackup(SqliteConnection db, Microsoft.Data.Sqlite.SqliteTransaction tx, string tableName)
        {
            return db.QuerySingle<int>(
                $"SELECT COUNT(*) FROM BackupDb.sqlite_master WHERE type='table' AND name='{tableName}'",
                transaction: tx) > 0;
        }

        private static void ImportV2Backup(string sourceFilePath, string targetFilePath)
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
                dbTarget.Execute("ATTACH DATABASE @path AS BackupDb", new { path = sourceFilePath }, transaction: tx);

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

                // --- Dynamic schema checks ---
                bool hasCalendarId    = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('timelines', 'BackupDb') WHERE name='calendar_id'",    transaction: tx) > 0;
                bool hasAbsoluteStart = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='absolute_start'",      transaction: tx) > 0;
                bool hasSrcSubtick    = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='subtick'",             transaction: tx) > 0;
                bool hasMinLod        = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='min_lod_level'",       transaction: tx) > 0;

                string timelineCols  = "id, title, author, description, start_year, created_at, updated_at" + (hasCalendarId ? ", calendar_id" : "");
                string absStartExpr  = hasAbsoluteStart ? "absolute_start"
                    : (hasSrcSubtick ? "CAST(year AS REAL) + CAST(IFNULL(subtick, 0) AS REAL) / 10.0" : "CAST(year AS REAL)");
                string absEndExpr    = hasAbsoluteStart ? "absolute_end"
                    : (hasSrcSubtick ? "CASE WHEN end_year IS NOT NULL THEN CAST(end_year AS REAL) + CAST(IFNULL(end_subtick, 0) AS REAL) / 10.0 ELSE CAST(year AS REAL) + CAST(IFNULL(subtick, 0) AS REAL) / 10.0 END"
                                     : "COALESCE(CAST(end_year AS REAL), CAST(year AS REAL))");
                string minLodExpr    = hasMinLod ? "min_lod_level" : "3";

                string itemDestCols  = "id, title, description, content, story_id, type_id, year, end_year, absolute_start, absolute_end, book_title, chapter, page, color, creation_granularity, timeline_id, item_index, show_in_notes, importance, min_lod_level, created_at, updated_at";
                string itemSrcSelect = $"id, title, description, content, story_id, type_id, year, end_year, {absStartExpr}, {absEndExpr}, book_title, chapter, page, color, creation_granularity, timeline_id, item_index, show_in_notes, importance, {minLodExpr}, created_at, updated_at";

                // --- Global data (INSERT OR REPLACE — safe to overwrite with backup version) ---

                // 1. LOD Profiles (before calendars — FK order)
                if (TableExistsInBackup(dbTarget, tx, "lod_profiles"))
                    dbTarget.Execute("INSERT OR REPLACE INTO main.lod_profiles SELECT * FROM BackupDb.lod_profiles", transaction: tx);

                // 2. Calendars
                dbTarget.Execute(@"INSERT OR REPLACE INTO main.calendars
                    (id, name, short_name, alternate_name, name_before_0, name_after_0, lod_profile_id, year_definition)
                    SELECT id, name, short_name, alternate_name,
                        COALESCE(name_before_0, ''), COALESCE(name_after_0, ''),
                        lod_profile_id, year_definition FROM BackupDb.calendars", transaction: tx);

                // 3. Stories
                dbTarget.Execute(@"INSERT OR REPLACE INTO main.stories (id, title, description, created_at, updated_at)
                    SELECT id, title, description, created_at, updated_at FROM BackupDb.stories", transaction: tx);

                // 4. Tags
                dbTarget.Execute(@"INSERT OR REPLACE INTO main.tags (id, name, created_at)
                    SELECT id, name, created_at FROM BackupDb.tags", transaction: tx);

                // 5. Pictures (INSERT OR IGNORE — keep existing copies; paths may differ per machine)
                dbTarget.Execute(@"INSERT OR IGNORE INTO main.pictures
                    (id, file_path, file_name, file_size, file_type, width, height, title, description, created_at)
                    SELECT id, file_path, file_name, file_size, file_type, width, height, title, description, created_at
                    FROM BackupDb.pictures", transaction: tx);

                // 6. Layout settings + filter presets (global presets)
                if (TableExistsInBackup(dbTarget, tx, "layout_settings"))
                    dbTarget.Execute("INSERT OR REPLACE INTO main.layout_settings SELECT * FROM BackupDb.layout_settings", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "filter_presets"))
                    dbTarget.Execute("INSERT OR REPLACE INTO main.filter_presets SELECT * FROM BackupDb.filter_presets", transaction: tx);

                // --- Timeline-scoped data (cascade-deleted above → plain INSERT) ---

                // 7. Timelines
                dbTarget.Execute($"INSERT INTO main.timelines ({timelineCols}) SELECT {timelineCols} FROM BackupDb.timelines", transaction: tx);

                // 8. Items
                dbTarget.Execute($"INSERT INTO main.items ({itemDestCols}) SELECT {itemSrcSelect} FROM BackupDb.items", transaction: tx);

                // 9. Characters
                dbTarget.Execute(@"INSERT INTO main.characters
                    (id, name, nicknames, aliases, race, description, notes, birth_year, birth_date,
                     birth_alternative_year, death_year, death_date, death_alternative_year, importance,
                     color, timeline_id, created_at, updated_at)
                    SELECT id, name, nicknames, aliases, race, description, notes, birth_year, birth_date,
                     birth_alternative_year, death_year, death_date, death_alternative_year, importance,
                     color, timeline_id, created_at, updated_at FROM BackupDb.characters", transaction: tx);

                // 10. Settings
                dbTarget.Execute(@"INSERT OR IGNORE INTO main.settings
                    (id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css,
                     use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y,
                     window_position_x, window_position_y, use_custom_scaling, custom_scale,
                     display_radius, canvas_settings, updated_at)
                    SELECT id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css,
                     use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y,
                     window_position_x, window_position_y, use_custom_scaling, custom_scale,
                     display_radius, canvas_settings, updated_at FROM BackupDb.settings", transaction: tx);

                // 11. Junction tables (always present in V2)
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_tags SELECT * FROM BackupDb.item_tags", transaction: tx);
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_pictures SELECT * FROM BackupDb.item_pictures", transaction: tx);
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_characters SELECT * FROM BackupDb.item_characters", transaction: tx);

                // 12. Optional tables added progressively
                if (TableExistsInBackup(dbTarget, tx, "timeline_calendars"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.timeline_calendars SELECT * FROM BackupDb.timeline_calendars", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "character_relationships"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.character_relationships SELECT * FROM BackupDb.character_relationships", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "item_story_refs"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_story_refs SELECT * FROM BackupDb.item_story_refs", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "books"))
                {
                    dbTarget.Execute("INSERT OR IGNORE INTO main.books SELECT * FROM BackupDb.books", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.book_stories SELECT * FROM BackupDb.book_stories", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.chapters SELECT * FROM BackupDb.chapters", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_chapters SELECT * FROM BackupDb.item_chapters", transaction: tx);
                }

                if (TableExistsInBackup(dbTarget, tx, "item_character_appearances"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_character_appearances SELECT * FROM BackupDb.item_character_appearances", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "notes"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.notes SELECT * FROM BackupDb.notes", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "timeline_hidden_ranges"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.timeline_hidden_ranges SELECT * FROM BackupDb.timeline_hidden_ranges", transaction: tx);

                if (TableExistsInBackup(dbTarget, tx, "timeline_filter_rules"))
                    dbTarget.Execute("INSERT OR IGNORE INTO main.timeline_filter_rules SELECT * FROM BackupDb.timeline_filter_rules", transaction: tx);

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
                            item_index, show_in_notes, importance
                        ) VALUES (
                            @id, @title, @description, @content, @story_id, @type_id,
                            @year, @end_year, @absolute_start, @absolute_end,
                            @book_title, @chapter, @page, @color, @creation_granularity, @timeline_id,
                            @item_index, @show_in_notes, @importance
                        )", new {
                            item.id, item.title, item.description, item.content, item.story_id, item.type_id,
                            item.year, item.end_year, absolute_start = absStart, absolute_end = absEnd,
                            item.book_title, item.chapter, item.page, item.color, item.creation_granularity,
                            item.timeline_id, item.item_index, item.show_in_notes, item.importance
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

        private static void ApplyLegacyMigrations(string targetFilePath)
        {
            using var db = new SqliteConnection($"Data Source={targetFilePath}");
            db.Open();
            using var tx = db.BeginTransaction();

            try
            {
                // Update any existing timelines that have a NULL calendar_id to the default
                db.Execute("UPDATE timelines SET calendar_id = 'cal_default_gregorian' WHERE calendar_id IS NULL;", transaction: tx);

                // Backfill any items that somehow lack absolute_start (safety net — should not occur in practice
                // since all import paths now compute absolute_start before inserting).
                db.Execute(@"
                    UPDATE items
                    SET
                        min_lod_level = COALESCE(min_lod_level, 3),
                        absolute_start = CAST(year AS REAL),
                        absolute_end   = COALESCE(CAST(end_year AS REAL), CAST(year AS REAL))
                    WHERE absolute_start IS NULL;", transaction: tx);

                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }
}
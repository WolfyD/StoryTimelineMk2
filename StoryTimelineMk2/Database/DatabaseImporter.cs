using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace StoryTimelineMk2.Database
{
    internal class DatabaseImporter
    {
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
            using var db = new SqliteConnection($"Data Source={sourceFilePath};Mode=ReadOnly");
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

            using var tx = dbTarget.BeginTransaction();
            try
            {
                // Parameterized: a path containing a single quote (e.g. "John's backup.db")
                // would break — or inject into — an interpolated ATTACH statement.
                dbTarget.Execute("ATTACH DATABASE @path AS BackupDb", new { path = sourceFilePath }, transaction: tx);

                // Check for dynamic schema additions to prevent crashes on older V2 backups
                bool hasCalendarId = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('timelines', 'BackupDb') WHERE name='calendar_id'", transaction: tx) > 0;
                string timelineCols = "id, title, author, description, start_year, created_at, updated_at" + (hasCalendarId ? ", calendar_id" : "");
                string timelineAssigns = "title = excluded.title, author = excluded.author, description = excluded.description, start_year = excluded.start_year, updated_at = excluded.updated_at" + (hasCalendarId ? ", calendar_id = excluded.calendar_id" : "");

                bool hasAbsoluteStart = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='absolute_start'", transaction: tx) > 0;
                bool hasSrcSubtick    = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='subtick'",         transaction: tx) > 0;
                bool hasMinLod        = dbTarget.QuerySingle<int>("SELECT COUNT(*) FROM pragma_table_info('items', 'BackupDb') WHERE name='min_lod_level'",   transaction: tx) > 0;

                // Build destination columns (subtick never written to new schema)
                // If source has absolute_start, use it directly; otherwise compute from subtick / year.
                string absStartExpr = hasAbsoluteStart
                    ? "absolute_start"
                    : (hasSrcSubtick ? "CAST(year AS REAL) + CAST(IFNULL(subtick, 0) AS REAL) / 10.0" : "CAST(year AS REAL)");
                string absEndExpr = hasAbsoluteStart
                    ? "absolute_end"
                    : (hasSrcSubtick ? "CASE WHEN end_year IS NOT NULL THEN CAST(end_year AS REAL) + CAST(IFNULL(end_subtick, 0) AS REAL) / 10.0 ELSE CAST(year AS REAL) + CAST(IFNULL(subtick, 0) AS REAL) / 10.0 END" : "COALESCE(CAST(end_year AS REAL), CAST(year AS REAL))");
                string minLodExpr  = hasMinLod ? "min_lod_level" : "3";

                string itemDestCols   = "id, title, description, content, story_id, type_id, year, end_year, absolute_start, absolute_end, book_title, chapter, page, color, creation_granularity, timeline_id, item_index, show_in_notes, importance, min_lod_level, created_at, updated_at";
                string itemSrcSelect  = $"id, title, description, content, story_id, type_id, year, end_year, {absStartExpr}, {absEndExpr}, book_title, chapter, page, color, creation_granularity, timeline_id, item_index, show_in_notes, importance, {minLodExpr}, created_at, updated_at";
                string itemCols       = itemDestCols; // kept for INSERT clause
                string itemAssigns    = "title = excluded.title, description = excluded.description, content = excluded.content, story_id = excluded.story_id, type_id = excluded.type_id, year = excluded.year, end_year = excluded.end_year, absolute_start = excluded.absolute_start, absolute_end = excluded.absolute_end, book_title = excluded.book_title, chapter = excluded.chapter, page = excluded.page, color = excluded.color, creation_granularity = excluded.creation_granularity, item_index = excluded.item_index, show_in_notes = excluded.show_in_notes, importance = excluded.importance, min_lod_level = excluded.min_lod_level, updated_at = excluded.updated_at";


                // 1. Timelines
                dbTarget.Execute($@"
                    INSERT INTO main.timelines ({timelineCols})
                    SELECT {timelineCols} FROM BackupDb.timelines
                    ON CONFLICT(id) DO UPDATE SET {timelineAssigns};", transaction: tx);

                // 1.5. LOD Profiles — must come before calendars (calendars.lod_profile_id FK)
                if (TableExistsInBackup(dbTarget, tx, "lod_profiles"))
                    dbTarget.Execute("INSERT OR REPLACE INTO main.lod_profiles SELECT * FROM BackupDb.lod_profiles", transaction: tx);

                // 2. Calendars
                dbTarget.Execute(@"
                    INSERT INTO main.calendars (id, name, short_name, alternate_name, name_before_0, name_after_0, lod_profile_id, year_definition)
                    SELECT id, name, short_name, alternate_name,
                        COALESCE(name_before_0, ''), COALESCE(name_after_0, ''),
                        lod_profile_id, year_definition FROM BackupDb.calendars
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name, short_name = excluded.short_name, alternate_name = excluded.alternate_name,
                        name_before_0 = excluded.name_before_0, name_after_0 = excluded.name_after_0,
                        lod_profile_id = excluded.lod_profile_id, year_definition = excluded.year_definition;", transaction: tx);

                // 3. Stories
                dbTarget.Execute(@"
                    INSERT INTO main.stories (id, title, description, created_at, updated_at)
                    SELECT id, title, description, created_at, updated_at FROM BackupDb.stories
                    ON CONFLICT(id) DO UPDATE SET 
                        title = excluded.title, description = excluded.description, updated_at = excluded.updated_at;", transaction: tx);

                // 4. Tags
                dbTarget.Execute(@"
                    INSERT INTO main.tags (id, name, created_at)
                    SELECT id, name, created_at FROM BackupDb.tags
                    ON CONFLICT(id) DO UPDATE SET name = excluded.name;", transaction: tx);

                // 5. Items
                dbTarget.Execute($@"
                    INSERT INTO main.items ({itemCols})
                    SELECT {itemSrcSelect} FROM BackupDb.items
                    ON CONFLICT(id) DO UPDATE SET {itemAssigns};", transaction: tx);

                // 6. Characters
                dbTarget.Execute(@"
                    INSERT INTO main.characters (id, name, nicknames, aliases, race, description, notes, birth_year, birth_date, birth_alternative_year, death_year, death_date, death_alternative_year, importance, color, timeline_id, created_at, updated_at)
                    SELECT id, name, nicknames, aliases, race, description, notes, birth_year, birth_date, birth_alternative_year, death_year, death_date, death_alternative_year, importance, color, timeline_id, created_at, updated_at FROM BackupDb.characters
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name, nicknames = excluded.nicknames, aliases = excluded.aliases, race = excluded.race,
                        description = excluded.description, notes = excluded.notes, birth_year = excluded.birth_year,
                        birth_date = excluded.birth_date, birth_alternative_year = excluded.birth_alternative_year,
                        death_year = excluded.death_year, death_date = excluded.death_date,
                        death_alternative_year = excluded.death_alternative_year, importance = excluded.importance, color = excluded.color,
                        updated_at = excluded.updated_at;", transaction: tx);

                // 7. Pictures
                dbTarget.Execute(@"
                    INSERT INTO main.pictures (id, file_path, file_name, file_size, file_type, width, height, title, description, created_at)
                    SELECT id, file_path, file_name, file_size, file_type, width, height, title, description, created_at FROM BackupDb.pictures
                    ON CONFLICT(id) DO UPDATE SET 
                        file_path = excluded.file_path, file_name = excluded.file_name, file_size = excluded.file_size, 
                        file_type = excluded.file_type, width = excluded.width, height = excluded.height, 
                        title = excluded.title, description = excluded.description;", transaction: tx);

                // 8. Junction Tables (always present in v2)
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_tags SELECT * FROM BackupDb.item_tags", transaction: tx);
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_pictures SELECT * FROM BackupDb.item_pictures", transaction: tx);
                dbTarget.Execute("INSERT OR IGNORE INTO main.item_characters SELECT * FROM BackupDb.item_characters", transaction: tx);

                // 8.5 Tables added progressively — check existence before copying
                bool hasTimelineCalendars = TableExistsInBackup(dbTarget, tx, "timeline_calendars");
                if (hasTimelineCalendars)
                    dbTarget.Execute("INSERT OR IGNORE INTO main.timeline_calendars SELECT * FROM BackupDb.timeline_calendars", transaction: tx);

                bool hasCharRel = TableExistsInBackup(dbTarget, tx, "character_relationships");
                if (hasCharRel)
                    dbTarget.Execute("INSERT OR IGNORE INTO main.character_relationships SELECT * FROM BackupDb.character_relationships", transaction: tx);

                bool hasItemStoryRefs = TableExistsInBackup(dbTarget, tx, "item_story_refs");
                if (hasItemStoryRefs)
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_story_refs SELECT * FROM BackupDb.item_story_refs", transaction: tx);

                bool hasBooks = TableExistsInBackup(dbTarget, tx, "books");
                if (hasBooks)
                {
                    dbTarget.Execute("INSERT OR IGNORE INTO main.books SELECT * FROM BackupDb.books", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.book_stories SELECT * FROM BackupDb.book_stories", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.chapters SELECT * FROM BackupDb.chapters", transaction: tx);
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_chapters SELECT * FROM BackupDb.item_chapters", transaction: tx);
                }

                bool hasAppearances = TableExistsInBackup(dbTarget, tx, "item_character_appearances");
                if (hasAppearances)
                    dbTarget.Execute("INSERT OR IGNORE INTO main.item_character_appearances SELECT * FROM BackupDb.item_character_appearances", transaction: tx);

                bool hasLayoutSettings = TableExistsInBackup(dbTarget, tx, "layout_settings");
                if (hasLayoutSettings)
                    dbTarget.Execute("INSERT OR REPLACE INTO main.layout_settings SELECT * FROM BackupDb.layout_settings", transaction: tx);

                bool hasHiddenRanges = TableExistsInBackup(dbTarget, tx, "timeline_hidden_ranges");
                if (hasHiddenRanges)
                    dbTarget.Execute("INSERT OR REPLACE INTO main.timeline_hidden_ranges SELECT * FROM BackupDb.timeline_hidden_ranges", transaction: tx);

                bool hasFilterPresets = TableExistsInBackup(dbTarget, tx, "filter_presets");
                if (hasFilterPresets)
                    dbTarget.Execute("INSERT OR REPLACE INTO main.filter_presets SELECT * FROM BackupDb.filter_presets", transaction: tx);

                bool hasFilterRules = TableExistsInBackup(dbTarget, tx, "timeline_filter_rules");
                if (hasFilterRules)
                    dbTarget.Execute("INSERT OR REPLACE INTO main.timeline_filter_rules SELECT * FROM BackupDb.timeline_filter_rules", transaction: tx);

                // 9. Settings
                dbTarget.Execute(@"
                    INSERT INTO main.settings (
                        id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css, 
                        use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y, 
                        window_position_x, window_position_y, use_custom_scaling, custom_scale, 
                        display_radius, canvas_settings, updated_at
                    )
                    SELECT 
                        id, timeline_id, font, font_size_scale, pixels_per_subtick, custom_css, 
                        use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y, 
                        window_position_x, window_position_y, use_custom_scaling, custom_scale, 
                        display_radius, canvas_settings, updated_at 
                    FROM BackupDb.settings
                    ON CONFLICT(id) DO UPDATE SET 
                        font = excluded.font, font_size_scale = excluded.font_size_scale, 
                        pixels_per_subtick = excluded.pixels_per_subtick, custom_css = excluded.custom_css, 
                        use_custom_css = excluded.use_custom_css, is_fullscreen = excluded.is_fullscreen, 
                        show_guides = excluded.show_guides, window_size_x = excluded.window_size_x, 
                        window_size_y = excluded.window_size_y, window_position_x = excluded.window_position_x, 
                        window_position_y = excluded.window_position_y, use_custom_scaling = excluded.use_custom_scaling, 
                        custom_scale = excluded.custom_scale, display_radius = excluded.display_radius, 
                        canvas_settings = excluded.canvas_settings, updated_at = excluded.updated_at;", transaction: tx);

                dbTarget.Execute("DETACH DATABASE BackupDb", transaction: tx);
                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
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

                        // Straight Junctions
                        var itemCharacters = dbV1.Query("SELECT * FROM item_characters");
                        foreach (var ic in itemCharacters)
                        {
                            dbV2.Execute("INSERT OR IGNORE INTO item_characters (item_id, character_id, relationship_type, timeline_id) VALUES (@item_id, @character_id, @relationship_type, @timeline_id)", (object)ic, transaction);
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
                    if (mediaIdMap.TryGetValue((int)ip.picture_id, out string mappedMediaId))
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
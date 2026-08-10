using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class TimelineRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public TimelineRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public bool CheckIfTimelineTitleExists(string title)
        {
            using var db = new SqliteConnection(_connString);
            var q = db.QuerySingle<int>($@"SELECT count(*) FROM timelines WHERE title='{title}';");
            return q > 0;
        }

        public int CreateTimeline(string title)
        {
            if (CheckIfTimelineTitleExists(title)) { return -1; }

            using var db = new SqliteConnection(_connString);

            TimelineInfo timelineInfo = new TimelineInfo()
            {
                Title = title,
                StartYear = 0,
                Description = "",
                Author = ""
            };

            string sql = @"INSERT INTO timelines (title, author, description, start_year, granularity)
                            VALUES (@Title, @Author, @Description, @StartYear, @Granularity)";
            db.Execute(sql, timelineInfo);

            var q = db.QuerySingle<int>("SELECT max(id) FROM timelines;");
            return q;
        }

        public IEnumerable<TimelineInfo> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TimelineInfo>("SELECT * FROM timelines ORDER BY title;");
        }

        public TimelineInfo GetTimelineById(int id)
        {
            using var db = new SqliteConnection(_connString);
            var TL = db.QueryFirst<TimelineInfo>($"SELECT * FROM timelines WHERE id='{id}' LIMIT 1;");
            var cal = new CalendarRepo().GetCalendarById(TL.CalendarId);
            var set = new SettingsRepo().GetTimelineSettings(id);
            var ls = new LayoutSettingsRepo().GetById(TL.LayoutSettingsId);
            TL.Calendar = cal;
            TL.Settings = set;
            TL.LayoutSettings = ls;
            return TL;
        }

        public void SaveTimeline(TimelineInfo timeline)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO timelines (id, title, author, description, start_year, granularity) 
                VALUES (@Id, @Title, @Author, @Description, @StartYear, @Granularity)
                ON CONFLICT(id) DO UPDATE SET 
                    title = excluded.title,
                    author = excluded.author,
                    description = excluded.description,
                    start_year = excluded.start_year,
                    granularity = excluded.granularity,
                    updated_at = CURRENT_TIMESTAMP;";
                    
            db.Execute(sql, timeline);
        }

        public void DeleteTimeline(int id)
        {
            using var db = new SqliteConnection(_connString);
            // ON DELETE CASCADE in SQLite handles dropping all associated items, characters, and settings
            db.Execute("DELETE FROM timelines WHERE id = @Id", new { Id = id });
        }

        public void UpdateTimelineInfo(int id, string title, string author, string description, int startYear, string? color, string? calendarId = null)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"
                UPDATE timelines SET
                    title       = @Title,
                    author      = @Author,
                    description = @Description,
                    start_year  = @StartYear,
                    color       = @Color,
                    calendar_id = COALESCE(@CalendarId, calendar_id),
                    updated_at  = CURRENT_TIMESTAMP
                WHERE id = @Id",
                new { Id = id, Title = title, Author = author, Description = description, StartYear = startYear, Color = color, CalendarId = calendarId });
        }

        public void SetLayoutPreset(int timelineId, string layoutPresetId)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("UPDATE timelines SET layout_settings_id = @PresetId WHERE id = @Id",
                new { PresetId = layoutPresetId, Id = timelineId });
        }

        public int DuplicateTimeline(int originalId, string newTitle)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            try
            {
                // 1. Clone timeline row
                db.Execute(@"
                    INSERT INTO timelines (title, author, description, start_year, calendar_id, layout_settings_id, color)
                    SELECT @NewTitle, author, description, start_year, calendar_id, layout_settings_id, color
                    FROM timelines WHERE id = @OriginalId",
                    new { NewTitle = newTitle, OriginalId = originalId }, tx);
                int newId = db.QuerySingle<int>("SELECT last_insert_rowid()", null, tx);

                // 2. Clone settings
                db.Execute(@"
                    INSERT INTO settings (timeline_id, font, font_size_scale, pixels_per_subtick, custom_css,
                        use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y,
                        window_position_x, window_position_y, use_custom_scaling, custom_scale,
                        display_radius, canvas_settings, default_layout_settings_id)
                    SELECT @NewId, font, font_size_scale, pixels_per_subtick, custom_css,
                        use_custom_css, is_fullscreen, show_guides, window_size_x, window_size_y,
                        window_position_x, window_position_y, use_custom_scaling, custom_scale,
                        display_radius, canvas_settings, default_layout_settings_id
                    FROM settings WHERE timeline_id = @OriginalId",
                    new { NewId = newId, OriginalId = originalId }, tx);

                // 3. Clone characters (timeline-scoped), track old→new ID map
                var chars = db.Query("SELECT * FROM characters WHERE timeline_id = @Id", new { Id = originalId }, tx).ToList();
                var charMap = new Dictionary<string, string>();
                foreach (var ch in chars)
                {
                    string newCharId = Guid.NewGuid().ToString();
                    charMap[(string)ch.id] = newCharId;
                    db.Execute(@"
                        INSERT INTO characters (id, name, nicknames, aliases, race, description, notes,
                            birth_year, birth_subtick, birth_date, birth_alternative_year,
                            death_year, death_subtick, death_date, death_alternative_year,
                            importance, color, timeline_id)
                        VALUES (@NewId, @name, @nicknames, @aliases, @race, @description, @notes,
                            @birth_year, @birth_subtick, @birth_date, @birth_alternative_year,
                            @death_year, @death_subtick, @death_date, @death_alternative_year,
                            @importance, @color, @NewTimelineId)",
                        new {
                            NewId = newCharId, ch.name, ch.nicknames, ch.aliases, ch.race,
                            ch.description, ch.notes, ch.birth_year, ch.birth_subtick, ch.birth_date,
                            ch.birth_alternative_year, ch.death_year, ch.death_subtick, ch.death_date,
                            ch.death_alternative_year, ch.importance, ch.color, NewTimelineId = newId
                        }, tx);
                }

                // 4. Clone items, track old→new ID map
                var items = db.Query("SELECT * FROM items WHERE timeline_id = @Id", new { Id = originalId }, tx).ToList();
                var itemMap = new Dictionary<string, string>();
                foreach (var item in items)
                {
                    string newItemId = Guid.NewGuid().ToString();
                    itemMap[(string)item.id] = newItemId;
                    db.Execute(@"
                        INSERT INTO items (id, title, description, content, story_id, type_id,
                            year, subtick, original_subtick, end_year, end_subtick, original_end_subtick,
                            absolute_start, absolute_end, book_title, chapter, page, color,
                            creation_granularity, timeline_id, item_index, show_in_notes, importance, min_lod_level)
                        VALUES (@NewId, @title, @description, @content, @story_id, @type_id,
                            @year, @subtick, @original_subtick, @end_year, @end_subtick, @original_end_subtick,
                            @absolute_start, @absolute_end, @book_title, @chapter, @page, @color,
                            @creation_granularity, @NewTimelineId, @item_index, @show_in_notes, @importance, @min_lod_level)",
                        new {
                            NewId = newItemId, item.title, item.description, item.content, item.story_id,
                            item.type_id, item.year, item.subtick, item.original_subtick, item.end_year,
                            item.end_subtick, item.original_end_subtick, item.absolute_start, item.absolute_end,
                            item.book_title, item.chapter, item.page, item.color, item.creation_granularity,
                            NewTimelineId = newId, item.item_index, item.show_in_notes, item.importance, item.min_lod_level
                        }, tx);
                }

                // 5. Clone junctions (tags, character appearances, story refs, chapters)
                foreach (var (oldItemId, newItemId) in itemMap)
                {
                    var tags = db.Query("SELECT tag_id FROM item_tags WHERE item_id = @Id", new { Id = oldItemId }, tx);
                    foreach (var t in tags)
                        db.Execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (@ItemId, @TagId)",
                            new { ItemId = newItemId, t.tag_id }, tx);

                    var appearances = db.Query("SELECT character_id, role FROM item_character_appearances WHERE item_id = @Id", new { Id = oldItemId }, tx);
                    foreach (var a in appearances)
                    {
                        string newCharId = charMap.TryGetValue((string)a.character_id, out var mapped) ? mapped : (string)a.character_id;
                        db.Execute("INSERT OR IGNORE INTO item_character_appearances (item_id, character_id, role) VALUES (@ItemId, @CharId, @Role)",
                            new { ItemId = newItemId, CharId = newCharId, a.role }, tx);
                    }

                    var storyRefs = db.Query("SELECT story_id FROM item_story_refs WHERE item_id = @Id", new { Id = oldItemId }, tx);
                    foreach (var s in storyRefs)
                        db.Execute("INSERT OR IGNORE INTO item_story_refs (item_id, story_id) VALUES (@ItemId, @StoryId)",
                            new { ItemId = newItemId, s.story_id }, tx);

                    var chapters = db.Query("SELECT chapter_id FROM item_chapters WHERE item_id = @Id", new { Id = oldItemId }, tx);
                    foreach (var c in chapters)
                        db.Execute("INSERT OR IGNORE INTO item_chapters (item_id, chapter_id) VALUES (@ItemId, @ChapterId)",
                            new { ItemId = newItemId, c.chapter_id }, tx);
                }

                // 6. Clone notes
                var notes = db.Query("SELECT * FROM notes WHERE timeline_id = @Id", new { Id = originalId }, tx);
                foreach (var note in notes)
                {
                    string? newConnectedId = null;
                    string? rawConnectedId = (string?)note.connected_item_id;
                    if (rawConnectedId != null)
                        itemMap.TryGetValue(rawConnectedId, out newConnectedId);
                    db.Execute(@"
                        INSERT INTO notes (id, note_contents, timeline_id, connected_item_id, nearest_year)
                        VALUES (@Id, @NoteContents, @TimelineId, @ConnectedItemId, @NearestYear)",
                        new { Id = Guid.NewGuid().ToString(), NoteContents = note.note_contents, TimelineId = newId, ConnectedItemId = newConnectedId, note.nearest_year }, tx);
                }


                tx.Commit();
                return newId;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }
}

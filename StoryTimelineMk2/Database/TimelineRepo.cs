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
            var q = db.QuerySingle<int>("SELECT COUNT(*) FROM timelines WHERE title = @Title", new { Title = title });
            return q > 0;
        }

        public int CreateTimeline(string title, string author = "", string? calendarId = null)
        {
            if (CheckIfTimelineTitleExists(title)) { return -1; }

            using var db = new SqliteConnection(_connString);

            string color = GenerateRandomColor();
            string effectiveCalendarId = string.IsNullOrEmpty(calendarId) ? "cal_default_gregorian" : calendarId;

            TimelineInfo timelineInfo = new TimelineInfo()
            {
                Title = title,
                StartYear = 0,
                Description = "",
                Author = author
            };

            string sql = @"INSERT INTO timelines (title, author, description, start_year, color, calendar_id)
                            VALUES (@Title, @Author, @Description, @StartYear, @Color, @CalendarId)";
            db.Execute(sql, new { timelineInfo.Title, timelineInfo.Author, timelineInfo.Description, timelineInfo.StartYear, Color = color, CalendarId = effectiveCalendarId });

            var q = db.QuerySingle<int>("SELECT max(id) FROM timelines;");
            return q;
        }

        private static string GenerateRandomColor()
        {
            double h = Random.Shared.NextDouble() * 360.0;
            double s = 0.50 + Random.Shared.NextDouble() * 0.20; // 50–70%
            double l = 0.45 + Random.Shared.NextDouble() * 0.15; // 45–60%
            var (r, g, b) = HslToRgb(h, s, l);
            return $"#{r:X2}{g:X2}{b:X2}";
        }

        private static (int r, int g, int b) HslToRgb(double h, double s, double l)
        {
            double q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            double p = 2 * l - q;
            int r = (int)Math.Round(HueToRgb(p, q, h / 360.0 + 1.0 / 3.0) * 255);
            int g = (int)Math.Round(HueToRgb(p, q, h / 360.0)              * 255);
            int b = (int)Math.Round(HueToRgb(p, q, h / 360.0 - 1.0 / 3.0) * 255);
            return (r, g, b);
        }

        private static double HueToRgb(double p, double q, double t)
        {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1.0 / 6.0) return p + (q - p) * 6 * t;
            if (t < 1.0 / 2.0) return q;
            if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6;
            return p;
        }

        public IEnumerable<TimelineInfo> GetAll()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TimelineInfo>("SELECT * FROM timelines ORDER BY title;");
        }

        public TimelineInfo GetTimelineById(int id)
        {
            using var db = new SqliteConnection(_connString);
            var TL = db.QueryFirst<TimelineInfo>("SELECT * FROM timelines WHERE id = @Id LIMIT 1", new { Id = id });
            var cal = new CalendarRepo().GetCalendarById(TL.CalendarId);
            var set = new SettingsRepo().GetTimelineSettings(id);
            // When not manually locked, resolve to the built-in preset that matches the app theme.
            // When locked (user explicitly chose a preset), use the stored value.
            string effectivePresetId = TL.LayoutSettingsLocked == 0
                ? (AppConfig.Instance.ChromeTheme.IsDark() ? "ls_dark" : "ls_default")
                : TL.LayoutSettingsId;
            var ls = new LayoutSettingsRepo().GetById(effectivePresetId);
            TL.Calendar = cal;
            TL.Settings = set;
            TL.LayoutSettings = ls;
            return TL;
        }

        public void SaveTimeline(TimelineInfo timeline)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO timelines (id, title, author, description, start_year)
                VALUES (@Id, @Title, @Author, @Description, @StartYear)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    author = excluded.author,
                    description = excluded.description,
                    start_year = excluded.start_year,
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
            db.Execute("UPDATE timelines SET layout_settings_id = @PresetId, layout_settings_locked = 1 WHERE id = @Id",
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
                            birth_year, birth_date, birth_alternative_year,
                            death_year, death_date, death_alternative_year,
                            importance, color, timeline_id)
                        VALUES (@NewId, @name, @nicknames, @aliases, @race, @description, @notes,
                            @birth_year, @birth_date, @birth_alternative_year,
                            @death_year, @death_date, @death_alternative_year,
                            @importance, @color, @NewTimelineId)",
                        new {
                            NewId = newCharId, ch.name, ch.nicknames, ch.aliases, ch.race,
                            ch.description, ch.notes, ch.birth_year, ch.birth_date,
                            ch.birth_alternative_year, ch.death_year, ch.death_date,
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
                            year, end_year, absolute_start, absolute_end,
                            book_title, chapter, page, color,
                            creation_granularity, timeline_id, item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask)
                        VALUES (@NewId, @title, @description, @content, @story_id, @type_id,
                            @year, @end_year, @absolute_start, @absolute_end,
                            @book_title, @chapter, @page, @color,
                            @creation_granularity, @NewTimelineId, @item_index, @show_in_notes, @importance, @min_lod_level, @lod_visibility_mask)",
                        new {
                            NewId = newItemId, item.title, item.description, item.content, item.story_id,
                            item.type_id, item.year, item.end_year, item.absolute_start, item.absolute_end,
                            item.book_title, item.chapter, item.page, item.color, item.creation_granularity,
                            NewTimelineId = newId, item.item_index, item.show_in_notes, item.importance, item.min_lod_level, item.lod_visibility_mask
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
                        INSERT INTO notes (id, note_contents, timeline_id, connected_item_id, nearest_year, absolute_time)
                        VALUES (@Id, @NoteContents, @TimelineId, @ConnectedItemId, @NearestYear, @AbsoluteTime)",
                        new { Id = Guid.NewGuid().ToString(), NoteContents = note.note_contents, TimelineId = newId, ConnectedItemId = newConnectedId, note.nearest_year, AbsoluteTime = note.absolute_time }, tx);
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

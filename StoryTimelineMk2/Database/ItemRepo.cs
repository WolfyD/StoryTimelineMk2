using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class ItemRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public ItemRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<TimelineItem> GetItemsByTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            // Fetch everything except characters (Type 7), which belong to CharacterRepo
            string sql = "SELECT * FROM items WHERE timeline_id = @TimelineId AND type_id != 7 ORDER BY absolute_start, item_index";
            return db.Query<TimelineItem>(sql, new { TimelineId = timelineId });
        }

        public void SaveItemWithTags(TimelineItem item, List<int> tagIds)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();

            try
            {
                // 1. Save or Update the Item
                string sql = @"
                    INSERT INTO items (
                        id, title, description, content, story_id, type_id,
                        year, end_year,
                        book_title, chapter, page, color, creation_granularity,
                        timeline_id, item_index, show_in_notes, importance
                    )
                    VALUES (
                        @Id, @Title, @Description, @Content, @StoryId, @TypeId,
                        @Year, @EndYear,
                        @BookTitle, @Chapter, @Page, @Color, @CreationGranularity,
                        @TimelineId, @ItemIndex, @ShowInNotes, @Importance
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        content = excluded.content,
                        story_id = excluded.story_id,
                        type_id = excluded.type_id,
                        year = excluded.year,
                        end_year = excluded.end_year,
                        book_title = excluded.book_title,
                        chapter = excluded.chapter,
                        page = excluded.page,
                        color = excluded.color,
                        item_index = excluded.item_index,
                        show_in_notes = excluded.show_in_notes,
                        importance = excluded.importance,
                        updated_at = CURRENT_TIMESTAMP;";

                db.Execute(sql, item, tx);

                // 2. Refresh Tags (Clear old, insert new)
                db.Execute("DELETE FROM item_tags WHERE item_id = @Id", new { item.Id }, tx);

                if (tagIds != null)
                {
                    foreach (var tagId in tagIds)
                    {
                        db.Execute("INSERT INTO item_tags (item_id, tag_id) VALUES (@ItemId, @TagId)",
                            new { ItemId = item.Id, TagId = tagId }, tx);
                    }
                }

                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public TimelineItem GetItemById(string id)
        {
            using var db = new SqliteConnection(_connString);
            return db.QueryFirstOrDefault<TimelineItem>("SELECT * FROM items WHERE id = @Id", new { Id = id });
        }

        public IEnumerable<TagItem> GetItemTags(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<TagItem>(@"
                SELECT t.* FROM tags t
                INNER JOIN item_tags it ON it.tag_id = t.id
                WHERE it.item_id = @ItemId ORDER BY t.name", new { ItemId = itemId });
        }

        public class ItemCharacterAppearanceRow
        {
            public string CharacterId { get; set; }
            public string CharacterName { get; set; }
            public string CharacterColor { get; set; }
            public string Role { get; set; }
        }

        public IEnumerable<ItemCharacterAppearanceRow> GetItemCharacterAppearances(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemCharacterAppearanceRow>(@"
                SELECT ica.character_id as CharacterId, c.name as CharacterName, c.color as CharacterColor, ica.role as Role
                FROM item_character_appearances ica
                INNER JOIN characters c ON c.id = ica.character_id
                WHERE ica.item_id = @ItemId", new { ItemId = itemId });
        }

        public class ItemStoryRefRow
        {
            public string StoryId { get; set; }
            public string StoryTitle { get; set; }
        }

        public IEnumerable<ItemStoryRefRow> GetItemStoryRefs(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemStoryRefRow>(@"
                SELECT isr.story_id as StoryId, s.title as StoryTitle
                FROM item_story_refs isr
                INNER JOIN stories s ON s.id = isr.story_id
                WHERE isr.item_id = @ItemId", new { ItemId = itemId });
        }

        public class ItemChapterRefRow
        {
            public string ChapterId { get; set; }
            public int ChapterNumber { get; set; }
            public string ChapterTitle { get; set; }
            public string BookId { get; set; }
            public string BookTitle { get; set; }
        }

        public IEnumerable<ItemChapterRefRow> GetItemChapterRefs(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemChapterRefRow>(@"
                SELECT ic.chapter_id as ChapterId, ch.number as ChapterNumber, ch.title as ChapterTitle,
                       b.id as BookId, b.title as BookTitle
                FROM item_chapters ic
                INNER JOIN chapters ch ON ch.id = ic.chapter_id
                INNER JOIN books b ON b.id = ch.book_id
                WHERE ic.item_id = @ItemId ORDER BY b.title, ch.number", new { ItemId = itemId });
        }

        public class CharacterAppearanceInput
        {
            public string CharacterId { get; set; }
            public string Role { get; set; }
        }

        public string SaveItemFull(TimelineItem item, List<string> tagNames,
            List<CharacterAppearanceInput> characterAppearances,
            List<string> storyIds, List<string> chapterIds)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();

            try
            {
                string sql = @"
                    INSERT INTO items (
                        id, title, description, content, story_id, type_id,
                        year, end_year,
                        absolute_start, absolute_end,
                        book_title, chapter, page, color, creation_granularity,
                        timeline_id, item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask
                    )
                    VALUES (
                        @Id, @Title, @Description, @Content, @StoryId, @TypeId,
                        @Year, @EndYear,
                        @AbsoluteStart, @AbsoluteEnd,
                        @BookTitle, @Chapter, @Page, @Color, @CreationGranularity,
                        @TimelineId, @ItemIndex, @ShowInNotes, @Importance, @MinLodLevel, @LodVisibilityMask
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title, description = excluded.description, content = excluded.content,
                        story_id = excluded.story_id, type_id = excluded.type_id,
                        year = excluded.year, end_year = excluded.end_year,
                        absolute_start = excluded.absolute_start, absolute_end = excluded.absolute_end,
                        book_title = excluded.book_title, chapter = excluded.chapter, page = excluded.page,
                        color = excluded.color, creation_granularity = excluded.creation_granularity,
                        item_index = excluded.item_index, show_in_notes = excluded.show_in_notes,
                        importance = excluded.importance, min_lod_level = excluded.min_lod_level,
                        lod_visibility_mask = excluded.lod_visibility_mask,
                        updated_at = CURRENT_TIMESTAMP;";

                db.Execute(sql, item, tx);

                // Tags: ensure exist in same transaction, then link
                db.Execute("DELETE FROM item_tags WHERE item_id = @Id", new { item.Id }, tx);
                foreach (var tagName in tagNames ?? new List<string>())
                {
                    var normalized = tagName.ToLowerInvariant().Trim();
                    if (string.IsNullOrEmpty(normalized)) continue;
                    db.Execute("INSERT OR IGNORE INTO tags (name) VALUES (@Name)", new { Name = normalized }, tx);
                    var tagId = db.QuerySingle<int>("SELECT id FROM tags WHERE name = @Name", new { Name = normalized }, tx);
                    db.Execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (@ItemId, @TagId)",
                        new { ItemId = item.Id, TagId = tagId }, tx);
                }

                // Character appearances
                db.Execute("DELETE FROM item_character_appearances WHERE item_id = @Id", new { item.Id }, tx);
                foreach (var appearance in characterAppearances ?? new List<CharacterAppearanceInput>())
                {
                    db.Execute(@"INSERT OR IGNORE INTO item_character_appearances (item_id, character_id, role)
                        VALUES (@ItemId, @CharacterId, @Role)",
                        new { ItemId = item.Id, appearance.CharacterId, appearance.Role }, tx);
                }

                // Story refs
                db.Execute("DELETE FROM item_story_refs WHERE item_id = @Id", new { item.Id }, tx);
                foreach (var storyId in storyIds ?? new List<string>())
                {
                    db.Execute("INSERT OR IGNORE INTO item_story_refs (item_id, story_id) VALUES (@ItemId, @StoryId)",
                        new { ItemId = item.Id, StoryId = storyId }, tx);
                }

                // Chapter refs
                db.Execute("DELETE FROM item_chapters WHERE item_id = @Id", new { item.Id }, tx);
                foreach (var chapterId in chapterIds ?? new List<string>())
                {
                    db.Execute("INSERT OR IGNORE INTO item_chapters (item_id, chapter_id) VALUES (@ItemId, @ChapterId)",
                        new { ItemId = item.Id, ChapterId = chapterId }, tx);
                }

                tx.Commit();
                return item.Id;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public void DeleteItem(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM items WHERE id = @Id", new { Id = id });
        }
    }
}

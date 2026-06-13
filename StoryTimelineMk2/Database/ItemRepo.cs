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
            string sql = "SELECT * FROM items WHERE timeline_id = @TimelineId AND type_id != 7 ORDER BY year, subtick, item_index";
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
                        year, subtick, original_subtick, end_year, end_subtick, original_end_subtick,
                        book_title, chapter, page, color, creation_granularity, 
                        timeline_id, item_index, show_in_notes, importance
                    ) 
                    VALUES (
                        @Id, @Title, @Description, @Content, @StoryId, @TypeId,
                        @Year, @Subtick, @OriginalSubtick, @EndYear, @EndSubtick, @OriginalEndSubtick,
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
                        subtick = excluded.subtick,
                        end_year = excluded.end_year,
                        end_subtick = excluded.end_subtick,
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

        public void DeleteItem(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM items WHERE id = @Id", new { Id = id });
        }
    }
}

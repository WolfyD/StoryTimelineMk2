using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
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
            // Type 7 used to be excluded as a leftover of v1's character cards. BL-15 phase 2 gave
            // it a job: the birth and death items a character owns. They are ordinary items now.
            // The join is only for type 7: the canvas needs the owning character's disc-fill flag, and
            // asking per item would be one bridge round trip per character on the screen.
            // ponytail: an OR join has no index to use, but `characters` is dozens of rows. If a
            // timeline ever holds thousands, give items a character_id column and join on that.
            string sql = @"
                SELECT i.*, COALESCE(c.use_highlight_color, 0) AS use_highlight_color
                FROM items i
                LEFT JOIN characters c ON i.type_id = 7 AND (c.birth_item_id = i.id OR c.death_item_id = i.id)
                WHERE i.timeline_id = @TimelineId
                ORDER BY i.absolute_start, i.item_index";
            return db.Query<TimelineItem>(sql, new { TimelineId = timelineId });
        }

        public IEnumerable<TimelineItem> GetItemsByYear(int timelineId, int year)
        {
            using var db = new SqliteConnection(_connString);
            string sql = "SELECT * FROM items WHERE timeline_id = @TimelineId AND year = @Year ORDER BY absolute_start, item_index";
            return db.Query<TimelineItem>(sql, new { TimelineId = timelineId, Year = year });
        }

        public TimelineItem GetItemById(string id)
        {
            using var db = new SqliteConnection(_connString);
            return db.QueryFirstOrDefault<TimelineItem>("SELECT * FROM items WHERE id = @Id", new { Id = id })!;
        }

        public IEnumerable<ItemTagLink> GetAllItemTagsForTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemTagLink>(@"
                SELECT it.item_id AS ItemId, t.id AS TagId, t.name AS TagName
                FROM item_tags it
                INNER JOIN tags t ON t.id = it.tag_id
                INNER JOIN items i ON i.id = it.item_id
                WHERE i.timeline_id = @TimelineId
                ORDER BY t.name", new { TimelineId = timelineId });
        }

        public IEnumerable<ItemCharacterLink> GetAllItemCharactersForTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemCharacterLink>(@"
                SELECT ica.item_id AS ItemId, ica.character_id AS CharacterId,
                       c.name AS CharacterName, c.color AS CharacterColor
                FROM item_character_appearances ica
                INNER JOIN characters c ON c.id = ica.character_id
                INNER JOIN items i ON i.id = ica.item_id
                WHERE i.timeline_id = @TimelineId", new { TimelineId = timelineId });
        }

        /// <summary>
        /// Characters the user took off this item. The matcher reads this before it attaches anyone,
        /// so a detected link that was deleted does not come back on the next blur.
        /// </summary>
        public IEnumerable<string> GetDismissedCharacters(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<string>(
                "SELECT character_id FROM character_link_dismissals WHERE item_id = @ItemId",
                new { ItemId = itemId });
        }

        /// <summary>Remembers that the user took a character off an item.</summary>
        public void DismissCharacterLink(string itemId, string characterId)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute(@"INSERT OR IGNORE INTO character_link_dismissals (item_id, character_id)
                         VALUES (@ItemId, @CharacterId)",
                new { ItemId = itemId, CharacterId = characterId });
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
            public string CharacterId { get; set; } = null!;
            public string CharacterName { get; set; } = null!;
            public string CharacterColor { get; set; } = null!;
            public string Role { get; set; } = null!;
            public bool AutoDetected { get; set; }
        }

        public IEnumerable<ItemCharacterAppearanceRow> GetItemCharacterAppearances(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemCharacterAppearanceRow>(@"
                SELECT ica.character_id as CharacterId, c.name as CharacterName, c.color as CharacterColor,
                       ica.role as Role, ica.auto_detected as AutoDetected
                FROM item_character_appearances ica
                INNER JOIN characters c ON c.id = ica.character_id
                WHERE ica.item_id = @ItemId", new { ItemId = itemId });
        }

        public class ItemStoryRefRow
        {
            public string StoryId { get; set; } = null!;
            public string StoryTitle { get; set; } = null!;
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
            public string ChapterId { get; set; } = null!;
            public int ChapterNumber { get; set; }
            public string ChapterTitle { get; set; } = null!;
            public string BookId { get; set; } = null!;
            public string BookTitle { get; set; } = null!;
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

        /// <summary>
        /// Side for a new item: whichever of above/below is emptier among its nearest neighbours, so items
        /// added later still interleave with what is already there. Periods and non-periods balance separately
        /// because they stack in different bands.
        /// </summary>
        private static int PickSide(SqliteConnection db, SqliteTransaction tx, TimelineItem item)
        {
            // ponytail: nearest 6 by start; make it overlap-aware if long periods pile up on one side.
            var sides = db.Query<int>(@"
                SELECT placement FROM items
                WHERE timeline_id = @TimelineId AND id <> @Id AND placement IN (1, 2) AND (type_id = 2) = (@TypeId = 2)
                ORDER BY ABS(absolute_start - @AbsoluteStart) LIMIT 6", item, tx).ToList();
            int above = sides.Count(s => s == 1), below = sides.Count - above;
            if (above != below) return above < below ? 1 : 2;
            return sides.Count == 0 || sides[0] == 2 ? 1 : 2;   // tie: opposite of the nearest neighbour
        }

        public class CharacterAppearanceInput
        {
            public string CharacterId { get; set; } = null!;
            public string Role { get; set; } = null!;
            /// <summary>The matcher attached this one, not the user (BL-15 phase 2).</summary>
            public bool AutoDetected { get; set; }
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
                // 0 = Auto: pick the emptier side now — new items, and items the user set back to Auto.
                if (item.Placement == 0 && item.TypeId is not (3 or 6 or 8 or 9))
                    item.Placement = PickSide(db, tx, item);

                string sql = @"
                    INSERT INTO items (
                        id, title, description, content, story_id, type_id,
                        year, end_year,
                        absolute_start, absolute_end,
                        book_title, chapter, page, color, creation_granularity,
                        timeline_id, item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask, placement, centered, show_title, item_notes
                    )
                    VALUES (
                        @Id, @Title, @Description, @Content, @StoryId, @TypeId,
                        @Year, @EndYear,
                        @AbsoluteStart, @AbsoluteEnd,
                        @BookTitle, @Chapter, @Page, @Color, @CreationGranularity,
                        @TimelineId, @ItemIndex, @ShowInNotes, @Importance, @MinLodLevel, @LodVisibilityMask, @Placement, @Centered, @ShowTitle, @ItemNotes
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
                        lod_visibility_mask = excluded.lod_visibility_mask, placement = excluded.placement,
                        centered = excluded.centered, show_title = excluded.show_title, item_notes = excluded.item_notes,
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
                    db.Execute(@"INSERT OR IGNORE INTO item_character_appearances (item_id, character_id, role, auto_detected)
                        VALUES (@ItemId, @CharacterId, @Role, @AutoDetected)",
                        new { ItemId = item.Id, appearance.CharacterId, appearance.Role, appearance.AutoDetected }, tx);

                    // Attaching someone by hand takes back an earlier dismissal, so the matcher is
                    // free to find them again later.
                    if (!appearance.AutoDetected)
                        db.Execute(@"DELETE FROM character_link_dismissals
                                     WHERE item_id = @ItemId AND character_id = @CharacterId",
                            new { ItemId = item.Id, appearance.CharacterId }, tx);
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

        public IEnumerable<ItemStoryRefLink> GetAllItemStoryRefsForTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemStoryRefLink>(@"
                SELECT isr.item_id AS ItemId, isr.story_id AS StoryId, s.title AS StoryTitle
                FROM item_story_refs isr
                INNER JOIN stories s ON s.id = isr.story_id
                INNER JOIN items i ON i.id = isr.item_id
                WHERE i.timeline_id = @TimelineId", new { TimelineId = timelineId });
        }

        public IEnumerable<string> GetItemsWithPicturesForTimeline(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<string>(@"
                SELECT DISTINCT ip.item_id
                FROM item_pictures ip
                INNER JOIN items i ON i.id = ip.item_id
                WHERE i.timeline_id = @TimelineId", new { TimelineId = timelineId });
        }

        public void VacuumInto(string destPath)
        {
            if (File.Exists(destPath))
                File.Delete(destPath);
            using var db = new SqliteConnection(_connString);
            db.Open();
            // VACUUM INTO does not reliably support parameter binding; escape manually
            var safeDest = destPath.Replace("'", "''");
            db.Execute($"VACUUM INTO '{safeDest}'");
        }

        public class ItemSaveLinks
        {
            public List<ItemTagLink> Tags { get; set; } = new();
            public List<ItemCharacterLink> Characters { get; set; } = new();
            public List<ItemStoryRefLink> StoryRefs { get; set; } = new();
            public bool HasPicture { get; set; }
        }

        public ItemSaveLinks GetItemLinksById(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();

            var tags = db.Query<ItemTagLink>(@"
                SELECT it.item_id AS ItemId, t.id AS TagId, t.name AS TagName
                FROM item_tags it
                INNER JOIN tags t ON t.id = it.tag_id
                WHERE it.item_id = @ItemId
                ORDER BY t.name", new { ItemId = itemId });

            var characters = db.Query<ItemCharacterLink>(@"
                SELECT ica.item_id AS ItemId, ica.character_id AS CharacterId,
                       c.name AS CharacterName, c.color AS CharacterColor
                FROM item_character_appearances ica
                INNER JOIN characters c ON c.id = ica.character_id
                WHERE ica.item_id = @ItemId", new { ItemId = itemId });

            var storyRefs = db.Query<ItemStoryRefLink>(@"
                SELECT isr.item_id AS ItemId, isr.story_id AS StoryId, s.title AS StoryTitle
                FROM item_story_refs isr
                INNER JOIN stories s ON s.id = isr.story_id
                WHERE isr.item_id = @ItemId", new { ItemId = itemId });

            var hasPicture = db.ExecuteScalar<int>(
                "SELECT COUNT(1) FROM item_pictures WHERE item_id = @ItemId",
                new { ItemId = itemId }) > 0;

            return new ItemSaveLinks
            {
                Tags = tags.ToList(),
                Characters = characters.ToList(),
                StoryRefs = storyRefs.ToList(),
                HasPicture = hasPicture,
            };
        }

        public void DeleteItem(string id)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM items WHERE id = @Id", new { Id = id });
        }

        /// <summary>Overwrites the LOD visibility mask of every item of a timeline; returns the row count.</summary>
        public int SetLodMask(int timelineId, int mask)
        {
            using var db = new SqliteConnection(_connString);
            return db.Execute(@"
                UPDATE items
                SET lod_visibility_mask = @Mask, updated_at = CURRENT_TIMESTAMP
                WHERE timeline_id = @TimelineId",
                new { Mask = mask, TimelineId = timelineId });
        }

        public int ShiftItems(int timelineId, int deltaYears)
        {
            using var db = new SqliteConnection(_connString);
            return db.Execute(@"
                UPDATE items
                SET year             = year             + @Delta,
                    end_year         = end_year         + @Delta,
                    absolute_start   = absolute_start   + @Delta,
                    absolute_end     = absolute_end     + @Delta,
                    updated_at       = CURRENT_TIMESTAMP
                WHERE timeline_id = @TimelineId",
                new { Delta = deltaYears, TimelineId = timelineId });
        }
    }
}

using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2.Database
{
    public class ItemRepo
    {
        private readonly string _connString = DbInitializer.GetConnectionString();

        public ItemRepo()
        {
            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        /// <summary>
        /// BL-16: a character's birth and death items exist whether or not *Show on timeline* is
        /// ticked, so the place and description a writer puts on one survive the switch being
        /// flicked. Off means nothing draws them — not the canvas, not the notes panel, not the
        /// calendar — and the character window is the one way back to them. One condition, shared by
        /// every read that feeds a display, so a new screen cannot forget it. Requires the items
        /// table to be aliased <c>i</c>.
        /// </summary>
        internal const string ExcludeHiddenCharacterItems = @"
                AND NOT EXISTS (
                    SELECT 1 FROM characters hc
                    WHERE hc.show_on_timeline = 0
                      AND (hc.birth_item_id = i.id OR hc.death_item_id = i.id))";

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
                WHERE i.timeline_id = @TimelineId" + ExcludeHiddenCharacterItems + @"
                ORDER BY i.absolute_start, i.item_index";
            return db.Query<TimelineItem>(sql, new { TimelineId = timelineId });
        }

        public IEnumerable<TimelineItem> GetItemsByYear(int timelineId, int year)
        {
            using var db = new SqliteConnection(_connString);
            string sql = @"
                SELECT i.* FROM items i
                WHERE i.timeline_id = @TimelineId AND i.year = @Year" + ExcludeHiddenCharacterItems + @"
                ORDER BY i.absolute_start, i.item_index";
            return db.Query<TimelineItem>(sql, new { TimelineId = timelineId, Year = year });
        }

        public TimelineItem GetItemById(string id)
        {
            using var db = new SqliteConnection(_connString);
            return GetItemById(db, null, id)!;
        }

        /// <summary>The same read, on a connection and transaction the caller owns, so a save that has
        /// to look at the row it is about to overwrite sees it as the transaction left it.</summary>
        internal TimelineItem? GetItemById(SqliteConnection db, SqliteTransaction? tx, string id)
        {
            return db.QueryFirstOrDefault<TimelineItem>(
                "SELECT * FROM items WHERE id = @Id", new { Id = id }, tx);
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
            /// <summary>BL-16: named in the event, not there. Read so the editor can round-trip it.</summary>
            public bool MentionedOnly { get; set; }
        }

        public IEnumerable<ItemCharacterAppearanceRow> GetItemCharacterAppearances(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<ItemCharacterAppearanceRow>(@"
                SELECT ica.character_id as CharacterId, c.name as CharacterName, c.color as CharacterColor,
                       ica.role as Role, ica.auto_detected as AutoDetected,
                       ica.mentioned_only as MentionedOnly
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

            /// <summary>
            /// BL-16: named in the event, but not there. Movement paths read a character's appearances
            /// in time order and take each event's place as a point, so these are skipped — otherwise
            /// being talked about would teleport people across the map. It rides on the input DTO
            /// because <see cref="SaveItemFull"/> deletes and reinserts every appearance row, so a flag
            /// that is not carried through is a flag that is silently cleared on the next save.
            /// </summary>
            public bool MentionedOnly { get; set; }
        }

        /// <summary>Every link an item has, in the shape <see cref="SaveItemFull"/> takes them back in.</summary>
        internal class ItemLinkRows
        {
            public List<string> TagNames { get; set; } = new();
            public List<CharacterAppearanceInput> Appearances { get; set; } = new();
            public List<string> StoryIds { get; set; } = new();
            public List<string> ChapterIds { get; set; } = new();
        }

        /// <summary>
        /// The link rows of one item, read back so a caller that only means to rewrite some of the
        /// item's own columns can hand the rest of them to <see cref="SaveItemFull"/> unchanged — it
        /// deletes and reinserts every link table, so a list left out is a link deleted.
        /// </summary>
        internal ItemLinkRows GetItemLinkRows(SqliteConnection db, SqliteTransaction tx, string itemId)
        {
            var arg = new { ItemId = itemId };
            return new ItemLinkRows
            {
                TagNames = db.Query<string>(@"
                    SELECT t.name FROM item_tags it
                    INNER JOIN tags t ON t.id = it.tag_id
                    WHERE it.item_id = @ItemId", arg, tx).ToList(),
                Appearances = db.Query<CharacterAppearanceInput>(@"
                    SELECT character_id AS CharacterId, role AS Role,
                           auto_detected AS AutoDetected, mentioned_only AS MentionedOnly
                    FROM item_character_appearances WHERE item_id = @ItemId", arg, tx).ToList(),
                StoryIds = db.Query<string>(
                    "SELECT story_id FROM item_story_refs WHERE item_id = @ItemId", arg, tx).ToList(),
                ChapterIds = db.Query<string>(
                    "SELECT chapter_id FROM item_chapters WHERE item_id = @ItemId", arg, tx).ToList(),
            };
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
                var id = SaveItemFull(db, tx, item, tagNames, characterAppearances, storyIds, chapterIds);
                tx.Commit();
                return id;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        /// <summary>
        /// The same save, on a connection and transaction the caller owns and commits.
        /// A SQLite transaction only covers the connection it was opened on, so a batch that has
        /// to be all-or-nothing — <see cref="SessionChanges.Apply"/> — must hand its own
        /// connection down instead of letting every save open one of its own.
        /// </summary>
        internal string SaveItemFull(SqliteConnection db, SqliteTransaction tx,
            TimelineItem item, List<string> tagNames,
            List<CharacterAppearanceInput> characterAppearances,
            List<string> storyIds, List<string> chapterIds)
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
                    timeline_id, item_index, show_in_notes, importance, min_lod_level, lod_visibility_mask, placement, centered, show_title, item_notes,
                    open_start, open_end, open_fade, location_id
                )
                VALUES (
                    @Id, @Title, @Description, @Content, @StoryId, @TypeId,
                    @Year, @EndYear,
                    @AbsoluteStart, @AbsoluteEnd,
                    @BookTitle, @Chapter, @Page, @Color, @CreationGranularity,
                    @TimelineId, @ItemIndex, @ShowInNotes, @Importance, @MinLodLevel, @LodVisibilityMask, @Placement, @Centered, @ShowTitle, @ItemNotes,
                    @OpenStart, @OpenEnd, @OpenFade, @LocationId
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
                    open_start = excluded.open_start, open_end = excluded.open_end,
                    open_fade = excluded.open_fade,
                    location_id = excluded.location_id,
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
                db.Execute(@"INSERT OR IGNORE INTO item_character_appearances (item_id, character_id, role, auto_detected, mentioned_only)
                    VALUES (@ItemId, @CharacterId, @Role, @AutoDetected, @MentionedOnly)",
                    new { ItemId = item.Id, appearance.CharacterId, appearance.Role, appearance.AutoDetected, appearance.MentionedOnly }, tx);

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

            return item.Id;
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
            // Parameterised, as in BackupService — which has been doing it this way on the
            // backup path all along, so the note that used to be here about binding not working
            // was not true.
            db.Execute("VACUUM INTO @path", new { path = destPath });
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

        /// <summary>Same delete, on a transaction the caller owns. See the overload of
        /// <see cref="SaveItemFull(SqliteConnection, SqliteTransaction, TimelineItem, List{string}, List{CharacterAppearanceInput}, List{string}, List{string})"/>.</summary>
        internal void DeleteItem(SqliteConnection db, SqliteTransaction tx, string id)
        {
            db.Execute("DELETE FROM items WHERE id = @Id", new { Id = id }, tx);
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

        /// <summary>BL-88: the Archive's bulk edit. A null field is left alone on every item.</summary>
        public sealed class BulkItemEdit
        {
            [JsonPropertyName("ids")]           public List<string> Ids           { get; set; } = new();
            [JsonPropertyName("importance")]    public int?         Importance    { get; set; }
            /// <summary>"" takes the colour off.</summary>
            [JsonPropertyName("color")]         public string?      Color         { get; set; }
            [JsonPropertyName("lodMask")]       public int?         LodMask       { get; set; }
            [JsonPropertyName("addTag")]        public string?      AddTag        { get; set; }
            [JsonPropertyName("removeTagId")]   public int?         RemoveTagId   { get; set; }
            [JsonPropertyName("addStoryId")]    public string?      AddStoryId    { get; set; }
            [JsonPropertyName("removeStoryId")] public string?      RemoveStoryId { get; set; }
        }

        /// <summary>
        /// One transaction over every item, so a failure halfway leaves none of them changed. Each row's
        /// updated_at moves, as a save's would. A character's birth and death items keep their colour:
        /// the character owns it, and the next character save would put it back anyway.
        /// </summary>
        public int BulkEdit(BulkItemEdit edit)
        {
            if (edit.Importance is < 1 or > 10)
                throw new ArgumentOutOfRangeException(nameof(edit), $"Importance {edit.Importance} is not between 1 and 10.");

            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();

            int? tagId = null;
            string tagName = edit.AddTag?.Trim().ToLowerInvariant() ?? "";
            if (tagName.Length > 0)
            {
                db.Execute("INSERT OR IGNORE INTO tags (name) VALUES (@tagName)", new { tagName }, tx);
                tagId = db.QuerySingle<int>("SELECT id FROM tags WHERE name = @tagName", new { tagName }, tx);
            }

            int affected = 0;
            foreach (string id in edit.Ids)
            {
                var arg = new
                {
                    Id = id, edit.Importance, edit.Color, edit.LodMask, TagId = tagId,
                    edit.RemoveTagId, edit.AddStoryId, edit.RemoveStoryId,
                };
                affected += db.Execute(@"
                    UPDATE items
                    SET importance          = COALESCE(@Importance, importance),
                        lod_visibility_mask = COALESCE(@LodMask, lod_visibility_mask),
                        color               = CASE WHEN @Color IS NULL OR type_id IN (7, 8, 9) THEN color ELSE @Color END,
                        updated_at          = CURRENT_TIMESTAMP
                    WHERE id = @Id", arg, tx);
                if (tagId != null)
                    db.Execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (@Id, @TagId)", arg, tx);
                if (edit.RemoveTagId != null)
                    db.Execute("DELETE FROM item_tags WHERE item_id = @Id AND tag_id = @RemoveTagId", arg, tx);
                if (edit.AddStoryId != null)
                    db.Execute("INSERT OR IGNORE INTO item_story_refs (item_id, story_id) VALUES (@Id, @AddStoryId)", arg, tx);
                if (edit.RemoveStoryId != null)
                    db.Execute("DELETE FROM item_story_refs WHERE item_id = @Id AND story_id = @RemoveStoryId", arg, tx);
            }

            tx.Commit();
            return affected;
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

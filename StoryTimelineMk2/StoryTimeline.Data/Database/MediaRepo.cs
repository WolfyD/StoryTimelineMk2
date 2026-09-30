using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using SkiaSharp;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class MediaRepo
    {
        private readonly string _connString;
        private readonly string _mediaFolder;
        private const int ThumbSize = 256;

        public MediaRepo()
        {
            _connString = DbInitializer.GetConnectionString();

            _mediaFolder = AppConfig.Instance.GetMediaFolder();
            Directory.CreateDirectory(Path.Combine(_mediaFolder, "thumbs"));

            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<MediaItem> GetAllMedia()
        {
            using var db = new SqliteConnection(_connString);
            return WithThumbs(db.Query<MediaItem>("SELECT * FROM pictures ORDER BY created_at DESC"));
        }

        /// <summary>
        /// BL-88, the Archive's Media tab. The library is shared by every timeline; this is the part
        /// of it a timeline uses — an item, a map or a portrait of its own shows it — plus whatever
        /// nothing uses at all, newest first, each with every use it has anywhere.
        /// </summary>
        public List<MediaItem> GetArchiveMedia(int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            var uses = db.Query<MediaUse>(@"
                SELECT ip.picture_id AS PictureId, 'item' AS Kind, i.id AS Id, i.title AS Name, i.type_id AS TypeId,
                       i.timeline_id = @Tl AS Here
                  FROM item_pictures ip JOIN items i ON i.id = ip.item_id
                UNION ALL
                SELECT m.picture_id, 'map', m.id, m.name, NULL, m.timeline_id = @Tl
                  FROM maps m WHERE m.picture_id IS NOT NULL
                UNION ALL
                SELECT c.portrait_picture_id, 'portrait', c.id, c.name, NULL, c.timeline_id = @Tl OR c.shared = 1
                  FROM characters c WHERE c.portrait_picture_id IS NOT NULL", new { Tl = timelineId })
                .ToLookup(u => u.PictureId);

            var listed = db.Query<MediaItem>("SELECT * FROM pictures ORDER BY created_at DESC")
                .Where(p =>
                {
                    p.Uses = uses[p.Id].ToList();
                    return p.Uses.Count == 0 || p.Uses.Any(u => u.Here);
                });
            return WithThumbs(listed);
        }

        public void SavePictureInfo(string id, string? title, string? description)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("UPDATE pictures SET title = @title, description = @description WHERE id = @id",
                new { id, title, description });
        }

        /// <summary>
        /// The items of <paramref name="timelineId"/> the canvas draws that carry the picture — the ones
        /// to push again once it is gone. A hidden character's birth or death item is left out: pushing
        /// it would put it on a canvas that deliberately does not show it.
        /// </summary>
        public List<string> ShownItemsUsing(string pictureId, int timelineId)
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<string>(@"
                SELECT i.id FROM item_pictures ip JOIN items i ON i.id = ip.item_id
                 WHERE ip.picture_id = @pictureId AND i.timeline_id = @timelineId" + ItemRepo.ExcludeHiddenCharacterItems,
                new { pictureId, timelineId }).AsList();
        }

        /// <summary>
        /// Points every row at its thumbnail, and at the original where there is not one yet.
        ///
        /// Missing thumbnails are built on a background thread rather than here. This used to
        /// decode and rescale inline, once per row — and a read of this repo runs on the bridge's
        /// data pump, which is a single chain for the whole process, so the first open of a large
        /// library from before thumbnails existed froze every window's traffic behind it. The
        /// first read is now quick and shows the originals; the next one has thumbs.
        /// </summary>
        private List<MediaItem> WithThumbs(IEnumerable<MediaItem> items)
        {
            var list = items.AsList();
            var missing = new List<MediaItem>();

            foreach (var m in list)
            {
                string rel = $"thumbs/{m.Id}.png";
                if (File.Exists(Path.Combine(_mediaFolder, rel)))
                {
                    m.ThumbPath = rel;
                    continue;
                }
                m.ThumbPath = m.FilePath;
                missing.Add(m);
            }

            if (missing.Count > 0) WarmThumbs(missing);
            return list;
        }

        /// <summary>Ids being written right now, so two overlapping reads do not race for one file.</summary>
        private static readonly ConcurrentDictionary<string, byte> _thumbsInFlight = new();

        /// <summary>
        /// ponytail: fire and forget, no progress and no notification — the gallery picks the
        /// thumbs up the next time it opens. Add a ThumbsReady push if they ever need to appear
        /// without reopening it.
        /// </summary>
        private void WarmThumbs(List<MediaItem> missing)
        {
            var work = missing.ToList();   // the caller's list is about to be serialized and reused
            _ = Task.Run(() =>
            {
                foreach (var m in work)
                {
                    if (!_thumbsInFlight.TryAdd(m.Id, 0)) continue;
                    try { MakeThumb(m); }
                    finally { _thumbsInFlight.TryRemove(m.Id, out _); }
                }
            });
        }

        /// <summary>
        /// Writes thumbs/{id}.png if it is not there already. Never throws: a picture that cannot
        /// be decoded is shown at full size instead, which is worse but not broken.
        /// </summary>
        private void MakeThumb(MediaItem m)
        {
            string thumbPath = Path.Combine(_mediaFolder, "thumbs", $"{m.Id}.png");
            try
            {
                if (!File.Exists(thumbPath)) WriteThumb(GetFullPath(m.FilePath), thumbPath);
            }
            catch (Exception ex)
            {
                Logger.Error("MediaRepo.MakeThumb", new InvalidOperationException($"Thumbnail for '{m.FilePath}' failed; using the original", ex));
            }
        }

        /// <summary>
        /// Points ThumbPath at thumbs/{id}.png, making it now if it does not exist. For the one
        /// image a caller is waiting on — an import — where the reply has to carry the thumb.
        /// Falls back to the original when it cannot be decoded.
        /// </summary>
        private void EnsureThumb(MediaItem m)
        {
            string rel = $"thumbs/{m.Id}.png";
            m.ThumbPath = m.FilePath;
            MakeThumb(m);
            if (File.Exists(Path.Combine(_mediaFolder, rel))) m.ThumbPath = rel;
        }

        internal static void WriteThumb(string sourcePath, string thumbPath)
            => WriteResized(sourcePath, thumbPath, ThumbSize, SKEncodedImageFormat.Png, 100);

        /// <summary>
        /// The most pixels we will ever ask the allocator for in one block — 96 megapixels, about
        /// 384 MB as BGRA, which is a ~9800px square. Thumbnails never came close, but a map image
        /// (BL-16) can be any size the writer's tool exported and "decode it, then scale it" is what
        /// falls over on a 20000px stitched panorama: 1.6 GB before the first resize. Past this the
        /// file is refused with an explanation rather than attempted — see <see cref="DecodeBounded"/>
        /// for why there is no smaller route.
        /// </summary>
        private const long DecodeBudgetPixels = 96L * 1024 * 1024;

        /// <summary>
        /// Writes <paramref name="sourcePath"/> to <paramref name="destPath"/> with its longest side
        /// capped at <paramref name="cap"/>, upright, aspect kept. Images already inside the cap are
        /// copied at their own size. Throws when the file cannot be decoded at all.
        /// </summary>
        /// <param name="budgetPixels">
        /// Overridable only so a test can reach the refusal with a small fixture instead of a 400 MB
        /// one; callers leave it alone.
        /// </param>
        internal static void WriteResized(string sourcePath, string destPath, int cap,
            SKEncodedImageFormat format, int quality, long budgetPixels = DecodeBudgetPixels)
        {
            string name = Path.GetFileName(sourcePath);
            using var codec = SKCodec.Create(sourcePath)
                ?? throw new InvalidOperationException($"No image decoder for '{name}'");

            // Honour EXIF orientation so the output matches what the browser shows for the original.
            // ponytail: the same three rotations GDI+ handled; mirrored origins stay as-is (vanishingly rare).
            var origin = codec.EncodedOrigin;
            bool quarterTurn = origin is SKEncodedOrigin.RightTop or SKEncodedOrigin.LeftBottom;
            int uprightW = quarterTurn ? codec.Info.Height : codec.Info.Width;
            int uprightH = quarterTurn ? codec.Info.Width : codec.Info.Height;

            double scale = Math.Min(1.0, (double)cap / Math.Max(uprightW, uprightH));
            int w = Math.Max(1, (int)Math.Round(uprightW * scale));
            int h = Math.Max(1, (int)Math.Round(uprightH * scale));

            using var src = DecodeBounded(codec, scale, budgetPixels, name);

            using var bmp = new SKBitmap(w, h, SKColorType.Bgra8888, SKAlphaType.Premul);
            using (var canvas = new SKCanvas(bmp))
            {
                canvas.Clear(SKColors.Transparent);
                switch (origin)
                {
                    case SKEncodedOrigin.BottomRight:                       // 180 degrees
                        canvas.Translate(w, h); canvas.RotateDegrees(180); break;
                    case SKEncodedOrigin.RightTop:                          // 90 degrees clockwise
                        canvas.Translate(w, 0); canvas.RotateDegrees(90); break;
                    case SKEncodedOrigin.LeftBottom:                        // 90 degrees anticlockwise
                        canvas.Translate(0, h); canvas.RotateDegrees(-90); break;
                }
                // After a quarter turn the destination box is measured in the rotated frame
                var dest = quarterTurn ? new SKRect(0, 0, h, w) : new SKRect(0, 0, w, h);
                using var img = SKImage.FromBitmap(src);
                canvas.DrawImage(img, dest, new SKSamplingOptions(SKCubicResampler.Mitchell));
            }

            using var data = bmp.Encode(format, quality);
            using var fs = File.Create(destPath);
            data.SaveTo(fs);
        }

        /// <summary>
        /// Decodes at or above the size the caller is about to scale to, refusing rather than asking
        /// the allocator for more than <paramref name="budgetPixels"/> in one block. JPEG and WebP
        /// scale as they decode, so their size here is the size being written and any upload is fine.
        /// PNG cannot, so a PNG arrives whole and a huge one is turned away with a message saying
        /// what to do about it.
        ///
        /// ponytail: no row-at-a-time fallback for the formats that cannot scale. Skia no longer
        /// implements scanline decoding for PNG (<c>StartScanlineDecode</c> answers
        /// <c>Unimplemented</c>) and incremental decoding needs the full destination allocated
        /// anyway, so short of writing a PNG decoder there is no bounded route — and "re-export as
        /// WebP" is a fix the writer can actually apply. Revisit if SkiaSharp ever exposes sampled
        /// decode (<c>SkAndroidCodec</c>).
        /// </summary>
        private static SKBitmap DecodeBounded(SKCodec codec, double scale, long budgetPixels, string name)
        {
            var offered = codec.GetScaledDimensions((float)scale);
            long pixels = (long)offered.Width * offered.Height;
            if (pixels > budgetPixels)
            {
                throw new InvalidOperationException(
                    $"'{name}' is {codec.Info.Width}x{codec.Info.Height} and its format cannot be scaled down while " +
                    $"it is read, so opening it would need {pixels * 4 / (1024 * 1024)} MB in one block. Re-export it " +
                    $"as WebP or JPEG — those open at any size — or keep it under about " +
                    $"{(int)Math.Sqrt(budgetPixels)}x{(int)Math.Sqrt(budgetPixels)}.");
            }

            return SKBitmap.Decode(codec,
                    new SKImageInfo(offered.Width, offered.Height, SKColorType.Bgra8888, SKAlphaType.Premul))
                ?? throw new InvalidOperationException($"Could not decode '{name}'");
        }

        /// <summary>
        /// Size as the picture is displayed, so a quarter-turn EXIF orientation comes back
        /// swapped — the same convention <see cref="WriteThumb"/> uses. (0, 0) when the file
        /// cannot be decoded: the columns existed and were written as zero for every image until
        /// now, so zero already means "unknown" to anything that reads them.
        /// Header only, no full decode.
        /// </summary>
        private static (int Width, int Height) ReadDimensions(string path)
        {
            try
            {
                using var codec = SKCodec.Create(path);
                if (codec == null) return (0, 0);
                bool quarterTurn = codec.EncodedOrigin is SKEncodedOrigin.RightTop or SKEncodedOrigin.LeftBottom;
                var info = codec.Info;
                return quarterTurn ? (info.Height, info.Width) : (info.Width, info.Height);
            }
            catch (Exception ex)
            {
                Logger.Error("MediaRepo.ReadDimensions", new InvalidOperationException($"Could not read the size of '{path}'", ex));
                return (0, 0);
            }
        }

        public MediaItem ImportAndSaveMedia(string sourceFilePath, string title, string description)
        {
            if (!File.Exists(sourceFilePath)) throw new FileNotFoundException("Source image not found.");

            string newId = Guid.NewGuid().ToString();
            string extension = Path.GetExtension(sourceFilePath);
            string newFileName = $"{newId}{extension}";
            string destinationPath = Path.Combine(_mediaFolder, newFileName);

            // 1. Physically copy the file to our safe local storage
            File.Copy(sourceFilePath, destinationPath, overwrite: true);
            var fileInfo = new FileInfo(destinationPath);

            // 2. Create the Database Record
            var (width, height) = ReadDimensions(destinationPath);
            var mediaItem = new MediaItem
            {
                Id = newId,
                FilePath = newFileName, // Filename only — full path resolved at runtime via AppConfig.GetMediaFolder()
                FileName = Path.GetFileName(sourceFilePath),
                FileSize = (int)fileInfo.Length,
                FileType = extension.Replace(".", ""),
                Width = width,
                Height = height,
                Title = title,
                Description = description
            };

            // 3. Save to SQLite
            using var db = new SqliteConnection(_connString);
            string sql = @"
                INSERT INTO pictures (id, file_path, file_name, file_size, file_type, width, height, title, description) 
                VALUES (@Id, @FilePath, @FileName, @FileSize, @FileType, @Width, @Height, @Title, @Description)";
            db.Execute(sql, mediaItem);

            EnsureThumb(mediaItem);
            return mediaItem; // Return to Vue so it can render the image immediately
        }

        public IEnumerable<MediaItem> GetItemPictures(string itemId)
        {
            using var db = new SqliteConnection(_connString);
            return WithThumbs(db.Query<MediaItem>(@"
                SELECT p.* FROM pictures p
                INNER JOIN item_pictures ip ON ip.picture_id = p.id
                WHERE ip.item_id = @ItemId
                ORDER BY p.created_at", new { ItemId = itemId }));
        }

        public void LinkPictureToItem(string pictureId, string itemId)
        {
            using var db = new SqliteConnection(_connString);
            LinkPictureToItem(db, null, pictureId, itemId);
        }

        /// <summary>
        /// The same link, on a connection and transaction the caller owns — <see cref="CharacterRepo.SaveCharacterFull"/>
        /// writes the generated items and their portrait links as one unit.
        /// </summary>
        internal static void LinkPictureToItem(SqliteConnection db, SqliteTransaction? tx, string pictureId, string itemId)
        {
            db.Execute("INSERT OR IGNORE INTO item_pictures (item_id, picture_id) VALUES (@itemId, @pictureId)",
                new { itemId, pictureId }, tx);
        }

        /// <summary>BL-88, the Archive Media tab's bulk edit: <see cref="Ids"/> are pictures.</summary>
        public class BulkMediaEdit
        {
            public List<string> Ids { get; set; } = new();
            /// <summary>An item to show every one of them, next to what it shows already.</summary>
            public string? AttachTo { get; set; }
            /// <summary>A timeline whose items stop showing them.</summary>
            public int? DetachFrom { get; set; }
        }

        /// <summary>
        /// One transaction. Taking pictures off a timeline's items leaves them in the library — nothing is
        /// pruned, the Archive's trash is the way to delete — and a character's birth or death item keeps
        /// its portrait, which the character owns.
        /// </summary>
        /// <returns>The items that changed, to be pushed to the canvas again.</returns>
        public List<string> BulkEdit(BulkMediaEdit edit)
        {
            using var db = new SqliteConnection(_connString);
            db.Open();
            using var tx = db.BeginTransaction();
            var touched = new List<string>();

            if (edit.AttachTo != null)
            {
                foreach (string id in edit.Ids) LinkPictureToItem(db, tx, id, edit.AttachTo);
                touched.Add(edit.AttachTo);
            }
            if (edit.DetachFrom is int timelineId)
            {
                var off = db.Query<string>(@"
                    SELECT DISTINCT i.id FROM item_pictures ip JOIN items i ON i.id = ip.item_id
                     WHERE ip.picture_id IN @Ids AND i.timeline_id = @timelineId AND i.type_id <> 7",
                    new { edit.Ids, timelineId }, tx).AsList();
                db.Execute("DELETE FROM item_pictures WHERE picture_id IN @Ids AND item_id IN @off",
                    new { edit.Ids, off }, tx);
                touched.AddRange(off);
            }

            tx.Commit();
            return touched;
        }

        public void UnlinkAndPruneImage(string pictureId, string itemId)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM item_pictures WHERE picture_id = @pictureId AND item_id = @itemId",
                new { pictureId, itemId });

            // Every other use counts, not just item links: the library picker offers map images and
            // portraits too, and pruning one of those took the map's or the character's picture with it.
            int remaining = db.QuerySingle<int>(@"
                SELECT (SELECT COUNT(*) FROM item_pictures WHERE picture_id = @Id)
                     + (SELECT COUNT(*) FROM maps WHERE picture_id = @Id)
                     + (SELECT COUNT(*) FROM characters WHERE portrait_picture_id = @Id)", new { Id = pictureId });
            if (remaining == 0)
                DeleteMedia(pictureId);
        }

        public string GetFullPath(string fileNameOrPath) => ResolvePath(fileNameOrPath);

        /// <summary>
        /// Media-folder-relative path to a real one, without needing a repo instance — the map views
        /// (BL-16) resolve the same way. Handles both legacy absolute paths and filename-only values.
        /// </summary>
        internal static string ResolvePath(string fileNameOrPath)
        {
            if (Path.IsPathRooted(fileNameOrPath)) return fileNameOrPath;
            return Path.Combine(AppConfig.Instance.GetMediaFolder(), fileNameOrPath);
        }

        public void DeleteMedia(string id)
        {
            using var db = new SqliteConnection(_connString);

            string? storedPath = db.QuerySingleOrDefault<string>("SELECT file_path FROM pictures WHERE id = @Id", new { Id = id });
            string? filePath = storedPath != null ? GetFullPath(storedPath) : null;

            // 1. Delete from SQLite, and every use with it. Spelled out rather than left to the foreign
            // keys: characters.portrait_picture_id has none, and a map left pointing at a missing row
            // draws nothing without saying why.
            db.Open();
            using (var tx = db.BeginTransaction())
            {
                db.Execute(@"
                    DELETE FROM item_pictures WHERE picture_id = @Id;
                    UPDATE maps SET picture_id = NULL WHERE picture_id = @Id;
                    UPDATE characters SET portrait_picture_id = NULL WHERE portrait_picture_id = @Id;
                    DELETE FROM pictures WHERE id = @Id;", new { Id = id }, tx);
                tx.Commit();
            }

            // 2. Delete physical files to save disk space.
            // The row goes first on purpose — the other order risks a row that points at a file
            // that is no longer there, which shows up as a broken picture. This way the worst
            // case is a file nothing references, which costs disk and nothing else.
            // Failing to delete must not be thrown, either: the delete the caller asked for has
            // already happened and succeeded, and reporting it as an error would be a lie. A
            // locked file (a viewer still holding it open) is the ordinary case here.
            TryDeleteFile(filePath);
            TryDeleteFile(Path.Combine(_mediaFolder, "thumbs", $"{id}.png"));
            foreach (string view in MapViews.FilesFor(id)) TryDeleteFile(view);   // BL-16
        }

        private static void TryDeleteFile(string? path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
            try
            {
                File.Delete(path);
            }
            catch (Exception ex)
            {
                Logger.Error("MediaRepo.DeleteMedia", new InvalidOperationException(
                    $"The database row is gone but '{path}' could not be deleted; it is now orphaned on disk", ex));
            }
        }
    }
}

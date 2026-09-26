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
        {
            string name = Path.GetFileName(sourcePath);
            using var codec = SKCodec.Create(sourcePath)
                ?? throw new InvalidOperationException($"No image decoder for '{name}'");
            using var src = SKBitmap.Decode(codec)
                ?? throw new InvalidOperationException($"Could not decode '{name}'");

            // Honour EXIF orientation so the thumb matches what the browser shows for the original.
            // ponytail: the same three rotations GDI+ handled; mirrored origins stay as-is (vanishingly rare).
            var origin = codec.EncodedOrigin;
            bool quarterTurn = origin is SKEncodedOrigin.RightTop or SKEncodedOrigin.LeftBottom;
            int uprightW = quarterTurn ? src.Height : src.Width;
            int uprightH = quarterTurn ? src.Width : src.Height;

            double scale = Math.Min(1.0, (double)ThumbSize / Math.Max(uprightW, uprightH));
            int w = Math.Max(1, (int)Math.Round(uprightW * scale));
            int h = Math.Max(1, (int)Math.Round(uprightH * scale));

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

            using var data = bmp.Encode(SKEncodedImageFormat.Png, 100);
            using var fs = File.Create(thumbPath);
            data.SaveTo(fs);
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

        public void UnlinkAndPruneImage(string pictureId, string itemId)
        {
            using var db = new SqliteConnection(_connString);
            db.Execute("DELETE FROM item_pictures WHERE picture_id = @pictureId AND item_id = @itemId",
                new { pictureId, itemId });

            int remaining = db.QuerySingle<int>(
                "SELECT COUNT(*) FROM item_pictures WHERE picture_id = @Id", new { Id = pictureId });
            if (remaining == 0)
                DeleteMedia(pictureId);
        }

        public string GetFullPath(string fileNameOrPath)
        {
            // Handles both legacy absolute paths and new filename-only values
            if (Path.IsPathRooted(fileNameOrPath)) return fileNameOrPath;
            return Path.Combine(_mediaFolder, fileNameOrPath);
        }

        public void DeleteMedia(string id)
        {
            using var db = new SqliteConnection(_connString);

            string? storedPath = db.QuerySingleOrDefault<string>("SELECT file_path FROM pictures WHERE id = @Id", new { Id = id });
            string? filePath = storedPath != null ? GetFullPath(storedPath) : null;

            // 1. Delete from SQLite (CASCADE removes item_pictures junctions)
            db.Execute("DELETE FROM pictures WHERE id = @Id", new { Id = id });

            // 2. Delete physical files to save disk space.
            // The row goes first on purpose — the other order risks a row that points at a file
            // that is no longer there, which shows up as a broken picture. This way the worst
            // case is a file nothing references, which costs disk and nothing else.
            // Failing to delete must not be thrown, either: the delete the caller asked for has
            // already happened and succeeded, and reporting it as an error would be a lie. A
            // locked file (a viewer still holding it open) is the ordinary case here.
            TryDeleteFile(filePath);
            TryDeleteFile(Path.Combine(_mediaFolder, "thumbs", $"{id}.png"));
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

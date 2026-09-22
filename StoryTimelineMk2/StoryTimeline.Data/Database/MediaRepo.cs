using Dapper;
using Microsoft.Data.Sqlite;
using System;
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

        private List<MediaItem> WithThumbs(IEnumerable<MediaItem> items)
        {
            var list = items.AsList();
            foreach (var m in list) EnsureThumb(m);
            return list;
        }

        /// <summary>
        /// Points ThumbPath at thumbs/{id}.png, generating it on first use (covers images imported
        /// before thumbnails existed). Falls back to the original when it cannot be decoded.
        /// </summary>
        private void EnsureThumb(MediaItem m)
        {
            string rel = $"thumbs/{m.Id}.png";
            string thumbPath = Path.Combine(_mediaFolder, rel);
            m.ThumbPath = m.FilePath;
            try
            {
                if (!File.Exists(thumbPath)) WriteThumb(GetFullPath(m.FilePath), thumbPath);
                m.ThumbPath = rel;
            }
            catch (Exception ex)
            {
                Logger.Error("MediaRepo.EnsureThumb", new InvalidOperationException($"Thumbnail for '{m.FilePath}' failed; using the original", ex));
            }
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
            var mediaItem = new MediaItem
            {
                Id = newId,
                FilePath = newFileName, // Filename only — full path resolved at runtime via AppConfig.GetMediaFolder()
                FileName = Path.GetFileName(sourceFilePath),
                FileSize = (int)fileInfo.Length,
                FileType = extension.Replace(".", ""),
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
            db.Execute("INSERT OR IGNORE INTO item_pictures (item_id, picture_id) VALUES (@itemId, @pictureId)",
                new { itemId, pictureId });
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

            // 2. Delete physical file to save disk space
            if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
            {
                File.Delete(filePath);
            }
            string thumbPath = Path.Combine(_mediaFolder, "thumbs", $"{id}.png");
            if (File.Exists(thumbPath)) File.Delete(thumbPath);
        }
    }
}

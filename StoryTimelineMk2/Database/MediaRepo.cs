using Dapper;
using Microsoft.Data.Sqlite;
using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class MediaRepo
    {
        private readonly string _connString;
        private readonly string _mediaFolder;

        public MediaRepo()
        {
            _connString = DbInitializer.GetConnectionString();

            // Ensure the physical media directory exists
            string dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryTimelineMk2_Data");
            _mediaFolder = Path.Combine(dataFolder, "Media");
            Directory.CreateDirectory(_mediaFolder);

            DefaultTypeMap.MatchNamesWithUnderscores = true;
        }

        public IEnumerable<MediaItem> GetAllMedia()
        {
            using var db = new SqliteConnection(_connString);
            return db.Query<MediaItem>("SELECT * FROM pictures ORDER BY created_at DESC");
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
                FilePath = destinationPath,
                FileName = Path.GetFileName(sourceFilePath), // Store original name for UI reference
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

            return mediaItem; // Return to Vue so it can render the image immediately
        }

        public void DeleteMedia(string id)
        {
            using var db = new SqliteConnection(_connString);

            // Get path before deleting record
            string filePath = db.QuerySingleOrDefault<string>("SELECT file_path FROM pictures WHERE id = @Id", new { Id = id });

            // 1. Delete from SQLite (CASCADE removes item_pictures junctions)
            db.Execute("DELETE FROM pictures WHERE id = @Id", new { Id = id });

            // 2. Delete physical file to save disk space
            if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
    }
}

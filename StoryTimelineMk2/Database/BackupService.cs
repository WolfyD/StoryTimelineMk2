using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database
{
    public class BackupInfo
    {
        public string   FileName  { get; set; } = "";
        public string   FullPath  { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public long     SizeBytes { get; set; }
        public bool     HasMedia  { get; set; }
    }

    public static class BackupService
    {
        private const int KeepCount = 20;

        public static string CreateBackup(bool includeMedia)
        {
            string folder    = AppConfig.Instance.GetBackupsFolder();
            Directory.CreateDirectory(folder);

            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string dbFile    = AppConfig.Instance.GetDbPath();

            if (includeMedia)
            {
                string zipPath = Path.Combine(folder, $"timeline_{timestamp}.stlm");
                using var zip  = ZipFile.Open(zipPath, ZipArchiveMode.Create);

                if (File.Exists(dbFile))
                    zip.CreateEntryFromFile(dbFile, "timeline.sqlite");

                string mediaFolder = AppConfig.Instance.GetMediaFolder();
                if (Directory.Exists(mediaFolder))
                    foreach (var file in Directory.GetFiles(mediaFolder, "*", SearchOption.AllDirectories))
                    {
                        string rel = Path.GetRelativePath(mediaFolder, file).Replace('\\', '/');
                        zip.CreateEntryFromFile(file, "Media/" + rel);
                    }

                return zipPath;
            }
            else
            {
                string sqlitePath = Path.Combine(folder, $"timeline_{timestamp}.sqlite");
                if (File.Exists(dbFile))
                {
                    using var conn = new SqliteConnection($"Data Source={dbFile}");
                    conn.Open();
                    conn.Execute($"VACUUM INTO '{sqlitePath}'");
                }
                return sqlitePath;
            }
        }

        public static void CheckAndAutoBackup()
        {
            var cfg = AppConfig.Instance;
            if (cfg.BackupInterval == "never") return;

            var  now  = DateTime.Now;
            var  last = cfg.LastAutoBackupAt;
            bool need = cfg.BackupInterval switch
            {
                "daily"  => last == null || (now - last.Value).TotalHours >= 24,
                "weekly" => last == null || (now - last.Value).TotalDays  >= 7,
                _        => false,
            };

            if (!need) return;

            try
            {
                CreateBackup(includeMedia: false);
                cfg.LastAutoBackupAt = now;
                cfg.Save();
                PruneOldBackups();
            }
            catch (Exception ex)
            {
                Logger.Error("AutoBackup", ex);
            }
        }

        public static void PruneOldBackups()
        {
            string folder = AppConfig.Instance.GetBackupsFolder();
            if (!Directory.Exists(folder)) return;

            var toDelete = Directory.GetFiles(folder)
                .Where(f => f.EndsWith(".sqlite", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".stlm",   StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(File.GetCreationTime)
                .Skip(KeepCount);

            foreach (var f in toDelete)
                try { File.Delete(f); } catch { /* best-effort */ }
        }

        public static List<BackupInfo> GetRecentBackups()
        {
            string folder = AppConfig.Instance.GetBackupsFolder();
            if (!Directory.Exists(folder)) return new();

            return Directory.GetFiles(folder)
                .Where(f => f.EndsWith(".sqlite", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".stlm",   StringComparison.OrdinalIgnoreCase))
                .Select(f => new BackupInfo
                {
                    FileName  = Path.GetFileName(f),
                    FullPath  = f,
                    CreatedAt = File.GetCreationTime(f),
                    SizeBytes = new FileInfo(f).Length,
                    HasMedia  = f.EndsWith(".stlm", StringComparison.OrdinalIgnoreCase),
                })
                .OrderByDescending(b => b.CreatedAt)
                .ToList();
        }
    }
}

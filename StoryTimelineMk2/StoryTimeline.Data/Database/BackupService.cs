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
        private const string PreMigrationPrefix = "pre v";

        public static string CreateBackup(bool includeMedia)
        {
            string folder    = AppConfig.Instance.GetBackupsFolder();
            Directory.CreateDirectory(folder);

            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string dbFile    = AppConfig.Instance.GetDbPath();

            if (includeMedia)
            {
                string zipPath = Path.Combine(folder, $"timeline_{timestamp}.stlm");
                WriteArchive(zipPath);
                return zipPath;
            }
            else
            {
                string sqlitePath = Path.Combine(folder, $"timeline_{timestamp}.sqlite");
                if (File.Exists(dbFile))
                {
                    using var conn = new SqliteConnection($"Data Source={dbFile}");
                    conn.Open();
                    conn.Execute("VACUUM INTO @path", new { path = sqlitePath });
                }
                return sqlitePath;
            }
        }

        /// <summary>
        /// Writes the database and the whole media folder — originals and the thumbs/ cache — into a
        /// .stlm, which is a plain zip with a custom extension. Shared by the manual backup and by
        /// "Export database" with media, so both produce a file <see cref="DatabaseImporter"/> reads back.
        /// </summary>
        public static void WriteArchive(string zipPath)
        {
            // VACUUM INTO rather than zipping the live file: a database with a -wal alongside it keeps
            // its newest rows there, and a copy of the main file alone would be missing them. Same
            // reason the .sqlite branch of CreateBackup uses it.
            string snapshot = Path.Combine(Path.GetTempPath(), $"stl_archive_{Guid.NewGuid():N}.sqlite");
            try
            {
                // FileMode.Create, not ZipFile.Open: the export dialog has already asked about
                // overwriting, and ZipArchiveMode.Create alone refuses an existing file.
                using (var fs  = new FileStream(zipPath, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    string dbFile = AppConfig.Instance.GetDbPath();
                    if (File.Exists(dbFile))
                    {
                        using (var conn = new SqliteConnection($"Data Source={dbFile}"))
                        {
                            conn.Open();
                            conn.Execute("VACUUM INTO @path", new { path = snapshot });
                        }
                        zip.CreateEntryFromFile(snapshot, ArchiveDbEntry);
                    }

                    string mediaFolder = AppConfig.Instance.GetMediaFolder();
                    if (Directory.Exists(mediaFolder))
                        foreach (var file in Directory.GetFiles(mediaFolder, "*", SearchOption.AllDirectories))
                        {
                            string rel = Path.GetRelativePath(mediaFolder, file).Replace('\\', '/');
                            zip.CreateEntryFromFile(file, MediaEntryPrefix + rel);
                        }
                }
            }
            finally
            {
                try { if (File.Exists(snapshot)) File.Delete(snapshot); } catch { /* best-effort */ }
            }
        }

        /// <summary>The database entry inside a .stlm. <see cref="DatabaseImporter"/> looks for exactly this name.</summary>
        internal const string ArchiveDbEntry = "timeline.sqlite";

        /// <summary>Folder prefix every media entry inside a .stlm carries, thumbs/ included.</summary>
        internal const string MediaEntryPrefix = "Media/";

        /// <summary>
        /// Verified snapshot taken by <see cref="Migrations.SchemaMigrator"/> right before schema migrations
        /// run on an out-of-date database. The copy is re-opened and checked (quick_check, user_version,
        /// table count) so a migration never starts on the strength of a backup that would not restore.
        /// Named for the user ("pre v1.0.1-v1.0.2 migration backup - ...") and exempt from pruning.
        /// </summary>
        public static string CreatePreMigrationBackup(SqliteConnection db, string fileName)
        {
            string folder = AppConfig.Instance.GetBackupsFolder();
            Directory.CreateDirectory(folder);
            string path = Path.Combine(folder, fileName);

            db.Execute("VACUUM INTO @path", new { path });
            try
            {
                VerifyBackup(path, db.ExecuteScalar<int>("PRAGMA user_version"),
                    db.ExecuteScalar<int>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'"));
            }
            catch
            {
                SqliteConnection.ClearAllPools();
                try { File.Delete(path); } catch { /* unverifiable copy; nothing to keep */ }
                throw;
            }
            Logger.Info("BackupService", $"Pre-migration backup written and verified: {path} ({new FileInfo(path).Length / 1024} KB)");
            return path;
        }

        /// <summary>Throws unless <paramref name="path"/> opens, passes quick_check and matches the expected version and table count.</summary>
        internal static void VerifyBackup(string path, int expectedVersion, int expectedTables)
        {
            using var copy = new SqliteConnection($"Data Source={path};Mode=ReadOnly;Pooling=False");
            copy.Open();
            string check   = Migrations.SchemaMigrator.QuickCheck(copy);
            int    version = copy.ExecuteScalar<int>("PRAGMA user_version");
            int    tables  = copy.ExecuteScalar<int>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'");
            if (check != "ok" || version != expectedVersion || tables != expectedTables)
                throw new InvalidOperationException(
                    $"Backup verification failed for {path}: quick_check = \"{check}\", " +
                    $"schema version {version} (expected {expectedVersion}), {tables} tables (expected {expectedTables}).");
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
                .Where(f => !Path.GetFileName(f).StartsWith(PreMigrationPrefix, StringComparison.OrdinalIgnoreCase))
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

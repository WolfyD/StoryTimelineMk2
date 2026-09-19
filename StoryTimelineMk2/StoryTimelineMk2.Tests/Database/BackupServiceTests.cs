using StoryTimelineMk2;
using StoryTimelineMk2.Database;
using Microsoft.Data.Sqlite;
using System.IO.Compression;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class BackupServiceTests
{
    // ── GetRecentBackups ──────────────────────────────────────────────────────

    [Fact]
    public void GetRecentBackups_ReturnsEmpty_WhenFolderDoesNotExist()
    {
        using var ctx = new DbTestContext();
        // backups/ folder was never created

        var list = BackupService.GetRecentBackups();

        Assert.Empty(list);
    }

    [Fact]
    public void GetRecentBackups_ReturnsSqliteBackup()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "timeline_20240101_120000.sqlite"), "fake");

        var list = BackupService.GetRecentBackups();

        Assert.Single(list);
        Assert.Equal("timeline_20240101_120000.sqlite", list[0].FileName);
    }

    [Fact]
    public void GetRecentBackups_ReturnsStlmBackup()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "timeline_20240101_120000.stlm"), "fake");

        var list = BackupService.GetRecentBackups();

        Assert.Single(list);
        Assert.Equal("timeline_20240101_120000.stlm", list[0].FileName);
    }

    [Fact]
    public void GetRecentBackups_SetsHasMedia_True_ForStlmFiles()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "backup.stlm"), "fake");

        var list = BackupService.GetRecentBackups();

        Assert.True(list[0].HasMedia);
    }

    [Fact]
    public void GetRecentBackups_SetsHasMedia_False_ForSqliteFiles()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "backup.sqlite"), "fake");

        var list = BackupService.GetRecentBackups();

        Assert.False(list[0].HasMedia);
    }

    [Fact]
    public void GetRecentBackups_IgnoresNonBackupFiles()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "notes.txt"), "not a backup");
        File.WriteAllText(Path.Combine(folder, "backup.sqlite"), "real backup");

        var list = BackupService.GetRecentBackups();

        Assert.Single(list);
        Assert.Equal("backup.sqlite", list[0].FileName);
    }

    [Fact]
    public void GetRecentBackups_OrdersNewestFirst()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);

        string older  = Path.Combine(folder, "older.sqlite");
        string newer  = Path.Combine(folder, "newer.sqlite");
        File.WriteAllText(older, "old");
        File.SetCreationTime(older, DateTime.Now.AddDays(-5));
        File.WriteAllText(newer, "new");
        File.SetCreationTime(newer, DateTime.Now.AddDays(-1));

        var list = BackupService.GetRecentBackups();

        Assert.Equal("newer.sqlite", list[0].FileName);
        Assert.Equal("older.sqlite", list[1].FileName);
    }

    // ── CreateBackup ──────────────────────────────────────────────────────────

    [Fact]
    public void CreateBackup_WithoutMedia_CreatesSqliteFile()
    {
        using var ctx = new DbTestContext();

        string path = BackupService.CreateBackup(includeMedia: false);

        Assert.EndsWith(".sqlite", path.ToLowerInvariant());
    }

    [Fact]
    public void CreateBackup_WithoutMedia_FileExists()
    {
        using var ctx = new DbTestContext();

        string path = BackupService.CreateBackup(includeMedia: false);

        Assert.True(File.Exists(path));
    }

    [Fact]
    public void CreateBackup_WithMedia_CreatesStlmFile()
    {
        using var ctx = new DbTestContext();
        // Release pooled connections so ZipFile can open timeline.sqlite for reading
        SqliteConnection.ClearAllPools();

        string path = BackupService.CreateBackup(includeMedia: true);

        Assert.EndsWith(".stlm", path.ToLowerInvariant());
        Assert.True(File.Exists(path));
    }

    [Fact]
    public void CreateBackup_StlmContainsSqliteEntry()
    {
        using var ctx = new DbTestContext();
        SqliteConnection.ClearAllPools();

        string path = BackupService.CreateBackup(includeMedia: true);

        using var zip = ZipFile.OpenRead(path);
        Assert.Contains(zip.Entries, e => e.Name == "timeline.sqlite");
    }

    [Fact]
    public void CreateBackup_CreatesFolderIfNotExists()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        // Ensure folder does not exist before backup
        if (Directory.Exists(folder)) Directory.Delete(folder, true);

        BackupService.CreateBackup(includeMedia: false);

        Assert.True(Directory.Exists(folder));
    }

    [Fact]
    public void CreateBackup_SavesInsideBackupsFolder()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();

        string path = BackupService.CreateBackup(includeMedia: false);

        Assert.StartsWith(folder, path, StringComparison.OrdinalIgnoreCase);
    }

    // ── PruneOldBackups ───────────────────────────────────────────────────────

    [Fact]
    public void PruneOldBackups_DoesNotThrow_WhenFolderMissing()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        if (Directory.Exists(folder)) Directory.Delete(folder, true);

        // Should not throw
        var ex = Record.Exception(() => BackupService.PruneOldBackups());
        Assert.Null(ex);
    }

    [Fact]
    public void PruneOldBackups_KeepsAtMost20Files()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);

        // Create 25 sqlite files
        for (int i = 1; i <= 25; i++)
        {
            string f = Path.Combine(folder, $"backup_{i:D3}.sqlite");
            File.WriteAllText(f, "x");
            // Space creation times so ordering is deterministic
            File.SetCreationTime(f, DateTime.Now.AddHours(-i));
        }

        BackupService.PruneOldBackups();

        int remaining = Directory.GetFiles(folder, "*.sqlite").Length;
        Assert.Equal(20, remaining);
    }

    [Fact]
    public void PruneOldBackups_DeletesOldestFiles_KeepsNewest()
    {
        using var ctx = new DbTestContext();
        string folder = AppConfig.Instance.GetBackupsFolder();
        Directory.CreateDirectory(folder);

        // Create 21 files — newest first (hour offset 0 = newest)
        for (int i = 1; i <= 21; i++)
        {
            string f = Path.Combine(folder, $"backup_{i:D3}.sqlite");
            File.WriteAllText(f, "x");
            File.SetCreationTime(f, DateTime.Now.AddHours(-i));
        }

        BackupService.PruneOldBackups();

        // backup_021.sqlite (oldest, 21h ago) should be deleted
        Assert.False(File.Exists(Path.Combine(folder, "backup_021.sqlite")));
        // backup_001.sqlite (newest, 1h ago) should remain
        Assert.True(File.Exists(Path.Combine(folder, "backup_001.sqlite")));
    }

    // ── CheckAndAutoBackup ────────────────────────────────────────────────────

    private static readonly string ConfigPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "StoryTimelineMk2", "config.json");

    // CheckAndAutoBackup calls AppConfig.Save(), which writes the user's real config.json.
    // Snapshot the singleton fields and the file, and put both back afterwards.
    private static void WithAutoBackupConfig(string interval, int? lastBackupHoursAgo, Action body)
    {
        var cfg = AppConfig.Instance;
        string savedInterval = cfg.BackupInterval;
        DateTime? savedLast = cfg.LastAutoBackupAt;
        byte[]? savedFile = File.Exists(ConfigPath) ? File.ReadAllBytes(ConfigPath) : null;
        try
        {
            cfg.BackupInterval = interval;
            cfg.LastAutoBackupAt = lastBackupHoursAgo.HasValue ? DateTime.Now.AddHours(lastBackupHoursAgo.Value) : null;
            body();
        }
        finally
        {
            cfg.BackupInterval = savedInterval;
            cfg.LastAutoBackupAt = savedLast;
            if (savedFile != null) File.WriteAllBytes(ConfigPath, savedFile);
            else if (File.Exists(ConfigPath)) File.Delete(ConfigPath);
        }
    }

    private static int SqliteBackupCount()
    {
        string folder = AppConfig.Instance.GetBackupsFolder();
        return Directory.Exists(folder) ? Directory.GetFiles(folder, "*.sqlite").Length : 0;
    }

    [Theory]
    [InlineData("never", null)]
    [InlineData("daily", -1)]     // last backup 1 hour ago
    [InlineData("weekly", -72)]   // last backup 3 days ago
    public void CheckAndAutoBackup_DoesNothing_WhenNotDue(string interval, int? lastBackupHoursAgo)
    {
        using var ctx = new DbTestContext();
        WithAutoBackupConfig(interval, lastBackupHoursAgo, () =>
        {
            DateTime? before = AppConfig.Instance.LastAutoBackupAt;

            BackupService.CheckAndAutoBackup();

            Assert.Equal(0, SqliteBackupCount());
            Assert.Equal(before, AppConfig.Instance.LastAutoBackupAt);
        });
    }

    [Theory]
    [InlineData("daily", null)]        // never backed up
    [InlineData("daily", -25)]
    [InlineData("weekly", -8 * 24)]
    public void CheckAndAutoBackup_CreatesBackup_AndStampsTime_WhenDue(string interval, int? lastBackupHoursAgo)
    {
        using var ctx = new DbTestContext();
        WithAutoBackupConfig(interval, lastBackupHoursAgo, () =>
        {
            DateTime before = DateTime.Now.AddSeconds(-1);

            BackupService.CheckAndAutoBackup();

            Assert.Equal(1, SqliteBackupCount());
            Assert.NotNull(AppConfig.Instance.LastAutoBackupAt);
            Assert.True(AppConfig.Instance.LastAutoBackupAt >= before);
        });
    }
}

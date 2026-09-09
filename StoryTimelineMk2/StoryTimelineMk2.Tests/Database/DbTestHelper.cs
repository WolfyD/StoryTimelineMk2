using Microsoft.Data.Sqlite;
using Dapper;
using StoryTimelineMk2;
using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// Serialises all DB tests so they don't race on the AppConfig singleton.
/// </summary>
[CollectionDefinition("Database", DisableParallelization = true)]
public sealed class DatabaseCollection { }

/// <summary>
/// Spins up a temporary on-disk SQLite database in a per-test temp directory,
/// points AppConfig at it, initialises the schema, and tears it all down after
/// the test runs.
///
/// Because ItemRepo / MediaRepo / TimelineRepo capture _connString = DbInitializer.GetConnectionString()
/// at field-initialisation time, this context MUST be constructed before the repo
/// under test, and all DB tests must run serially (see DatabaseCollection).
/// </summary>
public sealed class DbTestContext : IDisposable
{
    public string TempDir { get; }
    public string DbPath { get; }

    public DbTestContext()
    {
        TempDir = Path.Combine(Path.GetTempPath(), "StoryTimelineTests_" + Guid.NewGuid());
        Directory.CreateDirectory(TempDir);

        // Point the AppConfig singleton at our temp dir BEFORE any repo is newed up.
        // AppConfig.GetDbPath() returns DataRoot/timeline.sqlite — match that exactly.
        AppConfig.Instance.DataRoot = TempDir;
        DbPath = AppConfig.Instance.GetDbPath(); // == TempDir/timeline.sqlite

        // Initialise the full schema + seed data in the temp DB
        DbInitializer.Initialize();

        DefaultTypeMap.MatchNamesWithUnderscores = true;
    }

    /// <summary>Open a fresh connection to the test database.</summary>
    public SqliteConnection OpenConnection()
    {
        var conn = new SqliteConnection($"Data Source={DbPath}");
        conn.Open();
        return conn;
    }

    public void Dispose()
    {
        try { Directory.Delete(TempDir, recursive: true); } catch { /* best-effort */ }
    }
}

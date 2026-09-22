using System.Diagnostics;
using Dapper;
using Microsoft.Data.Sqlite;

namespace StoryTimelineMk2.Database.Migrations
{
    /// <summary>
    /// One numbered schema step. <see cref="Up"/> runs inside a transaction that is committed
    /// together with the new <c>PRAGMA user_version</c>, so a step either fully applies or not at all.
    /// <see cref="AppVersion"/> is the app release whose schema this step produces; it is what the
    /// user sees in the pre-migration backup name.
    /// </summary>
    internal sealed record Migration(int Version, string Name, string AppVersion, Action<MigrationDb> Up);

    /// <summary>
    /// Connection + open transaction handed to a migration step. Every statement issued through it
    /// runs inside that transaction (Microsoft.Data.Sqlite refuses commands that omit an active one).
    /// </summary>
    internal sealed class MigrationDb
    {
        public SqliteConnection  Connection  { get; }
        public SqliteTransaction Transaction { get; }

        public MigrationDb(SqliteConnection connection, SqliteTransaction transaction)
        {
            Connection  = connection;
            Transaction = transaction;
        }

        public int            Execute(string sql, object? param = null)              => Connection.Execute(sql, param, Transaction);
        public T?             ExecuteScalar<T>(string sql, object? param = null)     => Connection.ExecuteScalar<T>(sql, param, Transaction);
        public IEnumerable<T> Query<T>(string sql, object? param = null)             => Connection.Query<T>(sql, param, Transaction);
        public T?             QueryFirstOrDefault<T>(string sql, object? param = null) => Connection.QueryFirstOrDefault<T>(sql, param, Transaction);
    }

    /// <summary>What an upgrade attempt was about; carried by <see cref="MigrationException"/> for the error report.</summary>
    internal sealed record MigrationInfo(string DbLabel, string DbPath, int FromVersion, int ToVersion, string FromAppVersion, string ToAppVersion);

    /// <summary>
    /// Any failure of <see cref="SchemaMigrator.Migrate"/>: version refusal, integrity check, backup or a step.
    /// <see cref="Stage"/> names where it stopped; <see cref="BackupPath"/> is set once the pre-migration
    /// backup exists. The message always states the state the database was left in.
    /// </summary>
    internal sealed class MigrationException : InvalidOperationException
    {
        public MigrationInfo Info       { get; }
        public string        Stage      { get; }
        public string?       BackupPath { get; }

        public MigrationException(MigrationInfo info, string stage, string? backupPath, string message, Exception? inner = null)
            : base(message, inner)
        {
            Info       = info;
            Stage      = stage;
            BackupPath = backupPath;
        }
    }

    /// <summary>
    /// Applies an ordered list of <see cref="Migration"/>s to a SQLite database, tracking progress in
    /// <c>PRAGMA user_version</c>. Databases written before versioning existed report 0 and replay
    /// the (idempotent) baseline step; databases stamped by a newer app are refused.
    /// </summary>
    internal static class SchemaMigrator
    {
        public static int GetVersion(SqliteConnection db) => db.ExecuteScalar<int>("PRAGMA user_version");

        public static bool IsBehind(SqliteConnection db, IReadOnlyList<Migration> steps) =>
            GetVersion(db) < steps[^1].Version;

        /// <summary>App release whose schema a database at <paramref name="version"/> carries (0 = pre-versioning = baseline's release).</summary>
        public static string AppVersionOf(IReadOnlyList<Migration> steps, int version) =>
            (steps.LastOrDefault(s => s.Version <= version) ?? steps[0]).AppVersion;

        /// <summary>"ok", or the problems <c>PRAGMA quick_check</c> reports, joined.</summary>
        public static string QuickCheck(SqliteConnection db) =>
            string.Join("; ", db.Query<string>("PRAGMA quick_check"));

        /// <summary>
        /// Brings the database up to the last step: refuses a newer file, checks integrity, writes a verified
        /// backup (when <paramref name="backupFirst"/> and the file already has data), then runs every missing
        /// step in its own transaction so an interrupted upgrade resumes from the last fully-applied version.
        /// Every failure surfaces as a <see cref="MigrationException"/>; nothing is changed before the backup exists.
        /// </summary>
        public static void Migrate(SqliteConnection db, string dbPath, IReadOnlyList<Migration> steps, string dbLabel,
                                   bool backupFirst, string backupSuffix = "")
        {
            int    latest  = steps[^1].Version;
            int    current = GetVersion(db);
            var    info    = new MigrationInfo(dbLabel, dbPath, current, latest, AppVersionOf(steps, current), UpdateChecker.CurrentVersion);
            string stage   = "version check";
            string? backupPath = null;

            Logger.Info("SchemaMigrator", $"{dbLabel} database {dbPath}: schema version {current} (app {info.FromAppVersion}); " +
                                          $"app {info.ToAppVersion} supports up to {latest}");
            try
            {
                if (current > latest)
                    throw new MigrationException(info, stage, null,
                        $"The {dbLabel} database was created by a newer version of Story Timeline " +
                        $"(schema version {current}; this version supports up to {latest}). " +
                        "Update the app to open it. The database was not changed.");

                if (current == latest) return;

                stage = "integrity check";
                string check = QuickCheck(db);
                if (check != "ok")
                    throw new MigrationException(info, stage, null,
                        $"The {dbLabel} database failed its integrity check before the upgrade, so nothing was changed: {check}");
                Logger.Info("SchemaMigrator", $"{dbLabel}: integrity check ok");

                bool hasTables = db.ExecuteScalar<int>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'") > 0;
                if (backupFirst && hasTables)
                {
                    stage = "pre-migration backup";
                    backupPath = BackupService.CreatePreMigrationBackup(db,
                        $"pre v{info.FromAppVersion}-v{info.ToAppVersion} migration backup{backupSuffix} - {DateTime.Now:yyyy-MM-dd HH-mm-ss}.sqlite");
                }

                foreach (var step in steps.Where(s => s.Version > current))
                {
                    stage = $"migration {step.Version} ({step.Name})";
                    Logger.Info("SchemaMigrator", $"{dbLabel}: applying {stage}");
                    var sw = Stopwatch.StartNew();
                    using var tx = db.BeginTransaction();
                    try
                    {
                        step.Up(new MigrationDb(db, tx));
                        db.Execute($"PRAGMA user_version = {step.Version}", transaction: tx);
                        tx.Commit();
                    }
                    catch (Exception ex)
                    {
                        tx.Rollback();
                        throw new MigrationException(info, stage, backupPath,
                            $"{dbLabel} database migration {step.Version} ({step.Name}) failed and was rolled back; " +
                            $"the database was left at schema version {GetVersion(db)}. {ex.Message}", ex);
                    }
                    Logger.Info("SchemaMigrator", $"{dbLabel}: applied {stage} in {sw.ElapsedMilliseconds} ms");
                }
                Logger.Info("SchemaMigrator", $"{dbLabel}: upgrade complete, schema version {latest}");
            }
            catch (Exception ex) when (ex is not MigrationException)
            {
                throw new MigrationException(info, stage, backupPath,
                    $"The {dbLabel} database upgrade failed during the {stage}; the database was not changed. {ex.Message}", ex);
            }
        }
    }
}

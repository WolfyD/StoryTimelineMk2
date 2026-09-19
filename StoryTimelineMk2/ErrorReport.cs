using System;
using System.Text;
using StoryTimelineMk2.Database.Migrations;

namespace StoryTimelineMk2
{
    /// <summary>
    /// Builds the plain-text report shown by <see cref="Forms.f_ErrorReport"/>: everything needed to
    /// diagnose a failure from a pasted message — app version, log path, what failed, and for database
    /// upgrades the schema versions, stage and backup location — followed by the full exception.
    /// </summary>
    public static class ErrorReport
    {
        public static string Build(string title, Exception ex)
        {
            var sb = new StringBuilder();
            sb.AppendLine("Story Timeline — error report");
            sb.AppendLine($"Time:        {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine($"App version: {UpdateChecker.CurrentVersion}");
            sb.AppendLine($"Log file:    {Logger.LogPath}");
            sb.AppendLine();
            sb.AppendLine(title);
            sb.AppendLine();
            if (ex is MigrationException m)
            {
                sb.AppendLine($"Database:       {m.Info.DbLabel} ({m.Info.DbPath})");
                sb.AppendLine($"Schema version: {m.Info.FromVersion} (app {m.Info.FromAppVersion}) → {m.Info.ToVersion} (app {m.Info.ToAppVersion})");
                sb.AppendLine($"Failed stage:   {m.Stage}");
                sb.AppendLine(m.BackupPath is null
                    ? "Backup:         none — the database was not modified"
                    : $"Backup:         {m.BackupPath}  (complete copy taken before the upgrade)");
                sb.AppendLine();
            }
            sb.AppendLine("Error:");
            sb.AppendLine(ex.ToString());
            return sb.ToString();
        }
    }
}

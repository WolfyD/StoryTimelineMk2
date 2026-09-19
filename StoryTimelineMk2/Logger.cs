using System;
using System.IO;

namespace StoryTimelineMk2
{
    /// <summary>
    /// Minimal append-only file logger. Project rule: all errors must be logged
    /// with full stack trace and shown to the user — Debug.WriteLine vanishes in
    /// Release builds, so error paths route through here instead.
    /// Log file: %LOCALAPPDATA%\StoryTimelineMk2_Data\logs\app.log
    /// </summary>
    public static class Logger
    {
        private static readonly object _lock = new object();
        private static string _logPath = null!;

        /// <summary>Full path of app.log — shown in error reports so users can find and send it.</summary>
        public static string LogPath
        {
            get
            {
                if (_logPath == null)
                {
                    var dir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "StoryTimelineMk2_Data", "logs");
                    Directory.CreateDirectory(dir);
                    _logPath = Path.Combine(dir, "app.log");
                }
                return _logPath;
            }
        }

        public static void Error(string context, Exception ex)
            => WriteLine($"ERROR [{context}] {ex}");

        public static void Error(string context, string message)
            => WriteLine($"ERROR [{context}] {message}");

        public static void Warn(string context, string message)
            => WriteLine($"WARN  [{context}] {message}");

        public static void Info(string context, string message)
            => WriteLine($"INFO  [{context}] {message}");

        private static void WriteLine(string line)
        {
            try
            {
                lock (_lock)
                {
                    File.AppendAllText(LogPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {line}{Environment.NewLine}");
                }
            }
            catch
            {
                // Logging must never crash the app; nothing sane to do if the
                // log file itself is unwritable.
            }
        }
    }
}

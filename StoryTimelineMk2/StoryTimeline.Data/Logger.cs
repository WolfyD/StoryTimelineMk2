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

        /// <summary>Roll the log once it passes this. A run that repeats a failure every frame can
        /// write a lot in a short time, and an unbounded log is a support problem of its own.</summary>
        private const long MaxBytes = 5 * 1024 * 1024;

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
                    Roll();
                    File.AppendAllText(LogPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {line}{Environment.NewLine}");
                }
            }
            catch
            {
                // Logging must never crash the app; nothing sane to do if the
                // log file itself is unwritable.
            }
        }

        /// <summary>
        /// Moves app.log aside to app.1.log once it passes <see cref="MaxBytes"/>.
        /// ponytail: one previous generation, not a numbered series — enough to still hold the
        /// session before the one being reported. Widen to app.N.log if a report ever needs more.
        /// Caller holds <see cref="_lock"/>; any failure here is swallowed by WriteLine's catch,
        /// which is the right outcome — a log that cannot roll should still try to append.
        /// </summary>
        private static void Roll()
        {
            var info = new FileInfo(LogPath);
            if (!info.Exists || info.Length < MaxBytes) return;
            File.Move(LogPath, Path.ChangeExtension(LogPath, ".1.log"), overwrite: true);
        }
    }
}

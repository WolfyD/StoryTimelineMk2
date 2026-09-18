namespace StoryTimelineInstaller.Services;

/// Test builds only: appends timestamped lines to log.txt next to the installer exe.
/// Normal builds never touch the disk (FilePath is null).
public static class InstallerLog
{
    public static readonly string? FilePath = InstallerContext.IsTestBuild
        ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "log.txt")
        : null;

    public static void Write(string message)
    {
        if (FilePath == null) return;
        try { File.AppendAllText(FilePath, $"{DateTime.Now:HH:mm:ss.fff}  {message}\r\n"); }
        catch { }
    }
}

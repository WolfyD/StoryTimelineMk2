using Microsoft.Win32;

namespace StoryTimelineInstaller;

public enum InstallerMode { Install, Uninstall }

public sealed class InstallerContext
{
    private static InstallerContext? _current;
    public static InstallerContext Current => _current ??= new InstallerContext();

    public InstallerMode Mode { get; set; } = InstallerMode.Install;

    public string InstallDir { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "StoryTimeline");

    public bool CreateDesktopShortcut { get; set; } = true;
    public bool CreateStartMenuShortcut { get; set; } = true;
    public bool LaunchOnFinish { get; set; } = true;
    public bool KeepUserData { get; set; } = true;

    public string? InstalledVersion { get; private set; }
    public string? InstalledDir { get; private set; }

    public bool IsAlreadyInstalled => InstalledVersion != null;

    // Constants
    public const string GitHubOwner = "WolfyD";
    public const string GitHubRepo = "StoryTimelineMk2";
    public const string AppName = "Story Timeline";
    public const string AppVersion = "1.0.0";
    public const string RegistryKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\StoryTimeline";
    public const string DataDir = "StoryTimelineMk2_Data";
    public const string CacheDir = "StoryTimelineMk2_Cache";

    public void CheckExistingInstall()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(RegistryKey);
            if (key == null) return;

            InstalledVersion = key.GetValue("DisplayVersion") as string;
            InstalledDir = key.GetValue("InstallLocation") as string;
        }
        catch
        {
            // Not installed or access denied
        }
    }
}

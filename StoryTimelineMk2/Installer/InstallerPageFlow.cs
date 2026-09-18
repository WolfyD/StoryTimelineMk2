namespace StoryTimelineInstaller;

internal static class InstallerPageFlow
{
    internal static int GetDotCount(InstallerMode mode) => mode == InstallerMode.Uninstall ? 2 : 4;

    internal static int GetDotIndex(int pageIdx, InstallerMode mode)
    {
        if (mode == InstallerMode.Uninstall)
        {
            // Pages: 0=Uninstall  1=Progress  2=Finish
            // Dots:  0             1            1
            return pageIdx <= 0 ? 0 : 1;
        }

        // Pages: 0=Welcome/Mode  1=License  2=Directory  3=Options  4=Progress  5=Finish
        // Dots:  0                1           1            2          3            3
        return pageIdx switch { 0 => 0, 1 => 1, 2 => 1, 3 => 2, 4 => 3, 5 => 3, _ => 0 };
    }

    internal static bool IsNewerVersion(string candidate, string installed)
    {
        if (Version.TryParse(candidate, out var c) && Version.TryParse(installed, out var i))
            return c > i;
        return false;
    }
}

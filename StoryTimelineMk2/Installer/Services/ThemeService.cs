using Microsoft.Win32;
using System.Windows;

namespace StoryTimelineInstaller.Services;

public static class ThemeService
{
    public static bool IsDarkMode()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            if (key?.GetValue("AppsUseLightTheme") is int value)
                return value == 0;
        }
        catch { }
        return true; // Default to dark
    }

    public static void Apply(Application app)
    {
        var merged = app.Resources.MergedDictionaries;
        merged.Clear();

        merged.Add(new ResourceDictionary
        {
            Source = new Uri("pack://application:,,,/Themes/Common.xaml")
        });

        var themeName = IsDarkMode() ? "Dark" : "Light";
        merged.Add(new ResourceDictionary
        {
            Source = new Uri($"pack://application:,,,/Themes/{themeName}.xaml")
        });
    }
}

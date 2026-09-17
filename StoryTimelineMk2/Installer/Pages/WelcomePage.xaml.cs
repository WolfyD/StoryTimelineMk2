using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class WelcomePage : UserControl
{
    public WelcomePage()
    {
        InitializeComponent();
    }

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        var ctx = InstallerContext.Current;

        if (ctx.IsAlreadyInstalled)
        {
            var installed = ctx.InstalledVersion ?? "0.0.0";
            if (IsNewer(InstallerContext.AppVersion, installed))
            {
                TitleBlock.Text   = $"Update to Story Timeline v{InstallerContext.AppVersion}";
                SubtitleBlock.Text = $"Currently installed: v{installed}. "
                                   + "This wizard will update Story Timeline on your computer.";
            }
            else
            {
                TitleBlock.Text   = "Reinstall Story Timeline";
                SubtitleBlock.Text = $"Story Timeline v{installed} is already installed. "
                                   + "This wizard will reinstall it.";
            }
        }
        else
        {
            TitleBlock.Text   = "Welcome to Story Timeline";
            SubtitleBlock.Text = $"This wizard will install Story Timeline "
                               + $"v{InstallerContext.AppVersion} on your computer.";
        }
    }

    private static bool IsNewer(string current, string installed)
    {
        if (Version.TryParse(current, out var cv) && Version.TryParse(installed, out var iv))
            return cv > iv;
        return false;
    }
}

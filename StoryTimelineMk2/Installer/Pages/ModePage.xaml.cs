using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class ModePage : UserControl
{
    public ModePage()
    {
        InitializeComponent();
    }

    public bool WantsUninstall => UninstallRadio.IsChecked == true;

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        var ctx = InstallerContext.Current;
        var installed = ctx.InstalledVersion ?? "?";
        var current = InstallerContext.AppVersion;

        SubtitleBlock.Text = $"Version {installed} is installed" +
            (ctx.InstalledDir != null ? $" at {ctx.InstalledDir}." : ".");

        bool isUpdate = IsNewerVersion(current, installed);
        if (isUpdate)
        {
            InstallLabel.Text = $"Update to Story Timeline v{current}";
            InstallDesc.Text = $"Replace v{installed} with the latest version.";
        }
        else
        {
            InstallLabel.Text = $"Reinstall Story Timeline v{current}";
            InstallDesc.Text = "Reinstall the current version, overwriting existing files.";
        }
    }

    private static bool IsNewerVersion(string candidate, string installed) =>
        InstallerPageFlow.IsNewerVersion(candidate, installed);
}

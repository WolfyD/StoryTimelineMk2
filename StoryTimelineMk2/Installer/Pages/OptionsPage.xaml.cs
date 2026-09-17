using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class OptionsPage : UserControl
{
    public OptionsPage()
    {
        InitializeComponent();
    }

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        var ctx = InstallerContext.Current;
        DesktopCb.IsChecked   = ctx.CreateDesktopShortcut;
        StartMenuCb.IsChecked = ctx.CreateStartMenuShortcut;
        LaunchCb.IsChecked    = ctx.LaunchOnFinish;
        SummaryPath.Text      = ctx.InstallDir;
    }

    private void DesktopCb_Checked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.CreateDesktopShortcut = true;
    private void DesktopCb_Unchecked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.CreateDesktopShortcut = false;

    private void StartMenuCb_Checked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.CreateStartMenuShortcut = true;
    private void StartMenuCb_Unchecked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.CreateStartMenuShortcut = false;

    private void LaunchCb_Checked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.LaunchOnFinish = true;
    private void LaunchCb_Unchecked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.LaunchOnFinish = false;
}

using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class UninstallPage : UserControl
{
    public UninstallPage()
    {
        InitializeComponent();
    }

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        var ctx     = InstallerContext.Current;
        var version = ctx.InstalledVersion ?? InstallerContext.AppVersion;
        var dir     = ctx.InstalledDir ?? ctx.InstallDir;

        SubtitleBlock.Text  = $"Version {version} is installed at: {dir}";
        KeepDataCb.IsChecked = ctx.KeepUserData;
        UpdateDataNote(ctx.KeepUserData);
    }

    private void KeepDataCb_Checked(object sender, RoutedEventArgs e)
    {
        InstallerContext.Current.KeepUserData = true;
        UpdateDataNote(true);
    }

    private void KeepDataCb_Unchecked(object sender, RoutedEventArgs e)
    {
        InstallerContext.Current.KeepUserData = false;
        UpdateDataNote(false);
    }

    private void UpdateDataNote(bool keeping)
    {
        DataNote.Text = keeping
            ? @"Your story database at %LocalAppData%\StoryTimelineMk2_Data will be preserved."
            : @"Your story database at %LocalAppData%\StoryTimelineMk2_Data will be deleted.";
    }
}

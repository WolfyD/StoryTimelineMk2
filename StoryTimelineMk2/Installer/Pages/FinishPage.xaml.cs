using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class FinishPage : UserControl
{
    public FinishPage()
    {
        InitializeComponent();
    }

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        var ctx = InstallerContext.Current;

        if (ctx.Mode == InstallerMode.Uninstall)
        {
            FinishTitle.Text      = "Uninstall Complete";
            FinishSubtitle.Text   = "Story Timeline has been removed from your computer.";
            LaunchCb.Visibility   = Visibility.Collapsed;
        }
        else
        {
            FinishTitle.Text    = "Installation Complete!";
            FinishSubtitle.Text = "Story Timeline has been installed successfully.";
            LaunchCb.Visibility = Visibility.Visible;
            LaunchCb.IsChecked  = ctx.LaunchOnFinish;
            if (ctx.NeedsDotnetRuntime && !ctx.InstallDotnetRuntime)
            {
                FinishSubtitle.Text = "Story Timeline has been installed. Install the .NET 10 Desktop Runtime before running it.";
                LaunchCb.IsChecked  = false;
            }
        }
    }

    private void LaunchCb_Checked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.LaunchOnFinish = true;

    private void LaunchCb_Unchecked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.LaunchOnFinish = false;
}

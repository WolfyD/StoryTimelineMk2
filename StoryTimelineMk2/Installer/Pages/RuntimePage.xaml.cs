using System.Windows;
using System.Windows.Controls;
using System.Windows.Navigation;
using StoryTimelineInstaller.Services;

namespace StoryTimelineInstaller.Pages;

/// Shown only when the framework-dependent payload needs a .NET runtime that isn't installed.
public partial class RuntimePage : UserControl
{
    public RuntimePage()
    {
        InitializeComponent();
    }

    private void Radio_Checked(object sender, RoutedEventArgs e)
        => InstallerContext.Current.InstallDotnetRuntime = DownloadRadio.IsChecked == true;

    private void Link_RequestNavigate(object sender, RequestNavigateEventArgs e)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true }); }
        catch (Exception ex) { InstallerLog.Write($"[runtime] open link failed: {ex}"); }
        e.Handled = true;
    }
}

using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using StoryTimelineInstaller.Pages;

namespace StoryTimelineInstaller;

public partial class MainWindow : Window
{
    private readonly List<UserControl> _pages = new();
    private int _currentIdx = 0;
    private bool _installDone = false;

    private ProgressPage? _progressPage;
    private FinishPage?   _finishPage;
    private LicensePage?  _licPage;
    private int _totalDots = 4;

    public MainWindow()
    {
        InitializeComponent();
        SubtitleBlock.Text = $"v{InstallerContext.AppVersion} — Setup" + (InstallerContext.IsTestBuild ? "  [TEST BUILD]" : "");
        BuildPages();
        NavigateTo(0);
    }

    private void BuildPages()
    {
        _pages.Clear();
        _licPage = null;

        var ctx = InstallerContext.Current;

        if (ctx.Mode == InstallerMode.Uninstall)
        {
            // Direct uninstall (/uninstall arg from Add/Remove Programs)
            _pages.Add(new UninstallPage());
            _progressPage = new ProgressPage();
            _pages.Add(_progressPage);
            _finishPage = new FinishPage();
            _pages.Add(_finishPage);
            _totalDots = 2;
        }
        else if (ctx.IsAlreadyInstalled)
        {
            // Already installed — show mode selection, then license + install flow
            if (ctx.InstalledDir != null)
                ctx.InstallDir = ctx.InstalledDir;

            _pages.Add(new ModePage());
            _licPage = new LicensePage();
            _pages.Add(_licPage);
            if (ctx.NeedsDotnetRuntime) _pages.Add(new RuntimePage());
            _pages.Add(new DirectoryPage());
            _pages.Add(new OptionsPage());
            _progressPage = new ProgressPage();
            _pages.Add(_progressPage);
            _finishPage = new FinishPage();
            _pages.Add(_finishPage);
            _totalDots = 4;
        }
        else
        {
            // Fresh install
            _pages.Add(new WelcomePage());
            _licPage = new LicensePage();
            _pages.Add(_licPage);
            if (ctx.NeedsDotnetRuntime) _pages.Add(new RuntimePage());
            _pages.Add(new DirectoryPage());
            _pages.Add(new OptionsPage());
            _progressPage = new ProgressPage();
            _pages.Add(_progressPage);
            _finishPage = new FinishPage();
            _pages.Add(_finishPage);
            _totalDots = 4;
        }
    }

    private bool IsProgressPage => _currentIdx < _pages.Count && _pages[_currentIdx] is ProgressPage;
    private bool IsLastPage => _currentIdx == _pages.Count - 1;

    public void NavigateTo(int idx)
    {
        _currentIdx = idx;
        MainContent.Content = _pages[idx];
        UpdateFooter();
    }

    public void UpdateFooter()
    {
        BackButton.IsEnabled = _currentIdx > 0 && !IsProgressPage && !_installDone;

        if (IsLastPage)
        {
            NextButton.Content = "Finish";
            NextButton.Visibility = Visibility.Visible;
            NextButton.IsEnabled = true;
        }
        else if (IsProgressPage)
        {
            NextButton.Visibility = Visibility.Collapsed;
        }
        else
        {
            NextButton.Content = "Next →";
            NextButton.Visibility = Visibility.Visible;
            // Disable Next on LicensePage until the user accepts the terms
            NextButton.IsEnabled = !(_pages[_currentIdx] is LicensePage lp && !lp.IsAccepted);
        }

        // Rebuild step dots
        StepDots.Children.Clear();
        int dotIdx = GetDotIndex(_currentIdx);

        for (int i = 0; i < _totalDots; i++)
        {
            bool isCurrent = i == dotIdx;
            bool isPast    = i < dotIdx;

            var ellipse = new Ellipse
            {
                Width  = isCurrent ? 10 : 8,
                Height = isCurrent ? 10 : 8,
                Margin = new Thickness(4, 0, 4, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            if (isCurrent || isPast)
                ellipse.Fill = (Brush)Application.Current.Resources["AccentBrush"];
            else
                ellipse.Fill = (Brush)Application.Current.Resources["StepDotFuture"];

            StepDots.Children.Add(ellipse);
        }
    }

    private int GetDotIndex(int pageIdx) =>
        InstallerPageFlow.GetDotIndex(pageIdx, InstallerContext.Current.Mode, _pages.Any(p => p is RuntimePage));

    private void Header_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
            DragMove();
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState.Minimized;

    private void CloseButton_Click(object sender, RoutedEventArgs e)
        => Application.Current.Shutdown();

    private void BackButton_Click(object sender, RoutedEventArgs e)
    {
        if (_currentIdx > 0)
            NavigateTo(_currentIdx - 1);
    }

    private async void NextButton_Click(object sender, RoutedEventArgs e)
    {
        if (IsLastPage)
        {
            if (InstallerContext.Current.LaunchOnFinish
                && InstallerContext.Current.Mode == InstallerMode.Install)
            {
                try
                {
                    var exePath = Path.Combine(InstallerContext.Current.InstallDir, "StoryTimeline.exe");
                    if (File.Exists(exePath))
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = exePath,
                            UseShellExecute = true
                        });
                }
                catch { }
            }
            Application.Current.Shutdown();
            return;
        }

        // ModePage: switch to uninstall flow if user chose Uninstall
        if (_pages[_currentIdx] is ModePage mp && mp.WantsUninstall)
        {
            InstallerContext.Current.Mode = InstallerMode.Uninstall;
            BuildPages();
            NavigateTo(0);
            return;
        }

        // LicensePage: safety gate (button should already be disabled, but guard anyway)
        if (_pages[_currentIdx] is LicensePage lp2 && !lp2.IsAccepted)
            return;

        // DirectoryPage: block advance if path is invalid or unwritable
        if (_pages[_currentIdx] is DirectoryPage dp && !dp.IsValid)
            return;

        // Transition to progress from Options or UninstallPage
        if (_pages[_currentIdx] is OptionsPage || _pages[_currentIdx] is UninstallPage)
        {
            var progressIdx = _pages.IndexOf(_progressPage!);
            NavigateTo(progressIdx);
            _installDone = false;
            NextButton.Visibility = Visibility.Collapsed;
            BackButton.IsEnabled = false;

            if (_progressPage != null)
                await _progressPage.StartAsync(InstallerContext.Current.Mode, this);

            return;
        }

        NavigateTo(_currentIdx + 1);
    }

    public void OnInstallComplete()
    {
        _installDone = true;
        var finishIdx = _pages.IndexOf(_finishPage!);
        if (finishIdx < 0) return;

        Dispatcher.InvokeAsync(async () =>
        {
            await Task.Delay(800);
            NavigateTo(finishIdx);
            NextButton.Content = "Finish";
            NextButton.Visibility = Visibility.Visible;
            BackButton.IsEnabled = false;
        });
    }
}

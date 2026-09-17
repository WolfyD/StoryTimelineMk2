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
    private FinishPage? _finishPage;
    private int _totalDots = 4;

    public MainWindow()
    {
        InitializeComponent();
        BuildPages();
        NavigateTo(0);
    }

    private void BuildPages()
    {
        _pages.Clear();

        if (InstallerContext.Current.Mode == InstallerMode.Install)
        {
            _pages.Add(new WelcomePage());
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
            _pages.Add(new UninstallPage());
            _progressPage = new ProgressPage();
            _pages.Add(_progressPage);
            _finishPage = new FinishPage();
            _pages.Add(_finishPage);
            _totalDots = 3;
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
        }
        else if (IsProgressPage)
        {
            NextButton.Visibility = Visibility.Collapsed;
        }
        else
        {
            NextButton.Content = "Next →";
            NextButton.Visibility = Visibility.Visible;
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

    private int GetDotIndex(int pageIdx)
    {
        if (InstallerContext.Current.Mode == InstallerMode.Install)
        {
            // Pages: 0=Welcome 1=Directory 2=Options 3=Progress 4=Finish
            // Dots:  0         1           2          3           3
            return pageIdx switch
            {
                0 => 0, 1 => 1, 2 => 2, 3 => 3, 4 => 3, _ => 0
            };
        }
        else
        {
            // Pages: 0=Uninstall 1=Progress 2=Finish
            // Dots:  0            1          2
            return pageIdx switch
            {
                0 => 0, 1 => 1, 2 => 2, _ => 0
            };
        }
    }

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

        // Block advance from DirectoryPage if path is invalid or unwritable
        if (_pages[_currentIdx] is DirectoryPage dp && !dp.IsValid)
            return;

        // Transition to progress from Options or Uninstall page
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

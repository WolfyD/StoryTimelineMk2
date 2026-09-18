using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Forms;
using System.Windows.Threading;

namespace StoryTimelineInstaller.Pages;

public partial class DirectoryPage : UserControl
{
    private bool _loading = false;
    private bool _isValid = true;
    private DispatcherTimer? _debounce;

    public bool IsValid => _isValid;

    public DirectoryPage()
    {
        InitializeComponent();
    }

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        _loading = true;
        DirBox.Text = InstallerContext.Current.InstallDir;
        _loading = false;
        UpdateDiskSpace();
        RunValidation(DirBox.Text);
    }

    private void DirBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading) return;
        var path = DirBox.Text;
        InstallerContext.Current.InstallDir = path;
        UpdateDiskSpace();

        // Instant syntax check
        if (!IsSyntaxValid(path))
        {
            ShowError(string.IsNullOrWhiteSpace(path)
                ? "Please enter an installation directory."
                : "The specified path is invalid.");
            SetValid(false);
            return;
        }

        // Debounce the write-access check (600 ms after typing stops)
        _debounce?.Stop();
        _debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
        _debounce.Tick += (_, _) => { _debounce.Stop(); RunValidation(path); };
        _debounce.Start();
        HideError();   // optimistic while waiting
        SetValid(true);
    }

    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description            = "Select installation folder",
            SelectedPath           = DirBox.Text,
            ShowNewFolderButton    = true
        };
        if (dialog.ShowDialog() == DialogResult.OK)
        {
            DirBox.Text = dialog.SelectedPath;
            // Run full validation immediately after a browser selection
            _debounce?.Stop();
            RunValidation(dialog.SelectedPath);
        }
    }

    private void RunValidation(string path)
    {
        if (!IsSyntaxValid(path))
        {
            ShowError("The specified path is invalid.");
            SetValid(false);
            return;
        }

        if (!CheckWriteAccess(path, out var error))
        {
            ShowError(error ?? "Cannot write to this location.");
            SetValid(false);
            return;
        }

        HideError();
        SetValid(true);
    }

    private static bool IsSyntaxValid(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        try { Path.GetFullPath(path); return true; }
        catch { return false; }
    }

    private static bool CheckWriteAccess(string path, out string? error)
    {
        error = null;
        try
        {
            // Find the deepest ancestor that already exists to decide what to clean up
            var probe = path;
            string? createdTop = null;
            while (!string.IsNullOrEmpty(probe) && !Directory.Exists(probe))
            {
                createdTop = probe;
                probe = Path.GetDirectoryName(probe)!;
            }

            // Try to create the full path
            Directory.CreateDirectory(path);

            // Try a round-trip write
            var tmp = Path.Combine(path, $".st_writetest_{Guid.NewGuid():N}");
            File.WriteAllText(tmp, "ok");
            File.Delete(tmp);

            // Clean up any directories we created just for the test
            if (createdTop != null)
            {
                try { Directory.Delete(path); } catch { }
            }

            return true;
        }
        catch (UnauthorizedAccessException)
        {
            error = "You do not have permission to write to this location.";
            return false;
        }
        catch (IOException ex)
        {
            error = $"Cannot access location: {ex.Message}";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private void UpdateDiskSpace()
    {
        try
        {
            var root = Path.GetPathRoot(DirBox.Text);
            if (string.IsNullOrEmpty(root)) { DiskInfo.Text = string.Empty; return; }
            var drive  = new DriveInfo(root);
            var freeGb = drive.AvailableFreeSpace / (1024.0 * 1024 * 1024);
            DiskInfo.Text = $"Free space on {root.TrimEnd('\\')}:  {freeGb:F1} GB";
        }
        catch { DiskInfo.Text = string.Empty; }
    }

    private void ShowError(string msg)
    {
        ValidationMsg.Text       = msg;
        ValidationMsg.Visibility = Visibility.Visible;
    }

    private void HideError() => ValidationMsg.Visibility = Visibility.Collapsed;

    private void SetValid(bool valid) => _isValid = valid;
}

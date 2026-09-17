// Resolve WPF vs WinForms ambiguities when UseWindowsForms=true is combined with UseWPF=true
global using Application          = System.Windows.Application;
global using UserControl          = System.Windows.Controls.UserControl;
global using TextChangedEventArgs = System.Windows.Controls.TextChangedEventArgs;
global using Brush                = System.Windows.Media.Brush;
global using Path                 = System.IO.Path;
global using File                 = System.IO.File;
global using Directory            = System.IO.Directory;
global using DirectoryInfo        = System.IO.DirectoryInfo;
global using SearchOption         = System.IO.SearchOption;
global using FileStream           = System.IO.FileStream;
global using FileMode             = System.IO.FileMode;
global using FileAccess           = System.IO.FileAccess;
global using FileShare            = System.IO.FileShare;
global using DriveInfo            = System.IO.DriveInfo;
global using HttpClient           = System.Net.Http.HttpClient;
global using HttpCompletionOption = System.Net.Http.HttpCompletionOption;

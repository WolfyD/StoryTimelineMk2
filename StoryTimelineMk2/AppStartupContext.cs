using System.Windows.Forms;
using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2
{
    /// <summary>
    /// Manages app startup: shows the splash immediately, loads the main window
    /// invisibly in the background, then swaps them when navigation completes.
    /// </summary>
    internal class AppStartupContext : ApplicationContext
    {
        private readonly f_splash _splash;
        private readonly f_Main _main;

        public AppStartupContext()
        {
            _splash = new f_splash();
            _splash.Show();

            _main = new f_Main();
            _main.FormClosed += (_, _) => ExitThread();
            _main.ReadyToShow += OnMainReady;

            // Defer until after Application.Run installs the WinForms
            // SynchronizationContext — StartLoading uses async/await.
            _splash.BeginInvoke(_main.StartLoading);
        }

        private async void OnMainReady()
        {
            await _splash.FadeOutAsync();
            _splash.Close();
            _main.Show();
            _main.Activate();
        }
    }
}

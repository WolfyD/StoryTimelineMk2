using StoryTimelineMk2.Database;
using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2
{
    internal static class Program
    {
        /// <summary>
        ///  The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            // To customize application configuration such as set high DPI settings or default font,
            // see https://aka.ms/applicationconfiguration.
            ApplicationConfiguration.Initialize();

            // Last line of defense for the project rule "log every error with full
            // stack trace and show it to the user" — without these, an unhandled
            // exception dies with the default WinForms dialog and no log entry.
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, e) =>
            {
                Logger.Error("UnhandledUI", e.Exception);
                f_ErrorReport.ShowReport("Unexpected error.", e.Exception);
            };
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                    Logger.Error("UnhandledDomain", ex);
            };

            try
            {
                DbInitializer.Initialize();
            }
            catch (Exception ex)
            {
                Logger.Error("DbInitializer", ex);
                f_ErrorReport.ShowReport("The timeline database could not be opened or upgraded, so the app cannot start.", ex);
                return;
            }

            try
            {
                Database.StatsDbInitializer.Initialize();
            }
            catch (Exception ex)
            {
                // Non-fatal: stats DB failure must never prevent the app from starting — but it is still shown.
                Logger.Error("StatsDbInitializer", ex);
                f_ErrorReport.ShowReport("The usage-statistics database could not be opened or upgraded. " +
                    "The app will start, but statistics and achievements may not be recorded until this is fixed.", ex);
            }

            Application.Run(new AppStartupContext());
        }
    }
}
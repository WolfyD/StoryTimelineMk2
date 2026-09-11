using StoryTimelineMk2.Database;

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
                MessageBox.Show($"Unexpected error:\n\n{e.Exception}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                MessageBox.Show(
                    $"The database could not be initialized — the app cannot start.\n\n{ex}",
                    "Startup error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Application.Run(new Forms.f_Main());
        }
    }
}
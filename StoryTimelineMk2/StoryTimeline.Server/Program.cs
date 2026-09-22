using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Server
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            ServerOptions options;
            try
            {
                options = ServerOptions.Parse(args);
            }
            catch (ArgumentException ex)
            {
                Console.Error.WriteLine(ex.Message);
                Console.Error.WriteLine();
                Console.Error.WriteLine(ServerOptions.Usage);
                return 2;
            }

            if (options.ShowHelp)
            {
                Console.WriteLine(ServerOptions.Usage);
                return 0;
            }

            // Same last line of defence as the WinForms host: nothing dies without a logged
            // stack trace the user can actually see.
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                if (e.ExceptionObject is Exception ex) Fail("Unexpected error.", ex, "UnhandledDomain");
            };
            AppConfig.OnLoadError = (message, ex) =>
            {
                Logger.Error("AppConfig", ex);
                Console.Error.WriteLine(message);
            };

            try
            {
                DbInitializer.Initialize();
            }
            catch (Exception ex)
            {
                Fail("The timeline database could not be opened or upgraded, so the server cannot start.",
                     ex, "DbInitializer");
                return 1;
            }

            try
            {
                // Non-fatal, exactly as in the WinForms host: no stats must never mean no app.
                StatsDbInitializer.Initialize();
            }
            catch (Exception ex)
            {
                Fail("The usage-statistics database could not be opened or upgraded. The server will " +
                     "start, but statistics and achievements may not be recorded.", ex, "StatsDbInitializer");
            }

            WebApplication app;
            try
            {
                app = ServerApp.Build(options, AppContext.BaseDirectory);
                app.Start();
            }
            catch (Exception ex)
            {
                Fail("The server could not start.", ex, "ServerApp");
                return 1;
            }

            foreach (string url in app.Services.GetRequiredService<IServer>()
                                     .Features.Get<IServerAddressesFeature>()?.Addresses ?? [])
                Console.WriteLine($"Story Timeline is at {url}");
            Console.WriteLine("Press Ctrl+C to stop.");

            app.WaitForShutdown();
            return 0;
        }

        private static void Fail(string message, Exception ex, string context)
        {
            Logger.Error(context, ex);
            Console.Error.WriteLine(message);
            Console.Error.WriteLine(ex);
        }
    }
}

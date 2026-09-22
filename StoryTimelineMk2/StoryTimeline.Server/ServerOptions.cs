namespace StoryTimelineMk2.Server
{
    /// <summary>
    /// Everything the command line can change. Loopback is not one of them: the server binds
    /// 127.0.0.1 and nothing else, which is why it needs no login (BL-68).
    /// </summary>
    internal sealed class ServerOptions
    {
        public const int DefaultPort = 5123;

        public int Port { get; init; } = DefaultPort;

        /// <summary>Folder holding the built SPA. Null means "work it out at startup".</summary>
        public string? SpaRoot { get; init; }

        /// <summary>Print usage and exit instead of serving.</summary>
        public bool ShowHelp { get; init; }

        public const string Usage = """
              Story Timeline (local server)

              USAGE
                StoryTimeline.Server [--port N] [--spa <folder>]

                --port N        port on 127.0.0.1 to listen on (default 5123)
                --spa <folder>  folder holding the built SPA. Defaults to wwwroot next to the
                                executable, then Frontend\dist next to it. Running from source
                                needs this, e.g. --spa ..\..\..\..\Frontend\dist
                --help, -h      this text

              Your data stays on this machine: the server binds to 127.0.0.1 only.
            """;

        /// <summary>
        /// Parses <paramref name="args"/>, throwing <see cref="ArgumentException"/> on anything
        /// malformed — a typo'd port must stop the server, not silently serve on the default.
        /// </summary>
        public static ServerOptions Parse(string[] args)
        {
            int port = DefaultPort;
            string? spa = null;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--help":
                    case "-h":
                        return new ServerOptions { ShowHelp = true };

                    case "--port":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--port needs a number.");
                        if (!int.TryParse(args[++i], out port) || port < 0 || port > 65535)
                            throw new ArgumentException($"'{args[i]}' is not a port number between 0 and 65535.");
                        break;

                    case "--spa":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--spa needs a folder.");
                        spa = args[++i];
                        break;

                    default:
                        throw new ArgumentException($"Unknown argument '{args[i]}'. Try --help.");
                }
            }

            return new ServerOptions { Port = port, SpaRoot = spa };
        }

        /// <summary>
        /// Where the built SPA actually is: what was asked for, else wwwroot (where a publish puts
        /// it), else Frontend\dist beside the executable (where the WinForms host keeps it).
        /// </summary>
        /// <exception cref="DirectoryNotFoundException">No candidate holds an index.html.</exception>
        public string ResolveSpaRoot(string baseDirectory)
        {
            var candidates = SpaRoot != null
                ? new[] { Path.GetFullPath(SpaRoot) }
                : new[]
                {
                    Path.Combine(baseDirectory, "wwwroot"),
                    Path.Combine(baseDirectory, "Frontend", "dist"),
                };

            foreach (string candidate in candidates)
                if (File.Exists(Path.Combine(candidate, "index.html")))
                    return candidate;

            throw new DirectoryNotFoundException(
                "No built frontend found. Looked for index.html in:" + Environment.NewLine +
                string.Join(Environment.NewLine, candidates.Select(c => "  " + c)) + Environment.NewLine +
                "Run 'npm run build' in Frontend, or pass --spa <folder>.");
        }
    }
}

using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2
{
    public class AppConfig
    {
        private static readonly string _configDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "StoryTimelineMk2");

        private static readonly string _configPath = Path.Combine(_configDir, "config.json");

        private static AppConfig? _instance;
        private static readonly object _lock = new();

        [JsonPropertyName("dataRoot")]
        public string DataRoot { get; set; } = DefaultDataRoot;

        public static string DefaultDataRoot => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "StoryTimelineMk2_Data");

        public static AppConfig Instance
        {
            get
            {
                if (_instance == null)
                    lock (_lock)
                        _instance ??= Load();
                return _instance;
            }
        }

        private static AppConfig Load()
        {
            // Env var always wins — lets the test launcher point at an isolated DB
            // without touching the user's real config.json.
            string? envRoot = Environment.GetEnvironmentVariable("STORYTIMELINE_DATA_ROOT");
            if (!string.IsNullOrEmpty(envRoot))
                return new AppConfig { DataRoot = envRoot };

            try
            {
                if (File.Exists(_configPath))
                {
                    var cfg = JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(_configPath));
                    if (cfg != null && !string.IsNullOrWhiteSpace(cfg.DataRoot))
                        return cfg;
                }
            }
            catch { }
            return new AppConfig();
        }

        public void Save()
        {
            Directory.CreateDirectory(_configDir);
            File.WriteAllText(_configPath, JsonSerializer.Serialize(this,
                new JsonSerializerOptions { WriteIndented = true }));
        }

        public string GetDbPath() => Path.Combine(DataRoot, "timeline.sqlite");
        public string GetMediaFolder() => Path.Combine(DataRoot, "Media");
        public string GetConnectionString() => $"Data Source={GetDbPath()}";
    }
}

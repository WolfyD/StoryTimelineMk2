using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2
{
    public class ChromeTheme
    {
        // ── Title bar ────────────────────────────────────────────────────────
        [JsonPropertyName("tbBgFrom")]        public string TbBgFrom        { get; set; } = "#060c19";
        [JsonPropertyName("tbBgTo")]          public string TbBgTo          { get; set; } = "#0a1424";
        [JsonPropertyName("tbBorderColor")]   public string TbBorderColor   { get; set; } = "rgba(79, 70, 229, 0.18)";
        [JsonPropertyName("tbText")]          public string TbText          { get; set; } = "#8ea5c0";
        [JsonPropertyName("tbSub")]           public string TbSub           { get; set; } = "#3d5166";
        [JsonPropertyName("tbBtnColor")]      public string TbBtnColor      { get; set; } = "#3d5166";
        [JsonPropertyName("tbBtnHoverColor")] public string TbBtnHoverColor { get; set; } = "#8ca5bc";
        [JsonPropertyName("tbBtnHoverBg")]    public string TbBtnHoverBg    { get; set; } = "rgba(255, 255, 255, 0.07)";
        [JsonPropertyName("tbOrb1")]          public string TbOrb1          { get; set; } = "#4338ca";
        [JsonPropertyName("tbOrb2")]          public string TbOrb2          { get; set; } = "#818cf8";

        // ── App shell ────────────────────────────────────────────────────────
        [JsonPropertyName("appBg")]            public string AppBg            { get; set; } = "#0f172a";
        [JsonPropertyName("appSurface")]       public string AppSurface       { get; set; } = "#0c1524";
        [JsonPropertyName("appSurfaceRaised")] public string AppSurfaceRaised { get; set; } = "#141e33";
        [JsonPropertyName("appSurfaceHigh")]   public string AppSurfaceHigh   { get; set; } = "#1e2b44";
        [JsonPropertyName("appBorder")]        public string AppBorder        { get; set; } = "#2d3a56";
        [JsonPropertyName("appText")]          public string AppText          { get; set; } = "#e2e8f0";
        [JsonPropertyName("appTextMuted")]     public string AppTextMuted     { get; set; } = "#94a3b8";
        [JsonPropertyName("appTextDim")]       public string AppTextDim       { get; set; } = "#4a6080";
        [JsonPropertyName("appAccent")]        public string AppAccent        { get; set; } = "#6366f1";
        [JsonPropertyName("appAccentHover")]   public string AppAccentHover   { get; set; } = "#818cf8";

        // ── Sizes ────────────────────────────────────────────────────────────
        [JsonPropertyName("appRadius")]   public string AppRadius   { get; set; } = "8px";
        [JsonPropertyName("appRadiusSm")] public string AppRadiusSm { get; set; } = "4px";
        [JsonPropertyName("appRadiusLg")] public string AppRadiusLg { get; set; } = "12px";

        public static ChromeTheme DarkDefault() => new ChromeTheme();

        public static ChromeTheme LightDefault() => new ChromeTheme
        {
            TbBgFrom        = "#f0ecfb",
            TbBgTo          = "#e8e2f5",
            TbBorderColor   = "rgba(120, 100, 190, 0.22)",
            TbText          = "#2d2060",
            TbSub           = "#7a6aac",
            TbBtnColor      = "#9585c4",
            TbBtnHoverColor = "#2d2060",
            TbBtnHoverBg    = "rgba(99, 102, 241, 0.1)",
            TbOrb1          = "#4338ca",
            TbOrb2          = "#818cf8",
            AppBg           = "#f0edf9",
            AppSurface      = "#f9f7fe",
            AppSurfaceRaised = "#f4f1fb",
            AppSurfaceHigh  = "#e8e4f5",
            AppBorder       = "#c8baec",
            AppText         = "#1e1640",
            AppTextMuted    = "#5b4d8a",
            AppTextDim      = "#8b7ab8",
            AppAccent       = "#6366f1",
            AppAccentHover  = "#4f46e5",
            AppRadius       = "8px",
            AppRadiusSm     = "4px",
            AppRadiusLg     = "12px",
        };
    }

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

        [JsonPropertyName("chromeTheme")]
        public ChromeTheme ChromeTheme { get; set; } = new ChromeTheme();

        [JsonPropertyName("themeInitialized")]
        public bool ThemeInitialized { get; set; } = false;

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
            catch (Exception ex)
            {
                // A corrupt config.json silently falling back to the default data root
                // makes the user's timelines "disappear" (the app opens a different,
                // empty database). Surface it loudly instead.
                Logger.Error("AppConfig.Load", ex);
                System.Windows.Forms.MessageBox.Show(
                    $"The settings file could not be read — falling back to the default data folder.\n\n" +
                    $"If your timelines appear to be missing, your data is still at its previous " +
                    $"location; fix or delete this file and restart:\n{_configPath}\n\nError: {ex.Message}",
                    "Configuration error",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Warning);
            }
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

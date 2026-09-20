using System;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace StoryTimelineMk2.Database
{
    /// <summary>
    /// Single-file calendar sharing (BL-59): one JSON document holding the calendar's names, its year
    /// definition (months, seasons, memorable days…) and its LOD profile, with the nested JSON inlined
    /// as real objects so the file reads naturally. Import always creates a new calendar.
    /// </summary>
    public static class CalendarExporter
    {
        public const string Format = "storytimeline-calendar";
        private static readonly JsonSerializerOptions _writeOpts = new() { WriteIndented = true };

        public static string ToJson(CalendarItem cal)
        {
            var doc = new
            {
                format = Format,
                version = 1,
                name = cal.Name,
                shortName = cal.ShortName,
                alternateName = cal.AlternateName,
                nameBefore0 = cal.NameBefore0,
                nameAfter0 = cal.NameAfter0,
                yearDefinition = Parse(cal.YearDefinition, "{}"),
                lodProfile = new
                {
                    name = cal.LodProfile?.Name ?? "",
                    profile = Parse(cal.LodProfile?.Profile, "[]"),
                },
            };
            return JsonSerializer.Serialize(doc, _writeOpts);
        }

        /// <summary>
        /// Reads a file written by <see cref="ToJson"/> and saves it as a brand-new calendar (new ids,
        /// name kept). Throws with a user-readable message when the file is not a calendar file.
        /// </summary>
        public static (CalendarItem Calendar, bool NameCollision) Import(string path)
        {
            var root = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path));
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("format", out var format) || format.GetString() != Format)
                throw new InvalidDataException("This is not a StoryTimeline calendar file.");

            string name = Str(root, "name").Trim();
            if (name.Length == 0)
                throw new InvalidDataException("The calendar file has no name.");
            if (!root.TryGetProperty("yearDefinition", out var yd) || yd.ValueKind != JsonValueKind.Object)
                throw new InvalidDataException("The calendar file has no year definition.");
            if (!root.TryGetProperty("lodProfile", out var lod) || lod.ValueKind != JsonValueKind.Object
                || !lod.TryGetProperty("profile", out var profile) || profile.ValueKind != JsonValueKind.Array)
                throw new InvalidDataException("The calendar file has no LOD profile.");
            if (!profile.EnumerateArray().Any(l => l.ValueKind == JsonValueKind.Object && Str(l, "formatKey") == "YEARS"))
                throw new InvalidDataException("The calendar file's LOD profile has no YEARS level.");

            var cal = new CalendarItem
            {
                Name = name,
                ShortName = Str(root, "shortName"),
                AlternateName = Str(root, "alternateName"),
                NameBefore0 = Str(root, "nameBefore0"),
                NameAfter0 = Str(root, "nameAfter0"),
                YearDefinition = yd.GetRawText(),
                LodProfile = new LodItem
                {
                    Name = Str(lod, "name") is { Length: > 0 } lodName ? lodName : name + " LOD",
                    Profile = profile.GetRawText(),
                },
            };

            var repo = new CalendarRepo();
            bool collision = repo.GetAll().Any(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
            repo.SaveCalendarWithLod(cal);
            return (cal, collision);
        }

        private static JsonElement Parse(string? json, string fallback) =>
            JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(json) ? fallback : json);

        private static string Str(JsonElement obj, string prop) =>
            obj.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    }
}

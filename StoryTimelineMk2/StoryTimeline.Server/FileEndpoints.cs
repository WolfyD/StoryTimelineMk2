using System.Text;
using System.Text.Json;
using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Server
{
    /// <summary>
    /// The browser's stand-in for the WinForms file dialogs (BL-68 phase 3). A page cannot hand
    /// the server a path, so it uploads bytes and gets a path back; it cannot write to disk, so
    /// it downloads what the exporters produce. The bridge actions themselves stay path-based.
    /// </summary>
    internal static class FileEndpoints
    {
        /// <summary>
        /// Uploads land here and are read within seconds by the import that follows.
        /// ponytail: wiped at startup rather than tracked — nothing here survives a restart,
        /// and an abandoned upload is a stale temp file, not a leak that grows unbounded.
        /// </summary>
        internal static string UploadRoot => Path.Combine(Path.GetTempPath(), "StoryTimeline", "uploads");

        /// <summary>A full database backup is the largest thing anyone imports.</summary>
        internal const long MaxUploadBytes = 512L * 1024 * 1024;

        private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNameCaseInsensitive = true };

        internal static void ResetUploadFolder()
        {
            try
            {
                if (Directory.Exists(UploadRoot)) Directory.Delete(UploadRoot, recursive: true);
            }
            catch (Exception ex)
            {
                // Someone else's handle on a stale file is not a reason to refuse to start.
                Logger.Warn("Server/Uploads", $"Could not clear {UploadRoot}: {ex.Message}");
            }
            Directory.CreateDirectory(UploadRoot);
        }

        public static void Map(WebApplication app)
        {
            // Raw body rather than multipart: one file per request, no form limits to tune.
            app.MapPost("/upload", async (HttpContext context) =>
            {
                string name = context.Request.Query["name"].ToString();
                if (string.IsNullOrWhiteSpace(name))
                    return Results.BadRequest("Missing 'name' query parameter.");

                // The name is the user's, so only its extension is trusted enough to keep.
                string extension = Path.GetExtension(SafeName(name));
                string path = Path.Combine(UploadRoot, Guid.NewGuid().ToString("N") + extension);

                Directory.CreateDirectory(UploadRoot);
                try
                {
                    await using var file = File.Create(path);
                    await context.Request.Body.CopyToAsync(file, context.RequestAborted);
                }
                catch (Exception ex)
                {
                    Logger.Error("Server/Upload", ex);
                    TryDelete(path);
                    return Results.Problem(detail: ex.ToString(), title: $"Upload of '{name}' failed.");
                }

                return Results.Ok(new { path, name = SafeName(name) });
            });

            // Body is a bridge message ({ action, payload }) so the page sends what it would
            // have sent over the socket; only the reply is a file instead of JSON.
            app.MapPost("/export", async (HttpContext context) =>
            {
                ExportRequest? request;
                try
                {
                    request = await JsonSerializer.DeserializeAsync<ExportRequest>(
                        context.Request.Body, _jsonOpts, context.RequestAborted);
                }
                catch (JsonException ex)
                {
                    return Results.BadRequest($"Unreadable export request: {ex.Message}");
                }

                if (request?.Action is not string action)
                    return Results.BadRequest("Missing 'action'.");

                try
                {
                    return action switch
                    {
                        "ExportTimeline" => ExportTimeline(request.Payload),
                        "ExportSessionChanges" => ExportSessionChanges(request.Payload),
                        "ExportFullDB"   => ExportDatabase(request.Payload),
                        "ExportCalendar" => ExportCalendar(request.Payload),
                        _ => Results.BadRequest($"'{action}' is not an export."),
                    };
                }
                catch (Exception ex)
                {
                    Logger.Error($"Server/Export/{action}", ex);
                    return Results.Problem(detail: ex.ToString(), title: $"{action} failed: {ex.Message}");
                }
            });
        }

        private sealed class ExportRequest
        {
            public string? Action { get; set; }
            public JsonElement Payload { get; set; }
        }

        private static IResult ExportTimeline(JsonElement payload)
        {
            int id = payload.GetProperty("id").GetInt32();
            bool includeIds = payload.TryGetProperty("includeIds", out var ip) && ip.GetBoolean();
            bool includeMedia = payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();

            var timeline = new TimelineRepo().GetTimelineById(id);
            string temp = NewTempFile(".stlm");
            TimelineExporter.ExportToZip(id, temp, includeIds, includeMedia);
            return StreamAndDelete(temp, "application/zip", SafeName(timeline.Title) + ".stlm");
        }

        /// <summary>BL-33: the chosen days' net changes as a .stlc file.</summary>
        private static IResult ExportSessionChanges(JsonElement payload)
        {
            int id = payload.GetProperty("timelineId").GetInt32();
            var timeline = new TimelineRepo().GetTimelineById(id);
            string temp = NewTempFile(".stlc");
            SessionChanges.Write(id, temp, SessionChanges.DaysFrom(payload));
            return StreamAndDelete(temp, "application/json",
                SafeName($"{timeline.Title} - {DateTime.Now:yyyy-MM-dd}") + ".stlc");
        }

        /// <summary>
        /// <c>{ includeMedia }</c>: with it the download is a .stlm archive (database plus the media
        /// folder), without it the plain .sqlite.
        /// </summary>
        private static IResult ExportDatabase(JsonElement payload)
        {
            bool includeMedia = payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();
            string stamp = $"{DateTime.Now:yyyyMMdd_HHmmss}";

            if (includeMedia)
            {
                string archive = NewTempFile(".stlm");
                BackupService.WriteArchive(archive);
                return StreamAndDelete(archive, "application/zip", $"timeline_export_{stamp}.stlm");
            }

            string temp = NewTempFile(".sqlite");
            File.Copy(AppConfig.Instance.GetDbPath(), temp, overwrite: true);
            return StreamAndDelete(temp, "application/vnd.sqlite3", $"timeline_export_{stamp}.sqlite");
        }

        /// <summary>
        /// Payload is either <c>{ id }</c> (the manager exports what is stored) or
        /// <c>{ calendar }</c> (the editor exports what is on screen, unsaved).
        /// </summary>
        private static IResult ExportCalendar(JsonElement payload)
        {
            var calendar = payload.TryGetProperty("calendar", out var inline)
                ? JsonSerializer.Deserialize<CalendarItem>(inline.GetRawText(), _jsonOpts)
                    ?? throw new InvalidDataException("Invalid calendar payload.")
                : new CalendarRepo().GetCalendarById(payload.GetProperty("id").GetString()!);

            string fileName = SafeName(calendar.Name is { Length: > 0 } n ? n : "calendar") + ".json";
            return Download(Encoding.UTF8.GetBytes(CalendarExporter.ToJson(calendar)),
                "application/json", fileName);
        }

        private static IResult StreamAndDelete(string path, string contentType, string fileName)
        {
            // DeleteOnClose: the temp file goes away when the response finishes writing it,
            // whether that is a completed download or a dropped connection.
            var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                bufferSize: 64 * 1024, FileOptions.DeleteOnClose);
            return WithFileNameHeader(Results.File(stream, contentType, fileName), fileName);
        }

        private static IResult Download(byte[] bytes, string contentType, string fileName)
            => WithFileNameHeader(Results.File(bytes, contentType, fileName), fileName);

        /// <summary>
        /// The page reads the name from here: parsing Content-Disposition in JavaScript is
        /// more work than one header.
        /// </summary>
        private static IResult WithFileNameHeader(IResult result, string fileName)
            => new HeaderResult(result, "X-Export-Filename", Uri.EscapeDataString(fileName));

        private sealed class HeaderResult(IResult inner, string name, string value) : IResult
        {
            public Task ExecuteAsync(HttpContext httpContext)
            {
                httpContext.Response.Headers[name] = value;
                return inner.ExecuteAsync(httpContext);
            }
        }

        private static string NewTempFile(string extension)
        {
            Directory.CreateDirectory(UploadRoot);
            return Path.Combine(UploadRoot, Guid.NewGuid().ToString("N") + extension);
        }

        private static string SafeName(string name)
        {
            string stripped = string.Concat(Path.GetFileName(name).Split(Path.GetInvalidFileNameChars()));
            return stripped.Length > 0 ? stripped : "export";
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { /* a temp file, not worth a report */ }
        }
    }
}

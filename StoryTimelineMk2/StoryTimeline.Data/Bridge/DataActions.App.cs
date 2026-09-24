using StoryTimelineMk2.Database;
using StoryTimelineMk2.Database.Migrations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2.Bridge
{
    /// <summary>
    /// App-level actions that used to live in the WinForms router (BL-68 phase 3). Each one
    /// either needed no window at all, or needed one only for the last step — those keep the
    /// data half here and hand the window part back through a hook the host sets.
    /// </summary>
    public sealed partial class DataActions
    {
        /// <summary>
        /// Set by the host: a timeline's settings were just saved, apply them to its window
        /// (fullscreen state, zoom factor). The browser host leaves it null and handles both
        /// in the page. Not static — the WinForms host needs the form the message came from.
        /// </summary>
        public Action<SettingsItem>? OnSettingsApplied { get; set; }

        /// <summary>Set by the host: the window chrome colors changed and should be repainted.</summary>
        public Action? OnChromeThemeApplied { get; set; }

        /// <summary>
        /// Set by the host: a database import failed at the migration stage, so nothing was
        /// merged. WinForms shows a copyable report; the browser falls back to the error reply.
        /// </summary>
        public Action<Exception>? OnImportMigrationFailed { get; set; }

        /// <returns>true when the action was handled here.</returns>
        private bool TryHandleAppAction(BridgeMessage message)
        {
            switch (message.Action)
            {
                case "SaveItem":                 HandleSaveItem(message); break;
                case "SaveSettings":             HandleSaveSettings(message); break;
                case "ToggleFullscreen":         HandleToggleFullscreen(message); break;
                case "ToggleCustomScaling":      HandleToggleCustomScaling(message); break;
                case "SaveChromeTheme":          HandleSaveChromeTheme(message); break;
                case "TriggerTestAchievement":   HandleTriggerTestAchievement(message); break;
                case "TriggerRandomAchievement": HandleTriggerRandom(message, "achievement"); break;
                case "TriggerRandomMilestone":   HandleTriggerRandom(message, "milestone"); break;
                case "ListAchievementKeys":      HandleListAchievementKeys(message); break;
                case "CheckForUpdates":          HandleCheckForUpdates(message); break;
                case "SkipVersion":              HandleSkipVersion(message); break;
                case "ExecuteImportDB":          HandleExecuteImportDB(message); break;
                // Dialog-free halves of the file actions: the host picks the file, this reads it.
                case "PreviewImportDb":          HandlePreviewImportDb(message); break;
                case "PreviewTimelineImport":    HandlePreviewTimelineImport(message); break;
                case "ImportCalendarFile":       HandleImportCalendarFile(message); break;
                case "AddImagesToItem":          HandleAddImagesToItem(message); break;
                case "SetCharacterPortraitFromPath": HandleSetCharacterPortraitFromPath(message); break;
                default: return false;
            }
            return true;
        }

        // ── Items ──────────────────────────────────────────────────────────────

        private void HandleSaveItem(BridgeMessage message)
        {
            var payload = JsonSerializer.Deserialize<SaveItemPayload>(message.Payload.GetRawText(), _jsonOpts);
            var item = JsonSerializer.Deserialize<TimelineItem>(payload!.Item.GetRawText(), _jsonOpts);

            var itemRepo = new ItemRepo();
            string savedId = itemRepo.SaveItemFull(item!, payload.TagNames, payload.CharacterAppearances,
                payload.StoryRefs, payload.ChapterRefs);

            ReplyToVue(message.MessageId, new { status = "ok", itemId = savedId });

            // Push the saved item to every open page so canvases update without a full reload.
            // The edit screen is a separate window (WinForms) or tab (browser), so a broadcast
            // is the only route that reaches the timeline in both hosts.
            var savedItem = itemRepo.GetItemById(savedId);
            var links = itemRepo.GetItemLinksById(savedId);
            BridgeHub.Broadcast("ItemSaved", new
            {
                Item = savedItem,
                Tags = links.Tags,
                Characters = links.Characters,
                StoryRefs = links.StoryRefs,
                HasPicture = links.HasPicture,
            });
        }

        private sealed class SaveItemPayload
        {
            [JsonPropertyName("item")]
            public JsonElement Item { get; set; }

            [JsonPropertyName("tagNames")]
            public List<string> TagNames { get; set; } = null!;

            [JsonPropertyName("characterAppearances")]
            public List<ItemRepo.CharacterAppearanceInput> CharacterAppearances { get; set; } = null!;

            [JsonPropertyName("storyRefs")]
            public List<string> StoryRefs { get; set; } = null!;

            [JsonPropertyName("chapterRefs")]
            public List<string> ChapterRefs { get; set; } = null!;
        }

        // ── Timeline settings ──────────────────────────────────────────────────

        private void HandleSaveSettings(BridgeMessage message)
        {
            var p = message.Payload;
            int timelineId = p.GetProperty("timelineId").GetInt32();

            string layoutPresetId = "ls_default";
            if (p.TryGetProperty("layoutPresetId", out var lpEl) && lpEl.GetString() is string lp)
                layoutPresetId = lp;

            var settingsRepo = new SettingsRepo();
            var settings = settingsRepo.GetOrCreateSettings(timelineId);
            if (p.TryGetProperty("pixelsPerSubtick",   out var e3)) settings.PixelsPerSubtick   = e3.GetInt32();
            if (p.TryGetProperty("showGuides",         out var e4)) settings.ShowGuides         = e4.GetBoolean();
            if (p.TryGetProperty("displayRadius",      out var e5)) settings.DisplayRadius      = e5.GetInt32();
            if (p.TryGetProperty("isFullscreen",       out var e6)) settings.IsFullscreen       = e6.GetBoolean();
            if (p.TryGetProperty("useCustomScaling",   out var e7)) settings.UseCustomScaling   = e7.GetBoolean();
            if (p.TryGetProperty("customScale",        out var e8)) settings.CustomScale        = e8.GetSingle();
            if (p.TryGetProperty("panSpeedMultiplier", out var e9)) settings.PanSpeedMultiplier = e9.GetSingle();
            if (p.TryGetProperty("panDeadzone",        out var ea)) settings.PanDeadzone        = ea.GetInt32();
            if (p.TryGetProperty("keyboardPanSpeed",   out var ed)) settings.KeyboardPanSpeed   = ed.GetSingle();
            if (p.TryGetProperty("defaultItemColor",   out var eb)) settings.DefaultItemColor   = eb.GetString() ?? "#000000";
            if (p.TryGetProperty("headerMode",         out var ec)) settings.HeaderMode         = ec.GetInt32();

            settingsRepo.SaveSettings(settings);
            new TimelineRepo().SetLayoutPreset(timelineId, layoutPresetId);

            OnSettingsApplied?.Invoke(settings);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleToggleFullscreen(BridgeMessage message)
        {
            var settings = ToggleSetting(message, s => s.IsFullscreen = !s.IsFullscreen);
            if (settings != null)
                ReplyToVue(message.MessageId, new { status = "ok", isFullscreen = settings.IsFullscreen });
        }

        private void HandleToggleCustomScaling(BridgeMessage message)
        {
            var settings = ToggleSetting(message, s => s.UseCustomScaling = !s.UseCustomScaling);
            if (settings != null)
                ReplyToVue(message.MessageId, new
                {
                    status = "ok",
                    useCustomScaling = settings.UseCustomScaling,
                    scale = settings.UseCustomScaling && settings.CustomScale > 0 ? settings.CustomScale : 1.0f,
                });
        }

        /// <returns>null when the payload named no timeline.</returns>
        private SettingsItem? ToggleSetting(BridgeMessage message, Action<SettingsItem> flip)
        {
            int timelineId = message.Payload.TryGetProperty("timelineId", out var tlEl) ? tlEl.GetInt32() : 0;
            if (timelineId == 0) return null;

            var settingsRepo = new SettingsRepo();
            var settings = settingsRepo.GetOrCreateSettings(timelineId);
            flip(settings);
            settingsRepo.SaveSettings(settings);
            OnSettingsApplied?.Invoke(settings);
            return settings;
        }

        // ── App config ─────────────────────────────────────────────────────────

        private void HandleSaveChromeTheme(BridgeMessage message)
        {
            var theme = JsonSerializer.Deserialize<ChromeTheme>(message.Payload.GetRawText(), _jsonOpts);
            if (theme == null)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = "Invalid theme payload" });
                return;
            }
            AppConfig.Instance.ChromeTheme = theme;
            AppConfig.Instance.ThemeInitialized = true;
            AppConfig.Instance.Save();
            OnChromeThemeApplied?.Invoke();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        // ── Achievements (dev tools) ───────────────────────────────────────────

        private void HandleTriggerTestAchievement(BridgeMessage message)
        {
            StatsService.TriggerTestAchievement(message.Payload.GetProperty("key").GetString() ?? "");
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleTriggerRandom(BridgeMessage message, string tier)
        {
            StatsService.TriggerRandom(tier);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleListAchievementKeys(BridgeMessage message)
            => ReplyToVue(message.MessageId, StatsService.GetAllKeysSummary().ToList());

        // ── Update checker ─────────────────────────────────────────────────────

        private void HandleCheckForUpdates(BridgeMessage message)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var info = await UpdateChecker.CheckAsync(forceCheck: true);
                    ReplyToVue(message.MessageId, info == null
                        ? new { status = "ok", updateAvailable = false }
                        : (object)new
                        {
                            status          = "ok",
                            updateAvailable = true,
                            version         = info.Version,
                            url             = info.Url,
                            notes           = info.Notes,
                        });
                }
                catch (Exception ex)
                {
                    Logger.Error("CheckForUpdates", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message, detail = ex.ToString() });
                }
            });
        }

        private void HandleSkipVersion(BridgeMessage message)
        {
            UpdateChecker.SkipVersion(message.Payload.GetProperty("version").GetString()!);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        // ── File actions, minus the file picking ───────────────────────────────

        private void HandleExecuteImportDB(BridgeMessage message)
        {
            try
            {
                DatabaseImporter.Import(RequiredPath(message));
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (MigrationException ex)
            {
                // The backup could not be brought to the current schema; nothing was merged.
                Logger.Error("ExecuteImportDB", ex);
                OnImportMigrationFailed?.Invoke(ex);
                ReplyToVue(message.MessageId, new
                {
                    status = "error",
                    message = ex.Message,
                    detail = ex.ToString(),
                    reported = OnImportMigrationFailed != null,
                });
            }
        }

        private void HandlePreviewImportDb(BridgeMessage message)
        {
            var preview = DatabaseImporter.GetImportPreview(RequiredPath(message));
            ReplyToVue(message.MessageId, new { status = "ok", preview });
        }

        private void HandlePreviewTimelineImport(BridgeMessage message)
        {
            var preview = TimelineExporter.GetZipPreview(RequiredPath(message));
            ReplyToVue(message.MessageId, new { status = "ok", preview });
        }

        private void HandleImportCalendarFile(BridgeMessage message)
        {
            var (cal, nameCollision) = CalendarExporter.Import(RequiredPath(message));
            ReplyToVue(message.MessageId, new { status = "ok", calendarId = cal.Id, name = cal.Name, nameCollision });
        }

        private void HandleAddImagesToItem(BridgeMessage message)
        {
            var itemId = message.Payload.GetProperty("itemId").GetString()!;
            var mediaRepo = new MediaRepo();
            var pictures = new List<MediaItem>();
            foreach (var element in message.Payload.GetProperty("paths").EnumerateArray())
            {
                var filePath = element.GetString()!;
                if (!File.Exists(filePath)) throw new FileNotFoundException($"File not found: {filePath}", filePath);
                var picture = mediaRepo.ImportAndSaveMedia(filePath, Path.GetFileNameWithoutExtension(filePath), "");
                mediaRepo.LinkPictureToItem(picture.Id, itemId);
                pictures.Add(picture);
            }
            ReplyToVue(message.MessageId, new { status = "ok", Pictures = pictures });
        }

        /// <summary>
        /// The browser half of <c>SetCharacterPortrait</c> (BL-15): the page uploads the file first,
        /// so this one gets a path instead of opening a dialog. Desktop keeps its own handler in
        /// MessageRouter because there the dialog is the whole point.
        /// </summary>
        private void HandleSetCharacterPortraitFromPath(BridgeMessage message)
        {
            string characterId = message.Payload.GetProperty("characterId").GetString()!;
            string filePath = message.Payload.GetProperty("path").GetString()!;
            if (!File.Exists(filePath)) throw new FileNotFoundException($"File not found: {filePath}", filePath);

            var mediaRepo = new MediaRepo();
            var picture = mediaRepo.ImportAndSaveMedia(filePath, Path.GetFileNameWithoutExtension(filePath), "");
            string? replaced = new CharacterRepo().SetPortrait(characterId, picture.Id);
            if (replaced != null) mediaRepo.DeleteMedia(replaced);

            ReplyToVue(message.MessageId, new { status = "ok", Picture = picture });
        }

        private static string RequiredPath(BridgeMessage message)
        {
            var path = message.Payload.TryGetProperty("path", out var p) ? p.GetString() : null;
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Missing path parameter.");
            if (!File.Exists(path)) throw new FileNotFoundException($"File not found: {path}", path);
            return path;
        }
    }
}

using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Database;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;
using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2.Bridge
{
    public class MessageRouter
    {
        private readonly CoreWebView2 _webView;
        private readonly Form? _parentForm;
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        // Held so timeline can push year updates to the year-calendar window
        private static f_YearCalendar? _yearCalendarWindow;

        /// <summary>
        /// Called by f_Timeline when it is closing. Schedules all connected child
        /// windows to close asynchronously via BeginInvoke so we don't nest a
        /// WM_CLOSE inside another WM_CLOSE handler.
        /// </summary>
        public static void NotifyTimelineClosing()
        {
            // Year calendar
            var yearCal = _yearCalendarWindow;
            if (yearCal != null && !yearCal.IsDisposed && yearCal.IsHandleCreated)
                yearCal.BeginInvoke((MethodInvoker)yearCal.Close);

            // Calendar editor windows
            var toClose = new List<Form>();
            foreach (Form f in System.Windows.Forms.Application.OpenForms)
                if (f is f_Calendar)
                    toClose.Add(f);
            foreach (var f in toClose)
            {
                if (!f.IsDisposed && f.IsHandleCreated)
                    try { f.BeginInvoke((MethodInvoker)f.Close); } catch { }
            }

            // Edit-item singleton: force-close so it actually disposes rather than hiding
            f_AddEditItem.ForceCloseInstance();
        }

        public MessageRouter(CoreWebView2 webView, Form? parentForm = null)
        {
            _webView = webView;
            _parentForm = parentForm;
            _webView.WebMessageReceived += OnWebMessageReceived;
            StatsService.RegisterWebView(webView);
        }

        public void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            BridgeMessage? message = null;
            try
            {
                string rawJson = e.WebMessageAsJson;
                message = JsonSerializer.Deserialize<BridgeMessage>(rawJson);
            }
            catch (Exception ex)
            {
                Logger.Error("Bridge/Parse", ex);
                _parentForm?.BeginInvoke((MethodInvoker)(() =>
                    MessageBox.Show($"Failed to parse message from Vue:\n\n{ex}", "Bridge error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error)));
                return;
            }

            if (message == null) return;

            try
            {
                RouteMessage(message);
            }
            catch (Exception ex)
            {
                // Centralized safety net: log full stack, surface to the user, and —
                // crucially — always reply so the frontend Promise resolves instead of
                // hanging forever (api.ts request() has no timeout).
                Logger.Error($"Bridge/{message.Action}", ex);
                if (message.MessageId != null)
                {
                    ReplyToVue(message.MessageId, new
                    {
                        status = "error",
                        message = ex.Message,
                        detail = ex.ToString(),
                    });
                }
                _parentForm?.BeginInvoke((MethodInvoker)(() =>
                    MessageBox.Show($"Action '{message.Action}' failed:\n\n{ex}", "Backend error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error)));
            }
        }

        private void RouteMessage(BridgeMessage message)
        {
            switch (message.Action)
            {
                case "OpenAddEditItemWindow":   HandleOpenAddEditItemWindow(message); break;
                case "GetTimelineData":         HandleGetTimelineData(message); break;
                case "OpenTimeline":            HandleOpenTimeline(message); break;
                case "CreateProject":           HandleCreateProject(message); break;
                case "GetAllTimelines":         HandleGetAllTimelines(message); break;
                case "ImportDB":                HandleImportDB(message); break;

                // EditItem actions
                case "GetItemForEdit":          HandleGetItemForEdit(message); break;
                case "SaveItem":                HandleSaveItem(message); break;
                case "SearchTags":              HandleSearchTags(message); break;
                case "GetTimelineCharacters":   HandleGetTimelineCharacters(message); break;
                case "GetAllStories":           HandleGetAllStories(message); break;
                case "SearchBooks":             HandleSearchBooks(message); break;
                case "GetBookChapters":         HandleGetBookChapters(message); break;
                case "GetLayoutSettingsList":   HandleGetLayoutSettingsList(message); break;
                case "AddImageToItem":          HandleAddImageToItem(message); break;
                case "RemoveImageFromItem":     HandleRemoveImageFromItem(message); break;
                case "GetAllPictures":          HandleGetAllPictures(message); break;
                case "LinkImageToItem":         HandleLinkImageToItem(message); break;
                case "DeleteTimeline":          HandleDeleteTimeline(message); break;
                case "DuplicateTimeline":       HandleDuplicateTimeline(message); break;
                case "ExportTimeline":          HandleExportTimeline(message); break;
                case "SaveTimelineInfo":        HandleSaveTimelineInfo(message); break;
                case "SaveSettings":            HandleSaveSettings(message); break;
                case "GetSystemFonts":          HandleGetSystemFonts(message); break;
                case "GetCalendarList":         HandleGetCalendarList(message); break;
                case "GetLayoutSettingsById":   HandleGetLayoutSettingsById(message); break;
                case "CreateLayoutPreset":      HandleCreateLayoutPreset(message); break;
                case "SaveLayoutSettings":      HandleSaveLayoutSettings(message); break;
                case "ToggleFullscreen":        HandleToggleFullscreen(message); break;
                case "ToggleCustomScaling":     HandleToggleCustomScaling(message); break;

                // Window chrome (borderless)
                case "WindowMinimize":          HandleWindowMinimize(message); break;
                case "WindowMaximizeRestore":   HandleWindowMaximizeRestore(message); break;
                case "WindowGetMaximized":      HandleWindowGetMaximized(message); break;
                case "WindowClose":             HandleWindowClose(message); break;
                case "WindowStartDrag":         HandleWindowStartDrag(message); break;
                case "WindowGetTopMost":        HandleWindowGetTopMost(message); break;
                case "WindowSetTopMost":        HandleWindowSetTopMost(message); break;

                // Calendar actions
                case "GetCalendarById":             HandleGetCalendarById(message); break;
                case "SaveCalendar":                HandleSaveCalendar(message); break;
                case "CreateCalendar":              HandleCreateCalendar(message); break;
                case "DeleteCalendar":              HandleDeleteCalendar(message); break;
                case "OpenCalendarEditorWindow":    HandleOpenCalendarEditorWindow(message); break;

                // Year calendar window
                case "OpenYearCalendarWindow":      HandleOpenYearCalendarWindow(message); break;
                case "GetItemsForYear":             HandleGetItemsForYear(message); break;
                case "SetCalendarYear":             HandleSetCalendarYear(message); break;

                // Item deletion
                case "DeleteItem":          HandleDeleteItem(message); break;

                // Timeline notes
                case "SaveNote":            HandleSaveNote(message); break;
                case "DeleteNote":          HandleDeleteNote(message); break;

                // Hidden ranges
                case "GetHiddenRanges":     HandleGetHiddenRanges(message); break;
                case "SaveHiddenRange":     HandleSaveHiddenRange(message); break;
                case "DeleteHiddenRange":   HandleDeleteHiddenRange(message); break;

                // Timeline actions
                case "ShiftTimelineItems":      HandleShiftTimelineItems(message); break;
                case "ResetLayoutPreset":       HandleResetLayoutPreset(message); break;

                // App-level settings
                case "GetAppConfig":           HandleGetAppConfig(message); break;
                case "SaveChromeTheme":        HandleSaveChromeTheme(message); break;
                case "SavePerformantPanning":  HandleSavePerformantPanning(message); break;
                case "BrowseDataFolder":  HandleBrowseDataFolder(message); break;
                case "SetDataRoot":     HandleSetDataRoot(message); break;
                case "MoveDataFolder":  HandleMoveDataFolder(message); break;
                case "OpenDataFolder":  HandleOpenDataFolder(message); break;
                case "CreateBackup":                HandleCreateBackup(message); break;
                case "ExportFullDB":                HandleExportFullDB(message); break;
                case "BrowseAndPreviewImport":      HandleBrowseAndPreviewImport(message); break;
                case "ExecuteImportDB":             HandleExecuteImportDB(message); break;
                case "GetBackupSettings":           HandleGetBackupSettings(message); break;
                case "SaveBackupSettings":          HandleSaveBackupSettings(message); break;
                case "OpenBackupsFolder":           HandleOpenBackupsFolder(message); break;
                case "BrowseAndPreviewTimelineImport": HandleBrowseAndPreviewTimelineImport(message); break;
                case "ImportTimeline":              HandleImportTimeline(message); break;

                // Filter rules
                case "GetFilterRules":      HandleGetFilterRules(message); break;
                case "SaveFilterRule":      HandleSaveFilterRule(message); break;
                case "DeleteFilterRule":    HandleDeleteFilterRule(message); break;

                // Filter presets
                case "GetFilterPresets":    HandleGetFilterPresets(message); break;
                case "SaveFilterPreset":    HandleSaveFilterPreset(message); break;
                case "DeleteFilterPreset":  HandleDeleteFilterPreset(message); break;

                // Misc settings
                case "GetMiscSetting":  HandleGetMiscSetting(message); break;
                case "SetMiscSetting":  HandleSetMiscSetting(message); break;

                // App-level notification settings
                case "GetNotificationSettings":  HandleGetNotificationSettings(message); break;
                case "SaveNotificationSettings": HandleSaveNotificationSettings(message); break;

                // Timeline mini mode
                case "SaveTimelineMinimised": HandleSaveTimelineMinimised(message); break;

                // Achievement dev tools
                case "TriggerTestAchievement": HandleTriggerTestAchievement(message); break;
                case "TriggerRandomAchievement": HandleTriggerRandom(message, "achievement"); break;
                case "TriggerRandomMilestone":   HandleTriggerRandom(message, "milestone"); break;
                case "ListAchievementKeys":      HandleListAchievementKeys(message); break;

                default:
                    // Reply so a request() for a typo'd action fails visibly instead of
                    // hanging its Promise forever. Console.WriteLine goes nowhere in WinForms.
                    Logger.Warn("Bridge/Route", $"Unknown action: {message.Action}");
                    if (message.MessageId != null)
                        ReplyToVue(message.MessageId, new { status = "error", message = $"Unknown action: {message.Action}" });
                    break;
            }
        }

        // -----------------------------------------------------------------------
        // Existing handlers
        // -----------------------------------------------------------------------

        private void HandleGetTimelineData(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            ItemRepo item_repo = new ItemRepo();
            NoteRepo notes_repo = new NoteRepo();
            JsonElement ftd_pl_id = message.Payload.GetProperty("id");
            if (ftd_pl_id.TryGetInt32(out int gtd_timeline_id))
            {
                var timelineObject = new FullTimelineProject()
                {
                    Project = repo.GetTimelineById(gtd_timeline_id),
                    Items = item_repo.GetItemsByTimeline(gtd_timeline_id).ToArray(),
                    Notes = notes_repo.GetTimelineNotes(gtd_timeline_id).ToArray(),
                    HiddenRanges = new HiddenRangeRepo().GetByTimeline(gtd_timeline_id).ToArray(),
                    ItemTags = item_repo.GetAllItemTagsForTimeline(gtd_timeline_id).ToArray(),
                    ItemCharacters = item_repo.GetAllItemCharactersForTimeline(gtd_timeline_id).ToArray(),
                    Characters = new CharacterRepo().GetCharactersByTimeline(gtd_timeline_id).ToArray(),
                    ItemStoryRefs = item_repo.GetAllItemStoryRefsForTimeline(gtd_timeline_id).ToArray(),
                    ItemsWithPictures = item_repo.GetItemsWithPicturesForTimeline(gtd_timeline_id).ToArray(),
                };
                ReplyToVue(message.MessageId, timelineObject);
                return;
            }
            ReplyToVue(message.MessageId, null);
        }

        private void HandleOpenTimeline(BridgeMessage message)
        {
            f_Main? mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main") mainForm = f as f_Main;
            }

            f_Timeline TimelineForm = f_Timeline.TakePrewarmed() ?? new f_Timeline();
            JsonElement ot_pl_id = message.Payload.GetProperty("id");
            if (ot_pl_id.TryGetInt32(out int ot_timeline_id))
                TimelineForm.TimelineId = ot_timeline_id;

            TimelineForm.Show();
            if (TimelineForm.Visible && mainForm != null)
                mainForm.Hide();
        }

        private void HandleCreateProject(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            JsonElement pl = message.Payload.GetProperty("title");
            var title = pl.GetString();

            string author = "";
            if (message.Payload.TryGetProperty("author", out var authorEl) && authorEl.GetString() is string a)
                author = a;

            string? calendarId = null;
            if (message.Payload.TryGetProperty("calendarId", out var calEl) && calEl.GetString() is string cal)
                calendarId = cal;

            int ret_id = -1;
            if (!string.IsNullOrEmpty(title))
                ret_id = repo.CreateTimeline(title, author, calendarId);
            ReplyToVue(message.MessageId, ret_id);
        }

        private void HandleGetAllTimelines(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            IEnumerable<TimelineInfo> timelines = repo.GetAll();
            ReplyToVue(message.MessageId, new { status = "ok", data = timelines });
        }

        private void HandleImportDB(BridgeMessage message)
        {
            bool ok = DatabaseImporter.HandleDBImport();
            ReplyToVue(message.MessageId, ok
                ? (object)new { status = "ok" }
                : new { status = "error", message = "Import failed or was cancelled — see log for details." });
        }

        private void HandleOpenAddEditItemWindow(BridgeMessage message)
        {
            int timelineId = 0;
            string? itemId = null;
            int typeId = 1;

            if (message.Payload.TryGetProperty("timelineId", out var tlProp) && tlProp.TryGetInt32(out int tl))
                timelineId = tl;
            if (message.Payload.TryGetProperty("itemId", out var idProp))
                itemId = idProp.GetString();
            if (message.Payload.TryGetProperty("typeId", out var typeProp) && typeProp.TryGetInt32(out int ty))
                typeId = ty;

            double? year = null;
            if (message.Payload.TryGetProperty("year", out var yearProp) && yearProp.TryGetDouble(out double y))
                year = y;

            int? granularity = null;
            if (message.Payload.TryGetProperty("granularity", out var granProp) && granProp.TryGetInt32(out int g))
                granularity = g;

            // GetOrCreate() returns the singleton, promoting the pre-warmed form if available.
            // The window is never truly closed (OnFormClosing hides it instead), so subsequent
            // opens skip WebView2 init — only re-navigate, which hits V8's in-memory bytecode cache.
            var addEditItemWindow = f_AddEditItem.GetOrCreate();

            // Wire a callback so the edit window can push the saved item directly into
            // this (the caller's) WebView2 without a full timeline reload.
            addEditItemWindow.NotifyCallback = (action, payload) => SendToVue(action, payload);

            // ReopenWithParams sets props and re-navigates in-place if WebView2 is ready;
            // otherwise AddEditItem_Load picks up the params on first Show().
            addEditItemWindow.ReopenWithParams(timelineId, itemId, typeId, year, granularity);

            // Use Show() instead of ShowDialog(): calling ShowDialog from inside a
            // WebView2 WebMessageReceived handler creates a nested COM message loop
            // that causes EnsureCoreWebView2Async in the new window to E_ABORT.
            addEditItemWindow.Show(_parentForm);
            addEditItemWindow.TopMost = _parentForm.TopMost;
            addEditItemWindow.Activate();
        }

        // -----------------------------------------------------------------------
        // EditItem handlers
        // -----------------------------------------------------------------------

        private void HandleGetItemForEdit(BridgeMessage message)
        {
            string? itemId = null;
            if (message.Payload.TryGetProperty("itemId", out var idProp))
                itemId = idProp.GetString();

            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            int typeId = 1;
            if (message.Payload.TryGetProperty("typeId", out var tProp) && tProp.TryGetInt32(out int ty))
                typeId = ty;

            var itemRepo = new ItemRepo();
            var timelineRepo = new TimelineRepo();

            TimelineItem item;
            if (!string.IsNullOrEmpty(itemId))
            {
                item = itemRepo.GetItemById(itemId);
                if (item == null)
                {
                    Logger.Warn("Bridge/GetItemForEdit", $"Item not found: {itemId}");
                    ReplyToVue(message.MessageId, new { status = "error", message = $"Item {itemId} no longer exists." });
                    return;
                }
            }
            else
            {
                item = new TimelineItem { TimelineId = timelineId, TypeId = typeId };
            }

            var timeline = timelineRepo.GetTimelineById(timelineId);

            ReplyToVue(message.MessageId, new
            {
                Item = item,
                Tags = itemRepo.GetItemTags(item.Id),
                Characters = itemRepo.GetItemCharacterAppearances(item.Id),
                StoryRefs = itemRepo.GetItemStoryRefs(item.Id),
                ChapterRefs = itemRepo.GetItemChapterRefs(item.Id),
                Calendar = timeline.Calendar,
                Pictures = string.IsNullOrEmpty(itemId)
                    ? new List<MediaItem>()
                    : new MediaRepo().GetItemPictures(item.Id).ToList(),
            });
        }

        private class SaveItemPayload
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

        private void HandleSaveItem(BridgeMessage message)
        {
            try
            {
                var payload = JsonSerializer.Deserialize<SaveItemPayload>(message.Payload.GetRawText(), _jsonOpts);
                var item = JsonSerializer.Deserialize<TimelineItem>(payload!.Item.GetRawText(), _jsonOpts);

                var itemRepo = new ItemRepo();
                string savedId = itemRepo.SaveItemFull(item!, payload.TagNames, payload.CharacterAppearances,
                    payload.StoryRefs, payload.ChapterRefs);

                ReplyToVue(message.MessageId, new { status = "ok", itemId = savedId });

                // Push the saved item directly to the caller (timeline) WebView2 so the
                // canvas updates without a full reload.
                if (_parentForm is f_AddEditItem addEdit && addEdit.NotifyCallback != null)
                {
                    var savedItem = itemRepo.GetItemById(savedId);
                    var links = itemRepo.GetItemLinksById(savedId);
                    addEdit.NotifyCallback("ItemSaved", new { Item = savedItem, Tags = links.Tags, Characters = links.Characters, StoryRefs = links.StoryRefs, HasPicture = links.HasPicture });
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleSaveItem] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message, detail = ex.ToString() });
            }
        }

        private void HandleSearchTags(BridgeMessage message)
        {
            string query = message.Payload.GetProperty("query").GetString() ?? "";
            var tags = new TagRepo().SearchTags(query);
            ReplyToVue(message.MessageId, tags);
        }

        private void HandleGetTimelineCharacters(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            var characters = new CharacterRepo().GetCharactersByTimeline(timelineId);
            ReplyToVue(message.MessageId, characters);
        }

        private void HandleGetAllStories(BridgeMessage message)
        {
            var stories = new StoryRepo().GetAllStories();
            ReplyToVue(message.MessageId, stories);
        }

        private void HandleSearchBooks(BridgeMessage message)
        {
            string query = message.Payload.GetProperty("query").GetString() ?? "";
            var books = new BookRepo().SearchBooks(query);
            ReplyToVue(message.MessageId, books);
        }

        private void HandleGetBookChapters(BridgeMessage message)
        {
            string? bookId = message.Payload.GetProperty("bookId").GetString();
            var chapters = new BookRepo().GetChaptersForBook(bookId!);
            ReplyToVue(message.MessageId, chapters);
        }

        private void HandleGetLayoutSettingsList(BridgeMessage message)
        {
            var presets = new LayoutSettingsRepo().GetAll()
                .Select(ls => new { ls.Id, ls.Name });
            ReplyToVue(message.MessageId, presets);
        }

        private void HandleDeleteItem(BridgeMessage message)
        {
            string? itemId = message.Payload.GetProperty("itemId").GetString();
            new ItemRepo().DeleteItem(itemId!);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleSaveNote(BridgeMessage message)
        {
            try
            {
                var note = JsonSerializer.Deserialize<NoteItem>(message.Payload.GetRawText(), _jsonOpts);
                if (note == null) { ReplyToVue(message.MessageId, new { status = "error", message = "Invalid payload" }); return; }
                string savedId = new NoteRepo().SaveNote(note);
                ReplyToVue(message.MessageId, new { status = "ok", noteId = savedId });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleDeleteNote(BridgeMessage message)
        {
            try
            {
                string? noteId = message.Payload.GetProperty("noteId").GetString();
                new NoteRepo().DeleteNote(noteId!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleDeleteTimeline(BridgeMessage message)
        {
            int id = message.Payload.GetProperty("id").GetInt32();
            new TimelineRepo().DeleteTimeline(id);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleDuplicateTimeline(BridgeMessage message)
        {
            int id = message.Payload.GetProperty("id").GetInt32();
            string newTitle = message.Payload.GetProperty("newTitle").GetString() ?? "Duplicate";
            try
            {
                int newId = new TimelineRepo().DuplicateTimeline(id, newTitle);
                ReplyToVue(message.MessageId, new { status = "ok", newId });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleSaveTimelineInfo(BridgeMessage message)
        {
            int id          = message.Payload.GetProperty("id").GetInt32();
            string title    = message.Payload.GetProperty("title").GetString() ?? "";
            string author   = message.Payload.GetProperty("author").GetString() ?? "";
            string desc     = message.Payload.GetProperty("description").GetString() ?? "";
            int startYear   = message.Payload.GetProperty("startYear").GetInt32();
            string? color      = message.Payload.TryGetProperty("color", out var cp)  ? cp.GetString()  : null;
            string? calendarId = message.Payload.TryGetProperty("calendarId", out var cal) ? cal.GetString() : null;

            new TimelineRepo().UpdateTimelineInfo(id, title, author, desc, startYear, color, calendarId);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleSaveSettings(BridgeMessage message)
        {
            var p = message.Payload;
            int timelineId = p.GetProperty("timelineId").GetInt32();

            string layoutPresetId = "ls_default";
            if (p.TryGetProperty("layoutPresetId", out var lpEl) && lpEl.GetString() is string lp)
                layoutPresetId = lp;

            var settingsRepo = new SettingsRepo();
            var settings = settingsRepo.GetOrCreateSettings(timelineId);
            if (p.TryGetProperty("pixelsPerSubtick", out var e3)) settings.PixelsPerSubtick = e3.GetInt32();
            if (p.TryGetProperty("showGuides",       out var e4)) settings.ShowGuides       = e4.GetBoolean();
            if (p.TryGetProperty("displayRadius",    out var e5)) settings.DisplayRadius    = e5.GetInt32();
            if (p.TryGetProperty("isFullscreen",     out var e6)) settings.IsFullscreen     = e6.GetBoolean();
            if (p.TryGetProperty("useCustomScaling",    out var e7)) settings.UseCustomScaling    = e7.GetBoolean();
            if (p.TryGetProperty("customScale",          out var e8)) settings.CustomScale          = e8.GetSingle();
            if (p.TryGetProperty("panSpeedMultiplier",   out var e9)) settings.PanSpeedMultiplier   = e9.GetSingle();
            if (p.TryGetProperty("panDeadzone",          out var ea)) settings.PanDeadzone          = ea.GetInt32();

            settingsRepo.SaveSettings(settings);
            new TimelineRepo().SetLayoutPreset(timelineId, layoutPresetId);

            if (_parentForm != null)
            {
                _parentForm.BeginInvoke((MethodInvoker)(() =>
                {
                    if (_parentForm is Forms.BorderlessFormBase bf)
                        bf.IsFullscreenMode = settings.IsFullscreen;

                    if (settings.IsFullscreen)
                    {
                        if (_parentForm.WindowState == FormWindowState.Maximized)
                            _parentForm.WindowState = FormWindowState.Normal;
                        _parentForm.WindowState = FormWindowState.Maximized;
                    }
                    else
                    {
                        if (_parentForm.WindowState == FormWindowState.Maximized)
                            _parentForm.WindowState = FormWindowState.Normal;
                    }
                }));
            }

            double zoom = (settings.UseCustomScaling && settings.CustomScale > 0) ? settings.CustomScale : 1.0;
            _ = _webView.ExecuteScriptAsync($"document.documentElement.style.zoom = '{zoom:F2}'");

            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleSaveTimelineMinimised(BridgeMessage message)
        {
            var p = message.Payload;
            int timelineId   = p.GetProperty("timelineId").GetInt32();
            bool minimised   = p.GetProperty("minimised").GetBoolean();

            var repo     = new SettingsRepo();
            var settings = repo.GetOrCreateSettings(timelineId);
            settings.TimelineMinimised = minimised;
            repo.SaveSettings(settings);

            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleGetLayoutSettingsById(BridgeMessage message)
        {
            try
            {
                string id = message.Payload.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "ls_default" : "ls_default";
                var ls = new LayoutSettingsRepo().GetById(id);
                ReplyToVue(message.MessageId, ls);
            }
            catch (Exception ex)
            {
                // Frontend expects LayoutSettings|null here, so keep the null reply —
                // but never swallow the error silently (project rule).
                Logger.Error("Bridge/GetLayoutSettingsById", ex);
                ReplyToVue(message.MessageId, null);
            }
        }

        private void HandleCreateLayoutPreset(BridgeMessage message)
        {
            try
            {
                string name      = message.Payload.TryGetProperty("name",      out var np) ? np.GetString() ?? "New Preset" : "New Preset";
                string cloneFrom = message.Payload.TryGetProperty("cloneFrom", out var cp) ? cp.GetString() ?? "ls_default" : "ls_default";

                var repo   = new LayoutSettingsRepo();
                var source = repo.GetById(cloneFrom);
                source.Id   = Guid.NewGuid().ToString();
                source.Name = name;
                repo.SaveLayoutSettings(source);

                ReplyToVue(message.MessageId, new { status = "ok", preset = new { source.Id, source.Name }, layoutSettings = source });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleToggleFullscreen(BridgeMessage message)
        {
            int timelineId = message.Payload.TryGetProperty("timelineId", out var tlEl) ? tlEl.GetInt32() : 0;
            if (timelineId == 0 || _parentForm == null) return;

            var settingsRepo = new SettingsRepo();
            var settings = settingsRepo.GetOrCreateSettings(timelineId);
            settings.IsFullscreen = !settings.IsFullscreen;
            settingsRepo.SaveSettings(settings);

            bool goFullscreen = settings.IsFullscreen;
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                if (_parentForm is Forms.BorderlessFormBase bf)
                    bf.IsFullscreenMode = goFullscreen;

                if (goFullscreen)
                {
                    if (_parentForm.WindowState == FormWindowState.Maximized)
                        _parentForm.WindowState = FormWindowState.Normal;
                    _parentForm.WindowState = FormWindowState.Maximized;
                }
                else
                {
                    _parentForm.WindowState = FormWindowState.Normal;
                }
            }));
        }

        private void HandleToggleCustomScaling(BridgeMessage message)
        {
            int timelineId = message.Payload.TryGetProperty("timelineId", out var tlEl) ? tlEl.GetInt32() : 0;
            if (timelineId == 0) return;

            var settingsRepo = new SettingsRepo();
            var settings = settingsRepo.GetOrCreateSettings(timelineId);
            settings.UseCustomScaling = !settings.UseCustomScaling;
            settingsRepo.SaveSettings(settings);

            double zoom = (settings.UseCustomScaling && settings.CustomScale > 0) ? settings.CustomScale : 1.0;
            _ = _webView.ExecuteScriptAsync($"document.documentElement.style.zoom = '{zoom:F2}'");
        }

        // ── Borderless window chrome ───────────────────────────────────────────

        private void HandleWindowMinimize(BridgeMessage message)
        {
            if (_parentForm == null) return;
            _parentForm.BeginInvoke((MethodInvoker)(() =>
                _parentForm.WindowState = FormWindowState.Minimized));
        }

        private void HandleWindowMaximizeRestore(BridgeMessage message)
        {
            if (_parentForm == null) return;
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                if (_parentForm is Forms.BorderlessFormBase bf)
                {
                    if (bf.IsManuallyMaximized)
                        bf.RestoreFromMaximize();
                    else if (_parentForm.WindowState == FormWindowState.Maximized)
                        _parentForm.WindowState = FormWindowState.Normal;
                    else
                        bf.MaximizeToCurrentScreen();
                }
                else
                {
                    _parentForm.WindowState = _parentForm.WindowState == FormWindowState.Maximized
                        ? FormWindowState.Normal : FormWindowState.Maximized;
                }
            }));
        }

        private void HandleWindowGetMaximized(BridgeMessage message)
        {
            bool maximized = false;
            if (_parentForm != null)
                _parentForm.Invoke((MethodInvoker)(() =>
                {
                    maximized = _parentForm is Forms.BorderlessFormBase bf
                        ? bf.IsManuallyMaximized || _parentForm.WindowState == FormWindowState.Maximized
                        : _parentForm.WindowState == FormWindowState.Maximized;
                }));
            ReplyToVue(message.MessageId, new { isMaximized = maximized });
        }

        private void HandleWindowClose(BridgeMessage message)
        {
            if (_parentForm == null) return;
            _parentForm.BeginInvoke((MethodInvoker)(() => _parentForm.Close()));
        }

        private void HandleWindowStartDrag(BridgeMessage message)
        {
            if (_parentForm == null) return;
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                if (_parentForm is Forms.BorderlessFormBase bf)
                    bf.StartWindowDrag();
            }));
        }

        private void HandleWindowGetTopMost(BridgeMessage message)
        {
            bool topmost = _parentForm?.TopMost ?? false;
            ReplyToVue(message.MessageId, new { isTopmost = topmost });
        }

        private void HandleWindowSetTopMost(BridgeMessage message)
        {
            if (_parentForm == null) return;
            bool topmost = message.Payload.GetProperty("topmost").GetBoolean();
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                // Windows strips WS_EX_TOPMOST from the owner whenever an owned window
                // goes non-topmost. Always operate on the root owner so the OS change is
                // intentional and consistent, then push the new state to every window's Vue.
                Form root = _parentForm;
                while (root.Owner is Form owner)
                    root = owner;
                root.TopMost = topmost;
                PropagateTopMostTree(root, topmost);
            }));
        }

        private static void PropagateTopMostTree(Form form, bool topmost)
        {
            if (form is Forms.BorderlessFormBase bf)
                bf.PropagateTopMost(topmost);
            foreach (Form owned in form.OwnedForms)
                PropagateTopMostTree(owned, topmost);
        }

        private void HandleSaveLayoutSettings(BridgeMessage message)
        {
            try
            {
                var ls = JsonSerializer.Deserialize<LayoutSettingsItem>(message.Payload.GetRawText(), _jsonOpts);
                if (ls == null)
                {
                    ReplyToVue(message.MessageId, new { status = "error", message = "Invalid payload" });
                    return;
                }
                new LayoutSettingsRepo().SaveLayoutSettings(ls);
                ReplyToVue(message.MessageId, new { status = "ok", layoutSettings = ls });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleGetSystemFonts(BridgeMessage message)
        {
            var fonts = System.Drawing.FontFamily.Families
                .Select(f => f.Name)
                .OrderBy(n => n)
                .ToArray();
            ReplyToVue(message.MessageId, fonts);
        }

        private void HandleGetCalendarList(BridgeMessage message)
        {
            var calendars = new CalendarRepo().GetAll()
                .Select(c => new { c.Id, c.Name });
            ReplyToVue(message.MessageId, calendars);
        }

        private void HandleExportTimeline(BridgeMessage message)
        {
            int  id         = message.Payload.GetProperty("id").GetInt32();
            bool includeIds = message.Payload.TryGetProperty("includeIds", out var ip) && ip.GetBoolean();
            bool inclMedia  = message.Payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();

            var timeline = new TimelineRepo().GetTimelineById(id);
            string safeName = string.Concat(timeline.Title.Split(Path.GetInvalidFileNameChars()));

            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new SaveFileDialog
                {
                    Title      = "Export Timeline",
                    Filter     = "Story Timeline files (*.stlm)|*.stlm|All files (*.*)|*.*",
                    FileName   = $"{safeName}.stlm",
                    DefaultExt = "stlm",
                };

                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }

                try
                {
                    TimelineExporter.ExportToZip(id, dlg.FileName, includeIds, inclMedia);
                    ReplyToVue(message.MessageId, new { status = "ok", path = dlg.FileName });
                }
                catch (Exception ex)
                {
                    Logger.Error("ExportTimeline", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        // -----------------------------------------------------------------------
        // Calendar handlers
        // -----------------------------------------------------------------------

        private void HandleGetCalendarById(BridgeMessage message)
        {
            try
            {
                string? id = message.Payload.GetProperty("id").GetString();
                var cal = new CalendarRepo().GetCalendarById(id!);
                ReplyToVue(message.MessageId, cal);
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleSaveCalendar(BridgeMessage message)
        {
            try
            {
                var cal = JsonSerializer.Deserialize<CalendarItem>(message.Payload.GetRawText(), _jsonOpts);
                if (cal == null) { ReplyToVue(message.MessageId, new { status = "error", message = "Invalid payload" }); return; }
                new CalendarRepo().SaveCalendarWithLod(cal);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleCreateCalendar(BridgeMessage message)
        {
            try
            {
                string cloneFrom = "cal_default_gregorian";
                if (message.Payload.TryGetProperty("cloneFrom", out var cfProp) && cfProp.GetString() != null)
                    cloneFrom = cfProp.GetString()!;

                var calRepo = new CalendarRepo();
                var lodRepo = new LodRepo();

                var source = calRepo.GetCalendarById(cloneFrom);

                var newLod = new LodItem { Id = Guid.NewGuid().ToString(), Name = "Custom LOD Profile", Profile = source.LodProfile?.Profile ?? "[]" };
                lodRepo.SaveLodProfile(newLod);

                source.Id = Guid.NewGuid().ToString();
                source.Name = "New Calendar";
                source.LodProfileId = newLod.Id;
                source.LodProfile = newLod;
                calRepo.SaveCalendar(source);

                ReplyToVue(message.MessageId, new { status = "ok", calendarId = source.Id });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleDeleteCalendar(BridgeMessage message)
        {
            try
            {
                string? id = message.Payload.GetProperty("id").GetString();
                new CalendarRepo().DeleteCalendar(id!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleOpenCalendarEditorWindow(BridgeMessage message)
        {
            string? calendarId = null;
            if (message.Payload.TryGetProperty("calendarId", out var idProp))
                calendarId = idProp.GetString();

            var calendarWindow = f_Calendar.TakePrewarmed() ?? new f_Calendar();
            calendarWindow.CalendarId = calendarId;
            calendarWindow.Show(_parentForm);
            calendarWindow.TopMost = _parentForm.TopMost;
            calendarWindow.Activate();
            // Re-warm for next use
            f_Calendar.BeginPrewarm();
        }

        private void HandleOpenYearCalendarWindow(BridgeMessage message)
        {
            // Toggle: close if already open, open if not
            if (_yearCalendarWindow != null && !_yearCalendarWindow.IsDisposed)
            {
                _yearCalendarWindow.Close();
                _yearCalendarWindow = null;
                ReplyToVue(message.MessageId, new { status = "closed" });
                return;
            }

            int timelineId = 0;
            if (message.Payload.TryGetProperty("timelineId", out var tidProp))
                tidProp.TryGetInt32(out timelineId);

            string? calendarId = null;
            if (message.Payload.TryGetProperty("calendarId", out var cidProp))
                calendarId = cidProp.GetString();

            _yearCalendarWindow = f_YearCalendar.TakePrewarmed() ?? new f_YearCalendar();
            _yearCalendarWindow.TimelineId = timelineId;
            _yearCalendarWindow.CalendarId = calendarId;
            _yearCalendarWindow.FormClosed += (_, _) => { _yearCalendarWindow = null; SendToVue("YearCalendarClosed", new { }); };
            _yearCalendarWindow.Show(_parentForm);
            _yearCalendarWindow.TopMost = _parentForm.TopMost;
            _yearCalendarWindow.Activate();
            // Re-warm for next use
            f_YearCalendar.BeginPrewarm();

            ReplyToVue(message.MessageId, new { status = "opened" });
        }

        private void HandleGetItemsForYear(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            int year       = message.Payload.GetProperty("year").GetInt32();

            var items = new ItemRepo().GetItemsByYear(timelineId, year);
            ReplyToVue(message.MessageId, new { status = "ok", items });
        }

        private void HandleSetCalendarYear(BridgeMessage message)
        {
            // Fire-and-forget: forward year to the open year-calendar window if any
            if (_yearCalendarWindow == null || _yearCalendarWindow.IsDisposed) return;
            if (!message.Payload.TryGetProperty("year", out var yearProp)) return;
            if (!yearProp.TryGetInt32(out int year)) return;

            _yearCalendarWindow.BeginInvoke((MethodInvoker)(() =>
                _yearCalendarWindow.SendYearUpdate(year)));
        }

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        public void SendToVue(string action, object? payload = null)
        {
            var response = new { action, payload };
            string json = JsonSerializer.Serialize(response);
            _webView.PostWebMessageAsJson(json);
        }

        private void ReplyToVue(int? messageId, object? payload)
        {
            var response = new { messageId, payload };
            string json = JsonSerializer.Serialize(response);
            _webView.PostWebMessageAsJson(json);
        }

        // -----------------------------------------------------------------------
        // Image handlers
        // -----------------------------------------------------------------------

        private void HandleAddImageToItem(BridgeMessage message)
        {
            var itemId = message.Payload.GetProperty("itemId").GetString()!;

            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dialog = new OpenFileDialog
                {
                    Title = "Select Images",
                    Filter = "Image files|*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp;*.tiff|All files|*.*",
                    Multiselect = true,
                };

                if (dialog.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }

                try
                {
                    var mediaRepo = new MediaRepo();
                    var pictures = new List<MediaItem>();
                    foreach (var filePath in dialog.FileNames)
                    {
                        var title = Path.GetFileNameWithoutExtension(filePath);
                        var picture = mediaRepo.ImportAndSaveMedia(filePath, title, "");
                        mediaRepo.LinkPictureToItem(picture.Id, itemId);
                        pictures.Add(picture);
                    }
                    ReplyToVue(message.MessageId, new { status = "ok", Pictures = pictures });
                }
                catch (Exception ex)
                {
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleGetAllPictures(BridgeMessage message)
        {
            ReplyToVue(message.MessageId, new MediaRepo().GetAllMedia().ToList());
        }

        private void HandleLinkImageToItem(BridgeMessage message)
        {
            var pictureId = message.Payload.GetProperty("pictureId").GetString()!;
            var itemId    = message.Payload.GetProperty("itemId").GetString()!;
            try
            {
                new MediaRepo().LinkPictureToItem(pictureId, itemId);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleRemoveImageFromItem(BridgeMessage message)
        {
            var pictureId = message.Payload.GetProperty("pictureId").GetString()!;
            var itemId    = message.Payload.GetProperty("itemId").GetString()!;
            try
            {
                new MediaRepo().UnlinkAndPruneImage(pictureId, itemId);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        // -----------------------------------------------------------------------
        // Hidden range handlers
        // -----------------------------------------------------------------------

        private void HandleGetHiddenRanges(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            ReplyToVue(message.MessageId, new HiddenRangeRepo().GetByTimeline(timelineId).ToList());
        }

        private void HandleSaveHiddenRange(BridgeMessage message)
        {
            try
            {
                int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
                int startYear  = message.Payload.GetProperty("startYear").GetInt32();
                int endYear    = message.Payload.GetProperty("endYear").GetInt32();
                string? label  = message.Payload.TryGetProperty("label", out var lp) ? lp.GetString() : null;
                int id = 0;
                if (message.Payload.TryGetProperty("id", out var idProp) && idProp.TryGetInt32(out int existingId))
                    id = existingId;

                var item = new HiddenRangeItem { Id = id, TimelineId = timelineId, StartYear = startYear, EndYear = endYear, Label = label };
                int savedId = new HiddenRangeRepo().Save(item);
                item.Id = savedId;
                ReplyToVue(message.MessageId, new { status = "ok", range = item });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleDeleteHiddenRange(BridgeMessage message)
        {
            try
            {
                int id = message.Payload.GetProperty("id").GetInt32();
                new HiddenRangeRepo().Delete(id);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        // -----------------------------------------------------------------------
        // Timeline action handlers
        // -----------------------------------------------------------------------

        private void HandleShiftTimelineItems(BridgeMessage message)
        {
            try
            {
                int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
                int delta      = message.Payload.GetProperty("delta").GetInt32();
                if (delta == 0) { ReplyToVue(message.MessageId, new { status = "ok", affected = 0 }); return; }
                int affected = new ItemRepo().ShiftItems(timelineId, delta);
                ReplyToVue(message.MessageId, new { status = "ok", affected });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleResetLayoutPreset(BridgeMessage message)
        {
            try
            {
                var id = message.Payload.GetProperty("id").GetString()!;
                DbInitializer.ResetBuiltinPreset(id);
                var fresh = new LayoutSettingsRepo().GetById(id);
                ReplyToVue(message.MessageId, new { status = "ok", layoutSettings = fresh });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ResetLayoutPreset] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message, detail = ex.ToString() });
            }
        }

        // -----------------------------------------------------------------------
        // App-level settings handlers
        // -----------------------------------------------------------------------

        private static bool OsPrefersDark()
        {
            try
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                // AppsUseLightTheme: 0 = dark, 1 = light (absent = dark)
                return key?.GetValue("AppsUseLightTheme") is int v ? v == 0 : true;
            }
            catch { return true; }
        }

        private void HandleGetAppConfig(BridgeMessage message)
        {
            var cfg = AppConfig.Instance;
            ReplyToVue(message.MessageId, new
            {
                DataRoot               = cfg.DataRoot,
                DbPath                 = cfg.GetDbPath(),
                MediaFolder            = cfg.GetMediaFolder(),
                chromeTheme            = cfg.ChromeTheme,
                themeInitialized       = cfg.ThemeInitialized,
                systemPrefersDark      = OsPrefersDark(),
                performantPanning      = cfg.PerformantPanning,
                showAchievementPopups  = cfg.ShowAchievementPopups,
                achievementSound       = cfg.AchievementSound,
            });
        }

        private void HandleGetNotificationSettings(BridgeMessage message)
        {
            var cfg = AppConfig.Instance;
            ReplyToVue(message.MessageId, new
            {
                showAchievementPopups = cfg.ShowAchievementPopups,
                achievementSound      = cfg.AchievementSound,
            });
        }

        private void HandleSaveNotificationSettings(BridgeMessage message)
        {
            if (message.Payload.TryGetProperty("showAchievementPopups", out var sp))
                AppConfig.Instance.ShowAchievementPopups = sp.GetBoolean();
            if (message.Payload.TryGetProperty("achievementSound", out var as_))
                AppConfig.Instance.AchievementSound = as_.GetBoolean();
            AppConfig.Instance.Save();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleTriggerTestAchievement(BridgeMessage message)
        {
            string key = message.Payload.GetProperty("key").GetString() ?? "";
            StatsService.TriggerTestAchievement(key);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleTriggerRandom(BridgeMessage message, string tier)
        {
            StatsService.TriggerRandom(tier);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleListAchievementKeys(BridgeMessage message)
        {
            var keys = StatsService.GetAllKeysSummary().ToList();
            ReplyToVue(message.MessageId, keys);
        }

        private void HandleSavePerformantPanning(BridgeMessage message)
        {
            var value = message.Payload.GetProperty("value").GetBoolean();
            AppConfig.Instance.PerformantPanning = value;
            AppConfig.Instance.Save();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleSaveChromeTheme(BridgeMessage message)
        {
            var theme = JsonSerializer.Deserialize<ChromeTheme>(
                message.Payload.GetRawText(), _jsonOpts);
            if (theme == null)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = "Invalid theme payload" });
                return;
            }
            AppConfig.Instance.ChromeTheme = theme;
            AppConfig.Instance.ThemeInitialized = true;
            AppConfig.Instance.Save();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleBrowseDataFolder(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                string? selected = null;
                using var dialog = new FolderBrowserDialog
                {
                    Description        = "Select data folder",
                    UseDescriptionForTitle = true,
                    SelectedPath       = AppConfig.Instance.DataRoot,
                    ShowNewFolderButton = true,
                };
                if (dialog.ShowDialog() == DialogResult.OK)
                    selected = dialog.SelectedPath;
                ReplyToVue(message.MessageId, new { path = selected });
            }));
        }

        private void HandleSetDataRoot(BridgeMessage message)
        {
            var newPath = message.Payload.GetProperty("path").GetString()?.Trim();
            if (string.IsNullOrEmpty(newPath))
            {
                ReplyToVue(message.MessageId, new { status = "error", message = "Invalid path." });
                return;
            }
            try
            {
                Directory.CreateDirectory(newPath);
                string dbPath = Path.Combine(newPath, "timeline.sqlite");
                bool isNewDb = !File.Exists(dbPath);
                AppConfig.Instance.DataRoot = newPath;
                AppConfig.Instance.Save();
                DbInitializer.Initialize();
                ReplyToVue(message.MessageId, new { status = "ok", path = newPath, isNewDb });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleMoveDataFolder(BridgeMessage message)
        {
            var newPath = message.Payload.GetProperty("path").GetString()?.Trim();
            if (string.IsNullOrEmpty(newPath))
            {
                ReplyToVue(message.MessageId, new { status = "error", message = "Invalid path." });
                return;
            }
            try
            {
                Directory.CreateDirectory(newPath);

                string oldDb    = AppConfig.Instance.GetDbPath();
                string oldMedia = AppConfig.Instance.GetMediaFolder();

                if (File.Exists(oldDb))
                    new ItemRepo().VacuumInto(Path.Combine(newPath, "timeline.sqlite"));

                if (Directory.Exists(oldMedia))
                    CopyDirectory(oldMedia, Path.Combine(newPath, "Media"));

                AppConfig.Instance.DataRoot = newPath;
                AppConfig.Instance.Save();
                DbInitializer.Initialize();
                ReplyToVue(message.MessageId, new { status = "ok", path = newPath });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleOpenDataFolder(BridgeMessage message)
        {
            System.Diagnostics.Process.Start("explorer.exe", AppConfig.Instance.DataRoot);
        }

        private void HandleCreateBackup(BridgeMessage message)
        {
            bool includeMedia = message.Payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();
            try
            {
                string path = BackupService.CreateBackup(includeMedia);
                BackupService.PruneOldBackups();
                ReplyToVue(message.MessageId, new { status = "ok", path });
            }
            catch (Exception ex)
            {
                Logger.Error("CreateBackup", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleExportFullDB(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new SaveFileDialog
                {
                    Title      = "Export full database",
                    Filter     = "SQLite database (*.sqlite)|*.sqlite|All files (*.*)|*.*",
                    FileName   = $"timeline_export_{DateTime.Now:yyyyMMdd_HHmmss}.sqlite",
                    DefaultExt = "sqlite",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    File.Copy(AppConfig.Instance.GetDbPath(), dlg.FileName, overwrite: true);
                    ReplyToVue(message.MessageId, new { status = "ok", path = dlg.FileName });
                }
                catch (Exception ex)
                {
                    Logger.Error("ExportFullDB", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleBrowseAndPreviewImport(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new OpenFileDialog
                {
                    Title  = "Select database to import",
                    Filter = "Database files|*.sqlite;*.db;*.db3;*.sql;*.sqlite3|All files|*.*",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    var preview = DatabaseImporter.GetImportPreview(dlg.FileName);
                    ReplyToVue(message.MessageId, new { status = "ok", preview });
                }
                catch (Exception ex)
                {
                    Logger.Error("BrowseAndPreviewImport", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleExecuteImportDB(BridgeMessage message)
        {
            string path = message.Payload.GetProperty("path").GetString()
                ?? throw new Exception("Missing path parameter.");
            try
            {
                DatabaseImporter.Import(path);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                Logger.Error("ExecuteImportDB", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleGetBackupSettings(BridgeMessage message)
        {
            var cfg    = AppConfig.Instance;
            var recent = BackupService.GetRecentBackups();
            ReplyToVue(message.MessageId, new
            {
                interval         = cfg.BackupInterval,
                lastAutoBackupAt = cfg.LastAutoBackupAt?.ToString("O"),
                backupsFolder    = cfg.GetBackupsFolder(),
                recentBackups    = recent,
            });
        }

        private void HandleSaveBackupSettings(BridgeMessage message)
        {
            string interval = message.Payload.GetProperty("interval").GetString() ?? "never";
            AppConfig.Instance.BackupInterval = interval;
            AppConfig.Instance.Save();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleOpenBackupsFolder(BridgeMessage message)
        {
            string folder = AppConfig.Instance.GetBackupsFolder();
            Directory.CreateDirectory(folder);
            System.Diagnostics.Process.Start("explorer.exe", folder);
        }

        private void HandleBrowseAndPreviewTimelineImport(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new OpenFileDialog
                {
                    Title  = "Select timeline file to import",
                    Filter = "Story Timeline files (*.stlm)|*.stlm|All files (*.*)|*.*",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    var preview = TimelineExporter.GetZipPreview(dlg.FileName);
                    ReplyToVue(message.MessageId, new { status = "ok", preview });
                }
                catch (Exception ex)
                {
                    Logger.Error("BrowseAndPreviewTimelineImport", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleImportTimeline(BridgeMessage message)
        {
            string path = message.Payload.GetProperty("path").GetString()
                ?? throw new Exception("Missing path parameter.");
            try
            {
                TimelineExporter.ImportFromZip(path);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                Logger.Error("ImportTimeline", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private static void CopyDirectory(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (var file in Directory.GetFiles(src))
                File.Copy(file, Path.Combine(dst, Path.GetFileName(file)), overwrite: true);
            foreach (var dir in Directory.GetDirectories(src))
                CopyDirectory(dir, Path.Combine(dst, Path.GetFileName(dir)));
        }

        // -----------------------------------------------------------------------
        // Filter rules
        // -----------------------------------------------------------------------

        private void HandleGetFilterRules(BridgeMessage message)
        {
            try
            {
                int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
                var rules = new FilterRuleRepo().GetByTimeline(timelineId);
                ReplyToVue(message.MessageId, new { status = "ok", rules });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleGetFilterRules] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        private void HandleSaveFilterRule(BridgeMessage message)
        {
            try
            {
                var rule = JsonSerializer.Deserialize<FilterRuleItem>(message.Payload.GetRawText(), _jsonOpts);
                new FilterRuleRepo().Save(rule!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleSaveFilterRule] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        private void HandleDeleteFilterRule(BridgeMessage message)
        {
            try
            {
                string? id = message.Payload.GetProperty("id").GetString();
                new FilterRuleRepo().Delete(id!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleDeleteFilterRule] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        // -----------------------------------------------------------------------
        // Filter presets
        // -----------------------------------------------------------------------

        private void HandleGetFilterPresets(BridgeMessage message)
        {
            try
            {
                var presets = new FilterPresetRepo().GetAll();
                ReplyToVue(message.MessageId, new { status = "ok", presets });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleGetFilterPresets] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        private void HandleSaveFilterPreset(BridgeMessage message)
        {
            try
            {
                var preset = JsonSerializer.Deserialize<FilterPresetItem>(message.Payload.GetRawText(), _jsonOpts);
                new FilterPresetRepo().Save(preset!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleSaveFilterPreset] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        private void HandleDeleteFilterPreset(BridgeMessage message)
        {
            try
            {
                string? id = message.Payload.GetProperty("id").GetString();
                new FilterPresetRepo().Delete(id!);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleDeleteFilterPreset] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        // -----------------------------------------------------------------------
        // Misc settings
        // -----------------------------------------------------------------------

        private void HandleGetMiscSetting(BridgeMessage message)
        {
            try
            {
                string? key = message.Payload.GetProperty("key").GetString();
                int timelineId = message.Payload.TryGetProperty("timelineId", out var tl) ? tl.GetInt32() : 0;
                string value = new MiscSettingsRepo().Get(key!, timelineId);
                ReplyToVue(message.MessageId, new { status = "ok", value });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleGetMiscSetting] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }

        private void HandleSetMiscSetting(BridgeMessage message)
        {
            try
            {
                string? key = message.Payload.GetProperty("key").GetString();
                string? value = message.Payload.GetProperty("value").GetString();
                int timelineId = message.Payload.TryGetProperty("timelineId", out var tl) ? tl.GetInt32() : 0;
                new MiscSettingsRepo().Set(key!, value!, timelineId);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[HandleSetMiscSetting] {ex}");
                ReplyToVue(message.MessageId, new { status = "error", detail = ex.ToString() });
            }
        }
    }
}

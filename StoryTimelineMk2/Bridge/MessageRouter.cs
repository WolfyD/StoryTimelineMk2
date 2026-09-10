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
        private readonly Form _parentForm;
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        public MessageRouter(CoreWebView2 webView, Form parentForm = null)
        {
            _webView = webView;
            _parentForm = parentForm;
            _webView.WebMessageReceived += OnWebMessageReceived;
        }

        public void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string rawJson = e.WebMessageAsJson;
                var message = JsonSerializer.Deserialize<BridgeMessage>(rawJson);
                if (message != null) RouteMessage(message);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to parse message from Vue: {ex.Message}");
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
                case "GetTimelineItems":        HandleGetTimelineItems(message); break;
                case "GetAllTimelines":         HandleGetAllTimelines(message); break;
                case "ImportDB":                HandleImportDB(message); break;

                // EditItem actions
                case "GetItemForEdit":          HandleGetItemForEdit(message); break;
                case "SaveItem":                HandleSaveItem(message); break;
                case "SearchTags":              HandleSearchTags(message); break;
                case "GetTimelineCharacters":   HandleGetTimelineCharacters(message); break;
                case "GetTimelineStories":      HandleGetTimelineStories(message); break;
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
                case "WindowClose":             HandleWindowClose(message); break;
                case "WindowStartDrag":         HandleWindowStartDrag(message); break;

                // Calendar actions
                case "GetCalendarById":             HandleGetCalendarById(message); break;
                case "SaveCalendar":                HandleSaveCalendar(message); break;
                case "CreateCalendar":              HandleCreateCalendar(message); break;
                case "DeleteCalendar":              HandleDeleteCalendar(message); break;
                case "OpenCalendarEditorWindow":    HandleOpenCalendarEditorWindow(message); break;

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
                case "GetAppConfig":    HandleGetAppConfig(message); break;
                case "BrowseDataFolder": HandleBrowseDataFolder(message); break;
                case "SetDataRoot":     HandleSetDataRoot(message); break;
                case "MoveDataFolder":  HandleMoveDataFolder(message); break;
                case "OpenDataFolder":  HandleOpenDataFolder(message); break;
                case "CreateBackup":    HandleCreateBackup(message); break;

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

                default:
                    Console.WriteLine($"Unknown Action: {message.Action}");
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
            f_Main mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main") mainForm = f as f_Main;
            }

            f_Timeline TimelineForm = new f_Timeline();
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

        private void HandleGetTimelineItems(BridgeMessage message)
        {
            ItemRepo item_repo = new ItemRepo();
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            var items = item_repo.GetItemsByTimeline(timelineId);
            ReplyToVue(message.MessageId, items);
        }

        private void HandleGetAllTimelines(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            IEnumerable<TimelineInfo> timelines = repo.GetAll();
            ReplyToVue(message.MessageId, new { status = "ok", data = timelines });
        }

        private void HandleImportDB(BridgeMessage message)
        {
            DatabaseImporter.HandleDBImport();
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleOpenAddEditItemWindow(BridgeMessage message)
        {
            int timelineId = 0;
            string itemId = null;
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

            var addEditItemWindow = new f_AddEditItem
            {
                TimelineId = timelineId,
                ItemId = itemId,
                DefaultTypeId = typeId,
                DefaultYear = year,
                DefaultGranularity = granularity,
            };

            // Wire a callback so the edit window can push the saved item directly into
            // this (the caller's) WebView2 without a full timeline reload.
            addEditItemWindow.NotifyCallback = (action, payload) => SendToVue(action, payload);

            // Use Show() instead of ShowDialog(): calling ShowDialog from inside a
            // WebView2 WebMessageReceived handler creates a nested COM message loop
            // that causes EnsureCoreWebView2Async in the new window to E_ABORT.
            addEditItemWindow.Show();
            addEditItemWindow.Activate();
        }

        // -----------------------------------------------------------------------
        // EditItem handlers
        // -----------------------------------------------------------------------

        private void HandleGetItemForEdit(BridgeMessage message)
        {
            string itemId = null;
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
            public List<string> TagNames { get; set; }

            [JsonPropertyName("characterAppearances")]
            public List<ItemRepo.CharacterAppearanceInput> CharacterAppearances { get; set; }

            [JsonPropertyName("storyRefs")]
            public List<string> StoryRefs { get; set; }

            [JsonPropertyName("chapterRefs")]
            public List<string> ChapterRefs { get; set; }
        }

        private void HandleSaveItem(BridgeMessage message)
        {
            try
            {
                var payload = JsonSerializer.Deserialize<SaveItemPayload>(message.Payload.GetRawText(), _jsonOpts);
                var item = JsonSerializer.Deserialize<TimelineItem>(payload.Item.GetRawText(), _jsonOpts);

                var itemRepo = new ItemRepo();
                string savedId = itemRepo.SaveItemFull(item, payload.TagNames, payload.CharacterAppearances,
                    payload.StoryRefs, payload.ChapterRefs);

                ReplyToVue(message.MessageId, new { status = "ok", itemId = savedId });

                // Push the saved item directly to the caller (timeline) WebView2 so the
                // canvas updates without a full reload.
                if (_parentForm is f_AddEditItem addEdit && addEdit.NotifyCallback != null)
                {
                    var savedItem = itemRepo.GetItemById(savedId);
                    addEdit.NotifyCallback("ItemSaved", new { Item = savedItem });
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

        private void HandleGetTimelineStories(BridgeMessage message)
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
            string bookId = message.Payload.GetProperty("bookId").GetString();
            var chapters = new BookRepo().GetChaptersForBook(bookId);
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
            string itemId = message.Payload.GetProperty("itemId").GetString();
            new ItemRepo().DeleteItem(itemId);
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
                string noteId = message.Payload.GetProperty("noteId").GetString();
                new NoteRepo().DeleteNote(noteId);
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
            if (p.TryGetProperty("font",             out var e1)) settings.Font             = e1.GetString() ?? settings.Font;
            if (p.TryGetProperty("fontSizeScale",    out var e2)) settings.FontSizeScale    = e2.GetSingle();
            if (p.TryGetProperty("pixelsPerSubtick", out var e3)) settings.PixelsPerSubtick = e3.GetInt32();
            if (p.TryGetProperty("showGuides",       out var e4)) settings.ShowGuides       = e4.GetBoolean();
            if (p.TryGetProperty("displayRadius",    out var e5)) settings.DisplayRadius    = e5.GetInt32();
            if (p.TryGetProperty("isFullscreen",     out var e6)) settings.IsFullscreen     = e6.GetBoolean();
            if (p.TryGetProperty("useCustomScaling", out var e7)) settings.UseCustomScaling = e7.GetBoolean();
            if (p.TryGetProperty("customScale",      out var e8)) settings.CustomScale      = e8.GetSingle();

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

        private void HandleGetLayoutSettingsById(BridgeMessage message)
        {
            try
            {
                string id = message.Payload.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "ls_default" : "ls_default";
                var ls = new LayoutSettingsRepo().GetById(id);
                ReplyToVue(message.MessageId, ls);
            }
            catch
            {
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
                _parentForm.WindowState = _parentForm.WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal
                    : FormWindowState.Maximized;
            }));
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
            int id          = message.Payload.GetProperty("id").GetInt32();
            bool includeIds = message.Payload.TryGetProperty("includeIds", out var ip) && ip.GetBoolean();

            var repo        = new TimelineRepo();
            var itemRepo    = new ItemRepo();
            var charRepo    = new CharacterRepo();
            var noteRepo    = new NoteRepo();
            var tagRepo     = new TagRepo();

            var timeline    = repo.GetTimelineById(id);
            var items       = itemRepo.GetItemsByTimeline(id).ToList();
            var characters  = charRepo.GetCharactersByTimeline(id).ToList();
            var notes       = noteRepo.GetTimelineNotes(id).ToList();

            var exportData  = new
            {
                exportVersion   = 1,
                exportedAt      = DateTime.UtcNow.ToString("O"),
                includeIds,
                timeline        = includeIds ? (object)timeline : new { timeline.Title, timeline.Author, timeline.Description, timeline.StartYear, timeline.Color },
                items           = includeIds ? (object)items : items.Select(i => new { i.Title, i.Description, i.Content, i.Year, i.EndYear, i.AbsoluteStart, i.AbsoluteEnd, i.Color, i.Importance, TypeId = i.TypeId }),
                characters      = includeIds ? (object)characters : characters.Select(c => new { c.Name, c.Race, c.Description }),
                notes           = includeIds ? (object)notes : notes.Select(n => new { n.NoteContents }),
            };

            string json = JsonSerializer.Serialize(exportData, new JsonSerializerOptions { WriteIndented = true });

            using var dlg = new SaveFileDialog
            {
                Title       = "Export Timeline",
                Filter      = "JSON files (*.json)|*.json|All files (*.*)|*.*",
                FileName    = $"{timeline.Title}.json",
                DefaultExt  = "json"
            };

            if (dlg.ShowDialog() == DialogResult.OK)
            {
                File.WriteAllText(dlg.FileName, json);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            else
            {
                ReplyToVue(message.MessageId, new { status = "cancelled" });
            }
        }

        // -----------------------------------------------------------------------
        // Calendar handlers
        // -----------------------------------------------------------------------

        private void HandleGetCalendarById(BridgeMessage message)
        {
            try
            {
                string id = message.Payload.GetProperty("id").GetString();
                var cal = new CalendarRepo().GetCalendarById(id);
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
                    cloneFrom = cfProp.GetString();

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
                string id = message.Payload.GetProperty("id").GetString();
                new CalendarRepo().DeleteCalendar(id);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleOpenCalendarEditorWindow(BridgeMessage message)
        {
            string calendarId = null;
            if (message.Payload.TryGetProperty("calendarId", out var idProp))
                calendarId = idProp.GetString();

            var calendarWindow = new f_Calendar { CalendarId = calendarId };
            calendarWindow.Show();
            calendarWindow.Activate();
        }

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        public void SendToVue(string action, object payload = null)
        {
            var response = new { action, payload };
            string json = JsonSerializer.Serialize(response);
            _webView.PostWebMessageAsJson(json);
        }

        private void ReplyToVue(int? messageId, object payload)
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
            var itemId = message.Payload.GetProperty("itemId").GetString();

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
        }

        private void HandleGetAllPictures(BridgeMessage message)
        {
            ReplyToVue(message.MessageId, new MediaRepo().GetAllMedia().ToList());
        }

        private void HandleLinkImageToItem(BridgeMessage message)
        {
            var pictureId = message.Payload.GetProperty("pictureId").GetString();
            var itemId    = message.Payload.GetProperty("itemId").GetString();
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
            var pictureId = message.Payload.GetProperty("pictureId").GetString();
            var itemId    = message.Payload.GetProperty("itemId").GetString();
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
                var id = message.Payload.GetProperty("id").GetString();
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

        private void HandleGetAppConfig(BridgeMessage message)
        {
            var cfg = AppConfig.Instance;
            ReplyToVue(message.MessageId, new
            {
                DataRoot   = cfg.DataRoot,
                DbPath     = cfg.GetDbPath(),
                MediaFolder = cfg.GetMediaFolder(),
            });
        }

        private void HandleBrowseDataFolder(BridgeMessage message)
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
                    File.Copy(oldDb, Path.Combine(newPath, "timeline.sqlite"), overwrite: true);

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

            using var dialog = new FolderBrowserDialog
            {
                Description        = "Choose backup destination folder",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = true,
            };
            if (dialog.ShowDialog() != DialogResult.OK)
            {
                ReplyToVue(message.MessageId, new { status = "cancelled" });
                return;
            }

            try
            {
                string backupName = $"StoryTimeline_Backup_{DateTime.Now:yyyyMMdd_HHmmss}";
                string backupPath = Path.Combine(dialog.SelectedPath, backupName);
                Directory.CreateDirectory(backupPath);

                string dbFile = AppConfig.Instance.GetDbPath();
                if (File.Exists(dbFile))
                    File.Copy(dbFile, Path.Combine(backupPath, "timeline.sqlite"), overwrite: true);

                if (includeMedia)
                {
                    string mediaFolder = AppConfig.Instance.GetMediaFolder();
                    if (Directory.Exists(mediaFolder))
                        CopyDirectory(mediaFolder, Path.Combine(backupPath, "Media"));
                }

                System.Diagnostics.Process.Start("explorer.exe", backupPath);
                ReplyToVue(message.MessageId, new { status = "ok", path = backupPath });
            }
            catch (Exception ex)
            {
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
                new FilterRuleRepo().Save(rule);
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
                string id = message.Payload.GetProperty("id").GetString();
                new FilterRuleRepo().Delete(id);
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
                new FilterPresetRepo().Save(preset);
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
                string id = message.Payload.GetProperty("id").GetString();
                new FilterPresetRepo().Delete(id);
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
                string key = message.Payload.GetProperty("key").GetString();
                int timelineId = message.Payload.TryGetProperty("timelineId", out var tl) ? tl.GetInt32() : 0;
                string value = new MiscSettingsRepo().Get(key, timelineId);
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
                string key = message.Payload.GetProperty("key").GetString();
                string value = message.Payload.GetProperty("value").GetString();
                int timelineId = message.Payload.TryGetProperty("timelineId", out var tl) ? tl.GetInt32() : 0;
                new MiscSettingsRepo().Set(key, value, timelineId);
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

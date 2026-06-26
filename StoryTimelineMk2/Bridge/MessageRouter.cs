using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Database;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;
using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2.Bridge
{
    public class MessageRouter
    {
        private readonly CoreWebView2 _webView;
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        public MessageRouter(CoreWebView2 webView)
        {
            _webView = webView;
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

                case "OpenSettings":
                    break;

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
                    Notes = notes_repo.GetTimelineNotes(gtd_timeline_id).ToArray()
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
            int ret_id = -1;
            if (!string.IsNullOrEmpty(title))
                ret_id = repo.CreateTimeline(title);
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

            int? year = null;
            if (message.Payload.TryGetProperty("year", out var yearProp) && yearProp.TryGetInt32(out int y))
                year = y;

            var addEditItemWindow = new f_AddEditItem
            {
                TimelineId = timelineId,
                ItemId = itemId,
                DefaultTypeId = typeId,
                DefaultYear = year
            };

            // Use Show() instead of ShowDialog(): calling ShowDialog from inside a
            // WebView2 WebMessageReceived handler creates a nested COM message loop
            // that causes EnsureCoreWebView2Async in the new window to E_ABORT.
            addEditItemWindow.Show();
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
                item,
                tags = itemRepo.GetItemTags(item.Id),
                characters = itemRepo.GetItemCharacterAppearances(item.Id),
                storyRefs = itemRepo.GetItemStoryRefs(item.Id),
                chapterRefs = itemRepo.GetItemChapterRefs(item.Id),
                calendar = timeline.Calendar,
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
            }
            catch (Exception ex)
            {
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
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
    }
}

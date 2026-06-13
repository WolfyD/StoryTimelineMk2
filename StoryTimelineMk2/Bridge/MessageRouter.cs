using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Database;
using System;
using System.Text.Json;
using System.Windows.Forms;
using static System.Runtime.InteropServices.JavaScript.JSType;
using StoryTimelineMk2.Forms;
using System.Threading.Tasks.Dataflow;

namespace StoryTimelineMk2.Bridge
{
    public class MessageRouter
    {
        private readonly CoreWebView2 _webView;

        // We pass in the WebView2 instance so the router can send messages BACK to Vue
        public MessageRouter(CoreWebView2 webView)
        {
            _webView = webView;
            _webView.WebMessageReceived += OnWebMessageReceived;
        }

        public void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                // Vue sends the message as a JSON string
                string rawJson = e.WebMessageAsJson;
                var message = System.Text.Json.JsonSerializer.Deserialize<BridgeMessage>(rawJson);

                if (message != null)
                {
                    RouteMessage(message); // Pass it to your switch statement
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to parse message from Vue: {ex.Message}");
            }
        }

        private void RouteMessage(BridgeMessage message)
        {
            // This is your central switchboard. 
            // As your app grows, you can break these out into separate Handler classes.
            switch (message.Action)
            {
                case "OpenAddEditItemWindow": HandleOpenAddEditItemWindow(message); break;

                case "GetTimelineData": HandleGetTimelineData(message); break;

                case "OpenTimeline": HandleOpenTimeline(message); break;

                case "CreateProject": HandleCreateProject(message); break;

                case "GetTimelineItems": HandleGetTimelineItems(message); break;

                case "GetAllTimelines": HandleGetAllTimelines(message); break;

                case "OpenSettings":
                    // Ensure UI actions happen on the main thread
                    //TODO: add settings stuff
                    break;

                case "ImportDB": HandleImportDB(message); break;

                default:
                    Console.WriteLine($"Unknown Action: {message.Action}");
                    break;
            }
        }

        private void HandleGetTimelineData(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            ItemRepo item_repo = new ItemRepo();
            NoteRepo notes_repo = new NoteRepo();
            JsonElement ftd_pl_id = message.Payload.GetProperty("id");
            FullTimelineProject timelineObject;
            if (ftd_pl_id.TryGetInt32(out int gtd_timeline_id))
            {
                timelineObject = new FullTimelineProject()
                {
                    Project = repo.GetTimelineById(gtd_timeline_id),
                    Items = item_repo.GetItemsByTimeline(gtd_timeline_id).ToArray(),
                    Notes = notes_repo.GetTimelineNotes(gtd_timeline_id).ToArray()
                };

                ReplyToVue(message.MessageId, timelineObject);
            }

            ReplyToVue(message.MessageId, null);
        }

        private void HandleOpenTimeline(BridgeMessage message)
        {
            f_Main mainForm = null;
            foreach (Form f in Application.OpenForms)
            {
                if (f.Name == "f_Main")
                {
                    mainForm = f as f_Main;
                }
            }

            f_Timeline TimelineForm = new f_Timeline();

            JsonElement ot_pl_id = message.Payload.GetProperty("id");

            if (ot_pl_id.TryGetInt32(out int ot_timeline_id))
            {
                TimelineForm.TimelineId = ot_timeline_id;
            }

            TimelineForm.Show();

            if (TimelineForm.Visible && mainForm != null)
            {
                mainForm.Hide();
            }
        }

        private void HandleCreateProject(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            int ret_id = -1;
            JsonElement pl = message.Payload.GetProperty("title");
            var title = pl.GetString();
            if (!string.IsNullOrEmpty(title))
            {
                ret_id = repo.CreateTimeline(title);
            }
            ReplyToVue(message.MessageId, ret_id);
        }

        private void HandleGetTimelineItems(BridgeMessage message)
        {
            ItemRepo item_repo = new ItemRepo();
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            var items = item_repo.GetItemsByTimeline(timelineId);

            // Reply with the same MessageId so Vue resolves the correct Promise
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
            JsonElement type_id = message.Payload.GetProperty("type");
            if (type_id.TryGetInt32(out int resolved_type_id))
            {

                f_AddEditItem addEditItemWindow = new f_AddEditItem();
                addEditItemWindow.ShowDialog();
                if (addEditItemWindow.ShowDialog() == DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "ok" });
                }
                else
                {
                    ReplyToVue(message.MessageId, new { status = "cancel" });
                }
            }
            else
            {
                ReplyToVue(message.MessageId, new { status = "error" });
            }
        }

        // Helper to push data from C# down to Vue
        public void SendToVue(string action, object payload = null)
        {
            var response = new
            {
                action = action,
                payload = payload
            };

            string json = JsonSerializer.Serialize(response);
            _webView.PostWebMessageAsJson(json);
        }

        private void ReplyToVue(int? messageId, object payload)
        {
            var response = new { messageId = messageId, payload = payload };
            string json = JsonSerializer.Serialize(response);
            _webView.PostWebMessageAsJson(json);
        }
    }
}

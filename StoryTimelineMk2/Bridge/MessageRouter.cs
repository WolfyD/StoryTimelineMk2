using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Database;
using StoryTimelineMk2.Database.Migrations;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows.Forms;
using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2.Bridge
{
    public class MessageRouter
    {
        private readonly CoreWebView2 _webView;
        private readonly Form? _parentForm;
        private readonly IBridgeChannel _channel;
        private readonly DataActions _data;
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        // Held so timeline can push year updates to the year-calendar window
        private static f_YearCalendar? _yearCalendarWindow;

        // One characters window per app (BL-15): it is a view onto the timeline already open.
        private static f_Characters? _charactersWindow;

        /// <summary>
        /// BL-18 (H1): where data-layer actions run, instead of on the UI thread. One chain for
        /// every window's router, so messages still run one at a time and in arrival order —
        /// which is what the shared UI thread used to give the single SQLite file for free.
        /// ponytail: a continuation chain, not a worker with a queue. If one slow action ever has
        /// to stop holding up the rest, give the read-only actions a second chain.
        /// </summary>
        private static Task _dataPump = Task.CompletedTask;

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

            // Characters window
            var chars = _charactersWindow;
            if (chars != null && !chars.IsDisposed && chars.IsHandleCreated)
                chars.BeginInvoke((MethodInvoker)chars.Close);

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
            _channel = new WebViewChannel(webView, parentForm);
            // These three are the only places a data action reaches back into WinForms, and
            // since BL-18 (H1) it calls from the thread pool — so each one hops back to the UI.
            _data = new DataActions(_channel)
            {
                OnSettingsApplied = s => RunOnUi(() => ApplyWindowSettings(s)),
                OnChromeThemeApplied = () => RunOnUi(() =>
                {
                    foreach (Form f in Application.OpenForms)
                        (f as BorderlessFormBase)?.ApplyChromeColor();
                }),
                // A copyable report (schema versions, stage, log path) beats the Vue alert.
                OnImportMigrationFailed = ex => RunOnUi(() => f_ErrorReport.ShowReport(
                    "The backup could not be imported. Your current data was not changed.", ex)),
            };
            _webView.WebMessageReceived += OnWebMessageReceived;
            BridgeHub.Register(_channel);
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

            // BL-18 (H1): queued onto the pump rather than run here, so a long save or timeline
            // load no longer freezes the window it came from. WebView2 raises this event on the
            // UI thread, so the chain is only ever extended from one thread.
            BridgeMessage queued = message;
            _dataPump = _dataPump.ContinueWith(_ => Dispatch(queued), TaskScheduler.Default);
        }

        /// <summary>
        /// Runs one message to completion and answers it, whatever happens.
        /// </summary>
        private void Dispatch(BridgeMessage message)
        {
            try
            {
                // Everything that only needs the data layer lives in StoryTimeline.Data so the
                // browser host (BL-68) can serve it too, and it stays on this thread. What is
                // left needs a window, a file dialog or a shell, so it goes back to the UI one.
                if (!_data.TryHandle(message)) RunOnUi(() => RouteMessage(message));
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
                if (_parentForm is { IsDisposed: false, IsHandleCreated: true })
                {
                    _parentForm.BeginInvoke((MethodInvoker)(() =>
                        MessageBox.Show($"Action '{message.Action}' failed:\n\n{ex}", "Backend error",
                            MessageBoxButtons.OK, MessageBoxIcon.Error)));
                }
            }
        }

        /// <summary>
        /// Runs <paramref name="work"/> on the UI thread and waits for it, so the next queued
        /// message still starts only after this one has finished. Exceptions come back here.
        /// </summary>
        private void RunOnUi(Action work)
        {
            Form? ui = _parentForm;
            if (ui == null) { work(); return; }
            if (ui.IsDisposed || !ui.IsHandleCreated)
            {
                // The window that asked is gone, and so is the page that was waiting for it.
                Logger.Warn("Bridge/Route", "Dropped a host action: its window is already closed.");
                return;
            }
            if (ui.InvokeRequired) ui.Invoke(work);
            else work();
        }

        private void RouteMessage(BridgeMessage message)
        {
            switch (message.Action)
            {
                case "OpenAddEditItemWindow":   HandleOpenAddEditItemWindow(message); break;
                case "OpenTimeline":            HandleOpenTimeline(message); break;
                case "ImportDB":                HandleImportDB(message); break;

                // EditItem actions
                case "AddImageToItem":          HandleAddImageToItem(message); break;
                case "SetCharacterPortrait":    HandleSetCharacterPortrait(message); break;
                case "ExportTimeline":          HandleExportTimeline(message); break;
                case "ExportSessionChanges":    HandleExportSessionChanges(message); break;
                case "BrowseAndPreviewSessionChanges": HandleBrowseAndPreviewSessionChanges(message); break;
                case "GetSystemFonts":          HandleGetSystemFonts(message); break;

                // Window chrome (borderless)
                case "WindowMinimize":          HandleWindowMinimize(message); break;
                case "WindowMaximizeRestore":   HandleWindowMaximizeRestore(message); break;
                case "WindowGetMaximized":      HandleWindowGetMaximized(message); break;
                case "WindowClose":             HandleWindowClose(message); break;
                case "WindowStartDrag":         HandleWindowStartDrag(message); break;
                case "WindowGetTopMost":        HandleWindowGetTopMost(message); break;
                case "WindowSetTopMost":        HandleWindowSetTopMost(message); break;

                // Calendar actions
                case "ExportCalendar":              HandleExportCalendar(message); break;
                case "ImportCalendar":              HandleImportCalendar(message); break;
                case "OpenCalendarEditorWindow":    HandleOpenCalendarEditorWindow(message); break;

                // Characters window (BL-15)
                case "OpenCharactersWindow":        HandleOpenCharactersWindow(message); break;

                // Year calendar window
                case "OpenYearCalendarWindow":      HandleOpenYearCalendarWindow(message); break;
                case "SetCalendarYear":             HandleSetCalendarYear(message); break;

                // App-level settings
                case "BrowseDataFolder":  HandleBrowseDataFolder(message); break;
                case "OpenDataFolder":  HandleOpenDataFolder(message); break;
                case "ExportFullDB":                HandleExportFullDB(message); break;
                case "BrowseAndPreviewImport":      HandleBrowseAndPreviewImport(message); break;
                case "OpenBackupsFolder":           HandleOpenBackupsFolder(message); break;
                case "BrowseAndPreviewTimelineImport": HandleBrowseAndPreviewTimelineImport(message); break;

                // Shell
                case "OpenExternalUrl":  HandleOpenExternalUrl(message); break;

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
            // BL-66: a reference window — opened from a timeline, shown next to it, no edit affordances
            TimelineForm.ReadOnly = message.Payload.TryGetProperty("readOnly", out var ro) && ro.ValueKind == JsonValueKind.True;
            // BL-15 phase 3: an appearances window — that reference window narrowed to one character.
            // Always assigned: this form may be a prewarmed one that carried a character last time.
            TimelineForm.CharacterId = message.Payload.TryGetProperty("characterId", out var cid) && cid.ValueKind == JsonValueKind.String
                ? cid.GetString()
                : null;

            TimelineForm.Show();
            if (TimelineForm.Visible && mainForm != null)
                mainForm.Hide();
        }

        private void HandleImportDB(BridgeMessage message)
        {
            bool ok = DatabaseImportUI.HandleDBImport();
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

            // ReopenWithParams sets props and re-navigates in-place if WebView2 is ready;
            // otherwise AddEditItem_Load picks up the params on first Show().
            addEditItemWindow.ReopenWithParams(timelineId, itemId, typeId, year, granularity);

            // Use Show() instead of ShowDialog(): calling ShowDialog from inside a
            // WebView2 WebMessageReceived handler creates a nested COM message loop
            // that causes EnsureCoreWebView2Async in the new window to E_ABORT.
            addEditItemWindow.Show(_parentForm);
            addEditItemWindow.TopMost = _parentForm?.TopMost ?? false;
            addEditItemWindow.Activate();
        }

        // -----------------------------------------------------------------------
        // EditItem handlers
        // -----------------------------------------------------------------------

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
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                if (_parentForm is f_AddEditItem addEdit) addEdit.ConfirmedClose();
                else _parentForm.Close();
            }));
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

        private void HandleGetSystemFonts(BridgeMessage message)
        {
            var fonts = System.Drawing.FontFamily.Families
                .Select(f => f.Name)
                .OrderBy(n => n)
                .ToArray();
            ReplyToVue(message.MessageId, fonts);
        }

        private void HandleExportTimeline(BridgeMessage message)
        {
            int  id         = message.Payload.GetProperty("id").GetInt32();
            bool includeIds = message.Payload.TryGetProperty("includeIds", out var ip) && ip.GetBoolean();
            bool inclMedia  = message.Payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();
            // BL-15 phase 3: set from an appearances window, where the export is that one character's.
            string? characterId = message.Payload.TryGetProperty("characterId", out var cp) && cp.ValueKind == JsonValueKind.String
                ? cp.GetString()
                : null;

            var timeline = new TimelineRepo().GetTimelineById(id);
            string name = string.IsNullOrEmpty(characterId)
                ? timeline.Title
                : $"{timeline.Title} - {new CharacterRepo().GetCharacter(characterId)?.Name ?? "character"}";
            string safeName = string.Concat(name.Split(Path.GetInvalidFileNameChars()));

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
                    TimelineExporter.ExportToZip(id, dlg.FileName, includeIds, inclMedia, characterId);
                    ReplyToVue(message.MessageId, new { status = "ok", path = dlg.FileName });
                }
                catch (Exception ex)
                {
                    Logger.Error("ExportTimeline", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        /// <summary>BL-33: writes the chosen days' net changes to a .stlc file.</summary>
        private void HandleExportSessionChanges(BridgeMessage message)
        {
            int id = message.Payload.GetProperty("timelineId").GetInt32();
            // Read before the dialog: Payload borrows the parsed document, which is gone by the
            // time the callback runs.
            var days = SessionChanges.DaysFrom(message.Payload);
            var timeline = new TimelineRepo().GetTimelineById(id);
            string safeName = string.Concat(timeline.Title.Split(Path.GetInvalidFileNameChars()));

            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new SaveFileDialog
                {
                    Title      = "Export session changes",
                    Filter     = "Story Timeline changes (*.stlc)|*.stlc|All files (*.*)|*.*",
                    FileName   = $"{safeName} - {DateTime.Now:yyyy-MM-dd}.stlc",
                    DefaultExt = "stlc",
                };

                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }

                try
                {
                    SessionChanges.Write(id, dlg.FileName, days);
                    ReplyToVue(message.MessageId, new { status = "ok", path = dlg.FileName });
                }
                catch (Exception ex)
                {
                    Logger.Error("ExportSessionChanges", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleBrowseAndPreviewSessionChanges(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new OpenFileDialog
                {
                    Title  = "Import session changes",
                    Filter = "Story Timeline changes (*.stlc)|*.stlc|All files (*.*)|*.*",
                };

                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }

                try
                {
                    ReplyToVue(message.MessageId,
                        new { status = "ok", preview = SessionChanges.Preview(dlg.FileName) });
                }
                catch (Exception ex)
                {
                    Logger.Error("BrowseAndPreviewSessionChanges", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        // -----------------------------------------------------------------------
        // Calendar handlers
        // -----------------------------------------------------------------------

        /// <summary>
        /// Payload is either <c>{ id }</c> (manager: export the stored calendar) or
        /// <c>{ calendar }</c> (editor: export the on-screen state, same shape as SaveCalendar).
        /// </summary>
        private void HandleExportCalendar(BridgeMessage message)
        {
            CalendarItem cal;
            try
            {
                cal = message.Payload.TryGetProperty("calendar", out var calProp)
                    ? JsonSerializer.Deserialize<CalendarItem>(calProp.GetRawText(), _jsonOpts) ?? throw new Exception("Invalid calendar payload.")
                    : new CalendarRepo().GetCalendarById(message.Payload.GetProperty("id").GetString()!);
            }
            catch (Exception ex)
            {
                Logger.Error("ExportCalendar", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                return;
            }

            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new SaveFileDialog
                {
                    Title      = "Export calendar",
                    Filter     = "Calendar JSON (*.json)|*.json|All files (*.*)|*.*",
                    FileName   = string.Join("_", (cal.Name is { Length: > 0 } n ? n : "calendar").Split(Path.GetInvalidFileNameChars())) + ".json",
                    DefaultExt = "json",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    File.WriteAllText(dlg.FileName, CalendarExporter.ToJson(cal));
                    ReplyToVue(message.MessageId, new { status = "ok", path = dlg.FileName });
                }
                catch (Exception ex)
                {
                    Logger.Error("ExportCalendar", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleImportCalendar(BridgeMessage message)
        {
            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                using var dlg = new OpenFileDialog
                {
                    Title  = "Import calendar",
                    Filter = "Calendar JSON (*.json)|*.json|All files (*.*)|*.*",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    var (cal, nameCollision) = CalendarExporter.Import(dlg.FileName);
                    ReplyToVue(message.MessageId, new { status = "ok", calendarId = cal.Id, name = cal.Name, nameCollision });
                }
                catch (Exception ex)
                {
                    Logger.Error("ImportCalendar", ex);
                    ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
                }
            }));
        }

        private void HandleOpenCalendarEditorWindow(BridgeMessage message)
        {
            string? calendarId = null;
            if (message.Payload.TryGetProperty("calendarId", out var idProp))
                calendarId = idProp.GetString();

            var calendarWindow = f_Calendar.TakePrewarmed() ?? new f_Calendar();
            calendarWindow.CalendarId = calendarId;
            // Saving closes the editor, so FormClosed is the opener's "calendar list may have changed" signal.
            calendarWindow.FormClosed += (_, _) => { if (_parentForm is { IsDisposed: false }) SendToVue("CalendarsChanged", new { }); };
            calendarWindow.Show(_parentForm);
            calendarWindow.TopMost = _parentForm?.TopMost ?? false;
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
            _yearCalendarWindow.TopMost = _parentForm?.TopMost ?? false;
            _yearCalendarWindow.Activate();
            // Re-warm for next use
            f_YearCalendar.BeginPrewarm();

            ReplyToVue(message.MessageId, new { status = "opened" });
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

        /// <summary>
        /// The window half of the settings actions: fullscreen state and zoom. Runs on the UI
        /// thread because the message arrives on a WebView2 callback thread.
        /// </summary>
        private void ApplyWindowSettings(SettingsItem settings)
        {
            if (_parentForm == null) return;
            _parentForm.BeginInvoke((MethodInvoker)(() =>
            {
                if (_parentForm is BorderlessFormBase bf)
                    bf.IsFullscreenMode = settings.IsFullscreen;

                if (_parentForm.WindowState == FormWindowState.Maximized)
                    _parentForm.WindowState = FormWindowState.Normal;
                if (settings.IsFullscreen)
                    _parentForm.WindowState = FormWindowState.Maximized;

                double zoom = settings.UseCustomScaling && settings.CustomScale > 0 ? settings.CustomScale : 1.0;
                (_parentForm as f_Timeline)?.SetZoom(zoom);
            }));
        }

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        /// <returns>false when the page could not be reached (its WebView2 is gone).</returns>
        public bool SendToVue(string action, object? payload = null)
            => _channel.Post(new { action, payload });

        private void ReplyToVue(int? messageId, object? payload)
            => _channel.Post(new { messageId, payload });

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

        /// <summary>
        /// BL-15: picks an image and makes it a character's portrait. Host-side because of the file
        /// dialog; the picture goes through the same <see cref="MediaRepo"/> pipeline as item images,
        /// so it gets the same copy-into-the-media-folder and thumbnail treatment.
        /// ponytail: desktop only. The browser host needs the upload half instead, the way
        /// AddImagesToItem pairs with AddImageToItem — worth writing once someone runs it there.
        /// </summary>
        /// <summary>
        /// BL-15: opens the characters window for a timeline, or brings the open one forward. One per
        /// app, like the year calendar — it is a view onto the timeline you are already looking at.
        /// </summary>
        private void HandleOpenCharactersWindow(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            string? characterId = message.Payload.TryGetProperty("characterId", out var cid)
                ? cid.GetString()
                : null;

            if (_charactersWindow is { IsDisposed: false })
            {
                _charactersWindow.Activate();
                // Already open on some other character: the page is listening, so tell it to switch.
                if (!string.IsNullOrEmpty(characterId))
                    BridgeHub.Broadcast("FocusCharacter", new { CharacterId = characterId });
                ReplyToVue(message.MessageId, new { status = "ok" });
                return;
            }

            // A fresh window is not listening yet, so the character rides in on the query string.
            var window = f_Characters.TakePrewarmed() ?? new f_Characters();
            window.TimelineId  = timelineId;
            window.CharacterId = characterId;
            _charactersWindow = window;
            window.FormClosed += (_, _) =>
            {
                if (ReferenceEquals(_charactersWindow, window)) _charactersWindow = null;
                f_Characters.BeginPrewarm();   // closing it is the best hint it will be opened again
            };
            window.Show(_parentForm);
            window.TopMost = _parentForm?.TopMost ?? false;
            window.Activate();

            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleSetCharacterPortrait(BridgeMessage message)
        {
            string characterId = message.Payload.GetProperty("characterId").GetString()!;

            using var dialog = new OpenFileDialog
            {
                Title = "Select Portrait",
                Filter = "Image files|*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp;*.tiff|All files|*.*",
            };
            if (dialog.ShowDialog() != DialogResult.OK)
            {
                ReplyToVue(message.MessageId, new { status = "cancelled" });
                return;
            }

            var media = new MediaRepo();
            var picture = media.ImportAndSaveMedia(dialog.FileName, Path.GetFileNameWithoutExtension(dialog.FileName), "");
            string? replaced = new CharacterRepo().SetPortrait(characterId, picture.Id);
            if (replaced != null) media.DeleteMedia(replaced);

            ReplyToVue(message.MessageId, new { status = "ok", Picture = picture });
        }

        // -----------------------------------------------------------------------
        // Hidden range handlers
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Timeline action handlers
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // App-level settings handlers
        // -----------------------------------------------------------------------

        /// <summary>Wired into <see cref="DataActions.SystemPrefersDark"/> at startup.</summary>
        internal static bool OsPrefersDark()
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

        private void HandleOpenDataFolder(BridgeMessage message)
        {
            System.Diagnostics.Process.Start("explorer.exe", AppConfig.Instance.DataRoot);
        }

        private void HandleExportFullDB(BridgeMessage message)
        {
            // With media the export is a .stlm archive, the same format a media backup writes;
            // without it, the plain .sqlite it has always been.
            bool includeMedia = message.Payload.TryGetProperty("includeMedia", out var im) && im.GetBoolean();

            _parentForm!.BeginInvoke((MethodInvoker)(() =>
            {
                string stamp = $"{DateTime.Now:yyyyMMdd_HHmmss}";
                using var dlg = new SaveFileDialog
                {
                    Title      = "Export full database",
                    Filter     = includeMedia
                        ? "Story Timeline archive (*.stlm)|*.stlm|All files (*.*)|*.*"
                        : "SQLite database (*.sqlite)|*.sqlite|All files (*.*)|*.*",
                    FileName   = includeMedia ? $"timeline_export_{stamp}.stlm" : $"timeline_export_{stamp}.sqlite",
                    DefaultExt = includeMedia ? "stlm" : "sqlite",
                };
                if (dlg.ShowDialog() != DialogResult.OK)
                {
                    ReplyToVue(message.MessageId, new { status = "cancelled" });
                    return;
                }
                try
                {
                    if (includeMedia)
                        BackupService.WriteArchive(dlg.FileName);
                    else
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
                    Filter = "Database files|*.sqlite;*.db;*.db3;*.sql;*.sqlite3;*.stlm|All files|*.*",
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

        // -----------------------------------------------------------------------
        // Filter rules
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Filter presets
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Misc settings
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Update checker handlers
        // -----------------------------------------------------------------------

        private void HandleOpenExternalUrl(BridgeMessage message)
        {
            try
            {
                var url = message.Payload.GetProperty("url").GetString()!;
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url)
                {
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                Logger.Warn("Bridge/OpenExternalUrl", ex.Message);
            }
        }
    }
}

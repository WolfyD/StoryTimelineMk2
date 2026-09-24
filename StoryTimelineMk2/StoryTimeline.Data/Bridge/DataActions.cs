using StoryTimelineMk2.Database;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2.Bridge
{
    /// <summary>
    /// The half of the bridge that only touches the data layer: every action a host can answer
    /// without a window, a file dialog or a shell. Both the WinForms host and the local server
    /// (BL-68) dispatch into this, so nothing here may reference WinForms.
    /// Replies go out through an <see cref="IBridgeChannel"/> rather than a WebView2 directly.
    /// </summary>
    public sealed partial class DataActions
    {
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        /// <summary>
        /// Set by the host: does the OS report a dark theme preference? Reported to the page by
        /// GetAppConfig so a first run can pick a matching theme. Reading it is platform-specific
        /// (the registry on Windows), so the host supplies it. Defaults to dark when unknown,
        /// matching the behaviour before the split.
        /// </summary>
        public static Func<bool> SystemPrefersDark { get; set; } = () => true;

        private readonly IBridgeChannel _channel;

        public DataActions(IBridgeChannel channel) => _channel = channel;

        /// <summary>
        /// Runs <paramref name="message"/> if it names a data action.
        /// </summary>
        /// <returns>false when the action belongs to the host, so the caller can try its own switch.</returns>
        public bool TryHandle(BridgeMessage message)
        {
            switch (message.Action)
            {
                case "GetTimelineData":          HandleGetTimelineData(message); break;
                case "CreateProject":            HandleCreateProject(message); break;
                case "GetAllTimelines":          HandleGetAllTimelines(message); break;
                case "GetItemForEdit":           HandleGetItemForEdit(message); break;
                case "SearchTags":               HandleSearchTags(message); break;
                case "GetTopTags":               HandleGetTopTags(message); break;
                case "GetTagList":               HandleGetTagList(message); break;
                case "RenameTag":                HandleRenameTag(message); break;
                case "DeleteTag":                HandleDeleteTag(message); break;
                case "GetTimelineCharacters":    HandleGetTimelineCharacters(message); break;
                case "GetTimelineCalendar":      HandleGetTimelineCalendar(message); break;
                case "SaveCharacter":            HandleSaveCharacter(message); break;
                case "DeleteCharacter":          HandleDeleteCharacter(message); break;
                case "GetCharacterAppearances":  HandleGetCharacterAppearances(message); break;
                case "FocusTimelineItem":        HandleFocusTimelineItem(message); break;
                case "DismissCharacterLink":     HandleDismissCharacterLink(message); break;
                case "GetCharacterIdForItem":    HandleGetCharacterIdForItem(message); break;
                case "GetCharacterRelations":    HandleGetCharacterRelations(message); break;
                case "GetTimelineRelations":     HandleGetTimelineRelations(message); break;
                case "SaveCharacterRelation":    HandleSaveCharacterRelation(message); break;
                case "DeleteCharacterRelation":  HandleDeleteCharacterRelation(message); break;
                case "GetRelationshipTypes":     HandleGetRelationshipTypes(message); break;
                case "SaveRelationshipType":     HandleSaveRelationshipType(message); break;
                case "DeleteRelationshipType":   HandleDeleteRelationshipType(message); break;
                case "GetAllStories":            HandleGetAllStories(message); break;
                case "SearchBooks":              HandleSearchBooks(message); break;
                case "GetBookChapters":          HandleGetBookChapters(message); break;
                case "GetLayoutSettingsList":    HandleGetLayoutSettingsList(message); break;
                case "RemoveImageFromItem":      HandleRemoveImageFromItem(message); break;
                case "GetAllPictures":           HandleGetAllPictures(message); break;
                case "LinkImageToItem":          HandleLinkImageToItem(message); break;
                case "DeleteTimeline":           HandleDeleteTimeline(message); break;
                case "DuplicateTimeline":        HandleDuplicateTimeline(message); break;
                case "SaveTimelineInfo":         HandleSaveTimelineInfo(message); break;
                case "GetCalendarList":          HandleGetCalendarList(message); break;
                case "GetLayoutSettingsById":    HandleGetLayoutSettingsById(message); break;
                case "CreateLayoutPreset":       HandleCreateLayoutPreset(message); break;
                case "SaveLayoutSettings":       HandleSaveLayoutSettings(message); break;
                case "GetCalendarById":          HandleGetCalendarById(message); break;
                case "SaveCalendar":             HandleSaveCalendar(message); break;
                case "CreateCalendar":           HandleCreateCalendar(message); break;
                case "DeleteCalendar":           HandleDeleteCalendar(message); break;
                case "GetItemsForYear":          HandleGetItemsForYear(message); break;
                case "DeleteItem":               HandleDeleteItem(message); break;
                case "SaveNote":                 HandleSaveNote(message); break;
                case "DeleteNote":               HandleDeleteNote(message); break;
                case "GetHiddenRanges":          HandleGetHiddenRanges(message); break;
                case "SaveHiddenRange":          HandleSaveHiddenRange(message); break;
                case "DeleteHiddenRange":        HandleDeleteHiddenRange(message); break;
                case "ShiftTimelineItems":       HandleShiftTimelineItems(message); break;
                case "SetTimelineItemsLodMask":  HandleSetTimelineItemsLodMask(message); break;
                case "ResetLayoutPreset":        HandleResetLayoutPreset(message); break;
                case "GetAppConfig":             HandleGetAppConfig(message); break;
                case "SavePerformantPanning":    HandleSavePerformantPanning(message); break;
                case "SetDataRoot":              HandleSetDataRoot(message); break;
                case "MoveDataFolder":           HandleMoveDataFolder(message); break;
                case "CreateBackup":             HandleCreateBackup(message); break;
                case "GetBackupSettings":        HandleGetBackupSettings(message); break;
                case "SaveBackupSettings":       HandleSaveBackupSettings(message); break;
                case "ImportTimeline":           HandleImportTimeline(message); break;
                case "GetFilterRules":           HandleGetFilterRules(message); break;
                case "SaveFilterRule":           HandleSaveFilterRule(message); break;
                case "DeleteFilterRule":         HandleDeleteFilterRule(message); break;
                case "GetFilterPresets":         HandleGetFilterPresets(message); break;
                case "SaveFilterPreset":         HandleSaveFilterPreset(message); break;
                case "DeleteFilterPreset":       HandleDeleteFilterPreset(message); break;
                case "GetMiscSetting":           HandleGetMiscSetting(message); break;
                case "SetMiscSetting":           HandleSetMiscSetting(message); break;
                case "GetNotificationSettings":  HandleGetNotificationSettings(message); break;
                case "SaveNotificationSettings": HandleSaveNotificationSettings(message); break;
                case "SaveTimelineMinimised":    HandleSaveTimelineMinimised(message); break;
                // BL-33. The baseline these diff against is taken in HandleGetTimelineData.
                case "GetSessionChanges":        HandleGetSessionChanges(message); break;
                case "GetSessionHistory":        HandleGetSessionHistory(message); break;
                case "PreviewSessionChanges":    HandlePreviewSessionChanges(message); break;
                case "ApplySessionChanges":      HandleApplySessionChanges(message); break;
                // App-level actions that came out of the WinForms router in BL-68 phase 3.
                default: return TryHandleAppAction(message);
            }
            return true;
        }

        /// <summary>Same shape the page has always received: <c>{ messageId, payload }</c>.</summary>
        private void ReplyToVue(int? messageId, object? payload)
            => _channel.Post(new { messageId, payload });

        private void HandleGetTimelineData(BridgeMessage message)
        {
            TimelineRepo repo = new TimelineRepo();
            ItemRepo item_repo = new ItemRepo();
            NoteRepo notes_repo = new NoteRepo();
            JsonElement ftd_pl_id = message.Payload.GetProperty("id");
            if (ftd_pl_id.TryGetInt32(out int gtd_timeline_id))
            {
                // BL-33: opening a timeline starts its session. Only the first call of the
                // process takes a baseline, so reloading the page does not reset it.
                SessionChanges.EnsureSnapshot(gtd_timeline_id);

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

        // ── BL-33 session changes ─────────────────────────────────────────

        /// <summary>Optional <c>days</c>: the <c>yyyy-MM-dd</c> days to total up. Without it,
        /// today alone.</summary>
        private void HandleGetSessionChanges(BridgeMessage message)
        {
            int id = message.Payload.GetProperty("timelineId").GetInt32();
            ReplyToVue(message.MessageId, new
            {
                status  = "ok",
                summary = SessionChanges.Summarise(id, SessionChanges.DaysFrom(message.Payload)),
            });
        }

        /// <summary>Every day this timeline was worked on, plus where the last export stopped —
        /// what the export screen offers as a range.</summary>
        private void HandleGetSessionHistory(BridgeMessage message)
        {
            int id = message.Payload.GetProperty("timelineId").GetInt32();
            ReplyToVue(message.MessageId, new { status = "ok", history = SessionChanges.History(id) });
        }

        private void HandlePreviewSessionChanges(BridgeMessage message)
            => ReplyToVue(message.MessageId,
                new { status = "ok", preview = SessionChanges.Preview(RequiredPath(message)) });

        /// <summary>
        /// <c>decisions</c> is <c>{ itemId: "local" }</c> for the rows the user chose to keep as
        /// they are. Everything unnamed takes the incoming version — BL-33's last-write-wins default.
        /// </summary>
        private void HandleApplySessionChanges(BridgeMessage message)
        {
            var decisions = new Dictionary<string, string>();
            if (message.Payload.TryGetProperty("decisions", out var el) && el.ValueKind == JsonValueKind.Object)
                foreach (var pick in el.EnumerateObject())
                    decisions[pick.Name] = pick.Value.GetString() ?? "incoming";

            ReplyToVue(message.MessageId,
                new { status = "ok", result = SessionChanges.Apply(RequiredPath(message), decisions) });
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
                item = new TimelineItem
                {
                    TimelineId = timelineId,
                    TypeId = typeId,
                    Color = new SettingsRepo().GetOrCreateSettings(timelineId).DefaultItemColor,
                    // Per-timeline preference written by Timeline Settings (frontend timelinePrefs.ts); 255 = every LOD
                    LodVisibilityMask = int.TryParse(new MiscSettingsRepo().Get("default_lod_mask", timelineId), out int mask) ? mask : 255,
                };
            }

            var timeline = timelineRepo.GetTimelineById(timelineId);

            ReplyToVue(message.MessageId, new
            {
                Item = item,
                Tags = itemRepo.GetItemTags(item.Id),
                Characters = itemRepo.GetItemCharacterAppearances(item.Id),
                Dismissals = string.IsNullOrEmpty(itemId)
                    ? new List<string>()
                    : itemRepo.GetDismissedCharacters(item.Id).ToList(),
                StoryRefs = itemRepo.GetItemStoryRefs(item.Id),
                ChapterRefs = itemRepo.GetItemChapterRefs(item.Id),
                Calendar = timeline.Calendar,
                Pictures = string.IsNullOrEmpty(itemId)
                    ? new List<MediaItem>()
                    : new MediaRepo().GetItemPictures(item.Id).ToList(),
            });
        }

        private void HandleSearchTags(BridgeMessage message)
        {
            string query = message.Payload.GetProperty("query").GetString() ?? "";
            var tags = new TagRepo().SearchTags(query);
            ReplyToVue(message.MessageId, tags);
        }

        private void HandleGetTopTags(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            int limit = message.Payload.TryGetProperty("limit", out var l) ? l.GetInt32() : 8;
            ReplyToVue(message.MessageId, new TagRepo().GetTopTags(timelineId, limit));
        }

        private void HandleGetTagList(BridgeMessage message)
        {
            var tags = new TagRepo().GetAllWithUsage().Select(t => new { t.Id, t.Name, t.UsageCount });
            ReplyToVue(message.MessageId, tags);
        }

        private void HandleRenameTag(BridgeMessage message)
        {
            try
            {
                int id = message.Payload.GetProperty("id").GetInt32();
                string name = message.Payload.GetProperty("name").GetString() ?? "";
                new TagRepo().RenameTag(id, name);
                ReplyToVue(message.MessageId, new { status = "ok" });
            }
            catch (Exception ex)
            {
                Logger.Error("RenameTag", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleDeleteTag(BridgeMessage message)
        {
            try
            {
                int id = message.Payload.GetProperty("id").GetInt32();
                int unlinked = new TagRepo().DeleteTag(id);
                ReplyToVue(message.MessageId, new { status = "ok", unlinked });
            }
            catch (Exception ex)
            {
                Logger.Error("DeleteTag", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleGetTimelineCharacters(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            var characters = new CharacterRepo().GetCharactersByTimeline(timelineId);
            ReplyToVue(message.MessageId, characters);
        }

        /// <summary>
        /// BL-15. The saved character goes back rather than being echoed by the page: a new one's id
        /// is made here, and `Name` is derived from the two halves on the way in.
        /// </summary>
        private void HandleSaveCharacter(BridgeMessage message)
        {
            var character = JsonSerializer.Deserialize<CharacterItem>(message.Payload.GetRawText(), _jsonOpts)
                ?? throw new InvalidOperationException("SaveCharacter received an empty payload.");
            new CharacterRepo().SaveCharacter(character);
            ReplyToVue(message.MessageId, new { status = "ok", character });
        }

        private void HandleDeleteCharacter(BridgeMessage message)
        {
            string id = message.Payload.GetProperty("id").GetString()!;
            var repo = new CharacterRepo();
            var character = repo.GetCharacter(id);
            repo.DeleteCharacter(id);

            // Everything the character owned goes with it: the portrait file, and the birth and
            // death items "Show on timeline" generated.
            if (!string.IsNullOrEmpty(character?.PortraitPictureId))
                new MediaRepo().DeleteMedia(character.PortraitPictureId);

            var itemRepo = new ItemRepo();
            foreach (string? itemId in new[] { character?.BirthItemId, character?.DeathItemId })
                if (!string.IsNullOrEmpty(itemId)) itemRepo.DeleteItem(itemId);

            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleDismissCharacterLink(BridgeMessage message)
        {
            new ItemRepo().DismissCharacterLink(
                message.Payload.GetProperty("itemId").GetString()!,
                message.Payload.GetProperty("characterId").GetString()!);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleGetCharacterAppearances(BridgeMessage message)
        {
            string characterId = message.Payload.GetProperty("characterId").GetString()!;
            ReplyToVue(message.MessageId, new CharacterRepo().GetAppearances(characterId));
        }

        /// <summary>
        /// BL-15. Which character a birth/death item belongs to, so the timeline can offer
        /// <i>Edit character</i> on it. Null for every ordinary item, which is how the caller
        /// decides whether to show the entry at all.
        /// </summary>
        private void HandleGetCharacterIdForItem(BridgeMessage message)
        {
            string itemId = message.Payload.GetProperty("itemId").GetString()!;
            ReplyToVue(message.MessageId, new { characterId = new CharacterRepo().GetCharacterIdByItem(itemId) });
        }

        // ── Relations (BL-15 phase 4 / BL-17) ─────────────────────────────────────────────────

        /// <summary>
        /// Both ends of the panel in one reply: the character's relations and the kinds they can be.
        /// The kinds barely change and the list is tiny, so one round trip beats two.
        /// </summary>
        private void HandleGetCharacterRelations(BridgeMessage message)
        {
            string characterId = message.Payload.GetProperty("characterId").GetString()!;
            var repo = new CharacterRepo();
            ReplyToVue(message.MessageId, new
            {
                Relations = repo.GetRelationships(characterId),
                Types = repo.GetRelationshipTypes(),
            });
        }

        /// <summary>
        /// BL-73: the whole web in one reply — everyone, every tie, every kind. The relations
        /// window draws all three together, and splitting it would only mean three waits.
        /// </summary>
        private void HandleGetTimelineRelations(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            var repo = new CharacterRepo();
            ReplyToVue(message.MessageId, new
            {
                Characters = repo.GetCharactersByTimeline(timelineId),
                Relations = repo.GetRelationshipsByTimeline(timelineId),
                Types = repo.GetRelationshipTypes(),
            });
        }

        private void HandleSaveCharacterRelation(BridgeMessage message)
        {
            var relation = JsonSerializer.Deserialize<CharacterRepo.CharacterRelationship>(
                message.Payload.GetRawText(), _jsonOpts)
                ?? throw new InvalidOperationException("SaveCharacterRelation received an empty payload.");
            if (relation.Character1Id == relation.Character2Id)
                throw new InvalidOperationException("A character cannot be related to themselves.");

            relation.Id = new CharacterRepo().SaveRelationship(relation);
            ReplyToVue(message.MessageId, new { status = "ok", relation });
        }

        private void HandleDeleteCharacterRelation(BridgeMessage message)
        {
            new CharacterRepo().DeleteRelationship(message.Payload.GetProperty("id").GetInt64());
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        private void HandleGetRelationshipTypes(BridgeMessage message)
        {
            ReplyToVue(message.MessageId, new CharacterRepo().GetRelationshipTypes());
        }

        private void HandleSaveRelationshipType(BridgeMessage message)
        {
            var type = JsonSerializer.Deserialize<CharacterRepo.RelationshipType>(
                message.Payload.GetRawText(), _jsonOpts)
                ?? throw new InvalidOperationException("SaveRelationshipType received an empty payload.");
            if (string.IsNullOrWhiteSpace(type.Id) || string.IsNullOrWhiteSpace(type.Name))
                throw new InvalidOperationException("A relationship type needs an id and a name.");

            new CharacterRepo().SaveRelationshipType(type);
            ReplyToVue(message.MessageId, new { status = "ok", type });
        }

        private void HandleDeleteRelationshipType(BridgeMessage message)
        {
            new CharacterRepo().DeleteRelationshipType(message.Payload.GetProperty("id").GetString()!);
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        /// <summary>
        /// BL-15. The character window asks for one of its appearances to be brought into view. The
        /// timeline is another window, so this goes out as a broadcast — whoever is drawing it jumps.
        /// </summary>
        private void HandleFocusTimelineItem(BridgeMessage message)
        {
            BridgeHub.Broadcast("FocusTimelineItem", new
            {
                ItemId = message.Payload.GetProperty("itemId").GetString(),
                AbsoluteStart = message.Payload.GetProperty("absoluteStart").GetDouble(),
            });
            ReplyToVue(message.MessageId, new { status = "ok" });
        }

        /// <summary>
        /// The calendar a timeline runs on, LOD profile included. The character window needs it to
        /// show birth and death dates the way the item editor does, without pulling the whole project.
        /// </summary>
        private void HandleGetTimelineCalendar(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            ReplyToVue(message.MessageId, new TimelineRepo().GetTimelineById(timelineId).Calendar);
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

        private void HandleGetCalendarList(BridgeMessage message)
        {
            var repo = new CalendarRepo();
            var usage = repo.GetUsageCounts();
            var calendars = repo.GetAll()
                .Select(c => new { c.Id, c.Name, UsageCount = usage.GetValueOrDefault(c.Id) });
            ReplyToVue(message.MessageId, calendars);
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
                int reassigned = new CalendarRepo().DeleteCalendar(id!);
                ReplyToVue(message.MessageId, new { status = "ok", reassigned });
            }
            catch (Exception ex)
            {
                Logger.Error("DeleteCalendar", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
        }

        private void HandleGetItemsForYear(BridgeMessage message)
        {
            int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
            int year       = message.Payload.GetProperty("year").GetInt32();

            var items = new ItemRepo().GetItemsByYear(timelineId, year);
            ReplyToVue(message.MessageId, new { status = "ok", items });
        }

        private void HandleDeleteItem(BridgeMessage message)
        {
            string? itemId = message.Payload.GetProperty("itemId").GetString();
            new ItemRepo().DeleteItem(itemId!);
            ReplyToVue(message.MessageId, new { status = "ok" });

            // Same reason as the ItemSaved broadcast: whoever deleted it is usually not the window
            // drawing it. Without this, unticking "Show on timeline" leaves a ghost until reload.
            BridgeHub.Broadcast("ItemDeleted", new { ItemId = itemId });
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

        private void HandleSetTimelineItemsLodMask(BridgeMessage message)
        {
            try
            {
                int timelineId = message.Payload.GetProperty("timelineId").GetInt32();
                int mask       = message.Payload.GetProperty("mask").GetInt32();
                int affected = new ItemRepo().SetLodMask(timelineId, mask);
                ReplyToVue(message.MessageId, new { status = "ok", affected });
            }
            catch (Exception ex)
            {
                Logger.Error("Bridge/SetTimelineItemsLodMask", ex);
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

        private void HandleGetAppConfig(BridgeMessage message)
        {
            var cfg = AppConfig.Instance;
            ReplyToVue(message.MessageId, new
            {
                DataRoot               = cfg.DataRoot,
                DbPath                 = cfg.GetDbPath(),
                MediaFolder            = cfg.GetMediaFolder(),
                BackupsFolder          = cfg.GetBackupsFolder(),
                chromeTheme            = cfg.ChromeTheme,
                themeInitialized       = cfg.ThemeInitialized,
                systemPrefersDark      = SystemPrefersDark(),
                performantPanning      = cfg.PerformantPanning,
                showAchievementPopups  = cfg.ShowAchievementPopups,
                achievementSound       = cfg.AchievementSound,
            });
        }

        private void HandleSavePerformantPanning(BridgeMessage message)
        {
            var value = message.Payload.GetProperty("value").GetBoolean();
            AppConfig.Instance.PerformantPanning = value;
            AppConfig.Instance.Save();
            ReplyToVue(message.MessageId, new { status = "ok" });
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
                Logger.Error("SetDataFolder", ex);
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
                Logger.Error("MoveDataFolder", ex);
                ReplyToVue(message.MessageId, new { status = "error", message = ex.Message });
            }
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

        private static void CopyDirectory(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (var file in Directory.GetFiles(src))
                File.Copy(file, Path.Combine(dst, Path.GetFileName(file)), overwrite: true);
            foreach (var dir in Directory.GetDirectories(src))
                CopyDirectory(dir, Path.Combine(dst, Path.GetFileName(dir)));
        }
    }
}

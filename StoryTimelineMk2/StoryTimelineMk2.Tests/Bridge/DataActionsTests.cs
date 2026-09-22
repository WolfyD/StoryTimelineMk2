using System.Text.Json;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Tests.Database;

namespace StoryTimelineMk2.Tests.Bridge;

/// <summary>
/// Guards the BL-68 phase-1 split: the data half of the bridge answers exactly the actions it
/// took over, leaves the host's alone, and still replies in the shape the page expects.
/// </summary>
[Collection("Database")]
public class DataActionsTests
{
    /// <summary>The actions that moved into StoryTimeline.Data. Spelled out on purpose: this is
    /// the list a future edit to the switch has to keep honest.</summary>
    private static readonly string[] DataActionNames =
    {
        "GetTimelineData", "CreateProject", "GetAllTimelines", "GetItemForEdit", "SearchTags",
        "GetTopTags", "GetTagList", "RenameTag", "DeleteTag", "GetTimelineCharacters",
        "GetAllStories", "SearchBooks", "GetBookChapters", "GetLayoutSettingsList",
        "RemoveImageFromItem", "GetAllPictures", "LinkImageToItem", "DeleteTimeline",
        "DuplicateTimeline", "SaveTimelineInfo", "GetCalendarList", "GetLayoutSettingsById",
        "CreateLayoutPreset", "SaveLayoutSettings", "GetCalendarById", "SaveCalendar",
        "CreateCalendar", "DeleteCalendar", "GetItemsForYear", "DeleteItem", "SaveNote",
        "DeleteNote", "GetHiddenRanges", "SaveHiddenRange", "DeleteHiddenRange",
        "ShiftTimelineItems", "SetTimelineItemsLodMask", "ResetLayoutPreset", "GetAppConfig",
        "SavePerformantPanning", "SetDataRoot", "MoveDataFolder", "CreateBackup",
        "GetBackupSettings", "SaveBackupSettings", "ImportTimeline", "GetFilterRules",
        "SaveFilterRule", "DeleteFilterRule", "GetFilterPresets", "SaveFilterPreset",
        "DeleteFilterPreset", "GetMiscSetting", "SetMiscSetting", "GetNotificationSettings",
        "SaveNotificationSettings", "SaveTimelineMinimised",
        // BL-33: the dialog-free half of the session change file.
        "GetSessionChanges", "PreviewSessionChanges", "ApplySessionChanges",
        // Phase 3: app-level actions that needed no window, or only a hook back into one.
        "SaveItem", "SaveSettings", "ToggleFullscreen", "ToggleCustomScaling", "SaveChromeTheme",
        "TriggerTestAchievement", "TriggerRandomAchievement", "TriggerRandomMilestone",
        "ListAchievementKeys", "SkipVersion", "ExecuteImportDB",
        // Phase 3: the dialog-free half of a file action — the host picks, this one reads.
        "PreviewImportDb", "PreviewTimelineImport", "ImportCalendarFile", "AddImagesToItem",
        // "CheckForUpdates" is dispatched here too, but stays out of the sweep: it hands off to
        // a background task that calls GitHub, and a test suite has no business doing that.
    };

    /// <summary>Everything still in MessageRouter: it needs a window, a file dialog or a shell.
    /// DataActions must refuse all of it so the host switch still sees it.</summary>
    private static readonly string[] HostActionNames =
    {
        "OpenAddEditItemWindow", "OpenTimeline", "ImportDB", "AddImageToItem", "ExportTimeline",
        "GetSystemFonts", "WindowMinimize", "WindowMaximizeRestore", "WindowGetMaximized",
        "WindowClose", "WindowStartDrag", "WindowGetTopMost", "WindowSetTopMost",
        "ExportCalendar", "ImportCalendar", "OpenCalendarEditorWindow", "OpenYearCalendarWindow",
        "SetCalendarYear", "BrowseDataFolder", "OpenDataFolder", "ExportFullDB",
        "BrowseAndPreviewImport", "OpenBackupsFolder", "BrowseAndPreviewTimelineImport",
        "OpenExternalUrl", "ExportSessionChanges", "BrowseAndPreviewSessionChanges",
    };

    private const int TestMessageId = 7;

    private static BridgeMessage Msg(string action, string payload = "{}") =>
        JsonSerializer.Deserialize<BridgeMessage>(
            $$"""{"action":"{{action}}","payload":{{payload}},"messageId":{{TestMessageId}}}""")!;

    [Fact]
    public void EveryMovedActionStillReachesItsHandler()
    {
        using var ctx = new DbTestContext();

        // A few of these persist AppConfig, whose file lives in the real %APPDATA% rather than
        // the test's temp DataRoot. Put it back byte for byte afterwards.
        string configPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "StoryTimelineMk2", "config.json");
        byte[]? configBefore = File.Exists(configPath) ? File.ReadAllBytes(configPath) : null;

        try
        {
            var data = new DataActions(new FakeChannel());
            foreach (string action in DataActionNames)
            {
                bool handled;
                // An empty payload makes most handlers throw on a missing property — which still
                // proves the case is wired, and is the only way to sweep all 57 without inventing
                // 57 valid payloads.
                try { handled = data.TryHandle(Msg(action)); }
                catch { handled = true; }
                Assert.True(handled, $"DataActions no longer dispatches '{action}'");
            }
        }
        finally
        {
            if (configBefore != null) File.WriteAllBytes(configPath, configBefore);
            else if (File.Exists(configPath)) File.Delete(configPath);
        }
    }

    [Fact]
    public void HostActionsAreLeftForTheHost()
    {
        var channel = new FakeChannel();
        var data = new DataActions(channel);

        foreach (string action in HostActionNames)
            Assert.False(data.TryHandle(Msg(action)), $"DataActions swallowed host action '{action}'");

        Assert.Empty(channel.Posted);
    }

    [Fact]
    public void UnknownActionsAreLeftForTheHost()
    {
        var channel = new FakeChannel();
        Assert.False(new DataActions(channel).TryHandle(Msg("NoSuchAction")));
        Assert.Empty(channel.Posted);
    }

    [Fact]
    public void RepliesCarryTheMessageIdThePageCorrelatesOn()
    {
        using var ctx = new DbTestContext();
        var channel = new FakeChannel();

        Assert.True(new DataActions(channel).TryHandle(Msg("GetAllTimelines")));

        Assert.Equal(TestMessageId, channel.Last.GetProperty("messageId").GetInt32());
        Assert.Equal("ok", channel.LastPayload.GetProperty("status").GetString());
    }

    [Fact]
    public void CreatedTimelinesComeBackFromTheDatabase()
    {
        using var ctx = new DbTestContext();
        var channel = new FakeChannel();
        var data = new DataActions(channel);

        Assert.True(data.TryHandle(Msg("CreateProject", """{"title":"Bridge round trip","author":"Tester"}""")));
        Assert.True(channel.LastPayload.GetInt32() > 0);

        Assert.True(data.TryHandle(Msg("GetAllTimelines")));
        Assert.Contains("Bridge round trip", channel.Last.GetRawText());
    }

    [Fact]
    public void MiscSettingsRoundTrip()
    {
        using var ctx = new DbTestContext();
        var channel = new FakeChannel();
        var data = new DataActions(channel);

        Assert.True(data.TryHandle(Msg("SetMiscSetting", """{"key":"bridge.test","value":"42"}""")));
        Assert.Equal("ok", channel.LastPayload.GetProperty("status").GetString());

        Assert.True(data.TryHandle(Msg("GetMiscSetting", """{"key":"bridge.test"}""")));
        Assert.Equal("42", channel.LastPayload.GetProperty("value").GetString());
    }

    [Fact]
    public void GetAppConfigReportsTheThemePreferenceTheHostSupplies()
    {
        using var ctx = new DbTestContext();
        var channel = new FakeChannel();
        var data = new DataActions(channel);
        var previous = DataActions.SystemPrefersDark;

        try
        {
            // The one line that could not travel verbatim: reading the OS theme is the host's job
            // now, because it is a registry read on Windows and nothing at all on a server.
            DataActions.SystemPrefersDark = () => false;
            Assert.True(data.TryHandle(Msg("GetAppConfig")));
            Assert.False(channel.LastPayload.GetProperty("systemPrefersDark").GetBoolean());

            DataActions.SystemPrefersDark = () => true;
            Assert.True(data.TryHandle(Msg("GetAppConfig")));
            Assert.True(channel.LastPayload.GetProperty("systemPrefersDark").GetBoolean());
        }
        finally
        {
            DataActions.SystemPrefersDark = previous;
        }
    }
}

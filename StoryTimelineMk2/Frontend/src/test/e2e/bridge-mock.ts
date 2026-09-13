import type { Page } from '@playwright/test'

/**
 * Injects a mock for `window.chrome.webview` into the page before Vue boots.
 *
 * The real WebView2 bridge works like this:
 *   1. Vue calls `window.chrome.webview.postMessage(jsonString)`
 *   2. C# routes the message and calls back via a synthetic MessageEvent on
 *      `window.chrome.webview`.
 *   3. Vue's listener resolves the pending Promise with `event.data.payload`.
 *
 * This mock replicates that handshake entirely in the browser using
 * `setTimeout(0)` so the callback fires after the current call stack unwinds,
 * matching the async nature of real bridge I/O.
 */
export async function injectBridgeMock(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((overridesArg: Record<string, unknown>) => {
    // ------------------------------------------------------------------ //
    // Mock data table — keyed by action name
    // ------------------------------------------------------------------ //
    const MOCK_RESPONSES: Record<string, unknown> = {
      GetAllTimelines: {
        data: [
          {
            Id: 1,
            Title: 'Test Timeline',
            Author: 'Test Author',
            Description: 'A test timeline',
            StartYear: 0,
            Color: null,
            CalendarId: 'cal_default_gregorian',
            Calendar: {
              Id: 'cal_default_gregorian',
              Name: 'Gregorian',
              ShortName: 'Greg',
              AlternateName: '',
              NameBefore0: 'BC',
              NameAfter0: 'AD',
              LodProfileId: 'lp_default',
              YearDefinition: JSON.stringify({
                length: 365,
                months: 12,
                month_definition: {
                  '0': { name: 'January', length: 31 },
                  '1': { name: 'February', length: 28 },
                  '2': { name: 'March', length: 31 },
                  '3': { name: 'April', length: 30 },
                  '4': { name: 'May', length: 31 },
                  '5': { name: 'June', length: 30 },
                  '6': { name: 'July', length: 31 },
                  '7': { name: 'August', length: 31 },
                  '8': { name: 'September', length: 30 },
                  '9': { name: 'October', length: 31 },
                  '10': { name: 'November', length: 30 },
                  '11': { name: 'December', length: 31 },
                },
              }),
              LodProfile: {
                Id: 'lp_default',
                Name: 'Default',
                Profile: [
                  { index: 0, formatKey: 'Millennium', stepFraction: 1000 },
                  { index: 1, formatKey: 'Century', stepFraction: 100 },
                  { index: 2, formatKey: 'Decade', stepFraction: 10 },
                  { index: 3, formatKey: 'Year', stepFraction: 1 },
                  { index: 4, formatKey: 'Month', stepFraction: 0.083333 },
                  { index: 5, formatKey: 'Day', stepFraction: 0.002740 },
                ],
              },
            },
            Settings: {
              Font: 'Arial',
              FontSizeScale: 1,
              PixelsPerSubtick: 100,
              CustomCss: '',
              UseCustomCss: false,
              IsFullscreen: false,
              ShowGuides: true,
              WindowSizeX: 1280,
              WindowSizeY: 720,
              WindowPositionX: 0,
              WindowPositionY: 0,
              UseCustomScaling: false,
              CustomScale: 1,
              DisplayRadius: 500,
              CanvasSettings: {
                showYearMarkers: true,
                fontFamily: 'Arial',
                fontSize: 14,
                fontStyle: 'normal',
                textColor: '#ffffff',
                textOffsetX: 0,
                textOffsetY: 0,
                letterSpacing: 0,
                defaultSplitterDistance: 300,
              },
            },
            LayoutSettings: {
              Id: 'ls_default',
              Name: 'Default',
              TimelineEventBoxWidth: 160,
              TimelineEventBoxHeight: 60,
              TimelineEventBoxStemOffset: 20,
              TimelineEventBorderColor: '#444',
              TimelineEventBorderWidth: 1,
              TimelineEventBorderRadius: 4,
              TimelineEventPadding: '4px',
              TimelineEventYMargin: 10,
              TimelineEventTextColor: '#ffffff',
              TimelineEventBackgroundColor: '#2a2a2a',
              TimelineEventFontFamily: 'Arial',
              TimelineEventFontSize: 12,
              TimelineEventTextUseEllipsis: true,
              TimelineEventBoxShowColor: true,
              TimelineEventBoxShowColorOnBottom: false,
              TimelineEventHasHoverHighlight: true,
              TimelineEventHoverColor: '#ffffff22',
              TimelineAgeHeight: 30,
              TimelineAgeCornerRounding: 4,
              TimelinePeriodHeight: 20,
              TimelinePeriodCornerRounding: 4,
              TimelinePeriodYMargin: 5,
              TimelinePeriodYOffset: 0,
              TimelineBoxTypesShowAsBox: false,
              TimelineBoxTypesBoxWidth: 80,
              TimelineBoxTypesShowImage: false,
              TimelineCanvasBackgroundColor: '#0f172a',
              TimelineShowNowLine: true,
              TimelineShowNowLineText: true,
              TimelineNowLineColor: '#ff6666',
              TimelineNowLineStyle: 'solid',
              TimelineTickDistance: 100,
              TimelineTickWidth: 1,
              TimelineNonYearTicksSmaller: true,
              TimelineTickMarkerFontFamily: 'Arial',
              TimelineTickMarkerFontStyle: 'normal',
              TimelineTickMarkerTextColor: '#aaaaaa',
              TimelineTickMarkerFontSize: 11,
              TimelineTickMarkerTextAlwaysOnTop: false,
              TimelineShowHoverLine: true,
              TimelineHoverLineColor: '#ffffff44',
              TimelineHoverLineStyle: 'dashed',
              TimelineHoverLineWidth: 1,
              TimelineEdgeMarginWidth: 40,
              TimelineDataRangeWidth: 800,
              TimelineIsDataRangeVisible: false,
              TimelineDataRangeColor: '#ffffff11',
              TimelineAnimateOnJumpToYear: false,
              TimelineJumpToYearAnimationLength: 500,
              TimelineAnimateLodChange: false,
              TimelineLodChangeAnimationLength: 300,
            },
          },
        ],
      },

      GetTimelineData: {
        Project: {
          Id: 1,
          Title: 'Test Timeline',
          Author: 'Test Author',
          Description: '',
          StartYear: 0,
          Color: null,
          CalendarId: 'cal_default_gregorian',
          Calendar: {
            Id: 'cal_default_gregorian',
            Name: 'Gregorian',
            ShortName: 'Greg',
            AlternateName: '',
            NameBefore0: 'BC',
            NameAfter0: 'AD',
            LodProfileId: 'lp_default',
            YearDefinition: JSON.stringify({
              length: 365,
              months: 12,
              month_definition: {
                '0': { name: 'January', length: 31 },
                '1': { name: 'February', length: 28 },
                '2': { name: 'March', length: 31 },
                '3': { name: 'April', length: 30 },
                '4': { name: 'May', length: 31 },
                '5': { name: 'June', length: 30 },
                '6': { name: 'July', length: 31 },
                '7': { name: 'August', length: 31 },
                '8': { name: 'September', length: 30 },
                '9': { name: 'October', length: 31 },
                '10': { name: 'November', length: 30 },
                '11': { name: 'December', length: 31 },
              },
            }),
            LodProfile: {
              Id: 'lp_default',
              Name: 'Default',
              Profile: [
                { index: 0, formatKey: 'Millennium', stepFraction: 1000 },
                { index: 1, formatKey: 'Century', stepFraction: 100 },
                { index: 2, formatKey: 'Decade', stepFraction: 10 },
                { index: 3, formatKey: 'Year', stepFraction: 1 },
                { index: 4, formatKey: 'Month', stepFraction: 0.083333 },
                { index: 5, formatKey: 'Day', stepFraction: 0.002740 },
              ],
            },
          },
          Settings: {
            Font: 'Arial',
            FontSizeScale: 1,
            PixelsPerSubtick: 100,
            CustomCss: '',
            UseCustomCss: false,
            IsFullscreen: false,
            ShowGuides: true,
            WindowSizeX: 1280,
            WindowSizeY: 720,
            WindowPositionX: 0,
            WindowPositionY: 0,
            UseCustomScaling: false,
            CustomScale: 1,
            DisplayRadius: 500,
            CanvasSettings: {
              showYearMarkers: true,
              fontFamily: 'Arial',
              fontSize: 14,
              fontStyle: 'normal',
              textColor: '#ffffff',
              textOffsetX: 0,
              textOffsetY: 0,
              letterSpacing: 0,
              defaultSplitterDistance: 300,
            },
          },
          LayoutSettings: {
            Id: 'ls_default',
            Name: 'Default',
            TimelineEventBoxWidth: 160,
            TimelineEventBoxHeight: 60,
            TimelineEventBoxStemOffset: 20,
            TimelineEventBorderColor: '#444',
            TimelineEventBorderWidth: 1,
            TimelineEventBorderRadius: 4,
            TimelineEventPadding: '4px',
            TimelineEventYMargin: 10,
            TimelineEventTextColor: '#ffffff',
            TimelineEventBackgroundColor: '#2a2a2a',
            TimelineEventFontFamily: 'Arial',
            TimelineEventFontSize: 12,
            TimelineEventTextUseEllipsis: true,
            TimelineEventBoxShowColor: true,
            TimelineEventBoxShowColorOnBottom: false,
            TimelineEventHasHoverHighlight: true,
            TimelineEventHoverColor: '#ffffff22',
            TimelineAgeHeight: 30,
            TimelineAgeCornerRounding: 4,
            TimelinePeriodHeight: 20,
            TimelinePeriodCornerRounding: 4,
            TimelinePeriodYMargin: 5,
            TimelinePeriodYOffset: 0,
            TimelineBoxTypesShowAsBox: false,
            TimelineBoxTypesBoxWidth: 80,
            TimelineBoxTypesShowImage: false,
            TimelineCanvasBackgroundColor: '#0f172a',
            TimelineShowNowLine: true,
            TimelineShowNowLineText: true,
            TimelineNowLineColor: '#ff6666',
            TimelineNowLineStyle: 'solid',
            TimelineTickDistance: 100,
            TimelineTickWidth: 1,
            TimelineNonYearTicksSmaller: true,
            TimelineTickMarkerFontFamily: 'Arial',
            TimelineTickMarkerFontStyle: 'normal',
            TimelineTickMarkerTextColor: '#aaaaaa',
            TimelineTickMarkerFontSize: 11,
            TimelineTickMarkerTextAlwaysOnTop: false,
            TimelineShowHoverLine: true,
            TimelineHoverLineColor: '#ffffff44',
            TimelineHoverLineStyle: 'dashed',
            TimelineHoverLineWidth: 1,
            TimelineEdgeMarginWidth: 40,
            TimelineDataRangeWidth: 800,
            TimelineIsDataRangeVisible: false,
            TimelineDataRangeColor: '#ffffff11',
            TimelineAnimateOnJumpToYear: false,
            TimelineJumpToYearAnimationLength: 500,
            TimelineAnimateLodChange: false,
            TimelineLodChangeAnimationLength: 300,
          },
        },
        Items: [
          {
            Id: 'item-uuid-1',
            Title: 'Test Event',
            Description: 'A test event',
            Content: 'Full content',
            StoryId: null,
            TypeId: 1,
            Year: 1000,
            EndYear: 1000,
            AbsoluteStart: 1000,
            AbsoluteEnd: 1000,
            BookTitle: '',
            Chapter: '',
            Page: '',
            Color: '#4a90d9',
            CreationGranularity: 3,
            TimelineId: 1,
            ItemIndex: 0,
            ShowInNotes: true,
            Importance: 5,
            MinLodLevel: 3,
            LodVisibilityMask: 255,
          },
        ],
        Notes: [],
        HiddenRanges: [],
      },

      GetItemForEdit: {
        Item: {
          Id: 'item-uuid-1',
          Title: 'Existing Test Item',
          Description: 'A pre-existing item',
          Content: 'Some content',
          StoryId: null,
          TypeId: 1,
          Year: 500,
          EndYear: 500,
          AbsoluteStart: 500,
          AbsoluteEnd: 500,
          BookTitle: '',
          Chapter: '',
          Page: '',
          Color: '#4a90d9',
          CreationGranularity: 3,
          TimelineId: 1,
          ItemIndex: 0,
          ShowInNotes: true,
          Importance: 5,
          MinLodLevel: 3,
          LodVisibilityMask: 255,
        },
        Tags: [],
        Characters: [],
        StoryRefs: [],
        ChapterRefs: [],
        Calendar: {
          Id: 'cal_default_gregorian',
          Name: 'Gregorian',
          ShortName: 'Greg',
          AlternateName: '',
          NameBefore0: 'BC',
          NameAfter0: 'AD',
          LodProfileId: 'lp_default',
          YearDefinition: JSON.stringify({
            length: 365,
            months: 12,
            month_definition: {
              '0': { name: 'January', length: 31 },
              '1': { name: 'February', length: 28 },
              '2': { name: 'March', length: 31 },
              '3': { name: 'April', length: 30 },
              '4': { name: 'May', length: 31 },
              '5': { name: 'June', length: 30 },
              '6': { name: 'July', length: 31 },
              '7': { name: 'August', length: 31 },
              '8': { name: 'September', length: 30 },
              '9': { name: 'October', length: 31 },
              '10': { name: 'November', length: 30 },
              '11': { name: 'December', length: 31 },
            },
          }),
          LodProfile: {
            Id: 'lp_default',
            Name: 'Default',
            Profile: [
              { index: 0, formatKey: 'Millennium', stepFraction: 1000 },
              { index: 1, formatKey: 'Century', stepFraction: 100 },
              { index: 2, formatKey: 'Decade', stepFraction: 10 },
              { index: 3, formatKey: 'Year', stepFraction: 1 },
              { index: 4, formatKey: 'Month', stepFraction: 0.083333 },
              { index: 5, formatKey: 'Day', stepFraction: 0.002740 },
            ],
          },
        },
        Pictures: [],
      },

      GetSystemFonts: ['Arial', 'Verdana'],
      GetLayoutSettingsList: [],
      GetCalendarList: [],
      GetAppConfig: { DataRoot: 'C:/test', DbPath: 'C:/test/timeline.sqlite', MediaFolder: 'C:/test/media', Version: '2.0', showAchievementPopups: true, achievementSound: true },
      SaveItem: { status: 'ok', itemId: 'item-uuid-1' },
      SaveNote: { status: 'ok', noteId: 'note-uuid-1' },
      DeleteNote: { status: 'ok' },
      GetHiddenRanges: { status: 'ok', ranges: [] },
      SearchTags: [],
      GetTimelineCharacters: [],
      GetTimelineStories: [],
      SearchBooks: [],
      GetBookChapters: [],
      DeleteTimeline: { status: 'ok' },
      DuplicateTimeline: { status: 'ok', newId: 2 },
      SaveTimelineInfo: { status: 'ok' },
      ExportTimeline: { status: 'ok' },
      SaveSettings: { status: 'ok' },
      ImportDB: { status: 'ok' },
      CreateProject: { status: 'ok' },
      GetCalendarById: { status: 'ok' },
      SaveCalendar: { status: 'ok' },
      CreateCalendar: { status: 'ok', calendarId: 'cal-new-1' },
      DeleteCalendar: { status: 'ok' },
      BrowseDataFolder: { path: null },
      SetDataRoot: { status: 'ok', path: 'C:/test' },
      MoveDataFolder: { status: 'ok', path: 'C:/test' },
      CreateBackup: { status: 'ok', path: 'C:/test/backup.zip' },
      GetAllPictures: [],
      LinkImageToItem: { status: 'ok' },
      AddImageToItem: { status: 'ok', Pictures: [] },
      RemoveImageFromItem: { status: 'ok' },
      DeleteItem: { status: 'ok' },
      SaveHiddenRange: { status: 'ok' },
      DeleteHiddenRange: { status: 'ok' },
      GetLayoutSettingsById: { status: 'ok' },
      CreateLayoutPreset: { status: 'ok' },
      SaveLayoutSettings: { status: 'ok' },

      // Import / export / backup actions
      BrowseAndPreviewImport: {
        sourcePath: 'C:/test/export.sqlite',
        isV2: true,
        timelineCount: 1,
        itemCount: 42,
        conflictingTimelines: [],
      },
      ExecuteImportDB: { status: 'ok' },
      ExportFullDB: { status: 'ok', path: 'C:/test/export.sqlite' },
      GetBackupSettings: {
        interval: 'weekly',
        maxBackups: 5,
        includeMedia: false,
        recentBackups: [],
      },
      SaveBackupSettings: { status: 'ok' },
      OpenBackupsFolder: { status: 'ok' },
      BrowseAndPreviewTimelineImport: {
        sourcePath: 'C:/test/timeline.zip',
        timelineTitle: 'Test Timeline',
        includeIds: false,
        hasMedia: false,
        itemCount: 15,
        mediaCount: 0,
        hasConflict: false,
        conflictingTimelineTitle: null,
        timelineId: null,
      },
      ImportTimeline: { status: 'ok' },

      // Notification / achievement actions
      GetNotificationSettings: { showAchievementPopups: true, achievementSound: true },
      SaveNotificationSettings: { status: 'ok' },
      TriggerTestAchievement: { status: 'ok' },
      TriggerRandomAchievement: { status: 'ok' },
      TriggerRandomMilestone: { status: 'ok' },
      ListAchievementKeys: {
        keys: [
          { key: 'test_achievement', title: 'Test Achievement', tier: 'achievement' },
          { key: 'test_milestone', title: 'Test Milestone', tier: 'milestone' },
        ],
      },
    }

    // Apply per-test overrides
    if (overridesArg) {
      Object.assign(MOCK_RESPONSES, overridesArg)
    }

    // ------------------------------------------------------------------ //
    // Listener registry — mirrors what api.ts sets up at runtime
    // ------------------------------------------------------------------ //
    type MessageListener = (event: MessageEvent) => void
    const listeners: MessageListener[] = []

    // ------------------------------------------------------------------ //
    // The mock bridge object
    // ------------------------------------------------------------------ //
    const mockWebview = {
      postMessage(msg: unknown) {
        let parsed: { action?: string; messageId?: number } = {}
        try {
          // api.ts posts objects directly (not JSON strings)
          parsed = typeof msg === 'string' ? JSON.parse(msg) : (msg as typeof parsed)
        } catch {
          // ignore parse errors
        }

        const { action, messageId } = parsed

        // Schedule the synthetic reply on the next tick so the Promise
        // chain in api.ts can register its listener first.
        setTimeout(() => {
          const payload = action && action in MOCK_RESPONSES ? MOCK_RESPONSES[action] : null

          const eventData = messageId !== undefined
            ? { messageId, payload }
            : { action, payload }

          const syntheticEvent = new MessageEvent('message', { data: eventData })
          listeners.forEach(fn => fn(syntheticEvent))
        }, 0)
      },

      addEventListener(type: string, fn: MessageListener) {
        if (type === 'message') listeners.push(fn)
      },

      removeEventListener(type: string, fn: MessageListener) {
        if (type === 'message') {
          const idx = listeners.indexOf(fn)
          if (idx !== -1) listeners.splice(idx, 1)
        }
      },
    }

    // ------------------------------------------------------------------ //
    // Attach to window.chrome.webview
    // ------------------------------------------------------------------ //
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).chrome = { webview: mockWebview }
  })
}

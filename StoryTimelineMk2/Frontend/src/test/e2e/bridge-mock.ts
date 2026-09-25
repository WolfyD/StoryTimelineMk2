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
    // The calendar — one object, shared by every action that carries one
    // ------------------------------------------------------------------ //
    /**
     * A transcription of `cal_default_gregorian` as `MainDbMigrations` seeds it: the wrapping Winter,
     * the twenty-eight-day February, "Sept" rather than "Sep", and the real eight-rung LOD ladder
     * with the uppercase format keys `buildFormatRegistry` is keyed by.
     *
     * It used to be three near-copies of a thinner version — no seasons, no week, no short names, and
     * a ladder keyed 'Month'/'Day', which no formatter answers to. Every rung therefore drew plain
     * year numbers, so a spec could not have caught the ruler bugs BL-44 fixed.
     */
    const GREGORIAN: Record<string, unknown> = {
      Id: 'cal_default_gregorian',
      Name: 'Gregorian',
      ShortName: 'Greg.',
      AlternateName: 'Western Calendar',
      NameBefore0: 'BCE',
      NameAfter0: 'CE',
      LodProfileId: 'lod_default',
      YearDefinition: JSON.stringify({
        length: 365,
        week_definition: { length: 7, days_have_names: true, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], weekend: [5, 6] },
        seasons: 4,
        season_definition: {
          '0': { name: 'Spring', start: 60, end: 151 },
          '1': { name: 'Summer', start: 152, end: 243, significance: 'hottest' },
          '2': { name: 'Fall', start: 244, end: 334 },
          '3': { name: 'Winter', start: 335, end: 59, significance: 'coldest' },
        },
        months: 12,
        month_definition: {
          months_have_short_name: true,
          '0': { name: 'January', short_name: 'Jan', length: 31, season: 3 },
          '1': { name: 'February', short_name: 'Feb', length: 28, season: 3 },
          '2': { name: 'March', short_name: 'Mar', length: 31, season: 0 },
          '3': { name: 'April', short_name: 'Apr', length: 30, season: 0 },
          '4': { name: 'May', short_name: 'May', length: 31, season: 0 },
          '5': { name: 'June', short_name: 'Jun', length: 30, season: 1 },
          '6': { name: 'July', short_name: 'Jul', length: 31, season: 1 },
          '7': { name: 'August', short_name: 'Aug', length: 31, season: 1 },
          '8': { name: 'September', short_name: 'Sept', length: 30, season: 2 },
          '9': { name: 'October', short_name: 'Oct', length: 31, season: 2 },
          '10': { name: 'November', short_name: 'Nov', length: 30, season: 2 },
          '11': { name: 'December', short_name: 'Dec', length: 31, season: 3 },
        },
      }),
      LodProfile: {
        Id: 'lod_default',
        Name: 'Standard Gregorian Scale',
        // A string, because that is the column: the store does `JSON.parse(Profile.toString())`. An
        // array here parsed as "[object Object],[object Object]", threw, and left the timeline with no
        // ladder at all — silently, because the catch around the whole load only writes to the console.
        Profile: JSON.stringify([
          { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
          { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
          { index: 2, formatKey: 'DECADES', stepFraction: 10 },
          { index: 3, formatKey: 'YEARS', stepFraction: 1 },
          { index: 4, formatKey: 'SEASONS', stepFraction: 0.25 },
          { index: 5, formatKey: 'MONTHS', stepFraction: 0.08333333333 },
          { index: 6, formatKey: 'WEEKS', stepFraction: 0.01923076923 },
          { index: 7, formatKey: 'DAYS', stepFraction: 0.00273972602 },
        ]),
      },
    }

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
            Calendar: GREGORIAN,
            Settings: {
              PixelsPerSubtick: 100,
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
              TimelinePictureCaptionFontSize: 12,
              TimelineCharacterCaptionFontSize: 12,
              TimelineCanvasBackgroundColor: '#0f172a',
              TimelineShowNowLine: true,
              TimelineShowNowLineText: true,
              TimelineNowLineColor: '#ff6666',
              TimelineNowLineStyle: 'solid',
              TimelineNowLineWidth: 2,
              TimelineTickDistance: 100,
              TimelineTickWidth: 1,
              TimelineNonYearTicksSmaller: true,
              TimelineTickMarkerFontFamily: 'Arial',
              TimelineTickMarkerFontStyle: 'normal',
              TimelineTickMarkerTextColor: '#aaaaaa',
              TimelineTickMarkerFontSize: 11,
              TimelineTickMarkerTextAlwaysOnTop: false,
              TimelineTickMarkerTextAngled: false,
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
          Calendar: GREGORIAN,
          Settings: {
            PixelsPerSubtick: 100,
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
            TimelinePictureCaptionFontSize: 12,
            TimelineCharacterCaptionFontSize: 12,
            TimelineCanvasBackgroundColor: '#0f172a',
            TimelineShowNowLine: true,
            TimelineShowNowLineText: true,
            TimelineNowLineColor: '#ff6666',
            TimelineNowLineStyle: 'solid',
            TimelineNowLineWidth: 2,
            TimelineTickDistance: 100,
            TimelineTickWidth: 1,
            TimelineNonYearTicksSmaller: true,
            TimelineTickMarkerFontFamily: 'Arial',
            TimelineTickMarkerFontStyle: 'normal',
            TimelineTickMarkerTextColor: '#aaaaaa',
            TimelineTickMarkerFontSize: 11,
            TimelineTickMarkerTextAlwaysOnTop: false,
            TimelineTickMarkerTextAngled: false,
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
        Calendar: GREGORIAN,
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
      GetAllStories: [],
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
        status: 'ok',
        preview: {
          sourcePath: 'C:/test/export.sqlite',
          isV2: true,
          timelineCount: 1,
          itemCount: 42,
          conflictingTimelines: [],
        },
      },
      ExecuteImportDB: { status: 'ok' },
      ExportFullDB: { status: 'ok', path: 'C:/test/export.sqlite' },
      GetBackupSettings: {
        interval: 'weekly',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/backups',
        recentBackups: [],
      },
      SaveBackupSettings: { status: 'ok' },
      OpenBackupsFolder: { status: 'ok' },
      BrowseAndPreviewTimelineImport: {
        status: 'ok',
        preview: {
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
      // A ruler test wants a different calendar, not a different everything: an entry in this map
      // replaces a whole action, and GetTimelineData is two hundred lines of layout settings. The
      // `__calendar` key patches the shared calendar in place instead, so GetTimelineData,
      // GetAllTimelines and GetItemForEdit all agree about what year they are in.
      // `__layout` is the same idea for layout settings, which GetTimelineData and GetAllTimelines
      // each carry their own copy of — it patches every one of them rather than either alone.
      // `__items` swaps only GetTimelineData's item list, keeping the two hundred lines around it.
      const { __calendar: cal, __layout: layout, __items: items, ...rest } =
        overridesArg as { __calendar?: Record<string, unknown>; __layout?: Record<string, unknown>; __items?: unknown[] }
      if (cal) Object.assign(GREGORIAN, cal)
      if (items) (MOCK_RESPONSES.GetTimelineData as { Items: unknown[] }).Items = items
      if (layout) {
        const patchLayout = (node: unknown) => {
          if (!node || typeof node !== 'object') return
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (k === 'LayoutSettings' && v && typeof v === 'object') Object.assign(v, layout)
            else patchLayout(v)
          }
        }
        patchLayout(MOCK_RESPONSES)
      }
      Object.assign(MOCK_RESPONSES, rest)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, overrides as any)
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { HiddenRange, LayoutSettings, LodLevel } from '@/types/models'

// Silence console calls made inside the store
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock BackendAPI so loadTimelines() can be exercised without a real bridge
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    request: vi.fn(),
    send: vi.fn(),
    LoadTimelineData: vi.fn(),
  },
}))

import { BackendAPI } from '@/bridge/api'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeHiddenRange(overrides: Partial<HiddenRange> = {}): HiddenRange {
  return {
    Id: 1,
    TimelineId: 1,
    StartYear: 100,
    EndYear: 200,
    Label: null,
    ...overrides,
  }
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return Object.assign({
    Id: 'ls_ext_test',
    Name: 'Extended Test',
    TimelineEventBoxWidth: 130,
    TimelineEventBoxHeight: 30,
    TimelineEventBoxStemOffset: 10,
    TimelineEventBorderColor: '#000',
    TimelineEventBorderWidth: 1,
    TimelineEventBorderRadius: 3,
    TimelineEventPadding: '10',
    TimelineEventYMargin: 5,
    TimelineEventTextColor: '#000',
    TimelineEventBackgroundColor: '#fff',
    TimelineEventFontFamily: 'Arial',
    TimelineEventFontSize: 16,
    TimelineEventTextUseEllipsis: true,
    TimelineEventBoxShowColor: true,
    TimelineEventBoxShowColorOnBottom: false,
    TimelineEventHasHoverHighlight: true,
    TimelineEventHoverColor: '#33f',
    TimelineAgeHeight: 30,
    TimelineAgeCornerRounding: 0,
    TimelinePeriodHeight: 15,
    TimelinePeriodCornerRounding: 10,
    TimelinePeriodYMargin: 5,
    TimelinePeriodYOffset: 30,
    TimelineBoxTypesShowAsBox: true,
    TimelineBoxTypesBoxWidth: 100,
    TimelineBoxTypesShowImage: true,
    TimelinePictureCaptionFontSize: 12,
    TimelineCharacterCaptionFontSize: 12,
    TimelineCanvasBackgroundColor: '#f1e7d5',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineNowLineWidth: 2,
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
    TimelineTickMarkerTextAngled: false,
    TimelineShowHoverLine: true,
    TimelineHoverLineColor: '#f00',
    TimelineHoverLineStyle: 'solid',
    TimelineHoverLineWidth: 1,
    TimelineEdgeMarginWidth: 10,
    TimelineDataRangeWidth: 100,
    TimelineIsDataRangeVisible: true,
    TimelineDataRangeColor: '#ff72',
    TimelineAnimateOnJumpToYear: true,
    TimelineJumpToYearAnimationLength: 600,
    TimelineAnimateLodChange: true,
    TimelineLodChangeAnimationLength: 200,
    TimelineTickColor: '#c8b9a4',
    TimelineAxisColor: '#b5a692',
    NotesPanelBackgroundColor: '',
    NotesPanelCardBackgroundColor: '',
    NotesPanelTextColor: '',
    NotesPanelHeadingColor: '',
    NotesPanelAccentColor: '',
    NotesPanelFontSize: 13,
    DataPanelBackgroundColor: '#f5f0e8',
    DataPanelCardBackgroundColor: '#ffffffaa',
    DataPanelH1Color: '#2c1f0f',
    DataPanelH2Color: '#3a2b1a',
    DataPanelH3Color: '#2c1f0f',
    DataPanelH4Color: '#5c4a38',
    DataPanelFontFamily: 'Georgia, serif',
    DataPanelFontSize: 14,
    GalleryPanelBackgroundColor: '',
    GalleryPanelBorderColor: '',
    GalleryPanelTextColor: '',
    CalendarPanelBackgroundColor: '#f5f0e8',
    CalendarPanelBorderColor: '#d5cec4',
    CalendarPanelTextColor: '#5c4a38',
    CalendarPanelWeekHighlightColor: '#6366f118',
    CalendarPanelDayHighlightColor: '#6366f135',
    TimelineCalendarOverlayEnabled: false,
    TimelineCalendarOverlaySeasonColor: '#ffffff10',
    TimelineCalendarOverlayMonthColor: '#ffffff0c',
    TimelineCalendarOverlayWeekColor: '#ffffff08',
    TimelineCalendarOverlayDayColor: '#ffffff06',
    ...overrides,
    TimelineBreakFillColor: '#ffffff',
    TimelineBreakBorderColor: '#000000',
    MeasureLineColor: '#000000',
  }, overrides)
}

function makeLodProfile(): LodLevel[] {
  return [
    { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
    { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
    { index: 2, formatKey: 'DECADES', stepFraction: 10 },
    { index: 3, formatKey: 'YEARS', stepFraction: 1 },
    { index: 4, formatKey: 'SEASONS', stepFraction: 0.25 },
    { index: 5, formatKey: 'MONTHS', stepFraction: 0.083 },
    { index: 6, formatKey: 'WEEKS', stepFraction: 0.019 },
    { index: 7, formatKey: 'DAYS', stepFraction: 0.00274 },
  ]
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('timelineStore (extended)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ setHiddenRanges Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('setHiddenRanges', () => {
    it('sets hiddenRanges to the provided array', () => {
      const store = useTimelineStore()
      const ranges = [makeHiddenRange({ Id: 1 }), makeHiddenRange({ Id: 2, StartYear: 500, EndYear: 600 })]
      store.setHiddenRanges(ranges)
      expect(store.hiddenRanges).toHaveLength(2)
      expect(store.hiddenRanges[0].Id).toBe(1)
      expect(store.hiddenRanges[1].Id).toBe(2)
    })

    it('replaces any previous hidden ranges entirely', () => {
      const store = useTimelineStore()
      store.setHiddenRanges([makeHiddenRange({ Id: 1 })])
      store.setHiddenRanges([makeHiddenRange({ Id: 99, StartYear: 9000, EndYear: 9100 })])
      expect(store.hiddenRanges).toHaveLength(1)
      expect(store.hiddenRanges[0].Id).toBe(99)
    })

    it('accepts an empty array, clearing all ranges', () => {
      const store = useTimelineStore()
      store.setHiddenRanges([makeHiddenRange()])
      store.setHiddenRanges([])
      expect(store.hiddenRanges).toEqual([])
    })

    it('stores range Label when provided', () => {
      const store = useTimelineStore()
      store.setHiddenRanges([makeHiddenRange({ Label: 'Dark Age' })])
      expect(store.hiddenRanges[0].Label).toBe('Dark Age')
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ setLayoutSettings Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('setLayoutSettings', () => {
    it('updates store.layoutSettings to the provided value', () => {
      const store = useTimelineStore()
      const ls = makeLayoutSettings({ Id: 'ls_custom', Name: 'Custom' })
      store.setLayoutSettings(ls)
      expect(store.layoutSettings?.Id).toBe('ls_custom')
      expect(store.layoutSettings?.Name).toBe('Custom')
    })

    it('overwrites a previously set layoutSettings', () => {
      const store = useTimelineStore()
      store.setLayoutSettings(makeLayoutSettings({ Id: 'ls_first' }))
      store.setLayoutSettings(makeLayoutSettings({ Id: 'ls_second' }))
      expect(store.layoutSettings?.Id).toBe('ls_second')
    })

    it('copies all fields correctly', () => {
      const store = useTimelineStore()
      const ls = makeLayoutSettings({ TimelineTickDistance: 250 })
      store.setLayoutSettings(ls)
      expect(store.layoutSettings?.TimelineTickDistance).toBe(250)
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ setDistanceFrom Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('setDistanceFrom', () => {
    it('sets distanceFrom to a positive number', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(1234.5)
      expect(store.distanceFrom).toBe(1234.5)
    })

    it('sets distanceFrom to a negative number', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(-500)
      expect(store.distanceFrom).toBe(-500)
    })

    it('sets distanceFrom to zero', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(0)
      expect(store.distanceFrom).toBe(0)
    })

    it('sets distanceFrom to null', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(1000)
      store.setDistanceFrom(null)
      expect(store.distanceFrom).toBeNull()
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ setDistanceTo Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('setDistanceTo', () => {
    it('sets distanceTo to a positive number', () => {
      const store = useTimelineStore()
      store.setDistanceTo(9999)
      expect(store.distanceTo).toBe(9999)
    })

    it('sets distanceTo to null', () => {
      const store = useTimelineStore()
      store.setDistanceTo(2000)
      store.setDistanceTo(null)
      expect(store.distanceTo).toBeNull()
    })

    it('updating distanceTo does not affect distanceFrom', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(1000)
      store.setDistanceTo(2000)
      expect(store.distanceFrom).toBe(1000)
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ setNotesDistanceTab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('setNotesDistanceTab', () => {
    it('switches to "distance"', () => {
      const store = useTimelineStore()
      store.setNotesDistanceTab('distance')
      expect(store.notesDistanceTab).toBe('distance')
    })

    it('switches back to "notes" after being on "distance"', () => {
      const store = useTimelineStore()
      store.setNotesDistanceTab('distance')
      store.setNotesDistanceTab('notes')
      expect(store.notesDistanceTab).toBe('notes')
    })

    it('starts on "notes" by default', () => {
      const store = useTimelineStore()
      expect(store.notesDistanceTab).toBe('notes')
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ loadTimelines Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('loadTimelines', () => {
    it('sets projects to the array from response.data', async () => {
      const store = useTimelineStore()
      const mockProjects = [
        { Id: 1, Title: 'Alpha', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' },
        { Id: 2, Title: 'Beta',  Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' },
      ]
      ;(BackendAPI.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockProjects })

      await store.loadTimelines()

      // projects must be the ARRAY, not the container object
      expect(Array.isArray(store.projects)).toBe(true)
      expect(store.projects).toHaveLength(2)
      expect(store.projects[0].Id).toBe(1)
      expect(store.projects[1].Id).toBe(2)
    })

    it('sets projects to [] when response.data is undefined (null-safe)', async () => {
      const store = useTimelineStore()
      ;(BackendAPI.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

      await store.loadTimelines()

      expect(store.projects).toEqual([])
    })

    it('does NOT set projects to the entire response container object', async () => {
      const store = useTimelineStore()
      const container = { data: [{ Id: 5, Title: 'Test' }] }
      ;(BackendAPI.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(container)

      await store.loadTimelines()

      // If the store incorrectly assigned the container, projects would have a .data property
      expect((store.projects as unknown as { data?: unknown }).data).toBeUndefined()
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ lodZoomIn Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('lodZoomIn (extended)', () => {
    it('increments currentLodIndex by 1', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(4)
    })

    it('updates currentLodTitle to the new lod formatKey', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3 // YEARS
      store.lodZoomIn()
      expect(store.currentLodTitle).toBe('SEASONS')
    })

    it('does not exceed lodProfile.length - 1', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 7 // already at max
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(7)
    })

    it('does nothing when lodProfile is empty', () => {
      const store = useTimelineStore()
      store.lodProfile = []
      const prevIndex = store.currentLodIndex
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(prevIndex)
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ lodZoomOut Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('lodZoomOut (extended)', () => {
    it('decrements currentLodIndex by 1', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.lodZoomOut()
      expect(store.currentLodIndex).toBe(2)
    })

    it('updates currentLodTitle to the new lod formatKey', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3 // YEARS Ã¢â€ â€™ after zoom out Ã¢â€ â€™ DECADES
      store.lodZoomOut()
      expect(store.currentLodTitle).toBe('DECADES')
    })

    it('does not go below 0', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 0
      store.lodZoomOut()
      expect(store.currentLodIndex).toBe(0)
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ pastItems computed Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('pastItems computed', () => {
    it('returns items with Year strictly less than currentNowYear', () => {
      const store = useTimelineStore()
      store.setNowYear(1500)
      store.addItem({ Id: 'past', Year: 1499 } as any)
      store.addItem({ Id: 'present', Year: 1500 } as any)
      store.addItem({ Id: 'future', Year: 1501 } as any)
      const ids = store.pastItems.map(i => i.Id)
      expect(ids).toContain('past')
      expect(ids).not.toContain('present')
      expect(ids).not.toContain('future')
    })

    it('returns empty array when currentNowYear is less than all items', () => {
      const store = useTimelineStore()
      store.setNowYear(-1000)
      store.addItem({ Id: 'a', Year: 0 } as any)
      store.addItem({ Id: 'b', Year: 500 } as any)
      expect(store.pastItems).toHaveLength(0)
    })

    it('returns all items when currentNowYear exceeds all item Years', () => {
      const store = useTimelineStore()
      store.setNowYear(9999)
      store.addItem({ Id: 'a', Year: 0 } as any)
      store.addItem({ Id: 'b', Year: 1000 } as any)
      expect(store.pastItems).toHaveLength(2)
    })

    it('is reactive Ã¢â‚¬â€ updates when currentNowYear changes', () => {
      const store = useTimelineStore()
      store.addItem({ Id: 'a', Year: 500 } as any)
      store.setNowYear(0)
      expect(store.pastItems).toHaveLength(0)
      store.setNowYear(1000)
      expect(store.pastItems).toHaveLength(1)
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ futureItems computed Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('futureItems computed', () => {
    it('returns items with Year >= currentNowYear (inclusive at boundary)', () => {
      const store = useTimelineStore()
      store.setNowYear(1500)
      store.addItem({ Id: 'past', Year: 1499 } as any)
      store.addItem({ Id: 'now', Year: 1500 } as any)
      store.addItem({ Id: 'future', Year: 2000 } as any)
      const ids = store.futureItems.map(i => i.Id)
      expect(ids).toContain('now')
      expect(ids).toContain('future')
      expect(ids).not.toContain('past')
    })

    it('returns all items when currentNowYear is 0 and all items have Year >= 0', () => {
      const store = useTimelineStore()
      store.setNowYear(0)
      store.addItem({ Id: 'a', Year: 0 } as any)
      store.addItem({ Id: 'b', Year: 100 } as any)
      expect(store.futureItems).toHaveLength(2)
    })

    it('returns empty array when all items precede currentNowYear', () => {
      const store = useTimelineStore()
      store.setNowYear(9999)
      store.addItem({ Id: 'a', Year: 1000 } as any)
      expect(store.futureItems).toHaveLength(0)
    })

    it('is reactive Ã¢â‚¬â€ updates when currentNowYear changes', () => {
      const store = useTimelineStore()
      store.addItem({ Id: 'a', Year: 500 } as any)
      store.setNowYear(1000)
      expect(store.futureItems).toHaveLength(0)
      store.setNowYear(0)
      expect(store.futureItems).toHaveLength(1)
    })
  })

  // ── reference underlay (BL-66 step 2) ──────────────────────────────────────

  describe('loadReference / clearReference', () => {
    it('keeps the project and items (minus boundaries) with a zero shift, and does not touch the active state', async () => {
      const store = useTimelineStore()
      store.title = 'Active'
      ;(BackendAPI.LoadTimelineData as any).mockResolvedValueOnce({
        Project: { Id: 9, Title: 'Ref' },
        Items: [{ Id: 'a', TypeId: 2 }, { Id: 's', TypeId: 8 }, { Id: 'e', TypeId: 9 }],
      })
      await store.loadReference(9)
      expect(store.reference).toEqual({ project: { Id: 9, Title: 'Ref' }, items: [{ Id: 'a', TypeId: 2 }], shift: 0 })
      expect(store.title).toBe('Active')
      expect(store.items).toHaveLength(0)

      store.clearReference()
      expect(store.reference).toBeNull()
    })

    it('throws on an error reply so the caller can show it', async () => {
      const store = useTimelineStore()
      ;(BackendAPI.LoadTimelineData as any).mockResolvedValueOnce({ status: 'error', message: 'nope' })
      await expect(store.loadReference(9)).rejects.toThrow('nope')
      expect(store.reference).toBeNull()
    })
  })
})

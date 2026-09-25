import { describe, it, expect } from 'vitest'
import {
  FormatRegistry,
  buildFormatRegistry,
  DEFAULT_CALENDAR_CONFIG,
  absoluteToVisual,
  visualToAbsolute,
  BREAK_TICKS,
  getXFromTime,
  isLeftOfNow,
  getAssignedLane,
  tickDistanceOf,
  laneSpanFor,
  type LaneLock,
} from '@/utils/timelineLayout'
import type { HiddenRange, LayoutSettings, LodLevel } from '@/types/models'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeRange(startYear: number, endYear: number, id = 1): HiddenRange {
  return { Id: id, TimelineId: 1, StartYear: startYear, EndYear: endYear, Label: null }
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return Object.assign({
    Id: 'ls_test',
    Name: 'Test',
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
    NotesPanelBackgroundColor: '#f9f7fe',
    NotesPanelCardBackgroundColor: '#e8e4f5',
    NotesPanelTextColor: '#1e1640',
    NotesPanelHeadingColor: '#5b4d8a',
    NotesPanelAccentColor: '#6366f1',
    NotesPanelFontSize: 13,
    DataPanelBackgroundColor: '#f5f0e8',
    DataPanelCardBackgroundColor: '#ffffffaa',
    DataPanelH1Color: '#2c1f0f',
    DataPanelH2Color: '#3a2b1a',
    DataPanelH3Color: '#2c1f0f',
    DataPanelH4Color: '#5c4a38',
    DataPanelFontFamily: 'Georgia, serif',
    DataPanelFontSize: 14,
    GalleryPanelBackgroundColor: '#f5f0e8',
    GalleryPanelBorderColor: '#d5cec4',
    GalleryPanelTextColor: '#5c4a38',
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

// Ã¢â€â‚¬Ã¢â€â‚¬ FormatRegistry Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('FormatRegistry', () => {
  describe('MILLENNIA', () => {
    it('renders zero fraction as "<year>s"', () => {
      expect(FormatRegistry['MILLENNIA']!(2000, 0)).toBe('2000s')
    })
    it('renders non-zero fraction (ignores fraction) as "<floor>s"', () => {
      expect(FormatRegistry['MILLENNIA']!(1999.7, 0.7)).toBe('1999s')
    })
  })

  describe('CENTURIES', () => {
    it('renders zero fraction', () => {
      expect(FormatRegistry['CENTURIES']!(1900, 0)).toBe('1900')
    })
    it('renders non-zero fraction (ignores fraction)', () => {
      expect(FormatRegistry['CENTURIES']!(1950.5, 0.5)).toBe('1950')
    })
  })

  describe('DECADES', () => {
    it('renders zero fraction', () => {
      expect(FormatRegistry['DECADES']!(1990, 0)).toBe('1990')
    })
    it('renders non-zero fraction (floor)', () => {
      expect(FormatRegistry['DECADES']!(1997.3, 0.3)).toBe('1997')
    })
  })

  describe('YEARS', () => {
    it('renders the floored year', () => {
      expect(FormatRegistry['YEARS']!(2024, 0)).toBe('2024')
      expect(FormatRegistry['YEARS']!(2024.9, 0.9)).toBe('2024')
    })
  })

  // BL-44: a sub-year formatter is handed the integer day-of-year its tick falls on, and names the
  // unit that day belongs to — nothing else. Day 0 is not special here any more: printing the bare
  // year where one begins is the grid's convention, and the grid applies it itself.

  describe('QUARTERS', () => {
    it('names the quarter a day falls in', () => {
      expect(FormatRegistry['QUARTERS']!(2020, 0)).toBe('Q1')
      expect(FormatRegistry['QUARTERS']!(2020, 92)).toBe('Q2')
      expect(FormatRegistry['QUARTERS']!(2020, 200)).toBe('Q3')
      expect(FormatRegistry['QUARTERS']!(2020, 300)).toBe('Q4')
    })
    it('rolls a day at the year end into the next year', () => {
      expect(FormatRegistry['QUARTERS']!(2020, 365)).toBe('2021')
    })
  })

  describe('SEASONS', () => {
    it('names the season a day falls in', () => {
      expect(FormatRegistry['SEASONS']!(2020, 0)).toBe('Spring')
      expect(FormatRegistry['SEASONS']!(2020, 100)).toBe('Summer')
      expect(FormatRegistry['SEASONS']!(2020, 200)).toBe('Fall')
      expect(FormatRegistry['SEASONS']!(2020, 300)).toBe('Winter')
    })
    it('rolls a day at the year end into the next year', () => {
      expect(FormatRegistry['SEASONS']!(2020, 365)).toBe('2021')
    })
  })

  describe('MONTHS', () => {
    it('names every month from its own first day — February was the one that never showed', () => {
      for (const m of DEFAULT_CALENDAR_CONFIG.months) {
        expect(FormatRegistry['MONTHS']!(2020, m.startDay)).toBe(m.shortName)
      }
    })
    it('names the month a day in the middle of one belongs to', () => {
      expect(FormatRegistry['MONTHS']!(2020, 45)).toBe('Feb')
      expect(FormatRegistry['MONTHS']!(2020, 364)).toBe('Dec')
    })
    it('rolls a day at the year end into the next year', () => {
      expect(FormatRegistry['MONTHS']!(2020, 365)).toBe('2021')
    })
  })

  describe('WEEKS', () => {
    it('counts weeks from day zero', () => {
      expect(FormatRegistry['WEEKS']!(2020, 0)).toBe('W1')
      expect(FormatRegistry['WEEKS']!(2020, 7)).toBe('W2')
      expect(FormatRegistry['WEEKS']!(2020, 364)).toBe('W53')
    })
    it('rolls a day at the year end into the next year', () => {
      expect(FormatRegistry['WEEKS']!(2020, 365)).toBe('2021')
    })
  })

  describe('DAYS', () => {
    it('reads as a date, not a count of days into the year', () => {
      expect(FormatRegistry['DAYS']!(2020, 0)).toBe('1 Jan')
      expect(FormatRegistry['DAYS']!(2020, 31)).toBe('1 Feb')
      expect(FormatRegistry['DAYS']!(2020, 113)).toBe('24 Apr')
      expect(FormatRegistry['DAYS']!(2020, 364)).toBe('31 Dec')
    })
    it('falls back to a day count when the calendar names no months', () => {
      const noMonths = buildFormatRegistry({ ...DEFAULT_CALENDAR_CONFIG, months: [] })
      expect(noMonths['DAYS']!(2020, 113)).toBe('Day 114')
    })
    it('rolls a day at the year end into the next year', () => {
      expect(FormatRegistry['DAYS']!(2020, 365)).toBe('2021')
    })
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ absoluteToVisual Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('absoluteToVisual', () => {
  const step = 1

  it('returns t unchanged when ranges is empty', () => {
    expect(absoluteToVisual(500, [], step)).toBe(500)
  })

  it('returns t unchanged when ranges is null/undefined', () => {
    expect(absoluteToVisual(500, null as any, step)).toBe(500)
  })

  it('returns t unchanged when t is before all ranges', () => {
    const ranges = [makeRange(1000, 2000)]
    expect(absoluteToVisual(500, ranges, step)).toBe(500)
  })

  it('shifts t when range is entirely before t', () => {
    // Range 1000Ã¢â‚¬â€œ2000 hidden: hiddenSize=1000, breakSize=0.3*1 = 0.3
    // net offset = -(1000 - 0.3) = -999.7
    const ranges = [makeRange(1000, 2000)]
    const result = absoluteToVisual(3000, ranges, step)
    const expected = 3000 - (1000 - BREAK_TICKS * step)
    expect(result).toBeCloseTo(expected)
  })

  it('maps t inside a range proportionally to the break strip', () => {
    const ranges = [makeRange(1000, 2000)]
    // t = 1500, fraction = 0.5, breakSize=0.3
    // result = 1000 + 0 + 0.5 * 0.3 = 1000.15
    const result = absoluteToVisual(1500, ranges, step)
    const breakSize = BREAK_TICKS * step
    expect(result).toBeCloseTo(1000 + 0.5 * breakSize)
  })

  it('handles multiple ranges correctly', () => {
    const ranges = [makeRange(100, 200), makeRange(300, 400)]
    // t=500, after both ranges
    // offset1 = -(100-0.3) = -99.7
    // offset2 = -(100-0.3) = -99.7 Ã¢â€ â€™ total -199.4
    const result = absoluteToVisual(500, ranges, step)
    const breakSize = BREAK_TICKS * step
    const expected = 500 - 2 * (100 - breakSize)
    expect(result).toBeCloseTo(expected)
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ visualToAbsolute Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('visualToAbsolute', () => {
  const step = 1

  it('returns v unchanged when ranges is empty', () => {
    expect(visualToAbsolute(500, [], step)).toBe(500)
  })

  it('returns v unchanged when v is before all ranges', () => {
    const ranges = [makeRange(1000, 2000)]
    expect(visualToAbsolute(500, ranges, step)).toBe(500)
  })

  it('is the inverse of absoluteToVisual for t after a range', () => {
    const ranges = [makeRange(1000, 2000)]
    const original = 3000
    const visual = absoluteToVisual(original, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(original)
  })

  it('is the inverse of absoluteToVisual for t inside a range', () => {
    const ranges = [makeRange(1000, 2000)]
    const original = 1500
    const visual = absoluteToVisual(original, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(original)
  })

  it('is the inverse of absoluteToVisual for multiple ranges', () => {
    const ranges = [makeRange(100, 200), makeRange(300, 400)]
    const original = 500
    const visual = absoluteToVisual(original, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(original)
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ isLeftOfNow Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('isLeftOfNow', () => {
  it('returns true when xPos < viewportWidth/2', () => {
    expect(isLeftOfNow(200, 800)).toBe(true)
  })

  it('returns false when xPos >= viewportWidth/2', () => {
    expect(isLeftOfNow(400, 800)).toBe(false)
    expect(isLeftOfNow(600, 800)).toBe(false)
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ getXFromTime Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('getXFromTime', () => {
  it('returns centerScreenX when absoluteTime equals centerTime with no ranges', () => {
    const viewportWidth = 800
    const centerTime = 1000
    const result = getXFromTime(1000, centerTime, 1, viewportWidth, 100)
    expect(result).toBeCloseTo(400)
  })

  it('shifts right for a time after center', () => {
    const result = getXFromTime(1001, 1000, 1, 800, 100)
    // (1 unit ahead / 1 step) * 100px = +100px from center(400)
    expect(result).toBeCloseTo(500)
  })

  it('shifts left for a time before center', () => {
    const result = getXFromTime(999, 1000, 1, 800, 100)
    expect(result).toBeCloseTo(300)
  })

  it('spaces a rung by its own tick distance', () => {
    // BL-80: the only thing a tick distance does is scale the gap, so a doubled one doubles it.
    expect(getXFromTime(1001, 1000, 1, 800, 200)).toBeCloseTo(600)
  })
})

// ── tickDistanceOf (BL-80) ───────────────────────────────────────────────────

describe('tickDistanceOf', () => {
  const profile: LodLevel[] = [
    { index: 1, formatKey: 'CENTURIES', stepFraction: 100, tickDistance: 200 },
    { index: 3, formatKey: 'YEARS', stepFraction: 1 },
    { index: 7, formatKey: 'DAYS', stepFraction: 1 / 365, tickDistance: 0 },
  ]

  it('takes the rung override when it has one', () => {
    expect(tickDistanceOf(profile, 1, 100)).toBe(200)
  })

  it('inherits the global setting otherwise — opt-in, so no override is the normal case', () => {
    expect(tickDistanceOf(profile, 3, 100)).toBe(100)
    expect(tickDistanceOf(profile, 99, 100)).toBe(100)
    expect(tickDistanceOf(undefined, 1, 100)).toBe(100)
  })

  it('reads zero as no override rather than as a zero divisor', () => {
    expect(tickDistanceOf(profile, 7, 100)).toBe(100)
  })
})

describe('laneSpanFor', () => {
  // 30px boxes 10px apart: a 30px event is one lane, an 80px portrait covers two.
  const ls = makeLayoutSettings({ TimelineEventBoxHeight: 30, TimelineEventYMargin: 10 })

  it('counts the lanes a box of a given height swallows', () => {
    expect(laneSpanFor(30, ls)).toBe(1)
    expect(laneSpanFor(80, ls)).toBe(2)
    expect(laneSpanFor(120, ls)).toBe(3)
  })

  it('never returns less than one lane', () => {
    expect(laneSpanFor(0, ls)).toBe(1)
  })
})

describe('getAssignedLane lane spans (BL-15)', () => {
  const ls = makeLayoutSettings({
    TimelineTickDistance: 100, TimelineEventBoxHeight: 30, TimelineEventYMargin: 10,
  })
  const pack = (id: string, lanes: Map<string, LaneLock>, span = 1) =>
    getAssignedLane(id, 500, 80, true, false, 10, 10, 0, 1, 800, 1000, lanes, ls, [], undefined, span)

  // The bug: a portrait is two lanes tall, so an event in the lane below drew through its face.
  it('skips every lane a portrait covers, not just its first', () => {
    const lanes = new Map<string, LaneLock>()
    pack('portrait', lanes, 2)
    pack('event', lanes)

    expect(lanes.get('portrait')!.laneIndex).toBe(0)
    expect(lanes.get('event')!.laneIndex).toBe(2)
  })

  // The other direction: a portrait cannot start one lane under an event either.
  it('keeps a portrait clear of the lanes it would reach back over', () => {
    const lanes = new Map<string, LaneLock>()
    pack('event', lanes)
    pack('portrait', lanes, 2)

    expect(lanes.get('portrait')!.laneIndex).toBe(1)
    expect(pack('second-event', lanes)).toBeDefined()
    expect(lanes.get('second-event')!.laneIndex).toBe(3)
  })

  it('leaves single-lane items packing exactly as before', () => {
    const lanes = new Map<string, LaneLock>()
    pack('a', lanes)
    pack('b', lanes)
    expect(lanes.get('b')!.laneIndex).toBe(1)
  })
})

describe('getAssignedLane clears the age band', () => {
  const ls = makeLayoutSettings({
    TimelineEventBoxHeight: 30, TimelineEventYMargin: 10,
    TimelineAgeHeight: 30, TimelinePeriodYOffset: 0,
  })
  // Straight to the locked-lane path: a deep index is what a crowded column ends up at, and seeding
  // it is the whole of the setup.
  const at = (laneIndex: number, isAbove: boolean, isCenterOut: boolean, drawnHeight?: number) => {
    const lanes = new Map<string, LaneLock>()
    lanes.set('x', { laneIndex, isAbove, absoluteStart: 10, absoluteEnd: 10, isCenterOut, laneSpan: 1 })
    return getAssignedLane('x', 500, 80, isAbove, isCenterOut, 10, 10, 0, 1, 800, 1000, lanes, ls, [],
      undefined, 1, drawnHeight)
  }
  const PORTRAIT = 90   // three event boxes tall, which is what TimelineBoxTypesBoxWidth gives

  // The bug: events pack inward, so past lane 9 the box crossed the axis entirely and drew through
  // whatever age stripe was there.
  it('keeps a deep above-axis event above the stripe', () => {
    const y = at(20, true, false)
    expect(y).toBeLessThan(0)
    expect(y + ls.TimelineEventBoxHeight).toBeLessThanOrEqual(-ls.TimelineAgeHeight / 2)
  })

  it('keeps a deep below-axis event below the stripe', () => {
    expect(at(20, false, false)).toBeGreaterThanOrEqual(ls.TimelineAgeHeight / 2)
  })

  // The other way in: a period whose offset is 0 sat centred on the axis, under the stripe.
  it('keeps a period at offset 0 off the axis', () => {
    expect(at(0, false, true)).toBeGreaterThanOrEqual(ls.TimelineAgeHeight / 2)
  })

  it('leaves a lane that already cleared the band exactly where it was', () => {
    expect(at(0, true, false)).toBe(-390)
  })

  // A portrait is three event boxes tall and updateAbsolutePositions hangs it off targetY
  // differently on each side, so clamping it as though it were an event box put it back on the
  // stripe -- below the axis it was lifted clean over to the other side.
  it('keeps a deep above-axis portrait clear, allowing for its own height', () => {
    const y = at(20, true, false, PORTRAIT)
    expect(y + PORTRAIT).toBeLessThanOrEqual(-ls.TimelineAgeHeight / 2)
  })

  it('keeps a deep below-axis portrait clear of the lift that keeps it on screen', () => {
    const y = at(20, false, false, PORTRAIT)
    const drawnTop = y - (PORTRAIT - ls.TimelineEventBoxHeight)   // updateAbsolutePositions
    expect(drawnTop).toBeGreaterThanOrEqual(ls.TimelineAgeHeight / 2)
  })

  // Periods stack outward from the axis and are skipped by the event collision check, so before
  // this the bars and the deep end of the event column shared the same pixels.
  describe('and the period bars stacked on it', () => {
    const bars = makeLayoutSettings({
      TimelineEventBoxHeight: 30, TimelineEventYMargin: 10,
      TimelineAgeHeight: 30, TimelinePeriodYOffset: 30,
      TimelinePeriodYMargin: 20, TimelinePeriodHeight: 15,
    })
    // Two bars above the axis, one below — lanes 0 and 1, which is what two overlapping periods
    // on the same side lock.
    const withBars = () => {
      const lanes = new Map<string, LaneLock>()
      const bar = (id: string, laneIndex: number, isAbove: boolean) => lanes.set(id,
        { laneIndex, isAbove, absoluteStart: 0, absoluteEnd: 100, isCenterOut: true, laneSpan: 1 })
      bar('p0', 0, true); bar('p1', 1, true); bar('p2', 0, false)
      return lanes
    }
    const event = (isAbove: boolean) => {
      const lanes = withBars()
      lanes.set('e', { laneIndex: 20, isAbove, absoluteStart: 10, absoluteEnd: 10, isCenterOut: false, laneSpan: 1 })
      return getAssignedLane('e', 500, 80, isAbove, false, 10, 10, 0, 1, 800, 1000, lanes, bars, [])
    }
    // Outer edge of the deepest bar: offset + lane * margin + its own height.
    const outerAbove = 30 + 1 * 20 + 15
    const outerBelow = 30 + 15          // lane 0 below, so the margin term drops out

    it('keeps a deep above-axis event outside the deepest bar', () => {
      expect(event(true) + bars.TimelineEventBoxHeight).toBeLessThanOrEqual(-outerAbove)
    })

    it('keeps a deep below-axis event outside its own side only', () => {
      expect(event(false)).toBeGreaterThanOrEqual(outerBelow)
      expect(event(false)).toBeLessThan(outerAbove)   // not pushed out by the other side's stack
    })

    it('leaves the bars themselves where their offset puts them', () => {
      const lanes = withBars()
      expect(getAssignedLane('p1', 500, 80, true, true, 0, 100, 0, 1, 800, 1000, lanes, bars, []))
        .toBe(-(30 + 20))
    })
  })
})

// The test is symmetric in the two widths, so which of the pair is placed first -- which is the
// year, via the render sort -- no longer decides whether the overlap is seen at all.
describe('getAssignedLane measures both boxes, not one stem', () => {
  const ls = makeLayoutSettings({ TimelineTickDistance: 100 })
  // A 200px box locked at lane 0, and a 100px portrait 130px along: 130 < (100+200)/2 + 15.
  const lanes = new Map<string, LaneLock>()
  lanes.set('wide', {
    laneIndex: 0, isAbove: true, absoluteStart: 0, absoluteEnd: 0,
    isCenterOut: false, laneSpan: 1, width: 200,
  })
  const y = getAssignedLane('narrow', 630, 100, true, false, 1.3, 1.3, 0, 1, 800, 1000, lanes, ls, [])

  it('moves the narrow box out of the lane the wide one holds', () => {
    expect(lanes.get('narrow')!.laneIndex).toBe(1)
    expect(y).not.toBe(getAssignedLane('wide', 500, 200, true, false, 0, 0, 0, 1, 800, 1000, lanes, ls, []))
  })

  it('records its own width for whoever asks next', () => {
    expect(lanes.get('narrow')!.width).toBe(100)
  })
})

describe('getAssignedLane avoidLanes (BL-66)', () => {
  const ls = makeLayoutSettings({ TimelineTickDistance: 100 })
  // Same anchor, same side, same shape: without help these two land in the same lane.
  const pack = (
    id: string,
    lanes: Map<string, LaneLock>,
    avoid?: Map<string, LaneLock>,
  ) => getAssignedLane(id, 500, 130, true, false, 10, 10, 0, 1, 800, 1000, lanes, ls, [], avoid)

  it('puts a ghost in a lane no real item holds', () => {
    const real = new Map<string, LaneLock>()
    const ghosts = new Map<string, LaneLock>()
    const realY = pack('a', real)
    expect(pack('ref:a', ghosts, real)).not.toBe(realY)
    expect(ghosts.get('ref:a')!.laneIndex).toBe(real.get('a')!.laneIndex + 1)
  })

  it('leaves the real lane map untouched', () => {
    const real = new Map<string, LaneLock>()
    const ghosts = new Map<string, LaneLock>()
    pack('a', real)
    pack('ref:a', ghosts, real)
    expect([...real.keys()]).toEqual(['a'])
  })

  it('still collides inside one map when no avoid map is given', () => {
    const real = new Map<string, LaneLock>()
    const ghosts = new Map<string, LaneLock>()
    pack('a', real)
    expect(pack('ref:a', ghosts)).toBe(pack('a', real))
  })
})

describe('getAssignedLane spills to the other side when a column runs out of room', () => {
  // The real thing this was found on: eight events inside one year of a timeline, every one of them
  // saved with Placement 1, so they all asked for the side above the axis while the side below sat
  // empty. Their absolute positions are the rows as stored; six of them fall inside 141px of each
  // other at the MONTHS rung, which is inside the 145px a 130px box needs, so the packer hands out
  // lanes 0 to 5. Only four of those fit above the axis on a canvas this tall, and the fifth and
  // sixth used to be floored onto the band -- drawn on the same line as the fourth, three titles on
  // identical pixels with only the top one legible.
  const CLUSTER = [
    ['proclaims the Shun', 1644.08493150662],
    ['outer wall breached', 1644.30958904026],
    ['emperor hangs himself', 1644.31232876628],
    ['Shanhai Pass opened', 1644.3287671224],
    ['the Qing come through', 1644.39999999892],
    ['Li Zicheng abandons Beijing', 1644.41369862902],
    ['Dorgon rides into Beijing', 1644.42739725912],
    ['capital moves to Beijing', 1644.74794520346],
  ] as [string, number][]

  const MONTHS = 0.08333333333
  // The shipped defaults, which is what the timeline this came from uses.
  const ls = makeLayoutSettings({
    TimelineTickDistance: 100, TimelineEventBoxWidth: 130, TimelineEventBoxHeight: 30,
    TimelineEventYMargin: 5, TimelineAgeHeight: 30,
    TimelinePeriodYOffset: 30, TimelinePeriodYMargin: 20, TimelinePeriodHeight: 15,
  })
  const CANVAS = 392   // the Konva stage in a 900px window, measured

  /** Every box the cluster draws, as the rectangle it occupies. */
  const layOut = (canvasHeight: number) => {
    const lanes = new Map<string, LaneLock>()
    // One period bar above the axis, which is what sets keepClear on that side.
    lanes.set('period', {
      laneIndex: 0, isAbove: true, absoluteStart: 1645, absoluteEnd: 1695,
      isCenterOut: true, laneSpan: 1,
    })
    return CLUSTER.map(([title, absolute]) => {
      const x = getXFromTime(absolute, 1644.4, MONTHS, 1400, ls.TimelineTickDistance, [])
      // As TimelineCanvas calls it: every item asks for the side above, and the caller's own
      // +20 for that side is baked into the height it passes down.
      const y = getAssignedLane(title, x, ls.TimelineEventBoxWidth, true, false, absolute, absolute,
        1644.4, MONTHS, canvasHeight - ls.TimelineEdgeMarginWidth * 2 + 20, 1400, lanes, ls, [])
      return {
        title,
        left: x - ls.TimelineEventBoxWidth / 2, right: x + ls.TimelineEventBoxWidth / 2,
        top: y, bottom: y + ls.TimelineEventBoxHeight,
      }
    })
  }

  const overlaps = (boxes: ReturnType<typeof layOut>) => {
    const out: string[] = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (x > 0.5 && y > 0.5) out.push(`${a.title} over ${b.title} (${x.toFixed(0)}x${y.toFixed(0)}px)`)
    }
    return out
  }

  it('draws no two boxes of a dense cluster on top of each other', () => {
    const boxes = layOut(CANVAS)
    expect(overlaps(boxes), 'boxes drawn through each other').toEqual([])
  })

  it('uses the empty side rather than crushing the full one', () => {
    const boxes = layOut(CANVAS)
    // Above the axis the offset is negative, below it positive -- which is the only thing that
    // decides the drawn side (see updateAbsolutePositions).
    expect(boxes.filter(b => b.top < 0).length, 'nothing stayed on its own side').toBeGreaterThan(0)
    expect(boxes.filter(b => b.top > 0).length, 'nothing spilled over').toBeGreaterThan(0)
  })

  it('leaves placement alone while the asked-for side still has room', () => {
    // Three of the cluster are far enough apart to sit in lane 0, and a tall canvas has room for
    // every lane the rest need, so nothing should cross the axis.
    const boxes = layOut(1400)
    expect(boxes.every(b => b.top < 0), 'an item crossed the axis with room to spare').toBe(true)
    expect(overlaps(boxes)).toEqual([])
  })
})

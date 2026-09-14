import { describe, it, expect } from 'vitest'
import {
  FormatRegistry,
  absoluteToVisual,
  visualToAbsolute,
  BREAK_TICKS,
  getXFromTime,
  isLeftOfNow,
} from '@/utils/timelineLayout'
import type { HiddenRange, LayoutSettings } from '@/types/models'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeRange(startYear: number, endYear: number, id = 1): HiddenRange {
  return { Id: id, TimelineId: 1, StartYear: startYear, EndYear: endYear, Label: null }
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return {
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
    TimelineCanvasBackgroundColor: '#f1e7d5',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
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
  }
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

  describe('QUARTERS', () => {
    it('returns year when fraction is 0', () => {
      expect(FormatRegistry['QUARTERS']!(2020, 0)).toBe('2020')
    })
    it('returns Q label when fraction is non-zero', () => {
      // fraction 0.25 Ã¢â€ â€™ Math.round(0.25/0.25)+1 = 2 Ã¢â€ â€™ Q2
      const result = FormatRegistry['QUARTERS']!(2020, 0.25)
      expect(result).toMatch(/^Q\d$/)
    })
  })

  describe('SEASONS', () => {
    it('returns year string when fraction is 0', () => {
      expect(FormatRegistry['SEASONS']!(2020, 0)).toBe('2020')
    })
    it('returns season name for non-zero fraction', () => {
      const seasons = ['Spring', 'Summer', 'Fall', 'Winter']
      const result = FormatRegistry['SEASONS']!(2020, 0.5)
      expect(seasons).toContain(result)
    })
  })

  describe('MONTHS', () => {
    it('returns year string when fraction is 0', () => {
      expect(FormatRegistry['MONTHS']!(2020, 0)).toBe('2020')
    })
    it('returns a month abbreviation for non-zero fraction', () => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const result = FormatRegistry['MONTHS']!(2020, 0.5)
      expect(months).toContain(result)
    })
  })

  describe('WEEKS', () => {
    it('returns year string when fraction is 0', () => {
      expect(FormatRegistry['WEEKS']!(2020, 0)).toBe('2020')
    })
    it('returns a "WN" string for non-zero fraction', () => {
      const result = FormatRegistry['WEEKS']!(2020, 0.5)
      expect(result).toMatch(/^W\d+$/)
    })
  })

  describe('DAYS', () => {
    it('returns year string when fraction is 0', () => {
      expect(FormatRegistry['DAYS']!(2020, 0)).toBe('2020')
    })
    it('returns "Day N" string for non-zero fraction', () => {
      const result = FormatRegistry['DAYS']!(2020, 0.5)
      expect(result).toMatch(/^Day \d+$/)
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
    const ls = makeLayoutSettings({ TimelineTickDistance: 100 })
    const viewportWidth = 800
    const centerTime = 1000
    const result = getXFromTime(1000, centerTime, 1, viewportWidth, ls)
    expect(result).toBeCloseTo(400)
  })

  it('shifts right for a time after center', () => {
    const ls = makeLayoutSettings({ TimelineTickDistance: 100 })
    const result = getXFromTime(1001, 1000, 1, 800, ls)
    // (1 unit ahead / 1 step) * 100px = +100px from center(400)
    expect(result).toBeCloseTo(500)
  })

  it('shifts left for a time before center', () => {
    const ls = makeLayoutSettings({ TimelineTickDistance: 100 })
    const result = getXFromTime(999, 1000, 1, 800, ls)
    expect(result).toBeCloseTo(300)
  })
})

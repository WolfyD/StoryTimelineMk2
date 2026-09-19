import { describe, it, expect } from 'vitest'
import {
  FormatRegistry,
  absoluteToVisual,
  visualToAbsolute,
  BREAK_TICKS,
} from '@/utils/timelineLayout'
import type { HiddenRange } from '@/types/models'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRange(startYear: number, endYear: number, id = 1): HiddenRange {
  return { Id: id, TimelineId: 1, StartYear: startYear, EndYear: endYear, Label: null }
}

// ── FormatRegistry — SEASONS ─────────────────────────────────────────────────

describe('FormatRegistry[SEASONS]', () => {
  it('returns year string when fraction is 0', () => {
    expect(FormatRegistry['SEASONS']!(2020, 0)).toBe('2020')
  })

  it('returns "Spring" for f=0.01 (early in year)', () => {
    // Math.round(0.01 * 4) = 0 → seasons[0] = 'Spring'
    expect(FormatRegistry['SEASONS']!(2020, 0.01)).toBe('Spring')
  })

  it('returns "Summer" for f=0.26', () => {
    // Math.round(0.26 * 4) = Math.round(1.04) = 1 → seasons[1] = 'Summer'
    expect(FormatRegistry['SEASONS']!(2020, 0.26)).toBe('Summer')
  })

  it('returns "Fall" for f=0.51', () => {
    // Math.round(0.51 * 4) = Math.round(2.04) = 2 → seasons[2] = 'Fall'
    expect(FormatRegistry['SEASONS']!(2020, 0.51)).toBe('Fall')
  })

  it('returns "Winter" for f=0.76', () => {
    // Math.round(0.76 * 4) = Math.round(3.04) = 3 → seasons[3] = 'Winter'
    expect(FormatRegistry['SEASONS']!(2020, 0.76)).toBe('Winter')
  })

  it('returns "Winter" at the last day of the year (f=0.998)', () => {
    // Math.round(0.998 * 365) = 364 → last day → 'Winter'
    expect(FormatRegistry['SEASONS']!(2020, 0.998)).toBe('Winter')
  })

  it('labels a fraction that rounds past the year boundary as the next year', () => {
    // stepFraction is a rounded float; Math.round(0.9999 * 365) = 365 ≥ yearLength → '2021'
    expect(FormatRegistry['SEASONS']!(2020, 0.9999)).toBe('2021')
  })

  it('only returns values from the seasons array', () => {
    const valid = ['Spring', 'Summer', 'Fall', 'Winter']
    for (const f of [0.01, 0.13, 0.26, 0.38, 0.51, 0.63, 0.76, 0.88, 0.998]) {
      expect(valid).toContain(FormatRegistry['SEASONS']!(2020, f))
    }
  })
})

// ── FormatRegistry — MONTHS ──────────────────────────────────────────────────

describe('FormatRegistry[MONTHS]', () => {
  it('returns year string when fraction is 0', () => {
    expect(FormatRegistry['MONTHS']!(1999, 0)).toBe('1999')
  })

  it('returns "Jan" for f=0.083', () => {
    // Math.round(0.083 * 12) = Math.round(0.996) = 1 → months[1] = 'Feb'...
    // Actually: Math.round(0.083 * 12) = Math.round(0.996) = 1 → 'Feb'
    // Let's use a very small fraction to get Jan: Math.round(0.01 * 12) = 0 → 'Jan'
    const result = FormatRegistry['MONTHS']!(2020, 0.01)
    expect(result).toBe('Jan')
  })

  it('returns "Jan" for f=0.083 (day 30 — last day of January)', () => {
    // Month labels are day-of-year based: floor(0.083 * 365) = day 30, and
    // February starts at day 31 — so this is still January.
    expect(FormatRegistry['MONTHS']!(2020, 0.083)).toBe('Jan')
  })

  it('returns "Feb" for f=0.09 (day 32 — early February)', () => {
    // floor(0.09 * 365) = day 32 ≥ Feb.startDay (31)
    expect(FormatRegistry['MONTHS']!(2020, 0.09)).toBe('Feb')
  })

  it('returns a valid month name for mid-year fractions', () => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    for (const f of [0.083, 0.166, 0.25, 0.333, 0.416, 0.5, 0.583, 0.666, 0.75, 0.833, 0.916]) {
      expect(months).toContain(FormatRegistry['MONTHS']!(2020, f))
    }
  })

  it('labels a fraction that rounds past the year boundary as the next year', () => {
    // Math.round(0.9999 * 365) = 365 ≥ yearLength → '2021'
    expect(FormatRegistry['MONTHS']!(2020, 0.9999)).toBe('2021')
  })

  it('returns "Dec" for f very close to 1', () => {
    expect(FormatRegistry['MONTHS']!(2020, 0.99)).toBe('Dec')
  })
})

// ── FormatRegistry — QUARTERS ─────────────────────────────────────────────────

describe('FormatRegistry[QUARTERS]', () => {
  it('returns year string when fraction is 0', () => {
    expect(FormatRegistry['QUARTERS']!(2020, 0)).toBe('2020')
  })

  it('returns "Q1" for f close to 0 but non-zero', () => {
    // Math.round(0.01/0.25)+1 = Math.round(0.04)+1 = 0+1 = 1 → Q1
    expect(FormatRegistry['QUARTERS']!(2020, 0.01)).toBe('Q1')
  })

  it('returns "Q2" for f=0.26', () => {
    // Math.round(0.26/0.25)+1 = Math.round(1.04)+1 = 1+1 = 2 → Q2
    expect(FormatRegistry['QUARTERS']!(2020, 0.26)).toBe('Q2')
  })

  it('returns "Q3" for f=0.51', () => {
    // Math.round(0.51/0.25)+1 = Math.round(2.04)+1 = 2+1 = 3 → Q3
    expect(FormatRegistry['QUARTERS']!(2020, 0.51)).toBe('Q3')
  })

  it('returns "Q4" for f=0.76', () => {
    // Math.round(0.76/0.25)+1 = Math.round(3.04)+1 = 3+1 = 4 → Q4
    expect(FormatRegistry['QUARTERS']!(2020, 0.76)).toBe('Q4')
  })
})

// ── FormatRegistry — MILLENNIA ────────────────────────────────────────────────

describe('FormatRegistry[MILLENNIA]', () => {
  it('returns "1000s" for year=1000', () => {
    expect(FormatRegistry['MILLENNIA']!(1000, 0)).toBe('1000s')
  })

  it('returns "2000s" for year=2000', () => {
    expect(FormatRegistry['MILLENNIA']!(2000, 0)).toBe('2000s')
  })

  it('floors fractional years', () => {
    // Math.floor(1999.9) = 1999 → '1999s'
    expect(FormatRegistry['MILLENNIA']!(1999.9, 0.9)).toBe('1999s')
  })

  it('works for BC-era negative years', () => {
    // Math.floor(-1000) = -1000 → '-1000s'
    expect(FormatRegistry['MILLENNIA']!(-1000, 0)).toBe('-1000s')
  })
})

// ── FormatRegistry — WEEKS ────────────────────────────────────────────────────

describe('FormatRegistry[WEEKS]', () => {
  it('returns year string when fraction is 0', () => {
    expect(FormatRegistry['WEEKS']!(2020, 0)).toBe('2020')
  })

  it('returns "W27" for f=0.5 (approximately mid-year)', () => {
    // floor(floor(0.5 * 365) / 7) + 1 = floor(182 / 7) + 1 = 26 + 1 = 27
    expect(FormatRegistry['WEEKS']!(2020, 0.5)).toBe('W27')
  })

  it('returns "W1" for a very small fraction (start of year)', () => {
    expect(FormatRegistry['WEEKS']!(2020, 0.001)).toBe('W1')
  })

  it('returns "W52" near end of year', () => {
    // floor(floor(0.99 * 365) / 7) + 1 = floor(361 / 7) + 1 = 51 + 1 = 52
    expect(FormatRegistry['WEEKS']!(2020, 0.99)).toBe('W52')
  })

  it('matches expected format "WN"', () => {
    const result = FormatRegistry['WEEKS']!(2020, 0.25)
    expect(result).toMatch(/^W\d+$/)
  })
})

// ── FormatRegistry — DAYS ─────────────────────────────────────────────────────

describe('FormatRegistry[DAYS]', () => {
  it('returns year string when fraction is 0', () => {
    expect(FormatRegistry['DAYS']!(2020, 0)).toBe('2020')
  })

  it('returns "Day 184" for f=0.5 (approximately mid-year)', () => {
    // Math.round(0.5 * 365) + 1 = 183 + 1 = 184
    expect(FormatRegistry['DAYS']!(2020, 0.5)).toBe('Day 184')
  })

  it('returns "Day 1" for a very small fraction (start of year)', () => {
    // Math.floor(0.001 * 365) + 1 = 0 + 1 = 1
    expect(FormatRegistry['DAYS']!(2020, 0.001)).toBe('Day 1')
  })

  it('returns "Day 365" near end of year', () => {
    // Math.round(0.998 * 365) + 1 = 364 + 1 = 365
    expect(FormatRegistry['DAYS']!(2020, 0.998)).toBe('Day 365')
  })

  it('labels a fraction that rounds past the year boundary as the next year', () => {
    // Math.round(0.999 * 365) = 365 ≥ yearLength → '2021'
    expect(FormatRegistry['DAYS']!(2020, 0.999)).toBe('2021')
  })

  it('matches expected format "Day N"', () => {
    const result = FormatRegistry['DAYS']!(2020, 0.75)
    expect(result).toMatch(/^Day \d+$/)
  })
})

// ── absoluteToVisual with hidden ranges ───────────────────────────────────────

describe('absoluteToVisual — hidden range behaviour', () => {
  const step = 1
  const breakSize = BREAK_TICKS * step // 0.3

  it('leaves a point before the range unchanged', () => {
    const ranges = [makeRange(1000, 2000)]
    // t=500 is before the range — no compression applied
    expect(absoluteToVisual(500, ranges, step)).toBe(500)
  })

  it('compresses a point after the range by (hiddenSize - breakSize)', () => {
    const ranges = [makeRange(1000, 2000)]
    // hiddenSize=1000, net compression = 1000-0.3 = 999.7
    const result = absoluteToVisual(3000, ranges, step)
    expect(result).toBeCloseTo(3000 - (1000 - breakSize))
  })

  it('interpolates a point exactly at range start into the break strip start', () => {
    const ranges = [makeRange(1000, 2000)]
    // t=1000 → f=(1000-1000)/1000=0 → result=1000+0*breakSize=1000
    const result = absoluteToVisual(1000, ranges, step)
    expect(result).toBeCloseTo(1000)
  })

  it('interpolates a midpoint inside the range into the break strip', () => {
    const ranges = [makeRange(1000, 2000)]
    // t=1500, f=0.5, result=1000 + 0.5*0.3=1000.15
    const result = absoluteToVisual(1500, ranges, step)
    expect(result).toBeCloseTo(1000 + 0.5 * breakSize)
  })

  it('places a point at 90% through the range at 90% of the break strip', () => {
    const ranges = [makeRange(1000, 2000)]
    // t=1900, f=0.9, result=1000 + 0.9*0.3=1000.27
    const result = absoluteToVisual(1900, ranges, step)
    expect(result).toBeCloseTo(1000 + 0.9 * breakSize)
  })

  it('applies multiple range compressions cumulatively', () => {
    const ranges = [makeRange(100, 200, 1), makeRange(300, 400, 2)]
    // t=500, each range has hiddenSize=100, breakSize=0.3
    // total offset = -2*(100-0.3) = -199.4
    const result = absoluteToVisual(500, ranges, step)
    expect(result).toBeCloseTo(500 - 2 * (100 - breakSize))
  })

  it('returns t unchanged when ranges is empty', () => {
    expect(absoluteToVisual(999, [], step)).toBe(999)
  })
})

// ── visualToAbsolute — inverse of absoluteToVisual ────────────────────────────

describe('visualToAbsolute — inverse of absoluteToVisual', () => {
  const step = 1

  it('returns v unchanged when ranges is empty', () => {
    expect(visualToAbsolute(500, [], step)).toBe(500)
  })

  it('round-trip: visual(absolute(t)) ≈ t for a point before the range', () => {
    const ranges = [makeRange(1000, 2000)]
    const t = 500
    const visual = absoluteToVisual(t, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(t, 5)
  })

  it('round-trip: visual(absolute(t)) ≈ t for a point after the range', () => {
    const ranges = [makeRange(1000, 2000)]
    const t = 3000
    const visual = absoluteToVisual(t, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(t, 5)
  })

  it('round-trip: visual(absolute(t)) ≈ t for a point inside the range', () => {
    const ranges = [makeRange(1000, 2000)]
    const t = 1500
    const visual = absoluteToVisual(t, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(t, 5)
  })

  it('round-trip works correctly with two hidden ranges', () => {
    const ranges = [makeRange(100, 200, 1), makeRange(300, 400, 2)]
    for (const t of [50, 500, 150, 350]) {
      const visual = absoluteToVisual(t, ranges, step)
      const recovered = visualToAbsolute(visual, ranges, step)
      expect(recovered).toBeCloseTo(t, 5)
    }
  })

  it('is consistent with absoluteToVisual at range boundary', () => {
    const ranges = [makeRange(1000, 2000)]
    const t = 2000
    const visual = absoluteToVisual(t, ranges, step)
    const recovered = visualToAbsolute(visual, ranges, step)
    expect(recovered).toBeCloseTo(t, 5)
  })
})

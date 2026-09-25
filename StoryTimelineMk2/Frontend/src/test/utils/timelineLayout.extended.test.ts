import { describe, it, expect } from 'vitest'
import {
  FormatRegistry,
  DEFAULT_CALENDAR_CONFIG,
  absoluteToVisual,
  visualToAbsolute,
  BREAK_TICKS,
} from '@/utils/timelineLayout'
import type { HiddenRange } from '@/types/models'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRange(startYear: number, endYear: number, id = 1): HiddenRange {
  return { Id: id, TimelineId: 1, StartYear: startYear, EndYear: endYear, Label: null }
}

// ── FormatRegistry — integer days (BL-44) ─────────────────────────────────────
// A formatter is handed the integer day-of-year its tick falls on. The main suite covers each
// rung's ordinary labels; what is worth keeping here is the awkward input — every single day of
// the year swept through every rung, and the BC era.

describe('FormatRegistry over a whole year', () => {
  const { yearLength, months, seasons } = DEFAULT_CALENDAR_CONFIG

  it('only ever names a season the calendar defines', () => {
    const names = seasons.map(s => s.name)
    for (let d = 0; d < yearLength; d++) {
      expect(names).toContain(FormatRegistry['SEASONS']!(2020, d))
    }
  })

  it('only ever names a month the calendar defines, and reaches every one of them', () => {
    const seen = new Set<string>()
    const valid = months.map(m => m.shortName)
    for (let d = 0; d < yearLength; d++) {
      const label = FormatRegistry['MONTHS']!(2020, d)
      expect(valid).toContain(label)
      seen.add(label)
    }
    // The February bug in one assertion: twelve ticks a year, twelve distinct names.
    expect(seen.size).toBe(months.length)
  })

  it('numbers quarters one to four and nothing else', () => {
    const seen = new Set<string>()
    for (let d = 0; d < yearLength; d++) seen.add(FormatRegistry['QUARTERS']!(2020, d))
    expect([...seen].sort()).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('numbers weeks from one, one number per seven days', () => {
    for (let d = 0; d < yearLength; d++) {
      expect(FormatRegistry['WEEKS']!(2020, d)).toBe(`W${Math.floor(d / 7) + 1}`)
    }
  })

  it('gives every day a date inside its own month', () => {
    for (let d = 0; d < yearLength; d++) {
      const m = [...months].reverse().find(mo => mo.startDay <= d)!
      expect(FormatRegistry['DAYS']!(2020, d)).toBe(`${d - m.startDay + 1} ${m.shortName}`)
    }
  })
})

describe('FormatRegistry — years that are not plain positive integers', () => {
  it('labels the BC era like any other', () => {
    expect(FormatRegistry['MILLENNIA']!(-1000, 0)).toBe('-1000s')
    expect(FormatRegistry['CENTURIES']!(-300, 0)).toBe('-300')
    expect(FormatRegistry['DECADES']!(-44, 0)).toBe('-44')
    expect(FormatRegistry['YEARS']!(-44, 0)).toBe('-44')
    expect(FormatRegistry['MONTHS']!(-44, 73)).toBe('Mar')
    expect(FormatRegistry['DAYS']!(-44, 73)).toBe('15 Mar')
  })

  it('floors a fractional year rather than rounding it', () => {
    expect(FormatRegistry['MILLENNIA']!(1999.9, 0)).toBe('1999s')
    expect(FormatRegistry['YEARS']!(2024.9, 0)).toBe('2024')
  })

  it('rolls a day at the year end into the next year, negative years included', () => {
    expect(FormatRegistry['MONTHS']!(-44, 365)).toBe('-43')
    expect(FormatRegistry['DAYS']!(2020, 365)).toBe('2021')
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

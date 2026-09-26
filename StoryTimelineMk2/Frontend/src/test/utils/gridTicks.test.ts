/**
 * BL-44: the grid used to place ticks at uniform multiples of `stepFraction` while the labels looked
 * up the calendar's real boundary days. At months that put ticks on days 0, 30.4, 60.8, 91.25… and
 * February runs day 31 to day 58 — so no tick ever landed inside it and the ruler read
 * "Jan Jan Mar Apr", one name short, every name after January wrong.
 *
 * `gridTicks` replaces that. Sub-year rungs walk the calendar's own boundary days, so a label is a
 * lookup and not a rounded fraction. Whole-year rungs keep the visual-time walk that was already
 * proven against hidden ranges, and produce exactly the ticks they always did.
 */
import { describe, it, expect } from 'vitest'
import {
  boundaryDays,
  buildFormatRegistry,
  dayOfYearAt,
  gridTicks,
  snapToTick,
  DEFAULT_CALENDAR_CONFIG,
  type CalendarFormatConfig,
  type GridTickOptions,
} from '@/utils/timelineLayout'
import type { HiddenRange } from '@/types/models'

function makeRange(StartYear: number, EndYear: number, Id = 1): HiddenRange {
  return { Id, TimelineId: 1, StartYear, EndYear, Label: null }
}

/** The seeded Gregorian calendar: Spring opens on day 60 and Winter runs over the new year. */
const SEEDED: CalendarFormatConfig = {
  ...DEFAULT_CALENDAR_CONFIG,
  seasons: [
    { name: 'Spring', start: 60, end: 151 },
    { name: 'Summer', start: 152, end: 243 },
    { name: 'Fall', start: 244, end: 334 },
    { name: 'Winter', start: 335, end: 59 },
  ],
}

/** Three seasons of a hundred days in a three-hundred-day year. Nothing in it is a quarter. */
const ALIEN: CalendarFormatConfig = {
  yearLength: 300,
  weekLength: 10,
  yearStartDow: 0,
  months: [
    { name: 'Rise', shortName: 'Ris', startDay: 0 },
    { name: 'High', shortName: 'Hig', startDay: 137 },
  ],
  seasons: [
    { name: 'Thaw', start: 0, end: 99 },
    { name: 'Blaze', start: 100, end: 199 },
    { name: 'Dim', start: 200, end: 299 },
  ],
  memorableDays: [],
}

/** A thousand pixels of canvas at a hundred pixels a year, centred on 2000. */
function ticks(over: Partial<GridTickOptions> = {}) {
  return gridTicks({
    centerTime: 2000,
    width: 1000,
    step: 1,
    tickDistance: 100,
    ranges: [],
    stepFraction: 1,
    cfg: DEFAULT_CALENDAR_CONFIG,
    ...over,
  })
}

const at = (t: { absolute: number }[]) => t.map(x => x.absolute)

// ── boundaryDays ──────────────────────────────────────────────────────────────

describe('boundaryDays', () => {
  it('gives months the calendar\'s own first days, February included', () => {
    const days = boundaryDays('MONTHS', DEFAULT_CALENDAR_CONFIG)
    expect(days).toEqual(DEFAULT_CALENDAR_CONFIG.months.map(m => m.startDay))
    expect(days).toContain(31)
  })

  it('gives seasons their stored order, so a wrapping one keeps its place', () => {
    expect(boundaryDays('SEASONS', SEEDED)).toEqual([60, 152, 244, 335])
    expect(boundaryDays('SEASONS', ALIEN)).toEqual([0, 100, 200])
  })

  it('divides the year itself into quarters, whatever its length', () => {
    expect(boundaryDays('QUARTERS', DEFAULT_CALENDAR_CONFIG)).toEqual([0, 91, 182, 273])
    expect(boundaryDays('QUARTERS', ALIEN)).toEqual([0, 75, 150, 225])
  })

  it('counts weeks and days off the start of the year', () => {
    const weeks = boundaryDays('WEEKS', DEFAULT_CALENDAR_CONFIG)!
    expect(weeks.length).toBe(53)
    expect(weeks[0]).toBe(0)
    expect(weeks[52]).toBe(364)
    expect(boundaryDays('WEEKS', ALIEN)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
      120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290])

    const days = boundaryDays('DAYS', DEFAULT_CALENDAR_CONFIG)!
    expect(days.length).toBe(365)
    expect(days[0]).toBe(0)
    expect(days[364]).toBe(364)
  })

  it('has nothing to say about whole-year rungs or a key it does not know', () => {
    for (const key of ['YEARS', 'DECADES', 'CENTURIES', 'MILLENNIA', 'WOBBLE', '', undefined]) {
      expect(boundaryDays(key, DEFAULT_CALENDAR_CONFIG)).toBeNull()
    }
  })

  it('reads a lower-case key, which is what older profiles store', () => {
    expect(boundaryDays('months', DEFAULT_CALENDAR_CONFIG))
      .toEqual(boundaryDays('MONTHS', DEFAULT_CALENDAR_CONFIG))
  })

  it('a calendar that defines no months or seasons is no calendar for this purpose', () => {
    const bare = { ...DEFAULT_CALENDAR_CONFIG, months: [], seasons: [] }
    expect(boundaryDays('MONTHS', bare)).toBeNull()
    expect(boundaryDays('SEASONS', bare)).toBeNull()
  })

  it('survives a week length of zero rather than looping forever', () => {
    const broken = { ...DEFAULT_CALENDAR_CONFIG, weekLength: 0 }
    expect(boundaryDays('WEEKS', broken)!.length).toBe(365)
  })
})

// ── dayOfYearAt ───────────────────────────────────────────────────────────────

describe('dayOfYearAt', () => {
  const cfg = DEFAULT_CALENDAR_CONFIG

  it('splits an absolute into the year and the integer day inside it', () => {
    expect(dayOfYearAt(2000, cfg)).toEqual({ year: 2000, day: 0 })
    expect(dayOfYearAt(2000 + 31 / 365, cfg)).toEqual({ year: 2000, day: 31 })
    expect(dayOfYearAt(2000 + 364 / 365, cfg)).toEqual({ year: 2000, day: 364 })
  })

  it('pulls a date that lands a hair under its boundary back onto it', () => {
    // A stored stepFraction is a rounded float, so this is the common case, not a corner.
    expect(dayOfYearAt(2000 + 31 / 365 - 1e-12, cfg).day).toBe(31)
  })

  it('clamps into the year rather than naming a day the year does not have', () => {
    expect(dayOfYearAt(2000.9999999, cfg).day).toBe(364)
    expect(dayOfYearAt(2000, { ...cfg, yearLength: 300 }).day).toBe(0)
  })

  it('works below year zero', () => {
    expect(dayOfYearAt(-44 + 73 / 365, cfg)).toEqual({ year: -44, day: 73 })
    expect(dayOfYearAt(-44, cfg)).toEqual({ year: -44, day: 0 })
  })

  // The extremes, because that is where a float stops being able to hold a day. A year that big
  // rounds to roughly a ten-thousandth of a day, so the slack that pulls a boundary back has to
  // grow with it; the fixed one this used to carry read the first of February as the last of January.
  it('holds every day of the year at the far ends of the axis', () => {
    for (const year of [-9999, 9999999]) {
      for (const day of [0, 1, 31, 59, 182, 243, 364]) {
        expect(dayOfYearAt(year + day / 365, cfg)).toEqual({ year, day })
      }
    }
  })

  it('names the month a far-future boundary starts, not the one before it', () => {
    const label = buildFormatRegistry(cfg)['MONTHS']!
    for (const m of cfg.months) {
      expect(label(9999999, dayOfYearAt(9999999 + m.startDay / 365, cfg).day)).toBe(m.shortName)
    }
  })
})

// ── gridTicks: whole-year rungs ───────────────────────────────────────────────

describe('gridTicks on a whole-year rung', () => {
  it('steps years across the visible window and nothing more', () => {
    const t = ticks()
    expect(at(t)).toEqual([1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005])
    expect(t.every(x => x.isYearTick && !x.subYear && x.day === 0)).toBe(true)
  })

  it('steps decades and millennia by their own stepFraction', () => {
    expect(at(ticks({ step: 10, stepFraction: 10, tickDistance: 130, width: 1300 })))
      .toEqual([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2030, 2040, 2050])
    expect(at(ticks({ step: 1000, stepFraction: 1000, tickDistance: 300, width: 3000 })))
      .toEqual([-3000, -2000, -1000, 0, 1000, 2000, 3000, 4000, 5000, 6000, 7000])
  })

  it('overdraws by extraPx so a pan does not reveal an empty edge', () => {
    expect(at(ticks({ extraPx: 200 }))).toEqual([1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000,
      2001, 2002, 2003, 2004, 2005, 2006, 2007])
  })

  it('falls back to stepFraction for a level no calendar can place', () => {
    const t = ticks({ formatKey: 'WOBBLE', step: 0.5, stepFraction: 0.5 })
    expect(at(t)).toEqual([1997.5, 1998, 1998.5, 1999, 1999.5, 2000, 2000.5, 2001, 2001.5, 2002,
      2002.5])
    expect(t.every(x => !x.subYear)).toBe(true)
    // The day comes along anyway — a custom level's label is free to use it.
    expect(t.find(x => x.absolute === 2000.5)!.day).toBe(182)
    expect(t.filter(x => x.isYearTick).map(x => x.absolute)).toEqual([1998, 1999, 2000, 2001, 2002])
  })
})

// ── gridTicks: sub-year rungs ─────────────────────────────────────────────────

describe('gridTicks on a sub-year rung', () => {
  /** One year of months, wide enough that every one of them is on screen. */
  const months = () => ticks({
    centerTime: 2000.5, width: 1200, step: 1 / 12, stepFraction: 1 / 12, formatKey: 'MONTHS',
  })

  it('lands on every month the calendar names — February is the one it used to miss', () => {
    const inYear = months().filter(t => t.year === 2000)
    expect(inYear.map(t => t.day)).toEqual(DEFAULT_CALENDAR_CONFIG.months.map(m => m.startDay))

    const label = buildFormatRegistry(DEFAULT_CALENDAR_CONFIG)['MONTHS']!
    expect(inYear.map(t => label(t.year, t.day)))
      .toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  })

  it('marks the tick where the year turns, and only that one', () => {
    const t = months()
    expect(t.filter(x => x.isYearTick).map(x => x.year)).toEqual([2000, 2001])
    expect(t.every(x => x.subYear)).toBe(true)
    expect(t.every(x => Math.abs(x.absolute - (x.year + x.day / 365)) < 1e-12)).toBe(true)
  })

  it('reaches every season of a calendar whose year does not begin in one', () => {
    const t = ticks({
      centerTime: 2000, width: 800, step: 0.25, stepFraction: 0.25,
      formatKey: 'SEASONS', cfg: SEEDED,
    })
    const label = buildFormatRegistry(SEEDED)['SEASONS']!
    const inYear = t.filter(x => x.year === 2000)
    // Day 0 is the grid's own line, not a season's: without it a calendar whose Spring starts on
    // day 60 would never show a year number anywhere on the ruler.
    expect(inYear.map(x => x.day)).toEqual([0, 60, 152, 244, 335])
    expect(inYear.slice(1).map(x => label(x.year, x.day)))
      .toEqual(['Spring', 'Summer', 'Fall', 'Winter'])
    expect(label(2000, 0)).toBe('Winter')
  })

  it('shows all three seasons of a three-season year', () => {
    const t = ticks({
      centerTime: 2000, width: 600, step: 1 / 3, stepFraction: 1 / 3,
      formatKey: 'SEASONS', cfg: ALIEN,
    })
    const label = buildFormatRegistry(ALIEN)['SEASONS']!
    const inYear = t.filter(x => x.year === 2000)
    expect(inYear.map(x => x.day)).toEqual([0, 100, 200])
    expect(inYear.map(x => label(x.year, x.day))).toEqual(['Thaw', 'Blaze', 'Dim'])
  })

  it('walks days one at a time across a year boundary', () => {
    const t = ticks({
      width: 1000, step: 1 / 365, stepFraction: 1 / 365, tickDistance: 50, formatKey: 'DAYS',
    })
    expect(t.length).toBe(21)
    expect(t.filter(x => x.year === 1999).map(x => x.day))
      .toEqual([355, 356, 357, 358, 359, 360, 361, 362, 363, 364])
    expect(t.filter(x => x.year === 2000).map(x => x.day))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const label = buildFormatRegistry(DEFAULT_CALENDAR_CONFIG)['DAYS']!
    expect(label(1999, 355)).toBe('22 Dec')
    expect(label(2000, 0)).toBe('1 Jan')
  })
})

// ── gridTicks: hidden ranges ──────────────────────────────────────────────────

describe('gridTicks across a hidden range', () => {
  it('draws no tick inside the range, on either path', () => {
    const ranges = [makeRange(2010, 2020)]
    const years = ticks({ centerTime: 2010, ranges })
    expect(at(years)).toEqual([2005, 2006, 2007, 2008, 2009, 2010, 2021, 2022, 2023, 2024, 2025])

    const inside = (x: { absolute: number }) => x.absolute > 2010 && x.absolute < 2020
    expect(years.some(inside)).toBe(false)

    const months = ticks({
      centerTime: 1999.5, width: 2400, step: 1 / 12, stepFraction: 1 / 12,
      formatKey: 'MONTHS', ranges: [makeRange(2000, 2001)],
    })
    expect(months.some(x => x.absolute > 2000 && x.absolute < 2001)).toBe(false)
    expect(months.some(x => x.year === 2000)).toBe(false)
    expect(months.some(x => x.year === 1999)).toBe(true)
    expect(months.some(x => x.year === 2001)).toBe(true)
  })

  it('keeps the ticks after a range on multiples of the step', () => {
    // The range's length is not a multiple of anything, which is what used to walk the tick marks
    // off the Now line once the compressed offset was added.
    const t = ticks({
      step: 10, stepFraction: 10, ranges: [makeRange(2000, 2345)],
    })
    expect(t.every(x => Math.abs(x.absolute % 10) < 1e-6)).toBe(true)
    expect(at(t)).toContain(2000)
    expect(new Set(at(t)).size).toBe(t.length)
  })

  it('costs the same to hide ten thousand years as to hide one', () => {
    const opts = {
      centerTime: 1999.5, width: 2400, step: 1 / 12, stepFraction: 1 / 12,
      formatKey: 'MONTHS',
    }
    const one = ticks({ ...opts, ranges: [makeRange(2000, 2001)] })
    const many = ticks({ ...opts, ranges: [makeRange(2000, 12000)] })
    expect(many.length).toBe(one.length)
    expect(many.length).toBeLessThan(40)
    expect(many.some(x => x.year === 12000)).toBe(true)
  })
})
// ── snapToTick ───────────────────────────────────────────────────────────

/**
 * BL-85: the hover line and anything placed by right-clicking used to round to the rung's
 * `stepFraction`, an even lattice. Since BL-44 the ticks are the calendar's boundary days, which are
 * not evenly spaced, so the two disagreed by more the further into the year you were.
 */
describe('snapToTick', () => {
  const SEASON_STEP = 0.25   // what the default profile calls a season, and what the old snap used

  it("lands on the calendar's own season starts, not on quarters of a year", () => {
    // Spring opens on day 60 of the seeded calendar. Three days into it, the old snap rounded to
    // 0.25 of a year -- day 91 -- which is a position the grid draws nothing at.
    expect(snapToTick(2000 + 63 / 365, 'SEASONS', SEEDED, SEASON_STEP)).toBeCloseTo(2000 + 60 / 365, 10)
  })

  it('snaps forward over the year boundary rather than back across most of a season', () => {
    // Day 360 is twenty-five days into Winter and five short of the new year.
    expect(snapToTick(2000 + 360 / 365, 'SEASONS', SEEDED, SEASON_STEP)).toBe(2001)
  })

  it('only ever returns a day the grid draws a tick on', () => {
    const days = boundaryDays('WEEKS', DEFAULT_CALENDAR_CONFIG)!
    for (let d = 0; d < 365; d++) {
      const snapped = snapToTick(2000 + (d + 0.37) / 365, 'WEEKS', DEFAULT_CALENDAR_CONFIG, 1 / 52)
      const day = Math.round((snapped - Math.floor(snapped)) * 365)
      expect(day === 0 || days.includes(day), `day ${d} snapped to day ${day}`).toBe(true)
    }
  })

  it("reads the timeline's own calendar and not the Gregorian one", () => {
    // Three hundred days and three seasons: the boundaries are thirds and a quarter is nowhere.
    for (const [from, want] of [[10, 0], [140, 100], [240, 200], [295, 300]]) {
      expect(snapToTick(50 + from! / 300, 'SEASONS', ALIEN, SEASON_STEP)).toBeCloseTo(50 + want! / 300, 10)
    }
  })

  it('keeps the even lattice for a rung the calendar cannot place', () => {
    expect(snapToTick(1997, 'DECADES', DEFAULT_CALENDAR_CONFIG, 10)).toBe(2000)
    expect(snapToTick(1994, 'WOBBLE', DEFAULT_CALENDAR_CONFIG, 0.5)).toBe(1994)
    expect(snapToTick(1994.3, 'WOBBLE', DEFAULT_CALENDAR_CONFIG, 0.5)).toBe(1994.5)
  })

  it('works below year zero', () => {
    expect(snapToTick(-44 + 58 / 365, 'SEASONS', SEEDED, SEASON_STEP)).toBeCloseTo(-44 + 60 / 365, 10)
    expect(snapToTick(-44 + 2 / 365, 'SEASONS', SEEDED, SEASON_STEP)).toBe(-44)
  })
})

// ── gridTicks: which names fit ────────────────────────────────────────────

describe('gridTicks label spacing', () => {
  /** A year of the seeded calendar's seasons, wide enough to hold two of them. */
  const seasons = (over: Partial<GridTickOptions> = {}) => ticks({
    centerTime: 2000.5, width: 800, step: 0.25, stepFraction: 0.25,
    formatKey: 'SEASONS', cfg: SEEDED, ...over,
  })

  it('names every tick when no gap is asked for', () => {
    expect(seasons().every(t => t.showLabel)).toBe(true)
  })

  it('drops a name that would land on its neighbour and keeps the tick', () => {
    // A season is ninety-odd days, which at this zoom is about a hundred pixels. Ask for a hundred
    // and ten and every other one has to give way.
    const t = seasons({ labelGapPx: 110 }).filter(x => x.year === 2000)
    expect(t.map(x => x.day)).toEqual([0, 60, 152, 244, 335])
    expect(t.filter(x => x.showLabel).map(x => x.day)).toEqual([0, 60, 244])
  })

  it('never drops the year, which is the label a unit name is most likely to crowd', () => {
    // Winter opens on day 335 and the year turns thirty days later -- a third of a season, and the
    // collision that put a bare year number in among the season names on screen.
    const t = seasons({ labelGapPx: 400, centerTime: 2001, width: 1200 })
    expect(t.filter(x => x.isYearTick).every(x => x.showLabel)).toBe(true)
  })

  it('gives a tick the same answer wherever the viewport happens to be', () => {
    // The property the whole thing rests on: decide from what is on screen and the names blink in
    // and out as you pan, because the tick the walk starts from keeps changing.
    const seen = new Map<number, boolean>()
    for (let c = 1999; c <= 2002; c += 0.05) {
      for (const t of seasons({ centerTime: c, labelGapPx: 110 })) {
        const key = Math.round(t.absolute * 365)
        const before = seen.get(key)
        if (before !== undefined) expect(t.showLabel, `tick at ${key} changed its mind`).toBe(before)
        seen.set(key, t.showLabel)
      }
    }
    expect(seen.size).toBeGreaterThan(10)
  })

  it('gives way to the year number when the year has no row of its own', () => {
    // Angled, every label leans the same way, so there is no second row to move the year to. The
    // unit name beside it loses its name instead -- Winter opens on day 335 and the year turns
    // thirty days later, which at this zoom is under thirty pixels.
    const t = seasons({ labelGapPx: 10, yearGapPx: 40, centerTime: 2000.9, width: 600 })
    const winter = t.find(x => x.year === 2000 && x.day === 335)
    expect(winter, 'the Winter tick was not drawn at all').toBeDefined()
    expect(winter!.showLabel, 'Winter kept its name next to the year number').toBe(false)
    expect(t.filter(x => x.isYearTick).every(x => x.showLabel), 'a year number was dropped').toBe(true)
    // Spring, in the middle of its year, is nowhere near a year boundary and keeps its name.
    expect(t.find(x => x.year === 2001 && x.day === 152)?.showLabel).toBe(true)
  })

  it('leaves the units alone when the year is on its own row', () => {
    // Plain: the same crowding, but `yearGapPx` omitted, so the year crowds nothing and Winter
    // keeps its name. Dropping it here would lose a name for no reason.
    const t = seasons({ labelGapPx: 10, centerTime: 2000.9, width: 600 })
    expect(t.find(x => x.year === 2000 && x.day === 335)?.showLabel).toBe(true)
  })

  it('thins a rung whose ticks sit closer together than its names are wide', () => {
    const t = ticks({
      centerTime: 2000.5, width: 1000, step: 1 / 365, stepFraction: 1 / 365,
      formatKey: 'DAYS', tickDistance: 4, labelGapPx: 40,
    })
    expect(t.length).toBeGreaterThan(200)                  // every day still gets its mark
    expect(t.filter(x => x.showLabel).length).toBeLessThan(t.length / 8)   // one name in ten or so
  })

  it('names every tick on a whole-year rung, which has never collided', () => {
    expect(ticks({ labelGapPx: 500 }).every(t => t.showLabel)).toBe(true)
  })
})

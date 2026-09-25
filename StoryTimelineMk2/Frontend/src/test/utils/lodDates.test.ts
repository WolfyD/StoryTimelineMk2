import { describe, it, expect } from 'vitest'
import { holdDate, placeDate, stepOf, toAbsolute, toSubtick } from '@/utils/lodDates'
import {
	buildFormatRegistry, dayOfYearAt, DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig,
} from '@/utils/timelineLayout'
import type { LodLevel } from '@/types/models'

const LOD: LodLevel[] = [
	{ index: 3, formatKey: 'years', stepFraction: 1 },
	{ index: 4, formatKey: 'seasons', stepFraction: 0.25 },
	{ index: 5, formatKey: 'months', stepFraction: 1 / 12 },
]

/** What the app actually stores: uppercase keys, and days as well as the coarse rungs. */
const REAL: LodLevel[] = [
	{ index: 3, formatKey: 'YEARS', stepFraction: 1 },
	{ index: 4, formatKey: 'SEASONS', stepFraction: 0.25 },
	{ index: 5, formatKey: 'MONTHS', stepFraction: 1 / 12 },
	{ index: 6, formatKey: 'WEEKS', stepFraction: 7 / 365 },
	{ index: 7, formatKey: 'DAYS', stepFraction: 1 / 365 },
]

/**
 * The seeded Gregorian calendar, whose seasons start in the sixtieth day of the year and whose last
 * one runs over the new year — the shape that broke the old conversion worst.
 */
const SEEDED: CalendarFormatConfig = {
	...DEFAULT_CALENDAR_CONFIG,
	seasons: [
		{ name: 'Spring', start: 60, end: 151 },
		{ name: 'Summer', start: 152, end: 243 },
		{ name: 'Fall', start: 244, end: 334 },
		{ name: 'Winter', start: 335, end: 59 },
	],
}

describe('stepOf', () => {
	it('reads the profile, and calls anything it does not know a whole year', () => {
		expect(stepOf(LOD, 5)).toBeCloseTo(1 / 12)
		expect(stepOf(LOD, 99)).toBe(1)
		// A zero step would divide by zero on the way back; a year is the safe reading.
		expect(stepOf([{ index: 1, formatKey: 'broken', stepFraction: 0 }], 1)).toBe(1)
	})
})

describe('toAbsolute / toSubtick', () => {
	it('round-trips every step of every level', () => {
		for (const lod of LOD) {
			const steps = Math.round(1 / lod.stepFraction)
			for (let s = 0; s < steps; s++) {
				const abs = toAbsolute(1000, s, lod.index, LOD)!
				expect(toSubtick(abs, 1000, lod.index, LOD)).toBe(s)
			}
		}
	})

	it('keeps no date as no date, rather than year 0', () => {
		expect(toAbsolute(null, 3, 5, LOD)).toBeNull()
		expect(toSubtick(null, 1000, 5, LOD)).toBe(0)
		expect(toSubtick(1000.25, null, 5, LOD)).toBe(0)
	})

	it('cannot hand a date input a step outside the year', () => {
		expect(toSubtick(1099, 1000, 5, LOD)).toBe(11)
		expect(toSubtick(999, 1000, 5, LOD)).toBe(0)
	})

	it('negative years work like any other', () => {
		expect(toAbsolute(-500, 2, 4, LOD)).toBeCloseTo(-499.5)
		expect(toSubtick(-499.5, -500, 4, LOD)).toBe(2)
	})

	it('takes the step a position is inside, not the nearest one', () => {
		// Three weeks and four days into the year is still the fourth week, not nearly the fifth.
		expect(toSubtick(1000 + 25 / 365, 1000, 6, REAL)).toBe(3)
	})
})

// ── BL-79: the uneven rungs ───────────────────────────────────────────────────
// The bug this covers: the conversion spaced every rung's steps evenly while the tick labels read
// the calendar's real boundaries, so picking February stored day 30 and the label said January.

describe('months and seasons land on the calendar, not on equal fractions', () => {
	const MONTHS = 5, SEASONS = 4

	it('stores each month on its own first day', () => {
		const starts = DEFAULT_CALENDAR_CONFIG.months.map(m => m.startDay)
		for (let m = 0; m < 12; m++) {
			const abs = toAbsolute(1000, m, MONTHS, REAL, DEFAULT_CALENDAR_CONFIG)!
			expect(abs).toBeCloseTo(1000 + starts[m]! / 365, 9)
			expect(toSubtick(abs, 1000, MONTHS, REAL, DEFAULT_CALENDAR_CONFIG)).toBe(m)
		}
	})

	it('labels the month the editor picked — February was the one that did not', () => {
		const label = buildFormatRegistry(DEFAULT_CALENDAR_CONFIG)['MONTHS']!
		for (let m = 1; m < 12; m++) {   // month 0 is the year boundary, which labels as the year
			const abs = toAbsolute(1000, m, MONTHS, REAL, DEFAULT_CALENDAR_CONFIG)!
			// BL-44: the full round trip — stored as an absolute, read back as the day it falls in,
			// labelled from that day. No fraction is rounded anywhere along it.
			const { day } = dayOfYearAt(abs, DEFAULT_CALENDAR_CONFIG)
			expect(label(1000, day)).toBe(DEFAULT_CALENDAR_CONFIG.months[m]!.shortName)
		}
		// What the old even-step conversion stored for February, and why it read back as January:
		// a twelfth of 365 days is day 30 and February does not begin until day 31.
		expect(toSubtick(1000 + 1 / 12, 1000, MONTHS, REAL, DEFAULT_CALENDAR_CONFIG)).toBe(0)
	})

	it('reaches every season of the seeded calendar, including the one that wraps', () => {
		const label = buildFormatRegistry(SEEDED)['SEASONS']!
		for (let q = 0; q < 4; q++) {
			const abs = toAbsolute(1000, q, SEASONS, REAL, SEEDED)!
			expect(label(1000, dayOfYearAt(abs, SEEDED).day)).toBe(SEEDED.seasons[q]!.name)
			expect(toSubtick(abs, 1000, SEASONS, REAL, SEEDED)).toBe(q)
		}
		// Winter runs day 335 to day 59, so the new year starts in it. The even-step conversion put
		// Winter at three quarters of a year — day 274, which the calendar calls Fall — and could
		// never express day 335 at all.
		expect(toSubtick(1000, 1000, SEASONS, REAL, SEEDED)).toBe(3)
		expect(label(1000, Math.round(0.75 * 365))).toBe('Fall')
	})

	it('leaves the even rungs alone', () => {
		for (const g of [3, 6, 7]) {
			const steps = Math.round(1 / stepOf(REAL, g))
			for (const s of [0, 1, steps - 1]) {
				expect(toAbsolute(1000, s, g, REAL, SEEDED)).toBeCloseTo(
					toAbsolute(1000, s, g, REAL)!, 9)
			}
		}
	})

	it('falls back to even steps when there is no calendar to ask', () => {
		expect(toAbsolute(1000, 1, MONTHS, REAL)).toBeCloseTo(1000 + 1 / 12, 9)
		// A calendar that defines no months is no calendar for this purpose.
		const empty = { ...DEFAULT_CALENDAR_CONFIG, months: [], seasons: [] }
		expect(toAbsolute(1000, 1, MONTHS, REAL, empty)).toBeCloseTo(1000 + 1 / 12, 9)
	})

	it('clamps a step the calendar does not have', () => {
		expect(toAbsolute(1000, 99, SEASONS, REAL, SEEDED)).toBeCloseTo(1000 + 335 / 365, 9)
	})
})

describe('placeDate', () => {
	const SEASONS = 4, MONTHS = 5

	it('leaves a date nobody touched exactly where it was', () => {
		// The 82 real items this was found on: season precision, sitting on the whole-year tick. The
		// dropdown has to show *some* season and day 0 is in Winter, but saving must not act on that.
		const held = holdDate(1372, 1372, SEASONS, REAL, SEEDED)
		expect(held.subtick).toBe(3)
		expect(placeDate(1372, held.subtick, SEASONS, held, REAL, SEEDED)).toBe(1372)
		// And a title change that also moves the year carries the position with it.
		expect(placeDate(1400, held.subtick, SEASONS, held, REAL, SEEDED)).toBe(1400)
	})

	it('moves a date the form changed', () => {
		const held = holdDate(1372, 1372, SEASONS, REAL, SEEDED)
		expect(placeDate(1372, 1, SEASONS, held, REAL, SEEDED)).toBeCloseTo(1372 + 152 / 365, 9)
	})

	it('moves a date whose granularity changed, even at the same step', () => {
		const held = holdDate(1372 + 335 / 365, 1372, SEASONS, REAL, SEEDED)
		expect(held.subtick).toBe(3)
		// Season four to month four is a real change, and both are step 3.
		expect(placeDate(1372, 3, MONTHS, held, REAL, SEEDED)).toBeCloseTo(1372 + 90 / 365, 9)
	})

	it('keeps a position between two ticks rather than snapping it', () => {
		// An item dropped on the canvas mid-summer stays mid-summer until someone says otherwise.
		const mid = 1372 + 200 / 365
		const held = holdDate(mid, 1372, SEASONS, REAL, SEEDED)
		expect(held.subtick).toBe(1)
		expect(placeDate(1372, held.subtick, SEASONS, held, REAL, SEEDED)).toBeCloseTo(mid, 9)
	})

	it('places from the step when there is nothing held — a brand new date', () => {
		expect(placeDate(1372, 2, SEASONS, null, REAL, SEEDED)).toBeCloseTo(1372 + 244 / 365, 9)
		expect(placeDate(null, 2, SEASONS, null, REAL, SEEDED)).toBeNull()
	})
})

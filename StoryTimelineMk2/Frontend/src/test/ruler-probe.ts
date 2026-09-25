/**
 * BL-44: reading the timeline ruler from outside, and working out what it ought to say.
 *
 * Shared by both end-to-end suites — `e2e/timeline-ruler.spec.ts` drives the page with a mocked
 * bridge across three calendars, `e2e-real/timeline-ruler.spec.ts` drives the shipped app over CDP
 * against the seeded one. The page-driving half is identical either way, because the ruler does not
 * know which bridge is behind it.
 *
 * The expectation half is written out here by hand, from a plain description of a calendar. It
 * deliberately does not import `gridTicks` or `buildFormatRegistry`: a test that derives its
 * expectations from the code under test only proves the code agrees with itself.
 */
import type { Page } from '@playwright/test'

// ── Describing a calendar ─────────────────────────────────────────────────────

export interface Cal {
	title: string
	yearLength: number
	weekLength: number
	months: { name: string; short: string; length: number }[]
	seasons: { name: string; start: number; end: number }[]
}

/**
 * The Gregorian calendar the app seeds and both suites lean on, transcribed from
 * `MainDbMigrations` rather than read out of it. Its awkward parts are the point: February is 28
 * days so no even twelfth of a year lands inside it, September is "Sept" rather than "Sep", Spring
 * does not open until day 60, and Winter runs over the new year.
 */
export const GREGORIAN: Cal = {
	title: 'Gregorian',
	yearLength: 365,
	weekLength: 7,
	months: [
		{ name: 'January', short: 'Jan', length: 31 },
		{ name: 'February', short: 'Feb', length: 28 },
		{ name: 'March', short: 'Mar', length: 31 },
		{ name: 'April', short: 'Apr', length: 30 },
		{ name: 'May', short: 'May', length: 31 },
		{ name: 'June', short: 'Jun', length: 30 },
		{ name: 'July', short: 'Jul', length: 31 },
		{ name: 'August', short: 'Aug', length: 31 },
		{ name: 'September', short: 'Sept', length: 30 },
		{ name: 'October', short: 'Oct', length: 31 },
		{ name: 'November', short: 'Nov', length: 30 },
		{ name: 'December', short: 'Dec', length: 31 },
	],
	seasons: [
		{ name: 'Spring', start: 60, end: 151 },
		{ name: 'Summer', start: 152, end: 243 },
		{ name: 'Fall', start: 244, end: 334 },
		{ name: 'Winter', start: 335, end: 59 },
	],
}

export const SUB_YEAR_RUNGS = ['SEASONS', 'MONTHS', 'WEEKS', 'DAYS']
export const WHOLE_YEAR_RUNGS = ['MILLENNIA', 'CENTURIES', 'DECADES', 'YEARS']
export const LADDER = [...WHOLE_YEAR_RUNGS, ...SUB_YEAR_RUNGS]

export const WHOLE_YEAR_STEP: Record<string, number> = {
	MILLENNIA: 1000, CENTURIES: 100, DECADES: 10, YEARS: 1,
}

/**
 * Year 2000 is ordinary. The other two are where a float stops being able to hold a day-of-year:
 * at year ten million `dayOfYearAt` was losing 182 days out of 365 until the slack in it was made
 * to grow with the year.
 */
export const ANCHOR_YEARS = [2000, -9999, 9999999]

// ── Feeding a calendar to the page ────────────────────────────────────────────

export const startDays = (cal: Cal): number[] => {
	let d = 0
	return cal.months.map(m => { const s = d; d += m.length; return s })
}

/** The `year_definition` JSON the backend stores, in the shape `parseCalendarConfig` reads. */
export function yearDefinition(cal: Cal): string {
	const months: Record<string, unknown> = { months_have_short_name: true }
	cal.months.forEach((m, i) => { months[String(i)] = { name: m.name, short_name: m.short, length: m.length } })
	const seasons: Record<string, unknown> = {}
	cal.seasons.forEach((s, i) => { seasons[String(i)] = { name: s.name, start: s.start, end: s.end } })
	return JSON.stringify({
		length: cal.yearLength,
		week_definition: { length: cal.weekLength },
		months: cal.months.length,
		month_definition: months,
		seasons: cal.seasons.length,
		season_definition: seasons,
	})
}

/**
 * A calendar's own ladder. The sub-year steps are fractions of *its* year, which is the whole point:
 * a rung is not a twelfth of a year because twelve is a Gregorian number.
 */
export function lodProfile(cal: Cal) {
	return [
		{ index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
		{ index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
		{ index: 2, formatKey: 'DECADES', stepFraction: 10 },
		{ index: 3, formatKey: 'YEARS', stepFraction: 1 },
		{ index: 4, formatKey: 'SEASONS', stepFraction: 1 / cal.seasons.length },
		{ index: 5, formatKey: 'MONTHS', stepFraction: 1 / cal.months.length },
		{ index: 6, formatKey: 'WEEKS', stepFraction: cal.weekLength / cal.yearLength },
		{ index: 7, formatKey: 'DAYS', stepFraction: 1 / cal.yearLength },
	]
}

// ── What the ruler should say ─────────────────────────────────────────────────

/** The days inside a year this rung puts a tick on, ascending, day 0 always among them. */
export function tickDays(cal: Cal, rung: string): number[] {
	const days
		= rung === 'MONTHS' ? startDays(cal)
		: rung === 'SEASONS' ? cal.seasons.map(s => s.start)
		: rung === 'WEEKS' ? Array.from({ length: Math.ceil(cal.yearLength / cal.weekLength) }, (_, i) => i * cal.weekLength)
		: Array.from({ length: cal.yearLength }, (_, d) => d)
	return [...new Set([0, ...days])].sort((a, b) => a - b)
}

export function monthOf(cal: Cal, day: number) {
	const starts = startDays(cal)
	let i = 0
	for (let k = 0; k < starts.length; k++) if (starts[k]! <= day) i = k
	return { month: cal.months[i]!, start: starts[i]! }
}

export function seasonOf(cal: Cal, day: number): string {
	// Written the way a reader would: the season whose range contains the day, and a range running
	// past the new year contains both ends of the year.
	for (const s of cal.seasons) {
		const inside = s.start <= s.end ? day >= s.start && day <= s.end : day >= s.start || day <= s.end
		if (inside) return s.name
	}
	throw new Error(`${cal.title} has no season on day ${day}`)
}

export function subYearLabel(cal: Cal, rung: string, day: number): string {
	switch (rung) {
		case 'SEASONS': return seasonOf(cal, day)
		case 'MONTHS': return monthOf(cal, day).month.short
		case 'WEEKS': return `W${Math.floor(day / cal.weekLength) + 1}`
		default: {
			const { month, start } = monthOf(cal, day)
			return `${day - start + 1} ${month.short}`
		}
	}
}

/**
 * Every tick the ruler would draw from year `lo` to year `hi`: what it says, and which day of the
 * axis it sits on. The day is what makes spacing checkable — a ruler can name February correctly and
 * still put it a twelfth of a year in.
 *
 * A tick on day 0 prints the bare year rather than the unit it falls in — that is the grid's own
 * convention, and the whole reason day 0 is forced into the tick list even for a calendar whose
 * first season does not begin there.
 */
export function expectedTicks(cal: Cal, rung: string, lo: number, hi: number): { label: string; absDay: number }[] {
	const out: { label: string; absDay: number }[] = []
	if (rung in WHOLE_YEAR_STEP) {
		const step = WHOLE_YEAR_STEP[rung]!
		const suffix = rung === 'MILLENNIA' ? 's' : ''
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
			out.push({ label: `${v}${suffix}`, absDay: v * cal.yearLength })
		}
		return out
	}
	const days = tickDays(cal, rung)
	for (let y = lo; y <= hi; y++) {
		for (const d of days) {
			out.push({ label: d === 0 ? String(y) : subYearLabel(cal, rung, d), absDay: y * cal.yearLength + d })
		}
	}
	return out
}

export const expectedLabels = (cal: Cal, rung: string, lo: number, hi: number): string[] =>
	expectedTicks(cal, rung, lo, hi).map(t => t.label)

/** How far either side of the anchor the expected sequence has to reach to cover the screen. */
export const spanYears = (rung: string) => (rung in WHOLE_YEAR_STEP ? 40 * WHOLE_YEAR_STEP[rung]! : 20)

/** Where `needle` starts inside `hay` as a contiguous run, or -1. */
export function runIndex(hay: string[], needle: string[]): number {
	for (let i = 0; i + needle.length <= hay.length; i++) {
		let ok = true
		for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break }
		if (ok) return i
	}
	return -1
}

/** A year marker rather than a unit name — every rung prints one where a year begins. */
export const isYearMarker = (label: string) => /^-?\d+s?$/.test(label)

// ── Driving the page ──────────────────────────────────────────────────────────

/**
 * Every ruler label on the timeline stage, left to right.
 *
 * `renderGrid` names each tick label `grid-label`, which is what tells them apart from item titles,
 * break-strip captions and the calendar overlay sharing the stage. The stage itself is on the window
 * because Konva's own list of live stages is a module export, not a property of the global it
 * installs — there is no other way into a canvas from here.
 */
export function ruler(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stage = (window as any).__timelineStage
		if (!stage) return []
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return stage.find('.grid-label').sort((a: any, b: any) => a.x() - b.x()).map((t: any) => t.text() as string)
	})
}

/**
 * The same labels with the x they were drawn at, which is the only way to see a *misplaced* tick. A
 * ruler can name February correctly and still sit it a twelfth of a year in — the labels read the
 * calendar while the ticks were spaced evenly, which is the bug BL-44 started from.
 */
export function rulerTicks(page: Page): Promise<{ text: string; x: number; y: number; rotation: number }[]> {
	return page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stage = (window as any).__timelineStage
		if (!stage) return []
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return stage.find('.grid-label')
			.map((t: any) => ({
				text: t.text() as string, x: t.x() as number,
				y: t.y() as number, rotation: t.rotation() as number,
			}))
			.sort((a: { x: number }, b: { x: number }) => a.x - b.x)
	})
}

export function rulerIsDrawn(page: Page, timeout = 10_000) {
	return page.waitForFunction(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stage = (window as any).__timelineStage
		return !!stage && stage.find('.grid-label').length > 0
	}, undefined, { timeout })
}

/**
 * The labels once they have stopped moving. A rung change tweens the step over 300ms and a redraw
 * lands on a frame, so polling until two reads agree beats guessing a sleep.
 */
export async function settledRuler(page: Page): Promise<string[]> {
	let prev = ''
	for (let i = 0; i < 40; i++) {
		await page.waitForTimeout(50)
		const now = await ruler(page)
		if (now.length && now.join('\u0001') === prev) return now
		prev = now.join('\u0001')
	}
	throw new Error('the ruler never settled')
}

export const rungOnScreen = async (page: Page) =>
	((await page.locator('#timeline-lod-container p').textContent()) ?? '').replace('LoD level:', '').trim()

/** Walks the ± buttons to a rung, the way a user would. */
export async function setRung(page: Page, rung: string): Promise<void> {
	const buttons = page.locator('#timeline-lod-container .button')
	for (let guard = 0; guard <= LADDER.length; guard++) {
		const now = await rungOnScreen(page)
		if (now === rung) return
		const from = LADDER.indexOf(now)
		if (from < 0) throw new Error(`unknown rung on screen: "${now}"`)
		await buttons.nth(LADDER.indexOf(rung) > from ? 1 : 0).click()
	}
	throw new Error(`could not reach the ${rung} rung`)
}

export async function jumpToYear(page: Page, year: number): Promise<void> {
	await page.locator('#jump-to-year-input').fill(String(year))
	await page.locator('#jump-to-year-button').click()
}

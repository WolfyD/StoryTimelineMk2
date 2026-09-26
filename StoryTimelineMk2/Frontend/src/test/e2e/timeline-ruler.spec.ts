import { test, expect, type Page } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'
import {
	ANCHOR_YEARS, GREGORIAN, LADDER, SUB_YEAR_RUNGS, type Cal,
	expectedLabels, expectedTicks, isYearMarker, jumpToYear, lodProfile, rulerIsDrawn,
	rulerTicks, runIndex, settledRuler, setRung, spanYears, yearDefinition,
} from '../ruler-probe'

/**
 * BL-44: the ruler, end to end — every tick label at every rung of the LOD ladder.
 *
 * The bugs this exists to catch were all label bugs, and none of them were visible from a unit test
 * of one function: the months ruler skipped February because ticks were spaced by a twelfth of a
 * year while labels looked up real start days; a calendar whose Spring opens on day 60 showed no
 * year number anywhere; the days rung read "Day 348" instead of a date. So this drives the real
 * page — real Vue, real store, real Konva — and reads the text off the stage.
 *
 * What it checks, at every rung of every calendar:
 *
 *   The labels on screen are a **contiguous slice** of the sequence the calendar says they should
 *   be. That one assertion covers everything: a missing February breaks contiguity, a repeated
 *   January breaks it, a name from the wrong unit breaks it, and a missing year marker breaks it.
 *   The expected sequence is written out in `ruler-probe.ts` from the calendar's own definition, by
 *   hand — not derived from `gridTicks` or `buildFormatRegistry`, which would only prove they agree
 *   with themselves.
 *
 * And it checks it at year 2000, year -9999 and year 9999999, because a float stops being able to
 * hold a day-of-year long before the year runs out: at year ten million `dayOfYearAt` was quietly
 * losing 182 days out of 365 until the slack in it was made to grow with the year.
 *
 * This is the breadth half. `e2e-real/timeline-ruler.spec.ts` does the same walk in the shipped
 * WinForms app against the real database, which proves the seeded calendar survives the bridge.
 *
 * DOM contract (TimelineApp.vue):
 *   - #jump-to-year-input + #jump-to-year-button move the view to a year
 *   - #timeline-lod-container holds [coarser, finer] buttons and a <p> reading "LoD level: <key>"
 *   - renderGrid names every tick label `grid-label`, which is how they are told apart from item
 *     titles, break-strip captions and the calendar overlay on the same stage
 */

// A wide window so a whole Gregorian year of month ticks fits on the canvas at once.
test.use({ viewport: { width: 1400, height: 900 } })

// ── The calendars ─────────────────────────────────────────────────────────────

/**
 * Three hundred days, three seasons of a hundred, ten-day weeks, and two months of unequal length.
 * Nothing in it is a quarter and nothing in it is a twelfth, so every number the old ruler assumed
 * is wrong here.
 */
const TERRAN_LIKE: Cal = {
	title: 'Three seasons in a three-hundred-day year',
	yearLength: 300,
	weekLength: 10,
	months: [
		{ name: 'Rise', short: 'Ris', length: 137 },
		{ name: 'High', short: 'Hig', length: 163 },
	],
	seasons: [
		{ name: 'Thaw', start: 0, end: 99 },
		{ name: 'Blaze', start: 100, end: 199 },
		{ name: 'Dim', start: 200, end: 299 },
	],
}

/**
 * Sixteen months across six hundred and eighteen days, five-day weeks, and two seasons that split
 * the year off-centre. Sixteen months is more labels per year than the ruler has ever had to fit.
 */
const LONG_YEAR: Cal = {
	title: 'Sixteen months in a six-hundred-and-eighteen-day year',
	yearLength: 618,
	weekLength: 5,
	months: Array.from({ length: 16 }, (_, i) => ({
		name: `Moon ${i + 1}`,
		short: `Mo${i + 1}`,
		// 38 days each but the last, which takes the remainder — so the months are not all equal and
		// the final one cannot be found by multiplying.
		length: i === 15 ? 618 - 15 * 38 : 38,
	})),
	seasons: [
		{ name: 'Waxing', start: 0, end: 229 },
		{ name: 'Waning', start: 230, end: 617 },
	],
}

/** `override: false` is the shipped default, which the bridge mock already serves unaltered. */
const CALENDARS: { cal: Cal; override: boolean }[] = [
	{ cal: { ...GREGORIAN, title: 'Gregorian (the shipped default)' }, override: false },
	{ cal: TERRAN_LIKE, override: true },
	{ cal: LONG_YEAR, override: true },
]

/** Patches the one calendar the mock shares between GetTimelineData, GetAllTimelines and the editor. */
const calendarOverride = (cal: Cal) => ({
	Name: cal.title,
	YearDefinition: yearDefinition(cal),
	// A JSON string, as the column holds it — the store parses it rather than reading an array.
	LodProfile: { Id: 'lod_test', Name: cal.title, Profile: JSON.stringify(lodProfile(cal)) },
})

async function openTimeline(page: Page, cal: Cal, override: boolean): Promise<void> {
	await injectBridgeMock(page, override ? { __calendar: calendarOverride(cal) } : {})
	await page.goto('/timeline.html?id=1')
	await page.waitForSelector('#timeline-workspace', { timeout: 5000 })
	await rulerIsDrawn(page)
}

// ── The ladder walk ───────────────────────────────────────────────────────────

for (const { cal, override } of CALENDARS) {
	test.describe(cal.title, () => {
		test.beforeEach(async ({ page }) => { await openTimeline(page, cal, override) })

		for (const year of ANCHOR_YEARS) {
			test(`every rung labels itself correctly at year ${year}`, async ({ page }) => {
				await jumpToYear(page, year)

				for (const rung of LADDER) {
					await setRung(page, rung)
					const got = await settledRuler(page)
					const span = spanYears(rung)
					const want = expectedLabels(cal, rung, year - span, year + span)

					const report = `${rung} at year ${year}\n  on screen: ${got.join(' | ')}`
					expect(got.length, `${report}\n  the ruler drew almost nothing`).toBeGreaterThanOrEqual(4)
					expect(runIndex(want, got), `${report}\n  expected a run of: ${want.slice(0, 40).join(' | ')} …`)
						.toBeGreaterThanOrEqual(0)
				}
			})
		}

		test('the year is written on the ruler at every sub-year rung', async ({ page }) => {
			// A season list that starts on day 60 used to leave the axis with no year number on it at
			// all, because no boundary day equalled zero.
			await jumpToYear(page, 2000)
			for (const rung of SUB_YEAR_RUNGS) {
				await setRung(page, rung)
				const got = await settledRuler(page)
				expect(got, `${rung} drew no year marker: ${got.join(' | ')}`).toContain('2000')
			}
		})

		test('the year number sits on a row of its own, clear of the unit names', async ({ page }) => {
			// BL-85, off a screenshot: this calendar's last season opens a handful of days before the year
			// turns, so the year number was printed on top of the season's name. A row of its own is the
			// one arrangement where neither of the two labels nobody wants to lose has to give.
			await jumpToYear(page, 2000)
			for (const rung of SUB_YEAR_RUNGS) {
				await setRung(page, rung)
				await settledRuler(page)
				const ticks = await rulerTicks(page)
				const years = ticks.filter(t => isYearMarker(t.text))
				const units = ticks.filter(t => !isYearMarker(t.text))
				expect(years.length, `${rung} drew no year marker`).toBeGreaterThan(0)
				for (const y of years) {
					const clash = units.find(u => Math.abs(u.y - y.y) < 1)
					expect(clash?.text, `${rung}: "${y.text}" is on the same row as "${clash?.text}"`).toBeUndefined()
				}
			}
		})

		test('the ruler names every month of the year, and each one once', async ({ page }) => {
			await jumpToYear(page, 2000)
			await setRung(page, 'MONTHS')
			const got = await settledRuler(page)
			// Every rung shows more than a year of month ticks, so every name should be somewhere on it.
			// The first month is not: a tick on day 0 prints the year instead. Order is the ladder
			// walk's job; this one is about nothing being missing — the February bug in one assertion.
			const names = new Set(got.filter(l => !isYearMarker(l)))
			expect(got, 'no year marker on the months ruler').toContain('2000')
			expect([...names].sort()).toEqual(cal.months.slice(1).map(m => m.short).sort())
		})

		// The only thing the labels cannot show: the ruler can name February correctly and still put its
		// tick a twelfth of a year in. Pixels per day has to come out the same across every gap, which it
		// does not if the ticks are evenly spaced and February is short. At the ends of the axis it also
		// catches a position computed as the difference of two numbers too big to subtract cleanly.
		for (const year of ANCHOR_YEARS) {
		test(`a month tick sits on the day the month starts, not on an even fraction (year ${year})`, async ({ page }) => {
			await jumpToYear(page, year)
			await setRung(page, 'MONTHS')
			await settledRuler(page)
			const ticks = await rulerTicks(page)
			const want = expectedTicks(cal, 'MONTHS', year - spanYears('MONTHS'), year + spanYears('MONTHS'))
			const at = runIndex(want.map(t => t.label), ticks.map(t => t.text))
			expect(at, `could not place the ruler: ${ticks.map(t => t.text).join(' | ')}`).toBeGreaterThanOrEqual(0)

			const pxPerDay = ticks.slice(1).map((t, k) => ({
				after: ticks[k]!.text,
				ratio: (t.x - ticks[k]!.x) / (want[at + k + 1]!.absDay - want[at + k]!.absDay),
			}))
			for (const g of pxPerDay) {
				// A pixel of slack per day would be an enormous error; the real spacing is exact.
				expect(g.ratio, `the gap after ${g.after} is the wrong width at year ${year}`)
					.toBeCloseTo(pxPerDay[0]!.ratio, 3)
			}
		})
		}

		test('every season of the year reaches the ruler', async ({ page }) => {
			await jumpToYear(page, 2000)
			await setRung(page, 'SEASONS')
			const got = await settledRuler(page)
			// A season opening on day 0 is drawn as the year number, so it is not on this list. The
			// Gregorian calendar has no such season — its Spring starts on day 60 — which is what made
			// the missing year marker a bug rather than a cosmetic choice.
			for (const s of cal.seasons.filter(s => s.start !== 0)) {
				expect(got, `${s.name} never appears: ${got.join(' | ')}`).toContain(s.name)
			}
		})

		test('the days rung shows dates, not a count of days', async ({ page }) => {
			await jumpToYear(page, 2000)
			await setRung(page, 'DAYS')
			const got = await settledRuler(page)
			const shorts = cal.months.map(m => m.short)
			for (const label of got) {
				if (isYearMarker(label)) continue   // a year marker, not a date
				expect(label, `not a date: ${got.join(' | ')}`).toMatch(/^\d+ \S+$/)
				expect(shorts, `unknown month in "${label}"`).toContain(label.split(' ')[1]!)
			}
		})
	})
}

// ── Angled labels (BL-82) ─────────────────────────────────────────────────────

/**
 * A rung with a tight tick distance (BL-80 made those per-rung) can put its labels closer together
 * than the dates are wide, and a horizontal ruler then reads as one run-on string. Angled, each
 * label leans out of its neighbour's way.
 *
 * The geometry is the whole of the feature, and it is the part that is easy to get backwards: the
 * label's *right* end stays on its own tick and the text runs down and to the left, so it reads
 * up-to-the-right. Lean it the other way and every date points at the tick next door. Two pages of
 * the same timeline, one with the setting on, is the only way to see that — the plain ruler says
 * where the tick is, the angled one says where the label ended up.
 */
test.describe('angled axis labels', () => {
	/** The reach of a 100px label box rotated 45°, which is both the x pull-back and the y drop. */

	const monthTicks = async (page: Page, angled: boolean) => {
		await injectBridgeMock(page, { __layout: { TimelineTickMarkerTextAngled: angled } })
		await page.goto('/timeline.html?id=1')
		await page.waitForSelector('#timeline-workspace', { timeout: 5000 })
		await rulerIsDrawn(page)
		await jumpToYear(page, 2000)
		await setRung(page, 'MONTHS')
		await settledRuler(page)
		return rulerTicks(page)
	}

	test('lean 45° north-west to south-east, starting on their own tick', async ({ page, context }) => {
		const plain = await monthTicks(page, false)
		const angled = await monthTicks(await context.newPage(), true)

		expect(plain.every(t => t.rotation === 0), 'a label leaned with the setting off').toBe(true)
		expect(angled.map(t => t.text), 'the two rulers are not showing the same months')
			.toEqual(plain.map(t => t.text))

		// BL-85: plain mode drops a sub-year rung's year number a row, so a unit name starting near the
		// year boundary cannot land on it. Angled, the names already lean clear of each other and the
		// year stays on the one row, so the lean is measured against that row and not against whichever
		// row the plain ruler put this particular label on.
		const baseY = Math.min(...plain.map(t => t.y))

		for (const [i, a] of angled.entries()) {
			const p = plain[i]!
			expect(a.rotation, `"${a.text}" is not leaning`).toBe(45)
			// Horizontal the box is centred on its tick, so the tick is at x + half the box. Angled the
			// text begins at the tick and runs away from it, so the origin is that same pixel.
			expect(a.x, `"${a.text}" left its tick`).toBeCloseTo(p.x + 50, 1)
			expect(a.y, `"${a.text}" is not on the ruler's own row`).toBeCloseTo(baseY, 1)
		}
	})
})

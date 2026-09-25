import { test, expect, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'
import {
  ANCHOR_YEARS, GREGORIAN, LADDER, SUB_YEAR_RUNGS,
  expectedLabels, isYearMarker, jumpToYear, rulerIsDrawn, runIndex,
  settledRuler, setRung, spanYears,
} from '../ruler-probe'

/**
 * BL-44: the ruler in the shipped app — real WinForms window, real WebView2, real SQLite.
 *
 * The mocked suite (`e2e/timeline-ruler.spec.ts`) covers breadth: three calendars, the whole ladder,
 * both ends of the axis. This one covers truth. Everything it asserts is a fact about the *seeded*
 * calendar that a fixture cannot fake: "Sept" rather than "Sep", a February of 28 days, a Spring that
 * does not open until day 60, and a Winter running over the new year. If the year definition or the
 * LOD profile were mangled anywhere between `cal_default_gregorian` and `renderGrid` — the repo, the
 * bridge's JSON casing, the store's `JSON.parse` of the profile column — the labels would come out
 * of a default instead, and these names would not be on screen.
 *
 * That path fails quietly, which is why it is worth a test: the store's timeline load wraps
 * everything in one `catch` that only writes to the console, so a calendar it cannot read leaves the
 * timeline with no ladder at all rather than an error.
 *
 * Needs the app running with CDP:  powershell ..\scripts\Start-E2EApp.ps1
 */

const GREG = { ...GREGORIAN, title: 'the seeded Gregorian calendar' }

test.describe('Timeline ruler — real backend', () => {
  let tl: Page

  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    tl = await openTimelinePage(mainPage, appContext, pageErrors)
    await rulerIsDrawn(tl)
  })

  for (const year of ANCHOR_YEARS) {
    test(`every rung labels itself correctly at year ${year}`, async () => {
      await jumpToYear(tl, year)

      for (const rung of LADDER) {
        await setRung(tl, rung)
        const got = await settledRuler(tl)
        const span = spanYears(rung)
        const want = expectedLabels(GREG, rung, year - span, year + span)

        const report = `${rung} at year ${year}\n  on screen: ${got.join(' | ')}`
        expect(got.length, `${report}\n  the ruler drew almost nothing`).toBeGreaterThanOrEqual(4)
        expect(runIndex(want, got), `${report}\n  expected a run of: ${want.slice(0, 40).join(' | ')} …`)
          .toBeGreaterThanOrEqual(0)
      }
    })
  }

  test('the month names come from the database, "Sept" and all', async () => {
    await jumpToYear(tl, 2000)
    await setRung(tl, 'MONTHS')
    const got = await settledRuler(tl)
    // 'Sept' is the tell. `DEFAULT_CALENDAR_CONFIG` in timelineLayout.ts says 'Sep'; only the seeded
    // row says 'Sept', so seeing it here means the ruler really read the database.
    expect(got, `no 'Sept' on the months ruler: ${got.join(' | ')}`).toContain('Sept')
    const names = new Set(got.filter(l => !isYearMarker(l)))
    // January is absent on purpose — a tick on day 0 prints the year instead.
    expect([...names].sort()).toEqual(GREG.months.slice(1).map(m => m.short).sort())
  })

  test('the seasons rung shows all four, and the year they begin in', async () => {
    await jumpToYear(tl, 2000)
    await setRung(tl, 'SEASONS')
    const got = await settledRuler(tl)
    for (const s of GREG.seasons) {
      expect(got, `${s.name} never appears: ${got.join(' | ')}`).toContain(s.name)
    }
    // No season of this calendar begins on day 0 — Spring waits until day 60 and Winter runs over
    // from the year before — so the year number is only on the axis because day 0 is forced onto it.
    expect(got, `no year marker on the seasons ruler: ${got.join(' | ')}`).toContain('2000')
  })

  test('the year is written on the ruler at every sub-year rung', async () => {
    await jumpToYear(tl, 2000)
    for (const rung of SUB_YEAR_RUNGS) {
      await setRung(tl, rung)
      const got = await settledRuler(tl)
      expect(got, `${rung} drew no year marker: ${got.join(' | ')}`).toContain('2000')
    }
  })

  test('the days rung shows dates, not a count of days', async () => {
    await jumpToYear(tl, 2000)
    await setRung(tl, 'DAYS')
    const got = await settledRuler(tl)
    const shorts = GREG.months.map(m => m.short)
    for (const label of got) {
      if (isYearMarker(label)) continue
      expect(label, `not a date: ${got.join(' | ')}`).toMatch(/^\d+ \S+$/)
      expect(shorts, `unknown month in "${label}"`).toContain(label.split(' ')[1]!)
    }
  })

  test('a date ten million years out still knows which month it is in', async () => {
    // The bug this is here for: `dayOfYearAt` used a fixed sliver of slack to pull a boundary back
    // onto its own day, and at year ten million the year's own rounding error is bigger than that
    // sliver — so 182 days of 365 read as the day before, and the first of February was labelled
    // January. Nothing about it is visible at year 2000.
    await jumpToYear(tl, 9999999)
    await setRung(tl, 'MONTHS')
    const got = await settledRuler(tl)
    expect(got, `no year marker ten million years out: ${got.join(' | ')}`).toContain('9999999')
    const names = new Set(got.filter(l => !isYearMarker(l)))
    expect([...names].sort()).toEqual(GREG.months.slice(1).map(m => m.short).sort())
  })
})

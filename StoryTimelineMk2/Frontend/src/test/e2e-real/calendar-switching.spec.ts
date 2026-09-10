import { test, expect, findPageByRole, waitForNewPage } from './fixtures'
import type { Page, BrowserContext } from '@playwright/test'

// ── Module-level constants ─────────────────────────────────────────────────────
// Fixed string — avoids re-evaluation issues when afterAll uses test-scoped fixtures
const CALENDAR_NAME = 'E2E-CalSwitch-Calendar'

// Captures the first timeline's original calendar so afterAll can restore it
let savedCalendar = ''

// ── Helpers ───────────────────────────────────────────────────────────────────

async function closeAny(mainPage: Page, appContext: BrowserContext) {
  const cal = findPageByRole(appContext, 'calendar')
  if (cal) {
    await cal.evaluate(() => window.close()).catch(() => {})
    await new Promise(r => setTimeout(r, 800))
  }
  const tl = findPageByRole(appContext, 'timeline')
  if (tl) {
    await tl.evaluate(() => window.close()).catch(() => {})
    await new Promise(r => setTimeout(r, 800))
  }
  const modal = mainPage.locator('.modal-panel')
  if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
    const closeBtn = modal.locator('.icon-btn[title="Close"]')
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {})
    } else {
      await mainPage.keyboard.press('Escape').catch(() => {})
    }
    await mainPage.waitForTimeout(300)
  }
  await mainPage.bringToFront().catch(() => {})
}

function sec(cal: Page, title: string) {
  return cal.locator('.section').filter({
    has: cal.locator('.section-title', { hasText: title }),
  })
}

/**
 * Create a new calendar via the Calendar Manager → New Calendar flow.
 * Returns when the editor window closes (save succeeded).
 */
async function createCalendar(
  mainPage: Page,
  appContext: BrowserContext,
  pageErrors: string[],
  name: string,
) {
  await mainPage.locator('[title="Manage Calendars"]').click()
  const managerModal = mainPage.locator('.modal-panel')
  await expect(managerModal).toBeVisible({ timeout: 5000 })

  await managerModal.locator('.new-btn').click()
  const cal = await waitForNewPage(appContext, 'calendar', 12_000, pageErrors)
  await cal.waitForSelector('.cal-root', { timeout: 12_000 })

  await cal.locator('input.name-input').fill(name)

  const lodSec = sec(cal, 'LOD Profile')
  const hasYears =
    (await lodSec
      .locator('table.data-table tbody tr')
      .filter({ hasText: 'YEARS' })
      .count()) > 0
  if (!hasYears) {
    await lodSec.locator('button', { hasText: 'Auto LOD' }).click()
    await cal.waitForTimeout(400)
  }

  const monthSec = sec(cal, 'Months')
  await monthSec.locator('.btn-add', { hasText: '+ Add Month' }).click()
  await cal.waitForTimeout(400)
  const lastRow = monthSec.locator('table.data-table tbody tr').last()
  // .first() guards against short-names mode which adds a second text input per row
  await lastRow.locator('input[type="text"]').first().fill('Month')
  await lastRow.locator('input[type="number"]').first().fill('30')

  await cal.locator('button.btn.btn-primary', { hasText: 'Save' }).click()
  try {
    await cal.waitForEvent('close', { timeout: 8000 })
  } catch {
    const hasError = await cal
      .locator('.save-error')
      .isVisible({ timeout: 500 })
      .catch(() => false)
    expect(hasError, `Calendar "${name}" save produced an error`).toBeFalsy()
    throw new Error(`Calendar editor did not close after saving "${name}"`)
  }

  if (await managerModal.isVisible({ timeout: 500 }).catch(() => false)) {
    await managerModal.locator('.icon-btn[title="Close"]').click().catch(() => {})
    await mainPage.waitForTimeout(300)
  }
}

/**
 * Open the row-action menu for the first timeline row.
 * Handles the case where the menu is already open (idempotent).
 */
async function openRowMenu(mainPage: Page) {
  const row = mainPage.locator('.project-timeline-row-container').first()
  await expect(row).toBeVisible({ timeout: 8000 })
  const actionBtns = row.locator('.row-action-buttons')
  const isOpen = await actionBtns.evaluate((el: Element) => el.classList.contains('visible')).catch(() => false)
  if (isOpen) {
    await row.locator('.ellipsis-button').click()
    await mainPage.waitForTimeout(400)
  }
  await row.locator('.ellipsis-button').click()
  await expect(row.locator('.hidden-buttons-group')).toBeVisible({ timeout: 2000 })
  return row
}

/**
 * Return the selected calendar label for the first timeline row.
 * Opens the Edit modal, reads the value, then dismisses via Cancel button.
 */
async function getFirstTimelineCalendar(mainPage: Page) {
  const row = await openRowMenu(mainPage)
  await row.locator('.row-action-button[title="Edit"]').click()
  const modal = mainPage.locator('.modal-panel')
  await expect(modal).toBeVisible({ timeout: 3000 })
  // option:checked gives the text of the currently selected option — no evaluate cast needed
  const label = await modal.locator('select.cal-select option:checked').textContent() ?? ''
  await modal.locator('.btn-cancel').click()
  await modal.waitFor({ state: 'hidden', timeout: 3000 })
  return label.trim()
}

/** Assign a calendar (by label) to the first timeline row via the Edit modal. */
async function setFirstTimelineCalendar(mainPage: Page, calendarLabel: string) {
  const row = await openRowMenu(mainPage)
  await row.locator('.row-action-button[title="Edit"]').click()
  const modal = mainPage.locator('.modal-panel')
  await expect(modal).toBeVisible({ timeout: 3000 })
  await modal.locator('select.cal-select').selectOption({ label: calendarLabel })
  await modal.locator('.btn-primary').click()
  await expect(modal).not.toBeVisible({ timeout: 5000 })
}

/** Open the first timeline row in a new window and wait for the workspace. */
async function openFirstTimeline(
  mainPage: Page,
  appContext: BrowserContext,
  pageErrors: string[],
) {
  const existing = findPageByRole(appContext, 'timeline')
  if (existing) {
    await existing.evaluate(() => window.close()).catch(() => {})
    await new Promise(r => setTimeout(r, 800))
  }
  await mainPage.locator('.project-timeline-row-container').first().click()
  const tl = await waitForNewPage(appContext, 'timeline', 10_000, pageErrors)
  await tl.waitForSelector('#timeline-workspace', { timeout: 10_000 })
  return tl
}

/** Return all AbsoluteStart values from the Pinia store, or undefined if unavailable / empty. */
async function getItemPositions(tl: Page) {
  return tl.evaluate(() => {
    // Access Pinia via the Vue 3 app instance set on the mounted root element
    const appEl = document.getElementById('app') as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const pinia = appEl?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia?._s) return undefined
    const store = pinia._s.get('timeline')
    if (!Array.isArray(store?.items) || store.items.length === 0) return undefined
    return store.items.map((it: any) => Number(it.AbsoluteStart)) // eslint-disable-line @typescript-eslint/no-explicit-any
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Calendar creation and timeline switching — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext }) => {
    await closeAny(mainPage, appContext)
  })

  test.afterAll(async ({ mainPage, appContext }) => {
    await closeAny(mainPage, appContext)
    // Restore the first timeline to its original calendar
    if (savedCalendar) {
      await setFirstTimelineCalendar(mainPage, savedCalendar).catch(() => {})
    }
  })

  // ── Step 1: create calendar ───────────────────────────────────────────────

  test('can create a new calendar and it appears in the manager list', async ({
    mainPage,
    appContext,
    pageErrors,
  }) => {
    await createCalendar(mainPage, appContext, pageErrors, CALENDAR_NAME)

    await mainPage.locator('[title="Manage Calendars"]').click()
    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(
      modal.locator('.cal-name', { hasText: CALENDAR_NAME }).first(),
    ).toBeVisible({ timeout: 3000 })
    await modal.locator('.icon-btn[title="Close"]').click()
  })

  // ── Step 2: assign to the first timeline (which has real data) ────────────

  test('can assign the new calendar to the first existing timeline', async ({
    mainPage,
  }) => {
    // Record the original calendar BEFORE switching so afterAll can restore it
    savedCalendar = await getFirstTimelineCalendar(mainPage)
    await setFirstTimelineCalendar(mainPage, CALENDAR_NAME)
    await expect(mainPage.locator('.modal-panel')).not.toBeVisible({ timeout: 2000 })
  })

  // ── Step 3: verify items still have valid positions after calendar switch ─

  test('existing timeline items have valid absolute positions after calendar switch', async ({
    mainPage,
    appContext,
    pageErrors,
  }) => {
    const tl = await openFirstTimeline(mainPage, appContext, pageErrors)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()

    const positions = await getItemPositions(tl)
    // This test must run on a timeline that has items — if null, the timeline is empty
    expect(
      positions,
      'No items found — run this test against a timeline that has data',
    ).toBeTruthy()
    for (const pos of (positions ?? [])) {
      // AbsoluteStart is year + subtick/10, so a valid value is any finite number (e.g. 828.0)
      expect(Number.isFinite(pos), `AbsoluteStart ${pos} is not a valid finite number after calendar switch`).toBe(true)
    }

    expect(pageErrors).toHaveLength(0)
  })

  // ── Step 4: canvas renders without errors ─────────────────────────────────

  test('canvas renders without page errors after calendar switch', async ({
    mainPage,
    appContext,
    pageErrors,
  }) => {
    const tl = await openFirstTimeline(mainPage, appContext, pageErrors)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
    await expect(tl.locator('#timeline-info')).toBeVisible()
    await expect(tl.locator('#timeline-lod-container')).toBeVisible()
    expect(pageErrors).toHaveLength(0)
  })

  // ── Step 5: switch to yet another calendar, verify positions again ────────

  test('switching to a second different calendar also produces valid item positions', async ({
    mainPage,
    appContext,
    pageErrors,
  }) => {
    // Find any calendar that is not the one we just assigned
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Edit"]').click()
    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })

    const calSelect = modal.locator('select.cal-select')
    const options = calSelect.locator('option')
    const count = await options.count()

    let altLabel = ''
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i)
      const text = (await opt.textContent() ?? '').trim()
      const disabled = await opt.isDisabled()
      if (!disabled && text && text !== CALENDAR_NAME) {
        altLabel = text
        break
      }
    }

    if (!altLabel) {
      await modal.locator('.btn-cancel').click()
      await modal.waitFor({ state: 'hidden', timeout: 3000 })
      test.skip(true, 'No alternative calendar available to switch to')
      return
    }

    await calSelect.selectOption({ label: altLabel })
    await modal.locator('.btn-primary').click()
    await expect(modal).not.toBeVisible({ timeout: 5000 })

    const tl = await openFirstTimeline(mainPage, appContext, pageErrors)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()

    const positions = await getItemPositions(tl)
    expect(
      positions,
      'Items must still be present after switching to a second calendar',
    ).toBeTruthy()
    for (const pos of (positions ?? [])) {
      // AbsoluteStart is year + subtick/10 — check it is a valid finite number
      expect(Number.isFinite(pos), `AbsoluteStart ${pos} is not a valid finite number after second calendar switch`).toBe(true)
    }

    expect(pageErrors).toHaveLength(0)
  })
})

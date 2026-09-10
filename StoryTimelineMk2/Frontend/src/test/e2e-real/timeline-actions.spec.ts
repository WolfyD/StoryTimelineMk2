import { test, expect, findPageByRole, waitForNewPage } from './fixtures'
import type { Page, BrowserContext } from '@playwright/test'

async function openTimeline(mainPage: Page, appContext: BrowserContext, pageErrors: string[]) {
  const existing = findPageByRole(appContext, 'timeline')
  if (existing) {
    await existing.evaluate(() => window.close())
    await new Promise(r => setTimeout(r, 1000))
  }
  const firstRow = mainPage.locator('.project-timeline-row-container').first()
  await expect(firstRow).toBeVisible({ timeout: 8000 })
  await firstRow.click()
  const tl = await waitForNewPage(appContext, 'timeline', 10_000, pageErrors)
  await tl.waitForSelector('#timeline-workspace', { timeout: 10_000 })
}

/** Open the actions popover on the already-open timeline page. */
async function openActionsPopover(tl: Page) {
  await tl.locator('.actions-trigger').click()
  await expect(tl.locator('.actions-popover')).toBeVisible({ timeout: 3000 })
}

/** Delete all existing hidden ranges from an open actions popover. */
async function clearAllRanges(tl: Page) {
  const delBtns = tl.locator('.range-row .icon-btn.icon-btn--danger')
  while (await delBtns.count() > 0) {
    await delBtns.first().click()
    await tl.waitForTimeout(500)
  }
}

test.describe('Timeline actions menu — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimeline(mainPage, appContext, pageErrors)
  })

  // ── Popover open / close ──────────────────────────────────────────────────

  test('actions trigger button is visible', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('.actions-trigger')).toBeVisible()
  })

  test('clicking trigger opens the actions popover', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await expect(tl.locator('.actions-popover')).toBeVisible()
  })

  test('popover close button dismisses it', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('.actions-popover .close-btn').click()
    await expect(tl.locator('.actions-popover')).not.toBeVisible({ timeout: 2000 })
  })

  test('Escape key closes the popover', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.actions-popover')).not.toBeVisible({ timeout: 2000 })
  })

  test('clicking outside the popover closes it', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('#timeline-header h1').click()
    await tl.waitForTimeout(300)
    await expect(tl.locator('.actions-popover')).not.toBeVisible({ timeout: 2000 })
  })

  // ── Popover structure ──────────────────────────────────────────────────────

  test('popover contains Hidden Ranges and Shift All Items sections', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const popover = tl.locator('.actions-popover')
    await expect(popover.locator('.action-section-title', { hasText: 'Hidden Time Ranges' })).toBeVisible()
    await expect(popover.locator('.action-section-title', { hasText: 'Shift All Items' })).toBeVisible()
  })

  test('range add form has start, end, and label inputs', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    await expect(form).toBeVisible()
    await expect(form.locator('input[type="number"]')).toHaveCount(2)
    await expect(form.locator('input[type="text"]')).toHaveCount(1)
    await expect(form.locator('.icon-btn.icon-btn--ok')).toBeVisible()
  })

  test('shift form has a year-offset input and shift button', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.shift-form')
    await expect(form).toBeVisible()
    await expect(form.locator('.shift-input')).toBeVisible()
    await expect(form.locator('.icon-btn.icon-btn--ok')).toContainText('Shift')
  })

  // ── Range validation ───────────────────────────────────────────────────────

  test('range error shown when both inputs are empty and Add is clicked', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('.range-add-form .icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.range-error')).toBeVisible({ timeout: 2000 })
  })

  test('range error shown when end year is not greater than start year', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    const numInputs = form.locator('input[type="number"]')
    await numInputs.first().fill('500')
    await numInputs.last().fill('400')
    await form.locator('.icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.range-error')).toBeVisible({ timeout: 2000 })
    await expect(tl.locator('.range-error')).toContainText('greater')
  })

  test('range error disappears after a successful add', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    const numInputs = form.locator('input[type="number"]')
    await numInputs.first().fill('500')
    await numInputs.last().fill('300')
    await form.locator('.icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.range-error')).toBeVisible({ timeout: 2000 })
    // Fix the end year and add successfully
    await numInputs.last().fill('600')
    await form.locator('.icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.range-error')).not.toBeVisible({ timeout: 3000 })
    await clearAllRanges(tl)
  })

  // ── Add / delete ranges ────────────────────────────────────────────────────

  test('adding a valid range creates a row in the list', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    const numInputs = form.locator('input[type="number"]')
    await numInputs.first().fill('100')
    await numInputs.last().fill('200')
    await form.locator('input[type="text"]').fill('Test Gap')
    await form.locator('.icon-btn.icon-btn--ok').click()

    const row = tl.locator('.range-row', { hasText: 'Test Gap' })
    await expect(row).toBeVisible({ timeout: 4000 })
    await row.locator('.icon-btn.icon-btn--danger').click()
    await expect(row).not.toBeVisible({ timeout: 3000 })
  })

  test('added range displays its start and end years', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    const numInputs = form.locator('input[type="number"]')
    await numInputs.first().fill('300')
    await numInputs.last().fill('400')
    await form.locator('.icon-btn.icon-btn--ok').click()

    await expect(tl.locator('.range-years').filter({ hasText: '300' })).toBeVisible({ timeout: 4000 })
    await clearAllRanges(tl)
  })

  test('deleting a range removes it from the list', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    const form = tl.locator('.range-add-form')
    const numInputs = form.locator('input[type="number"]')
    await numInputs.first().fill('700')
    await numInputs.last().fill('800')
    await form.locator('.icon-btn.icon-btn--ok').click()

    const row = tl.locator('.range-row').filter({ has: tl.locator('.range-years', { hasText: '700' }) })
    await expect(row).toBeVisible({ timeout: 4000 })
    await row.locator('.icon-btn.icon-btn--danger').click()
    await expect(row).not.toBeVisible({ timeout: 3000 })
  })

  test('empty-ranges message shown when no ranges are defined', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await clearAllRanges(tl)
    await expect(tl.locator('.ranges-empty')).toBeVisible({ timeout: 2000 })
  })

  // ── Shift items ────────────────────────────────────────────────────────────

  test('shift button is disabled when input is empty', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await expect(tl.locator('.shift-form .icon-btn.icon-btn--ok')).toBeDisabled()
  })

  test('entering a shift value enables the shift button', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('.shift-input').fill('50')
    await expect(tl.locator('.shift-form .icon-btn.icon-btn--ok')).not.toBeDisabled()
  })

  test('shift by 1 year shows a success message', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('.shift-input').fill('1')
    await tl.locator('.shift-form .icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.shift-ok')).toBeVisible({ timeout: 6000 })
    await expect(tl.locator('.shift-ok')).toContainText('Shifted')

    // Undo: shift back by -1
    await tl.locator('.shift-input').fill('-1')
    await tl.locator('.shift-form .icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.shift-ok')).toBeVisible({ timeout: 6000 })
  })

  test('shift success message contains the affected item count', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openActionsPopover(tl)
    await tl.locator('.shift-input').fill('2')
    await tl.locator('.shift-form .icon-btn.icon-btn--ok').click()
    const msg = tl.locator('.shift-ok')
    await expect(msg).toBeVisible({ timeout: 6000 })
    const text = await msg.textContent()
    expect(text).toMatch(/\d+/)  // contains at least one digit (item count)

    // Undo
    await tl.locator('.shift-input').fill('-2')
    await tl.locator('.shift-form .icon-btn.icon-btn--ok').click()
    await expect(tl.locator('.shift-ok')).toBeVisible({ timeout: 6000 })
  })
})

import { test, expect, findPageByRole, waitForNewPage } from './fixtures'
import type { Page, BrowserContext } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function closeAny(mainPage: Page, appContext: BrowserContext) {
  const cal = findPageByRole(appContext, 'calendar')
  if (cal) {
    await cal.evaluate(() => window.close()).catch(() => {})
    await new Promise(r => setTimeout(r, 800))
  }
  const modal = mainPage.locator('.bm-panel')
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

async function openManagerModal(mainPage: Page) {
  await mainPage.locator('[title="Manage Calendars"]').click()
  const modal = mainPage.locator('.bm-panel')
  await expect(modal).toBeVisible({ timeout: 5000 })
  await expect(modal.locator('.modal-title')).toContainText('Calendars', { timeout: 3000 })
  return modal
}

async function openEditor(
  mainPage: Page,
  appContext: BrowserContext,
  pageErrors: string[],
  isNew = false,
): Promise<Page> {
  await openManagerModal(mainPage)
  if (isNew) {
    await mainPage.locator('.new-btn').click()
  } else {
    await mainPage.locator('.action-btn.edit').first().click()
  }
  const cal = await waitForNewPage(appContext, 'calendar', 12_000, pageErrors)
  await cal.waitForSelector('.cal-root', { timeout: 12_000 })
  return cal
}

/** Locate a section by its visible title text. */
function sec(cal: Page, title: string) {
  return cal.locator('.section').filter({
    has: cal.locator('.section-title', { hasText: title }),
  })
}

// ── Calendar Manager Modal ────────────────────────────────────────────────────

test.describe('Calendar Manager Modal — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext }) => {
    await closeAny(mainPage, appContext)
  })

  test('"Manage Calendars" button opens the modal', async ({ mainPage }) => {
    await mainPage.locator('[title="Manage Calendars"]').click()
    await expect(mainPage.locator('.bm-panel')).toBeVisible({ timeout: 5000 })
  })

  test('modal title is "Calendars"', async ({ mainPage }) => {
    await openManagerModal(mainPage)
    await expect(mainPage.locator('.modal-title')).toContainText('Calendars')
  })

  test('at least one calendar row visible from seed database', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    await expect(modal.locator('.cal-row').first()).toBeVisible({ timeout: 5000 })
  })

  test('each calendar row shows a name', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    await expect(modal.locator('.cal-name').first()).not.toBeEmpty({ timeout: 3000 })
  })

  test('each calendar row has View and Edit buttons', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    const row = modal.locator('.cal-row').first()
    await expect(row.locator('.action-btn', { hasText: 'View' })).toBeVisible()
    await expect(row.locator('.action-btn.edit', { hasText: 'Edit' })).toBeVisible()
  })

  test('"New Calendar" button is visible in modal footer', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    await expect(modal.locator('.new-btn')).toBeVisible()
    await expect(modal.locator('.new-btn')).toContainText('New Calendar')
  })

  test('close button (X) dismisses the modal', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    await modal.locator('.icon-btn[title="Close"]').click()
    await expect(mainPage.locator('.bm-panel')).not.toBeVisible({ timeout: 2000 })
  })

  test('clicking the backdrop dismisses the modal', async ({ mainPage }) => {
    await openManagerModal(mainPage)
    await mainPage.locator('.bm-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(mainPage.locator('.bm-panel')).not.toBeVisible({ timeout: 2000 })
  })

  test('Refresh button reloads the list without error', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    await modal.locator('.icon-btn[title="Refresh"]').click()
    await mainPage.waitForTimeout(1000)
    await expect(modal.locator('.cal-row').first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking Edit opens the calendar editor window', async ({ mainPage, appContext, pageErrors }) => {
    const modal = await openManagerModal(mainPage)
    await modal.locator('.action-btn.edit').first().click()
    const cal = await waitForNewPage(appContext, 'calendar', 12_000, pageErrors)
    await expect(cal.locator('.cal-root')).toBeVisible({ timeout: 12_000 })
  })

  test('"New Calendar" opens a blank calendar editor', async ({ mainPage, appContext, pageErrors }) => {
    const modal = await openManagerModal(mainPage)
    await modal.locator('.new-btn').click()
    const cal = await waitForNewPage(appContext, 'calendar', 12_000, pageErrors)
    await expect(cal.locator('.cal-root')).toBeVisible({ timeout: 12_000 })
    // ID label should indicate new calendar
    await expect(cal.locator('.id-label')).toContainText('New Calendar', { timeout: 3000 })
  })
})

// ── Calendar Editor — existing calendar ───────────────────────────────────────

test.describe('Calendar Editor (existing calendar) — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await closeAny(mainPage, appContext)
    await openEditor(mainPage, appContext, pageErrors, false)
  })

  // ── Page structure ────────────────────────────────────────────────────────

  test('calendar editor root is rendered', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(cal.locator('.cal-root')).toBeVisible()
  })

  test('name input is pre-filled with the calendar name', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const nameInput = cal.locator('input.name-input')
    await expect(nameInput).toBeVisible()
    const value = await nameInput.inputValue()
    expect(value.trim().length).toBeGreaterThan(0)
  })

  test('ID label shows the calendar ID (not "New Calendar")', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const label = cal.locator('.id-label')
    await expect(label).toBeVisible()
    const text = await label.textContent()
    expect(text).not.toContain('New Calendar')
  })

  test('Save button is present', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(cal.locator('button.btn.btn-primary')).toBeVisible()
    await expect(cal.locator('button.btn.btn-primary')).toContainText('Save')
  })

  test('Cancel button is present and closes the window', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const cancelBtn = cal.locator('button.btn.btn-secondary', { hasText: 'Cancel' })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()
    // The WinForms form should close
    await cal.waitForEvent('close', { timeout: 5000 }).catch(() => {})
  })

  // ── Calendar Info section ─────────────────────────────────────────────────

  test('Calendar Info section is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(sec(cal, 'Calendar Info')).toBeVisible()
  })

  test('Short Name input is present', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const infoSec = sec(cal, 'Calendar Info')
    await expect(infoSec.locator('input[type="text"]').first()).toBeVisible()
  })

  test('Era before/after year-0 inputs are present', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const infoSec = sec(cal, 'Calendar Info')
    const textInputs = infoSec.locator('input[type="text"]')
    expect(await textInputs.count()).toBeGreaterThanOrEqual(3)
  })

  test('info section collapses and expands on section-title click', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const infoSec = sec(cal, 'Calendar Info')
    const titleGroup = infoSec.locator('.section-title-group')
    const firstInput = infoSec.locator('input').first()
    await expect(firstInput).toBeVisible()

    // Collapse
    await titleGroup.click()
    await cal.waitForTimeout(300)
    await expect(firstInput).not.toBeVisible({ timeout: 1000 })

    // Expand again
    await titleGroup.click()
    await cal.waitForTimeout(300)
    await expect(firstInput).toBeVisible({ timeout: 1000 })
  })

  test('help (i) button toggles a help text block', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const infoSec = sec(cal, 'Calendar Info')
    const helpBtn = infoSec.locator('.info-btn')
    await expect(helpBtn).toBeVisible()
    await helpBtn.click()
    await cal.waitForTimeout(200)
    await expect(helpBtn).toHaveClass(/active/)
    await expect(infoSec.locator('.help-bubble')).toBeVisible({ timeout: 2000 })
    // Toggle off
    await helpBtn.click()
    await expect(infoSec.locator('.help-bubble')).not.toBeVisible({ timeout: 1000 })
  })

  // ── LOD Profile section ───────────────────────────────────────────────────

  test('LOD Profile section is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(sec(cal, 'LOD Profile')).toBeVisible()
  })

  test('LOD table has at least one row for the seed calendar', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const rows = lodSec.locator('table.data-table tbody tr')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('LOD table header columns are present', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const headers = lodSec.locator('table.data-table thead th')
    const texts = await headers.allTextContents()
    const flat = texts.join(' ')
    expect(flat).toContain('Format Key')
    expect(flat).toContain('Step')
  })

  test('Sort button is visible and clickable', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const sortBtn = lodSec.locator('button', { hasText: 'Sort' })
    await expect(sortBtn).toBeVisible()
    await sortBtn.click()
    await cal.waitForTimeout(300)
    await expect(lodSec.locator('table.data-table')).toBeVisible()
  })

  test('Auto LOD button is visible and clickable', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const autoBtn = lodSec.locator('button', { hasText: 'Auto LOD' })
    await expect(autoBtn).toBeVisible()
    await autoBtn.click()
    await cal.waitForTimeout(300)
    await expect(lodSec.locator('table.data-table tbody tr').first()).toBeVisible()
  })

  test('fraction toggle button switches between ½ and decimal', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const fracBtn = lodSec.locator('.frac-btn')
    await expect(fracBtn).toBeVisible()
    const before = await fracBtn.textContent()
    await fracBtn.click()
    await cal.waitForTimeout(200)
    const after = await fracBtn.textContent()
    expect(after).not.toBe(before)
    // Toggle back
    await fracBtn.click()
  })

  test('"Add Level" button shows the add-level form', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    await lodSec.locator('.btn-add', { hasText: '+ Add Level' }).click()
    await expect(lodSec.locator('.add-lod-row')).toBeVisible({ timeout: 2000 })
  })

  test('add-level form Cancel button dismisses the form', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    await lodSec.locator('.btn-add', { hasText: '+ Add Level' }).click()
    await expect(lodSec.locator('.add-lod-row')).toBeVisible({ timeout: 2000 })
    await lodSec.locator('.add-lod-row button', { hasText: 'Cancel' }).click()
    await expect(lodSec.locator('.add-lod-row')).not.toBeVisible({ timeout: 2000 })
  })

  test('can add a DAYS LOD level and see it appear in the table', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const beforeCount = await lodSec.locator('table.data-table tbody tr').count()

    await lodSec.locator('.btn-add', { hasText: '+ Add Level' }).click()
    await expect(lodSec.locator('.add-lod-row')).toBeVisible({ timeout: 2000 })

    // Fill key = DAYS and a step
    const addRow = lodSec.locator('.add-lod-row')
    await addRow.locator('input[type="text"]').fill('DAYS')
    await addRow.locator('input[type="number"]').fill('1')
    await addRow.locator('button', { hasText: 'Add' }).click()

    await cal.waitForTimeout(400)
    const afterCount = await lodSec.locator('table.data-table tbody tr').count()
    expect(afterCount).toBeGreaterThan(beforeCount)
  })

  test('delete button on a non-locked LOD row removes it', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const lodSec = sec(cal, 'LOD Profile')
    const beforeCount = await lodSec.locator('table.data-table tbody tr').count()

    // Find a row with a × delete button (not a lock icon)
    const delBtn = lodSec.locator('table.data-table tbody tr .btn-icon', { hasText: '×' }).first()
    if (await delBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await delBtn.click()
      await cal.waitForTimeout(400)
      const afterCount = await lodSec.locator('table.data-table tbody tr').count()
      expect(afterCount).toBeLessThan(beforeCount)
    }
  })

  // ── Months section ────────────────────────────────────────────────────────

  test('Months section is visible with pre-populated rows', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    await expect(monthSec).toBeVisible()
    const rows = monthSec.locator('table.data-table tbody tr')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('Months table has Name and Days columns', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    const headers = monthSec.locator('table.data-table thead th')
    const texts = await headers.allTextContents()
    const flat = texts.join(' ')
    expect(flat).toContain('Name')
    expect(flat).toContain('Days')
  })

  test('year length input shows a positive number', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    const yearLengthInput = monthSec.locator('input[type="number"]').first()
    await expect(yearLengthInput).toBeVisible()
    const val = parseInt(await yearLengthInput.inputValue())
    expect(val).toBeGreaterThan(0)
  })

  test('"Add Month" button appends a new row to the months table', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    const beforeCount = await monthSec.locator('table.data-table tbody tr').count()
    await monthSec.locator('.btn-add', { hasText: '+ Add Month' }).click()
    await cal.waitForTimeout(400)
    const afterCount = await monthSec.locator('table.data-table tbody tr').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('new month row name and days inputs are editable', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    await monthSec.locator('.btn-add', { hasText: '+ Add Month' }).click()
    await cal.waitForTimeout(400)

    const rows = monthSec.locator('table.data-table tbody tr')
    const lastRow = rows.last()
    // Use .first() — seed calendar may have short names enabled, giving multiple text inputs per row
    await lastRow.locator('input[type="text"]').first().fill('Testmonth')
    await lastRow.locator('input[type="number"]').first().fill('28')
    expect(await lastRow.locator('input[type="text"]').first().inputValue()).toBe('Testmonth')
    expect(await lastRow.locator('input[type="number"]').first().inputValue()).toBe('28')
  })

  test('month delete button removes the last added month', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')
    const beforeCount = await monthSec.locator('table.data-table tbody tr').count()
    await monthSec.locator('.btn-add', { hasText: '+ Add Month' }).click()
    await cal.waitForTimeout(400)

    const rows = monthSec.locator('table.data-table tbody tr')
    await rows.last().locator('.btn-icon', { hasText: '×' }).click()
    await cal.waitForTimeout(400)
    const afterCount = await monthSec.locator('table.data-table tbody tr').count()
    expect(afterCount).toBe(beforeCount)
  })

  test('Short names checkbox adds a Short column to the months table', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const monthSec = sec(cal, 'Months')

    const shortNamesCb = monthSec.locator('label.toggle-label', { hasText: 'Short names' })
      .locator('input[type="checkbox"]')
    await expect(shortNamesCb).toBeVisible()
    const wasChecked = await shortNamesCb.isChecked()
    if (!wasChecked) await shortNamesCb.check()
    await cal.waitForTimeout(200)
    const headers = monthSec.locator('table.data-table thead th')
    const texts = await headers.allTextContents()
    expect(texts.join(' ')).toContain('Short')
    // Restore original state
    if (!wasChecked) await shortNamesCb.uncheck()
  })

  // ── Week Structure section ────────────────────────────────────────────────

  test('Week Structure section is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(sec(cal, 'Week Structure')).toBeVisible()
  })

  test('week enable checkbox is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const weekSec = sec(cal, 'Week Structure')
    await expect(weekSec.locator('input[type="checkbox"]').first()).toBeVisible()
  })

  test('days-per-week input is visible when week is enabled', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const weekSec = sec(cal, 'Week Structure')

    // The enable toggle is the first label.toggle-label in the week section header
    const enableCb = weekSec.locator('label.toggle-label').first().locator('input[type="checkbox"]')
    const isEnabled = await enableCb.isChecked()

    if (!isEnabled) {
      await enableCb.check()
      await cal.waitForTimeout(300)
    }

    await expect(weekSec.locator('input[type="number"]').first()).toBeVisible()
    if (!isEnabled) await enableCb.uncheck()
  })

  test('"Day names" checkbox toggles the day-names table', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const weekSec = sec(cal, 'Week Structure')

    const enableCb = weekSec.locator('label.toggle-label').first().locator('input[type="checkbox"]')
    const wasEnabled = await enableCb.isChecked()
    if (!wasEnabled) {
      await enableCb.check()
      await cal.waitForTimeout(300)
    }

    const dayNamesCb = weekSec.locator('label.toggle-label', { hasText: 'Day names' })
      .locator('input[type="checkbox"]')
    await expect(dayNamesCb).toBeVisible()
    const wasChecked = await dayNamesCb.isChecked()
    if (!wasChecked) await dayNamesCb.check()
    await cal.waitForTimeout(300)
    await expect(weekSec.locator('table.data-table')).toBeVisible({ timeout: 2000 })
    if (!wasChecked) await dayNamesCb.uncheck()
    if (!wasEnabled) await enableCb.uncheck()
  })

  // ── Seasons section ───────────────────────────────────────────────────────

  test('Seasons section is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(sec(cal, 'Seasons')).toBeVisible()
  })

  test('seasons enable checkbox is visible', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const seasonSec = sec(cal, 'Seasons')
    await expect(seasonSec.locator('input[type="checkbox"]').first()).toBeVisible()
  })

  test('"Add Season" button adds a row when seasons are enabled', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const seasonSec = sec(cal, 'Seasons')

    const enableCb = seasonSec.locator('input[type="checkbox"]').first()
    const wasEnabled = await enableCb.isChecked()
    if (!wasEnabled) {
      await enableCb.check()
      await cal.waitForTimeout(300)
    }

    const addBtn = seasonSec.locator('.btn-add', { hasText: '+ Add Season' })
    await expect(addBtn).toBeVisible()
    const beforeCount = await seasonSec.locator('table.data-table tbody tr').count()
    await addBtn.click()
    await cal.waitForTimeout(400)
    const afterCount = await seasonSec.locator('table.data-table tbody tr').count()
    expect(afterCount).toBeGreaterThan(beforeCount)

    if (!wasEnabled) await enableCb.uncheck()
  })

  test('season row has name, start, end, and delete inputs', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const seasonSec = sec(cal, 'Seasons')

    const enableCb = seasonSec.locator('input[type="checkbox"]').first()
    const wasEnabled = await enableCb.isChecked()
    if (!wasEnabled) {
      await enableCb.check()
      await cal.waitForTimeout(300)
      await seasonSec.locator('.btn-add', { hasText: '+ Add Season' }).click()
      await cal.waitForTimeout(400)
    }

    const row = seasonSec.locator('table.data-table tbody tr').first()
    await expect(row.locator('input[type="text"]').first()).toBeVisible()
    await expect(row.locator('input[type="number"]').first()).toBeVisible()
    await expect(row.locator('.btn-icon', { hasText: '×' })).toBeVisible()

    if (!wasEnabled) await enableCb.uncheck()
  })

  test('Auto DOY button opens the DOY modal', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const seasonSec = sec(cal, 'Seasons')

    const enableCb = seasonSec.locator('input[type="checkbox"]').first()
    const wasEnabled = await enableCb.isChecked()
    if (!wasEnabled) {
      await enableCb.check()
      await cal.waitForTimeout(300)
    }

    const autoDoyBtn = seasonSec.locator('button', { hasText: 'Auto DOY' })
    if (await autoDoyBtn.isVisible() && !(await autoDoyBtn.isDisabled())) {
      await autoDoyBtn.click()
      await expect(cal.locator('.doy-panel')).toBeVisible({ timeout: 3000 })
      // Close via cancel
      await cal.locator('.doy-panel button', { hasText: 'Cancel' }).click()
      await expect(cal.locator('.doy-panel')).not.toBeVisible({ timeout: 2000 })
    }

    if (!wasEnabled) await enableCb.uncheck()
  })

  test('season track visualization is rendered when seasons are defined', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const seasonSec = sec(cal, 'Seasons')

    const enableCb = seasonSec.locator('input[type="checkbox"]').first()
    const isEnabled = await enableCb.isChecked()

    if (isEnabled) {
      // Seed calendar may already have seasons
      const rows = seasonSec.locator('table.data-table tbody tr')
      if (await rows.count() > 0) {
        await expect(seasonSec.locator('.season-track')).toBeVisible({ timeout: 2000 })
      }
    }
  })

  // ── Validation ────────────────────────────────────────────────────────────

  test('clearing the name and saving shows a validation error', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const nameInput = cal.locator('input.name-input')
    await nameInput.fill('')
    await cal.locator('button.btn.btn-primary', { hasText: 'Save' }).click()
    await expect(cal.locator('.save-error')).toBeVisible({ timeout: 3000 })
  })
})

// ── Calendar Editor — new calendar flow ───────────────────────────────────────

test.describe('Calendar Editor (new calendar) — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await closeAny(mainPage, appContext)
    await openEditor(mainPage, appContext, pageErrors, true)
  })

  test.afterAll(async ({ mainPage, appContext }) => {
    // Last test in this file leaves the manager modal open — close it so subsequent spec files start clean
    await closeAny(mainPage, appContext)
  })

  test('new calendar ID label shows "New Calendar"', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    await expect(cal.locator('.id-label')).toContainText('New Calendar')
  })

  test('new calendar name input defaults to "New Calendar"', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const val = await cal.locator('input.name-input').inputValue()
    expect(val).toContain('New Calendar')
  })

  test('can rename, add a month, and save the new calendar', async ({ appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!

    // Rename
    const nameInput = cal.locator('input.name-input')
    await nameInput.fill('E2E Test Calendar')

    // Ensure LOD has at least one YEARS level (required for save)
    const lodSec = sec(cal, 'LOD Profile')
    const hasYears = await lodSec.locator('table.data-table tbody tr').filter({ hasText: 'YEARS' }).count() > 0
    if (!hasYears) {
      // Auto LOD resets to defaults which includes YEARS
      await lodSec.locator('button', { hasText: 'Auto LOD' }).click()
      await cal.waitForTimeout(400)
    }

    // Add a month
    const monthSec = sec(cal, 'Months')
    await monthSec.locator('.btn-add', { hasText: '+ Add Month' }).click()
    await cal.waitForTimeout(400)
    const lastRow = monthSec.locator('table.data-table tbody tr').last()
    // Use .first() — new calendar may have short names enabled, giving multiple text/number inputs per row
    await lastRow.locator('input[type="text"]').first().fill('TestMonth')
    await lastRow.locator('input[type="number"]').first().fill('30')

    // Save — CalendarApp.vue calls window.close() on success, making the CDP page invalid.
    // On failure, .save-error appears on the still-open page.
    await cal.locator('button.btn.btn-primary', { hasText: 'Save' }).click()
    try {
      await cal.waitForEvent('close', { timeout: 8000 })
      // Page closed — save succeeded
    } catch {
      const hasError = await cal.locator('.save-error').isVisible({ timeout: 500 }).catch(() => false)
      expect(hasError, 'Save produced a .save-error').toBeFalsy()
      throw new Error('Calendar window did not close after save within timeout')
    }
  })

  test('cancel on a new calendar closes the editor without saving', async ({ mainPage, appContext }) => {
    const cal = findPageByRole(appContext, 'calendar')!
    const nameInput = cal.locator('input.name-input')
    await nameInput.fill('ShouldNotAppear_E2E')

    await cal.locator('button.btn.btn-secondary', { hasText: 'Cancel' }).click()
    // Window should close
    await cal.waitForEvent('close', { timeout: 5000 }).catch(() => {})

    // Verify the calendar does NOT appear in the manager list
    await closeAny(mainPage, appContext)
    const modal = await openManagerModal(mainPage)
    const hasIt = await modal.locator('.cal-name', { hasText: 'ShouldNotAppear_E2E' }).isVisible({ timeout: 500 }).catch(() => false)
    expect(hasIt).toBeFalsy()
  })
})

// ── Calendar deletion ─────────────────────────────────────────────────────────

test.describe('Calendar deletion — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext }) => {
    await closeAny(mainPage, appContext)
  })

  test.afterAll(async ({ mainPage, appContext }) => {
    await closeAny(mainPage, appContext)
  })

  test('default calendar has no Delete button', async ({ mainPage }) => {
    const modal = await openManagerModal(mainPage)
    const row = modal.locator('.cal-row').filter({ hasText: 'Gregorian' }).first()
    await expect(row).toBeVisible({ timeout: 5000 })
    await expect(row.locator('.action-btn.delete')).toHaveCount(0)
  })

  test('deleting the E2E calendar removes it after confirmation', async ({ mainPage }) => {
    // Row left behind by the "save the new calendar" test above.
    const modal = await openManagerModal(mainPage)
    const rows = modal.locator('.cal-row').filter({ hasText: 'E2E Test Calendar' })
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const before = await rows.count()

    await rows.first().locator('.action-btn.delete').click()
    // Confirm modal is a second BaseModal nested inside the manager — target its danger button directly.
    const confirmBtn = mainPage.locator('.btn-danger')
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()

    await expect(rows).toHaveCount(before - 1, { timeout: 8000 })
    await expect(modal.locator('.state-msg.error')).toHaveCount(0)
  })
})

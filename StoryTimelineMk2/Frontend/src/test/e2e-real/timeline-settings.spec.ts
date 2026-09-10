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

/** Open the settings modal on the already-open timeline page. */
async function openSettingsModal(tl: Page) {
  await tl.locator('.header-icon-btn[title="Settings"]').click()
  await expect(tl.locator('.modal-panel')).toBeVisible({ timeout: 5000 })
}

test.describe('Timeline settings modal — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimeline(mainPage, appContext, pageErrors)
  })

  // ── Open / close ──────────────────────────────────────────────────────────

  test('settings button is visible in timeline header', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('.header-icon-btn[title="Settings"]')).toBeVisible()
  })

  test('clicking settings button opens the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await tl.locator('.header-icon-btn[title="Settings"]').click()
    await expect(tl.locator('.modal-panel')).toBeVisible({ timeout: 5000 })
  })

  test('settings modal header contains "Settings"', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await expect(tl.locator('.modal-header')).toContainText('Settings')
  })

  test('close button (X) dismisses the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.locator('.modal-panel .close-btn').click()
    await expect(tl.locator('.modal-panel')).not.toBeVisible({ timeout: 3000 })
  })

  test('Escape key closes the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.modal-panel')).not.toBeVisible({ timeout: 3000 })
  })

  test('clicking the backdrop closes the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(tl.locator('.modal-panel')).not.toBeVisible({ timeout: 3000 })
  })

  // ── Modal content ─────────────────────────────────────────────────────────

  test('settings modal contains a search bar', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await expect(tl.locator('.search-input')).toBeVisible()
  })

  test('modal body has at least one section title', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await expect(tl.locator('.modal-body')).toBeVisible()
    await expect(tl.locator('.section-title').first()).toBeVisible()
  })

  test('search bar highlights matching settings', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const searchInput = tl.locator('.search-input')
    await searchInput.fill('font')
    await tl.waitForTimeout(400)
    await expect(tl.locator('.search-hl').first()).toBeVisible({ timeout: 2000 })
  })

  test('clearing search bar removes all highlights', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const searchInput = tl.locator('.search-input')
    await searchInput.fill('font')
    await tl.waitForTimeout(400)
    await searchInput.fill('')
    await tl.waitForTimeout(400)
    expect(await tl.locator('.search-hl').count()).toBe(0)
  })

  test('modal body is scrollable without crashing', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const body = tl.locator('.modal-body')
    await body.evaluate(el => { el.scrollTop = el.scrollHeight })
    await tl.waitForTimeout(300)
    await expect(tl.locator('.modal-panel')).toBeVisible()
  })

  test('at least one select element exists (layout preset)', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const selects = tl.locator('.modal-body select')
    expect(await selects.count()).toBeGreaterThan(0)
  })

  test('color pickers are present in the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const colorInputs = tl.locator('.modal-body input[type="color"]')
    expect(await colorInputs.count()).toBeGreaterThan(0)
  })

  test('toggle switches are present in the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    // Settings uses button.toggle (custom toggle-switch), not input[type="checkbox"]
    const toggles = tl.locator('.modal-body button.toggle')
    expect(await toggles.count()).toBeGreaterThan(0)
  })

  test('number inputs are present in the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    const numInputs = tl.locator('.modal-body input[type="number"]')
    expect(await numInputs.count()).toBeGreaterThan(0)
  })

  test('can open modal, search "color", and highlights appear', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.locator('.search-input').fill('color')
    await tl.waitForTimeout(400)
    await expect(tl.locator('.search-hl').first()).toBeVisible({ timeout: 2000 })
  })
})

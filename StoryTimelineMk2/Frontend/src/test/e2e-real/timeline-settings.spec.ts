import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/** Open the settings modal on the already-open timeline page. */
async function openSettingsModal(tl: Page) {
  await tl.locator('.strip-btn--settings').click()
  await expect(tl.locator('.bm-panel')).toBeVisible({ timeout: 5000 })
}

test.describe('Timeline settings modal — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  // ── Open / close ──────────────────────────────────────────────────────────

  test('settings button is visible in activity strip', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('.strip-btn--settings')).toBeVisible()
  })

  test('clicking settings button opens the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await tl.locator('.strip-btn--settings').click()
    await expect(tl.locator('.bm-panel')).toBeVisible({ timeout: 5000 })
  })

  test('settings modal header contains "Settings"', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await expect(tl.locator('.bm-header')).toContainText('Settings')
  })

  test('close button (X) dismisses the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.locator('.bm-panel .bm-close').click()
    await expect(tl.locator('.bm-panel')).not.toBeVisible({ timeout: 3000 })
  })

  test('Escape key closes the settings modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).not.toBeVisible({ timeout: 3000 })
  })

  test('clicking the backdrop closes the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await tl.locator('.bm-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(tl.locator('.bm-panel')).not.toBeVisible({ timeout: 3000 })
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
    await expect(tl.locator('.bm-panel')).toBeVisible()
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

// ── BL-86: the tabs, the opacity sliders and the guard on unsaved settings ────────────────────

/** A section heading inside the settings body, by the words on it. */
const heading = (tl: Page, text: string) => tl.locator('.modal-body .section-title', { hasText: text })
/** The settings panel itself — with the discard dialog up there are two `.bm-panel`s. */
const settingsPanel = (tl: Page) => tl.locator('.bm-panel').first()
const discardAsk    = (tl: Page) => tl.locator('.bm-panel', { hasText: 'Discard changes?' })
/** Scoped to the panel: the notes panel behind the modal has a `.tab-bar` of its own. */
const settingsTabs  = (tl: Page) => settingsPanel(tl).locator('.tab-bar .tab-btn')

/** Put an exact number on a slider through its right-click field — a drag cannot hit one. */
async function setSlider(tl: Page, slider: ReturnType<Page['locator']>, value: string) {
  await slider.click({ button: 'right' })
  const box = tl.locator('.slider-entry')
  await expect(box).toBeVisible({ timeout: 3000 })
  await box.fill(value)
  await box.press('Enter')
  await expect(box).toHaveCount(0)
  await expect(slider).toHaveValue(value)
}

test.describe('Timeline settings — tabs, sliders and the unsaved guard', () => {
  const TABS = ['General', 'Canvas', 'Overlays', 'Panels']

  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test('the four tabs each show their own half of the settings', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)

    const tabs = settingsTabs(tl)
    await expect(tabs).toHaveCount(4)
    for (const [i, name] of TABS.entries()) await expect(tabs.nth(i)).toHaveText(name)

    // It opens on General, and every other tab swaps the body rather than adding to it.
    await expect(heading(tl, 'Navigation')).toBeVisible()
    await expect(heading(tl, 'Layout Preset')).toBeHidden()

    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveClass(/active/)
    await expect(heading(tl, 'Layout Preset')).toBeVisible()
    await expect(heading(tl, 'Navigation')).toBeHidden()

    await tabs.nth(2).click()
    await expect(heading(tl, 'Calendar Bands')).toBeVisible()

    await tabs.nth(3).click()
    await expect(heading(tl, 'Gallery Panel')).toBeVisible()

    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
  })

  test('a search reaches a setting that lives on another tab', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)

    await tl.locator('.search-input').fill('Gallery')
    // Searching shows every tab's sections at once instead of jumping between them:
    // still on General, and the Panels-tab heading is rendered and marked.
    await expect(heading(tl, 'Gallery Panel')).toHaveClass(/search-hl/, { timeout: 3000 })
    await expect(heading(tl, 'Gallery Panel')).toBeVisible()
    await expect(settingsTabs(tl).first()).toHaveClass(/active/)

    // Esc is a shortcut, and shortcuts stay out of the way while a field has the caret.
    await tl.locator('.search-input').blur()
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
  })

  test('an opacity slider runs the whole 0-255 channel', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await settingsTabs(tl).nth(1).click()

    const slider = tl.locator('.modal-body .s-slider').first()
    await expect(slider).toBeVisible()
    await expect(slider).toHaveAttribute('min', '0')
    await expect(slider).toHaveAttribute('max', '255')

    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
  })

  test('right-clicking a slider types an exact value into it, and Escape there cancels', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await settingsTabs(tl).nth(1).click()

    const slider = tl.locator('.modal-body .s-slider').first()
    await setSlider(tl, slider, '128')

    // A second pass, cancelled, leaves the committed value alone — and the modal behind it open.
    await slider.click({ button: 'right' })
    const box = tl.locator('.slider-entry')
    await expect(box).toBeVisible({ timeout: 3000 })
    await box.fill('10')
    await box.press('Escape')
    await expect(box).toHaveCount(0)
    await expect(slider).toHaveValue('128')
    await expect(settingsPanel(tl)).toBeVisible()

    // The panel is dirty now, so leaving it asks first.
    await tl.keyboard.press('Escape')
    await expect(discardAsk(tl)).toBeVisible({ timeout: 3000 })
    await discardAsk(tl).locator('[data-primary]').click()
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
  })

  test('a touched setting is not lost to the X, and Keep editing keeps it', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openSettingsModal(tl)
    await settingsTabs(tl).nth(1).click()

    const slider = tl.locator('.modal-body .s-slider').first()
    await setSlider(tl, slider, '99')

    await settingsPanel(tl).locator('.bm-close').click()
    await expect(discardAsk(tl)).toBeVisible({ timeout: 3000 })
    await discardAsk(tl).locator('[data-cancel]').click()
    await expect(discardAsk(tl)).toHaveCount(0)
    await expect(slider).toHaveValue('99')

    // Cancel asks the same question, and Discard is what finally closes it.
    await tl.locator('.btn-cancel[data-cancel]').click()
    await expect(discardAsk(tl)).toBeVisible({ timeout: 3000 })
    await discardAsk(tl).locator('[data-primary]').click()
    await expect(tl.locator('.bm-panel')).toHaveCount(0)

    // Nothing was saved, so reopening shows the stored value rather than the abandoned one.
    await openSettingsModal(tl)
    await settingsTabs(tl).nth(1).click()
    await expect(tl.locator('.modal-body .s-slider').first()).not.toHaveValue('99')
    await tl.keyboard.press('Escape')
  })
})

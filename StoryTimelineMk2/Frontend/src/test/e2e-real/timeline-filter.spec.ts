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

/**
 * Toggle the filter panel open (idempotent — if already open, does nothing).
 * filterPanelOpen is persisted to the DB so its state carries across fresh page loads.
 */
async function openFilterPanel(tl: Page) {
  const panel = tl.locator('.filter-panel')
  if (await panel.isVisible({ timeout: 500 }).catch(() => false)) return
  await tl.locator('.strip-btn--filter').click()
  await expect(panel).toBeVisible({ timeout: 3000 })
}

/** Ensure the filter panel is closed (idempotent). */
async function closeFilterPanel(tl: Page) {
  const panel = tl.locator('.filter-panel')
  if (!await panel.isVisible({ timeout: 500 }).catch(() => false)) return
  await tl.locator('.strip-btn--filter').click()
  await expect(panel).not.toBeVisible({ timeout: 3000 })
}

/** Open filter panel then setup modal (assumes timeline page already open). */
async function openFilterSetup(tl: Page) {
  await openFilterPanel(tl)
  await tl.locator('.fp-icon-btn[title="Filter setup"]').click()
  await expect(tl.locator('.fsetup-modal')).toBeVisible({ timeout: 3000 })
}

/** Add a keyword rule via the already-open setup modal. */
async function addKeywordRule(tl: Page, keyword: string) {
  const kwBlock = tl.locator('.add-block', { hasText: 'Keyword' })
  await kwBlock.locator('.fs-input').fill(keyword)
  await kwBlock.locator('.add-btn').click()
  await expect(tl.locator('.rule-row', { hasText: keyword })).toBeVisible({ timeout: 3000 })
}

/** Delete all visible rules from the already-open setup modal. */
async function deleteAllRules(tl: Page) {
  const delBtns = tl.locator('.rule-del')
  while (await delBtns.count() > 0) {
    await delBtns.first().click()
    await tl.waitForTimeout(200)
  }
}

/**
 * Delete every rule via the setup modal, then close it.
 * The chip X button only DEACTIVATES a rule (sets it neutral) and is only
 * rendered on active chips — actual rule deletion lives in the setup modal.
 */
async function cleanupRules(tl: Page) {
  await openFilterSetup(tl)
  await deleteAllRules(tl)
  await tl.locator('.fsetup-close').click()
}

test.describe('Timeline filter panel — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimeline(mainPage, appContext, pageErrors)
    // filterPanelOpen is persisted to the DB, so it carries across fresh page loads.
    // Ensure the panel starts closed so every test begins from a known state.
    const tl = findPageByRole(appContext, 'timeline')!
    await closeFilterPanel(tl)
  })

  // ── Panel visibility ─────────────────────────────────────────────────────

  test('filter panel toggle button is present in activity strip', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('.strip-btn--filter')).toBeVisible()
  })

  test('clicking the toggle shows the filter panel', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    // beforeEach guarantees panel starts closed; one click opens it
    await tl.locator('.strip-btn--filter').click()
    await expect(tl.locator('.filter-panel')).toBeVisible({ timeout: 3000 })
    await closeFilterPanel(tl)
  })

  test('clicking the toggle twice hides the filter panel again', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    // beforeEach guarantees panel starts closed
    const btn = tl.locator('.strip-btn--filter')
    const panel = tl.locator('.filter-panel')
    await btn.click()
    await expect(panel).toBeVisible({ timeout: 3000 })
    await btn.click()
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })

  test('filter panel contains gear and floppy buttons', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterPanel(tl)
    const panel = tl.locator('.filter-panel')
    await expect(panel.locator('.fp-icon-btn[title="Filter setup"]')).toBeVisible()
    await expect(panel.locator('.fp-icon-btn[title="Save current filter as preset"]')).toBeVisible()
  })

  // ── Filter setup modal ────────────────────────────────────────────────────

  test('filter setup button opens the setup modal with correct title', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await expect(tl.locator('.fsetup-title')).toContainText('Filter Setup')
  })

  test('setup modal close button dismisses the modal', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await tl.locator('.fsetup-close').click()
    await expect(tl.locator('.fsetup-modal')).not.toBeVisible({ timeout: 2000 })
  })

  test('setup modal shows "Add new rules" section with add-blocks', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await expect(tl.locator('.add-block').first()).toBeVisible()
    await expect(tl.locator('.add-block', { hasText: 'Item Type' })).toBeVisible()
    await expect(tl.locator('.add-block', { hasText: 'Keyword' })).toBeVisible()
  })

  test('empty state shown when no rules are defined', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await deleteAllRules(tl)
    await expect(tl.locator('.fsetup-empty')).toBeVisible({ timeout: 2000 })
  })

  // ── Adding rules ──────────────────────────────────────────────────────────

  test('can add a keyword filter rule and see it in the active rules list', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'e2eKeyword')
    await expect(tl.locator('.rule-label')).toContainText('e2eKeyword')
    await deleteAllRules(tl)
  })

  test('can add an item-type filter rule', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await tl.locator('.add-block', { hasText: 'Item Type' }).locator('.add-btn').click()
    await expect(tl.locator('.rule-row').first()).toBeVisible({ timeout: 3000 })
    await deleteAllRules(tl)
  })

  test('can delete a rule from the active rules list', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'toDelete')
    await tl.locator('.rule-del').first().click()
    await expect(tl.locator('.rule-row', { hasText: 'toDelete' })).not.toBeVisible({ timeout: 2000 })
  })

  // ── Filter chips ──────────────────────────────────────────────────────────

  test('a rule creates a chip in the filter panel', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'chipTestWord')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')
    await expect(panel.locator('.filter-chip')).toBeVisible({ timeout: 3000 })
    await expect(panel.locator('.chip-label')).toContainText('chipTestWord')

    // Clean up (deletion happens in the setup modal — the chip X only deactivates)
    await cleanupRules(tl)
    await expect(panel.locator('.filter-chip', { hasText: 'chipTestWord' })).not.toBeVisible({ timeout: 2000 })
  })

  test('chip X button deactivates an active chip without deleting the rule', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'deactivateMe')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')
    const chip = panel.locator('.filter-chip', { hasText: 'deactivateMe' })
    await expect(chip).toBeVisible({ timeout: 3000 })

    // Neutral chip: no X button rendered
    await expect(chip.locator('.chip-remove')).not.toBeVisible()

    // Activate → X appears
    await chip.locator('.chip-body').click()
    await expect(chip).toHaveClass(/chip--positive/)
    await expect(chip.locator('.chip-remove')).toBeVisible()

    // X deactivates back to neutral — the chip itself STAYS (rule not deleted)
    await chip.locator('.chip-remove').click()
    await expect(chip).not.toHaveClass(/chip--positive/)
    await expect(chip).toBeVisible()
    await expect(chip.locator('.chip-remove')).not.toBeVisible()

    // Clean up
    await cleanupRules(tl)
  })

  test('clicking a chip cycles its state: neutral → positive → negative → neutral', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'cycleTest')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')
    const chip = panel.locator('.filter-chip', { hasText: 'cycleTest' })
    await expect(chip).toBeVisible({ timeout: 3000 })

    // Cycle clicks land on .chip-body — the X button is a separate element
    const body = chip.locator('.chip-body')

    // Neutral → positive
    await expect(chip).not.toHaveClass(/chip--positive/)
    await expect(chip).not.toHaveClass(/chip--negative/)
    await body.click()
    await expect(chip).toHaveClass(/chip--positive/)

    // Positive → negative
    await body.click()
    await expect(chip).toHaveClass(/chip--negative/)

    // Negative → neutral
    await body.click()
    await expect(chip).not.toHaveClass(/chip--positive/)
    await expect(chip).not.toHaveClass(/chip--negative/)

    // Clean up
    await cleanupRules(tl)
  })

  test('clear active filters button resets active chip states', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'clearTest1')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')
    const chip = panel.locator('.filter-chip', { hasText: 'clearTest1' })
    await expect(chip).toBeVisible({ timeout: 3000 })

    // Activate the chip
    await chip.locator('.chip-body').click()
    await expect(chip).toHaveClass(/chip--positive/)

    // Clear all active filters
    const clearBtn = panel.locator('.fp-icon-btn.fp-icon-btn--clear')
    await expect(clearBtn).toBeVisible({ timeout: 2000 })
    await clearBtn.click()

    // Chip returns to neutral
    await expect(chip).not.toHaveClass(/chip--positive/)
    await expect(chip).not.toHaveClass(/chip--negative/)

    // Clean up
    await cleanupRules(tl)
  })

  test('AND/OR toggle appears when two chips are both positive', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'andOrA')
    await addKeywordRule(tl, 'andOrB')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')
    const chipA = panel.locator('.filter-chip', { hasText: 'andOrA' })
    const chipB = panel.locator('.filter-chip', { hasText: 'andOrB' })
    await expect(chipA).toBeVisible({ timeout: 3000 })
    await expect(chipB).toBeVisible({ timeout: 3000 })

    // Activate both chips
    await chipA.locator('.chip-body').click()
    await chipB.locator('.chip-body').click()

    // AND/OR toggle should now appear
    const toggle = panel.locator('.and-toggle')
    await expect(toggle).toBeVisible({ timeout: 2000 })

    // Click the toggle to change mode
    const before = await toggle.textContent()
    await toggle.click()
    const after = await toggle.textContent()
    expect(before).not.toEqual(after)

    // Clean up
    await cleanupRules(tl)
  })

  // ── Preset save / load ────────────────────────────────────────────────────

  test('floppy button opens preset dropdown with name input', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterPanel(tl)
    const panel = tl.locator('.filter-panel')
    await panel.locator('.fp-icon-btn[title="Save current filter as preset"]').click()
    await expect(panel.locator('.preset-dropdown')).toBeVisible({ timeout: 2000 })
    await expect(panel.locator('.preset-name-input')).toBeVisible()
    await expect(panel.locator('.preset-save-btn')).toBeVisible()
  })

  test('can save and then delete a filter preset', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFilterSetup(tl)
    await addKeywordRule(tl, 'presetRule')
    await tl.locator('.fsetup-close').click()

    const panel = tl.locator('.filter-panel')

    // Open preset dropdown
    await panel.locator('.fp-icon-btn[title="Save current filter as preset"]').click()
    await expect(panel.locator('.preset-dropdown')).toBeVisible({ timeout: 2000 })

    // Save a preset
    const presetName = 'E2E Preset'
    await panel.locator('.preset-name-input').fill(presetName)
    await panel.locator('.preset-save-btn').click()
    await tl.waitForTimeout(1000)

    // Open dropdown again and verify preset row appears
    await panel.locator('.fp-icon-btn[title="Save current filter as preset"]').click()
    await expect(panel.locator('.preset-dropdown')).toBeVisible({ timeout: 2000 })
    const presetRow = panel.locator('.preset-row', { hasText: presetName })
    await expect(presetRow).toBeVisible({ timeout: 3000 })

    // Delete the preset
    await presetRow.locator('.preset-del-btn').click()
    await expect(presetRow).not.toBeVisible({ timeout: 2000 })

    // Clean up rule (deletion lives in the setup modal, not the chip X)
    await tl.keyboard.press('Escape')
    await tl.waitForTimeout(300)
    await cleanupRules(tl)
  })
})

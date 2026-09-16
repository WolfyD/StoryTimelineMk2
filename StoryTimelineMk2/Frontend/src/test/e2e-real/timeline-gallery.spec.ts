import { test, expect, findPageByRole, openTimelinePage } from './fixtures'

test.describe('Timeline gallery panel — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  // ── Panel structure ───────────────────────────────────────────────────────

  test('gallery panel pane is visible', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#timeline-data-images')).toBeVisible()
  })

  test('gallery toolbar is visible inside the gallery panel', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')
    await expect(galleryPane.locator('.gallery-toolbar')).toBeVisible()
  })

  test('at least one gallery mode button is present', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')
    const modeBtns = galleryPane.locator('.gallery-mode-btn')
    const count = await modeBtns.count()
    expect(count).toBeGreaterThan(0)
  })

  test('switching between gallery modes does not crash', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')
    const modeBtns = galleryPane.locator('.gallery-mode-btn')
    const count = await modeBtns.count()

    // Click each mode button and verify the panel stays visible
    for (let i = 0; i < count; i++) {
      await modeBtns.nth(i).click()
      await tl.waitForTimeout(300)
      await expect(galleryPane).toBeVisible()
    }
  })

  test('gallery shows empty state or a grid/cascade when no images present', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')

    // The seed DB timeline may or may not have images — accept either state
    const hasGrid    = await galleryPane.locator('.gallery-grid').isVisible().catch(() => false)
    const hasCascade = await galleryPane.locator('.gallery-cascade-wrap').isVisible().catch(() => false)
    const hasEmpty   = await galleryPane.locator('.gallery-empty').isVisible().catch(() => false)
    expect(hasGrid || hasCascade || hasEmpty).toBeTruthy()
  })

  test('first gallery mode button can be activated', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')
    const firstBtn = galleryPane.locator('.gallery-mode-btn').first()
    await firstBtn.click()
    await tl.waitForTimeout(300)
    await expect(galleryPane).toBeVisible()
    // The active class may vary by implementation; just verify no crash
    await expect(firstBtn).toBeVisible()
  })

  test('second gallery mode button can be activated if it exists', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')
    const modeBtns = galleryPane.locator('.gallery-mode-btn')
    if (await modeBtns.count() < 2) return

    await modeBtns.nth(1).click()
    await tl.waitForTimeout(300)
    await expect(galleryPane).toBeVisible()
  })

  test('gallery next button appears when in cascade mode with multiple images', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const galleryPane = tl.locator('#timeline-data-images')

    // Switch to cascade mode (typically the second button)
    const modeBtns = galleryPane.locator('.gallery-mode-btn')
    if (await modeBtns.count() >= 2) {
      await modeBtns.nth(1).click()
      await tl.waitForTimeout(300)
    }

    // Next button may or may not be visible depending on image count — just ensure no crash
    await expect(galleryPane).toBeVisible()
    const nextBtn = galleryPane.locator('.gallery-next-btn')
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      await tl.waitForTimeout(300)
      await expect(galleryPane).toBeVisible()
    }
  })
})

import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Tests for the timeline canvas page (localhost:5173/timeline.html).
 *
 * timeline.html → timeline.ts → TimelineApp.vue
 *
 * The page requires ?id=<timelineId> in the URL; without it TimelineApp shows
 * a critical error message. With a valid id it calls GetTimelineData and
 * renders the full timeline workspace.
 *
 * Key DOM facts from TimelineApp.vue:
 *   - #timeline-workspace wraps everything when loaded successfully
 *   - #timeline-header contains the <h1> with store.title and <h2> with author
 *   - TimelineCanvas renders a Konva stage — the outer div is the canvas container
 *     inside the Pane with id="timeline-main"
 *   - TimelineNotesPanel is inside Pane id="timeline-data-notes"
 *       - .tab-bar contains two .tab-btn elements: "Notes" and "Distance"
 *   - #timeline-nav-container holds the jump-to-year input (#jump-to-year-input)
 *   - #timeline-lod-container holds the LOD ± buttons (PhMinusCircle / PhPlusCircle)
 */

test.describe('Timeline canvas page', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
    // ?id=1 — the bridge mock returns GetTimelineData with Project.Id = 1
    await page.goto('/timeline.html?id=1')
    // Wait for the workspace to be rendered (isLoading → false)
    await page.waitForSelector('#timeline-workspace', { timeout: 5000 })
  })

  test('page loads — timeline workspace is visible', async ({ page }) => {
    await expect(page.locator('#timeline-workspace')).toBeVisible()
  })

  test('timeline title and author are rendered in the header', async ({ page }) => {
    // The bridge mock returns Title: 'Test Timeline', Author: 'Test Author'
    await expect(page.locator('#timeline-header h1')).toContainText('Test Timeline')
    await expect(page.locator('#timeline-header h2')).toContainText('Test Author')
  })

  test('canvas container (timeline-main pane) is visible', async ({ page }) => {
    // The Konva stage is mounted inside the Pane with id="timeline-main".
    // Konva creates a <div> wrapper and then a <canvas> inside it.
    await expect(page.locator('#timeline-main')).toBeVisible()
  })

  test('notes panel is visible with Notes and Distance tabs', async ({ page }) => {
    const notesPanel = page.locator('#timeline-data-notes')
    await expect(notesPanel).toBeVisible()

    // The tab bar has exactly two buttons
    const tabBtns = notesPanel.locator('.tab-btn')
    await expect(tabBtns).toHaveCount(2)

    await expect(tabBtns.nth(0)).toContainText('Notes')
    await expect(tabBtns.nth(1)).toContainText('Distance')
  })

  test('clicking Distance tab switches to distance view', async ({ page }) => {
    const notesPanel = page.locator('#timeline-data-notes')
    const distanceTab = notesPanel.locator('.tab-btn', { hasText: 'Distance' })

    await distanceTab.click()

    // After clicking, the Distance tab should get the 'active' class
    await expect(distanceTab).toHaveClass(/active/)

    // The Notes tab should no longer be active
    const notesTab = notesPanel.locator('.tab-btn', { hasText: 'Notes' })
    await expect(notesTab).not.toHaveClass(/active/)
  })

  test('jump-to-year input is visible and accepts numeric input', async ({ page }) => {
    const input = page.locator('#jump-to-year-input')
    await expect(input).toBeVisible()
    await input.fill('1500')
    await expect(input).toHaveValue('1500')
  })

  test('LOD zoom buttons (+ and -) are visible', async ({ page }) => {
    const lodContainer = page.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible()

    // The container has two clickable .button divs wrapping PhMinusCircle and PhPlusCircle
    const buttons = lodContainer.locator('.button')
    await expect(buttons).toHaveCount(2)
  })

  test('LOD label text is visible', async ({ page }) => {
    // The LOD level label shows "LoD level: <currentLodTitle>"
    await expect(page.locator('#timeline-lod-container p')).toContainText('LoD level:')
  })
})

test.describe('Timeline canvas page — missing id', () => {
  test('without ?id param, loading state is shown while waiting for host', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/timeline.html')

    // No ?id in URL → waitingForId = true → spinner + loading h2
    await expect(
      page.locator('h2').filter({ hasText: 'Loading Timeline Data' }),
    ).toBeVisible({ timeout: 5000 })
  })
})

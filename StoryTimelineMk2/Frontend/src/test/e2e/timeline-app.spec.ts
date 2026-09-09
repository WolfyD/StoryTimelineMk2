import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Tests for the main app page (localhost:5173/).
 *
 * This page is driven by App.vue which renders:
 *   - A <SplashTitle> with "Story Timeline" h1
 *   - A <ProjectContainer> showing the project list
 *   - A bottom menu with import/export icons, a gear (app settings), and a
 *     new-project expand button
 *   - A jump-to-year input (inside timeline.html, not this page — but the
 *     bottom menu has the new-project input here)
 */

test.describe('Main app page — project list', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
  })

  test('page loads — "Story Timeline" heading is visible', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Story Timeline')
  })

  test('project list renders the mocked timeline title', async ({ page }) => {
    // The bridge mock returns a GetAllTimelines response with Title: 'Test Timeline'.
    // App.vue calls HandleGetTimelines() on load, which populates store.projects,
    // rendered by ProjectContainer as .project-timeline-row elements.
    await expect(page.locator('.project-timeline-row')).toContainText('Test Timeline', { timeout: 5000 })
  })

  test('new-project button is visible', async ({ page }) => {
    // The PhPlusCircle icon is inside #new-project-open-button which lives
    // inside #new-project-container.
    await expect(page.locator('#new-project-container')).toBeVisible()
  })

  test('clicking new-project button opens the project setup panel', async ({ page }) => {
    // The container expands (gets class "open") and shows the text input.
    const container = page.locator('#new-project-container')
    await container.locator('#new-project-open-button').click()
    await expect(container).toHaveClass(/open/)
    await expect(page.locator('#new-project-title')).toBeVisible()
  })

  test('new-project name input accepts text', async ({ page }) => {
    // Expand first, then type.
    const container = page.locator('#new-project-container')
    await container.locator('#new-project-open-button').click()
    await expect(page.locator('#new-project-title')).toBeVisible()
    await page.locator('#new-project-title').fill('My Great Story')
    await expect(page.locator('#new-project-title')).toHaveValue('My Great Story')
  })

  test('app settings gear icon is visible', async ({ page }) => {
    // The PhGear button sits inside #import-export-container.
    await expect(page.locator('#import-export-container')).toBeVisible()
  })
})

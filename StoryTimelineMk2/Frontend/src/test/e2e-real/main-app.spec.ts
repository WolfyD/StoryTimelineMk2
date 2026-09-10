import { test, expect, waitForNewPage } from './fixtures'

test.describe('Main app — project list', () => {
  test('page loads and shows the app heading', async ({ mainPage }) => {
    await expect(mainPage.locator('h1')).toContainText('Story Timeline', { timeout: 8000 })
  })

  test('project list shows at least one timeline from the seed database', async ({ mainPage }) => {
    await expect(mainPage.locator('.project-timeline-row').first()).toBeVisible({ timeout: 8000 })
  })

  test('create a new timeline via the UI', async ({ mainPage }) => {
    await mainPage.evaluate(() => localStorage.setItem('lastAuthor', 'E2E Test Author'))

    await mainPage.locator('#new-project-open-button').click()
    await expect(mainPage.locator('#new-project-title')).toBeVisible()

    const name = `E2E Timeline ${Date.now()}`
    await mainPage.locator('#new-project-title').fill(name)
    await mainPage.locator('#start-project-button').click()

    await expect(mainPage.locator('.project-timeline-row', { hasText: name })).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Main app — opening a timeline', () => {
  test('clicking a timeline row opens the timeline window', async ({ mainPage, appContext, pageErrors }) => {
    const firstRow = mainPage.locator('.project-timeline-row-container').first()
    await expect(firstRow).toBeVisible({ timeout: 8000 })
    await firstRow.click()

    const timelinePage = await waitForNewPage(appContext, 'timeline', 10_000, pageErrors)
    await timelinePage.waitForSelector('#timeline-workspace', { timeout: 10_000 })

    await expect(timelinePage.locator('#timeline-workspace')).toBeVisible()
    await expect(timelinePage.locator('#timeline-header h1')).not.toBeEmpty()
  })
})

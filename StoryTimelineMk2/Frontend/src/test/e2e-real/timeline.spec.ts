import { test, expect, findPageByRole, openTimelinePage } from './fixtures'

test.describe('Timeline canvas — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test('timeline workspace and header are rendered', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
    await expect(tl.locator('#timeline-header h1')).not.toBeEmpty()
  })

  test('canvas container is present', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#timeline-main')).toBeVisible()
    await expect(tl.locator('#timeline-main canvas').first()).toBeVisible()
  })

  test('notes and distance tabs are present', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    await expect(panel).toBeVisible()
    const tabs = panel.locator('.tab-btn')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toContainText('Notes')
    await expect(tabs.nth(1)).toContainText('Distance')
  })

  test('jump-to-year input accepts a value', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const input = tl.locator('#jump-to-year-input')
    await expect(input).toBeVisible()
    await input.fill('500')
    await input.press('Enter')
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })

  test('LOD buttons are present and clickable', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const lodContainer = tl.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible()

    const buttons = lodContainer.locator('.button')
    await expect(buttons).toHaveCount(2)

    await buttons.nth(1).click()
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })

  test('clicking Distance tab switches to distance view', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const distTab = panel.locator('.tab-btn', { hasText: 'Distance' })
    await distTab.click()
    await expect(distTab).toHaveClass(/active/)
  })
})

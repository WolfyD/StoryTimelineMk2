import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The Help / About corner of the activity strip: the flyout that replaced the lone About button,
 * the licence list the AGPL switch called for, and the handbook behind F1.
 */
async function openFlyout(tl: Page) {
  await tl.locator('.strip-btn--about').click()
  await expect(tl.locator('.help-flyout')).toBeVisible({ timeout: 5000 })
}

test.describe('Help and About — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test('the strip corner opens a flyout with Help, Shortcuts and About', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFlyout(tl)

    const items = tl.locator('.help-flyout .flyout-item')
    await expect(items).toHaveCount(3)
    for (const [i, label] of ['Help', 'Shortcuts', 'About'].entries()) {
      await expect(items.nth(i)).toContainText(label)
    }

    // The backdrop behind it is what closes it again, without opening anything.
    await tl.locator('.help-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(tl.locator('.help-flyout')).toHaveCount(0)
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('About has a Licenses tab naming the AGPL and what the app is built on', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFlyout(tl)
    await tl.locator('.flyout-item', { hasText: 'About' }).click()

    const panel = tl.locator('.bm-panel')
    await expect(panel.locator('.modal-title')).toHaveText('About')
    await expect(panel.locator('.about-name')).toContainText('Story Timeline')

    await panel.locator('.tab-btn', { hasText: 'Licenses' }).click()
    await expect(panel.locator('.lic-body')).toBeVisible()
    await expect(panel.locator('.lic-lead').first()).toContainText('GNU Affero General Public License v3')

    // Grouped by where the dependency runs, one row per name and its terms.
    expect(await panel.locator('.lic-group').count()).toBeGreaterThan(1)
    const konva = panel.locator('.lic-row', { hasText: 'Konva' }).first()
    await expect(konva.locator('.lic-name')).toContainText('Konva')
    await expect(konva.locator('.lic-type')).toHaveText('MIT')

    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('Help opens from the flyout and from F1, and covers the newer windows', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFlyout(tl)
    await tl.locator('.flyout-item', { hasText: 'Help' }).click()

    const panel = tl.locator('.bm-panel')
    await expect(panel.locator('.bm-title')).toHaveText('Help')
    const body = panel.locator('.help-body')
    for (const section of ['Characters', 'The Relations window', 'Reference timelines']) {
      await expect(body.locator('h2', { hasText: section }).first()).toBeVisible()
    }

    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)

    // F1 is the same handbook without going through the corner.
    await tl.keyboard.press('F1')
    await expect(tl.locator('.bm-panel .bm-title')).toHaveText('Help', { timeout: 5000 })
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('Shortcuts opens its own list from the flyout', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openFlyout(tl)
    await tl.locator('.flyout-item', { hasText: 'Shortcuts' }).click()

    const panel = tl.locator('.bm-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // F1 and F2 are fixed, so the list it prints always has them in it.
    await expect(panel).toContainText('F1')
    await expect(panel).toContainText('F2')

    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
})

import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/** Open the Reference picker (BL-66) on the already-open timeline page. */
async function openReferenceModal(tl: Page) {
  await tl.locator('.strip-btn--reference').click()
  await expect(tl.locator('.bm-panel')).toContainText('Reference timeline', { timeout: 3000 })
}

test.describe('Reference timeline underlay — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test('R opens the picker listing the other timeline with both actions', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await tl.keyboard.press('r')
    await expect(tl.locator('.bm-panel')).toContainText('Reference timeline', { timeout: 3000 })
    const rows = tl.locator('.rt-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('E2E Second Timeline')
    await expect(rows.first().locator('.rt-under')).toBeVisible()
    await expect(rows.first().locator('.rt-open')).toBeVisible()
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
  })

  test('underneath: strip lights up, data panel gets a Reference section, shift moves items into range, view-only modal, Remove clears', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await openReferenceModal(tl)
    await tl.locator('.rt-row .rt-under').first().click()
    await expect(tl.locator('.bm-panel')).toHaveCount(0, { timeout: 5000 })
    await expect(tl.locator('.strip-btn--reference')).toHaveClass(/strip-btn--tool-active/)

    // Reading pane: own section; the second timeline's only item sits at year 100, out of range at year 0
    const refHead = tl.locator('.data-ref-head')
    await expect(refHead).toContainText('Reference — E2E Second Timeline')
    await expect(tl.locator('.data-ref-empty')).toBeVisible()

    // Shift by -100 years (display only) → "Second Founding" lands on year 0
    await openReferenceModal(tl)
    await expect(tl.locator('.rt-active-title')).toContainText('Underneath: E2E Second Timeline')
    await expect(tl.locator('.rt-warn')).toHaveCount(0)            // same (default) calendar → no warning
    await tl.locator('.rt-shift input').fill('-100')
    await tl.keyboard.press('Escape')                                       // BL-39: first Esc only leaves the field
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.bm-panel')).toHaveCount(0)
    await expect(tl.locator('.data-ref-shift')).toContainText('shifted -100 years')
    const refItem = tl.locator('.data-ref-item', { hasText: 'Second Founding' })
    await expect(refItem).toBeVisible()

    // View → the read-only modal on the reference timeline, no Edit button
    await refItem.hover()                                                   // the View button is hover-revealed
    await refItem.locator('.data-item-focus-btn').click()
    const modal = tl.locator('.view-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(modal.locator('.vm-title')).toContainText('Second Founding')
    await expect(modal.locator('.vm-type-badge')).toContainText('reference')
    await expect(modal.locator('.vm-footer')).toHaveCount(0)
    await tl.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)

    // Remove
    await openReferenceModal(tl)
    await tl.locator('.rt-remove').click()
    await expect(tl.locator('.rt-active')).toHaveCount(0)
    await tl.keyboard.press('Escape')
    await expect(tl.locator('.strip-btn--reference')).not.toHaveClass(/strip-btn--tool-active/)
    await expect(tl.locator('.data-ref-head')).toHaveCount(0)

    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
})

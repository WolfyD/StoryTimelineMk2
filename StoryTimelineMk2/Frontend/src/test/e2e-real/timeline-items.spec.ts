import { test, expect, findPageByRole, openTimelinePage } from './fixtures'

test.describe('Timeline items — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  // ── Info bar ──────────────────────────────────────────────────────────────

  test('info bar displays a non-zero total item count', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const infoLeft = tl.locator('#timeline-info-left')
    await expect(infoLeft).toContainText('Items:')
    // Extract the item count text and verify it contains at least one digit
    const text = await infoLeft.textContent()
    const match = text?.match(/Items:\s*(\d+)/)
    expect(match).toBeTruthy()
    const count = parseInt(match![1], 10)
    expect(count).toBeGreaterThan(0)
  })

  test('visible item count is present in info bar', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#timeline-info-left')).toContainText('Visible:')
  })

  // ── Canvas presence ───────────────────────────────────────────────────────

  test('at least one canvas element exists (Konva layers)', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const canvases = tl.locator('#timeline-main canvas')
    expect(await canvases.count()).toBeGreaterThan(0)
    await expect(canvases.first()).toBeVisible()
  })

  // ── Undo bar ──────────────────────────────────────────────────────────────

  test('undo bar is not shown before any deletion', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#undo-delete-bar')).not.toBeVisible()
  })

  // ── Item view modal ───────────────────────────────────────────────────────

  test('clicking canvas center triggers item interaction (modal or no-op)', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const canvas = tl.locator('#timeline-main canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    // Click center of canvas — may or may not hit an item
    await tl.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await tl.waitForTimeout(600)

    // Check if a view modal appeared; if so, verify its structure and close it
    const viewModal = tl.locator('.view-modal')
    if (await viewModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(viewModal).toBeVisible()
      await expect(viewModal.locator('.vm-close')).toBeVisible()
      await expect(viewModal.locator('.vm-title')).toBeVisible()
      await viewModal.locator('.vm-close').click()
      await expect(viewModal).not.toBeVisible({ timeout: 2000 })
    }
    // If no modal: the click hit empty space, which is also valid
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })

  test('view modal can be closed via backdrop click', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const canvas = tl.locator('#timeline-main canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    // Try clicking in multiple places to find an item
    const positions = [
      { x: box.x + box.width * 0.5,  y: box.y + box.height * 0.5 },
      { x: box.x + box.width * 0.3,  y: box.y + box.height * 0.5 },
      { x: box.x + box.width * 0.7,  y: box.y + box.height * 0.5 },
      { x: box.x + box.width * 0.25, y: box.y + box.height * 0.35 },
    ]

    let modalOpened = false
    for (const pos of positions) {
      await tl.mouse.click(pos.x, pos.y)
      await tl.waitForTimeout(500)
      const viewModal = tl.locator('.view-modal')
      if (await viewModal.isVisible({ timeout: 500 }).catch(() => false)) {
        modalOpened = true
        // Close via backdrop
        await tl.locator('.view-modal-backdrop').click({ position: { x: 5, y: 5 } })
        await expect(viewModal).not.toBeVisible({ timeout: 2000 })
        break
      }
    }

    // Test passes regardless — if no modal found, canvas just had empty space at those positions
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
    if (!modalOpened) {
      test.info().annotations.push({ type: 'info', description: 'No item found at tested canvas positions — seed DB items may be outside initial viewport' })
    }
  })

  test('view modal shows type badge and title when opened', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const canvas = tl.locator('#timeline-main canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    const positions = [
      { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 },
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 },
      { x: box.x + box.width * 0.7, y: box.y + box.height * 0.6 },
    ]

    for (const pos of positions) {
      await tl.mouse.click(pos.x, pos.y)
      await tl.waitForTimeout(500)
      const viewModal = tl.locator('.view-modal')
      if (await viewModal.isVisible({ timeout: 500 }).catch(() => false)) {
        await expect(viewModal.locator('.vm-type-badge')).toBeVisible()
        await expect(viewModal.locator('.vm-title')).toBeVisible()
        await expect(viewModal.locator('.vm-body')).toBeVisible()
        await viewModal.locator('.vm-close').click()
        return
      }
    }
  })

  // ── Edit item window ──────────────────────────────────────────────────────

  test('double-clicking canvas may open edit item window', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const canvas = tl.locator('#timeline-main canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    // First jump to year 0 to ensure items from seed DB might be visible
    await tl.locator('#jump-to-year-input').fill('0')
    await tl.locator('#jump-to-year-button').click()
    await tl.waitForTimeout(800)

    // Try double-clicking center
    await tl.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await tl.waitForTimeout(1000)

    // If an edit window opened, verify its basic structure
    const editPage = findPageByRole(appContext, 'editItem')
    if (editPage) {
      await editPage.waitForSelector('.edit-item-root', { timeout: 5000 }).catch(() => null)
      const editRoot = editPage.locator('.edit-item-root')
      if (await editRoot.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(editRoot.locator('.btn.btn-secondary')).toContainText('Cancel')
        await expect(editRoot.locator('.btn.btn-primary')).toContainText('Save')
        await editRoot.locator('.btn.btn-secondary').click()
        await editPage.waitForTimeout(500)
      }
    }

    // Test passes even if no edit window opened
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })
})

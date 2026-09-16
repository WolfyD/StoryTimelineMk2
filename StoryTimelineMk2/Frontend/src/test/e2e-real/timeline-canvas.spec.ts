import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/** Read the "Current year: N" text and return N as a number. */
async function getCurrentYear(tl: Page): Promise<number> {
  const text = await tl.locator('#timeline-info p').first().textContent() ?? ''
  const match = text.match(/-?\d+(\.\d+)?/)
  return match ? parseFloat(match[0]) : 0
}

/** Get the bounding box of the Konva canvas element. */
async function getCanvasBBox(tl: Page) {
  return tl.locator('#timeline-workspace canvas').first().boundingBox()
}

test.describe('Timeline canvas interactions — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  // ── Long drag ─────────────────────────────────────────────────────────────

  test('long left-drag pans the timeline (current year increases)', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const startX = bbox.x + bbox.width * 0.75
    const endX   = bbox.x + bbox.width * 0.1
    const y      = bbox.y + bbox.height / 2

    const yearBefore = await getCurrentYear(tl)

    await tl.mouse.move(startX, y)
    await tl.mouse.down()
    // Move in small steps so the dragmove threshold is crossed
    for (let x = startX; x > endX; x -= 20) {
      await tl.mouse.move(x, y)
    }
    await tl.mouse.up()
    await tl.waitForTimeout(300)

    const yearAfter = await getCurrentYear(tl)
    // Dragging left pans the view rightward — future years come into view
    expect(yearAfter).toBeGreaterThan(yearBefore)

    // No uncaught errors from the drag
    expect(pageErrors).toHaveLength(0)
    // Canvas still rendered
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('long right-drag pans the timeline (current year decreases)', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const startX = bbox.x + bbox.width * 0.25
    const endX   = bbox.x + bbox.width * 0.9
    const y      = bbox.y + bbox.height / 2

    const yearBefore = await getCurrentYear(tl)

    await tl.mouse.move(startX, y)
    await tl.mouse.down()
    for (let x = startX; x < endX; x += 20) {
      await tl.mouse.move(x, y)
    }
    await tl.mouse.up()
    await tl.waitForTimeout(300)

    const yearAfter = await getCurrentYear(tl)
    // Dragging right pans the view leftward — past years come into view
    expect(yearAfter).toBeLessThan(yearBefore)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('drag-left then drag-right returns to approximately the same position', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const y       = bbox.y + bbox.height / 2
    const centerX = bbox.x + bbox.width / 2
    const dragPx  = 300

    const yearBefore = await getCurrentYear(tl)

    // Drag left
    await tl.mouse.move(centerX + dragPx / 2, y)
    await tl.mouse.down()
    for (let x = centerX + dragPx / 2; x > centerX - dragPx / 2; x -= 20) {
      await tl.mouse.move(x, y)
    }
    await tl.mouse.up()
    await tl.waitForTimeout(200)

    // Drag right (same distance back)
    await tl.mouse.move(centerX - dragPx / 2, y)
    await tl.mouse.down()
    for (let x = centerX - dragPx / 2; x < centerX + dragPx / 2; x += 20) {
      await tl.mouse.move(x, y)
    }
    await tl.mouse.up()
    await tl.waitForTimeout(300)

    const yearAfter = await getCurrentYear(tl)
    // Should be within 2 years of the starting position
    expect(Math.abs(yearAfter - yearBefore)).toBeLessThan(3)
  })

  test('canvas remains stable after a very long drag sequence', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const y = bbox.y + bbox.height / 2

    // 5 back-and-forth sweeps across the full canvas width
    for (let pass = 0; pass < 5; pass++) {
      const from = pass % 2 === 0
        ? bbox.x + bbox.width * 0.9
        : bbox.x + bbox.width * 0.1
      const to = pass % 2 === 0
        ? bbox.x + bbox.width * 0.1
        : bbox.x + bbox.width * 0.9

      await tl.mouse.move(from, y)
      await tl.mouse.down()
      const step = from < to ? 25 : -25
      for (let x = from; step > 0 ? x < to : x > to; x += step) {
        await tl.mouse.move(x, y)
      }
      await tl.mouse.up()
      await tl.waitForTimeout(150)
    }

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })

  // ── Mouse wheel scrolling ─────────────────────────────────────────────────

  test('mouse wheel down (positive deltaY) pans the timeline backward', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    const yearBefore = await getCurrentYear(tl)

    await tl.mouse.move(cx, cy)
    // Wheel with positive deltaY scrolls backward in time (previous tick)
    await tl.mouse.wheel(0, 120)
    await tl.waitForTimeout(300)

    const yearAfter = await getCurrentYear(tl)
    expect(yearAfter).toBeLessThanOrEqual(yearBefore)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('mouse wheel up (negative deltaY) pans the timeline forward', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    const yearBefore = await getCurrentYear(tl)

    await tl.mouse.move(cx, cy)
    await tl.mouse.wheel(0, -120)
    await tl.waitForTimeout(300)

    const yearAfter = await getCurrentYear(tl)
    expect(yearAfter).toBeGreaterThanOrEqual(yearBefore)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('repeated wheel scrolling in one direction moves the position cumulatively', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    await tl.mouse.move(cx, cy)
    const yearBefore = await getCurrentYear(tl)

    // 10 wheel-down events to move backward through multiple ticks
    for (let i = 0; i < 10; i++) {
      await tl.mouse.wheel(0, 120)
      await tl.waitForTimeout(100)
    }

    const yearAfter = await getCurrentYear(tl)
    expect(yearAfter).toBeLessThan(yearBefore)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('canvas is stable after many wheel events', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    await tl.mouse.move(cx, cy)

    // 20 wheel events alternating direction
    for (let i = 0; i < 20; i++) {
      await tl.mouse.wheel(0, i % 2 === 0 ? 120 : -120)
      await tl.waitForTimeout(80)
    }

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
    await expect(tl.locator('#timeline-workspace')).toBeVisible()
  })

  // ── LOD level controls ────────────────────────────────────────────────────

  test('LOD zoom-in button changes the LOD level text', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const lodContainer = tl.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible({ timeout: 5000 })

    const lodText = lodContainer.locator('p')
    const before = await lodText.textContent()

    await lodContainer.locator('.button').last().click()
    await tl.waitForTimeout(300)

    const after = await lodText.textContent()
    expect(after).not.toBe(before)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })

  test('LOD zoom-out button changes the LOD level text', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const lodContainer = tl.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible({ timeout: 5000 })

    const lodText = lodContainer.locator('p')

    // Zoom in first so there is room to zoom out
    await lodContainer.locator('.button').last().click()
    await tl.waitForTimeout(200)

    const before = await lodText.textContent()
    await lodContainer.locator('.button').first().click()
    await tl.waitForTimeout(300)
    const after = await lodText.textContent()
    expect(after).not.toBe(before)

    expect(pageErrors).toHaveLength(0)
  })

  test('LOD zoom-in then zoom-out returns to the same LOD level', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const lodContainer = tl.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible({ timeout: 5000 })

    const lodText = lodContainer.locator('p')
    const initial = await lodText.textContent()

    await lodContainer.locator('.button').last().click()
    await tl.waitForTimeout(200)
    await lodContainer.locator('.button').first().click()
    await tl.waitForTimeout(300)

    const final = await lodText.textContent()
    expect(final).toBe(initial)
  })

  // ── Combined drag + LOD ───────────────────────────────────────────────────

  test('can drag after changing LOD level without crashing', async ({ appContext, pageErrors }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const lodContainer = tl.locator('#timeline-lod-container')
    await expect(lodContainer).toBeVisible({ timeout: 5000 })

    // Zoom in (finer LOD)
    await lodContainer.locator('.button').last().click()
    await tl.waitForTimeout(300)

    // Now do a long drag
    const bbox = await getCanvasBBox(tl)
    if (!bbox) throw new Error('Canvas not found')

    const y = bbox.y + bbox.height / 2
    await tl.mouse.move(bbox.x + bbox.width * 0.7, y)
    await tl.mouse.down()
    for (let x = bbox.x + bbox.width * 0.7; x > bbox.x + bbox.width * 0.2; x -= 20) {
      await tl.mouse.move(x, y)
    }
    await tl.mouse.up()
    await tl.waitForTimeout(300)

    expect(pageErrors).toHaveLength(0)
    await expect(tl.locator('#timeline-workspace canvas').first()).toBeVisible()
  })
})

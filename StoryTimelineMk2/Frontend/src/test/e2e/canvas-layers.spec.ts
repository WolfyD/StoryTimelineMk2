import { test, expect, type Page } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * The layer stack, checked against a real Chromium — because every claim `syncLayers` rests on is a
 * claim about Konva's internals, and a Konva upgrade is what would quietly break them:
 *
 *   - A layer holds two full-stage canvases and `visible(false)` frees neither, so a layer this
 *     window has no use for must be off the stage, not hidden. That is the layer *count*.
 *   - `Stage.add` appends the canvas to the DOM and `layer.zIndex()` renumbers children without
 *     touching it, so re-adding the whole stack in order is the only thing that stacks layers
 *     correctly. That is DOM order *matching* `stage.children` — the assertion that fails the day
 *     someone replaces the re-add with a `zIndex()` call.
 *
 * Neither is visible from a unit test: happy-dom has no 2d context, so there is no stage to count.
 */

type StageProbe = {
    getLayers(): { getNativeCanvasElement(): HTMLCanvasElement; find(s: string): unknown[] }[]
    container(): HTMLElement
}
async function openTimeline(page: Page, layout: Record<string, unknown> = {}) {
    await injectBridgeMock(page, { __layout: layout })
    await page.goto('/timeline.html?id=1')
    await page.waitForSelector('#timeline-workspace', { timeout: 10_000 })
    await page.waitForFunction(() => {
        const s = (window as unknown as { __timelineStage?: StageProbe }).__timelineStage
        return !!s && s.getLayers().some(l => l.find('.grid-label').length > 0)
    }, undefined, { timeout: 20_000 })
}

/** Layer positions, and where the grid sits among them, read off the live stage. */
const readStack = (page: Page) => page.evaluate(() => {
    const stage = (window as unknown as { __timelineStage: StageProbe }).__timelineStage
    const layers = stage.getLayers()
    // Konva drops every layer canvas into one .konvajs-content div, in append order.
    const dom = [...stage.container().querySelectorAll('canvas')]
    return {
        layers: layers.length,
        canvases: dom.length,
        domOrderMatches: layers.every((l, i) => dom[i] === l.getNativeCanvasElement()),
        gridIndex: layers.findIndex(l => l.find('.grid-label').length > 0),
    }
})

test.describe('canvas layers', () => {
    test('a plain timeline window carries four layers, not eight', async ({ page }) => {
        const warnings: string[] = []
        page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()) })
        await openTimeline(page)
        const { layers, canvases } = await readStack(page)
        // ui, grid, items, boundary overlay. The reference underlay, its age slits, the character
        // lifeline and the mini rail have no job in this window and are off the stage.
        expect(layers, 'parked layers are still mounted').toBe(4)
        expect(canvases, 'a parked layer left its canvas in the DOM').toBe(4)
        // The symptom that started this: Konva warns above five layers on a stage.
        expect(warnings.filter(w => w.includes('layers'))).toEqual([])
    })

    test('the canvases stand in the order their layers do', async ({ page }) => {
        await openTimeline(page)
        expect((await readStack(page)).domOrderMatches, 'DOM order drifted from layer order').toBe(true)
    })

    test('the mini rail trades places with the item layer rather than covering it', async ({ page }) => {
        await openTimeline(page)
        const full = await readStack(page)

        await page.keyboard.press('m')   // shortcuts.ts: M toggles mini mode
        // The data panes are the half of the page mini mode drops; when they are gone the prop has
        // reached the canvas and its watcher has run.
        await expect(page.locator('#timeline-data')).toBeHidden({ timeout: 10_000 })
        const mini = await readStack(page)

        expect(mini.layers, 'mini mode added a layer instead of trading one').toBe(full.layers)
        expect(mini.canvases).toBe(mini.layers)
        expect(mini.domOrderMatches, 'the swap left the canvases out of order').toBe(true)
        expect(mini.gridIndex, 'the grid layer went missing in mini mode').toBeGreaterThanOrEqual(0)
    })

    test('labels-on-top lifts the grid above the items, either way round', async ({ page }) => {
        await openTimeline(page, { TimelineTickMarkerTextAlwaysOnTop: false })
        const under = await readStack(page)

        await openTimeline(page, { TimelineTickMarkerTextAlwaysOnTop: true })
        const over = await readStack(page)

        expect(over.gridIndex, 'the setting did not move the grid layer').toBeGreaterThan(under.gridIndex)
        expect(over.domOrderMatches && under.domOrderMatches).toBe(true)
    })
})

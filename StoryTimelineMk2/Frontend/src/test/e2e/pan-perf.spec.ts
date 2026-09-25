import { test, expect, type Page } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * A stopwatch on the pan loop, not a test. `PERF=1 npx playwright test pan-perf` runs it; the normal
 * suite skips it, because a timing number on a shared machine is not something to fail a build over.
 *
 * What it times is the real thing: `applyPan` is called synchronously from a window `mousemove`
 * handler (`TimelineCanvas.vue`), so a burst of synthetic mousemoves inside one `evaluate` runs the
 * whole pan path — grid, items, dimming, overlays — N times back to back. Wall time over N is the
 * per-frame cost of a pan, and unlike an FPS reading it is not capped at the display's refresh rate:
 * at 60Hz a frame has 16.7ms, and a number well under that is headroom rather than a pass.
 *
 * Numbers are Chromium, not WebView2, and this machine, not another. They are for comparing a change
 * against the run before it — never for a threshold.
 */

const N = 60           // mousemoves per measurement
const WARMUP = 10       // discarded: first frames build the node cache the rest reuse

/** Enough items, spread over enough years, that lanes stack and the crowd checks do real work. */
function crowd(count: number, spanYears = 2000) {
    const items = []
    for (let i = 0; i < count; i++) {
        const year = Math.round((i / count) * spanYears)
        // Every fifth item is a period with real length, so the lane packer has bars to avoid.
        const isPeriod = i % 5 === 0
        const end = isPeriod ? year + Math.round(spanYears / count) * 3 : year
        items.push({
            Id: `perf-${i}`, Title: `Item number ${i} with a title long enough to measure`,
            Description: 'x', Content: 'x', StoryId: null,
            TypeId: isPeriod ? 2 : 1,
            Year: year, EndYear: end, AbsoluteStart: year, AbsoluteEnd: end,
            BookTitle: '', Chapter: '', Page: '', Color: '#4a90d9', CreationGranularity: 3,
            TimelineId: 1, ItemIndex: i, ShowInNotes: true, ShowTitle: true,
            Importance: 5, MinLodLevel: 0, LodVisibilityMask: 255,
        })
    }
    return items
}

async function openTimeline(page: Page, items: unknown[], layout: Record<string, unknown> = {}) {
    await injectBridgeMock(page, { __items: items, __layout: layout })
    await page.goto('/timeline.html?id=1')
    await page.waitForSelector('#timeline-workspace', { timeout: 10_000 })
    // The stage exists before the first item render finishes; wait for a real node on it.
    await page.waitForFunction(() => {
        const stage = (window as unknown as { __timelineStage?: { find(s: string): unknown[] } }).__timelineStage
        return !!stage && stage.find('.grid-label').length > 0
    }, undefined, { timeout: 20_000 })
}

/** Median and worst per-frame pan cost in ms, measured by driving the real drag handler. */
async function panCost(page: Page): Promise<{ median: number; p95: number; total: number }> {
    const box = (await page.locator('#timeline-main .konvajs-content').first().boundingBox({ timeout: 10_000 }))!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()

    const samples = await page.evaluate(({ n, warmup, startX, y }) => {
        const out: number[] = []
        let x = startX
        for (let i = 0; i < n + warmup; i++) {
            x += 7   // under DRIFT_THRESHOLD per step, so both branches of applyPan get exercised
            const t0 = performance.now()
            window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
            const dt = performance.now() - t0
            if (i >= warmup) out.push(dt)
        }
        return out
    }, { n: N, warmup: WARMUP, startX: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) })

    await page.mouse.up()
    const sorted = [...samples].sort((a, b) => a - b)
    return {
        median: sorted[Math.floor(sorted.length / 2)]!,
        p95: sorted[Math.floor(sorted.length * 0.95)]!,
        total: samples.reduce((a, b) => a + b, 0),
    }
}

test.describe('pan cost', () => {
    test.skip(!process.env.PERF, 'perf probe — run with PERF=1')
    test.setTimeout(240_000)

    for (const count of [1, 100, 400, 1000]) {
        test(`${count} items`, async ({ page }) => {
            await openTimeline(page, crowd(count))
            const plain = await panCost(page)
            console.log(`  ${String(count).padStart(4)} items  median ${plain.median.toFixed(2)}ms  p95 ${plain.p95.toFixed(2)}ms`)
            expect(plain.median).toBeGreaterThan(0)
        })
    }

    test('400 items, angled tick labels on', async ({ page }) => {
        await openTimeline(page, crowd(400), { TimelineTickMarkerTextAngled: true })
        const angled = await panCost(page)
        console.log(`   400 items angled  median ${angled.median.toFixed(2)}ms  p95 ${angled.p95.toFixed(2)}ms`)
        expect(angled.median).toBeGreaterThan(0)
    })

    test('400 items, calendar bands on', async ({ page }) => {
        await openTimeline(page, crowd(400), { TimelineCalendarOverlayEnabled: true })
        const bands = await panCost(page)
        console.log(`   400 items bands   median ${bands.median.toFixed(2)}ms  p95 ${bands.p95.toFixed(2)}ms`)
        expect(bands.median).toBeGreaterThan(0)
    })
})

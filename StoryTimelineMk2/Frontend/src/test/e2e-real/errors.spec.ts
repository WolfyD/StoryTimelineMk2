import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The global error nets (BL-18 FC-C1): a failure nothing caught is logged backend-side and then
 * told to the user, and the message names the log it went to. Every entry point installs these,
 * so the timeline page stands for all seven.
 *
 * These tests deliberately raise errors, so `pageErrors` is expected to fill up — the reporter
 * writes each one to the console on its way past. That is the point, not a leak.
 */
async function raiseAndRead(tl: Page, raise: () => Promise<void>): Promise<string> {
  const dialog = tl.waitForEvent('dialog', { timeout: 15_000 })
  await raise()
  const box = await dialog
  const message = box.message()
  await box.dismiss()   // nothing listens otherwise and Playwright would swallow it
  return message
}

test.describe('Uncaught failures — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test('a rejected promise nobody caught is shown, and names the error log', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!

    const message = await raiseAndRead(tl, async () => {
      await tl.evaluate(() => {
        void Promise.reject(new Error('e2e rejected promise'))
      })
    })

    expect(message).toContain('Something went wrong')
    expect(message).toContain('e2e rejected promise')
    // The round trip came back with somewhere to look — which also proves the backend logged it.
    expect(message).toContain('error log')
    expect(message).toMatch(/\.log|\.txt/)
  })

  test('a throw from outside Vue is caught by the window net too', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!

    const message = await raiseAndRead(tl, async () => {
      await tl.evaluate(() => {
        setTimeout(() => { throw new Error('e2e loose throw') })
      })
    })

    expect(message).toContain('Something went wrong')
    expect(message).toContain('e2e loose throw')
    expect(message).toContain('error log')
  })

  test('the same failure six times over is one message, not six', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    let dialogs = 0
    const count = (d: import('@playwright/test').Dialog) => { dialogs++; void d.dismiss() }
    tl.on('dialog', count)

    await tl.evaluate(() => {
      for (let i = 0; i < 6; i++) void Promise.reject(new Error('e2e storm'))
    })
    // Long enough for six round trips, well under the 5s dedupe window.
    await expect.poll(() => dialogs, { timeout: 4000 }).toBeGreaterThan(0)
    await tl.waitForTimeout(1500)
    tl.off('dialog', count)

    expect(dialogs, 'six identical failures should collapse into one alert').toBe(1)
  })
})

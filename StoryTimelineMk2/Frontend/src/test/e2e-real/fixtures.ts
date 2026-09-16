import { test as base, chromium, expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export const CDP_PORT = parseInt(process.env.STORYTIMELINE_REMOTE_DEBUG_PORT ?? '9222')
export const CDP_URL  = `http://localhost:${CDP_PORT}`

export type RealFixtures = {
  appBrowser: Browser
  appContext: BrowserContext
  mainPage: Page
  /** Console errors and uncaught page exceptions collected from all CDP pages during this test. */
  pageErrors: string[]
}

export const test = base.extend<RealFixtures>({
  appBrowser: [async ({}, use) => {
    const browser = await chromium.connectOverCDP(CDP_URL)
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],

  appContext: [async ({ appBrowser }, use) => {
    const ctx = appBrowser.contexts()[0]
    if (!ctx) throw new Error('CDP: no browser context found')
    await use(ctx)
  }, { scope: 'worker' }],

  // Test-scoped: fresh error bucket per test, auto-attaches to all open and future pages.
  pageErrors: async ({ appContext }, use) => {
    const errors: string[] = []

    const attachToPage = (page: Page) => {
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(`[console:error] ${msg.text()}`)
      })
      page.on('pageerror', err => {
        errors.push(`[uncaught] ${err.message}`)
      })
    }

    appContext.pages().forEach(attachToPage)
    appContext.on('page', attachToPage)

    await use(errors)

    appContext.off('page', attachToPage)
  },

  mainPage: async ({ appContext, pageErrors: _pe }, use) => {
    // _pe referenced only to ensure the listener is installed before the test body runs
    const page = findPageByRole(appContext, 'main')
    if (!page) throw new Error(`CDP: main page not found. URLs: ${appContext.pages().map(p => p.url()).join(', ')}`)
    await page.bringToFront()
    await use(page)
  },
})

export { expect }

// ─────────────────────────── helpers ────────────────────────────────────────

type PageRole = 'main' | 'timeline' | 'editItem' | 'calendar'

function matchesRole(p: Page, role: PageRole): boolean {
  const u = p.url()
  switch (role) {
    case 'main':     return !u.includes('timeline.html') && !u.includes('editItem.html') && !u.includes('calendar.html')
    case 'timeline': return u.includes('timeline.html')
    case 'editItem': return u.includes('editItem.html')
    case 'calendar': return u.includes('calendar.html')
  }
}

export function findPageByRole(ctx: BrowserContext, role: PageRole): Page | undefined {
  return ctx.pages().find(p => matchesRole(p, role))
}

/**
 * Wait for a page matching the given role to appear in the CDP context.
 * If it times out, any collected page errors are appended to the thrown message.
 */
export async function waitForNewPage(
  ctx: BrowserContext,
  role: PageRole,
  timeoutMs = 8000,
  errors?: string[],
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = ctx.pages().find(p => matchesRole(p, role))
    if (page) return page
    await new Promise(r => setTimeout(r, 150))
  }
  const errSuffix = errors?.length
    ? `\n\nPage errors collected during wait:\n  ${errors.join('\n  ')}`
    : ''
  throw new Error(`CDP: timed out waiting for ${role} page (${timeoutMs}ms)${errSuffix}`)
}

/**
 * Close any open timeline windows via the WinForms bridge, then open the first
 * timeline in the project list and wait for it to finish loading.
 *
 * Uses the WindowClose bridge action (proper WinForms close) instead of
 * window.close() which is a no-op in WebView2.
 */
export async function openTimelinePage(
  mainPage: Page,
  ctx: BrowserContext,
  pageErrors?: string[],
): Promise<Page> {
  const existingTimelines = ctx.pages().filter(p => p.url().includes('timeline.html'))
  for (const page of existingTimelines) {
    try {
      await page.evaluate(() => {
        window.chrome.webview.postMessage({ action: 'WindowClose', payload: null })
      })
      await page.waitForEvent('close', { timeout: 3000 }).catch(() => {})
    } catch {
      // page may already be closing or detached — ignore
    }
  }

  const firstRow = mainPage.locator('.project-timeline-row-container').first()
  await expect(firstRow).toBeVisible({ timeout: 8000 })
  await firstRow.click()

  const tl = await waitForNewPage(ctx, 'timeline', 10_000, pageErrors)
  await tl.waitForSelector('#timeline-workspace', { timeout: 10_000 })
  return tl
}

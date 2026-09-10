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

type PageRole = 'main' | 'timeline' | 'editItem' | 'settings' | 'calendar'

export function findPageByRole(ctx: BrowserContext, role: PageRole): Page | undefined {
  const pages = ctx.pages()
  switch (role) {
    case 'main':
      return pages.find(p => {
        const u = p.url()
        return !u.includes('timeline.html') &&
               !u.includes('editItem.html') &&
               !u.includes('settings.html') &&
               !u.includes('calendar.html')
      })
    case 'timeline':  return pages.find(p => p.url().includes('timeline.html'))
    case 'editItem':  return pages.find(p => p.url().includes('editItem.html'))
    case 'settings':  return pages.find(p => p.url().includes('settings.html'))
    case 'calendar':  return pages.find(p => p.url().includes('calendar.html'))
  }
}

/**
 * Wait for a new page matching the given role to appear in the CDP context.
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
    const page = findPageByRole(ctx, role)
    if (page) return page
    await new Promise(r => setTimeout(r, 150))
  }
  const errSuffix = errors?.length
    ? `\n\nPage errors collected during wait:\n  ${errors.join('\n  ')}`
    : ''
  throw new Error(`CDP: timed out waiting for ${role} page (${timeoutMs}ms)${errSuffix}`)
}

import { test as base, chromium, expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export const CDP_PORT = parseInt(process.env.STORYTIMELINE_REMOTE_DEBUG_PORT ?? '9222')
export const CDP_URL  = `http://localhost:${CDP_PORT}`

/** Worker-scoped: one CDP connection for the whole run, not one per test. */
export type RealWorkerFixtures = {
  appBrowser: Browser
  appContext: BrowserContext
}

export type RealFixtures = RealWorkerFixtures & {
  mainPage: Page
  /** Console errors and uncaught page exceptions collected from all CDP pages during this test. */
  pageErrors: string[]
}

export const test = base.extend<Omit<RealFixtures, keyof RealWorkerFixtures>, RealWorkerFixtures>({
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

type PageRole = 'main' | 'timeline' | 'editItem' | 'calendar' | 'characters' | 'relations'

function matchesRole(p: Page, role: PageRole): boolean {
  const u = p.url()
  switch (role) {
    case 'main': {
      // Pre-warmed windows sit on about:blank until shown — only the project list is "main".
      const path = u.startsWith('http') ? new URL(u).pathname : ''
      return path === '/' || path.endsWith('/index.html')
    }
    case 'timeline': return u.includes('timeline.html')
    case 'editItem': return u.includes('editItem.html')
    case 'calendar': return u.includes('calendar.html')
    case 'characters': return u.includes('characters.html')
    case 'relations': return u.includes('relations.html')
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
        window.chrome!.webview!.postMessage({ action: 'WindowClose', payload: null })
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

/** Close a window the WinForms way — window.close() is a no-op in WebView2. */
export async function closeWindow(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.chrome!.webview!.postMessage({ action: 'WindowClose', payload: null })
    })
    await page.waitForEvent('close', { timeout: 3000 }).catch(() => {})
  } catch {
    // already closing or detached
  }
}

/**
 * Open the Characters window from the timeline's activity strip and wait for its cast to load.
 *
 * It waits on the list rather than on a new page: the window is pre-warmed, so in a build with a
 * `dist` folder beside the exe the page is already navigated and sitting on `SetCharactersContext`
 * before anyone clicks. Either way it is only usable once `.ch-list` is up.
 */
export async function openCharactersPage(tl: Page, ctx: BrowserContext): Promise<Page> {
  await tl.locator('.strip-btn--nav-chars').click()
  const page = await waitForNewPage(ctx, 'characters', 15_000)
  await page.bringToFront()
  await expect(page.locator('.ch-list')).toBeVisible({ timeout: 15_000 })
  return page
}

/** The same for the Relations window — ready when its sidebar has its view buttons. */
export async function openRelationsPage(tl: Page, ctx: BrowserContext): Promise<Page> {
  await tl.locator('.strip-btn--nav-relations').click()
  const page = await waitForNewPage(ctx, 'relations', 15_000)
  await page.bringToFront()
  await expect(page.locator('.rel-modes button').first()).toBeVisible({ timeout: 15_000 })
  return page
}

/**
 * Open the item editor from the timeline window — a new item of `typeId`, or `itemId` reopened.
 *
 * The host keeps one editor window and hides it rather than destroying it, so the page is often
 * already there from an earlier test. Waiting on the title field is what proves *this* open landed:
 * a new item comes up blank, a reopened one comes up with its own title.
 */
export async function openEditItemPage(
  tl: Page,
  ctx: BrowserContext,
  opts: { typeId?: number; itemId?: string | null; expectTitle?: string } = {},
  pageErrors?: string[],
): Promise<Page> {
  const { typeId = 1, itemId = null, expectTitle = '' } = opts
  await tl.evaluate(({ typeId, itemId }) => {
    type Root = { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: { Id: number } }> } } } } }
    const store = (document.getElementById('app') as unknown as Root).__vue_app__.config.globalProperties.$pinia._s.get('timeline')!
    window.chrome!.webview!.postMessage({
      action: 'OpenAddEditItemWindow',
      payload: { timelineId: store.currentProject.Id, typeId, itemId },
    })
  }, { typeId, itemId })

  const page = await waitForNewPage(ctx, 'editItem', 10_000, pageErrors)
  await page.bringToFront()
  await expect(page.locator('.edit-item-root')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('input[placeholder="Item title"]')).toHaveValue(expectTitle, { timeout: 10_000 })
  return page
}

/** The id of a loaded item, by the title the store knows it under — null if it is not there. */
export async function itemIdByTitle(tl: Page, title: string): Promise<string | null> {
  return tl.evaluate((wanted) => {
    type Root = { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { items: { Id: string; Title: string }[] }> } } } } }
    const store = (document.getElementById('app') as unknown as Root).__vue_app__.config.globalProperties.$pinia._s.get('timeline')!
    return store.items.find(i => i.Title === wanted)?.Id ?? null
  }, title)
}

/**
 * Make one character through the Characters window and leave them open in the form.
 * Returns their name, which is what the list and every relation label them by.
 */
export async function createCharacter(
  ch: Page,
  first: string,
  last: string,
  birthYear?: number,
): Promise<string> {
  await ch.locator('.ch-list-head .ch-btn--primary').click()
  const grid = ch.locator('.ch-grid')
  await expect(grid).toBeVisible({ timeout: 5000 })
  await grid.locator('input').nth(0).fill(first)
  await grid.locator('input').nth(1).fill(last)

  if (birthYear !== undefined) {
    const birth = ch.locator('.ch-date-block').first()
    await birth.locator('input[type="checkbox"]').check()
    await birth.locator('.lod-date-input input').first().fill(String(birthYear))
    await birth.locator('.lod-date-input input').first().blur()
  }

  await ch.locator('.ch-bar .ch-btn--primary').click()
  const name = `${first} ${last}`.trim()
  await expect(ch.locator('.ch-row', { hasText: name })).toBeVisible({ timeout: 8000 })
  return name
}

/** Remove a character through the list + the app's own confirm dialog. */
export async function deleteCharacter(ch: Page, name: string): Promise<void> {
  const row = ch.locator('.ch-row', { hasText: name })
  if (!(await row.count())) return
  await row.first().click()
  await ch.locator('.ch-bar .ch-btn--danger').click()
  await ch.locator('[data-primary]').click()
  await expect(ch.locator('.ch-row', { hasText: name })).toHaveCount(0, { timeout: 8000 })
}

/**
 * Delete a timeline from the project list through the row menu + confirm modal.
 * Tests that create timelines must call this, otherwise the leftover row sorts
 * ahead of the seed timeline and every later spec opens an empty timeline.
 */
export async function deleteTimelineRow(mainPage: Page, title: string): Promise<void> {
  const row = mainPage.locator('.project-timeline-row-container', { hasText: title })
  await expect(row).toBeVisible({ timeout: 8000 })
  await row.locator('.ellipsis-button').click()
  await row.locator('.row-action-button[data-tip="Delete"]').click()
  const modal = mainPage.locator('.bm-panel')
  await expect(modal).toBeVisible({ timeout: 3000 })
  await modal.locator('.btn-danger').click()
  await expect(row).not.toBeVisible({ timeout: 8000 })
}

/**
 * Drag the horizontal splitter down until the notes panel is in its tall layout
 * (textarea + "Add Note" button). Pane sizes are not persisted, so call this after
 * every openTimelinePage(). Below ~260px the panel switches to short/tiny modes
 * that hide the button or move the editor into a modal.
 */
export async function ensureNotesTall(tl: Page): Promise<void> {
  const notesTab = tl.locator('#timeline-data-notes .notes-tab')
  if (await notesTab.evaluate(el => el.classList.contains('mode-tall')).catch(() => false)) return
  const splitter = tl.locator('.timeline-splitpanes-wrapper > .splitpanes__splitter').first()
  const box = await splitter.boundingBox()
  if (!box) throw new Error('horizontal splitter not found')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await tl.mouse.move(x, y)
  await tl.mouse.down()
  await tl.mouse.move(x, y + 300, { steps: 10 })
  await tl.mouse.up()
  await expect(notesTab).toHaveClass(/mode-tall/, { timeout: 3000 })
}

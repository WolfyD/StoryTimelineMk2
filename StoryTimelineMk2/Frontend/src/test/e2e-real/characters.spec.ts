import {
  test, expect, openTimelinePage,
  openCharactersPage, createCharacter, deleteCharacter, closeWindow,
} from './fixtures'
import type { BrowserContext, Page } from '@playwright/test'

/**
 * The character's own timeline is another `timeline.html` window, so the query string is what
 * tells it apart from the one it was opened from.
 */
async function waitForCharacterTimeline(ctx: BrowserContext): Promise<Page> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const page = ctx.pages().find(p => p.url().includes('timeline.html') && p.url().includes('characterId='))
    if (page) return page
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('CDP: no character-focused timeline window appeared')
}

/** The total the info bar reports, which is what a broadcast has to move. */
async function itemCount(tl: Page): Promise<number> {
  const text = await tl.locator('#timeline-info-left').textContent()
  const match = text?.match(/Items:\s*(\d+)/)
  if (!match) throw new Error(`no item count in info bar: ${text}`)
  return parseInt(match[1]!, 10)
}

test.describe('Characters window — real backend', () => {
  let tl: Page
  let ch: Page

  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    tl = await openTimelinePage(mainPage, appContext, pageErrors)
    ch = await openCharactersPage(tl, appContext)
  })

  test.afterEach(async () => {
    await closeWindow(ch)
  })

  test('opens from the strip with the timeline it was opened from', async ({ pageErrors }) => {
    await expect(ch.locator('.ch-list')).toBeVisible()
    // Nobody selected yet, so the form side stands empty and the bottom bar is not there.
    await expect(ch.locator('.ch-detail--blank')).toBeVisible()
    await expect(ch.locator('.ch-bar')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('a new character is written and comes back in the list', async ({ pageErrors }) => {
    const name = await createCharacter(ch, 'Edda', 'Vance')

    // The backend derives Name from the two halves — the row proves its copy came back.
    await expect(ch.locator('.ch-row', { hasText: name })).toBeVisible()
    await expect(ch.locator('.ch-error')).toHaveCount(0)

    // And it survives a reload of the window, so it is on disk rather than in the page.
    await ch.reload()
    await expect(ch.locator('.ch-row', { hasText: name })).toBeVisible({ timeout: 15_000 })

    await deleteCharacter(ch, name)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('Show on timeline writes a birth item that reaches the open canvas, and untick takes it back', async ({ pageErrors }) => {
    const before = await itemCount(tl)
    const name = await createCharacter(ch, 'Risha', 'Vale', 1200)

    // Tick it on the saved character and save again: one call, one transaction.
    await ch.locator('.ch-check--timeline input').first().check()
    await ch.locator('.ch-bar .ch-btn--primary').click()
    await expect(ch.locator('.ch-error')).toHaveCount(0)

    // No reload anywhere: the canvas learns about it from the ItemSaved broadcast.
    await expect.poll(() => itemCount(tl), { timeout: 10_000 }).toBe(before + 1)

    // The generated item is titled from the character and attached to them.
    await expect(ch.locator('.ch-appearances')).toContainText(`Birth of ${name}`, { timeout: 10_000 })
    await expect(ch.locator('.ch-app-role').first()).toHaveText('birth')

    // Untick → the same save deletes it, and ItemDeleted reaches the canvas.
    await ch.locator('.ch-check--timeline input').first().uncheck()
    await ch.locator('.ch-bar .ch-btn--primary').click()
    await expect.poll(() => itemCount(tl), { timeout: 10_000 }).toBe(before)

    await deleteCharacter(ch, name)
    await expect.poll(() => itemCount(tl), { timeout: 10_000 }).toBe(before)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('deleting asks in the app’s own dialog, and Keep keeps', async ({ pageErrors }) => {
    const name = await createCharacter(ch, 'Toma', 'Reeve')

    await ch.locator('.ch-bar .ch-btn--danger').click()
    await expect(ch.locator('.bm-panel')).toContainText(`Delete ${name}?`)
    await ch.locator('[data-cancel]').click()
    await expect(ch.locator('.ch-row', { hasText: name })).toBeVisible()

    await deleteCharacter(ch, name)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('“Their timeline” opens a window on that character alone', async ({ appContext, pageErrors }) => {
    const name = await createCharacter(ch, 'Wren', 'Ashby', 1150)

    await ch.locator('.ch-bar-right button', { hasText: 'Their timeline' }).click()
    const focused = await waitForCharacterTimeline(appContext)
    await focused.waitForSelector('#timeline-workspace', { timeout: 15_000 })

    // It tints itself and puts the name in the title bar, so it is never mistaken for the real one.
    await expect(focused.locator('#timeline-center')).toHaveClass(/is-character-window/)
    await expect(focused.locator('.title-bar__name')).toContainText(name)

    await closeWindow(focused)
    await ch.bringToFront()
    await deleteCharacter(ch, name)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('the search box filters the cast', async ({ pageErrors }) => {
    const kept = await createCharacter(ch, 'Aldric', 'Stone')
    const hidden = await createCharacter(ch, 'Mira', 'Quill')

    await ch.locator('.ch-search input').fill('aldric')
    await expect(ch.locator('.ch-row', { hasText: kept })).toBeVisible()
    await expect(ch.locator('.ch-row', { hasText: hidden })).toHaveCount(0)

    await ch.locator('.ch-search input').fill('')
    await expect(ch.locator('.ch-row', { hasText: hidden })).toBeVisible()

    await deleteCharacter(ch, kept)
    await deleteCharacter(ch, hidden)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
})

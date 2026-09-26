import {
  test, expect, findPageByRole, openTimelinePage, openEditItemPage, itemIdByTitle,
  openCharactersPage, deleteCharacter, closeWindow,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The item editor's character side (BL-15 phase 2) and the open-ended spans (BL-72). Every test
 * works on a seed item and puts it back, because the editor is one reused window and the next spec
 * opens whatever this one left behind.
 */

/** Leave the editor with nothing half-typed in it. Safe to call on an already-hidden window. */
async function discardEditor(ed: Page): Promise<void> {
  await ed.locator('.header-actions .btn-secondary').click()
  const ask = ed.locator('.bm-panel')
  if (await ask.count()) await ask.locator('[data-primary]').click()
  await expect(ask).toHaveCount(0, { timeout: 5000 })
}

type CloseWatched = Window & { __closeSeen?: boolean; __closeOrig?: () => void }

/**
 * Save, and wait for the save to have landed.
 *
 * The host hides this window instead of destroying it, so the page stays `visible` and nothing in
 * the DOM changes: `window.close()` on a successful reply is the only signal there is. Watch for it,
 * or the next `LoadItem` arrives mid-save and is met with the discard prompt.
 */
async function saveEditor(ed: Page): Promise<void> {
  await ed.evaluate(() => {
    const w = window as CloseWatched
    w.__closeOrig ??= window.close.bind(window)
    w.__closeSeen = false
    window.close = () => { w.__closeSeen = true; w.__closeOrig!() }
  })
  await ed.locator('.header-actions .btn-primary').click()
  await ed.waitForFunction(() => (window as CloseWatched).__closeSeen === true, null, { timeout: 10_000 })
  await expect(ed.locator('.save-error')).toHaveCount(0)
}

test.describe('Item editor — characters and open ends', () => {
  let tl: Page

  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    tl = await openTimelinePage(mainPage, appContext, pageErrors)
  })

  test.afterEach(async ({ appContext }) => {
    const ed = findPageByRole(appContext, 'editItem')
    if (ed) await discardEditor(ed).catch(() => {})
  })

  test('the picker attaches a character, and the link survives a save', async ({ appContext, pageErrors }) => {
    const id = await itemIdByTitle(tl, 'Coronation')
    test.skip(!id, 'seed item "Coronation" is not in this timeline')
    const ed = await openEditItemPage(tl, appContext, { itemId: id, expectTitle: 'Coronation' }, pageErrors)

    await ed.locator('.btn', { hasText: '+ Add character' }).click()
    await expect(ed.locator('.picker-panel')).toBeVisible({ timeout: 5000 })
    await ed.locator('.picker-item', { hasText: 'Aldric' }).first().click()
    await ed.locator('.picker-footer .btn-primary').click()
    await expect(ed.locator('.picker-panel')).toHaveCount(0)
    await expect(ed.locator('.char-ref', { hasText: 'Aldric' })).toBeVisible()

    await saveEditor(ed)

    // Reopened from the database, not from what the form still held.
    const again = await openEditItemPage(tl, appContext, { itemId: id, expectTitle: 'Coronation' }, pageErrors)
    const row = again.locator('.char-ref', { hasText: 'Aldric' })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Put the seed item back the way it was.
    await row.locator('.btn-icon').click()
    await expect(again.locator('.char-ref', { hasText: 'Aldric' })).toHaveCount(0)
    await saveEditor(again)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('a name typed into the description attaches that character on blur', async ({ appContext, pageErrors }) => {
    const id = await itemIdByTitle(tl, 'Border Skirmish')
    test.skip(!id, 'seed item "Border Skirmish" is not in this timeline')
    const ed = await openEditItemPage(tl, appContext, { itemId: id, expectTitle: 'Border Skirmish' }, pageErrors)

    const desc = ed.locator('textarea[placeholder="Short description"]')
    await desc.fill('Mira rode out with the scouts.')
    await expect(ed.locator('.char-ref', { hasText: 'Mira' })).toHaveCount(0)   // not per keystroke
    await desc.blur()

    const found = ed.locator('.char-ref', { hasText: 'Mira' })
    await expect(found).toBeVisible({ timeout: 5000 })
    // The wand marks it as the text's doing rather than the user's.
    await expect(found.locator('.char-auto')).toBeVisible()

    // Nothing is saved, so the seed item keeps its own description.
    await discardEditor(ed)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('a character can be invented without leaving the editor', async ({ appContext, pageErrors }) => {
    const invented = 'Sable Windrow'
    const id = await itemIdByTitle(tl, 'Great Fire')
    test.skip(!id, 'seed item "Great Fire" is not in this timeline')
    const ed = await openEditItemPage(tl, appContext, { itemId: id, expectTitle: 'Great Fire' }, pageErrors)

    await ed.locator('.btn', { hasText: '+ Add character' }).click()
    await ed.locator('.picker-search').fill(invented)
    await expect(ed.locator('.picker-empty')).toHaveText('No one by that name yet.')

    await ed.locator('.picker-new').click()
    // They come back selected, so Add is the only thing left to do.
    await expect(ed.locator('.picker-item.selected')).toContainText(invented, { timeout: 8000 })
    await ed.locator('.picker-footer .btn-primary').click()
    await expect(ed.locator('.char-ref', { hasText: invented })).toBeVisible()
    await expect(ed.locator('.save-error')).toHaveCount(0)

    // The character was written the moment the button was pressed, so they outlive the discarded item.
    await discardEditor(ed)
    const ch = await openCharactersPage(tl, appContext)
    await expect(ch.locator('.ch-row', { hasText: invented })).toBeVisible({ timeout: 10_000 })
    await deleteCharacter(ch, invented)
    await closeWindow(ch)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('Open start / Open end / Fade out stick to a Period across a save', async ({ appContext, pageErrors }) => {
    const id = await itemIdByTitle(tl, 'The Long Peace')
    test.skip(!id, 'seed period "The Long Peace" is not in this timeline')
    const ed = await openEditItemPage(tl, appContext, { typeId: 2, itemId: id, expectTitle: 'The Long Peace' }, pageErrors)

    const field = (page: Page, label: string) => page.locator('.checkbox-field', { hasText: label })
    // Nothing runs off the edge yet, so there is no side to fade.
    await expect(field(ed, 'Fade out')).toHaveCount(0)

    await field(ed, 'Open start').locator('input').check()
    await expect(field(ed, 'Fade out')).toBeVisible()
    await field(ed, 'Open end').locator('input').check()
    await field(ed, 'Fade out').locator('input').check()
    await saveEditor(ed)

    const again = await openEditItemPage(tl, appContext, { typeId: 2, itemId: id, expectTitle: 'The Long Peace' }, pageErrors)
    await expect(field(again, 'Open start').locator('input')).toBeChecked()
    await expect(field(again, 'Open end').locator('input')).toBeChecked()
    await expect(field(again, 'Fade out').locator('input')).toBeChecked()

    // Hand the seed period back with square ends.
    await field(again, 'Open start').locator('input').uncheck()
    await field(again, 'Open end').locator('input').uncheck()
    await saveEditor(again)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('an item discarded here does not haunt the next one opened in the same window', async ({ appContext, pageErrors }) => {
    const first  = await itemIdByTitle(tl, 'Coronation')
    const second = await itemIdByTitle(tl, 'Great Fire')
    test.skip(!first || !second, 'seed items are not in this timeline')

    const ed = await openEditItemPage(tl, appContext, { itemId: first, expectTitle: 'Coronation' }, pageErrors)
    await ed.locator('input[placeholder="Item title"]').fill('Coronation — half typed')
    await discardEditor(ed)

    // The window only hid, so the abandoned edits were still in the form; the next item must just open.
    const next = await openEditItemPage(tl, appContext, { itemId: second, expectTitle: 'Great Fire' }, pageErrors)
    await expect(next.locator('.bm-panel')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
})

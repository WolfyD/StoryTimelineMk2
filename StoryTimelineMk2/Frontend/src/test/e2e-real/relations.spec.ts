import {
  test, expect, openTimelinePage, openCharactersPage, openRelationsPage,
  createCharacter, deleteCharacter, closeWindow,
} from './fixtures'
import type { Page } from '@playwright/test'

/** Every view in the sidebar, in the order the buttons stand. */
const VIEWS = ['Knots', 'Matrix', 'Genogram', 'Arc', 'Sociogram', 'Chord', 'Chain']

/**
 * Tie the character open in the form to `other`, with the first kind the list offers
 * (the built-in kinds are ordered family-first, so that is a parent/child tie).
 */
async function relateOpenCharacter(ch: Page, other: string): Promise<void> {
  await ch.locator('.ch-bar-right button').first().click()
  await expect(ch.locator('.rm')).toBeVisible({ timeout: 5000 })
  await ch.locator('.rm-people li', { hasText: other }).first().click()
  await ch.locator('.rm-edit .rm-select').first().selectOption({ index: 1 })
  // The sentence under the picker reads the relation both ways round before it is written.
  await expect(ch.locator('.rm-reads')).toContainText(other)
  await ch.locator('[data-primary]').click()
  // The side list is fed by the panel behind, so a row there means the write came back.
  await expect(ch.locator('.rm-rels li')).toHaveCount(1, { timeout: 8000 })
  await ch.locator('[data-cancel]').click()
  await expect(ch.locator('.rm')).toHaveCount(0)
}

test.describe('Relations window — real backend', () => {
  let tl: Page
  let ch: Page
  let rel: Page
  let parent: string
  let child: string

  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    tl = await openTimelinePage(mainPage, appContext, pageErrors)
    ch = await openCharactersPage(tl, appContext)
    parent = await createCharacter(ch, 'Aldric', 'Thorne', 1180)
    child = await createCharacter(ch, 'Mira', 'Thorne', 1210)
    // Mira is open after the second create — relate her to Aldric.
    await relateOpenCharacter(ch, parent)
    rel = await openRelationsPage(tl, appContext)
  })

  test.afterEach(async () => {
    await closeWindow(rel)
    await ch.bringToFront()
    await deleteCharacter(ch, child)
    await deleteCharacter(ch, parent)
    await closeWindow(ch)
  })

  test('opens with the whole cast and draws a stage', async ({ pageErrors }) => {
    await expect(rel.locator('.rel-stage canvas').first()).toBeVisible()
    // Both of them are in the pair-finder's lists, so both reached the window.
    const from = rel.locator('.rel-select').first()
    await expect(from.locator('option', { hasText: parent })).toHaveCount(1)
    await expect(from.locator('option', { hasText: child })).toHaveCount(1)
    // They are related, so neither of them is in the unconnected list (the seed cast still is).
    const loners = rel.locator('.rel-block', { hasText: 'Not related to anyone' })
    await expect(loners.locator('li', { hasText: parent })).toHaveCount(0)
    await expect(loners.locator('li', { hasText: child })).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  for (const [index, view] of VIEWS.entries()) {
    test(`the ${view} view draws without erroring`, async ({ pageErrors }) => {
      const button = rel.locator('.rel-modes button').nth(index)
      await expect(button).toContainText(view)
      await button.click()
      await expect(button).toHaveClass(/is-on/)

      const canvas = rel.locator('.rel-stage canvas').first()
      await expect(canvas).toBeVisible({ timeout: 10_000 })
      const box = await canvas.boundingBox()
      expect(box?.width ?? 0).toBeGreaterThan(0)
      expect(box?.height ?? 0).toBeGreaterThan(0)
      // Nothing to draw is an overlay, not a silent blank canvas.
      await expect(rel.locator('.rel-error')).toHaveCount(0)
      expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
    })
  }

  test('“How are they related?” spells the chain out between the two', async ({ pageErrors }) => {
    await rel.locator('.rel-select').nth(0).selectOption({ label: parent })
    await rel.locator('.rel-select').nth(1).selectOption({ label: child })

    const path = rel.locator('.rel-path')
    await expect(path).toBeVisible({ timeout: 8000 })
    await expect(path).toContainText(parent)
    await expect(path).toContainText(child)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('the search box pulls a face out of the cast', async ({ pageErrors }) => {
    await rel.locator('.rel-search input').fill('Mira')
    await expect(rel.locator('.rel-hits li', { hasText: child })).toBeVisible({ timeout: 5000 })
    await rel.locator('.rel-hits li', { hasText: child }).first().click()
    // Clicking a hit selects them, which gives their own ties their own block.
    // Their name is in the pair-finder's options too, so it is the heading that has to say it.
    await expect(rel.locator('.rel-block--grow h3')).toHaveText(child)
    await expect(rel.locator('.rel-block--grow .rel-ties li')).toContainText(parent)
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })

  test('the year scrubber hides a tie that had not started', async ({ pageErrors }) => {
    const yearBlock = rel.locator('.rel-block', { hasText: 'As of year' })
    if (!(await yearBlock.count())) test.skip(true, 'no dated relations in this cast')
    await yearBlock.locator('input[type="checkbox"]').check()
    await expect(yearBlock.locator('input[type="range"]')).toBeEnabled()
    expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)
  })
})

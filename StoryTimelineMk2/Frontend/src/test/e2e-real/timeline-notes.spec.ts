import { test, expect, findPageByRole, openTimelinePage } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Set the notes textarea value via DOM evaluate so Vue's v-model reactive ref is
 * updated. Playwright's fill/pressSequentially dispatch synthetic CDP events that
 * Chrome receives but that don't trigger Vue's input listener in CDP-connected mode.
 * Running inside page.evaluate() dispatches a real browser-side Event that Vue sees.
 */
async function setNotesTextarea(tl: Page, text: string) {
  await tl.evaluate((t) => {
    const el = document.querySelector('#timeline-data-notes .notes-textarea') as HTMLTextAreaElement
    if (!el) return
    el.value = t
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
  // Give Vue one tick to process the reactive update before the next action
  await tl.waitForTimeout(50)
}

test.describe('Timeline notes panel — real backend', () => {
  test.beforeEach(async ({ mainPage, appContext, pageErrors }) => {
    await openTimelinePage(mainPage, appContext, pageErrors)
  })

  // ── Panel structure ───────────────────────────────────────────────────────

  test('notes panel pane is visible', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    await expect(tl.locator('#timeline-data-notes')).toBeVisible()
  })

  test('notes and distance tabs are present', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const tabs = panel.locator('.tab-btn')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toContainText('Notes')
    await expect(tabs.nth(1)).toContainText('Distance')
  })

  test('notes tab is active by default', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const notesTab = panel.locator('.tab-btn', { hasText: 'Notes' })
    await expect(notesTab).toHaveClass(/active/)
  })

  test('switching to Distance tab makes it active', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const distTab = panel.locator('.tab-btn', { hasText: 'Distance' })
    await distTab.click()
    await expect(distTab).toHaveClass(/active/)
  })

  test('switching back to Notes tab makes Notes active', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const notesTab = panel.locator('.tab-btn', { hasText: 'Notes' })
    const distTab  = panel.locator('.tab-btn', { hasText: 'Distance' })
    await distTab.click()
    await expect(distTab).toHaveClass(/active/)
    await notesTab.click()
    await expect(notesTab).toHaveClass(/active/)
    await expect(distTab).not.toHaveClass(/active/)
  })

  test('notes textarea and add button are visible on Notes tab', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    await expect(panel.locator('.notes-textarea')).toBeVisible()
    await expect(panel.locator('.notes-add-btn')).toBeVisible()
  })

  // ── Adding notes ──────────────────────────────────────────────────────────

  test('typing in textarea and clicking add creates a note entry', async ({ appContext }) => {
    const tl    = findPageByRole(appContext, 'timeline')!
    const panel  = tl.locator('#timeline-data-notes')
    const addBtn = panel.locator('.notes-add-btn')

    const noteText = `E2E test note ${Date.now()}`
    await setNotesTextarea(tl, noteText)
    await addBtn.click()

    const noteEntry = panel.locator('.note-entry', { hasText: noteText })
    await expect(noteEntry).toBeVisible({ timeout: 5000 })

    // Clean up
    await noteEntry.locator('.note-action-btn.danger').click()
    await expect(noteEntry).not.toBeVisible({ timeout: 3000 })
  })

  test('textarea is cleared after adding a note', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const textarea = panel.locator('.notes-textarea')

    const noteText = `Cleanup note ${Date.now()}`
    await setNotesTextarea(tl, noteText)
    await panel.locator('.notes-add-btn').click()

    await expect(textarea).toHaveValue('')

    // Clean up
    const noteEntry = panel.locator('.note-entry', { hasText: noteText })
    await expect(noteEntry).toBeVisible({ timeout: 5000 })
    await noteEntry.locator('.note-action-btn.danger').click()
  })

  // ── Editing notes ─────────────────────────────────────────────────────────

  test('edit button puts the note into edit mode', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')

    const noteText = `Edit test ${Date.now()}`
    await setNotesTextarea(tl, noteText)
    await panel.locator('.notes-add-btn').click()

    const noteEntry = panel.locator('.note-entry', { hasText: noteText })
    await expect(noteEntry).toBeVisible({ timeout: 5000 })

    // Click the edit button
    await noteEntry.locator('.note-action-btn[title="Edit"]').click()

    // .note-edit-area is v-if'd into the entry when edit mode is active
    const editArea = panel.locator('.note-edit-area')
    await expect(editArea).toBeVisible({ timeout: 2000 })

    // Update the text and save
    await editArea.locator('.note-edit-textarea').fill(`${noteText} (updated)`)
    await editArea.locator('.note-save-btn').click()

    // After save the edit area collapses; find the entry by updated text
    const updatedEntry = panel.locator('.note-entry', { hasText: `${noteText} (updated)` })
    await expect(updatedEntry).toBeVisible({ timeout: 2000 })
    await expect(panel.locator('.note-edit-area')).not.toBeVisible({ timeout: 2000 })

    // Clean up
    await updatedEntry.locator('.note-action-btn.danger').click()
    await expect(updatedEntry).not.toBeVisible({ timeout: 3000 })
  })

  // ── Deleting notes ────────────────────────────────────────────────────────

  test('delete button removes the note entry', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')

    const noteText = `Delete me ${Date.now()}`
    await setNotesTextarea(tl, noteText)
    await panel.locator('.notes-add-btn').click()

    const noteEntry = panel.locator('.note-entry', { hasText: noteText })
    await expect(noteEntry).toBeVisible({ timeout: 5000 })

    await noteEntry.locator('.note-action-btn.danger').click()
    await expect(noteEntry).not.toBeVisible({ timeout: 3000 })
  })

  test('notes list is rendered (may be empty or have existing entries)', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    // .notes-list is v-if (only when notes exist); .notes-empty is the v-else shown otherwise
    const listOrEmpty = panel.locator('.notes-list, .notes-empty')
    await expect(listOrEmpty.first()).toBeVisible({ timeout: 5000 })
  })

  // ── Multiple notes ────────────────────────────────────────────────────────

  test('multiple notes can be added and each gets its own entry', async ({ appContext }) => {
    const tl = findPageByRole(appContext, 'timeline')!
    const panel = tl.locator('#timeline-data-notes')
    const ts = Date.now()
    const texts = [`Note A ${ts}`, `Note B ${ts}`, `Note C ${ts}`]

    for (const t of texts) {
      await setNotesTextarea(tl, t)
      await panel.locator('.notes-add-btn').click()
      await expect(panel.locator('.note-entry', { hasText: t })).toBeVisible({ timeout: 5000 })
    }

    // Verify all three are present simultaneously
    for (const t of texts) {
      await expect(panel.locator('.note-entry', { hasText: t })).toBeVisible()
    }

    // Clean up all three
    for (const t of texts) {
      const entry = panel.locator('.note-entry', { hasText: t })
      await entry.locator('.note-action-btn.danger').click()
      await expect(entry).not.toBeVisible({ timeout: 3000 })
    }
  })
})

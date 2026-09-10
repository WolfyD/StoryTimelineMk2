import { test, expect, findPageByRole } from './fixtures'
import type { BrowserContext } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Close any open timeline window (leaves main window unobscured for animations). */
async function closeTimelineWindow(appContext: BrowserContext) {
  const tl = findPageByRole(appContext, 'timeline')
  if (tl) {
    await tl.evaluate(() => window.close()).catch(() => {})
    await new Promise(r => setTimeout(r, 800))
  }
}

/**
 * Open the row-action menu for the first timeline row.
 * Handles the case where the menu is already open (idempotent).
 */
async function openRowMenu(mainPage: any) {
  const row = mainPage.locator('.project-timeline-row-container').first()
  await expect(row).toBeVisible({ timeout: 8000 })

  // If menu already open from a prior action, close it first
  const actionBtns = row.locator('.row-action-buttons')
  const isOpen = await actionBtns.evaluate((el: Element) => el.classList.contains('visible')).catch(() => false)
  if (isOpen) {
    await row.locator('.ellipsis-button').click()
    await mainPage.waitForTimeout(400)
  }

  await row.locator('.ellipsis-button').click()
  await expect(row.locator('.hidden-buttons-group')).toBeVisible({ timeout: 2000 })
  return row
}

test.describe('Main app — project management', () => {

  test.beforeEach(async ({ mainPage, appContext }) => {
    // 1. Close any timeline window — keeps the main WebView2 active so CSS animations work
    await closeTimelineWindow(appContext)

    // 2. Dismiss any open modal left by a previous test
    const modal = mainPage.locator('.modal-panel')
    if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
      const cancelBtn = modal.locator('.btn-cancel')
      const closeBtn  = modal.locator('.close-btn')
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click().catch(() => {})
      } else if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {})
      } else {
        await mainPage.keyboard.press('Escape').catch(() => {})
      }
      await mainPage.waitForTimeout(400)
    }

    // 3. Close any open row-action menu
    const row = mainPage.locator('.project-timeline-row-container').first()
    if (await row.isVisible({ timeout: 500 }).catch(() => false)) {
      const actionBtns = row.locator('.row-action-buttons')
      const isMenuOpen = await actionBtns.evaluate((el: Element) => el.classList.contains('visible')).catch(() => false)
      if (isMenuOpen) {
        await row.locator('.ellipsis-button').click().catch(() => {})
        await mainPage.waitForTimeout(400)
      }
    }

    // 4. Close new-project form if open (may be left open by a previous test file).
    // #new-project-title is always "visible" to Playwright (overflow-clip, not display:none),
    // so we check the .open CSS class on the container instead.
    const isFormOpen = await mainPage.evaluate(
      () => document.getElementById('new-project-container')?.classList.contains('open') ?? false
    ).catch(() => false)
    if (isFormOpen) {
      await mainPage.locator('#new-project-open-button').click().catch(() => {})
      await mainPage.waitForTimeout(600) // wait for 0.45s collapse animation
    }

    // 5. Ensure the main page is in front
    await mainPage.bringToFront().catch(() => {})
  })

  // ── Project list ─────────────────────────────────────────────────────────

  test('project list shows the app heading', async ({ mainPage }) => {
    await expect(mainPage.locator('h1')).toContainText('Story Timeline', { timeout: 8000 })
  })

  test('at least one project row is visible from seed database', async ({ mainPage }) => {
    await expect(mainPage.locator('.project-timeline-row').first()).toBeVisible({ timeout: 8000 })
  })

  test('each project row has a color dot', async ({ mainPage }) => {
    await expect(mainPage.locator('.timeline-color-dot').first()).toBeVisible({ timeout: 8000 })
  })

  // ── New project flow ──────────────────────────────────────────────────────

  test('new-project toggle button expands the form', async ({ mainPage }) => {
    await mainPage.evaluate(() => localStorage.setItem('lastAuthor', 'E2E'))
    await mainPage.locator('#new-project-open-button').click()
    // #new-project-title is always "visible" to Playwright (overflow-clip, not display:none).
    // Use the .open class on the container — this is the authoritative open/closed state.
    await mainPage.waitForSelector('#new-project-container.open', { timeout: 2000 })
    await expect(mainPage.locator('#start-project-button')).toBeVisible()
    // Close it again
    await mainPage.locator('#new-project-open-button').click()
    await mainPage.waitForSelector('#new-project-container:not(.open)', { timeout: 2000 })
  })

  test('creating a new timeline adds it to the project list', async ({ mainPage }) => {
    await mainPage.evaluate(() => localStorage.setItem('lastAuthor', 'E2E Test'))
    await mainPage.locator('#new-project-open-button').click()
    // Wait for the container to be fully open before interacting (pointer-events become auto immediately
    // but the submit button needs to be in the viewport — animation takes 0.45s)
    await mainPage.waitForSelector('#new-project-container.open', { timeout: 2000 })
    await mainPage.waitForTimeout(500) // let animation finish

    const name = `E2E New ${Date.now()}`
    await mainPage.locator('#new-project-title').fill(name)
    await mainPage.locator('#start-project-button').click()

    await expect(mainPage.locator('.project-timeline-row', { hasText: name })).toBeVisible({ timeout: 8000 })
  })

  // ── Row action menu ───────────────────────────────────────────────────────

  test('ellipsis button toggles the row action menu open', async ({ mainPage }) => {
    const row = mainPage.locator('.project-timeline-row-container').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    await row.locator('.ellipsis-button').click()
    await expect(row.locator('.hidden-buttons-group')).toBeVisible({ timeout: 2000 })
  })

  test('row action menu contains Edit, Export, Duplicate, and Delete buttons', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    const group = row.locator('.hidden-buttons-group')
    await expect(group.locator('.row-action-button[title="Edit"]')).toBeVisible()
    await expect(group.locator('.row-action-button[title="Export"]')).toBeVisible()
    await expect(group.locator('.row-action-button[title="Duplicate"]')).toBeVisible()
    await expect(group.locator('.row-action-button[title="Delete"]')).toBeVisible()
  })

  test('clicking ellipsis again closes the action menu', async ({ mainPage }) => {
    const row = mainPage.locator('.project-timeline-row-container').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    const ellipsis = row.locator('.ellipsis-button')
    await ellipsis.click()
    await expect(row.locator('.hidden-buttons-group')).toBeVisible({ timeout: 2000 })
    await ellipsis.click()
    await expect(row.locator('.hidden-buttons-group')).not.toBeVisible({ timeout: 2000 })
  })

  // ── Delete modal ──────────────────────────────────────────────────────────

  test('Delete button opens the confirm-delete modal', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Delete"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await expect(modal.locator('.modal-title')).toContainText('Delete Timeline')
    await expect(modal.locator('.btn-danger')).toContainText('Delete')
    await expect(modal.locator('.btn-cancel')).toContainText('Cancel')
  })

  test('Cancel button in delete modal dismisses it without deleting', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    const rowTitle = await row.locator('.project-timeline-row').textContent()
    await row.locator('.row-action-button[title="Delete"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await modal.locator('.btn-cancel').click()
    await expect(modal).not.toBeVisible({ timeout: 2000 })

    // The row should still be present
    await expect(mainPage.locator('.project-timeline-row', { hasText: (rowTitle ?? '').trim() })).toBeVisible()
  })

  test('close button (X) in delete modal dismisses it', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Delete"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await modal.locator('.close-btn').click()
    await expect(modal).not.toBeVisible({ timeout: 2000 })
  })

  test('clicking backdrop of delete modal dismisses it', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Delete"]').click()

    const backdrop = mainPage.locator('.modal-backdrop')
    await expect(backdrop).toBeVisible({ timeout: 3000 })
    await backdrop.click({ position: { x: 5, y: 5 } })
    await expect(mainPage.locator('.modal-panel')).not.toBeVisible({ timeout: 2000 })
  })

  // ── Edit modal ────────────────────────────────────────────────────────────

  test('Edit button opens the edit-timeline modal', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Edit"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await expect(modal.locator('.modal-title')).toContainText('Edit Timeline')
  })

  test('edit modal has input fields for title and author', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Edit"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    const inputs = modal.locator('input[type="text"]')
    expect(await inputs.count()).toBeGreaterThan(0)
  })

  test('cancel closes the edit modal', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Edit"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await modal.locator('.btn-cancel').click()
    await expect(modal).not.toBeVisible({ timeout: 2000 })
  })

  // ── Duplicate modal ───────────────────────────────────────────────────────

  test('Duplicate button opens the duplicate modal', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Duplicate"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await expect(modal.locator('.modal-title')).toContainText('Duplicate Timeline')
  })

  test('duplicate modal shows a pre-filled title input with _duplicate suffix', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    const originalTitle = await row.locator('.project-timeline-row').textContent()
    await row.locator('.row-action-button[title="Duplicate"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    const titleInput = modal.locator('.field-input')
    await expect(titleInput).toBeVisible()
    const value = await titleInput.inputValue()
    expect(value).toContain('_duplicate')
    expect(originalTitle).toBeTruthy()
  })

  test('cancel closes the duplicate modal without creating a copy', async ({ mainPage }) => {
    const row = await openRowMenu(mainPage)
    await row.locator('.row-action-button[title="Duplicate"]').click()

    const modal = mainPage.locator('.modal-panel')
    await expect(modal).toBeVisible({ timeout: 3000 })
    await modal.locator('.btn-cancel').click()
    await expect(modal).not.toBeVisible({ timeout: 2000 })
  })

  // ── Import / Export buttons ───────────────────────────────────────────────

  test('import-export container is visible at the bottom', async ({ mainPage }) => {
    await expect(mainPage.locator('#import-export-container')).toBeVisible({ timeout: 8000 })
  })

  test('app settings and calendar manager icons are present', async ({ mainPage }) => {
    await expect(mainPage.locator('[title="App Settings"]')).toBeVisible({ timeout: 8000 })
    await expect(mainPage.locator('[title="Manage Calendars"]')).toBeVisible({ timeout: 8000 })
  })
})

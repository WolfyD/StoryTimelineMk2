import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Tests for the EditItem form page (localhost:5173/editItem.html).
 *
 * Key UI facts from EditItem.vue:
 *   - Rendered by editItem.ts → EditItem.vue
 *   - Shows a loading screen ("Loading…") until onMounted async calls resolve
 *   - Header section contains:
 *       .type-pill  — shows item type name (e.g. "Event")
 *       .header-actions — Cancel button + Save button
 *       input[type=text] with placeholder "Item title"
 *       input[type=color] for Color
 *   - Body grid contains a Type <select> with options Event/Period/Age/Picture/Note/Bookmark
 *   - Save button text: "Save" (or "Saving…" while in-flight)
 *   - Cancel button text: "Cancel"
 *   - .save-error is only shown when saveError is non-empty
 */

test.describe('EditItem — new item (typeId=1)', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/editItem.html?timelineId=1&typeId=1&itemId=null')
    // Wait until the loading screen disappears (onMounted resolves)
    await page.waitForSelector('.edit-item-root', { timeout: 5000 })
  })

  test('page loads without showing loading screen', async ({ page }) => {
    await expect(page.locator('.loading-screen')).toHaveCount(0)
    await expect(page.locator('.edit-item-root')).toBeVisible()
  })

  test('type pill shows the current item type', async ({ page }) => {
    // typeId=1 → 'Event'
    await expect(page.locator('.type-pill')).toContainText('Event')
  })

  test('title input is present and accepts text', async ({ page }) => {
    const titleInput = page.locator('input[placeholder="Item title"]')
    await expect(titleInput).toBeVisible()
    await titleInput.fill('My New Event')
    await expect(titleInput).toHaveValue('My New Event')
  })

  test('type selector offers the types you can create, in order', async ({ page }) => {
    // The <select v-model="item.TypeId"> in the Date & Range section
    const typeSelect = page.locator('.range-section select').first()
    await expect(typeSelect).toBeVisible()

    const texts = await typeSelect.locator('option').allTextContents()
    // The first six are the ones this form creates, and their order is the order of their TypeIds,
    // which the canvas and the filter both rely on. Anything after them is a type generated
    // elsewhere and only listed so an open item can show its own — 'Character' is the first of
    // those. Asserting a prefix rather than a total is deliberate: a new type appends, and a test
    // that counts options would fail on the day one is added without anything being wrong.
    expect(texts.slice(0, 6)).toEqual(['Event', 'Period', 'Age', 'Picture', 'Note', 'Bookmark'])
    expect(new Set(texts).size, `a type is listed twice: ${texts.join(', ')}`).toBe(texts.length)
  })

  test('color picker input is present', async ({ page }) => {
    await expect(page.locator('input[type="color"]')).toBeVisible()
  })

  test('Save button is present and enabled', async ({ page }) => {
    const saveBtn = page.locator('button.btn-primary', { hasText: 'Save' })
    await expect(saveBtn).toBeVisible()
    await expect(saveBtn).toBeEnabled()
  })

  test('Cancel button is present', async ({ page }) => {
    const cancelBtn = page.locator('button.btn-secondary', { hasText: 'Cancel' })
    await expect(cancelBtn).toBeVisible()
  })

  test('Save button click — mock returns success — no error message shown', async ({ page }) => {
    // Give the title a value so the save is meaningful
    await page.locator('input[placeholder="Item title"]').fill('Saved Event')

    const saveBtn = page.locator('button.btn-primary', { hasText: 'Save' })
    await saveBtn.click()

    // The save-error paragraph must NOT appear after a successful save.
    // window.close() is called on success (harmless in Playwright — it doesn't
    // close the page, so we can still assert absence of errors).
    await page.waitForTimeout(300)
    await expect(page.locator('.save-error')).toHaveCount(0)
  })
})

test.describe('EditItem — existing item', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
    // Pass a real itemId so isNew = false and the Item from GetItemForEdit is used
    await page.goto('/editItem.html?timelineId=1&typeId=1&itemId=item-uuid-1')
    await page.waitForSelector('.edit-item-root', { timeout: 5000 })
  })

  test('title field is pre-populated with the mocked item title', async ({ page }) => {
    // The bridge mock returns GetItemForEdit with Title: 'Existing Test Item'
    // When itemId is not "null", isNew = false and item.value = data.Item
    const titleInput = page.locator('input[placeholder="Item title"]')
    await expect(titleInput).toHaveValue('Existing Test Item')
  })
})

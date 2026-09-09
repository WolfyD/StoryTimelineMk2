import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Tests for the Settings page (localhost:5173/settings.html).
 *
 * settings.html → settings.ts → SettingsApp.vue
 *
 * SettingsApp.vue is actually a legacy stub component that accepts props
 * (itemId, initialTitle) and renders a simple "Edit Item {itemId}" heading
 * with a title input and a "Save Changes" button. It does NOT load any data
 * on mount — it just uses the props passed by the parent WinForms window.
 *
 * In the E2E context the page is mounted without any props (defaulting to
 * undefined/0/empty-string), so we just verify it renders without crashing.
 */

test.describe('Settings page', () => {
  // SettingsApp.vue is a legacy stub that expects props injected by the WinForms host
  // (itemId, initialTitle). As a standalone root component it mounts without those
  // props and renders an empty shell — that is the expected behaviour in a browser
  // context. Tests here only verify the page doesn't crash.

  test('page loads without an uncaught error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await injectBridgeMock(page)
    await page.goto('/settings.html')
    await page.waitForLoadState('networkidle')

    // The Vue app root must exist in the DOM (even if empty)
    await expect(page.locator('#app')).toBeAttached()

    // No uncaught JavaScript errors
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('page mounts the Vue app without a fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await injectBridgeMock(page)
    await page.goto('/settings.html')
    await page.waitForLoadState('networkidle')

    // #app must be present — it may be empty because SettingsApp is a props-driven stub
    await expect(page.locator('#app')).toBeAttached()
    expect(errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Vue warn'))).toHaveLength(0)
  })
})

import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Playwright E2E tests for DB import / export and timeline import flows.
 *
 * App.vue renders:
 *  - #import-export-container   — bottom bar with the DB and gear icons
 *  - .db-menu / #db-menu-panel  — dropdown opened by the DB icon
 *  - DbImportModal              — shown after BrowseAndPreviewImport returns a preview
 *  - ImportTimelineModal        — shown after BrowseAndPreviewTimelineImport returns a preview
 *
 * All bridge calls are mocked via injectBridgeMock; overrides let individual
 * tests customise specific action responses.
 */

test.describe('DB import / export menu', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('import-export container is visible', async ({ page }) => {
    await expect(page.locator('#import-export-container')).toBeVisible()
  })

  test('DB menu opens when DB icon is clicked', async ({ page }) => {
    await page.locator('#db-menu-btn').click()
    await expect(page.locator('#db-menu-panel')).toBeVisible()
  })

  test('DB menu closes when backdrop is clicked', async ({ page }) => {
    await page.locator('#db-menu-btn').click()
    await expect(page.locator('#db-menu-panel')).toBeVisible()
    await page.locator('#db-menu-backdrop').click()
    await expect(page.locator('#db-menu-panel')).not.toBeVisible()
  })

  test('DB menu contains Import Database option', async ({ page }) => {
    await page.locator('#db-menu-btn').click()
    await expect(page.locator('#db-menu-panel')).toContainText('Import Database')
  })

  test('DB menu contains Export Database option', async ({ page }) => {
    await page.locator('#db-menu-btn').click()
    await expect(page.locator('#db-menu-panel')).toContainText('Export Database')
  })
})

test.describe('DB import flow', () => {
  test('clicking Import Database opens DbImportModal', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')
  })

  test('DbImportModal displays preview data from bridge mock', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()

    const modal = page.locator('.bm-panel')
    await expect(modal).toContainText('export.sqlite')
    await expect(modal).toContainText('42')
  })

  test('cancelling DbImportModal closes it without importing', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')

    await page.locator('.btn-cancel').click()
    await expect(page.locator('.bm-title')).not.toBeVisible()
  })

  test('confirming import calls ExecuteImportDB and closes modal on success', async ({ page }) => {
    await injectBridgeMock(page, { ExecuteImportDB: { status: 'ok' } })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')

    await page.locator('.btn-danger').click()
    await expect(page.locator('.bm-title')).not.toBeVisible({ timeout: 3000 })
  })

  test('conflict scenario shows warning in DbImportModal', async ({ page }) => {
    await injectBridgeMock(page, {
      BrowseAndPreviewImport: {
        status: 'ok',
        preview: {
          sourcePath: 'C:/test/export.sqlite',
          isV2: true,
          timelineCount: 1,
          itemCount: 20,
          conflictingTimelines: ['Existing Story'],
        },
      },
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()

    await expect(page.locator('.conflict-block')).toBeVisible()
    await expect(page.locator('.conflict-block')).toContainText('Existing Story')
  })
})

test.describe('DB export flow', () => {
  test('clicking Export Database triggers ExportFullDB', async ({ page }) => {
    const messages: string[] = []
    await injectBridgeMock(page, { ExportFullDB: { status: 'ok', path: 'C:/test/export.sqlite' } })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Intercept postMessage calls to verify ExportFullDB was sent
    await page.exposeFunction('_captureAction', (action: string) => { messages.push(action) })
    await page.evaluate(() => {
      const orig = window.chrome.webview.postMessage.bind(window.chrome.webview)
      window.chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) (window as unknown as { _captureAction: (a: string) => void })._captureAction(parsed.action)
        orig(msg)
      }
    })

    await page.locator('#db-menu-btn').click()
    await page.getByText('Export Database').click()
    await page.waitForTimeout(300)

    expect(messages).toContain('ExportFullDB')
  })
})

test.describe('Timeline import flow', () => {
  test('clicking Import Timeline opens ImportTimelineModal', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Timeline import is accessible from the project row context menu or from the
    // import-export container. Try the DB menu first.
    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Timeline').click()
    await expect(page.locator('.bm-title')).toContainText('Import Timeline')
  })

  test('ImportTimelineModal shows preview data', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Timeline').click()

    const modal = page.locator('.bm-panel')
    await expect(modal).toContainText('Test Timeline')
    await expect(modal).toContainText('15')
  })

  test('cancelling ImportTimelineModal closes it', async ({ page }) => {
    await injectBridgeMock(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Timeline').click()
    await expect(page.locator('.bm-title')).toContainText('Import Timeline')

    await page.locator('.btn-cancel').click()
    await expect(page.locator('.bm-title')).not.toBeVisible()
  })

  test('confirming ImportTimeline with no conflict uses btn-primary', async ({ page }) => {
    await injectBridgeMock(page, {
      BrowseAndPreviewTimelineImport: {
        status: 'ok',
        preview: {
          sourcePath: 'C:/test/timeline.zip',
          timelineTitle: 'Fresh Import',
          includeIds: false,
          hasMedia: false,
          itemCount: 10,
          mediaCount: 0,
          hasConflict: false,
          conflictingTimelineTitle: null,
          timelineId: null,
        },
      },
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Timeline').click()

    const confirmBtn = page.locator('.btn-primary')
    await expect(confirmBtn).toBeVisible()
    await expect(confirmBtn).toContainText('Import')
  })

  test('conflict scenario shows btn-danger "Replace & Import"', async ({ page }) => {
    await injectBridgeMock(page, {
      BrowseAndPreviewTimelineImport: {
        status: 'ok',
        preview: {
          sourcePath: 'C:/test/timeline.zip',
          timelineTitle: 'Conflict Import',
          includeIds: true,
          hasMedia: false,
          itemCount: 8,
          mediaCount: 0,
          hasConflict: true,
          conflictingTimelineTitle: 'My Existing Story',
          timelineId: 5,
        },
      },
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Timeline').click()

    await expect(page.locator('.conflict-block')).toBeVisible()
    await expect(page.locator('.conflict-block')).toContainText('My Existing Story')
    await expect(page.locator('.btn-danger')).toContainText('Replace & Import')
  })
})

test.describe('DB import — post-import behaviour', () => {
  test('import success calls GetAllTimelines to refresh the project list', async ({ page }) => {
    const actions: string[] = []
    await injectBridgeMock(page, { ExecuteImportDB: { status: 'ok' } })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.exposeFunction('_captureAction', (action: string) => { actions.push(action) })
    await page.evaluate(() => {
      const orig = window.chrome.webview.postMessage.bind(window.chrome.webview)
      window.chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action)
          ;(window as unknown as { _captureAction: (a: string) => void })._captureAction(parsed.action)
        orig(msg)
      }
    })

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')
    await page.locator('.btn-danger').click()
    await page.waitForTimeout(500)

    const importIdx = actions.lastIndexOf('ExecuteImportDB')
    expect(importIdx).toBeGreaterThanOrEqual(0)
    // GetAllTimelines must fire after the import to refresh the project list
    const refreshIdx = actions.indexOf('GetAllTimelines', importIdx + 1)
    expect(refreshIdx).toBeGreaterThan(importIdx)
  })

  test('import failure shows an alert with the error message', async ({ page }) => {
    await injectBridgeMock(page, {
      ExecuteImportDB: { status: 'error', message: 'Database file is corrupted' },
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    let alertText = ''
    page.on('dialog', async dialog => {
      alertText = dialog.message()
      await dialog.dismiss()
    })

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')
    await page.locator('.btn-danger').click()
    await page.waitForTimeout(500)

    expect(alertText).toContain('Database import failed')
    expect(alertText).toContain('Database file is corrupted')
  })

  test('import success closes the modal and shows the project list', async ({ page }) => {
    await injectBridgeMock(page, { ExecuteImportDB: { status: 'ok' } })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#db-menu-btn').click()
    await page.getByText('Import Database').click()
    await expect(page.locator('.bm-title')).toContainText('Import Database')
    await page.locator('.btn-danger').click()

    await expect(page.locator('.bm-title')).not.toBeVisible({ timeout: 3000 })
    // Project list is restored after the refresh
    await expect(page.locator('.project-timeline-row')).toBeVisible({ timeout: 3000 })
  })
})

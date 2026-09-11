import { test, expect } from '@playwright/test'
import { injectBridgeMock } from './bridge-mock'

/**
 * Playwright E2E tests for the backup section of AppSettingsModal.
 *
 * AppSettingsModal is opened via the gear icon in #import-export-container.
 * It calls GetAppConfig and GetBackupSettings on mount.
 */

async function openSettingsModal(page: Parameters<typeof injectBridgeMock>[0]) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // The gear icon opens AppSettingsModal
  await page.locator('#app-settings-btn').click()
  await expect(page.locator('.modal-title')).toContainText('App Settings')
}

test.describe('AppSettingsModal — backup section', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
  })

  test('settings modal opens via gear icon', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.locator('.modal-panel')).toBeVisible()
  })

  test('backup section heading is visible', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.locator('.settings-section')).toContainText('Backup')
  })

  test('auto-backup interval select is rendered with options', async ({ page }) => {
    await openSettingsModal(page)
    const select = page.locator('select.interval-select')
    await expect(select).toBeVisible()
    await expect(select.locator('option[value="never"]')).toBeAttached()
    await expect(select.locator('option[value="daily"]')).toBeAttached()
    await expect(select.locator('option[value="weekly"]')).toBeAttached()
  })

  test('interval select is pre-populated from GetBackupSettings', async ({ page }) => {
    // Default mock returns interval: 'weekly'
    await openSettingsModal(page)
    const select = page.locator('select.interval-select')
    await expect(select).toHaveValue('weekly')
  })

  test('changing interval calls SaveBackupSettings', async ({ page }) => {
    const messages: { action: string; payload: unknown }[] = []
    await page.exposeFunction('_captureBridge', (action: string, payload: unknown) => {
      messages.push({ action, payload })
    })
    await page.evaluate(() => {
      const orig = window.chrome.webview.postMessage.bind(window.chrome.webview)
      window.chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) {
          ;(window as unknown as { _captureBridge: (a: string, p: unknown) => void })
            ._captureBridge(parsed.action, parsed.payload)
        }
        orig(msg)
      }
    })

    await openSettingsModal(page)
    await page.locator('select.interval-select').selectOption('daily')
    await page.waitForTimeout(300)

    const call = messages.find(m => m.action === 'SaveBackupSettings')
    expect(call).toBeTruthy()
  })

  test('"Create Backup Now" button is visible', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.getByText('Create Backup Now')).toBeVisible()
  })

  test('"Create Backup Now" calls CreateBackup', async ({ page }) => {
    const messages: string[] = []
    await page.exposeFunction('_captureAction', (action: string) => { messages.push(action) })
    await page.evaluate(() => {
      const orig = window.chrome.webview.postMessage.bind(window.chrome.webview)
      window.chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) {
          ;(window as unknown as { _captureAction: (a: string) => void })._captureAction(parsed.action)
        }
        orig(msg)
      }
    })

    await openSettingsModal(page)
    await page.getByText('Create Backup Now').click()
    await page.waitForTimeout(300)

    expect(messages).toContain('CreateBackup')
  })

  test('success feedback appears after backup is created', async ({ page }) => {
    await openSettingsModal(page)
    await page.getByText('Create Backup Now').click()
    await expect(page.locator('.feedback--success')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.feedback--success')).toContainText('Backup saved')
  })

  test('"Open folder" button is visible', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.getByText('Open folder')).toBeVisible()
  })

  test('"Open folder" calls OpenBackupsFolder', async ({ page }) => {
    const messages: string[] = []
    await page.exposeFunction('_captureAction', (action: string) => { messages.push(action) })
    await page.evaluate(() => {
      const orig = window.chrome.webview.postMessage.bind(window.chrome.webview)
      window.chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) {
          ;(window as unknown as { _captureAction: (a: string) => void })._captureAction(parsed.action)
        }
        orig(msg)
      }
    })

    await openSettingsModal(page)
    await page.getByText('Open folder').click()
    await page.waitForTimeout(300)

    expect(messages).toContain('OpenBackupsFolder')
  })

  test('recent backups list is not shown when empty', async ({ page }) => {
    // Default mock returns recentBackups: []
    await openSettingsModal(page)
    await expect(page.locator('.recent-backups')).not.toBeVisible()
  })

  test('recent backups list is shown when GetBackupSettings returns backups', async ({ page }) => {
    await injectBridgeMock(page, {
      GetBackupSettings: {
        interval: 'daily',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: [
          {
            FileName: 'backup-2026-09-11.zip',
            FullPath: 'C:/test/data/backups/backup-2026-09-11.zip',
            CreatedAt: '2026-09-11T10:00:00Z',
            SizeBytes: 524288,
            HasMedia: false,
          },
        ],
      },
    })
    await openSettingsModal(page)
    await expect(page.locator('.recent-backups')).toBeVisible()
    await expect(page.locator('.recent-backups')).toContainText('backup-2026-09-11.zip')
  })

  test('closing modal via Close button hides it', async ({ page }) => {
    await openSettingsModal(page)
    await page.locator('.btn-cancel').click()
    await expect(page.locator('.modal-title')).not.toBeVisible()
  })

  test('closing modal via backdrop click hides it', async ({ page }) => {
    await openSettingsModal(page)
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.modal-title')).not.toBeVisible()
  })
})

test.describe('Backup error handling', () => {
  test('error feedback appears when backup fails', async ({ page }) => {
    await injectBridgeMock(page, {
      CreateBackup: { status: 'error', message: 'Not enough disk space' },
    })
    await openSettingsModal(page)
    await page.getByText('Create Backup Now').click()
    await expect(page.locator('.feedback--error')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.feedback--error')).toContainText('Not enough disk space')
  })
})

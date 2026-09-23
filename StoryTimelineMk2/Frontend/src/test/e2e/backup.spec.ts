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
  await expect(page.locator('.bm-title')).toContainText('App Settings')
}

test.describe('AppSettingsModal — backup section', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
  })

  test('settings modal opens via gear icon', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.locator('.bm-panel')).toBeVisible()
  })

  test('backup section heading is visible', async ({ page }) => {
    await openSettingsModal(page)
    await expect(page.locator('.section-label').filter({ hasText: 'Backup' })).toBeVisible()
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
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.exposeFunction('_captureBridge', (action: string, payload: unknown) => {
      messages.push({ action, payload })
    })
    await page.evaluate(() => {
      const orig = (window as any).chrome.webview.postMessage.bind((window as any).chrome.webview)
      ;(window as any).chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) {
          (window as any)._captureBridge(parsed.action, parsed.payload)
        }
        orig(msg)
      }
    })
    await page.locator('#app-settings-btn').click()
    await expect(page.locator('.bm-title')).toContainText('App Settings')
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
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.exposeFunction('_captureAction', (action: string) => { messages.push(action) })
    await page.evaluate(() => {
      const orig = (window as any).chrome.webview.postMessage.bind((window as any).chrome.webview)
      ;(window as any).chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) { (window as any)._captureAction(parsed.action) }
        orig(msg)
      }
    })
    await page.locator('#app-settings-btn').click()
    await expect(page.locator('.bm-title')).toContainText('App Settings')
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
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.exposeFunction('_captureAction', (action: string) => { messages.push(action) })
    await page.evaluate(() => {
      const orig = (window as any).chrome.webview.postMessage.bind((window as any).chrome.webview)
      ;(window as any).chrome.webview.postMessage = (msg: unknown) => {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed?.action) { (window as any)._captureAction(parsed.action) }
        orig(msg)
      }
    })
    await page.locator('#app-settings-btn').click()
    await expect(page.locator('.bm-title')).toContainText('App Settings')
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
    await expect(page.locator('.bm-title')).not.toBeVisible()
  })

  test('closing modal via backdrop click hides it', async ({ page }) => {
    await openSettingsModal(page)
    await page.locator('.bm-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.bm-title')).not.toBeVisible()
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

test.describe('AppSettingsModal — includeMedia, pruning hint, and backup list detail', () => {
  test.beforeEach(async ({ page }) => {
    await injectBridgeMock(page)
  })

  test('includeMedia checkbox is rendered with correct label', async ({ page }) => {
    await openSettingsModal(page)
    const label = page.locator('label.toggle-label').filter({ hasText: 'Include images' })
    await expect(label).toBeVisible()
    await expect(label).toContainText('Include images')
    await expect(label.locator('input[type="checkbox"]')).toBeVisible()
  })

  test('includeMedia checkbox is checked by default', async ({ page }) => {
    await openSettingsModal(page)
    const cb = page.locator('label.toggle-label').filter({ hasText: 'Include images' }).locator('input[type="checkbox"]')
    await expect(cb).toBeChecked()
  })

  test('includeMedia checkbox can be unchecked', async ({ page }) => {
    await openSettingsModal(page)
    const cb = page.locator('label.toggle-label').filter({ hasText: 'Include images' }).locator('input[type="checkbox"]')
    await cb.uncheck()
    await expect(cb).not.toBeChecked()
  })

  test('CreateBackup sends includeMedia: false when checkbox is unchecked', async ({ page }) => {
    const captured: string[] = []
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.exposeFunction('_captureMsg', (json: string) => { captured.push(json) })
    await page.evaluate(() => {
      const orig = window.chrome!.webview!.postMessage.bind(window.chrome!.webview!)
      window.chrome!.webview!.postMessage = (msg: unknown) => {
        // Capture ALL messages so we can see the full picture
        ;(window as unknown as { _captureMsg: (s: string) => void })
          ._captureMsg(JSON.stringify(typeof msg === 'string' ? JSON.parse(msg) : msg))
        orig(msg)
      }
    })
    await page.locator('#app-settings-btn').click()
    await expect(page.locator('.bm-title')).toContainText('App Settings')
    const cb = page.locator('label.toggle-label').filter({ hasText: 'Include images' }).locator('input[type="checkbox"]')
    await expect(cb).toBeChecked()
    await cb.uncheck()
    await expect(cb).not.toBeChecked()
    await page.getByText('Create Backup Now').click()
    await page.waitForTimeout(300)

    const createBackupMsg = captured.map(j => JSON.parse(j)).find(m => m.action === 'CreateBackup')
    expect(createBackupMsg).toBeTruthy()
    expect(createBackupMsg.payload?.includeMedia).toBe(false)
  })

  test('pruning hint text mentions the 20-backup limit', async ({ page }) => {
    await openSettingsModal(page)
    const backupSection = page.locator('.settings-section').filter({ has: page.locator('.section-label').filter({ hasText: 'Backup' }) })
    await expect(backupSection.locator('.hint')).toContainText('20 most recent')
    await expect(backupSection.locator('.hint')).toContainText('pruned automatically')
  })

  test('recent backups list shows filename and formatted metadata', async ({ page }) => {
    await injectBridgeMock(page, {
      GetBackupSettings: {
        interval: 'daily',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: [
          {
            FileName: 'timeline_20260910_120000.sqlite',
            FullPath: 'C:/test/data/backups/timeline_20260910_120000.sqlite',
            CreatedAt: '2026-09-10T12:00:00Z',
            SizeBytes: 2097152,
            HasMedia: false,
          },
        ],
      },
    })
    await openSettingsModal(page)
    await expect(page.locator('.backup-name')).toContainText('timeline_20260910_120000.sqlite')
    // 2097152 bytes = 2.0 MB — UI should format it
    await expect(page.locator('.backup-meta')).toContainText('MB')
  })

  test('recent backups list caps at 8 entries even when more are provided', async ({ page }) => {
    const manyBackups = Array.from({ length: 10 }, (_, i) => ({
      FileName: `timeline_2026090${i + 1}_120000.sqlite`,
      FullPath: `C:/test/data/backups/timeline_2026090${i + 1}_120000.sqlite`,
      CreatedAt: new Date(Date.UTC(2026, 8, i + 1, 12, 0, 0)).toISOString(),
      SizeBytes: 1024 * (i + 1),
      HasMedia: false,
    }))
    await injectBridgeMock(page, {
      GetBackupSettings: {
        interval: 'weekly',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: manyBackups,
      },
    })
    await openSettingsModal(page)
    // Template slices at 8: v-for="b in recentBackups.slice(0, 8)"
    await expect(page.locator('.backup-entry')).toHaveCount(8)
  })

  test('recent backups list shows all entries when exactly 8 are provided', async ({ page }) => {
    const eightBackups = Array.from({ length: 8 }, (_, i) => ({
      FileName: `timeline_2026090${i + 1}_120000.sqlite`,
      FullPath: `C:/test/data/backups/timeline_2026090${i + 1}_120000.sqlite`,
      CreatedAt: new Date(Date.UTC(2026, 8, i + 1, 12, 0, 0)).toISOString(),
      SizeBytes: 512 * (i + 1),
      HasMedia: i % 2 === 0,
    }))
    await injectBridgeMock(page, {
      GetBackupSettings: {
        interval: 'daily',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: eightBackups,
      },
    })
    await openSettingsModal(page)
    await expect(page.locator('.backup-entry')).toHaveCount(8)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetAppConfig: vi.fn().mockResolvedValue({
      DataRoot: 'C:/test/data',
      DbPath: 'C:/test/data/timeline.sqlite',
      performantPanning: true,
      themeInitialized: true,
    }),
    GetBackupSettings: vi.fn().mockResolvedValue({
      interval: 'weekly',
      lastAutoBackupAt: null,
      backupsFolder: 'C:/test/data/backups',
      recentBackups: [],
    }),
    GetMiscSetting: vi.fn().mockResolvedValue({ value: '0' }),
    SetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok' }),
    SaveBackupSettings: vi.fn().mockResolvedValue({ status: 'ok' }),
    CreateBackup: vi.fn().mockResolvedValue({ status: 'ok' }),
    OpenBackupsFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    BrowseDataFolder: vi.fn().mockResolvedValue({ path: null }),
    MoveDataFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    SetDataRoot: vi.fn().mockResolvedValue({ status: 'ok' }),
    OpenDataFolder: vi.fn(),
    SavePerformantPanning: vi.fn().mockResolvedValue({ status: 'ok' }),
    request: vi.fn(),
    send: vi.fn(),
  },
}))

vi.mock('@/components/AppThemeModal.vue', () => ({
  default: {
    name: 'AppThemeModal',
    template: '<div class="app-theme-modal-stub"></div>',
    emits: ['close'],
  },
}))

import AppSettingsModal from '@/components/AppSettingsModal.vue'
import { BackendAPI } from '@/bridge/api'
import type { BackupInfo } from '@/types/models'

function makeBackupInfo(overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    FileName: 'backup-2026-09-11.zip',
    FullPath: 'C:/test/data/backups/backup-2026-09-11.zip',
    CreatedAt: '2026-09-11T10:00:00Z',
    SizeBytes: 1024 * 512,
    HasMedia: false,
    ...overrides,
  }
}

async function mountModal() {
  const wrapper = mount(AppSettingsModal, {
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('AppSettingsModal — backup section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(BackendAPI.GetAppConfig).mockResolvedValue({
      DataRoot: 'C:/test/data',
      DbPath: 'C:/test/data/timeline.sqlite',
      performantPanning: true,
      themeInitialized: true,
    })
    vi.mocked(BackendAPI.GetBackupSettings).mockResolvedValue({
      interval: 'weekly',
      lastAutoBackupAt: null,
      backupsFolder: 'C:/test/data/backups',
      recentBackups: [],
    })
    vi.mocked(BackendAPI.CreateBackup).mockResolvedValue({ status: 'ok' })
    vi.mocked(BackendAPI.SaveBackupSettings).mockResolvedValue({ status: 'ok' })
    vi.mocked(BackendAPI.OpenBackupsFolder).mockResolvedValue({ status: 'ok' })
  })

  it('renders the modal', async () => {
    const wrapper = await mountModal()
    expect(wrapper.find('.bm-title').text()).toBe('App Settings')
    wrapper.unmount()
  })

  it('loads backup settings on mount', async () => {
    const wrapper = await mountModal()
    expect(BackendAPI.GetBackupSettings).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('backup section is present', async () => {
    const wrapper = await mountModal()
    const sections = wrapper.findAll('.settings-section h4')
    const labels = sections.map(s => s.text())
    expect(labels).toContain('Backup')
    wrapper.unmount()
  })

  it('interval select is pre-populated from loaded settings', async () => {
    const wrapper = await mountModal()
    const select = wrapper.find('select.interval-select')
    expect((select.element as HTMLSelectElement).value).toBe('weekly')
    wrapper.unmount()
  })

  it('interval select has never / daily / weekly options', async () => {
    const wrapper = await mountModal()
    const options = wrapper.findAll('select.interval-select option')
    const values = options.map(o => (o.element as HTMLOptionElement).value)
    expect(values).toContain('never')
    expect(values).toContain('daily')
    expect(values).toContain('weekly')
    wrapper.unmount()
  })

  it('changing interval calls SaveBackupSettings', async () => {
    const wrapper = await mountModal()
    const select = wrapper.find('select.interval-select')
    await select.setValue('daily')
    await flushPromises()
    expect(BackendAPI.SaveBackupSettings).toHaveBeenCalledWith('daily')
    wrapper.unmount()
  })

  it('"Create Backup Now" button is visible', async () => {
    const wrapper = await mountModal()
    const btns = wrapper.findAll('button')
    const found = btns.some(b => b.text().includes('Create Backup Now'))
    expect(found).toBe(true)
    wrapper.unmount()
  })

  it('"Create Backup Now" calls CreateBackup with includeMedia value', async () => {
    const wrapper = await mountModal()
    const btns = wrapper.findAll('button')
    const backupBtn = btns.find(b => b.text().includes('Create Backup Now'))!
    await backupBtn.trigger('click')
    await flushPromises()
    expect(BackendAPI.CreateBackup).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('shows success feedback after successful backup', async () => {
    const wrapper = await mountModal()
    const btns = wrapper.findAll('button')
    const backupBtn = btns.find(b => b.text().includes('Create Backup Now'))!
    await backupBtn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Backup saved')
    wrapper.unmount()
  })

  it('shows error feedback when backup fails', async () => {
    vi.mocked(BackendAPI.CreateBackup).mockResolvedValue({ status: 'error', message: 'Disk full' })
    const wrapper = await mountModal()
    const btns = wrapper.findAll('button')
    const backupBtn = btns.find(b => b.text().includes('Create Backup Now'))!
    await backupBtn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Disk full')
    wrapper.unmount()
  })

  it('"Open folder" button calls OpenBackupsFolder', async () => {
    const wrapper = await mountModal()
    const btns = wrapper.findAll('button')
    const openBtn = btns.find(b => b.text().includes('Open folder'))!
    await openBtn.trigger('click')
    await flushPromises()
    expect(BackendAPI.OpenBackupsFolder).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not render recent-backups list when empty', async () => {
    const wrapper = await mountModal()
    expect(wrapper.find('.recent-backups').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders recent-backups list when backups are returned', async () => {
    vi.mocked(BackendAPI.GetBackupSettings).mockResolvedValue({
      interval: 'weekly',
      lastAutoBackupAt: null,
      backupsFolder: 'C:/test/data/backups',
      recentBackups: [
        makeBackupInfo({ FileName: 'backup-2026-09-10.zip', SizeBytes: 1024 }),
        makeBackupInfo({ FileName: 'backup-2026-09-09.zip', SizeBytes: 2048 }),
      ],
    })
    const wrapper = await mountModal()
    const list = wrapper.find('.recent-backups')
    expect(list.exists()).toBe(true)
    expect(list.text()).toContain('backup-2026-09-10.zip')
    expect(list.text()).toContain('backup-2026-09-09.zip')
    wrapper.unmount()
  })

  it('recent-backups list refreshes after backup creation', async () => {
    vi.mocked(BackendAPI.GetBackupSettings)
      .mockResolvedValueOnce({
        interval: 'weekly',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: [],
      })
      .mockResolvedValue({
        interval: 'weekly',
        lastAutoBackupAt: null,
        backupsFolder: 'C:/test/data/backups',
        recentBackups: [makeBackupInfo()],
      })

    const wrapper = await mountModal()
    expect(wrapper.find('.recent-backups').exists()).toBe(false)

    const btns = wrapper.findAll('button')
    const backupBtn = btns.find(b => b.text().includes('Create Backup Now'))!
    await backupBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.recent-backups').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits close when Close button is clicked', async () => {
    const wrapper = await mountModal()
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})

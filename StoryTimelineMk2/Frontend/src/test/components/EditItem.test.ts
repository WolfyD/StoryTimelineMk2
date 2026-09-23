import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock BackendAPI before importing the component
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetItemForEdit: vi.fn(),
    GetTimelineCharacters: vi.fn().mockResolvedValue([]),
    GetAllStories: vi.fn().mockResolvedValue([]),
    SearchTags: vi.fn().mockResolvedValue([]),
    GetTopTags: vi.fn().mockResolvedValue([]),
    GetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
    SaveItem: vi.fn(),
    RemoveImageFromItem: vi.fn().mockResolvedValue({ status: 'ok' }),
    SearchBooks: vi.fn().mockResolvedValue([]),
    GetBookChapters: vi.fn().mockResolvedValue([]),
    WindowClose: vi.fn(),
    WindowGetMaximized: vi.fn().mockResolvedValue({ isMaximized: false }),
    WindowGetTopMost: vi.fn().mockResolvedValue({ isTopmost: false }),
    GetAppConfig: vi.fn().mockResolvedValue({ themeInitialized: true }),
    request: vi.fn(),
    send: vi.fn(),
  },
  // The browser build is the only host that needs the beforeunload guard, so the flag is on
  // here; nothing else in EditItem reads it, and the desktop close paths below are unaffected.
  IS_BROWSER_HOST: true,
}))

// Stub child components that are complex or canvas-dependent
vi.mock('@/components/LodDateInput.vue', () => ({
  default: {
    name: 'LodDateInput',
    template: '<div class="lod-date-input-stub"></div>',
    props: ['label', 'lodIndex', 'lodProfile', 'monthNames', 'monthLengths', 'seasonNames', 'weekCount', 'year', 'subtick'],
    emits: ['update:year', 'update:subtick'],
  },
}))

vi.mock('@/components/ImagePickerModal.vue', () => ({
  default: {
    name: 'ImagePickerModal',
    template: '<div class="image-picker-modal-stub"></div>',
    props: ['itemId', 'alreadyLinked'],
    emits: ['close', 'linked'],
  },
}))

import EditItem from '@/pages/EditItem.vue'
import { BackendAPI } from '@/bridge/api'
import type { ItemForEdit } from '@/types/models'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItemForEdit(overrides: Partial<ItemForEdit> = {}): ItemForEdit {
  return {
    Item: {
      Id: 'existing-uuid-1234',
      Title: 'The Great War',
      Description: 'A pivotal conflict',
      Content: 'Extended notes here',
      StoryId: null,
      TypeId: 1,
      Year: 1914,
      EndYear: 1914,
      AbsoluteStart: 1914,
      AbsoluteEnd: 1914,
      BookTitle: '',
      Chapter: '',
      Page: '',
      Color: '#ff0000',
      CreationGranularity: 3,
      TimelineId: 1,
      ItemIndex: 0,
      ShowInNotes: true,
      Importance: 7,
      MinLodLevel: 3,
      LodVisibilityMask: 255,
    },
    Tags: [{ Id: 1, Name: 'war' }],
    Characters: [],
    Dismissals: [],
    StoryRefs: [],
    ChapterRefs: [],
    Calendar: {
      Id: 'cal_gregorian',
      Name: 'Gregorian',
      ShortName: 'Greg.',
      AlternateName: '',
      NameBefore0: 'BCE',
      NameAfter0: 'CE',
      LodProfileId: 'lod_default',
      YearDefinition: '{}',
      LodProfile: { Id: 'lod_default', Name: 'Default', Profile: [] },
    },
    Pictures: [],
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Override URL search params before mounting
function setUrlParams(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: search ? `?${search}` : '' },
    writable: true,
    configurable: true,
  })
}

let pinia: ReturnType<typeof createPinia>

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EditItem page', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    // Default: new item (no itemId)
    setUrlParams({ timelineId: '1', typeId: '1' })
  })

  // ── New item mode ─────────────────────────────────────────────────────────

  it('renders loading state initially', () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    expect(wrapper.find('.loading-screen').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows type selector in the rendered form (new item)', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    // Type selector is a <select> bound to item.TypeId
    const typeSelect = wrapper.find('select')
    expect(typeSelect.exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders Save and Cancel buttons', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const labels = buttons.map(b => b.text().trim())
    expect(labels.some(l => l.includes('Save'))).toBe(true)
    expect(labels.some(l => l.includes('Cancel'))).toBe(true)
    wrapper.unmount()
  })

  it('title input is empty when creating a new item', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    // No itemId in URL → new item
    setUrlParams({ timelineId: '1', typeId: '1' })

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const titleInput = wrapper.find<HTMLInputElement>('input[type="text"]')
    expect(titleInput.element.value).toBe('')
    wrapper.unmount()
  })

  it('new item starts with the LOD mask the backend stub carries', async () => {
    const d = makeItemForEdit()
    d.Item.LodVisibilityMask = 0b1000   // only LOD index 3
    d.Calendar.LodProfile.Profile = [
      { index: 0, formatKey: 'Millennia', stepFraction: 1000 },
      { index: 3, formatKey: 'Years', stepFraction: 1 },
    ] as any
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(d)

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const active = wrapper.findAll('.lod-toggle-btn.active')
    expect(active.map(b => b.attributes('title'))).toEqual(['Years'])
    wrapper.unmount()
  })

  // ── Existing item mode ────────────────────────────────────────────────────

  it('populates title from loaded item data when editing an existing item', async () => {
    setUrlParams({ timelineId: '1', itemId: 'existing-uuid-1234', typeId: '1' })

    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const titleInput = wrapper.find<HTMLInputElement>('input[placeholder="Item title"]')
    expect(titleInput.element.value).toBe('The Great War')
    wrapper.unmount()
  })

  it('shows description from loaded item when editing', async () => {
    setUrlParams({ timelineId: '1', itemId: 'existing-uuid-1234', typeId: '1' })

    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const descTextarea = wrapper.find<HTMLTextAreaElement>('textarea[placeholder="Short description"]')
    expect(descTextarea.element.value).toBe('A pivotal conflict')
    wrapper.unmount()
  })

  // ── Save logic ────────────────────────────────────────────────────────────

  it('calls BackendAPI.SaveItem when Save button is clicked', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', itemId: 'new-id' })

    const windowClose = vi.spyOn(window, 'close').mockImplementation(() => {})

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find(b => b.text().includes('Save'))
    expect(saveBtn).toBeDefined()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(BackendAPI.SaveItem).toHaveBeenCalledOnce()
    windowClose.mockRestore()
    wrapper.unmount()
  })

  it('calls window.close on save success when closeOnSuccess=true', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', itemId: 'new-id' })

    const windowClose = vi.spyOn(window, 'close').mockImplementation(() => {})

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find(b => b.text().includes('Save'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(windowClose).toHaveBeenCalledOnce()
    windowClose.mockRestore()
    wrapper.unmount()
  })

  it('shows the save error message when SaveItem returns an error', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'error',
      message: 'DB error: constraint violation',
    })

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find(b => b.text().includes('Save'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.save-error').exists()).toBe(true)
    expect(wrapper.find('.save-error').text()).toContain('DB error: constraint violation')
    wrapper.unmount()
  })

  it('does not show save error initially', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(wrapper.find('.save-error').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── Cancel button ─────────────────────────────────────────────────────────

  it('calls BackendAPI.WindowClose when Cancel is clicked', async () => {
    // Cancel goes through the bridge (window.close() is a no-op in WebView2
    // for windows the script didn't open).
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const cancelBtn = wrapper.findAll('button').find(b => b.text().includes('Cancel'))
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')

    expect(BackendAPI.WindowClose).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── TypeId changes ────────────────────────────────────────────────────────

  it('type selector renders the correct number of item type options', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    // ITEM_TYPES has 7 entries: Event, Period, Age, Picture, Note, Bookmark, Character
    // The first select in the form is the type selector
    const typeSelect = wrapper.find('select')
    expect(typeSelect.exists()).toBe(true)
    const options = typeSelect.findAll('option')
    expect(options.length).toBe(7)
    // Character is the character window's to hand out — unpickable on an item that is not one.
    expect(options[6]!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('type selector contains "Period" as an option', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const typeSelect = wrapper.find('select')
    const options = typeSelect.findAll('option')
    const optionTexts = options.map(o => o.text())
    expect(optionTexts).toContain('Period')
    expect(optionTexts).toContain('Event')
    expect(optionTexts).toContain('Age')
    wrapper.unmount()
  })

  // ── Color picker ──────────────────────────────────────────────────────────

  it('renders a color input for the item color', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const colorInput = wrapper.find('input[type="color"]')
    expect(colorInput.exists()).toBe(true)
    wrapper.unmount()
  })

  it('updating color input changes the bound color value', async () => {
    setUrlParams({ timelineId: '1', itemId: 'existing-uuid-1234', typeId: '1' })

    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const colorInput = wrapper.find('input[type="color"]')
    await colorInput.setValue('#00ff00')
    await wrapper.vm.$nextTick()

    expect((colorInput.element as HTMLInputElement).value).toBe('#00ff00')
    wrapper.unmount()
  })

  // ── Close confirmation / hotkeys ──────────────────────────────────────────

  it('Save comes before Cancel in the header', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const buttons = wrapper.findAll('.header-actions button')
    expect(buttons.map(b => b.text())).toEqual([expect.stringContaining('Save'), expect.stringContaining('Cancel')])
    expect(buttons.map(b => b.find('.btn-hint').text())).toEqual(['Ctrl+S', 'Esc'])
    wrapper.unmount()
  })

  it('Ctrl+S saves', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', itemId: 'new-id' })
    const windowClose = vi.spyOn(window, 'close').mockImplementation(() => {})
    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await flushPromises()

    expect(BackendAPI.SaveItem).toHaveBeenCalledOnce()
    windowClose.mockRestore()
    wrapper.unmount()
  })

  it('top tags render as click-to-add chips, hiding ones already on the item', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit({ Tags: [{ Id: 1, Name: 'war' }] }))
    ;(BackendAPI.GetTopTags as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ Id: 1, Name: 'war' }, { Id: 2, Name: 'politics' }])
    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(wrapper.findAll('.chip-suggest').map(c => c.text())).toEqual(['+ politics'])
    await wrapper.find('.chip-suggest').trigger('click')
    expect(wrapper.findAll('.chip-suggest')).toHaveLength(0)
    expect(wrapper.findAll('.tag-chips .chip').map(c => c.text())).toEqual(['war ×', 'politics ×'])
    wrapper.unmount()
  })

  it('Side toggle writes Placement: Auto = 0, Above = 1, Below = 2', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', itemId: 'existing-uuid-1234' })
    const windowClose = vi.spyOn(window, 'close').mockImplementation(() => {})
    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    const btns = wrapper.findAll('.seg-btn')
    expect(btns.map(b => b.text())).toEqual(['Auto', 'Above', 'Below'])
    expect(btns[0].classes()).toContain('active')   // fixture has no Placement → Auto

    await btns[2].trigger('click')
    expect(btns[2].classes()).toContain('active')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await flushPromises()
    // SaveItem receives the live item object — read Placement before it changes again
    expect((BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mock.calls[0][0].Placement).toBe(2)

    await btns[0].trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await flushPromises()
    expect((BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mock.calls[1][0].Placement).toBe(0)

    windowClose.mockRestore()
    wrapper.unmount()
  })

  it('Cancel on a dirty form asks first; Discard then closes the window', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    const wrapper = mount(EditItem, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    await wrapper.find('input[placeholder="Item title"]').setValue('Changed')
    await wrapper.findAll('button').find(b => b.text().includes('Cancel'))!.trigger('click')
    await flushPromises()

    expect(BackendAPI.WindowClose).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Discard changes?')

    await wrapper.findAll('button').find(b => b.text() === 'Discard')!.trigger('click')
    expect(BackendAPI.WindowClose).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('title-bar X on a dirty form asks first instead of closing', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    const wrapper = mount(EditItem, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    await wrapper.find('input[placeholder="Item title"]').setValue('Changed')
    await wrapper.find('.tb-btn--close').trigger('click')
    await flushPromises()

    expect(BackendAPI.WindowClose).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Discard changes?')
    wrapper.unmount()
  })

  // The tab's own close never reaches requestClose(), so this listener is the only thing
  // standing between an unsaved item and a shut window in the browser build.
  it('closing the tab on a dirty form is blocked; a clean one goes quietly', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    const wrapper = mount(EditItem, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }

    expect(unload()).toBe(false)

    await wrapper.find('input[placeholder="Item title"]').setValue('Changed')
    expect(unload()).toBe(true)

    // Unmounting has to take the listener with it, or a closed window keeps blocking the next.
    wrapper.unmount()
    expect(unload()).toBe(false)
  })

  it('Escape and a CloseRequested push close a clean form without asking', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())
    const addListener = window.chrome!.webview!.addEventListener as unknown as ReturnType<typeof vi.fn>
    const wrapper = mount(EditItem, { global: { plugins: [pinia] } })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(BackendAPI.WindowClose).toHaveBeenCalledTimes(1)

    const push = new MessageEvent('message', { data: JSON.stringify({ action: 'CloseRequested' }) })
    addListener.mock.calls.filter(c => c[0] === 'message').forEach(c => (c[1] as (e: MessageEvent) => void)(push))
    expect(BackendAPI.WindowClose).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Discard changes?')
    wrapper.unmount()
  })
})

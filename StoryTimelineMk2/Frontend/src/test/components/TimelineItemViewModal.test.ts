import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { ItemForEdit } from '@/types/models'

// Mock the BackendAPI so we never hit the real bridge
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetItemForEdit: vi.fn(),
    request: vi.fn(),
    send: vi.fn(),
  },
}))

import { BackendAPI } from '@/bridge/api'
import TimelineItemViewModal from '@/components/TimelineItemViewModal.vue'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeItemForEdit(overrides: Partial<ItemForEdit> = {}): ItemForEdit {
  return {
    Item: {
      Id: 'item-uuid',
      Title: 'The Battle of Testing',
      Description: 'A fierce battle',
      Content: 'Extra notes',
      StoryId: null,
      TypeId: 1,
      Year: 1066,
      EndYear: 1066,
      AbsoluteStart: 1066,
      AbsoluteEnd: 1066,
      BookTitle: '',
      Chapter: '',
      Page: '',
      Color: '#ff0000',
      CreationGranularity: 1,
      TimelineId: 1,
      ItemIndex: 0,
      ShowInNotes: true,
      Importance: 5,
      MinLodLevel: 3,
      LodVisibilityMask: 255,
    },
    Tags: [{ Id: 1, Name: 'battle' }, { Id: 2, Name: 'medieval' }],
    Characters: [],
    StoryRefs: [],
    ChapterRefs: [],
    Calendar: {
      Id: 'cal_default_gregorian',
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

// ── Tests ─────────────────────────────────────────────────────────────────────
// The component uses <Teleport to="body">, so its rendered DOM lands on
// document.body, NOT inside the wrapper element. We query document.body directly.

describe('TimelineItemViewModal', () => {
  let pinia: ReturnType<typeof createPinia>
  let wrappers: ReturnType<typeof mount>[]

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    wrappers = []
  })

  afterEach(() => {
    wrappers.forEach(w => w.unmount())
    // Clean up any stray teleport content left on body
    document.body.innerHTML = ''
  })

  function mountModal(props = { itemId: 'item-uuid', timelineId: 1 }) {
    const w = mount(TimelineItemViewModal, {
      props,
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    wrappers.push(w)
    return w
  }

  // Helper: query the teleported content on document.body
  function bodyQ(selector: string) {
    return document.body.querySelector(selector)
  }
  function bodyQAll(selector: string) {
    return Array.from(document.body.querySelectorAll(selector))
  }

  it('shows loading state initially (before promise resolves)', async () => {
    let resolveData: (v: ItemForEdit) => void
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<ItemForEdit>(res => { resolveData = res })
    )

    mountModal()
    await Promise.resolve() // let mount settle but not the async

    expect(bodyQ('.vm-loading')).not.toBeNull()

    resolveData!(makeItemForEdit())
  })

  it('shows item title after data loads', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mountModal()
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(bodyQ('.vm-title')?.textContent?.trim()).toBe('The Battle of Testing')
  })

  it('shows type badge with correct label', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mountModal()
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(bodyQ('.vm-type-badge')?.textContent?.trim()).toBe('Event')
  })

  it('renders tags', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mountModal()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const tags = bodyQAll('.vm-tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].textContent?.trim()).toBe('battle')
    expect(tags[1].textContent?.trim()).toBe('medieval')
  })

  it('emits close when the ✕ button is clicked', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mountModal()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const btn = bodyQ('.vm-close') as HTMLElement
    expect(btn).not.toBeNull()
    btn.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when backdrop is clicked', async () => {
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue(makeItemForEdit())

    const wrapper = mountModal()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // The press has to land on the backdrop too, so a drag out of the panel cannot close it.
    const backdrop = bodyQ('.view-modal-backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

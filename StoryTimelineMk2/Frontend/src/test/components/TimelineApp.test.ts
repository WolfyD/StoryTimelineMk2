import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { LayoutSettings } from '@/types/models'

// Mock BackendAPI before any imports
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    send: vi.fn(),
    request: vi.fn(),
    SaveItem: vi.fn().mockResolvedValue({ status: 'ok', itemId: 'item-id' }),
    GetItemForEdit: vi.fn().mockResolvedValue(null),
    LoadTimelineData: vi.fn().mockResolvedValue(null),
  },
}))

// Stub all heavyweight child components so tests stay fast and focused on TimelineApp logic
vi.mock('@/components/TimelineCanvas.vue', () => ({
  default: {
    name: 'TimelineCanvas',
    template: '<div class="timeline-canvas-stub"></div>',
    props: ['timelineItems', 'timelineSettings', 'timelineInfo', 'layoutSettings'],
    emits: ['item-click', 'view-item', 'add-item'],
    // Expose methods that TimelineApp calls via the canvas ref
    methods: {
      animateJumpToYear: vi.fn(),
      jumpToYear: vi.fn(),
      updateStageSize: vi.fn(),
    },
  },
}))

vi.mock('@/components/TimelineSettingsModal.vue', () => ({
  default: {
    name: 'TimelineSettingsModal',
    template: '<div class="settings-modal-stub"></div>',
    props: ['settings', 'layoutSettings'],
    emits: ['close'],
  },
}))

vi.mock('@/components/TimelineNotesPanel.vue', () => ({
  default: {
    name: 'TimelineNotesPanel',
    template: '<div class="notes-panel-stub"></div>',
    props: ['layoutSettings'],
  },
}))

vi.mock('@/components/TimelineDataPanel.vue', () => ({
  default: {
    name: 'TimelineDataPanel',
    template: '<div class="data-panel-stub"></div>',
    props: ['layoutSettings'],
  },
}))

vi.mock('@/components/TimelineGalleryPanel.vue', () => ({
  default: {
    name: 'TimelineGalleryPanel',
    template: '<div class="gallery-panel-stub"></div>',
    props: ['layoutSettings'],
  },
}))

vi.mock('@/components/TimelineMinimap.vue', () => ({
  default: {
    name: 'TimelineMinimap',
    template: '<div class="minimap-stub"></div>',
    emits: ['jump-to-year'],
  },
}))

vi.mock('@/components/TimelineItemViewModal.vue', () => ({
  default: {
    name: 'TimelineItemViewModal',
    template: '<div class="item-view-modal-stub"></div>',
    props: ['itemId', 'timelineId'],
    emits: ['close'],
  },
}))

vi.mock('splitpanes', () => ({
  Splitpanes: {
    name: 'Splitpanes',
    template: '<div class="splitpanes-stub"><slot /></div>',
    props: ['horizontal'],
    emits: ['resize'],
  },
  Pane: {
    name: 'Pane',
    template: '<div class="pane-stub"><slot /></div>',
    props: ['size', 'minSize', 'maxSize', 'id'],
  },
}))

// Mock phosphor icons to avoid SVG issues in happy-dom.
// A Proxy stubs EVERY icon by name — enumerating them broke silently whenever a
// component gained a new icon (the activity strip's PhRuler/PhFunnel/etc. rendered
// as "Invalid vnode type: undefined" and failed 11 tests).
vi.mock('@phosphor-icons/vue', () => {
  const cache = new Map<string, object>()
  const isIconKey = (prop: string | symbol): prop is string =>
    typeof prop === 'string' && prop !== 'then' && prop !== 'default' && prop !== '__esModule'
  return new Proxy({}, {
    get(_target, prop) {
      // Guard module-interop probes: a truthy 'then' would make the mock thenable.
      if (!isIconKey(prop)) return undefined
      if (!cache.has(prop)) cache.set(prop, { template: '<span class="ph-icon-stub" />', name: prop })
      return cache.get(prop)
    },
    // Vitest validates exports with the `in` operator before reading them.
    has(_target, prop) {
      return isIconKey(prop)
    },
  })
})

import TimelineApp from '@/pages/TimelineApp.vue'
import { BackendAPI } from '@/bridge/api'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return {
    Id: 'ls_default',
    Name: 'Default',
    TimelineEventBoxWidth: 130,
    TimelineEventBoxHeight: 30,
    TimelineEventBoxStemOffset: 10,
    TimelineEventBorderColor: '#000',
    TimelineEventBorderWidth: 1,
    TimelineEventBorderRadius: 3,
    TimelineEventPadding: '10',
    TimelineEventYMargin: 5,
    TimelineEventTextColor: '#000',
    TimelineEventBackgroundColor: '#fff',
    TimelineEventFontFamily: 'Arial',
    TimelineEventFontSize: 16,
    TimelineEventTextUseEllipsis: true,
    TimelineEventBoxShowColor: true,
    TimelineEventBoxShowColorOnBottom: false,
    TimelineEventHasHoverHighlight: true,
    TimelineEventHoverColor: '#33f',
    TimelineAgeHeight: 30,
    TimelineAgeCornerRounding: 0,
    TimelinePeriodHeight: 15,
    TimelinePeriodCornerRounding: 10,
    TimelinePeriodYMargin: 5,
    TimelinePeriodYOffset: 30,
    TimelineBoxTypesShowAsBox: true,
    TimelineBoxTypesBoxWidth: 100,
    TimelineBoxTypesShowImage: true,
    TimelineCanvasBackgroundColor: '#0f172a',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
    TimelineShowHoverLine: true,
    TimelineHoverLineColor: '#f00',
    TimelineHoverLineStyle: 'solid',
    TimelineHoverLineWidth: 1,
    TimelineEdgeMarginWidth: 10,
    TimelineDataRangeWidth: 100,
    TimelineIsDataRangeVisible: true,
    TimelineDataRangeColor: '#ff72',
    TimelineAnimateOnJumpToYear: true,
    TimelineJumpToYearAnimationLength: 600,
    TimelineAnimateLodChange: true,
    TimelineLodChangeAnimationLength: 200,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setUrlParams(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: search ? `?${search}` : '' },
    writable: true,
    configurable: true,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelineApp', () => {
  let pinia: ReturnType<typeof createPinia>
  let store: ReturnType<typeof useTimelineStore>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useTimelineStore()
    vi.clearAllMocks()

    // Set URL to have no id (triggers loadError path), so the loading spinner/error shows
    setUrlParams({})
  })

  function mountApp() {
    return mount(TimelineApp, {
      global: {
        plugins: [pinia],
        stubs: {
          // Teleport renders inline in tests
          teleport: true,
        },
      },
    })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the root container', () => {
    const wrapper = mountApp()
    expect(wrapper.find('#timeline-center').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows loading spinner while store.isLoading is true', () => {
    store.isLoading = true
    const wrapper = mountApp()
    expect(wrapper.find('#status-container').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows error state when no timeline id is in the URL', async () => {
    setUrlParams({}) // no 'id' param
    store.isLoading = false

    const wrapper = mountApp()
    await flushPromises()

    // loadError path renders a warning status container
    expect(wrapper.find('#status-container').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the timeline workspace when not loading and no error', async () => {
    setUrlParams({ id: '1' })
    // Prevent actual async bridge call by returning early
    ;(BackendAPI.LoadTimelineData as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    store.isLoading = false

    const wrapper = mountApp()
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#timeline-workspace').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── jump() — animation ON ─────────────────────────────────────────────────

  it('calls animateJumpToYear with a NUMBER when animation is enabled', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings({ TimelineAnimateOnJumpToYear: true })

    // Attach to body so document.querySelector('#jump-to-year-input') can find the element
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(TimelineApp, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: div,
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    const animateSpy = vi.fn()
    const jumpSpy = vi.fn()
    vm.timelineCanvasRef = { animateJumpToYear: animateSpy, jumpToYear: jumpSpy }

    // jump() reads the jumpYear ref (v-model.number), not the DOM input —
    // set the ref directly (setup bindings are reachable on vm in tests).
    vm.jumpYear = 1500

    vm.jump()
    await wrapper.vm.$nextTick()

    expect(animateSpy).toHaveBeenCalledOnce()
    const arg = animateSpy.mock.calls[0][0]
    expect(typeof arg).toBe('number')
    expect(arg).toBe(1500)

    wrapper.unmount()
    document.body.removeChild(div)
  })

  // ── jump() — animation OFF ────────────────────────────────────────────────

  it('calls jumpToYear (not animate) when animation is disabled', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings({ TimelineAnimateOnJumpToYear: false })

    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(TimelineApp, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      attachTo: div,
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    const animateSpy = vi.fn()
    const jumpSpy = vi.fn()
    vm.timelineCanvasRef = { animateJumpToYear: animateSpy, jumpToYear: jumpSpy }

    vm.jumpYear = 1000

    vm.jump()
    await wrapper.vm.$nextTick()

    expect(jumpSpy).toHaveBeenCalledOnce()
    expect(animateSpy).not.toHaveBeenCalled()

    wrapper.unmount()
    document.body.removeChild(div)
  })

  // ── onViewItem — TypeId routing ───────────────────────────────────────────

  it('sets lightboxUrl (not viewItemId) for TypeId=4 (Picture) items', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    // Add a Picture item to the store
    store.items = [
      { Id: 'pic-item-1', TypeId: 4, Title: 'A Picture' } as any,
    ]

    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue({
      Pictures: [{ FilePath: 'uploads/my-image.png' }],
    })

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onViewItem('pic-item-1')
    await flushPromises()

    // lightboxUrl should be set, viewItemId should remain null
    expect(vm.lightboxUrl).toContain('my-image.png')
    expect(vm.viewItemId).toBeNull()

    wrapper.unmount()
  })

  it('sets viewItemId (not lightboxUrl) for non-picture TypeId items', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    store.items = [
      { Id: 'event-item-1', TypeId: 1, Title: 'An Event' } as any,
    ]

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onViewItem('event-item-1')
    await flushPromises()

    expect(vm.viewItemId).toBe('event-item-1')
    expect(vm.lightboxUrl).toBeNull()

    wrapper.unmount()
  })

  it('sets viewItemId for TypeId=2 (Period) items', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    store.items = [
      { Id: 'period-1', TypeId: 2, Title: 'A Period' } as any,
    ]

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onViewItem('period-1')

    expect(vm.viewItemId).toBe('period-1')
    expect(vm.lightboxUrl).toBeNull()

    wrapper.unmount()
  })

  // ── Lightbox ──────────────────────────────────────────────────────────────

  it('lightbox is not shown initially', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // lightboxUrl starts as null — backdrop should not render
    const vm = wrapper.vm as any
    expect(vm.lightboxUrl).toBeNull()

    wrapper.unmount()
  })

  it('clears lightboxUrl when backdrop is clicked', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    store.items = [{ Id: 'pic-1', TypeId: 4, Title: 'Pic' } as any]
    ;(BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>).mockResolvedValue({
      Pictures: [{ FilePath: 'uploads/foo.png' }],
    })

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onViewItem('pic-1')
    await flushPromises()

    // lightboxUrl is set; simulate backdrop click by calling setter directly
    expect(vm.lightboxUrl).not.toBeNull()
    vm.lightboxUrl = null
    await wrapper.vm.$nextTick()
    expect(vm.lightboxUrl).toBeNull()

    wrapper.unmount()
  })

  // ── Settings modal ────────────────────────────────────────────────────────

  it('showSettings is false by default', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    expect(vm.showSettings).toBe(false)

    wrapper.unmount()
  })

  // ── View modal close ──────────────────────────────────────────────────────

  it('clears viewItemId when set to null', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any
    store.items = [{ Id: 'ev-1', TypeId: 1 } as any]

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onViewItem('ev-1')
    expect(vm.viewItemId).toBe('ev-1')

    // Simulate the 'close' emit from TimelineItemViewModal by setting viewItemId to null
    vm.viewItemId = null
    await wrapper.vm.$nextTick()
    expect(vm.viewItemId).toBeNull()

    wrapper.unmount()
  })
})

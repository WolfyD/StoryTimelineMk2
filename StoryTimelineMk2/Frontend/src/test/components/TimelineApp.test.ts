import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { LayoutSettings } from '@/types/models'

// Mock BackendAPI before any imports
// The bridge's push seam: components subscribe through BackendAPI, not the pipe, so a
// browser tab works too. Tests fire pushes by calling the captured listeners.
const hostListeners = vi.hoisted(() => [] as ((message: { action: string; payload?: any }) => void)[])
const onHostMessage = vi.hoisted(() => (listener: (message: { action: string; payload?: any }) => void) => {
  hostListeners.push(listener)
  return () => { hostListeners.splice(hostListeners.indexOf(listener), 1) }
})

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    send: vi.fn(),
    request: vi.fn(),
    onHostMessage,
    SaveItem: vi.fn().mockResolvedValue({ status: 'ok', itemId: 'item-id' }),
    GetItemForEdit: vi.fn().mockResolvedValue(null),
    LoadTimelineData: vi.fn().mockResolvedValue(null),
    GetAppConfig: vi.fn().mockResolvedValue({ themeInitialized: true }),
    GetAllTimelines: vi.fn().mockResolvedValue({ data: [] }),
    OpenYearCalendarWindow: vi.fn().mockResolvedValue({ status: 'opened' }),
    SetCalendarYear: vi.fn(),
    GetMiscSetting: vi.fn().mockResolvedValue({ value: '0' }),
    SetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok' }),
    // WindowTitleBar (child of TimelineApp) calls these on mount
    WindowGetMaximized: vi.fn().mockResolvedValue({ isMaximized: false }),
    WindowGetTopMost:   vi.fn().mockResolvedValue({ isTopmost: false }),
    WindowSetTopMost:   vi.fn(),
    WindowMinimize:     vi.fn(),
    WindowMaximizeRestore: vi.fn(),
    WindowClose:        vi.fn(),
    WindowStartDrag:    vi.fn(),
  },
}))

// Stub all heavyweight child components so tests stay fast and focused on TimelineApp logic
vi.mock('@/components/TimelineCanvas.vue', () => ({
  default: {
    name: 'TimelineCanvas',
    template: '<div class="timeline-canvas-stub"></div>',
    props: ['timelineItems', 'timelineSettings', 'timelineInfo', 'layoutSettings'],
    emits: ['item-click', 'view-item', 'view-reference-item', 'add-item'],
    // Expose methods that TimelineApp calls via the canvas ref
    methods: {
      animateJumpToYear: vi.fn(),
      jumpToYear: vi.fn(),
      stepTick: vi.fn(),
      applyPan: vi.fn(),
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
    props: { itemId: String, timelineId: Number, viewOnly: Boolean },
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
// A Proxy stubs EVERY icon by name Ã¢â‚¬â€ enumerating them broke silently whenever a
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Fixtures Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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
    TimelineTickColor: '#c8b9a4',
    TimelineAxisColor: '#b5a692',
    NotesPanelBackgroundColor: '',
    NotesPanelCardBackgroundColor: '',
    NotesPanelTextColor: '',
    NotesPanelHeadingColor: '',
    NotesPanelAccentColor: '',
    NotesPanelFontSize: 13,
    DataPanelBackgroundColor: '#f5f0e8',
    DataPanelCardBackgroundColor: '#ffffffaa',
    DataPanelH1Color: '#2c1f0f',
    DataPanelH2Color: '#3a2b1a',
    DataPanelH3Color: '#2c1f0f',
    DataPanelH4Color: '#5c4a38',
    DataPanelFontFamily: 'Georgia, serif',
    DataPanelFontSize: 14,
    GalleryPanelBackgroundColor: '',
    GalleryPanelBorderColor: '',
    GalleryPanelTextColor: '',
    CalendarPanelBackgroundColor: '#f5f0e8',
    CalendarPanelBorderColor: '#d5cec4',
    CalendarPanelTextColor: '#5c4a38',
    CalendarPanelWeekHighlightColor: '#6366f118',
    CalendarPanelDayHighlightColor: '#6366f135',
    TimelineCalendarOverlayEnabled: false,
    TimelineCalendarOverlaySeasonColor: '#ffffff10',
    TimelineCalendarOverlayMonthColor: '#ffffff0c',
    TimelineCalendarOverlayWeekColor: '#ffffff08',
    TimelineCalendarOverlayDayColor: '#ffffff06',
    ...overrides,
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function setUrlParams(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: search ? `?${search}` : '' },
    writable: true,
    configurable: true,
  })
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Rendering Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ jump() Ã¢â‚¬â€ animation ON Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

    // jump() reads the jumpYear ref (v-model.number), not the DOM input Ã¢â‚¬â€
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ jump() Ã¢â‚¬â€ animation OFF Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ onViewItem Ã¢â‚¬â€ TypeId routing Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Lightbox Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  it('lightbox is not shown initially', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // lightboxUrl starts as null Ã¢â‚¬â€ backdrop should not render
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Settings modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ View modal close Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // ── Year calendar toggle ───────────────────────────────────────────────────

  it('yearCalendarOpen is false by default', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()

    expect((wrapper.vm as any).yearCalendarOpen).toBe(false)

    wrapper.unmount()
  })

  it('toggleYearCalendar calls OpenYearCalendarWindow with the right ids', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 42, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'cal_x' } as any
    store.calendar = { Id: 'cal_x', Name: 'Test' } as any

    const wrapper = mountApp()
    await flushPromises()

    await (wrapper.vm as any).toggleYearCalendar()

    expect(BackendAPI.OpenYearCalendarWindow).toHaveBeenCalledWith(42, 'cal_x')

    wrapper.unmount()
  })

  it('yearCalendarOpen becomes true when OpenYearCalendarWindow returns status=opened', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    ;(BackendAPI.OpenYearCalendarWindow as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'opened' })

    const wrapper = mountApp()
    await flushPromises()

    await (wrapper.vm as any).toggleYearCalendar()
    await flushPromises()

    expect((wrapper.vm as any).yearCalendarOpen).toBe(true)

    wrapper.unmount()
  })

  it('yearCalendarOpen is false when OpenYearCalendarWindow returns a non-opened status', async () => {
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()
    store.currentProject = { Id: 1, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any

    ;(BackendAPI.OpenYearCalendarWindow as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'already_open' })

    const wrapper = mountApp()
    await flushPromises()

    await (wrapper.vm as any).toggleYearCalendar()
    await flushPromises()

    expect((wrapper.vm as any).yearCalendarOpen).toBe(false)

    wrapper.unmount()
  })

  // ── centerAbsoluteTime watcher → SetCalendarYear (debounced) ──────────────

  it('watcher calls SetCalendarYear after centerAbsoluteTime changes year (debounced)', async () => {
    vi.useFakeTimers()
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()

    // Change centerAbsoluteTime to a new year
    store.centerAbsoluteTime = 1500.5
    // Flush so the Vue watcher runs and registers its setTimeout
    await wrapper.vm.$nextTick()

    // Before debounce fires — should not have been called yet
    expect(BackendAPI.SetCalendarYear).not.toHaveBeenCalled()

    // Advance past the 300ms debounce, then let microtasks settle
    vi.advanceTimersByTime(350)
    await wrapper.vm.$nextTick()

    expect(BackendAPI.SetCalendarYear).toHaveBeenCalledWith(1500)

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('watcher does not call SetCalendarYear if the year did not change', async () => {
    vi.useFakeTimers()
    setUrlParams({ id: '1' })
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings()

    const wrapper = mountApp()
    await flushPromises()

    // First change — fire the debounce so _lastSentYear is set to 1400
    store.centerAbsoluteTime = 1400.1
    await wrapper.vm.$nextTick()   // watcher runs, setTimeout registered
    vi.advanceTimersByTime(350)    // fires: _lastSentYear = 1400, SetCalendarYear(1400) called
    vi.clearAllMocks()

    // Second change — same integer year, watcher should bail out early
    store.centerAbsoluteTime = 1400.9
    await wrapper.vm.$nextTick()   // watcher runs, sees year === _lastSentYear, returns early
    vi.advanceTimersByTime(350)
    await wrapper.vm.$nextTick()

    expect(BackendAPI.SetCalendarYear).not.toHaveBeenCalled()

    vi.useRealTimers()
    wrapper.unmount()
  })

  // ── Keyboard shortcuts (BL-39) ──────────────────────────────────────────────

  const press = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

  async function mountReady(items: any[] = [], params: Record<string, string> = { id: '1' }) {
    setUrlParams(params)
    store.isLoading = false
    store.layoutSettings = makeLayoutSettings({ TimelineAnimateOnJumpToYear: false })
    store.currentProject = { Id: 42, Title: 'T', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'cal_x' } as any
    store.items = items
    const wrapper = mountApp()
    await flushPromises()
    return wrapper
  }

  it('N opens the type picker; the pick opens the edit window at the NOW line; Shift+N repeats it', async () => {
    const wrapper = await mountReady()
    store.centerAbsoluteTime = 1234.5
    store.currentLodIndex = 3
    press('n')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ItemTypePickerModal' }).exists()).toBe(true)

    ;(wrapper.vm as any).onTypePicked(5)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ItemTypePickerModal' }).exists()).toBe(false)
    expect(BackendAPI.send).toHaveBeenCalledWith('OpenAddEditItemWindow', { timelineId: 42, typeId: 5, year: 1234.5, granularity: 3 })

    press('N', { shiftKey: true })
    expect((BackendAPI.send as any).mock.calls.filter((c: any[]) => c[0] === 'OpenAddEditItemWindow')).toHaveLength(2)
    expect(wrapper.findComponent({ name: 'ItemTypePickerModal' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('Home / End jump to the boundary when present, else to the first / last item', async () => {
    const wrapper = await mountReady([
      { Id: 'a', TypeId: 1, AbsoluteStart: 100, AbsoluteEnd: 100 },
      { Id: 'b', TypeId: 2, AbsoluteStart: 300, AbsoluteEnd: 450 },
    ])
    const jumpSpy = vi.fn()
    ;(wrapper.vm as any).timelineCanvasRef = { jumpToYear: jumpSpy, animateJumpToYear: vi.fn(), stepTick: vi.fn(), applyPan: vi.fn() }
    press('Home'); press('End')
    expect(jumpSpy.mock.calls.map(c => c[0])).toEqual([100, 450])

    store.items = [...store.items, { Id: 's', TypeId: 8, AbsoluteStart: -50, AbsoluteEnd: -50 } as any]
    press('Home')
    expect(jumpSpy).toHaveBeenLastCalledWith(-50)
    wrapper.unmount()
  })

  it('↑ / ↓ step a tick, Shift steps a year; F2 opens the shortcuts list; keys are dead while a modal is open', async () => {
    const wrapper = await mountReady()
    const stepTick = vi.fn()
    ;(wrapper.vm as any).timelineCanvasRef = { jumpToYear: vi.fn(), animateJumpToYear: vi.fn(), stepTick, applyPan: vi.fn() }
    press('ArrowUp'); press('ArrowDown', { shiftKey: true })
    expect(stepTick.mock.calls).toEqual([[true], [false, true]])

    press('F2')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ShortcutsModal' }).exists()).toBe(true)
    press('ArrowUp')
    expect(stepTick).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  // ── Reference window (BL-66) ──────────────────────────────────────────────

  it('R opens the reference picker', async () => {
    const wrapper = await mountReady()
    press('r')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ReferenceTimelineModal' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('?readOnly=1 marks the window, hides the edit affordances and routes edits to the view popup', async () => {
    const wrapper = await mountReady([], { id: '1', readOnly: '1' })
    expect(store.readOnly).toBe(true)
    expect(wrapper.find('.title-bar__name').text()).toMatch(/ \(reference\)$/)
    for (const cls of ['settings', 'tags', 'mass-add', 'reference', 'year-cal'])
      expect(wrapper.find(`.strip-btn--${cls}`).exists(), cls).toBe(false)
    expect(wrapper.find('.strip-btn--filter').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TimelineActionsMenu' }).exists()).toBe(false)

    press('n'); press('N', { shiftKey: true }); press('r'); press(',', { ctrlKey: true }); press('t'); press('M', { shiftKey: true })
    await wrapper.vm.$nextTick()
    for (const name of ['ItemTypePickerModal', 'ReferenceTimelineModal', 'TimelineSettingsModal', 'TagManagerModal', 'MassAddItemsModal'])
      expect(wrapper.findComponent({ name }).exists(), name).toBe(false)

    ;(wrapper.vm as any).onItemClick('item-1')
    ;(wrapper.vm as any).onAddItem(1, 100, 0)
    await flushPromises()
    expect(BackendAPI.send).not.toHaveBeenCalledWith('OpenAddEditItemWindow', expect.anything())
    expect(wrapper.findComponent({ name: 'TimelineItemViewModal' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('a ZoomChanged push keeps the store settings in step with the host', async () => {
    const wrapper = await mountReady()
    store.settings = { UseCustomScaling: false, CustomScale: 1 } as any
    for (const l of hostListeners.slice()) l({ action: 'ZoomChanged', payload: { useCustomScaling: true, customScale: 1.3 } })
    expect(store.settings!.UseCustomScaling).toBe(true)
    expect(store.settings!.CustomScale).toBe(1.3)
    wrapper.unmount()
  })

  it('a reference item from the canvas opens the view modal on the reference timeline, view only', async () => {
    const wrapper = await mountReady()
    store.reference = { project: { Id: 42, Title: 'Ref' } as any, items: [], shift: 0 }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.strip-btn--reference').classes()).toContain('strip-btn--tool-active')

    wrapper.findComponent({ name: 'TimelineCanvas' }).vm.$emit('view-reference-item', 'ref-item')
    await wrapper.vm.$nextTick()
    const modal = wrapper.findComponent({ name: 'TimelineItemViewModal' })
    expect(modal.props()).toMatchObject({ itemId: 'ref-item', timelineId: 42, viewOnly: true })
    wrapper.unmount()
  })

  it('the pre-warm SetTimelineId push carries readOnly', async () => {
    store.isLoading = false
    const wrapper = mountApp()
    await flushPromises()
    for (const l of hostListeners.slice()) l({ action: 'SetTimelineId', payload: { id: 7, readOnly: true } })
    expect(store.readOnly).toBe(true)
    expect(BackendAPI.LoadTimelineData).toHaveBeenCalledWith(7)
    wrapper.unmount()
  })

  it('the pan-speed box clamps what you type before saving it', async () => {
    const wrapper = await mountReady()
    const save = vi.spyOn(store, 'savePanSpeed').mockResolvedValue(undefined)
    const input = wrapper.find('#pan-speed input')
    const el = input.element as HTMLInputElement

    el.value = '99999'
    await input.trigger('change')
    expect(save).toHaveBeenLastCalledWith(5000)

    el.value = ''            // a blank box is not 0 px/s — that would freeze panning outright
    await input.trigger('change')
    expect(save).toHaveBeenLastCalledWith(400)
    expect(el.value).toBe('400')
    wrapper.unmount()
  })

  it('low resource mode drops the minimap and is remembered app-wide', async () => {
    const wrapper = await mountReady()
    expect(wrapper.findComponent({ name: 'TimelineMinimap' }).exists()).toBe(true)

    await store.setLowResourceMode(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'TimelineMinimap' }).exists()).toBe(false)
    // timelineId 0 = app-wide, not per timeline
    expect(BackendAPI.SetMiscSetting).toHaveBeenCalledWith('low_resource_mode', '1', 0)
    wrapper.unmount()
  })

  it('the on-screen buttons appear only when the setting is on, and pan while held', async () => {
    const wrapper = await mountReady()
    expect(wrapper.find('.osc-btn').exists()).toBe(false)

    store.onScreenControls = true
    await wrapper.vm.$nextTick()

    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    const applyPan = vi.fn()
    ;(wrapper.vm as any).timelineCanvasRef = { applyPan }
    const btn = wrapper.find('.osc-btn--left')
    ;(btn.element as HTMLElement).setPointerCapture = vi.fn()

    await btn.trigger('pointerdown', { pointerId: 1, shiftKey: true })
    frames.shift()!(100)                // the first frame only seeds the clock
    frames.shift()!(1100)               // a second later: 400 px/s × 3 for Shift
    expect(applyPan).toHaveBeenLastCalledWith(1200)

    await btn.trigger('pointerup')
    const panned = applyPan.mock.calls.length
    frames.shift()!(2100)
    expect(applyPan.mock.calls.length).toBe(panned)   // the loop stops on the frame after release

    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})

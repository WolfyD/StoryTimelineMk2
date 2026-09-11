import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { LayoutSettings, TimelineSettings } from '@/types/models'

// Mock BackendAPI before importing the component
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetLayoutSettingsList: vi.fn().mockResolvedValue([{ Id: 'ls_default', Name: 'Default' }]),
    GetSystemFonts: vi.fn().mockResolvedValue(['Arial', 'Times New Roman']),
    SaveSettings: vi.fn().mockResolvedValue({ status: 'ok' }),
    SaveLayoutSettings: vi.fn().mockResolvedValue({ status: 'ok', layoutSettings: null }),
    SaveHiddenRange: vi.fn(),
    DeleteHiddenRange: vi.fn(),
    GetLayoutSettingsById: vi.fn(),
    CreateLayoutPreset: vi.fn(),
    request: vi.fn(),
    send: vi.fn(),
  },
}))

// Stub FontPicker to avoid system-font dependencies
vi.mock('@/components/FontPicker.vue', () => ({
  default: {
    name: 'FontPicker',
    template: '<select class="font-picker-stub"><option>Arial</option></select>',
    props: ['modelValue', 'fonts'],
    emits: ['update:modelValue'],
  },
}))

import TimelineSettingsModal from '@/components/TimelineSettingsModal.vue'
import { BackendAPI } from '@/bridge/api'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<TimelineSettings> = {}): TimelineSettings {
  return {
    Font: 'Arial',
    FontSizeScale: 1.0,
    PixelsPerSubtick: 20,
    CustomCss: '',
    UseCustomCss: false,
    IsFullscreen: false,
    ShowGuides: true,
    WindowSizeX: 1280,
    WindowSizeY: 720,
    WindowPositionX: 0,
    WindowPositionY: 0,
    UseCustomScaling: false,
    CustomScale: 1.0,
    DisplayRadius: 10,
    CanvasSettings: {
      showYearMarkers: true,
      fontFamily: 'Arial',
      fontSize: 14,
      fontStyle: 'normal',
      textColor: '#000',
      textOffsetX: 0,
      textOffsetY: 0,
      letterSpacing: 0,
      defaultSplitterDistance: 300,
    },
    ...overrides,
  }
}

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
    TimelineCanvasBackgroundColor: '#f1e7d5',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelineSettingsModal', () => {
  let pinia: ReturnType<typeof createPinia>
  let store: ReturnType<typeof useTimelineStore>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useTimelineStore()
    // Give the store a currentProject so BackendAPI calls can receive a valid Id
    store.currentProject = { Id: 1, Title: 'Test Timeline', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any
    vi.clearAllMocks()
  })

  function mountModal(props: { settings?: TimelineSettings; layoutSettings?: LayoutSettings } = {}) {
    return mount(TimelineSettingsModal, {
      props: {
        settings: props.settings ?? makeSettings(),
        layoutSettings: props.layoutSettings ?? makeLayoutSettings(),
      },
      global: { plugins: [pinia] },
    })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the modal panel', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.modal-panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it('pre-fills PixelsPerSubtick input from settings prop', async () => {
    const wrapper = mountModal({ settings: makeSettings({ PixelsPerSubtick: 42 }) })
    await flushPromises()

    const inputs = wrapper.findAll('input[type="number"]')
    // Find the Pixels per Subtick input by its presence in the form
    const ppsInput = inputs.find(i => (i.element as HTMLInputElement).value === '42')
    expect(ppsInput).toBeDefined()
    wrapper.unmount()
  })

  // NOTE: hidden-range management moved from this modal to TimelineActionsMenu
  // when the activity strip was introduced — those tests now live in
  // TimelineActionsMenu.test.ts.

  // ── save ──────────────────────────────────────────────────────────────────

  it('calls both BackendAPI.SaveSettings and BackendAPI.SaveLayoutSettings on save', async () => {
    ;(BackendAPI.SaveSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', layoutSettings: makeLayoutSettings() })

    const wrapper = mountModal()
    await flushPromises()

    const saveBtn = wrapper.find('.btn-save')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(BackendAPI.SaveSettings).toHaveBeenCalledOnce()
    expect(BackendAPI.SaveLayoutSettings).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('calls store.setLayoutSettings when save succeeds and layoutSettings is returned', async () => {
    const returnedLs = makeLayoutSettings({ Id: 'ls_updated', Name: 'Updated' })
    ;(BackendAPI.SaveSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'ok',
      layoutSettings: returnedLs,
    })

    const setLayoutSettingsSpy = vi.spyOn(store, 'setLayoutSettings')

    const wrapper = mountModal()
    await flushPromises()

    const saveBtn = wrapper.find('.btn-save')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(setLayoutSettingsSpy).toHaveBeenCalledOnce()
    expect(setLayoutSettingsSpy).toHaveBeenCalledWith(returnedLs)
    wrapper.unmount()
  })

  it('shows error message when save fails', async () => {
    ;(BackendAPI.SaveSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'error' })
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const wrapper = mountModal()
    await flushPromises()

    const saveBtn = wrapper.find('.btn-save')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-msg').exists()).toBe(true)
    expect(wrapper.find('.error-msg').text()).toContain('Save failed')
    wrapper.unmount()
  })

  // ── Escape key ────────────────────────────────────────────────────────────

  it('emits "close" when Escape key is pressed', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.vm.$nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits "close" when the X button in the header is clicked', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const closeBtn = wrapper.find('.close-btn')
    await closeBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits "close" when Cancel button in footer is clicked', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const cancelBtn = wrapper.find('.btn-cancel')
    await cancelBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})

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
    GetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
    SetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok' }),
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Fixtures Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeSettings(overrides: Partial<TimelineSettings> = {}): TimelineSettings {
  return Object.assign({
    PixelsPerSubtick: 20,
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
    TimelineMinimised: false,
    HeaderMode: 0,
    PanSpeedMultiplier: 1,
    PanDeadzone: 0,
    KeyboardPanSpeed: 1,
    DefaultItemColor: '#888888',
  }, overrides)
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return Object.assign({
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
    TimelinePictureCaptionFontSize: 12,
    TimelineCharacterCaptionFontSize: 12,
    TimelineCanvasBackgroundColor: '#f1e7d5',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineNowLineWidth: 2,
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
    TimelineTickMarkerTextAngled: false,
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
    NotesPanelBackgroundColor: '#f9f7fe',
    NotesPanelCardBackgroundColor: '#e8e4f5',
    NotesPanelTextColor: '#1e1640',
    NotesPanelHeadingColor: '#5b4d8a',
    NotesPanelAccentColor: '#6366f1',
    NotesPanelFontSize: 13,
    DataPanelBackgroundColor: '#f5f0e8',
    DataPanelCardBackgroundColor: '#ffffffaa',
    DataPanelH1Color: '#2c1f0f',
    DataPanelH2Color: '#3a2b1a',
    DataPanelH3Color: '#2c1f0f',
    DataPanelH4Color: '#5c4a38',
    DataPanelFontFamily: 'Georgia, serif',
    DataPanelFontSize: 14,
    GalleryPanelBackgroundColor: '#f5f0e8',
    GalleryPanelBorderColor: '#d5cec4',
    GalleryPanelTextColor: '#5c4a38',
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
    TimelineBreakFillColor: '#ffffff',
    TimelineBreakBorderColor: '#000000',
    MeasureLineColor: '#000000',
  }, overrides)
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Rendering Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  it('renders the modal panel', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.bm-panel').exists()).toBe(true)
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
  // when the activity strip was introduced Ã¢â‚¬â€ those tests now live in
  // TimelineActionsMenu.test.ts.

  // Ã¢â€â‚¬Ã¢â€â‚¬ save Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  it('color swatches load per timeline, edit in their own modal, and save alongside the settings', async () => {
    ;(BackendAPI.GetMiscSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) =>
      ({ status: 'ok', value: key === 'color_swatches' ? JSON.stringify(['#111111', ...Array(11).fill('#222222')]) : null }))
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const wrapper = mountModal()
    await flushPromises()

    expect(BackendAPI.GetMiscSetting).toHaveBeenCalledWith('color_swatches', 1)
    const dots = wrapper.findAll('.swatch-preview .swatch-dot')
    expect(dots).toHaveLength(12)
    expect((dots[0]!.element as HTMLElement).style.background).toBe('#111111')
    expect(wrapper.find('.swatch-grid').exists()).toBe(false)

    await wrapper.find('.swatch-preview').trigger('click')
    const inputs = wrapper.findAll('.swatch-grid input[type="color"]')
    expect(inputs).toHaveLength(12)
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('#111111')

    // Cancel discards the modal's draft
    await inputs[0]!.setValue('#abcdef')
    await wrapper.findAll('.bm-footer .btn-secondary').find(b => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.find('.swatch-grid').exists()).toBe(false)
    expect((wrapper.findAll('.swatch-preview .swatch-dot')[0]!.element as HTMLElement).style.background).toBe('#111111')

    await wrapper.find('.swatch-preview').trigger('click')
    await wrapper.findAll('.swatch-grid input[type="color"]')[0]!.setValue('#abcdef')
    await wrapper.findAll('.bm-footer .btn-primary').find(b => b.text() === 'Apply')!.trigger('click')
    expect(wrapper.find('.swatch-grid').exists()).toBe(false)
    expect((wrapper.findAll('.swatch-preview .swatch-dot')[0]!.element as HTMLElement).style.background).toBe('#abcdef')

    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    const call = (BackendAPI.SetMiscSetting as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === 'color_swatches')!
    expect(call[2]).toBe(1)
    const saved = JSON.parse(call[1])
    expect(saved[0]).toBe('#abcdef')
    expect(saved[1]).toBe('#222222')
    wrapper.unmount()
  })

  it('reset restores the default swatches', async () => {
    ;(BackendAPI.GetMiscSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) =>
      ({ status: 'ok', value: key === 'color_swatches' ? JSON.stringify(Array(12).fill('#222222')) : null }))
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('.swatch-preview').trigger('click')
    await wrapper.find('.reset-btn').trigger('click')
    expect((wrapper.find('.swatch-grid input').element as HTMLInputElement).value).toBe('#ef4444')
    wrapper.unmount()
  })

  it('default LOD mask for new items loads per timeline, toggles per level, and saves', async () => {
    store.lodProfile = [
      { index: 0, formatKey: 'Millennia', stepFraction: 1000 },
      { index: 3, formatKey: 'Years', stepFraction: 1 },
      { index: 5, formatKey: 'Months', stepFraction: 1 / 12 },
    ]
    ;(BackendAPI.GetMiscSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) =>
      ({ status: 'ok', value: key === 'default_lod_mask' ? '8' : null }))   // only index 3
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('.lod-summary').text()).toBe('Years')
    await wrapper.find('.lod-summary').trigger('click')
    const rows = wrapper.findAll('.lod-row')
    expect(rows.map(r => r.find('.lod-name').text())).toEqual(['Millennia', 'Years', 'Months'])
    expect(rows.map(r => (r.find('input').element as HTMLInputElement).checked)).toEqual([false, true, false])

    await rows[2]!.find('input').trigger('change')   // + index 5
    await wrapper.findAll('.bm-footer .btn-primary').find(b => b.text() === 'Apply')!.trigger('click')
    expect(wrapper.find('.lod-row').exists()).toBe(false)
    expect(wrapper.find('.lod-summary').text()).toBe('Years, Months')

    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    const call = (BackendAPI.SetMiscSetting as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === 'default_lod_mask')!
    expect(call.slice(1)).toEqual([String(8 | 32), 1])
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

  it('header mode select is pre-filled from settings and sent on save', async () => {
    ;(BackendAPI.SaveSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })
    ;(BackendAPI.SaveLayoutSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const wrapper = mountModal({ settings: makeSettings({ HeaderMode: 1 }) })
    await flushPromises()

    const select = wrapper.findAll('select').find(s => s.text().includes('Compact'))!
    expect((select.element as HTMLSelectElement).value).toBe('1')

    await select.setValue('2')
    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    expect((BackendAPI.SaveSettings as ReturnType<typeof vi.fn>).mock.calls[0][0].headerMode).toBe(2)
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Escape key Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

    const closeBtn = wrapper.find('.bm-close')
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

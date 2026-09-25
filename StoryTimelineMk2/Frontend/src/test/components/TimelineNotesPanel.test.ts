import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { LayoutSettings, LodLevel } from '@/types/models'

// Mock BackendAPI to prevent real bridge calls
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    SaveNote: vi.fn().mockResolvedValue({ status: 'ok', noteId: 'new-id' }),
    DeleteNote: vi.fn().mockResolvedValue({ status: 'ok' }),
    request: vi.fn(),
    send: vi.fn(),
  },
}))

import TimelineNotesPanel from '@/components/TimelineNotesPanel.vue'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return Object.assign({
    Id: 'ls_test',
    Name: 'Test',
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
    TimelineBreakFillColor: '#ffffff',
    TimelineBreakBorderColor: '#000000',
    MeasureLineColor: '#000000',
  }, overrides)
}

function makeLodProfile(): LodLevel[] {
  return [
    { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
    { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
    { index: 2, formatKey: 'DECADES', stepFraction: 10 },
    { index: 3, formatKey: 'YEARS', stepFraction: 1 },
    { index: 4, formatKey: 'SEASONS', stepFraction: 0.25 },
    { index: 5, formatKey: 'MONTHS', stepFraction: 0.083 },
    { index: 6, formatKey: 'WEEKS', stepFraction: 0.019 },
    { index: 7, formatKey: 'DAYS', stepFraction: 0.00274 },
  ]
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('TimelineNotesPanel', () => {
  // Each test gets a fresh shared pinia so store mutations are visible to the component.
  let pinia: ReturnType<typeof createPinia>
  let store: ReturnType<typeof useTimelineStore>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useTimelineStore()
    vi.clearAllMocks()
  })

  function mountPanel(layoutSettings: LayoutSettings | null = makeLayoutSettings()) {
    return mount(TimelineNotesPanel, {
      props: { layoutSettings },
      // Pass the same pinia instance the store was obtained from
      global: { plugins: [pinia] },
    })
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Tab switching Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('Tab navigation', () => {
    it('Notes tab is active by default', () => {
      expect(store.notesDistanceTab).toBe('notes')

      const wrapper = mountPanel()
      const activeTabs = wrapper.findAll('.tab-btn.active')
      expect(activeTabs.length).toBe(1)
      expect(activeTabs[0].text()).toContain('Notes')
      wrapper.unmount()
    })

    it('clicking the Distance tab switches to distance view', async () => {
      const wrapper = mountPanel()
      const tabs = wrapper.findAll('.tab-btn')
      const distanceTab = tabs.find(t => t.text().includes('Distance'))
      expect(distanceTab).toBeDefined()
      await distanceTab!.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.dist-panel').exists()).toBe(true)
      wrapper.unmount()
    })

    it('shows notes content when notes tab is active', () => {
      const wrapper = mountPanel()
      expect(wrapper.find('.notes-input-row').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ formatPoint behaviour Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('formatPoint (via distance tab)', () => {
    it('shows em-dash placeholder (unset style) when distanceFrom is null', async () => {
      store.lodProfile = makeLodProfile()
      store.setDistanceFrom(null)
      store.setDistanceTo(null)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      const unsetValues = wrapper.findAll('.dist-row-value.unset')
      expect(unsetValues.length).toBeGreaterThanOrEqual(1)
      wrapper.unmount()
    })

    it('shows formatted year string when distanceFrom is set', async () => {
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.setDistanceFrom(1500)
      store.setDistanceTo(null)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      const distRows = wrapper.findAll('.dist-row')
      expect(distRows.length).toBeGreaterThanOrEqual(1)
      const fromValue = distRows[0].find('.dist-row-value')
      expect(fromValue.text()).toContain('1500')
      wrapper.unmount()
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ Distance result visibility Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('distance result', () => {
    it('does not show distance result when only From is set', async () => {
      store.lodProfile = makeLodProfile()
      store.setDistanceFrom(1000)
      store.setDistanceTo(null)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.dist-result').exists()).toBe(false)
      wrapper.unmount()
    })

    it('does not show distance result when only To is set', async () => {
      store.lodProfile = makeLodProfile()
      store.setDistanceFrom(null)
      store.setDistanceTo(2000)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.dist-result').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows distance result when both From and To are set', async () => {
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.setDistanceFrom(1000)
      store.setDistanceTo(2000)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.dist-result').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // Ã¢â€â‚¬Ã¢â€â‚¬ specificity checkbox Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('specificity checkbox', () => {
    it('is present when both From and To are set', async () => {
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.setDistanceFrom(1000)
      store.setDistanceTo(2000)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      const checkbox = wrapper.find('.dist-specificity input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
      wrapper.unmount()
    })

    it('toggling specificity changes output text', async () => {
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      // 1.5-year gap: approximate Ã¢â€ â€™ "1 year", specific Ã¢â€ â€™ "1 year, 6 months"
      store.setDistanceFrom(1000)
      store.setDistanceTo(1001.5)
      store.setNotesDistanceTab('distance')

      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      const resultBefore = wrapper.find('.dist-result-value').text()
      expect(resultBefore).toBeTruthy()

      const checkbox = wrapper.find('.dist-specificity input[type="checkbox"]')
      await checkbox.setValue(true)
      await wrapper.vm.$nextTick()

      const resultAfter = wrapper.find('.dist-result-value').text()
      expect(resultAfter).toBeTruthy()
      // Specific breakdown produces a different string than approximate
      expect(resultAfter).not.toBe(resultBefore)
      wrapper.unmount()
    })
  })
})

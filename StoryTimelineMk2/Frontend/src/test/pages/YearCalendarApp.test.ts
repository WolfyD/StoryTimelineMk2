import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetCalendarById:    vi.fn().mockResolvedValue(null),
    GetItemsForYear:    vi.fn().mockResolvedValue({ status: 'ok', items: [] }),
    WindowGetMaximized: vi.fn().mockResolvedValue({ isMaximized: false }),
    WindowGetTopMost:   vi.fn().mockResolvedValue({ isTopmost: false }),
    WindowSetTopMost:   vi.fn(),
    WindowMinimize:     vi.fn(),
    WindowMaximizeRestore: vi.fn(),
    WindowClose:        vi.fn(),
    WindowStartDrag:    vi.fn(),
  },
}))

// Stub WindowTitleBar — it has its own async setup we don't want here
vi.mock('@/components/WindowTitleBar.vue', () => ({
  default: {
    name: 'WindowTitleBar',
    template: '<div class="title-bar-stub"></div>',
    props: ['title', 'subtitle', 'showMaximize'],
  },
}))

// Stub CalendarMonthGrid — we test it separately
vi.mock('@/components/CalendarMonthGrid.vue', () => ({
  default: {
    name: 'CalendarMonthGrid',
    template: '<div class="month-grid-stub"></div>',
    props: ['monthName', 'monthIndex', 'days', 'weekLength', 'dayLabels', 'weekendDays', 'memorableDays', 'itemDots'],
  },
}))

// useAppTheme is a no-op in tests
vi.mock('@/utils/useAppTheme', () => ({ useAppTheme: vi.fn() }))

import YearCalendarApp from '@/pages/YearCalendarApp.vue'
import { BackendAPI } from '@/bridge/api'

// Gregorian-like calendar with 2 months for testing item mapping
const FAKE_CAL = {
  Id: 'cal_test',
  Name: 'Test Calendar',
  YearDefinition: JSON.stringify({
    length: 365,
    months: 2,
    month_definition: {
      '0': { name: 'January', length: 31 },
      '1': { name: 'February', length: 28 },
    },
    week_definition: {
      length: 7,
      days_have_names: true,
      days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      weekend: [5, 6],
    },
  }),
}

function setUrlParams(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: search ? `?${search}` : '' },
    writable: true,
    configurable: true,
  })
}

describe('YearCalendarApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(BackendAPI.GetCalendarById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: [] })
    ;(BackendAPI.WindowGetTopMost as ReturnType<typeof vi.fn>).mockResolvedValue({ isTopmost: false })
    ;(BackendAPI.WindowGetMaximized as ReturnType<typeof vi.fn>).mockResolvedValue({ isMaximized: false })
    setUrlParams({ timelineId: '5' })
  })

  function mountApp() {
    return mount(YearCalendarApp, {
      global: { stubs: { teleport: true } },
    })
  }

  // ── Initial load ──────────────────────────────────────────────────────────

  it('calls GetCalendarById when calendarId is in the URL', async () => {
    setUrlParams({ timelineId: '5', calendarId: 'cal_test' })
    ;(BackendAPI.GetCalendarById as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_CAL)

    const wrapper = mountApp()
    await flushPromises()

    expect(BackendAPI.GetCalendarById).toHaveBeenCalledWith('cal_test')

    wrapper.unmount()
  })

  it('does not call GetCalendarById when calendarId is absent', async () => {
    setUrlParams({ timelineId: '5' })

    const wrapper = mountApp()
    await flushPromises()

    expect(BackendAPI.GetCalendarById).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('calls GetItemsForYear with the current year on mount', async () => {
    const wrapper = mountApp()
    await flushPromises()

    expect(BackendAPI.GetItemsForYear).toHaveBeenCalledWith(5, expect.any(Number))

    wrapper.unmount()
  })

  it('shows loading state initially and hides it after load', async () => {
    const wrapper = mountApp()

    // Immediately after mount loading indicator should be present
    expect(wrapper.find('.yc-loading').exists()).toBe(true)

    await flushPromises()

    expect(wrapper.find('.yc-loading').exists()).toBe(false)

    wrapper.unmount()
  })

  // ── loadYear ──────────────────────────────────────────────────────────────

  it('loadYear populates items from API response', async () => {
    const fakeItems = [
      { Id: 'i1', Title: 'The Shire Founded', AbsoluteStart: 1400.02, Color: '#f00', TypeId: 1 },
    ]
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: fakeItems })

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.items).toHaveLength(1)
    expect(vm.items[0].Id).toBe('i1')

    wrapper.unmount()
  })

  it('loadYear skips API call when timelineId is 0', async () => {
    setUrlParams({ timelineId: '0' })
    vi.clearAllMocks()
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: [] })

    const wrapper = mountApp()
    await flushPromises()

    expect(BackendAPI.GetItemsForYear).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── itemDaysByMonth computed ──────────────────────────────────────────────

  it('itemDaysByMonth returns empty object when showItems is false', async () => {
    const fakeItems = [
      { Id: 'i1', Title: 'War Begins', AbsoluteStart: 1400.02, Color: '#f00', TypeId: 1 },
    ]
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: fakeItems })

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showItems = false
    await wrapper.vm.$nextTick()

    expect(vm.itemDaysByMonth).toEqual({})

    wrapper.unmount()
  })

  it('itemDaysByMonth maps items into month buckets when showItems is true', async () => {
    // Load calendar so months are populated (otherwise itemDaysByMonth has no month data)
    setUrlParams({ timelineId: '5', calendarId: 'cal_test' })
    ;(BackendAPI.GetCalendarById as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_CAL)

    // AbsoluteStart fractional part 0.02 → day 7 of 365-day year → January
    const fakeItems = [
      { Id: 'i1', Title: 'First Event', AbsoluteStart: 1400.02, Color: '#6366f1', TypeId: 1 },
    ]
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: fakeItems })

    const wrapper = mountApp()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.showItems = true
    await wrapper.vm.$nextTick()

    // Should have at least one month with entries
    const byMonth = vm.itemDaysByMonth as Record<number, Record<number, unknown[]>>
    const monthKeys = Object.keys(byMonth)
    expect(monthKeys.length).toBeGreaterThan(0)

    // Total dots across all months = 1
    const totalDots = Object.values(byMonth).flatMap(days => Object.values(days)).flat()
    expect(totalDots).toHaveLength(1)

    wrapper.unmount()
  })

  // ── SetCalendarYear push ──────────────────────────────────────────────────

  it('onBridgeMessage with SetCalendarYear calls GetItemsForYear with the new year', async () => {
    const wrapper = mountApp()
    await flushPromises()

    // Capture handler BEFORE clearing mocks (clearAllMocks wipes addEventListener call history)
    const addSpy = window.chrome.webview.addEventListener as ReturnType<typeof vi.fn>
    const handler = addSpy.mock.calls.find(([evt]: [string]) => evt === 'message')![1]

    vi.clearAllMocks()
    ;(BackendAPI.GetItemsForYear as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', items: [] })

    handler({ data: { action: 'SetCalendarYear', payload: { year: 1500 } } })

    await flushPromises()

    expect(BackendAPI.GetItemsForYear).toHaveBeenCalledWith(5, 1500)

    wrapper.unmount()
  })

  it('onBridgeMessage ignores non-SetCalendarYear actions', async () => {
    const wrapper = mountApp()
    await flushPromises()

    // Capture handler BEFORE clearing mocks
    const addSpy = window.chrome.webview.addEventListener as ReturnType<typeof vi.fn>
    const handler = addSpy.mock.calls.find(([evt]: [string]) => evt === 'message')![1]

    vi.clearAllMocks()

    handler({ data: { action: 'SomethingElse', payload: { year: 9999 } } })

    await flushPromises()

    expect(BackendAPI.GetItemsForYear).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── Listener cleanup ──────────────────────────────────────────────────────

  it('removes the message listener on unmount', async () => {
    const wrapper = mountApp()
    await flushPromises()

    const removeSpy = window.chrome.webview.removeEventListener as ReturnType<typeof vi.fn>
    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { HiddenRange } from '@/types/models'

// Mock BackendAPI before importing the component
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    SaveHiddenRange: vi.fn(),
    DeleteHiddenRange: vi.fn(),
    ShiftTimelineItems: vi.fn(),
    request: vi.fn(),
    send: vi.fn(),
  },
}))

// Mock phosphor icons to avoid SVG issues in happy-dom — Proxy stubs every icon.
vi.mock('@phosphor-icons/vue', () => {
  const cache = new Map<string, object>()
  const isIconKey = (prop: string | symbol): prop is string =>
    typeof prop === 'string' && prop !== 'then' && prop !== 'default' && prop !== '__esModule'
  return new Proxy({}, {
    get(_target, prop) {
      if (!isIconKey(prop)) return undefined
      if (!cache.has(prop)) cache.set(prop, { template: '<span class="ph-icon-stub" />', name: prop })
      return cache.get(prop)
    },
    has(_target, prop) {
      return isIconKey(prop)
    },
  })
})

import TimelineActionsMenu from '@/components/TimelineActionsMenu.vue'
import { BackendAPI } from '@/bridge/api'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeHiddenRange(overrides: Partial<HiddenRange> = {}): HiddenRange {
  return {
    Id: 1,
    TimelineId: 1,
    StartYear: 100,
    EndYear: 200,
    Label: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
// Hidden-range management lives in the actions menu popover (it moved here from
// the settings modal when the activity strip was introduced).

describe('TimelineActionsMenu', () => {
  let pinia: ReturnType<typeof createPinia>
  let store: ReturnType<typeof useTimelineStore>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useTimelineStore()
    // currentProject is required for SaveHiddenRange/ShiftTimelineItems calls
    store.currentProject = { Id: 1, Title: 'Test Timeline', Author: '', Description: '', StartYear: 0, Color: null, CalendarId: 'c1' } as any
    vi.clearAllMocks()
  })

  /**
   * Mount and open the popover. The component snapshots store.hiddenRanges at
   * setup, so the store must be populated BEFORE calling this.
   */
  async function mountOpen() {
    const wrapper = mount(TimelineActionsMenu, { global: { plugins: [pinia] } })
    await wrapper.find('.actions-trigger').trigger('click')
    await wrapper.vm.$nextTick()
    return wrapper
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('popover is closed by default and opens on trigger click', async () => {
    const wrapper = mount(TimelineActionsMenu, { global: { plugins: [pinia] } })
    expect(wrapper.find('.actions-popover').exists()).toBe(false)
    await wrapper.find('.actions-trigger').trigger('click')
    expect(wrapper.find('.actions-popover').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows "Hidden Time Ranges" section header', async () => {
    const wrapper = await mountOpen()
    const titles = wrapper.findAll('.action-section-title').map(el => el.text())
    expect(titles.some(t => t.includes('Hidden Time'))).toBe(true)
    wrapper.unmount()
  })

  it('shows existing hidden ranges from the store', async () => {
    store.hiddenRanges = [makeHiddenRange({ Id: 1, StartYear: 500, EndYear: 600 })]

    const wrapper = await mountOpen()
    const rangeRows = wrapper.findAll('.range-row')
    expect(rangeRows).toHaveLength(1)
    expect(rangeRows[0].find('.range-years').text()).toContain('500')
    expect(rangeRows[0].find('.range-years').text()).toContain('600')
    wrapper.unmount()
  })

  // ── addRange validation ────────────────────────────────────────────────────

  it('shows error when addRange is called with empty start year', async () => {
    const wrapper = await mountOpen()

    // Leave start/end inputs empty and click Add
    await wrapper.find('.icon-btn--ok').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.range-error').exists()).toBe(true)
    expect(wrapper.find('.range-error').text()).toContain('Enter both years')
    wrapper.unmount()
  })

  it('shows error when end year is less than or equal to start year', async () => {
    const wrapper = await mountOpen()

    const yearInputs = wrapper.findAll('input.range-input[type="number"]')
    await yearInputs[0].setValue(500)
    await yearInputs[1].setValue(300) // end < start

    await wrapper.find('.icon-btn--ok').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.range-error').exists()).toBe(true)
    expect(wrapper.find('.range-error').text()).toContain('greater than start')
    wrapper.unmount()
  })

  it('calls BackendAPI.SaveHiddenRange with valid start and end', async () => {
    ;(BackendAPI.SaveHiddenRange as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'ok',
      range: makeHiddenRange({ Id: 10, StartYear: 1000, EndYear: 2000 }),
    })

    const wrapper = await mountOpen()

    const yearInputs = wrapper.findAll('input.range-input[type="number"]')
    await yearInputs[0].setValue(1000)
    await yearInputs[1].setValue(2000)

    await wrapper.find('.icon-btn--ok').trigger('click')
    await flushPromises()

    expect(BackendAPI.SaveHiddenRange).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('calls store.setHiddenRanges after a successful addRange', async () => {
    const newRange = makeHiddenRange({ Id: 42, StartYear: 1000, EndYear: 2000 })
    ;(BackendAPI.SaveHiddenRange as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'ok',
      range: newRange,
    })

    const setHiddenRangesSpy = vi.spyOn(store, 'setHiddenRanges')

    const wrapper = await mountOpen()

    const yearInputs = wrapper.findAll('input.range-input[type="number"]')
    await yearInputs[0].setValue(1000)
    await yearInputs[1].setValue(2000)

    await wrapper.find('.icon-btn--ok').trigger('click')
    await flushPromises()

    expect(setHiddenRangesSpy).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── deleteRange ───────────────────────────────────────────────────────────

  it('calls BackendAPI.DeleteHiddenRange with correct id when delete button is clicked', async () => {
    store.hiddenRanges = [makeHiddenRange({ Id: 99, StartYear: 300, EndYear: 400 })]
    ;(BackendAPI.DeleteHiddenRange as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const wrapper = await mountOpen()

    const deleteBtn = wrapper.find('.icon-btn--danger')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await flushPromises()

    expect(BackendAPI.DeleteHiddenRange).toHaveBeenCalledWith(99)
    wrapper.unmount()
  })

  it('calls store.setHiddenRanges after deleteRange succeeds', async () => {
    store.hiddenRanges = [makeHiddenRange({ Id: 99 })]
    ;(BackendAPI.DeleteHiddenRange as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })

    const setHiddenRangesSpy = vi.spyOn(store, 'setHiddenRanges')

    const wrapper = await mountOpen()

    await wrapper.find('.icon-btn--danger').trigger('click')
    await flushPromises()

    expect(setHiddenRangesSpy).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})

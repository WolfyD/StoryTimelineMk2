import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const GetSessionHistory = vi.fn()
const GetSessionChanges = vi.fn()
const ExportSessionChanges = vi.fn()

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetSessionHistory: (...args: unknown[]) => GetSessionHistory(...args),
    GetSessionChanges: (...args: unknown[]) => GetSessionChanges(...args),
    ExportSessionChanges: (...args: unknown[]) => ExportSessionChanges(...args),
  },
}))

import ExportTimelineModal from '@/components/ExportTimelineModal.vue'

const TODAY = '2026-09-22'
const DAYS = [
  { day: TODAY, startedAt: `${TODAY} 09:00:00`, added: 1, changed: 0, removed: 0, open: true },
  { day: '2026-09-20', startedAt: '2026-09-20 10:00:00', added: 0, changed: 2, removed: 0, open: false },
  { day: '2026-09-18', startedAt: '2026-09-18 10:00:00', added: 3, changed: 0, removed: 1, open: false },
  { day: '2026-09-14', startedAt: '2026-09-14 10:00:00', added: 5, changed: 0, removed: 0, open: false },
]

function history(over: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    history: {
      timelineTitle: 'The Long Winter',
      lastExportedAt: '2026-09-18 21:30:00',
      lastExportDay: '2026-09-18',
      days: DAYS,
      ...over,
    },
  }
}

// The day, not the label: how a date reads depends on the locale the tests happen to run in.
const ticked = (w: ReturnType<typeof mount>) =>
  w
    .findAll('.days li')
    .filter((li) => (li.find('input').element as HTMLInputElement).checked)
    .map((li) => li.attributes('data-day'))

async function open(over: Record<string, unknown> = {}) {
  GetSessionHistory.mockResolvedValue(history(over))
  const wrapper = mount(ExportTimelineModal, { props: { title: 'The Long Winter', sessionTimelineId: 3 } })
  await wrapper.findAll('.tab')[1]!.trigger('click')
  await flushPromises()
  return wrapper
}

describe('ExportTimelineModal — my work', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // A fixed "now", so "the day after the last export" is not a moving target.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
    GetSessionChanges.mockResolvedValue({
      status: 'ok',
      summary: {
        sessionStartedAt: `${TODAY} 09:00:00`,
        timelineTitle: 'The Long Winter',
        added: 1,
        changed: 2,
        removed: 0,
        entries: [{ id: 'a', op: 'insert', title: 'The thaw' }],
      },
    })
  })

  afterEach(() => vi.useRealTimers())

  // The whole point of recording the last export: the days already sent must not go again.
  it('starts on everything after the last export, not including it', async () => {
    const wrapper = await open()

    expect(ticked(wrapper)).toEqual([TODAY, '2026-09-20'])
    expect(GetSessionChanges).toHaveBeenLastCalledWith(3, [TODAY, '2026-09-20'])
    expect(wrapper.find('.days li').text()).toContain('Today')
    expect(wrapper.find('.pick-btn--primary').text()).toContain('18')
  })

  it('falls back to all of it when nothing was ever exported', async () => {
    const wrapper = await open({ lastExportedAt: null, lastExportDay: null })

    expect(ticked(wrapper)).toHaveLength(4)
    expect(wrapper.find('.pick-btn--primary').exists()).toBe(false)
  })

  it('clamps the ticks to the dates you type', async () => {
    const wrapper = await open()

    const [from, to] = wrapper.findAll('.clamp-row input')
    await from!.setValue('2026-09-15')
    await to!.setValue('2026-09-20')
    await flushPromises()

    // 14 Sep is before the range, today is after it.
    expect(ticked(wrapper)).toEqual(['2026-09-20', '2026-09-18'])
    expect(GetSessionChanges).toHaveBeenLastCalledWith(3, ['2026-09-20', '2026-09-18'])
  })

  it('exports exactly the days that are ticked', async () => {
    ExportSessionChanges.mockResolvedValue({ status: 'ok', path: 'C:/tmp/work.stlc' })
    const wrapper = await open()

    await wrapper.findAll('.days input')[0]!.setValue(false)
    await flushPromises()
    await wrapper.find('[data-primary]').trigger('click')

    expect(ExportSessionChanges).toHaveBeenCalledWith(3, ['2026-09-20'])
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('will not export nothing', async () => {
    const wrapper = await open()

    await wrapper.find('.clamp-row input')!.setValue('2026-09-23')
    await flushPromises()

    expect(ticked(wrapper)).toEqual([])
    expect(wrapper.find('[data-primary]').attributes('disabled')).toBeDefined()
  })

  // Without a timeline id the modal is the plain timeline export it has always been.
  it('shows no tabs outside a timeline', () => {
    const wrapper = mount(ExportTimelineModal, { props: { title: 'The Long Winter' } })
    expect(wrapper.find('.tab-bar').exists()).toBe(false)
    expect(GetSessionHistory).not.toHaveBeenCalled()
  })
})

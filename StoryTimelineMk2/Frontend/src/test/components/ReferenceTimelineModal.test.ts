import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'

vi.mock('@phosphor-icons/vue', () => ({
  PhX: { template: '<span class="ph-icon-stub" />', name: 'PhX' },
  PhAppWindow: { template: '<span class="ph-icon-stub" />', name: 'PhAppWindow' },
  PhStack: { template: '<span class="ph-icon-stub" />', name: 'PhStack' },
  PhWarning: { template: '<span class="ph-icon-stub" />', name: 'PhWarning' },
}))

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    send: vi.fn(),
    GetAllTimelines: vi.fn().mockResolvedValue({ data: [
      { Id: 1, Title: 'Active', Author: 'A', Color: '#111' },
      { Id: 2, Title: 'Other',  Author: 'B', Color: null },
      { Id: 3, Title: '',       Author: '',  Color: '#333' },
    ] }),
    LoadTimelineData: vi.fn(),
  },
}))

import ReferenceTimelineModal from '@/components/ReferenceTimelineModal.vue'
import { BackendAPI } from '@/bridge/api'

const refProject = { Id: 2, Title: 'Other', CalendarId: 'cal-b', Calendar: { Name: 'Lunar' } }

describe('ReferenceTimelineModal', () => {
  let store: ReturnType<typeof useTimelineStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTimelineStore()
    store.currentProject = { Id: 1, CalendarId: 'cal-a' } as any
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists every timeline but the current one; the window button opens it read-only and closes', async () => {
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    expect(w.findAll('.rt-row .rt-title').map(t => t.text())).toEqual(['Other', 'Untitled'])

    await w.findAll('.rt-row .rt-open')[0]!.trigger('click')
    expect(BackendAPI.send).toHaveBeenCalledWith('OpenTimeline', { id: 2, readOnly: true })
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('says so when there is nothing else to open', async () => {
    ;(BackendAPI.GetAllTimelines as any).mockResolvedValueOnce({ data: [{ Id: 1, Title: 'Active' }] })
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    expect(w.findAll('.rt-row')).toHaveLength(0)
    expect(w.text()).toContain('No other timelines yet')
    w.unmount()
  })

  // ── Underlay (BL-66 step 2) ───────────────────────────────────────────────

  it('the stack button loads the timeline underneath (boundaries dropped) and closes', async () => {
    ;(BackendAPI.LoadTimelineData as any).mockResolvedValueOnce({
      Project: refProject,
      Items: [{ Id: 'a', TypeId: 1 }, { Id: 's', TypeId: 8 }, { Id: 'e', TypeId: 9 }],
    })
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    await w.findAll('.rt-row .rt-under')[0]!.trigger('click')
    await flushPromises()
    expect(BackendAPI.LoadTimelineData).toHaveBeenCalledWith(2)
    expect(store.reference?.project.Id).toBe(2)
    expect(store.reference?.items.map(i => i.Id)).toEqual(['a'])
    expect(store.reference?.shift).toBe(0)
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('a failed load stays open and shows the error', async () => {
    ;(BackendAPI.LoadTimelineData as any).mockResolvedValueOnce({ status: 'error', message: 'boom' })
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    await w.findAll('.rt-row .rt-under')[0]!.trigger('click')
    await flushPromises()
    expect(store.reference).toBeNull()
    expect(w.emitted('close')).toBeUndefined()
    expect(w.find('.rt-error').text()).toContain('boom')
    expect(console.error).toHaveBeenCalled()
    w.unmount()
  })

  it('shows the active underlay with a calendar warning, a display-only shift and Remove', async () => {
    store.reference = { project: refProject as any, items: [], shift: 0 }
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    expect(w.find('.rt-active-title').text()).toBe('Underneath: Other')
    expect(w.find('.rt-warn').text()).toContain('Different calendar (Lunar)')

    await w.find('.rt-shift input').setValue('-40')
    expect(store.reference!.shift).toBe(-40)

    await w.find('.rt-remove').trigger('click')
    expect(store.reference).toBeNull()
    expect(w.find('.rt-active').exists()).toBe(false)
    w.unmount()
  })

  it('no calendar warning when both timelines share a calendar', async () => {
    store.reference = { project: { ...refProject, CalendarId: 'cal-a' } as any, items: [], shift: 0 }
    const w = mount(ReferenceTimelineModal, { props: { currentId: 1 } })
    await flushPromises()
    expect(w.find('.rt-warn').exists()).toBe(false)
    w.unmount()
  })
})

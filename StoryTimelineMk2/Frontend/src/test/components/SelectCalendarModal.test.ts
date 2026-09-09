import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        GetCalendarList: vi.fn(),
        send: vi.fn(),
        request: vi.fn(),
    },
}))

vi.mock('@phosphor-icons/vue', () => ({
    PhX: { template: '<span />', name: 'PhX' },
    PhArrowsClockwise: { template: '<span />', name: 'PhArrowsClockwise' },
}))

import SelectCalendarModal from '@/components/SelectCalendarModal.vue'
import { BackendAPI } from '@/bridge/api'

const TWO_CALS = [
    { Id: 'cal-1', Name: 'Gregorian' },
    { Id: 'cal-2', Name: 'Fantasy Calendar' },
]

describe('SelectCalendarModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
        ;(BackendAPI.GetCalendarList as ReturnType<typeof vi.fn>).mockResolvedValue(TWO_CALS)
    })

    it('renders the modal panel', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        expect(wrapper.find('.modal-panel').exists()).toBe(true)
        wrapper.unmount()
    })

    it('calls GetCalendarList on mount', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        expect(BackendAPI.GetCalendarList).toHaveBeenCalledOnce()
        wrapper.unmount()
    })

    it('renders loaded calendars as select options', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        const options = wrapper.findAll('option:not([disabled])')
        expect(options.length).toBe(2)
        expect(options[0].text()).toBe('Gregorian')
        expect(options[1].text()).toBe('Fantasy Calendar')
        wrapper.unmount()
    })

    it('emits skipped when Skip button is clicked', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('skipped')).toBeTruthy()
        expect(wrapper.emitted('selected')).toBeFalsy()
        wrapper.unmount()
    })

    it('emits skipped when backdrop is clicked', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        await wrapper.find('.modal-backdrop').trigger('click')
        expect(wrapper.emitted('skipped')).toBeTruthy()
        wrapper.unmount()
    })

    it('Select button is disabled when no calendar is selected', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
        wrapper.unmount()
    })

    it('emits selected with the chosen calendar Id', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        await wrapper.find('select').setValue('cal-2')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.emitted('selected')).toBeTruthy()
        expect(wrapper.emitted('selected')![0]).toEqual(['cal-2'])
        wrapper.unmount()
    })

    it('calls GetCalendarList again when Refresh is clicked', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        vi.clearAllMocks()
        ;(BackendAPI.GetCalendarList as ReturnType<typeof vi.fn>).mockResolvedValue(TWO_CALS)
        // first .cal-btn is the refresh icon button
        await wrapper.findAll('.cal-btn')[0].trigger('click')
        await flushPromises()
        expect(BackendAPI.GetCalendarList).toHaveBeenCalledOnce()
        wrapper.unmount()
    })

    it('auto-selects a newly added calendar after refresh', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        ;(BackendAPI.GetCalendarList as ReturnType<typeof vi.fn>).mockResolvedValue([
            ...TWO_CALS,
            { Id: 'cal-new', Name: 'Brand New' },
        ])
        await wrapper.findAll('.cal-btn')[0].trigger('click')
        await flushPromises()
        expect((wrapper.vm as any).selectedId).toBe('cal-new')
        wrapper.unmount()
    })

    it('calls send(OpenCalendarEditorWindow) when "+ Create New" is clicked', async () => {
        const wrapper = mount(SelectCalendarModal)
        await flushPromises()
        // second .cal-btn is "+ Create New"
        await wrapper.findAll('.cal-btn')[1].trigger('click')
        expect(BackendAPI.send).toHaveBeenCalledWith('OpenCalendarEditorWindow', { calendarId: null })
        wrapper.unmount()
    })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        GetCalendarList: vi.fn(),
        ExportCalendar: vi.fn(),
        ImportCalendar: vi.fn(),
        DeleteCalendar: vi.fn(),
        GetCalendarById: vi.fn(),
        request: vi.fn(),
        send: vi.fn(),
    },
}))

// Proxy stub: every Phosphor icon becomes an empty span.
vi.mock('@phosphor-icons/vue', () => {
    const cache = new Map<string, object>()
    const isIconKey = (prop: string | symbol): prop is string =>
        typeof prop === 'string' && prop !== 'then' && prop !== 'default' && prop !== '__esModule'
    return new Proxy({}, {
        get(_t, prop) {
            if (!isIconKey(prop)) return undefined
            if (!cache.has(prop)) cache.set(prop, { template: '<span />', name: prop })
            return cache.get(prop)
        },
        has: (_t, prop) => isIconKey(prop),
    })
})

import CalendarManagerModal from '@/components/CalendarManagerModal.vue'
import { BackendAPI } from '@/bridge/api'

const list = () => BackendAPI.GetCalendarList as ReturnType<typeof vi.fn>
const exp = () => BackendAPI.ExportCalendar as ReturnType<typeof vi.fn>
const imp = () => BackendAPI.ImportCalendar as ReturnType<typeof vi.fn>

function mountModal() {
    return mount(CalendarManagerModal, { global: { stubs: { teleport: true } } })
}

describe('CalendarManagerModal — export / import', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
        list().mockResolvedValue([
            { Id: 'cal_default_gregorian', Name: 'Gregorian', UsageCount: 2 },
            { Id: 'c2', Name: 'Elven', UsageCount: 0 },
        ])
    })

    it('Export sends the row id and reports the written path; cancel says nothing', async () => {
        exp().mockResolvedValueOnce({ status: 'ok', path: 'C:\\out\\Elven.json' })
        const wrapper = mountModal()
        await flushPromises()

        const rows = wrapper.findAll('.cal-row')
        expect(rows.length).toBe(2)
        await rows[1]!.find('.action-btn.export').trigger('click')
        await flushPromises()
        expect(exp()).toHaveBeenCalledWith({ id: 'c2' })
        expect(wrapper.find('.notice').text()).toBe('Exported "Elven" to C:\\out\\Elven.json.')

        exp().mockResolvedValueOnce({ status: 'cancelled' })
        await rows[0]!.find('.action-btn.export').trigger('click')
        await flushPromises()
        expect(wrapper.find('.notice').exists()).toBe(false)
        wrapper.unmount()
    })

    it('Import reloads the list, announces the name and warns about a name collision', async () => {
        imp().mockResolvedValueOnce({ status: 'ok', calendarId: 'c3', name: 'Elven', nameCollision: true })
        const wrapper = mountModal()
        await flushPromises()
        expect(list()).toHaveBeenCalledTimes(1)

        await wrapper.find('.import-btn').trigger('click')
        await flushPromises()
        expect(list()).toHaveBeenCalledTimes(2)
        const notice = wrapper.find('.notice')
        expect(notice.classes()).toContain('ok')
        expect(notice.text()).toContain('Imported "Elven".')
        expect(notice.text()).toContain('already existed')
        wrapper.unmount()
    })

    it('a failed import is logged and shown without hiding the list', async () => {
        imp().mockResolvedValueOnce({ status: 'error', message: 'not a calendar file' })
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const wrapper = mountModal()
        await flushPromises()

        await wrapper.find('.import-btn').trigger('click')
        await flushPromises()
        expect(consoleError).toHaveBeenCalled()
        expect(wrapper.find('.notice.error').text()).toContain('not a calendar file')
        expect(wrapper.findAll('.cal-row').length).toBe(2)
        consoleError.mockRestore()
        wrapper.unmount()
    })
})

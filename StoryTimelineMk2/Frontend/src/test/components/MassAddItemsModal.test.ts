import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        SaveItem: vi.fn(),
        GetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok', value: '9' }),
        request: vi.fn(),
        send: vi.fn(),
    },
}))

vi.mock('@phosphor-icons/vue', () => {
    const stub = (name: string) => ({ template: '<span />', name })
    return { PhX: stub('PhX'), PhTrash: stub('PhTrash'), PhMinus: stub('PhMinus'), PhPlus: stub('PhPlus') }
})

import MassAddItemsModal from '@/components/MassAddItemsModal.vue'
import { BackendAPI } from '@/bridge/api'

let store: ReturnType<typeof useTimelineStore>

function mountModal() {
    return mount(MassAddItemsModal, { global: { stubs: { teleport: true } } })
}

const yearVal = (w: ReturnType<typeof mountModal>, sel = '.ma-year') => (w.find(sel).element as HTMLInputElement).value

async function pickType(wrapper: ReturnType<typeof mountModal>, typeId: number) {
    const btn = wrapper.findAll('.ma-type-btn').find(b => b.attributes('data-type') === String(typeId))!
    await btn.trigger('click')
}

async function addOne(wrapper: ReturnType<typeof mountModal>, title: string, year?: number, typeId?: number, endYear?: number) {
    await wrapper.find('.ma-title').setValue(title)
    if (typeId != null) await pickType(wrapper, typeId)
    if (year != null) await wrapper.find('.ma-year').setValue(year)
    if (endYear != null) await wrapper.find('.ma-end-year').setValue(endYear)
    await wrapper.find('form').trigger('submit')
}

describe('MassAddItemsModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
        store = useTimelineStore()
        store.currentProject = { Id: 1 } as never
        store.settings = { DefaultItemColor: '#abcdef' } as never
        store.lodProfile = [{ index: 3, formatKey: 'Years', stepFraction: 1 }]
        ;(BackendAPI.GetMiscSetting as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', value: '9' })
    })

    it('queues items, keeps the type, remembers the year by default, steps it, and removes rows', async () => {
        const wrapper = mountModal()
        await flushPromises()

        await wrapper.find('form').trigger('submit')
        expect(wrapper.find('.state-msg.error').text()).toBe('Title is required.')
        expect((wrapper.find('.ma-remember').element as HTMLInputElement).checked).toBe(true)

        await addOne(wrapper, 'Battle', 100, 2, 105)
        let rows = wrapper.findAll('.queue-row')
        expect(rows.length).toBe(1)
        expect(rows[0]!.text()).toContain('Period · 100 – 105')
        expect((wrapper.find('.ma-title').element as HTMLInputElement).value).toBe('')
        expect(yearVal(wrapper)).toBe('100')                                              // remembered
        expect(wrapper.find('.ma-type-btn.active').attributes('data-type')).toBe('2')     // type sticks

        await wrapper.find('.ma-remember').setValue(false)
        await addOne(wrapper, 'Siege', 200, 1)
        expect(yearVal(wrapper)).toBe('')                                                 // cleared
        await wrapper.find('.ma-year').setValue(200)
        await wrapper.find('.ma-year-plus').trigger('click')
        await wrapper.find('.ma-year-plus').trigger('click')
        await wrapper.find('.ma-year-minus').trigger('click')
        expect(yearVal(wrapper)).toBe('201')

        await addOne(wrapper, 'Truce')
        rows = wrapper.findAll('.queue-row')
        expect(rows.map(r => r.text())).toEqual([
            expect.stringContaining('Battle'), expect.stringContaining('Event · 200'), expect.stringContaining('Event · 201'),
        ])

        await rows[1]!.find('.q-remove').trigger('click')
        expect(wrapper.findAll('.queue-row').map(r => r.find('.q-title').text())).toEqual(['Battle', 'Truce'])
        expect(wrapper.find('.ma-finish').text()).toBe('Finished (2)')
        wrapper.unmount()
    })

    it('ranges: To year follows From + 1, reversed years are swapped, equal years become one year long', async () => {
        const wrapper = mountModal()
        await flushPromises()

        expect(wrapper.find('.ma-end-year').exists()).toBe(false)
        await pickType(wrapper, 3)
        await wrapper.find('.ma-year').setValue(50)
        expect(yearVal(wrapper, '.ma-end-year')).toBe('51')
        await wrapper.find('.ma-end-plus').trigger('click')
        expect(yearVal(wrapper, '.ma-end-year')).toBe('52')
        await wrapper.find('.ma-year').setValue(60)                 // touched end no longer follows
        expect(yearVal(wrapper, '.ma-end-year')).toBe('52')

        await wrapper.find('.ma-title').setValue('Reversed')
        await wrapper.find('form').trigger('submit')
        expect(wrapper.find('.queue-row').text()).toContain('Age · 52 – 60')

        await addOne(wrapper, 'Same', 70, 3, 70)
        expect(wrapper.findAll('.queue-row')[1]!.text()).toContain('Age · 70 – 71')
        wrapper.unmount()
    })

    it('Shift + / Shift − step the year from the title box; clicking a row edits it', async () => {
        const wrapper = mountModal()
        await flushPromises()

        await wrapper.find('.ma-year').setValue(10)
        await wrapper.find('.ma-title').trigger('keydown', { key: '+', shiftKey: true })
        await wrapper.find('.ma-title').trigger('keydown', { key: '+', shiftKey: true })
        await wrapper.find('.ma-title').trigger('keydown', { key: '_', shiftKey: true })
        await wrapper.find('.ma-title').trigger('keydown', { key: '+' })                  // no shift → ignored
        expect(yearVal(wrapper)).toBe('11')

        await addOne(wrapper, 'First')
        await addOne(wrapper, 'Second', 20, 2, 25)
        await wrapper.findAll('.queue-row')[0]!.trigger('click')
        expect(wrapper.find('.queue-row.editing .q-title').text()).toBe('First')
        expect((wrapper.find('.ma-title').element as HTMLInputElement).value).toBe('First')
        expect(yearVal(wrapper)).toBe('11')
        expect(wrapper.find('.ma-add').text()).toBe('Update')
        expect(wrapper.find('.ma-cancel-edit').exists()).toBe(true)

        await wrapper.find('.ma-title').setValue('First!')
        await wrapper.find('form').trigger('submit')
        expect(wrapper.findAll('.queue-row').map(r => r.find('.q-title').text())).toEqual(['First!', 'Second'])
        expect(wrapper.find('.queue-row.editing').exists()).toBe(false)
        expect(wrapper.find('.ma-add').text()).toBe('Add')

        await wrapper.findAll('.queue-row')[1]!.trigger('click')
        expect(yearVal(wrapper, '.ma-end-year')).toBe('25')
        await wrapper.find('.ma-cancel-edit').trigger('click')
        expect(wrapper.find('.queue-row.editing').exists()).toBe(false)
        expect((wrapper.find('.ma-title').element as HTMLInputElement).value).toBe('')
        wrapper.unmount()
    })

    it('Finished saves every queued item with the new-item defaults, reloads the timeline and closes', async () => {
        ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', itemId: 'x' })
        const reload = vi.spyOn(store, 'loadTimelineData').mockResolvedValue(undefined)
        const wrapper = mountModal()
        await flushPromises()

        await addOne(wrapper, 'Battle', -5, 3, 12)
        await addOne(wrapper, 'Siege', 200, 5)
        await wrapper.find('.ma-finish').trigger('click')
        await flushPromises()

        const calls = (BackendAPI.SaveItem as ReturnType<typeof vi.fn>).mock.calls
        expect(calls.length).toBe(2)
        expect(calls[0]![0]).toMatchObject({
            Title: 'Battle', TypeId: 3, Year: -5, EndYear: 12, AbsoluteStart: -5, AbsoluteEnd: 12,
            TimelineId: 1, Color: '#abcdef', LodVisibilityMask: 9, CreationGranularity: 3,
            Importance: 5, MinLodLevel: 3, ShowInNotes: true,
        })
        expect(calls[1]![0]).toMatchObject({ Title: 'Siege', TypeId: 5, Year: 200, EndYear: 200 })
        expect(calls.every(c => typeof c[0].Id === 'string' && c[0].Id.length > 0)).toBe(true)
        expect(reload).toHaveBeenCalledWith(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
        wrapper.unmount()
    })

    it('a failed save keeps the unsaved rows, shows the error and stays open', async () => {
        ;(BackendAPI.SaveItem as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ status: 'ok', itemId: 'x' })
            .mockResolvedValueOnce({ status: 'error', message: 'disk full' })
        const reload = vi.spyOn(store, 'loadTimelineData').mockResolvedValue(undefined)
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const wrapper = mountModal()
        await flushPromises()

        await addOne(wrapper, 'One', 1)
        await addOne(wrapper, 'Two', 2)
        await addOne(wrapper, 'Three', 3)
        await wrapper.find('.ma-finish').trigger('click')
        await flushPromises()

        expect(BackendAPI.SaveItem).toHaveBeenCalledTimes(2)
        expect(wrapper.findAll('.queue-row').map(r => r.find('.q-title').text())).toEqual(['Two', 'Three'])
        expect(wrapper.find('.state-msg.error').text()).toContain('Saving "Two" failed: disk full')
        expect(consoleError).toHaveBeenCalled()
        expect(reload).toHaveBeenCalledWith(1)
        expect(wrapper.emitted('close')).toBeUndefined()

        // Closing with unsaved rows asks first — in the app's own dialog, not window.confirm
        await wrapper.find('.bm-footer .btn-cancel').trigger('click')
        expect(wrapper.text()).toContain('2 unsaved item(s) will be lost.')
        await wrapper.find('.bm-footer .btn-secondary').trigger('click')       // Keep
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(wrapper.text()).not.toContain('unsaved item(s)')
        await wrapper.find('.bm-footer .btn-cancel').trigger('click')
        await wrapper.find('.bm-footer .btn-danger').trigger('click')          // Discard
        expect(wrapper.emitted('close')).toHaveLength(1)
        consoleError.mockRestore()
        wrapper.unmount()
    })
})

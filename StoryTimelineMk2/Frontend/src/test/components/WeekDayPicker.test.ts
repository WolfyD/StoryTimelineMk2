import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WeekDayPicker from '@/components/WeekDayPicker.vue'

describe('WeekDayPicker', () => {
    it('renders N day chips for the given weekLength', () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [], weekLength: 7 } })
        expect(wrapper.findAll('.day-chip').length).toBe(7)
        wrapper.unmount()
    })

    it('shows custom day labels when provided', () => {
        const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [], weekLength: 7, dayLabels: labels } })
        const chips = wrapper.findAll('.day-chip')
        labels.forEach((l, i) => expect(chips[i].text()).toBe(l))
        wrapper.unmount()
    })

    it('falls back to D1, D2… labels when no dayLabels provided', () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [], weekLength: 3 } })
        const chips = wrapper.findAll('.day-chip')
        expect(chips[0].text()).toBe('D1')
        expect(chips[1].text()).toBe('D2')
        expect(chips[2].text()).toBe('D3')
        wrapper.unmount()
    })

    it('marks selected days with .selected class', () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [1, 3], weekLength: 5 } })
        const chips = wrapper.findAll('.day-chip')
        expect(chips[0].classes()).not.toContain('selected')
        expect(chips[1].classes()).toContain('selected')
        expect(chips[2].classes()).not.toContain('selected')
        expect(chips[3].classes()).toContain('selected')
        wrapper.unmount()
    })

    it('emits update:modelValue with new day added when unselected chip is clicked', async () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [1], weekLength: 5 } })
        await wrapper.findAll('.day-chip')[0].trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeTruthy()
        expect(wrapper.emitted('update:modelValue')![0]).toEqual([[0, 1]])
        wrapper.unmount()
    })

    it('emits update:modelValue with day removed when selected chip is clicked', async () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [1, 3], weekLength: 5 } })
        await wrapper.findAll('.day-chip')[1].trigger('click') // index 1 is selected
        expect(wrapper.emitted('update:modelValue')![0]).toEqual([[3]])
        wrapper.unmount()
    })

    it('emits sorted array after selection', async () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [3, 1], weekLength: 5 } })
        await wrapper.findAll('.day-chip')[0].trigger('click') // add index 0
        expect(wrapper.emitted('update:modelValue')![0]).toEqual([[0, 1, 3]])
        wrapper.unmount()
    })

    it('shows no-week-note when weekLength is 0', () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [], weekLength: 0 } })
        expect(wrapper.find('.no-week-note').exists()).toBe(true)
        expect(wrapper.findAll('.day-chip').length).toBe(0)
        wrapper.unmount()
    })

    it('renders 0 chips for weekLength 0', () => {
        const wrapper = mount(WeekDayPicker, { props: { modelValue: [], weekLength: 0 } })
        expect(wrapper.findAll('.day-chip').length).toBe(0)
        wrapper.unmount()
    })
})

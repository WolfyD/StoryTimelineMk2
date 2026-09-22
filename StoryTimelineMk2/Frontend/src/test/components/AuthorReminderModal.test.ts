import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuthorReminderModal from '@/components/AuthorReminderModal.vue'

vi.mock('@phosphor-icons/vue', () => ({
    PhX: { template: '<span class="ph-x" />', name: 'PhX' },
}))

describe('AuthorReminderModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('renders the modal panel', () => {
        const wrapper = mount(AuthorReminderModal)
        expect(wrapper.find('.bm-backdrop').exists()).toBe(true)
        expect(wrapper.find('.bm-panel').exists()).toBe(true)
        wrapper.unmount()
    })

    it('shows the author text input', () => {
        const wrapper = mount(AuthorReminderModal)
        expect(wrapper.find('input[type="text"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('emits skip when "Keep Empty" button is clicked', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('skip')).toBeTruthy()
        expect(wrapper.emitted('set')).toBeFalsy()
        wrapper.unmount()
    })

    it('emits skip when X close button is clicked', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('.bm-close').trigger('click')
        expect(wrapper.emitted('skip')).toBeTruthy()
        wrapper.unmount()
    })

    it('emits skip when backdrop is clicked', async () => {
        const wrapper = mount(AuthorReminderModal)
        const backdrop = wrapper.find('.bm-backdrop')
        await backdrop.trigger('mousedown')
        await backdrop.trigger('click')
        expect(wrapper.emitted('skip')).toBeTruthy()
        wrapper.unmount()
    })

    it('does not close when a drag started inside the panel ends on the backdrop', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('.bm-panel').trigger('mousedown')
        await wrapper.find('.bm-backdrop').trigger('click')   // click targets the common ancestor
        expect(wrapper.emitted('skip')).toBeFalsy()
        wrapper.unmount()
    })

    it('emits set with the typed author name when "Set Author" is clicked', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('input[type="text"]').setValue('Jane Doe')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.emitted('set')).toBeTruthy()
        expect(wrapper.emitted('set')![0]).toEqual(['Jane Doe'])
        wrapper.unmount()
    })

    it('emits set with empty string when Set Author is clicked with blank input', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.emitted('set')).toBeTruthy()
        expect(wrapper.emitted('set')![0]).toEqual([''])
        wrapper.unmount()
    })

    it('emits set when Enter is pressed in the input', async () => {
        const wrapper = mount(AuthorReminderModal, { attachTo: document.body })
        const input = wrapper.find('input[type="text"]')
        await input.setValue('John Smith')
        await input.trigger('keydown', { key: 'Enter' })
        expect(wrapper.emitted('set')).toBeTruthy()
        expect(wrapper.emitted('set')![0]).toEqual(['John Smith'])
        wrapper.unmount()
    })

    it('does not emit set on non-Enter keydown', async () => {
        const wrapper = mount(AuthorReminderModal)
        await wrapper.find('input[type="text"]').trigger('keydown', { key: 'a' })
        expect(wrapper.emitted('set')).toBeFalsy()
        wrapper.unmount()
    })
})

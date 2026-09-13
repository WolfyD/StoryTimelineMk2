import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MilestoneToast from '@/components/MilestoneToast.vue'
import type { AchievementNotification } from '@/stores/notificationsStore'

function makeNotification(overrides: Partial<AchievementNotification> = {}): AchievementNotification {
    return {
        id: 1,
        achievementKey: 'test_milestone',
        title: 'Level Up!',
        flavorText: 'A great feat was accomplished.',
        tier: 'milestone',
        icon: null,
        imageBase64: null,
        characterKey: null,
        characterName: null,
        ...overrides,
    }
}

describe('MilestoneToast', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('renders the milestone toast after mount', async () => {
        const wrapper = mount(MilestoneToast, { props: { notification: makeNotification() } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.milestone-toast').exists()).toBe(true)
        wrapper.unmount()
    })

    it('shows the title and flavor text', async () => {
        const wrapper = mount(MilestoneToast, {
            props: {
                notification: makeNotification({
                    title: 'Dragon Slayer',
                    flavorText: 'You vanquished the beast.',
                }),
            },
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.milestone-title').text()).toBe('Dragon Slayer')
        expect(wrapper.find('.milestone-flavor').text()).toBe('You vanquished the beast.')
        wrapper.unmount()
    })

    it('shows the character name when provided', async () => {
        const wrapper = mount(MilestoneToast, {
            props: {
                notification: makeNotification({ characterName: 'Aelindra' }),
            },
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.milestone-character').exists()).toBe(true)
        expect(wrapper.find('.milestone-character').text()).toBe('Aelindra')
        wrapper.unmount()
    })

    it('hides the character name element when characterName is null', async () => {
        const wrapper = mount(MilestoneToast, {
            props: {
                notification: makeNotification({ characterName: null }),
            },
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.milestone-character').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders a circular image when imageBase64 is provided', async () => {
        const wrapper = mount(MilestoneToast, {
            props: {
                notification: makeNotification({ imageBase64: 'data:image/png;base64,xyz' }),
            },
        })
        await wrapper.vm.$nextTick()
        const img = wrapper.find('.milestone-image')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('data:image/png;base64,xyz')
        wrapper.unmount()
    })

    it('does not render an image when imageBase64 is null', async () => {
        const wrapper = mount(MilestoneToast, { props: { notification: makeNotification({ imageBase64: null }) } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.milestone-image').exists()).toBe(false)
        wrapper.unmount()
    })

    it('emits dismiss with the notification id after clicking', async () => {
        const wrapper = mount(MilestoneToast, { props: { notification: makeNotification({ id: 55 }) } })
        await wrapper.vm.$nextTick()
        await wrapper.find('.milestone-toast').trigger('click')
        vi.advanceTimersByTime(400)
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('dismiss')).toBeTruthy()
        expect(wrapper.emitted('dismiss')![0]).toEqual([55])
        wrapper.unmount()
    })

    it('auto-dismisses after 7000ms', async () => {
        const wrapper = mount(MilestoneToast, { props: { notification: makeNotification({ id: 9 }) } })
        await wrapper.vm.$nextTick()
        vi.advanceTimersByTime(7400) // 7000ms auto + 400ms fade
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('dismiss')).toBeTruthy()
        expect(wrapper.emitted('dismiss')![0]).toEqual([9])
        wrapper.unmount()
    })

    it('has role="alert" for accessibility', async () => {
        const wrapper = mount(MilestoneToast, { props: { notification: makeNotification() } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

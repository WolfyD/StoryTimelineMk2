import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AchievementToast from '@/components/AchievementToast.vue'
import type { AchievementNotification } from '@/stores/notificationsStore'

function makeNotification(overrides: Partial<AchievementNotification> = {}): AchievementNotification {
    return {
        id: 1,
        achievementKey: 'test_achievement',
        title: 'Test Achievement',
        flavorText: 'You did the thing!',
        tier: 'achievement',
        icon: null,
        imageBase64: null,
        characterKey: null,
        characterName: null,
        ...overrides,
    }
}

describe('AchievementToast', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.useFakeTimers()
        // Make rAF run the callback synchronously so visible=true fires immediately
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('renders the achievement toast after mount', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification() } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.achievement-toast').exists()).toBe(true)
        wrapper.unmount()
    })

    it('shows the achievement title and flavor text', async () => {
        const wrapper = mount(AchievementToast, {
            props: {
                notification: makeNotification({ title: 'First Blood', flavorText: 'You created your first item.' }),
            },
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.achievement-title').text()).toBe('First Blood')
        expect(wrapper.find('.achievement-flavor').text()).toBe('You created your first item.')
        wrapper.unmount()
    })

    it('shows the "Achievement Unlocked" header label', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification() } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.achievement-label').text()).toBe('Achievement Unlocked')
        wrapper.unmount()
    })

    it('renders an image when imageBase64 is provided', async () => {
        const wrapper = mount(AchievementToast, {
            props: {
                notification: makeNotification({ imageBase64: 'data:image/png;base64,abc' }),
            },
        })
        await wrapper.vm.$nextTick()
        const img = wrapper.find('.achievement-image')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('data:image/png;base64,abc')
        wrapper.unmount()
    })

    it('does not render an image when imageBase64 is null', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification({ imageBase64: null }) } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.achievement-image').exists()).toBe(false)
        wrapper.unmount()
    })

    it('emits dismiss with the notification id after clicking', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification({ id: 42 }) } })
        await wrapper.vm.$nextTick()
        await wrapper.find('.achievement-toast').trigger('click')
        // dismiss sets visible=false then waits 400ms before emitting
        vi.advanceTimersByTime(400)
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('dismiss')).toBeTruthy()
        expect(wrapper.emitted('dismiss')![0]).toEqual([42])
        wrapper.unmount()
    })

    it('auto-dismisses after 5000ms', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification({ id: 7 }) } })
        await wrapper.vm.$nextTick()
        vi.advanceTimersByTime(5400) // 5000ms auto + 400ms fade
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('dismiss')).toBeTruthy()
        expect(wrapper.emitted('dismiss')![0]).toEqual([7])
        wrapper.unmount()
    })

    it('has role="alert" for accessibility', async () => {
        const wrapper = mount(AchievementToast, { props: { notification: makeNotification() } })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/achievementSound', () => ({
    playAchievementChime: vi.fn(),
    playMilestoneChime: vi.fn(),
}))

import { useNotificationsStore } from '@/stores/notificationsStore'
import { playAchievementChime, playMilestoneChime } from '@/utils/achievementSound'

function makePayload(overrides: Record<string, unknown> = {}) {
    return {
        achievementKey: 'test_achievement',
        title: 'Test Title',
        flavorText: 'Test flavor',
        tier: 'achievement' as const,
        icon: null,
        imageBase64: null,
        characterKey: null,
        characterName: null,
        ...overrides,
    }
}

describe('notificationsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
    })

    describe('initial state', () => {
        it('starts with empty queues', () => {
            const store = useNotificationsStore()
            expect(store.achievementQueue).toHaveLength(0)
            expect(store.milestoneQueue).toHaveLength(0)
        })

        it('starts with popups and sound enabled', () => {
            const store = useNotificationsStore()
            expect(store.showPopups).toBe(true)
            expect(store.soundEnabled).toBe(true)
        })
    })

    describe('push()', () => {
        it('adds an achievement notification to achievementQueue', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'achievement' }))
            expect(store.achievementQueue).toHaveLength(1)
            expect(store.milestoneQueue).toHaveLength(0)
            expect(store.achievementQueue[0].title).toBe('Test Title')
        })

        it('adds a milestone notification to milestoneQueue', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'milestone' }))
            expect(store.milestoneQueue).toHaveLength(1)
            expect(store.achievementQueue).toHaveLength(0)
        })

        it('assigns a unique incrementing id to each notification', () => {
            const store = useNotificationsStore()
            store.push(makePayload())
            store.push(makePayload())
            const ids = store.achievementQueue.map(n => n.id)
            expect(ids[0]).not.toBe(ids[1])
            expect(ids[1]).toBeGreaterThan(ids[0])
        })

        it('plays achievement chime when soundEnabled is true', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'achievement' }))
            expect(playAchievementChime).toHaveBeenCalledTimes(1)
        })

        it('plays milestone chime when soundEnabled is true', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'milestone' }))
            expect(playMilestoneChime).toHaveBeenCalledTimes(1)
        })

        it('does not play any chime when soundEnabled is false', () => {
            const store = useNotificationsStore()
            store.setSettings(true, false)
            store.push(makePayload({ tier: 'achievement' }))
            store.push(makePayload({ tier: 'milestone' }))
            expect(playAchievementChime).not.toHaveBeenCalled()
            expect(playMilestoneChime).not.toHaveBeenCalled()
        })

        it('does not push when showPopups is false', () => {
            const store = useNotificationsStore()
            store.setSettings(false, true)
            store.push(makePayload())
            expect(store.achievementQueue).toHaveLength(0)
        })

        it('queues multiple notifications independently', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ title: 'First', tier: 'achievement' }))
            store.push(makePayload({ title: 'Second', tier: 'achievement' }))
            store.push(makePayload({ title: 'Milestone One', tier: 'milestone' }))
            expect(store.achievementQueue).toHaveLength(2)
            expect(store.milestoneQueue).toHaveLength(1)
        })
    })

    describe('dismissAchievement()', () => {
        it('removes the notification with the matching id', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ title: 'A' }))
            store.push(makePayload({ title: 'B' }))
            const idToRemove = store.achievementQueue[0].id
            store.dismissAchievement(idToRemove)
            expect(store.achievementQueue).toHaveLength(1)
            expect(store.achievementQueue[0].title).toBe('B')
        })

        it('is a no-op for an unknown id', () => {
            const store = useNotificationsStore()
            store.push(makePayload())
            store.dismissAchievement(99999)
            expect(store.achievementQueue).toHaveLength(1)
        })

        it('does not affect milestoneQueue', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'milestone' }))
            store.push(makePayload({ tier: 'achievement' }))
            const achievementId = store.achievementQueue[0].id
            store.dismissAchievement(achievementId)
            expect(store.milestoneQueue).toHaveLength(1)
        })
    })

    describe('dismissMilestone()', () => {
        it('removes the milestone with the matching id', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ title: 'M1', tier: 'milestone' }))
            store.push(makePayload({ title: 'M2', tier: 'milestone' }))
            const idToRemove = store.milestoneQueue[0].id
            store.dismissMilestone(idToRemove)
            expect(store.milestoneQueue).toHaveLength(1)
            expect(store.milestoneQueue[0].title).toBe('M2')
        })

        it('does not affect achievementQueue', () => {
            const store = useNotificationsStore()
            store.push(makePayload({ tier: 'achievement' }))
            store.push(makePayload({ tier: 'milestone' }))
            const milestoneId = store.milestoneQueue[0].id
            store.dismissMilestone(milestoneId)
            expect(store.achievementQueue).toHaveLength(1)
        })
    })

    describe('setSettings()', () => {
        it('updates showPopups and soundEnabled', () => {
            const store = useNotificationsStore()
            store.setSettings(false, false)
            expect(store.showPopups).toBe(false)
            expect(store.soundEnabled).toBe(false)
        })

        it('can re-enable popups after disabling', () => {
            const store = useNotificationsStore()
            store.setSettings(false, false)
            store.setSettings(true, true)
            store.push(makePayload())
            expect(store.achievementQueue).toHaveLength(1)
        })
    })
})

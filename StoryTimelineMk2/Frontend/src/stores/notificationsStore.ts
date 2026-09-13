import { defineStore } from 'pinia'
import { ref } from 'vue'
import { playAchievementChime, playMilestoneChime } from '@/utils/achievementSound'

export interface AchievementNotification {
	id: number
	achievementKey: string
	title: string
	flavorText: string
	tier: 'achievement' | 'milestone'
	icon: string | null
	imageBase64: string | null
	characterKey: string | null
	characterName: string | null
}

let _counter = 0

export const useNotificationsStore = defineStore('notifications', () => {
	const achievementQueue = ref<AchievementNotification[]>([])
	const milestoneQueue = ref<AchievementNotification[]>([])

	const showPopups = ref(true)
	const soundEnabled = ref(true)

	function setSettings(show: boolean, sound: boolean) {
		showPopups.value = show
		soundEnabled.value = sound
	}

	function push(payload: Omit<AchievementNotification, 'id'>) {
		if (!showPopups.value) return

		const notif: AchievementNotification = { ...payload, id: ++_counter }

		if (payload.tier === 'milestone') {
			milestoneQueue.value.push(notif)
			if (soundEnabled.value) playMilestoneChime()
		} else {
			achievementQueue.value.push(notif)
			if (soundEnabled.value) playAchievementChime()
		}
	}

	function dismissAchievement(id: number) {
		achievementQueue.value = achievementQueue.value.filter(n => n.id !== id)
	}

	function dismissMilestone(id: number) {
		milestoneQueue.value = milestoneQueue.value.filter(n => n.id !== id)
	}

	return {
		achievementQueue,
		milestoneQueue,
		showPopups,
		soundEnabled,
		setSettings,
		push,
		dismissAchievement,
		dismissMilestone,
	}
})

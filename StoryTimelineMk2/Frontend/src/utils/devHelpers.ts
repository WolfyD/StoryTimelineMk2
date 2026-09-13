import { BackendAPI } from '@/bridge/api'

// Installs window.__stl dev helpers for testing achievements from the DevTools console.
export function installDevHelpers(): void {
	const stl = {
		help() {
			console.group('%c 🎮 __stl dev helpers', 'color:#a78bfa;font-weight:bold;font-size:13px')
			console.table([
				{ call: '__stl.help()',                    description: 'Show this table' },
				{ call: '__stl.achievement(key)',           description: 'Fire a specific achievement/milestone toast by key' },
				{ call: '__stl.randomAchievement()',        description: 'Fire a random achievement toast (tier=achievement)' },
				{ call: '__stl.randomMilestone()',          description: 'Fire a random milestone toast (tier=milestone)' },
				{ call: '__stl.listKeys()',                 description: 'List all keys, titles and tiers in the DB' },
			])
			console.groupEnd()
		},

		async achievement(key: string) {
			const r = await BackendAPI.TriggerTestAchievement(key)
			if (!r) console.warn('[__stl] No response — key may not exist. Use __stl.listKeys() to check.')
		},

		async randomAchievement() {
			await BackendAPI.TriggerRandomAchievement()
		},

		async randomMilestone() {
			await BackendAPI.TriggerRandomMilestone()
		},

		async listKeys() {
			const keys = await BackendAPI.ListAchievementKeys()
			if (keys) {
				console.table(keys)
			} else {
				console.warn('[__stl] No response from backend.')
			}
		},
	}

	;(window as any).__stl = stl
	console.log('%c__stl loaded — run __stl.help() to see available commands', 'color:#a78bfa')
}

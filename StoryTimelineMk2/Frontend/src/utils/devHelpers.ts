import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'

// Installs window.__stl dev helpers for testing achievements from the DevTools console.
export function installDevHelpers(): void {
	const stl = {
		help() {
			console.group('%c 🎮 __stl dev helpers', 'color:#a78bfa;font-weight:bold;font-size:13px')
			console.table([
				{ call: '__stl.help()',                    description: 'Show this table' },
				{ call: '__stl.randomCalendar()',          description: 'Generate + save a random fantasy calendar (returns its ID)' },
				{ call: '__stl.achievement(key)',           description: 'Fire a specific achievement/milestone toast by key' },
				{ call: '__stl.randomAchievement()',        description: 'Fire a random achievement toast (tier=achievement)' },
				{ call: '__stl.randomMilestone()',          description: 'Fire a random milestone toast (tier=milestone)' },
				{ call: '__stl.listKeys()',                 description: 'List all keys, titles and tiers in the DB' },
				{ call: '__stl.lodLevels()',                description: 'List the LOD level names of the open timeline' },
				{ call: "__stl.setAllLodMask(levels)",      description: "Make every item of the open timeline visible at exactly these levels, e.g. ['years','decades'] or 'all' (names as in lodLevels(), prefixes ok)" },
			])
			console.groupEnd()
		},

		async randomCalendar(): Promise<string | undefined> {
			const CAL_NAMES  = ['Solarian','Astral','Verdant','Crimson','Obsidian','Tidal','Ember','Frost','Umbral','Auric','Vernal','Draconic']
			const M_PFX      = ['Iron','Ash','Blood','Frost','Dawn','Storm','Ember','Tide','Shadow','Thunder','Veil','Pale','Gold','Dusk','Bone','Mist']
			const M_SFX      = ['moon','bloom','tide','crest','gale','flame','song','veil','kin','star','frost','rise','wake','dusk']
			const D_NAMES    = ['Moonday','Fireday','Waterday','Earthday','Windday','Starday','Sunday','Voidday','Ashday','Tideday','Frostday']
			const S_NAMES    = ['Winter','Spring','Summer','Autumn','The Withering','The Renewal','The Scorching','The Harvest']
			const MD_NAMES   = ["Festival of Fire","Night of Veils","The Long Sleep","Storm's Greeting","Day of Ashes","Tide's Turn","The Great Hunt","Blood Moon Feast","Starfall Night","The Awakening","Harvest Pyre","Frost's Embrace"]
			const MD_COLORS  = ['#ff4500','#9b59b6','#3498db','#e74c3c','#1abc9c','#f39c12','#e91e63','#00bcd4','#ff9800','#8bc34a']

			const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!
			const rnd  = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo)) + lo
			const shuf = <T>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5)

			const nM = rnd(8, 17), wL = rnd(5, 11), nS = rnd(2, 5), nD = rnd(4, 9)
			const base = pick(CAL_NAMES)
			const mps  = Math.max(Math.floor(nM / nS), 1)
			const lens = Array.from({ length: nM }, () => rnd(20, 61))
			const ylen = lens.reduce((a, b) => a + b, 0)

			const month_definition: Record<string, unknown> = {}
			for (let i = 0; i < nM; i++)
				month_definition[i] = { name: `${pick(M_PFX)}${pick(M_SFX)}`, length: lens[i], season: Math.min(Math.floor(i / mps), nS - 1) }

			const season_definition: Record<string, unknown> = {}
			for (let i = 0; i < nS; i++) {
				const st = i * mps, sn = S_NAMES[i % S_NAMES.length]!
				season_definition[i] = { name: sn, short_name: sn.slice(0, 3), start: st, end: i === nS - 1 ? nM - 1 : st + mps - 1 }
			}

			const week_definition = { length: wL, days_have_names: true, days: shuf(D_NAMES).slice(0, wL), weekend: [wL - 1, wL - 2] }

			const memorable_days = shuf(MD_NAMES).slice(0, nD).map(name => {
				const mi = rnd(0, nM)
				return { id: crypto.randomUUID(), name, color: pick(MD_COLORS), type: 'fixed', startMonth: mi, startDay: rnd(1, lens[mi]! + 1), endMonth: mi, endDay: rnd(1, lens[mi]! + 1), isRange: false, weekDays: [] }
			})

			const yd = { length: ylen, months: nM, month_definition, seasons: nS, season_definition, week_definition, year_start_dow: rnd(0, wL), memorable_days }

			const lodId = crypto.randomUUID(), calId = crypto.randomUUID()
			const lodLevels = [
				{ index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
				{ index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
				{ index: 2, formatKey: 'DECADES',   stepFraction: 10 },
				{ index: 3, formatKey: 'YEARS',     stepFraction: 1 },
				{ index: 4, formatKey: 'SEASONS',   stepFraction: +(1 / nS).toFixed(8) },
				{ index: 5, formatKey: 'MONTHS',    stepFraction: +(1 / nM).toFixed(8) },
				{ index: 6, formatKey: 'WEEKS',     stepFraction: +(wL / ylen).toFixed(8) },
				{ index: 7, formatKey: 'DAYS',      stepFraction: +(1 / ylen).toFixed(8) },
			]

			const calName = `${base} Calendar`
			const result = await BackendAPI.SaveCalendar({
				Id: calId, Name: calName, ShortName: base.slice(0, 4), AlternateName: '',
				NameBefore0: `Before ${base}`, NameAfter0: `After ${base}`,
				LodProfileId: lodId, YearDefinition: JSON.stringify(yd),
				LodProfile: { Id: lodId, Name: `${calName} LOD`, Profile: JSON.stringify(lodLevels) },
			})

			if (result?.status === 'ok') {
				console.log(`%c✓ Created "${calName}"  (${nM} months · ${ylen}-day year · ${wL}-day week · ${nS} seasons · ${nD} memorable days)`, 'color:#4ade80;font-weight:bold')
				console.log('  ID:', calId)
				return calId
			} else {
				console.error('[__stl] randomCalendar failed:', result?.message)
			}
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

		lodLevels() {
			const profile = useTimelineStore().lodProfile
			if (!profile.length) { console.error('[__stl] no timeline is open'); return }
			console.table(profile.map(l => ({ level: l.formatKey.toLowerCase(), index: l.index })))
		},

		async setAllLodMask(levels: string[] | 'all') {
			const store = useTimelineStore()
			const tlId = store.currentProject?.Id
			const profile = store.lodProfile
			if (!tlId || !profile.length) { console.error('[__stl] no timeline is open'); return }
			const names = profile.map(l => l.formatKey.toLowerCase())
			let picked = profile
			if (levels !== 'all') {
				if (!Array.isArray(levels)) { console.error(`[__stl] usage: setAllLodMask(['years', 'decades']) or setAllLodMask('all') — levels: ${names.join(', ')}`); return }
				picked = []
				for (const name of levels) {
					const lod = profile.find(l => l.formatKey.toLowerCase().startsWith(String(name).toLowerCase()))
					if (!lod) { console.error(`[__stl] unknown LOD level "${name}" — this timeline has: ${names.join(', ')}`); return }
					picked.push(lod)
				}
			}
			const mask = picked.reduce((m, l) => m | (1 << l.index), 0)
			const r = await BackendAPI.SetTimelineItemsLodMask(tlId, mask)
			if (r?.status !== 'ok') { console.error('[__stl] setAllLodMask failed:', r); return }
			await store.loadTimelineData(tlId)
			console.log(`%c✓ ${r.affected} items now visible at: ${picked.map(l => l.formatKey.toLowerCase()).join(', ') || 'no level'}`, 'color:#4ade80;font-weight:bold')
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

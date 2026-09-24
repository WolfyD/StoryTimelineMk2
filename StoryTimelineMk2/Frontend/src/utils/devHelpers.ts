import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { blankRelation, pairKey } from '@/utils/characterRelations'
import type { CastPlan } from '@/utils/devCast'
import { clusters, pick, planCast, planFamily, planPlausibleGroup, rnd, SOCIAL_KINDS, TEST_MARK } from '@/utils/devCast'

/** Whichever timeline this window is on: the store knows on the timeline page, the query elsewhere. */
function devTimelineId(): number | null {
	const id = useTimelineStore().currentProject?.Id ?? Number(new URLSearchParams(location.search).get('timelineId'))
	if (id > 0) return id
	console.error('[__stl] no timeline is open')
	return null
}

/**
 * Writes a planned cast — characters first, so every relation has both of its ends to point at.
 * ponytail: one round trip per row, so a 200-strong cast takes a second or two. A batch bridge
 * action if that ever stops being fast enough.
 */
async function saveCast(plan: CastPlan, what: string): Promise<void> {
	for (const c of plan.characters) await BackendAPI.SaveCharacter(c)
	for (const r of plan.relations) await BackendAPI.SaveCharacterRelation(r)
	console.log(
		`%c✓ ${what}: ${plan.characters.length} characters, ${plan.relations.length} relations — reopen the characters or relations window to see them`,
		'color:#4ade80;font-weight:bold',
	)
}

/** One tie between two people, in the order the kind reads. */
async function saveTie(timelineId: number, a: string, b: string, kind: string): Promise<void> {
	await BackendAPI.SaveCharacterRelation({ ...blankRelation(a, timelineId, kind), Character2Id: b })
}

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
				{ call: '__stl.createCharacters(n)',        description: 'Generate n test characters — small families plus loose social ties (default 30)' },
				{ call: '__stl.createFamily(n, gens)',      description: 'Generate one family of n people (default 8). `gens` spreads them over exactly that many generations — left out, it is one generation per eight people; capped at n/2, since a generation costs a couple' },
				{ call: '__stl.createPlausibleGroup(n)',    description: 'Generate n people as one believable group — a five-generation main line, families married into it, aunts/cousins/in-laws, and some friends and rivals (default 40)' },
				{ call: '__stl.connectCharacters()',        description: 'Tie two random unrelated characters together' },
				{ call: '__stl.connectClusters()',          description: 'Tie the two biggest disconnected groups together, through one pair' },
				{ call: '__stl.clearTestCast()',            description: 'Delete every character the generators above made, and their relations' },
				{ call: '__stl.clearCharacters(n)',         description: 'Delete EVERY character on this timeline, generated or not — pass the count back to confirm' },
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

		async createCharacters(count = 30) {
			const tlId = devTimelineId()
			if (!tlId) return
			await saveCast(planCast(tlId, count), 'cast')
		},

		async createFamily(size = 8, generations = 0) {
			const tlId = devTimelineId()
			if (!tlId) return
			await saveCast(planFamily(tlId, size, { generations }), 'family')
		},

		async createPlausibleGroup(count = 40) {
			const tlId = devTimelineId()
			if (!tlId) return
			await saveCast(planPlausibleGroup(tlId, count), 'group')
		},

		async connectCharacters() {
			const tlId = devTimelineId()
			if (!tlId) return
			const web = await BackendAPI.GetTimelineRelations(tlId)
			const cast = web?.Characters ?? []
			if (cast.length < 2) { console.error('[__stl] this timeline has fewer than two characters'); return }
			const paired = new Set((web?.Relations ?? []).map(r => pairKey(r.Character1Id, r.Character2Id)))
			// Random draws rather than a scan of every pair: the web is sparse, so one lands almost at once.
			for (let i = 0; i < 500; i++) {
				const a = pick(cast)
				const b = pick(cast)
				if (a.Id === b.Id || paired.has(pairKey(a.Id, b.Id))) continue
				const kind = pick(SOCIAL_KINDS)
				await saveTie(tlId, a.Id, b.Id, kind)
				console.log(`%c✓ ${a.Name} is now the ${kind} of ${b.Name}`, 'color:#4ade80;font-weight:bold')
				return
			}
			console.error('[__stl] found no unrelated pair to connect')
		},

		async connectClusters() {
			const tlId = devTimelineId()
			if (!tlId) return
			const web = await BackendAPI.GetTimelineRelations(tlId)
			const cast = web?.Characters ?? []
			const groups = clusters(cast.map(c => c.Id), web?.Relations ?? [])
			if (groups.length < 2) { console.error('[__stl] the cast is already one connected group'); return }
			const byId = new Map(cast.map(c => [c.Id, c]))
			const a = byId.get(pick(groups[0]!))!
			const b = byId.get(pick(groups[1]!))!
			const kind = pick(SOCIAL_KINDS)
			await saveTie(tlId, a.Id, b.Id, kind)
			console.log(
				`%c✓ joined a group of ${groups[0]!.length} to one of ${groups[1]!.length}: ${a.Name} is the ${kind} of ${b.Name}`,
				'color:#4ade80;font-weight:bold',
			)
		},

		async clearTestCast() {
			const tlId = devTimelineId()
			if (!tlId) return
			const cast = (await BackendAPI.GetTimelineCharacters(tlId)) ?? []
			const mine = cast.filter(c => c.Notes?.includes(TEST_MARK))
			if (!mine.length) { console.warn('[__stl] this timeline has no generated characters'); return }
			// Their relations go with them: character_relationships cascades on delete.
			for (const c of mine) await BackendAPI.DeleteCharacter(c.Id)
			console.log(`%c✓ deleted ${mine.length} generated characters`, 'color:#4ade80;font-weight:bold')
		},

		/**
		 * Everything, not just the generated ones. It will not run until you pass the number of
		 * characters back, so a mistyped command in the wrong window cannot empty a real timeline.
		 */
		async clearCharacters(confirmCount?: number) {
			const tlId = devTimelineId()
			if (!tlId) return
			const cast = (await BackendAPI.GetTimelineCharacters(tlId)) ?? []
			if (!cast.length) { console.warn('[__stl] this timeline has no characters'); return }
			if (confirmCount !== cast.length) {
				console.warn(`[__stl] this deletes all ${cast.length} characters on timeline ${tlId}, generated or not.`
					+ ` Run __stl.clearCharacters(${cast.length}) to go ahead.`)
				return
			}
			// Their relations go with them: character_relationships cascades on delete.
			for (const c of cast) await BackendAPI.DeleteCharacter(c.Id)
			console.log(`%c✓ deleted ${cast.length} characters`, 'color:#4ade80;font-weight:bold')
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

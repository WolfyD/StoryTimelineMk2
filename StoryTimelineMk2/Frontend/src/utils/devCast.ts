/**
 * BL-74: the shapes behind the __stl cast generators. Only the planning lives here — the saving is
 * in devHelpers, so a family can be built and checked without a backend to talk to.
 */
import type { CharacterItem, CharacterRelationship, LocationItem, TimelineItem } from '@/types/models'
import { blankCharacter } from '@/utils/characterItems'
import { blankRelation, pairKey, RELATION_MODIFIERS } from '@/utils/characterRelations'

/** Written into Notes so clearTestCast() can find its own leftovers. Nothing else reads it. */
export const TEST_MARK = '[__stl test cast]'

export interface CastPlan {
	characters: CharacterItem[]
	relations: CharacterRelationship[]
}

const FIRST_F = ['Ariane','Beatrix','Cerys','Dahlia','Elspeth','Fenna','Giselle','Halla','Ilse','Juno','Kestrel','Lirien','Maren','Nyssa','Orla','Perrin','Quilla','Risha','Saoirse','Thessaly','Ulla','Verity','Wren','Yara','Zelda']
const FIRST_M = ['Adan','Bran','Caius','Dorin','Edrik','Fenwick','Garrick','Hollis','Ivo','Joris','Kaelen','Lucan','Marek','Nial','Osric','Pell','Quentin','Roderic','Silas','Toma','Ulric','Varek','Wendel','Yorick','Zeb']
const SURNAMES = ['Ashdown','Blackwater','Carrow','Dunmere','Everly','Fallowfield','Grimsby','Holloway','Ironwood','Kestrelmoor','Lockhart','Marchbank','Nettlewood','Oakhurst','Pemberly','Quillon','Ravenscar','Stonebridge','Thornfield','Underhill','Vance','Whitlock','Yarrow']
const RACES = ['Human','Elf','Dwarf','Halfling','Orc','Tiefling','Fae','Revenant']
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#14b8a6','#3b82f6','#a855f7','#f43f5e','#84cc16','#06b6d4']

/**
 * Factions, handed out by surname rather than per person: a house's people mostly share one and
 * the ones who marry in bring another with them, which is what gives the sociogram crossing ties
 * to show instead of a uniform mesh. The empty slot is deliberate — some of the cast belong to
 * nothing, and the view has a ring for them.
 */
const FACTIONS: (string | null)[] = [
	'The Crown', 'Thieves Guild', 'Temple of Ash', 'The Rebellion', 'Merchant League',
	'City Watch', null,
]

/** Same surname, same faction, every run — a family that reshuffles its loyalties is no test. */
function factionFor(surname: string): string | null {
	let h = 0
	for (let i = 0; i < surname.length; i++) h = (h * 31 + surname.charCodeAt(i)) >>> 0
	return FACTIONS[h % FACTIONS.length]!
}

/** The kinds a stranger can be tied to a stranger by — everything that is not descent. */
export const SOCIAL_KINDS = ['friend','best-friend','acquaintance','colleague','neighbor','ally','rival','enemy','mentor']

/**
 * Every draw in this module goes through here, so it can be fixed. `Math.random` in the app, always —
 * a generated cast that came out the same every time would be a strange thing to offer a writer.
 */
let roll: () => number = Math.random

/**
 * Fix the dice, or hand them back with `null`.
 *
 * For the tests that assert something about the *spread* of a generated cast rather than an invariant
 * of it — that every tenth of a span has somebody born in it, say. A distribution rolled fresh every
 * run misses its own tail every so often, and a suite that fails once in fifty green builds is a suite
 * people learn to re-run instead of read. Invariants are still rolled free: a rule that has to hold
 * whatever the dice do wants the dice to keep moving.
 *
 * mulberry32, which is four lines and has no business being a dependency.
 */
export function seedCast(n: number | null): void {
	if (n === null) {
		roll = Math.random
		return
	}
	let a = n >>> 0
	roll = () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export const pick = <T>(a: readonly T[]): T => a[Math.floor(roll() * a.length)]!
export const rnd = (lo: number, hi: number): number => Math.floor(roll() * (hi - lo)) + lo
const chance = (p: number): boolean => roll() < p

/** The first and last year something is on the timeline for. */
export type Span = [number, number]

/** Where generated people live when the timeline has nothing dated on it to go by. */
export const FALLBACK_SPAN: Span = [900, 1100]

/**
 * Roughly the years one family covers: five generations at a generation apiece, plus the last
 * generation's lives. It is what a group is given room for, and what decides how many separate
 * groups a long timeline gets.
 */
export const FAMILY_YEARS = 200

/**
 * Roughly the years one of `planCast`'s small families covers: two or three generations and the last
 * one's lives. `FAMILY_YEARS` is the five-generation figure, and reserving that much after a family
 * of six left the last two centuries of a long timeline empty — which is what made a generated cast
 * stop short of the end.
 */
export const SMALL_FAMILY_YEARS = 60

/**
 * Days in the year the generators date to. The real length lives on the timeline's own calendar and
 * this module is pure, so a plain 365 stands in: the point is that two people born in the same year
 * are born on different days, not that the day is one the calendar has a name for.
 *
 * ponytail: `CreationGranularity` stays at years, so the editor opens on the year and `holdDate`
 * keeps the fraction it found untouched. Passing the timeline's own day rung in is the upgrade.
 */
const DAYS_IN_YEAR = 365

/** A day of the year as the fraction a stored absolute carries: `year + dayOfYear()`. */
const dayOfYear = (): number => rnd(0, DAYS_IN_YEAR) / DAYS_IN_YEAR

/**
 * The years the timeline already covers, or null if nothing on it is dated. Boundary items count —
 * they are there precisely to say how far the timeline runs.
 */
export function timelineSpan(items: readonly { Year: number; EndYear: number | null }[]): Span | null {
	let from = Infinity
	let to = -Infinity
	for (const i of items) {
		if (!Number.isFinite(i.Year)) continue
		from = Math.min(from, i.Year)
		to = Math.max(to, Number.isFinite(i.EndYear as number) ? Math.max(i.Year, i.EndYear!) : i.Year)
	}
	return from <= to ? [from, to] : null
}

/**
 * The year the `done`-th of `total` people belongs at: the span cut into one slot per person and a
 * jitter inside it. Even by construction — `total` uniform draws over a long span leave centuries
 * empty and pile three families onto one decade, which is the clustering this is here to stop.
 *
 * `room` is what the thing being placed needs *after* its start year, so the last group founded
 * still dies inside the timeline rather than off the end of it.
 *
 * `width` is how many of `total` this one placement accounts for. The jitter has to be as wide as the
 * group's own share or a cast built in families of six lands on a six-slot grid and comes out striped:
 * a century of people, five empty, a century of people.
 */
export function eraFor(span: Span, done: number, total: number, room = 0, width = 1): number {
	const last = Math.max(span[0], span[1] - room)
	return Math.round(span[0] + (last - span[0]) * (done + roll() * width) / Math.max(1, total))
}

interface PersonOptions {
	lastName?: string
	gender?: string | null
	birthYear?: number
	span?: Span
}

/** One made-up person, marked so clearTestCast() can take them away again. */
export function randomPerson(timelineId: number, o: PersonOptions = {}): CharacterItem {
	const gender = o.gender !== undefined ? o.gender : chance(0.48) ? 'female' : chance(0.94) ? 'male' : null
	const pool = gender === 'male' ? FIRST_M : gender === 'female' ? FIRST_F : [...FIRST_F, ...FIRST_M]
	const span = o.span ?? FALLBACK_SPAN
	const birth = o.birthYear ?? rnd(span[0], Math.max(span[0], span[1] - 80) + 1)

	const c = blankCharacter(timelineId)
	c.FirstName = pick(pool)
	c.LastName = o.lastName ?? pick(SURNAMES)
	c.Name = `${c.FirstName} ${c.LastName}`
	c.Gender = gender
	c.BirthYear = birth
	// Not everyone has died yet, and the ones who have give the year scrubber something to dim.
	c.DeathYear = chance(0.65) ? birth + rnd(41, 92) : null
	// A day of the year, not the first of it: everyone born in one year sharing a birthday is the one
	// thing about a generated cast that never happens in a real one.
	c.AbsoluteStart = birth + dayOfYear()
	c.AbsoluteEnd = c.DeathYear === null ? null : c.DeathYear + dayOfYear()
	c.Race = chance(0.3) ? pick(RACES) : null
	c.Faction = factionFor(c.LastName)
	c.Color = pick(COLORS)
	c.Importance = rnd(1, 11)
	c.Notes = TEST_MARK
	// On the canvas from the start: a generated cast nobody can see on the timeline tests half of
	// what it was generated for. The dates are already here, so this only decides whether the birth
	// and death items draw — `saveCast` is what actually writes them.
	c.ShowOnTimeline = true
	return c
}

/**
 * A family that reaches down the generations: a founding couple, their children, the people some
 * of those children marry, and so on until `size` is reached. Blood keeps the surname, in-marrying
 * spouses keep their own — which is what makes the family tree worth looking at.
 */
export function planFamily(
	timelineId: number,
	size: number,
	opts: { baseYear?: number; surname?: string; minGenerations?: number; generations?: number; span?: Span } = {},
): CastPlan {
	const want = Math.max(2, Math.min(Math.floor(size), 400))
	// A generation per eight people, at least. Left to the dice a family comes out as one enormous
	// sibling set, and seventy brothers is a far stranger thing to write than great-grandparents.
	// A floor, not a setting: a caller asking for more depth than that still gets it.
	// `minGenerations` is a floor; `generations` is a target and wins in both directions, because
	// "spread these forty over three" is a picture of three crowded rows, not of five. One is not a
	// family, so it reads as two. Two people per generation is what carrying a line down one
	// actually costs, so that is the ceiling — asking for more spends a headcount that is not there,
	// and below two the option has nothing to say and gets out of the way.
	const asked = opts.generations ? Math.max(2, Math.floor(opts.generations)) : 0
	const capped = Math.min(asked, Math.floor(want / 2))
	const gens = capped >= 2 ? capped : 0
	const minGens = gens || Math.max(opts.minGenerations ?? 0, Math.ceil(want / 8))
	/** Is a generation below this one still owed? Depth outranks the headcount until it is paid. */
	const owed = (gen: number): boolean => gen < minGens - 1
	const surname = opts.surname ?? pick(SURNAMES)
	// The founders early enough that their great-great-grandchildren are still on the timeline.
	const span = opts.span ?? FALLBACK_SPAN
	const base = opts.baseYear ?? rnd(span[0], Math.max(span[0], span[1] - FAMILY_YEARS) + 1)

	const characters: CharacterItem[] = []
	const relations: CharacterRelationship[] = []
	const paired = new Set<string>()

	const add = (o: PersonOptions): CharacterItem => {
		const c = randomPerson(timelineId, o)
		characters.push(c)
		return c
	}
	// The pair goes in the order the kind reads: for 'parent', A is the parent.
	const tie = (kind: string, a: CharacterItem, b: CharacterItem, extra: Partial<CharacterRelationship> = {}) => {
		const key = pairKey(a.Id, b.Id)
		if (a.Id === b.Id || paired.has(key)) return
		paired.add(key)
		const r = { ...blankRelation(a.Id, timelineId, kind), Character2Id: b.Id, ...extra }
		r.AbsoluteStart = r.StartYear
		r.AbsoluteEnd = r.EndYear
		// Spread out, so the thickness and the dashes have something to show.
		r.RelationshipStrength = rnd(10, 101)
		if (chance(0.12)) r.RelationshipModifier = pick(RELATION_MODIFIERS)
		relations.push(r)
	}

	const founderA = add({ lastName: surname, gender: 'male', birthYear: base })
	const founderB = add({ lastName: pick(SURNAMES), gender: 'female', birthYear: base + rnd(-4, 5) })
	tie('spouse', founderA, founderB, { StartYear: base + rnd(18, 27) })

	// A deep family spends its budget on the spine, and a single line of descent has no cousins in
	// it — everyone is someone's parent or child. Three are held back for a second line, whenever
	// there is enough left over after the deep one.
	const budget = minGens && want >= 2 + (minGens - 1) * 2 + 3 ? want - 3 : want
	const eldest: CharacterItem[] = []
	/** Every couple the loop reached, with their children, for the top-up at the end. */
	const fillable: [CharacterItem, CharacterItem, CharacterItem[]][] = []

	let couples: [CharacterItem, CharacterItem][] = [[founderA, founderB]]
	// Every pass adds at least one person and the loop stops the moment the headcount is met, so
	// the cap is only there in case a bug leaves it going. It needs slack well past `minGens`:
	// while depth is still owed a generation adds only the two people carrying the line, so the
	// rest of the headcount is spent in the generations after that, and a tight cap strands it.
	// With a target depth the cap is the whole point: the loop has to stop descending even with
	// headcount left over, and the leftovers go sideways in the top-up at the end.
	const maxGens = gens ? gens - 1 : minGens + 20
	for (let gen = 0; gen < maxGens && (characters.length < budget || owed(gen)) && couples.length; gen++) {
		const next: [CharacterItem, CharacterItem][] = []
		for (const [pa, pb] of couples) {
			// Past the headcount, depth is the only reason to carry on — and depth needs one line,
			// not all of them. Once somebody in this generation has married and gone into `next`,
			// the rest stop, exactly as the spouse loop below stops after the first match.
			if (characters.length >= budget && (next.length || !owed(gen))) break
			const born = (pa.BirthYear ?? base) + rnd(20, 31)
			const kids: CharacterItem[] = []
			// Every couple the loop reaches is one that may have children — it never descends past
			// the cap — so this is exactly the list the top-up is allowed to widen.
			fillable.push([pa, pb, kids])
			// Held back for the generations still owed, a child and a spouse each, or a wide first
			// generation spends the whole budget and the line stops three deep. Both loops below
			// spend from it, so both have to know about it.
			const held = owed(gen) ? (minGens - 1 - gen) * 2 : 0
			// A fixed one-to-five children cannot fit forty people into three generations, so under
			// a target depth the width is what gives: this generation takes its share of whoever is
			// unplaced, split over the couples in it and the generations left to go.
			const spare = budget - characters.length - held
			const wide = gens ? Math.max(1, Math.ceil(spare / (couples.length * (gens - 1 - gen)))) : rnd(1, 5)
			const room = Math.min(wide, spare)
			// Forcing a child when there is no room left is how depth gets paid for, but it is worth
			// exactly one couple: the reserve holds two people per owed generation, so a second
			// couple forcing one too spends a reserve that was never theirs and the family comes out
			// over its headcount. Once this generation has married somebody off, the rest are done.
			const carry = owed(gen) && !next.length
			for (let i = 0, n = Math.max(carry ? 1 : 0, room); i < n; i++) {
				const kid = add({ lastName: surname, birthYear: born + i * rnd(1, 4) })
				tie('parent', pa, kid)
				tie('parent', pb, kid)
				for (const s of kids) tie('sibling', s, kid)
				kids.push(kid)
			}
			if (gen === 0) eldest.push(...kids)
			for (const kid of kids) {
				// Out of room but still owing depth: exactly one of them marries and carries the line.
				// `held` is what stops a generation with five children marrying all five off and
				// leaving the great-grandchildren nothing; with nothing owed it is 0 and this is
				// just the headcount.
				if (characters.length >= budget - held && (next.length || !owed(gen))) break
				// The first kid of a generation always marries, so the line cannot die out with
				// people still to place.
				if (next.length && !chance(0.55)) continue
				const spouse = add({
					lastName: pick(SURNAMES),
					gender: kid.Gender === 'female' ? 'male' : 'female',
					birthYear: (kid.BirthYear ?? born) + rnd(-4, 5),
				})
				tie('spouse', kid, spouse, { StartYear: (kid.BirthYear ?? born) + rnd(18, 27) })
				next.push([kid, spouse])
			}
		}
		couples = next
	}

	// The second line, from the room held back: another child of the founders, married, with a child
	// of their own. That is where this family's aunts, uncles and cousins come from.
	if (budget < want) {
		const born = (founderA.BirthYear ?? base) + rnd(20, 31)
		const kid = add({ lastName: surname, birthYear: born })
		tie('parent', founderA, kid)
		tie('parent', founderB, kid)
		for (const s of eldest) tie('sibling', s, kid)
		const spouse = add({
			lastName: pick(SURNAMES),
			gender: kid.Gender === 'female' ? 'male' : 'female',
			birthYear: born + rnd(-4, 5),
		})
		tie('spouse', kid, spouse, { StartYear: born + rnd(18, 27) })
		// The cousin stands a generation below this line, so a family held to two has nowhere to
		// put it. The top-up below makes the missing person back up as another sibling.
		if (gens !== 2) {
			const grandkid = add({ lastName: surname, birthYear: born + rnd(20, 31) })
			tie('parent', kid, grandkid)
			tie('parent', spouse, grandkid)
		}
	}

	// A family held to a depth runs out of generations before it runs out of people, and whoever is
	// left over has to go sideways. Round-robin over the couples the loop reached, so the extra
	// siblings spread across the family rather than piling onto the founders. Left unconditional
	// because in the uncapped path the headcount lands on its own and this does nothing.
	for (let i = 0; characters.length < want && fillable.length; i++) {
		const [pa, pb, kids] = fillable[i % fillable.length]!
		const kid = add({ lastName: surname, birthYear: (pa.BirthYear ?? base) + rnd(20, 31) })
		tie('parent', pa, kid)
		tie('parent', pb, kid)
		for (const s of kids) tie('sibling', s, kid)
		kids.push(kid)
	}

	return { characters, relations }
}

/**
 * A whole cast: mostly families, a few people who arrived alone, and social ties thrown across the
 * lot so it reads as one loose web rather than a row of islands. Some are left unconnected on
 * purpose — the relations window has a panel for exactly those.
 */
export function planCast(timelineId: number, count: number, span: Span = FALLBACK_SPAN): CastPlan {
	const want = Math.max(1, Math.min(Math.floor(count), 500))
	const characters: CharacterItem[] = []
	const relations: CharacterRelationship[] = []

	while (characters.length < want) {
		const room = want - characters.length
		const alone = room <= 2 || !chance(0.75)
		// How many this round accounts for has to be known before the year, because it is also how wide
		// the jitter is allowed to be — see `eraFor`.
		const size = alone ? Math.min(room, rnd(1, 3)) : Math.min(room, rnd(3, 10))
		// Each family and each loner is founded anywhere inside its own share of the span, so a cast
		// generated onto a long timeline covers it rather than crowding into one century or striping.
		const base = eraFor(span, characters.length, want, SMALL_FAMILY_YEARS, size)
		if (alone) {
			for (let i = 0; i < size; i++)
				characters.push(randomPerson(timelineId, { birthYear: base + rnd(0, 41) }))
			continue
		}
		const family = planFamily(timelineId, size, { baseYear: base })
		characters.push(...family.characters)
		relations.push(...family.relations)
	}

	addSocialTies(timelineId, characters, relations, Math.round(characters.length * 0.7))
	return { characters, relations }
}

/** Throws `tries` random social ties across a cast, skipping the pairs that already have one. */
function addSocialTies(
	timelineId: number,
	characters: CharacterItem[],
	relations: CharacterRelationship[],
	tries: number,
): void {
	const paired = new Set(relations.map(r => pairKey(r.Character1Id, r.Character2Id)))
	for (let i = 0; i < tries; i++) {
		const a = pick(characters)
		const b = pick(characters)
		const key = pairKey(a.Id, b.Id)
		if (a.Id === b.Id || paired.has(key)) continue
		paired.add(key)
		relations.push({
			...blankRelation(a.Id, timelineId, pick(SOCIAL_KINDS)),
			Character2Id: b.Id,
			RelationshipStrength: rnd(10, 101),
		})
	}
}

/** Who is tied to whom by one kind, in the order the ties were made. */
type Kin = Map<string, string[]>
const link = (m: Kin, from: string, to: string): void => {
	const there = m.get(from)
	if (there) there.push(to)
	else m.set(from, [to])
}
const near = (m: Kin, id: string): string[] => m.get(id) ?? []

/**
 * The family kinds that fall out of who is whose parent, sibling and spouse: grandparents, aunts
 * and uncles by blood and by marriage, cousins, parents- and siblings-in-law. `rate` is the share
 * of them actually written, because a real file has a scattering of these rather than the whole
 * closure — a five-generation family has more cousin pairs than it has people.
 */
export function planKinship(timelineId: number, plan: CastPlan, rate = 0.34): CharacterRelationship[] {
	const parents: Kin = new Map()
	const children: Kin = new Map()
	const siblings: Kin = new Map()
	const spouses: Kin = new Map()
	for (const r of plan.relations) {
		const a = r.Character1Id
		const b = r.Character2Id
		if (r.RelationshipType === 'parent') { link(parents, b, a); link(children, a, b) }
		else if (r.RelationshipType === 'spouse') { link(spouses, a, b); link(spouses, b, a) }
		else if (r.RelationshipType === 'sibling' || r.RelationshipType === 'half-sibling') {
			link(siblings, a, b)
			link(siblings, b, a)
		}
	}

	const seen = new Set(plan.relations.map(r => pairKey(r.Character1Id, r.Character2Id)))
	const found: CharacterRelationship[] = []
	// The pair goes in the order the kind reads: for 'aunt-uncle', A is the aunt or uncle.
	const add = (kind: string, a: string, b: string) => {
		const key = pairKey(a, b)
		if (a === b || seen.has(key)) return
		seen.add(key)
		found.push({ ...blankRelation(a, timelineId, kind), Character2Id: b, RelationshipStrength: rnd(10, 101) })
	}

	for (const c of plan.characters) {
		for (const parent of near(parents, c.Id)) {
			for (const grand of near(parents, parent)) add('grandparent', grand, c.Id)
			for (const sib of near(siblings, parent)) {
				add('aunt-uncle', sib, c.Id)
				for (const married of near(spouses, sib)) add('aunt-uncle', married, c.Id)
				for (const cousin of near(children, sib)) add('cousin', c.Id, cousin)
			}
		}
		for (const spouse of near(spouses, c.Id)) {
			for (const parent of near(parents, spouse)) add('parent-in-law', parent, c.Id)
			for (const sib of near(siblings, spouse)) add('sibling-in-law', c.Id, sib)
		}
		for (const sib of near(siblings, c.Id))
			for (const married of near(spouses, sib)) add('sibling-in-law', c.Id, married)
	}

	if (rate >= 1) return found
	// Shuffled before the cut, or the kinds worked out first crowd the in-laws out of the sample.
	const shuffled = found.sort(() => roll() - 0.5)
	// One of every kind goes to the front: a sample that happens to drop every cousin reads as a
	// family that has none, and the whole point of the sample is that it looks like the full thing.
	const kinds = new Set<string>()
	const first: CharacterRelationship[] = []
	const rest: CharacterRelationship[] = []
	for (const r of shuffled) {
		if (kinds.has(r.RelationshipType)) rest.push(r)
		else { kinds.add(r.RelationshipType); first.push(r) }
	}
	return [...first, ...rest].slice(0, Math.round(found.length * Math.max(0, rate)))
}

/** Under this a group cannot hold five generations and a second family to marry into as well. */
const MIN_GROUP = 14

/**
 * A group that reads like a real cast: one main line five generations deep, smaller families
 * married into it, the aunts, cousins and in-laws that fall out of all that, and some friends and
 * rivals thrown across the lot. Everyone lands in one web, most of them through blood or marriage
 * rather than a friendship.
 */
export function planPlausibleGroup(timelineId: number, count: number, span: Span = FALLBACK_SPAN): CastPlan {
	const want = Math.max(MIN_GROUP, Math.min(Math.floor(count), 500))

	// A group is one web of blood and marriage, so it can only live in one era — stretching *it* over
	// a long timeline would marry a woman to her own great-grandchild. A long timeline gets more
	// groups instead, one per era it has room for, each built exactly as before inside its own slice.
	// Below MIN_GROUP people a slice cannot hold five generations and a family to marry into, so the
	// headcount is the other limit on how many there can be.
	const clans = Math.max(1, Math.min(
		Math.round((span[1] - span[0]) / FAMILY_YEARS),
		Math.floor(want / MIN_GROUP),
	))
	if (clans > 1) {
		const all: CastPlan = { characters: [], relations: [] }
		for (let i = 0; i < clans; i++) {
			const from = eraFor(span, i, clans, FAMILY_YEARS)
			// Floor-difference rather than want/clans, so the parts add back up to what was asked for.
			const share = Math.floor(((i + 1) * want) / clans) - Math.floor((i * want) / clans)
			const clan = planPlausibleGroup(timelineId, share, [from, from + FAMILY_YEARS])
			all.characters.push(...clan.characters)
			all.relations.push(...clan.relations)
		}
		return all
	}

	const base = rnd(span[0], Math.max(span[0], span[1] - FAMILY_YEARS) + 1)
	const taken = new Set<string>()
	const surname = (): string => {
		const free = SURNAMES.filter(s => !taken.has(s))
		const name = free.length ? pick(free) : pick(SURNAMES)
		taken.add(name)
		return name
	}

	const characters: CharacterItem[] = []
	const relations: CharacterRelationship[] = []
	const take = (plan: CastPlan): CastPlan => {
		characters.push(...plan.characters)
		relations.push(...plan.relations)
		return plan
	}

	// Thirteen is the floor for five generations plus the second line — below it, no cousins.
	const main = take(planFamily(timelineId, Math.max(13, Math.round(want * 0.55)), {
		baseYear: base,
		surname: surname(),
		minGenerations: 5,
	}))

	const married = new Set<string>()
	for (const r of relations)
		if (r.RelationshipType === 'spouse') { married.add(r.Character1Id); married.add(r.Character2Id) }
	const free = (of: CharacterItem[]): CharacterItem[] =>
		of.filter(c => !married.has(c.Id) && c.BirthYear !== null)

	// Every other family is built around the marriage that joins it on, rather than built first and
	// matched up after: someone in the web who never married sets the era, so the family's own
	// unmarried child comes out their age. Spouses come in pairs, so an odd family can never be all
	// couples — there is always someone for them to marry. A family that has joined can be married
	// into in its turn, which is what puts a second cousin four steps from a first.
	const pool: CharacterItem[] = [...main.characters]
	while (want - characters.length >= 5) {
		const anchor = free(pool).length ? pick(free(pool)) : null
		const room = Math.min(want - characters.length, 5 + rnd(0, 3) * 2)
		const family = take(planFamily(timelineId, room % 2 ? room : room - 1, {
			// Their founders a generation above the anchor, so their children are the anchor's age.
			baseYear: (anchor?.BirthYear ?? base + rnd(55, 96)) - rnd(20, 31),
			surname: surname(),
		}))
		if (!anchor?.BirthYear) continue
		const born = anchor.BirthYear
		// A nudge, not a rule: same-sex couples happen, they are just not the first guess.
		const apart = (c: CharacterItem) =>
			Math.abs(c.BirthYear! - born) + (c.Gender && c.Gender === anchor.Gender ? 3 : 0)
		const match = free(family.characters).sort((a, b) => apart(a) - apart(b))[0]
		if (!match) continue
		married.add(anchor.Id)
		married.add(match.Id)
		pool.push(...family.characters)
		const wed = Math.max(born, match.BirthYear!) + rnd(18, 27)
		relations.push({
			...blankRelation(anchor.Id, timelineId, 'spouse'),
			Character2Id: match.Id,
			StartYear: wed,
			AbsoluteStart: wed,
			RelationshipStrength: rnd(40, 101),
		})
	}
	// Whatever is left over arrived alone, the way part of a cast always has.
	while (characters.length < want) characters.push(randomPerson(timelineId, { birthYear: base + rnd(60, 141) }))

	// After the marriages, so the in-laws reach across the families they just joined.
	relations.push(...planKinship(timelineId, { characters, relations }))
	addSocialTies(timelineId, characters, relations, Math.round(characters.length * 0.3))
	return { characters, relations }
}

// ----------------------------------------------------------------------------------------------
// Events at places

/** One generated event and who was at it — `MentionedOnly` people are talked about, not present. */
export interface EventPlan {
	item: TimelineItem
	cast: { CharacterId: string; Role: string | null; MentionedOnly: boolean }[]
}

/** `{place}` is filled in with the name of the pin the event is hung on. */
const EVENT_FORMS = [
	'The council at {place}', 'A duel at {place}', 'The fire at {place}', 'The summer fair at {place}',
	'A wedding at {place}', 'The oath sworn at {place}', 'A funeral at {place}', 'The verdict at {place}',
	'A brawl at {place}', 'The market riot at {place}', 'The treaty of {place}', 'A christening at {place}',
	'The harvest feast at {place}', 'A duel refused at {place}', 'The reading of the will at {place}',
	'The night watch at {place}', 'A debt called in at {place}', 'The last coach out of {place}',
]
const PERIOD_FORMS = [
	'The long winter at {place}', 'The works at {place}', 'The occupation of {place}',
	'The plague at {place}', 'The rebuilding of {place}', 'The blockade of {place}',
]
/** Freetext on the appearance row, so the cast panel has something other than a list of names. */
const ROLES: (string | null)[] = [
	'present', 'witness', 'host', 'guest', 'accused', 'speaker', 'wounded', 'sent for', null, null,
]

/** Old enough to be somewhere on purpose, and not yet dead. Someone undated is nobody's alibi. */
const aliveAt = (c: CharacterItem, year: number): boolean =>
	c.BirthYear !== null && year >= c.BirthYear + 14 && year <= (c.DeathYear ?? c.BirthYear + 80)

/**
 * Events that happened *somewhere*, with the people who were there: every one carries a
 * `LocationId` and a present cast, which is exactly the pair the map's year scrubber reads and the
 * paths it draws characters along are made of.
 *
 * Each event starts from one person and a year inside their grown life, so the dates land where the
 * cast actually is rather than spread flat across the era, and the others at it are drawn from
 * whoever else was alive that year.
 *
 * ponytail: the place is drawn at random rather than from where that person already was, so nobody's
 * life is a sensible itinerary — plenty for making the scrubber work, and a journey generator is the
 * upgrade if the paths ever need to make geographical sense as well as exist.
 */
export function planEvents(
	timelineId: number,
	cast: CharacterItem[],
	places: LocationItem[],
	count: number,
): EventPlan[] {
	const want = Math.max(1, Math.min(Math.floor(count), 20000))
	const dated = cast.filter(c => c.BirthYear !== null)
	if (!dated.length || !places.length) return []

	const plans: EventPlan[] = []
	for (let i = 0; i < want; i++) {
		const seed = pick(dated)
		const from = seed.BirthYear! + 14
		const until = seed.DeathYear ?? seed.BirthYear! + 80
		if (until <= from) continue
		const year = rnd(from, until + 1)
		const place = pick(places)
		const period = chance(0.15)

		// Everyone else who could have been there. Drawn from rather than shuffled: a handful out of
		// a cast of hundreds, so random picks land long before a shuffle would have finished.
		const others = dated.filter(c => c.Id !== seed.Id && aliveAt(c, year))
		const present = new Set([seed.Id])
		for (let n = rnd(0, 5); n > 0 && others.length; n--) present.add(pick(others).Id)
		const mentioned = new Set<string>()
		for (let n = chance(0.35) ? rnd(1, 3) : 0; n > 0 && others.length; n--) {
			const who = pick(others).Id
			if (!present.has(who)) mentioned.add(who)
		}

		const endYear = period ? year + rnd(1, 7) : year
		// A day inside each year rather than the first of it. A single-year event is one instant, so
		// both ends are the same day; a period always ends in a later year, so its own two days cannot
		// put the end before the start.
		const at = dayOfYear()
		const endAt = period ? dayOfYear() : at
		plans.push({
			item: {
				Id: crypto.randomUUID(),
				Title: pick(period ? PERIOD_FORMS : EVENT_FORMS).replace('{place}', place.Name),
				// The place by name in the prose as well as in the link: the writing is what the place
				// matcher reads, so a generated world gives its highlighting something to find too.
				Description: `${seed.Name} was at ${place.Name}.`,
				Content: '',
				StoryId: null,
				// 1 = Event, 2 = Period: a few that last, so the scrubber has bars as well as marks.
				TypeId: period ? 2 : 1,
				Year: year,
				EndYear: endYear,
				AbsoluteStart: year + at,
				AbsoluteEnd: endYear + endAt,
				BookTitle: '',
				Chapter: '',
				Page: '',
				Color: seed.Color || '#6366f1',
				CreationGranularity: 3,
				TimelineId: timelineId,
				ItemIndex: 0,
				Placement: 0,
				Centered: false,
				ShowTitle: true,
				ItemNotes: TEST_MARK,
				ShowInNotes: true,
				Importance: rnd(1, 11),
				MinLodLevel: 3,
				LodVisibilityMask: 255,
				LocationId: place.Id,
			},
			cast: [
				...[...present].map(id => ({ CharacterId: id, Role: pick(ROLES), MentionedOnly: false })),
				...[...mentioned].map(id => ({ CharacterId: id, Role: null, MentionedOnly: true })),
			],
		})
	}
	return plans
}

/** The web's connected groups, biggest first. Someone with no relation at all is a group of one. */
export function clusters(ids: string[], relations: CharacterRelationship[]): string[][] {
	const adjacent = new Map<string, string[]>(ids.map(id => [id, []]))
	for (const r of relations) {
		const a = adjacent.get(r.Character1Id)
		const b = adjacent.get(r.Character2Id)
		if (!a || !b) continue
		a.push(r.Character2Id)
		b.push(r.Character1Id)
	}

	const seen = new Set<string>()
	const groups: string[][] = []
	for (const id of ids) {
		if (seen.has(id)) continue
		seen.add(id)
		const group: string[] = []
		const queue = [id]
		while (queue.length) {
			const current = queue.pop()!
			group.push(current)
			for (const other of adjacent.get(current) ?? [])
				if (!seen.has(other)) { seen.add(other); queue.push(other) }
		}
		groups.push(group)
	}
	return groups.sort((a, b) => b.length - a.length)
}

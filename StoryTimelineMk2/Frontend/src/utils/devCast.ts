/**
 * BL-74: the shapes behind the __stl cast generators. Only the planning lives here — the saving is
 * in devHelpers, so a family can be built and checked without a backend to talk to.
 */
import type { CharacterItem, CharacterRelationship } from '@/types/models'
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

export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!
export const rnd = (lo: number, hi: number): number => Math.floor(Math.random() * (hi - lo)) + lo
const chance = (p: number): boolean => Math.random() < p

interface PersonOptions {
	lastName?: string
	gender?: string | null
	birthYear?: number
}

/** One made-up person, marked so clearTestCast() can take them away again. */
export function randomPerson(timelineId: number, o: PersonOptions = {}): CharacterItem {
	const gender = o.gender !== undefined ? o.gender : chance(0.48) ? 'female' : chance(0.94) ? 'male' : null
	const pool = gender === 'male' ? FIRST_M : gender === 'female' ? FIRST_F : [...FIRST_F, ...FIRST_M]
	const birth = o.birthYear ?? rnd(960, 1041)

	const c = blankCharacter(timelineId)
	c.FirstName = pick(pool)
	c.LastName = o.lastName ?? pick(SURNAMES)
	c.Name = `${c.FirstName} ${c.LastName}`
	c.Gender = gender
	c.BirthYear = birth
	// Not everyone has died yet, and the ones who have give the year scrubber something to dim.
	c.DeathYear = chance(0.65) ? birth + rnd(41, 92) : null
	// Whole years, so the absolute is the year: generated people are not dated to the month.
	c.AbsoluteStart = c.BirthYear
	c.AbsoluteEnd = c.DeathYear
	c.Race = chance(0.3) ? pick(RACES) : null
	c.Faction = factionFor(c.LastName)
	c.Color = pick(COLORS)
	c.Importance = rnd(1, 11)
	c.Notes = TEST_MARK
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
	opts: { baseYear?: number; surname?: string; minGenerations?: number; generations?: number } = {},
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
	const base = opts.baseYear ?? rnd(900, 1001)

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
export function planCast(timelineId: number, count: number): CastPlan {
	const want = Math.max(1, Math.min(Math.floor(count), 500))
	const characters: CharacterItem[] = []
	const relations: CharacterRelationship[] = []

	while (characters.length < want) {
		const room = want - characters.length
		if (room <= 2 || !chance(0.75)) {
			for (let i = 0, n = Math.min(room, rnd(1, 3)); i < n; i++) characters.push(randomPerson(timelineId))
			continue
		}
		const family = planFamily(timelineId, Math.min(room, rnd(3, 10)))
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
	const shuffled = found.sort(() => Math.random() - 0.5)
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
export function planPlausibleGroup(timelineId: number, count: number): CastPlan {
	const want = Math.max(MIN_GROUP, Math.min(Math.floor(count), 500))
	const base = rnd(880, 941)
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

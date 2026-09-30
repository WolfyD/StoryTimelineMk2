import { describe, it, expect, afterEach } from 'vitest'
import { clusters, eraFor, FALLBACK_SPAN, FAMILY_YEARS, planCast, planEvents, planFamily, planKinship, planPlausibleGroup, randomPerson, seedCast, TEST_MARK, timelineSpan } from '@/utils/devCast'
import { blankRelation, pairKey } from '@/utils/characterRelations'
import type { CastPlan, Span } from '@/utils/devCast'
import type { CharacterItem, CharacterRelationship, LocationItem } from '@/types/models'

/** Every invariant the generators have to hold whatever the dice do, checked over many rolls. */
function expectWellFormed(plan: CastPlan) {
	const ids = new Set(plan.characters.map(c => c.Id))
	expect(ids.size).toBe(plan.characters.length)
	const pairs = new Set<string>()
	for (const r of plan.relations) {
		expect(ids.has(r.Character1Id)).toBe(true)
		expect(ids.has(r.Character2Id)).toBe(true)
		expect(r.Character1Id).not.toBe(r.Character2Id)
		const key = pairKey(r.Character1Id, r.Character2Id)
		expect(pairs.has(key)).toBe(false)
		pairs.add(key)
	}
}

/** How many people the longest unbroken line of descent runs to. A lone founder is one. */
function generations(plan: CastPlan): number {
	const children = new Map<string, string[]>()
	for (const r of plan.relations) {
		if (r.RelationshipType !== 'parent') continue
		const there = children.get(r.Character1Id)
		if (there) there.push(r.Character2Id)
		else children.set(r.Character1Id, [r.Character2Id])
	}
	// Children are always born after their parents, so descent cannot loop back on itself.
	const depth = new Map<string, number>()
	const walk = (id: string): number => {
		const known = depth.get(id)
		if (known) return known
		const below = (children.get(id) ?? []).map(walk)
		const mine = 1 + Math.max(0, ...below)
		depth.set(id, mine)
		return mine
	}
	return Math.max(0, ...plan.characters.map(c => walk(c.Id)))
}

describe('randomPerson', () => {
	it('marks everyone, so clearTestCast() can find them again', () => {
		expect(randomPerson(1).Notes).toBe(TEST_MARK)
	})

	it('is on the canvas without anyone having to tick a box', () => {
		expect(randomPerson(1).ShowOnTimeline).toBe(true)
	})

	it('never dies before it is born', () => {
		for (let i = 0; i < 200; i++) {
			const c = randomPerson(1)
			if (c.DeathYear !== null) expect(c.DeathYear).toBeGreaterThan(c.BirthYear!)
		}
	})

	// Birthdays are days of the year: everyone born in one year sharing the first of January is the
	// one thing about a generated cast that never happens in a real one.
	it('gives everyone a day inside their birth year, not the first of it', () => {
		const people = Array.from({ length: 200 }, () => randomPerson(1))
		for (const c of people) {
			expect(c.AbsoluteStart).toBeGreaterThanOrEqual(c.BirthYear!)
			expect(c.AbsoluteStart).toBeLessThan(c.BirthYear! + 1)
			if (c.DeathYear === null) expect(c.AbsoluteEnd).toBeNull()
			else {
				expect(c.AbsoluteEnd).toBeGreaterThanOrEqual(c.DeathYear)
				expect(c.AbsoluteEnd).toBeLessThan(c.DeathYear + 1)
			}
		}
		expect(new Set(people.map(c => c.AbsoluteStart! - c.BirthYear!)).size).toBeGreaterThan(50)
	})
})

describe('planFamily', () => {
	it('reaches the size asked for and stays well formed', () => {
		// Ten rolls of the dice, because the shape is random and only the invariants are fixed.
		for (let i = 0; i < 10; i++) {
			const plan = planFamily(1, 30)
			expect(plan.characters.length).toBe(30)
			expectWellFormed(plan)
		}
	})

	it('is a family: couples and descent, not a bag of strangers', () => {
		const plan = planFamily(1, 12)
		const kinds = new Set(plan.relations.map(r => r.RelationshipType))
		expect(kinds.has('spouse')).toBe(true)
		expect(kinds.has('parent')).toBe(true)
		// A spouse tie is dated, so the year scrubber has something to move through.
		expect(plan.relations.find(r => r.RelationshipType === 'spouse')!.StartYear).not.toBeNull()
	})

	it('children are born after the parent they hang off', () => {
		const plan = planFamily(1, 40)
		const byId = new Map(plan.characters.map(c => [c.Id, c]))
		for (const r of plan.relations.filter(r => r.RelationshipType === 'parent')) {
			const parent = byId.get(r.Character1Id)!
			const child = byId.get(r.Character2Id)!
			expect(child.BirthYear!).toBeGreaterThan(parent.BirthYear!)
		}
	})

	it('cannot be asked for fewer than the founding couple', () => {
		expect(planFamily(1, 0).characters.length).toBe(2)
	})
})

describe('planCast', () => {
	it('makes exactly the number asked for, and wires them loosely together', () => {
		const plan = planCast(1, 60)
		expect(plan.characters.length).toBe(60)
		expectWellFormed(plan)
		// Loose, not complete: some of the cast are meant to be left out of the web entirely.
		expect(plan.relations.length).toBeGreaterThan(10)
	})
})

describe('spreading a cast over the timeline it is generated onto', () => {
	const SPAN: Span = [-2000, 8000]

	/**
	 * Fixed dice, for the claims in here about the *spread* of a cast rather than an invariant of one.
	 * "Every tenth of the span has somebody born in it" is a claim about a distribution, and a
	 * distribution rolled fresh every run misses its own tail every so often — this one came back 9
	 * about once in fifty runs, and a suite that fails on a green build is one people re-run instead of
	 * read. Only the tests that ask for it get them: an invariant, a rule that has to hold whatever the
	 * dice do, wants the dice to keep moving, and two wrong bounds in this very file were caught by
	 * exactly that.
	 */
	const SEED = 20260928
	afterEach(() => seedCast(null))

	/** How many tenths of the span have somebody born in them. */
	const covered = (plan: CastPlan): number => {
		const tenths = new Set<number>()
		for (const c of plan.characters)
			tenths.add(Math.min(9, Math.floor(((c.BirthYear! - SPAN[0]) / (SPAN[1] - SPAN[0])) * 10)))
		return tenths.size
	}

	it('reads the span off the items, boundaries and all', () => {
		const at = (Year: number, EndYear: number | null = null) => ({ Year, EndYear })
		expect(timelineSpan([at(40), at(-10, 5), at(12, 900)])).toEqual([-10, 900])
		// A period that outruns its own end year must not shorten the span.
		expect(timelineSpan([at(50, 10)])).toEqual([50, 50])
		expect(timelineSpan([])).toBeNull()
	})

	it('puts a cast across the whole span instead of one clump', () => {
		seedCast(SEED)
		const plan = planCast(1, 120, SPAN)
		expect(plan.characters.length).toBe(120)
		expect(covered(plan)).toBe(10)
		// A founder's spouse may be a few years the elder, so the start is a guide, not a wall.
		for (const c of plan.characters) expect(c.BirthYear).toBeGreaterThan(SPAN[0] - 10)
		expectWellFormed(plan)
	})

	// The two halves of "it still doesn't quite cover the whole range": a jitter narrower than the
	// group it places puts every family at the head of its own slot, and a reserve meant for five
	// generations leaves the last two centuries of the timeline empty.
	it('jitters a group across its own share of the span, not just the head of it', () => {
		const span: Span = [0, 1000]
		const wide = Array.from({ length: 200 }, () => eraFor(span, 0, 50, 0, 5))
		expect(Math.max(...wide)).toBeGreaterThan(80)
		expect(Math.max(...wide)).toBeLessThanOrEqual(100)
		// One person still lands inside one person's worth of the span.
		expect(Math.max(...Array.from({ length: 200 }, () => eraFor(span, 0, 50)))).toBeLessThanOrEqual(20)
	})

	it('runs a cast to the end of the span rather than stopping short of it', () => {
		seedCast(SEED)
		const latest = Math.max(...planCast(1, 120, SPAN).characters.map(c => c.BirthYear!))
		expect(SPAN[1] - latest).toBeLessThan((SPAN[1] - SPAN[0]) / 10)
	})

	it('gives a long timeline several plausible groups rather than one stretched one', () => {
		seedCast(SEED)
		const plan = planPlausibleGroup(1, 300, SPAN)
		expect(plan.characters.length).toBeGreaterThanOrEqual(300)
		expect(covered(plan)).toBe(10)
		expectWellFormed(plan)
		// Each group still has to hold together: nobody is tied to somebody centuries away.
		const born = new Map(plan.characters.map(c => [c.Id, c.BirthYear!]))
		for (const r of plan.relations)
			expect(Math.abs(born.get(r.Character1Id)! - born.get(r.Character2Id)!)).toBeLessThan(FAMILY_YEARS)
	})

	it('keeps one family in one era, wherever in the span it lands', () => {
		const plan = planFamily(1, 40, { span: SPAN })
		const years = plan.characters.map(c => c.BirthYear!)
		// Against the family's own depth rather than the flat `FAMILY_YEARS`, which is the five-generation
		// figure the *reservation* uses and its own doc calls "roughly". Forty people fit in three or four
		// generations when the widths come out generous and in a dozen when they come out 1 every time,
		// and a dozen generations really is three hundred years — that is what a family is, not a fault.
		// What must hold is that the span is no more than its descent costs: a generation apiece at the
		// most (`rnd(20, 31)`), plus the last generation's siblings staggered up to three years each
		// (`i * rnd(1, 4)`, four kids at the widest) and a spouse up to four years either side.
		const worst = (generations(plan) - 1) * 30 + 9 + 4 + 4
		expect(Math.max(...years) - Math.min(...years)).toBeLessThanOrEqual(worst)
		expect(Math.min(...years)).toBeGreaterThan(SPAN[0] - 10)
	})

	it('dates its events across the span too, because they follow the cast', () => {
		seedCast(SEED)
		const where = [{
			Id: 'l-inn', MapId: 'm', ChildMapId: null, Name: 'The Inn', Description: null,
			X: 0.5, Y: 0.5, Color: null, Icon: null, FootprintW: null, MarkerStyle: null,
		} as LocationItem]
		const cast = planCast(1, 120, SPAN).characters
		const years = planEvents(1, cast, where, 600).map(p => p.item.Year)
		const tenths = new Set(years.map(y => Math.min(9, Math.floor(((y - SPAN[0]) / 10000) * 10))))
		expect(tenths.size).toBe(10)
	})

	it('falls back to its own era when the timeline has nothing dated on it', () => {
		for (const plan of [planCast(1, 30), planPlausibleGroup(1, 30), planFamily(1, 20)])
			for (const c of plan.characters) {
				// A generation's slack either side, not ten years. `planPlausibleGroup` founds each
				// in-marrying family a generation *above* the person it marries into the web, and a family
				// that has joined can be married into in its turn — so a chain of them walks backwards out
				// of the era about as fast as descent walks forwards out of it. Ten years only ever covered
				// a founder's spouse being the elder.
				expect(c.BirthYear).toBeGreaterThan(FALLBACK_SPAN[0] - FAMILY_YEARS)
				expect(c.BirthYear).toBeLessThan(FALLBACK_SPAN[1] + FAMILY_YEARS)
			}
	})
})

describe('clusters', () => {
	const rel = (a: string, b: string) => ({ ...planFamily(1, 2).relations[0]!, Character1Id: a, Character2Id: b })

	it('groups what is connected, biggest first, and leaves loners alone', () => {
		const groups = clusters(
			['a', 'b', 'c', 'd', 'loner'],
			[rel('a', 'b'), rel('b', 'c'), rel('c', 'a'), rel('d', 'c')],
		)
		expect(groups.length).toBe(2)
		expect([...groups[0]!].sort()).toEqual(['a', 'b', 'c', 'd'])
		expect(groups[1]).toEqual(['loner'])
	})

	it('ignores relations pointing at someone who is not in the list', () => {
		expect(clusters(['a'], [rel('a', 'ghost')])).toEqual([['a']])
	})
})

describe('planKinship', () => {
	// One of every shape it is meant to find: a grandparent, an aunt with a husband and a child of
	// her own, and a spouse who comes with a parent and a sibling.
	const ids = ['grand', 'parent', 'aunt', 'uncle', 'cousin', 'me', 'wife', 'wifesDad', 'wifesSister']
	const people = ids.map(id => ({ ...randomPerson(1), Id: id }) as CharacterItem)
	const tie = (kind: string, a: string, b: string): CharacterRelationship =>
		({ ...blankRelation(a, 1, kind), Character2Id: b })
	const plan: CastPlan = {
		characters: people,
		relations: [
			tie('parent', 'grand', 'parent'),
			tie('parent', 'grand', 'aunt'),
			tie('sibling', 'parent', 'aunt'),
			tie('spouse', 'aunt', 'uncle'),
			tie('parent', 'aunt', 'cousin'),
			tie('parent', 'parent', 'me'),
			tie('spouse', 'me', 'wife'),
			tie('parent', 'wifesDad', 'wife'),
			tie('sibling', 'wife', 'wifesSister'),
		],
	}
	const found = planKinship(1, plan, 1)
	const kindOf = (a: string, b: string) =>
		found.find(r => pairKey(r.Character1Id, r.Character2Id) === pairKey(a, b))

	it('works out the kinds nobody wrote down', () => {
		expect(kindOf('grand', 'me')?.RelationshipType).toBe('grandparent')
		expect(kindOf('aunt', 'me')?.RelationshipType).toBe('aunt-uncle')
		// An uncle by marriage is still the uncle.
		expect(kindOf('uncle', 'me')?.RelationshipType).toBe('aunt-uncle')
		expect(kindOf('cousin', 'me')?.RelationshipType).toBe('cousin')
		expect(kindOf('wifesDad', 'me')?.RelationshipType).toBe('parent-in-law')
		expect(kindOf('wifesSister', 'me')?.RelationshipType).toBe('sibling-in-law')
	})

	it('puts the pair in the order the kind reads', () => {
		// 'aunt or uncle of' — the aunt is the first of the pair, the niece or nephew the second.
		expect(kindOf('aunt', 'me')?.Character1Id).toBe('aunt')
		expect(kindOf('grand', 'me')?.Character1Id).toBe('grand')
		expect(kindOf('wifesDad', 'me')?.Character1Id).toBe('wifesDad')
	})

	it('never says twice what is already written down', () => {
		expectWellFormed({ characters: people, relations: [...plan.relations, ...found] })
	})

	it('writes only a share of them unless asked for the lot', () => {
		expect(planKinship(1, plan, 0).length).toBe(0)
		expect(planKinship(1, plan, 0.5).length).toBe(Math.round(found.length * 0.5))
	})
})

describe('planFamily with a minimum depth', () => {
	it('reaches five generations even when the headcount would rather go wide', () => {
		for (let i = 0; i < 20; i++) {
			// Twelve people is barely enough: without the reserve the first generation eats it all.
			expect(generations(planFamily(1, 12, { minGenerations: 5 }))).toBeGreaterThanOrEqual(5)
		}
	})

	it('spends a headcount on depth rather than on seventy siblings', () => {
		// A generation per eight people, without being asked. Left to the dice a big family came
		// out as one enormous sibling set, which is a far stranger thing to write than a line of
		// great-grandparents. The headcount still has to land exactly.
		for (const size of [12, 20, 30, 48, 80, 160, 400]) {
			for (let i = 0; i < 5; i++) {
				const plan = planFamily(1, size)
				expect(plan.characters.length, `size ${size}`).toBe(size)
				expect(generations(plan), `size ${size}`).toBeGreaterThanOrEqual(Math.ceil(size / 8))
				expectWellFormed(plan)
			}
		}
	})
})

describe('planFamily with a target depth', () => {
	it('spreads the headcount over exactly the generations asked for', () => {
		// Both directions: 40 people would go five deep left alone, and two or three is shallower
		// than the floor, which is the half of this that did not exist before.
		for (const [size, want] of [[40, 2], [40, 3], [40, 6], [12, 4], [80, 3], [200, 4]] as const) {
			for (let i = 0; i < 5; i++) {
				const plan = planFamily(1, size, { generations: want })
				expect(plan.characters.length, `${size} over ${want}`).toBe(size)
				expect(generations(plan), `${size} over ${want}`).toBe(want)
				expectWellFormed(plan)
			}
		}
	})

	it('cannot be asked for more generations than there are people to carry them', () => {
		// A generation costs a couple, so six people buy three rows however many you type.
		for (let i = 0; i < 10; i++) {
			const plan = planFamily(1, 6, { generations: 30 })
			expect(plan.characters.length).toBe(6)
			expect(generations(plan)).toBeLessThanOrEqual(3)
		}
	})

	it('reads one generation as two, since one is a couple rather than a family', () => {
		expect(generations(planFamily(1, 40, { generations: 1 }))).toBe(2)
	})

	it('leaves the default alone when no depth is asked for', () => {
		expect(generations(planFamily(1, 40, { generations: 0 }))).toBeGreaterThanOrEqual(5)
	})
})

describe('planPlausibleGroup', () => {
	it('is one web of five generations, with the kinds a real file has', () => {
		for (let i = 0; i < 5; i++) {
			const plan = planPlausibleGroup(1, 45)
			expectWellFormed(plan)
			expect(plan.characters.length).toBe(45)
			expect(generations(plan)).toBeGreaterThanOrEqual(5)
			const kinds = new Set(plan.relations.map(r => r.RelationshipType))
			expect(kinds.has('aunt-uncle')).toBe(true)
			expect(kinds.has('cousin')).toBe(true)
			// More than one family: the surnames are what tells them apart.
			expect(new Set(plan.characters.map(c => c.LastName)).size).toBeGreaterThan(2)
			// Everyone in one group, and nearly all of it reached without a friendship.
			const blood = plan.relations.filter(r => !SOCIAL.has(r.RelationshipType))
			expect(clusters(plan.characters.map(c => c.Id), blood)[0]!.length)
				.toBeGreaterThan(plan.characters.length * 0.8)
		}
	})

	it('cannot be asked for a group too small to hold five generations', () => {
		const plan = planPlausibleGroup(1, 2)
		expect(plan.characters.length).toBeGreaterThanOrEqual(14)
		// Even the smallest group gets the second line of descent, so it still has cousins in it.
		expect(plan.relations.some(r => r.RelationshipType === 'cousin')).toBe(true)
	})
})

describe('planEvents', () => {
	const places = ['l-inn', 'l-gate', 'l-market'].map((Id, i) => ({
		Id, MapId: 'm', ChildMapId: null, Name: `Place ${i}`, Description: null,
		X: 0.5, Y: 0.5, Color: null, Icon: null, FootprintW: null, MarkerStyle: null,
	}) as LocationItem)

	it('puts people somewhere they could have been, and says who was there', () => {
		const cast = planCast(1, 40).characters
		const byId = new Map(cast.map(c => [c.Id, c]))
		const plans = planEvents(1, cast, places, 200)
		expect(plans.length).toBeGreaterThan(150)

		for (const { item, cast: who } of plans) {
			const place = places.find(p => p.Id === item.LocationId)
			expect(place).toBeDefined()
			// The place is named in the writing as well as linked, so the place matcher has work too.
			expect(item.Title).toContain(place!.Name)
			expect(item.Description).toContain(place!.Name)
			// The scrubber reads the absolutes, and a period that ends before it starts hangs it.
			expect(item.AbsoluteStart).toBeGreaterThanOrEqual(item.Year)
			expect(item.AbsoluteStart).toBeLessThan(item.Year + 1)
			expect(item.AbsoluteEnd).toBeGreaterThanOrEqual(item.EndYear!)
			expect(item.AbsoluteEnd).toBeLessThan(item.EndYear! + 1)
			expect(item.AbsoluteEnd).toBeGreaterThanOrEqual(item.AbsoluteStart!)
			expect(item.EndYear).toBeGreaterThanOrEqual(item.Year)
			// clearTestCast finds them by this and nothing else.
			expect(item.ItemNotes).toBe(TEST_MARK)

			const present = who.filter(c => !c.MentionedOnly)
			expect(present.length).toBeGreaterThan(0)
			for (const c of present) {
				const person = byId.get(c.CharacterId)!
				expect(person).toBeDefined()
				expect(item.Year).toBeGreaterThanOrEqual(person.BirthYear! + 14)
				expect(item.Year).toBeLessThanOrEqual(person.DeathYear ?? person.BirthYear! + 80)
			}
			// Being talked about must not also count as being there, or the map walks them across it.
			const mentionedIds = new Set(who.filter(c => c.MentionedOnly).map(c => c.CharacterId))
			expect(present.some(c => mentionedIds.has(c.CharacterId))).toBe(false)
			expect(new Set(who.map(c => c.CharacterId)).size).toBe(who.length)
		}
	})

	it('dates events to a day inside the year rather than the first of it', () => {
		const days = planEvents(1, planCast(1, 40).characters, places, 200)
			.map(p => p.item.AbsoluteStart! - p.item.Year)
		expect(new Set(days).size).toBeGreaterThan(50)
		expect(Math.max(...days)).toBeGreaterThan(0.5)
	})

	it('spreads over every place and both kinds of item', () => {
		const plans = planEvents(1, planCast(1, 40).characters, places, 300)
		expect(new Set(plans.map(p => p.item.LocationId)).size).toBe(places.length)
		expect(new Set(plans.map(p => p.item.TypeId))).toEqual(new Set([1, 2]))
	})

	it('has nothing to say without places or without dated people', () => {
		expect(planEvents(1, planCast(1, 10).characters, [], 50)).toEqual([])
		expect(planEvents(1, [], places, 50)).toEqual([])
	})
})

const SOCIAL = new Set(['friend', 'best-friend', 'acquaintance', 'colleague', 'neighbor', 'ally', 'rival', 'enemy', 'mentor'])

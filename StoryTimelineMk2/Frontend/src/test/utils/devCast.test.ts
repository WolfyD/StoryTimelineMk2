import { describe, it, expect } from 'vitest'
import { clusters, planCast, planFamily, planKinship, planPlausibleGroup, randomPerson, TEST_MARK } from '@/utils/devCast'
import { blankRelation, pairKey } from '@/utils/characterRelations'
import type { CastPlan } from '@/utils/devCast'
import type { CharacterItem, CharacterRelationship } from '@/types/models'

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

	it('never dies before it is born', () => {
		for (let i = 0; i < 200; i++) {
			const c = randomPerson(1)
			if (c.DeathYear !== null) expect(c.DeathYear).toBeGreaterThan(c.BirthYear!)
		}
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

const SOCIAL = new Set(['friend', 'best-friend', 'acquaintance', 'colleague', 'neighbor', 'ally', 'rival', 'enemy', 'mentor'])

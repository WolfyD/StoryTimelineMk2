import { describe, it, expect } from 'vitest'
import {
	bowPoints,
	buildEdges,
	categoryColor,
	clampPan,
	describePath,
	edgeDash,
	edgeWidth,
	generationOf,
	hourglassLayout,
	jaggedPoints,
	lifeStateAt,
	oneHop,
	overlayEdges,
	relationActiveAt,
	seedPositions,
	shortestPath,
	stepForces,
	ALPHA_DECAY,
	ALPHA_MIN,
	unconnected,
	yearRange,
	TREE_ROW,
} from '@/utils/relationsGraph'
import { blankRelation } from '@/utils/characterRelations'
import { blankCharacter } from '@/utils/characterItems'
import type { CharacterItem, CharacterRelationship, RelationshipType } from '@/types/models'

const PARENT: RelationshipType = {
	Id: 'parent', Name: 'Parent / child', Type: 'family',
	AToB: 'parent of', BToA: 'child of',
	AToBF: 'mother of', AToBM: 'father of', BToAF: 'daughter of', BToAM: 'son of',
	OneWay: 0,
}
const SPOUSE: RelationshipType = {
	Id: 'spouse', Name: 'Spouse', Type: 'romantic',
	AToB: 'spouse of', BToA: 'spouse of',
	AToBF: 'wife of', AToBM: 'husband of', BToAF: 'wife of', BToAM: 'husband of',
	OneWay: 0,
}
const TYPES = new Map([[PARENT.Id, PARENT], [SPOUSE.Id, SPOUSE]])

let nextId = 1
function person(id: string, extra: Partial<CharacterItem> = {}): CharacterItem {
	return { ...blankCharacter(1), Id: id, Name: id, ...extra }
}
function tie(kind: string, a: string, b: string, extra: Partial<CharacterRelationship> = {}): CharacterRelationship {
	return { ...blankRelation(a, 1, kind), Id: nextId++, Character2Id: b, ...extra }
}

describe('relationActiveAt', () => {
	it('matches everything when no year is asked for', () => {
		// The normal case: most relations are implied by their kind and were never dated.
		expect(relationActiveAt(tie('parent', 'a', 'b'), null)).toBe(true)
	})

	it('honours an open end at either side', () => {
		const from = tie('spouse', 'a', 'b', { StartYear: 1200 })
		expect(relationActiveAt(from, 1199)).toBe(false)
		expect(relationActiveAt(from, 1200)).toBe(true)
		expect(relationActiveAt(from, 9999)).toBe(true)

		const until = tie('spouse', 'a', 'b', { EndYear: 1210 })
		expect(relationActiveAt(until, 1210)).toBe(true)
		expect(relationActiveAt(until, 1211)).toBe(false)
	})
})

describe('lifeStateAt', () => {
	it('reads undated ends as already-there and still-here', () => {
		const c = person('a', { BirthYear: 1180, DeathYear: 1240 })
		expect(lifeStateAt(c, 1179)).toBe('unborn')
		expect(lifeStateAt(c, 1180)).toBe('alive')
		expect(lifeStateAt(c, 1241)).toBe('dead')
		expect(lifeStateAt(person('b'), 500)).toBe('alive')
	})
})

describe('yearRange', () => {
	it('spans births, deaths and dated relations, and is null when nothing is dated', () => {
		const chars = [person('a', { BirthYear: 1180 }), person('b', { DeathYear: 1240 })]
		const rels = [tie('spouse', 'a', 'b', { StartYear: 1300 })]
		expect(yearRange(chars, rels)).toEqual({ min: 1180, max: 1300 })
		expect(yearRange([person('a')], [])).toBeNull()
	})

	it('widens a single-year span so the scrubber has somewhere to go', () => {
		expect(yearRange([person('a', { BirthYear: 900 })], [])).toEqual({ min: 900, max: 901 })
	})
})

describe('buildEdges', () => {
	it('drops relations whose other end is not on screen', () => {
		const rels = [tie('parent', 'a', 'b'), tie('parent', 'a', 'ghost')]
		const edges = buildEdges(rels, TYPES, new Set(['a', 'b']))
		expect(edges).toHaveLength(1)
		expect(edges[0]!.category).toBe('family')
	})

	it('files an unknown kind under "other"', () => {
		const edges = buildEdges([tie('rival', 'a', 'b')], TYPES, new Set(['a', 'b']))
		expect(edges[0]!.category).toBe('other')
	})
})

describe('categoryColor', () => {
	it('is stable for an invented category', () => {
		expect(categoryColor('nemesis')).toBe(categoryColor('nemesis'))
		expect(categoryColor('nemesis')).not.toBe(categoryColor('family'))
	})
})

describe('shortestPath / describePath', () => {
	const chars = [
		person('Risha', { Gender: 'female' }),
		person('Adan', { Gender: 'female' }),
		person('Toma', { Gender: 'male' }),
		person('Ilse'),
	]
	const rels = [tie('parent', 'Risha', 'Adan'), tie('spouse', 'Adan', 'Toma')]
	const edges = buildEdges(rels, TYPES, new Set(chars.map(c => c.Id)))

	it('finds the fewest hops', () => {
		const found = shortestPath(edges, 'Risha', 'Toma')
		expect(found?.nodes).toEqual(['Risha', 'Adan', 'Toma'])
	})

	it('returns null when nothing connects them', () => {
		expect(shortestPath(edges, 'Risha', 'Ilse')).toBeNull()
	})

	it('words each step from its own subject', () => {
		const found = shortestPath(edges, 'Risha', 'Toma')!
		const text = describePath(
			found,
			new Map(rels.map(r => [r.Id, r])),
			new Map(chars.map(c => [c.Id, c])),
			TYPES,
		)
		// Risha's gender picks "mother", Adan's picks "wife" — not one gender for the whole chain.
		expect(text).toBe('Risha is the mother of Adan, who is the wife of Toma.')
	})
})

describe('oneHop', () => {
	it('is the node plus its neighbours', () => {
		const edges = buildEdges(
			[tie('parent', 'a', 'b'), tie('parent', 'b', 'c')],
			TYPES,
			new Set(['a', 'b', 'c']),
		)
		expect([...oneHop(edges, 'b')].sort()).toEqual(['a', 'b', 'c'])
		expect([...oneHop(edges, 'a')].sort()).toEqual(['a', 'b'])
	})
})

describe('stepForces', () => {
	it('settles, and leaves a pinned node exactly where it was put', () => {
		const nodes = seedPositions(['a', 'b', 'c', 'd'], 800, 600)
		nodes[0]!.pinned = true
		const pinnedAt = { x: nodes[0]!.x, y: nodes[0]!.y }
		const edges = buildEdges(
			[tie('parent', 'a', 'b'), tie('parent', 'b', 'c')],
			TYPES,
			new Set(['a', 'b', 'c', 'd']),
		)

		let moved = Infinity
		let ticks = 0
		while (moved > 0.8 && ticks < 2000) {
			moved = stepForces(nodes, edges, { width: 800, height: 600 })
			ticks++
		}
		expect(ticks).toBeLessThan(2000)
		expect(nodes[0]!.x).toBe(pinnedAt.x)
		expect(nodes[0]!.y).toBe(pinnedAt.y)
		// Nothing flew off to infinity or collapsed onto a single point.
		for (const n of nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
		expect(Math.hypot(nodes[1]!.x - nodes[2]!.x, nodes[1]!.y - nodes[2]!.y)).toBeGreaterThan(10)
	})

	it('stops on a crowded stage instead of thrashing for ever', () => {
		// A hundred people in a web, which is the case that used to diverge: repulsion goes as
		// 1/d², so one pair landing on top of each other flung itself across the stage, hit a
		// third node, and the whole graph was still moving further every frame a minute later.
		const ids = Array.from({ length: 100 }, (_, i) => `n${i}`)
		const rels = [
			...ids.map((id, i) => tie('parent', id, ids[(i + 1) % ids.length]!)),
			...ids.map((id, i) => tie('spouse', id, ids[(i + 33) % ids.length]!)),
		]
		const nodes = seedPositions(ids, 1200, 800)
		const edges = buildEdges(rels, TYPES, new Set(ids))

		let alpha = 1
		let ticks = 0
		let moved = Infinity
		// The loop the window runs: settle, or cool off, whichever comes first.
		while (alpha > ALPHA_MIN && moved > nodes.length * 0.05) {
			moved = stepForces(nodes, edges, { width: 1200, height: 800, alpha })
			alpha *= ALPHA_DECAY
			ticks++
		}
		expect(ticks).toBeLessThan(400)
		// Still on the stage, not thrown to the far side of the universe.
		for (const n of nodes) expect(Math.hypot(n.x - 600, n.y - 400)).toBeLessThan(2000)
	})
})

describe('stepForces cross-knot slack', () => {
	// Everything but the springs turned off, so the only thing between the two runs is the tie.
	const bare = { width: 800, height: 600, repulsion: 0, gravity: 0, clusterGravity: 0, clusterRepulsion: 0 }
	const pair = () => [
		{ id: 'a', x: 0, y: 0, vx: 0, vy: 0, pinned: false },
		{ id: 'b', x: 900, y: 0, vx: 0, vy: 0, pinned: false },
	]
	const edge = [{ id: 1, aId: 'a', bId: 'b', kind: 'friend', category: 'social', strength: 50, modifier: null }]
	const apart = new Map([['a', 0], ['b', 1]])
	const together = new Map([['a', 0], ['b', 0]])
	const pullOn = (clusterOf: Map<string, number>, clusterRoom: number) => {
		const nodes = pair()
		stepForces(nodes, edge, { ...bare, clusterOf, clusterRoom })
		return nodes[0]!.vx
	}

	it('lets a tie between two knots out as the knots are pushed apart', () => {
		const tight = pullOn(apart, 46)
		const loose = pullOn(apart, 200)
		// Still pulling them together, just not hard enough to drag anyone out of their own knot.
		expect(tight).toBeGreaterThan(0)
		expect(loose).toBeGreaterThan(0)
		expect(loose).toBeLessThan(tight / 2)
	})

	it('leaves a tie inside a knot exactly as it was', () => {
		expect(pullOn(together, 200)).toBe(pullOn(together, 46))
	})

	it('changes nothing at or below the middle of the dial', () => {
		expect(pullOn(apart, 46)).toBe(pullOn(together, 46))
		expect(pullOn(apart, 14)).toBe(pullOn(together, 46))
	})
})

describe('hourglassLayout', () => {
	// A three-generation family with two parents on the middle row, which is the case that needs
	// the union node: without one, both parents' lines to the same child would cross.
	const chars = ['gran', 'mum', 'dad', 'kid', 'sib', 'stranger'].map(id => person(id))
	const rels = [
		tie('parent', 'gran', 'mum'),
		tie('parent', 'mum', 'kid'),
		tie('parent', 'dad', 'kid'),
		tie('parent', 'mum', 'sib'),
		tie('parent', 'dad', 'sib'),
		tie('spouse', 'mum', 'dad'),
	]

	it('puts ancestors above and descendants below the chosen character', () => {
		const tree = hourglassLayout(chars, rels, 'mum')
		const gen = new Map(tree.nodes.map(n => [n.id, n.gen]))
		expect(gen.get('mum')).toBe(0)
		expect(gen.get('dad')).toBe(0)
		expect(gen.get('gran')).toBe(-1)
		expect(gen.get('kid')).toBe(1)
		// Nobody unrelated wanders in.
		expect(gen.has('stranger')).toBe(false)
		const kid = tree.nodes.find(n => n.id === 'kid')!
		const gran = tree.nodes.find(n => n.id === 'gran')!
		expect(kid.y).toBeGreaterThan(gran.y)
	})

	it('gives the couple one union carrying both children', () => {
		const tree = hourglassLayout(chars, rels, 'mum')
		const union = tree.unions.find(u => u.parentIds.length === 2)!
		expect(union.parentIds).toEqual(['dad', 'mum'])
		expect([...union.childIds].sort()).toEqual(['kid', 'sib'])
		// It hangs below its parents' row, so the elbows have somewhere to go.
		const mum = tree.nodes.find(n => n.id === 'mum')!
		expect(union.y).toBeGreaterThan(mum.y)
		expect(union.y).toBeLessThan(mum.y + TREE_ROW)
	})

	it('ignores kinds that are not descent — a grandparent tie says nothing about the row between', () => {
		const tree = hourglassLayout(
			[person('a'), person('b')],
			[tie('grandparent', 'a', 'b')],
			'a',
		)
		expect(tree.nodes.map(n => n.id)).toEqual(['a'])
	})

	it('is empty for a character who is not in the cast', () => {
		expect(hourglassLayout(chars, rels, 'nobody').nodes).toEqual([])
	})
})

describe('generationOf', () => {
	const ids = ['gran', 'mum', 'dad', 'kid', 'sib', 'stranger']
	const rels = [
		tie('parent', 'gran', 'mum'),
		tie('parent', 'mum', 'kid'),
		tie('parent', 'dad', 'kid'),
		tie('parent', 'mum', 'sib'),
		tie('parent', 'dad', 'sib'),
		tie('spouse', 'mum', 'dad'),
	]

	it('counts down from whoever has no parents in the cast', () => {
		const gen = generationOf(rels, ids)
		expect(gen.get('gran')).toBe(0)
		expect(gen.get('mum')).toBe(1)
		expect(gen.get('kid')).toBe(2)
		expect(gen.get('sib')).toBe(2)
		// Nobody is dropped: an unrelated character has no parents, so they start at the top.
		expect(gen.get('stranger')).toBe(0)
	})

	it('puts a couple on one row, taking the later of the two', () => {
		// `dad` married in and has no parents on screen — without the levelling he would sit a row
		// above his wife.
		expect(generationOf(rels, ids).get('dad')).toBe(1)
	})

	it('takes the longest route down, not the shortest', () => {
		// A grandparent tie and a parent tie both reach the child; the parent decides the row.
		const gen = generationOf(
			[tie('parent', 'a', 'b'), tie('parent', 'b', 'c'), tie('parent', 'a', 'c')],
			['a', 'b', 'c'],
		)
		expect(gen.get('c')).toBe(2)
	})

	it('ignores kinds that are not descent', () => {
		expect(generationOf([tie('friend', 'a', 'b')], ['a', 'b']).get('b')).toBe(0)
	})

	it('comes back from a cast who are their own ancestors instead of spinning', () => {
		const loop = ['a', 'b', 'c']
		const gen = generationOf(
			[tie('parent', 'a', 'b'), tie('parent', 'b', 'c'), tie('parent', 'c', 'a')],
			loop,
		)
		// Flattened, whatever the numbers are: the point is that it returns at all.
		for (const id of loop) expect(gen.get(id)).toBeLessThanOrEqual(loop.length - 1)
	})

	it('is empty for an empty cast', () => {
		expect(generationOf(rels, []).size).toBe(0)
	})
})

describe('unconnected', () => {
	it('is everyone the web has nothing to say about', () => {
		const chars = [person('a'), person('b'), person('loner')]
		expect(unconnected(chars, [tie('parent', 'a', 'b')]).map(c => c.Id)).toEqual(['loner'])
	})
})

// BL-75: closeness and the state word are what the line looks like.
describe('edgeWidth / edgeDash', () => {
	it('is thicker the closer they are, and never invisible', () => {
		expect(edgeWidth(0)).toBeGreaterThan(0.5)
		expect(edgeWidth(100)).toBeGreaterThan(edgeWidth(50))
		expect(edgeWidth(50)).toBeGreaterThan(edgeWidth(0))
	})

	it('clamps a strength outside the range rather than drawing a hairline or a slab', () => {
		expect(edgeWidth(-40)).toBe(edgeWidth(0))
		expect(edgeWidth(400)).toBe(edgeWidth(100))
	})

	it('dashes the ties that are not quite there, and leaves the rest solid', () => {
		expect(edgeDash('secret')).not.toEqual([])
		expect(edgeDash('Estranged')).not.toEqual([])
		expect(edgeDash('secret')).not.toEqual(edgeDash('estranged'))
		expect(edgeDash('adoptive')).toEqual([])
		expect(edgeDash(null)).toEqual([])
	})
})

describe('buildEdges meaning', () => {
	it('carries strength and modifier through to the drawing', () => {
		const r = { ...tie('parent', 'a', 'b'), RelationshipStrength: 90, RelationshipModifier: 'secret' }
		const [edge] = buildEdges([r], new Map([['parent', PARENT]]), new Set(['a', 'b']))
		expect(edge!.strength).toBe(90)
		expect(edge!.modifier).toBe('secret')
	})
})

describe('stepForces with strength', () => {
	// One tick, because two nodes on a spring oscillate: what the strength changes is the pull,
	// and over many ticks the strong pair is just as likely to be caught mid-overshoot.
	const pullOf = (strength: number) => {
		const nodes = [
			{ id: 'a', x: 100, y: 300, vx: 0, vy: 0, pinned: false },
			{ id: 'b', x: 700, y: 300, vx: 0, vy: 0, pinned: false },
		]
		const edges = buildEdges(
			[{ ...tie('parent', 'a', 'b'), RelationshipStrength: strength }],
			new Map([['parent', PARENT]]),
			new Set(['a', 'b']),
		)
		stepForces(nodes, edges, { width: 800, height: 600 })
		return nodes[0]!.vx
	}

	it('drags a close pair together harder than a distant one', () => {
		expect(pullOf(100)).toBeGreaterThan(pullOf(50))
		expect(pullOf(50)).toBeGreaterThan(pullOf(0))
	})

	it('still pulls at all when they are as distant as the slider goes', () => {
		expect(pullOf(0)).toBeGreaterThan(0)
	})
})

describe('clampPan', () => {
	// 3000 wide of content at half scale is 1500 on a 1000 stage: 500 of it has to be off screen.
	const wide = (pos: number) => clampPan(pos, 0, 3000, 1000, 0.5, 20)

	it('leaves a position alone while the content still covers the stage', () => {
		expect(wide(-400)).toBe(-400)
	})

	it('pulls back rather than showing blank stage past either edge', () => {
		expect(wide(500)).toBe(20)
		expect(wide(-5000)).toBe(1000 - 1500 - 20)
	})

	it('centres content that is smaller than the stage instead of pinning it to an edge', () => {
		// 400 wide at half scale is 200 on a 1000 stage — there is no covering to do.
		expect(clampPan(-9999, 0, 400, 1000, 0.5, 20)).toBe(400)
	})

	it('works on content that does not start at zero', () => {
		// The tree's coordinates are centred on the root, so they run negative.
		expect(clampPan(0, -600, -200, 1000, 0.5, 20)).toBe(700)
	})
})

describe('overlayEdges', () => {
	const present = new Set(['a', 'b', 'c'])

	it('leaves out the ties the chart already draws', () => {
		// Descent and marriage are the chart; drawing them a second time as curves would double
		// every line on it.
		const edges = buildEdges(
			[tie('parent', 'a', 'b'), tie('spouse', 'a', 'c'), tie('step-parent', 'a', 'c')],
			TYPES, present)
		expect(overlayEdges(edges, present)).toEqual([])
	})

	it('keeps everything else between two people on the chart', () => {
		const edges = buildEdges([tie('rival', 'a', 'b'), tie('mentor', 'b', 'c')], TYPES, present)
		expect(overlayEdges(edges, present).map(e => e.kind)).toEqual(['rival', 'mentor'])
	})

	it('drops a tie to someone who is not on the chart', () => {
		// The hourglass only reaches so far; an edge to a stranger has no second end to draw to.
		const edges = buildEdges([tie('rival', 'a', 'z')], TYPES, new Set(['a', 'b', 'c', 'z']))
		expect(overlayEdges(edges, present)).toEqual([])
	})
})

describe('bowPoints / jaggedPoints', () => {
	const a = { x: 0, y: 0 }
	const b = { x: 200, y: 0 }

	it('starts and ends clear of the discs it joins', () => {
		const [x0, y0, , , x2, y2] = bowPoints(a, b, 30)
		expect(x0).toBeCloseTo(30)
		expect(y0).toBeCloseTo(0)
		expect(x2).toBeCloseTo(170)
		expect(y2).toBeCloseTo(0)
	})

	it('bows the middle off the straight line, or the curve would be a line', () => {
		const [, , mx, my] = bowPoints(a, b, 0, 22)
		expect(mx).toBeCloseTo(100)
		expect(Math.abs(my!)).toBeCloseTo(22)
	})

	it('does not turn itself inside out when the two ends overlap', () => {
		// Two people at the same spot, which the layout can produce before it has spread a row.
		expect(bowPoints(a, { x: 0, y: 0 }, 30).every(Number.isFinite)).toBe(true)
		expect(jaggedPoints(a, { x: 0, y: 0 }, 30).every(Number.isFinite)).toBe(true)
	})

	it('keeps the sawtooth teeth off both ends', () => {
		const pts = jaggedPoints(a, b, 0, 8, 5)
		expect(pts[1]).toBeCloseTo(0)
		expect(pts[pts.length - 1]).toBeCloseTo(0)
		// And swings to both sides in between, or it is a bulge rather than a jagged line.
		const ys = pts.filter((_, i) => i % 2 === 1)
		expect(Math.max(...ys)).toBeCloseTo(5)
		expect(Math.min(...ys)).toBeCloseTo(-5)
	})
})

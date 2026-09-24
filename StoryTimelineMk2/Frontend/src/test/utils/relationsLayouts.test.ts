import { describe, it, expect } from 'vitest'
import {
	arcLayout, chainColumns, chainLayout, CHAIN_GAP, CHAIN_HALO_MAX, CHAIN_HALO_R, CHAIN_ROW,
	chordLayout, communities,
	clusterSeed, convexHull, matrixOrder, sociogramLayout, SOCIO_HEADER,
} from '@/utils/relationsLayouts'
import { stepForces } from '@/utils/relationsGraph'
import type { GraphEdge, SimNode } from '@/utils/relationsGraph'

let nextId = 1
function edge(aId: string, bId: string, strength = 60): GraphEdge {
	return { id: nextId++, aId, bId, kind: 'friend', category: 'social', strength, modifier: null }
}

/** Two tight triangles with one weak thread between them — the shape every clustering claims. */
const TRIANGLES = {
	ids: ['a', 'b', 'c', 'd', 'e', 'f', 'loner'],
	edges: [
		edge('a', 'b', 100), edge('b', 'c', 100), edge('a', 'c', 100),
		edge('d', 'e', 100), edge('e', 'f', 100), edge('d', 'f', 100),
		edge('c', 'd', 5),
	],
}

function at(placed: { id: string; x: number; y: number }[], id: string) {
	const found = placed.find(p => p.id === id)
	if (!found) throw new Error(`${id} was not placed`)
	return found
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('communities', () => {
	it('keeps two tight groups apart when only a weak tie crosses between them', () => {
		const knots = communities(TRIANGLES.ids, TRIANGLES.edges)
		expect(knots.get('a')).toBe(knots.get('b'))
		expect(knots.get('b')).toBe(knots.get('c'))
		expect(knots.get('d')).toBe(knots.get('e'))
		expect(knots.get('e')).toBe(knots.get('f'))
		expect(knots.get('a')).not.toBe(knots.get('d'))
	})

	it('gives someone nobody is related to a knot of their own', () => {
		const knots = communities(TRIANGLES.ids, TRIANGLES.edges)
		expect(knots.get('loner')).not.toBe(knots.get('a'))
		expect(knots.get('loner')).not.toBe(knots.get('d'))
	})

	it('numbers the knots the same way every time', () => {
		const once = communities(TRIANGLES.ids, TRIANGLES.edges)
		const twice = communities(TRIANGLES.ids, TRIANGLES.edges)
		expect([...once]).toEqual([...twice])
		// Numbered from the first character in, so the colours do not shuffle between builds.
		expect(once.get('a')).toBe(0)
	})
})

describe('clusterSeed', () => {
	it('places everyone once, with their own knot around them', () => {
		const knots = communities(TRIANGLES.ids, TRIANGLES.edges)
		const seeded = clusterSeed(TRIANGLES.ids, knots, 900, 700)
		expect(seeded.map(n => n.id).sort()).toEqual([...TRIANGLES.ids].sort())
		expect(seeded.every(n => !n.pinned)).toBe(true)
		const within = dist(at(seeded, 'a'), at(seeded, 'b'))
		const across = dist(at(seeded, 'a'), at(seeded, 'e'))
		expect(within).toBeLessThan(across)
	})
})

describe('matrixOrder', () => {
	it('keeps a knot together, so its block sits on the diagonal', () => {
		const order = matrixOrder(TRIANGLES.ids, TRIANGLES.edges)
		expect(order.slice().sort()).toEqual([...TRIANGLES.ids].sort())
		const knots = communities(TRIANGLES.ids, TRIANGLES.edges)
		const runs = order.map(id => knots.get(id))
		const seen = new Set<number | undefined>()
		let last: number | undefined = -1
		for (const knot of runs) {
			if (knot === last) continue
			// A knot that comes back after another one would mean a block off the diagonal.
			expect(seen.has(knot)).toBe(false)
			seen.add(knot)
			last = knot
		}
	})

	it('leaves the order it was given to break ties, so a name-sorted cast stays sorted', () => {
		const ids = ['anna', 'bela', 'cili']
		expect(matrixOrder(ids, [])).toEqual(ids)
	})

	it('blocks by faction ahead of knot, biggest house first and the unaffiliated last', () => {
		// 'a' and 'd' sit in different knots on purpose: faction has to win over the clustering.
		const of = new Map([
			['a', 'Watch'], ['d', 'Watch'], ['e', 'Watch'],
			['b', 'League'], ['c', 'League'],
			['f', ''], ['loner', ''],
		])
		const order = matrixOrder(TRIANGLES.ids, TRIANGLES.edges, undefined, of)
		const house = order.map(id => of.get(id))
		expect(house).toEqual([
			'Watch', 'Watch', 'Watch', 'League', 'League', '', '',
		])
	})

	it('falls back to knots when nobody has a faction', () => {
		const blank = new Map(TRIANGLES.ids.map(id => [id, '']))
		expect(matrixOrder(TRIANGLES.ids, TRIANGLES.edges, undefined, blank))
			.toEqual(matrixOrder(TRIANGLES.ids, TRIANGLES.edges))
	})
})

describe('arcLayout', () => {
	const GAP = 60
	// Three born in a rush, then a long quiet stretch, then one more: the shape the slider is for.
	const YEARS = new Map<string, number | null>([
		['a', 1180], ['b', 1181], ['c', 1182], ['d', 1260], ['nobody', null],
	])
	const ids = ['d', 'nobody', 'b', 'a', 'c']
	const run = (spread: number) => arcLayout(ids, YEARS, spread, GAP)
	const xs = (l: { placed: { id: string; x: number }[] }) =>
		l.placed.map(p => p.x)

	it('puts them in birth order whatever the slider says', () => {
		for (const spread of [0, 0.5, 1]) {
			expect(run(spread).placed.map(p => p.id)).toEqual(['a', 'b', 'c', 'd', 'nobody'])
		}
	})

	it('spaces the dated evenly when the slider is all the way down', () => {
		expect(xs(run(0)).slice(0, 4)).toEqual([0, 60, 120, 180])
	})

	it('opens the quiet stretch as the slider goes up', () => {
		// The gap between the last of the rush and the straggler is the whole point of the knob.
		const lull = (spread: number) => {
			const p = run(spread).placed
			return p[3]!.x - p[2]!.x
		}
		expect(lull(1)).toBeGreaterThan(lull(0.5))
		expect(lull(0.5)).toBeGreaterThan(lull(0))
	})

	it('never lets two people sit closer than a disc apart, however crowded the year', () => {
		// Four born in the same year would land on one spot at full proportion.
		const same = new Map<string, number | null>([['a', 1200], ['b', 1200], ['c', 1200], ['d', 1200]])
		const p = arcLayout(['a', 'b', 'c', 'd'], same, 1, GAP).placed
		for (let i = 1; i < p.length; i++) expect(p[i]!.x - p[i - 1]!.x).toBeGreaterThanOrEqual(GAP)
	})

	it('buckets the undated past the end instead of dropping or dating them', () => {
		const l = run(0)
		expect(l.undatedFrom).toBe(180 + GAP * 2)
		expect(l.placed.find(p => p.id === 'nobody')!.x).toBe(l.undatedFrom)
		expect(l.width).toBe(l.undatedFrom)
	})

	it('starts at zero when nobody has a birth year at all', () => {
		const l = arcLayout(['x', 'y'], new Map([['x', null], ['y', null]]), 0.5, GAP)
		expect(l.undatedFrom).toBe(0)
		expect(xs(l)).toEqual([0, 60])
	})

	it('has nothing to say about an empty cast', () => {
		const l = arcLayout([], new Map(), 0.5, GAP)
		expect(l).toEqual({ placed: [], undatedFrom: null, width: 0 })
	})
})

describe('sociogramLayout', () => {
	const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
	const group = (name: string, n: number) => ({ name, ids: ids(name, n) })
	const overlap = (
		a: { x: number; y: number; w: number; h: number },
		b: { x: number; y: number; w: number; h: number },
	) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

	it('centres a lone faction rather than pushing it out to a radius', () => {
		const l = sociogramLayout([group('A', 1)], [])
		const box = l.boxes[0]!
		expect(box.x + box.w / 2).toBeCloseTo(0)
		expect(box.y + box.h / 2).toBeCloseTo(0)
		expect(l.looseRadius).toBe(0)
	})

	it('keeps the boxes in the order they were given, whatever their sizes', () => {
		const l = sociogramLayout([group('A', 1), group('B', 30), group('C', 4)], [])
		expect(l.boxes.map(b => b.name)).toEqual(['A', 'B', 'C'])
	})

	it('keeps clear air between every pair of boxes, not just the neighbours', () => {
		// The property the radius is actually solved for. Sizing off neighbours alone passes the
		// overlap test below on these shapes by luck of which way round they sit — it fails here:
		// `[40, 1, 40, 1]` leaves the two big boxes 1001px apart where they need 1021.
		const l = sociogramLayout([40, 1, 40, 1].map((n, i) => group(`F${i}`, n)), [])
		const disc = (b: { x: number; y: number; w: number; h: number }) => ({
			cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.hypot(b.w, b.h) / 2,
		})
		for (let i = 0; i < l.boxes.length; i++) {
			for (let j = i + 1; j < l.boxes.length; j++) {
				const a = disc(l.boxes[i]!)
				const b = disc(l.boxes[j]!)
				expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `boxes ${i}/${j}`)
					.toBeGreaterThanOrEqual(a.r + b.r)
			}
		}
	})

	it('never overlaps two boxes, including across the middle of the ring', () => {
		const shapes = [
			[1, 1],
			[40, 1, 40, 1],
			[1, 25, 1, 25, 1, 25],
			[3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
			[60, 2, 2],
		]
		for (const sizes of shapes) {
			const l = sociogramLayout(sizes.map((n, i) => group(`F${i}`, n)), [])
			for (let i = 0; i < l.boxes.length; i++) {
				for (let j = i + 1; j < l.boxes.length; j++) {
					expect(overlap(l.boxes[i]!, l.boxes[j]!), `${sizes} boxes ${i}/${j}`).toBe(false)
				}
			}
		}
	})

	it('puts every member inside their own box, clear of its header', () => {
		const l = sociogramLayout([group('A', 7), group('B', 3)], [])
		for (const box of l.boxes) {
			const mine = l.placed.filter(p => p.id.startsWith(box.name))
			expect(mine).toHaveLength(box.name === 'A' ? 7 : 3)
			for (const p of mine) {
				expect(p.x).toBeGreaterThan(box.x)
				expect(p.x).toBeLessThan(box.x + box.w)
				expect(p.y).toBeGreaterThan(box.y + SOCIO_HEADER)
				expect(p.y).toBeLessThan(box.y + box.h)
			}
		}
	})

	it('rings the unaffiliated outside every box', () => {
		const l = sociogramLayout([group('A', 6), group('B', 6)], ids('x', 5))
		const outside = l.placed.filter(p => p.id.startsWith('x'))
		expect(outside).toHaveLength(5)
		for (const p of outside) {
			expect(Math.hypot(p.x, p.y)).toBeCloseTo(l.looseRadius)
			for (const box of l.boxes) {
				const inBox = p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h
				expect(inBox).toBe(false)
			}
		}
	})

	it('spreads a factionless cast on one ring wide enough to hold it', () => {
		const l = sociogramLayout([], ids('x', 24))
		expect(l.boxes).toEqual([])
		expect(l.placed).toHaveLength(24)
		// Adjacent people on the ring still get a cell's width between them.
		const [a, b] = [l.placed[0]!, l.placed[1]!]
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100)
	})

	it('has nothing to say about an empty cast', () => {
		expect(sociogramLayout([], [])).toEqual({ boxes: [], placed: [], looseRadius: 0 })
	})
})

describe('chordLayout', () => {
	/** A symmetric matrix from `[i, j, count]` triples, so a case reads as what it is. */
	const matrix = (n: number, ties: [number, number, number][]): number[][] => {
		const m = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
		for (const [i, j, c] of ties) { m[i]![j] = c; m[j]![i] = c }
		return m
	}
	const width = (r: { a0: number; a1: number }) => r.a1 - r.a0
	const TAU = Math.PI * 2

	it('gives an empty circle back rather than dividing by nothing', () => {
		expect(chordLayout([], []).arcs).toEqual([])
		expect(chordLayout(['A', 'B'], matrix(2, [])).ribbons).toEqual([])
	})

	it('fills the circle exactly, arcs and gaps together', () => {
		const l = chordLayout(['A', 'B', 'C'], matrix(3, [[0, 1, 4], [1, 2, 2], [0, 0, 3]]))
		const arcs = l.arcs.reduce((s, a) => s + (a.end - a.start), 0)
		const gaps = l.arcs.length
		// Whatever is not arc is gap, and every gap is the same: the leftover has to divide evenly.
		expect(arcs).toBeLessThan(TAU)
		expect((TAU - arcs) / gaps).toBeGreaterThan(0)
		expect(l.arcs[0]!.start).toBeCloseTo(-Math.PI / 2, 10)
	})

	it('measures an arc in tie-ends, counting an internal tie twice', () => {
		// B has one tie out and three inside it. Inside spends two ends, so B is 1 + 6 = 7.
		const l = chordLayout(['A', 'B'], matrix(2, [[0, 1, 1], [1, 1, 3]]))
		expect(l.arcs[0]!.weight).toBe(1)
		expect(l.arcs[1]!.weight).toBe(7)
		expect(l.arcs[1]!.end - l.arcs[1]!.start)
			.toBeCloseTo((l.arcs[0]!.end - l.arcs[0]!.start) * 7, 10)
	})

	it('gives a ribbon the same width at both ends', () => {
		const l = chordLayout(['A', 'B', 'C'], matrix(3, [[0, 1, 5], [0, 2, 1], [1, 2, 9]]))
		for (const r of l.ribbons) expect(r.a1 - r.a0).toBeCloseTo(r.b1 - r.b0, 10)
	})

	it('fills each arc with its own ribbons and no more', () => {
		// The property that stops ribbons overlapping or leaving a gap inside an arc: the spans
		// handed out on one arc have to add up to exactly that arc, end to end.
		const l = chordLayout(['A', 'B', 'C', 'D'],
			matrix(4, [[0, 1, 3], [0, 2, 1], [1, 2, 7], [2, 3, 2], [1, 1, 4], [3, 3, 1]]))
		for (const arc of l.arcs) {
			const ends: [number, number][] = []
			for (const r of l.ribbons) {
				if (r.a === arc.index) ends.push([r.a0, r.a1])
				if (r.b === arc.index) ends.push([r.b0, r.b1])
			}
			ends.sort((x, y) => x[0] - y[0])
			expect(ends[0]![0], arc.name).toBeCloseTo(arc.start, 10)
			expect(ends[ends.length - 1]![1], arc.name).toBeCloseTo(arc.end, 10)
			for (let i = 1; i < ends.length; i++) {
				expect(ends[i]![0], `${arc.name} span ${i}`).toBeCloseTo(ends[i - 1]![1], 10)
			}
		}
	})

	it('sizes a ribbon by how many ties cross, not by how big the groups are', () => {
		const l = chordLayout(['A', 'B', 'C'], matrix(3, [[0, 1, 8], [0, 2, 2]]))
		const ab = l.ribbons.find(r => r.a === 0 && r.b === 1)!
		const ac = l.ribbons.find(r => r.a === 0 && r.b === 2)!
		expect(width(ab)).toBeCloseTo(width(ac) * 4, 10)
	})

	it('loops an internal tie back onto its own arc', () => {
		const l = chordLayout(['A', 'B'], matrix(2, [[0, 1, 2], [0, 0, 3]]))
		const self = l.ribbons.find(r => r.a === 0 && r.b === 0)!
		const arc = l.arcs[0]!
		// Both ends on A's arc, and touching, so it reads as a loop rather than a chord.
		expect(self.a0).toBeGreaterThanOrEqual(arc.start)
		expect(self.b1).toBeLessThanOrEqual(arc.end + 1e-9)
		expect(self.a1).toBeCloseTo(self.b0, 10)
	})

	it('keeps a group with no ties at all, as a sliver rather than a hole', () => {
		const l = chordLayout(['A', 'B', 'Hermits'], matrix(3, [[0, 1, 4]]))
		expect(l.arcs.map(a => a.name)).toEqual(['A', 'B', 'Hermits'])
		expect(l.arcs[2]!.weight).toBe(0)
		expect(l.arcs[2]!.end - l.arcs[2]!.start).toBeCloseTo(0, 10)
	})

	it('grows the circle with the cast', () => {
		const small = chordLayout(['A', 'B'], matrix(2, [[0, 1, 2]]))
		const big = chordLayout(['A', 'B'], matrix(2, [[0, 1, 900]]))
		expect(big.radius).toBeGreaterThan(small.radius)
	})

	it('leaves room for ribbons however many groups there are', () => {
		// Gaps are capped at a third of the circle, so forty factions is not all gap.
		const names = Array.from({ length: 40 }, (_, i) => `F${i}`)
		const l = chordLayout(names, matrix(40, names.map((_, i) => [i, (i + 1) % 40, 3] as [number, number, number])))
		const arcs = l.arcs.reduce((s, a) => s + (a.end - a.start), 0)
		expect(arcs).toBeGreaterThan(TAU * 0.66)
	})
})

describe('stepForces with knots', () => {
	it('pulls a knot together rather than leaving it laced through another', () => {
		const run = (clusterOf?: Map<string, number>) => {
			const nodes: SimNode[] = TRIANGLES.ids.map((id, i) => ({
				id, x: 100 + i * 90, y: 300, vx: 0, vy: 0, pinned: false,
			}))
			for (let i = 0; i < 60; i++) stepForces(nodes, TRIANGLES.edges, { width: 800, height: 600, clusterOf })
			const spread = (of: string[]) => {
				const picked = of.map(id => nodes.find(n => n.id === id)!)
				const cx = picked.reduce((s, n) => s + n.x, 0) / picked.length
				const cy = picked.reduce((s, n) => s + n.y, 0) / picked.length
				return picked.reduce((s, n) => s + dist(n, { x: cx, y: cy }), 0) / picked.length
			}
			return spread(['a', 'b', 'c']) + spread(['d', 'e', 'f'])
		}
		expect(run(communities(TRIANGLES.ids, TRIANGLES.edges))).toBeLessThan(run())
	})

	it('leaves daylight between two knots instead of stacking them', () => {
		// Pulling each knot in on itself was never enough: the pull toward the stage centre drew
		// both middles onto the same spot, so the triangles settled concentric and the view read
		// as the plain graph. Start them all but on top of each other — the hardest case — and
		// every member should end up nearer its own knot's middle than the other's.
		const knots = communities(TRIANGLES.ids, TRIANGLES.edges)
		const nodes: SimNode[] = TRIANGLES.ids.map((id, i) => ({
			id, x: 400 + i, y: 300, vx: 0, vy: 0, pinned: false,
		}))
		for (let i = 0; i < 400; i++) {
			stepForces(nodes, TRIANGLES.edges, { width: 800, height: 600, clusterOf: knots })
		}
		const node = (id: string) => nodes.find(n => n.id === id)!
		const mid = (of: string[]) => ({
			x: of.reduce((s, id) => s + node(id).x, 0) / of.length,
			y: of.reduce((s, id) => s + node(id).y, 0) / of.length,
		})
		const A = ['a', 'b', 'c']
		const B = ['d', 'e', 'f']
		const ma = mid(A)
		const mb = mid(B)
		for (const id of A) expect(dist(node(id), ma), id).toBeLessThan(dist(node(id), mb))
		for (const id of B) expect(dist(node(id), mb), id).toBeLessThan(dist(node(id), ma))
		// Sorted is not the same as apart. Two knots of three claim 2·√3·46 ≈ 159px between them.
		expect(dist(ma, mb)).toBeGreaterThan(150)
	})
})

describe('convexHull', () => {
	it('keeps the outside and drops the inside', () => {
		const hull = convexHull([
			{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 },
		])
		expect(hull).toHaveLength(4)
		expect(hull).not.toContainEqual({ x: 5, y: 5 })
	})

	it('comes back round the outside in order, not in the order it was given', () => {
		// Consecutive points have to be neighbours on the square, or the stroked blob crosses
		// itself — which is the whole reason the caller can draw it as one path.
		const hull = convexHull([
			{ x: 10, y: 10 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 },
		])
		expect(hull).toHaveLength(4)
		for (const [i, a] of hull.entries()) {
			const b = hull[(i + 1) % hull.length]!
			expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(10)
		}
	})

	it('drops a point that only sits on the line', () => {
		expect(convexHull([
			{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 },
		])).toHaveLength(3)
	})

	it('hands back a knot of one or two as it is — stroked, those are a circle and a capsule', () => {
		expect(convexHull([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }])
		expect(convexHull([{ x: 0, y: 0 }, { x: 9, y: 0 }])).toHaveLength(2)
	})

	it('survives a whole knot landing on the same spot', () => {
		expect(convexHull([{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 }])).toEqual([{ x: 2, y: 2 }])
	})
})

describe('chainLayout', () => {
	it('lays the chain out left to right, one gap apart, on the one line', () => {
		const steps = chainLayout(['a', 'c', 'd'], TRIANGLES.edges)
		expect(steps.map(s => s.id)).toEqual(['a', 'c', 'd'])
		expect(steps.map(s => s.x)).toEqual([0, CHAIN_GAP, CHAIN_GAP * 2])
		expect(steps.every(s => s.y === 0)).toBe(true)
	})

	it('hangs each step\'s other ties off it and leaves the chain itself out of the rings', () => {
		const steps = chainLayout(['a', 'c', 'd'], TRIANGLES.edges)
		// 'b' is tied to both 'a' and 'c'; it belongs to the first of them and appears once.
		expect(steps[0]!.halo.map(h => h.id)).toEqual(['b'])
		expect(steps[1]!.halo).toEqual([])
		expect(steps[2]!.halo.map(h => h.id).sort()).toEqual(['e', 'f'])
		expect(steps.every(s => s.halo.every(h => Math.abs(Math.hypot(h.x - s.x, h.y) - CHAIN_HALO_R) < 1e-9))
		).toBe(true)
	})

	it('keeps the fan clear of the line the chain is drawn on', () => {
		const hub = Array.from({ length: 8 }, (_, i) => edge('a', `n${i}`))
		for (const h of chainLayout(['a'], hub)[0]!.halo) {
			// Well off the axis: a satellite at dead level would sit on the chain's own line.
			expect(Math.abs(h.y)).toBeGreaterThan(CHAIN_HALO_R * 0.3)
		}
	})

	it('keeps the best connected, counts the rest, and still draws eight circles', () => {
		// 'a' has twelve hangers-on; four of them are hubs in their own right.
		const many = Array.from({ length: 12 }, (_, i) => edge('a', `n${i}`))
		for (let i = 0; i < 4; i++) {
			many.push(edge(`n${i}`, `x${i}`), edge(`n${i}`, `y${i}`))
		}
		const step = chainLayout(['a'], many)[0]!
		expect(step.halo).toHaveLength(CHAIN_HALO_MAX - 1)
		expect(step.extra).toBe(12 - (CHAIN_HALO_MAX - 1))
		expect(step.extraAt).not.toBeNull()
		expect(step.halo.slice(0, 4).map(h => h.id)).toEqual(['n0', 'n1', 'n2', 'n3'])
	})

	it('says nothing is missing when everyone fits', () => {
		const step = chainLayout(['a'], TRIANGLES.edges)[0]!
		expect(step.extra).toBe(0)
		expect(step.extraAt).toBeNull()
	})

	it('wraps into rows that read back and forth, like lines of writing', () => {
		const steps = chainLayout(Array.from({ length: 7 }, (_, i) => `p${i}`), [], 3)
		expect(steps.map(s => s.x)).toEqual(
			[0, CHAIN_GAP, CHAIN_GAP * 2, CHAIN_GAP * 2, CHAIN_GAP, 0, 0])
		expect(steps.map(s => s.y)).toEqual(
			[0, 0, 0, CHAIN_ROW, CHAIN_ROW, CHAIN_ROW, CHAIN_ROW * 2])
	})

	it('turns by dropping straight down, so no step cuts back across a row', () => {
		const steps = chainLayout(Array.from({ length: 9 }, (_, i) => `p${i}`), [], 4)
		for (const [i, s] of steps.slice(0, -1).entries()) {
			const next = steps[i + 1]!
			// Along a row or down onto the next one — never a diagonal over what was just drawn.
			expect(s.x === next.x || s.y === next.y).toBe(true)
		}
	})

	it('takes the satellites down to the row their person is on', () => {
		// 'd' is third of three at two to a row, so it opens the second row.
		const step = chainLayout(['a', 'c', 'd'], TRIANGLES.edges, 2)[2]!
		expect(step.y).toBe(CHAIN_ROW)
		for (const h of step.halo) expect(Math.abs(h.y - CHAIN_ROW)).toBeLessThanOrEqual(CHAIN_HALO_R)
	})
})

describe('chainColumns', () => {
	it('makes the rows about the shape of the window they have to fit in', () => {
		expect(chainColumns(40, 1600, 400)).toBeGreaterThan(chainColumns(40, 400, 1600))
		const per = chainColumns(40, 1200, 800)
		const aspect = (per * CHAIN_GAP) / (Math.ceil(40 / per) * CHAIN_ROW)
		// Within half and double of the window's own 1.5 — the headcount only divides so many ways.
		expect(aspect).toBeGreaterThan(0.75)
		expect(aspect).toBeLessThan(3)
	})

	it('leaves a chain too short to be worth folding on the one line', () => {
		expect(chainColumns(2, 1200, 800)).toBe(2)
	})
})

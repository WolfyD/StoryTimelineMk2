/**
 * BL-76 / BL-77: more ways to lay the same web out — knots, a matrix, an arc, faction boxes,
 * a chord circle and the chain between two people. All pure: ids and edges in, positions out,
 * so the page only has to draw them.
 */
import type { GraphEdge, SimNode } from '@/utils/relationsGraph'

export interface Placed {
	id: string
	x: number
	y: number
}

/** Neighbours per id, weighted the way the springs weigh them: a close tie counts for more. */
function adjacency(ids: string[], edges: GraphEdge[]): Map<string, { id: string; w: number }[]> {
	const out = new Map<string, { id: string; w: number }[]>(ids.map(id => [id, []]))
	for (const e of edges) {
		const a = out.get(e.aId)
		const b = out.get(e.bId)
		if (!a || !b || e.aId === e.bId) continue
		const w = 0.4 + Math.max(0, Math.min(e.strength, 100)) / 100
		a.push({ id: e.bId, w })
		b.push({ id: e.aId, w })
	}
	return out
}

// ── Knots ────────────────────────────────────────────────────────────────────

/**
 * Which knot of people each character belongs to, numbered from 0 in the order the ids come in.
 * Label propagation: everyone takes the label their ties pull hardest toward, over and over until
 * nothing moves. Someone nobody is related to is a knot of one, which is the honest answer.
 *
 * ponytail: label propagation, not Louvain — a few dozen lines against a dependency, and on a
 * cast this size it finds the same families. It can smear a dense web into one big knot; if that
 * ever happens to a real project, graphology-communities-louvain is the drop-in upgrade.
 */
export function communities(ids: string[], edges: GraphEdge[], rounds = 12): Map<string, number> {
	const adj = adjacency(ids, edges)
	const label = new Map(ids.map((id, i) => [id, i]))

	for (let r = 0; r < rounds; r++) {
		let changed = false
		for (const id of ids) {
			const neighbours = adj.get(id) ?? []
			if (!neighbours.length) continue
			const weight = new Map<number, number>()
			for (const n of neighbours) {
				const l = label.get(n.id)!
				weight.set(l, (weight.get(l) ?? 0) + n.w)
			}
			const own = label.get(id)!
			let best = own
			let bestW = weight.get(own) ?? 0
			// Ties go to the lower label, so the same cast always lands in the same knots.
			for (const [l, w] of weight) if (w > bestW || (w === bestW && l < best)) { best = l; bestW = w }
			if (best !== own) {
				label.set(id, best)
				changed = true
			}
		}
		if (!changed) break
	}

	const renumbered = new Map<number, number>()
	const out = new Map<string, number>()
	for (const id of ids) {
		const raw = label.get(id)!
		if (!renumbered.has(raw)) renumbered.set(raw, renumbered.size)
		out.set(id, renumbered.get(raw)!)
	}
	return out
}

/** Knot centres on a wide ring, members on a small one around their own — the sim does the rest. */
export function clusterSeed(
	ids: string[],
	clusters: Map<string, number>,
	width: number,
	height: number,
): SimNode[] {
	const groups = new Map<number, string[]>()
	for (const id of ids) {
		const key = clusters.get(id) ?? 0
		const group = groups.get(key)
		if (group) group.push(id)
		else groups.set(key, [id])
	}

	const keys = [...groups.keys()]
	const spread = Math.min(width, height) * 0.36
	const out: SimNode[] = []
	for (const [gi, key] of keys.entries()) {
		const members = groups.get(key)!
		const angle = (gi / Math.max(1, keys.length)) * Math.PI * 2
		const cx = width / 2 + (keys.length > 1 ? spread * Math.cos(angle) : 0)
		const cy = height / 2 + (keys.length > 1 ? spread * Math.sin(angle) : 0)
		const radius = 30 + members.length * 6
		for (const [mi, id] of members.entries()) {
			const a = (mi / Math.max(1, members.length)) * Math.PI * 2
			out.push({ id, x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), vx: 0, vy: 0, pinned: false })
		}
	}
	return out
}

/** How far a knot's blob is drawn outside its outermost member. */
export const HULL_PAD = 34

/**
 * Where to put a stage so a box of content sits centred in it, with a 20px margin all round.
 *
 * `ease` under 1 is for a fit running every frame against a layout that is still moving: it closes
 * *in* that fraction of the way from `now` each call, while pulling *out* is always immediate.
 * Easing both directions is the obvious thing and is wrong — a force layout expanding faster than
 * the fit can follow spends the whole expansion with its edges cut off, which is a worse fault than
 * the late fit it was meant to smooth. One-way means the content is inside the frame every frame,
 * and the view still closes in gently once the layout stops growing. At 1 it simply lands.
 */
export function fitView(
	box: { w: number; h: number },
	stage: { w: number; h: number },
	now = 1,
	ease = 1,
) {
	const w = Math.max(1, box.w)
	const h = Math.max(1, box.h)
	const want = Math.max(0.15, Math.min(1, (stage.w - 40) / w, (stage.h - 40) / h))
	const k = Math.min(want, now + (want - now) * ease)
	return { k, x: (stage.w - w * k) / 2, y: (stage.h - h * k) / 2 }
}

/**
 * Convex hull, monotone chain — the points round the outside of a knot, in order.
 *
 * The caller draws it as one closed path stroked `HULL_PAD * 2` wide with round joins and caps,
 * which rounds the corners and grows the blob by the padding in one go; there is no offsetting
 * maths here because the stroke already is the offset. Fewer than three points come back as they
 * are, and that is the whole handling of the degenerate cases: stroked, a single point is a circle
 * and a pair is a capsule, which is what a knot of one or two ought to look like.
 */
export function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
	// Deduplicate first: two characters exactly on top of each other make a zero-length cross
	// product, and the turn test below cannot say which way that one turns.
	const p = [...new Map(pts.map(q => [`${q.x},${q.y}`, q])).values()]
		.sort((a, b) => a.x - b.x || a.y - b.y)
	if (p.length < 3) return p
	type Pt = { x: number; y: number }
	const turn = (o: Pt, a: Pt, b: Pt): number =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
	// `<= 0` drops points that are merely on the line as well as ones that turn the wrong way, so
	// a knot in a straight row comes out as its two ends rather than every node along it.
	const half = (src: Pt[]): Pt[] => {
		const out: Pt[] = []
		for (const q of src) {
			while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop()
			out.push(q)
		}
		out.pop()
		return out
	}
	return [...half(p), ...half([...p].reverse())]
}

// ── Arc ──────────────────────────────────────────────────────────────────────

export interface ArcLayout {
	/** Everyone, left to right: the dated in birth order, then the undated. `y` is always 0. */
	placed: Placed[]
	/** Where the undated bucket begins, or null when every birth year is known. */
	undatedFrom: number | null
	/** The x of the last person placed, so the caller can size the axis without a second pass. */
	width: number
}

/**
 * Everyone on one horizontal axis by birth year.
 *
 * `spread` is the writer's knob, 0 to 1. At 0 everybody sits the same distance apart in birth
 * order — even, readable, and a position means only "older than the one to the left". At 1 a gap
 * of forty years is twice a gap of twenty, so the quiet centuries are as wide as they really were
 * and the chart runs off the screen; in between it is a straight blend of the two, which is where
 * most casts read best. The knob exists because neither end is right for every timeline, and zoom
 * cannot stand in for it — zoom shrinks the faces along with the gaps.
 *
 * How wide a year is at full spread comes from the *median* step between consecutive birth years:
 * the typical step is one disc, so most of the cast is readable and only the unusual gaps stretch.
 * Scaling off the smallest step instead would let one pair born a year apart in a cast spanning
 * centuries blow the axis out to nothing but whitespace.
 *
 * Whatever the blend says, nobody ends up closer than `gap` to the person on their left: one pass
 * from the left pushes the crowded ones along. That is what keeps a portrait a portrait rather
 * than a stack of overlapping discs, and it is why a proportional axis can be read at all.
 *
 * A character with no birth year is not dropped and not guessed at — they go in a bucket past the
 * right-hand end, after a gap wide enough to read as "these are not on the timeline".
 */
export function arcLayout(
	ids: string[],
	years: Map<string, number | null>,
	spread: number,
	gap: number,
): ArcLayout {
	const s = Math.max(0, Math.min(1, spread))
	const yearOf = (id: string) => years.get(id) ?? null
	const dated = ids.filter(id => yearOf(id) !== null).sort((a, b) => yearOf(a)! - yearOf(b)!)
	const undated = ids.filter(id => yearOf(id) === null)

	const first = dated[0]
	const lo = first === undefined ? 0 : yearOf(first)!
	const steps = dated.slice(1)
		.map((id, i) => yearOf(id)! - yearOf(dated[i]!)!)
		.filter(d => d > 0)
		.sort((a, b) => a - b)
	// A cast all born in the same year has no step to scale by; the nudge below spreads them.
	const median = steps.length ? steps[Math.floor(steps.length / 2)]! : 0
	const perYear = median > 0 ? gap / median : 0

	const placed: Placed[] = []
	let x = 0
	for (const [i, id] of dated.entries()) {
		const even = i * gap
		const want = even + ((yearOf(id)! - lo) * perYear - even) * s
		x = i === 0 ? want : Math.max(want, x + gap)
		placed.push({ id, x, y: 0 })
	}

	// Two gaps of daylight, so the bucket reads as a bucket and not as the tail of the century.
	const undatedFrom = undated.length === 0 ? null : dated.length === 0 ? 0 : x + gap * 2
	if (undatedFrom !== null) {
		x = undatedFrom
		for (const id of undated) {
			placed.push({ id, x, y: 0 })
			x += gap
		}
		x -= gap
	}

	return { placed, undatedFrom, width: placed.length ? x : 0 }
}

// ── Sociogram ────────────────────────────────────────────────────────────────

/** One member's worth of box: a disc with room for a name under it. */
const SOCIO_CELL_W = 118
const SOCIO_CELL_H = 84
/** Clear space inside a box's border, around the grid of members. */
const SOCIO_PAD = 14
/** Room at the top of a box for the faction's name. The caller draws the label in it. */
export const SOCIO_HEADER = 28
/** The least daylight ever left between two boxes on the ring. */
const SOCIO_GAP = 96

export interface SociogramBox {
	name: string
	/** Top-left corner and size, in the same coordinates as `placed`. */
	x: number
	y: number
	w: number
	h: number
}

export interface SociogramLayout {
	/** One per faction, in the order given. */
	boxes: SociogramBox[]
	/** Everyone: box members in group order, then the unaffiliated. */
	placed: Placed[]
	/** The circle the unaffiliated sit on — 0 when there are none. */
	looseRadius: number
}

/** A box just big enough for `n` members in as square a grid as they make. */
function boxSize(n: number): { w: number; h: number; cols: number } {
	const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n))))
	const rows = Math.max(1, Math.ceil(Math.max(1, n) / cols))
	return {
		w: cols * SOCIO_CELL_W + SOCIO_PAD * 2,
		h: rows * SOCIO_CELL_H + SOCIO_PAD * 2 + SOCIO_HEADER,
		cols,
	}
}

/**
 * Factions as hard boxes round a ring, with whoever belongs to none loose outside it.
 *
 * The ring is the arrangement that makes a crossing tie legible: every box faces an open middle,
 * so a line leaving one has nothing to hide behind. Boxes sit at equal angles — spacing them by
 * size would reorder the whole ring every time somebody joined a house, and a chart that moves
 * under you is a chart you cannot learn.
 *
 * Sizing the ring: each box is treated as the disc that covers it, which turns "do these two
 * overlap" into one comparison instead of four. Two boxes `steps` apart on the ring have
 * `2R·sin(π·steps/n)` between their centres, so each pair names a radius it needs and the biggest
 * of those wins. Every pair, not just the neighbours: on a ring of alternating huge and tiny
 * boxes the neighbouring pairs only ever ask about a huge one beside a tiny one, and the two huge
 * ones facing each other across the middle are never asked about at all. Same loop either way.
 *
 * ponytail: the covering disc is generous for a wide, flat box, so a two-faction ring is roomier
 * than it strictly needs to be. Measure the real corner distance per angle if that ever grates.
 */
export function sociogramLayout(
	groups: { name: string; ids: string[] }[],
	loose: string[],
): SociogramLayout {
	const sized = groups.map(g => ({ ...g, ...boxSize(g.ids.length) }))
	const rad = sized.map(b => Math.hypot(b.w, b.h) / 2)
	const n = sized.length

	let R = 0
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			// The shorter way round the ring, so the far side of a big ring is not treated as near.
			const steps = Math.min(j - i, n - (j - i))
			R = Math.max(R, (rad[i]! + rad[j]! + SOCIO_GAP) / (2 * Math.sin((Math.PI * steps) / n)))
		}
	}

	const boxes: SociogramBox[] = []
	const placed: Placed[] = []
	for (const [i, b] of sized.entries()) {
		// First box at the top, so a cast whose factions do not change opens the same way twice.
		const a = (Math.PI * 2 * i) / n - Math.PI / 2
		const cx = Math.cos(a) * R
		const cy = Math.sin(a) * R
		boxes.push({ name: b.name, x: cx - b.w / 2, y: cy - b.h / 2, w: b.w, h: b.h })

		const x0 = cx - b.w / 2 + SOCIO_PAD + SOCIO_CELL_W / 2
		const y0 = cy - b.h / 2 + SOCIO_PAD + SOCIO_HEADER + SOCIO_CELL_H / 2
		for (const [j, id] of b.ids.entries()) {
			placed.push({
				id,
				x: x0 + (j % b.cols) * SOCIO_CELL_W,
				y: y0 + Math.floor(j / b.cols) * SOCIO_CELL_H,
			})
		}
	}

	// Outside everything, evenly round: they belong to nothing, and the ring says so. Far enough
	// out to clear the widest box, and never so tight that they sit on top of each other.
	let looseRadius = 0
	if (loose.length) {
		looseRadius = Math.max(
			R + Math.max(0, ...rad) + SOCIO_GAP,
			(loose.length * SOCIO_CELL_W) / (Math.PI * 2),
		)
		for (const [i, id] of loose.entries()) {
			const a = (Math.PI * 2 * i) / loose.length - Math.PI / 2
			placed.push({ id, x: Math.cos(a) * looseRadius, y: Math.sin(a) * looseRadius })
		}
	}

	return { boxes, placed, looseRadius }
}

// ── Chord ────────────────────────────────────────────────────────────────────

/** The least daylight between two arcs, in radians. Shared out when there are a lot of them. */
const CHORD_PAD = 0.045
/** What one tie-end is worth in circumference, so the circle grows with the cast instead of
 *  squeezing a hundred ribbons through the same gap. */
const CHORD_PX_PER_END = 7
const CHORD_MIN_R = 200
/** How thick the band of arcs is. The caller draws the band; the ribbons land on `radius`. */
export const CHORD_BAND = 22

export interface ChordArc {
	name: string
	/** Index into the names given, which is how a ribbon names its ends. */
	index: number
	/** Radians, clockwise from twelve o'clock. */
	start: number
	end: number
	/** Tie-ends on this arc. A tie inside the group counts twice — both its ends are here. */
	weight: number
}

export interface ChordRibbon {
	a: number
	b: number
	/** Ties between the two groups, or inside one when `a === b`. */
	count: number
	/** The span this ribbon takes on `a`'s arc, then the one it takes on `b`'s. Radians. */
	a0: number
	a1: number
	b0: number
	b1: number
}

export interface ChordLayout {
	arcs: ChordArc[]
	ribbons: ChordRibbon[]
	/** The inside of the band: where every ribbon starts and ends. */
	radius: number
}

/**
 * Groups round a circle, with a ribbon between two of them as wide as the number of ties that
 * cross. `counts` is symmetric; `counts[i][i]` is the ties that stay inside group `i`.
 *
 * An arc is as long as the group has tie-ends, not as long as the group has people. A house of
 * forty who keep to themselves earns less of the circle than a house of five everybody deals
 * with, which is the question this view is for — a headcount is what the sociogram's boxes are
 * already for. A tie inside a group spends two of that group's ends, because both of them are
 * on the same arc, and that is what gives it a loop back onto itself to be drawn as.
 *
 * Every ribbon owns a span at each end, handed out in group order round each arc, so the two
 * ends of a ribbon are the same width and the arc is exactly filled. A group with no ties at all
 * gets a zero-width arc rather than being dropped: the circle should not quietly lose a faction.
 *
 * ponytail: spans go round in group order, not sorted to cross less. d3's chord untangles them;
 * at a dozen factions the crossings are the picture rather than noise. Sort by target angle if a
 * real project ever ends up with fifty.
 */
export function chordLayout(names: string[], counts: number[][]): ChordLayout {
	const n = names.length
	const at = (i: number, j: number): number => counts[i]?.[j] ?? 0

	const weight = names.map((_, i) => {
		let w = 0
		for (let j = 0; j < n; j++) w += at(i, j)
		return w + at(i, i)
	})
	const total = weight.reduce((a, b) => a + b, 0)
	if (!n || !total) return { arcs: [], ribbons: [], radius: CHORD_MIN_R }

	// Gaps never eat more than a third of the circle, however many groups there are, or a cast
	// with forty factions is all gap and no ribbon.
	const pad = Math.min(CHORD_PAD, (Math.PI * 2 * 0.33) / n)
	const perEnd = (Math.PI * 2 - pad * n) / total
	const radius = Math.max(CHORD_MIN_R, (total * CHORD_PX_PER_END) / (Math.PI * 2))

	const arcs: ChordArc[] = []
	// Where each end of each ribbon sits: `i:j` is the span group `i` gives to its ties with `j`,
	// and `i:i` is the pair of spans the group's own internal ties loop between.
	const span = new Map<string, [number, number]>()
	let angle = -Math.PI / 2
	for (let i = 0; i < n; i++) {
		const start = angle
		for (let j = 0; j < n; j++) {
			const w = at(i, j) * perEnd
			if (i === j) {
				// Both ends of every internal tie, side by side, so the loop is short and fat.
				span.set(`${i}:${i}`, [angle, angle + w])
				span.set(`${i}:${i}:b`, [angle + w, angle + w * 2])
				angle += w * 2
			} else {
				span.set(`${i}:${j}`, [angle, angle + w])
				angle += w
			}
		}
		arcs.push({ name: names[i] ?? '', index: i, start, end: angle, weight: weight[i]! })
		angle += pad
	}

	const ribbons: ChordRibbon[] = []
	for (let i = 0; i < n; i++) {
		for (let j = i; j < n; j++) {
			const count = at(i, j)
			if (count <= 0) continue
			const a = span.get(`${i}:${j}`)!
			const b = span.get(i === j ? `${i}:${i}:b` : `${j}:${i}`)!
			ribbons.push({ a: i, b: j, count, a0: a[0], a1: a[1], b0: b[0], b1: b[1] })
		}
	}

	return { arcs, ribbons, radius }
}

// ── Matrix ───────────────────────────────────────────────────────────────

/**
 * The order rows and columns go in, so the blocks that mean something sit on the diagonal.
 *
 * Faction first when the caller passes one, because a faction is a fact the writer wrote down and
 * a knot is one this file guessed: a block labelled *House Varden* is worth more on a wall than a
 * block that happens to hang together. Biggest faction first, ties broken by name, and everyone
 * with no faction last — they are the people the grid has least to say about. Inside a faction it
 * falls back to the old order, knots together and the best-connected first, which is the whole
 * order when no factions exist.
 *
 * Ties keep the order they came in, which is why the page hands this a cast already sorted by name.
 */
export function matrixOrder(
	ids: string[],
	edges: GraphEdge[],
	clusters: Map<string, number> = communities(ids, edges),
	factionOf?: Map<string, string>,
): string[] {
	const degree = new Map<string, number>(ids.map(id => [id, 0]))
	for (const e of edges) {
		if (degree.has(e.aId)) degree.set(e.aId, degree.get(e.aId)! + 1)
		if (degree.has(e.bId)) degree.set(e.bId, degree.get(e.bId)! + 1)
	}
	const size = new Map<number, number>()
	for (const id of ids) {
		const key = clusters.get(id) ?? 0
		size.set(key, (size.get(key) ?? 0) + 1)
	}
	const faction = (id: string): string => factionOf?.get(id)?.trim() ?? ''
	const strength = new Map<string, number>()
	for (const id of ids) {
		const f = faction(id)
		if (f) strength.set(f, (strength.get(f) ?? 0) + 1)
	}
	return [...ids].sort((a, b) => {
		const fa = faction(a)
		const fb = faction(b)
		if (fa !== fb) {
			// The empty string sorts last however big it gets, so `loose` never leads the grid.
			if (!fa || !fb) return fa ? -1 : 1
			const byCount = (strength.get(fb) ?? 0) - (strength.get(fa) ?? 0)
			if (byCount) return byCount
			return fa.localeCompare(fb)
		}
		const ca = clusters.get(a) ?? 0
		const cb = clusters.get(b) ?? 0
		if (ca !== cb) return (size.get(cb) ?? 0) - (size.get(ca) ?? 0) || ca - cb
		return (degree.get(b) ?? 0) - (degree.get(a) ?? 0)
	})
}

// ── Chain ───────────────────────────────────────────────────────────────────

/** How far apart two people on the chain stand — room for a fan of small discs between them. */
export const CHAIN_GAP = 330
/** How far a satellite sits from whoever it belongs to. */
export const CHAIN_HALO_R = 104
/** How far apart two rows of a wrapped chain stand — a fan below one clears the fan above the next. */
export const CHAIN_ROW = 300
/** Most circles one chain member gets around them. Past this the rest are counted, not drawn. */
export const CHAIN_HALO_MAX = 5

export interface ChainStep extends Placed {
	/** Their other direct ties, placed around them. */
	halo: Placed[]
	/** How many did not fit, and where to say so. Zero and null when they all fit. */
	extra: number
	extraAt: { x: number; y: number } | null
}

/**
 * Satellite slots round a point: half the fan above the chain and half below, never on it. A tie
 * drawn at dead level would run along the chain's own line, which is the one line on this chart
 * that has to stay legible.
 */
function fan(count: number, cx: number, cy: number): { x: number; y: number }[] {
	const above = Math.ceil(count / 2)
	return Array.from({ length: count }, (_, i) => {
		const up = i < above
		const k = up ? i : i - above
		const of = up ? above : count - above
		// One on its own sits at the middle of its arc; two or more spread across it.
		const t = of === 1 ? 0.5 : k / (of - 1)
		// Well clear of the horizontal: the chain's own line and the word written over it
		// run along it, and a satellite at dead level lands on both.
		const rad = ((up ? -145 + t * 110 : 35 + t * 110) * Math.PI) / 180
		return { x: cx + Math.cos(rad) * CHAIN_HALO_R, y: cy + Math.sin(rad) * CHAIN_HALO_R }
	})
}

/**
 * The chain between two people, laid left to right, with a ring of everyone else they are directly
 * tied to fanned round each of them.
 *
 * Nobody is drawn twice: a neighbour two people on the chain share is placed once, at the earlier
 * of them, and the page can still draw a line from each — two circles with one name under them
 * would read as two people.
 *
 * Who gets dropped past `CHAIN_HALO_MAX` is the least connected, because a hub hanging off the
 * chain says more about where this route sits in the web than a walk-on does. The slot the count
 * goes in is one of the ring's, so it is always the same eight circles, one of them saying how
 * many you are not being shown.
 */
/**
 * How many people to a row so a wrapped chain comes out roughly the shape of the window it has to
 * fit in. Solved rather than guessed: a row is `n/perRow` rows tall and `perRow` gaps wide, and
 * setting that ratio equal to the stage's leaves one square root.
 */
export function chainColumns(count: number, w: number, h: number): number {
	if (count < 3 || w <= 0 || h <= 0) return count
	return Math.max(2, Math.min(count, Math.round(Math.sqrt((count * CHAIN_ROW * w) / (CHAIN_GAP * h)))))
}

export function chainLayout(path: string[], edges: GraphEdge[], perRow = 0): ChainStep[] {
	const near = new Map<string, Set<string>>()
	for (const e of edges) {
		if (e.aId === e.bId) continue
		if (!near.has(e.aId)) near.set(e.aId, new Set())
		if (!near.has(e.bId)) near.set(e.bId, new Set())
		near.get(e.aId)!.add(e.bId)
		near.get(e.bId)!.add(e.aId)
	}

	const onPath = new Set(path)
	const taken = new Set<string>()
	return path.map((id, i) => {
		// Boustrophedon: every other row runs back the way it came, so the last person of one row
		// and the first of the next stand one above the other and the step between them is a plain
		// drop. Wrapped the other way it would be a diagonal back across everything just drawn.
		const row = perRow ? Math.floor(i / perRow) : 0
		const col = perRow ? i % perRow : i
		const x = (row % 2 ? perRow - 1 - col : col) * CHAIN_GAP
		const y = row * CHAIN_ROW
		const others = [...(near.get(id) ?? [])]
			.filter(o => !onPath.has(o) && !taken.has(o))
			.sort((a, b) => (near.get(b)?.size ?? 0) - (near.get(a)?.size ?? 0) || a.localeCompare(b))
		const over = others.length > CHAIN_HALO_MAX
		const shown = others.slice(0, over ? CHAIN_HALO_MAX - 1 : CHAIN_HALO_MAX)
		for (const o of shown) taken.add(o)
		const spots = fan(shown.length + (over ? 1 : 0), x, y)
		return {
			id,
			x,
			y,
			halo: shown.map((o, k) => ({ id: o, x: spots[k]!.x, y: spots[k]!.y })),
			extra: others.length - shown.length,
			extraAt: over ? spots[spots.length - 1]! : null,
		}
	})
}

/**
 * BL-73: the maths behind the relations window — the force sim, the shortest path and the family
 * tree. All of it pure and canvas-free, so it can be tested without a stage.
 */
import type { CharacterItem, CharacterRelationship, RelationshipType } from '@/types/models'
import { relationLabel } from '@/utils/characterRelations'

// ── The web, as of a year ────────────────────────────────────────────────────

/**
 * Whether a relation holds in `year`. A null year means "whenever" and matches everything, which
 * is the normal case: most relations are implied by their kind and were never dated.
 */
export function relationActiveAt(rel: CharacterRelationship, year: number | null): boolean {
	if (year === null) return true
	return (rel.StartYear === null || rel.StartYear <= year) && (rel.EndYear === null || rel.EndYear >= year)
}

export type LifeState = 'unborn' | 'alive' | 'dead'

/** Where a character stands in `year`. Undated on either end reads as "already" / "still". */
export function lifeStateAt(c: CharacterItem, year: number | null): LifeState {
	if (year === null) return 'alive'
	if (c.BirthYear !== null && year < c.BirthYear) return 'unborn'
	if (c.DeathYear !== null && year > c.DeathYear) return 'dead'
	return 'alive'
}

/** The span the scrubber covers: every dated birth, death and relation, or null when nothing is dated. */
export function yearRange(
	characters: CharacterItem[],
	relations: CharacterRelationship[],
): { min: number; max: number } | null {
	const years: number[] = []
	for (const c of characters) {
		if (c.BirthYear !== null) years.push(c.BirthYear)
		if (c.DeathYear !== null) years.push(c.DeathYear)
	}
	for (const r of relations) {
		if (r.StartYear !== null) years.push(r.StartYear)
		if (r.EndYear !== null) years.push(r.EndYear)
	}
	if (!years.length) return null
	const min = Math.min(...years)
	const max = Math.max(...years)
	return min === max ? { min, max: max + 1 } : { min, max }
}

// ── Edge categories ──────────────────────────────────────────────────────────

/** A kind's loose grouping, lower-cased. Kinds whose type was never set land in 'other'. */
export function categoryOf(type: RelationshipType | undefined): string {
	return type?.Type?.trim().toLowerCase() || 'other'
}

const CATEGORY_COLORS: Record<string, string> = {
	family: '#f59e0b',
	social: '#38bdf8',
	romantic: '#f472b6',
	professional: '#a3e635',
	hostile: '#f87171',
	other: '#94a3b8',
}

/**
 * The line color for a category. The seeded ones are fixed so the legend means the same thing in
 * every project; a category the writer invented gets a stable hue off its own name.
 */
export function categoryColor(category: string): string {
	const known = CATEGORY_COLORS[category]
	if (known) return known
	let hash = 0
	for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) % 360
	return `hsl(${hash}, 62%, 62%)`
}

export interface GraphEdge {
	id: number
	aId: string
	bId: string
	kind: string
	category: string
	/** 0–100: how thick the line draws and how hard its spring pulls. */
	strength: number
	/** The state word on the tie, which picks the line's dash pattern. */
	modifier: string | null
}

/** Thicker the closer they are — a hairline at 0, and still readable at 100. */
export function edgeWidth(strength: number): number {
	return 0.8 + (Math.max(0, Math.min(strength, 100)) / 100) * 2.8
}

/**
 * The line style a modifier reads as: a secret tie is dashed and an estranged one dotted, because
 * both are relations that are not quite there. Everything else draws solid.
 */
export function edgeDash(modifier: string | null): number[] {
	const m = (modifier ?? '').trim().toLowerCase()
	if (m === 'secret' || m === 'alleged') return [9, 6]
	if (m === 'estranged' || m === 'former') return [2, 5]
	return []
}

/** Relations turned into drawable edges, dropping any whose ends are not both on screen. */
export function buildEdges(
	relations: CharacterRelationship[],
	types: Map<string, RelationshipType>,
	known: Set<string>,
): GraphEdge[] {
	const out: GraphEdge[] = []
	for (const r of relations) {
		if (!known.has(r.Character1Id) || !known.has(r.Character2Id)) continue
		out.push({
			id: r.Id,
			aId: r.Character1Id,
			bId: r.Character2Id,
			kind: r.RelationshipType,
			category: categoryOf(types.get(r.RelationshipType)),
			strength: r.RelationshipStrength ?? 50,
			modifier: r.RelationshipModifier ?? null,
		})
	}
	return out
}

// ── Force-directed layout ────────────────────────────────────────────────────

export interface SimNode {
	id: string
	x: number
	y: number
	vx: number
	vy: number
	/** Dragged somewhere on purpose: the sim leaves it alone and it is saved with the timeline. */
	pinned: boolean
}

export interface ForceOptions {
	width: number
	height: number
	/** How hard every pair pushes apart. Bigger = airier. */
	repulsion?: number
	linkDistance?: number
	linkStrength?: number
	/** Pull toward the middle, so disconnected islands do not drift off the stage. */
	gravity?: number
	damping?: number
	/** Which knot each node belongs to; members are also pulled toward their own knot's middle. */
	clusterOf?: Map<string, number>
	clusterGravity?: number
	/** How hard two knots shove each other apart once they overlap. */
	clusterRepulsion?: number
	/** Room a knot claims per √member, so a knot of forty is not forty times wider than one of one. */
	clusterRoom?: number
	/** How hot the sim still is: 1 at a kick, decayed toward 0 by the caller. */
	alpha?: number
}

/** A kick cools to nothing in about two hundred ticks, so the sim always stops on its own. */
export const ALPHA_DECAY = 0.98
export const ALPHA_MIN = 0.02

/**
 * Two caps, both there for the same reason: repulsion goes as 1/d², which has no limit as the
 * distance goes to nothing. Past a few dozen nodes a pair is always landing on top of another,
 * and without these one close pair flings itself across the stage, lands on a third node, and the
 * whole graph thrashes for ever instead of settling.
 */
const MAX_PAIR_FORCE = 12
const MAX_SPEED = 40

/**
 * The room a knot claims per √member by default, and the point the cross-tie slack below is
 * measured from: at this setting every number in the sim is what it was before the slack existed.
 */
const CLUSTER_ROOM = 46

/**
 * One tick of the spring sim, returning how far the whole graph moved so the caller can stop when
 * it has settled. That total is a sum over the nodes, so the bar it is judged against has to scale
 * with the cast. Pass a decaying `alpha` as well: settling is not guaranteed, cooling is.
 *
 * ponytail: O(n²) repulsion — every pair, every frame. A cast of a few hundred is nothing for
 * that; if a project ever needs thousands, the upgrade is a Barnes-Hut quadtree, not a rewrite.
 */
export function stepForces(nodes: SimNode[], edges: GraphEdge[], opts: ForceOptions): number {
	const {
		width, height,
		repulsion = 6400, linkDistance = 150, linkStrength = 0.06,
		gravity = 0.012, damping = 0.82,
		// The shove is fighting the pull toward the stage centre the whole way, and at 0.12 it was
		// losing: the knots stopped a good 180px short of the room they asked for and still
		// overlapped. Equilibrium is where the two cancel, so this sets how close to `want` they
		// actually get, not how fast they get there.
		clusterOf, clusterGravity = 0.05, clusterRepulsion = 0.3, clusterRoom = CLUSTER_ROOM,
		alpha = 1,
	} = opts
	const cx = width / 2
	const cy = height / 2
	const byId = new Map(nodes.map(n => [n.id, n]))

	for (const [i, a] of nodes.entries()) {
		for (const b of nodes.slice(i + 1)) {
			let dx = b.x - a.x
			let dy = b.y - a.y
			let d2 = dx * dx + dy * dy
			// Two nodes at the same spot have no direction to push along, so give them one.
			if (d2 < 1) {
				dx = (i % 2 === 0 ? 1 : -1) * 0.5
				dy = 0.5
				d2 = 0.5
			}
			const force = Math.min(repulsion / d2, MAX_PAIR_FORCE)
			const d = Math.sqrt(d2)
			a.vx -= (dx / d) * force
			a.vy -= (dy / d) * force
			b.vx += (dx / d) * force
			b.vy += (dy / d) * force
		}
	}

	// How much extra room the knots have been given, and so how much slack the ties *between*
	// them are owed. Ties that leave a knot are what holds the knots open: with the centroids
	// shoved 1200px apart, a cross-tie is a spring stretched a thousand past its rest length, and
	// that beats the pull back toward a member's own knot — so the cross-tied members get dragged
	// out to the rim and the knot smears toward its neighbours instead of staying a knot. Measured
	// on the test cast at the top of the dial, the median knot doubled, 202 → 442px, and the
	// biggest tripled to 1019px, while the singletons sat unchanged at ~160.
	//
	// So a cross-tie gets the extra room as rest length and gives up as much pull as it gained
	// reach. Never the other way: at or below the dial's middle this is 1 and nothing changes.
	const slack = Math.max(1, clusterRoom / CLUSTER_ROOM)
	for (const e of edges) {
		const a = byId.get(e.aId)
		const b = byId.get(e.bId)
		if (!a || !b) continue
		const dx = b.x - a.x
		const dy = b.y - a.y
		const d = Math.sqrt(dx * dx + dy * dy) || 1
		// Undefined on both ends counts as one knot, which is what it is: no knots, one graph.
		const cross = clusterOf !== undefined && clusterOf.get(e.aId) !== clusterOf.get(e.bId)
		const rest = cross ? linkDistance * slack : linkDistance
		const give = cross ? linkStrength / slack : linkStrength
		// Closeness pulls: a 100 tie sits about half as far out as a 0 one, so the clusters the
		// writer marked as tight read as tight on the canvas too.
		const pull = (d - rest) * give * (0.4 + e.strength / 100)
		a.vx += (dx / d) * pull
		a.vy += (dy / d) * pull
		b.vx -= (dx / d) * pull
		b.vy -= (dy / d) * pull
	}

	// Knots pull on their own: springs alone leave two communities laced through each other.
	if (clusterOf) {
		const middle = new Map<number, { x: number; y: number; n: number }>()
		for (const n of nodes) {
			const key = clusterOf.get(n.id)
			if (key === undefined) continue
			const acc = middle.get(key) ?? { x: 0, y: 0, n: 0 }
			acc.x += n.x
			acc.y += n.y
			acc.n++
			middle.set(key, acc)
		}
		for (const acc of middle.values()) {
			acc.x /= acc.n
			acc.y /= acc.n
		}

		// Gravity alone only ever pulled a knot in on itself. Nothing pushed two knots apart, and
		// the pull toward the stage centre actively stacked them, so the knots came out concentric
		// and this view was indistinguishable from the plain graph. Centroids now shove each other
		// by however far they fall short of the room they need.
		const shove = new Map<number, { x: number; y: number }>()
		const keys = [...middle.keys()]
		for (const [i, ka] of keys.entries()) {
			const a = middle.get(ka)!
			for (const kb of keys.slice(i + 1)) {
				const b = middle.get(kb)!
				const want = (Math.sqrt(a.n) + Math.sqrt(b.n)) * clusterRoom
				let dx = b.x - a.x
				let dy = b.y - a.y
				let d = Math.hypot(dx, dy)
				// Two knots landing on the same spot have no direction to part along, so pick one.
				if (d < 1) {
					dx = ka < kb ? 1 : -1
					dy = 0
					d = 1
				}
				if (d >= want) continue
				// Half the overlap each: a big knot should not be shunted about by a small one,
				// and a small one should not be left sitting inside a big one either.
				const push = ((want - d) / d) * clusterRepulsion * 0.5
				const sa = shove.get(ka) ?? { x: 0, y: 0 }
				const sb = shove.get(kb) ?? { x: 0, y: 0 }
				sa.x -= dx * push
				sa.y -= dy * push
				sb.x += dx * push
				sb.y += dy * push
				shove.set(ka, sa)
				shove.set(kb, sb)
			}
		}

		for (const n of nodes) {
			const key = clusterOf.get(n.id)
			const acc = key === undefined ? undefined : middle.get(key)
			if (acc === undefined || key === undefined) continue
			n.vx += (acc.x - n.x) * clusterGravity
			n.vy += (acc.y - n.y) * clusterGravity
			const s = shove.get(key)
			if (!s) continue
			// The whole knot moves together, so the shove does not tear it open on the way.
			n.vx += s.x
			n.vy += s.y
		}
	}

	let moved = 0
	for (const n of nodes) {
		if (n.pinned) {
			n.vx = 0
			n.vy = 0
			continue
		}
		n.vx = (n.vx + (cx - n.x) * gravity) * damping
		n.vy = (n.vy + (cy - n.y) * gravity) * damping
		const speed = Math.hypot(n.vx, n.vy)
		if (speed > MAX_SPEED) {
			n.vx *= MAX_SPEED / speed
			n.vy *= MAX_SPEED / speed
		}
		n.x += n.vx * alpha
		n.y += n.vy * alpha
		moved += (Math.abs(n.vx) + Math.abs(n.vy)) * alpha
	}
	return moved
}

/** Starting positions: a ring, so the first tick has directions to work with. */
export function seedPositions(ids: string[], width: number, height: number): SimNode[] {
	const radius = Math.min(width, height) * 0.34
	return ids.map((id, i) => ({
		id,
		x: width / 2 + radius * Math.cos((i / Math.max(1, ids.length)) * Math.PI * 2),
		y: height / 2 + radius * Math.sin((i / Math.max(1, ids.length)) * Math.PI * 2),
		vx: 0,
		vy: 0,
		pinned: false,
	}))
}

// ── Neighbourhood and paths ──────────────────────────────────────────────────

/** Everyone one edge away from `id`, `id` itself included — what focus mode keeps bright. */
export function oneHop(edges: GraphEdge[], id: string): Set<string> {
	const out = new Set([id])
	for (const e of edges) {
		if (e.aId === id) out.add(e.bId)
		else if (e.bId === id) out.add(e.aId)
	}
	return out
}

/**
 * The shortest chain of relations between two characters, or null when the web does not connect
 * them. Breadth-first, so the first route found is the shortest one.
 */
export function shortestPath(
	edges: GraphEdge[],
	fromId: string,
	toId: string,
): { nodes: string[]; edges: GraphEdge[] } | null {
	if (fromId === toId) return { nodes: [fromId], edges: [] }
	const adjacency = new Map<string, { to: string; edge: GraphEdge }[]>()
	for (const e of edges) {
		if (!adjacency.has(e.aId)) adjacency.set(e.aId, [])
		if (!adjacency.has(e.bId)) adjacency.set(e.bId, [])
		adjacency.get(e.aId)!.push({ to: e.bId, edge: e })
		adjacency.get(e.bId)!.push({ to: e.aId, edge: e })
	}

	const cameFrom = new Map<string, { prev: string; edge: GraphEdge }>()
	const seen = new Set([fromId])
	const queue = [fromId]
	while (queue.length) {
		const at = queue.shift()!
		for (const { to, edge } of adjacency.get(at) ?? []) {
			if (seen.has(to)) continue
			seen.add(to)
			cameFrom.set(to, { prev: at, edge })
			if (to === toId) {
				const nodes = [toId]
				const path: GraphEdge[] = []
				for (let cur = toId; cur !== fromId; ) {
					const step = cameFrom.get(cur)!
					path.unshift(step.edge)
					nodes.unshift(step.prev)
					cur = step.prev
				}
				return { nodes, edges: path }
			}
			queue.push(to)
		}
	}
	return null
}

/**
 * The path spelled out — "Risha is the mother of Adan, who is the wife of Toma" — with each step
 * worded from its own subject, so the genders along the chain are the ones that choose the words.
 */
export function describePath(
	path: { nodes: string[]; edges: GraphEdge[] },
	relations: Map<number, CharacterRelationship>,
	characters: Map<string, CharacterItem>,
	types: Map<string, RelationshipType>,
): string {
	if (!path.edges.length) return ''
	const nameOf = (id: string) => characters.get(id)?.Name ?? 'someone'
	const parts: string[] = []
	for (const [i, edge] of path.edges.entries()) {
		const subjectId = path.nodes[i]!
		const objectId = path.nodes[i + 1]!
		const rel = relations.get(edge.id)
		const label = rel
			? relationLabel(rel, subjectId, types.get(edge.kind), characters.get(subjectId)?.Gender ?? null)
			: edge.kind
		const lead = i === 0 ? nameOf(subjectId) : 'who'
		parts.push(`${lead} is the ${label} ${nameOf(objectId)}`)
	}
	return `${parts.join(', ')}.`
}

// ── Genogram ─────────────────────────────────────────────────────────────────

/**
 * Kinds that mean "A is the parent of B". Only these build the tree: a family tree is made of
 * descent, and a grandparent tie says nothing about the generation between them.
 */
export const PARENT_KINDS = new Set(['parent', 'step-parent'])
export const SPOUSE_KINDS = new Set(['spouse'])

export interface TreeNode {
	id: string
	x: number
	y: number
	/** 0 is the character the tree is centred on; negative is up, positive is down. */
	gen: number
}

/**
 * A couple, or a lone parent. Parents drop into it and children hang off it — without one, the
 * lines cross the moment anyone on screen has two parents, because a family tree is a DAG.
 */
export interface TreeUnion {
	key: string
	x: number
	y: number
	parentIds: string[]
	childIds: string[]
}

export interface TreeLayout {
	nodes: TreeNode[]
	unions: TreeUnion[]
	width: number
	height: number
}

export const TREE_SLOT = 150
export const TREE_ROW = 150

interface Kin {
	parentsOf: Map<string, string[]>
	childrenOf: Map<string, string[]>
	spousesOf: Map<string, string[]>
}

function collectKin(relations: CharacterRelationship[], known: Set<string>): Kin {
	const parentsOf = new Map<string, string[]>()
	const childrenOf = new Map<string, string[]>()
	const spousesOf = new Map<string, string[]>()
	const push = (map: Map<string, string[]>, key: string, value: string) => {
		const list = map.get(key)
		if (!list) map.set(key, [value])
		else if (!list.includes(value)) list.push(value)
	}

	for (const r of relations) {
		if (!known.has(r.Character1Id) || !known.has(r.Character2Id)) continue
		if (PARENT_KINDS.has(r.RelationshipType)) {
			push(parentsOf, r.Character2Id, r.Character1Id)
			push(childrenOf, r.Character1Id, r.Character2Id)
		} else if (SPOUSE_KINDS.has(r.RelationshipType)) {
			push(spousesOf, r.Character1Id, r.Character2Id)
			push(spousesOf, r.Character2Id, r.Character1Id)
		}
	}
	return { parentsOf, childrenOf, spousesOf }
}

/**
 * What generation everybody is in: 0 for anyone whose parents are not in the cast, one more for
 * each step of descent below them. Spouses are levelled to the later of the pair, so a couple who
 * married across two generations still shares a row — a chart with a husband one row above his
 * wife reads as an error whatever the family tree says.
 *
 * Longest path, not shortest: a character with a grandparent *and* a parent on screen belongs
 * under the parent. It is done as bounded relaxation rather than a topological sort because the
 * parent ties are only supposed to be a DAG — nothing stops a writer making somebody their own
 * great-grandparent, and a sort would either throw or spin on that. The rounds are capped at the
 * size of the cast, which is the longest a clean chain can be, so bad data comes out flattened
 * instead of hanging the window.
 *
 * ponytail: O(cast × ties) per round. On a cast big enough to notice, layer by topological order
 * with the cycles broken first.
 */
export function generationOf(relations: CharacterRelationship[], ids: string[]): Map<string, number> {
	const { parentsOf, spousesOf } = collectKin(relations, new Set(ids))
	const gen = new Map(ids.map(id => [id, 0]))
	// The deepest a clean chain of this many people can be. A cycle would otherwise climb every
	// round until the rounds ran out, and a row number in the thousands zooms the chart to a dot.
	const deepest = Math.max(0, ids.length - 1)
	for (let round = 0; round < ids.length; round++) {
		let moved = false
		for (const id of ids) {
			const now = gen.get(id)!
			let want = now
			for (const p of parentsOf.get(id) ?? []) want = Math.max(want, gen.get(p)! + 1)
			for (const s of spousesOf.get(id) ?? []) want = Math.max(want, gen.get(s)!)
			want = Math.min(want, deepest)
			if (want !== now) {
				gen.set(id, want)
				moved = true
			}
		}
		if (!moved) break
	}
	return gen
}

/** Nudges a row apart in place, keeping its order and its centre. */
function spreadRow(row: { x: number }[], slot: number) {
	if (row.length < 2) return
	row.sort((a, b) => a.x - b.x)
	const before = row.reduce((sum, n) => sum + n.x, 0) / row.length
	for (const [i, node] of row.entries()) {
		if (i === 0) continue
		const left = row[i - 1]!
		if (node.x - left.x < slot) node.x = left.x + slot
	}
	const after = row.reduce((sum, n) => sum + n.x, 0) / row.length
	for (const node of row) node.x -= after - before
}

/**
 * The hourglass chart: the chosen character in the middle, ancestors in the rows above,
 * descendants in the rows below, one row per generation.
 *
 * Generations being fixed rows leaves only the horizontal order to decide, and that is done the
 * genealogical way — lay the children out, then centre the parent over them.
 */
export function hourglassLayout(
	characters: CharacterItem[],
	relations: CharacterRelationship[],
	focusId: string,
): TreeLayout {
	const known = new Set(characters.map(c => c.Id))
	if (!known.has(focusId)) return { nodes: [], unions: [], width: 0, height: 0 }
	const { parentsOf, childrenOf, spousesOf } = collectKin(relations, known)

	// Generation by breadth-first hops from the focus, so the shortest route decides the row and
	// a cousin married into the family does not drag their whole line up or down with them.
	const gen = new Map<string, number>([[focusId, 0]])
	const queue = [focusId]
	while (queue.length) {
		const at = queue.shift()!
		const g = gen.get(at)!
		const visit = (id: string, next: number) => {
			if (gen.has(id)) return
			gen.set(id, next)
			queue.push(id)
		}
		for (const p of parentsOf.get(at) ?? []) visit(p, g - 1)
		for (const c of childrenOf.get(at) ?? []) visit(c, g + 1)
		for (const s of spousesOf.get(at) ?? []) visit(s, g)
	}

	// Down from the focus first: leaves take the next free slot, everyone else centres over theirs.
	const xs = new Map<string, number>()
	let cursor = 0
	const placeDown = (id: string, seen: Set<string>): number => {
		if (xs.has(id)) return xs.get(id)!
		seen.add(id)
		const kids = (childrenOf.get(id) ?? []).filter(k => !seen.has(k) && gen.get(k) === gen.get(id)! + 1)
		if (!kids.length) {
			const x = cursor
			cursor += TREE_SLOT
			xs.set(id, x)
			return x
		}
		const kidXs = kids.map(k => placeDown(k, seen))
		const x = (Math.min(...kidXs) + Math.max(...kidXs)) / 2
		xs.set(id, x)
		return x
	}
	placeDown(focusId, new Set())

	// Then up, one generation at a time: a parent sits over the children already placed below it.
	const generations = [...new Set(gen.values())].sort((a, b) => a - b)
	for (const g of generations.filter(g => g < 0).sort((a, b) => b - a)) {
		for (const [id, own] of gen) {
			if (own !== g || xs.has(id)) continue
			const below = (childrenOf.get(id) ?? []).map(c => xs.get(c)).filter((x): x is number => x !== undefined)
			xs.set(id, below.length ? below.reduce((a, b) => a + b, 0) / below.length : cursor)
			if (!below.length) cursor += TREE_SLOT
		}
	}

	// Anyone left is a spouse or an in-law with nothing of their own below: park them beside the
	// person who brought them into the tree.
	for (const id of gen.keys()) {
		if (xs.has(id)) continue
		const anchor = (spousesOf.get(id) ?? []).map(s => xs.get(s)).find(x => x !== undefined)
		xs.set(id, anchor !== undefined ? anchor + TREE_SLOT * 0.75 : cursor)
		if (anchor === undefined) cursor += TREE_SLOT
	}

	const nodes: TreeNode[] = [...gen].map(([id, g]) => ({ id, gen: g, x: xs.get(id)!, y: g * TREE_ROW }))
	for (const g of generations) spreadRow(nodes.filter(n => n.gen === g), TREE_SLOT)
	const nodeById = new Map(nodes.map(n => [n.id, n]))

	// One union per set of parents a child has in the tree, plus one for a childless couple —
	// without it a married pair with no children would draw as two unconnected people.
	const unions = new Map<string, TreeUnion>()
	const unionFor = (parentIds: string[]): TreeUnion => {
		const key = [...parentIds].sort().join('+')
		let union = unions.get(key)
		if (!union) {
			union = { key, x: 0, y: 0, parentIds: [...parentIds].sort(), childIds: [] }
			unions.set(key, union)
		}
		return union
	}
	for (const child of gen.keys()) {
		const parents = (parentsOf.get(child) ?? []).filter(p => gen.has(p))
		if (parents.length) unionFor(parents).childIds.push(child)
	}
	for (const [id, spouses] of spousesOf) {
		if (!gen.has(id)) continue
		for (const other of spouses) {
			if (!gen.has(other)) continue
			unionFor([id, other])
		}
	}

	for (const union of unions.values()) {
		const parents = union.parentIds.map(p => nodeById.get(p)).filter((n): n is TreeNode => !!n)
		if (!parents.length) continue
		union.x = parents.reduce((sum, p) => sum + p.x, 0) / parents.length
		union.y = Math.max(...parents.map(p => p.y)) + TREE_ROW * 0.42
	}

	const allX = nodes.map(n => n.x)
	const allY = nodes.map(n => n.y)
	return {
		nodes,
		unions: [...unions.values()],
		width: nodes.length ? Math.max(...allX) - Math.min(...allX) + TREE_SLOT : 0,
		height: nodes.length ? Math.max(...allY) - Math.min(...allY) + TREE_ROW : 0,
	}
}

/**
/**
 * One axis of a stage offset, kept honest: the content stays covering the viewport, so a chart
 * bigger than the window never shows blank stage where there is still chart to show. If the
 * content is smaller than the viewport on this axis there is nothing to cover, so it is centred
 * instead — the usual arrangement for something that fits.
 *
 * `lo`/`hi` are the content's extent in its own coordinates, `span` the viewport's size.
 */
export function clampPan(pos: number, lo: number, hi: number, span: number, scale: number, pad = 20): number {
	const lower = span - hi * scale - pad
	const upper = -lo * scale + pad
	if (lower > upper) return (span - (hi - lo) * scale) / 2 - lo * scale
	return Math.min(upper, Math.max(lower, pos))
}

/**
 * The ties the tree itself does not draw. It is built from descent and marriage alone, so the
 * feud, the debt and the affair between two people standing next to each other were being drawn
 * as nothing at all — the genogram's whole point is that they are on it too.
 *
 * Only pairs both of whom are on the chart: an edge to someone off it has no second end to reach.
 */
export function overlayEdges(edges: GraphEdge[], present: Set<string>): GraphEdge[] {
	return edges.filter(e =>
		!PARENT_KINDS.has(e.kind) && !SPOUSE_KINDS.has(e.kind)
		&& present.has(e.aId) && present.has(e.bId))
}

interface Point { x: number; y: number }

/** `a` and `b` pulled toward each other by `inset`, so a line stops at the discs, not under them. */
function trim(a: Point, b: Point, inset: number): [Point, Point] {
	const d = Math.hypot(b.x - a.x, b.y - a.y)
	if (!d || inset * 2 >= d) return [a, b]
	const ux = (b.x - a.x) / d
	const uy = (b.y - a.y) / d
	return [
		{ x: a.x + ux * inset, y: a.y + uy * inset },
		{ x: b.x - ux * inset, y: b.y - uy * inset },
	]
}

/**
 * Three points for a bowed tie: the two ends and a midpoint pushed out at right angles. Draw it
 * with a Konva tension and it reads as a curve, which is the point — the kinship lines are
 * orthogonal elbows, so anything that cuts across in a curve is visibly a different statement.
 */
export function bowPoints(a: Point, b: Point, inset = 0, bow = 22): number[] {
	const [p, q] = trim(a, b, inset)
	const dx = q.x - p.x
	const dy = q.y - p.y
	const d = Math.hypot(dx, dy) || 1
	return [
		p.x, p.y,
		(p.x + q.x) / 2 - (dy / d) * bow, (p.y + q.y) / 2 + (dx / d) * bow,
		q.x, q.y,
	]
}

/**
 * The genogram's jagged line, for a hostile tie: a sawtooth from one node to the other. It is the
 * one line style in the convention that carries its meaning without a legend, which is why
 * hostility gets it and every other category gets a plain bow.
 */
export function jaggedPoints(a: Point, b: Point, inset = 0, teeth = 9, amp = 5): number[] {
	const [p, q] = trim(a, b, inset)
	const dx = q.x - p.x
	const dy = q.y - p.y
	const d = Math.hypot(dx, dy) || 1
	const steps = Math.max(2, teeth)
	const out: number[] = []
	for (let i = 0; i <= steps; i++) {
		const t = i / steps
		// Zero at both ends so the teeth do not knock the line off the discs it joins.
		const side = i === 0 || i === steps ? 0 : (i % 2 ? amp : -amp)
		out.push(p.x + dx * t - (dy / d) * side, p.y + dy * t + (dx / d) * side)
	}
	return out
}

/** Everyone the web has nothing to say about — the sidebar's whole point. */
export function unconnected(characters: CharacterItem[], relations: CharacterRelationship[]): CharacterItem[] {
	const tied = new Set<string>()
	for (const r of relations) {
		tied.add(r.Character1Id)
		tied.add(r.Character2Id)
	}
	return characters.filter(c => !tied.has(c.Id))
}

/**
 * BL-16: the shape a journey takes on the map. A straight line between two pins says the two places
 * are related; it does not say anybody travelled. A leg that bows says a road — and two people on the
 * same road bowing opposite ways are two people, rather than one line drawn twice.
 *
 * Only geometry lives here. What colour, how faint and how thick is the style table in `MapApp`, and
 * the Konva nodes are its business — this is the arithmetic that wants a test.
 */

export interface Pt {
  x: number
  y: number
}

/**
 * Which way, and how far, one character leans off the straight line. Stable per character: the same
 * person bows the same way on every redraw, so a map does not reshuffle itself when the scrubber moves.
 *
 * Hashed from the id rather than taken from their position in the list, because the list changes every
 * time somebody is unticked and every path on the map would flip sides at once.
 */
export function leanOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  // Kept away from zero on purpose: a lean of nearly nothing is a straight line, which is the look
  // this exists to get away from.
  const size = 0.45 + ((Math.abs(h) % 997) / 997) * 0.55
  return h % 2 === 0 ? -size : size
}

/**
 * One leg as a bowed curve, sampled into `steps` segments. A lean of zero is a straight line and is
 * returned as its two ends, because sampling a straight line eleven times is ten wasted points.
 */
export function arc(a: Pt, b: Pt, lean: number, steps: number): Pt[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (lean === 0 || steps < 2 || (dx === 0 && dy === 0)) return [a, b]

  // The control point sits off the middle of the leg at right angles to it, by a share of the leg's
  // own length — so a long road bends as much as it is long and a short hop stays a short hop.
  const cx = (a.x + b.x) / 2 - (dy * lean) / 2
  const cy = (a.y + b.y) / 2 + (dx * lean) / 2

  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
    })
  }
  return out
}

/**
 * How far out from a shared point a crowd is fanned, in screen pixels. It grows with the count so
 * everyone keeps `gap` of elbow room: ten people fanned on a ring built for two is ten names on top of
 * each other, which is the pile the fan exists to undo.
 */
export function fanRadius(count: number, gap: number, min: number): number {
  if (count < 2) return 0
  return Math.max(min, (count * gap) / (2 * Math.PI))
}

/**
 * One person's walk from one point to the next. `key` names the road *and when it was walked*: two
 * people with the same key left the same place at the same moment and arrived together, which is what
 * travelling together means in a story told in events.
 */
export interface LegIn {
  key: string
  id: string
  colour: string
  alpha: number
  a: Pt
  b: Pt
}

/** Everyone of one colour on a road: one strand of the cable, as thick as its headcount. */
export interface Strand {
  colour: string
  ids: string[]
}

/** One road walked once by a party, however many are in it. Strands in a stable order. */
export interface Road {
  key: string
  a: Pt
  b: Pt
  alpha: number
  strands: Strand[]
}

/**
 * Legs walked together, fused: four people meeting and leaving as one party are four thin lines in and
 * one thick line out. Within a road, one strand per colour — a family and a faction on the same march
 * stay two strands side by side instead of one line in whichever colour was drawn last.
 */
export function bundleLegs(legs: LegIn[]): Road[] {
  const roads = new Map<string, Road>()
  for (const leg of legs) {
    let road = roads.get(leg.key)
    if (!road) {
      road = { key: leg.key, a: leg.a, b: leg.b, alpha: 0, strands: [] }
      roads.set(leg.key, road)
    }
    road.alpha = Math.max(road.alpha, leg.alpha)
    const strand = road.strands.find(s => s.colour === leg.colour)
    if (strand) strand.ids.push(leg.id)
    else road.strands.push({ colour: leg.colour, ids: [leg.id] })
  }
  // Sorted, so the strands do not swap sides as the scrubber moves and people join in a new order.
  for (const road of roads.values()) road.strands.sort((x, y) => (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0))
  return [...roads.values()]
}

/**
 * How much thicker a line is for `count` people than for one. Grows by more than half a line each, so
 * two is plainly not one, and stops at four lines' worth — past that a party is "a lot of people" and a
 * road as wide as a river would bury the map under it.
 */
export function strandWeight(count: number): number {
  return Math.min(4, 1 + 0.6 * (Math.max(1, count) - 1))
}

/**
 * Where each strand's centre sits across the cable, strands `gap` apart, the whole cable centred on the
 * road. In whatever unit the widths are in.
 */
export function strandOffsets(widths: number[], gap: number): number[] {
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.length - 1)
  let at = -total / 2
  return widths.map(w => {
    const mid = at + w / 2
    at += w + gap
    return mid
  })
}

/** A leg moved `by` to its left, both ends at once: one strand of a cable, beside the others. */
export function sideways(a: Pt, b: Pt, by: number): [Pt, Pt] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (!len || !by) return [a, b]
  const nx = (-dy / len) * by
  const ny = (dx / len) * by
  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }]
}

/**
 * The ring drawn where somebody stayed put, as a radius in screen pixels. By the root of the time, so
 * it is the ring's *area* that tracks how long they were there — a stay of a tenth the length still
 * shows, where a straight radius would leave it a dot.
 *
 * Zero for a stop of no length, which is most of them: an event that happens at one moment is somewhere
 * a character passed through, not somewhere they lived.
 */
export function dwellRadius(held: number, reach: number, max: number): number {
  if (!(held > 0) || !(reach > 0)) return 0
  return Math.min(max, Math.sqrt(held / reach) * max)
}

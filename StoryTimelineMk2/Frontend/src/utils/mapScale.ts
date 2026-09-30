/**
 * BL-16: how far apart two things on a map are, and how to draw a bar that says so.
 *
 * A map's scale is the bar the writer set: `ScaleLength` units span `ScaleFraction` of the image's
 * width. Everything here turns that into either a length on screen or a distance in the writer's own
 * units — nothing guesses a scale, and a map nobody has calibrated simply reports the standard 10
 * miles it was created with.
 */
import type { MapItem } from '@/types/models'
import { commonMap, parentMapIds, pinStandingFor } from './mapTree'

/** Fall back to the creation defaults rather than dividing by a zero a bad import could carry in. */
const fraction = (map: MapItem) =>
	map.ScaleFraction > 0 && Number.isFinite(map.ScaleFraction) ? map.ScaleFraction : 0.2

/**
 * How many of the map's units one pixel of the image is worth. Image pixels, not screen ones, so
 * zooming cannot change the answer — and both axes share it, which is what a map's scale means.
 */
export function unitsPerBasePx(map: MapItem, baseWidth: number): number {
	if (!(baseWidth > 0)) return 0
	return map.ScaleLength / (fraction(map) * baseWidth)
}

/**
 * How much ground the whole map covers, in its own units — the bar's length divided by the share of
 * the width it spans. What one map has to be compared against another with.
 */
export const unitsAcross = (map: MapItem) => map.ScaleLength / fraction(map)

/** The distance between two points on the image, in the map's units. */
export function distanceInUnits(
	map: MapItem,
	baseWidth: number,
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	return Math.hypot(b.x - a.x, b.y - a.y) * unitsPerBasePx(map, baseWidth)
}

/**
 * How far apart two places are, on the deepest map that holds both: two inns of one city on the city,
 * two cities on the world, door to door. Null when no map holds both, or its picture's size is unknown.
 *
 * ponytail: a straight line between the pins, the way the measuring ruler reads it; roads that wind
 * would need a drawn road to follow.
 */
export function placeDistance(
	maps: MapItem[],
	a: string,
	b: string,
	parents = parentMapIds(maps),
): { units: number; unit: string } | null {
	const homeA = maps.find(m => m.Locations.some(l => l.Id === a))
	const homeB = maps.find(m => m.Locations.some(l => l.Id === b))
	const onId = homeA && homeB ? commonMap(parents, [homeA.Id, homeB.Id]) : null
	const on = maps.find(m => m.Id === onId)
	const w = on?.PictureWidth
	const h = on?.PictureHeight
	if (!on || !w || !h) return null
	const pa = pinStandingFor(maps, a, on.Id, parents)
	const pb = pinStandingFor(maps, b, on.Id, parents)
	if (!pa || !pb) return null
	return { units: distanceInUnits(on, w, { x: pa.X * w, y: pa.Y * h }, { x: pb.X * w, y: pb.Y * h }), unit: on.ScaleUnit }
}

/**
 * A bar the writer's scale times this reads as a round number — 1, 2 or 5 of some power of ten, the
 * ladder every paper map uses. `px` is how wide one whole `ScaleLength` is on screen right now, so
 * zooming in walks the bar down the ladder (10 miles → 5 → 2) instead of letting it run off the edge.
 */
export function niceScaleMultiplier(px: number, target = 140): number {
	if (!(px > 0) || !Number.isFinite(px)) return 1
	const ideal = target / px
	const power = 10 ** Math.floor(Math.log10(ideal))
	const rest = ideal / power // 1..10
	return (rest >= 5 ? 5 : rest >= 2 ? 2 : 1) * power
}

/**
 * Shift, while the second end of a measurement is being aimed: a straight line instead of whatever
 * angle the hand managed. The axis the pointer has travelled further along is the one it keeps, which
 * is how every drawing program behaves and so needs no explaining.
 */
export function lockAxis(
	from: { x: number; y: number },
	to: { x: number; y: number },
	lock: boolean,
): { x: number; y: number } {
	if (!lock) return to
	return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
		? { x: to.x, y: from.y }
		: { x: from.x, y: to.y }
}

/** A distance as a writer wants to read it: no trailing noise, thousands grouped. */
export function formatDistance(units: number): string {
	if (!Number.isFinite(units)) return '—'
	return Number(units.toPrecision(3)).toLocaleString()
}

/**
 * The scale bar as drawn: how wide, and what it says. `zoom` is the stage's scale, `baseWidth` the
 * image's own width in pixels.
 */
export function scaleBar(map: MapItem, baseWidth: number, zoom: number) {
	const wholePx = fraction(map) * baseWidth * zoom
	const mult = niceScaleMultiplier(wholePx)
	return {
		px: wholePx * mult,
		label: `${formatDistance(map.ScaleLength * mult)} ${map.ScaleUnit}`,
	}
}

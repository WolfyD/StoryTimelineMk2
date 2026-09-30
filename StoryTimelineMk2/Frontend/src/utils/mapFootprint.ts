/**
 * BL-16: the patch of a parent map that a child map depicts — the rectangle the child grows out of
 * when the view descends into it, and the only thing a writer has to set for that descent to mean
 * something.
 *
 * It is one number on the pin (`FootprintW`, a fraction of the parent's width) because the height
 * follows the child's own aspect. A rectangle with one degree of freedom cannot be drawn wrong, and
 * the child's picture can never come out stretched.
 *
 * It also holds the view maths the map window flies by, and since the view can be *turned*, every one
 * of those is written as "a point of the map, put under a point of the screen" — `anchoredAt`. The
 * angle only ever enters as a turn of that offset, which is why one small function carries all of it.
 *
 * ponytail: the geometry lives here and the corner handle that drags it lives in `MapApp`, so
 * replacing that handle with a draw-a-rectangle tool means rewriting one function and none of this.
 * Footprints themselves stay axis-aligned to their parent — a child map depicts a patch of ground, not
 * a patch at an angle — and turning the view turns the footprint with the ground, as it should.
 */
import type { LocationItem, MapItem } from '@/types/models'
import { unitsAcross } from './mapScale'

/** What a footprint falls back to when the two maps cannot be compared: a modest patch of ground. */
export const FALLBACK_FOOTPRINT_W = 0.12

/** The narrowest and widest a footprint may be, as a share of the parent's width. */
const MIN_W = 0.002

export interface Rect { x: number; y: number; w: number; h: number }

/** The child's height per unit of its width. Square while it has no picture to have a shape. */
export const childAspect = (child: MapItem) =>
	child.PictureWidth && child.PictureHeight ? child.PictureHeight / child.PictureWidth : 1

/**
 * Both maps already say how much ground they cover, so the honest default is the ratio between them:
 * a 5-mile city on a 400-mile world takes up 1.25% of it, and the writer starts from the truth rather
 * than from a guess they have to correct. Nothing here converts units, so two maps measured in
 * different ones fall back to a patch that merely looks sensible.
 */
export function defaultFootprintW(parent: MapItem, child: MapItem): number {
	const same = (parent.ScaleUnit ?? '').trim().toLowerCase() === (child.ScaleUnit ?? '').trim().toLowerCase()
	if (same) {
		const f = unitsAcross(child) / unitsAcross(parent)
		if (f > MIN_W && f <= 1) return f
	}
	return FALLBACK_FOOTPRINT_W
}

/** The pin's own footprint, or the default for one nobody has dragged yet. Never outside 0..1. */
export function footprintW(pin: LocationItem, parent: MapItem, child: MapItem): number {
	const w = pin.FootprintW ?? defaultFootprintW(parent, child)
	return Math.min(1, Math.max(MIN_W, w))
}

/** The footprint in the parent's own image pixels, centred on the pin. */
export function footprintRect(
	pin: LocationItem,
	parent: MapItem,
	child: MapItem,
	baseW: number,
	baseH: number,
): Rect {
	const w = footprintW(pin, parent, child) * baseW
	const h = w * childAspect(child)
	return { x: pin.X * baseW - w / 2, y: pin.Y * baseH - h / 2, w, h }
}

/** Where a stage is: the scale it draws its map at and where the top-left corner of that map sits. */
export interface View {
	scale: number
	x: number
	y: number
	/**
	 * Degrees the map is turned on screen, clockwise. Missing means straight, which is what every view
	 * was before the map could be turned at all.
	 */
	rot?: number
}

/**
 * A vector turned clockwise by `deg`. Konva's transform is `translate(pos) · rotate · scale`, so a map
 * point lands at `pos + turned(point × scale)` — every view below is that one sentence rearranged.
 */
export function turnedBy(x: number, y: number, deg: number): { x: number; y: number } {
	if (!deg) return { x, y }
	const r = (deg * Math.PI) / 180
	const c = Math.cos(r)
	const s = Math.sin(r)
	return { x: x * c - y * s, y: x * s + y * c }
}

/**
 * How much room a map of `w`×`h` takes once it is turned: its own bounding box, which is wider and
 * taller than the map at every angle but a right one. Fitting without this crops the corners off a
 * turned map, which is exactly the frame a reader pressed *Fit* to stop having.
 */
export function turnedExtent(w: number, h: number, deg: number): { w: number; h: number } {
	const r = (deg * Math.PI) / 180
	const c = Math.abs(Math.cos(r))
	const s = Math.abs(Math.sin(r))
	return { w: w * c + h * s, h: w * s + h * c }
}

/**
 * The view that puts one point of the map under one point of the screen at `scale` — the primitive the
 * other two are: centring is anchoring to the middle, and zooming about the pointer is anchoring to it.
 */
export function anchoredAt(
	x: number,
	y: number,
	at: { x: number; y: number },
	scale: number,
	rot = 0,
): View {
	const off = turnedBy(x * scale, y * scale, rot)
	return { scale, rot, x: at.x - off.x, y: at.y - off.y }
}

/**
 * The same sight, from the map above. Given how the child map is being looked at, this is where the
 * parent's stage has to be for the child's footprint to show exactly that — because the footprint is
 * the child, drawn small.
 *
 * It is the hinge both ways: the descent flies *to* it, so it ends on the frame the child's own screen
 * opens with, and the ascent starts *from* it, so coming out begins on the frame the child's screen was
 * left on. Neither has a jump to hide.
 */
export function throughFootprint(rect: Rect, childW: number, child: View): View {
	const scale = (child.scale * childW) / rect.w
	// The parent is turned the same way the child was being looked at — a descent that straightened the
	// map mid-flight would be the one jump this whole function exists to avoid.
	return anchoredAt(rect.x, rect.y, child, scale, child.rot ?? 0)
}

/** The point of the map a view has in the middle of the screen, in the map's own pixels. */
const screenCentre = (v: View, stageW: number, stageH: number) => {
	const back = turnedBy(stageW / 2 - v.x, stageH / 2 - v.y, -(v.rot ?? 0))
	return { x: back.x / v.scale, y: back.y / v.scale }
}

/** The other way round: the view that puts a point of the map in the middle of the screen at `scale`. */
export const centredOn = (
	x: number,
	y: number,
	scale: number,
	stageW: number,
	stageH: number,
	rot = 0,
): View => anchoredAt(x, y, { x: stageW / 2, y: stageH / 2 }, scale, rot)

/**
 * The scale at which a rectangle of the map is wholly on screen — what a shift-dragged box zooms to.
 * It *fits* rather than fills, so nothing the reader deliberately boxed in is cropped back out of the
 * view they asked for. Pair it with `centredOn` and the box's own middle; a caller that clamps this to
 * its zoom limits has to, because the position depends on the scale that is actually used.
 */
export const fitRectScale = (rect: Rect, stageW: number, stageH: number) =>
	Math.min(stageW / rect.w, stageH / rect.h)

/**
 * The long edge, in pixels, of the sharpest copy the canvas ever gets to draw. It is
 * `MapViews.DetailCap` in the data layer, repeated here because the scale below has to know where the
 * picture runs out and the bridge sends paths rather than sizes. If that cap moves, this moves.
 */
export const DETAIL_CAP = 4096

/**
 * How close "show me this place" goes, given the scale the whole map fits at and the map's own long
 * edge in pixels.
 *
 * Ten times into the map, so the arrival is over the place and not over the quarter of the world it
 * sits in. But that is a ratio and sharpness is not: a 2400px picture hits ten times its fit at 4.5×,
 * where it is a blur with a pin in it, while a 8400px one is still short of its own pixels. So the
 * stretch over the sharpest copy is capped at 2× — the point the biggest maps in use were already
 * landing at and reading cleanly. Never further out than the whole map either, which a picture smaller
 * than the window is already magnified to reach.
 */
export const closeScaleFor = (fit: number, longEdge: number) =>
	Math.max(fit, Math.min(Math.min(1, DETAIL_CAP / longEdge) * 2, fit * 10))

/**
 * One frame of a flight between two views, `t` running 0 to 1.
 *
 * The scale moves **geometrically**, because the eye reads zoom as a ratio and not as a number: a
 * straight tween from 10× out to 1× is already most of the way out in its first instant and then
 * crawls, which is why it reads as a snap followed by nothing — and the same tween inwards crawls and
 * then lunges. Halfway through this one is the square root, which is halfway as anyone sees it.
 *
 * The point in the middle of the screen travels in a straight line across the map, so a flight that
 * pans as well as zooms does both at once instead of arcing.
 *
 * ponytail: linear pan of the focal point, which is honest for the hop-per-level flights here. Van
 * Wijk's smooth zoom-and-pan is the upgrade if a single flight ever crosses a whole world sideways.
 */
export function betweenViews(from: View, to: View, t: number, stageW: number, stageH: number): View {
	const scale = from.scale * Math.pow(to.scale / from.scale, t)
	const a = screenCentre(from, stageW, stageH)
	const b = screenCentre(to, stageW, stageH)
	// The angle is the one thing that moves plainly: turning is turning, and a flight between two views
	// at the same angle — which every flight between maps is — leaves it alone entirely.
	const rot = (from.rot ?? 0) + ((to.rot ?? 0) - (from.rot ?? 0)) * t
	return centredOn(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, scale, stageW, stageH, rot)
}

/**
 * Where the stage has to end up for that rectangle to land exactly where the child's own fit view puts
 * the whole child map — the child seen through its footprint, at the moment it fills the screen.
 *
 * `childFit` is the scale the child is drawn at once it is the map on screen — passed in rather than
 * worked out again here, so there is one definition of what "fits" means.
 */
export function descentTransform(
	rect: Rect,
	childW: number,
	childH: number,
	childFit: number,
	stageW: number,
	stageH: number,
	rot = 0,
): View {
	return throughFootprint(rect, childW, centredOn(childW / 2, childH / 2, childFit, stageW, stageH, rot))
}

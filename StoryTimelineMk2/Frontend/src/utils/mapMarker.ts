/**
 * BL-16: a resolved marker style, drawn. `markerStyle.ts` decides what a pin looks like; this turns
 * that into Konva nodes, and the shape table below is also what the editor draws its previews from.
 *
 * Every shape is designed in a 24-unit box with its *anchor* at the origin — the point that sits on
 * the place itself. A dot is anchored at its middle and a teardrop at its tip, which is why the label
 * cannot simply be offset by a fixed amount: it is placed off `markerBox`, the shape's real extent.
 *
 * The pin group is inverse-scaled by the map screen so markers hold a fixed size on screen, so
 * everything here is in screen pixels and no node needs to know the zoom.
 */
import Konva from 'konva'
import { iconPath } from './markerIcons'
import type { LabelSide, MarkerShape, MarkerStyle } from './markerStyle'

/** The side of the box every shape is drawn in. `size` is the marker's height in screen pixels. */
const DESIGN = 24

/** Gap between the marker and its name, in screen pixels. */
const LABEL_GAP = 4

export interface Box { x: number; y: number; w: number; h: number }

export interface ShapeDef {
	/** Outline as SVG path data in design units, or null for the shapes that are a plain circle. */
	path: string | null
	/** How far the shape reaches around its anchor, in design units. */
	box: Box
	/** Where an icon sits, for the shapes that hold one. */
	well?: { x: number; y: number; r: number }
}

/** The map-marker balloon: a round head on a point. `teardrop` is solid, `badge` holds an icon. */
const BALLOON = 'M0 0 C-3.5 -5.5 -7.5 -10.5 -7.5 -14.5 A7.5 7.5 0 1 1 7.5 -14.5 C7.5 -10.5 3.5 -5.5 0 0 Z'
/** A thumb tack's needle. Its head is a circle, added separately so the path stays straight lines. */
const NEEDLE = 'M0 0 L-2 -13 L2 -13 Z'
const TACK_HEAD = { y: -16, r: 6 }
/** A pole with a pennant to its right, one path: the two parts never overlap. */
const FLAG = 'M-1 0 L-1 -22 L1 -22 L1 0 Z M1 -21 L11 -16.5 L1 -12 Z'

export const MARKER_SHAPE_DEFS: Record<MarkerShape, ShapeDef> = {
	dot:      { path: null,    box: { x: -12,   y: -12, w: 24, h: 24 } },
	ring:     { path: null,    box: { x: -12,   y: -12, w: 24, h: 24 }, well: { x: 0, y: 0, r: 7 } },
	teardrop: { path: BALLOON, box: { x: -7.5,  y: -24, w: 15, h: 24 } },
	badge:    { path: BALLOON, box: { x: -7.5,  y: -24, w: 15, h: 24 }, well: { x: 0, y: -14.5, r: 5.8 } },
	tack:     { path: NEEDLE,  box: { x: -6,    y: -22, w: 12, h: 22 } },
	flag:     { path: FLAG,    box: { x: -1,    y: -22, w: 12, h: 22 } },
}

/** What a writer sees in the shape picker, in the order they see it. */
export const SHAPE_LABELS: Record<MarkerShape, string> = {
	dot: 'Dot', ring: 'Ring', teardrop: 'Teardrop', badge: 'Icon badge', tack: 'Tack', flag: 'Flag',
}

/**
 * The marker's real extent in screen pixels, anchor at the origin — including the dashed ring a door
 * wears, so a name never lands on top of it.
 */
export function markerBox(style: MarkerStyle, isDoor = false): Box {
	const k = style.size / DESIGN
	const d = MARKER_SHAPE_DEFS[style.shape].box
	const box = { x: d.x * k, y: d.y * k, w: d.w * k, h: d.h * k }
	if (!isDoor) return box
	const r = doorRadius(box)
	return { x: -r, y: box.y + box.h / 2 - r, w: r * 2, h: r * 2 }
}

/** The dashed ring goes round the whole shape with a little air, centred on the shape's middle. */
const doorRadius = (box: Box) => Math.max(box.w, box.h) / 2 + 5

/**
 * Where the middle of the name goes. Rotation turns about that middle whichever side it is on, so a
 * writer angling a label along a coast gets the same behaviour from all four placements.
 */
export function labelCentre(side: LabelSide, box: Box, w: number, h: number, gap = LABEL_GAP) {
	const cx = box.x + box.w / 2
	const cy = box.y + box.h / 2
	switch (side) {
		case 'left':  return { x: box.x - gap - w / 2, y: cy }
		case 'above': return { x: cx, y: box.y - gap - h / 2 }
		case 'below': return { x: cx, y: box.y + box.h + gap + h / 2 }
		default:      return { x: box.x + box.w + gap + w / 2, y: cy }
	}
}

/** A label the writer drew a line for, rather than one hung off the marker's side. */
export const labelDesigned = (style: MarkerStyle) => style.labelW > 0

/** How far above its line the name sits, in screen pixels. */
export const LABEL_LIFT = 3

/**
 * The name of the group a map-scaled label is wrapped in. Its pin is held at a fixed size on screen,
 * so the wrapper is where that gets handed back — `scalePins` in `MapApp` is the one place that knows
 * the current zoom, and this is how it finds the labels that asked to live on the map.
 */
export const MAP_LABEL = 'map-label'

/**
 * The font size at which one line of text spans a drawn line: exactly as long as it, no taller. `perPx`
 * is the text's width at one pixel of font size, which is the one thing only the text engine can say —
 * and text width is linear in font size, so it is measured once and divided into.
 */
export function fitFontSize(len: number, perPx: number): number {
	if (!(len > 0) || !(perPx > 0)) return MIN_FIT
	return Math.min(MAX_FIT, Math.max(MIN_FIT, len / perPx))
}

/** Smaller than this is not a label any more, and larger than this is not a name but a banner. */
const MIN_FIT = 5
const MAX_FIT = 400

/** Shorter than this is not a line anyone meant to draw. */
const MIN_LABEL_LINE = 12

/**
 * Two dragged ends, as the style stores a label's line: the middle, the length, and a tilt that never
 * reads upside down — the line has no direction, so turning it the other way round costs nothing and
 * means the name is never on its head after a drag that happened to go right to left.
 */
export function labelLineFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
	const len = Math.max(MIN_LABEL_LINE, Math.hypot(b.x - a.x, b.y - a.y))
	let angle = straighten((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
	if (angle > 90 || angle < -90) angle = straighten(angle + 180)
	return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, len, angle }
}

/** Degrees, in the −180..180 a marker style stores. */
const straighten = (deg: number) => ((deg + 180) % 360 + 360) % 360 - 180

/**
 * The line the label designer opens with: the one already drawn, or — the first time — one under the
 * name exactly where it sits now, so the writer starts by nudging rather than by hunting.
 */
export function labelStartLine(style: MarkerStyle, name: string, isDoor = false) {
	if (labelDesigned(style)) {
		return { dx: style.labelDx, dy: style.labelDy, len: style.labelW, angle: style.labelAngle }
	}
	const probe = new Konva.Text({
		text: name || 'Name',
		fontSize: style.labelSize, fontFamily: style.labelFont, fontStyle: '600',
	})
	const w = probe.width()
	const h = probe.height()
	const side = style.labelSide === 'none' ? 'right' : style.labelSide
	const at = labelCentre(side, markerBox(style, isDoor), w, h)
	// The stored point is the line's middle and the name stands on it, so the line starts below the
	// name's middle — turned with it, or an angled label would jump the moment it was picked up.
	const rad = (style.labelAngle * Math.PI) / 180
	const d = h / 2 + LABEL_LIFT
	return { dx: at.x - d * Math.sin(rad), dy: at.y + d * Math.cos(rad), len: w, angle: style.labelAngle }
}

/**
 * The nodes for one marker, in draw order, to be added to a pin's group. `name` is drawn unless the
 * style says nowhere; `isDoor` adds the dashed ring that says there is another map behind this place.
 */
export function buildMarker(
	style: MarkerStyle, name: string, isDoor = false,
): (Konva.Shape | Konva.Group)[] {
	const def = MARKER_SHAPE_DEFS[style.shape]
	const k = style.size / DESIGN
	const colour = style.fill ?? '#6366f1'
	const plate = style.stroke ?? '#0f172a'
	// Stroke width is in screen pixels whatever the shape is scaled by, and 0 means no outline at all
	// rather than a hairline — a canvas line width of zero is an accident waiting to look like one.
	const outline = style.strokeWidth > 0
		? { stroke: plate, strokeWidth: style.strokeWidth, strokeScaleEnabled: false }
		: {}
	const nodes: (Konva.Shape | Konva.Group)[] = []
	const shapeBox = markerBox(style)

	if (isDoor) {
		nodes.push(new Konva.Circle({
			y: shapeBox.y + shapeBox.h / 2,
			radius: doorRadius(shapeBox),
			stroke: colour, strokeWidth: 1.5, strokeScaleEnabled: false,
			dash: [3, 3], listening: false,
		}))
	}

	if (style.shape === 'dot') {
		nodes.push(new Konva.Circle({ radius: style.size / 2, fill: colour, ...outline }))
	} else if (style.shape === 'ring') {
		// The band *is* the shape, so it is drawn however thin the outline setting says, but never
		// away entirely. The middle takes the outline colour, which is what the icon sits on.
		nodes.push(new Konva.Circle({
			radius: style.size / 2, fill: plate,
			stroke: colour, strokeWidth: Math.max(1.5, style.strokeWidth), strokeScaleEnabled: false,
		}))
	} else {
		nodes.push(new Konva.Path({
			data: def.path!, scaleX: k, scaleY: k, fill: colour, ...outline,
		}))
		if (style.shape === 'tack') {
			nodes.push(new Konva.Circle({
				y: TACK_HEAD.y * k, radius: TACK_HEAD.r * k, fill: colour, ...outline,
			}))
		}
	}

	const glyph = def.well ? iconPath(style.icon) : null
	if (def.well && glyph) {
		// A badge's glyph sits on the coloured balloon, so it takes the outline colour; a ring's sits
		// in the dark middle, so it takes the marker's. Either way it is the one that can be read.
		const s = (def.well.r * 1.7 * k) / 256
		nodes.push(new Konva.Path({
			data: glyph,
			x: def.well.x * k - 128 * s,
			y: def.well.y * k - 128 * s,
			scaleX: s, scaleY: s,
			fill: style.shape === 'ring' ? colour : plate,
			listening: false,
		}))
	}

	const designed = labelDesigned(style)
	if ((style.labelSide !== 'none' || designed) && name) {
		const text = new Konva.Text({
			text: name,
			fontSize: style.labelSize,
			fontFamily: style.labelFont,
			fontStyle: '600',
			fill: style.labelColor ?? '#e2e8f0',
			listening: false,
		})
		// A drawn line says how big the name is: as large as spans it. Text width is linear in font
		// size, so the fit is one division — no search, no measuring twice.
		if (designed) text.fontSize(fitFontSize(style.labelW, text.width() / style.labelSize))
		const w = text.width()
		const h = text.height()
		const at = designed
			? { x: style.labelDx, y: style.labelDy }
			: labelCentre(style.labelSide, markerBox(style, isDoor), w, h)
		// A designed name stands on its line, so it is offset up off the stored point rather than
		// centred on it; either way the rotation turns about that point.
		const lift = designed ? h + LABEL_LIFT : h / 2
		text.position(at)
		text.offset({ x: w / 2, y: lift })
		text.rotation(style.labelAngle)
		if (style.labelOutline) {
			// Around the letters, under the fill — black in a white edge reads on any map. Unset, the
			// width follows the text size, so a 40px name is not outlined like a 10px one.
			text.stroke(style.labelOutline)
			text.strokeWidth(style.labelOutlineWidth > 0
				? style.labelOutlineWidth
				: Math.max(1, text.fontSize() / 7))
			text.fillAfterStrokeEnabled(true)
			// A name pinned to the glass keeps the edge width it was given; one that grows with the
			// ground takes its edge along, or a name spanning a valley is drawn in a hairline.
			text.strokeScaleEnabled(style.labelScales)
		}
		const label: Konva.Shape[] = []
		if (style.labelPlate) {
			label.push(new Konva.Rect({
				x: at.x, y: at.y, width: w + 8, height: h + 4,
				offsetX: w / 2 + 4, offsetY: lift + 2,
				rotation: style.labelAngle, cornerRadius: 3,
				fill: '#0f172ac9', listening: false,
			}))
		} else if (!style.labelOutline) {
			// No card and no outline, so the name needs something of its own to survive a pale map.
			text.shadowColor('#0f172a')
			text.shadowBlur(4)
		}
		label.push(text)
		// A name that belongs to the ground goes in a group `scalePins` hands the zoom back to: the pin's
		// own group is held at 1/zoom, so a wrapper at the zoom nets out to map space — which scales the
		// name's offset from the pin as well as its size. The marker itself stays the size it was.
		if (style.labelScales) {
			nodes.push(new Konva.Group({ name: MAP_LABEL, listening: false }).add(...label))
		} else {
			nodes.push(...label)
		}
	}

	return nodes
}

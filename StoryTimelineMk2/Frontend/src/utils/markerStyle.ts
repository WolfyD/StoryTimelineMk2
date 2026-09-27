/**
 * BL-16: what a place looks like on a map. The map holds the look its places default to and a pin
 * holds only what it differs in, so "every place here is a small grey dot except the capital" is two
 * edits and not forty.
 *
 * Both are stored as JSON — `maps.marker_style` and `locations.marker_style` — because a pin's
 * override needs to be able to say *inherit this one*, and a missing key says that where a null
 * column could not be told apart from a deliberate blank.
 *
 * Nothing here draws: `mapMarker.ts` turns a resolved style into Konva nodes and the panel edits one.
 * ponytail: the drawing and the editing both go through `resolveMarker`, so a new field is added in
 * three places — the type, the defaults, and whatever draws it.
 */
import type { LocationItem, MapItem } from '@/types/models'

/** The built-in shapes. A writer picks one; the SVG for each lives in `mapMarker.ts`. */
export const MARKER_SHAPES = ['dot', 'ring', 'teardrop', 'badge', 'tack', 'flag'] as const
export type MarkerShape = (typeof MARKER_SHAPES)[number]

/** The shapes with a hollow to put an icon in. The others ignore `icon` entirely. */
export const ICON_SHAPES: ReadonlySet<MarkerShape> = new Set<MarkerShape>(['badge', 'ring'])

/** Where the name sits relative to the marker. */
export const LABEL_SIDES = ['right', 'left', 'above', 'below', 'none'] as const
export type LabelSide = (typeof LABEL_SIDES)[number]

/**
 * A whole marker look. Every field is set — this is what the drawing code is handed, never a partial.
 * Colours are CSS strings or null for "use the pin's own colour", which is the one field a place has
 * carried since before any of this.
 */
export interface MarkerStyle {
	shape: MarkerShape
	/** Height of the marker in screen pixels, unaffected by zoom. */
	size: number
	/** A Phosphor icon name for the shapes that hold one, e.g. `PhCastleTurret`. */
	icon: string | null
	/** Null means the place's own colour, which is what a writer set first and expects to win. */
	fill: string | null
	stroke: string | null
	/** 0 turns the outline off, which is what the tick box writes. */
	strokeWidth: number
	labelSide: LabelSide
	/** Degrees clockwise. 0 is level, and a name can follow a coast or a road at anything else. */
	labelAngle: number
	labelSize: number
	labelFont: string
	labelColor: string | null
	/** An edge around the letters themselves — black text in a white outline reads on any map. */
	labelOutline: string | null
	/** How thick that edge is, in screen pixels. 0 follows the text size, which suits most names. */
	labelOutlineWidth: number
	/** A dark card behind the name, for a light map that swallows pale text. */
	labelPlate: boolean
	/**
	 * A name placed by hand, on the map itself: the line the writer drew for it, in screen pixels.
	 * `labelDx`/`labelDy` are its middle, offset from the pin; `labelW` is its length and `labelAngle`
	 * its tilt. `labelW > 0` is the whole of the flag — a name with a line of its own sits on that line
	 * and is set as large as its length allows, so `labelSide` and `labelSize` no longer decide anything.
	 */
	labelDx: number
	labelDy: number
	labelW: number
}

/** What a place looks like when nobody has said otherwise: the dot the map screen has always drawn. */
export const MARKER_DEFAULTS: MarkerStyle = {
	shape: 'dot',
	size: 14,
	icon: null,
	fill: null,
	stroke: '#0f172a',
	strokeWidth: 2,
	labelSide: 'right',
	labelAngle: 0,
	labelSize: 12,
	labelFont: 'Inter, system-ui, sans-serif',
	labelColor: null,
	labelOutline: null,
	labelOutlineWidth: 0,
	labelPlate: true,
	labelDx: 0,
	labelDy: 0,
	labelW: 0,
}

/** A partial look: what a map overrides of the built-in, and what a pin overrides of its map. */
export type MarkerOverride = Partial<MarkerStyle>

const SHAPES: ReadonlySet<string> = new Set(MARKER_SHAPES)
const SIDES: ReadonlySet<string> = new Set(LABEL_SIDES)

/** Is this a number we can draw with, rather than a NaN or a string that came back from somewhere? */
const num = (v: unknown, min: number, max: number) =>
	typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * A stored override, believed only as far as it makes sense. The column is JSON written by a version
 * of this app that may not be this one, and a map that will not draw because one field is a string is
 * a worse outcome than a marker that ignores it.
 */
export function parseMarkerOverride(json: string | null | undefined): MarkerOverride {
	if (!json) return {}
	let raw: unknown
	try {
		raw = JSON.parse(json)
	} catch {
		return {}
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
	const o = raw as Record<string, unknown>
	const out: MarkerOverride = {}

	if (typeof o.shape === 'string' && SHAPES.has(o.shape)) out.shape = o.shape as MarkerShape
	if (typeof o.labelSide === 'string' && SIDES.has(o.labelSide)) out.labelSide = o.labelSide as LabelSide

	const size = num(o.size, 4, 96)
	if (size !== undefined) out.size = size
	const strokeWidth = num(o.strokeWidth, 0, 12)
	if (strokeWidth !== undefined) out.strokeWidth = strokeWidth
	const labelAngle = num(o.labelAngle, -180, 180)
	if (labelAngle !== undefined) out.labelAngle = labelAngle
	const labelSize = num(o.labelSize, 6, 64)
	if (labelSize !== undefined) out.labelSize = labelSize
	const labelOutlineWidth = num(o.labelOutlineWidth, 0, 12)
	if (labelOutlineWidth !== undefined) out.labelOutlineWidth = labelOutlineWidth

	// A hand-drawn label line. Its middle may be anywhere within reach of the pin, and a length of 0
	// means "no line was drawn" — so the length has no lower bound of its own past that.
	for (const key of ['labelDx', 'labelDy'] as const) {
		const v = num(o[key], -2000, 2000)
		if (v !== undefined) out[key] = v
	}
	const labelW = num(o.labelW, 0, 2000)
	if (labelW !== undefined) out.labelW = labelW

	// The icon and the colours mean something when they are deliberately null — "no icon", "the pin's
	// own colour" — so a key that is present and null is an override, not a gap.
	for (const key of ['icon', 'fill', 'stroke', 'labelColor', 'labelOutline'] as const) {
		if (key in o) out[key] = str(o[key]) ?? null
	}
	const font = str(o.labelFont)
	if (font) out.labelFont = font
	if (typeof o.labelPlate === 'boolean') out.labelPlate = o.labelPlate

	return out
}

/** The map's default look: the built-in, with whatever the map says over it. */
export const mapMarkerStyle = (map: MapItem | null | undefined): MarkerStyle => ({
	...MARKER_DEFAULTS,
	...parseMarkerOverride(map?.MarkerStyle),
})

/**
 * A pin's look as it is stored: the map's default with the pin's own overrides laid over it, nulls
 * left as nulls. This is what an editor works on, so that a field nobody touched still equals what it
 * inherited and `diffMarker` does not record it.
 */
export const pinMarkerStyle = (pin: LocationItem, map: MapItem | null | undefined): MarkerStyle => ({
	...mapMarkerStyle(map),
	...parseMarkerOverride(pin.MarkerStyle),
})

/**
 * What to actually draw for one pin: the stored look, with the pin's own colour filled in wherever a
 * colour was left to it and an icon dropped if the shape has nowhere to put one.
 */
export function resolveMarker(pin: LocationItem, map: MapItem | null | undefined): MarkerStyle {
	const style = pinMarkerStyle(pin, map)
	const own = pin.Color || '#f59e0b'
	return {
		...style,
		fill: style.fill ?? own,
		labelColor: style.labelColor ?? '#e2e8f0',
		icon: ICON_SHAPES.has(style.shape) ? style.icon : null,
	}
}

/**
 * The other direction: only the fields that differ from what would otherwise apply. Saving the whole
 * object would freeze a pin's look the moment it was opened, and changing the map's default would
 * then move nothing.
 */
export function diffMarker(style: MarkerStyle, inherited: MarkerStyle): MarkerOverride {
	const out: MarkerOverride = {}
	for (const key of Object.keys(MARKER_DEFAULTS) as (keyof MarkerStyle)[]) {
		if (style[key] !== inherited[key]) Object.assign(out, { [key]: style[key] })
	}
	return out
}

/** What goes in the column: null rather than "{}" when a pin differs in nothing. */
export function serializeMarker(override: MarkerOverride): string | null {
	return Object.keys(override).length ? JSON.stringify(override) : null
}

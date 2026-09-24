/**
 * The arithmetic and the paper behind "save this picture". Kept out of the window it serves so it
 * can be tested without a stage: a canvas crop is easy to get subtly wrong and impossible to eye,
 * since a browser answers an impossible one with a blank image rather than an error.
 */

/** What goes behind the picture. `none` leaves the page showing through. */
export type ShotBack = 'plain' | 'lines' | 'dots' | 'none'

/** A margin round the exported picture, in stage units, so nothing stands against the edge. */
export const SHOT_PAD = 44
/** How far apart the paper is ruled, in stage units — about a disc and a half. */
export const SHOT_GRID = 64
/** Ruled paper's ink. A dot covers a fraction of what a line does, so it is given more. */
export const SHOT_LINE_INK = 'rgba(148, 163, 184, 0.22)'
export const SHOT_DOT_INK = 'rgba(148, 163, 184, 0.34)'
// Past either of these a browser hands back a blank canvas rather than throwing, so an export
// comes down to fit and says so instead of writing out an empty PNG.
export const SHOT_MAX_SIDE = 16384
export const SHOT_MAX_AREA = 2.4e8

export interface Rect { x: number; y: number; width: number; height: number }

export interface ShotFit {
	/** The crop, in the stage's own coordinates. */
	box: Rect
	/** The pixel ratio it can actually bear, which is `want` unless the picture is enormous. */
	ratio: number
	/** Whether that is less than what was asked for, so the panel can say so. */
	capped: boolean
}

/**
 * The crop and the ratio for a picture of `rect`. Null when there is nothing drawn — an empty
 * layer gives a zero-sized rect, and an export of it would be a file nobody can open.
 */
export function shotFit(rect: Rect | null | undefined, want: number): ShotFit | null {
	if (!rect || !rect.width || !rect.height) return null
	const box = {
		x: rect.x - SHOT_PAD, y: rect.y - SHOT_PAD,
		width: rect.width + SHOT_PAD * 2, height: rect.height + SHOT_PAD * 2,
	}
	const ratio = Math.max(0.05, Math.min(want,
		SHOT_MAX_SIDE / box.width, SHOT_MAX_SIDE / box.height,
		Math.sqrt(SHOT_MAX_AREA / (box.width * box.height))))
	return { box, ratio, capped: ratio < want - 0.005 }
}

/**
 * The sheet the picture is drawn on. Konva draws on transparency and a window's dark comes from
 * CSS behind it, so without this an export is an invisible tangle of pale threads on whatever the
 * reader's page happens to be — which is still the right answer when transparency is what was
 * asked for.
 */
export function paintBackdrop(
	ctx: CanvasRenderingContext2D,
	w: number, h: number, ratio: number,
	back: ShotBack, bg: string,
) {
	if (back === 'none') return
	ctx.fillStyle = bg
	ctx.fillRect(0, 0, w, h)
	if (back === 'plain') return
	// Ruled in export pixels, so the paper looks the same at 1× and at 4× instead of the grid
	// getting four times finer the larger you ask for.
	const step = SHOT_GRID * ratio
	const pen = Math.max(1, ratio * 0.6)
	if (back === 'lines') {
		ctx.strokeStyle = SHOT_LINE_INK
		ctx.lineWidth = pen
		ctx.beginPath()
		for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
		for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
		ctx.stroke()
		return
	}
	ctx.fillStyle = SHOT_DOT_INK
	for (let x = step; x < w; x += step) {
		for (let y = step; y < h; y += step) {
			ctx.beginPath()
			ctx.arc(x, y, pen * 1.4, 0, Math.PI * 2)
			ctx.fill()
		}
	}
}

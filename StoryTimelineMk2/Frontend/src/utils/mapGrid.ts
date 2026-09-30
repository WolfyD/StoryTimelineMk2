/**
 * BL-16: the lettered grid — the squares a writer cites. Columns run A, B, C… across and rows 1, 2, 3…
 * down, the way a gazetteer's index does, so "the ruins are in D7" names a patch of the map that anyone
 * reading can find.
 *
 * The map stores one number, how many squares across it is, and the rows follow from the picture's
 * height. One degree of freedom, so the squares are always square and the grid cannot come out as
 * stretched rectangles — the same reason a footprint stores only its width.
 *
 * ponytail: the bottom row and right column are short wherever the picture does not divide evenly. That
 * is what a grid ruled onto paper looks like, and nudging the squares to fit would mean they no longer
 * measure the same distance everywhere, which is the one thing a cited square is for.
 */
import type { MapItem } from '@/types/models'

/** What a map that has never been given a number gets: coarse enough to read, fine enough to cite. */
export const DEFAULT_GRID_COLS = 12

/** Fewer than two squares is not a grid; past two hundred the letters are thinner than the lines. */
export const MIN_GRID_COLS = 2
export const MAX_GRID_COLS = 200

/**
 * The grid as it is drawn: squares of `side` image pixels, `cols` across and `rows` down, over a picture
 * `w`×`h`. The picture's size comes along because everything else here is only true of that picture.
 */
export interface Grid {
	cols: number
	rows: number
	side: number
	w: number
	h: number
}

/**
 * Spreadsheet letters, so a map fine enough to need more than twenty-six columns keeps counting: Z is
 * followed by AA rather than by a second A nobody could cite.
 */
export function columnName(i: number): string {
	if (!(i >= 0)) return ''
	let n = Math.floor(i)
	let name = ''
	do {
		name = String.fromCharCode(65 + (n % 26)) + name
		n = Math.floor(n / 26) - 1
	} while (n >= 0)
	return name
}

/**
 * The squares over a picture of `baseW`×`baseH`. Rows are rounded up, because a map is covered by its
 * grid or the grid is not one — a short last row is still a row, and citing something in it works.
 */
export function gridOf(map: MapItem | null, baseW: number, baseH: number): Grid | null {
	if (!(baseW > 0) || !(baseH > 0)) return null
	const asked = map?.GridCols || DEFAULT_GRID_COLS
	const cols = Math.min(MAX_GRID_COLS, Math.max(MIN_GRID_COLS, Math.round(asked)))
	const side = baseW / cols
	return { cols, rows: Math.max(1, Math.ceil(baseH / side)), side, w: baseW, h: baseH }
}

/**
 * Which square a point of the map is in — `'D7'` — from a pin's own 0..1 fractions. A point beyond the
 * edge is named by the edge square rather than by nothing: half a pin hanging over the border is still
 * somewhere, and a fraction of exactly 1 is otherwise a column that does not exist.
 */
export function squareOf(x: number, y: number, grid: Grid | null): string {
	if (!grid || !Number.isFinite(x) || !Number.isFinite(y)) return ''
	const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((x * grid.w) / grid.side)))
	const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((y * grid.h) / grid.side)))
	return `${columnName(col)}${row + 1}`
}

import { describe, it, expect } from 'vitest'
import {
	shotFit, paintBackdrop, SHOT_PAD, SHOT_GRID, SHOT_MAX_SIDE, SHOT_MAX_AREA,
	SHOT_LINE_INK, SHOT_DOT_INK, type ShotBack,
} from '@/utils/imageExport'

/**
 * A canvas context that writes down what it was asked to do. happy-dom has no real 2D context and
 * a real one would only let us check pixels, which is not what is worth pinning here: what matters
 * is that transparent paints nothing at all and that the paper is ruled in export pixels.
 */
function fakeCtx() {
	const calls: string[] = []
	const ctx = {
		calls,
		fillStyle: '', strokeStyle: '', lineWidth: 0,
		fillRect: () => calls.push('fillRect'),
		beginPath: () => calls.push('beginPath'),
		moveTo: () => calls.push('moveTo'),
		lineTo: () => calls.push('lineTo'),
		stroke: () => calls.push('stroke'),
		arc: () => calls.push('arc'),
		fill: () => calls.push('fill'),
	}
	return ctx as unknown as CanvasRenderingContext2D & { calls: string[] }
}

const paint = (back: ShotBack, w = 400, h = 300, ratio = 1) => {
	const ctx = fakeCtx()
	paintBackdrop(ctx, w, h, ratio, back, '#0f172a')
	return ctx
}

describe('shotFit', () => {
	it('crops to what was drawn, with a margin all round', () => {
		const fit = shotFit({ x: 10, y: -20, width: 600, height: 400 }, 2)!
		expect(fit.box).toEqual({
			x: 10 - SHOT_PAD, y: -20 - SHOT_PAD,
			width: 600 + SHOT_PAD * 2, height: 400 + SHOT_PAD * 2,
		})
	})

	it('keeps the ratio asked for when the picture is a sane size', () => {
		const fit = shotFit({ x: 0, y: 0, width: 800, height: 600 }, 4)!
		expect(fit.ratio).toBe(4)
		expect(fit.capped).toBe(false)
	})

	it('comes down to fit rather than handing back a blank canvas', () => {
		// The real case: the 41-person chain straightened out, which is 13,438 wide.
		const fit = shotFit({ x: 0, y: 0, width: 13438 - SHOT_PAD * 2, height: 321 }, 4)!
		expect(fit.capped).toBe(true)
		expect(Math.round(fit.box.width * fit.ratio)).toBe(SHOT_MAX_SIDE)
	})

	it('leaves that same picture alone at a ratio it can carry', () => {
		// 1x is under the cap, so nothing is taken off it — the other half of the branch.
		const fit = shotFit({ x: 0, y: 0, width: 13438 - SHOT_PAD * 2, height: 321 }, 1)!
		expect(fit.ratio).toBe(1)
		expect(fit.capped).toBe(false)
	})

	it('holds every export inside what a browser will encode', () => {
		// Square, wide, tall and enormous: no shape may come out over either ceiling.
		for (const [w, h] of [[900, 900], [40000, 300], [300, 40000], [20000, 20000]] as const) {
			for (const want of [1, 2, 4]) {
				const fit = shotFit({ x: 0, y: 0, width: w, height: h }, want)!
				const px = [fit.box.width * fit.ratio, fit.box.height * fit.ratio]
				expect(Math.max(...px), `${w}x${h} at ${want}`).toBeLessThanOrEqual(SHOT_MAX_SIDE + 1)
				expect(px[0]! * px[1]!, `${w}x${h} at ${want}`).toBeLessThanOrEqual(SHOT_MAX_AREA * 1.01)
			}
		}
	})

	it('says there is no picture rather than exporting a file nobody can open', () => {
		expect(shotFit(null, 2)).toBeNull()
		expect(shotFit({ x: 0, y: 0, width: 0, height: 0 }, 2)).toBeNull()
		expect(shotFit({ x: 0, y: 0, width: 500, height: 0 }, 2)).toBeNull()
	})
})

describe('paintBackdrop', () => {
	it('paints nothing at all when the picture is to be transparent', () => {
		expect(paint('none').calls).toEqual([])
	})

	it('fills once and rules nothing for plain', () => {
		expect(paint('plain').calls).toEqual(['fillRect'])
	})

	it('rules the paper both ways', () => {
		const ctx = paint('lines', 400, 300)
		expect(ctx.calls.filter(c => c === 'moveTo')).toHaveLength(
			Math.ceil(400 / SHOT_GRID) - 1 + Math.ceil(300 / SHOT_GRID) - 1)
		expect(ctx.calls).toContain('stroke')
		expect(ctx.strokeStyle).toBe(SHOT_LINE_INK)
	})

	it('puts a dot at every crossing, in its own darker ink', () => {
		const ctx = paint('dots', 400, 300)
		expect(ctx.calls.filter(c => c === 'arc')).toHaveLength(
			(Math.ceil(400 / SHOT_GRID) - 1) * (Math.ceil(300 / SHOT_GRID) - 1))
		expect(ctx.fillStyle).toBe(SHOT_DOT_INK)
	})

	it('rules in export pixels, so the paper looks the same at every size', () => {
		// Twice the ratio is twice the canvas, so the count of rules has to come out the same.
		const one = paint('lines', 400, 300, 1).calls.filter(c => c === 'moveTo').length
		const four = paint('lines', 1600, 1200, 4).calls.filter(c => c === 'moveTo').length
		expect(four).toBe(one)
	})
})

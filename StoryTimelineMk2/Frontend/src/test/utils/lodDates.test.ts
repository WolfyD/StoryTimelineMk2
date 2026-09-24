import { describe, it, expect } from 'vitest'
import { stepOf, toAbsolute, toSubtick } from '@/utils/lodDates'
import type { LodLevel } from '@/types/models'

const LOD: LodLevel[] = [
	{ index: 3, formatKey: 'years', stepFraction: 1 },
	{ index: 4, formatKey: 'seasons', stepFraction: 0.25 },
	{ index: 5, formatKey: 'months', stepFraction: 1 / 12 },
]

describe('stepOf', () => {
	it('reads the profile, and calls anything it does not know a whole year', () => {
		expect(stepOf(LOD, 5)).toBeCloseTo(1 / 12)
		expect(stepOf(LOD, 99)).toBe(1)
		// A zero step would divide by zero on the way back; a year is the safe reading.
		expect(stepOf([{ index: 1, formatKey: 'broken', stepFraction: 0 }], 1)).toBe(1)
	})
})

describe('toAbsolute / toSubtick', () => {
	it('round-trips every step of every level', () => {
		for (const lod of LOD) {
			const steps = Math.round(1 / lod.stepFraction)
			for (let s = 0; s < steps; s++) {
				const abs = toAbsolute(1000, s, lod.index, LOD)!
				expect(toSubtick(abs, 1000, lod.index, LOD)).toBe(s)
			}
		}
	})

	it('keeps no date as no date, rather than year 0', () => {
		expect(toAbsolute(null, 3, 5, LOD)).toBeNull()
		expect(toSubtick(null, 1000, 5, LOD)).toBe(0)
		expect(toSubtick(1000.25, null, 5, LOD)).toBe(0)
	})

	it('cannot hand a date input a step outside the year', () => {
		expect(toSubtick(1099, 1000, 5, LOD)).toBe(11)
		expect(toSubtick(999, 1000, 5, LOD)).toBe(0)
	})

	it('negative years work like any other', () => {
		expect(toAbsolute(-500, 2, 4, LOD)).toBeCloseTo(-499.5)
		expect(toSubtick(-499.5, -500, 4, LOD)).toBe(2)
	})
})

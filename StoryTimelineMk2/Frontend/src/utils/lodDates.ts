/**
 * BL-75: the one conversion between how a date is stored and how it is edited.
 *
 * Rows store an absolute — the year with the sub-year part multiplied out — because that is what
 * the canvas positions from. Date inputs work in whole steps at a chosen LOD. Items have done this
 * inline since BL-02; characters and relations now do it too, so it lives here once.
 */
import type { LodLevel } from '@/types/models'

/** The fraction of a year one step at this LOD covers; a whole year for anything unlisted. */
export function stepOf(lodProfile: LodLevel[], granularity: number): number {
	const step = lodProfile.find(l => l.index === granularity)?.stepFraction ?? 1
	return step > 0 ? step : 1
}

/** Year plus sub-year steps, as the row stores it. No year is not year 0, so it stays null. */
export function toAbsolute(
	year: number | null,
	subtick: number,
	granularity: number,
	lodProfile: LodLevel[],
): number | null {
	return year === null ? null : year + subtick * stepOf(lodProfile, granularity)
}

/**
 * The step a date input has to show to mean `absolute` — the inverse, rounded because a stored
 * absolute is an exact multiple of its step and floating point is not. Clamped into the year.
 */
export function toSubtick(
	absolute: number | null | undefined,
	year: number | null,
	granularity: number,
	lodProfile: LodLevel[],
): number {
	if (absolute === null || absolute === undefined || year === null) return 0
	const step = stepOf(lodProfile, granularity)
	const max = Math.round(1 / step) - 1
	return Math.max(0, Math.min(Math.round((absolute - year) / step), max))
}

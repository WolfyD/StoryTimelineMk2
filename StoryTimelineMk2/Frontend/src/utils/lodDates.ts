/**
 * BL-75: the one conversion between how a date is stored and how it is edited.
 *
 * Rows store an absolute — the year with the sub-year part multiplied out — because that is what
 * the canvas positions from. Date inputs work in whole steps at a chosen LOD. Items have done this
 * inline since BL-02; characters and relations now do it too, so it lives here once.
 *
 * BL-79: not every rung's steps are the same size. Days and weeks are, and quarters are by
 * definition, so `subtick * stepFraction` is right for them. Months and seasons are not: February
 * starts on day 31 and a twelfth of 365 days is day 30, and the demo calendar's Spring starts on day
 * 60 rather than day 0. The tick labels in `timelineLayout.ts` read the calendar's real boundaries —
 * `monthLabel` and `seasonLabel` both search start days — so a conversion that spaces the steps
 * evenly disagrees with them: picking February labelled as January, and every season came out one
 * off with Winter unreachable entirely. Pass a `CalendarFormatConfig` and the two uneven rungs use
 * the same boundaries the labels do.
 */
import type { LodLevel } from '@/types/models'
import { boundaryDays, type CalendarFormatConfig } from '@/utils/timelineLayout'

/** The fraction of a year one step at this LOD covers; a whole year for anything unlisted. */
export function stepOf(lodProfile: LodLevel[], granularity: number): number {
	const step = lodProfile.find(l => l.index === granularity)?.stepFraction ?? 1
	return step > 0 ? step : 1
}

/**
 * The day each step of this rung starts on — or `null` for a rung no calendar can place, where
 * `stepFraction` still does the work.
 *
 * BL-44: this used to keep its own list for months and seasons. It now asks `boundaryDays`, the
 * same table the grid draws its ticks from, so a date can only ever be written to a day the axis
 * actually has a tick on. Weeks and days come back too; their steps are even, so the arithmetic is
 * unchanged, but it is no longer a rounded `stepFraction` multiplied out.
 *
 * Seasons arrive in their stored order rather than sorted. The label search walks the same array,
 * so whatever order it is in, a season's own start day lands back inside its own range.
 */
function startDays(
	lodProfile: LodLevel[],
	granularity: number,
	cfg?: CalendarFormatConfig,
): number[] | null {
	if (!cfg) return null
	return boundaryDays(lodProfile.find(l => l.index === granularity)?.formatKey, cfg)
}

/** Year plus sub-year steps, as the row stores it. No year is not year 0, so it stays null. */
export function toAbsolute(
	year: number | null,
	subtick: number,
	granularity: number,
	lodProfile: LodLevel[],
	cfg?: CalendarFormatConfig,
): number | null {
	if (year === null) return null
	const starts = startDays(lodProfile, granularity, cfg)
	if (!starts) return year + subtick * stepOf(lodProfile, granularity)
	const i = Math.max(0, Math.min(Math.round(subtick), starts.length - 1))
	return year + starts[i]! / cfg!.yearLength
}

/**
 * The step a date input has to show to mean `absolute`, clamped into the year.
 *
 * Always the step the date falls *inside*, never the nearest one. A date that sits exactly on a step
 * is the common case and comes back exactly, and one that does not — an item dropped on the canvas
 * between two ticks, or a position `placeDate` held on to — belongs to the step it is in: a day in
 * late summer is in summer, not nearly autumn. That is also the only question a month or season
 * boundary can answer, so both rungs agree with the tick labels by construction.
 */
export function toSubtick(
	absolute: number | null | undefined,
	year: number | null,
	granularity: number,
	lodProfile: LodLevel[],
	cfg?: CalendarFormatConfig,
): number {
	if (absolute === null || absolute === undefined || year === null) return 0
	const starts = startDays(lodProfile, granularity, cfg)
	if (!starts) {
		const step = stepOf(lodProfile, granularity)
		const max = Math.round(1 / step) - 1
		// `stepFraction` is stored rounded and `year + fraction` loses bits at large years, so a date
		// sitting exactly on a step can arrive a hair under it. The epsilon is a fraction of a step —
		// under a tenth of a second of a day — and stops that hair costing a whole step.
		const n = Math.floor((absolute - year) / step + 1e-6)
		return Math.max(0, Math.min(n, max))
	}
	// A stored absolute is one of these start days exactly, so take the last step that has begun.
	const day = Math.round((absolute - year) * cfg!.yearLength)
	// Before the first one means the rung that wraps the year boundary — the demo calendar's Winter
	// runs day 335 to day 59, so January is Winter and not Spring. Months always start at day 0, so
	// this only ever fires for seasons.
	if (day < starts[0]!) return starts.length - 1
	let i = 0
	for (let k = 0; k < starts.length; k++) if (starts[k]! <= day) i = k
	return i
}

/**
 * Where to store a date the editor is showing, keeping the position it already had when the step on
 * screen is still the one that position falls in.
 *
 * Without this, opening an item and saving it rewrites its date whether or not anyone touched the
 * date. That is invisible while the conversion is reversible, and not invisible at all once it is
 * right: an item on a whole-year tick at season precision is a real thing to be — the dropdown has
 * four seasons and no way to say "on the tick" — and `toAbsolute` would answer with the start day of
 * whichever season the year begins in, sliding the item most of a year for a change of title.
 *
 * So a save only moves a date when the form says to. `held` is the step and sub-year fraction the
 * editor loaded, or null for a date it has nothing to hold.
 */
export function placeDate(
	year: number | null,
	subtick: number,
	granularity: number,
	held: HeldDate | null,
	lodProfile: LodLevel[],
	cfg?: CalendarFormatConfig,
): number | null {
	if (year === null) return null
	// The granularity matters as much as the step: switching season to month leaves both at step 0.
	if (held && held.subtick === subtick && held.granularity === granularity) return year + held.fraction
	return toAbsolute(year, subtick, granularity, lodProfile, cfg)
}

/** What an editor loaded, for `placeDate` to recognise an untouched date by. */
export interface HeldDate {
	granularity: number
	subtick: number
	fraction: number
}

/** The step to show for a stored date, and what `placeDate` needs to leave it where it is. */
export function holdDate(
	absolute: number | null | undefined,
	year: number | null,
	granularity: number,
	lodProfile: LodLevel[],
	cfg?: CalendarFormatConfig,
): HeldDate {
	return {
		granularity,
		subtick: toSubtick(absolute, year, granularity, lodProfile, cfg),
		fraction: absolute === null || absolute === undefined || year === null ? 0 : absolute - year,
	}
}

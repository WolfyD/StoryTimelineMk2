/**
 * A calendar's `year_definition` JSON, parsed once.
 *
 * This read existed twice — here for the month and season names a date input shows, and again inside
 * the timeline store for the `CalendarFormatConfig` the canvas labels dates from. Two parses of one
 * string is one parse too many, and BL-79 needs the editor to know the real month and season
 * boundaries to store a date correctly, which is exactly what the store's copy already worked out.
 * So the store's version lives here now and `parseCalendarDef` is derived from it.
 */
import { DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig } from '@/utils/timelineLayout'
import type { MemDayMarker } from '@/types/models'

export interface CalendarDef {
	monthNames: string[]
	monthLengths: number[]
	seasonNames: string[]
	weekCount: number
}

/**
 * Everything date formatting and date entry need from a calendar. Falls back to the Gregorian
 * default, so a broken definition still renders a form and still labels a tick.
 */
export function parseCalendarConfig(yearDefinition: string | null | undefined): CalendarFormatConfig {
	if (!yearDefinition) return DEFAULT_CALENDAR_CONFIG
	try {
		const yd = JSON.parse(yearDefinition)
		const yearLength: number = yd.length ?? 365

		const months: CalendarFormatConfig['months'] = []
		if (yd.month_definition && yd.months) {
			let cumulative = 0
			for (let i = 0; i < (yd.months as number); i++) {
				const m = yd.month_definition[String(i)]
				months.push({
					name: m?.name ?? `Month ${i + 1}`,
					shortName: m?.short_name ?? (m?.name ? String(m.name).slice(0, 3) : `M${i + 1}`),
					startDay: cumulative,
				})
				cumulative += m?.length ?? 30
			}
		}

		const seasons: CalendarFormatConfig['seasons'] = []
		if (yd.season_definition && yd.seasons) {
			for (let i = 0; i < (yd.seasons as number); i++) {
				const s = yd.season_definition[String(i)]
				seasons.push({
					name: s?.name ?? `Season ${i + 1}`,
					start: s?.start ?? 0,
					end: s?.end ?? 0,
					significance: s?.significance,
				})
			}
		}

		const memorableDays: MemDayMarker[] = Array.isArray(yd.memorable_days)
			? (yd.memorable_days as MemDayMarker[])
			: []

		return {
			yearLength,
			weekLength: yd.week_definition?.length ?? 7,
			yearStartDow: yd.year_start_dow ?? 0,
			months,
			seasons,
			memorableDays,
		}
	} catch {
		return DEFAULT_CALENDAR_CONFIG
	}
}

/**
 * The names and lengths `LodDateInput` fills its dropdowns from. Month lengths are the gaps between
 * start days — the same numbers the definition listed, and no second chance to disagree with them.
 */
export function parseCalendarDef(yearDefinition: string): CalendarDef {
	const cfg = parseCalendarConfig(yearDefinition)
	// An empty definition means no dropdowns rather than the Gregorian ones: a calendar with no
	// months is a real answer here, where for formatting it never is.
	const months = yearDefinition ? cfg.months : []
	return {
		monthNames: months.map(m => m.name),
		monthLengths: months.map((m, i) => (months[i + 1]?.startDay ?? cfg.yearLength) - m.startDay),
		seasonNames: yearDefinition ? cfg.seasons.map(s => s.name) : [],
		weekCount: cfg.weekLength > 0 ? Math.ceil(cfg.yearLength / cfg.weekLength) : 52,
	}
}

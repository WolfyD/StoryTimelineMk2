/**
 * The bits of a calendar's `year_definition` JSON that a date input needs: month and season
 * names, month lengths, and how many weeks fit in a year. Shared by the item editor and the
 * character window, which both hand the answer straight to `LodDateInput`.
 */
export interface CalendarDef {
	monthNames: string[]
	monthLengths: number[]
	seasonNames: string[]
	weekCount: number
}

/** Falls back to an empty calendar with 52 weeks, so a broken definition still renders a form. */
export function parseCalendarDef(yearDefinition: string): CalendarDef {
	try {
		const def = JSON.parse(yearDefinition)
		const yearLength: number = def.length ?? 365
		const weekLength: number = def.week_definition?.length ?? 7

		const monthNames: string[] = []
		const monthLengths: number[] = []
		if (def.month_definition && def.months) {
			for (let i = 0; i < (def.months as number); i++) {
				const m = def.month_definition[String(i)]
				monthNames.push(m?.name ?? `Month ${i + 1}`)
				monthLengths.push(m?.length ?? 30)
			}
		}

		const seasonNames: string[] = []
		if (def.season_definition && def.seasons) {
			for (let i = 0; i < (def.seasons as number); i++) {
				const s = def.season_definition[String(i)]
				seasonNames.push(s?.name ?? `Season ${i + 1}`)
			}
		}

		const weekCount = weekLength > 0 ? Math.ceil(yearLength / weekLength) : 52
		return { monthNames, monthLengths, seasonNames, weekCount }
	} catch {
		return { monthNames: [], monthLengths: [], seasonNames: [], weekCount: 52 }
	}
}

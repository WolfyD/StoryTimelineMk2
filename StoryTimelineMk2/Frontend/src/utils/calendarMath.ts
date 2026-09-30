/**
 * Pure calendar arithmetic utilities.
 * No Vue/Pinia dependencies — safe to call from any context.
 */
import type { CharacterItem, LodLevel } from '@/types/models'
import { stepOf } from '@/utils/lodDates'

/** BL-88: a birthday or a death anniversary in a year calendar's day cell. */
export interface LifeMark { kind: 'birth' | 'death'; color: string; title: string }

/**
 * BL-88: the birthdays and death anniversaries in `year`, by month index and then 1-based day.
 * A birthday shows while they are alive on it, with the age they turn; an anniversary shows from the
 * year after the death. A date not picked down to the day has no day to fall on, so it shows nothing.
 */
export function lifeMarks(
    cast: CharacterItem[],
    year: number,
    yearLength: number,
    months: { startDay: number }[],
    lodProfile: LodLevel[],
    show = { birth: true, death: true },
): Record<number, Record<number, LifeMark[]>> {
    const out: Record<number, Record<number, LifeMark[]>> = {}
    const toTheDay = (granularity: number) => stepOf(lodProfile, granularity) <= 1 / yearLength + 1e-9
    const put = (at: number, mark: LifeMark) => {
        const { monthIndex, dayOfMonth } = dayOfYearToMonthDay(Math.round((at - Math.floor(at)) * yearLength), months)
        ;((out[monthIndex] ??= {})[dayOfMonth + 1] ??= []).push(mark)
    }
    for (const c of cast) {
        const color = c.Color || '#6366f1'
        const name = c.Name || 'Someone'
        const born = c.AbsoluteStart
        const died = c.AbsoluteEnd
        if (show.birth && born !== null && toTheDay(c.BirthGranularity)) {
            const age = year - Math.floor(born)
            const birthday = year + (born - Math.floor(born))
            if (age >= 0 && (died === null || birthday <= died))
                put(born, { kind: 'birth', color, title: age === 0 ? `${name} is born` : `${name} turns ${age}` })
        }
        if (show.death && died !== null && toTheDay(c.DeathGranularity)) {
            const ago = year - Math.floor(died)
            if (ago > 0) put(died, { kind: 'death', color, title: `${name} died ${ago} year${ago === 1 ? '' : 's'} ago` })
        }
    }
    return out
}

/**
 * Returns the day-of-week (0 = first configured weekday, e.g. Monday) on which
 * M1 D1 of the given `year` falls.
 *
 * Formula: each year adds `yearLength % weekLength` columns relative to the
 * previous year, so the offset accumulates linearly from `baseStartDow`.
 * The double-modulo `(x % n + n) % n` handles negative years correctly since
 * JavaScript's `%` can return a negative value when the left operand is negative.
 */
export function getYearStartDow(
    year: number,
    yearLength: number,
    weekLength: number,
    baseStartDow: number,
): number {
    const raw = (baseStartDow + year * (yearLength % weekLength)) % weekLength
    return (raw + weekLength) % weekLength
}

/**
 * Given an absolute day-of-year (0-indexed) and the month definitions array,
 * returns { monthIndex, dayOfMonth } (both 0-indexed).
 * Falls back to a flat day-of-year split if no month definitions are provided.
 */
export function dayOfYearToMonthDay(
    dayOfYear: number,
    months: { startDay: number }[],
): { monthIndex: number; dayOfMonth: number } {
    if (months.length === 0) return { monthIndex: 0, dayOfMonth: dayOfYear }
    for (let i = months.length - 1; i >= 0; i--) {
        if (dayOfYear >= months[i]!.startDay) {
            return { monthIndex: i, dayOfMonth: dayOfYear - months[i]!.startDay }
        }
    }
    return { monthIndex: 0, dayOfMonth: dayOfYear }
}

/**
 * Returns the column (0-indexed, within a weekLength-wide grid) on which the
 * first day of `monthIndex` falls in the given year.
 */
export function monthStartCol(
    year: number,
    monthStartDay: number,
    yearLength: number,
    weekLength: number,
    baseStartDow: number,
): number {
    const yearDow = getYearStartDow(year, yearLength, weekLength, baseStartDow)
    return (yearDow + monthStartDay) % weekLength
}

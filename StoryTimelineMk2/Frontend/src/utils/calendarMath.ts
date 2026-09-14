/**
 * Pure calendar arithmetic utilities.
 * No Vue/Pinia dependencies — safe to call from any context.
 */

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

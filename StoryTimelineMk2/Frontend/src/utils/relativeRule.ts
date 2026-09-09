export interface RelativeRule {
    baseType: 'period' | 'anchor'

    // baseType = 'period'
    periodType?: 'year' | 'month'
    periodMonth?: number | null  // null = every month, 0-N = specific month

    // baseType = 'anchor'
    anchorType?: 'season-start' | 'season-end' | 'memorable-day'
    anchorIndex?: number   // 0-based season index
    anchorId?: string      // id of another memorable day

    offsetDays: number     // ±N days from the base (0 = on the base itself)

    // Optional: find the Nth occurrence of specific weekday(s) on or after the base
    weekdays?: number[]    // 0-based day-of-week indices
    ordinal?: number       // 1-5 or -1 for "last"

    span: number           // consecutive days this event lasts (≥ 1)
}

export function defaultRelativeRule(): RelativeRule {
    return {
        baseType: 'period',
        periodType: 'month',
        periodMonth: null,
        offsetDays: 0,
        span: 1,
    }
}

// ── Description context ────────────────────────────────────────────────────────

export interface DescribeContext {
    seasonNames: string[]
    monthNames: string[]
    dayLabels: string[]
    memDayNames: Record<string, string>
}

const ORDINAL_WORDS: Record<number, string> = {
    1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', [-1]: 'last',
}

// ── Core description function (pure, easily testable) ─────────────────────────

export function describeRule(rule: RelativeRule, ctx: DescribeContext): string {
    // Build the anchor phrase (includes "the" where natural)
    let anchorPhrase: string
    let periodName: string | null = null

    if (rule.baseType === 'period') {
        periodName = rule.periodType === 'year'
            ? 'every year'
            : rule.periodMonth == null
                ? 'every month'
                : (ctx.monthNames[rule.periodMonth] ?? `Month ${(rule.periodMonth) + 1}`)
        anchorPhrase = `the start of ${periodName}`
    } else if (rule.anchorType === 'season-start') {
        const name = ctx.seasonNames[rule.anchorIndex ?? 0] ?? `Season ${(rule.anchorIndex ?? 0) + 1}`
        anchorPhrase = `the start of ${name}`
    } else if (rule.anchorType === 'season-end') {
        const name = ctx.seasonNames[rule.anchorIndex ?? 0] ?? `Season ${(rule.anchorIndex ?? 0) + 1}`
        anchorPhrase = `the end of ${name}`
    } else {
        anchorPhrase = ctx.memDayNames[rule.anchorId ?? ''] ?? 'a memorable day'
    }

    const abs = Math.abs(rule.offsetDays)
    const dir = rule.offsetDays > 0 ? 'after' : 'before'
    const hasWeekdays = (rule.weekdays?.length ?? 0) > 0

    let phrase: string

    if (hasWeekdays && rule.ordinal !== undefined) {
        const ord = ORDINAL_WORDS[rule.ordinal] ?? `${rule.ordinal}th`
        const days = rule.weekdays!.map(d => ctx.dayLabels[d] ?? `D${d + 1}`)
        const dayStr = days.length === 1
            ? days[0]
            : `${days.slice(0, -1).join(', ')} and ${days.at(-1)!}`

        if (rule.baseType === 'period' && rule.offsetDays === 0 && periodName) {
            // "The third Thursday of every month"
            phrase = `The ${ord} ${dayStr} of ${periodName}`
        } else if (rule.offsetDays === 0) {
            // "The first Sunday on or after the start of Spring"
            phrase = `The ${ord} ${dayStr} on or after ${anchorPhrase}`
        } else {
            // "The first Sunday on or after 2 days after the start of Spring"
            phrase = `The ${ord} ${dayStr} on or after ${abs} day${abs !== 1 ? 's' : ''} ${dir} ${anchorPhrase}`
        }
    } else if (rule.offsetDays === 0) {
        // "The start of Spring" / "Easter Sunday" — only capitalize "the ..." prefixes
        phrase = anchorPhrase.startsWith('the ') ? 'The' + anchorPhrase.slice(3) : anchorPhrase
    } else {
        // "1 day before the start of Winter" / "2 days after Easter"
        const raw = `${abs} day${abs !== 1 ? 's' : ''} ${dir} ${anchorPhrase}`
        phrase = raw.charAt(0).toUpperCase() + raw.slice(1)
    }

    if (rule.span > 1) phrase += `, lasting ${rule.span} day${rule.span !== 1 ? 's' : ''}`
    return phrase
}

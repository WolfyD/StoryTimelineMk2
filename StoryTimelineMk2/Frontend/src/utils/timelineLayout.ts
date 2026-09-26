/**
 * PURE MATH MODULE
 * Handles spatial coordinates, time translation, and 1D collision packing.
 */

import type { LayoutSettings, HiddenRange, LodLevel, MemDayMarker } from "@/types/models";


// ── Calendar format configuration ─────────────────────────────────────────────

export interface CalendarFormatConfig {
    yearLength: number
    weekLength: number
    yearStartDow: number
    months: { name: string; shortName: string; startDay: number }[]
    seasons: { name: string; start: number; end: number; significance?: string }[]
    memorableDays: MemDayMarker[]
}

export const DEFAULT_CALENDAR_CONFIG: CalendarFormatConfig = {
    yearLength: 365,
    weekLength: 7,
    yearStartDow: 0,
    months: [
        { name: 'January',   shortName: 'Jan', startDay: 0   },
        { name: 'February',  shortName: 'Feb', startDay: 31  },
        { name: 'March',     shortName: 'Mar', startDay: 59  },
        { name: 'April',     shortName: 'Apr', startDay: 90  },
        { name: 'May',       shortName: 'May', startDay: 120 },
        { name: 'June',      shortName: 'Jun', startDay: 151 },
        { name: 'July',      shortName: 'Jul', startDay: 181 },
        { name: 'August',    shortName: 'Aug', startDay: 212 },
        { name: 'September', shortName: 'Sep', startDay: 243 },
        { name: 'October',   shortName: 'Oct', startDay: 273 },
        { name: 'November',  shortName: 'Nov', startDay: 304 },
        { name: 'December',  shortName: 'Dec', startDay: 334 },
    ],
    seasons: [
        { name: 'Spring', start: 0,   end: 91  },
        { name: 'Summer', start: 91,  end: 183 },
        { name: 'Fall',   start: 183, end: 274 },
        { name: 'Winter', start: 274, end: 364 },
    ],
    memorableDays: [],
}

/**
 * BL-44: a label is given the integer day-of-year its tick falls on, never a fraction to round.
 * The grid knows that day exactly because it draws the calendar's own boundary days.
 */
export type FormatRegistryType = Record<string, (year: number, day: number) => string>

/**
 * BL-44: the days inside one year that a rung's ticks fall on — or `null` when the rung is a whole
 * number of years, or is something a calendar cannot answer (a custom minutes level), in which case
 * `stepFraction` still places its ticks.
 *
 * This is the one table. The grid draws these days, the labels read them back, and `lodDates.ts`
 * writes dates onto them, so "which day does March start on" has a single answer instead of three
 * that disagree. Spacing a rung by `1/12` of a year instead is what made the months ruler skip
 * February: no tick ever landed in the 28 days between day 31 and day 59.
 *
 * Seasons come back in their *stored* order — that is what lets a season wrapping the new year
 * label correctly (BL-79). Callers that walk them left to right sort a copy.
 */
export function boundaryDays(formatKey: string | undefined, cfg: CalendarFormatConfig): number[] | null {
    const { yearLength, weekLength, months, seasons } = cfg
    switch ((formatKey ?? '').toUpperCase()) {
        case 'MONTHS':   return months.length  ? months.map(m => m.startDay) : null
        case 'SEASONS':  return seasons.length ? seasons.map(s => s.start)   : null
        case 'QUARTERS': return [0, 1, 2, 3].map(q => Math.floor((q * yearLength) / 4))
        case 'WEEKS': {
            const out: number[] = []
            for (let d = 0; d < yearLength; d += Math.max(1, weekLength)) out.push(d)
            return out
        }
        case 'DAYS':     return Array.from({ length: yearLength }, (_, d) => d)
        default:         return null
    }
}

/**
 * The year and integer day-of-year an absolute position falls *inside* — a floor, not a round, so a
 * position two thirds through a day still reads as that day.
 *
 * Only for arbitrary positions: the cursor readout and the distance panel. Ticks never come through
 * here, because a tick already knows its own day.
 */
export function dayOfYearAt(absolute: number, cfg: CalendarFormatConfig): { year: number; day: number } {
    const year = Math.floor(absolute)
    // A stored stepFraction is a rounded float, so a date written exactly on a boundary can land a
    // hair under it, and a floor would charge a whole day for the hair.
    //
    // The slack has to grow with the year. `absolute` carries the rounding error of a number its own
    // size, which is nothing at year 2000 and a ten-thousandth of a day at year ten million — enough
    // that a fixed 1e-9 left the cursor reading the first of February as the thirty-first of January.
    // Even at that size it is under a second of a day, so no real position is pulled off its own day.
    const slack = Math.max(1e-9, Math.abs(absolute) * 8 * Number.EPSILON * cfg.yearLength)
    const day = Math.floor((absolute - year) * cfg.yearLength + slack)
    return { year, day: Math.max(0, Math.min(day, cfg.yearLength - 1)) }
}

export function buildFormatRegistry(cfg: CalendarFormatConfig): FormatRegistryType {
    const { yearLength, weekLength, months, seasons } = cfg

    /** The month a day falls in — months are stored in order, so the last one to have started wins. */
    function monthAt(day: number) {
        let found = months[0]
        for (const m of months) if (m.startDay <= day) found = m
        return found
    }

    function seasonAt(day: number): string {
        if (seasons.length === 0) return `Q${Math.min(Math.floor((day * 4) / yearLength), 3) + 1}`
        for (const s of seasons) {
            if (s.start <= s.end ? (day >= s.start && day <= s.end) : (day >= s.start || day <= s.end))
                return s.name
        }
        return seasons[0]!.name
    }

    const nextYear = (y: number) => `${Math.floor(y) + 1}`

    /**
     * A sub-year rung names its unit and nothing else — "Jan", "W3", "25 Apr".
     *
     * BL-44: these used to answer with the bare year for day 0, which is the *grid's* convention for
     * a tick sitting on a year boundary, not a fact about the label. Baked in here it made day 0
     * unaskable, so the cursor read "1995 1995" hovering over the first of January. The callers that
     * want the year printed there now say so themselves.
     *
     * A day at or past the end of the year belongs to the next year's tick — a rung whose steps do
     * not divide the year evenly lands there, and repeating the last month's name would be a lie.
     */
    const sub = (name: (d: number) => string) => (y: number, d: number): string =>
        d >= yearLength ? nextYear(y) : name(Math.max(0, Math.floor(d)))

    return {
        'MILLENNIA': (y)    => `${Math.floor(y)}s`,
        'CENTURIES': (y)    => `${Math.floor(y)}`,
        'DECADES':   (y)    => `${Math.floor(y)}`,
        'YEARS':     (y)    => `${Math.floor(y)}`,
        'QUARTERS':  sub(d => `Q${Math.min(Math.floor((d * 4) / yearLength), 3) + 1}`),
        'SEASONS':   sub(d => seasonAt(d)),
        'MONTHS':    sub(d => monthAt(d)?.shortName ?? `M${d + 1}`),
        'WEEKS':     sub(d => `W${Math.floor(d / Math.max(1, weekLength)) + 1}`),
        // BL-44: the date, not a count of days into the year — and narrower than "Day 348", which is
        // what let the BL-80 tick spacing stay where it was set.
        'DAYS':      sub(d => {
            const m = monthAt(d)
            return m ? `${d - m.startDay + 1} ${m.shortName}` : `Day ${d + 1}`
        }),
    }
}

// Gregorian default — kept for any code that imports it directly
export const FormatRegistry: FormatRegistryType = buildFormatRegistry(DEFAULT_CALENDAR_CONFIG)

// --- Hidden Range Transform ---

// A hidden range collapses (endYear - startYear) real time units down to BREAK_TICKS tick-widths.
// At tickDistance=100px and step=1 this equals 30px, and scales proportionally with zoom.
export const BREAK_TICKS = 0.3;

// Maps absolute time → visual time, accounting for compressed hidden ranges.
// Ranges must be sorted ascending by StartYear before calling.
export function absoluteToVisual(t: number, ranges: HiddenRange[], step: number): number {
    if (!ranges || ranges.length === 0) return t;
    const breakSize = BREAK_TICKS * step;
    let offset = 0;
    for (const r of ranges) {
        if (t <= r.StartYear) break;
        const hiddenSize = r.EndYear - r.StartYear;
        if (t >= r.EndYear) {
            // This range is entirely before t — subtract the compressed net amount
            offset -= (hiddenSize - breakSize);
        } else {
            // t is inside this range: map proportionally into the break strip
            const fraction = (t - r.StartYear) / hiddenSize;
            return r.StartYear + offset + fraction * breakSize;
        }
    }
    return t + offset;
}

// Inverse of absoluteToVisual. Maps visual time → absolute time.
export function visualToAbsolute(v: number, ranges: HiddenRange[], step: number): number {
    if (!ranges || ranges.length === 0) return v;
    const breakSize = BREAK_TICKS * step;
    let offset = 0; // accumulated net shrinkage (negative value)
    for (const r of ranges) {
        const rVisualStart = r.StartYear + offset;
        const rVisualEnd = rVisualStart + breakSize;
        const hiddenSize = r.EndYear - r.StartYear;
        if (v <= rVisualStart) break;
        if (v >= rVisualEnd) {
            offset -= (hiddenSize - breakSize);
        } else {
            // v falls inside the break strip — interpolate back to absolute
            const fraction = (v - rVisualStart) / breakSize;
            return r.StartYear + fraction * hiddenSize;
        }
    }
    return v - offset;
}

// --- Grid ticks ---

/** One tick the grid draws. `day` is the day-of-year it falls on, which its label is free to use. */
export interface GridTick {
    absolute: number
    year: number
    day: number
    isYearTick: boolean
    /** Placed on a calendar boundary day rather than by `stepFraction`. A caller printing the bare
     *  year on year boundaries wants both this and `isYearTick` — "2000s" is a millennium's label,
     *  not a year's. */
    subYear: boolean
    /** Whether this tick's own name is drawn. A tick whose label would land on its neighbour's -- or
     *  on the year number, which never gives way -- keeps its mark and loses its name. See
     *  `labelGapPx` and `yearGapPx`. */
    showLabel: boolean
}

export interface GridTickOptions {
    centerTime: number
    width: number
    /** The animated step — what the view is currently between, not necessarily the rung's own. */
    step: number
    tickDistance: number
    ranges: HiddenRange[]
    formatKey?: string
    /** The rung's settled `stepFraction`, which still decides spacing for rungs a calendar can't place. */
    stepFraction: number
    cfg: CalendarFormatConfig
    /** Overdraw either side, in pixels, so a pan doesn't reveal an empty edge. */
    extraPx?: number
    /** Minimum horizontal pixels between one label and the next. Omit it and every tick is named.
     *  The renderer owns the number because only it can measure text in the timeline's own font. */
    labelGapPx?: number
    /** Room the year number needs on either side of it. The year is never dropped, so this is space
     *  a unit name has to give up. 0 or omitted when the renderer has put the year on a row of its
     *  own, where it crowds nothing. */
    yearGapPx?: number
}

/**
 * BL-44: every tick the grid should draw, left to right.
 *
 * Two ways in, decided by whether the calendar can name this rung's boundaries:
 *
 * - **A rung made of days** (months, seasons, weeks, days, quarters) walks whole years and then that
 *   rung's own boundary days inside each one. A tick lands on the day the calendar says the month
 *   starts, so its label is a lookup rather than a rounded fraction — which is what stopped the
 *   months ruler skipping February, and what makes a three-season calendar show all three.
 * - **Everything else** — whole-year rungs, and any custom level a calendar has no days for — keeps
 *   stepping `stepFraction` through visual time. For decades and up that produces exactly the ticks
 *   it always did; multiples of the step in absolute time.
 *
 * Both walk *visual* time bounds, so the iteration count stays near `width / tickDistance` however
 * many years a hidden range swallows.
 */
export function gridTicks(o: GridTickOptions): GridTick[] {
    const { centerTime, width, step, tickDistance, ranges, cfg } = o
    const stepF = o.stepFraction || 1
    const yearLength = cfg.yearLength

    const visualCenter = absoluteToVisual(centerTime, ranges, step)
    const half = ((width / 2) / tickDistance) * step
    const pad  = ((o.extraPx ?? 0) / tickDistance) * step
    const leftVisual  = visualCenter - half - pad
    const rightVisual = visualCenter + half + pad

    const out: GridTick[] = []
    const days = boundaryDays(o.formatKey, cfg)

    if (days) {
        // Ascending and deduped: seasons are stored in the order that makes a wrapping one label
        // correctly, which is not the order they are drawn in.
        //
        // Day 0 joins them because the year boundary is the grid's own line, not one of the rung's
        // units — every rung but a season list that starts mid-year already contains it, and without
        // it a calendar whose Spring begins on day 60 would show no year number anywhere.
        const sorted = [...new Set([0, ...days])].sort((a, b) => a - b)
        const absLeft  = visualToAbsolute(leftVisual,  ranges, step)
        const absRight = visualToAbsolute(rightVisual, ranges, step)

        for (let y = Math.floor(absLeft); y <= Math.floor(absRight); y++) {
            // A range that swallows this whole year is stepped over in one jump, so a range covering
            // ten thousand years costs one iteration rather than ten thousand.
            const swallowed = ranges.find(r => r.StartYear <= y && r.EndYear >= y + 1)
            if (swallowed) { y = Math.max(y, Math.floor(swallowed.EndYear) - 1); continue }

            // BL-85. Boundary days are not evenly spaced -- a calendar's last week can be one day
            // long, and its seasons need not be the same length -- so which names fit is a walk, not
            // a divisor. The walk restarts at every year boundary and runs before the viewport prune
            // below, so a tick's answer depends on the calendar and the zoom and nothing else.
            // Decide it from what is on screen instead and the names flicker as you pan, because the
            // tick the walk starts from keeps changing.
            // The year number is never dropped, so it claims its slot up front rather than taking a
            // turn: a unit name has to clear the year boundary on either side of it as well as its
            // own left-hand neighbour. `yearGapPx` is 0 when the renderer has put the year on a row
            // of its own, and then the year competes with nothing and these two seeds do nothing.
            let lastNamedVisual = -Infinity
            const yearGap = o.yearGapPx ?? 0
            const openVisual = yearGap ? absoluteToVisual(y, ranges, step) : -Infinity
            const nextVisual = yearGap ? absoluteToVisual(y + 1, ranges, step) : Infinity

            for (const d of sorted) {
                const absolute = y + d / yearLength
                // ponytail: linear scan of one year's boundaries. Only a calendar with a five-figure
                // year length would feel it; bisect `sorted` if one ever turns up.
                if (absolute > absRight) break
                if (ranges.some(r => absolute > r.StartYear && absolute < r.EndYear)) continue

                const isYearTick = d === 0
                let showLabel = true
                if (!isYearTick) {
                    const visual = absoluteToVisual(absolute, ranges, step)
                    const gapTo = (other: number) => (Math.abs(visual - other) / step) * tickDistance
                    showLabel = (!o.labelGapPx || gapTo(lastNamedVisual) >= o.labelGapPx)
                        && gapTo(openVisual) >= yearGap
                        && gapTo(nextVisual) >= yearGap
                    if (showLabel) lastNamedVisual = visual
                }

                if (absolute < absLeft) continue
                out.push({ absolute, year: y, day: d, isYearTick, subYear: true, showLabel })
            }
        }
        return out
    }

    // Precompute each break strip's visual extent so ticks inside one can be skipped cheaply.
    const breaks = ranges.map(r => {
        const vs = absoluteToVisual(r.StartYear, ranges, step)
        return { vs, ve: vs + BREAK_TICKS * step }
    })

    const seen = new Set<number>()
    for (let i = Math.floor(leftVisual / stepF); i <= Math.ceil(rightVisual / stepF); i++) {
        const visual = i * stepF
        if (breaks.some(b => visual > b.vs && visual < b.ve)) continue

        // Visual → absolute, then snap to the absolute grid. Without the snap the
        // (hiddenSize - breakSize) offset is typically non-integer, which walks tick marks off the
        // Now line after a hidden range.
        const snapped = Math.round(visualToAbsolute(visual, ranges, step) / stepF) * stepF
        if (seen.has(snapped)) continue   // two visual indices can snap to one absolute tick
        seen.add(snapped)
        if (ranges.some(r => snapped > r.StartYear && snapped < r.EndYear)) continue

        const absolute = parseFloat(snapped.toFixed(8))
        const { year, day } = dayOfYearAt(absolute, cfg)
        // ponytail: a whole-year rung names every tick. Its labels are short and BL-80 gives the
        // coarse rungs 130-300px between them, so nothing has ever collided up here; give it the gap
        // rule too if a calendar with very long year names ever turns one into a run-on string.
        out.push({ absolute, year, day, isYearTick: absolute - year < 0.000001, subYear: false, showLabel: true })
    }
    return out
}

/**
 * BL-85: the nearest position the grid actually draws a tick at.
 *
 * A rung's `stepFraction` is an even lattice -- a quarter of a year for seasons, a fifty-second for
 * weeks -- but since BL-44 its ticks sit on the calendar's own boundary days, and those are neither
 * evenly spaced nor an even division of the year. Rounding to the lattice therefore lands between
 * ticks, and the miss grows across the year: on a 365-day calendar the weeks rung is a full day out
 * by the last one. Which days those are comes from this timeline's calendar, so a three-season year
 * or a 300-day one snaps to its own boundaries and not to anybody's idea of a quarter.
 *
 * A rung the calendar cannot place -- everything from decades up, and any custom level it has no
 * days for -- still rounds to the lattice, because up there the lattice is what the grid draws.
 */
export function snapToTick(
    absolute: number,
    formatKey: string | undefined,
    cfg: CalendarFormatConfig,
    stepFraction: number,
): number {
    const stepF = stepFraction || 1
    const days = boundaryDays(formatKey, cfg)
    if (!days) return Math.round(absolute / stepF) * stepF

    // Day 0 for the reason the grid draws it: the year boundary is a tick in its own right. Walking
    // the year the position falls in and then its far edge covers every candidate, because the
    // nearest boundary to a point inside a year is in that year or is the year after it.
    const year = Math.floor(absolute)
    let best = year
    let bestGap = Infinity
    for (const d of [...new Set([0, ...days])]) {
        const t = year + d / cfg.yearLength
        const gap = Math.abs(absolute - t)
        if (gap < bestGap) { best = t; bestGap = gap }
    }
    return Math.abs(absolute - (year + 1)) < bestGap ? year + 1 : best
}

// --- Time & X-Coordinate Math ---

export const TICK_SPACING = 100; // legacy export kept for existing imports

/**
 * Pixels between two ticks at one LOD rung: the rung's own override when it has one, else the
 * timeline's `TimelineTickDistance`.
 *
 * BL-80. One tick distance for every rung means a century of history is as wide on screen as a
 * century of ticks at day zoom, and the rungs that carry the most want the most room. Zero and
 * negative read as "no override" rather than as a zero divisor.
 */
export const tickDistanceOf = (lodProfile: LodLevel[] | undefined, index: number, base: number): number => {
    const d = lodProfile?.find(l => l.index === index)?.tickDistance;
    return d && d > 0 ? d : base;
};

export const getXFromTime = (
    absoluteTime: number,
    centerTime: number,
    activeLodStep: number,
    viewportWidth: number,
    tickDistance: number,
    hiddenRanges: HiddenRange[] = []
) => {
    const centerScreenX = viewportWidth / 2;
    const visualTime   = absoluteToVisual(absoluteTime, hiddenRanges, activeLodStep);
    const visualCenter = absoluteToVisual(centerTime,   hiddenRanges, activeLodStep);
    return centerScreenX + ((visualTime - visualCenter) / activeLodStep) * tickDistance;
};

export const getTimeFromX = (
    x: number,
    centerTime: number,
    activeLodStep: number,
    viewportWidth: number,
    tickDistance: number,
    hiddenRanges: HiddenRange[] = []
) => {
    const centerScreenX = viewportWidth / 2;
    const visualCenter  = absoluteToVisual(centerTime, hiddenRanges, activeLodStep);
    const visualTime    = visualCenter + ((x - centerScreenX) / tickDistance) * activeLodStep;
    return visualToAbsolute(visualTime, hiddenRanges, activeLodStep);
};

export const isLeftOfNow = (xPos: number, viewportWidth: number) => xPos < (viewportWidth / 2);

// --- 1D Packing Engine ---

export interface LaneLock {
    laneIndex: number;
    isAbove: boolean;
    absoluteStart: number;
    absoluteEnd: number;
    isCenterOut: boolean;
    /** Lanes covered from laneIndex outward — 1 for an event box, more for a portrait. */
    laneSpan: number;
    /** Drawn width, so the next item along measures against this box and not against its stem. */
    width?: number;
}

/**
 * How many event lanes a box of this height swallows. A portrait is as tall as it is wide, which is
 * two or three event boxes, and it grows from its lane towards the axis — so without this the next
 * item along picks the lane the portrait is already sitting in and draws straight through it.
 */
export const laneSpanFor = (height: number, layoutSettings: LayoutSettings) =>
    Math.max(1, Math.ceil(height / (layoutSettings.TimelineEventBoxHeight + layoutSettings.TimelineEventYMargin)));

export const getAssignedLane = (
    itemId: string,
    xPos: number,
    width: number,
    isAboveLine: boolean,
    isCenterOut: boolean,
    absoluteStart: number,
    absoluteEnd: number,
    centerTime: number,
    activeLodStep: number,
    viewportHeight: number,
    viewportWidth: number,
    lockedLanes: Map<string, LaneLock>,
    layoutSettings: LayoutSettings,
    hiddenRanges: HiddenRange[] = [],
    // Lanes to pack around but never write to (BL-66): the reference underlay passes the active
    // timeline's locks here, so a ghost picks a lane no real item holds instead of sliding under
    // one. One-way on purpose — the active pass never sees ghosts, so its packing is unchanged.
    avoidLanes?: Map<string, LaneLock>,
    // Lanes this item covers; see laneSpanFor. Events are 1, which is what everything else was.
    laneSpan = 1,
    // How tall the shape actually draws, when that is not an event box. Only the age-band clamp
    // uses it; packing goes by laneSpan, which is this height in lanes.
    drawnHeight?: number,
    // BL-80: pixels per tick at the rung being drawn. The collision tests below are in pixels, so
    // the packer has to measure with the same distance the boxes are placed at — the canvas tweens
    // it over a LOD change. Defaults to the global setting, which is what every rung used before
    // per-rung overrides existed.
    tickDistance = layoutSettings.TimelineTickDistance
): number => {

    // One array for the whole call. The only write is step 4 below, and the one read after it
    // (keepClearOn) filters on lock.isCenterOut, which this item's own lock can never satisfy for
    // itself -- a center-out item returns from keepClearOn before reading the locks at all. This
    // used to be rebuilt inside the lane search, so a crowded canvas copied every lock on it once
    // per lane attempt per item, which is where most of a pan frame went.
    const packAround = avoidLanes
        ? [...lockedLanes.values(), ...avoidLanes.values()]
        : [...lockedLanes.values()];

    // How far out the period bars reach on a side, from the locks themselves rather than from a
    // guess at how many there are. A bar hangs away from the axis from its lane Y (see
    // updateAbsolutePositions), so the outer edge is its offset plus its own height. An age is
    // never locked, so its half-height is the floor when there are no bars at all.
    //
    // Per side, because an item can end up on the side opposite the one it asked for (see below) and
    // the two sides rarely carry the same bars.
    const keepClearOn = (side: boolean) => {
        let keepClear = layoutSettings.TimelineAgeHeight / 2;
        if (isCenterOut) return keepClear;
        let deepest = -1;
        for (const lock of packAround) {
            if (lock.isCenterOut && lock.isAbove === side) deepest = Math.max(deepest, lock.laneIndex);
        }
        if (deepest >= 0) {
            keepClear = Math.max(keepClear, layoutSettings.TimelinePeriodYOffset
                + deepest * layoutSettings.TimelinePeriodYMargin
                + layoutSettings.TimelinePeriodHeight);
        }
        return keepClear;
    };

    // 1. If already locked, return the physical Y offset
    if (lockedLanes.has(itemId)) {
        const lock = lockedLanes.get(itemId)!;
        return convertLaneIndexToY(lock.laneIndex, lock.isAbove, lock.isCenterOut, viewportHeight, layoutSettings, drawnHeight, keepClearOn(lock.isAbove));
    }

    // 2. Find the first empty Lane Index (starting at 0)
    const firstFreeLane = (side: boolean): number => {
        let laneIndex = 0;
        let hasOverlap = true;

        while (hasOverlap) {
            hasOverlap = false;

            for (const lock of packAround) {
                // Bands, not single lanes: [laneIndex, +span) against [lock.laneIndex, +its span).
                const lockSpan = lock.laneSpan ?? 1;
                const sameBand = laneIndex < lock.laneIndex + lockSpan && lock.laneIndex < laneIndex + laneSpan;
                if (lock.isCenterOut === isCenterOut && lock.isAbove === side && sameBand) {

                    // --- PERIOD COLLISION (Exact bounding box) ---
                    if (isCenterOut) {
                        const tStart = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);
                        const tEnd   = getXFromTime(lock.absoluteEnd,   centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);
                        const theirLeft  = Math.min(tStart, tEnd);
                        const theirRight = Math.max(tStart, tEnd);

                        const myStart = getXFromTime(absoluteStart, centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);
                        const myEnd   = getXFromTime(absoluteEnd,   centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);
                        const myLeft  = Math.min(myStart, myEnd);
                        const myRight = Math.max(myStart, myEnd);

                        if (myLeft < theirRight && myRight > theirLeft) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    // --- EVENT COLLISION (Stem Distance Check) ---
                    else {
                        const theirAnchorX = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);
                        const myAnchorX    = getXFromTime(absoluteStart,      centerTime, activeLodStep, viewportWidth, tickDistance, hiddenRanges);

                        // Half of each: the asking item's width alone misses a narrow box sitting
                        // under a wide one. Identical to the old test when the two are the same width.
                        if (Math.abs(myAnchorX - theirAnchorX) < (width + (lock.width ?? width)) / 2 + 15) {
                            hasOverlap = true;
                            break;
                        }
                    }
                }
            }

            if (hasOverlap) {
                laneIndex++;
                if (laneIndex > 50) break; // Failsafe
            }
        }

        return laneIndex;
    };

    // How many lanes a side has room for. Past this, convertLaneIndexToY floors the lane onto the
    // band -- and a floor is not a lane, so every deeper item drew on the same line as the last one
    // that fitted. In a dense cluster that is three titles on identical pixels with only the top one
    // readable. Events only: a period's lanes push outward from the axis and never reach the floor.
    const laneCapacity = (side: boolean) => {
        const dh = drawnHeight ?? layoutSettings.TimelineEventBoxHeight;
        const edge = (viewportHeight / 2) - (layoutSettings.TimelineEventBoxHeight * (side ? 0 : 1)) - 10;
        const band = keepClearOn(side) + (side ? dh : dh - layoutSettings.TimelineEventBoxHeight);
        const pitch = layoutSettings.TimelineEventBoxHeight + layoutSettings.TimelineEventYMargin;
        return Math.floor((edge - band) / pitch);
    };

    // 3. Spill to the other side rather than stack invisibly on this one. A crowded column usually
    // faces an empty one -- the backend balances Placement across neighbours, but a run of items
    // written in one go can all land on the same side, and then half the canvas goes unused while
    // the other half crushes. The drawn side comes from the sign of the offset returned here (see
    // updateAbsolutePositions), so crossing over needs nothing else moved.
    // ponytail: two sides, no third tier. When both are full the item still lands on its own side
    // clamped, as before; the way out of that is more vertical room, which Custom Scaling (F10)
    // already gives. Revisit only if a real timeline fills both sides at 80%.
    let side = isAboveLine;
    let laneIndex = firstFreeLane(side);
    if (!isCenterOut && laneIndex > laneCapacity(side)) {
        const spilled = firstFreeLane(!side);
        if (spilled <= laneCapacity(!side)) {
            side = !side;
            laneIndex = spilled;
        }
    }

    // 4. Lock the abstract index into memory
    lockedLanes.set(itemId, {
        laneIndex,
        isAbove: side,
        absoluteStart,
        absoluteEnd,
        isCenterOut,
        laneSpan,
        width
    });

    return convertLaneIndexToY(laneIndex, side, isCenterOut, viewportHeight, layoutSettings, drawnHeight, keepClearOn(side));
};

// --- Helper: Translates an integer lane to physical pixels ---
const convertLaneIndexToY = (laneIndex: number, isAbove: boolean, isCenterOut: boolean, viewportHeight: number, layoutSettings: LayoutSettings, drawnHeight = layoutSettings.TimelineEventBoxHeight, keepClear = layoutSettings.TimelineAgeHeight / 2): number => {
    let distanceFromCenter = 0;

    if (isCenterOut) {
        // PERIODS: Start at base offset and push outward
        distanceFromCenter = layoutSettings.TimelinePeriodYOffset + (laneIndex * layoutSettings.TimelinePeriodYMargin);
    } else {
        // EVENTS: Start at absolute container edges and push inward
        const absoluteEdge = (viewportHeight / 2) - (layoutSettings.TimelineEventBoxHeight * (isAbove ? 0 : 1)) - 10;
        distanceFromCenter = absoluteEdge - (laneIndex * layoutSettings.TimelineEventBoxHeight) - (laneIndex * layoutSettings.TimelineEventYMargin);
    }

    // The backdrop an item must not draw through: an age stripe across the axis, and the period
    // bars stacked outward from it. Neither is in the event lane space -- an Age short-circuits
    // before getAssignedLane entirely, and a Period's locks are skipped by the collision check,
    // which requires isCenterOut to match. Events pack inward from the container edge, so a deep
    // enough lane reaches both; once distanceFromCenter goes negative the box lands on the far side
    // of the axis outright. Hold every lane clear of the band instead.
    //
    // What has to clear it is the drawn box, not the lane, and the two differ by where the shape
    // hangs off targetY (see updateAbsolutePositions): above the axis a box grows downward from it,
    // so it must clear its own height as well; below the axis a portrait is lifted by
    // (drawnHeight - TimelineEventBoxHeight) so that a tall one does not run off the bottom edge,
    // and that lift has to be given back here. A period is centre-out and anchored on the axis, so
    // neither applies. drawnHeight defaults to the event box, which is every case but a portrait.
    // ponytail: unconditional, so a timeline with no ages still keeps a TimelineAgeHeight/2 gap at
    // the axis. Pass the item list down and gate on it if that ever reads as too spread. It is also
    // a floor, so several clamped items land on the same line -- only reachable on a timeline deep
    // enough to fill every lane, and the fix there is more vertical room, not more packing.
    const band = isCenterOut
        ? keepClear
        : keepClear + (isAbove ? drawnHeight : drawnHeight - layoutSettings.TimelineEventBoxHeight);
    distanceFromCenter = Math.max(band, distanceFromCenter);

    return distanceFromCenter * (isAbove ? -1 : 1);
};

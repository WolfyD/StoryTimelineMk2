/**
 * PURE MATH MODULE
 * Handles spatial coordinates, time translation, and 1D collision packing.
 */

import type { LayoutSettings, HiddenRange } from "@/types/models";


// Formatting Registry for LODs
export const FormatRegistry: Record<string, (year: number, fraction: number) => string> = {
    'MILLENNIA': (y) => `${Math.floor(y)}s`,
    'CENTURIES': (y) => `${Math.floor(y)}`,
    'DECADES': (y) => `${Math.floor(y)}`,
    'YEARS': (y) => `${Math.floor(y)}`,
    'QUARTERS': (y, f) => {
        if (f === 0) return `${Math.floor(y)}`;
        const q = Math.round(f / 0.25) + 1;
        return `Q${q}`;
    },
	'SEASONS': (y, f) => {
        if (f === 0) return `${Math.floor(y)}`;
        const months = ['Spring', 'Summer', 'Fall', 'Winter']; //TODO: replace with calendar setup
        return months[Math.round(f * 4)] || '';
    },
    'MONTHS': (y, f) => {
        if (f === 0) return `${Math.floor(y)}`;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; //TODO: replace with calendar setup
        return months[Math.round(f * 12)] || '';
    },
	'WEEKS': (y, f) => {
        if (f === 0) return `${Math.floor(y)}`;
        return `W ${Math.floor(f * 52) + 1}`; //TODO: replace with calendar setup
    },
    'DAYS': (y, f) => {
        if (f === 0) return `${Math.floor(y)}`;
        return `Day ${Math.floor(f * 365) + 1}`; //TODO: replace with calendar setup
    }
};

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

// --- Time & X-Coordinate Math ---

export const TICK_SPACING = 100; // legacy export kept for existing imports

export const getXFromTime = (
    absoluteTime: number,
    centerTime: number,
    activeLodStep: number,
    viewportWidth: number,
    layoutSettings: LayoutSettings,
    hiddenRanges: HiddenRange[] = []
) => {
    const centerScreenX = viewportWidth / 2;
    const visualTime   = absoluteToVisual(absoluteTime, hiddenRanges, activeLodStep);
    const visualCenter = absoluteToVisual(centerTime,   hiddenRanges, activeLodStep);
    return centerScreenX + ((visualTime - visualCenter) / activeLodStep) * layoutSettings.TimelineTickDistance;
};

export const getTimeFromX = (
    x: number,
    centerTime: number,
    activeLodStep: number,
    viewportWidth: number,
    layoutSettings: LayoutSettings,
    hiddenRanges: HiddenRange[] = []
) => {
    const centerScreenX = viewportWidth / 2;
    const visualCenter  = absoluteToVisual(centerTime, hiddenRanges, activeLodStep);
    const visualTime    = visualCenter + ((x - centerScreenX) / layoutSettings.TimelineTickDistance) * activeLodStep;
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
}

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
    hiddenRanges: HiddenRange[] = []
): number => {

    // 1. If already locked, return the physical Y offset
    if (lockedLanes.has(itemId)) {
        const lock = lockedLanes.get(itemId)!;
        return convertLaneIndexToY(lock.laneIndex, lock.isAbove, lock.isCenterOut, viewportHeight, layoutSettings);
    }

    // 2. Find the first empty Lane Index (starting at 0)
    let laneIndex = 0;
    let hasOverlap = true;

    while (hasOverlap) {
        hasOverlap = false;

        for (const lock of lockedLanes.values()) {
            if (lock.isCenterOut === isCenterOut && lock.isAbove === isAboveLine && lock.laneIndex === laneIndex) {

                // --- PERIOD COLLISION (Exact bounding box) ---
                if (isCenterOut) {
                    const tStart = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);
                    const tEnd   = getXFromTime(lock.absoluteEnd,   centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);
                    const theirLeft  = Math.min(tStart, tEnd);
                    const theirRight = Math.max(tStart, tEnd);

                    const myStart = getXFromTime(absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);
                    const myEnd   = getXFromTime(absoluteEnd,   centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);
                    const myLeft  = Math.min(myStart, myEnd);
                    const myRight = Math.max(myStart, myEnd);

                    if (myLeft < theirRight && myRight > theirLeft) {
                        hasOverlap = true;
                        break;
                    }
                }
                // --- EVENT COLLISION (Stem Distance Check) ---
                else {
                    const theirAnchorX = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);
                    const myAnchorX    = getXFromTime(absoluteStart,      centerTime, activeLodStep, viewportWidth, layoutSettings, hiddenRanges);

                    if (Math.abs(myAnchorX - theirAnchorX) < width + 15) {
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

    // 3. Lock the abstract index into memory
    lockedLanes.set(itemId, {
        laneIndex,
        isAbove: isAboveLine,
        absoluteStart,
        absoluteEnd,
        isCenterOut
    });

    return convertLaneIndexToY(laneIndex, isAboveLine, isCenterOut, viewportHeight, layoutSettings);
};

// --- Helper: Translates an integer lane to physical pixels ---
const convertLaneIndexToY = (laneIndex: number, isAbove: boolean, isCenterOut: boolean, viewportHeight: number, layoutSettings: LayoutSettings): number => {
    let distanceFromCenter = 0;

    if (isCenterOut) {
        // PERIODS: Start at base offset and push outward
        distanceFromCenter = layoutSettings.TimelinePeriodYOffset + (laneIndex * layoutSettings.TimelinePeriodYMargin);
    } else {
        // EVENTS: Start at absolute container edges and push inward
        const absoluteEdge = (viewportHeight / 2) - (layoutSettings.TimelineEventBoxHeight * (isAbove ? 0 : 1)) - 10;
        distanceFromCenter = absoluteEdge - (laneIndex * layoutSettings.TimelineEventBoxHeight) - (laneIndex * layoutSettings.TimelineEventYMargin);
    }

    return distanceFromCenter * (isAbove ? -1 : 1);
};

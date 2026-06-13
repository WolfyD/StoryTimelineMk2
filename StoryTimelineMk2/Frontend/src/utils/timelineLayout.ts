/**
 * PURE MATH MODULE
 * Handles spatial coordinates, time translation, and 1D collision packing.
 */

import type { LayoutSettings } from "@/types/models";


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

// --- Time & X-Coordinate Math ---

export const getXFromTime = (absoluteTime: number, centerTime: number, activeLodStep: number, viewportWidth: number, layoutSettings: LayoutSettings) => {
    const centerScreenX = viewportWidth / 2;
    const timeDifference = absoluteTime - centerTime;
    return centerScreenX + ((timeDifference / activeLodStep) * layoutSettings.TimelineTickDistance);
};

export const getTimeFromX = (x: number, centerTime: number, activeLodStep: number, viewportWidth: number, layoutSettings: LayoutSettings) => {
    const centerScreenX = viewportWidth / 2;
    const pixelDifference = x - centerScreenX;
    return centerTime + ((pixelDifference / layoutSettings.TimelineTickDistance) * activeLodStep);
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
    width: number, // If the user changes box width in settings, it passes here and updates packing!
    isAboveLine: boolean,
    isCenterOut: boolean,
    absoluteStart: number,
    absoluteEnd: number,
    centerTime: number,
    activeLodStep: number,
    viewportHeight: number,
    viewportWidth: number,
    lockedLanes: Map<string, LaneLock>,
	layoutSettings: LayoutSettings
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
                    const tStart = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings);
                    const tEnd = getXFromTime(lock.absoluteEnd, centerTime, activeLodStep, viewportWidth, layoutSettings);
                    const theirLeft = Math.min(tStart, tEnd);
                    const theirRight = Math.max(tStart, tEnd);

                    const myStart = getXFromTime(absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings);
                    const myEnd = getXFromTime(absoluteEnd, centerTime, activeLodStep, viewportWidth, layoutSettings);
                    const myLeft = Math.min(myStart, myEnd);
                    const myRight = Math.max(myStart, myEnd);

                    if (myLeft < theirRight && myRight > theirLeft) {
                        hasOverlap = true;
                        break;
                    }
                }
                // --- EVENT COLLISION (Stem Distance Check) ---
                else {
                    const theirAnchorX = getXFromTime(lock.absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings);
                    const myAnchorX = getXFromTime(absoluteStart, centerTime, activeLodStep, viewportWidth, layoutSettings);

                    // The stems must be placed further apart than the width of the box + 15px padding.
                    // This guarantees they will never overlap regardless of which way the boxes flip!
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
        // Outermost starting distance: half screen height, minus box size, minus 10px outer padding
        const absoluteEdge = (viewportHeight / 2) - (layoutSettings.TimelineEventBoxHeight * (isAbove ? 0 : 1)) - 10;
        distanceFromCenter = absoluteEdge - (laneIndex * layoutSettings.TimelineEventBoxHeight) - (laneIndex * layoutSettings.TimelineEventYMargin);
    }

    // Multiply by -1 if rendering in the top hemisphere
    return distanceFromCenter * (isAbove ? -1 : 1);
};

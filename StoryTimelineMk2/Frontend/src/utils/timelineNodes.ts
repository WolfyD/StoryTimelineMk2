import type { LayoutSettings } from '@/types/models';
import Konva from 'konva';

// Low resource mode's hover: a transform instead of a cached bitmap. Kept slight — the box grows
// from its anchor corner, not its centre, because centring it needs a position offset that
// updateAbsolutePositions() overwrites on the next pan frame.
const GROW = { x: 1.06, y: 1.06 };
const NO_GROW = { x: 1, y: 1 };

// Characters (type 7) hang a portrait off the stem the way a Picture hangs its image — same
// geometry, same loader, only rounder. Everything that special-cases pictures means both.
export const isPortraitType = (typeName: string) => typeName === "Picture" || typeName === "Character";

// A character's own timeline also carries their family's births and deaths. They are context, not
// the subject, and a full-size portrait says the opposite — so kin draw at this fraction.
export const KIN_SCALE = 0.6;

export const buildNode = (
    id: string,
    typeName: string,
    title: string,
    color: string,
    stemsMaster: Konva.Group,
    boxesMaster: Konva.Group,
	layoutSettings: LayoutSettings,
    showTitle = false,   // pictures: caption strip along the bottom edge (items.show_title)
    lowRes = false,      // low resource mode: fewer nodes per item, no cached hover bitmap
    useHighlightColor = false, // characters: fill the disc with their color (characters.use_highlight_color)
    scale = 1,           // portraits only: KIN_SCALE for a relative on someone else's timeline
    openStart = false,   // ages/periods: reaches back past its start year (items.open_start)
    openEnd = false,     // ages/periods: carries on past its end year (items.open_end)
    openFade = false,    // ages/periods: soften the open side instead of a flat edge (items.open_fade)
) => {
    const safeColor = color || (typeName === "Event" ? '#ffffff' : '#888888');
    const elements: any = {}; // Standard JS object to hold references

    if (typeName === "Age" || typeName === "Period") {
        const height = typeName === "Age" ? layoutSettings.TimelineAgeHeight : layoutSettings.TimelinePeriodHeight;
        elements.box = new Konva.Rect({
            id: `box-${id}`,
            height: height,
            fill: safeColor,
            stroke: '#ff000000',
            strokeWidth: 0,
			offsetY: height / 2
        });

		const round = typeName == "Age"
			? layoutSettings.TimelineAgeCornerRounding
			: layoutSettings.TimelinePeriodCornerRounding;
		// An open side ends in the arrowhead and the bar stops short to make room for it, so that
		// corner has to be square: a rounded one leaves a notch between the head's base and the bar.
		elements.box.cornerRadius(openStart || openEnd
			? [openStart ? 0 : round, openEnd ? 0 : round, openEnd ? 0 : round, openStart ? 0 : round]
			: round);

        // Ages/Periods don't have stems, just add the box to the upper layer
        boxesMaster.add(elements.box);

        // BL-72: "and on from there, who knows". A bar that simply stops reads as a hard boundary,
        // so an open side gets an arrowhead. Solid by default: an age whose end is merely undated
        // still happened at full strength, and dissolving it says something the writer did not.
        // `openFade` is the other claim — this one trails off — and it is the bar that fades, not
        // just the head, so the two cannot be separate gradients meeting at a seam.
        // Points and gradient are absolute, set in updateAbsolutePositions; the shape stays at 0,0.
        const soft = openFade ? fadedColor(safeColor, 0.5) : safeColor;
        for (const side of ['Start', 'End'] as const) {
            if (!(side === 'Start' ? openStart : openEnd)) continue;
            elements[`arrow${side}`] = new Konva.Line({
                id: `arrow${side}-${id}`,
                points: [],
                closed: true,
                fill: safeColor,
                fillPriority: openFade ? 'linear-gradient' : 'color',
                fillLinearGradientColorStops: openFade ? [0, soft, 1, safeColor] : [],
            });
            boxesMaster.add(elements[`arrow${side}`]);
        }
        // Read back by updateAbsolutePositions, which is the only place the bar's width is known.
        if (openFade && (openStart || openEnd)) {
            elements.box.fillPriority('linear-gradient');
            elements.fade = { soft, solid: safeColor, start: openStart, end: openEnd };
        }
    } else if (isPortraitType(typeName)) {
        const size = (layoutSettings.TimelineBoxTypesBoxWidth || layoutSettings.TimelineEventBoxHeight) * scale;
        const round = typeName === "Character";
        // Two things can carry a character's color: the disc behind the portrait, and the ring
        // around it. A portrait with transparency over a filled disc drowns the face, so the fill is
        // opt-in — but an opaque portrait covers the disc completely, so the same tick thickens the
        // ring too. Without that, the highlight does nothing at all for anyone with a solid portrait.
        const highlighted = round && useHighlightColor;
        const ring = highlighted ? Math.max(3, size * 0.08) : round ? 2 : 0;
        elements.stem = new Konva.Line({
            id: `stem-${id}`,
            points: [0, 0, 0, 0],
            stroke: safeColor,
            strokeWidth: 2,
        });
        elements.box = new Konva.Image({
            id: `box-${id}`,
            image: undefined as any,
            width: size,
            height: size,
            fill: highlighted ? safeColor : '#00000022',
            stroke: safeColor,
            strokeWidth: Math.max(ring, layoutSettings.TimelineEventBorderWidth),
            cornerRadius: round ? size / 2 : 4,
        });
        stemsMaster.add(elements.stem);
        boxesMaster.add(elements.box);
        if (showTitle) {
            // Label = Tag (background) + Text; the Text carries the label-id so clicks resolve to the item
            elements.label = new Konva.Label({ id: `caption-${id}` });
            elements.label.add(new Konva.Tag({ fill: 'rgba(0, 0, 0, 0.55)', cornerRadius: round ? 4 : [0, 0, 4, 4] }));
            // A portrait's caption is often a generated sentence, a picture's is a title — own size each.
            const captionSize = (round
                ? layoutSettings.TimelineCharacterCaptionFontSize
                : layoutSettings.TimelinePictureCaptionFontSize) * scale;
            const caption = new Konva.Text({
                id: `label-${id}`, text: title || 'Untitled', fill: '#ffffff', padding: 4, width: size, align: 'center',
                ellipsis: true, wrap: 'word', lineHeight: 1,
                fontFamily: layoutSettings.TimelineEventFontFamily, fontSize: captionSize
            });
            // A name too long for the disc folds onto a second row and is cut there. Height is left
            // to the text until it needs cutting: one row should not reserve two rows of picture.
            const twoRows = captionSize * 2 + 8; // 2 lines + the 4px padding twice
            if (caption.height() > twoRows) caption.height(twoRows);
            elements.label.add(caption);
            boxesMaster.add(elements.label);
        }
    } else {
        const boxWidth = layoutSettings.TimelineEventBoxWidth;
        const boxHeight = layoutSettings.TimelineEventBoxHeight;
        elements.stem = new Konva.Line({
            id: `stem-${id}`,
            points: [0, 0, 0, 0],
            stroke: layoutSettings.TimelineEventBorderColor,
            strokeWidth: 2
        });

		elements.box = new Konva.Rect({
            id: `box-${id}`, width: boxWidth, height: boxHeight, fill: layoutSettings.TimelineEventBackgroundColor,
            stroke: layoutSettings.TimelineEventBorderColor, strokeWidth: layoutSettings.TimelineEventBorderWidth, cornerRadius: 4
        });

        elements.label = new Konva.Text({
            id: `label-${id}`, text: title || 'Untitled', fill: layoutSettings.TimelineEventTextColor, padding: 10,
            width: boxWidth, align: 'center', ellipsis: layoutSettings.TimelineEventTextUseEllipsis, wrap: 'none', fontFamily: layoutSettings.TimelineEventFontFamily, fontSize: layoutSettings.TimelineEventFontSize
        });
		elements.label.padding(layoutSettings.TimelineEventBoxHeight / 2 - (layoutSettings.TimelineEventFontSize / 2));

        // Route the shapes to their respective Z-index master layers
        stemsMaster.add(elements.stem);
        boxesMaster.add(elements.box, elements.label);

        if (layoutSettings.TimelineEventBoxShowColor && lowRes) {
            // The color rides the border the box already has rather than a second Rect per item:
            // same information, one fewer node to walk and draw on every frame.
            elements.box.stroke(safeColor);
            elements.box.strokeWidth(Math.max(2, layoutSettings.TimelineEventBorderWidth));
        } else if (layoutSettings.TimelineEventBoxShowColor) {
            const stripSize = 5;
            const r = layoutSettings.TimelineEventBorderRadius ?? 4;
            if (layoutSettings.TimelineEventBoxShowColorOnBottom) {
                elements.colorStrip = new Konva.Rect({
                    id: `color-strip-${id}`,
                    width: boxWidth,
                    height: stripSize,
                    fill: safeColor,
                    cornerRadius: [0, 0, r, r],
                });
            } else {
                elements.colorStrip = new Konva.Rect({
                    id: `color-strip-${id}`,
                    width: stripSize,
                    height: boxHeight,
                    fill: safeColor,
                    cornerRadius: [r, 0, 0, r],
                });
            }
            boxesMaster.add(elements.colorStrip);
        }
    }

	const handleHoverEnter = () => {
        document.body.style.cursor = 'pointer';
        if (typeName === "Age" || typeName === "Period") {
            // Same grow either way; low resource mode just doesn't spend 150 ms of frames on it.
            if (lowRes) { elements.box.scaleY(1.3); elements.box.getLayer()?.batchDraw(); }
            else elements.box.to({ scaleY: 1.3, duration: 0.15, easing: Konva.Easings.EaseOut });
        } else if (lowRes) {
            // What this replaces baked a shadow into a cached bitmap on every mouseenter — two
            // offscreen canvases per item the pointer crosses. A transform costs nothing to set up.
            // Box and label share an origin, so scaling both keeps the text where it sits.
            elements.box.scale(GROW);
            if (!isPortraitType(typeName)) elements.label?.scale(GROW);   // a caption hangs off the bottom edge, not the box origin
            elements.box.getLayer()?.batchDraw();
        } else if (layoutSettings.TimelineEventHasHoverHighlight) {
            const hoverColor = layoutSettings.TimelineEventHoverColor || '#ffffff';
            // Box: bake shadow into a cached bitmap — paid once, drawn as a cheap blit on every subsequent redraw
            elements.box.shadowColor(hoverColor);
            elements.box.shadowBlur(8);
            elements.box.shadowOpacity(1);
            elements.box.cache({ padding: 10 });
            // Stem: stroke highlight — line points change on pan so it can't be safely cached
            elements.stem.stroke(hoverColor);
            elements.stem.strokeWidth(3);
            elements.box.getLayer()?.batchDraw();
        }
    };

    const handleHoverLeave = () => {
        document.body.style.cursor = 'default';
        if (typeName === "Age" || typeName === "Period") {
            if (lowRes) { elements.box.scaleY(1); elements.box.getLayer()?.batchDraw(); }
            else elements.box.to({ scaleY: 1, duration: 0.15, easing: Konva.Easings.EaseOut });
        } else if (lowRes) {
            elements.box.scale(NO_GROW);
            if (!isPortraitType(typeName)) elements.label?.scale(NO_GROW);
            elements.box.getLayer()?.batchDraw();
        } else if (layoutSettings.TimelineEventHasHoverHighlight) {
            elements.box.clearCache();
            elements.box.shadowBlur(0);
            elements.stem.stroke(layoutSettings.TimelineEventBorderColor);
            elements.stem.strokeWidth(2);
            elements.box.getLayer()?.batchDraw();
        }
    };

    // Attach listeners
    elements.box.on('mouseenter', handleHoverEnter);
    elements.box.on('mouseleave', handleHoverLeave);
    if (elements.label) {
        elements.label.on('mouseenter', handleHoverEnter);
        elements.label.on('mouseleave', handleHoverLeave);
    }

    return elements;
};

// Toggle visibility for all shapes in the object
export const setNodeVisibility = (elements: any, isVisible: boolean) => {
    if (elements.box) elements.box.visible(isVisible);
    if (elements.label) elements.label.visible(isVisible);
    if (elements.stem) elements.stem.visible(isVisible);
    if (elements.colorStrip) elements.colorStrip.visible(isVisible);
    if (elements.arrowStart) elements.arrowStart.visible(isVisible);
    if (elements.arrowEnd) elements.arrowEnd.visible(isVisible);
};

/** The same color at a fraction of its alpha. Konva's parser so named colors work, not just hex. */
const fadedColor = (color: string, alpha: number) => {
    const c = Konva.Util.colorToRGBA(color);
    return c ? `rgba(${c.r},${c.g},${c.b},${(c.a * alpha).toFixed(3)})` : color;
};

/**
 * How long the arrowhead is. Capped by what the span has to give, so two heads on a short age meet
 * in the middle instead of running out past each other.
 */
const headLength = (height: number, span: number, sides: number) =>
    sides ? Math.min(Math.max(14, height * 1.6), span / sides) : 0;

/**
 * BL-72: the arrowhead on an open side. Isosceles, a little taller than the bar so it reads as a
 * head and not a taper. `dir` is -1 for the left end, +1 for the right.
 *
 * The **point sits on the date** and the head runs back *over* the bar from there. Drawing it the
 * other way up — base on the date, point beyond it — put the arrow a headlength past the year it
 * belongs to, and left a rounded corner poking out behind the tip on any age with a corner radius.
 *
 * `fadePx` is one year in pixels, 0 when this span does not fade. The gradient runs tip → inward
 * over that distance, matching the bar's, so head and bar are one surface rather than two.
 */
const placeOpenArrow = (line: any, edgeX: number, centerY: number, height: number, dir: -1 | 1, len: number, fadePx: number) => {
    const half = height * 0.85;
    const baseX = edgeX - dir * len;
    line.points([baseX, centerY - half, edgeX, centerY, baseX, centerY + half]);
    if (fadePx > 0) {
        line.fillLinearGradientStartPoint({ x: edgeX, y: centerY });
        line.fillLinearGradientEndPoint({ x: edgeX - dir * fadePx, y: centerY });
    }
};

/**
 * The bar's own share of the fade: half-transparent at an open edge, full color one year in. The
 * gradient is in the Rect's local space (0 → width), unlike the arrow's, because the box is the
 * one shape here that carries a position.
 *
 * ponytail: one year measured at the start edge and reused at the end. They differ only across a
 * hidden range; measure per edge if that ever shows.
 */
const applyOpenFade = (elements: any, span: number, lenStart: number, fadePx: number) => {
    const f = elements.fade;
    // Never past the middle from both sides at once, or the stops cross and Konva throws.
    const run = Math.min(Math.max(fadePx, 1), span / (f.start && f.end ? 2 : 1)) / span;
    const stops: (number | string)[] = [0, f.start ? f.soft : f.solid];
    if (f.start) stops.push(run, f.solid);
    if (f.end) stops.push(1 - run, f.solid);
    stops.push(1, f.end ? f.soft : f.solid);
    // The endpoints are the span's real edges — the two dates — not the shortened bar's, so the bar
    // picks the fade up at exactly the alpha the arrowhead left off at. Konva clamps past them.
    elements.box.fillLinearGradientStartPoint({ x: -lenStart, y: 0 });
    elements.box.fillLinearGradientEndPoint({ x: span - lenStart, y: 0 });
    elements.box.fillLinearGradientColorStops(stops);
};

// Calculate absolute coordinates directly
export const updateAbsolutePositions = (
    elements: any,
    typeName: string,
    anchorX: number,
    endX: number,
    targetY: number,
    boxWidth: number,
    isLeft: boolean,
    stageCenterY: number,
	layoutSettings: LayoutSettings,
    centered = false,   // box straddles the stem instead of the sideways offset (items.centered)
    fadePx = 0,         // BL-72: one year in pixels, 0 when this span does not fade
) => {
    if (typeName === "Age" || typeName === "Period") {
		const height = typeName === "Age" ? layoutSettings.TimelineAgeHeight : layoutSettings.TimelinePeriodHeight;

		let boxy = targetY;
		if (typeName === "Period" && targetY < stageCenterY) {
			boxy = targetY - layoutSettings.TimelinePeriodHeight;
		}

		// BL-72: an open side is not an arrow laid over the bar — the bar stops short and the
		// arrowhead *is* that last stretch of it. Overlaid, the bar's own edge showed through the
		// half-transparent head, which is the one thing the fade must not do.
		const span = Math.max(1, endX - anchorX);
		const len  = headLength(height, span, (elements.arrowStart ? 1 : 0) + (elements.arrowEnd ? 1 : 0));
		const lenS = elements.arrowStart ? len : 0;
		const lenE = elements.arrowEnd ? len : 0;

		// Position adds half the height because the shape's anchor is in its center.
		const centerY = boxy + height / 2;
		elements.box.width(Math.max(1, span - lenS - lenE));
		elements.box.position({ x: anchorX + lenS, y: centerY });

		if (elements.fade) applyOpenFade(elements, span, lenS, fadePx);
		if (elements.arrowStart) placeOpenArrow(elements.arrowStart, anchorX, centerY, height, -1, len, fadePx);
		if (elements.arrowEnd) placeOpenArrow(elements.arrowEnd, anchorX + span, centerY, height, 1, len, fadePx);
    } else if (isPortraitType(typeName)) {
        // Square image centered on the stem; stem runs straight up/down
        const size = boxWidth;
        elements.box.width(size);
        elements.box.height(size);
        // Lane Y is the box top sized for TimelineEventBoxHeight; below the line a taller picture would run off the bottom edge
        const y = targetY < stageCenterY ? targetY : targetY - (size - layoutSettings.TimelineEventBoxHeight);
        elements.box.position({ x: anchorX - size / 2, y });
        elements.label?.position({ x: anchorX - size / 2, y: y + size - elements.label.height() });
        const stemEndY = targetY < stageCenterY ? y + size : y;
        elements.stem.points([anchorX, stageCenterY, anchorX, stemEndY]);
    } else {
        // Calculate the absolute X position for the box
        const boxAbsoluteX = centered ? anchorX - boxWidth / 2 : isLeft ? anchorX - boxWidth : anchorX;
		const boxPosAbsoluteX = centered ? boxAbsoluteX : boxAbsoluteX + (isLeft ? ((layoutSettings.TimelineEventBoxStemOffset / 100) * boxWidth) : ((layoutSettings.TimelineEventBoxStemOffset / 100) * boxWidth) * -1)

        elements.box.position({ x: boxPosAbsoluteX + (isLeft ? 0 : 0), y: targetY });
        elements.label.position({ x: boxPosAbsoluteX, y: targetY });

        if (elements.colorStrip) {
            const stripSize = 5;
            if (layoutSettings.TimelineEventBoxShowColorOnBottom) {
                elements.colorStrip.position({
                    x: boxPosAbsoluteX,
                    y: targetY + layoutSettings.TimelineEventBoxHeight - stripSize,
                });
            } else {
                elements.colorStrip.position({ x: boxPosAbsoluteX, y: targetY });
            }
        }

        // Calculate absolute stem connection point (straight up/down when centered)
        const stemTargetX = centered ? anchorX : isLeft ? boxAbsoluteX + (boxWidth) : boxAbsoluteX ;

        // Stem goes from the absolute baseline anchor to the absolute box connection
        elements.stem.points([anchorX, stageCenterY, stemTargetX, targetY]);
    }
};

// ─── Mini mode nodes ─────────────────────────────────────────────────────────
// Layout (100px rail):
//   Ages    — bottom 14px  (y = 86)
//   Periods — 8px just above Ages, 2px gap  (y = 76)
//   Pins    — stack downward from y=14; stem runs from y=0 to just above head
const MINI_AGE_H     = 14
const MINI_PERIOD_H  = 8
const MINI_RAIL_H    = 100
const MINI_AGE_Y     = MINI_RAIL_H - MINI_AGE_H               // 86
const MINI_PERIOD_Y  = MINI_AGE_Y - MINI_PERIOD_H - 2          // 76
const MINI_PIN_Y0    = 14    // y of first (topmost) pin head
const MINI_PIN_STEP  = 12    // px between stacked pin heads

export interface MiniPinElements {
    kind: 'pin'
    group: Konva.Group
    stem: Konva.Line
    dot: Konva.Circle
}

export interface MiniBarElements {
    kind: 'bar'
    rect: Konva.Rect
}

export type MiniNodeElements = MiniPinElements | MiniBarElements

export const buildMiniNode = (
    id: string,
    typeName: string,
    color: string,
    miniLayer: Konva.Layer,
    layoutSettings: LayoutSettings
): MiniNodeElements => {
    if (typeName === 'Age' || typeName === 'Period') {
        const h = typeName === 'Age' ? MINI_AGE_H : MINI_PERIOD_H
        const rect = new Konva.Rect({
            id: `mini-box-${id}`,
            height: h,
            fill: color || '#888888',
            listening: false,
        })
        miniLayer.add(rect)
        return { kind: 'bar', rect }
    }

    const stem = new Konva.Line({
        id: `mini-stem-${id}`,
        points: [0, 0, 0, 0],
        stroke: layoutSettings.TimelineEventBorderColor,
        strokeWidth: 1.5,
        listening: false,
    })
    const fillColor = layoutSettings.TimelineEventBoxShowColor
        ? (color || layoutSettings.TimelineEventBackgroundColor)
        : layoutSettings.TimelineEventBackgroundColor
    const dot = new Konva.Circle({
        id: `mini-dot-${id}`,
        radius: 5,
        fill: fillColor,
        stroke: layoutSettings.TimelineEventBorderColor,
        strokeWidth: 1,
        listening: false,
    })
    const group = new Konva.Group({ id: `mini-group-${id}`, listening: false, x: 0, y: 0 })
    group.add(stem, dot)
    miniLayer.add(group)
    return { kind: 'pin', group, stem, dot }
}

// stackIndex — how many other pins are already at this x column (0 = topmost)
export const setMiniNodePosition = (
    el: MiniNodeElements,
    typeName: string,
    itemX: number,
    endX: number,
    stackIndex: number = 0
) => {
    if (el.kind === 'bar') {
        const baseY = typeName === 'Age' ? MINI_AGE_Y : MINI_PERIOD_Y
        const rowH  = typeName === 'Age' ? MINI_AGE_H + 2 : MINI_PERIOD_H + 2
        const y = baseY - stackIndex * rowH
        el.rect.setAttrs({ x: itemX, y, width: Math.max(2, endX - itemX) })
    } else {
        const headY = MINI_PIN_Y0 + stackIndex * MINI_PIN_STEP
        el.group.setAttrs({ x: itemX, y: 0 })
        el.stem.points([0, 0, 0, Math.max(0, headY - 6)])
        el.dot.y(headY)
    }
}

export const setMiniNodeVisibility = (el: MiniNodeElements, visible: boolean) => {
    if (el.kind === 'bar') {
        el.rect.visible(visible)
    } else {
        el.group.visible(visible)
    }
}

import type { LayoutSettings } from '@/types/models';
import Konva from 'konva';

export const buildNode = (
    id: string,
    typeName: string,
    title: string,
    color: string,
    stemsMaster: Konva.Group,
    boxesMaster: Konva.Group,
	layoutSettings: LayoutSettings,
    showTitle = false,   // pictures: caption strip along the bottom edge (items.show_title)
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

		if(typeName == "Age"){
			elements.box.cornerRadius(layoutSettings.TimelineAgeCornerRounding);
		} else {
			elements.box.cornerRadius(layoutSettings.TimelinePeriodCornerRounding);
		}

        // Ages/Periods don't have stems, just add the box to the upper layer
        boxesMaster.add(elements.box);
    } else if (typeName === "Picture") {
        const size = layoutSettings.TimelineBoxTypesBoxWidth || layoutSettings.TimelineEventBoxHeight;
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
            fill: '#00000022',
            stroke: safeColor,
            strokeWidth: layoutSettings.TimelineEventBorderWidth,
            cornerRadius: 4,
        });
        stemsMaster.add(elements.stem);
        boxesMaster.add(elements.box);
        if (showTitle) {
            // Label = Tag (background) + Text; the Text carries the label-id so clicks resolve to the item
            elements.label = new Konva.Label({ id: `caption-${id}` });
            elements.label.add(new Konva.Tag({ fill: 'rgba(0, 0, 0, 0.55)', cornerRadius: [0, 0, 4, 4] }));
            elements.label.add(new Konva.Text({
                id: `label-${id}`, text: title || 'Untitled', fill: '#ffffff', padding: 4, width: size, align: 'center',
                ellipsis: true, wrap: 'none', fontFamily: layoutSettings.TimelineEventFontFamily, fontSize: layoutSettings.TimelineEventFontSize
            }));
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

        if (layoutSettings.TimelineEventBoxShowColor) {
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
            elements.box.to({ scaleY: 1.3, duration: 0.15, easing: Konva.Easings.EaseOut });
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
            elements.box.to({ scaleY: 1, duration: 0.15, easing: Konva.Easings.EaseOut });
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
) => {
    if (typeName === "Age" || typeName === "Period") {
        elements.box.position({ x: anchorX, y: targetY });
        elements.box.width(Math.max(1, endX - anchorX));
		const height = typeName === "Age" ? layoutSettings.TimelineAgeHeight : layoutSettings.TimelinePeriodHeight;

		let boxy = targetY;
		if (typeName === "Period" && targetY < stageCenterY) {
			boxy = targetY - layoutSettings.TimelinePeriodHeight;
		}

		// Set the width
		elements.box.width(Math.max(1, endX - anchorX));

		// Set position, adding half the height because the shape's anchor is now in its center
		elements.box.position({ x: anchorX, y: boxy + (height / 2) });
    } else if (typeName === "Picture") {
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

import type { LayoutSettings } from '@/types/models';
import Konva from 'konva';

export const buildNode = (
    id: string,
    typeName: string,
    title: string,
    color: string,
    stemsMaster: Konva.Group,
    boxesMaster: Konva.Group,
	layoutSettings: LayoutSettings
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
    }

	const handleHoverEnter = () => {
        document.body.style.cursor = 'pointer';
        if (typeName === "Age" || typeName === "Period") {
            // Grow vertically by 30%
            elements.box.to({ scaleY: 1.3, duration: 0.15, easing: Konva.Easings.EaseOut });
        } else if (layoutSettings.TimelineEventHasHoverHighlight) {
            // Glow effect
            elements.box.to({
                shadowColor: layoutSettings.TimelineEventHoverColor || '#ffffff',
                shadowBlur: 15, shadowOpacity: 1, duration: 0.15, easing: Konva.Easings.EaseOut
            });
			elements.stem.to({
				shadowColor: layoutSettings.TimelineEventHoverColor || '#ffffff',
                shadowBlur: 15, shadowOpacity: 1, duration: 0.15, easing: Konva.Easings.EaseOut
			});
        }
    };

    const handleHoverLeave = () => {
        document.body.style.cursor = 'default';
        if (typeName === "Age" || typeName === "Period") {
            // Reset scale
            elements.box.to({ scaleY: 1, duration: 0.15, easing: Konva.Easings.EaseOut });
        } else {
            // Reset glow
            elements.box.to({ shadowBlur: 0, duration: 0.15, easing: Konva.Easings.EaseOut });
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
	layoutSettings: LayoutSettings
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
    } else {
        // Calculate the absolute X position for the box
        const boxAbsoluteX = isLeft ? anchorX - boxWidth : anchorX;
		const boxPosAbsoluteX = boxAbsoluteX + (isLeft ? ((layoutSettings.TimelineEventBoxStemOffset / 100) * boxWidth) : ((layoutSettings.TimelineEventBoxStemOffset / 100) * boxWidth) * -1)

        elements.box.position({ x: boxPosAbsoluteX + (isLeft ? 0 : 0), y: targetY });
        elements.label.position({ x: boxPosAbsoluteX, y: targetY });

        // Calculate absolute stem connection point
        const stemTargetX = isLeft ? boxAbsoluteX + (boxWidth) : boxAbsoluteX ;

        // Stem goes from the absolute baseline anchor to the absolute box connection
        elements.stem.points([anchorX, stageCenterY, stemTargetX, targetY]);
    }
};

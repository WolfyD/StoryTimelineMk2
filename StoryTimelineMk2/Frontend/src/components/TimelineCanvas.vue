<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import Konva from 'konva';
import 'splitpanes/dist/splitpanes.css';
import type { LayoutSettings, TimelineItem, TimelineProject, TimelineSettings } from '@/types/models';
import type { Stage } from 'konva/lib/Stage';

import {
	TICK_SPACING, FormatRegistry, getXFromTime, getTimeFromX,
    isLeftOfNow, getAssignedLane, type LaneLock
} from '@/utils/timelineLayout';
import { buildNode, updateAbsolutePositions, setNodeVisibility } from '@/utils/timelineNodes';

const stemsMaster = new Konva.Group();
const boxesMaster = new Konva.Group();

const store = useTimelineStore();
const containerRef = ref<HTMLElement | null>(null);

let localYearCache = store.currentNowYear;
let stage: Stage | null = null;

const gridLayer = new Konva.Layer();
const uiLayer = new Konva.Layer();
const itemLayer = new Konva.Layer();
const cursorLayer = new Konva.Layer();

let cursorLine: Konva.Line | null = null;
let cursorLabel: Konva.Text | null = null;

let lastFrameTime = performance.now();
let frameCount = 0;
let fpsSum = 0;

const props = defineProps<{
    timelineItems: TimelineItem[] | null,
    timelineSettings: TimelineSettings | null,
	layoutSettings: LayoutSettings | null,
    timelineInfo: TimelineProject
}>();

const emit = defineEmits<{
    itemClick: [itemId: string]
    addItem: [typeId: number, year: number]
}>();

// --- VIEWPORT & CACHE STATE ---
const viewport = reactive({
    width: 0,
    height: 0,
    centerTime: props.timelineInfo?.StartYear || 0,
    lodStepFraction: 1 // Controls the physical math independent of the store
});

const nodeCache = new Map<string, any>();
const lockedLanes = new Map<string, LaneLock>();

// --- SAFE PROPERTY ACCESSORS ---
const getId = (item: any) => (item.Id ?? item.id)?.toString() || '';
const getAbsoluteStart = (item: any) => item.AbsoluteStart ?? item.absolute_start ?? item.Year;
const getAbsoluteEnd = (item: any) => item.AbsoluteEnd ?? item.absolute_end ?? getAbsoluteStart(item);
// Fixed Casing Trap for MinLod!
const getMinLod = (item: any) => item.MinLodLevel ?? item.min_lod_level ?? 3;
const getItemIndex = (item: any) => item.ItemIndex ?? item.item_index ?? 0;
const getTitle = (item: any) => item.Title ?? item.title ?? 'Untitled';
const getColor = (item: any) => item.Color ?? item.color ?? '#ffffff';
const getTypeId = (item: any) => item.TypeId ?? item.type_id ?? 1;

const getTypeName = (item: any) => {
    const tId = getTypeId(item);
    if (store.ItemTypes && store.ItemTypes.length > 0) return store.ItemTypes[tId - 1] || "Event";
    if (tId === 2) return "Period";
    if ([3, 6, 8, 9].includes(tId)) return "Age";
    return "Event";
};

const contextMenu = reactive({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'canvas', // 'canvas' for empty space, 'item' for a specific object
    itemId: null as string | null,
    absoluteTime: 0,
    displayYear: 0,
    displayFraction: 0
});

// Helper to close the menu when interacting elsewhere
const closeContextMenu = () => {
    contextMenu.isOpen = false;
};

// --- LAYOUT SETTINGS WATCHER ---
// Re-render the full canvas whenever layout settings change (e.g. after saving settings)
watch(() => props.layoutSettings, (newLs) => {
    if (!stage || !newLs) return;
    nodeCache.clear();
    lockedLanes.clear();
    stemsMaster.destroyChildren();
    boxesMaster.destroyChildren();
    renderGrid(gridLayer, newLs);
    RenderUiLayer(uiLayer, newLs);
    renderItems(store.items || props.timelineItems || [], newLs);
});

// --- LOD ANIMATION WATCHER ---
let lodAnim: number | null = null;
watch(() => store.currentLodIndex, (newIdx, oldIdx) => {
    lockedLanes.clear(); // Clear collision cache so shapes can re-evaluate on zoom

    const oldStep = store.lodProfile?.[oldIdx]?.stepFraction || 1;
    const targetStep = store.lodProfile?.[newIdx]?.stepFraction || 1;

    if (props.layoutSettings?.TimelineAnimateLodChange) {
        const duration = props.layoutSettings.TimelineLodChangeAnimationLength || 300;
        const startTime = performance.now();

        function step(currentTime: number) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

            // Dynamically stretch the math over time
            viewport.lodStepFraction = oldStep + (targetStep - oldStep) * ease;

            // FIX: Clear the lane cache EVERY frame so they dynamically dodge
            // each other and re-pack as they compress or expand!
            lockedLanes.clear();

            renderGrid(gridLayer, props.layoutSettings);
            renderItems(store.items || props.timelineItems || [], props.layoutSettings!);

            if (progress < 1) {
                lodAnim = requestAnimationFrame(step);
            }
        }

        if (lodAnim) cancelAnimationFrame(lodAnim);
        lodAnim = requestAnimationFrame(step);
    } else {
        viewport.lodStepFraction = targetStep;
        renderGrid(gridLayer, props.layoutSettings);
        setTimeout(()=>{
			renderItems(store.items || props.timelineItems || [], props.layoutSettings!);
		}, 100)
    }
});

// --- RENDER LOOPS ---
const renderGrid = (layer: Konva.Layer, layoutSettings: LayoutSettings) => {
    layer.destroyChildren();

    const currentLod = store.lodProfile?.[store.currentLodIndex];
    if (!currentLod) return;

    // Use the animating viewport step instead of the static store step
    const step = viewport.lodStepFraction;

    const leftMostTime = getTimeFromX(0, viewport.centerTime, step, viewport.width, store.layoutSettings!);
    const rightMostTime = getTimeFromX(viewport.width, viewport.centerTime, step, viewport.width, store.layoutSettings!);

    // We still format text based on the TARGET step (e.g. decades), to prevent the text from glitching mid-animation
    const targetStep = currentLod.stepFraction || 1;
    const startTickIndex = Math.floor(leftMostTime / targetStep);
    const endTickIndex = Math.ceil(rightMostTime / targetStep);

    for (let i = startTickIndex; i <= endTickIndex; i++) {
        const tickTime = i * targetStep;
        const cleanTime = parseFloat(tickTime.toFixed(8));
        const year = Math.floor(cleanTime);
        let fraction = cleanTime - year;
        if (fraction > 0.99) fraction = 0;

        const x = getXFromTime(cleanTime, viewport.centerTime, step, viewport.width, store.layoutSettings!);
        const formatter = FormatRegistry[currentLod.formatKey] || FormatRegistry['YEARS'];

		const tick = new Konva.Line({ points: [x, viewport.height / 2 - 10, x, viewport.height / 2 + 10], stroke: '#ffffff88', strokeWidth: layoutSettings.TimelineTickWidth });

		const text = new Konva.Text({ x: x - 50, y: viewport.height / 2 + 15,
			text: formatter(year, fraction), fill: layoutSettings.TimelineTickMarkerTextColor, align: 'center',
			width: 100, fontStyle: layoutSettings.TimelineTickMarkerFontStyle, fontFamily: layoutSettings.TimelineTickMarkerFontFamily });

        layer.add(tick);
        layer.add(text);
    }
    layer.batchDraw();
};

const renderItems = (items: any[], ls: LayoutSettings) => {
    const screenBuffer = 400;
    const activeItemIds = new Set();
    const stageCenterY = viewport.height / 2;
    const currentLodIndex = store.currentLodIndex;

    // Animate using the active viewport step!
    const activeStep = viewport.lodStepFraction;

    const sortedItems = [...items].sort((a, b) => getAbsoluteStart(a) - getAbsoluteStart(b));

    for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        const itemIdStr = getId(item);
        const typeName = getTypeName(item);

        const minLod = parseInt(getMinLod(item), 10);
        if (!isNaN(minLod) && minLod > currentLodIndex) continue;

        const absoluteStart = getAbsoluteStart(item);
        if (absoluteStart === undefined) continue;

        const itemX = getXFromTime(absoluteStart, viewport.centerTime, activeStep, viewport.width, ls);
        const isAgeOrPeriod = typeName === "Age" || typeName === "Period";
        let endX = itemX;

        if (isAgeOrPeriod) {
            const absoluteEnd = getAbsoluteEnd(item) || (absoluteStart + activeStep);
            endX = getXFromTime(absoluteEnd, viewport.centerTime, activeStep, viewport.width, ls);
            if (Math.max(itemX, endX) < -screenBuffer || Math.min(itemX, endX) > viewport.width + screenBuffer) {
                lockedLanes.delete(itemIdStr);
                continue;
            }
        } else {
            if (itemX < -screenBuffer || itemX > viewport.width + screenBuffer) {
                lockedLanes.delete(itemIdStr);
                continue;
            }
        }

        activeItemIds.add(itemIdStr);

        let elements = nodeCache.get(itemIdStr);
        if (!elements) {
            elements = buildNode(itemIdStr, typeName, getTitle(item), getColor(item), stemsMaster, boxesMaster, ls);
            nodeCache.set(itemIdStr, elements);
        }

        setNodeVisibility(elements, true);

        let targetY = 0;
        const boxWidth = isAgeOrPeriod ? Math.max(1, endX - itemX) : ls.TimelineEventBoxWidth;

        if (typeName === "Age") {
            targetY = stageCenterY - ls.TimelineAgeHeight / 2;
        } else {
            const isAboveLine = getItemIndex(item) % 2 !== 0;
            targetY = stageCenterY + getAssignedLane(
                itemIdStr, itemX, boxWidth, isAboveLine, isAgeOrPeriod,
                absoluteStart, getAbsoluteEnd(item), viewport.centerTime, activeStep,
                viewport.height - ls.TimelineEdgeMarginWidth * 2 + (isAboveLine ? 20 : 0), viewport.width, lockedLanes, ls
            );
        }

        const isLeft = isLeftOfNow(itemX, viewport.width);
        updateAbsolutePositions(elements, typeName, itemX, endX, targetY, boxWidth, isLeft, stageCenterY, ls);
    }

    for (const [id, elements] of nodeCache.entries()) {
        if (!activeItemIds.has(id)) setNodeVisibility(elements, false);
    }

    itemLayer.batchDraw();
};

function RenderUiLayer(ui_layer: Konva.Layer, ls: LayoutSettings) {
    ui_layer.destroyChildren();

    const nowLine = new Konva.Line({ points: [viewport.width / 2, 0, viewport.width / 2, viewport.height], stroke: '#ff0000', strokeWidth: 2});
    const nowText = new Konva.Text({ text: "Now", stroke: '#0000', fill: '#ff0000', x: viewport.width / 2 + 10, y: 0, fontFamily: "Times", fontSize: 32 });
    const nowTextBottom = new Konva.Text({ align: 'right', text: "Now", stroke: '#0000', fill: '#ff0000', x: -10, y: viewport.height - 32, fontFamily: "Times", fontSize: 32, width: viewport.width / 2 });
    const centerLine = new Konva.Line({ points: [0, viewport.height / 2, viewport.width, viewport.height / 2], stroke: '#ffffff88', strokeWidth: 2 });
    const dataRange = new Konva.Rect({ x: viewport.width / 2 - (ls.TimelineDataRangeWidth / 2), width: ls.TimelineDataRangeWidth, y: 0, height: viewport.height, fill: ls.TimelineDataRangeColor });

	switch (ls.TimelineNowLineStyle) {
		case "dotted": nowLine.dash([1, 1]); break;
		case "solid": nowLine.dash([0]); break;
		default: nowLine.dash([5, 5]); break;
	}

	nowLine.stroke(ls.TimelineNowLineColor);
	nowText.fill(ls.TimelineNowLineColor);
	nowTextBottom.fill(ls.TimelineNowLineColor);

	if(ls.TimelineShowNowLine){ ui_layer.add(nowLine); }
	if(ls.TimelineShowNowLineText){ ui_layer.add(nowText, nowTextBottom); }

	if(ls.TimelineIsDataRangeVisible) {
		ui_layer.add(dataRange);
	}

    ui_layer.add(centerLine);
}

// --- CURSOR MARKER ---

let lastMouseX: number | null = null;
let mouseOnCanvas = false;
let shiftHeld = false;

// Refresh when the view pans or LOD animates, even without mouse movement
watch(() => [viewport.centerTime, viewport.lodStepFraction], () => {
    if (mouseOnCanvas && lastMouseX !== null) updateCursor(lastMouseX);
});

function initCursorShapes() {
    cursorLine = new Konva.Line({
        points: [0, 0, 0, viewport.height],
        stroke: 'rgba(255, 80, 80, 0.8)',
        strokeWidth: 1,
        listening: false,
        visible: false,
    });
    cursorLabel = new Konva.Text({
        x: 0, y: 8,
        text: '',
        fill: '#ff5050',
        fontSize: 11,
        fontFamily: 'sans-serif',
        listening: false,
        visible: false,
    });
    cursorLayer.add(cursorLine, cursorLabel);
}

function updateCursor(mouseX: number) {
    if (!cursorLine || !cursorLabel || !store.layoutSettings || !store.lodProfile) return;

    const step = viewport.lodStepFraction;
    const rawTime = getTimeFromX(mouseX, viewport.centerTime, step, viewport.width, store.layoutSettings);
    const snappedTime = shiftHeld ? rawTime : Math.round(rawTime / step) * step;
    const snappedX = shiftHeld ? mouseX : getXFromTime(snappedTime, viewport.centerTime, step, viewport.width, store.layoutSettings);

    const year = Math.floor(snappedTime);
    const fraction = parseFloat((snappedTime - year).toFixed(8));
    const currentLod = store.lodProfile[store.currentLodIndex];
    const formatKey = currentLod?.formatKey ?? 'YEARS';
    const formatter = FormatRegistry[formatKey] || FormatRegistry['YEARS'];

    cursorLine.points([snappedX, 0, snappedX, viewport.height]);
    cursorLine.visible(true);

    const labelW = 130;
    cursorLabel.x(snappedX + 8 + labelW > viewport.width ? snappedX - labelW - 4 : snappedX + 8);
    const baseLabel = formatter ? formatter(year, fraction < 0.000001 ? 0 : fraction) : String(year);
    // At sub-year LODs the formatter returns only the sub-label ("Summer", "March" etc.) without
    // the year — append it so the cursor always shows the full date ("Summer 1995").
    cursorLabel.text(fraction < 0.000001 ? baseLabel : `${baseLabel} ${year}`);
    cursorLabel.visible(true);

    cursorLayer.batchDraw();
}

function hideCursor() {
    if (!cursorLine || !cursorLabel) return;
    cursorLine.visible(false);
    cursorLabel.visible(false);
    cursorLayer.batchDraw();
}

// --- STATE MANAGEMENT ---

function jumpToYear(targetYear: number) {
    viewport.centerTime = targetYear;
    localYearCache = Math.floor(parseInt(targetYear));
    store.setNowYear(localYearCache);

    if (stage) {
		renderGrid(gridLayer, props.layoutSettings);
		renderItems(store.items || props.timelineItems || [], props.layoutSettings!);
		updateCurrentYearInStore();
	}
}

function updateStageSize() {
    if (!stage || !containerRef.value) return;
    stage.width(containerRef.value.clientWidth);
    stage.height(containerRef.value.clientHeight);
    viewport.width = containerRef.value.clientWidth;
    viewport.height = containerRef.value.clientHeight;

    renderGrid(gridLayer, props.layoutSettings);
    RenderUiLayer(uiLayer, props.layoutSettings!);
    lockedLanes.clear();
    renderItems(store.items || props.timelineItems || [], props.layoutSettings!);
}

const updateCurrentYearInStore = () => {
    const currentYear = Math.floor(viewport.centerTime);
    if (currentYear !== localYearCache) {
        localYearCache = currentYear;
        store.setNowYear(currentYear);
    }
};

function trackFps() {
    const now = performance.now();
    const deltaTime = now - lastFrameTime;
    lastFrameTime = now;

    if (deltaTime <= 0) return;
    fpsSum += 1000 / deltaTime;
    frameCount++;

    if (frameCount >= 100) {
        store.setFpsDisplay(Math.round(fpsSum / frameCount));
        frameCount = 0;
        fpsSum = 0;
    }
}

function animateJumpToYear(targetYear: number, durationMs: number = 600) {
    const startYear = viewport.centerTime;
    const yearDifference = targetYear - startYear;
    const startTime = performance.now();

    function step(currentTime: number) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        viewport.centerTime = startYear + (yearDifference * easeProgress);

        renderGrid(gridLayer, props.layoutSettings);
        renderItems(store.items || props.timelineItems || [], props.layoutSettings!);

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            localYearCache = Math.floor(targetYear);
            store.setNowYear(localYearCache);
        }
    }

    requestAnimationFrame(step);
}

function findNextFullYear(nowY: number, positive: boolean) {
	if (viewport.lodStepFraction < 1) {
		jumpToYear(positive ? Math.floor(nowY) + 1 : Math.ceil(nowY) - 1);
	} else {
		jumpToYear(findNearestTick(positive));
	}
}

function findNearestTick(positive: boolean): number {
	const frac = viewport.lodStepFraction;
	const currentIndex = Math.round(viewport.centerTime / frac);
	return (currentIndex + (positive ? 1 : -1)) * frac;
}

// --- INITIALIZATION ---
onMounted(() => {
    let block_index = 1;
    let period_index = 1;
    if (props.timelineItems) {
        props.timelineItems.forEach(item => {
            const tId = getTypeId(item);
            if (tId == 2) {
                item.ItemIndex = period_index++;
            } else if ([3, 6, 8, 9].indexOf(tId) < 0) {
                item.ItemIndex = block_index++;
            }
        });
    }

    if (!containerRef.value) return;
    stage = new Konva.Stage({
        container: containerRef.value,
        width: containerRef.value.clientWidth,
        height: containerRef.value.clientHeight
    });

    viewport.width = stage.width();
    viewport.height = stage.height();

    // Set initial LOD to prevent NaN issues
    viewport.lodStepFraction = store.lodProfile?.[store.currentLodIndex]?.stepFraction || 1;

    itemLayer.add(stemsMaster);
    itemLayer.add(boxesMaster);

	stage.add(uiLayer);

	if(store.layoutSettings?.TimelineTickMarkerTextAlwaysOnTop) {
		stage.add(itemLayer);
		stage.add(gridLayer);
	}else {
		stage.add(gridLayer);
		stage.add(itemLayer);
	}
    stage.add(cursorLayer); // always on top

    initCursorShapes();

    renderItems(store.items || props.timelineItems || [], props.layoutSettings!);

	stage.on('contextmenu', (e) => {
        e.evt.preventDefault(); // Stop the default browser right-click menu

        const pos = stage.getPointerPosition();
        if (!pos || !store.layoutSettings) return;

        // Calculate the time at the mouse position, snapping to the nearest tick unless shift is held
        const rawTime = getTimeFromX(pos.x, viewport.centerTime, viewport.lodStepFraction, viewport.width, store.layoutSettings);
        const step = viewport.lodStepFraction;
        const absoluteTime = e.evt.shiftKey ? rawTime : Math.round(rawTime / step) * step;

        const cleanTime = parseFloat(absoluteTime.toFixed(8));
        const year = Math.floor(cleanTime);
        const fraction = cleanTime - year;

        // Update the menu state
        contextMenu.x = pos.x;
        contextMenu.y = pos.y;
        contextMenu.absoluteTime = absoluteTime;
        contextMenu.displayYear = year;
        contextMenu.displayFraction = parseFloat(fraction.toFixed(4));

        // Determine what we clicked on
        const targetId = e.target.id();

        // Because we flattened the layers, our shapes have IDs like "box-123", "label-123"
        if (targetId && (targetId.startsWith('box-') || targetId.startsWith('label-') || targetId.startsWith('stem-'))) {
            // We clicked an item! Extract the real ID (everything after the first dash)
            const itemId = targetId.split('-').slice(1).join('-');

            contextMenu.type = 'item';
            contextMenu.itemId = itemId;
        } else {
            // We clicked empty canvas space
            contextMenu.type = 'canvas';
            contextMenu.itemId = null;
        }

        hideCursor();
        contextMenu.isOpen = true;
    });

    // 2. Left-click on an item emits itemClick; otherwise close context menu
    stage.on('click', (e) => {
        if (hasDragged) { hasDragged = false; return; }
        if (contextMenu.isOpen) { closeContextMenu(); return; }
        const targetId = e.target.id();
        if (targetId && (targetId.startsWith('box-') || targetId.startsWith('label-') || targetId.startsWith('stem-'))) {
            const itemId = targetId.split('-').slice(1).join('-');
            emit('itemClick', itemId);
        }
    });

    stage.on('mousedown dragstart wheel', () => {
        if (contextMenu.isOpen) closeContextMenu();
    });

    const DRAG_THRESHOLD = 5;
    let isDragging = false;
    let hasDragged = false;
    let lastPointerX = 0;
    let dragStartX = 0;

    stage.on('mousedown', (e) => {
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        if (e.evt.button !== 0) { return; }
        isDragging = true;
        hasDragged = false;
        lastPointerX = pos.x;
        dragStartX = pos.x;
    });

    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') { shiftHeld = true;  if (mouseOnCanvas && lastMouseX !== null) updateCursor(lastMouseX); } });
    window.addEventListener('keyup',   (e) => { if (e.key === 'Shift') { shiftHeld = false; if (mouseOnCanvas && lastMouseX !== null) updateCursor(lastMouseX); } });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    });

    stage.on('mousemove', (e) => {
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;

        if (isDragging) {
            if (!hasDragged && Math.abs(pos.x - dragStartX) < DRAG_THRESHOLD) {
                lastPointerX = pos.x;
                return;
            }
            hasDragged = true;
            const deltaX = pos.x - lastPointerX;
            if (deltaX === 0) return;

            document.body.style.cursor = 'grabbing';
            viewport.centerTime -= (deltaX / store.layoutSettings!.TimelineTickDistance) * viewport.lodStepFraction;
            lastPointerX = pos.x;

            renderGrid(gridLayer, props.layoutSettings!);
            renderItems(store.items || props.timelineItems || [], props.layoutSettings!);
            updateCurrentYearInStore();
            hideCursor();
            return;
        }

        // Cursor marker: hide over item shapes or when context menu is open
        const targetId = e.target.id();
        const overItem = targetId && (targetId.startsWith('box-') || targetId.startsWith('label-') || targetId.startsWith('stem-'));
        if (overItem || contextMenu.isOpen) {
            hideCursor();
        } else {
            mouseOnCanvas = true;
            lastMouseX = pos.x;
            updateCursor(pos.x);
        }
    });

    stage.on('mouseleave', () => {
        mouseOnCanvas = false;
        lastMouseX = null;
        hideCursor();
    });

    stage.on('mouseenter', () => {
        mouseOnCanvas = true;
    });

    stage.on('wheel', (event) => {
        const e = event.evt as WheelEvent;
        if (!e) return;
		if (e.deltaY) {
			const positive = e.deltaY < 0;
			if (e.shiftKey) {
				findNextFullYear(viewport.centerTime, positive);
			} else {
				jumpToYear(findNearestTick(positive));
			}
		} else if (e.deltaX) {
			jumpToYear(findNearestTick(e.deltaX > 0));
		}
    });

    RenderUiLayer(uiLayer, props.layoutSettings!);
    renderGrid(gridLayer, props.layoutSettings);

    window.setInterval(trackFps, 20);
});

defineExpose({
    animateJumpToYear,
	jumpToYear,
    updateStageSize,
    gridLayer,
    uiLayer
});
</script>

<template>
    <div style="position: relative; width: 100%; height: 100%;" @click="closeContextMenu">
        <div ref="containerRef" style="width: 100%; height: 100%;"></div>

        <div v-if="contextMenu.isOpen"
             class="context-menu"
             :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
             @click.stop>

			 <template v-if="contextMenu.type === 'canvas'">
                <div class="menu-header">
                    Year: {{ contextMenu.displayYear }} <br/>
                    <small>Fraction: {{ contextMenu.displayFraction }}</small>
                </div>
                <button class="menu-item" @click="emit('addItem', 1, contextMenu.displayYear); closeContextMenu()">
                    <i class="ri-calendar-event-line"></i> Add Event Here
                </button>
                <button class="menu-item" @click="emit('addItem', 2, contextMenu.displayYear); closeContextMenu()">
                    <i class="ri-expand-left-right-line"></i> Add Period Here
                </button>
            </template>

            <template v-else>
                <div class="menu-header">Item Options</div>
                <button class="menu-item" @click="emit('itemClick', contextMenu.itemId!); closeContextMenu()">
                    <i class="ri-edit-line"></i> Edit Item
                </button>
                <div class="menu-separator"></div>
                <button class="menu-item danger" @click="console.log('Delete', contextMenu.itemId)">
                    <i class="ri-delete-bin-line"></i> Delete Item
                </button>
            </template>

        </div>
    </div>
</template>

<style scoped lang="scss">
.context-menu {
    position: absolute;
    z-index: 1000;
    min-width: 180px;
    background-color: #1e293b; /* Dark theme background */
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    padding: 6px 0;
    font-family: sans-serif;
    color: #f8fafc;

    .menu-header {
        padding: 8px 12px;
        font-size: 0.85rem;
        font-weight: 600;
        color: #94a3b8;
        border-bottom: 1px solid #334155;
        margin-bottom: 4px;

        small {
            font-weight: normal;
            font-size: 0.75rem;
        }
    }

    .menu-separator {
        height: 1px;
        background-color: #334155;
        margin: 4px 0;
    }

    .menu-item {
        background: none;
        border: none;
        color: #f8fafc;
        text-align: left;
        padding: 8px 12px;
        font-size: 0.9rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background-color 0.1s ease;

        &:hover {
            background-color: #334155;
        }

        &.danger {
            color: #ef4444;
            &:hover {
                background-color: rgba(239, 68, 68, 0.1);
            }
        }

        i {
            font-size: 1.1em;
        }
    }
}
</style>

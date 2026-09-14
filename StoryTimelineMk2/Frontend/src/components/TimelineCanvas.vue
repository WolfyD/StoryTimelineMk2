<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import Konva from 'konva';
import 'splitpanes/dist/splitpanes.css';
import type { LayoutSettings, TimelineItem, TimelineProject, TimelineSettings } from '@/types/models';
import type { Stage } from 'konva/lib/Stage';
import { BackendAPI } from '@/bridge/api';

import {
	BREAK_TICKS, absoluteToVisual, visualToAbsolute,
	getXFromTime, getTimeFromX,
    isLeftOfNow, getAssignedLane, type LaneLock
} from '@/utils/timelineLayout';
import {
    buildNode, updateAbsolutePositions, setNodeVisibility,
    buildMiniNode, setMiniNodePosition, setMiniNodeVisibility,
    type MiniNodeElements,
} from '@/utils/timelineNodes';

const stemsMaster = new Konva.Group();
const boxesMaster = new Konva.Group();

const store = useTimelineStore();
const containerRef = ref<HTMLElement | null>(null);
const boundaryStartPx = ref<number | null>(null);
const boundaryEndPx   = ref<number | null>(null);

let localYearCache = store.currentNowYear;
let _lastPanelUpdateMs = 0;
let stage: Stage | null = null;
let _canvasResizeObserver: ResizeObserver | null = null;
let _fpsRafId: number | null = null;
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let _keyupHandler:   ((e: KeyboardEvent) => void) | null = null;
let _mouseupHandler: ((e: MouseEvent) => void) | null = null;
let _windowMoveHandler: ((e: MouseEvent) => void) | null = null;
let _jumpRafId: number | null = null;
let _midMouseRafId: number | null = null;

// Custom SVG arrow cursors — Windows renders e-resize/w-resize identically to ew-resize (all ↔)
const MID_CURSOR_LEFT   = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><polygon points='0,10 14,2 14,8 20,8 20,12 14,12 14,18' fill='white' stroke='%23444' stroke-width='1.5' stroke-linejoin='round'/></svg>") 0 10, w-resize`;
const MID_CURSOR_RIGHT  = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><polygon points='20,10 6,2 6,8 0,8 0,12 6,12 6,18' fill='white' stroke='%23444' stroke-width='1.5' stroke-linejoin='round'/></svg>") 20 10, e-resize`;
const MID_CURSOR_CENTER = `ew-resize`;

const gridLayer = new Konva.Layer();
const uiLayer = new Konva.Layer();
uiLayer.listening(false);
const itemLayer = new Konva.Layer();
const miniLayer = new Konva.Layer();
const miniNodeCache = new Map<string, MiniNodeElements>();
// Persistent lane assignments for mini mode — keyed by item ID, cleared on mode/layout change.
// Using absolute time for conflict detection keeps assignments stable across panning.
const miniPinLanes = new Map<string, { absKey: number; idx: number }>();
const miniBarLanes = new Map<string, { rowIdx: number; absStart: number; absEnd: number; typeName: string }>();
const boundaryOverlayLayer = new Konva.Layer();
const tooltip = ref({ visible: false, text: '', x: 0, y: 0 });
const cursor = ref({ visible: false, x: 0, lineY0: 0, lineY1: 0, labelRight: true, labelY: 0, labelText: '', fracText: '' });

let _fpsFrameCount = 0;
let _fpsWindowStart = 0;

const props = defineProps<{
    timelineItems: TimelineItem[] | null,
    dimmableItems?: TimelineItem[],
    timelineSettings: TimelineSettings | null,
	layoutSettings: LayoutSettings | null,
    timelineInfo: TimelineProject,
    miniMode?: boolean,
}>();

const emit = defineEmits<{
    itemClick: [itemId: string]
    viewItem: [itemId: string]
    addItem: [typeId: number, absoluteTime: number, lodIndex: number]
    miniHover: [payload: { item: TimelineItem; x: number; y: number } | null]
}>();

// --- VIEWPORT & CACHE STATE ---
const viewport = reactive({
    width: 0,
    height: 0,
    centerTime: store.centerAbsoluteTime || props.timelineInfo?.StartYear || 0,
    lodStepFraction: 1 // Controls the physical math independent of the store
});

const nodeCache = new Map<string, any>();
const bookmarkNodeCache = new Map<string, { group: Konva.Group; line: Konva.Line; dot: Konva.Circle }>();
const pictureImageCache = new Map<string, HTMLImageElement>();
const pictureLoadingSet = new Set<string>();
const lockedLanes = new Map<string, LaneLock>();

const expandedRangeIds = new Set<number>();
const getActiveRanges = () => store.hiddenRanges.filter(r => !expandedRangeIds.has(r.Id));

// Pan state: gridPanOffset tracks how far we've panned since the last full grid rebuild.
// When it exceeds DRIFT_THRESHOLD, the grid ticks are stale and we rebuild them.
// Between rebuilds, only renderWithDimming() is called (fast: position updates + batchDraw).
// GRID_EXTRA_PX is how many extra pixels of grid ticks are rendered beyond the viewport
// on each side so panning a bit doesn't immediately hit an empty area.
let gridPanOffset = 0;
const DRIFT_THRESHOLD = 300;
const GRID_EXTRA_PX   = 500;
const toggleRange = (id: number) => {
    if (expandedRangeIds.has(id)) expandedRangeIds.delete(id);
    else expandedRangeIds.add(id);
    lockedLanes.clear();
    if (props.layoutSettings) {
        renderGrid(gridLayer, props.layoutSettings);
        renderWithDimming(props.layoutSettings);
    }
};

// --- SAFE PROPERTY ACCESSORS ---
const getId = (item: any) => (item.Id ?? item.id)?.toString() || '';
const getAbsoluteStart = (item: any) => item.AbsoluteStart ?? item.absolute_start ?? item.Year;
const getAbsoluteEnd = (item: any) => item.AbsoluteEnd ?? item.absolute_end ?? getAbsoluteStart(item);
const getLodMask = (item: any) => item.LodVisibilityMask ?? item.lod_visibility_mask ?? 255;
const getItemIndex = (item: any) => item.ItemIndex ?? item.item_index ?? 0;
const getTitle = (item: any) => item.Title ?? item.title ?? 'Untitled';
const getColor = (item: any) => item.Color ?? item.color ?? '#ffffff';
const getTypeId = (item: any) => item.TypeId ?? item.type_id ?? 1;

const getTypeName = (item: any) => {
    const tId = getTypeId(item);
    if (store.ItemTypes && store.ItemTypes.length > 0) return store.ItemTypes[tId - 1] || "Event";
    if (tId === 2) return "Period";
    if (tId === 4) return "Picture";
    if ([3, 6, 8, 9].includes(tId)) return "Age";
    return "Event";
};

const contextMenu = reactive({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'canvas', // 'canvas' | 'item' | 'boundary'
    itemId: null as string | null,
    itemTitle: '',
    absoluteTime: 0,
    displayYear: 0,
    displayFraction: 0,
    boundaryLabel: '',
    itemTypeId: 1,
    itemAbsoluteStart: 0,
    itemAbsoluteEnd: 0,
});

function setCanvasDistancePoint(which: 'from' | 'to') {
    if (which === 'from') store.setDistanceFrom(contextMenu.absoluteTime);
    else store.setDistanceTo(contextMenu.absoluteTime);
    store.setNotesDistanceTab('distance');
    closeContextMenu();
}

function setItemDistancePoint(which: 'from' | 'to' | 'both') {
    if (which === 'from' || which === 'both') store.setDistanceFrom(contextMenu.itemAbsoluteStart);
    if (which === 'to'   || which === 'both') store.setDistanceTo(contextMenu.itemAbsoluteEnd);
    store.setNotesDistanceTab('distance');
    closeContextMenu();
}

// Helper to close the menu when interacting elsewhere
const closeContextMenu = () => {
    contextMenu.isOpen = false;
};

// --- BOUNDARY HELPERS ---
const getBoundaries = () => {
    const items = store.items;
    const startItem = items.find(i => getTypeId(i) === 8);
    const endItem   = items.find(i => getTypeId(i) === 9);
    return {
        min:     startItem != null ? getAbsoluteStart(startItem) : -Infinity,
        max:     endItem   != null ? getAbsoluteStart(endItem)   :  Infinity,
        startId: startItem ? getId(startItem) : null,
        endId:   endItem   ? getId(endItem)   : null,
    };
};

const clampToBoundaries = (time: number): number => {
    const { min, max } = getBoundaries();
    return Math.max(isFinite(min) ? min : -Infinity, Math.min(isFinite(max) ? max : Infinity, time));
};

const hasTimelineStart = computed(() => store.items.some(i => getTypeId(i) === 8));
const hasTimelineEnd   = computed(() => store.items.some(i => getTypeId(i) === 9));

const addBoundaryItem = async (typeId: 8 | 9, absoluteTime: number) => {
    closeContextMenu();
    const year = Math.floor(absoluteTime);
    const id   = crypto.randomUUID();
    const item: TimelineItem = {
        Id: id, Title: typeId === 8 ? 'Timeline Start' : 'Timeline End',
        Description: '', Content: '', StoryId: null,
        TypeId: typeId,
        Year: year, AbsoluteStart: absoluteTime,
        EndYear: year, AbsoluteEnd: absoluteTime,
        BookTitle: '', Chapter: '', Page: '',
        Color: typeId === 8 ? '#22c55e' : '#ef4444',
        CreationGranularity: store.currentLodIndex,
        TimelineId: props.timelineInfo.Id,
        ItemIndex: 0, ShowInNotes: false, Importance: 0, MinLodLevel: 0,
    };
    const result = await BackendAPI.SaveItem(item, [], [], [], []);
    if (result?.status === 'ok') {
        store.addItem({ ...item, Id: result.itemId });
        if (props.layoutSettings) {
            renderGrid(gridLayer, props.layoutSettings);
            renderWithDimming(props.layoutSettings);
        }
    }
};

const addBookmark = async (absoluteTime: number) => {
    closeContextMenu();
    const year = Math.floor(absoluteTime);
    const id = crypto.randomUUID();
    const bm: TimelineItem = {
        Id: id, Title: `Bookmark ${year}`,
        Description: '', Content: '', StoryId: null,
        TypeId: 6,
        Year: year, AbsoluteStart: absoluteTime,
        EndYear: year, AbsoluteEnd: absoluteTime,
        BookTitle: '', Chapter: '', Page: '',
        Color: '#4b5563',
        CreationGranularity: store.currentLodIndex,
        TimelineId: props.timelineInfo.Id,
        ItemIndex: 0, ShowInNotes: false, Importance: 5, MinLodLevel: 0,
    };
    const result = await BackendAPI.SaveItem(bm, [], [], [], []);
    if (result?.status === 'ok') {
        store.addItem({ ...bm, Id: result.itemId });
        if (props.layoutSettings) {
            renderGrid(gridLayer, props.layoutSettings);
            renderWithDimming(props.layoutSettings);
        }
    }
};

const removeBoundaryItem = async (itemId: string) => {
    closeContextMenu();
    const result = await BackendAPI.DeleteItem(itemId);
    if (result?.status === 'ok') {
        store.removeItem(itemId);
        viewport.centerTime = clampToBoundaries(viewport.centerTime);
        if (props.layoutSettings) {
            lockedLanes.clear();
            renderGrid(gridLayer, props.layoutSettings);
            renderWithDimming(props.layoutSettings);
        }
    }
};

const deleteItem = async (itemId: string) => {
    closeContextMenu();

    // Snapshot full item + relations for undo before deletion
    const timelineId = store.currentProject?.Id;
    if (timelineId) {
        const snapshot = await BackendAPI.GetItemForEdit(timelineId, itemId);
        if (snapshot?.Item) {
            store.setLastDeleted({
                item: snapshot.Item,
                tagNames: snapshot.Tags.map(t => t.Name),
                characterAppearances: snapshot.Characters.map(c => ({ CharacterId: c.CharacterId, Role: c.Role })),
                storyRefs: snapshot.StoryRefs.map(s => s.StoryId),
                chapterRefs: snapshot.ChapterRefs.map(c => c.ChapterId),
            });
        }
    }

    const result = await BackendAPI.DeleteItem(itemId);
    if (result?.status === 'ok') {
        store.removeItem(itemId);
        const bm = bookmarkNodeCache.get(itemId);
        if (bm) { bm.group.destroy(); bookmarkNodeCache.delete(itemId); }
        if (props.layoutSettings) {
            lockedLanes.clear();
            renderGrid(gridLayer, props.layoutSettings);
            renderWithDimming(props.layoutSettings);
        }
    }
};

// --- LAYOUT SETTINGS WATCHER ---
// Re-render the full canvas whenever layout settings change (e.g. after saving settings)
watch(() => props.layoutSettings, (newLs) => {
    if (!stage || !newLs) return;
    nodeCache.clear();
    pictureLoadingSet.clear();
    for (const bm of bookmarkNodeCache.values()) bm.group.destroy();
    bookmarkNodeCache.clear();
    for (const el of miniNodeCache.values()) {
        if (el.kind === 'pin') el.group.destroy(); else el.rect.destroy();
    }
    miniNodeCache.clear();
    miniPinLanes.clear();
    miniBarLanes.clear();
    lockedLanes.clear();
    stemsMaster.destroyChildren();
    boxesMaster.destroyChildren();
    renderGrid(gridLayer, newLs);
    RenderUiLayer(uiLayer, newLs);
    renderWithDimming(newLs);
});

// --- MINI MODE WATCHER ---
watch(() => props.miniMode, (isMini) => {
    if (!stage || !props.layoutSettings) return;
    // Destroy mini node shapes on exit (they'll be rebuilt on re-enter)
    for (const el of miniNodeCache.values()) {
        if (el.kind === 'pin') el.group.destroy(); else el.rect.destroy();
    }
    miniNodeCache.clear();
    miniPinLanes.clear();
    miniBarLanes.clear();
    miniLayer.visible(!!isMini);
    itemLayer.visible(!isMini);
    lockedLanes.clear();
    renderWithDimming(props.layoutSettings);
});

// Clamp viewport when items first load (boundary markers may already exist)
watch(() => store.items, (items) => {
    if (!items.length || !props.layoutSettings) return;
    const clamped = clampToBoundaries(viewport.centerTime);
    if (clamped !== viewport.centerTime) {
        viewport.centerTime = clamped;
        store.setNowYear(Math.floor(clamped));
        renderGrid(gridLayer, props.layoutSettings);
        renderWithDimming(props.layoutSettings);
    }
}, { deep: false });

// Re-render when the visible item set changes (lane positions may change)
watch(() => props.timelineItems, () => {
    if (!stage || !props.layoutSettings) return;
    lockedLanes.clear();
    renderWithDimming(props.layoutSettings);
}, { deep: false });

// Re-render when only dimming/display-mode changes (items stay in the same lanes)
watch([() => store.filterDisplayMode, () => store.dimmableItems], () => {
    if (!stage || !props.layoutSettings) return;
    renderWithDimming(props.layoutSettings);
}, { deep: false });

// Re-render when hidden ranges change (added/deleted from settings)
watch(() => store.hiddenRanges, () => {
    if (!stage || !props.layoutSettings) return;
    lockedLanes.clear();
    renderGrid(gridLayer, props.layoutSettings);
    renderWithDimming(props.layoutSettings);
}, { deep: true });

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
            renderWithDimming(props.layoutSettings!);

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
			renderWithDimming(props.layoutSettings!);
		}, 100)
    }
});

// --- RENDER LOOPS ---
const renderGrid = (layer: Konva.Layer, layoutSettings: LayoutSettings) => {
    gridPanOffset = 0;
    layer.x(0);
    boundaryOverlayLayer.x(0);
    layer.destroyChildren();

    const currentLod = store.lodProfile?.[store.currentLodIndex];
    if (!currentLod) return;

    const step = viewport.lodStepFraction;
    const ranges = getActiveRanges();

    // Compute loop bounds in VISUAL time so the iteration count stays bounded
    // at ~(viewport.width / tickDistance) regardless of how large any hidden range is.
    const visualCenter    = absoluteToVisual(viewport.centerTime, ranges, step);
    const halfVisual      = ((viewport.width / 2) / layoutSettings.TimelineTickDistance) * step;
    const extraVisual     = (GRID_EXTRA_PX / layoutSettings.TimelineTickDistance) * step;
    const leftMostVisual  = visualCenter - halfVisual - extraVisual;
    const rightMostVisual = visualCenter + halfVisual + extraVisual;

    // Precompute visual extents of each break strip so we can skip ticks inside them.
    const breakExtents = ranges.map(r => {
        const vs = absoluteToVisual(r.StartYear, ranges, step);
        return { vs, ve: vs + BREAK_TICKS * step };
    });

    const targetStep = currentLod.stepFraction || 1;
    const startTickIndex = Math.floor(leftMostVisual / targetStep);
    const endTickIndex   = Math.ceil(rightMostVisual / targetStep);

    const seenAbsTicks = new Set<number>();
    for (let i = startTickIndex; i <= endTickIndex; i++) {
        const visualTickTime = i * targetStep;

        // Skip ticks that land inside a break strip (visual check — fast)
        if (breakExtents.some(b => visualTickTime > b.vs && visualTickTime < b.ve)) continue;

        // Convert visual → absolute, then snap to nearest absolute grid position.
        // Without snapping, the (hiddenSize - breakSize) offset is typically non-integer,
        // which causes tick marks to appear offset from the NOW line after hidden ranges.
        const rawAbsTime    = visualToAbsolute(visualTickTime, ranges, step);
        const snappedAbs    = Math.round(rawAbsTime / targetStep) * targetStep;

        // Deduplicate (two adjacent visual indices can snap to the same absolute tick)
        if (seenAbsTicks.has(snappedAbs)) continue;
        seenAbsTicks.add(snappedAbs);

        // Also skip if the snapped tick landed inside an actual hidden range
        if (ranges.some(r => snappedAbs > r.StartYear && snappedAbs < r.EndYear)) continue;

        const cleanTime = parseFloat(snappedAbs.toFixed(8));
        const year      = Math.floor(cleanTime);
        const fraction  = cleanTime - year;

        const x = getXFromTime(cleanTime, viewport.centerTime, step, viewport.width, store.layoutSettings!, ranges);
        const formatter = store.activeFormatRegistry[currentLod.formatKey] || store.activeFormatRegistry['YEARS'];

        const isYearTick = fraction < 0.000001;
        const tickHalfH = (!isYearTick && layoutSettings.TimelineNonYearTicksSmaller) ? 6 : 10;
        const tick = new Konva.Line({ points: [x, viewport.height / 2 - tickHalfH, x, viewport.height / 2 + tickHalfH], stroke: layoutSettings.TimelineTickColor || '#ffffff88', strokeWidth: layoutSettings.TimelineTickWidth, listening: false });
        const text = new Konva.Text({ x: x - 50, y: viewport.height / 2 + 15,
            text: formatter(year, fraction), fill: layoutSettings.TimelineTickMarkerTextColor, align: 'center',
            width: 100, fontStyle: layoutSettings.TimelineTickMarkerFontStyle, fontFamily: layoutSettings.TimelineTickMarkerFontFamily, fontSize: layoutSettings.TimelineTickMarkerFontSize, listening: false });

        layer.add(tick, text);
    }

    // --- Draw collapsed (active) break strips ---
    const stripPx = BREAK_TICKS * layoutSettings.TimelineTickDistance;
    for (const r of ranges) {
        const xStart = getXFromTime(r.StartYear, viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        if (xStart + stripPx < 0 || xStart > viewport.width) continue;

        layer.add(new Konva.Rect({ x: xStart, y: 0, width: stripPx, height: viewport.height, fill: '#00000066', listening: false }));
        layer.add(new Konva.Rect({ x: xStart, y: 0, width: 2, height: viewport.height, fill: '#ffffff44', listening: false }));
        layer.add(new Konva.Rect({ x: xStart + stripPx - 2, y: 0, width: 2, height: viewport.height, fill: '#ffffff44', listening: false }));

        const label = r.Label || `${r.StartYear} – ${r.EndYear}`;
        layer.add(new Konva.Text({ x: xStart, y: viewport.height / 2 + 18, text: label, fill: '#ffffffaa', fontSize: 10, width: stripPx, align: 'center', fontStyle: 'italic', listening: false }));

        // Expand button — centered on the strip, near the top
        const expandBtn = new Konva.Group({ x: xStart + stripPx / 2, y: 14 });
        expandBtn.add(new Konva.Rect({ x: -13, y: -8, width: 26, height: 16, fill: '#ffffffee', cornerRadius: 8, stroke: '#00000022', strokeWidth: 1 }));
        expandBtn.add(new Konva.Text({ x: -8, y: -6, text: '↔', fill: '#222222', fontSize: 12 }));
        expandBtn.on('click', () => toggleRange(r.Id));
        expandBtn.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        expandBtn.on('mouseleave', () => { document.body.style.cursor = 'default'; });
        layer.add(expandBtn);
    }

    // --- Draw expanded (temporarily revealed) hidden ranges ---
    for (const r of store.hiddenRanges.filter(hr => expandedRangeIds.has(hr.Id))) {
        const xLeft  = getXFromTime(r.StartYear, viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        const xRight = getXFromTime(r.EndYear,   viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        if (xRight < 0 || xLeft > viewport.width) continue;

        const zoneWidth = Math.max(xRight - xLeft, 0);
        layer.add(new Konva.Rect({ x: xLeft, y: 0, width: zoneWidth, height: viewport.height, fill: '#0000000a', listening: false }));

        // Faint diagonal stripe pattern across the whole zone
        const clampedLeft  = Math.max(xLeft, 0);
        const clampedRight = Math.min(xRight, viewport.width);
        const clampedW = clampedRight - clampedLeft;
        if (clampedW > 0) {
            const stripeGroup = new Konva.Group({
                x: clampedLeft, y: 0,
                clipX: 0, clipY: 0, clipWidth: clampedW, clipHeight: viewport.height,
            });
            for (let sx = -viewport.height; sx < clampedW + viewport.height; sx += 24) {
                stripeGroup.add(new Konva.Line({
                    points: [sx, 0, sx + viewport.height, viewport.height],
                    stroke: '#00000018', strokeWidth: 1, listening: false,
                }));
            }
            layer.add(stripeGroup);
        }

        layer.add(new Konva.Rect({ x: xLeft, y: 0, width: 2, height: viewport.height, fill: '#00000044', listening: false }));
        layer.add(new Konva.Rect({ x: xRight - 2, y: 0, width: 2, height: viewport.height, fill: '#00000044', listening: false }));

        // Collapse button — centered within the visible portion of the zone
        const visLeft  = Math.max(xLeft,  0);
        const visRight = Math.min(xRight, viewport.width);
        const collapseBtn = new Konva.Group({ x: (visLeft + visRight) / 2, y: 14 });
        collapseBtn.add(new Konva.Rect({ x: -32, y: -8, width: 64, height: 16, fill: '#00000088', cornerRadius: 8, stroke: '#00000033', strokeWidth: 1 }));
        collapseBtn.add(new Konva.Text({ x: -28, y: -6, text: '⟨ collapse ⟩', fill: '#ffffff', fontSize: 10 }));
        collapseBtn.on('click', () => toggleRange(r.Id));
        collapseBtn.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        collapseBtn.on('mouseleave', () => { document.body.style.cursor = 'default'; });
        layer.add(collapseBtn);
    }

    // --- Note dots: small marker at the timeline center line for each note ---
    for (const note of store.notes) {
        const nx = getXFromTime(note.AbsoluteTime, viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        if (nx < -20 || nx > viewport.width + 20) continue;
        layer.add(new Konva.Circle({
            x: nx,
            y: viewport.height / 2,
            radius: 4,
            fill: '#1e293b',
            stroke: '#94a3b8',
            strokeWidth: 1.5,
            listening: false,
        }));
    }

    layer.batchDraw();

    // --- Boundary overlays and markers (always above items) ---
    boundaryOverlayLayer.destroyChildren();
    const { min: bMin, max: bMax, startId, endId } = getBoundaries();
    const allLayoutItems = store.items || props.timelineItems || [];

    const startBoundaryItem = startId ? allLayoutItems.find(i => getId(i) === startId) : null;
    const endBoundaryItem   = endId   ? allLayoutItems.find(i => getId(i) === endId)   : null;

    if (startBoundaryItem) {
        const xS = getXFromTime(bMin, viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        boundaryStartPx.value = xS;
        boundaryOverlayLayer.add(new Konva.Line({ points: [xS, 0, xS, viewport.height], stroke: '#22c55e', strokeWidth: 2 }));
        const startFlag = new Konva.Rect({
            id: `boundary-${getId(startBoundaryItem)}`,
            x: xS, y: 0, width: 56, height: 22,
            fill: '#22c55e', cornerRadius: [0, 0, 4, 0],
        });
        startFlag.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        startFlag.on('mouseleave', () => { document.body.style.cursor = 'default'; });
        boundaryOverlayLayer.add(startFlag);
        boundaryOverlayLayer.add(new Konva.Text({
            x: xS + 4, y: 5, text: '▶ Start', fill: '#ffffff',
            fontSize: 11, fontStyle: 'bold', listening: false,
        }));
    } else {
        boundaryStartPx.value = null;
    }

    if (endBoundaryItem) {
        const xE = getXFromTime(bMax, viewport.centerTime, step, viewport.width, layoutSettings, ranges);
        boundaryEndPx.value = xE;
        boundaryOverlayLayer.add(new Konva.Line({ points: [xE, 0, xE, viewport.height], stroke: '#ef4444', strokeWidth: 2 }));
        const endFlag = new Konva.Rect({
            id: `boundary-${getId(endBoundaryItem)}`,
            x: xE - 48, y: 0, width: 48, height: 22,
            fill: '#ef4444', cornerRadius: [0, 0, 0, 4],
        });
        endFlag.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        endFlag.on('mouseleave', () => { document.body.style.cursor = 'default'; });
        boundaryOverlayLayer.add(endFlag);
        boundaryOverlayLayer.add(new Konva.Text({
            x: xE - 44, y: 5, text: 'End ◀', fill: '#ffffff',
            fontSize: 11, fontStyle: 'bold', listening: false,
        }));
    } else {
        boundaryEndPx.value = null;
    }

    boundaryOverlayLayer.batchDraw();
};

const renderItems = (items: any[], ls: LayoutSettings, dimmableIds?: Set<string>) => {
    itemLayer.x(0);
    const screenBuffer = 400;
    const activeItemIds = new Set();
    const isMini = props.miniMode ?? false;
    const stageCenterY = viewport.height / 2;
    // Rebuild pin-column occupancy snapshot from persistent assignments for new-item lookup.
    const miniPinColUsed = new Map<number, Set<number>>();
    if (isMini) {
        for (const [, lane] of miniPinLanes) {
            let s = miniPinColUsed.get(lane.absKey);
            if (!s) { s = new Set(); miniPinColUsed.set(lane.absKey, s); }
            s.add(lane.idx);
        }
    }
    const currentLodIndex = store.currentLodIndex;
    const activeStep = viewport.lodStepFraction;
    const ranges = getActiveRanges();

    const sortedItems = [...items].sort((a, b) => getAbsoluteStart(a) - getAbsoluteStart(b));

    for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        const itemIdStr = getId(item);
        const typeName = getTypeName(item);

        if (!(getLodMask(item) & (1 << currentLodIndex))) continue;

        const absoluteStart = getAbsoluteStart(item);
        if (absoluteStart === undefined) continue;
        const absoluteEnd = getAbsoluteEnd(item);

        // Hide items that are entirely contained within a hidden range
        const fullyHidden = ranges.some(r => absoluteStart >= r.StartYear && absoluteEnd <= r.EndYear);
        if (fullyHidden) {
            const cached = nodeCache.get(itemIdStr);
            if (cached) setNodeVisibility(cached, false);
            lockedLanes.delete(itemIdStr);
            continue;
        }

        // Boundary markers render in their own overlay layer — skip them here
        const typeId = getTypeId(item);
        if (typeId === 8 || typeId === 9) continue;

        // Hide items entirely outside the timeline boundaries
        if (typeId !== 8 && typeId !== 9) {
            const { min: bMin, max: bMax } = getBoundaries();
            const outOfBounds = absoluteEnd < bMin || absoluteStart > bMax;
            if (outOfBounds) {
                const cached = nodeCache.get(itemIdStr);
                if (cached) setNodeVisibility(cached, false);
                lockedLanes.delete(itemIdStr);
                continue;
            }
        }

        const itemX = getXFromTime(absoluteStart, viewport.centerTime, activeStep, viewport.width, ls, ranges);
        const isAgeOrPeriod = typeName === "Age" || typeName === "Period";
        let endX = itemX;

        if (isAgeOrPeriod) {
            const absEnd = absoluteEnd || (absoluteStart + activeStep);
            endX = getXFromTime(absEnd, viewport.centerTime, activeStep, viewport.width, ls, ranges);
            if (Math.max(itemX, endX) < -screenBuffer || Math.min(itemX, endX) > viewport.width + screenBuffer) {
                lockedLanes.delete(itemIdStr);
                miniPinLanes.delete(itemIdStr); miniBarLanes.delete(itemIdStr);
                continue;
            }
        } else {
            if (itemX < -screenBuffer || itemX > viewport.width + screenBuffer) {
                lockedLanes.delete(itemIdStr);
                miniPinLanes.delete(itemIdStr); miniBarLanes.delete(itemIdStr);
                continue;
            }
        }

        activeItemIds.add(itemIdStr);

        // ── Mini mode render path ─────────────────────────────────────────────
        if (isMini) {
            // Bookmarks are invisible at this scale — hide any cached node
            if (typeId === 6) {
                const bm = bookmarkNodeCache.get(itemIdStr);
                if (bm) bm.group.visible(false);
                continue;
            }
            let el = miniNodeCache.get(itemIdStr);
            if (!el) {
                el = buildMiniNode(itemIdStr, typeName, getColor(item), miniLayer, ls);
                miniNodeCache.set(itemIdStr, el);

                // Hover + click: emit screen-space coords for tooltip, viewItem on click
                const hitTarget = (el.kind === 'pin' ? el.dot : el.rect) as Konva.Shape;
                hitTarget.listening(true);
                hitTarget.on('mouseenter', () => {
                    document.body.style.cursor = 'pointer';
                    const container = stage?.container();
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const pos = stage?.getPointerPosition() ?? { x: 0, y: 0 };
                    emit('miniHover', { item, x: rect.left + pos.x, y: rect.top + pos.y });
                });
                hitTarget.on('mouseleave', () => { document.body.style.cursor = 'default'; emit('miniHover', null); });
                hitTarget.on('click', () => emit('viewItem', itemIdStr));
            }
            setMiniNodeVisibility(el, true);
            if (el.kind === 'pin') {
                let pinLane = miniPinLanes.get(itemIdStr);
                if (!pinLane) {
                    // Bucket by absolute start time (0.0001-unit resolution ≈ stable across panning)
                    const absKey = Math.round(absoluteStart * 10000);
                    const used = miniPinColUsed.get(absKey) ?? new Set<number>();
                    let idx = 0; while (used.has(idx)) idx++;
                    pinLane = { absKey, idx };
                    miniPinLanes.set(itemIdStr, pinLane);
                    if (!miniPinColUsed.has(absKey)) miniPinColUsed.set(absKey, new Set());
                    miniPinColUsed.get(absKey)!.add(idx);
                }
                setMiniNodePosition(el, typeName, itemX, endX, pinLane.idx);
            } else {
                let barLane = miniBarLanes.get(itemIdStr);
                if (!barLane) {
                    let rowIdx = 0;
                    // Ages always occupy row 0 (no stacking); only Periods stack
                    if (typeName === 'Period') {
                        const occupiedRows = new Set<number>();
                        for (const [, bl] of miniBarLanes) {
                            // Strict overlap: touching (end == start) does NOT conflict
                            if (bl.typeName === 'Period'
                                && bl.absEnd > absoluteStart
                                && bl.absStart < absoluteEnd) {
                                occupiedRows.add(bl.rowIdx);
                            }
                        }
                        while (occupiedRows.has(rowIdx)) rowIdx++;
                    }
                    barLane = { rowIdx, absStart: absoluteStart, absEnd: absoluteEnd, typeName };
                    miniBarLanes.set(itemIdStr, barLane);
                }
                setMiniNodePosition(el, typeName, itemX, endX, barLane.rowIdx);
            }
            continue;
        }

        // Bookmarks: custom full-height dashed line + center dot
        if (typeId === 6) {
            const color = getColor(item);
            let bm = bookmarkNodeCache.get(itemIdStr);
            if (!bm) {
                const line = new Konva.Line({
                    points: [0, 0, 0, viewport.height],
                    stroke: color,
                    strokeWidth: 3,
                    dash: [10, 6],
                    id: `bookmark-${itemIdStr}`,
                    listening: true,
                });
                const dot = new Konva.Circle({
                    x: 0,
                    y: stageCenterY,
                    radius: 5,
                    fill: color,
                    id: `bookmark-${itemIdStr}`,
                    listening: true,
                });
                const group = new Konva.Group();
                group.add(line, dot);
                group.on('mouseenter', () => {
                    line.strokeWidth(6);
                    dot.radius(9);
                    group.getLayer()?.batchDraw();
                    document.body.style.cursor = 'pointer';
                });
                group.on('mouseleave', () => {
                    line.strokeWidth(3);
                    dot.radius(5);
                    group.getLayer()?.batchDraw();
                    document.body.style.cursor = 'default';
                });
                itemLayer.add(group);
                bm = { group, line, dot };
                bookmarkNodeCache.set(itemIdStr, bm);
            }
            bm.group.visible(true);
            bm.group.x(itemX);
            bm.line.points([0, 0, 0, viewport.height]);
            bm.dot.y(stageCenterY);
            const bmDimmed = dimmableIds?.has(itemIdStr) ?? false;
            bm.group.opacity(bmDimmed ? 0.25 : 1);
            bm.group.listening(!bmDimmed);
            continue;
        }

        let elements = nodeCache.get(itemIdStr);
        if (!elements) {
            elements = buildNode(itemIdStr, typeName, getTitle(item), getColor(item), stemsMaster, boxesMaster, ls);
            nodeCache.set(itemIdStr, elements);
            if (typeName === 'Age' || typeName === 'Period' || typeName === 'Picture') {
                const itemTitle = getTitle(item);
                elements.box.on('mouseenter', () => {
                    const pos = stage?.getPointerPosition();
                    if (pos) showTooltip(itemTitle, pos.x, pos.y);
                });
                elements.box.on('mouseleave', hideTooltip);
            }
            if (typeName === 'Picture') {
                loadPictureImage(itemIdStr);
            }
        }

        setNodeVisibility(elements, true);
        const isDimmed = dimmableIds?.has(itemIdStr) ?? false;
        if (elements.box)   { elements.box.opacity(isDimmed ? 0.25 : 1);   elements.box.listening(!isDimmed); }
        if (elements.label) { elements.label.opacity(isDimmed ? 0.25 : 1); elements.label.listening(!isDimmed); }
        if (elements.stem)  { elements.stem.opacity(isDimmed ? 0.25 : 1);  elements.stem.listening(!isDimmed); }

        let targetY = 0;
        const boxWidth = isAgeOrPeriod ? Math.max(1, endX - itemX)
            : typeName === 'Picture' ? (ls.TimelineBoxTypesBoxWidth || ls.TimelineEventBoxHeight)
            : ls.TimelineEventBoxWidth;

        if (typeName === "Age") {
            targetY = stageCenterY - ls.TimelineAgeHeight / 2;
        } else {
            const isAboveLine = getItemIndex(item) % 2 !== 0;
            targetY = stageCenterY + getAssignedLane(
                itemIdStr, itemX, boxWidth, isAboveLine, isAgeOrPeriod,
                absoluteStart, absoluteEnd, viewport.centerTime, activeStep,
                viewport.height - ls.TimelineEdgeMarginWidth * 2 + (isAboveLine ? 20 : 0), viewport.width, lockedLanes, ls, ranges
            );
        }

        const isLeft = isLeftOfNow(itemX, viewport.width);
        updateAbsolutePositions(elements, typeName, itemX, endX, targetY, boxWidth, isLeft, stageCenterY, ls);
    }

    if (isMini) {
        for (const [id, el] of miniNodeCache.entries()) {
            if (!activeItemIds.has(id)) setMiniNodeVisibility(el, false);
        }
        miniLayer.batchDraw();
    } else {
        for (const [id, elements] of nodeCache.entries()) {
            if (!activeItemIds.has(id)) setNodeVisibility(elements, false);
        }
        for (const [id, bm] of bookmarkNodeCache.entries()) {
            if (!activeItemIds.has(id)) bm.group.visible(false);
        }
        itemLayer.batchDraw();
    }

    store.setVisibleItems(activeItemIds.size);
};

const applyDimming = (dimmableIds: Set<string>) => {
    for (const [id, elements] of nodeCache.entries()) {
        const isDimmed = dimmableIds.has(id);
        const opacity = isDimmed ? 0.25 : 1;
        const listen = !isDimmed;
        if (elements.box)   { elements.box.opacity(opacity);   elements.box.listening(listen); }
        if (elements.label) { elements.label.opacity(opacity); elements.label.listening(listen); }
        if (elements.stem)  { elements.stem.opacity(opacity);  elements.stem.listening(listen); }
    }
    for (const [id, bm] of bookmarkNodeCache.entries()) {
        const isDimmed = dimmableIds.has(id);
        bm.group.opacity(isDimmed ? 0.25 : 1);
        bm.group.listening(!isDimmed);
    }
};

const renderWithDimming = (ls: LayoutSettings) => {
    const visible: TimelineItem[] = props.timelineItems ?? store.items ?? [];
    // Read directly from store (not props) to avoid Vue update-flush race where
    // the watcher fires before the parent re-renders and propagates the new prop value.
    const dimmed: TimelineItem[] = store.dimmableItems;
    if (dimmed.length > 0) {
        renderItems([...visible, ...dimmed], ls, new Set(dimmed.map(i => i.Id)));
    } else {
        renderItems(visible, ls);
    }
};

function RenderUiLayer(ui_layer: Konva.Layer, ls: LayoutSettings) {
    ui_layer.destroyChildren();

    const nowLine = new Konva.Line({ points: [viewport.width / 2, 0, viewport.width / 2, viewport.height], stroke: '#ff0000', strokeWidth: 2});
    const nowText = new Konva.Text({ text: "Now", stroke: '#0000', fill: '#ff0000', x: viewport.width / 2 + 10, y: 0, fontFamily: "Times", fontSize: 32 });
    const nowTextBottom = new Konva.Text({ align: 'right', text: "Now", stroke: '#0000', fill: '#ff0000', x: -10, y: viewport.height - 32, fontFamily: "Times", fontSize: 32, width: viewport.width / 2 });
    const centerLine = new Konva.Line({ points: [0, viewport.height / 2, viewport.width, viewport.height / 2], stroke: ls.TimelineAxisColor || '#ffffff88', strokeWidth: 2 });
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
let lastMouseY: number | null = null;
let mouseOnCanvas = false;
let shiftHeld = false;

// Refresh when the view pans or LOD animates, even without mouse movement
watch(() => [viewport.centerTime, viewport.lodStepFraction], () => {
    if (mouseOnCanvas && lastMouseX !== null && lastMouseY !== null) updateCursor(lastMouseX, lastMouseY);
});

// Re-render when items are added externally (e.g. undo delete)
watch(() => store.items.length, (newLen, oldLen) => {
    if (newLen > oldLen && props.layoutSettings) {
        renderWithDimming(props.layoutSettings);
    }
});

// Pulse-highlight a specific item node (triggered from the data panel focus button)
watch(() => store.pulseItemId, (id) => {
    if (!id) return;

    // Mini mode: pulse the pin dot or bar rect
    const miniEl = miniNodeCache.get(id);
    if (miniEl) {
        const target = (miniEl.kind === 'pin' ? miniEl.dot : miniEl.rect) as Konva.Shape;
        const glowIn = new Konva.Tween({
            node: target,
            duration: 0.3,
            shadowBlur: 12,
            shadowColor: '#818cf8',
            shadowOpacity: 0.95,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            easing: Konva.Easings.EaseOut,
            onFinish() {
                new Konva.Tween({
                    node: target,
                    duration: 0.9,
                    shadowBlur: 0,
                    shadowOpacity: 0,
                    easing: Konva.Easings.EaseOut,
                    onFinish() { glowIn.destroy(); },
                }).play();
            },
        });
        glowIn.play();
        return;
    }

    const els = nodeCache.get(id);
    if (!els) return;
    const target = els.box ?? els.stem;
    if (!target) return;

    const glowIn = new Konva.Tween({
        node: target,
        duration: 0.3,
        shadowBlur: 32,
        shadowColor: '#818cf8',
        shadowOpacity: 0.95,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        easing: Konva.Easings.EaseOut,
        onFinish() {
            new Konva.Tween({
                node: target,
                duration: 0.9,
                shadowBlur: 0,
                shadowOpacity: 0,
                easing: Konva.Easings.EaseOut,
                onFinish() { glowIn.destroy() },
            }).play();
        },
    });
    glowIn.play();
});

function updateCursor(mouseX: number, mouseY: number) {
    if (!store.layoutSettings || !store.lodProfile) return;

    const step = viewport.lodStepFraction;
    const ranges = getActiveRanges();
    const rawTime = getTimeFromX(mouseX, viewport.centerTime, step, viewport.width, store.layoutSettings, ranges);
    const snappedTime = shiftHeld ? rawTime : Math.round(rawTime / step) * step;
    const snappedX = shiftHeld ? mouseX : getXFromTime(snappedTime, viewport.centerTime, step, viewport.width, store.layoutSettings, ranges);

    const year = Math.floor(snappedTime);
    const fraction = parseFloat((snappedTime - year).toFixed(8));
    const currentLod = store.lodProfile[store.currentLodIndex];
    const formatKey = currentLod?.formatKey ?? 'YEARS';
    const formatter = store.activeFormatRegistry[formatKey] || store.activeFormatRegistry['YEARS'];

    const mid = viewport.height / 2;
    const inTopHalf = mouseY < mid;
    const lineY0 = inTopHalf ? 0 : mid;
    const lineY1 = inTopHalf ? mid : viewport.height;
    const labelY = inTopHalf ? lineY0 + 8 : lineY1 - 22;

    const labelRight = snappedX + 8 + 180 <= viewport.width;

    let labelText: string;
    let fracText = '';
    if (shiftHeld && fraction > 0.000001) {
        labelText = String(year);
        fracText = fraction.toFixed(6).replace(/0+$/, '').substring(1); // ".002447"
    } else {
        const baseLabel = formatter ? formatter(year, fraction < 0.000001 ? 0 : fraction) : String(year);
        // At sub-year LODs the formatter returns only the sub-label ("Summer", "March" etc.) without
        // the year — append it so the cursor always shows the full date ("Summer 1995").
        labelText = fraction < 0.000001 ? baseLabel : `${baseLabel} ${year}`;
    }

    cursor.value = { visible: true, x: snappedX, lineY0, lineY1, labelRight, labelY, labelText, fracText };
}

function hideCursor() {
    cursor.value.visible = false;
}

function showTooltip(text: string, x: number, y: number) {
    tooltip.value = { visible: true, text, x: Math.min(x + 14, viewport.width - 160), y: Math.max(4, y - 34) };
}

function hideTooltip() {
    tooltip.value.visible = false;
}

function loadPictureImage(itemId: string) {
    if (pictureLoadingSet.has(itemId)) return;
    const cached = pictureImageCache.get(itemId);
    if (cached) {
        const els = nodeCache.get(itemId);
        if (els?.box) {
            els.box.image(cached);
            itemLayer.batchDraw();
        }
        return;
    }
    pictureLoadingSet.add(itemId);
    // typeId 4 = Picture — ensures the backend includes the Pictures relation
    BackendAPI.GetItemForEdit(props.timelineInfo.Id, itemId, 4).then(result => {
        pictureLoadingSet.delete(itemId);
        const filePath = result?.Pictures?.[0]?.FilePath;
        if (!filePath) return;
        const url = `https://media.app/${filePath}`;
        // Use Konva's own image loader so WebView2 URL resolution is handled correctly
        Konva.Image.fromURL(url, (konvaImg) => {
            const htmlImg = (konvaImg as Konva.Image).image() as HTMLImageElement;
            (konvaImg as Konva.Image).destroy();
            pictureImageCache.set(itemId, htmlImg);
            const els = nodeCache.get(itemId);
            if (els?.box) {
                els.box.image(htmlImg);
                itemLayer.batchDraw();
            }
        });
    });
}

// --- STATE MANAGEMENT ---

function jumpToYear(targetYear: number) {
    viewport.centerTime = clampToBoundaries(targetYear);
    localYearCache = Math.floor(parseInt(targetYear));
    store.setNowYear(localYearCache);

    if (stage) {
		renderGrid(gridLayer, props.layoutSettings);
		renderWithDimming(props.layoutSettings!);
		updateCurrentYearInStore(true);
	}
}

function updateStageSize() {
    if (!stage || !containerRef.value) return;
    stage.width(containerRef.value.clientWidth);
    stage.height(containerRef.value.clientHeight);
    viewport.width = containerRef.value.clientWidth;
    viewport.height = containerRef.value.clientHeight;
    store.setViewportWidth(viewport.width);

    renderGrid(gridLayer, props.layoutSettings);
    RenderUiLayer(uiLayer, props.layoutSettings!);
    lockedLanes.clear();
    renderWithDimming(props.layoutSettings!);
}

const updateCurrentYearInStore = (force = false) => {
    const now = performance.now();
    if (force || now - _lastPanelUpdateMs > 100) {
        store.setCenterAbsoluteTime(viewport.centerTime);
        _lastPanelUpdateMs = now;
    }
    const currentYear = Math.floor(viewport.centerTime);
    if (currentYear !== localYearCache) {
        localYearCache = currentYear;
        store.setNowYear(currentYear);
    }
};

function trackFps(now: number) {
    if (_fpsFrameCount === 0) _fpsWindowStart = now;
    _fpsFrameCount++;
    if (now - _fpsWindowStart >= 1000) {
        store.setFpsDisplay(Math.round(_fpsFrameCount * 1000 / (now - _fpsWindowStart)));
        _fpsFrameCount = 0;
    }
    _fpsRafId = requestAnimationFrame(trackFps);
}

function animateJumpToYear(targetYear: number, durationMs: number = 600) {
    const startYear = viewport.centerTime;
    const yearDifference = clampToBoundaries(targetYear) - startYear;
    const startTime = performance.now();

    function step(currentTime: number) {
        // Guard: the stage is destroyed on unmount; a frame scheduled before
        // that would render onto dead layers.
        if (!stage) { _jumpRafId = null; return; }

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        viewport.centerTime = startYear + (yearDifference * easeProgress);

        renderGrid(gridLayer, props.layoutSettings);
        renderWithDimming(props.layoutSettings!);

        if (progress < 1) {
            _jumpRafId = requestAnimationFrame(step);
        } else {
            _jumpRafId = null;
            localYearCache = Math.floor(targetYear);
            store.setNowYear(localYearCache);
        }
    }

    if (_jumpRafId !== null) cancelAnimationFrame(_jumpRafId);
    _jumpRafId = requestAnimationFrame(step);
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

function skipHiddenRange(targetYear: number, positive: boolean): number {
	const hit = getActiveRanges().find(r => targetYear > r.StartYear && targetYear < r.EndYear);
	if (!hit) return targetYear;
	const frac = viewport.lodStepFraction;
	// Land on the first tick STRICTLY outside the range so the NOW line
	// aligns with a tick mark rather than sitting at the boundary year
	// (which is BREAK_TICKS ticks away from the nearest real tick in visual space).
	return positive
		? (Math.floor(hit.EndYear / frac) + 1) * frac
		: (Math.ceil(hit.StartYear / frac) - 1) * frac;
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
    store.setViewportWidth(viewport.width);

    // Detect any container resize (filter panel toggle, splitpane drag, window resize)
    _canvasResizeObserver = new ResizeObserver(() => updateStageSize());
    _canvasResizeObserver.observe(containerRef.value);

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
    stage.add(boundaryOverlayLayer); // above items
    // Set initial layer visibility based on current prop value
    miniLayer.visible(!!props.miniMode);
    itemLayer.visible(!props.miniMode);
    stage.add(miniLayer); // mini mode overlay, above boundaries

    renderWithDimming(props.layoutSettings!);
    updateCurrentYearInStore(true);

    const positionMenu = (clientX: number, clientY: number, menuW = 230, menuH = 320) => {
        contextMenu.x = Math.min(clientX, window.innerWidth  - menuW - 4);
        contextMenu.y = Math.min(clientY, window.innerHeight - menuH - 4);
    };

    const resolveTimeAtPos = (posX: number, shiftKey: boolean) => {
        if (!store.layoutSettings) return { absoluteTime: 0, year: 0, fraction: 0 };
        const step = viewport.lodStepFraction;
        const ranges = getActiveRanges();
        const rawTime = getTimeFromX(posX, viewport.centerTime, step, viewport.width, store.layoutSettings, ranges);
        const absoluteTime = shiftKey ? rawTime : Math.round(rawTime / step) * step;
        const cleanTime = parseFloat(absoluteTime.toFixed(8));
        return { absoluteTime, year: Math.floor(cleanTime), fraction: parseFloat((cleanTime - Math.floor(cleanTime)).toFixed(4)) };
    };

	stage.on('contextmenu', (e) => {
        e.evt.preventDefault();
        e.evt.stopPropagation();

        const pos = stage.getPointerPosition();
        if (!pos || !store.layoutSettings) return;

        const { absoluteTime, year, fraction } = resolveTimeAtPos(pos.x, e.evt.shiftKey);
        contextMenu.absoluteTime = absoluteTime;
        contextMenu.displayYear = year;
        contextMenu.displayFraction = fraction;

        const targetId = e.target.id();

        if (targetId && targetId.startsWith('boundary-')) {
            const itemId = targetId.slice('boundary-'.length);
            const bItem = (store.items || []).find(i => getId(i) === itemId);
            contextMenu.type = 'boundary';
            contextMenu.itemId = itemId;
            contextMenu.boundaryLabel = bItem && getTypeId(bItem) === 8 ? 'Timeline Start' : 'Timeline End';
            positionMenu(e.evt.clientX, e.evt.clientY, 200, 120);
        } else if (targetId && (targetId.startsWith('box-') || targetId.startsWith('label-') || targetId.startsWith('stem-') || targetId.startsWith('bookmark-'))) {
            const itemId = targetId.split('-').slice(1).join('-');
            const clickedItem = store.items.find(i => getId(i) === itemId);
            contextMenu.type = 'item';
            contextMenu.itemId = itemId;
            contextMenu.itemTitle = clickedItem ? getTitle(clickedItem) : 'Item';
            contextMenu.itemTypeId = clickedItem ? getTypeId(clickedItem) : 1;
            contextMenu.itemAbsoluteStart = clickedItem ? (getAbsoluteStart(clickedItem) ?? 0) : 0;
            contextMenu.itemAbsoluteEnd   = clickedItem ? (getAbsoluteEnd(clickedItem)   ?? contextMenu.itemAbsoluteStart) : 0;
            positionMenu(e.evt.clientX, e.evt.clientY, 200, 120);
        } else {
            // Empty canvas right-click → all item types + special
            contextMenu.type = 'addItems';
            contextMenu.itemId = null;
            positionMenu(e.evt.clientX, e.evt.clientY, 220, 380);
        }

        hideCursor();
        contextMenu.isOpen = true;
    });

    // 2. Left-click: item → emit itemClick; boundary flag → remove menu
    stage.on('click', (e) => {
        if (e.evt.button !== 0) return; // ignore right/middle clicks
        if (hasDragged) { hasDragged = false; return; }
        if (contextMenu.isOpen) { closeContextMenu(); return; }

        const pos = stage.getPointerPosition();
        if (!pos) return;

        const targetId = e.target.id();
        if (targetId && (targetId.startsWith('box-') || targetId.startsWith('label-') || targetId.startsWith('stem-') || targetId.startsWith('bookmark-'))) {
            const itemId = targetId.split('-').slice(1).join('-');
            emit('viewItem', itemId);
        } else if (targetId && targetId.startsWith('boundary-')) {
            // Left-click on boundary flag → show remove menu
            const itemId = targetId.slice('boundary-'.length);
            const bItem = (store.items || []).find(i => getId(i) === itemId);
            contextMenu.type = 'boundary';
            contextMenu.itemId = itemId;
            contextMenu.boundaryLabel = bItem && getTypeId(bItem) === 8 ? 'Timeline Start' : 'Timeline End';
            positionMenu(e.evt.clientX, e.evt.clientY, 200, 120);
            hideCursor();
            e.evt.stopPropagation();
            contextMenu.isOpen = true;
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

    // --- Shared pan logic used by both left-drag and middle-mouse velocity pan ---
    function applyPan(deltaX: number) {
        const _ranges = getActiveRanges();
        const _step   = viewport.lodStepFraction;
        const _vc     = absoluteToVisual(viewport.centerTime, _ranges, _step);
        viewport.centerTime = clampToBoundaries(visualToAbsolute(
            _vc - (deltaX / store.layoutSettings!.TimelineTickDistance) * _step,
            _ranges, _step
        ));
        gridPanOffset += deltaX;
        if (!store.performantPanning || Math.abs(gridPanOffset) > DRIFT_THRESHOLD) {
            renderGrid(gridLayer, props.layoutSettings!);
            renderWithDimming(props.layoutSettings!);
        } else {
            gridLayer.x(gridPanOffset);
            boundaryOverlayLayer.x(gridPanOffset);
            gridLayer.batchDraw();
            renderWithDimming(props.layoutSettings!);
        }
        hideTooltip();
        updateCurrentYearInStore();
        hideCursor();
    }

    // --- Left-click drag ---
    stage.on('mousedown', (e) => {
        if (e.evt.button !== 0) return;
        isDragging = true;
        hasDragged = false;
        lastPointerX = e.evt.clientX;
        dragStartX = e.evt.clientX;
    });

    // --- Middle-mouse velocity pan ---
    let midMouseActive = false;
    let midMouseClientX = 0;

    stage.on('mousedown', (e) => {
        if (e.evt.button !== 1) return;
        e.evt.preventDefault(); // prevent autoscroll cursor
        midMouseActive = true;
        midMouseClientX = e.evt.clientX;

        const loop = () => {
            if (!midMouseActive || !stage || !store.layoutSettings) return;
            const rect = stage.container().getBoundingClientRect();
            const canvasX = midMouseClientX - rect.left;
            const halfWidth = viewport.width / 2;
            const normalised = (canvasX - halfWidth) / halfWidth; // -1 … +1
            const maxPx = store.layoutSettings.TimelineTickDistance * 3.5;
            const deltaX = -normalised * maxPx;
            if (Math.abs(deltaX) > 0.5) applyPan(deltaX);
            const cur = normalised > 0.05 ? MID_CURSOR_RIGHT : normalised < -0.05 ? MID_CURSOR_LEFT : MID_CURSOR_CENTER;
            document.body.style.cursor = cur;
            _midMouseRafId = requestAnimationFrame(loop);
        };
        _midMouseRafId = requestAnimationFrame(loop);
    });

    _keydownHandler = (e) => { if (e.key === 'Shift') { shiftHeld = true;  if (mouseOnCanvas && lastMouseX !== null && lastMouseY !== null) updateCursor(lastMouseX, lastMouseY); } };
    _keyupHandler   = (e) => { if (e.key === 'Shift') { shiftHeld = false; if (mouseOnCanvas && lastMouseX !== null && lastMouseY !== null) updateCursor(lastMouseX, lastMouseY); } };
    window.addEventListener('keydown', _keydownHandler);
    window.addEventListener('keyup',   _keyupHandler);

    // Window-level mousemove so drag continues when cursor leaves the canvas
    _windowMoveHandler = (e: MouseEvent) => {
        // Track middle-mouse cursor position regardless of drag state
        if (midMouseActive) {
            midMouseClientX = e.clientX;
            return;
        }

        if (!isDragging) return;
        const clientX = e.clientX;
        if (!hasDragged && Math.abs(clientX - dragStartX) < DRAG_THRESHOLD) {
            lastPointerX = clientX;
            return;
        }
        hasDragged = true;
        const deltaX = clientX - lastPointerX;
        if (deltaX === 0) return;
        document.body.style.cursor = 'grabbing';
        applyPan(deltaX);
        lastPointerX = clientX;
    };
    window.addEventListener('mousemove', _windowMoveHandler);

    _mouseupHandler = (e: MouseEvent) => {
        if (e.button === 0) {
            isDragging = false;
            document.body.style.cursor = 'default';
        }
        if (e.button === 1) {
            midMouseActive = false;
            if (_midMouseRafId !== null) { cancelAnimationFrame(_midMouseRafId); _midMouseRafId = null; }
            document.body.style.cursor = 'default';
        }
    };
    window.addEventListener('mouseup', _mouseupHandler);

    // Stage mousemove: cursor marker updates only (drag is handled by window handler above)
    stage.on('mousemove', (e) => {
        if (isDragging || midMouseActive) return;
        if (contextMenu.isOpen) {
            hideCursor();
        } else {
            const pos = stage?.getPointerPosition();
            if (!pos) return;
            mouseOnCanvas = true;
            lastMouseX = pos.x;
            lastMouseY = pos.y;
            updateCursor(pos.x, pos.y);
        }
    });

    stage.on('mouseleave', () => {
        mouseOnCanvas = false;
        lastMouseX = null;
        if (!isDragging && !midMouseActive) hideCursor();
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
				const raw = viewport.lodStepFraction < 1
					? (positive ? Math.floor(viewport.centerTime) + 1 : Math.ceil(viewport.centerTime) - 1)
					: findNearestTick(positive);
				jumpToYear(skipHiddenRange(raw, positive));
			} else {
				jumpToYear(skipHiddenRange(findNearestTick(positive), positive));
			}
		} else if (e.deltaX) {
			const positive = e.deltaX > 0;
			jumpToYear(skipHiddenRange(findNearestTick(positive), positive));
		}
    });

    RenderUiLayer(uiLayer, props.layoutSettings!);
    renderGrid(gridLayer, props.layoutSettings);

    // Clamp initial viewport to boundaries. The canvas mounts AFTER items are
    // already loaded (v-else guard in TimelineApp), so the store.items watcher
    // never fires for the initial load. Clamp here instead.
    if (props.layoutSettings) {
        const initClamped = clampToBoundaries(viewport.centerTime);
        if (initClamped !== viewport.centerTime) {
            viewport.centerTime = initClamped;
            renderGrid(gridLayer, props.layoutSettings);
            renderWithDimming(props.layoutSettings);
        }
    }

    // Always set the initial year and visible count after all startup renders
    store.setNowYear(Math.floor(viewport.centerTime));

    _fpsRafId = requestAnimationFrame(trackFps);
});

onBeforeUnmount(() => {
    _canvasResizeObserver?.disconnect();
    if (_fpsRafId !== null) cancelAnimationFrame(_fpsRafId);
    if (_jumpRafId !== null) { cancelAnimationFrame(_jumpRafId); _jumpRafId = null; }
    if (_midMouseRafId !== null) { cancelAnimationFrame(_midMouseRafId); _midMouseRafId = null; }
    if (_keydownHandler) window.removeEventListener('keydown', _keydownHandler);
    if (_keyupHandler)   window.removeEventListener('keyup',   _keyupHandler);
    if (_mouseupHandler) window.removeEventListener('mouseup', _mouseupHandler);
    if (_windowMoveHandler) window.removeEventListener('mousemove', _windowMoveHandler);
    stage?.destroy();
    stage = null;
    nodeCache.clear();
    bookmarkNodeCache.clear();
    pictureImageCache.clear();
    pictureLoadingSet.clear();
});

function refreshItems() {
    if (!props.layoutSettings) return;
    lockedLanes.clear();
    renderGrid(gridLayer, props.layoutSettings);
    renderWithDimming(props.layoutSettings);
}

defineExpose({
    animateJumpToYear,
	jumpToYear,
    updateStageSize,
    gridLayer,
    uiLayer,
    refreshItems,
});
</script>

<template>
    <div style="position: relative; width: 100%; height: 100%;">
        <div ref="containerRef" style="width: 100%; height: 100%;" @mousedown.middle.prevent></div>

        <!-- CSS blur overlays for out-of-bounds areas (pointer-events:none so canvas stays interactive) -->
        <div v-if="boundaryStartPx !== null && boundaryStartPx > 0"
             class="boundary-blur"
             :style="{ width: boundaryStartPx + 'px' }">
        </div>
        <div v-if="boundaryEndPx !== null"
             class="boundary-blur"
             :style="{ left: boundaryEndPx + 'px', right: '0' }">
        </div>

        <!-- Vue cursor line + label — above all Konva layers -->
        <template v-if="cursor.visible && props.layoutSettings?.TimelineShowHoverLine !== false">
            <div class="cursor-line"
                 :style="{ left: cursor.x + 'px', top: cursor.lineY0 + 'px', height: (cursor.lineY1 - cursor.lineY0) + 'px', borderLeft: `${props.layoutSettings?.TimelineHoverLineWidth ?? 1}px ${props.layoutSettings?.TimelineHoverLineStyle ?? 'solid'} ${props.layoutSettings?.TimelineHoverLineColor ?? 'rgba(255,80,80,0.8)'}` }">
            </div>
            <div class="cursor-label"
                 :style="{ left: cursor.x + 'px', top: cursor.labelY + 'px', transform: cursor.labelRight ? 'translateX(8px)' : 'translateX(calc(-100% - 8px))' }">
                {{ cursor.labelText }}<span v-if="cursor.fracText" class="cursor-frac">{{ cursor.fracText }}</span>
            </div>
        </template>

        <!-- Vue tooltip — above all Konva layers -->
        <div v-if="tooltip.visible"
             class="canvas-tooltip"
             :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
            {{ tooltip.text }}
        </div>
    </div>

    <!-- Context menu teleported to body so it escapes canvas overflow/z-index -->
    <Teleport to="body">
        <!-- Backdrop: catches outside clicks to close menu -->
        <div v-if="contextMenu.isOpen"
             class="context-menu-backdrop"
             @mousedown.stop="closeContextMenu"
             @contextmenu.stop.prevent="closeContextMenu">
        </div>

        <div v-if="contextMenu.isOpen"
             class="context-menu"
             :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
             @click.stop
             @contextmenu.stop.prevent>

            <!-- Right-click on empty canvas: add item types + special submenu -->
            <template v-if="contextMenu.type === 'addItems'">
                <button class="menu-item" @click="emit('addItem', 1, contextMenu.absoluteTime, store.currentLodIndex); closeContextMenu()">
                    <i class="ri-calendar-event-fill"></i> Event
                </button>
                <button class="menu-item" @click="emit('addItem', 2, contextMenu.absoluteTime, store.currentLodIndex); closeContextMenu()">
                    <i class="ri-calendar-2-fill"></i> Period
                </button>
                <button class="menu-item" @click="emit('addItem', 3, contextMenu.absoluteTime, store.currentLodIndex); closeContextMenu()">
                    <i class="ri-hourglass-fill"></i> Age
                </button>
                <button class="menu-item" @click="emit('addItem', 4, contextMenu.absoluteTime, store.currentLodIndex); closeContextMenu()">
                    <i class="ri-image-fill"></i> Picture
                </button>
                <button class="menu-item" @click="emit('addItem', 5, contextMenu.absoluteTime, store.currentLodIndex); closeContextMenu()">
                    <i class="ri-sticky-note-fill"></i> Note
                </button>
                <div class="menu-separator"></div>
                <button class="menu-item dist-from" @click="setCanvasDistancePoint('from')">
                    <i class="ri-map-pin-2-fill"></i> Distance – From
                </button>
                <button class="menu-item dist-to" @click="setCanvasDistancePoint('to')">
                    <i class="ri-map-pin-time-fill"></i> Distance – To
                </button>
                <div class="menu-separator"></div>
                <!-- Special flyout submenu -->
                <div class="has-submenu">
                    <div class="menu-item menu-item--special">
                        <i class="ri-magic-line"></i> Special
                        <i class="ri-arrow-right-s-line submenu-arrow"></i>
                    </div>
                    <div class="submenu">
                        <button class="menu-item" @click="addBookmark(contextMenu.absoluteTime)">
                            <i class="ri-bookmark-fill"></i> Bookmark
                        </button>
                        <button class="menu-item" :class="{ 'menu-item--disabled': hasTimelineStart }" :disabled="hasTimelineStart" @click="addBoundaryItem(8, contextMenu.absoluteTime)">
                            <i class="fas ri-quill-pen-ai-fill"></i> Timeline Start
                        </button>
                        <button class="menu-item" :class="{ 'menu-item--disabled': hasTimelineEnd }" :disabled="hasTimelineEnd" @click="addBoundaryItem(9, contextMenu.absoluteTime)">
                            <i class="ri-book-fill"></i> Timeline End
                        </button>
                    </div>
                </div>
            </template>

            <!-- Right-click / left-click on boundary flag: remove -->
            <template v-else-if="contextMenu.type === 'boundary'">
                <div class="menu-header">{{ contextMenu.boundaryLabel }}</div>
                <button class="menu-item danger" @click="removeBoundaryItem(contextMenu.itemId!)">
                    <i class="ri-delete-bin-line"></i> Remove marker
                </button>
            </template>

            <!-- Right-click on item -->
            <template v-else-if="contextMenu.type === 'item'">
                <div class="menu-header" :title="contextMenu.itemTitle">{{ contextMenu.itemTitle }}</div>
                <button class="menu-item" @click="emit('itemClick', contextMenu.itemId!); closeContextMenu()">
                    <i class="ri-edit-line"></i> Edit
                </button>
                <div class="menu-separator"></div>
                <button class="menu-item dist-from" @click="setItemDistancePoint('from')">
                    <i class="ri-map-pin-2-fill"></i> Distance – From
                </button>
                <button class="menu-item dist-to" @click="setItemDistancePoint('to')">
                    <i class="ri-map-pin-time-fill"></i> Distance – To
                </button>
                <template v-if="contextMenu.itemTypeId === 2 || contextMenu.itemTypeId === 3">
                    <button class="menu-item dist-both" @click="setItemDistancePoint('both')">
                        <i class="ri-ruler-2-line"></i> Calculate Distance
                    </button>
                </template>
                <div class="menu-separator"></div>
                <button class="menu-item danger" @click="deleteItem(contextMenu.itemId!)">
                    <i class="ri-delete-bin-line"></i> Delete
                </button>
            </template>

        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.boundary-blur {
    position: absolute;
    top: 0;
    height: 100%;
    backdrop-filter: blur(6px);
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 5;
}

.cursor-line {
    position: absolute;
    width: 0;
    pointer-events: none;
    z-index: 10;
}

.cursor-label {
    position: absolute;
    color: #ff5050;
    font-size: 14px;
    font-family: sans-serif;
    pointer-events: none;
    z-index: 10;
    white-space: nowrap;
}

.cursor-frac {
    font-style: italic;
}

.canvas-tooltip {
    position: absolute;
    background: #1e293b;
    color: #f1f5f9;
    font-family: sans-serif;
    font-size: 12px;
    padding: 5px;
    border-radius: 3px;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    z-index: 10;
    white-space: nowrap;
}

.context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
}

.context-menu {
    position: fixed;
    z-index: 9999;
    min-width: 190px;
    background-color: #1e293b;
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
        width: 100%;
        transition: background-color 0.1s ease;

        &:hover {
            background-color: #334155;
        }

        &.danger {
            color: #ef4444;
            &:hover { background-color: rgba(239, 68, 68, 0.1); }
        }

        &.dist-from {
            color: #34d399;
            &:hover { background-color: rgba(52, 211, 153, 0.1); }
        }
        &.dist-to {
            color: #60a5fa;
            &:hover { background-color: rgba(96, 165, 250, 0.1); }
        }
        &.dist-both {
            color: #a78bfa;
            &:hover { background-color: rgba(167, 139, 250, 0.1); }
        }

        &.menu-item--disabled {
            opacity: 0.4;
            cursor: not-allowed;
            &:hover { background-color: transparent; }
        }
    }

    /* Flyout submenu */
    .has-submenu {
        position: relative;

        .menu-item--special {
            color: #a78bfa;
            border-top: 1px solid #334155;
            margin-top: 2px;

            i:first-child { color: #a78bfa; }

            .submenu-arrow {
                margin-left: auto;
                font-size: 1.1em;
                transition: transform 0.15s;
            }
        }

        &:hover .menu-item--special {
            background-color: #2d1f6e;
            color: #c4b5fd;
            i:first-child { color: #c4b5fd; }
        }

        .submenu {
            display: none;
            position: absolute;
            left: 100%;
            top: -6px;
            min-width: 190px;
            background-color: #1e293b;
            border: 1px solid #334155;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            flex-direction: column;
            padding: 6px 0;
            z-index: 10000;
        }

        &:hover .submenu {
            display: flex;
        }
    }
}
</style>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import Konva from 'konva';
import { useTimelineStore } from '@/stores/timelineStore';
import { canvasColor } from '@/utils/canvasTheme';

const emit = defineEmits<{ jumpToYear: [year: number] }>();

const store = useTimelineStore();
const containerRef = ref<HTMLDivElement>();

let stage: Konva.Stage | null = null;
let layer: Konva.Layer | null = null;
let dynamicLayer: Konva.Layer | null = null;
let tooltipLayer: Konva.Layer | null = null;
let tooltipLabel: Konva.Label | null = null;
let resizeObserver: ResizeObserver | null = null;

// Stored by renderStatic so renderDynamic can reposition the overlay without a full rebuild
let _toX: ((t: number) => number) | null = null;
let _fromX: ((x: number) => number) | null = null;
let _H = 0;

// Layout constants
const MARGIN       = 36;   // px left/right
const TIMELINE_Y   = 0.62; // fraction of canvas height for timeline line
const AGE_H        = 10;
const PERIOD_H     = 5;
const PERIOD_GAP   = 2;
const ITEM_STEM_H  = 14;
const DOT_R        = 2.5;
const BM_STEM_H    = 18;

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function buildToX(W: number, rangeStart: number, rangeEnd: number) {
    const usable = W - 2 * MARGIN;
    const span   = rangeEnd - rangeStart || 1;
    return (t: number) => MARGIN + ((t - rangeStart) / span) * usable;
}

// ─── Dynamic layer: NOW line + viewport rect — repositioned on every pan ──────

function renderDynamic() {
    if (!stage || !dynamicLayer || !_toX) return;
    dynamicLayer.destroyChildren();

    const W  = stage.width();
    const H  = _H;
    const ls = store.layoutSettings;

    // NOW line
    const nowX = _toX(store.centerAbsoluteTime);
    if (nowX >= MARGIN && nowX <= W - MARGIN) {
        dynamicLayer.add(new Konva.Line({
            points: [nowX, 2, nowX, H - 2],
            stroke: '#ef4444',
            strokeWidth: 1,
            opacity: 0.8,
            listening: false,
        }));
    }

    // Viewport window
    if (store.viewportWidthPx > 0 && ls) {
        const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
        const tickDist = store.tickDistance;   // BL-80: this rung's override, or the global setting
        const halfAbs  = (store.viewportWidthPx / 2 / tickDist) * lodStep;

        const vpL = Math.max(MARGIN, _toX(store.centerAbsoluteTime - halfAbs));
        const vpR = Math.min(W - MARGIN, _toX(store.centerAbsoluteTime + halfAbs));

        if (vpR > vpL) {
            dynamicLayer.add(new Konva.Rect({
                x: vpL, y: 0,
                width: vpR - vpL, height: H,
                fill: '#3b82f6',
                opacity: 0.08,
                stroke: '#3b82f6',
                strokeWidth: 1,
                listening: false,
            }));
        }
    }

    dynamicLayer.batchDraw();
}

// ─── Static layer: items, structure — rebuilt only when data changes ──────────

function renderStatic() {
    if (!stage || !layer || !tooltipLayer || !dynamicLayer) return;

    layer.destroyChildren();
    tooltipLayer.destroyChildren();

    const W  = stage.width();
    const H  = stage.height();
    const ls = store.layoutSettings;
    const allItems = store.items;

    if (!ls || allItems.length === 0) {
        layer.batchDraw();
        dynamicLayer.destroyChildren(); dynamicLayer.batchDraw();
        return;
    }

    // ── 1. Range ───────────────────────────────────────────────────────────
    const startMarker = allItems.find(i => i.TypeId === 8);
    const endMarker   = allItems.find(i => i.TypeId === 9);
    const visible     = allItems.filter(i => i.TypeId !== 8 && i.TypeId !== 9);

    // Build filter set: items that pass the active filter get full opacity in minimap
    const hasActiveFilter = store.filterRules.some(r => r.State !== 'neutral');
    const filteredIds     = hasActiveFilter ? new Set(store.filteredItems.map(i => i.Id)) : null;
    const fo = (id: string) => (filteredIds && !filteredIds.has(id)) ? 0.22 : 1;

    if (visible.length === 0) {
        layer.batchDraw();
        dynamicLayer.destroyChildren(); dynamicLayer.batchDraw();
        return;
    }

    const absEnds   = visible.map(i => i.AbsoluteEnd > i.AbsoluteStart ? i.AbsoluteEnd : i.AbsoluteStart);
    const absStarts = visible.map(i => i.AbsoluteStart);

    const rangeStart = startMarker?.AbsoluteStart ?? Math.min(...absStarts);
    const rangeEnd   = endMarker?.AbsoluteStart   ?? Math.max(...absEnds);

    if (rangeEnd <= rangeStart) {
        layer.batchDraw();
        dynamicLayer.destroyChildren(); dynamicLayer.batchDraw();
        return;
    }

    const toX   = buildToX(W, rangeStart, rangeEnd);
    const lineY = H * TIMELINE_Y;

    // Store for renderDynamic so it doesn't need to recompute the range
    _toX = toX;
    _fromX = (x: number) => rangeStart + ((x - MARGIN) / (W - 2 * MARGIN)) * (rangeEnd - rangeStart);
    _H   = H;

    // ── 2. Density histogram ───────────────────────────────────────────────
    const BUCKETS    = 80;
    const buckets    = new Array(BUCKETS).fill(0);
    const itemsForDensity = visible.filter(i => i.TypeId !== 6);
    for (const item of itemsForDensity) {
        const idx = Math.floor(((item.AbsoluteStart - rangeStart) / (rangeEnd - rangeStart)) * BUCKETS);
        if (idx >= 0 && idx < BUCKETS) buckets[idx]++;
    }
    const maxDensity  = Math.max(...buckets, 1);
    const bucketW     = (W - 2 * MARGIN) / BUCKETS;
    const maxBarH     = lineY * 0.96; // reach near the top of the canvas

    for (let i = 0; i < BUCKETS; i++) {
        if (buckets[i] === 0) continue;
        const bh = (buckets[i] / maxDensity) * maxBarH;
        layer.add(new Konva.Rect({
            x: MARGIN + i * bucketW,
            y: lineY - bh,
            width: Math.ceil(bucketW + 1), // +1 to eliminate inter-column gaps
            height: bh,
            fill: canvasColor('--app-text-muted', '#94a3b8'),
            opacity: 0.3,
            listening: false,
        }));
    }

    // ── 3. Timeline line ───────────────────────────────────────────────────
    layer.add(new Konva.Line({
        points: [MARGIN, lineY, W - MARGIN, lineY],
        stroke: canvasColor('--app-text-dim', '#64748b'),
        strokeWidth: 1.5,
        listening: false,
    }));

    // ── 4. Ages (straddle the timeline line) ───────────────────────────────
    for (const item of visible.filter(i => i.TypeId === 3)) {
        const x1 = toX(item.AbsoluteStart);
        const x2 = toX(item.AbsoluteEnd > item.AbsoluteStart ? item.AbsoluteEnd : item.AbsoluteStart + (rangeEnd - rangeStart) * 0.001);
        const color = item.Color || '#7c3aed';
        layer.add(new Konva.Rect({
            x: Math.min(x1, x2),
            y: lineY - AGE_H / 2,
            width: Math.max(Math.abs(x2 - x1), 3),
            height: AGE_H,
            fill: color,
            opacity: 0.65 * fo(item.Id),
            cornerRadius: 2,
            listening: false,
        }));
    }

    // ── 5. Periods (stacked below timeline) ───────────────────────────────
    const periods = visible.filter(i => i.TypeId === 2)
        .sort((a, b) => a.AbsoluteStart - b.AbsoluteStart);
    const lanes: number[] = []; // rightmost x-end per lane

    for (const item of periods) {
        const x1 = toX(item.AbsoluteStart);
        const x2 = toX(item.AbsoluteEnd > item.AbsoluteStart ? item.AbsoluteEnd : item.AbsoluteStart + (rangeEnd - rangeStart) * 0.005);
        const left  = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const color = item.Color || '#b45309';

        let lane = lanes.findIndex(end => end <= left);
        if (lane === -1) { lane = lanes.length; lanes.push(right); }
        else lanes[lane] = right;

        const barY = lineY + AGE_H / 2 + 2 + lane * (PERIOD_H + PERIOD_GAP);

        const periodFo = fo(item.Id);
        // Period bar
        layer.add(new Konva.Rect({
            x: left, y: barY,
            width: Math.max(right - left, 2), height: PERIOD_H,
            fill: color, opacity: 0.72 * periodFo,
            listening: false,
        }));

        // Downward triangle ABOVE the timeline at the start position only
        const TS = 4;
        layer.add(new Konva.Line({
            points: [left - TS, lineY - AGE_H / 2 - TS * 2, left + TS, lineY - AGE_H / 2 - TS * 2, left, lineY - AGE_H / 2],
            closed: true, fill: color, opacity: 0.85 * periodFo, listening: false,
        }));
    }

    // ── 6. Event / other items (vertical stem + dot) ───────────────────────
    const EVENT_TYPES = new Set([1, 4, 5, 7]); // Event, Picture, Note, Character
    for (const item of visible.filter(i => EVENT_TYPES.has(i.TypeId))) {
        const x = toX(item.AbsoluteStart);
        if (x < MARGIN - 4 || x > W - MARGIN + 4) continue;
        const color = item.Color || '#334155';
        const eventFo = fo(item.Id);
        layer.add(new Konva.Line({
            points: [x, lineY - ITEM_STEM_H, x, lineY],
            stroke: color, strokeWidth: 1, opacity: 0.65 * eventFo, listening: false,
        }));
        layer.add(new Konva.Circle({
            x, y: lineY - ITEM_STEM_H,
            radius: DOT_R, fill: color, opacity: 0.75 * eventFo, listening: false,
        }));
    }

    // ── 7. Bookmarks (hoverable + clickable) ──────────────────────────────
    tooltipLabel = new Konva.Label({ opacity: 0.88, listening: false });
    tooltipLabel.add(new Konva.Tag({
        fill: '#1e293b', cornerRadius: 3,
        shadowColor: '#000', shadowBlur: 4, shadowOpacity: 0.3,
    }));
    tooltipLabel.add(new Konva.Text({
        text: '', fontFamily: 'Arial', fontSize: 11,
        padding: 4, fill: '#f1f5f9',
    }));
    tooltipLayer.add(tooltipLabel);

    for (const item of visible.filter(i => i.TypeId === 6)) {
        const x = toX(item.AbsoluteStart);
        if (x < MARGIN - 4 || x > W - MARGIN + 4) continue;
        const color = item.Color || '#4b5563';

        const group = new Konva.Group({ opacity: fo(item.Id) });

        group.add(new Konva.Line({
            points: [x, lineY - BM_STEM_H, x, lineY],
            stroke: color, strokeWidth: 2,
        }));
        group.add(new Konva.Line({
            points: [x, lineY - BM_STEM_H - 6, x - 4, lineY - BM_STEM_H, x, lineY - BM_STEM_H + 6, x + 4, lineY - BM_STEM_H],
            closed: true, fill: color, stroke: color, strokeWidth: 1,
        }));
        group.add(new Konva.Rect({
            x: x - 7, y: lineY - BM_STEM_H - 8,
            width: 14, height: BM_STEM_H + 8,
            fill: 'transparent',
        }));

        group.on('mouseenter', () => {
            stage!.container().style.cursor = 'pointer';
            const textNode = tooltipLabel!.getText();
            textNode.text(item.Title || '—');
            tooltipLabel!.position({ x: Math.min(x + 6, W - 120), y: lineY - BM_STEM_H - 30 });
            tooltipLabel!.show();
            tooltipLayer!.batchDraw();
        });
        group.on('mouseleave', () => {
            stage!.container().style.cursor = 'default';
            tooltipLabel!.hide();
            tooltipLayer!.batchDraw();
        });
        group.on('click', (e) => {
            e.cancelBubble = true; // stage click handler would jump to the raw pointer position
            emit('jumpToYear', item.AbsoluteStart);
        });

        layer.add(group);
    }

    // ── 8. Start / end inward arrows ──────────────────────────────────────
    const ARROW_COLOR  = '#475569';
    const arrowOptions = { fill: ARROW_COLOR, stroke: ARROW_COLOR, strokeWidth: 1.5, pointerLength: 8, pointerWidth: 7, listening: false };

    layer.add(new Konva.Arrow({ ...arrowOptions, points: [MARGIN - 2, lineY, MARGIN + 14, lineY] }));
    layer.add(new Konva.Arrow({ ...arrowOptions, points: [W - MARGIN + 2, lineY, W - MARGIN - 14, lineY] }));

    layer.batchDraw();
    tooltipLayer.batchDraw();

    // Position the dynamic overlay (NOW line + viewport rect) for the updated range
    renderDynamic();
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
    if (!containerRef.value) return;

    stage = new Konva.Stage({
        container: containerRef.value,
        width: containerRef.value.clientWidth,
        height: containerRef.value.clientHeight,
    });
    layer        = new Konva.Layer();
    dynamicLayer = new Konva.Layer();
    tooltipLayer = new Konva.Layer();
    stage.add(layer, dynamicLayer, tooltipLayer);

    stage.on('click', () => {
        const x = stage?.getPointerPosition()?.x;
        if (x == null || !_fromX) return;
        emit('jumpToYear', Math.round(_fromX(x)));
    });

    resizeObserver = new ResizeObserver(() => {
        if (!stage || !containerRef.value) return;
        stage.width(containerRef.value.clientWidth);
        stage.height(containerRef.value.clientHeight);
        renderStatic();
    });
    resizeObserver.observe(containerRef.value);

    renderStatic();
});

onUnmounted(() => {
    resizeObserver?.disconnect();
    stage?.destroy();
});

// Static rebuild: only when items, filter state, or LOD level change
watch(
    [() => store.items, () => store.filteredItems, () => store.currentLodIndex],
    renderStatic,
    { deep: false },
);

// Dynamic update: reposition NOW line + viewport rect during panning (no scene rebuild)
watch(
    [() => store.centerAbsoluteTime, () => store.viewportWidthPx],
    renderDynamic,
    { deep: false },
);
</script>

<template>
    <div
        ref="containerRef"
        class="minimap-container"
        :style="{ background: store.layoutSettings?.TimelineCanvasBackgroundColor ?? '#f1e7d5' }"
    />
</template>

<style scoped lang="scss">
.minimap-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
}
</style>

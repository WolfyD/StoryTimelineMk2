<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import Konva from 'konva';
import { useTimelineStore } from '@/stores/timelineStore';

const emit = defineEmits<{ jumpToYear: [year: number] }>();

const store = useTimelineStore();
const containerRef = ref<HTMLDivElement>();

let stage: Konva.Stage | null = null;
let layer: Konva.Layer | null = null;
let tooltipLayer: Konva.Layer | null = null;
let tooltipLabel: Konva.Label | null = null;
let resizeObserver: ResizeObserver | null = null;

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

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
    if (!stage || !layer || !tooltipLayer) return;

    layer.destroyChildren();
    tooltipLayer.destroyChildren();

    const W  = stage.width();
    const H  = stage.height();
    const ls = store.layoutSettings;
    const allItems = store.items;

    if (!ls || allItems.length === 0) { layer.batchDraw(); return; }

    // ── 1. Range ───────────────────────────────────────────────────────────
    const startMarker = allItems.find(i => i.TypeId === 8);
    const endMarker   = allItems.find(i => i.TypeId === 9);
    const visible     = allItems.filter(i => i.TypeId !== 8 && i.TypeId !== 9);

    if (visible.length === 0) { layer.batchDraw(); return; }

    const absEnds   = visible.map(i => i.AbsoluteEnd > i.AbsoluteStart ? i.AbsoluteEnd : i.AbsoluteStart);
    const absStarts = visible.map(i => i.AbsoluteStart);

    const rangeStart = startMarker?.AbsoluteStart ?? Math.min(...absStarts);
    const rangeEnd   = endMarker?.AbsoluteStart   ?? Math.max(...absEnds);

    if (rangeEnd <= rangeStart) { layer.batchDraw(); return; }

    const toX     = buildToX(W, rangeStart, rangeEnd);
    const lineY   = H * TIMELINE_Y;

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
            fill: '#94a3b8',
            opacity: 0.3,
            listening: false,
        }));
    }

    // ── 3. Timeline line ───────────────────────────────────────────────────
    layer.add(new Konva.Line({
        points: [MARGIN, lineY, W - MARGIN, lineY],
        stroke: '#64748b',
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
            opacity: 0.65,
            cornerRadius: 2,
            listening: false,
        }));
    }

    // ── 5. Periods (stacked below timeline) ───────────────────────────────
    const periods = [...visible.filter(i => i.TypeId === 2)]
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

        // Period bar
        layer.add(new Konva.Rect({
            x: left, y: barY,
            width: Math.max(right - left, 2), height: PERIOD_H,
            fill: color, opacity: 0.72,
            listening: false,
        }));

        // Downward triangle ABOVE the timeline at the start position only
        const TS   = 4;
        layer.add(new Konva.Line({
            points: [left - TS, lineY - AGE_H / 2 - TS * 2, left + TS, lineY - AGE_H / 2 - TS * 2, left, lineY - AGE_H / 2],
            closed: true, fill: color, opacity: 0.85, listening: false,
        }));
    }

    // ── 6. Event / other items (vertical stem + dot) ───────────────────────
    const EVENT_TYPES = new Set([1, 4, 5, 7]); // Event, Picture, Note, Character
    for (const item of visible.filter(i => EVENT_TYPES.has(i.TypeId))) {
        const x = toX(item.AbsoluteStart);
        if (x < MARGIN - 4 || x > W - MARGIN + 4) continue;
        const color = item.Color || '#334155';
        layer.add(new Konva.Line({
            points: [x, lineY - ITEM_STEM_H, x, lineY],
            stroke: color, strokeWidth: 1, opacity: 0.65, listening: false,
        }));
        layer.add(new Konva.Circle({
            x, y: lineY - ITEM_STEM_H,
            radius: DOT_R, fill: color, opacity: 0.75, listening: false,
        }));
    }

    // ── 7. Bookmarks (hoverable + clickable) ──────────────────────────────
    // Build tooltip nodes once
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

        const group = new Konva.Group();

        // Stem
        group.add(new Konva.Line({
            points: [x, lineY - BM_STEM_H, x, lineY],
            stroke: color, strokeWidth: 2,
        }));
        // Diamond head
        group.add(new Konva.Line({
            points: [x, lineY - BM_STEM_H - 6, x - 4, lineY - BM_STEM_H, x, lineY - BM_STEM_H + 6, x + 4, lineY - BM_STEM_H],
            closed: true, fill: color, stroke: color, strokeWidth: 1,
        }));
        // Wide invisible hit area
        group.add(new Konva.Rect({
            x: x - 7, y: lineY - BM_STEM_H - 8,
            width: 14, height: BM_STEM_H + 8,
            fill: 'transparent',
        }));

        group.on('mouseenter', (e) => {
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
        group.on('click', () => {
            emit('jumpToYear', item.AbsoluteStart);
        });

        layer.add(group);
    }

    // ── 8. Start / end inward arrows ──────────────────────────────────────
    const ARROW_COLOR  = '#475569';
    const arrowOptions = { fill: ARROW_COLOR, stroke: ARROW_COLOR, strokeWidth: 1.5, pointerLength: 8, pointerWidth: 7, listening: false };

    // Left: points right (inward)
    layer.add(new Konva.Arrow({ ...arrowOptions, points: [MARGIN - 2, lineY, MARGIN + 14, lineY] }));
    // Right: points left (inward)
    layer.add(new Konva.Arrow({ ...arrowOptions, points: [W - MARGIN + 2, lineY, W - MARGIN - 14, lineY] }));

    // ── 9. NOW line ────────────────────────────────────────────────────────
    const nowX = toX(store.centerAbsoluteTime);
    if (nowX >= MARGIN && nowX <= W - MARGIN) {
        layer.add(new Konva.Line({
            points: [nowX, 2, nowX, H - 2],
            stroke: '#ef4444',
            strokeWidth: 1,
            opacity: 0.8,
            listening: false,
        }));
    }

    // ── 10. Viewport window ────────────────────────────────────────────────
    if (store.viewportWidthPx > 0) {
        const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
        const tickDist = ls.TimelineTickDistance || 100;
        const halfAbs  = (store.viewportWidthPx / 2 / tickDist) * lodStep;

        const vpL = Math.max(MARGIN, toX(store.centerAbsoluteTime - halfAbs));
        const vpR = Math.min(W - MARGIN, toX(store.centerAbsoluteTime + halfAbs));

        if (vpR > vpL) {
            layer.add(new Konva.Rect({
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

    layer.batchDraw();
    tooltipLayer.batchDraw();
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
    tooltipLayer = new Konva.Layer();
    stage.add(layer, tooltipLayer);

    resizeObserver = new ResizeObserver(() => {
        if (!stage || !containerRef.value) return;
        stage.width(containerRef.value.clientWidth);
        stage.height(containerRef.value.clientHeight);
        render();
    });
    resizeObserver.observe(containerRef.value);

    render();
});

onUnmounted(() => {
    resizeObserver?.disconnect();
    stage?.destroy();
});

// Re-render whenever relevant store state changes
watch(
    [() => store.items, () => store.centerAbsoluteTime, () => store.viewportWidthPx, () => store.currentLodIndex],
    render,
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

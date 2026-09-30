<script setup lang="ts">
/**
 * BL-16: the map's clock as one track. One handle is one date; a second handle on the same track is a
 * window, and everything between the two is drawn at once. Two sliders stacked on top of each other
 * read as two unrelated settings — two ends of one line read as one stretch of time.
 *
 * The marks under the track are where something happens, taller where more does, and a handle let go
 * near one lands on it. Alt while dragging lets it land anywhere.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { snapTo, stepTo, tickDensity } from '@/utils/mapTime'

const props = defineProps<{
    min: number
    max: number
    /** The far handle, or the only one. */
    at: number
    /** The near handle, or null for one date. */
    from: number | null
    /** Every moment something happens: the marks, and what a handle snaps to. */
    ticks: number[]
    /** One arrow-key nudge. */
    step: number
    /** A value as a date, for the handles' tooltips and screen readers. */
    label: (v: number) => string
}>()

const emit = defineEmits<{
    'update:at': [value: number]
    'update:from': [value: number]
    /** A hand is on the track, so whatever is moving the clock has to let go. */
    grab: []
    /** Held down and let go: what is slow to redraw can wait for the hand to lift. */
    hold: [held: boolean]
}>()

const track = ref<HTMLDivElement | null>(null)

/** Slices the marks are counted into; the SVG stretches them to whatever width the track has. */
const BUCKETS = 240
/** How close a handle has to be let go to a moment to land on it, in screen pixels. */
const SNAP_PX = 6
/** What a handle does beyond being dragged, under its date: nothing on screen says it otherwise. */
const TIP = '\nHold Alt to drag without snapping · PgUp / PgDn: next or previous moment'

const width = computed(() => props.max - props.min)
const pct = (v: number) =>
    `${width.value > 0 ? Math.min(1, Math.max(0, (v - props.min) / width.value)) * 100 : 0}%`

/** One mark per busy slice, as a single path — thousands of moments stay one DOM node. */
const marks = computed(() => {
    let d = ''
    tickDensity(props.ticks, props.min, props.max, BUCKETS).forEach((n, i) => {
        if (!n) return
        const h = 10 * Math.min(1, 0.35 + 0.22 * Math.log2(n))
        d += `M${i + 0.5} 10V${(10 - h).toFixed(2)}`
    })
    return d
})

let drag: { what: 'at' | 'from' | 'band'; grip: number; span: number } | null = null

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function valueAt(clientX: number, snap: boolean): number {
    const r = track.value!.getBoundingClientRect()
    const v = props.min + clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * width.value
    return snap ? snapTo(props.ticks, v, (SNAP_PX / Math.max(1, r.width)) * width.value) : v
}

function down(e: PointerEvent, what?: 'at' | 'from' | 'band') {
    if (e.button !== 0) return
    // Left to the browser, a press is also the start of a text selection, and a press on something
    // already inside one picks the selection up to drag it away — the no-entry cursor, and a handle that
    // will not move. Cancelling it cancels the focus a press gives too, and that is kept: a handle that
    // took the focus kept ← and → for itself, so after one drag they nudged a day instead of stepping the
    // story. Tab still reaches a handle, and one already focused lets go.
    e.preventDefault()
    if (track.value?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    emit('grab')
    const v = valueAt(e.clientX, false)
    // A press on the bare track brings the nearer handle to it, so a click anywhere is a jump.
    const which = what ?? (props.from === null || Math.abs(v - props.at) <= Math.abs(v - props.from) ? 'at' : 'from')
    const from = props.from ?? props.at
    drag = { what: which, grip: v - from, span: props.at - from }
    emit('hold', true)
    track.value?.setPointerCapture(e.pointerId)
    // A handle picked up stays put until it is moved; only a press on the bare track is a jump.
    if (!what) move(e)
}

function move(e: PointerEvent) {
    if (!drag) return
    if (drag.what === 'band') {
        const from = clamp(valueAt(e.clientX, false) - drag.grip, props.min, props.max - drag.span)
        emit('update:from', from)
        emit('update:at', from + drag.span)
        return
    }
    const v = valueAt(e.clientX, !e.altKey)
    // The handles do not cross: a window whose end is before its start is no window.
    if (drag.what === 'at') emit('update:at', props.from === null ? v : Math.max(v, props.from))
    else emit('update:from', Math.min(v, props.at))
}

function up() {
    if (drag) emit('hold', false)
    drag = null
}

// Taken away mid-drag, it has still let go.
onBeforeUnmount(up)

/** Arrows nudge a day, Page keys jump between moments, Home and End go to the ends. */
function key(e: KeyboardEvent, what: 'at' | 'from') {
    const v = what === 'at' ? props.at : props.from!
    let to: number | null
    switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': to = v - props.step; break
        case 'ArrowRight': case 'ArrowUp': to = v + props.step; break
        case 'PageDown': to = stepTo(props.ticks, v, -1); break
        case 'PageUp': to = stepTo(props.ticks, v, 1); break
        case 'Home': to = props.min; break
        case 'End': to = props.max; break
        default: return
    }
    // The map's own arrow keys step the story; on a focused handle they belong to the handle.
    e.preventDefault()
    e.stopPropagation()
    if (to === null) return
    emit('grab')
    to = clamp(to, props.min, props.max)
    if (what === 'at') emit('update:at', props.from === null ? to : Math.max(to, props.from))
    else emit('update:from', Math.min(to, props.at))
}
</script>

<template>
    <div
        ref="track"
        class="time-track"
        :class="{ ranged: from !== null }"
        @pointerdown="down($event)"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
    >
        <svg class="marks" viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true">
            <path :d="marks" />
        </svg>
        <div class="rail" />
        <div
            class="band"
            :style="{ left: from === null ? '0%' : pct(from), right: `calc(100% - ${pct(at)})` }"
            :title="from === null ? undefined : 'Drag to slide the whole date range'"
            @pointerdown.stop="from !== null && down($event, 'band')"
        />
        <div
            v-if="from !== null"
            class="handle from"
            role="slider"
            tabindex="0"
            :style="{ left: pct(from) }"
            :aria-valuemin="min"
            :aria-valuemax="at"
            :aria-valuenow="from"
            :aria-valuetext="label(from)"
            aria-label="Where the date range starts"
            :title="label(from) + TIP"
            @pointerdown.stop="down($event, 'from')"
            @keydown="key($event, 'from')"
        />
        <div
            class="handle"
            role="slider"
            tabindex="0"
            :style="{ left: pct(at) }"
            :aria-valuemin="from ?? min"
            :aria-valuemax="max"
            :aria-valuenow="at"
            :aria-valuetext="label(at)"
            :aria-label="from === null ? 'The date the map is showing' : 'Where the date range ends'"
            :title="label(at) + TIP"
            @pointerdown.stop="down($event, 'at')"
            @keydown="key($event, 'at')"
        />
    </div>
</template>

<style scoped lang="scss">
.time-track {
    position: relative;
    flex: 1;
    min-width: 60px;
    height: 20px;
    cursor: pointer;
    touch-action: none;
    user-select: none;
}

// Where things happen, drawn under the rail so the handles sit on top of the busiest stretch.
.marks {
    position: absolute;
    inset: 0 0 auto;
    width: 100%;
    height: 8px;
    pointer-events: none;

    path {
        stroke: #fbbf24;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
        opacity: 0.55;
    }
}

.rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 11px;
    height: 3px;
    border-radius: 2px;
    background: var(--app-border, #2d3a56);
}

// One date: how far through the story it is. Two: the window itself, and a thing to drag.
.band {
    position: absolute;
    top: 11px;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, #fbbf24 55%, transparent);
    pointer-events: none;

    .ranged & {
        top: 8px;
        height: 9px;
        background: color-mix(in srgb, #fbbf24 30%, transparent);
        border: 1px solid color-mix(in srgb, #fbbf24 60%, transparent);
        pointer-events: auto;
        cursor: grab;

        &:active { cursor: grabbing; }
    }
}

.handle {
    position: absolute;
    top: 6px;
    width: 13px;
    height: 13px;
    margin-left: -6.5px;
    border-radius: 50%;
    background: #fbbf24;
    border: 2px solid var(--app-surface, #0c1524);
    box-shadow: 0 0 0 1px #fbbf24;
    cursor: ew-resize;
    outline: none;

    // The near end is the quieter of the two: the far one is where the story is.
    &.from { background: #cbd5e1; box-shadow: 0 0 0 1px #cbd5e1; }

    &:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, #fbbf24 60%, transparent); }
}
</style>

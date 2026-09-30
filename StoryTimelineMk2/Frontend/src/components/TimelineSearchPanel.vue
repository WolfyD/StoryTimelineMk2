<script lang="ts">
import { reactive } from 'vue'
// Where the panel was dragged to, kept for the next time it opens. x < 0: not placed yet.
const at = reactive({ x: -1, y: 64 })
</script>

<script setup lang="ts">
/**
 * BL-88 phase 8: the timeline's own search, so finding an item does not mean opening the Archive.
 * A small panel over the canvas, dragged by its header. Enter and Shift+Enter, or the arrows, step
 * through the matches, and each step pans to the item and pulses it. It reads the title, the
 * description and the tags of what the canvas draws: an item the filter hides is not found.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PhCaretDown, PhCaretUp, PhMagnifyingGlass, PhX } from '@phosphor-icons/vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { dayOfYearAt } from '@/utils/timelineLayout'
import { keepOnScreen } from '@/utils/modal'
import { stepMatch, timelineMatches } from '@/utils/archiveItems'
import type { TimelineItem } from '@/types/models'

const emit = defineEmits<{ jump: [item: TimelineItem]; close: [] }>()

const store = useTimelineStore()
const query = ref('')
const index = ref(-1)
const panel = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const matches = computed(() =>
    timelineMatches([...store.filteredItems, ...store.dimmableItems], store.itemTagMap, query.value))
// A new query, or an edit that changed the list: the next step starts from the view again. The list
// grows the panel, so it is pulled back on screen as well.
watch(matches, () => {
    index.value = -1
    void nextTick(fit)
})

function step(forward: boolean) {
    pick(stepMatch(matches.value, index.value, forward, store.centerAbsoluteTime))
}

function pick(i: number) {
    const m = matches.value[i]
    if (!m) return
    index.value = i
    emit('jump', m)
    void nextTick(() => list.value?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }))
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); step(!e.shiftKey) }
    else if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
}

const count = computed(() => !query.value.trim() ? ''
    : !matches.value.length ? 'No matches'
    : index.value < 0 ? `${matches.value.length} found`
    : `${index.value + 1} of ${matches.value.length}`)

/** Same as the Archive's: a year boundary reads as the year alone, anything inside one names its day. */
function dateOf(t: number): string {
    const { year, day } = dayOfYearAt(t, store.calendarConfig)
    return day === 0 && Math.abs(t - year) < 1e-9 ? `${year}` : `${store.activeFormatRegistry.DAYS!(year, day)} ${year}`
}

// ── Dragging, and staying on screen ───────────────────────────────────────────

let grab: { dx: number; dy: number } | null = null

function grabStart(e: PointerEvent) {
    if ((e.target as Element).closest('button')) return
    grab = { dx: e.clientX - at.x, dy: e.clientY - at.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function grabMove(e: PointerEvent) {
    if (!grab) return
    at.x = e.clientX - grab.dx
    at.y = e.clientY - grab.dy
    keepOnScreen(panel.value, at)
}

const fit = () => keepOnScreen(panel.value, at)

function focus() {
    input.value?.focus()
    input.value?.select()
}
defineExpose({ focus })

onMounted(() => {
    // First time: the top right corner, clear of the ruler's buttons.
    if (at.x < 0) at.x = window.innerWidth - (panel.value?.offsetWidth ?? 320) - 24
    fit()
    focus()
    window.addEventListener('resize', fit)
})
onBeforeUnmount(() => window.removeEventListener('resize', fit))
</script>

<template>
    <Teleport to="body">
        <div ref="panel" class="tl-search" :style="{ left: `${at.x}px`, top: `${at.y}px` }" role="search">
            <div class="head" @pointerdown="grabStart" @pointermove="grabMove" @lostpointercapture="grab = null">
                <PhMagnifyingGlass :size="14" />
                <span>Search this timeline</span>
                <button class="icon" aria-label="Close" data-tip="Close (Esc)" @click="emit('close')"><PhX :size="14" /></button>
            </div>
            <div class="bar">
                <input
                    ref="input" v-model="query" type="search" placeholder="Title, description or tag"
                    aria-label="Search this timeline" @keydown="onKey"
                >
                <span class="count">{{ count }}</span>
                <!-- mousedown.prevent: the box keeps the focus, so Enter still steps after a click. -->
                <button class="icon" :disabled="!matches.length" aria-label="Previous match" data-tip="Previous (Shift+Enter)"
                    @mousedown.prevent @click="step(false)"><PhCaretUp :size="15" /></button>
                <button class="icon" :disabled="!matches.length" aria-label="Next match" data-tip="Next (Enter)"
                    @mousedown.prevent @click="step(true)"><PhCaretDown :size="15" /></button>
            </div>
            <ul v-if="matches.length" ref="list" class="list">
                <li v-for="(m, i) in matches" :key="m.Id">
                    <button :class="{ on: i === index }" @mousedown.prevent @click="pick(i)">
                        <span class="title">{{ m.Title || 'Untitled' }}</span>
                        <span class="when">{{ dateOf(m.AbsoluteStart) }}</span>
                    </button>
                </li>
            </ul>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.tl-search {
    position: fixed;
    // Over the canvas and its panels, under any dialog.
    z-index: calc(var(--z-modal, 9000) - 1);
    width: min(320px, calc(100vw - 8px));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    background: var(--app-surface-raised, #141e33);
    box-shadow: 0 14px 40px -10px rgb(0 0 0 / 70%);
    color: var(--app-text, #e2e8f0);
    font-size: 0.8rem;
}

.head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
    cursor: move;
    user-select: none;
    touch-action: none;
    color: var(--app-text-muted, #94a3b8);
    font-weight: 600;

    span { flex: 1; }
}

.bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 6px 8px;

    input {
        flex: 1;
        min-width: 0;
        padding: 5px 8px;
        border: 1px solid var(--app-border, #2d3a56);
        border-radius: var(--app-radius-sm, 4px);
        background: var(--app-surface, #0c1524);
        color: inherit;
        font: inherit;

        &:focus { outline: none; border-color: var(--app-accent, #6366f1); }
    }
}

.count {
    min-width: 56px;
    text-align: right;
    color: var(--app-text-muted, #94a3b8);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;

    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.35; cursor: default; }
}

.list {
    max-height: min(40vh, 320px);
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
    border-top: 1px solid var(--app-border, #2d3a56);

    button {
        display: flex;
        align-items: baseline;
        gap: 8px;
        width: 100%;
        padding: 5px 8px;
        border: none;
        border-radius: var(--app-radius-sm, 4px);
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover { background: var(--app-surface-high, #1e2b44); }
        &.on { background: color-mix(in srgb, var(--app-accent, #6366f1) 28%, transparent); }
    }

    .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { flex-shrink: 0; color: var(--app-text-muted, #94a3b8); font-size: 0.72rem; }
}
</style>

<script setup lang="ts">
/**
 * BL-16: which map you are looking at, floating over the map itself. It used to be a block in the
 * sidebar under the selected place, where it read as though it described that marker.
 *
 * ponytail: plain HTML above the Konva stage rather than a shape drawn on it — a description that
 * wraps, a real button and an X come free here and would all be hand-rolled on the canvas. It is a
 * sibling of the stage container, so dragging or scrolling on the card never reaches the map under it.
 */
import { ref, onMounted } from 'vue'
import { PhX, PhPencilSimple, PhMapTrifold } from '@phosphor-icons/vue'
import type { MapItem } from '@/types/models'

defineProps<{ map: MapItem; places: number }>()
const emit = defineEmits<{ close: []; edit: [] }>()

// Where it was last left, per machine rather than per timeline — the same reasoning as the sidebar's
// width: it is about the monitor you are sitting at, not about the story.
const KEY = 'mapInfoPanelPos'
const card = ref<HTMLElement | null>(null)
const pos = ref(readPos())

function readPos() {
    const saved = (localStorage.getItem(KEY) ?? '').split(',').map(Number)
    // Below the top-left corner, which belongs to the button out of a map that is inside another.
    return saved.length === 2 && saved.every(Number.isFinite)
        ? { x: saved[0]!, y: saved[1]! }
        : { x: 12, y: 44 }
}

/** Kept inside the map area, so a remembered spot survives the window being made smaller. */
function clamp(x: number, y: number) {
    const el = card.value
    const box = el?.offsetParent as HTMLElement | null
    if (!el || !box) return { x, y }
    return {
        x: Math.min(Math.max(0, x), Math.max(0, box.clientWidth - el.offsetWidth)),
        y: Math.min(Math.max(0, y), Math.max(0, box.clientHeight - el.offsetHeight)),
    }
}

onMounted(() => { pos.value = clamp(pos.value.x, pos.value.y) })

/** Pointer capture rather than window listeners, so the drag survives crossing the canvas. */
function startDrag(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const grab = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
    const move = (m: PointerEvent) => { pos.value = clamp(m.clientX - grab.x, m.clientY - grab.y) }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', () => {
        handle.removeEventListener('pointermove', move)
        localStorage.setItem(KEY, `${pos.value.x},${pos.value.y}`)
    }, { once: true })
}
</script>

<template>
    <div ref="card" class="info-card" :style="{ left: `${pos.x}px`, top: `${pos.y}px` }">
        <header class="info-head" data-tip="Drag to move" @pointerdown="startDrag">
            <PhMapTrifold :size="14" class="head-icon" />
            <span class="head-name">{{ map.Name }}</span>
            <button class="icon-btn" aria-label="Hide this panel" data-tip="Hide this panel" @pointerdown.stop @click="emit('close')">
                <PhX :size="12" />
            </button>
        </header>
        <p class="info-desc" :class="{ empty: !map.Description }">
            {{ map.Description || 'No description yet.' }}
        </p>
        <p class="info-count">
            {{ places || 'No' }} {{ places === 1 ? 'place' : 'places' }} pinned
        </p>
        <button class="edit-btn" @click="emit('edit')">
            <PhPencilSimple :size="15" /> Edit map
        </button>
    </div>
</template>

<style scoped lang="scss">
.info-card {
    position: absolute;
    z-index: 5;
    width: 232px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 10px 10px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 6px);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 92%, transparent);
    box-shadow: 0 6px 20px #00000059;
    color: var(--app-text, #e2e8f0);
}

.info-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 -10px;
    padding: 6px 8px 6px 10px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    cursor: grab;
    touch-action: none;
    user-select: none;

    &:active { cursor: grabbing; }
}

.head-icon { flex-shrink: 0; color: var(--app-text-dim, #64748b); }

.head-name {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.icon-btn {
    background: none;
    border: none;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    flex-shrink: 0;

    &:hover { color: var(--app-accent-hover, #818cf8); }
}

.info-desc {
    margin: 2px 0 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--app-text-muted, #94a3b8);
    white-space: pre-wrap;
    max-height: 9em;
    overflow-y: auto;

    &.empty { font-style: italic; color: var(--app-text-dim, #64748b); }
}

.info-count { margin: 0; font-size: 0.72rem; color: var(--app-text-dim, #64748b); }

.edit-btn {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s;

    &:hover { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
}
</style>

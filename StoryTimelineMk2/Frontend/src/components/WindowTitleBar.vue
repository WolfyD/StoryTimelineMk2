<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { BackendAPI } from '@/bridge/api'

const props = withDefaults(defineProps<{
    title?: string
    subtitle?: string
    showMaximize?: boolean
    /** When set, the X calls this instead of closing — lets a page run its own guard (edit item's "Discard changes?"). */
    closeHandler?: () => void
}>(), {
    showMaximize: true,
})

const isMaximized = ref(false)
const isTopmost   = ref(false)

function onTopMostPush(e: MessageEvent) {
    let msg: any
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
    if (msg?.action === 'TopMostChanged' && typeof msg.payload?.isTopmost === 'boolean')
        isTopmost.value = msg.payload.isTopmost
}

onMounted(async () => {
    const result = await BackendAPI.WindowGetMaximized()
    if (result) isMaximized.value = result.isMaximized

    const topResult = await BackendAPI.WindowGetTopMost()
    if (topResult) isTopmost.value = topResult.isTopmost

    window.chrome?.webview?.addEventListener('message', onTopMostPush)
})

onUnmounted(() => {
    window.chrome?.webview?.removeEventListener('message', onTopMostPush)
})

function minimize()       { BackendAPI.WindowMinimize() }
function toggleMaximize() { cancelDrag(); isMaximized.value = !isMaximized.value; BackendAPI.WindowMaximizeRestore() }
function close()          { props.closeHandler ? props.closeHandler() : BackendAPI.WindowClose() }
function toggleTopmost()  { isTopmost.value = !isTopmost.value; BackendAPI.WindowSetTopMost(isTopmost.value) }

// ── Drag: only start the native move-loop after the mouse actually moves.
// Calling SendMessage(WM_NCLBUTTONDOWN, HTCAPTION) on every mousedown enters a
// blocking modal loop that eats the second click of a double-click.  By waiting
// for movement we leave single-click and dblclick events clean.
let _dragOrigin: { x: number; y: number } | null = null
let _dragMoveHandler: ((e: MouseEvent) => void) | null = null
const DRAG_THRESHOLD = 4

function onDragMousedown(e: MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    _dragOrigin = { x: e.screenX, y: e.screenY }
    _dragMoveHandler = (mv: MouseEvent) => {
        if (!_dragOrigin) return
        if (Math.abs(mv.screenX - _dragOrigin.x) > DRAG_THRESHOLD ||
            Math.abs(mv.screenY - _dragOrigin.y) > DRAG_THRESHOLD) {
            cancelDrag()
            BackendAPI.WindowStartDrag()
        }
    }
    window.addEventListener('mousemove', _dragMoveHandler)
    window.addEventListener('mouseup', cancelDrag, { once: true })
}

function cancelDrag() {
    _dragOrigin = null
    if (_dragMoveHandler) {
        window.removeEventListener('mousemove', _dragMoveHandler)
        _dragMoveHandler = null
    }
}
</script>

<template>
    <div class="title-bar">
        <!-- ── Drag region ──────────────────────────────────────────────── -->
        <div
            class="title-bar__drag"
            @mousedown="onDragMousedown"
            @dblclick="toggleMaximize"
        >
            <span class="title-bar__orb" aria-hidden="true"></span>
            <div class="title-bar__label">
                <span class="title-bar__name">{{ title || 'Story Timeline' }}</span>
                <span v-if="subtitle" class="title-bar__sub">{{ subtitle }}</span>
            </div>
        </div>

        <!-- ── Window controls ─────────────────────────────────────────── -->
        <div class="title-bar__controls">
            <button
                tabindex="-1"
                class="tb-btn tb-btn--pin"
                :class="{ 'tb-btn--pin-active': isTopmost }"
                :title="isTopmost ? 'Unpin window (stay on top)' : 'Pin window (stay on top)'"
                @click="toggleTopmost"
            >
                <i :class="isTopmost ? 'ri-pushpin-fill' : 'ri-pushpin-line'"></i>
            </button>
            <div class="tb-controls-sep" aria-hidden="true"></div>
            <button tabindex="-1" class="tb-btn tb-btn--min"   title="Minimize"                              @click="minimize">
                <i class="ri-subtract-line"></i>
            </button>
            <button
                v-if="showMaximize"
                tabindex="-1"
                class="tb-btn tb-btn--max"
                :title="isMaximized ? 'Restore' : 'Maximize'"
                @click="toggleMaximize"
            >
                <i :class="isMaximized ? 'ri-contract-up-down-line' : 'ri-expand-up-down-line'"></i>
            </button>
            <button tabindex="-1" class="tb-btn tb-btn--close" title="Close"                                 @click="close">
                <i class="ri-close-line"></i>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
// ── Title bar shell ────────────────────────────────────────────────────────────
//
// Design intent: the title bar is the darkest layer — it "caps" the window
// like a roof, framing the activity strip (#182236) and content (var(--app-bg, #0f172a)) below.
// The indigo bottom glow ties it to the same accent system the activity strip uses.

.title-bar {
    width: 100%;
    height: 36px;           // must match BorderlessFormBase.TitleBarHeight
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex-shrink: 0;
    position: relative;     // positioning context for absolutely-placed controls
    z-index: 2;             // shadow renders above the content below
    overflow: hidden;       // clip any overflowing content at our boundary

    // Darkest layer: top #060c19, blends toward content (#0a1424 ≈ halfway to var(--app-bg, #0f172a))
    background: linear-gradient(180deg, var(--tb-bg-from, #060c19) 0%, var(--tb-bg-to, #0a1424) 100%);

    border-bottom: 1px solid var(--tb-border-color, rgba(79, 70, 229, 0.18));

    // Depth: shadow below pushes content down visually; micro-highlight on top edge
    box-shadow:
        0 2px 12px rgba(0, 0, 0, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);

    user-select: none;
}

// ── Drag region ────────────────────────────────────────────────────────────────

.title-bar__drag {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    outline: none;
    // Right padding reserves space for the 3 window-control buttons (3 × 36px = 108px)
    // so title text never overlaps them. Left padding matches original 12px.
    padding: 0 120px 0 12px;
    cursor: default;
    overflow: hidden;
}

// ── Brand orb ──────────────────────────────────────────────────────────────────
//
// Matches the indigo accent system from the activity strip (active icon var(--app-accent-hover, #818cf8),
// active border var(--app-accent, #6366f1)). A slow breath animation makes the window feel alive
// without being distracting.

.title-bar__orb {
    display: block;
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--tb-orb-1, #4338ca) 0%, var(--tb-orb-2, #818cf8) 100%);
    box-shadow:
        0 0 5px  rgba(99, 102, 241, 0.45),
        0 0 12px rgba(99, 102, 241, 0.16);
    animation: orb-breathe 4s ease-in-out infinite;
}

@keyframes orb-breathe {
    0%, 100% {
        box-shadow:
            0 0 4px  rgba(99, 102, 241, 0.38),
            0 0 10px rgba(99, 102, 241, 0.12);
    }
    50% {
        box-shadow:
            0 0 8px  rgba(99, 102, 241, 0.65),
            0 0 18px rgba(99, 102, 241, 0.24);
    }
}

// ── Text ───────────────────────────────────────────────────────────────────────

.title-bar__label {
    display: flex;
    align-items: baseline;
    gap: 7px;
    overflow: hidden;
    min-width: 0;
}

.title-bar__name {
    font-size: 12px;
    font-weight: 500;
    // Cooler-tinted slate — slightly more blue than the neutral var(--app-text-muted, #94a3b8) so it
    // harmonises with the indigo accent and the dark navy background.
    color: var(--tb-text, #8ea5c0);
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.title-bar__sub {
    font-size: 11px;
    font-weight: 400;
    color: var(--tb-sub, #3d5166);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

// ── Window controls ────────────────────────────────────────────────────────────
//
// Default colour matches the strip's inactive icon (#3d5166).
// Hover colour matches the strip's hover (#8ca5bc).
// This makes the entire left edge of the window feel visually unified.

.title-bar__controls {
    // Anchored to the right edge so buttons are always visible regardless of
    // how narrow the window gets. The drag area's padding-right reserves the
    // same 120px so title text never slides under these buttons.
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    z-index: 1;
    // Gradient matches the title bar so any content behind is covered cleanly
    background: linear-gradient(180deg, var(--tb-bg-from, #060c19) 0%, var(--tb-bg-to, #0a1424) 100%);
    border-left: 1px solid rgba(255, 255, 255, 0.05);
}

.tb-btn {
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    outline: none;
    color: var(--tb-btn-color, #3d5166);
    cursor: pointer;
    font-size: 13px;
    transition: background 0.13s ease, color 0.13s ease;

    &:hover {
        color: var(--tb-btn-hover-color, #8ca5bc);
        background: var(--tb-btn-hover-bg, rgba(255, 255, 255, 0.07));
    }

    &:active {
        background: rgba(255, 255, 255, 0.03);
        color: #6b8099;
    }

    &--close:hover {
        color: #f8fafc;
        background: #991b1b;
    }

    &--close:active {
        background: #7f1d1d;
    }

    // Pin (stay on top) — amber when active so it reads as a "lock" state
    &--pin-active {
        color: #f59e0b;
        &:hover {
            color: #fcd34d;
            background: rgba(245, 158, 11, 0.12);
        }
        &:active { background: rgba(245, 158, 11, 0.06); }
    }
}

// Thin vertical separator between the pin button and the min/max/close group
.tb-controls-sep {
    width: 1px;
    margin: 8px 2px;
    background: rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
}
</style>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { PhDotsThreeOutlineVertical, PhX, PhPlus, PhTrash, PhArrowsHorizontal } from '@phosphor-icons/vue'
import type { HiddenRange } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'

const store = useTimelineStore()

const emit = defineEmits<{ shiftComplete: [delta: number] }>()

const open        = ref(false)
const rootEl      = ref<HTMLElement | null>(null)

// --- hidden ranges ---
const hiddenRanges  = ref<HiddenRange[]>([...store.hiddenRanges])
const newStart      = ref<number | null>(null)
const newEnd        = ref<number | null>(null)
const newLabel      = ref('')
const rangeError    = ref('')

function toggle()   { open.value = !open.value }
function close()    { open.value = false }
function openMenu() { open.value = true }

defineExpose({ openMenu })

function onDocClick(e: MouseEvent) {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}

function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
}

onMounted(() => {
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onEsc)
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick)
    window.removeEventListener('keydown', onEsc)
})

async function addRange() {
    rangeError.value = ''
    const s = newStart.value
    const e = newEnd.value
    if (s === null || e === null || isNaN(s) || isNaN(e)) { rangeError.value = 'Enter both years.'; return }
    if (e <= s) { rangeError.value = 'End must be greater than start.'; return }
    const result = await BackendAPI.SaveHiddenRange(store.currentProject!.Id, s, e, newLabel.value.trim() || null)
    if (result?.status === 'ok' && result.range) {
        hiddenRanges.value = [...hiddenRanges.value, result.range].sort((a, b) => a.StartYear - b.StartYear)
        store.setHiddenRanges(hiddenRanges.value)
        newStart.value = null
        newEnd.value   = null
        newLabel.value = ''
    } else {
        rangeError.value = 'Failed to save range.'
    }
}

async function deleteRange(id: number) {
    const result = await BackendAPI.DeleteHiddenRange(id)
    if (result?.status === 'ok') {
        hiddenRanges.value = hiddenRanges.value.filter(r => r.Id !== id)
        store.setHiddenRanges(hiddenRanges.value)
    }
}

// --- shift date ---
const shiftDelta    = ref<number | null>(null)
const shiftBusy     = ref(false)
const shiftError    = ref('')
const shiftSuccess  = ref('')

async function shiftItems() {
    shiftError.value   = ''
    shiftSuccess.value = ''
    const delta = shiftDelta.value
    if (delta === null || isNaN(delta) || delta === 0) { shiftError.value = 'Enter a non-zero year offset.'; return }
    shiftBusy.value = true
    const result = await BackendAPI.ShiftTimelineItems(store.currentProject!.Id, delta)
    shiftBusy.value = false
    if (result?.status === 'ok') {
        shiftSuccess.value = `Shifted ${result.affected ?? store.items.length} items by ${delta > 0 ? '+' : ''}${delta} years.`
        shiftDelta.value = null
        emit('shiftComplete', delta)
    } else {
        shiftError.value = 'Shift failed.'
    }
}
</script>

<template>
    <div class="actions-root" ref="rootEl">
        <button
            class="actions-trigger"
            :class="{ active: open }"
            title="Actions"
            @click="toggle"
        >
            <PhDotsThreeOutlineVertical :size="20" />
        </button>

        <div v-if="open" class="actions-popover">
            <div class="popover-header">
                <span class="popover-title">Actions</span>
                <button class="close-btn" @click="close"><PhX :size="15" /></button>
            </div>

            <!-- ── Hidden Ranges ── -->
            <div class="action-section">
                <div class="action-section-title">Hidden Time Ranges</div>

                <div v-if="hiddenRanges.length === 0" class="ranges-empty">
                    All years visible — no hidden ranges.
                </div>
                <div v-for="r in hiddenRanges" :key="r.Id" class="range-row">
                    <span class="range-years">{{ r.StartYear }} – {{ r.EndYear }}</span>
                    <span class="range-label">{{ r.Label || '' }}</span>
                    <button class="icon-btn icon-btn--danger" title="Remove" @click="deleteRange(r.Id)">
                        <PhTrash :size="13" />
                    </button>
                </div>

                <div class="range-add-form">
                    <input
                        class="range-input"
                        type="number"
                        v-model.number="newStart"
                        placeholder="Start year"
                    />
                    <span class="range-sep">–</span>
                    <input
                        class="range-input"
                        type="number"
                        v-model.number="newEnd"
                        placeholder="End year"
                    />
                    <input
                        class="range-input range-input--label"
                        type="text"
                        v-model="newLabel"
                        placeholder="Label (optional)"
                        @keydown.enter="addRange"
                    />
                    <button class="icon-btn icon-btn--ok" @click="addRange">
                        <PhPlus :size="13" /> Add
                    </button>
                </div>
                <p v-if="rangeError" class="range-error">{{ rangeError }}</p>
            </div>

            <!-- ── Shift Date ── -->
            <div class="action-section">
                <div class="action-section-title">
                    <PhArrowsHorizontal :size="12" style="vertical-align:middle;margin-right:4px" />
                    Shift All Items
                </div>
                <p class="action-desc">Move every item in this timeline by N years. Use a negative number to shift backwards.</p>
                <div class="shift-form">
                    <input
                        class="range-input shift-input"
                        type="number"
                        v-model.number="shiftDelta"
                        placeholder="Years (e.g. −500)"
                        @keydown.enter="shiftItems"
                    />
                    <button
                        class="icon-btn icon-btn--ok"
                        :disabled="shiftBusy || !shiftDelta"
                        @click="shiftItems"
                    >
                        {{ shiftBusy ? '…' : 'Shift' }}
                    </button>
                </div>
                <p v-if="shiftError"   class="range-error">{{ shiftError }}</p>
                <p v-if="shiftSuccess" class="shift-ok">{{ shiftSuccess }}</p>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.actions-root {
    position: relative;
    display: flex;
    align-items: center;
}

.actions-trigger {
	margin-top: 10px !important;
	position: relative;
    width: 48px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: #3d5166;
    cursor: pointer;
    padding: 0;
    transition: color 0.14s, background 0.14s;

    &:hover {
        color: #8ca5bc;
        background: radial-gradient(
            ellipse 80% 70% at 50% 45%,
            rgba(255, 255, 255, 0.07) 0%,
            transparent 100%
        );
    }

    &.active {
        color: #c4b5fd;
        border-left-color: #8b5cf6;
        background: linear-gradient(90deg, rgba(139, 92, 246, 0.16) 0%, rgba(139, 92, 246, 0.04) 100%);
    }
}

.actions-popover {
    position: absolute;
    top: 0;
    left: calc(100% + 4px);
    width: 340px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
    z-index: 600;
    overflow: hidden;
}

.popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #162032;
    border-bottom: 1px solid #334155;
}

.popover-title {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    user-select: none;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.close-btn {
    display: flex;
    align-items: center;
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    &:hover { color: #e2e8f0; background: #334155; }
}

// ── Action section ──
.action-section {
    padding: 12px 14px;

    & + .action-section {
        border-top: 1px solid #2d3a56;
    }
}

.action-section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin-bottom: 8px;
    user-select: none;
}

// ── Range list ──
.ranges-empty {
    font-size: 12px;
    color: #64748b;
    font-style: italic;
    margin-bottom: 8px;
}

.range-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid #2d3a56;
    font-size: 12px;
    color: #e2e8f0;

    &:last-of-type { border-bottom: none; }
}

.range-years {
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
}

.range-label {
    flex: 1;
    color: #94a3b8;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// ── Add form ──
.range-add-form {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    flex-wrap: wrap;
}

.range-input {
    padding: 4px 6px;
    border: 1px solid #334155;
    border-radius: 4px;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 12px;
    width: 80px;
    color-scheme: dark;
    &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
    &::placeholder { color: #4a5568; }

    &--label { flex: 1; width: auto; min-width: 80px; }
}

.range-sep {
    color: #64748b;
    font-size: 12px;
    flex-shrink: 0;
}

.range-error {
    margin: 4px 0 0;
    font-size: 11px;
    color: #f87171;
}

// ── Shift form ──
.action-desc {
    font-size: 11px;
    color: #64748b;
    margin: 0 0 8px;
    line-height: 1.4;
}

.shift-form {
    display: flex;
    gap: 6px;
    align-items: center;
}

.shift-input {
    flex: 1;
    width: auto;
}

.shift-ok {
    margin: 6px 0 0;
    font-size: 11px;
    color: #86efac;
}

// ── Icon buttons ──
.icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;

    &--ok {
        background: #1e3a5f;
        color: #93c5fd;
        border-color: #3b82f6;
        &:hover { background: #2a4a7f; }
    }

    &--danger {
        background: transparent;
        color: #64748b;
        border-color: transparent;
        margin-left: auto;
        &:hover { color: #f87171; }
    }
}
</style>

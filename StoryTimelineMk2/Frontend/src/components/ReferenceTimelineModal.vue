<script setup lang="ts">
// BL-66: pick another timeline — draw it underneath this one, or open it read-only in its own window.
import { ref, computed, onMounted } from 'vue'
import { PhAppWindow, PhStack, PhWarning } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import type { TimelineProject } from '@/types/models'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ currentId: number | undefined }>()
const emit = defineEmits<{ close: [] }>()

const store = useTimelineStore()
const timelines = ref<TimelineProject[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
    const res = await BackendAPI.GetAllTimelines()
    timelines.value = (res?.data ?? []).filter(t => t.Id !== props.currentId)
    loading.value = false
})

function openWindow(id: number) {
    BackendAPI.send('OpenTimeline', { id, readOnly: true })
    emit('close')
}

async function showUnderneath(id: number) {
    busy.value = true
    error.value = null
    try {
        await store.loadReference(id)
        emit('close')
    } catch (err) {
        console.error('[ReferenceTimelineModal] loadReference failed', err)
        error.value = `Could not load that timeline: ${(err as Error).message}`
    } finally {
        busy.value = false
    }
}

// Different calendars: warn, never block — years still line up one-to-one, only the labels differ.
const calendarMismatch = computed(() =>
    !!store.reference && store.reference.project.CalendarId !== store.currentProject?.CalendarId)
</script>

<template>
    <BaseModal title="Reference timeline" width="min(460px, 92vw)" max-height="80vh" @close="emit('close')">
        <div class="rt-body">
            <div v-if="store.reference" class="rt-active">
                <div class="rt-active-head">
                    <PhStack :size="18" weight="fill" />
                    <span class="rt-active-title">Underneath: {{ store.reference.project.Title || 'Untitled' }}</span>
                    <button class="rt-remove" @click="store.clearReference()">Remove</button>
                </div>
                <p v-if="calendarMismatch" class="rt-warn">
                    <PhWarning :size="16" weight="fill" />
                    <span>Different calendar ({{ store.reference.project.Calendar?.Name || 'unnamed' }}) — years line up one-to-one, but month and day labels may not match.</span>
                </p>
                <label class="rt-shift">
                    Shift by <input v-model.lazy.number="store.reference.shift" type="number" step="1" /> years
                    <span class="rt-dim">(saved with this timeline)</span>
                </label>
                <p class="rt-tip">Alt+click a ghosted item to view it. Reference items ignore your filters and stay off the minimap.</p>
            </div>
            <p class="rt-tip">Draw one of your other timelines underneath this one, or open it read-only in its own window. <kbd>R</kbd> opens this list.</p>
            <p v-if="error || store.referenceError" class="rt-error">{{ error || store.referenceError }}</p>
            <div v-if="loading" class="rt-empty">Loading…</div>
            <div v-else-if="!timelines.length" class="rt-empty">No other timelines yet.</div>
            <div v-for="t in timelines" :key="t.Id" class="rt-row">
                <span class="rt-swatch" :style="{ background: t.Color || 'var(--app-border, #2d3a56)' }" />
                <span class="rt-text">
                    <span class="rt-title">{{ t.Title || 'Untitled' }}</span>
                    <span v-if="t.Author" class="rt-author">{{ t.Author }}</span>
                </span>
                <button class="rt-btn rt-under" title="Show underneath this timeline" :disabled="busy" @click="showUnderneath(t.Id)">
                    <PhStack :size="18" />
                </button>
                <button class="rt-btn rt-open" title="Open read-only in a new window" @click="openWindow(t.Id)">
                    <PhAppWindow :size="18" />
                </button>
            </div>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.rt-body {
    padding: 12px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
}

.rt-tip, .rt-empty {
    margin: 0 0 8px;
    font-size: 0.85em;
    color: var(--app-text-dim, #4a6080);
}

.rt-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px 6px 12px;
    border: 1px solid transparent;
    border-radius: var(--app-radius-sm, 6px);
    color: var(--app-text, #e2e8f0);

    &:hover {
        background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
        border-color: var(--app-border, #2d3a56);
    }
    &:hover .rt-btn { opacity: 1; }
}

.rt-swatch { width: 10px; height: 26px; border-radius: 3px; flex: none; }
.rt-text   { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rt-title  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-author { font-size: 0.8em; color: var(--app-text-muted, #94a3b8); }

.rt-btn {
    display: flex;
    align-items: center;
    padding: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--app-radius-sm, 6px);
    color: inherit;
    cursor: pointer;
    opacity: 0.5;
    flex: none;

    &:hover:not(:disabled), &:focus-visible {
        opacity: 1;
        border-color: var(--app-border, #2d3a56);
        color: var(--app-accent-hover, #818cf8);
        outline: none;
    }
    &:disabled { cursor: default; opacity: 0.3; }
}

.rt-active {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--app-accent, #6366f1) 45%, transparent);
    background: color-mix(in srgb, var(--app-accent, #6366f1) 8%, transparent);
    border-radius: var(--app-radius-sm, 6px);

    .rt-tip { margin: 0; }
}
.rt-active-head  { display: flex; align-items: center; gap: 8px; }
.rt-active-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.rt-remove {
    padding: 3px 10px;
    font: inherit;
    font-size: 0.85em;
    background: transparent;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 6px);
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    &:hover { color: var(--app-danger, #f87171); border-color: currentColor; }
}
.rt-warn {
    display: flex;
    gap: 6px;
    margin: 0;
    font-size: 0.85em;
    color: var(--app-warning, #fbbf24);
    svg { flex: none; margin-top: 2px; }
}
.rt-shift {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
    input {
        width: 72px;
        padding: 3px 6px;
        font: inherit;
        background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
        border: 1px solid var(--app-border, #2d3a56);
        border-radius: 4px;
        color: inherit;
    }
}
.rt-dim   { font-size: 0.85em; color: var(--app-text-dim, #4a6080); }
.rt-error { margin: 0 0 8px; font-size: 0.85em; color: var(--app-danger, #f87171); }

kbd {
    display: inline-block;
    min-width: 18px;
    padding: 1px 5px;
    font-size: 0.9em;
    font-family: monospace;
    text-align: center;
    background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 70%, transparent);
    border-radius: 3px;
    color: var(--app-text-muted, #94a3b8);
}
</style>

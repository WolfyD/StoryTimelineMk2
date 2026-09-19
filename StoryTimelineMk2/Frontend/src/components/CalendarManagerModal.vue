<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { PhX, PhPencilSimple, PhEye, PhPlus, PhArrowsClockwise, PhTrash } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import CalendarViewModal from './CalendarViewModal.vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

const emit = defineEmits<{ close: [] }>()

const DEFAULT_CALENDAR_ID = 'cal_default_gregorian'

type CalendarRow = { Id: string; Name: string; UsageCount: number }
const calendars = ref<CalendarRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const viewingId = ref<string | null>(null)
const deleteTarget = ref<CalendarRow | null>(null)

async function load() {
    loading.value = true
    error.value = null
    try {
        const list = await BackendAPI.GetCalendarList()
        calendars.value = list ?? []
    } catch {
        error.value = 'Failed to load calendars.'
    } finally {
        loading.value = false
    }
}

function openEditor(calendarId: string | null) {
    BackendAPI.send('OpenCalendarEditorWindow', { calendarId })
}

function usageText(n: number) {
    return n === 1 ? 'Used in 1 timeline' : `Used in ${n} timelines`
}

function deleteSub(c: CalendarRow) {
    return c.UsageCount > 0
        ? `${usageText(c.UsageCount)} — those timelines will switch to the default Gregorian calendar.`
        : 'This cannot be undone.'
}

async function confirmDelete() {
    const target = deleteTarget.value
    if (!target) return
    deleteTarget.value = null
    error.value = null
    try {
        const result = await BackendAPI.DeleteCalendar(target.Id)
        if (result?.status !== 'ok') throw new Error(result?.message ?? 'Delete failed')
        // Reassigned timelines carry a stale CalendarId in the project list until reloaded.
        if (result.reassigned) useTimelineStore().loadTimelines()
        await load()
    } catch (e) {
        console.error('[CalendarManagerModal] delete failed:', e)
        error.value = `Failed to delete calendar: ${e instanceof Error ? e.message : String(e)}`
    }
}

onMounted(() => { load(); window.addEventListener('calendars-changed', load) })
onUnmounted(() => window.removeEventListener('calendars-changed', load))
</script>

<template>
    <Teleport to="body">
        <BaseModal width="80vw" max-height="75vh" @close="emit('close')">
            <template #header>
                <span class="modal-title">Calendars</span>
                <div class="modal-header-actions">
                    <button class="icon-btn" title="Refresh" :disabled="loading" @click="load">
                        <PhArrowsClockwise :size="15" />
                    </button>
                    <button class="icon-btn" title="Close" @click="emit('close')">
                        <PhX :size="16" />
                    </button>
                </div>
            </template>

            <div class="modal-body">
                <div v-if="loading" class="state-msg">Loading…</div>
                <div v-else-if="error" class="state-msg error">{{ error }}</div>
                <div v-else-if="calendars.length === 0" class="state-msg empty">
                    No calendars yet. Create one to get started.
                </div>
                <ul v-else class="cal-list">
                    <li v-for="c in calendars" :key="c.Id" class="cal-row" :class="{ 'in-use': c.UsageCount > 0 }">
                        <span class="cal-name">{{ c.Name }}</span>
                        <span v-if="c.UsageCount > 0" class="usage-badge" :title="usageText(c.UsageCount)">{{ c.UsageCount }}</span>
                        <div class="row-actions">
                            <button class="action-btn" title="View calendar" @click="viewingId = c.Id">
                                <PhEye :size="14" />
                                View
                            </button>
                            <button class="action-btn edit" title="Edit calendar" @click="openEditor(c.Id)">
                                <PhPencilSimple :size="14" />
                                Edit
                            </button>
                            <button
                                v-if="c.Id !== DEFAULT_CALENDAR_ID"
                                class="action-btn delete" title="Delete calendar" @click="deleteTarget = c">
                                <PhTrash :size="14" />
                                Delete
                            </button>
                        </div>
                    </li>
                </ul>
            </div>

            <div class="modal-footer">
                <button class="new-btn" @click="openEditor(null)">
                    <PhPlus :size="14" />
                    New Calendar
                </button>
            </div>
        </BaseModal>

        <ConfirmDeleteModal
            v-if="deleteTarget"
            heading="Delete Calendar"
            :title="deleteTarget.Name"
            :sub="deleteSub(deleteTarget)"
            @close="deleteTarget = null"
            @confirm="confirmDelete"
        />

        <!-- View modal rendered on top -->
        <CalendarViewModal
            v-if="viewingId"
            :calendar-id="viewingId"
            @close="viewingId = null"
            @edit="(id) => { viewingId = null; openEditor(id) }"
        />
    </Teleport>
</template>

<style scoped lang="scss">
// ── Header slot content ───────────────────────────────────────────────────────

.modal-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    letter-spacing: 0.04em;
}

.modal-header-actions {
    display: flex;
    gap: 4px;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;

    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.4; cursor: default; }
}

// ── Body ──────────────────────────────────────────────────────────────────────

.modal-body {
    flex: 1;
    overflow-y: auto;
    min-height: 60px;
}

.state-msg {
    padding: 20px 16px;
    font-size: 0.82rem;
    color: var(--app-text-dim, #64748b);
    text-align: center;

    &.error { color: #e87a7a; }
    &.empty { color: var(--app-text-dim, #4a6080); }
}

.cal-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
}

.cal-row {
    display: flex;
    align-items: center;
    padding: 8px 14px;
    gap: 10px;
    border-bottom: 1px solid var(--app-surface-high, #1e2b44);
    transition: background 0.1s;

    &:last-child { border-bottom: none; }
    &:hover { background: color-mix(in srgb, var(--app-surface-raised, #141e33) 70%, var(--app-accent, #6366f1)); }
    &.in-use { box-shadow: inset 3px 0 0 var(--app-accent, #6366f1); }
}

.usage-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--app-accent, #6366f1) 22%, transparent);
    color: var(--app-accent-hover, #818cf8);
    font-size: 0.68rem;
    font-weight: 600;
    cursor: default;
}

.cal-name {
    flex: 0 1 auto;
    font-size: 0.88rem;
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.row-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    &:hover {
        background: var(--app-surface-high, #1e2b44);
        border-color: var(--app-accent, #6366f1);
        color: var(--app-text, #e2e8f0);
    }

    &.edit:hover {
        border-color: #5ba55b;
        color: #8ecf8e;
    }

    &.delete:hover {
        border-color: #a55b5b;
        color: #e87a7a;
    }
}

// ── Footer ────────────────────────────────────────────────────────────────────

.modal-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    flex-shrink: 0;
}

.new-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    border: 1px dashed var(--app-accent, #6366f1);
    border-radius: var(--app-radius-sm, 5px);
    background: transparent;
    color: var(--app-accent-hover, #818cf8);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    justify-content: center;
    transition: background 0.12s, color 0.12s;

    &:hover {
        background: color-mix(in srgb, var(--app-bg, #0f172a) 60%, var(--app-accent, #6366f1));
        color: var(--app-text, #e2e8f0);
    }
}
</style>

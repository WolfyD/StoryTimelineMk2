<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhX, PhPencilSimple, PhEye, PhPlus, PhArrowsClockwise } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import { BackendAPI } from '@/bridge/api'
import CalendarViewModal from './CalendarViewModal.vue'

const emit = defineEmits<{ close: [] }>()

const calendars = ref<{ Id: string; Name: string }[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const viewingId = ref<string | null>(null)

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

onMounted(load)
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
                    <li v-for="c in calendars" :key="c.Id" class="cal-row">
                        <span class="cal-name">{{ c.Name }}</span>
                        <div class="row-actions">
                            <button class="action-btn" title="View calendar" @click="viewingId = c.Id">
                                <PhEye :size="14" />
                                View
                            </button>
                            <button class="action-btn edit" title="Edit calendar" @click="openEditor(c.Id)">
                                <PhPencilSimple :size="14" />
                                Edit
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
}

.cal-name {
    flex: 1;
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

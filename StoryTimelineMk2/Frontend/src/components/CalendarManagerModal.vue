<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhX, PhPencilSimple, PhEye, PhPlus, PhArrowsClockwise } from '@phosphor-icons/vue'
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
        <div class="modal-backdrop" @click.self="emit('close')">
            <div class="modal-panel">

                <div class="modal-header">
                    <span class="modal-title">Calendars</span>
                    <div class="modal-header-actions">
                        <button class="icon-btn" title="Refresh" :disabled="loading" @click="load">
                            <PhArrowsClockwise :size="15" />
                        </button>
                        <button class="icon-btn" title="Close" @click="emit('close')">
                            <PhX :size="16" />
                        </button>
                    </div>
                </div>

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

            </div>
        </div>

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
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-panel {
    width: 80vw;
    max-height: 75vh;
    background: #141e33;
    border: 1px solid #2d3a56;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

// ── Header ────────────────────────────────────────────────────────────────────

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #2d3a56;
    background: #0f1926;
    flex-shrink: 0;
}

.modal-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: #7aa8e8;
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
    color: #7a8faa;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;

    &:hover:not(:disabled) { background: #1e2b44; color: #e2e8f0; }
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
    color: #64748b;
    text-align: center;

    &.error { color: #e87a7a; }
    &.empty { color: #4a6080; }
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
    border-bottom: 1px solid #1e2b44;
    transition: background 0.1s;

    &:last-child { border-bottom: none; }
    &:hover { background: #1a2540; }
}

.cal-name {
    flex: 1;
    font-size: 0.88rem;
    color: #c8d8f0;
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
    border: 1px solid #2d3a56;
    border-radius: 4px;
    background: #0d1521;
    color: #94a3b8;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    &:hover {
        background: #1e2b44;
        border-color: #3b6ec4;
        color: #e2e8f0;
    }

    &.edit:hover {
        border-color: #5ba55b;
        color: #8ecf8e;
    }
}

// ── Footer ────────────────────────────────────────────────────────────────────

.modal-footer {
    padding: 8px 12px;
    border-top: 1px solid #2d3a56;
    background: #0f1926;
    flex-shrink: 0;
}

.new-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    border: 1px dashed #3b6ec4;
    border-radius: 5px;
    background: transparent;
    color: #7aa8e8;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    justify-content: center;
    transition: background 0.12s, color 0.12s;

    &:hover {
        background: #1a2e50;
        color: #a8c8f8;
    }
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhX, PhFolderOpen, PhArrowSquareOut, PhCopy, PhFloppyDisk, PhPaintBrush } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import AppThemeModal from './AppThemeModal.vue'
import { useTimelineStore } from '@/stores/timelineStore'

const emit = defineEmits<{ close: []; refresh: [] }>()
const store = useTimelineStore()

const showThemeModal = ref(false)
const currentRoot = ref('')
const pendingPath = ref('')
const includeMedia = ref(true)
const isBusy = ref(false)
const feedback = ref<{ type: 'success' | 'error'; msg: string } | null>(null)
const performantPanning = ref(true)

onMounted(async () => {
    const cfg = await BackendAPI.GetAppConfig()
    if (cfg) {
        currentRoot.value = cfg.DataRoot
        performantPanning.value = cfg.performantPanning ?? true
    }
})

async function togglePerformantPanning(value: boolean) {
    performantPanning.value = value
    store.setPerformantPanning(value)
    await BackendAPI.SavePerformantPanning(value)
}

function showFeedback(type: 'success' | 'error', msg: string) {
    feedback.value = { type, msg }
    if (type === 'success') setTimeout(() => { feedback.value = null }, 4000)
}

async function browse() {
    const result = await BackendAPI.BrowseDataFolder()
    if (result?.path) pendingPath.value = result.path
}

async function copyAndSwitch() {
    if (!pendingPath.value) return
    isBusy.value = true
    feedback.value = null
    const result = await BackendAPI.MoveDataFolder(pendingPath.value)
    isBusy.value = false
    if (result?.status === 'ok') {
        currentRoot.value = pendingPath.value
        pendingPath.value = ''
        showFeedback('success', 'Data copied and folder switched successfully.')
        emit('refresh')
    } else {
        showFeedback('error', result?.message ?? 'Failed to copy data.')
    }
}

async function justSwitch() {
    if (!pendingPath.value) return
    isBusy.value = true
    feedback.value = null
    const result = await BackendAPI.SetDataRoot(pendingPath.value)
    isBusy.value = false
    if (result?.status === 'ok') {
        currentRoot.value = pendingPath.value
        pendingPath.value = ''
        showFeedback('success', 'Data folder updated. Timelines reloaded from new location.')
        emit('refresh')
    } else {
        showFeedback('error', result?.message ?? 'Failed to update folder.')
    }
}

async function openInExplorer() {
    BackendAPI.OpenDataFolder()
}

async function createBackup() {
    isBusy.value = true
    feedback.value = null
    const result = await BackendAPI.CreateBackup(includeMedia.value)
    isBusy.value = false
    if (result?.status === 'ok') {
        showFeedback('success', `Backup created: ${result.path}`)
    } else if (result?.status !== 'cancelled') {
        showFeedback('error', result?.message ?? 'Backup failed.')
    }
}
</script>

<template>
    <div class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-panel">

            <div class="modal-header">
                <span class="modal-title">App Settings</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="18" /></button>
            </div>

            <div class="modal-body">

                <!-- ── App Theme ── -->
                <section class="settings-section">
                    <h4 class="section-label">Appearance</h4>
                    <p class="hint">Customise colors, borders, and sizes for the application chrome.</p>
                    <button class="btn btn-secondary" @click="showThemeModal = true">
                        <PhPaintBrush :size="14" />
                        Open theme settings…
                    </button>
                </section>

                <!-- ── Performance ── -->
                <section class="settings-section">
                    <h4 class="section-label">Performance</h4>
                    <label class="toggle-label">
                        <input type="checkbox" :checked="performantPanning" @change="togglePerformantPanning(($event.target as HTMLInputElement).checked)" />
                        Performant panning
                    </label>
                    <p class="hint">
                        When enabled, only items are redrawn on each drag frame — grid tick marks
                        rebuild only every 300 px of pan. Disable for a full redraw on every frame
                        (slower, but may help if you notice visual glitches during panning).
                    </p>
                </section>

                <!-- ── Data Folder ── -->
                <section class="settings-section">
                    <h4 class="section-label">Data Folder</h4>

                    <div class="current-path-row">
                        <div class="path-box" :title="currentRoot">
                            <PhFolderOpen :size="14" class="path-icon" />
                            <span class="path-text">{{ currentRoot || '…' }}</span>
                        </div>
                        <button class="btn btn-ghost" @click="openInExplorer" title="Open in Explorer">
                            <PhArrowSquareOut :size="15" />
                            Open
                        </button>
                    </div>

                    <p class="hint">To move or change the data folder, browse for a destination below.</p>

                    <div class="browse-row">
                        <input
                            class="path-input"
                            type="text"
                            :value="pendingPath"
                            placeholder="New folder path…"
                            readonly
                        />
                        <button class="btn btn-secondary" :disabled="isBusy" @click="browse">Browse…</button>
                    </div>

                    <div class="change-actions" v-if="pendingPath && pendingPath !== currentRoot">
                        <button class="btn btn-primary" :disabled="isBusy" @click="copyAndSwitch">
                            <PhCopy :size="14" />
                            Copy data here &amp; switch
                        </button>
                        <button class="btn btn-secondary" :disabled="isBusy" @click="justSwitch">
                            Use this folder (no copy)
                        </button>
                    </div>

                    <p class="hint warn" v-if="pendingPath && pendingPath !== currentRoot">
                        "Use this folder" will load whatever data already exists there.
                        Old files are never deleted automatically.
                    </p>
                </section>

                <!-- ── Backup ── -->
                <section class="settings-section">
                    <h4 class="section-label">Manual Backup</h4>

                    <label class="toggle-label">
                        <input type="checkbox" v-model="includeMedia" />
                        Include images &amp; media files
                    </label>

                    <button class="btn btn-secondary mt-10" :disabled="isBusy" @click="createBackup">
                        <PhFloppyDisk :size="15" />
                        Create Backup…
                    </button>

                    <p class="hint">
                        A timestamped folder is created at a destination you choose.
                        The backup folder opens in Explorer when done.
                    </p>
                </section>

                <!-- ── Feedback ── -->
                <div v-if="isBusy" class="feedback feedback--busy">Working…</div>
                <div v-else-if="feedback" class="feedback" :class="`feedback--${feedback.type}`">
                    {{ feedback.msg }}
                </div>

            </div>

            <div class="modal-footer">
                <button class="btn btn-cancel" @click="emit('close')">Close</button>
            </div>

        </div>
    </div>

    <Teleport to="body">
        <AppThemeModal v-if="showThemeModal" @close="showThemeModal = false" />
    </Teleport>
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed; inset: 0; background: #00000088; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
}

.modal-panel {
    display: flex; flex-direction: column;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    width: min(520px, 92vw); box-shadow: 0 24px 48px #00000066;
}

.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: var(--app-surface-high, #1e2b44);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px) var(--app-radius, 8px) 0 0;
}

.modal-title { font-size: 15px; font-weight: 600; color: var(--app-text, #e2e8f0); }

.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--app-text-muted, #64748b); cursor: pointer;
    padding: 4px; border-radius: 4px; transition: color 0.15s, background 0.15s;
    &:hover { color: var(--app-text, #e2e8f0); background: rgba(255,255,255,0.07); }
}

.modal-body {
    padding: 16px 24px 20px;
    display: flex; flex-direction: column; gap: 16px;
}

.modal-footer {
    display: flex; justify-content: flex-end;
    padding: 12px 20px; background: var(--app-surface-high, #1e2b44);
    border-top: 1px solid var(--app-border, #2d3a56);
    border-radius: 0 0 var(--app-radius, 8px) var(--app-radius, 8px);
}

// ── Sections ──
.settings-section {
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 16px;
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 6px);
}

.section-label {
    margin: 0 0 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--app-text-dim, #4a6080);
}

// ── Current path ──
.current-path-row {
    display: flex; align-items: center; gap: 8px;
}

.path-box {
    flex: 1; display: flex; align-items: center; gap: 6px;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    padding: 6px 10px; overflow: hidden; min-width: 0;
}

.path-icon { color: #79876b; flex-shrink: 0; }

.path-text {
    font-size: 12px; color: var(--app-text-muted, #94a3b8); font-family: monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

// ── Browse row ──
.browse-row {
    display: flex; gap: 8px; align-items: center;
}

.path-input {
    flex: 1;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    color: var(--app-text-muted, #94a3b8); font-size: 12px; font-family: monospace;
    padding: 6px 10px; outline: none; cursor: default;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

// ── Change actions ──
.change-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding-top: 4px;
}

// ── Hints ──
.hint {
    margin: 0; font-size: 11px; color: var(--app-text-dim, #4a6080); line-height: 1.5;
    &.warn { color: #c9953a; }
}

// ── Toggle ──
.toggle-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; color: var(--app-text-muted, #94a3b8); cursor: pointer; user-select: none;
    input { cursor: pointer; }
}

// ── Feedback ──
.feedback {
    padding: 8px 12px; border-radius: var(--app-radius-sm, 5px); font-size: 12px; line-height: 1.5;
    &--busy    { background: var(--app-surface-high, #1e2b44); color: var(--app-text-muted, #94a3b8); }
    &--success { background: #1a3326; color: #6fcf97; border: 1px solid #2d6b4a; }
    &--error   { background: #3a1a1a; color: #f87171; border: 1px solid #6b2d2d; }
}

.mt-10 { margin-top: 2px; }

// ── Buttons ──
.btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border: none; border-radius: var(--app-radius-sm, 4px);
    cursor: pointer; font-size: 12px; font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.btn-primary {
    background: var(--app-accent, #3b6ec4); color: var(--app-text, #e2e8f0);
    &:hover:not(:disabled) { background: var(--app-accent-hover, #4d80d6); }
}

.btn-secondary {
    background: var(--app-surface-high, #1e2b44); color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: var(--app-surface-raised, #253453); color: var(--app-text, #e2e8f0); }
}

.btn-ghost {
    background: transparent; color: var(--app-text-dim, #64748b);
    border: 1px solid var(--app-border, #2d3a56);
    padding: 5px 10px; white-space: nowrap;
    &:hover { color: var(--app-text, #e2e8f0); background: rgba(255,255,255,0.04); }
}

.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: rgba(255,255,255,0.05); color: var(--app-text, #e2e8f0); }
}
</style>

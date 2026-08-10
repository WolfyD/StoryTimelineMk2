<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhX, PhFolderOpen, PhArrowSquareOut, PhCopy, PhFloppyDisk } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'

const emit = defineEmits<{ close: []; refresh: [] }>()

const currentRoot = ref('')
const pendingPath = ref('')
const includeMedia = ref(true)
const isBusy = ref(false)
const feedback = ref<{ type: 'success' | 'error'; msg: string } | null>(null)

onMounted(async () => {
    const cfg = await BackendAPI.GetAppConfig()
    if (cfg) currentRoot.value = cfg.DataRoot
})

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
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed; inset: 0; background: #00000088; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
}

.modal-panel {
    display: flex; flex-direction: column;
    background: #141e33; border: 1px solid #2d3a56; border-radius: 8px;
    width: min(520px, 92vw); box-shadow: 0 24px 48px #00000066;
}

.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: #1e2b44;
    border-bottom: 1px solid #2d3a56; border-radius: 8px 8px 0 0;
}

.modal-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }

.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: #64748b; cursor: pointer;
    padding: 4px; border-radius: 4px; transition: color 0.15s, background 0.15s;
    &:hover { color: #e2e8f0; background: #ffffff12; }
}

.modal-body {
    padding: 16px 24px 20px;
    display: flex; flex-direction: column; gap: 16px;
}

.modal-footer {
    display: flex; justify-content: flex-end;
    padding: 12px 20px; background: #1e2b44;
    border-top: 1px solid #2d3a56; border-radius: 0 0 8px 8px;
}

// ── Sections ──
.settings-section {
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 16px;
    background: #0c1524; border: 1px solid #2d3a56; border-radius: 6px;
}

.section-label {
    margin: 0 0 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #4a6080;
}

// ── Current path ──
.current-path-row {
    display: flex; align-items: center; gap: 8px;
}

.path-box {
    flex: 1; display: flex; align-items: center; gap: 6px;
    background: #141e33; border: 1px solid #2d3a56; border-radius: 4px;
    padding: 6px 10px; overflow: hidden;
    min-width: 0;
}

.path-icon { color: #79876b; flex-shrink: 0; }

.path-text {
    font-size: 12px; color: #94a3b8; font-family: monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

// ── Browse row ──
.browse-row {
    display: flex; gap: 8px; align-items: center;
}

.path-input {
    flex: 1;
    background: #141e33; border: 1px solid #2d3a56; border-radius: 4px;
    color: #94a3b8; font-size: 12px; font-family: monospace;
    padding: 6px 10px; outline: none; cursor: default;
    &:focus { border-color: #3b6ec4; }
}

// ── Change actions ──
.change-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding-top: 4px;
}

// ── Hints ──
.hint {
    margin: 0; font-size: 11px; color: #4a6080; line-height: 1.5;
    &.warn { color: #c9953a; }
}

// ── Toggle ──
.toggle-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; color: #94a3b8; cursor: pointer; user-select: none;
    input { cursor: pointer; }
}

// ── Feedback ──
.feedback {
    padding: 8px 12px; border-radius: 5px; font-size: 12px; line-height: 1.5;
    &--busy    { background: #1e2b44; color: #94a3b8; }
    &--success { background: #1a3326; color: #6fcf97; border: 1px solid #2d6b4a; }
    &--error   { background: #3a1a1a; color: #f87171; border: 1px solid #6b2d2d; }
}

.mt-10 { margin-top: 2px; }

// ── Buttons ──
.btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border: none; border-radius: 4px;
    cursor: pointer; font-size: 12px; font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.btn-primary {
    background: #3b6ec4; color: #e2e8f0;
    &:hover:not(:disabled) { background: #4d80d6; }
}

.btn-secondary {
    background: #1e2b44; color: #94a3b8; border: 1px solid #2d3a56;
    &:hover:not(:disabled) { background: #253453; color: #e2e8f0; }
}

.btn-ghost {
    background: transparent; color: #64748b; border: 1px solid #2d3a56;
    padding: 5px 10px; white-space: nowrap;
    &:hover { color: #e2e8f0; background: #ffffff08; }
}

.btn-cancel {
    background: transparent; color: #94a3b8; border: 1px solid #2d3a56;
    &:hover { background: #ffffff0e; color: #e2e8f0; }
}
</style>

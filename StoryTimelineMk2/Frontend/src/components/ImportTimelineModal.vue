<script setup lang="ts">
import { ref } from 'vue'
import { PhX, PhWarning, PhImages } from '@phosphor-icons/vue'
import type { TimelineImportPreview } from '@/types/models'

const props = defineProps<{ preview: TimelineImportPreview }>()
const emit  = defineEmits<{ close: []; confirm: [path: string] }>()

const isWorking = ref(false)

function confirm() {
    isWorking.value = true
    emit('confirm', props.preview.sourcePath)
}

function formatPath(p: string) {
    return p.length > 60 ? '…' + p.slice(-57) : p
}
</script>

<template>
    <div class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-panel">
            <div class="modal-header">
                <span class="modal-title">Import Timeline</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="18" /></button>
            </div>

            <div class="modal-body">
                <p class="source-path" :title="preview.sourcePath">{{ formatPath(preview.sourcePath) }}</p>

                <div class="stat-row">
                    <span class="stat-label">Timeline</span>
                    <span class="stat-value">{{ preview.timelineTitle }}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Items</span>
                    <span class="stat-value">{{ preview.itemCount }}</span>
                </div>
                <div v-if="preview.hasMedia" class="stat-row">
                    <span class="stat-label media-label"><PhImages :size="13" /> Media files</span>
                    <span class="stat-value">{{ preview.mediaCount }}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Import mode</span>
                    <span class="stat-value mode-badge" :class="preview.includeIds ? 'badge-replace' : 'badge-new'">
                        {{ preview.includeIds ? 'Restore (with IDs)' : 'New entry' }}
                    </span>
                </div>

                <div v-if="preview.hasConflict && preview.includeIds" class="conflict-block">
                    <div class="conflict-header">
                        <PhWarning :size="15" />
                        Existing timeline will be replaced
                    </div>
                    <p class="conflict-name">{{ preview.conflictingTimelineTitle }}</p>
                    <p class="conflict-note">All items, characters, and settings of the existing timeline will be deleted and replaced with the imported data.</p>
                </div>

                <p v-else-if="!preview.includeIds" class="no-conflict">
                    This archive was exported without IDs — it will always be imported as a brand-new timeline, even if one with the same name already exists.
                </p>
            </div>

            <div class="modal-footer">
                <button class="btn btn-cancel" :disabled="isWorking" @click="emit('close')">Cancel</button>
                <button
                    class="btn"
                    :class="preview.hasConflict && preview.includeIds ? 'btn-danger' : 'btn-primary'"
                    :disabled="isWorking"
                    @click="confirm"
                >
                    {{ isWorking ? 'Importing…' : (preview.hasConflict && preview.includeIds ? 'Replace & Import' : 'Import') }}
                </button>
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
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    width: min(480px, 92vw); box-shadow: 0 24px 48px #00000066;
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
    background: transparent; border: none; color: var(--app-text-muted, #64748b);
    cursor: pointer; padding: 4px; border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    &:hover { color: var(--app-text, #e2e8f0); background: rgba(255,255,255,0.07); }
}
.modal-body {
    padding: 20px 24px; display: flex; flex-direction: column; gap: 10px;
}
.source-path {
    margin: 0; font-size: 11px; font-family: monospace;
    color: var(--app-text-dim, #4a6080); word-break: break-all;
}
.stat-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; padding: 4px 0;
    border-bottom: 1px solid var(--app-border, #2d3a56);
}
.stat-label {
    color: var(--app-text-muted, #94a3b8);
    display: flex; align-items: center; gap: 5px;
}
.stat-value { color: var(--app-text, #e2e8f0); font-weight: 500; }

.mode-badge {
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
    &.badge-replace { background: #3d2010; color: #fb923c; border: 1px solid #7c3012; }
    &.badge-new { background: #0f2d1a; color: #4ade80; border: 1px solid #1a5c35; }
}

.conflict-block {
    background: #3a1a1a; border: 1px solid #6b2d2d; border-radius: 6px;
    padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
}
.conflict-header {
    display: flex; align-items: center; gap: 6px;
    color: #f87171; font-size: 13px; font-weight: 600;
}
.conflict-name { margin: 0; font-size: 13px; color: #fca5a5; font-style: italic; }
.conflict-note { margin: 0; font-size: 11px; color: #c87171; line-height: 1.5; }
.no-conflict { margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; }

.modal-footer {
    display: flex; justify-content: flex-end; gap: 10px;
    padding: 12px 20px; background: var(--app-surface-high, #1e2b44);
    border-top: 1px solid var(--app-border, #2d3a56);
    border-radius: 0 0 var(--app-radius, 8px) var(--app-radius, 8px);
}
.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: rgba(255,255,255,0.05); color: var(--app-text, #e2e8f0); }
}
.btn-primary {
    background: #446b40; color: #e8f5e5;
    &:hover:not(:disabled) { background: #52804c; }
}
.btn-danger {
    background: #7f1d1d; color: #fecaca;
    &:hover:not(:disabled) { background: #991b1b; }
}
</style>

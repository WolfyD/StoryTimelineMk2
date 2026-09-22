<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { mediaUrl } from '@/utils/mediaUrl';
import { PhX, PhUploadSimple, PhCheck } from '@phosphor-icons/vue'
import type { MediaItem } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { useModal } from '@/utils/modal'

const props = defineProps<{
    itemId: string
    alreadyLinked: string[]
}>()

const emit = defineEmits<{
    close: []
    linked: [pictures: MediaItem[]]
}>()

const { root, onMousedown, onClick } = useModal(() => emit('close'))

const allPictures   = ref<MediaItem[]>([])
const isLoading     = ref(true)
const selectedIds   = ref<string[]>([])
const isBusy        = ref(false)
const searchQuery   = ref('')

onMounted(async () => {
    const list = await BackendAPI.GetAllPictures()
    allPictures.value = list ?? []
    isLoading.value = false
})

const filtered = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return allPictures.value
    return allPictures.value.filter(p =>
        (p.Title ?? '').toLowerCase().includes(q) ||
        (p.FileName ?? '').toLowerCase().includes(q)
    )
})

function isLinked(id: string) {
    return props.alreadyLinked.includes(id)
}

function isSelected(id: string) {
    return selectedIds.value.includes(id)
}

function select(id: string) {
    if (isLinked(id)) return
    const idx = selectedIds.value.indexOf(id)
    if (idx >= 0) {
        selectedIds.value.splice(idx, 1)
    } else {
        selectedIds.value.push(id)
    }
}

const selectableCount = computed(() =>
    selectedIds.value.filter(id => !isLinked(id)).length
)

async function useSelected() {
    if (!selectableCount.value) return
    isBusy.value = true
    const ids = selectedIds.value.filter(id => !isLinked(id))
    const results = await Promise.all(
        ids.map(id => BackendAPI.LinkImageToItem(id, props.itemId))
    )
    isBusy.value = false
    const linked: MediaItem[] = []
    results.forEach((result, i) => {
        if (result?.status === 'ok') {
            const picture = allPictures.value.find(p => p.Id === ids[i])
            if (picture) linked.push(picture)
        }
    })
    if (linked.length) emit('linked', linked)
}

async function importNew() {
    isBusy.value = true
    const result = await BackendAPI.AddImageToItem(props.itemId)
    isBusy.value = false
    if (result?.status === 'ok' && result.Pictures?.length) {
        for (const pic of result.Pictures) {
            allPictures.value.unshift(pic)
        }
        emit('linked', result.Pictures)
    }
}

function formatSize(bytes: number) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
    <div class="picker-backdrop" ref="root" @mousedown="onMousedown" @click="onClick">
        <div class="picker-panel">

            <div class="picker-header">
                <span class="picker-title">Add Image</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="16" /></button>
            </div>

            <div class="picker-toolbar">
                <input
                    class="search-input"
                    type="text"
                    v-model="searchQuery"
                    placeholder="Search by name…"
                />
                <button class="btn btn-import" :disabled="isBusy" @click="importNew">
                    <PhUploadSimple :size="15" />
                    Import New File…
                </button>
            </div>

            <div class="picker-body">
                <div v-if="isLoading" class="picker-status">Loading…</div>

                <div v-else-if="!filtered.length" class="picker-status">
                    {{ allPictures.length ? 'No results.' : 'No images in library yet. Import a file to get started.' }}
                </div>

                <div v-else class="thumb-grid">
                    <div
                        v-for="pic in filtered"
                        :key="pic.Id"
                        class="thumb-cell"
                        :class="{
                            'thumb-cell--selected': isSelected(pic.Id),
                            'thumb-cell--linked':   isLinked(pic.Id),
                        }"
                        @click="select(pic.Id)"
                        :title="isLinked(pic.Id) ? 'Already attached' : (pic.Title || pic.FileName)"
                    >
                        <div class="thumb-img-wrap">
                            <img
                                :src="mediaUrl(pic.ThumbPath)"
                                :alt="pic.Title || pic.FileName"
                                @error="($event.target as HTMLImageElement).src = ''"
                            />
                            <div v-if="isLinked(pic.Id)" class="linked-badge">
                                <PhCheck :size="12" weight="bold" />
                            </div>
                            <div v-if="isSelected(pic.Id) && !isLinked(pic.Id)" class="selected-overlay">
                                <PhCheck :size="20" weight="bold" class="selected-check" />
                            </div>
                        </div>
                        <div class="thumb-label">
                            <span class="thumb-name">{{ pic.Title || pic.FileName }}</span>
                            <span class="thumb-meta">{{ pic.FileType?.toUpperCase() }} · {{ formatSize(pic.FileSize) }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="picker-footer">
                <span class="selection-hint" v-if="selectableCount > 0">
                    {{ selectableCount }} image{{ selectableCount !== 1 ? 's' : '' }} selected
                </span>
                <span class="selection-hint muted" v-else>
                    Click images to select, click again to deselect
                </span>
                <div class="footer-actions">
                    <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
                    <button
                        class="btn btn-primary"
                        :disabled="!selectableCount || isBusy"
                        @click="useSelected"
                    >
                        {{ isBusy ? 'Adding…' : selectableCount > 1 ? `Add ${selectableCount} Images` : 'Add Image' }}
                    </button>
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped lang="scss">
.picker-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200;
    display: flex; align-items: center; justify-content: center;
}

.picker-panel {
    display: flex; flex-direction: column;
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    width: min(860px, 94vw); height: min(620px, 90vh);
    box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    overflow: hidden;
}

.picker-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    background: #162032; border-bottom: 1px solid #334155;
    flex-shrink: 0;
}

.picker-title {
    font-size: 14px; font-weight: 700; color: var(--app-text, #e2e8f0);
    user-select: none;
}

.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--app-text-dim, #64748b); cursor: pointer;
    padding: 3px; border-radius: 3px;
    &:hover { background: #334155; color: var(--app-text, #e2e8f0); }
}

// ── Toolbar ──
.picker-toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; border-bottom: 1px solid #2d3f55;
    flex-shrink: 0; background: #162032;
}

.search-input {
    flex: 1; padding: 6px 10px;
    border: 1px solid #334155; border-radius: 4px;
    font-size: 13px; color: var(--app-text, #e2e8f0);
    background: var(--app-bg, #0f172a);
    color-scheme: dark;
    &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
    &::placeholder { color: var(--app-text-dim, #64748b); }
}

// ── Body ──
.picker-body {
    flex: 1; overflow-y: auto; padding: 12px 16px;
    background: var(--app-bg, #0f172a);
}

.picker-status {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: var(--app-text-dim, #64748b); font-size: 13px; font-style: italic;
}

.thumb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
}

.thumb-cell {
    border: 2px solid #334155;
    border-radius: 5px; overflow: hidden;
    cursor: pointer; background: #1e293b;
    transition: border-color 0.15s, box-shadow 0.15s;

    &:hover:not(.thumb-cell--linked) {
        border-color: #4a90d9;
        box-shadow: 0 2px 8px rgba(74,144,217,0.2);
    }

    &.thumb-cell--selected {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.35);
    }

    &.thumb-cell--linked {
        cursor: default; opacity: 0.5;
    }
}

.thumb-img-wrap {
    position: relative; width: 100%; height: 96px;

    img {
        width: 100%; height: 100%;
        object-fit: cover; display: block;
        background: #2d3f55;
    }
}

.linked-badge {
    position: absolute; top: 4px; right: 4px;
    width: 18px; height: 18px; border-radius: 50%;
    background: #27ae60; color: #fff;
    display: flex; align-items: center; justify-content: center;
}

.selected-overlay {
    position: absolute; inset: 0;
    background: rgba(59,130,246,0.35);
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
}

.selected-check {
    color: #fff;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
}

.thumb-label {
    padding: 5px 7px;
    display: flex; flex-direction: column; gap: 2px;
}

.thumb-name {
    font-size: 11px; color: var(--app-text, #e2e8f0); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.thumb-meta {
    font-size: 10px; color: var(--app-text-dim, #64748b);
}

// ── Footer ──
.picker-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid #334155;
    background: #162032; flex-shrink: 0;
}

.selection-hint {
    font-size: 12px; color: var(--app-text-muted, #94a3b8);
    &.muted { color: #4a5568; }
}

.footer-actions { display: flex; gap: 8px; }

// ── Buttons ──
.btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 6px 14px; border-radius: 4px; border: none;
    cursor: pointer; font-size: 12px; font-weight: 500;
    transition: background 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.btn-import {
    background: #334155; color: #cbd5e1; border: 1px solid #4a5568;
    white-space: nowrap;
    &:hover:not(:disabled) { background: #3d5068; }
}

.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid #334155;
    &:hover { background: #334155; color: var(--app-text, #e2e8f0); }
}

.btn-primary {
    background: #4a90d9; color: #fff;
    &:hover:not(:disabled) { background: #3578c5; }
}
</style>

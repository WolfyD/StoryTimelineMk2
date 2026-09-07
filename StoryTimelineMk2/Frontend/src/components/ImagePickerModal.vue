<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PhX, PhUploadSimple, PhCheck } from '@phosphor-icons/vue'
import type { MediaItem } from '@/types/models'
import { BackendAPI } from '@/bridge/api'

const props = defineProps<{
    itemId: string
    alreadyLinked: string[]
}>()

const emit = defineEmits<{
    close: []
    linked: [pictures: MediaItem[]]
}>()

const allPictures   = ref<MediaItem[]>([])
const isLoading     = ref(true)
const selectedId    = ref<string | null>(null)
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

function select(id: string) {
    if (isLinked(id)) return
    selectedId.value = selectedId.value === id ? null : id
}

async function useSelected() {
    if (!selectedId.value) return
    isBusy.value = true
    const result = await BackendAPI.LinkImageToItem(selectedId.value, props.itemId)
    isBusy.value = false
    if (result?.status === 'ok') {
        const picture = allPictures.value.find(p => p.Id === selectedId.value)
        if (picture) emit('linked', [picture])
    }
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
    <div class="picker-backdrop" @click.self="emit('close')">
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
                            'thumb-cell--selected':  selectedId === pic.Id,
                            'thumb-cell--linked':    isLinked(pic.Id),
                        }"
                        @click="select(pic.Id)"
                        :title="isLinked(pic.Id) ? 'Already attached' : (pic.Title || pic.FileName)"
                    >
                        <div class="thumb-img-wrap">
                            <img
                                :src="`https://media.app/${pic.FilePath}`"
                                :alt="pic.Title || pic.FileName"
                                @error="($event.target as HTMLImageElement).src = ''"
                            />
                            <div v-if="isLinked(pic.Id)" class="linked-badge">
                                <PhCheck :size="12" weight="bold" />
                            </div>
                            <div v-if="selectedId === pic.Id" class="selected-overlay" />
                        </div>
                        <div class="thumb-label">
                            <span class="thumb-name">{{ pic.Title || pic.FileName }}</span>
                            <span class="thumb-meta">{{ pic.FileType?.toUpperCase() }} · {{ formatSize(pic.FileSize) }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="picker-footer">
                <span class="selection-hint" v-if="selectedId && !isLinked(selectedId)">
                    1 image selected
                </span>
                <span class="selection-hint muted" v-else-if="!selectedId">
                    Click an image to select it
                </span>
                <div class="footer-actions">
                    <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
                    <button
                        class="btn btn-primary"
                        :disabled="!selectedId || isLinked(selectedId) || isBusy"
                        @click="useSelected"
                    >
                        {{ isBusy ? 'Adding…' : 'Use Selected' }}
                    </button>
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped lang="scss">
.picker-backdrop {
    position: fixed; inset: 0; background: #00000066; z-index: 200;
    display: flex; align-items: center; justify-content: center;
}

.picker-panel {
    display: flex; flex-direction: column;
    background: #fff; border: 1px solid #ccc; border-radius: 8px;
    width: min(860px, 94vw); height: min(620px, 90vh);
    box-shadow: 0 20px 40px #00000033;
    overflow: hidden;
}

.picker-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    background: #f5f5f5; border-bottom: 1px solid #ddd;
    flex-shrink: 0;
}

.picker-title {
    font-size: 14px; font-weight: 700; color: #333;
    user-select: none;
}

.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: #888; cursor: pointer;
    padding: 3px; border-radius: 3px;
    &:hover { background: #e0e0e0; color: #333; }
}

// ── Toolbar ──
.picker-toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; border-bottom: 1px solid #eee;
    flex-shrink: 0; background: #fafafa;
}

.search-input {
    flex: 1; padding: 6px 10px;
    border: 1px solid #ccc; border-radius: 4px;
    font-size: 13px; color: #333;
    &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
}

// ── Body ──
.picker-body {
    flex: 1; overflow-y: auto; padding: 12px 16px;
}

.picker-status {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #aaa; font-size: 13px; font-style: italic;
}

.thumb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
}

.thumb-cell {
    border: 2px solid #e0e0e0;
    border-radius: 5px; overflow: hidden;
    cursor: pointer; background: #f9f9f9;
    transition: border-color 0.15s, box-shadow 0.15s;

    &:hover:not(.thumb-cell--linked) {
        border-color: #4a90d9;
        box-shadow: 0 2px 8px #4a90d926;
    }

    &.thumb-cell--selected {
        border-color: #4a90d9;
        box-shadow: 0 0 0 3px #4a90d940;
    }

    &.thumb-cell--linked {
        cursor: default; opacity: 0.7;
    }
}

.thumb-img-wrap {
    position: relative; width: 100%; height: 96px;

    img {
        width: 100%; height: 100%;
        object-fit: cover; display: block;
        background: #e8e8e8;
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
    background: #4a90d920;
    pointer-events: none;
}

.thumb-label {
    padding: 5px 7px;
    display: flex; flex-direction: column; gap: 2px;
}

.thumb-name {
    font-size: 11px; color: #333; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.thumb-meta {
    font-size: 10px; color: #aaa;
}

// ── Footer ──
.picker-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid #ddd;
    background: #f5f5f5; flex-shrink: 0;
}

.selection-hint {
    font-size: 12px; color: #555;
    &.muted { color: #aaa; }
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
    background: #f0f0f0; color: #444; border: 1px solid #ccc;
    white-space: nowrap;
    &:hover:not(:disabled) { background: #e4e4e4; }
}

.btn-cancel {
    background: transparent; color: #666; border: 1px solid #ccc;
    &:hover { background: #eee; }
}

.btn-primary {
    background: #4a90d9; color: #fff;
    &:hover:not(:disabled) { background: #3578c5; }
}
</style>

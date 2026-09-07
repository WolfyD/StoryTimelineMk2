<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import { BackendAPI } from '@/bridge/api';
import type { LayoutSettings, MediaItem } from '@/types/models';

const props = defineProps<{
    layoutSettings: LayoutSettings | null;
}>();

const store = useTimelineStore();

type GalleryMode = 'grid' | 'cascade';
const mode = ref<GalleryMode>('grid');

// { url, title, itemTitle }
interface GalleryEntry { url: string; title: string; itemTitle: string; }

const entries = ref<GalleryEntry[]>([]);
const cascadeIndex = ref(0);
const lightboxSrc = ref<string | null>(null);

function inRange(absoluteStart: number, absoluteEnd: number): boolean {
    if (!props.layoutSettings) return false;
    const tickDist = props.layoutSettings.TimelineTickDistance || 100;
    const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
    const halfAbsolute = (props.layoutSettings.TimelineDataRangeWidth / 2 / tickDist) * lodStep;
    const center = store.centerAbsoluteTime;
    const rangeStart = center - halfAbsolute;
    const rangeEnd   = center + halfAbsolute;
    if (absoluteEnd > absoluteStart) {
        return absoluteStart <= rangeEnd && absoluteEnd >= rangeStart;
    }
    return absoluteStart >= rangeStart && absoluteStart <= rangeEnd;
}

const inRangeItemIds = computed(() =>
    store.items
        .filter(i => inRange(i.AbsoluteStart, i.AbsoluteEnd) && i.TypeId !== 6 && i.TypeId !== 8 && i.TypeId !== 9)
        .map(i => ({ id: i.Id, timelineId: i.TimelineId, title: i.Title }))
);

// Reload pictures whenever in-range items change (debounced to avoid hammering backend during drag)
let _galleryTimer: ReturnType<typeof setTimeout> | null = null;
watch(inRangeItemIds, (items) => {
    if (_galleryTimer) clearTimeout(_galleryTimer);
    _galleryTimer = setTimeout(async () => {
        _galleryTimer = null;
        const fetched: GalleryEntry[] = [];
        for (const { id, timelineId, title } of items) {
            try {
                const data = await BackendAPI.GetItemForEdit(timelineId, id);
                for (const pic of data?.Pictures ?? []) {
                    fetched.push({
                        url: `https://media.app/${pic.FilePath}`,
                        title: pic.Title || pic.FileName,
                        itemTitle: title,
                    });
                }
            } catch { /* skip */ }
        }
        entries.value = fetched;
        cascadeIndex.value = 0;
    }, 300);
}, { immediate: true });

function nextCascade() {
    if (entries.value.length < 2) return;
    cascadeIndex.value = (cascadeIndex.value + 1) % entries.value.length;
}

// Ordered so the current front card is last in DOM (rendered on top)
const cascadeOrder = computed(() => {
    const n = entries.value.length;
    if (n === 0) return [];
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
        result.push((cascadeIndex.value + i) % n);
    }
    return result; // first = back, last = front
});
</script>

<template>
    <div class="gallery-panel">
        <!-- Mode toggle -->
        <div class="gallery-toolbar">
            <button
                class="gallery-mode-btn"
                :class="{ active: mode === 'grid' }"
                @click="mode = 'grid'"
                title="Grid view"
            ><i class="ri-grid-fill" /></button>
            <button
                class="gallery-mode-btn"
                :class="{ active: mode === 'cascade' }"
                @click="mode = 'cascade'"
                title="Stack view"
            ><i class="ri-stack-fill" /></button>
        </div>

        <div v-if="entries.length === 0" class="gallery-empty">No images in range</div>

        <!-- Grid mode -->
        <div v-else-if="mode === 'grid'" class="gallery-grid">
            <div
                v-for="(entry, idx) in entries"
                :key="idx"
                class="gallery-grid-item"
                :title="entry.itemTitle + (entry.title ? ' – ' + entry.title : '')"
                @click="lightboxSrc = entry.url"
            >
                <img :src="entry.url" :alt="entry.title" />
            </div>
        </div>

        <!-- Cascade / stack mode -->
        <div v-else class="gallery-cascade-wrap">
            <div class="gallery-stack">
                <div
                    v-for="(idx, pos) in cascadeOrder"
                    :key="idx"
                    class="gallery-stack-card"
                    :style="{
                        zIndex: pos,
                        transform: `translateX(${(cascadeOrder.length - 1 - pos) * 6}px) translateY(${(cascadeOrder.length - 1 - pos) * 4}px)`,
                        opacity: pos === cascadeOrder.length - 1 ? 1 : 0.6 - (cascadeOrder.length - 1 - pos) * 0.1,
                    }"
                    @click="pos === cascadeOrder.length - 1 ? (lightboxSrc = entries[idx].url) : null"
                >
                    <img :src="entries[idx].url" :alt="entries[idx].title" />
                </div>
            </div>
            <div class="gallery-cascade-controls">
                <span class="gallery-card-label">{{ entries[cascadeIndex]?.itemTitle }}</span>
                <button class="gallery-next-btn" @click="nextCascade" v-if="entries.length > 1">
                    Next ›
                </button>
            </div>
        </div>

        <!-- Lightbox -->
        <Teleport to="body">
            <div v-if="lightboxSrc" class="gallery-lightbox-backdrop" @click="lightboxSrc = null">
                <img :src="lightboxSrc" class="gallery-lightbox-img" @click.stop />
            </div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.gallery-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0f172a;
    color: #e2e8f0;
    overflow: hidden;
}

.gallery-toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid #1e293b;
}

.gallery-mode-btn {
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.15s;

    &:hover { color: #e2e8f0; border-color: #64748b; }
    &.active { background: #1e3a5f; color: #93c5fd; border-color: #3b82f6; }
}

.gallery-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #475569;
    font-size: 0.85em;
    font-style: italic;
}

// Grid
.gallery-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 6px;
    padding: 8px;
    align-content: start;
}

.gallery-grid-item {
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 4px;
    cursor: zoom-in;
    border: 1px solid #1e293b;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.15s;
    }

    &:hover img { transform: scale(1.06); }
}

// Cascade
.gallery-cascade-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 16px;
    overflow: hidden;
}

.gallery-stack {
    position: relative;
    width: 160px;
    height: 160px;
}

.gallery-stack-card {
    position: absolute;
    inset: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 2px solid #334155;
    transition: transform 0.25s ease, opacity 0.25s ease;
    cursor: pointer;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.gallery-cascade-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.gallery-card-label {
    font-size: 0.8em;
    color: #94a3b8;
    text-align: center;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.gallery-next-btn {
    background: #1e3a5f;
    color: #93c5fd;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    padding: 4px 14px;
    cursor: pointer;
    font-size: 0.82em;
    transition: background 0.15s;

    &:hover { background: #1e40af; }
}

// Lightbox
.gallery-lightbox-backdrop {
    position: fixed;
    inset: 0;
    background: #000000cc;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9500;
    cursor: zoom-out;
}

.gallery-lightbox-img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 40px #00000088;
    cursor: default;
}
</style>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import { BackendAPI } from '@/bridge/api';
import type { LayoutSettings, TimelineItem, MediaItem } from '@/types/models';

const props = defineProps<{
    layoutSettings: LayoutSettings | null;
}>();

const store = useTimelineStore();

// Cache: itemId → first picture URL (null = no picture, undefined = not yet fetched)
const pictureCache = ref<Map<string, string | null>>(new Map());

// Lightbox state
const lightboxSrc = ref<string | null>(null);

function distanceFromCenter(item: TimelineItem): number {
    const center = store.centerAbsoluteTime;
    if (item.AbsoluteEnd > item.AbsoluteStart) {
        if (center >= item.AbsoluteStart && center <= item.AbsoluteEnd) return 0;
        return Math.min(Math.abs(item.AbsoluteStart - center), Math.abs(item.AbsoluteEnd - center));
    }
    return Math.abs(item.AbsoluteStart - center);
}

function inRange(item: TimelineItem): boolean {
    if (!props.layoutSettings) return false;
    const tickDist = props.layoutSettings.TimelineTickDistance || 100;
    const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
    const halfAbsolute = (props.layoutSettings.TimelineDataRangeWidth / 2 / tickDist) * lodStep;
    const center = store.centerAbsoluteTime;
    const rangeStart = center - halfAbsolute;
    const rangeEnd   = center + halfAbsolute;
    if (item.AbsoluteEnd > item.AbsoluteStart) {
        return item.AbsoluteStart <= rangeEnd && item.AbsoluteEnd >= rangeStart;
    }
    return item.AbsoluteStart >= rangeStart && item.AbsoluteStart <= rangeEnd;
}

const inRangeItems = computed(() => store.items.filter(inRange));

const ages = computed(() =>
    inRangeItems.value
        .filter(i => i.TypeId === 3)
        .sort((a, b) => (b.Importance - a.Importance) || (distanceFromCenter(a) - distanceFromCenter(b)))
);

const periods = computed(() =>
    inRangeItems.value
        .filter(i => i.TypeId === 2)
        .sort((a, b) => (b.Importance - a.Importance) || (distanceFromCenter(a) - distanceFromCenter(b)))
);

const others = computed(() =>
    inRangeItems.value
        .filter(i => i.TypeId !== 2 && i.TypeId !== 3 && i.TypeId !== 6 && i.TypeId !== 8 && i.TypeId !== 9)
        .sort((a, b) => (b.Importance - a.Importance) || (distanceFromCenter(a) - distanceFromCenter(b)))
);

// When visible items change, fetch missing picture info (debounced to avoid hammering backend during drag)
let _fetchTimer: ReturnType<typeof setTimeout> | null = null;
watch(inRangeItems, (items) => {
    if (_fetchTimer) clearTimeout(_fetchTimer);
    _fetchTimer = setTimeout(async () => {
        _fetchTimer = null;
        for (const item of items) {
            if (pictureCache.value.has(item.Id)) continue;
            pictureCache.value.set(item.Id, undefined as any);
            try {
                const data = await BackendAPI.GetItemForEdit(item.TimelineId, item.Id);
                const first = data?.Pictures?.[0];
                pictureCache.value.set(item.Id, first ? `https://media.app/${first.FilePath}` : null);
            } catch {
                pictureCache.value.set(item.Id, null);
            }
        }
    }, 300);
}, { immediate: true });

function picUrl(itemId: string): string | null {
    const v = pictureCache.value.get(itemId);
    return v === undefined ? null : v;
}
</script>

<template>
    <div class="data-panel">
        <div v-if="inRangeItems.length === 0" class="data-empty">
            Nothing in range
        </div>

        <template v-else>
            <!-- Ages -->
            <template v-for="item in ages" :key="item.Id">
                <div class="data-age">
                    <div class="data-age-title">{{ item.Title }}</div>
                    <div v-if="item.Description" class="data-age-desc">{{ item.Description }}</div>
                </div>
            </template>

            <!-- Periods -->
            <template v-for="item in periods" :key="item.Id">
                <div class="data-period">
                    <div class="data-period-title">{{ item.Title }}</div>
                    <div v-if="item.Description" class="data-period-desc">{{ item.Description }}</div>
                </div>
            </template>

            <!-- Other items -->
            <template v-for="item in others" :key="item.Id">
                <div class="data-item">
                    <div class="data-item-body">
                        <div class="data-item-title">{{ item.Title }}</div>
                        <div v-if="item.Description" class="data-item-desc">{{ item.Description }}</div>
                        <div v-if="item.Content" class="data-item-content">{{ item.Content }}</div>
                    </div>
                    <div
                        v-if="picUrl(item.Id)"
                        class="data-item-image"
                        @click="lightboxSrc = picUrl(item.Id)"
                    >
                        <img :src="picUrl(item.Id)!" alt="" />
                    </div>
                </div>
            </template>
        </template>

        <!-- Lightbox -->
        <Teleport to="body">
            <div v-if="lightboxSrc" class="data-lightbox-backdrop" @click="lightboxSrc = null">
                <img :src="lightboxSrc" class="data-lightbox-img" @click.stop />
            </div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.data-panel {
    height: 100%;
    overflow-y: auto;
    padding: 12px 14px;
    background: #f5f0e8;
    color: #2c1f0f;
    font-family: Georgia, serif;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.data-empty {
    color: #9ca3af;
    font-style: italic;
    font-size: 0.85em;
    text-align: center;
    margin-top: 20px;
}

// Ages
.data-age {
    border-bottom: 2px solid #4a3728;
    padding-bottom: 6px;
    margin-bottom: 4px;
}

.data-age-title {
    font-size: 1.25em;
    font-weight: 700;
    text-decoration: underline;
    color: #2c1f0f;
}

.data-age-desc {
    font-size: 0.85em;
    color: #5c4a38;
    margin-top: 3px;
    font-style: italic;
}

// Periods
.data-period {
    margin-bottom: 2px;
}

.data-period-title {
    font-size: 1.05em;
    font-weight: 600;
    color: #3a2b1a;
}

.data-period-desc {
    font-size: 0.85em;
    color: #5c4a38;
    margin-top: 3px;
    line-height: 1.55;
}

// Other items
.data-item {
    display: flex;
    gap: 10px;
    background: #ffffffaa;
    border: 1px solid #d4c9b8;
    border-radius: 4px;
    padding: 10px;
    align-items: flex-start;
}

.data-item-body {
    flex: 1;
    min-width: 0;
}

.data-item-title {
    font-size: 1em;
    font-weight: 700;
    color: #2c1f0f;
    margin-bottom: 4px;
}

.data-item-desc {
    font-size: 0.82em;
    color: #5c4a38;
    line-height: 1.45;
}

.data-item-content {
    font-size: 0.78em;
    color: #7a6a58;
    margin-top: 4px;
    line-height: 1.4;
}

.data-item-image {
    flex-shrink: 0;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid #d4c9b8;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    &:hover {
        border-color: #7a6a58;
    }
}

// Lightbox
.data-lightbox-backdrop {
    position: fixed;
    inset: 0;
    background: #000000cc;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9500;
    cursor: zoom-out;
}

.data-lightbox-img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 40px #00000088;
    cursor: default;
}
</style>

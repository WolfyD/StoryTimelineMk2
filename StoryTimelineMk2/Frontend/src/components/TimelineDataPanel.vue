<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { mediaUrl } from '@/utils/mediaUrl';
import { useTimelineStore } from '@/stores/timelineStore';
import { getItemDetails } from '@/utils/itemDetails';
import type { LayoutSettings, TimelineItem, MediaItem } from '@/types/models';
import { useLightbox } from '@/composables/useLightbox';
import { PhEye } from '@phosphor-icons/vue';
import LightboxOverlay from '@/components/LightboxOverlay.vue';
import TimelineItemViewModal from '@/components/TimelineItemViewModal.vue';

const props = defineProps<{
    layoutSettings: LayoutSettings | null;
}>();

const store = useTimelineStore();

// Cache: itemId → first picture URL (null = no picture, undefined = not yet fetched)
// Keyed by item object: upsertItem replaces the object, so a saved item refetches its picture automatically
const pictureCache = reactive(new WeakMap<TimelineItem, string | null>());

const { lightboxSrc, lightboxCollection, lightboxIndex, openLightbox, closeLightbox, lightboxPrev, lightboxNext, onLbBeforeEnter, onLbEnter, onLbBeforeLeave, onLbLeave } = useLightbox()

const viewingItem = ref<TimelineItem | null>(null)
const viewingRefItem = ref<TimelineItem | null>(null)   // BL-66 underlay: view only, no locate / pulse
const highlightedItemId = ref<string | null>(null)

function focusItem(item: TimelineItem) {
    highlightedItemId.value = item.Id
    store.pulseItem(item.Id)
    setTimeout(() => {
        highlightedItemId.value = null
        viewingItem.value = item
    }, 1000)
}

function distanceFromCenter(item: TimelineItem): number {
    const center = store.centerAbsoluteTime;
    if (item.AbsoluteEnd > item.AbsoluteStart) {
        if (center >= item.AbsoluteStart && center <= item.AbsoluteEnd) return 0;
        return Math.min(Math.abs(item.AbsoluteStart - center), Math.abs(item.AbsoluteEnd - center));
    }
    return Math.abs(item.AbsoluteStart - center);
}

function inRange(item: TimelineItem, shift = 0): boolean {
    if (!props.layoutSettings) return false;
    const tickDist = props.layoutSettings.TimelineTickDistance || 100;
    const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
    const halfAbsolute = (props.layoutSettings.TimelineDataRangeWidth / 2 / tickDist) * lodStep;
    const center = store.centerAbsoluteTime;
    const rangeStart = center - halfAbsolute;
    const rangeEnd   = center + halfAbsolute;
    const start = item.AbsoluteStart + shift, end = item.AbsoluteEnd + shift;
    if (end > start) {
        return start <= rangeEnd && end >= rangeStart;
    }
    return start >= rangeStart && start <= rangeEnd;
}

const inRangeItems = computed(() => store.filteredItems.filter(i => i.ShowInNotes !== false && inRange(i)));

// BL-66 underlay: the reference timeline's in-range items (shifted, unfiltered) — its own section below ours
const refItems = computed(() => {
    const ref = store.reference;
    if (!ref) return [];
    return ref.items
        .filter(i => i.TypeId !== 6 && i.ShowInNotes !== false && inRange(i, ref.shift))
        .sort((a, b) => a.AbsoluteStart - b.AbsoluteStart);
});

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
            if (pictureCache.has(item)) continue;
            pictureCache.set(item, undefined as any);
            const data = await getItemDetails(item);
            const first = data?.Pictures?.[0];
            pictureCache.set(item, first ? mediaUrl(first.ThumbPath) : null);
        }
    }, 300);
}, { immediate: true });

function picUrl(item: TimelineItem): string | null {
    const v = pictureCache.get(item);
    return v === undefined ? null : v;
}
</script>

<template>
    <div class="data-panel" :style="{
        '--dp-bg':   props.layoutSettings?.DataPanelBackgroundColor     || '#f5f0e8',
        '--dp-card': props.layoutSettings?.DataPanelCardBackgroundColor  || '#ffffffaa',
        '--dp-h1':   props.layoutSettings?.DataPanelH1Color              || '#2c1f0f',
        '--dp-h2':   props.layoutSettings?.DataPanelH2Color              || '#3a2b1a',
        '--dp-h3':   props.layoutSettings?.DataPanelH3Color              || '#2c1f0f',
        '--dp-h4':   props.layoutSettings?.DataPanelH4Color              || '#5c4a38',
        '--dp-ff':   props.layoutSettings?.DataPanelFontFamily           || 'Georgia, serif',
        '--dp-fs':   (props.layoutSettings?.DataPanelFontSize ?? 14) + 'px',
    }">
        <div v-if="inRangeItems.length === 0" class="data-empty">
            Nothing in range
        </div>

        <template v-else>
            <!-- Ages -->
            <template v-for="item in ages" :key="item.Id">
                <div class="data-age" :class="{ highlighted: highlightedItemId === item.Id }">
                    <button class="data-item-focus-btn" title="Locate & preview" @click.stop="focusItem(item)">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
                            <circle cx="8" cy="8" r="2.8" stroke="currentColor" stroke-width="1.2"/>
                        </svg>
                    </button>
                    <div class="data-age-title">{{ item.Title }}</div>
                    <div v-if="item.Description" class="data-age-desc">{{ item.Description }}</div>
                </div>
            </template>

            <!-- Periods -->
            <template v-for="item in periods" :key="item.Id">
                <div class="data-period" :class="{ highlighted: highlightedItemId === item.Id }">
                    <button class="data-item-focus-btn" title="Locate & preview" @click.stop="focusItem(item)">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
                            <circle cx="8" cy="8" r="2.8" stroke="currentColor" stroke-width="1.2"/>
                        </svg>
                    </button>
                    <div class="data-period-title">{{ item.Title }}</div>
                    <div v-if="item.Description" class="data-period-desc">{{ item.Description }}</div>
                </div>
            </template>

            <!-- Other items -->
            <template v-for="item in others" :key="item.Id">
                <div class="data-item" :class="{ highlighted: highlightedItemId === item.Id }">
                    <button class="data-item-focus-btn" title="Locate & preview" @click.stop="focusItem(item)">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
                            <circle cx="8" cy="8" r="2.8" stroke="currentColor" stroke-width="1.2"/>
                        </svg>
                    </button>
                    <div class="data-item-body">
                        <div class="data-item-title">{{ item.Title }}</div>
                        <div v-if="item.Description" class="data-item-desc">{{ item.Description }}</div>
                        <div v-if="item.Content" class="data-item-content">{{ item.Content }}</div>
                    </div>
                    <div
                        v-if="picUrl(item)"
                        class="data-item-image"
                        @click="openLightbox($event, picUrl(item)!)"
                    >
                        <img :src="picUrl(item)!" alt="" />
                    </div>
                </div>
            </template>
        </template>

        <!-- Reference underlay (BL-66) — the other timeline's in-range items, view only -->
        <template v-if="store.reference">
            <div class="data-ref-head">
                <span class="data-ref-title">Reference — {{ store.reference.project.Title || 'Untitled' }}</span>
                <span v-if="store.reference.shift" class="data-ref-shift">shifted {{ store.reference.shift > 0 ? '+' : '' }}{{ store.reference.shift }} years</span>
            </div>
            <div v-if="refItems.length === 0" class="data-empty data-ref-empty">Nothing in range</div>
            <div v-for="item in refItems" :key="'ref:' + item.Id" class="data-ref-item">
                <button class="data-item-focus-btn" title="View" @click.stop="viewingRefItem = item">
                    <PhEye :size="14" />
                </button>
                <div class="data-item-body">
                    <div class="data-ref-item-title">{{ item.Title }}</div>
                    <div v-if="item.Description" class="data-item-desc">{{ item.Description }}</div>
                </div>
            </div>
        </template>

        <!-- Bottom spacer — padding-bottom is eaten by Chromium on overflow flex containers -->
        <div class="data-panel-spacer" aria-hidden="true"></div>

        <!-- Read-only item overlay -->
        <TimelineItemViewModal
            v-if="viewingItem"
            :item-id="viewingItem.Id"
            :timeline-id="viewingItem.TimelineId"
            :layout-settings="props.layoutSettings"
            @close="viewingItem = null"
        />
        <TimelineItemViewModal
            v-if="viewingRefItem"
            :item-id="viewingRefItem.Id"
            :timeline-id="viewingRefItem.TimelineId"
            :layout-settings="props.layoutSettings"
            view-only
            @close="viewingRefItem = null"
        />

        <!-- Lightbox -->
        <Teleport to="body">
            <Transition :css="false"
                @before-enter="onLbBeforeEnter" @enter="onLbEnter"
                @before-leave="onLbBeforeLeave" @leave="onLbLeave"
            >
                <LightboxOverlay
                    v-if="lightboxSrc"
                    :src="lightboxSrc"
                    :has-prev="lightboxIndex > 0"
                    :has-next="lightboxIndex < lightboxCollection.length - 1"
                    @close="closeLightbox()"
                    @prev="lightboxPrev()"
                    @next="lightboxNext()"
                />
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.data-panel {
    height: 100%;
    overflow-y: auto;
    padding: 12px 14px 0;
    background: var(--dp-bg);
    color: var(--dp-h4);
    font-family: var(--dp-ff);
    font-size: var(--dp-fs);
    display: flex;
    flex-direction: column;
    gap: 8px;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dp-h4) 30%, transparent); border-radius: 3px; }
}

.data-empty {
    color: var(--dp-h4);
    opacity: 0.5;
    font-style: italic;
    font-size: 0.85em;
    text-align: center;
    margin-top: 20px;
}

// Ages — H1
.data-age {
    position: relative;
    padding-left: 20px;
    border-bottom: 2px solid color-mix(in srgb, var(--dp-h1) 40%, transparent);
    padding-bottom: 6px;
    margin-bottom: 4px;
    border-radius: 3px;
    transition: background 0.15s;

    &.highlighted { background: color-mix(in srgb, var(--dp-h1) 12%, transparent); }
}

.data-age-title {
    font-size: 1.25em;
    font-weight: 700;
    text-decoration: underline;
    color: var(--dp-h1);
}

.data-age-desc {
    font-size: 0.85em;
    color: var(--dp-h4);
    margin-top: 3px;
    font-style: italic;
    white-space: pre-wrap;
}

// Periods — H2
.data-period {
    position: relative;
    padding-left: 20px;
    margin-bottom: 2px;
    border-radius: 3px;
    transition: background 0.15s;

    &.highlighted { background: color-mix(in srgb, var(--dp-h2) 12%, transparent); }
}

.data-period-title {
    font-size: 1.05em;
    font-weight: 600;
    color: var(--dp-h2);
}

.data-period-desc {
    font-size: 0.85em;
    color: var(--dp-h4);
    margin-top: 3px;
    line-height: 1.55;
    white-space: pre-wrap;
}

// Other items — H3 title + H4 body
.data-item {
    position: relative;
    display: flex;
    gap: 10px;
    background: var(--dp-card);
    border: 1px solid color-mix(in srgb, var(--dp-h4) 30%, transparent);
    border-radius: 4px;
    padding: 10px 10px 10px 26px;
    align-items: flex-start;
    transition: background 0.15s, border-color 0.15s;

    &.highlighted {
        background: color-mix(in srgb, var(--dp-h3) 12%, var(--dp-card));
        border-color: color-mix(in srgb, var(--dp-h3) 60%, transparent);
    }
}

.data-item-body {
    flex: 1;
    min-width: 0;
}

.data-item-title {
    font-size: 1em;
    font-weight: 700;
    color: var(--dp-h3);
    margin-bottom: 4px;
}

// Button: absolute, lives in the left gutter of each container
.data-item-focus-btn {
    position: absolute;
    left: 0;
    top: 3px;
    display: flex;
    visibility: hidden;
    opacity: 0;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--dp-h3) 60%, transparent);
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
    transition: color 0.12s, background 0.12s, opacity 0.15s;

    &:hover {
        color: var(--dp-h3);
        background: color-mix(in srgb, var(--dp-h3) 15%, transparent);
    }
}

// For card items: button sits in the card's left padding
.data-item > .data-item-focus-btn {
    left: 4px;
    top: 10px;
}

.data-item:hover > .data-item-focus-btn,
.data-age:hover > .data-item-focus-btn,
.data-period:hover > .data-item-focus-btn,
.data-ref-item:hover > .data-item-focus-btn {
    visibility: visible;
    opacity: 1;
}

// Reference underlay (BL-66) — muted and dashed off from the active items
.data-ref-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px dashed color-mix(in srgb, var(--dp-h4) 45%, transparent);
    opacity: 0.8;
}
.data-ref-title {
    font-size: 0.8em;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--dp-h2);
}
.data-ref-shift { font-size: 0.75em; font-style: italic; }
.data-ref-empty { margin-top: 0; }
.data-ref-item {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 6px 8px 6px 26px;
    border: 1px dashed color-mix(in srgb, var(--dp-h4) 30%, transparent);
    border-radius: 4px;
    opacity: 0.75;
}
.data-ref-item-title { font-weight: 600; color: var(--dp-h3); }
.data-ref-item > .data-item-focus-btn { left: 4px; top: 6px; }

.data-item-desc {
    font-size: 0.82em;
    color: var(--dp-h4);
    line-height: 1.45;
    white-space: pre-wrap;
}

.data-item-content {
    font-size: 0.78em;
    color: var(--dp-h4);
    opacity: 0.75;
    margin-top: 4px;
    line-height: 1.4;
    white-space: pre-wrap;
}

.data-item-image {
    flex-shrink: 0;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid color-mix(in srgb, var(--dp-h4) 30%, transparent);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    &:hover {
        border-color: var(--dp-h4);
    }
}

.data-panel-spacer {
    flex-shrink: 0;
    height: 40px;
}

</style>

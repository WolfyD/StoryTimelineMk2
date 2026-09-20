<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { BackendAPI } from '@/bridge/api';
import type { ItemForEdit, LayoutSettings } from '@/types/models';
import { useModalGuard } from '@/utils/shortcuts';
import { useTimelineStore } from '@/stores/timelineStore';

const props = defineProps<{
    itemId: string;
    timelineId: number;
    layoutSettings?: LayoutSettings | null;
    /** BL-66 underlay: an item from the reference timeline — no Edit button, badge says so */
    viewOnly?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

useModalGuard();
const store = useTimelineStore();

const data = ref<ItemForEdit | null>(null);
const loading = ref(true);

const TYPE_NAMES: Record<number, string> = {
    1: 'Event', 2: 'Period', 3: 'Age', 4: 'Picture',
    5: 'Note', 6: 'Bookmark', 7: 'Character',
    8: 'Timeline Start', 9: 'Timeline End',
};

onMounted(async () => {
    data.value = await BackendAPI.GetItemForEdit(props.timelineId, props.itemId);
    loading.value = false;
});

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function mediaUrl(fp: string) {
    return `https://media.app/${fp}`;
}

function openEdit() {
    BackendAPI.OpenAddEditItemWindow(props.timelineId, props.itemId)
    emit('close')
}

const panelStyle = computed(() => ({
    '--dp-bg':      props.layoutSettings?.DataPanelBackgroundColor     || '#f5f0e8',
    '--dp-card':    props.layoutSettings?.DataPanelCardBackgroundColor || '#ffffffaa',
    '--dp-h1':      props.layoutSettings?.DataPanelH1Color             || '#2c1f0f',
    '--dp-h2':      props.layoutSettings?.DataPanelH2Color             || '#3a2b1a',
    '--dp-h4':      props.layoutSettings?.DataPanelH4Color             || '#5c4a38',
    '--dp-ff':      props.layoutSettings?.DataPanelFontFamily          || 'Georgia, serif',
    '--item-color': data.value?.Item?.Color                            || '#8b7355',
}))
</script>

<template>
    <Teleport to="body">
        <div class="view-modal-backdrop" @click.self="emit('close')">
            <div class="view-modal" :style="panelStyle">
                <button class="vm-close" title="Close (Esc)" @click="emit('close')">
                    <i class="ri-close-line"></i>
                </button>

                <div v-if="loading" class="vm-loading">Loading…</div>
                <template v-else-if="data">
                    <div class="vm-header">
                        <div class="vm-color-strip"></div>
                        <div class="vm-title-block">
                            <span class="vm-type-badge">{{ TYPE_NAMES[data.Item.TypeId] || 'Item' }}<template v-if="viewOnly"> · reference</template></span>
                            <h2 class="vm-title">{{ data.Item.Title || 'Untitled' }}</h2>
                        </div>
                    </div>

                    <div class="vm-body">
                        <div class="vm-section">
                            <span class="vm-label">Date</span>
                            <span class="vm-value">
                                Year {{ data.Item.Year }}
                                <template v-if="data.Item.EndYear !== data.Item.Year">
                                    – {{ data.Item.EndYear }}
                                </template>
                            </span>
                        </div>

                        <div class="vm-section" v-if="data.Item.Description">
                            <span class="vm-label">Description</span>
                            <p class="vm-value vm-text">{{ data.Item.Description }}</p>
                        </div>

                        <div class="vm-section" v-if="data.Item.Content">
                            <span class="vm-label">Notes</span>
                            <p class="vm-value vm-text">{{ data.Item.Content }}</p>
                        </div>

                        <div class="vm-section" v-if="data.Tags.length">
                            <span class="vm-label">Tags</span>
                            <div class="vm-tags">
                                <span v-for="tag in data.Tags" :key="tag.Id" class="vm-tag">{{ tag.Name }}</span>
                            </div>
                        </div>

                        <div class="vm-section" v-if="data.Characters.length">
                            <span class="vm-label">Characters</span>
                            <div class="vm-list">
                                <span v-for="c in data.Characters" :key="c.CharacterId" class="vm-char">
                                    <span class="vm-char-dot" :style="{ background: c.CharacterColor || '#888' }"></span>
                                    {{ c.CharacterName }}
                                    <span v-if="c.Role" class="vm-char-role">({{ c.Role }})</span>
                                </span>
                            </div>
                        </div>

                        <div class="vm-section" v-if="data.StoryRefs.length">
                            <span class="vm-label">Stories</span>
                            <div class="vm-list">
                                <span v-for="s in data.StoryRefs" :key="s.StoryId" class="vm-list-item vm-chip vm-chip--story">{{ s.StoryTitle }}</span>
                            </div>
                        </div>

                        <div class="vm-section" v-if="data.ChapterRefs.length">
                            <span class="vm-label">Chapters</span>
                            <div class="vm-list">
                                <span v-for="ch in data.ChapterRefs" :key="ch.ChapterId" class="vm-list-item">
                                    {{ ch.BookTitle }} – Ch. {{ ch.ChapterNumber }}<template v-if="ch.ChapterTitle">: {{ ch.ChapterTitle }}</template>
                                </span>
                            </div>
                        </div>

                        <div class="vm-section" v-if="data.Pictures.length">
                            <span class="vm-label">Images</span>
                            <div class="vm-images">
                                <img v-for="pic in data.Pictures" :key="pic.Id"
                                     :src="mediaUrl(pic.FilePath)"
                                     :title="pic.Title || pic.FileName"
                                     class="vm-thumb" />
                            </div>
                        </div>
                    </div>

                    <div v-if="!store.readOnly && !viewOnly" class="vm-footer">
                        <button class="vm-edit-btn" @click="openEdit">
                            Edit item <i class="ri-arrow-right-line"></i>
                        </button>
                    </div>
                </template>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.view-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.view-modal {
    position: relative;
    background: var(--dp-bg);
    border: 1px solid color-mix(in srgb, var(--dp-h4) 30%, transparent);
    border-radius: 10px;
    width: 480px;
    max-width: 92vw;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
    font-family: var(--dp-ff, sans-serif);
    color: var(--dp-h4);
}

.vm-close {
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: color-mix(in srgb, var(--dp-h4) 70%, transparent);
    font-size: 16px;
    cursor: pointer;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    transition: background 0.12s, color 0.12s;

    &:hover {
        color: var(--dp-h1);
        background: color-mix(in srgb, var(--dp-h4) 12%, transparent);
    }
}

.vm-loading {
    padding: 32px;
    text-align: center;
    color: color-mix(in srgb, var(--dp-h4) 60%, transparent);
    font-style: italic;
    font-size: 0.85em;
}

.vm-header {
    display: flex;
    align-items: stretch;
    border-radius: 10px 10px 0 0;
    overflow: hidden;
    border-bottom: 1px solid color-mix(in srgb, var(--dp-h4) 25%, transparent);
    min-height: 64px;
    flex-shrink: 0;
}

.vm-color-strip {
    width: 6px;
    flex-shrink: 0;
    background: var(--item-color);
}

.vm-title-block {
    padding: 14px 40px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.vm-type-badge {
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--app-accent-hover, #818cf8);
    background: color-mix(in srgb, var(--app-accent, #6366f1) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-accent, #6366f1) 35%, transparent);
    border-radius: 4px;
    padding: 1px 6px;
    align-self: flex-start;
}

.vm-title {
    margin: 0;
    font-size: 1.15em;
    font-weight: 600;
    color: var(--dp-h1);
    word-break: break-word;
}

.vm-body {
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    flex: 1;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dp-h4) 30%, transparent); border-radius: 3px; }
}

.vm-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.vm-label {
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--dp-h4) 70%, transparent);
}

.vm-value {
    color: var(--dp-h2);
    font-size: 0.9em;
}

.vm-text {
    margin: 0;
    line-height: 1.5;
    white-space: pre-wrap;
}

.vm-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.vm-tag {
    background: color-mix(in srgb, var(--dp-h4) 14%, transparent);
    color: var(--dp-h2);
    font-size: 0.78em;
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--dp-h4) 40%, transparent);
}

.vm-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.vm-list-item {
    font-size: 0.88em;
    color: var(--dp-h2);
}

.vm-chip {
    display: inline-block;
    font-size: 0.78em;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dp-h4) 40%, transparent);
    background: color-mix(in srgb, var(--dp-h4) 14%, transparent);
    color: var(--dp-h2);
}

.vm-char {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88em;
    color: var(--dp-h2);
}

.vm-char-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.vm-char-role {
    color: color-mix(in srgb, var(--dp-h4) 60%, transparent);
    font-style: italic;
}

.vm-images {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.vm-thumb {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--dp-h4) 30%, transparent);
}

.vm-footer {
    flex-shrink: 0;
    padding: 10px 16px;
    border-top: 1px solid color-mix(in srgb, var(--dp-h4) 25%, transparent);
    display: flex;
    justify-content: flex-end;
}

.vm-edit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: color-mix(in srgb, var(--app-accent, #6366f1) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-accent, #6366f1) 35%, transparent);
    color: var(--app-accent-hover, #818cf8);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.85em;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;

    &:hover {
        background: color-mix(in srgb, var(--app-accent, #6366f1) 22%, transparent);
        border-color: color-mix(in srgb, var(--app-accent, #6366f1) 55%, transparent);
        color: var(--app-accent-hover, #a5b4fc);
    }
}
</style>

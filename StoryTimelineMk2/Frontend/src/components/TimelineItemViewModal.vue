<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { BackendAPI } from '@/bridge/api';
import type { ItemForEdit } from '@/types/models';

const props = defineProps<{
    itemId: string;
    timelineId: number;
}>();

const emit = defineEmits<{ close: [] }>();

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

function mediaUrl(fp: string) {
    return `https://media.app/${fp}`;
}
</script>

<template>
    <Teleport to="body">
        <div class="view-modal-backdrop" @click.self="emit('close')">
            <div class="view-modal" :style="{ '--item-color': data?.Item?.Color || '#64748b' }">
                <button class="vm-close" @click="emit('close')">✕</button>

                <div v-if="loading" class="vm-loading">Loading…</div>
                <template v-else-if="data">
                    <div class="vm-header">
                        <div class="vm-color-strip"></div>
                        <div class="vm-title-block">
                            <span class="vm-type-badge">{{ TYPE_NAMES[data.Item.TypeId] || 'Item' }}</span>
                            <h2 class="vm-title">{{ data.Item.Title || 'Untitled' }}</h2>
                        </div>
                    </div>

                    <div class="vm-body">
                        <div class="vm-section">
                            <span class="vm-label">Date</span>
                            <span class="vm-value">
                                Year {{ data.Item.Year }}
                                <template v-if="data.Item.EndYear && data.Item.EndYear !== data.Item.Year">
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
                                <span v-for="s in data.StoryRefs" :key="s.StoryId" class="vm-list-item">{{ s.StoryTitle }}</span>
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
                </template>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.view-modal-backdrop {
    position: fixed;
    inset: 0;
    background: #00000066;
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.view-modal {
    position: relative;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    width: 480px;
    max-width: 92vw;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 40px #00000088;
    color: #e2e8f0;
    font-family: sans-serif;
}

.vm-close {
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
    z-index: 2;
    &:hover { color: #fff; }
}

.vm-loading {
    padding: 32px;
    text-align: center;
    color: #64748b;
}

.vm-header {
    display: flex;
    align-items: stretch;
    border-radius: 10px 10px 0 0;
    overflow: hidden;
    border-bottom: 1px solid #334155;
    min-height: 64px;
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
    color: #94a3b8;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 1px 6px;
    align-self: flex-start;
}

.vm-title {
    margin: 0;
    font-size: 1.15em;
    font-weight: 600;
    color: #f1f5f9;
    word-break: break-word;
}

.vm-body {
    padding: 12px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    color: #64748b;
}

.vm-value {
    color: #cbd5e1;
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
    background: #334155;
    color: #94a3b8;
    font-size: 0.78em;
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid #475569;
}

.vm-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.vm-list-item {
    font-size: 0.88em;
    color: #cbd5e1;
}

.vm-char {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88em;
    color: #cbd5e1;
}

.vm-char-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.vm-char-role {
    color: #64748b;
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
    border: 1px solid #334155;
}
</style>

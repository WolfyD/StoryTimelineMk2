<script setup lang="ts">
/** BL-88: the items citing a story or a chapter, in the Archive. Each one jumps, edits or goes to the trash. */
import { PhCrosshair, PhPencilSimple, PhTrash } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import type { TimelineItem } from '@/types/models'

defineProps<{ items: TimelineItem[]; timelineId: number; when: (i: TimelineItem) => string }>()
const emit = defineEmits<{ jump: [TimelineItem]; trash: [TimelineItem] }>()
</script>

<template>
    <ul class="al-list">
        <li v-for="i in items" :key="i.Id">
            <span class="al-dot" :style="i.Color ? { background: i.Color } : undefined" />
            <button class="al-title" data-tip="Jump to it on the timeline" @click="emit('jump', i)">{{ i.Title || 'Untitled' }}</button>
            <span class="al-date">{{ when(i) }}</span>
            <button class="al-icon" aria-label="Jump to it" data-tip="Jump to it on the timeline" @click="emit('jump', i)"><PhCrosshair :size="16" /></button>
            <button class="al-icon" aria-label="Edit" data-tip="Edit" @click="BackendAPI.OpenAddEditItemWindow(timelineId, i.Id)"><PhPencilSimple :size="16" /></button>
            <button class="al-icon al-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="emit('trash', i)"><PhTrash :size="16" /></button>
        </li>
    </ul>
</template>

<style scoped lang="scss">
.al-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    user-select: none;

    li {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 3px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;

        &:hover {
            background: var(--app-bg-hover, #1e293b);

            .al-icon { opacity: 1; }
        }
    }
}

.al-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--app-text-dim, #64748b);
}

.al-title {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); text-decoration: underline; }
}

.al-date {
    flex: 0 0 auto;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--app-text-dim, #64748b);
}

.al-icon {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 2px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.14s, color 0.14s;

    &:focus-visible { opacity: 1; }
    &:hover { color: var(--app-accent-hover, #818cf8); }
    &--danger:hover { color: #f87171; }
}
</style>

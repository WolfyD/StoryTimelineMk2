<script setup lang="ts">
/**
 * BL-88: the Archive's MISC tab, in three parts. Loose ends lists what nothing uses and what is missing
 * something. Hidden ranges lists the stretches hidden from the canvas, each restorable. Sessions is the
 * work history, with prune and merge.
 */
import { computed, ref } from 'vue'
import {
    PhArrowCounterClockwise, PhBookOpenText, PhCaretRight, PhClockCounterClockwise, PhEyeSlash, PhImage, PhLinkBreak, PhTag, PhTrash, PhUser,
} from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import ArchiveItemLinks from '@/components/ArchiveItemLinks.vue'
import ArchiveSessions from '@/components/ArchiveSessions.vue'
import type { looseEnds, TrashEntry } from '@/utils/archiveItems'
import type { HiddenRange, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    loose: ReturnType<typeof looseEnds>
    when: (i: TimelineItem) => string
}>()
const emit = defineEmits<{
    jump: [TimelineItem]
    'trash-item': [TimelineItem]
    trash: [TrashEntry]
    story: [id: string]
    character: [id: string]
    error: [what: string, ex: unknown]
}>()

const store = useTimelineStore()
const PARTS = [
    { id: 'loose', label: 'Loose ends', icon: PhLinkBreak },
    { id: 'ranges', label: 'Hidden ranges', icon: PhEyeSlash },
    { id: 'sessions', label: 'Sessions', icon: PhClockCounterClockwise },
] as const
const part = ref<(typeof PARTS)[number]['id']>('loose')

// ── Loose ends ────────────────────────────────────────────────────────────────

/** Folded to start with: a timeline with no descriptions yet would open on a wall of rows. */
const opened = ref(new Set<string>())
const fold = (key: string) => { if (!opened.value.delete(key)) opened.value.add(key) }

const sections = computed(() => [
    { key: 'pictures', label: 'Pictures nothing shows', n: props.loose.pictures.length },
    { key: 'tags', label: 'Tags on nothing', n: props.loose.tags.length },
    { key: 'stories', label: 'Stories no item cites', n: props.loose.stories.length },
    { key: 'unborn', label: 'Characters with no birth', n: props.loose.unborn.length },
    { key: 'undescribed', label: 'Items with no description', n: props.loose.undescribed.length },
    { key: 'duplicates', label: 'Titles used more than once', n: props.loose.duplicates.length },
].filter(s => s.n))

// ── Hidden ranges ─────────────────────────────────────────────────────────────

async function restoreRange(r: HiddenRange) {
    try {
        await BackendAPI.DeleteHiddenRange(r.Id)
        store.setHiddenRanges(store.hiddenRanges.filter(x => x.Id !== r.Id))
    } catch (ex) {
        emit('error', 'Could not restore the range', ex)
    }
}
</script>

<template>
    <div class="am-root">
        <nav class="am-tabs" role="tablist" aria-orientation="vertical">
            <button
                v-for="p in PARTS"
                :key="p.id"
                role="tab"
                class="am-tab"
                :class="{ 'am-tab--active': part === p.id }"
                :aria-selected="part === p.id"
                @click="part = p.id"
            >
                <component :is="p.icon" :size="16" /> {{ p.label }}
                <span v-if="p.id === 'ranges'" class="ar-chip-count">{{ store.hiddenRanges.length }}</span>
            </button>
        </nav>

        <template v-if="part === 'loose'">
            <p v-if="!sections.length" class="ar-empty">No loose ends.</p>
            <div v-else class="ar-rows">
                <template v-for="s in sections" :key="s.key">
                    <!-- The list sits beside the header, not in it: .ar-section styles every button it holds. -->
                    <div class="ar-section">
                        <button :aria-expanded="opened.has(s.key)" @click="fold(s.key)">
                            <PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': opened.has(s.key) }" />
                            {{ s.label }} <span class="ar-chip-count">{{ s.n }}</span>
                        </button>
                    </div>

                    <template v-if="opened.has(s.key)">
                        <ul v-if="s.key === 'pictures'" class="am-list">
                            <li v-for="p in loose.pictures" :key="p.Id">
                                <PhImage :size="15" />
                                <span class="am-name">{{ p.Title || p.FileName }}</span>
                                <button class="am-icon am-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="emit('trash', { kind: 'picture', id: p.Id, title: p.Title || p.FileName, sub: 'unused' })"><PhTrash :size="16" /></button>
                            </li>
                        </ul>
                        <ul v-else-if="s.key === 'tags'" class="am-list">
                            <li v-for="t in loose.tags" :key="t.Id">
                                <PhTag :size="15" />
                                <span class="am-name">{{ t.Name }}</span>
                                <button class="am-icon am-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="emit('trash', { kind: 'tag', id: `tag:${t.Id}`, title: t.Name, sub: 'on 0 items' })"><PhTrash :size="16" /></button>
                            </li>
                        </ul>
                        <ul v-else-if="s.key === 'stories'" class="am-list">
                            <li v-for="st in loose.stories" :key="st.Id">
                                <PhBookOpenText :size="15" />
                                <button class="am-name am-link" data-tip="Open it in the Stories tab" @click="emit('story', st.Id)">{{ st.Title || 'Untitled' }}</button>
                                <button class="am-icon am-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="emit('trash', { kind: 'story', id: st.Id, title: st.Title || 'Untitled', sub: 'cited nowhere' })"><PhTrash :size="16" /></button>
                            </li>
                        </ul>
                        <ul v-else-if="s.key === 'unborn'" class="am-list">
                            <li v-for="c in loose.unborn" :key="c.Id">
                                <PhUser :size="15" />
                                <button class="am-name am-link" data-tip="Open them in the Characters tab" @click="emit('character', c.Id)">{{ c.Name }}</button>
                            </li>
                        </ul>
                        <ArchiveItemLinks
                            v-else-if="s.key === 'undescribed'"
                            :items="loose.undescribed" :timeline-id="timelineId" :when="when"
                            @jump="emit('jump', $event)" @trash="emit('trash-item', $event)"
                        />
                        <div v-else class="am-groups">
                            <div v-for="g in loose.duplicates" :key="g[0]!.Id">
                                <span class="am-group">“{{ g[0]!.Title.trim() }}”</span>
                                <ArchiveItemLinks :items="g" :timeline-id="timelineId" :when="when" @jump="emit('jump', $event)" @trash="emit('trash-item', $event)" />
                            </div>
                        </div>
                    </template>
                </template>
            </div>
        </template>

        <template v-else-if="part === 'ranges'">
            <p v-if="!store.hiddenRanges.length" class="ar-empty">Nothing is hidden. Hide a stretch of years from the timeline's Actions menu.</p>
            <ul v-else class="ar-rows">
                <li v-for="r in store.hiddenRanges" :key="r.Id" class="ar-row">
                    <div class="ar-row-head">
                        <PhEyeSlash :size="18" class="ar-row-icon" />
                        <span class="ar-row-name">{{ r.StartYear }} – {{ r.EndYear }}</span>
                        <span v-if="r.Label" class="ar-row-date">{{ r.Label }}</span>
                        <span class="ar-row-actions">
                            <button class="ar-btn ar-btn--small" data-tip="Show these years on the timeline again" @click="restoreRange(r)"><PhArrowCounterClockwise :size="15" /> Restore</button>
                        </span>
                    </div>
                </li>
            </ul>
        </template>

        <ArchiveSessions v-else :timeline-id="timelineId" @error="(what, ex) => emit('error', what, ex)" />
    </div>
</template>

<style scoped lang="scss">
.am-root {
    flex: 1;
    min-height: 0;
    display: flex;
}

// Tabs down the side, so they read as a second level under Misc and not as filters on its list.
.am-tabs {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 160px;
    padding: 10px 0;
    border-right: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.am-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px 8px 12px;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); background: var(--app-bg-hover, #1e293b); }

    &--active {
        color: var(--app-accent-hover, #818cf8);
        border-left-color: var(--app-accent, #6366f1);
        background: color-mix(in srgb, var(--app-accent, #6366f1) 12%, transparent);
    }

    .ar-chip-count { margin-left: auto; }
}

// Whichever part is open: each is one element.
.am-root > :not(.am-tabs) {
    flex: 1;
    min-width: 0;
}

// ArchiveItemLinks' look, for the rows that are not items.
.am-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;

    li {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 3px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;
        color: var(--app-text-muted, #94a3b8);

        &:hover {
            background: var(--app-bg-hover, #1e293b);

            .am-icon { opacity: 1; }
        }
    }
}

.am-name {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--app-text, #e2e8f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.am-link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); text-decoration: underline; }
}

.am-icon {
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
    &--danger:hover { color: #f87171; }
}

.am-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
}

.am-group {
    font-size: 0.78rem;
    font-weight: 600;
}
</style>

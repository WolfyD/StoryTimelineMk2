<script setup lang="ts">
/**
 * BL-88: the Archive's Characters tab — the cast as a list to look things up in, not to edit. A row folds
 * out to the items naming them, who they are to everybody else, and where they were. Editing happens in
 * the Characters and Relations windows, which a row opens.
 */
import { computed, nextTick, ref, type Component } from 'vue'
import { PhCaretRight, PhGraph, PhMagnifyingGlass, PhMapPin, PhPencilSimple, PhTreeStructure } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { mediaUrl } from '@/utils/mediaUrl'
import { lifespan } from '@/utils/characterItems'
import { relationLabel, relationOtherId, relationWhen } from '@/utils/characterRelations'
import { archiveCast, type CastSort, type TrashEntry } from '@/utils/archiveItems'
import { useMultiPick } from '@/composables/useMultiPick'
import ArchiveMultiSwitch from '@/components/ArchiveMultiSwitch.vue'
import ArchiveCastBar from '@/components/ArchiveCastBar.vue'
import type { CharacterItem, CharacterRelationship, LocationItem, RelationshipType, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    cast: CharacterItem[]
    /** Character id → this timeline's items naming them, earliest first. */
    refs: Map<string, TimelineItem[]>
    relations: CharacterRelationship[]
    types: RelationshipType[]
    /** Character id → place id → how many times they were there. */
    whereabouts: Map<string, Map<string, number>>
    /** The places not in the trash, by id. */
    places: Map<string, LocationItem>
    dateOf: (at: number) => string
    icons: Record<number, Component>
}>()
const emit = defineEmits<{
    open: [TimelineItem]
    place: [id: string]
    trash: [TrashEntry]
    /** A bulk edit wrote something: the cast and relations are the Archive's to reread. */
    saved: []
    error: [what: string, ex: unknown]
}>()

const SORTS: { id: CastSort; label: string }[] = [
    { id: 'name', label: 'Name' }, { id: 'refs', label: 'Appearances' }, { id: 'birth', label: 'Birth' },
]

const query = ref('')
const sort = ref<CastSort>('name')
const rows = computed(() => archiveCast(props.cast, props.refs, query.value, sort.value))

const byId = computed(() => new Map(props.cast.map(c => [c.Id, c])))
const typeById = computed(() => new Map(props.types.map(t => [t.Id, t])))
/** Character id → the relations they are in; each relation is listed from both ends. */
const ties = computed(() => {
    const m = new Map<string, CharacterRelationship[]>()
    for (const r of props.relations) {
        for (const id of [r.Character1Id, r.Character2Id]) m.set(id, [...(m.get(id) ?? []), r])
    }
    return m
})

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const meta = (c: CharacterItem) => [
    c.AbsoluteStart !== null ? `b. ${props.dateOf(c.AbsoluteStart)}` : '',
    c.AbsoluteEnd !== null ? `d. ${props.dateOf(c.AbsoluteEnd)}` : '',
    plural(props.refs.get(c.Id)?.length ?? 0, 'appearance'),
    c.Shared ? 'in every timeline' : '',
].filter(Boolean).join(' · ')

const label = (r: CharacterRelationship, c: CharacterItem) => relationLabel(r, c.Id, typeById.value.get(r.RelationshipType), c.Gender)
const nameOf = (id: string) => byId.value.get(id)?.Name || 'Someone else'
/** Where they were, most often first. A place in the trash is left out. */
const placesOf = (c: CharacterItem) =>
    [...(props.whereabouts.get(c.Id) ?? [])].filter(([id]) => props.places.has(id)).sort(([, a], [, b]) => b - a)

// ── The fold-out ──────────────────────────────────────────────────────────────

/** Read only, so nothing to guard: one row open at a time just keeps the list short. */
const openId = ref<string | null>(null)
const list = ref<HTMLElement | null>(null)

const toggle = (id: string) => { openId.value = openId.value === id ? null : id }

/** From a relation here or a person in the Places tab: fold them out and bring them into view. */
function open(id: string) {
    if (!rows.value.some(c => c.Id === id)) query.value = ''
    openId.value = id
    void nextTick(() => list.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' }))
}
defineExpose({ open })

function openWindow(what: string, go: Promise<unknown>) {
    go.catch(ex => emit('error', `Could not open the ${what} window`, ex))
}

// ── Edit multiple ─────────────────────────────────────────────────────────────

const { multi, picked, selection, allShown, pick, toggleAll, clear, drop } = useMultiPick(() => rows.value, c => c.Id)

/** Their birth and death items go with them, and their relations; a shared one leaves every timeline. */
function trashPicked() {
    for (const c of selection.value) {
        emit('trash', {
            kind: 'character', id: c.Id, title: c.Name || 'Unnamed',
            sub: [lifespan(c), c.Shared ? 'in every timeline' : ''].filter(Boolean).join(' · '),
        })
        drop(c.Id)
    }
}
</script>

<template>
    <div class="ac-root">
        <div class="ar-tools">
            <label class="ar-search">
                <PhMagnifyingGlass :size="15" />
                <input v-model="query" type="text" placeholder="Search characters…" />
            </label>
            <select v-model="sort" class="ar-sort" aria-label="Sort by" data-tip="Sort by">
                <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
            <ArchiveMultiSwitch v-model="multi" :all="allShown" :some="selection.length > 0" :empty="!rows.length" @all="toggleAll" />
        </div>

        <p v-if="!cast.length" class="ar-empty">No characters yet. Add them in the Characters window.</p>
        <p v-else-if="!rows.length" class="ar-empty">Nothing matches “{{ query }}”.</p>

        <ul v-else ref="list" class="ar-rows">
            <li v-for="c in rows" :key="c.Id" :data-id="c.Id" class="ar-row" :class="{ 'ar-row--picked': picked.has(c.Id) }">
                <div class="ar-row-head">
                    <input
                        v-if="multi"
                        type="checkbox"
                        class="ar-pick"
                        :checked="picked.has(c.Id)"
                        :aria-label="`Tick ${c.Name || 'Unnamed'}`"
                        data-tip="Tick to edit with others; shift-click ticks a run"
                        @click="pick(c, $event)"
                    />
                    <span class="ac-face" :style="c.Color ? { borderColor: c.Color } : undefined">
                        <img v-if="c.PortraitPath" :src="mediaUrl(c.PortraitPath)" alt="" loading="lazy" />
                        <template v-else>{{ (c.Name || '?').charAt(0) }}</template>
                    </span>
                    <span class="ar-text">
                        <span class="ar-name">
                            <button
                                class="ar-fold-btn"
                                :aria-expanded="openId === c.Id"
                                :aria-label="`${c.Name}, details`"
                                data-tip="Appearances, relations, places"
                                @click="toggle(c.Id)"
                            ><PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': openId === c.Id }" /></button>
                            <button
                                class="ar-row-title"
                                data-tip="Open their own timeline"
                                @click="BackendAPI.OpenCharacterTimeline(timelineId, c.Id)"
                            >{{ c.Name || 'Unnamed' }}</button>
                        </span>
                        <span class="ar-row-date">{{ meta(c) }}</span>
                    </span>
                    <span class="ar-row-actions">
                        <button
                            class="ar-icon"
                            aria-label="Relations"
                            data-tip="Open in the relations window"
                            @click="openWindow('relations', BackendAPI.OpenRelationsWindow(timelineId, c.Id))"
                        ><PhGraph :size="18" /></button>
                        <button
                            class="ar-icon"
                            aria-label="Family tree"
                            data-tip="Their family tree"
                            @click="openWindow('family tree', BackendAPI.OpenFamilyTreeWindow(timelineId, c.Id))"
                        ><PhTreeStructure :size="18" /></button>
                        <button
                            class="ar-icon"
                            aria-label="Edit"
                            data-tip="Edit in the Characters window"
                            @click="openWindow('Characters', BackendAPI.OpenCharactersWindow(timelineId, c.Id))"
                        ><PhPencilSimple :size="18" /></button>
                    </span>
                </div>

                <div v-if="openId === c.Id" class="ar-fold">
                    <div class="ap-field">
                        <span>Appears in</span>
                        <p v-if="!refs.get(c.Id)?.length" class="ap-derived">No item names them yet.</p>
                        <div v-else class="ap-chips">
                            <button
                                v-for="i in refs.get(c.Id)"
                                :key="i.Id"
                                class="ap-chip ap-chip--link"
                                data-tip="Jump to it on the timeline"
                                @click="emit('open', i)"
                            ><component :is="icons[i.TypeId]" :size="13" /> {{ i.Title || 'Untitled' }}</button>
                        </div>
                    </div>

                    <div class="ap-field">
                        <span>Relations</span>
                        <p v-if="!ties.get(c.Id)?.length" class="ap-derived">None yet.</p>
                        <ul v-else class="ac-ties">
                            <li v-for="r in ties.get(c.Id)" :key="r.Id">
                                {{ label(r, c) }}
                                <button class="ac-who" data-tip="Show them here" @click="open(relationOtherId(r, c.Id))">{{ nameOf(relationOtherId(r, c.Id)) }}</button>
                                <span v-if="relationWhen(r)" class="ap-picks">{{ relationWhen(r) }}</span>
                            </li>
                        </ul>
                    </div>

                    <div class="ap-field">
                        <span>Was at</span>
                        <p v-if="!placesOf(c).length" class="ap-derived">No place on a map yet — only events they were present at count.</p>
                        <div v-else class="ap-chips">
                            <button
                                v-for="[id, n] in placesOf(c)"
                                :key="id"
                                class="ap-chip ap-chip--link"
                                data-tip="Show it in the Places tab"
                                @click="emit('place', id)"
                            ><PhMapPin :size="13" /> {{ places.get(id)!.Name || 'Unnamed place' }}<span v-if="n > 1" class="ar-chip-count">×{{ n }}</span></button>
                        </div>
                    </div>
                </div>
            </li>
        </ul>

        <ArchiveCastBar
            v-if="selection.length"
            :timeline-id="timelineId"
            :characters="selection"
            :cast="cast"
            :types="types"
            @trash="trashPicked"
            @clear="clear"
            @saved="emit('saved')"
        />
    </div>
</template>

<style scoped lang="scss">
.ac-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.ac-face {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 2px solid var(--app-border, #2d3a56);
    background: var(--app-bg-soft, #1e293b);
    overflow: hidden;
    font-weight: 600;
    color: var(--app-text-muted, #94a3b8);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.ac-ties {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.8rem;
    color: var(--app-text-muted, #94a3b8);
}

.ac-who {
    padding: 0;
    border: none;
    background: none;
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-weight: 600;
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); text-decoration: underline; }
}
</style>

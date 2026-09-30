<script setup lang="ts">
/**
 * BL-88: the Archive's Places tab — the map window's tree, where a top-level map is a place too and a
 * place that opens into a map stands in for it, that map's places under it. A row folds out to what
 * happened there and who was there, the maps inside it counted in; the map is where a place is edited.
 */
import { computed, nextTick, ref, type Component } from 'vue'
import { PhCaretRight, PhMagnifyingGlass, PhMapPin, PhMapTrifold, PhTrash, PhUser } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { flattenMapTree, placesUnder, pruneMapTree, rowHasChildren, type MapTreeRow } from '@/utils/mapTree'
import type { TrashEntry } from '@/utils/archiveItems'
import { useMultiPick } from '@/composables/useMultiPick'
import ArchiveMultiSwitch from '@/components/ArchiveMultiSwitch.vue'
import ArchivePlaceBar from '@/components/ArchivePlaceBar.vue'
import type { CharacterItem, MapItem, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** This timeline's maps, the maps and places in the trash left out. */
    maps: MapItem[]
    /** Place id → this timeline's items there, earliest first. */
    refs: Map<string, TimelineItem[]>
    /** Place id → character id → how many times they were there. */
    whereabouts: Map<string, Map<string, number>>
    cast: Map<string, CharacterItem>
    icons: Record<number, Component>
}>()
const emit = defineEmits<{
    open: [TimelineItem]
    character: [id: string]
    trash: [TrashEntry]
    /** A bulk edit wrote something: the maps are the Archive's to reread. */
    saved: []
    error: [what: string, ex: unknown]
}>()

const mapById = computed(() => new Map(props.maps.map(m => [m.Id, m])))
const mapName = (m: MapItem) => m.Name || 'Unnamed map'

/** Rows folded shut, by tree key. ponytail: for as long as the window is open, like the Media tab's sections. */
const folded = ref(new Set<string>())
function fold(key: string) {
    const next = new Set(folded.value)
    if (!next.delete(key)) next.add(key)
    folded.value = next
}

const query = ref('')
const searching = computed(() => !!query.value.trim())
const rows = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return flattenMapTree(props.maps, folded.value)
    const has = (...fields: (string | null | undefined)[]) => fields.some(f => f?.toLowerCase().includes(needle))
    // A door answers to the name of the map behind it too: Baldur's Gate City is the Baldur's Gate pin.
    return pruneMapTree(props.maps,
        l => has(l.Name, l.Description, l.ChildMapId && mapById.value.get(l.ChildMapId)?.Name),
        m => has(m.Name, m.Description))
})

// ── What happened where, the maps inside counted in ───────────────────────────

const under = computed(() => new Map(props.maps.map(m => [m.Id, placesUnder(props.maps, m.Id)])))
/** A map's places are all of them; a door's are itself and everything behind it. */
const placesOf = (r: MapTreeRow) => r.loc
    ? [r.loc.Id, ...(r.childMap ? under.value.get(r.childMap.Id) ?? [] : [])]
    : under.value.get(r.map.Id) ?? []

/** Row key → its items, earliest first, and who was there, most often first. */
const info = computed(() => new Map(rows.value.map(r => {
    const items = new Map<string, TimelineItem>()
    const who = new Map<string, number>()
    for (const id of placesOf(r)) {
        for (const i of props.refs.get(id) ?? []) items.set(i.Id, i)
        for (const [c, n] of props.whereabouts.get(id) ?? []) who.set(c, (who.get(c) ?? 0) + n)
    }
    return [r.key, {
        items: [...items.values()].sort((a, b) => a.AbsoluteStart - b.AbsoluteStart),
        who: [...who].sort(([, a], [, b]) => b - a),
    }]
})))

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const meta = (r: MapTreeRow) => [
    !r.loc && plural(r.map.Locations.length, 'place'),
    plural(info.value.get(r.key)!.items.length, 'item'),
    plural(info.value.get(r.key)!.who.length, 'character'),
    r.childMap && `opens into ${mapName(r.childMap)}`,
].filter(Boolean).join(' · ')

// ── The fold-out ──────────────────────────────────────────────────────────────

/** A row key, not a place id: a map hanging off two doors lists its places twice. */
const openId = ref<string | null>(null)
const list = ref<HTMLElement | null>(null)

const toggle = (key: string) => { openId.value = openId.value === key ? null : key }

/** From a place in the Characters tab: open the branches down to it, fold it out, bring it into view. */
function open(id: string) {
    const key = flattenMapTree(props.maps).find(r => r.loc?.Id === id)?.key
    if (!key) return
    if (!rows.value.some(r => r.key === key)) query.value = ''
    // A key is the path down, `root/place/place`: every shorter path is a row above it.
    const parts = key.split('/')
    const above = parts.slice(0, -1).map((_, n) => parts.slice(0, n + 1).join('/'))
    folded.value = new Set([...folded.value].filter(k => !above.includes(k)))
    openId.value = key
    void nextTick(() => list.value?.querySelector(`[data-key="${key}"]`)?.scrollIntoView?.({ block: 'nearest' }))
}
defineExpose({ open })

function openMap(mapId: string, locationId?: string) {
    BackendAPI.OpenMapWindow(props.timelineId, mapId, locationId).catch(ex => emit('error', 'Could not open the map window', ex))
}

function toTrash(r: MapTreeRow) {
    if (openId.value === r.key) openId.value = null
    emit('trash', r.loc
        ? { kind: 'place', id: r.loc.Id, title: r.loc.Name || 'Unnamed place', sub: mapName(r.map) }
        // The maps behind its doors stay, and move up to the top of the list.
        : { kind: 'map', id: r.map.Id, title: mapName(r.map), sub: `with ${plural(r.map.Locations.length, 'place')}` })
}

// ── Edit multiple ─────────────────────────────────────────────────────────────

/** By place or map, not row: a place listed under two doors is one tick. */
const keyOf = (r: MapTreeRow) => r.loc?.Id ?? r.map.Id
const { multi, picked, selection, allShown, pick, toggleAll, clear, drop } = useMultiPick(() => rows.value, keyOf)

function trashPicked() {
    for (const r of selection.value) {
        toTrash(r)
        drop(keyOf(r))
    }
}
</script>

<template>
    <div class="apl-root">
        <div class="ar-tools">
            <label class="ar-search">
                <PhMagnifyingGlass :size="15" />
                <input v-model="query" type="text" placeholder="Search places…" />
            </label>
            <ArchiveMultiSwitch v-model="multi" :all="allShown" :some="selection.length > 0" :empty="!rows.length" @all="toggleAll" />
        </div>

        <p v-if="!maps.length" class="ar-empty">No maps yet. Add one in the Map window.</p>
        <p v-else-if="searching && !rows.length" class="ar-empty">Nothing matches “{{ query }}”.</p>

        <!-- A search opens every branch it keeps, so there is nothing to fold then: the map window's rule. -->
        <ul v-else ref="list" class="ar-rows">
            <li
                v-for="r in rows"
                :key="r.key"
                :data-key="r.key"
                class="ar-row"
                :class="{ 'ar-row--picked': picked.has(keyOf(r)) }"
                :style="{ marginLeft: `${r.depth * 20}px` }"
            >
                <div class="ar-row-head">
                    <input
                        v-if="multi"
                        type="checkbox"
                        class="ar-pick"
                        :checked="picked.has(keyOf(r))"
                        :aria-label="`Tick ${r.loc?.Name || mapName(r.map)}`"
                        data-tip="Tick to edit with others; shift-click ticks a run"
                        @click="pick(r, $event)"
                    />
                    <button
                        v-if="!searching && rowHasChildren(r)"
                        class="ar-fold-btn"
                        :aria-expanded="!folded.has(r.key)"
                        :aria-label="folded.has(r.key) ? 'Show what is inside' : 'Hide what is inside'"
                        :data-tip="folded.has(r.key) ? 'Show what is inside' : 'Hide what is inside'"
                        @click="fold(r.key)"
                    ><PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': !folded.has(r.key) }" /></button>
                    <span v-else class="apl-gap" />
                    <PhMapPin v-if="r.loc" :size="18" weight="fill" class="ar-row-icon" :style="r.loc.Color ? { color: r.loc.Color } : undefined" />
                    <PhMapTrifold v-else :size="18" class="ar-row-icon" />
                    <span class="ar-text">
                        <span class="ar-name">
                            <button
                                class="ar-fold-btn"
                                :aria-expanded="openId === r.key"
                                :aria-label="`${r.loc?.Name ?? mapName(r.map)}, details`"
                                data-tip="What happened here, who was here"
                                @click="toggle(r.key)"
                            ><PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': openId === r.key }" /></button>
                            <button class="ar-row-title" :data-tip="r.loc ? 'Show it on the map' : 'Open the map'" @click="openMap(r.map.Id, r.loc?.Id)">
                                {{ r.loc ? r.loc.Name || 'Unnamed place' : mapName(r.map) }}
                            </button>
                        </span>
                        <span class="ar-row-date">{{ meta(r) }}</span>
                    </span>
                    <span class="ar-row-actions">
                        <button
                            class="ar-icon ar-icon--danger"
                            aria-label="Move to the trash"
                            :data-tip="r.loc ? 'Move to the trash' : 'Move to the trash, with the places pinned on it'"
                            @click="toTrash(r)"
                        ><PhTrash :size="18" /></button>
                    </span>
                </div>

                <div v-if="openId === r.key" class="ar-fold">
                    <p v-if="(r.loc ?? r.map).Description" class="ap-derived">{{ (r.loc ?? r.map).Description }}</p>

                    <div class="ap-field">
                        <span>What happened here</span>
                        <p v-if="!info.get(r.key)!.items.length" class="ap-derived">No item is set here yet.</p>
                        <div v-else class="ap-chips">
                            <button
                                v-for="i in info.get(r.key)!.items"
                                :key="i.Id"
                                class="ap-chip ap-chip--link"
                                data-tip="Jump to it on the timeline"
                                @click="emit('open', i)"
                            ><component :is="icons[i.TypeId]" :size="13" /> {{ i.Title || 'Untitled' }}</button>
                        </div>
                    </div>

                    <div class="ap-field">
                        <span>Who was here</span>
                        <p v-if="!info.get(r.key)!.who.length" class="ap-derived">Nobody yet — only characters present at an item here count.</p>
                        <div v-else class="ap-chips">
                            <button
                                v-for="[id, n] in info.get(r.key)!.who"
                                :key="id"
                                class="ap-chip ap-chip--link"
                                data-tip="Show them in the Characters tab"
                                @click="emit('character', id)"
                            ><PhUser :size="13" /> {{ cast.get(id)?.Name || 'Someone' }}<span v-if="n > 1" class="ar-chip-count">×{{ n }}</span></button>
                        </div>
                    </div>

                    <div v-if="r.childMap" class="ap-field">
                        <span>Opens into</span>
                        <div class="ap-chips">
                            <button class="ap-chip ap-chip--link" data-tip="Open that map" @click="openMap(r.childMap.Id)">
                                <PhMapTrifold :size="13" /> {{ mapName(r.childMap) }}
                            </button>
                        </div>
                    </div>
                </div>
            </li>
        </ul>

        <ArchivePlaceBar
            v-if="selection.length"
            :timeline-id="timelineId"
            :rows="selection"
            :maps="maps"
            @trash="trashPicked"
            @clear="clear"
            @saved="emit('saved')"
        />
    </div>
</template>

<style scoped lang="scss">
.apl-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

// As wide as the fold caret, so every row's icon sits in one column.
.apl-gap {
    flex: 0 0 16px;
}

// Past the fold caret, the 18px icon and their gaps: the fold-out lines up with the name.
.ar-fold { margin-left: 48px; }
</style>

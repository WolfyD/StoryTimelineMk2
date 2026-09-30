<script setup lang="ts">
/**
 * BL-88: the Archive's Media tab — the picture library as this timeline sees it, in three sections by
 * what the timeline uses each one as. A row folds out to rename or describe the picture and to see what
 * shows it. A delete goes to the Archive's trash, asking first when anything still shows it.
 */
import { computed, ref, watch, type Component } from 'vue'
import { PhCaretRight, PhFloppyDisk, PhImage, PhMagnifyingGlass, PhMapTrifold, PhTrash, PhUser } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { mediaUrl } from '@/utils/mediaUrl'
import { useLightbox } from '@/composables/useLightbox'
import { archiveMedia, fileSize, fileType, mediaSection, type MediaSection, type MediaSort, type TrashEntry } from '@/utils/archiveItems'
import { useMultiPick } from '@/composables/useMultiPick'
import ArchiveMediaBar from '@/components/ArchiveMediaBar.vue'
import ArchiveMultiSwitch from '@/components/ArchiveMultiSwitch.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LightboxOverlay from '@/components/LightboxOverlay.vue'
import type { MediaItem, MediaUse, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** This timeline's pictures and the unused ones, the trashed left out. */
    media: MediaItem[]
    /** This timeline's items not in the trash, by id — an item use opens from here. */
    items: Map<string, TimelineItem>
    /** The Items tab's icons, by TypeId. */
    icons: Record<number, Component>
    /** An item's date as the Items tab writes it. */
    when: (i: TimelineItem) => string
}>()
const emit = defineEmits<{
    open: [TimelineItem]
    trash: [TrashEntry]
    saved: []
    error: [what: string, ex: unknown]
}>()

const SECTIONS: { id: MediaSection; label: string; icon: Component }[] = [
    { id: 'images', label: 'Images', icon: PhImage },
    { id: 'maps', label: 'Maps', icon: PhMapTrifold },
    { id: 'portraits', label: 'Portraits', icon: PhUser },
]
const SORTS: { id: MediaSort; label: string }[] = [
    { id: 'added', label: 'Date added' }, { id: 'usage', label: 'Usage' }, { id: 'size', label: 'Size' },
]

const type = ref('')
const sort = ref<MediaSort>('added')
const query = ref('')

/** [file type, count], for the chips. */
const types = computed(() => {
    const n = new Map<string, number>()
    for (const p of props.media) n.set(fileType(p), (n.get(fileType(p)) ?? 0) + 1)
    return [...n].sort(([a], [b]) => a.localeCompare(b))
})
// The last picture of a type going to the trash takes its chip with it, and the filter too.
watch(types, t => { if (type.value && !t.some(([k]) => k === type.value)) type.value = '' })

const rows = computed(() => archiveMedia(props.media, type.value, query.value, sort.value))
const sections = computed(() =>
    SECTIONS.map(s => ({ ...s, rows: rows.value.filter(p => mediaSection(p) === s.id) })).filter(s => s.rows.length))

/** Sections folded away. ponytail: for as long as the window is open; localStorage if it should stick. */
const folded = ref(new Set<MediaSection>())
const fold = (id: MediaSection) => folded.value.has(id) ? folded.value.delete(id) : folded.value.add(id)

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const name = (p: MediaItem) => p.Title || p.FileName || 'Untitled'
const usage = (p: MediaItem) => p.Uses?.length ? plural(p.Uses.length, 'use') : 'unused'
const meta = (p: MediaItem) =>
    [fileType(p).toUpperCase(), fileSize(p.FileSize), p.Width && p.Height ? `${p.Width}×${p.Height}` : '', usage(p)]
        .filter(Boolean).join(' · ')

const here = (p: MediaItem) => (p.Uses ?? []).filter(u => u.Here)
const elsewhere = (p: MediaItem) => (p.Uses ?? []).filter(u => !u.Here).length
const USE_ICONS: Record<Exclude<MediaUse['Kind'], 'item'>, Component> = { map: PhMapTrifold, portrait: PhUser }
const useIcon = (u: MediaUse) => u.Kind === 'item' ? props.icons[u.TypeId ?? 1] ?? PhImage : USE_ICONS[u.Kind]

// ── Full size ─────────────────────────────────────────────────────────────────

const { lightboxSrc, lightboxCollection, lightboxIndex, openLightbox, closeLightbox, lightboxPrev, lightboxNext, onLbBeforeEnter, onLbEnter, onLbBeforeLeave, onLbLeave } = useLightbox()

/** The list as shown, section by section, the folded ones skipped. */
const shown = computed(() => sections.value.filter(s => !folded.value.has(s.id)).flatMap(s => s.rows))

/** The arrows step through the list as shown. */
function view(e: MouseEvent, p: MediaItem) {
    openLightbox(e, mediaUrl(p.FilePath), shown.value.map(r => mediaUrl(r.FilePath)))
}

// ── The fold-out ──────────────────────────────────────────────────────────────

/** The open row's name and description. One row at a time, so one draft. */
const draft = ref<{ Id: string; Title: string; Description: string } | null>(null)
let clean = ''
const snap = () => JSON.stringify(draft.value)
const isDirty = () => !!draft.value && snap() !== clean
/** What to do once the writer agrees to drop the open row's changes. */
const pending = ref<(() => void) | null>(null)
const saving = ref(false)
defineExpose({ isDirty })

function guard(go: () => void) {
    if (isDirty()) pending.value = go
    else go()
}

function discard() {
    const go = pending.value!
    pending.value = null
    go()
}

function toggle(p: MediaItem) {
    guard(() => {
        draft.value = draft.value?.Id === p.Id ? null : { Id: p.Id, Title: p.Title ?? '', Description: p.Description ?? '' }
        clean = snap()
    })
}

watch(() => props.media, list => {
    if (draft.value && !list.some(p => p.Id === draft.value!.Id)) draft.value = null
})

async function save() {
    const d = draft.value
    if (!d) return
    saving.value = true
    // Taken before the wait, so a keystroke that lands during the save still counts as unsaved.
    const sent = snap()
    try {
        const r = await BackendAPI.SavePictureInfo(d.Id, d.Title.trim(), d.Description.trim())
        if (r?.status !== 'ok') throw new Error('The picture was not saved.')
        // Another row opened during the wait has its own clean state.
        if (draft.value === d) clean = sent
        emit('saved')
    } catch (ex) {
        emit('error', 'Could not save the picture', ex)
    } finally {
        saving.value = false
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

/** The picture whose uses are being listed before it goes to the trash. */
const asking = ref<MediaItem | null>(null)

function remove(p: MediaItem) {
    if (p.Uses?.length) asking.value = p
    else toTrash(p)
}

function toTrash(p: MediaItem) {
    asking.value = null
    if (draft.value?.Id === p.Id) draft.value = null
    emit('trash', { kind: 'picture', id: p.Id, title: name(p), sub: usage(p) })
}

// ── Edit multiple ─────────────────────────────────────────────────────────────

const { multi, picked, selection, allShown, pick, toggleAll, clear, drop } = useMultiPick(() => shown.value, p => p.Id)

/** The ticked pictures something still shows, listed before they go — the one-row delete's question, once. */
const askingMany = ref<MediaItem[] | null>(null)

function trashPicked(sure = false) {
    const used = selection.value.filter(p => p.Uses?.length)
    if (used.length && !sure) {
        askingMany.value = used
        return
    }
    askingMany.value = null
    for (const p of selection.value) {
        toTrash(p)
        drop(p.Id)
    }
}
</script>

<template>
    <div class="am-root">
        <div class="ar-tools">
            <div class="ar-chips">
                <button class="ar-chip" :class="{ 'ar-chip--on': !type }" @click="type = ''">
                    All <span class="ar-chip-count">{{ media.length }}</span>
                </button>
                <button
                    v-for="[t, n] in types"
                    :key="t"
                    class="ar-chip"
                    :class="{ 'ar-chip--on': type === t }"
                    @click="type = t"
                >{{ t.toUpperCase() }} <span class="ar-chip-count">{{ n }}</span></button>
            </div>
            <select v-model="sort" class="ar-sort" aria-label="Sort by" data-tip="Sort by">
                <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
        </div>

        <div class="ar-tools">
            <label class="ar-search">
                <PhMagnifyingGlass :size="15" />
                <input v-model="query" type="text" placeholder="Search pictures…" />
            </label>
            <ArchiveMultiSwitch v-model="multi" :all="allShown" :some="selection.length > 0" :empty="!shown.length" @all="toggleAll" />
        </div>
        <p class="am-shared">Pictures belong to every timeline. Listed: the ones this timeline shows, and any nothing shows yet.</p>

        <p v-if="!media.length" class="ar-empty">No pictures yet. Add one to an item, a map or a character.</p>
        <p v-else-if="!sections.length" class="ar-empty">{{ query ? `Nothing matches “${query}”.` : 'Nothing of this type.' }}</p>

        <ul v-else class="ar-rows">
            <template v-for="s in sections" :key="s.id">
                <li class="ar-section">
                    <button :aria-expanded="!folded.has(s.id)" @click="fold(s.id)">
                        <PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': !folded.has(s.id) }" />
                        <component :is="s.icon" :size="15" /> {{ s.label }} <span class="ar-chip-count">{{ s.rows.length }}</span>
                    </button>
                </li>
                <li v-for="p in s.rows" v-show="!folded.has(s.id)" :key="p.Id" class="ar-row" :class="{ 'ar-row--picked': picked.has(p.Id) }">
                    <div class="ar-row-head">
                        <input
                            v-if="multi"
                            type="checkbox"
                            class="ar-pick"
                            :checked="picked.has(p.Id)"
                            :aria-label="`Tick ${name(p)}`"
                            data-tip="Tick to edit with others; shift-click ticks a run"
                            @click="pick(p, $event)"
                        />
                        <button class="am-thumb" :aria-label="`${name(p)}, full size`" data-tip="View full size" @click="view($event, p)">
                            <img :src="mediaUrl(p.ThumbPath)" alt="" loading="lazy" />
                        </button>
                        <span class="ar-text">
                            <button class="ar-row-title" :aria-expanded="draft?.Id === p.Id" @click="toggle(p)">
                                <PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': draft?.Id === p.Id }" /> {{ name(p) }}
                            </button>
                            <span class="ar-row-date">{{ meta(p) }}</span>
                        </span>
                        <span class="ar-row-actions">
                            <button class="ar-icon ar-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="remove(p)"><PhTrash :size="18" /></button>
                        </span>
                    </div>

                    <div v-if="draft?.Id === p.Id" class="ar-fold">
                        <label class="ap-field">
                            <span>Name</span>
                            <input v-model="draft.Title" type="text" :placeholder="p.FileName" />
                        </label>
                        <label class="ap-field">
                            <span>Description</span>
                            <textarea v-model="draft.Description" rows="2" />
                        </label>
                        <div class="ap-field">
                            <span>Used by</span>
                            <p v-if="!p.Uses?.length" class="ap-derived">Nothing — no item, map or portrait shows it.</p>
                            <div v-else class="ap-chips">
                                <template v-for="u in here(p)" :key="u.Kind + u.Id">
                                    <button
                                        v-if="items.get(u.Id)"
                                        class="ap-chip ap-chip--link"
                                        data-tip="Jump to it on the timeline"
                                        @click="emit('open', items.get(u.Id)!)"
                                    ><component :is="useIcon(u)" :size="13" /> {{ u.Name || 'Untitled' }}</button>
                                    <span v-else class="ap-chip am-chip"><component :is="useIcon(u)" :size="13" /> {{ u.Name || 'Untitled' }}</span>
                                </template>
                                <span v-if="elsewhere(p)" class="ap-picks">{{ here(p).length ? 'and ' : '' }}{{ plural(elsewhere(p), 'use') }} in other timelines</span>
                            </div>
                        </div>
                        <button class="ap-btn ap-btn--primary ap-btn--small am-save" :disabled="saving" @click="save">
                            <PhFloppyDisk :size="14" /> {{ saving ? 'Saving…' : 'Save' }}
                        </button>
                    </div>
                </li>
            </template>
        </ul>

        <ArchiveMediaBar
            v-if="selection.length"
            :timeline-id="timelineId"
            :pictures="selection"
            :items="items"
            :when="when"
            @trash="trashPicked()"
            @clear="clear"
            @saved="emit('saved')"
        />

        <ConfirmModal
            v-if="askingMany"
            :title="`Delete ${selection.length === 1 ? name(selection[0]!) : `${selection.length} pictures`}?`"
            message="They go to the trash, and are deleted when the Archive closes. These are still shown somewhere, and everything showing them loses them, other timelines included."
            confirm-label="Move to the trash" cancel-label="Keep them" danger
            @confirm="trashPicked(true)" @cancel="askingMany = null"
        >
            <ul class="ar-trash-list">
                <li v-for="p in askingMany" :key="p.Id">
                    <PhImage :size="15" />
                    {{ name(p) }} <span>{{ usage(p) }}{{ elsewhere(p) ? `, ${elsewhere(p)} in other timelines` : '' }}</span>
                </li>
            </ul>
        </ConfirmModal>
        <ConfirmModal
            v-if="asking"
            :title="`Delete ${name(asking)}?`"
            :message="`It goes to the trash, and is deleted when the Archive closes. Everything below loses it${elsewhere(asking) ? ', other timelines included' : ''}.`"
            confirm-label="Move to the trash" cancel-label="Keep it" danger
            @confirm="toTrash(asking)" @cancel="asking = null"
        >
            <ul class="ar-trash-list">
                <li v-for="u in asking.Uses" :key="u.Kind + u.Id">
                    <component :is="useIcon(u)" :size="15" />
                    {{ u.Name || 'Untitled' }} <span>{{ u.Here ? u.Kind : `${u.Kind}, another timeline` }}</span>
                </li>
            </ul>
        </ConfirmModal>
        <ConfirmModal
            v-if="pending"
            title="Discard changes?"
            message="The picture you have open has unsaved changes."
            confirm-label="Discard" cancel-label="Keep editing" danger
            @confirm="discard" @cancel="pending = null"
        />

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
.am-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.am-shared {
    margin: 6px 12px 0;
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.am-thumb {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg-soft, #1e293b);
    overflow: hidden;
    cursor: zoom-in;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    &:hover { border-color: var(--app-accent, #6366f1); }
}

.am-chip { padding: 2px 8px; }
.am-save { align-self: flex-start; }
</style>

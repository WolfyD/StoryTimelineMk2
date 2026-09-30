<script setup lang="ts">
/**
 * BL-88: the Archive — what a timeline holds, as lists, in a window that stays open beside it.
 * Phase 1 is the Items tab, phase 2 Stories and Books, phase 3 Media, phase 4 Characters and Places,
 * phase 5 Tags and Notes, phase 7 the MISC tab and the Items tab's bulk edit.
 *
 * A delete here is two steps. The row goes to the session trash, where it can be restored for as long
 * as the window is open, and the deletes happen when it closes, all confirmed in one dialog. The host
 * asks before closing (CloseRequested). The timeline closing under it drops the trash unasked: nothing
 * in it has been deleted yet, so nothing is lost.
 */
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import {
    PhArrowCounterClockwise, PhBookmarkSimple, PhBookOpenText, PhBooks, PhBroom, PhCalendar, PhCalendarBlank, PhCrosshair,
    PhEye, PhFlag, PhHourglass, PhImage, PhListBullets, PhListNumbers, PhMagnifyingGlass, PhMapPin, PhMapTrifold, PhNote, PhNotepad,
    PhPencilSimple, PhPlus, PhTag, PhTrash, PhUser, PhUsersThree,
} from '@phosphor-icons/vue'
import { BackendAPI, IS_BROWSER_HOST, logError } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { useAppTheme } from '@/utils/useAppTheme'
import { dayOfYearAt } from '@/utils/timelineLayout'
import { buildGeneratedItem, planGeneratedItems } from '@/utils/characterItems'
import { useMultiPick } from '@/composables/useMultiPick'
import { archiveBooks, archiveRows, archiveStories, looseEnds, whereabouts, type ArchiveSort, type TrashEntry } from '@/utils/archiveItems'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import HoverTip from '@/components/HoverTip.vue'
import ArchiveStoriesTab from '@/components/ArchiveStoriesTab.vue'
import ArchiveBooksTab from '@/components/ArchiveBooksTab.vue'
import ArchiveMediaTab from '@/components/ArchiveMediaTab.vue'
import ArchiveCharactersTab from '@/components/ArchiveCharactersTab.vue'
import ArchivePlacesTab from '@/components/ArchivePlacesTab.vue'
import ArchiveTagsTab from '@/components/ArchiveTagsTab.vue'
import ArchiveNotesTab from '@/components/ArchiveNotesTab.vue'
import ArchiveMiscTab from '@/components/ArchiveMiscTab.vue'
import ArchiveBulkBar from '@/components/ArchiveBulkBar.vue'
import ArchiveMultiSwitch from '@/components/ArchiveMultiSwitch.vue'
import type {
    Book, CharacterItem, CharacterRelationship, LocationItem, MapEvent, MapItem, MediaItem, RelationshipType, Story, TimelineItem,
} from '@/types/models'

useAppTheme()
const store = useTimelineStore()
const timelineId = parseInt(new URLSearchParams(location.search).get('timelineId') ?? '0', 10)

const loading = ref(true)
const error = ref('')

/** Shown in the banner, so logged without the alert. */
function failed(what: string, ex: unknown) {
    error.value = `${what}: ${ex instanceof Error ? ex.message : String(ex)}`
    void logError(`ArchiveApp: ${what}`, ex)
}

/** By TypeId. The start and end markers have no chip of their own: they show under All. */
const ICONS: Record<number, Component> = {
    1: PhCalendarBlank, 2: PhCalendar, 3: PhHourglass, 4: PhImage, 5: PhNote, 6: PhBookmarkSimple, 7: PhUser, 8: PhFlag, 9: PhFlag,
}
const CHIPS = [
    { id: 0, label: 'All' }, { id: 1, label: 'Events' }, { id: 2, label: 'Periods' }, { id: 3, label: 'Ages' },
    { id: 4, label: 'Pictures' }, { id: 5, label: 'Notes' }, { id: 6, label: 'Bookmarks' }, { id: 7, label: 'Characters' },
]
const SORTS: { id: ArchiveSort; label: string }[] = [
    { id: 'date', label: 'Date' }, { id: 'length', label: 'Length' }, { id: 'name', label: 'Name' },
    { id: 'importance', label: 'Importance' }, { id: 'added', label: 'Date added' },
]

const KIND_ICONS: Record<Exclude<TrashEntry['kind'], 'item'>, Component> = {
    story: PhBookOpenText, book: PhBooks, chapter: PhListNumbers, picture: PhImage, place: PhMapPin, map: PhMapTrifold,
    tag: PhTag, note: PhNotepad, character: PhUser,
}
const kindIcon = (e: TrashEntry) => e.kind === 'item' ? ICONS[e.typeId ?? 1] ?? PhCalendarBlank : KIND_ICONS[e.kind]
const KIND_NAMES: Record<TrashEntry['kind'], [string, string]> = {
    item: ['item', 'items'], story: ['story', 'stories'], book: ['book', 'books'], chapter: ['chapter', 'chapters'],
    picture: ['picture', 'pictures'], place: ['place', 'places'], map: ['map', 'maps'], tag: ['tag', 'tags'], note: ['note', 'notes'],
    character: ['character', 'characters'],
}

const tab = ref<'items' | 'stories' | 'books' | 'characters' | 'places' | 'media' | 'tags' | 'notes' | 'misc' | 'trash'>('items')
const type = ref(0)
const sort = ref<ArchiveSort>('date')
const query = ref('')
const trash = ref<TrashEntry[]>([])
const trashed = computed(() => new Set(trash.value.map(e => e.id)))

/**
 * The birth and death items of characters with *Show on timeline* off. The backend leaves them out of
 * every item read, so they are rebuilt from the character: a title and a date are all a row needs.
 * From `cast`, which every item save rereads, so a switch flipped in the character window shows here.
 */
const hiddenEvents = computed(() => liveCast.value
    .filter(c => !c.ShowOnTimeline && c.TimelineId === timelineId)
    .flatMap(c => [
        ...(c.BirthItemId && c.BirthYear !== null ? [buildGeneratedItem('Birth', c, c.BirthItemId)] : []),
        ...(c.DeathItemId && c.DeathYear !== null ? [buildGeneratedItem('Death', c, c.DeathItemId)] : []),
    ]))
const hiddenIds = computed(() => new Set(hiddenEvents.value.map(i => i.Id)))

/**
 * Everything not in the trash. An edit in another timeline's window reaches this store too, hence the
 * id test. A switch turned on arrives as ItemSaved before `cast` rereads, so the rebuilt copy wins until then.
 */
const pool = computed(() => [
    ...store.items.filter(i => i.TimelineId === timelineId && !hiddenIds.value.has(i.Id)),
    ...hiddenEvents.value,
].filter(i => !trashed.value.has(i.Id) && !binnedOwned.value.has(i.Id)))
const counts = computed(() => {
    const n: Record<number, number> = { 0: pool.value.length }
    for (const i of pool.value) n[i.TypeId] = (n[i.TypeId] ?? 0) + 1
    return n
})
const rows = computed(() => archiveRows(pool.value, type.value, query.value, sort.value))
const itemById = computed(() => new Map(pool.value.map(i => [i.Id, i])))

// ── Bulk edit ─────────────────────────────────────────────────────────────────

/** A hidden birth or death is rebuilt here, not read, and the markers are the timeline's own. */
const pickable = (i: TimelineItem) => i.TypeId < 8 && !hiddenIds.value.has(i.Id)
const { multi, picked, selection, allShown, pick, toggleAll, clear: clearPicked } = useMultiPick(() => rows.value.filter(pickable), i => i.Id)

function trashPicked() {
    for (const i of selection.value) toTrash(i)
}

// ── Stories and books ─────────────────────────────────────────────────────────

const stories = ref<Story[]>([])
const books = ref<Book[]>([])
const maps = ref<MapItem[]>([])
const media = ref<MediaItem[]>([])
const cast = ref<CharacterItem[]>([])
const relations = ref<CharacterRelationship[]>([])
const relationTypes = ref<RelationshipType[]>([])
const events = ref<MapEvent[]>([])
const tags = ref<{ Id: number; Name: string; UsageCount: number }[]>([])
const storiesTab = ref<InstanceType<typeof ArchiveStoriesTab> | null>(null)
const booksTab = ref<InstanceType<typeof ArchiveBooksTab> | null>(null)
const mediaTab = ref<InstanceType<typeof ArchiveMediaTab> | null>(null)
const charactersTab = ref<InstanceType<typeof ArchiveCharactersTab> | null>(null)
const placesTab = ref<InstanceType<typeof ArchivePlacesTab> | null>(null)
const notesTab = ref<InstanceType<typeof ArchiveNotesTab> | null>(null)

/** Key → this timeline's items under it, earliest first. From the store, so an item edit shows at once. */
function refsBy(keys: (i: TimelineItem) => Iterable<string | null | undefined>) {
    const refs = new Map<string, TimelineItem[]>()
    for (const i of pool.value) {
        for (const k of new Set(keys(i))) {
            if (!k) continue
            if (!refs.has(k)) refs.set(k, [])
            refs.get(k)!.push(i)
        }
    }
    for (const list of refs.values()) list.sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
    return refs
}
const storyRefs = computed(() => refsBy(i => (store.itemStoryMap.get(i.Id) ?? []).map(r => r.StoryId)))
/** Mentions count here, unlike on the map: an appearance is any item naming them. */
const castRefs = computed(() => refsBy(i => (store.itemCharacterMap.get(i.Id) ?? []).map(l => l.CharacterId)))
const placeRefs = computed(() => refsBy(i => [i.LocationId]))
const tagRefs = computed(() => refsBy(i => (store.itemTagMap.get(i.Id) ?? []).map(t => String(t.TagId))))
/** Tag id → this timeline's items carrying it, trashed ones too: the rest of a tag's count is other timelines'. */
const tagsHere = computed(() => {
    const n = new Map<number, number>()
    for (const i of store.items) {
        if (i.TimelineId !== timelineId) continue
        for (const t of store.itemTagMap.get(i.Id) ?? []) n.set(t.TagId, (n.get(t.TagId) ?? 0) + 1)
    }
    return n
})
const listedNotes = computed(() => store.notes.filter(n => !trashed.value.has(n.Id)))
const liveTags = computed(() => tags.value.filter(t => !trashed.value.has(`tag:${t.Id}`)))
const binnedTags = computed(() => tags.value.filter(t => trashed.value.has(`tag:${t.Id}`)).map(t => t.Name))
const liveStories = computed(() => stories.value.filter(s => !trashed.value.has(s.Id)))

const listedStories = computed(() => archiveStories(liveStories.value, new Set(storyRefs.value.keys())))
const listedBooks = computed(() => archiveBooks(books.value.filter(b => !trashed.value.has(b.Id)), listedStories.value))
const listedMedia = computed(() => media.value.filter(p => !trashed.value.has(p.Id)))
const listedMaps = computed(() => maps.value
    .filter(m => !trashed.value.has(m.Id))
    .map(m => ({ ...m, Locations: m.Locations.filter(l => !trashed.value.has(l.Id)) })))
const placeById = computed(() => new Map<string, LocationItem>(listedMaps.value.flatMap(m => m.Locations.map(l => [l.Id, l]))))
/** A character in the trash is gone from every tab, and so are the ties they are an end of. */
const liveCast = computed(() => cast.value.filter(c => !trashed.value.has(c.Id)))
const liveRelations = computed(() => relations.value.filter(r => !trashed.value.has(r.Character1Id) && !trashed.value.has(r.Character2Id)))
/** The birth and death items a trashed character takes with them. */
const binnedOwned = computed(() => new Set(cast.value
    .filter(c => trashed.value.has(c.Id))
    .flatMap(c => [c.BirthItemId, c.DeathItemId])
    .filter(Boolean)))
const castById = computed(() => new Map(liveCast.value.map(c => [c.Id, c])))
/** Who was where, from the map's own reading: present only, not mentioned. An item in the trash was not there. */
const seen = computed(() => whereabouts(events.value.filter(e => !trashed.value.has(e.ItemId))))
const loose = computed(() =>
    looseEnds(pool.value, listedMedia.value, liveTags.value, listedStories.value, new Set(storyRefs.value.keys()), liveCast.value))

/**
 * ponytail: characters, relations and places are read here, and the windows that edit them do not
 * broadcast; an edit there shows after the next item save or a reopen. Add broadcasts if that bites.
 */
const LOAD_FAILED = 'Could not load the Archive'

async function loadArchive() {
    try {
        const [s, b, m, r, e, maps_, t] = await Promise.all([
            BackendAPI.GetArchiveStories(timelineId), BackendAPI.GetArchiveBooks(timelineId), BackendAPI.GetArchiveMedia(timelineId),
            BackendAPI.GetTimelineRelations(timelineId), BackendAPI.GetMapEvents(timelineId), BackendAPI.GetMaps(timelineId),
            BackendAPI.GetTagList(),
        ])
        tags.value = t
        stories.value = s
        books.value = b
        media.value = m
        cast.value = r.Characters
        relations.value = r.Relations
        relationTypes.value = r.Types
        events.value = e
        maps.value = maps_
        // A reread that works takes down its own earlier failure, and only that.
        if (error.value.startsWith(LOAD_FAILED)) error.value = ''
    } catch (ex) {
        failed(LOAD_FAILED, ex)
    }
}

/** The Books tab stays out of the way until there is a book; this is its way in. */
function firstBook() {
    tab.value = 'books'
    booksTab.value?.newBook()
}

/** A story chip under a chapter in the Books tab. */
function openStory(id: string) {
    tab.value = 'stories'
    storiesTab.value?.open(id)
}

/** A person under a place, or a place under a person: each tab points into the other. */
function showCharacter(id: string) {
    tab.value = 'characters'
    charactersTab.value?.open(id)
}

function showPlace(id: string) {
    tab.value = 'places'
    placesTab.value?.open(id)
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** A year boundary reads as the year alone; anything inside one names its day. Same as the map's. */
function dateOf(at: number): string {
    const { year, day } = dayOfYearAt(at, store.calendarConfig)
    return day === 0 && Math.abs(at - year) < 1e-9 ? `${year}` : `${store.activeFormatRegistry.DAYS!(year, day)} ${year}`
}

const when = (i: Pick<TimelineItem, 'AbsoluteStart' | 'AbsoluteEnd'>) =>
    i.AbsoluteEnd > i.AbsoluteStart ? `${dateOf(i.AbsoluteStart)} – ${dateOf(i.AbsoluteEnd)}` : dateOf(i.AbsoluteStart)

// ── Row actions ───────────────────────────────────────────────────────────────

function jump(i: TimelineItem) {
    BackendAPI.FocusTimelineItem(i.Id, i.AbsoluteStart).catch(ex => failed('Could not reach the timeline window', ex))
}

/** A title click: jump to it — or, for a hidden one the timeline does not draw, open it. */
function open(i: TimelineItem) {
    if (hiddenIds.value.has(i.Id)) BackendAPI.OpenAddEditItemWindow(timelineId, i.Id)
    else jump(i)
}

function toTrash(i: TimelineItem) {
    trash.value.push({ kind: 'item', id: i.Id, title: i.Title || 'Untitled', sub: when(i), typeId: i.TypeId })
    // Restored, it comes back unticked.
    picked.value.delete(i.Id)
}

function restore(e: TrashEntry) {
    trash.value = trash.value.filter(t => t.id !== e.id)
    if (!trash.value.length) tab.value = 'items'
}

/** The row whose character is being switched on, so its button cannot be pressed twice. */
const revealing = ref<string | null>(null)

/** Turns the owning character's *Show on timeline* on — the same save the character window makes — then jumps. */
async function showOnTimeline(i: TimelineItem) {
    const local = cast.value.find(c => c.BirthItemId === i.Id || c.DeathItemId === i.Id)
    if (!local) return
    revealing.value = i.Id
    try {
        // A fresh copy: the one loaded with this window may be older than an edit made since.
        const c = (await BackendAPI.GetTimelineCharacters(timelineId))?.find(x => x.Id === local.Id)
        if (!c) throw new Error(`${local.Name} is no longer in this timeline.`)
        c.ShowOnTimeline = true
        const dropped = planGeneratedItems(c)
        const result = await BackendAPI.SaveCharacterFull(
            c, dropped,
            c.BirthItemId ? buildGeneratedItem('Birth', c, c.BirthItemId) : null,
            c.DeathItemId ? buildGeneratedItem('Death', c, c.DeathItemId) : null,
        )
        if (result?.status !== 'ok') throw new Error('The character was not saved.')
        // The items arrive by the ItemSaved broadcast; this takes the row out of the hidden ones.
        Object.assign(local, result.character)
        await BackendAPI.FocusTimelineItem(i.Id, i.AbsoluteStart)
    } catch (ex) {
        failed(`Could not show ${local.Name} on the timeline`, ex)
    } finally {
        revealing.value = null
    }
}

// ── Closing ───────────────────────────────────────────────────────────────────

const closeAsk = ref(false)
const emptying = ref(false)
/** Set on the way out, so the browser's leave guard lets a confirmed close through. */
let closing = false

function close() {
    closing = true
    BackendAPI.WindowClose()
}

/** Which tabs have an open story, book, picture or note with unsaved changes. */
const unsaved = () => [
    storiesTab.value?.isDirty() && 'story', booksTab.value?.isDirty() && 'book', mediaTab.value?.isDirty() && 'picture',
    notesTab.value?.isDirty() && 'note',
].filter(Boolean) as string[]
/** Set while the close asks about unsaved drafts; the trash is asked about after. */
const discardAsk = ref<string[] | null>(null)

function requestClose() {
    if (emptying.value) return
    const open = unsaved()
    if (open.length) discardAsk.value = open
    else closeOrAskTrash()
}

function closeOrAskTrash() {
    discardAsk.value = null
    if (trash.value.length) closeAsk.value = true
    else close()
}

/** "2 items, 1 story" — for the close dialog's title. */
const trashSummary = computed(() => (Object.keys(KIND_NAMES) as TrashEntry['kind'][])
    .map(k => [k, trash.value.filter(e => e.kind === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${KIND_NAMES[k][n === 1 ? 0 : 1]}`)
    .join(', '))
const trashHasShared = computed(() => trash.value.some(e =>
    e.kind === 'character' ? cast.value.find(c => c.Id === e.id)?.Shared : !['item', 'place', 'map', 'note'].includes(e.kind)))

const DELETE: Record<TrashEntry['kind'], (id: string) => Promise<unknown>> = {
    item: id => BackendAPI.DeleteItem(id),
    story: id => BackendAPI.DeleteStory(id),
    book: id => BackendAPI.DeleteBook(id),
    // Already gone if its book went first; the delete is a no-op then.
    chapter: id => BackendAPI.DeleteChapter(id),
    picture: id => BackendAPI.DeletePicture(id, timelineId),
    // Its items keep their dates and lose the place; a map it opened into stays, with no pin into it.
    place: id => BackendAPI.DeleteLocation(id),
    // Its own pins go with it, their items losing the place like above; the maps behind them stay, as tops.
    map: id => BackendAPI.DeleteMap(id),
    // Off every item in every timeline; the items stay.
    tag: id => BackendAPI.DeleteTag(Number(id.slice('tag:'.length))),
    note: id => BackendAPI.DeleteNote(id),
    // With their portrait, their birth and death items and every relation they are an end of.
    character: id => BackendAPI.DeleteCharacter(id),
}

async function emptyTrashAndClose() {
    closeAsk.value = false
    emptying.value = true
    try {
        // One at a time, each off the list as it goes: a failure leaves exactly what is still to delete.
        // Only what the dialog listed, and taken off by identity: the tabs can still trash during the wait.
        // A copy, not the list itself: a push during the first delete would land in it.
        for (const e of trash.value.slice()) {
            await DELETE[e.kind](e.id)
            trash.value = trash.value.filter(t => t !== e)
        }
    } catch (ex) {
        failed('The trash was not emptied — what is still in it was not deleted', ex)
        return
    } finally {
        emptying.value = false
    }
    // Something trashed during the wait was never asked about.
    if (trash.value.length) closeAsk.value = true
    else close()
}

/** Browser only: a tab closed from its own X would drop the trash and the drafts without the dialogs. */
function onBeforeUnload(e: BeforeUnloadEvent) {
    if ((trash.value.length || unsaved().length) && !closing) e.preventDefault()
}

/** Pending reread; a bulk edit sends one ItemSaved per item, and they become one read. */
let reload = 0

const stopListening = BackendAPI.onHostMessage(m => {
    if (m?.action === 'CloseRequested') requestClose()
    // A chapter's items, a story's other-timeline count and who was where come from the backend, and an
    // item save can change any of them.
    else if (['StoriesChanged', 'ItemSaved', 'ItemDeleted', 'TagsChanged'].includes(m?.action)) {
        clearTimeout(reload)
        reload = window.setTimeout(loadArchive, 150)
    }
})

onMounted(async () => {
    if (IS_BROWSER_HOST) window.addEventListener('beforeunload', onBeforeUnload)
    // It reports its own failure through loadNotice rather than throwing.
    await Promise.all([store.loadTimelineData(timelineId), loadArchive()])
    // Added to, not over, a failure loadArchive already put up.
    if (store.loadNotice) error.value = [error.value, `${store.loadNotice.title}. ${store.loadNotice.message}`].filter(Boolean).join(' ')
    loading.value = false
})

onBeforeUnmount(() => {
    stopListening()
    clearTimeout(reload)
    window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
    <div class="ar-root">
        <WindowTitleBar title="Archive" :subtitle="store.title" :show-maximize="true" :close-handler="requestClose" />

        <nav class="ar-tabs">
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'items' }" @click="tab = 'items'"><PhListBullets :size="17" /> Timeline items</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'stories' }" @click="tab = 'stories'"><PhBookOpenText :size="17" /> Stories</button>
            <button
                v-if="listedBooks.length || tab === 'books'"
                class="ar-tab"
                :class="{ 'ar-tab--active': tab === 'books' }"
                @click="tab = 'books'"
            ><PhBooks :size="17" /> Books</button>
            <button v-else class="ar-tab ar-tab--add" data-tip="Add the first book" @click="firstBook"><PhPlus :size="15" /> Book</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'characters' }" @click="tab = 'characters'"><PhUsersThree :size="17" /> Characters</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'places' }" @click="tab = 'places'"><PhMapPin :size="17" /> Places</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'media' }" @click="tab = 'media'"><PhImage :size="17" /> Media</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'tags' }" @click="tab = 'tags'"><PhTag :size="17" /> Tags</button>
            <button class="ar-tab" :class="{ 'ar-tab--active': tab === 'notes' }" @click="tab = 'notes'"><PhNotepad :size="17" /> Notes</button>
            <!-- The housekeeping tabs, apart on the right: they are about the timeline, not in it. -->
            <span class="ar-tabs-gap" />
            <button
                v-if="trash.length"
                class="ar-tab"
                :class="{ 'ar-tab--active': tab === 'trash' }"
                data-tip="Deleted when the Archive closes — restore anything until then"
                @click="tab = 'trash'"
            ><PhTrash :size="17" /> Trash {{ trash.length }}</button>
            <span class="ar-tabs-sep" />
            <button
                class="ar-tab"
                :class="{ 'ar-tab--active': tab === 'misc' }"
                data-tip="Loose ends, hidden ranges and the work history"
                @click="tab = 'misc'"
            ><PhBroom :size="17" /> Misc</button>
        </nav>

        <p v-if="error" class="ar-error">{{ error }}</p>

        <template v-if="tab === 'items'">
            <div class="ar-tools">
                <div class="ar-chips">
                    <button
                        v-for="chip in CHIPS"
                        :key="chip.id"
                        class="ar-chip"
                        :class="{ 'ar-chip--on': type === chip.id }"
                        @click="type = chip.id"
                    >
                        <component :is="ICONS[chip.id]" v-if="chip.id" :size="15" />
                        {{ chip.label }}
                        <span class="ar-chip-count">{{ counts[chip.id] ?? 0 }}</span>
                    </button>
                </div>
                <select v-model="sort" class="ar-sort" aria-label="Sort by" data-tip="Sort by">
                    <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
                </select>
            </div>

            <div class="ar-tools">
                <label class="ar-search">
                    <PhMagnifyingGlass :size="15" />
                    <input v-model="query" type="text" placeholder="Search items…" />
                </label>
                <ArchiveMultiSwitch v-model="multi" :all="allShown" :some="selection.length > 0" :empty="!rows.some(pickable)" @all="toggleAll" />
            </div>

            <div v-if="loading" class="ar-empty">Loading…</div>
            <p v-else-if="!rows.length" class="ar-empty">{{ query ? `Nothing matches “${query}”.` : 'Nothing of this kind yet.' }}</p>

            <ul v-else class="ar-rows">
                <li
                    v-for="i in rows"
                    :key="i.Id"
                    class="ar-row"
                    :class="{ 'ar-row--hidden': hiddenIds.has(i.Id), 'ar-row--coloured': i.Color, 'ar-row--picked': picked.has(i.Id) }"
                    :style="i.Color ? { '--item-colour': i.Color } : undefined"
                >
                    <div class="ar-row-head">
                        <template v-if="multi">
                            <input
                                v-if="pickable(i)"
                                type="checkbox"
                                class="ar-pick"
                                :checked="picked.has(i.Id)"
                                :aria-label="`Tick ${i.Title || 'Untitled'}`"
                                data-tip="Tick to edit with others; shift-click ticks a run"
                                @click="pick(i, $event)"
                            />
                            <span v-else class="ar-pick" />
                        </template>
                        <component :is="ICONS[i.TypeId] ?? PhCalendarBlank" :size="18" class="ar-row-icon" />
                        <button
                            class="ar-row-title"
                            :data-tip="hiddenIds.has(i.Id) ? 'Open it — the timeline does not draw it' : 'Jump to it on the timeline'"
                            @click="open(i)"
                        >{{ i.Title || 'Untitled' }}</button>
                        <span v-if="hiddenIds.has(i.Id)" class="ar-pill" data-tip="Their character's Show on timeline is off">hidden</span>

                        <span class="ar-row-actions">
                            <button
                                v-if="hiddenIds.has(i.Id)"
                                class="ar-btn ar-btn--small"
                                :disabled="revealing === i.Id"
                                data-tip="Turn their character's Show on timeline on, then jump to it"
                                @click="showOnTimeline(i)"
                            ><PhEye :size="15" /> Show on timeline</button>
                            <button v-else class="ar-icon" aria-label="Jump to it" data-tip="Jump to it on the timeline" @click="jump(i)"><PhCrosshair :size="18" /></button>
                            <button
                                v-if="i.TypeId < 8"
                                class="ar-icon"
                                aria-label="Edit"
                                data-tip="Edit"
                                @click="BackendAPI.OpenAddEditItemWindow(timelineId, i.Id)"
                            ><PhPencilSimple :size="18" /></button>
                            <button class="ar-icon ar-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="toTrash(i)"><PhTrash :size="18" /></button>
                        </span>
                    </div>
                    <div class="ar-row-date">{{ when(i) }}</div>
                    <div v-if="i.Description" class="ar-row-desc">{{ i.Description }}</div>
                </li>
            </ul>

            <ArchiveBulkBar
                v-if="selection.length"
                :timeline-id="timelineId"
                :items="selection"
                :tags="liveTags"
                :binned="binnedTags"
                :stories="liveStories"
                @trash="trashPicked"
                @clear="clearPicked"
            />
        </template>

        <!-- v-show, not v-if: a half-written story survives a look at another tab. -->
        <ArchiveStoriesTab
            v-show="tab === 'stories'"
            ref="storiesTab"
            :timeline-id="timelineId"
            :stories="listedStories"
            :books="listedBooks"
            :trashed="trashed"
            :maps="listedMaps"
            :refs="storyRefs"
            :when="when"
            @jump="jump"
            @trash-item="toTrash"
            @trash="trash.push($event)"
            @error="failed"
        />
        <ArchiveBooksTab
            v-show="tab === 'books'"
            ref="booksTab"
            :timeline-id="timelineId"
            :books="listedBooks"
            :stories="listedStories"
            :items="itemById"
            :trashed="trashed"
            :when="when"
            @jump="jump"
            @trash-item="toTrash"
            @trash="trash.push($event)"
            @error="failed"
            @open-story="openStory"
        />
        <ArchiveCharactersTab
            v-show="tab === 'characters'"
            ref="charactersTab"
            :timeline-id="timelineId"
            :cast="liveCast"
            :refs="castRefs"
            :relations="liveRelations"
            :types="relationTypes"
            :whereabouts="seen.byCharacter"
            :places="placeById"
            :date-of="dateOf"
            :icons="ICONS"
            @open="open"
            @place="showPlace"
            @trash="trash.push($event)"
            @saved="loadArchive"
            @error="failed"
        />
        <ArchivePlacesTab
            v-show="tab === 'places'"
            ref="placesTab"
            :timeline-id="timelineId"
            :maps="listedMaps"
            :refs="placeRefs"
            :whereabouts="seen.byPlace"
            :cast="castById"
            :icons="ICONS"
            @open="open"
            @character="showCharacter"
            @trash="trash.push($event)"
            @saved="loadArchive"
            @error="failed"
        />
        <ArchiveMediaTab
            v-show="tab === 'media'"
            ref="mediaTab"
            :timeline-id="timelineId"
            :media="listedMedia"
            :items="itemById"
            :icons="ICONS"
            :when="when"
            @open="open"
            @trash="trash.push($event)"
            @saved="loadArchive"
            @error="failed"
        />
        <ArchiveTagsTab
            v-show="tab === 'tags'"
            :timeline-id="timelineId"
            :tags="tags"
            :refs="tagRefs"
            :local="tagsHere"
            :trashed="trashed"
            :when="when"
            @jump="jump"
            @trash-item="toTrash"
            @trash="trash.push($event)"
            @error="failed"
        />
        <ArchiveNotesTab
            v-show="tab === 'notes'"
            ref="notesTab"
            :notes="listedNotes"
            :date-of="dateOf"
            @trash="trash.push($event)"
            @error="failed"
        />
        <ArchiveMiscTab
            v-if="tab === 'misc'"
            :timeline-id="timelineId"
            :loose="loose"
            :when="when"
            @jump="open"
            @trash-item="toTrash"
            @trash="trash.push($event)"
            @story="openStory"
            @character="showCharacter"
            @error="failed"
        />

        <ul v-if="tab === 'trash'" class="ar-rows">
            <li v-for="e in trash" :key="e.id" class="ar-row">
                <div class="ar-row-head">
                    <component :is="kindIcon(e)" :size="18" class="ar-row-icon" />
                    <span class="ar-row-name">{{ e.title }}</span>
                    <span class="ar-pill">{{ KIND_NAMES[e.kind][0] }}</span>
                    <span class="ar-row-actions">
                        <button class="ar-btn ar-btn--small" :disabled="emptying" @click="restore(e)"><PhArrowCounterClockwise :size="15" /> Restore</button>
                    </span>
                </div>
                <div v-if="e.sub" class="ar-row-date">{{ e.sub }}</div>
            </li>
        </ul>

        <ConfirmModal
            v-if="discardAsk"
            title="Discard changes?"
            :message="`The ${discardAsk.join(' and the ')} you have open ${discardAsk.length > 1 ? 'have' : 'has'} unsaved changes.`"
            confirm-label="Discard" cancel-label="Keep editing" danger
            @confirm="closeOrAskTrash" @cancel="discardAsk = null"
        />
        <ConfirmModal
            v-if="closeAsk"
            :title="`Delete ${trashSummary}?`"
            :message="trashHasShared
                ? 'They went to the trash while the Archive was open. Closing deletes them for good. Stories, books, pictures, tags and shared characters belong to every timeline — deleting one takes it out of all of them.'
                : 'They went to the trash while the Archive was open. Closing deletes them for good.'"
            confirm-label="Delete and close" cancel-label="Keep open" danger
            @confirm="emptyTrashAndClose" @cancel="closeAsk = false"
        >
            <ul class="ar-trash-list">
                <li v-for="e in trash" :key="e.id">
                    <component :is="kindIcon(e)" :size="15" />
                    {{ e.title }} <span>{{ e.sub }}</span>
                </li>
            </ul>
        </ConfirmModal>

        <HoverTip />
    </div>
</template>

<!--
    Unscoped so the Media tab's rows can wear the Items tab's look. The ar- prefix keeps it to the
    Archive, and it only ever loads in archive.html.
-->
<style lang="scss">
.ar-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

.ar-tabs {
    display: flex;
    gap: 2px;
    padding: 0 10px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ar-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.8rem;
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); }

    &--active {
        color: var(--app-accent-hover, #818cf8);
        border-bottom-color: var(--app-accent, #6366f1);
    }

    &--add { font-size: 0.75rem; color: var(--app-text-dim, #64748b); }
}

.ar-tabs-gap { flex: 1; }

.ar-tabs-sep {
    align-self: center;
    width: 1px;
    height: 18px;
    margin: 0 6px;
    background: var(--app-border, #2d3a56);
}

// ── Chips, sort, search ───────────────────────────────────────────────────────

.ar-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 0;
}

.ar-chips {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.ar-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover { color: var(--app-text, #e2e8f0); }

    &--on {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
        background: color-mix(in srgb, var(--app-accent, #6366f1) 14%, transparent);
    }
}

.ar-chip-count {
    font-size: 0.68rem;
    opacity: 0.6;
}

.ar-sort {
    flex: 0 0 auto;
    align-self: flex-start;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    color: var(--app-text, #e2e8f0);
    font-size: 0.78rem;
    padding: 4px 6px;
}

.ar-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    color: var(--app-text-dim, #64748b);

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font-size: 0.8rem;
        padding: 6px 0;
        outline: none;
    }
}

.ar-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover:not(:disabled):not(.ar-btn--disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled,
    &--disabled { opacity: 0.5; cursor: default; }

    &--small { padding: 2px 8px; font-size: 0.72rem; }
}

// ── Edit multiple ─────────────────────────────────────────────────────────────

// A checkbox drawn as a switch: it changes what the rows are, not one row.
.ar-switch {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.78rem;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    user-select: none;

    &:hover { color: var(--app-text, #e2e8f0); }

    input {
        appearance: none;
        position: relative;
        flex: 0 0 auto;
        width: 28px;
        height: 16px;
        margin: 0;
        border-radius: 999px;
        border: 1px solid var(--app-border, #2d3a56);
        background: var(--app-bg-soft, #1e293b);
        cursor: pointer;
        transition: background 0.14s, border-color 0.14s;

        &::before {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--app-text-muted, #94a3b8);
            transition: transform 0.14s, background 0.14s;
        }

        &:checked {
            border-color: var(--app-accent, #6366f1);
            background: var(--app-accent, #6366f1);

            &::before { transform: translateX(12px); background: #fff; }
        }

        &:focus-visible { outline: 2px solid var(--app-accent, #6366f1); outline-offset: 2px; }
    }
}

.ar-select-all { cursor: pointer; user-select: none; }

.ar-error {
    margin: 8px 12px 0;
    font-size: 0.78rem;
    color: #f87171;
    white-space: pre-line;
}

.ar-empty {
    padding: 30px 14px;
    text-align: center;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--app-text-dim, #64748b);
}

// ── Rows ──────────────────────────────────────────────────────────────────────

.ar-rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.ar-row {
    padding: 8px 10px;
    // A list to act on, not text to copy: a drag across it must not paint half the rows blue.
    user-select: none;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);

    &:hover {
        border-color: color-mix(in srgb, var(--app-accent, #6366f1) 55%, var(--app-border, #2d3a56));

        .ar-icon { opacity: 1; }
    }

    &--hidden { border-style: dashed; }
    &--picked { background: color-mix(in srgb, var(--app-accent, #6366f1) 12%, var(--app-surface, #0c1524)); }

    // The item's own colour, cut into the corner. The icon keeps the theme's colour so it always
    // reads; the muted edge on the cut does the same for a colour the background would swallow.
    &--coloured {
        position: relative;

        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 16px;
            height: 16px;
            border-top-left-radius: 3px;
            background: linear-gradient(135deg, var(--item-colour) 0 42%, var(--app-text-muted, #94a3b8) 42% 50%, transparent 50%);
            pointer-events: none;
        }
    }
}

.ar-row-head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
}

.ar-row-icon {
    flex: 0 0 auto;
    color: var(--app-text-muted, #94a3b8);
}

// A row's tick, or the blank that keeps an untickable row's icon in line.
.ar-pick {
    flex: 0 0 13px;
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: var(--app-accent, #6366f1);
}

.ar-row-title {
    flex: 0 1 auto;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); text-decoration: underline; }
}

// The trash's rows: a name, not a link — what is in there cannot be jumped to.
.ar-row-name {
    flex: 0 1 auto;
    min-width: 0;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ar-pill {
    flex: 0 0 auto;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--app-bg-soft, #1e293b);
    font-size: 0.66rem;
    color: var(--app-text-dim, #64748b);
}

.ar-row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex: 0 0 auto;
}

.ar-icon {
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.14s, color 0.14s, background 0.14s;

    // Keyboard users get them without a mouse over the row.
    &:focus-visible { opacity: 1; }
    &:hover { color: var(--app-accent-hover, #818cf8); background: var(--app-bg-hover, #1e293b); }
    &--danger:hover { color: #f87171; }
}

.ar-row-date {
    margin-top: 3px;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--app-text-muted, #94a3b8);
}

.ar-row-desc {
    margin-top: 3px;
    font-size: 0.78rem;
    color: var(--app-text-dim, #64748b);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

// ── Rows that fold out, in sections that fold away (Media, Characters, Places) ──

.ar-section {
    margin-top: 6px;

    &:first-child { margin-top: 0; }

    button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0;
        border: none;
        background: none;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--app-text-dim, #64748b);
        cursor: pointer;

        &:hover { color: var(--app-text, #e2e8f0); }
    }
}

// A row's name over its line of details, beside a picture.
.ar-text {
    display: flex;
    flex-direction: column;
    min-width: 0;

    .ar-row-date { margin-top: 1px; }
}

// A fold caret and the name beside it, which does something else.
.ar-name {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
}

.ar-caret {
    vertical-align: -1px;
    transition: transform 0.14s;

    &--open { transform: rotate(90deg); }
}

// A caret of its own, where the name beside it does something else.
.ar-fold-btn {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 2px;
    border: none;
    background: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); }
}

.ar-fold {
    display: flex;
    flex-direction: column;
    gap: 10px;
    // Past the 44px picture and the gap, so it lines up with the name.
    margin: 10px 0 2px 51px;
    // The row is a list to act on; what is typed or read here is text.
    user-select: text;
}

// ── The bars under a tab while rows are ticked, and their dialogs ─────────────

.ab-bar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ab-count {
    margin-right: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--app-accent-hover, #818cf8);
}

.ab-danger:hover:not(:disabled) { color: #f87171; border-color: #f87171; }

// Always showing, unlike a row's icons, which wait for the pointer.
.ab-clear { margin-left: auto; opacity: 1; }

.ab-body {
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;

    // .ap-field boxes its inputs; a slider is not a box. Its focus showed on the border, so it gets an outline.
    input[type='range'] {
        padding: 0;
        border: none;
        background: none;
        accent-color: var(--app-accent, #6366f1);

        &:focus-visible { outline: 2px solid var(--app-accent, #6366f1); outline-offset: 2px; }
    }
}

.ab-swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;

    input[type='color'] {
        width: 34px;
        height: 26px;
        padding: 1px;
        border: 1px solid var(--app-border, #2d3a56);
        border-radius: var(--app-radius-sm, 4px);
        background: transparent;
    }
}

.ab-swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s, border-color 0.1s;

    &:hover { transform: scale(1.15); }
    &--on { border-color: var(--app-text, #e2e8f0); }
}

// Two fields side by side, and a button between them.
.ab-line {
    display: flex;
    align-items: flex-end;
    gap: 8px;

    > .ap-field { flex: 1; }
    > .ar-icon { opacity: 1; margin-bottom: 3px; }
}

// A tick with its sentence beside it.
.ab-check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.8rem;
    cursor: pointer;

    input { margin: 0; accent-color: var(--app-accent, #6366f1); }
}

.ab-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--app-text-dim, #64748b);

    b { color: var(--app-text, #e2e8f0); font-weight: 600; }
    &--warn { color: #f59e0b; }
}

.ab-error {
    margin: 0;
    font-size: 0.78rem;
    color: #f87171;
}

// ── The close dialog's list ───────────────────────────────────────────────────

.ar-trash-list {
    max-height: 220px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0 20px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--app-text, #e2e8f0);

    li {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    span {
        margin-left: auto;
        font-size: 0.72rem;
        color: var(--app-text-dim, #64748b);
    }
}
</style>

<!--
    The Stories, Books and Media tabs' list and panel, which they share. Unscoped so all reach it; the ap-
    prefix keeps it to them, and it only ever loads in archive.html. Mirrors the Characters window.
-->
<style lang="scss">
.ap-body {
    flex: 1;
    display: grid;
    grid-template-columns: 260px 5px 1fr;
    min-height: 0;
}

.ap-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    border-right: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ap-list-head {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid var(--app-border, #2d3a56);

    > .ap-btn { flex: 0 0 auto; }
}

.ap-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    color: var(--app-text-dim, #64748b);

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font-size: 0.78rem;
        padding: 5px 0;
        outline: none;
    }
}

.ap-shared {
    margin: 0;
    padding: 6px 10px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.ap-rows {
    list-style: none;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    flex: 1;
    user-select: none;
}

.ap-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    border-radius: var(--app-radius-sm, 4px);
    cursor: pointer;

    &:hover { background: color-mix(in srgb, var(--app-accent, #6366f1) 10%, transparent); }
    &--selected { background: color-mix(in srgb, var(--app-accent, #6366f1) 20%, transparent); }
}

.ap-swatch {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid var(--app-text-muted, #94a3b8);
}

.ap-row-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.ap-row-name {
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ap-row-sub {
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.ap-empty {
    padding: 20px 14px;
    text-align: center;
    font-size: 0.75rem;
    font-style: italic;
    color: var(--app-text-dim, #64748b);
}

// ── Panel ─────────────────────────────────────────────────────────────────────

.ap-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}

.ap-detail {
    flex: 1;
    min-height: 0;
    padding: 14px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;

    &--blank {
        align-items: center;
        justify-content: center;
        color: var(--app-text-dim, #64748b);
        font-style: italic;
    }
}

.ap-note {
    margin: 0;
    padding: 7px 10px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid color-mix(in srgb, #f59e0b 45%, transparent);
    background: color-mix(in srgb, #f59e0b 8%, transparent);
    font-size: 0.75rem;
    color: var(--app-text-muted, #94a3b8);
}

.ap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
}

.ap-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    > span {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--app-text-dim, #64748b);
    }

    input,
    textarea,
    select {
        border-radius: var(--app-radius-sm, 4px);
        border: 1px solid var(--app-border, #2d3a56);
        background: var(--app-surface, #0c1524);
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.8rem;
        padding: 5px 7px;
        outline: none;

        &:focus { border-color: var(--app-accent, #6366f1); }
    }

    textarea { resize: vertical; }
    input[type='color'] { padding: 2px; height: 30px; width: 60px; }

    > .ap-btn { align-self: flex-start; }
    &--wide { grid-column: 1 / -1; }
}

// Worked out from other rows, not typed: reads like a value, not a box.
.ap-derived {
    margin: 0;
    padding: 5px 0;
    font-size: 0.8rem;
    color: var(--app-text-muted, #94a3b8);
}

.ap-colour {
    display: flex;
    align-items: center;
    gap: 4px;
}

// No colour set: the picker still needs a value, so it shows one faded.
.ap-colour--unset { opacity: 0.35; }

.ap-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
}

.ap-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--app-border, #2d3a56);
    font-size: 0.75rem;
}

.ap-chip-x {
    display: inline-flex;
    padding: 1px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;

    &:hover { color: #f87171; }
}

.ap-pov {
    padding: 0 5px;
    border-radius: 999px;
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    font-size: 0.6rem;
    font-weight: 600;
    cursor: pointer;

    &--on {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
        background: color-mix(in srgb, var(--app-accent, #6366f1) 18%, transparent);
    }
}

.ap-chip--link {
    padding: 2px 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover { border-color: var(--app-accent, #6366f1); }
}

/** A story's books, each with its chapter toggles under it. */
.ap-books {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
}

.ap-book {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;

    .ap-chips { padding-left: 10px; }
}

.ap-picks {
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.ap-field select.ap-add {
    padding: 2px 6px;
    border-style: dashed;
    border-radius: 999px;
    font-size: 0.75rem;
    color: var(--app-text-muted, #94a3b8);
}

/** A story's quotes as pull-quotes: the words in a book face, who said them under them. */
.ap-quote {
    position: relative;
    margin: 0 0 4px;
    padding: 12px 34px 12px 46px;
    border: 1px solid var(--app-border, #2d3a56);
    border-left: 3px solid var(--app-accent, #6366f1);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    cursor: pointer;
    outline: none;

    &::before {
        content: '\201C';
        position: absolute;
        top: 2px;
        left: 10px;
        font: 3rem/1 Georgia, 'Times New Roman', serif;
        color: var(--app-accent, #6366f1);
    }

    &:hover,
    &:focus-visible { border-color: color-mix(in srgb, var(--app-accent, #6366f1) 55%, var(--app-border, #2d3a56)); }

    > .ap-icon { position: absolute; top: 6px; right: 6px; opacity: 0; }
    &:hover > .ap-icon,
    > .ap-icon:focus-visible { opacity: 1; }

    blockquote { margin: 0; }
}

.ap-quote-line {
    display: flex;
    flex-direction: column;
    margin: 0;

    > span {
        font: italic 0.95rem/1.45 Georgia, 'Times New Roman', serif;
        color: var(--app-text, #e2e8f0);
        white-space: pre-wrap;
    }

    cite {
        order: 1;
        align-self: flex-end;
        margin-top: 4px;
        font-style: normal;
        font-size: 0.75rem;
        color: var(--app-text-muted, #94a3b8);

        &::before { content: '— '; }
    }
}

// An exchange reads like a script: each speaker in a column ahead of what they said.
.ap-quote--exchange {
    display: grid;
    grid-template-columns: fit-content(12em) 1fr;
    gap: 5px 12px;

    .ap-quote-line { display: contents; }
    .ap-quote-line > span { grid-column: 2; }

    cite {
        order: 0;   // a grid places by order too, and the lines must keep theirs
        grid-column: 1;
        align-self: baseline;
        margin: 0;
        text-align: right;
        font-weight: 600;
        letter-spacing: 0.03em;

        &::before { content: none; }
    }
}

.ap-chapter {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);

    &:hover .ap-icon { opacity: 1; }
}

.ap-chapter-head {
    display: flex;
    align-items: center;
    gap: 6px;

    input:not(.ap-chapter-no) { flex: 1; min-width: 0; }
}

.ap-field input.ap-chapter-no { width: 64px; }

.ap-fold {
    font-size: 0.78rem;

    summary {
        cursor: pointer;
        user-select: none;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--app-text-dim, #64748b);

        span { font-weight: 400; opacity: 0.7; }
        &:hover { color: var(--app-text, #e2e8f0); }
    }
}

.ap-icon {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    transition: opacity 0.14s, color 0.14s;

    &:hover { color: var(--app-accent-hover, #818cf8); }
    &--danger:hover { color: #f87171; }
}

.ap-chapter .ap-icon { opacity: 0; }
.ap-chapter .ap-icon:focus-visible { opacity: 1; }

.ap-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ap-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled { opacity: 0.5; cursor: default; }

    &--primary {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
    }

    &--danger {
        color: #f87171;
        border-color: color-mix(in srgb, #f87171 55%, transparent);

        &:hover:not(:disabled) {
            color: #fecaca;
            border-color: #f87171;
            background: color-mix(in srgb, #f87171 14%, transparent);
        }
    }

    &--small { padding: 2px 8px; font-size: 0.72rem; }
}
</style>

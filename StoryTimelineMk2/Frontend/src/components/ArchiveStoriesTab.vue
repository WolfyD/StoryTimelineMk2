<script setup lang="ts">
/**
 * BL-88: the Archive's Stories tab — the list and the story it has open, laid out like the Characters
 * window. A story is shared by every timeline, but its characters and places are not: a save here
 * replaces only this timeline's links. Delete goes to the Archive's trash, like everything else in it.
 */
import { computed, ref, watch } from 'vue'
import { PhBookOpenText, PhFloppyDisk, PhMagnifyingGlass, PhPlus, PhTrash, PhX } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { useSideWidth } from '@/composables/useSideWidth'
import { storyQuotes, type TrashEntry } from '@/utils/archiveItems'
import ArchiveItemLinks from '@/components/ArchiveItemLinks.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import StoryQuoteModal from '@/components/StoryQuoteModal.vue'
import type { Book, MapItem, QuoteLine, Story, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** Already cut to what this timeline lists, the trash left out. */
    stories: Story[]
    books: Book[]
    /** Trashed ids of any kind — the chapters among them drop out of the pickers. */
    trashed: Set<string>
    maps: MapItem[]
    /** Story id → this timeline's items citing it, earliest first, the trash left out. */
    refs: Map<string, TimelineItem[]>
    when: (i: Pick<TimelineItem, 'AbsoluteStart' | 'AbsoluteEnd'>) => string
}>()
const emit = defineEmits<{
    jump: [TimelineItem]
    trashItem: [TimelineItem]
    trash: [TrashEntry]
    error: [what: string, ex: unknown]
}>()

// Fixed choices, each of which may be left blank. Genre stays free text.
const STATUSES = ['Idea', 'Drafting', 'Done']
const TENSES = ['Past', 'Present', 'Future', 'Mixed']
const PERSONS = ['First', 'Second', 'Third limited', 'Third omniscient', 'Mixed']

const store = useTimelineStore()
const { width: listWidth, startResize } = useSideWidth('archiveSideWidth')

const search = ref('')
const draft = ref<Story | null>(null)
/** The quotes as a list while editing; the row keeps them as JSON. */
const quotes = ref<QuoteLine[][]>([])
/** The quote in the modal: an index, `quotes.length` for a new one. */
const editing = ref<number | null>(null)
const saving = ref(false)

const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return needle
        ? props.stories.filter(s => [s.Title, s.Description, s.Genre].some(f => f?.toLowerCase().includes(needle)))
        : props.stories
})

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function rowSub(s: Story) {
    const n = props.refs.get(s.Id)?.length ?? 0
    return [s.Status, n ? plural(n, 'item') : 'not cited here'].filter(Boolean).join(' · ')
}

// Gone from the list — trashed here, or deleted or unlisted from elsewhere — so it closes, unless it
// has unsaved changes: an item trashed here can unlist a story, and that should not cost the edit.
watch(() => props.stories, list => {
    const id = draft.value?.Id
    if (id && !list.some(s => s.Id === id) && (props.trashed.has(id) || !isDirty())) draft.value = null
})

function select(s: Story) {
    const copy: Story = JSON.parse(JSON.stringify(s))
    copy.Characters ??= []
    copy.LocationIds ??= []
    copy.BookIds ??= []
    copy.ChapterIds ??= []
    draft.value = copy
    quotes.value = storyQuotes(s.Quotes)
    clean = snap()
}

function newStory() {
    draft.value = {
        Id: '', Title: '', Description: null, Status: null, Tense: null, Person: null,
        PreviousStoryId: null, NextStoryId: null,
        Characters: [], LocationIds: [], BookIds: [], ChapterIds: [],
    }
    quotes.value = []
    clean = snap()
}

// ── Unsaved changes ───────────────────────────────────────────────────────────

/** The open story as last loaded or saved. Ids left out: a save fills one in without an edit. */
let clean = ''
const snap = () => JSON.stringify([draft.value, quotes.value], (k, v) => k === 'Id' ? undefined : v)
const isDirty = () => !!draft.value && snap() !== clean
/** What to do once the writer agrees to drop the open story's changes. */
const pending = ref<(() => void) | null>(null)

function guard(go: () => void) {
    if (isDirty()) pending.value = go
    else go()
}

function discard() {
    const go = pending.value!
    pending.value = null
    go()
}

function pick(s: Story) {
    if (draft.value?.Id !== s.Id) guard(() => select(s))
}

/** The Books tab's way in: a story chip under a chapter. */
function open(id: string) {
    const s = props.stories.find(x => x.Id === id)
    if (s) pick(s)
}
defineExpose({ isDirty, open })

// ── Derived ───────────────────────────────────────────────────────────────────

const cited = computed(() => (draft.value?.Id && props.refs.get(draft.value.Id)) || [])
const span = computed(() => cited.value.length
    ? props.when({
        AbsoluteStart: Math.min(...cited.value.map(i => i.AbsoluteStart)),
        AbsoluteEnd: Math.max(...cited.value.map(i => i.AbsoluteEnd)),
    })
    : '')
const others = computed(() => props.stories.filter(s => s.Id !== draft.value?.Id))
/** A neighbour only another timeline lists still needs an option, or the picker reads as blank. */
const unlisted = (id: string | null | undefined) => !!id && !others.value.some(s => s.Id === id)
const genres = computed(() => [...new Set(props.stories.map(s => s.Genre?.trim()).filter(Boolean) as string[])].sort())

// ── Links ─────────────────────────────────────────────────────────────────────

const castIds = computed(() => new Set(draft.value?.Characters?.map(c => c.CharacterId)))
const castLeft = computed(() => store.allTimelineCharacters.filter(c => !castIds.value.has(c.Id)))
const characterName = (id: string) => store.allTimelineCharacters.find(c => c.Id === id)?.Name ?? 'Unknown character'
/** Offered as speakers: the characters, and anyone else this story's quotes already name. */
const speakers = computed(() =>
    [...new Set([...store.allTimelineCharacters.map(c => c.Name), ...quotes.value.flat().map(l => l.speaker)])].filter(Boolean).sort())

function setQuote(lines: QuoteLine[]) {
    quotes.value.splice(editing.value!, 1, lines)
    editing.value = null
}

const places = computed(() => new Map(props.maps.flatMap(m => m.Locations.map(l => [l.Id, { name: l.Name, map: m.Name }] as const))))
const placeIds = computed(() => new Set(draft.value?.LocationIds))
const hasPlaces = computed(() => places.value.size > 0)

const bookIds = computed(() => new Set(draft.value?.BookIds))
const booksLeft = computed(() => props.books.filter(b => !bookIds.value.has(b.Id)))
const bookTitle = (id: string) => props.books.find(b => b.Id === id)?.Title ?? 'A book in the trash'

const chapterIds = computed(() => new Set(draft.value?.ChapterIds))
const chaptersOf = (bookId: string) =>
    props.books.find(b => b.Id === bookId)?.Chapters?.filter(c => !props.trashed.has(c.Id)) ?? []
/** "The Long Winter · ch. 4, 6, 8" — or the title alone, for a story that is the whole book. */
function bookLabel(id: string) {
    const picked = chaptersOf(id).filter(c => chapterIds.value.has(c.Id)).map(c => c.Number)
    return picked.length ? `${bookTitle(id)} · ch. ${picked.join(', ')}` : bookTitle(id)
}
function toggleChapter(id: string) {
    const list = draft.value!.ChapterIds!
    const at = list.indexOf(id)
    if (at < 0) list.push(id)
    else list.splice(at, 1)
}

/** The add-selects put back their placeholder once they have added. */
function picked(e: Event, add: (id: string) => void) {
    const select = e.target as HTMLSelectElement
    if (select.value) add(select.value)
    select.value = ''
}

// ── Save / delete ─────────────────────────────────────────────────────────────

async function save() {
    const s = draft.value
    if (!s || !s.Title.trim()) return
    saving.value = true
    // Taken before the wait, so a keystroke that lands during the save still counts as unsaved.
    const sent = snap()
    try {
        const result = await BackendAPI.SaveStory({
            ...s,
            Title: s.Title.trim(),
            // An emptied number box reads back as '', which is no order at all.
            ReadingOrder: typeof s.ReadingOrder === 'number' ? s.ReadingOrder : null,
            // The modal already dropped the blank lines, and a quote with none left with them.
            Quotes: quotes.value.length ? JSON.stringify(quotes.value) : null,
        }, props.timelineId)
        if (result?.status !== 'ok') throw new Error('The story was not saved.')
        // The list itself comes back with StoriesChanged.
        s.Id = result.story.Id
        // Another story opened during the wait has its own clean state.
        if (draft.value === s) clean = sent
    } catch (ex) {
        emit('error', 'Could not save the story', ex)
    } finally {
        saving.value = false
    }
}

/** A saved story goes to the trash under its saved title; a new one just drops. */
function remove() {
    const s = draft.value
    if (!s) return
    const saved = props.stories.find(x => x.Id === s.Id)
    if (saved) emit('trash', { kind: 'story', id: saved.Id, title: saved.Title || 'Untitled', sub: rowSub(saved) })
    draft.value = null
}
</script>

<template>
    <div class="ap-body" :style="{ gridTemplateColumns: `${listWidth}px 5px 1fr` }">
        <aside class="ap-list">
            <div class="ap-list-head">
                <label class="ap-search">
                    <PhMagnifyingGlass :size="15" />
                    <input v-model="search" type="text" placeholder="Search stories…" />
                </label>
                <button class="ap-btn ap-btn--primary" aria-label="New story" data-tip="New story" @click="guard(newStory)"><PhPlus :size="16" /></button>
            </div>
            <p class="ap-shared">Stories belong to every timeline. Listed: the ones this timeline uses, and any nobody uses yet.</p>

            <p v-if="!stories.length" class="ap-empty">No stories yet. Add the first one.</p>
            <p v-else-if="!filtered.length" class="ap-empty">Nothing matches “{{ search }}”.</p>
            <ul v-else class="ap-rows">
                <li
                    v-for="s in filtered"
                    :key="s.Id"
                    class="ap-row"
                    :class="{ 'ap-row--selected': draft?.Id === s.Id }"
                    @click="pick(s)"
                >
                    <span class="ap-swatch" :style="s.Color ? { background: s.Color } : undefined" />
                    <span class="ap-row-text">
                        <span class="ap-row-name">{{ s.Title || 'Untitled' }}</span>
                        <span class="ap-row-sub">{{ rowSub(s) }}</span>
                    </span>
                </li>
            </ul>
        </aside>
        <div class="side-grip" data-tip="Drag to resize" @pointerdown="startResize" />

        <div class="ap-pane">
            <section v-if="!draft" class="ap-detail ap-detail--blank">
                <PhBookOpenText :size="48" weight="thin" />
                <p>Pick a story, or add a new one.</p>
            </section>

            <section v-else class="ap-detail">
                <p v-if="draft.OtherTimelineRefs" class="ap-note">
                    Other timelines cite this story too ({{ plural(draft.OtherTimelineRefs, 'item') }}), so a change
                    to its title or details reaches them. The characters and places below are this timeline's own.
                </p>

                <div class="ap-grid">
                    <label class="ap-field ap-field--wide">
                        <span>Title</span>
                        <input v-model="draft.Title" type="text" placeholder="Needed to save" />
                    </label>
                    <label class="ap-field">
                        <span>Status</span>
                        <select v-model="draft.Status">
                            <option :value="null">—</option>
                            <option v-for="v in STATUSES" :key="v" :value="v">{{ v }}</option>
                        </select>
                    </label>
                    <label class="ap-field">
                        <span>Tense</span>
                        <select v-model="draft.Tense">
                            <option :value="null">—</option>
                            <option v-for="v in TENSES" :key="v" :value="v">{{ v }}</option>
                        </select>
                    </label>
                    <label class="ap-field">
                        <span>Person</span>
                        <select v-model="draft.Person">
                            <option :value="null">—</option>
                            <option v-for="v in PERSONS" :key="v" :value="v">{{ v }}</option>
                        </select>
                    </label>
                    <label class="ap-field">
                        <span>Genre</span>
                        <input v-model="draft.Genre" type="text" list="ap-genres" />
                        <datalist id="ap-genres">
                            <option v-for="g in genres" :key="g" :value="g" />
                        </datalist>
                    </label>
                    <label class="ap-field">
                        <span>Reading order</span>
                        <input v-model.number="draft.ReadingOrder" type="number" min="1" />
                    </label>
                    <div class="ap-field">
                        <span>Color</span>
                        <div class="ap-colour">
                            <input
                                type="color"
                                :value="draft.Color || '#6366f1'"
                                :class="{ 'ap-colour--unset': !draft.Color }"
                                :data-tip="draft.Color ? undefined : 'No color yet — pick one'"
                                @input="draft.Color = ($event.target as HTMLInputElement).value"
                            />
                            <button v-if="draft.Color" class="ap-icon" aria-label="No color" data-tip="No color" @click="draft.Color = null"><PhX :size="14" /></button>
                        </div>
                    </div>
                    <label class="ap-field">
                        <span>Previous story</span>
                        <select v-model="draft.PreviousStoryId" data-tip="Whatever followed it before no longer does">
                            <option :value="null">—</option>
                            <option v-if="unlisted(draft.PreviousStoryId)" :value="draft.PreviousStoryId">A story from another timeline</option>
                            <option v-for="s in others.filter(s => s.Id !== draft!.NextStoryId)" :key="s.Id" :value="s.Id">{{ s.Title || 'Untitled' }}</option>
                        </select>
                    </label>
                    <label class="ap-field">
                        <span>Next story</span>
                        <select v-model="draft.NextStoryId" data-tip="That story's previous becomes this one">
                            <option :value="null">—</option>
                            <option v-if="unlisted(draft.NextStoryId)" :value="draft.NextStoryId">A story from another timeline</option>
                            <option v-for="s in others.filter(s => s.Id !== draft!.PreviousStoryId)" :key="s.Id" :value="s.Id">{{ s.Title || 'Untitled' }}</option>
                        </select>
                    </label>
                    <div class="ap-field">
                        <span>Span</span>
                        <p class="ap-derived" data-tip="From the first to the last item in this timeline that cites it">{{ span || 'No item cites it yet' }}</p>
                    </div>
                </div>

                <label class="ap-field">
                    <span>Summary</span>
                    <textarea v-model="draft.Description" rows="3" />
                </label>

                <div class="ap-field">
                    <span>Characters</span>
                    <div class="ap-chips">
                        <span v-for="(c, n) in draft.Characters" :key="c.CharacterId" class="ap-chip">
                            <button
                                class="ap-pov"
                                :class="{ 'ap-pov--on': c.Pov }"
                                :data-tip="c.Pov ? 'A point-of-view character' : 'Make them a point-of-view character'"
                                @click="c.Pov = !c.Pov"
                            >POV</button>
                            {{ characterName(c.CharacterId) }}
                            <button class="ap-chip-x" aria-label="Remove" @click="draft.Characters!.splice(n, 1)"><PhX :size="12" /></button>
                        </span>
                        <select
                            v-if="castLeft.length"
                            class="ap-add"
                            @change="picked($event, id => draft!.Characters!.push({ CharacterId: id, Pov: false }))"
                        >
                            <option value="">+ Add character</option>
                            <option v-for="c in castLeft" :key="c.Id" :value="c.Id">{{ c.Name }}</option>
                        </select>
                    </div>
                </div>

                <div class="ap-field">
                    <span>Places</span>
                    <p v-if="!hasPlaces" class="ap-derived">Pin places on a map first.</p>
                    <div v-else class="ap-chips">
                        <span
                            v-for="(id, n) in draft.LocationIds"
                            :key="id"
                            class="ap-chip"
                            :data-tip="places.get(id)?.map"
                        >
                            {{ places.get(id)?.name ?? (trashed.has(id) ? 'A place in the trash' : 'Unknown place') }}
                            <button class="ap-chip-x" aria-label="Remove" @click="draft.LocationIds!.splice(n, 1)"><PhX :size="12" /></button>
                        </span>
                        <select class="ap-add" @change="picked($event, id => draft!.LocationIds!.push(id))">
                            <option value="">+ Add place</option>
                            <!-- By map, so two towns of one name on different maps can be told apart. -->
                            <optgroup v-for="m in maps" :key="m.Id" :label="m.Name">
                                <option
                                    v-for="l in m.Locations.filter(l => !placeIds.has(l.Id))"
                                    :key="l.Id"
                                    :value="l.Id"
                                >{{ l.Name }}</option>
                            </optgroup>
                        </select>
                    </div>
                </div>

                <div class="ap-field">
                    <span>Books</span>
                    <div class="ap-books">
                        <div v-for="(id, n) in draft.BookIds" :key="id" class="ap-book">
                            <span class="ap-chip">
                                {{ bookLabel(id) }}
                                <button class="ap-chip-x" aria-label="Remove" @click="draft.BookIds!.splice(n, 1)"><PhX :size="12" /></button>
                            </span>
                            <div v-if="chaptersOf(id).length" class="ap-chips">
                                <span class="ap-picks" data-tip="The chapters it is told in — none picked means the whole book">Chapters</span>
                                <button
                                    v-for="c in chaptersOf(id)"
                                    :key="c.Id"
                                    class="ap-pov"
                                    :class="{ 'ap-pov--on': chapterIds.has(c.Id) }"
                                    :aria-pressed="chapterIds.has(c.Id)"
                                    :data-tip="c.Title ? `${c.Number}. ${c.Title}` : `Chapter ${c.Number}`"
                                    @click="toggleChapter(c.Id)"
                                >{{ c.Number }}</button>
                            </div>
                        </div>
                        <select v-if="booksLeft.length" class="ap-add" @change="picked($event, id => draft!.BookIds!.push(id))">
                            <option value="">+ Add book</option>
                            <option v-for="b in booksLeft" :key="b.Id" :value="b.Id">{{ b.Title }}</option>
                        </select>
                        <span v-else-if="!draft.BookIds?.length" class="ap-derived">No books yet.</span>
                    </div>
                </div>

                <div class="ap-field">
                    <span>Memorable quotes</span>
                    <figure
                        v-for="(q, n) in quotes"
                        :key="n"
                        class="ap-quote"
                        role="button"
                        tabindex="0"
                        data-tip="Edit the quote"
                        @click="editing = n"
                        @keydown.enter.self="editing = n"
                    >
                        <!-- Speaker first, so an exchange can set them in a column ahead of the lines. -->
                        <blockquote :class="{ 'ap-quote--exchange': q.length > 1 }">
                            <p v-for="(l, k) in q" :key="k" class="ap-quote-line">
                                <cite v-if="l.speaker">{{ l.speaker }}</cite>
                                <span>{{ l.text }}</span>
                            </p>
                        </blockquote>
                        <button class="ap-icon ap-icon--danger" aria-label="Remove the quote" data-tip="Remove" @click.stop="quotes.splice(n, 1)"><PhX :size="14" /></button>
                    </figure>
                    <button class="ap-btn ap-btn--small" @click="editing = quotes.length"><PhPlus :size="13" /> Add quote</button>
                </div>

                <label class="ap-field">
                    <span>Notes</span>
                    <textarea v-model="draft.Notes" rows="3" />
                </label>

                <details v-if="draft.Id" class="ap-fold">
                    <summary>Referenced in <span>{{ cited.length }}</span></summary>
                    <p v-if="!cited.length" class="ap-derived">No item in this timeline cites it yet — link it from the item editor.</p>
                    <ArchiveItemLinks
                        v-else
                        :items="cited"
                        :timeline-id="timelineId"
                        :when="when"
                        @jump="emit('jump', $event)"
                        @trash="emit('trashItem', $event)"
                    />
                </details>
            </section>

            <footer v-if="draft" class="ap-bar">
                <button
                    class="ap-btn ap-btn--primary"
                    :disabled="saving || !draft.Title.trim()"
                    :data-tip="draft.Title.trim() ? undefined : 'It needs a title first'"
                    @click="save"
                ><PhFloppyDisk :size="15" /> {{ saving ? 'Saving…' : 'Save' }}</button>
                <button
                    class="ap-btn ap-btn--danger"
                    :disabled="saving"
                    :data-tip="draft.Id ? 'To the trash — deleted from every timeline when the Archive closes' : undefined"
                    @click="remove"
                ><PhTrash :size="15" /> {{ draft.Id ? 'Delete' : 'Discard' }}</button>
            </footer>
        </div>

        <StoryQuoteModal
            v-if="editing !== null"
            :quote="quotes[editing] ?? []"
            :names="speakers"
            @save="setQuote"
            @close="editing = null"
        />
        <ConfirmModal
            v-if="pending"
            title="Discard changes?"
            message="The story you have open has unsaved changes."
            confirm-label="Discard" cancel-label="Keep editing" danger
            @confirm="discard" @cancel="pending = null"
        />
    </div>
</template>

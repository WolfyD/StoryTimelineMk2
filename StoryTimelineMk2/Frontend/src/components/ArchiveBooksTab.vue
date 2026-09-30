<script setup lang="ts">
/**
 * BL-88: the Archive's Books tab — book, chapters, and the items citing each chapter. Laid out like
 * the Stories tab. A chapter's delete goes to the Archive's trash like a book's; an unsaved one just drops.
 */
import { computed, ref, watch } from 'vue'
import { PhBookOpenText, PhBooks, PhFloppyDisk, PhMagnifyingGlass, PhPlus, PhTrash } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { useSideWidth } from '@/composables/useSideWidth'
import type { TrashEntry } from '@/utils/archiveItems'
import ArchiveItemLinks from '@/components/ArchiveItemLinks.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import type { Book, Chapter, Story, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** Already cut to what this timeline lists, the trashed books left out. */
    books: Book[]
    /** The Stories tab's list — each chapter shows the ones told in it. */
    stories: Story[]
    /** This timeline's items not in the trash, by id. */
    items: Map<string, TimelineItem>
    /** Trashed ids of any kind — the chapters among them drop out of the open book. */
    trashed: Set<string>
    when: (i: Pick<TimelineItem, 'AbsoluteStart' | 'AbsoluteEnd'>) => string
}>()
const emit = defineEmits<{
    jump: [TimelineItem]
    trashItem: [TimelineItem]
    trash: [TrashEntry]
    error: [what: string, ex: unknown]
    openStory: [id: string]
}>()

const { width: listWidth, startResize } = useSideWidth('archiveSideWidth')

const search = ref('')
const draft = ref<Book | null>(null)
/** Each saved chapter as it was loaded or last saved, so a save sends only what changed. */
let saved = new Map<string, string>()
const saving = ref(false)

const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return needle
        ? props.books.filter(b => [b.Title, b.Author, b.Description].some(f => f?.toLowerCase().includes(needle)))
        : props.books
})

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const chapterKey = (c: Chapter) => `${c.Number}\u0000${c.Title ?? ''}`

function rowSub(b: Book) {
    const chapters = (b.Chapters ?? []).filter(c => !props.trashed.has(c.Id))
    return [b.Author, plural(chapters.length, 'chapter')].filter(Boolean).join(' · ')
}

// As the Stories tab: an unlisted book with unsaved changes stays open.
watch(() => props.books, list => {
    const id = draft.value?.Id
    if (id && !list.some(b => b.Id === id) && (props.trashed.has(id) || !isDirty())) draft.value = null
})

function select(b: Book) {
    const copy: Book = JSON.parse(JSON.stringify(b))
    copy.Chapters ??= []
    draft.value = copy
    saved = new Map(copy.Chapters.map(c => [c.Id, chapterKey(c)]))
    clean = snap()
}

function newBook() {
    draft.value = { Id: '', Title: '', Author: null, Description: null, Chapters: [] }
    saved = new Map()
    clean = snap()
}

// ── Unsaved changes ───────────────────────────────────────────────────────────

/** The open book as last loaded or saved. Ids left out: a save fills them in without an edit. */
let clean = ''
const snap = () => JSON.stringify(draft.value, (k, v) => k === 'Id' || k === 'BookId' ? undefined : v)
const isDirty = () => !!draft.value && snap() !== clean
/** What to do once the writer agrees to drop the open book's changes. */
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

function pick(b: Book) {
    if (draft.value?.Id !== b.Id) guard(() => select(b))
}
defineExpose({ isDirty, newBook: () => guard(newBook) })

const chapters = computed(() => draft.value?.Chapters?.filter(c => !props.trashed.has(c.Id)) ?? [])

/** From the books as last loaded, not the open copy: an item linked since then shows without a reopen. */
const citedBy = computed(() => new Map(props.books.flatMap(b => b.Chapters ?? []).map(c => [c.Id, c.ItemIds ?? []])))

/** Chapter id → the stories told in it. Picked in the Stories tab, which is where a chip opens them. */
const toldIn = computed(() => {
    const m = new Map<string, Story[]>()
    for (const s of props.stories) for (const id of s.ChapterIds ?? []) m.set(id, [...(m.get(id) ?? []), s])
    return m
})

function citing(c: Chapter) {
    return (citedBy.value.get(c.Id) ?? []).flatMap(id => props.items.get(id) ?? []).sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
}

function addChapter() {
    const next = Math.max(0, ...chapters.value.map(c => c.Number || 0)) + 1
    draft.value!.Chapters!.push({ Id: '', BookId: draft.value!.Id, Number: next, Title: null, ItemIds: [] })
}

function removeChapter(c: Chapter) {
    if (!c.Id) {
        draft.value!.Chapters!.splice(draft.value!.Chapters!.indexOf(c), 1)
        return
    }
    const book = props.books.find(b => b.Id === draft.value!.Id)
    const was = book?.Chapters?.find(x => x.Id === c.Id) ?? c
    emit('trash', { kind: 'chapter', id: c.Id, title: `${was.Number}. ${was.Title || 'Untitled'}`, sub: book?.Title })
}

// ── Save / delete ─────────────────────────────────────────────────────────────

async function save() {
    const b = draft.value
    if (!b || !b.Title.trim()) return
    saving.value = true
    // An emptied number box reads back as ''.
    for (const c of chapters.value) if (typeof c.Number !== 'number') c.Number = 0
    // Taken before the wait, so a keystroke that lands during the save still counts as unsaved; the
    // chapters and their record too, so a book opened during the wait is not written into.
    const sent = snap()
    const list = chapters.value
    const was = saved
    try {
        const result = await BackendAPI.SaveBook({ Id: b.Id, Title: b.Title.trim(), Author: b.Author, Description: b.Description })
        if (result?.status !== 'ok') throw new Error('The book was not saved.')
        b.Id = result.book.Id
        // One at a time, each marked saved as it lands: a failure part-way leaves the rest to send again.
        for (const c of list) {
            if (c.Id && was.get(c.Id) === chapterKey(c)) continue
            const r = await BackendAPI.SaveChapter({ Id: c.Id, BookId: b.Id, Number: c.Number, Title: c.Title?.trim() || null })
            if (r?.status !== 'ok') throw new Error(`Chapter ${c.Number} was not saved.`)
            c.Id = r.chapter.Id
            c.BookId = b.Id
            was.set(c.Id, chapterKey(c))
        }
        if (draft.value === b) clean = sent
    } catch (ex) {
        emit('error', 'Could not save the book', ex)
    } finally {
        saving.value = false
    }
}

function remove() {
    const b = draft.value
    if (!b) return
    const book = props.books.find(x => x.Id === b.Id)
    if (book) emit('trash', { kind: 'book', id: book.Id, title: book.Title || 'Untitled', sub: rowSub(book) })
    draft.value = null
}
</script>

<template>
    <div class="ap-body" :style="{ gridTemplateColumns: `${listWidth}px 5px 1fr` }">
        <aside class="ap-list">
            <div class="ap-list-head">
                <label class="ap-search">
                    <PhMagnifyingGlass :size="15" />
                    <input v-model="search" type="text" placeholder="Search books…" />
                </label>
                <button class="ap-btn ap-btn--primary" aria-label="New book" data-tip="New book" @click="guard(newBook)"><PhPlus :size="16" /></button>
            </div>
            <p class="ap-shared">Books belong to every timeline. Listed: the ones this timeline uses, and any nobody uses yet.</p>

            <p v-if="!books.length" class="ap-empty">No books yet. Add the first one.</p>
            <p v-else-if="!filtered.length" class="ap-empty">Nothing matches “{{ search }}”.</p>
            <ul v-else class="ap-rows">
                <li
                    v-for="b in filtered"
                    :key="b.Id"
                    class="ap-row"
                    :class="{ 'ap-row--selected': draft?.Id === b.Id }"
                    @click="pick(b)"
                >
                    <span class="ap-row-text">
                        <span class="ap-row-name">{{ b.Title || 'Untitled' }}</span>
                        <span class="ap-row-sub">{{ rowSub(b) }}</span>
                    </span>
                </li>
            </ul>
        </aside>
        <div class="side-grip" data-tip="Drag to resize" @pointerdown="startResize" />

        <div class="ap-pane">
            <section v-if="!draft" class="ap-detail ap-detail--blank">
                <PhBooks :size="48" weight="thin" />
                <p>Pick a book, or add a new one.</p>
            </section>

            <section v-else class="ap-detail">
                <p v-if="draft.OtherTimelineRefs" class="ap-note">
                    Other timelines cite this book too ({{ plural(draft.OtherTimelineRefs, 'item') }}), so a change
                    here reaches them. The items listed under each chapter are this timeline's.
                </p>

                <div class="ap-grid">
                    <label class="ap-field">
                        <span>Title</span>
                        <input v-model="draft.Title" type="text" placeholder="Needed to save" />
                    </label>
                    <label class="ap-field">
                        <span>Author</span>
                        <input v-model="draft.Author" type="text" />
                    </label>
                </div>
                <label class="ap-field">
                    <span>Description</span>
                    <textarea v-model="draft.Description" rows="3" />
                </label>

                <div class="ap-field">
                    <span>Chapters</span>
                    <p v-if="!chapters.length" class="ap-derived">No chapters yet.</p>
                    <div v-for="(c, n) in chapters" :key="c.Id || `new${n}`" class="ap-chapter">
                        <div class="ap-chapter-head">
                            <input v-model.number="c.Number" type="number" min="0" class="ap-chapter-no" aria-label="Number" />
                            <input v-model="c.Title" type="text" placeholder="Title" aria-label="Title" />
                            <button
                                class="ap-icon ap-icon--danger"
                                :aria-label="c.Id ? 'Move to the trash' : 'Discard'"
                                :data-tip="c.Id ? 'Move to the trash' : 'Discard'"
                                @click="removeChapter(c)"
                            ><PhTrash :size="15" /></button>
                        </div>
                        <div v-if="toldIn.get(c.Id)" class="ap-chips">
                            <button
                                v-for="s in toldIn.get(c.Id)"
                                :key="s.Id"
                                class="ap-chip ap-chip--link"
                                data-tip="Open the story"
                                @click="emit('openStory', s.Id)"
                            ><PhBookOpenText :size="13" :style="s.Color ? { color: s.Color } : undefined" /> {{ s.Title || 'Untitled' }}</button>
                        </div>
                        <details v-if="c.Id" class="ap-fold">
                            <summary>Items <span>{{ citing(c).length }}</span></summary>
                            <p v-if="!citing(c).length" class="ap-derived">No item in this timeline cites it — link it from the item editor.</p>
                            <ArchiveItemLinks
                                v-else
                                :items="citing(c)"
                                :timeline-id="timelineId"
                                :when="when"
                                @jump="emit('jump', $event)"
                                @trash="emit('trashItem', $event)"
                            />
                        </details>
                    </div>
                    <button class="ap-btn ap-btn--small" @click="addChapter"><PhPlus :size="13" /> Add chapter</button>
                </div>
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
                    :data-tip="draft.Id ? 'To the trash, chapters and all — deleted from every timeline when the Archive closes' : undefined"
                    @click="remove"
                ><PhTrash :size="15" /> {{ draft.Id ? 'Delete' : 'Discard' }}</button>
            </footer>
        </div>

        <ConfirmModal
            v-if="pending"
            title="Discard changes?"
            message="The book you have open has unsaved changes."
            confirm-label="Discard" cancel-label="Keep editing" danger
            @confirm="discard" @cancel="pending = null"
        />
    </div>
</template>

<script setup lang="ts">
/**
 * BL-88: the Archive's Notes tab — the timeline's Notes panel as a list: the `notes` table, not the
 * Note items. A note's date jumps the timeline there; the text is edited in place, like the panel does.
 */
import { computed, nextTick, ref } from 'vue'
import { PhCrosshair, PhMagnifyingGlass, PhNotepad, PhPencilSimple, PhTrash } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import type { TrashEntry } from '@/utils/archiveItems'
import ConfirmModal from '@/components/ConfirmModal.vue'
import type { TimelineNote } from '@/types/models'

const props = defineProps<{
    /** Not in the trash, earliest first. */
    notes: TimelineNote[]
    dateOf: (at: number) => string
}>()
const emit = defineEmits<{
    trash: [TrashEntry]
    error: [what: string, ex: unknown]
}>()

const store = useTimelineStore()

const query = ref('')
const rows = computed(() => {
    const q = query.value.trim().toLowerCase()
    return q ? props.notes.filter(n => n.NoteContents.toLowerCase().includes(q)) : props.notes
})

// ponytail: the note's own id — the timeline pulses nothing for it, it just goes there.
function jump(n: TimelineNote) {
    BackendAPI.FocusTimelineItem(n.Id, n.AbsoluteTime).catch(ex => emit('error', 'Could not reach the timeline window', ex))
}

const editingId = ref<string | null>(null)
const draft = ref('')
const busy = ref(false)
const list = ref<HTMLElement | null>(null)

const isDirty = () => editingId.value !== null && draft.value !== props.notes.find(n => n.Id === editingId.value)?.NoteContents
defineExpose({ isDirty })
/** The note to open once the writer agrees to drop the open one's changes. */
const pending = ref<TimelineNote | null>(null)

function startEdit(n: TimelineNote) {
    pending.value = null
    editingId.value = n.Id
    draft.value = n.NoteContents
    void nextTick(() => list.value?.querySelector<HTMLTextAreaElement>('.an-edit textarea')?.focus())
}

function edit(n: TimelineNote) {
    if (editingId.value === n.Id) return
    if (isDirty()) pending.value = n
    else startEdit(n)
}

async function save(n: TimelineNote) {
    const updated = { ...n, NoteContents: draft.value.trim(), UpdatedAt: new Date().toISOString() }
    busy.value = true
    try {
        await BackendAPI.SaveNote(updated)
        store.updateNote(updated)   // the NoteSaved broadcast brings it too; this is just sooner
        editingId.value = null
    } catch (ex) {
        emit('error', 'Could not save the note', ex)   // stays in edit, so the text is not lost
    } finally {
        busy.value = false
    }
}

function toTrash(n: TimelineNote) {
    if (editingId.value === n.Id) editingId.value = null
    const first = n.NoteContents.split('\n')[0]!.trim()
    emit('trash', { kind: 'note', id: n.Id, title: first || 'Empty note', sub: props.dateOf(n.AbsoluteTime) })
}
</script>

<template>
    <div class="an-root">
        <div class="ar-tools">
            <label class="ar-search">
                <PhMagnifyingGlass :size="15" />
                <input v-model="query" type="text" placeholder="Search notes…" />
            </label>
        </div>
        <p class="an-what">The notes from the timeline's Notes panel. Note items are under Timeline items.</p>

        <p v-if="!rows.length" class="ar-empty">{{ query ? `Nothing matches “${query}”.` : 'No notes yet. Add them in the timeline’s Notes panel.' }}</p>

        <ul v-else ref="list" class="ar-rows">
            <li v-for="n in rows" :key="n.Id" class="ar-row">
                <div class="ar-row-head">
                    <PhNotepad :size="18" class="ar-row-icon" />
                    <button class="ar-row-title" data-tip="Jump there on the timeline" @click="jump(n)">{{ dateOf(n.AbsoluteTime) }}</button>
                    <span class="ar-row-actions">
                        <button class="ar-icon" aria-label="Jump there" data-tip="Jump there on the timeline" @click="jump(n)"><PhCrosshair :size="18" /></button>
                        <button class="ar-icon" aria-label="Edit" data-tip="Edit" @click="edit(n)"><PhPencilSimple :size="18" /></button>
                        <button class="ar-icon ar-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="toTrash(n)"><PhTrash :size="18" /></button>
                    </span>
                </div>
                <div v-if="editingId === n.Id" class="an-edit ap-field">
                    <textarea v-model="draft" rows="4" aria-label="Note" :disabled="busy" @keydown.esc.prevent.stop="editingId = null" />
                    <div class="an-bar">
                        <button class="ap-btn ap-btn--small" :disabled="busy" @click="editingId = null">Cancel</button>
                        <button class="ap-btn ap-btn--small ap-btn--primary" :disabled="busy || !draft.trim()" @click="save(n)">Save</button>
                    </div>
                </div>
                <p v-else class="an-text">{{ n.NoteContents }}</p>
            </li>
        </ul>

        <ConfirmModal
            v-if="pending"
            title="Discard changes?"
            message="The note you have open has unsaved changes."
            confirm-label="Discard" cancel-label="Keep editing" danger
            @confirm="startEdit(pending)" @cancel="pending = null"
        />
    </div>
</template>

<style scoped lang="scss">
.an-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.an-what {
    margin: 6px 12px 0;
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.an-text {
    margin: 4px 0 0 25px;
    font-size: 0.8rem;
    white-space: pre-wrap;
    color: var(--app-text-muted, #94a3b8);
    user-select: text;
}

.an-edit {
    margin: 6px 0 0 25px;
    user-select: text;
}

.an-bar {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
}
</style>

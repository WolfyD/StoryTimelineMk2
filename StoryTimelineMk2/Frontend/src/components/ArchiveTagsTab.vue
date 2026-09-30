<script setup lang="ts">
/**
 * BL-88: the Archive's Tags tab. A row folds out to the items carrying the tag. Renaming takes effect at
 * once, and renaming onto another tag's name merges the two after a confirm. Delete goes through the
 * session trash like everything else here.
 */
import { computed, nextTick, ref } from 'vue'
import { PhCaretRight, PhMagnifyingGlass, PhPencilSimple, PhTag, PhTrash } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ArchiveItemLinks from '@/components/ArchiveItemLinks.vue'
import type { TrashEntry } from '@/utils/archiveItems'
import type { TimelineItem } from '@/types/models'

type TagRow = { Id: number; Name: string; UsageCount: number }

const props = defineProps<{
    timelineId: number
    /** Every tag, with the number of items carrying it across all timelines. */
    tags: TagRow[]
    /** Tag id → this timeline's items carrying it (not in the trash), earliest first. */
    refs: Map<string, TimelineItem[]>
    /** Tag id → how many of this timeline's items carry it, the trashed ones too. */
    local: Map<number, number>
    trashed: Set<string>
    when: (i: TimelineItem) => string
}>()
const emit = defineEmits<{
    jump: [TimelineItem]
    'trash-item': [TimelineItem]
    trash: [TrashEntry]
    error: [what: string, ex: unknown]
}>()

const trashId = (t: TagRow) => `tag:${t.Id}`
const here = (t: TagRow) => props.refs.get(String(t.Id)) ?? []
const elsewhere = (t: TagRow) => Math.max(0, t.UsageCount - (props.local.get(t.Id) ?? 0))

const query = ref('')
const sort = ref<'name' | 'used'>('name')
/** The tags this timeline uses, and the ones nobody does — same rule as stories and pictures. */
const rows = computed(() => {
    const q = query.value.trim().toLowerCase()
    const list = props.tags.filter(t =>
        !props.trashed.has(trashId(t)) && (props.local.has(t.Id) || t.UsageCount === 0) && (!q || t.Name.includes(q)))
    return sort.value === 'used' ? list.sort((a, b) => here(b).length - here(a).length || a.Name.localeCompare(b.Name)) : list
})

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const meta = (t: TagRow) => t.UsageCount === 0
    ? 'unused'
    : [plural(here(t).length, 'item'), elsewhere(t) ? `${elsewhere(t)} in other timelines` : ''].filter(Boolean).join(' · ')

const openId = ref<number | null>(null)
const toggle = (id: number) => { openId.value = openId.value === id ? null : id }

// ── Rename, and merge ─────────────────────────────────────────────────────────

const editingId = ref<number | null>(null)
const draft = ref('')
const busy = ref(false)
const list = ref<HTMLElement | null>(null)
/** Set while the merge is being confirmed. */
const mergeAsk = ref<{ from: TagRow; into: TagRow } | null>(null)

/** Tags are stored lowercased and trimmed, so this is the name the draft would end up as. */
const normalised = computed(() => draft.value.trim().toLowerCase())
/** Another tag already wearing the draft's name: committing merges into it. */
const clash = computed(() => props.tags.find(t => t.Name === normalised.value && t.Id !== editingId.value) ?? null)

function startRename(t: TagRow) {
    editingId.value = t.Id
    draft.value = t.Name
    void nextTick(() => list.value?.querySelector<HTMLInputElement>('.at-rename input')?.select())
}

const stopRename = () => { editingId.value = null }

function commit(t: TagRow) {
    if (busy.value) return
    if (!normalised.value || normalised.value === t.Name) return stopRename()
    if (clash.value) {
        // Merging into a tag that is about to be deleted would only move the links into the trash.
        if (props.trashed.has(trashId(clash.value))) return
        // Out of the input, whose own Esc would otherwise cancel the rename under the dialog instead of it.
        list.value?.querySelector<HTMLInputElement>('.at-rename input')?.blur()
        mergeAsk.value = { from: t, into: clash.value }
        return
    }
    void run('Could not rename the tag', () => BackendAPI.RenameTag(t.Id, normalised.value))
}

async function merge() {
    const ask = mergeAsk.value!
    mergeAsk.value = null
    await run(`Could not merge “${ask.from.Name}” into “${ask.into.Name}”`, () => BackendAPI.MergeTag(ask.from.Id, ask.into.Id))
}

/** The store and the list follow by the TagsChanged broadcast, so all that is left here is the input. */
async function run(what: string, go: () => Promise<unknown>) {
    busy.value = true
    try {
        await go()
        stopRename()
    } catch (ex) {
        emit('error', what, ex)   // stays open, so the typed name is not lost
    } finally {
        busy.value = false
    }
}

function toTrash(t: TagRow) {
    if (editingId.value === t.Id) stopRename()
    emit('trash', { kind: 'tag', id: trashId(t), title: t.Name, sub: `on ${plural(t.UsageCount, 'item')}` })
}
</script>

<template>
    <div class="at-root">
        <div class="ar-tools">
            <label class="ar-search">
                <PhMagnifyingGlass :size="15" />
                <input v-model="query" type="text" placeholder="Search tags…" />
            </label>
            <select v-model="sort" class="ar-sort" aria-label="Sort by" data-tip="Sort by">
                <option value="name">Name</option>
                <option value="used">Most used</option>
            </select>
        </div>
        <p class="at-shared">Tags belong to every timeline — a rename, merge or delete reaches all of them. Listed: the ones used here, and the ones nobody uses.</p>

        <p v-if="!rows.length" class="ar-empty">{{ query ? `Nothing matches “${query}”.` : 'No tags yet. Add them to items in the edit window.' }}</p>

        <ul v-else ref="list" class="ar-rows">
            <li v-for="t in rows" :key="t.Id" :data-id="t.Id" class="ar-row">
                <div class="ar-row-head">
                    <PhTag :size="18" class="ar-row-icon" />
                    <span class="ar-text">
                        <label v-if="editingId === t.Id" class="at-rename">
                            <input
                                v-model="draft"
                                type="text"
                                aria-label="New name"
                                :disabled="busy"
                                @keydown.enter.prevent="commit(t)"
                                @keydown.esc.prevent.stop="stopRename"
                            />
                            <span v-if="clash && trashed.has(`tag:${clash.Id}`)" class="at-hint at-hint--warn">“{{ clash.Name }}” is in the trash. Restore it to merge into it.</span>
                            <span v-else-if="clash" class="at-hint">Enter merges it into “{{ clash.Name }}” · Esc cancels</span>
                            <span v-else class="at-hint">Enter renames · Esc cancels</span>
                        </label>
                        <template v-else>
                            <button class="ar-row-title" :aria-expanded="openId === t.Id" data-tip="The items carrying it" @click="toggle(t.Id)">
                                <PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': openId === t.Id }" />
                                {{ t.Name }}
                            </button>
                            <span class="ar-row-date">{{ meta(t) }}</span>
                        </template>
                    </span>
                    <span class="ar-row-actions">
                        <button class="ar-icon" aria-label="Rename" data-tip="Rename — onto another tag's name to merge them" @click="editingId === t.Id ? stopRename() : startRename(t)"><PhPencilSimple :size="18" /></button>
                        <button class="ar-icon ar-icon--danger" aria-label="Move to the trash" data-tip="Move to the trash" @click="toTrash(t)"><PhTrash :size="18" /></button>
                    </span>
                </div>

                <div v-if="openId === t.Id" class="ar-fold at-fold">
                    <p v-if="!here(t).length" class="ap-derived">No item here carries it.</p>
                    <ArchiveItemLinks v-else :items="here(t)" :timeline-id="timelineId" :when="when" @jump="emit('jump', $event)" @trash="emit('trash-item', $event)" />
                </div>
            </li>
        </ul>

        <ConfirmModal
            v-if="mergeAsk"
            :title="`Merge into “${mergeAsk.into.Name}”?`"
            :message="`Every item tagged “${mergeAsk.from.Name}” is tagged “${mergeAsk.into.Name}” instead, in every timeline, and “${mergeAsk.from.Name}” is gone. This happens now — it does not wait for the Archive to close.`"
            confirm-label="Merge" cancel-label="Cancel"
            @confirm="merge" @cancel="mergeAsk = null"
        />
    </div>
</template>

<style scoped lang="scss">
.at-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.at-shared {
    margin: 6px 12px 0;
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.at-rename {
    display: flex;
    flex-direction: column;
    gap: 2px;

    input {
        width: 260px;
        max-width: 100%;
        border-radius: var(--app-radius-sm, 4px);
        border: 1px solid var(--app-accent, #6366f1);
        background: var(--app-bg, #0f172a);
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.85rem;
        padding: 3px 6px;
        outline: none;
    }
}

.at-hint {
    font-size: 0.7rem;
    color: var(--app-text-dim, #64748b);

    &--warn { color: #f59e0b; }
}

// No picture to clear here, unlike the Media and Characters rows.
.at-fold { margin-left: 25px; }
</style>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { PhX, PhTrash, PhMinus, PhPlus } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { ALL_LODS_MASK, loadDefaultLodMask } from '@/utils/timelinePrefs'
import type { TimelineItem } from '@/types/models'

const emit = defineEmits<{ close: [] }>()
const store = useTimelineStore()

// ponytail: Picture needs an image and Bookmark is a canvas right-click thing — neither fits a quick-add list
const TYPES = [
    { id: 1, name: 'Event' },
    { id: 2, name: 'Period' },
    { id: 3, name: 'Age' },
    { id: 5, name: 'Note' },
]
const RANGE_TYPES = new Set([2, 3])

type Draft = { title: string; typeId: number; year: number; endYear: number }

const title = ref('')
const typeId = ref(1)
const year = ref<number | null>(null)
const endYear = ref<number | null>(null)
const endTouched = ref(false)          // once the user types a To year it stops following From + 1
const rememberYear = ref(true)
const queue = ref<Draft[]>([])
const editIndex = ref<number | null>(null)
const busy = ref(false)
const error = ref('')
const showDiscard = ref(false)
const lodMask = ref(ALL_LODS_MASK)

const isRange = computed(() => RANGE_TYPES.has(typeId.value))
const typeName = (id: number) => TYPES.find(t => t.id === id)?.name ?? '?'

onMounted(async () => {
    focusTitle()
    lodMask.value = await loadDefaultLodMask(store.currentProject.Id)
})

function focusTitle() {
    nextTick(() => (document.querySelector('.ma-title') as HTMLInputElement | null)?.focus())
}

// To year starts at From + 1 and tracks it until the user edits it.
watch([year, isRange], () => {
    if (isRange.value && !endTouched.value) endYear.value = typeof year.value === 'number' ? year.value + 1 : null
})

function stepYear(delta: number) {
    year.value = (Number(year.value) || 0) + delta
}

function stepEndYear(delta: number) {
    endTouched.value = true
    endYear.value = (Number(endYear.value) || 0) + delta
}

// Shift + / Shift − step the year from anywhere in the modal, so title → Shift+ → Enter needs no tabbing.
function onKeydown(e: KeyboardEvent) {
    if (!e.shiftKey) return
    const plus = e.key === '+' || e.code === 'NumpadAdd'
    const minus = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract'
    if (!plus && !minus) return
    e.preventDefault()
    stepYear(plus ? 1 : -1)
}

function resetForm() {
    title.value = ''
    editIndex.value = null
    endTouched.value = false
    year.value = rememberYear.value ? year.value : null
    endYear.value = isRange.value && typeof year.value === 'number' ? year.value + 1 : null
    focusTitle()
}

function submit() {
    error.value = ''
    const t = title.value.trim()
    if (!t) { error.value = 'Title is required.'; return }
    if (typeof year.value !== 'number') { error.value = 'Year is required.'; return }
    let start = year.value
    let end = isRange.value ? endYear.value : start
    if (typeof end !== 'number') { error.value = 'End year is required.'; return }
    // Ranges: order the two years, and a zero-length range becomes one year long.
    if (end < start) [start, end] = [end, start]
    if (isRange.value && end === start) end = start + 1
    const draft: Draft = { title: t, typeId: typeId.value, year: start, endYear: end }
    if (editIndex.value === null) queue.value.push(draft)
    else queue.value[editIndex.value] = draft
    resetForm()
}

function edit(i: number) {
    if (busy.value) return
    const d = queue.value[i]!
    editIndex.value = i
    title.value = d.title
    typeId.value = d.typeId
    endTouched.value = true
    year.value = d.year
    endYear.value = RANGE_TYPES.has(d.typeId) ? d.endYear : null
    error.value = ''
    focusTitle()
}

function remove(i: number) {
    queue.value.splice(i, 1)
    if (editIndex.value === i) resetForm()
    else if (editIndex.value !== null && editIndex.value > i) editIndex.value--
}

// Same defaults a new item gets in the edit window, at year granularity.
function toItem(d: Draft): TimelineItem {
    return {
        Id: crypto.randomUUID(), Title: d.title,
        Description: '', Content: '', StoryId: null,
        TypeId: d.typeId,
        Year: d.year, AbsoluteStart: d.year,
        EndYear: d.endYear, AbsoluteEnd: d.endYear,
        BookTitle: '', Chapter: '', Page: '',
        Color: store.settings?.DefaultItemColor ?? '#4b5563',
        CreationGranularity: store.lodProfile.find(l => l.formatKey.toLowerCase().includes('year'))?.index ?? 3,
        TimelineId: store.currentProject.Id,
        ItemIndex: 0, ShowInNotes: true, Importance: 5, MinLodLevel: 3,
        LodVisibilityMask: lodMask.value,
    }
}

async function finish() {
    if (!queue.value.length || busy.value) return
    busy.value = true
    error.value = ''
    editIndex.value = null
    let saved = 0
    // Sequential on purpose: the backend picks each item's side from what is already saved.
    for (let d = queue.value[0]; d; d = queue.value[0]) {
        try {
            const result = await BackendAPI.SaveItem(toItem(d), [], [], [], [])
            if (result?.status !== 'ok') throw new Error(result?.message ?? 'no response')
        } catch (e) {
            console.error('[MassAddItemsModal] SaveItem failed:', d, e)
            error.value = `Saving "${d.title}" failed: ${e instanceof Error ? e.message : e}. ${saved} item(s) before it were saved; the rest are still listed.`
            break
        }
        queue.value.shift()
        saved++
    }
    if (saved) await store.loadTimelineData(store.currentProject.Id)
    busy.value = false
    if (!queue.value.length) emit('close')
}

function tryClose() {
    if (busy.value) return
    if (queue.value.length) { showDiscard.value = true; return }
    emit('close')
}
</script>

<template>
    <Teleport to="body">
        <BaseModal width="min(760px, 94vw)" max-height="80vh" @close="tryClose">
            <template #header>
                <span class="modal-title">Mass Add Items</span>
                <div class="modal-header-actions">
                    <button class="icon-btn" title="Close" @click="tryClose">
                        <PhX :size="16" />
                    </button>
                </div>
            </template>

            <div class="modal-body" @keydown="onKeydown">
                <form class="form-col" @submit.prevent="submit">
                    <label class="field">
                        <span>Title</span>
                        <input v-model="title" class="s-input ma-title" type="text" placeholder="Item title…" />
                    </label>
                    <div class="field">
                        <span>Type</span>
                        <div class="seg-btns ma-type">
                            <button
                                v-for="t in TYPES" :key="t.id" type="button"
                                class="seg-btn ma-type-btn" :class="{ active: typeId === t.id }" :data-type="t.id"
                                @click="typeId = t.id"
                            >{{ t.name }}</button>
                        </div>
                    </div>
                    <!-- div, not label: a label would forward button clicks to its first control (the minus button) -->
                    <div class="field">
                        <span>{{ isRange ? 'From year' : 'Year' }}</span>
                        <div class="year-stepper">
                            <button type="button" class="icon-btn ma-year-minus" title="Previous year (Shift −)" @click="stepYear(-1)">
                                <PhMinus :size="14" />
                            </button>
                            <input v-model.number="year" class="s-input ma-year" type="number" step="1" placeholder="Year" />
                            <button type="button" class="icon-btn ma-year-plus" title="Next year (Shift +)" @click="stepYear(1)">
                                <PhPlus :size="14" />
                            </button>
                        </div>
                    </div>
                    <div v-if="isRange" class="field">
                        <span>To year</span>
                        <div class="year-stepper">
                            <button type="button" class="icon-btn ma-end-minus" title="Previous year" @click="stepEndYear(-1)">
                                <PhMinus :size="14" />
                            </button>
                            <input v-model.number="endYear" class="s-input ma-end-year" type="number" step="1" placeholder="End year" @input="endTouched = true" />
                            <button type="button" class="icon-btn ma-end-plus" title="Next year" @click="stepEndYear(1)">
                                <PhPlus :size="14" />
                            </button>
                        </div>
                    </div>
                    <label class="check-row">
                        <input v-model="rememberYear" class="ma-remember" type="checkbox" />
                        Remember year
                    </label>
                    <div class="submit-row">
                        <button type="submit" class="btn btn-primary ma-add">{{ editIndex === null ? 'Add' : 'Update' }}</button>
                        <button v-if="editIndex !== null" type="button" class="btn btn-cancel ma-cancel-edit" @click="resetForm">Cancel</button>
                    </div>
                    <p v-if="error" class="state-msg error">{{ error }}</p>
                </form>

                <div class="queue-col">
                    <div v-if="!queue.length" class="state-msg empty">Nothing added yet.</div>
                    <ul v-else class="queue-list">
                        <li
                            v-for="(d, i) in queue" :key="i"
                            class="queue-row" :class="{ editing: editIndex === i }"
                            title="Click to edit" @click="edit(i)"
                        >
                            <span class="q-title" :title="d.title">{{ d.title }}</span>
                            <span class="q-meta">{{ typeName(d.typeId) }} · {{ d.year }}{{ d.endYear !== d.year ? ' – ' + d.endYear : '' }}</span>
                            <button class="icon-btn q-remove" title="Remove" :disabled="busy" @click.stop="remove(i)">
                                <PhTrash :size="14" />
                            </button>
                        </li>
                    </ul>
                </div>
            </div>

            <template #footer>
                <button class="btn btn-cancel" :disabled="busy" @click="tryClose">Cancel</button>
                <button class="btn btn-primary ma-finish" :disabled="busy || !queue.length" @click="finish">
                    {{ busy ? 'Saving…' : `Finished (${queue.length})` }}
                </button>
            </template>
        </BaseModal>
        <ConfirmModal
            v-if="showDiscard"
            title="Discard items?"
            :message="`${queue.length} unsaved item(s) will be lost.`"
            confirm-label="Discard" cancel-label="Keep" danger
            @confirm="emit('close')" @cancel="showDiscard = false"
        />
    </Teleport>
</template>

<style scoped lang="scss">
.modal-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    letter-spacing: 0.04em;
}

.modal-header-actions {
    display: flex;
    gap: 4px;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;

    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.4; cursor: default; }
}

.modal-body {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    padding: 16px 20px;
    overflow: hidden;
    min-height: 260px;
}

.form-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--app-text-muted, #94a3b8);
}

.s-input {
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 13px;
    padding: 4px 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    min-width: 0;

    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

// Same look as the edit window's Side toggle
.seg-btns {
    display: flex;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    overflow: hidden;
}

.seg-btn {
    flex: 1;
    padding: 5px 0;
    font-size: 0.78rem;
    font-weight: 500;
    background: var(--app-surface, #0c1524);
    color: var(--app-text-muted, #94a3b8);
    border: none;
    border-right: 1px solid var(--app-border, #2d3a56);
    cursor: pointer;
    user-select: none;

    &:last-child { border-right: none; }
    &:hover:not(.active) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &.active { background: #2c5f8a; color: #e8f0ff; font-weight: 600; }
}

.year-stepper {
    display: flex;
    align-items: center;
    gap: 4px;
}

.check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
}

.submit-row {
    display: flex;
    gap: 8px;

    .ma-add { flex: 1; }
}

.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.btn-primary {
    background: var(--app-save-accent, #446b40); color: #e8f5e5;
    &:hover:not(:disabled) { background: var(--app-save-accent-hover, #52804c); }
}

.queue-col {
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    background: var(--app-surface, #0c1524);
    overflow-y: auto;
    min-height: 0;
}

.queue-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.queue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s;

    &:last-child { border-bottom: none; }
    &:hover { background: var(--app-surface-high, #1e2b44); }
    &.editing { background: #1e3a5f; box-shadow: inset 3px 0 0 #3b82f6; }
}

.q-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--app-text, #e2e8f0);
}

.q-meta {
    font-size: 11px;
    color: var(--app-text-dim, #64748b);
    white-space: nowrap;
}

.state-msg {
    padding: 12px;
    font-size: 12px;
    color: var(--app-text-dim, #64748b);
    text-align: center;
    margin: 0;

    &.error { color: #f87171; text-align: left; padding: 0; }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { BackendAPI } from '@/bridge/api'
import type { SessionChangeSummary, SessionHistory } from '@/types/models'

const props = defineProps<{
    title: string
    /** Given only from inside a timeline; without it the modal is the timeline export alone. */
    sessionTimelineId?: number
}>()
const emit = defineEmits<{ close: []; confirm: [includeIds: boolean, includeMedia: boolean] }>()

const tab = ref<'timeline' | 'session'>('timeline')
const includeIds  = ref(false)
const includeMedia = ref(false)
const isWorking   = ref(false)

const history = ref<SessionHistory | null>(null)
const summary = ref<SessionChangeSummary | null>(null)
const summaryError = ref('')
const hasSession = computed(() => props.sessionTimelineId !== undefined)

/** Ticked days, the single source of truth. The date boxes and the buttons only set it. */
const picked = ref<Record<string, boolean>>({})
const pickedDays = computed(() => (history.value?.days ?? []).map((d) => d.day).filter((d) => picked.value[d]))

const sessionTotal = computed(() =>
    summary.value ? summary.value.added + summary.value.changed + summary.value.removed : 0,
)

// ── Dates ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10)

/** 'YYYY-MM-DD' → 'Sun 21 Sep'. Split by hand: `new Date('2026-09-21')` is UTC midnight, which
 *  renders as the 20th anywhere west of Greenwich. */
function dayLabel(day: string): string {
    if (day === today) return 'Today'
    const [y, m, d] = day.split('-').map(Number)
    const date = new Date(y!, m! - 1, d!)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (day === yesterday.toISOString().slice(0, 10)) return 'Yesterday'
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const sinceLabel = computed(() => {
    const at = history.value?.lastExportedAt
    return at ? dayLabel(at.slice(0, 10)) : ''
})

// The day after the last export, which is where unsent work starts.
const dayAfterLastExport = computed(() => {
    const last = history.value?.lastExportDay
    if (!last) return null
    const [y, m, d] = last.split('-').map(Number)
    const next = new Date(y!, m! - 1, d! + 1)
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
})

const from = ref('')
const to   = ref('')

function pickRange(firstDay: string | null, lastDay: string | null) {
    const next: Record<string, boolean> = {}
    for (const day of history.value?.days ?? [])
        next[day.day] = (!firstDay || day.day >= firstDay) && (!lastDay || day.day <= lastDay)
    picked.value = next
}

function pickSinceLastExport() {
    from.value = dayAfterLastExport.value ?? ''
    to.value = ''
    pickRange(dayAfterLastExport.value, null)
}

function pickAll() {
    from.value = ''
    to.value = ''
    pickRange(null, null)
}

// Typing in either date box clamps the selection to it — the boxes and the ticks stay in step.
watch([from, to], () => pickRange(from.value || null, to.value || null))

// ── Loading ──────────────────────────────────────────────────────────────

async function loadHistory() {
    if (props.sessionTimelineId === undefined) return
    summaryError.value = ''
    try {
        const result = await BackendAPI.GetSessionHistory(props.sessionTimelineId)
        if (!result?.history) throw new Error('the backend returned no history')
        history.value = result.history
        if (result.history.lastExportDay) pickSinceLastExport()
        else pickAll()
    } catch (e) {
        summaryError.value = 'Could not read your work history — check the application log.'
        console.error('[GetSessionHistory]', e)
    }
}

async function loadSummary() {
    if (props.sessionTimelineId === undefined) return
    const days = pickedDays.value
    if (!days.length) {
        summary.value = null
        return
    }
    const result = await BackendAPI.GetSessionChanges(props.sessionTimelineId, days)
    if (result?.status === 'ok' && result.summary) {
        summary.value = result.summary
    } else {
        summaryError.value = 'Could not read those changes — check the application log.'
        console.error('[GetSessionChanges]', result)
    }
}

onMounted(loadHistory)
// The user can add items with the modal open on the other tab; re-read rather than show stale counts.
watch(tab, (t) => { if (t === 'session') loadHistory() })
watch(pickedDays, loadSummary, { immediate: true })

// ── Export ───────────────────────────────────────────────────────────────

async function confirm() {
    if (tab.value === 'timeline') {
        isWorking.value = true
        emit('confirm', includeIds.value, includeMedia.value)
        return
    }

    isWorking.value = true
    try {
        const result = await BackendAPI.ExportSessionChanges(props.sessionTimelineId!, pickedDays.value)
        if (result?.status === 'ok') emit('close')
    } catch (e) {
        console.error('[ExportSessionChanges]', e)
        alert(`Session export failed:\n\n${e instanceof Error ? e.message : String(e)}`)
    } finally {
        isWorking.value = false
    }
}

const opLabel: Record<string, string> = { insert: 'Added', update: 'Changed', delete: 'Removed' }
const dayTotal = (d: { added: number; changed: number; removed: number }) => d.added + d.changed + d.removed
</script>

<template>
    <BaseModal
        :title="hasSession ? 'Export' : 'Export Timeline'"
        :width="hasSession ? 'min(540px, 94vw)' : 'min(460px, 92vw)'"
        @close="emit('close')"
    >
        <div v-if="hasSession" class="tab-bar" role="tablist">
            <button
                class="tab" :class="{ active: tab === 'timeline' }" role="tab" :aria-selected="tab === 'timeline'"
                @click="tab = 'timeline'"
            >This timeline</button>
            <button
                class="tab" :class="{ active: tab === 'session' }" role="tab" :aria-selected="tab === 'session'"
                @click="tab = 'session'"
            >My work<span v-if="sessionTotal" class="tab-badge">{{ sessionTotal }}</span></button>
        </div>

        <div v-if="tab === 'timeline'" class="modal-body">
            <p class="desc">Exporting <strong>{{ title }}</strong> as a <code>.stlm</code> archive.</p>
            <label class="checkbox-row">
                <input type="checkbox" v-model="includeIds" />
                <span>Include internal IDs <span class="hint">(allows exact restore — replaces matching timeline on import)</span></span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" v-model="includeMedia" />
                <span>Include media files <span class="hint">(embeds images in the archive; larger file)</span></span>
            </label>
            <p class="info-hint">Without IDs the timeline is always imported as a new entry, even if one with the same name exists.</p>
        </div>

        <div v-else class="modal-body">
            <p class="desc">
                Pick the days of work on <strong>{{ title }}</strong> to send. They go as one
                <code>.stlc</code> file someone else can import into their copy.
            </p>

            <p v-if="summaryError" class="error">{{ summaryError }}</p>
            <p v-else-if="!history" class="info-hint">Reading your work history…</p>
            <template v-else>
                <div class="pick-row">
                    <button
                        v-if="history.lastExportedAt" class="pick-btn pick-btn--primary"
                        :title="`Everything after the last export, which covered up to ${history.lastExportDay}`"
                        @click="pickSinceLastExport"
                    >Everything since the last export on {{ sinceLabel }}</button>
                    <button class="pick-btn" @click="pickAll">All of it</button>
                </div>

                <div class="clamp-row">
                    <label>From <input type="date" v-model="from" :max="to || today" /></label>
                    <label>to <input type="date" v-model="to" :min="from" :max="today" /></label>
                    <button v-if="from || to" class="clear-btn" @click="pickAll">clear</button>
                </div>

                <ul class="days">
                    <li v-for="day in history.days" :key="day.day" :data-day="day.day" :class="{ empty: !dayTotal(day) }">
                        <label>
                            <input type="checkbox" v-model="picked[day.day]" />
                            <span class="day-name">{{ dayLabel(day.day) }}</span>
                            <span v-if="dayTotal(day)" class="day-counts">
                                <span v-if="day.added"   class="count--add">+{{ day.added }}</span>
                                <span v-if="day.changed" class="count--change">~{{ day.changed }}</span>
                                <span v-if="day.removed" class="count--remove">−{{ day.removed }}</span>
                            </span>
                            <span v-else class="day-counts day-counts--none">nothing yet</span>
                        </label>
                    </li>
                </ul>

                <div class="counts">
                    <span class="count count--add">{{ summary?.added ?? 0 }} added</span>
                    <span class="count count--change">{{ summary?.changed ?? 0 }} changed</span>
                    <span class="count count--remove">{{ summary?.removed ?? 0 }} removed</span>
                </div>

                <ul v-if="sessionTotal" class="entries">
                    <li v-for="entry in summary!.entries" :key="entry.id">
                        <span class="op" :class="`op--${entry.op}`">{{ opLabel[entry.op] }}</span>
                        <span class="entry-title">{{ entry.title || '(untitled)' }}</span>
                    </li>
                </ul>
                <p v-else class="info-hint">
                    {{ pickedDays.length ? 'Those days changed nothing.' : 'Tick at least one day.' }}
                </p>
                <p v-if="sessionTotal" class="info-hint">
                    An item worked on across several of these days travels once, as you last left it.
                </p>
            </template>
        </div>

        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="emit('close')">Cancel</button>
            <button
                class="btn btn-primary" data-primary
                :disabled="isWorking || (tab === 'session' && !sessionTotal)"
                @click="confirm"
            >
                {{ isWorking ? 'Exporting…' : 'Choose destination & export' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; color: var(--app-text, #e2e8f0);
}
.desc { margin: 0; font-size: 13px; color: var(--app-text-muted, #94a3b8); }
.info-hint { margin: 4px 0 0; font-size: 11px; color: var(--app-text-dim, #4a6080); line-height: 1.5; }
.error { margin: 0; font-size: 12px; color: var(--app-danger, #d16a6a); }
.checkbox-row {
    display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px;
    input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: var(--app-accent, #3b6ec4); }
    .hint { font-size: 11px; color: var(--app-text-dim, #4a6080); }
}

.tab-bar {
    display: flex; gap: 2px; padding: 0 24px; border-bottom: 1px solid var(--app-border, #2d3a56);
}
.tab {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px;
    padding: 9px 12px; font-size: 12.5px; font-weight: 500; cursor: pointer;
    color: var(--app-text-muted, #94a3b8);
    &:hover { color: var(--app-text, #e2e8f0); }
    &.active { color: var(--app-text, #e2e8f0); border-bottom-color: var(--app-accent, #3b6ec4); }
}
.tab-badge {
    font-size: 10.5px; font-weight: 600; line-height: 1; padding: 3px 6px; border-radius: 9px;
    background: var(--app-accent, #3b6ec4); color: #fff;
}

/* ── Choosing how much ───────────────────────────────────────────────── */
.pick-row { display: flex; gap: 8px; flex-wrap: wrap; }
.pick-btn {
    font-size: 11.5px; font-weight: 500; padding: 5px 11px; border-radius: 5px; cursor: pointer;
    background: transparent; color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.pick-btn--primary {
    border-color: var(--app-accent, #3b6ec4); color: var(--app-accent, #3b6ec4);
    &:hover { background: #3b6ec41f; color: var(--app-accent, #3b6ec4); }
}

.clamp-row {
    display: flex; align-items: center; gap: 8px; font-size: 11.5px;
    color: var(--app-text-dim, #4a6080);
    label { display: flex; align-items: center; gap: 5px; }
    input[type="date"] {
        background: #00000030; color: var(--app-text, #e2e8f0); font-size: 11.5px; font-family: inherit;
        border: 1px solid var(--app-border, #2d3a56); border-radius: 4px; padding: 3px 6px;
        &::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
    }
}
.clear-btn {
    background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 11px;
    color: var(--app-text-dim, #4a6080); text-decoration: underline;
    &:hover { color: var(--app-text, #e2e8f0); }
}

.days {
    list-style: none; margin: 0; padding: 0; max-height: 170px; overflow-y: auto;
    border: 1px solid var(--app-border, #2d3a56); border-radius: 5px;
    li {
        & + li { border-top: 1px solid var(--app-border, #2d3a56); }
        &.empty { opacity: 0.5; }
    }
    label {
        display: flex; align-items: center; gap: 10px; padding: 6px 10px; font-size: 12.5px; cursor: pointer;
        &:hover { background: #ffffff08; }
    }
    input[type="checkbox"] {
        width: 14px; height: 14px; cursor: pointer; accent-color: var(--app-accent, #3b6ec4);
    }
}
.day-name { flex: 1; }
.day-counts { display: flex; gap: 7px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.day-counts--none { font-weight: 400; color: var(--app-text-dim, #4a6080); }

.counts { display: flex; gap: 8px; flex-wrap: wrap; }
.count {
    font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 10px;
    background: #ffffff0e; color: var(--app-text-muted, #94a3b8);
}
.count--add    { color: #7fc47f; }
.count--change { color: #d8b45c; }
.count--remove { color: #d16a6a; }

.entries {
    list-style: none; margin: 0; padding: 0; max-height: 190px; overflow-y: auto;
    border: 1px solid var(--app-border, #2d3a56); border-radius: 5px;
    li {
        display: flex; align-items: center; gap: 9px; padding: 6px 10px; font-size: 12.5px;
        & + li { border-top: 1px solid var(--app-border, #2d3a56); }
    }
}
.op {
    flex: 0 0 62px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
}
.op--insert { color: #7fc47f; }
.op--update { color: #d8b45c; }
.op--delete { color: #d16a6a; }
.entry-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
</style>

<script setup lang="ts">
/**
 * BL-88: the MISC tab's Sessions — each day the timeline was worked on and what changed that day. Days that
 * changed nothing can be pruned, and neighbouring finished days merged into one, the newest edit winning.
 * A merge never includes today or crosses the last export, so "everything since" still means what it did.
 */
import { computed, onMounted, ref } from 'vue'
import { PhArrowsMerge, PhBroom, PhCaretRight } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import type { SessionDaySummary, SessionEntry, SessionHistory } from '@/types/models'

const props = defineProps<{ timelineId: number }>()
const emit = defineEmits<{ error: [what: string, ex: unknown] }>()

const history = ref<SessionHistory | null>(null)
const busy = ref(false)

async function load() {
    try {
        const r = await BackendAPI.GetSessionHistory(props.timelineId)
        if (!r?.history) throw new Error('the backend returned no history')
        history.value = r.history
    } catch (ex) {
        emit('error', 'Could not read the work history', ex)
    }
}

onMounted(load)

/** With a time it parses as local midnight; a bare date is UTC, which is the day before west of Greenwich. */
const label = (day: string) =>
    new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
/** A merged day keeps the start of its oldest day. */
function span(d: SessionDaySummary) {
    const from = d.startedAt.slice(0, 10)
    return d.open ? 'Today' : from < d.day ? `${label(from)} – ${label(d.day)}` : label(d.day)
}

/** The line goes above the newest day the last export took in. */
const exportEdge = (n: number) => {
    const last = history.value!.lastExportDay
    const days = history.value!.days
    return !!last && days[n]!.day <= last && (n === 0 || days[n - 1]!.day > last)
}

// ── What changed ──────────────────────────────────────────────────────────────

const OPS: Record<SessionEntry['op'], string> = { insert: 'Added', update: 'Changed', delete: 'Removed' }
const openDay = ref<string | null>(null)
const entries = ref<Record<string, SessionEntry[]>>({})

/** Read every time it opens: today's list grows while the window is open. */
async function toggle(day: string) {
    openDay.value = openDay.value === day ? null : day
    if (openDay.value !== day) return
    try {
        const r = await BackendAPI.GetSessionChanges(props.timelineId, [day])
        if (!r?.summary) throw new Error('the backend returned no changes')
        entries.value[day] = r.summary.entries
    } catch (ex) {
        emit('error', `Could not read what changed on ${label(day)}`, ex)
    }
}

// ── Merge and prune ───────────────────────────────────────────────────────────

const picked = ref(new Set<string>())
const tick = (day: string) => { if (!picked.value.delete(day)) picked.value.add(day) }

/** Why the ticked days cannot be merged, or '' when they can. The backend checks the same again. */
const mergeBlock = computed(() => {
    const days = history.value?.days ?? []
    const at = days.flatMap((d, n) => picked.value.has(d.day) ? [n] : [])
    if (at.length < 2) return 'Tick a day next to it too'
    if (at.at(-1)! - at[0]! !== at.length - 1) return 'Only days next to each other can be merged'
    const last = history.value!.lastExportDay
    if (last && at.some(n => days[n]!.day <= last) && at.some(n => days[n]!.day > last))
        return 'Those days sit on both sides of the last export'
    return ''
})
const mergeAsk = ref(false)

async function merge() {
    mergeAsk.value = false
    busy.value = true
    try {
        const r = await BackendAPI.MergeSessionDays(props.timelineId, [...picked.value])
        if (!r?.history) throw new Error('the backend returned no history')
        history.value = r.history
        picked.value = new Set()
        openDay.value = null
    } catch (ex) {
        emit('error', 'Could not merge those days', ex)
    } finally {
        busy.value = false
    }
}

async function prune() {
    busy.value = true
    try {
        await BackendAPI.PruneSessionDays(props.timelineId)
        await load()
    } catch (ex) {
        emit('error', 'Could not prune the empty days', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="as-root">
        <p class="as-about">Each day this timeline was worked on, newest first. The export's <i>My work</i> tab picks from these.</p>

        <p v-if="!history" class="ar-empty">Reading the work history…</p>
        <p v-else-if="!history.days.length" class="ar-empty">No work recorded yet.</p>

        <ul v-else class="ar-rows">
            <template v-for="(d, n) in history.days" :key="d.day">
                <li v-if="exportEdge(n)" class="as-export">Last export, {{ label(history.lastExportedAt!.slice(0, 10)) }} — it took in the days below</li>
                <li class="ar-row" :data-day="d.day">
                    <div class="ar-row-head">
                        <input
                            v-if="!d.open"
                            type="checkbox"
                            class="ar-pick"
                            :checked="picked.has(d.day)"
                            :aria-label="`Tick ${span(d)} to merge`"
                            @change="tick(d.day)"
                        />
                        <span v-else class="ar-pick" data-tip="Today is still being written, so it cannot be merged" />
                        <button class="ar-row-title" :aria-expanded="openDay === d.day" data-tip="What changed" @click="toggle(d.day)">
                            <PhCaretRight :size="12" class="ar-caret" :class="{ 'ar-caret--open': openDay === d.day }" />
                            {{ span(d) }}
                        </button>
                        <span class="as-counts">
                            <span v-if="d.added" class="as-op--insert">+{{ d.added }}</span>
                            <span v-if="d.changed" class="as-op--update">~{{ d.changed }}</span>
                            <span v-if="d.removed" class="as-op--delete">−{{ d.removed }}</span>
                            <span v-if="!d.added && !d.changed && !d.removed" class="as-none">nothing yet</span>
                        </span>
                    </div>
                    <ul v-if="openDay === d.day" class="as-entries">
                        <li v-for="e in entries[d.day] ?? []" :key="e.id">
                            <span class="as-op" :class="`as-op--${e.op}`">{{ OPS[e.op] }}</span>
                            <span class="as-title">{{ e.title || 'Untitled' }}</span>
                        </li>
                    </ul>
                </li>
            </template>
        </ul>

        <div v-if="history" class="ap-bar">
            <button
                v-if="history.emptyDays"
                class="ap-btn"
                :disabled="busy"
                data-tip="Days the timeline was opened and nothing changed. They are not listed above; pruning drops them."
                @click="prune"
            ><PhBroom :size="15" /> Prune {{ history.emptyDays }} empty day{{ history.emptyDays === 1 ? '' : 's' }}</button>
            <span v-else />
            <span class="as-merge">
                <span v-if="picked.size && mergeBlock" class="as-why">{{ mergeBlock }}</span>
                <button class="ap-btn ap-btn--primary" :disabled="busy || !!mergeBlock" @click="mergeAsk = true">
                    <PhArrowsMerge :size="15" /> Merge{{ picked.size > 1 ? ` ${picked.size} days` : '' }}
                </button>
            </span>
        </div>

        <ConfirmModal
            v-if="mergeAsk"
            :title="`Merge ${picked.size} days into one?`"
            message="They become one day in this list and in the export's. An item changed on more than one of them keeps its newest edit. A merged day cannot be split again."
            confirm-label="Merge" cancel-label="Cancel"
            @confirm="merge" @cancel="mergeAsk = false"
        />
    </div>
</template>

<style scoped lang="scss">
.as-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.as-about {
    margin: 8px 12px 0;
    font-size: 0.72rem;
    color: var(--app-text-dim, #64748b);
}

.as-export {
    margin: 4px 0 0;
    padding-bottom: 3px;
    border-bottom: 1px dashed var(--app-accent, #6366f1);
    font-size: 0.7rem;
    color: var(--app-accent-hover, #818cf8);
}

.as-counts {
    margin-left: auto;
    display: flex;
    gap: 7px;
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.as-none {
    font-weight: 400;
    color: var(--app-text-dim, #64748b);
}

.as-entries {
    list-style: none;
    margin: 8px 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.78rem;
    user-select: text;

    li {
        display: flex;
        gap: 9px;
        min-width: 0;
    }
}

.as-op {
    flex: 0 0 62px;
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

// The export dialog's colours, so a day reads the same in both.
.as-op--insert { color: #7fc47f; }
.as-op--update { color: #d8b45c; }
.as-op--delete { color: #d16a6a; }

.as-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.as-merge {
    display: flex;
    align-items: center;
    gap: 10px;
}

.as-why {
    font-size: 0.72rem;
    color: #f59e0b;
}
</style>

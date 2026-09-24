<script lang="ts">
import type { RelativeRule } from '@/utils/relativeRule'

export interface MemorableDay {
    id: string
    name: string
    color: string
    type: 'fixed' | 'weekly' | 'relative'
    startMonth: number   // 0-indexed
    startDay: number     // 1-indexed within month
    endMonth: number
    endDay: number
    isRange: boolean
    weekDays: number[]   // for type='weekly': 0-indexed day-of-week indices
    rule: RelativeRule   // for type='relative'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import CalendarDayPicker from './CalendarDayPicker.vue'
import WeekDayPicker from './WeekDayPicker.vue'
import RelativeRuleEditor from './RelativeRuleEditor.vue'

// List on the left, editor on the right. Edits go straight into the parent's day objects (live),
// so the footer is only Add / Delete / Close — the calendar's own Save button persists everything.
const props = defineProps<{
    days: MemorableDay[]
    selectedId: string | null
    months: { name: string; length: number }[]
    seasons: { name: string; start: number; end: number }[]
    hasSeasons: boolean
    hasWeekDef: boolean
    weekLength: number
    dayLabels?: string[]
    weekendDays: number[]
}>()
const emit = defineEmits<{
    (e: 'update:selectedId', id: string | null): void
    (e: 'add'): void
    (e: 'remove', id: string): void
    (e: 'close'): void
}>()

const selected = computed(() => props.days.find(d => d.id === props.selectedId) ?? props.days[0] ?? null)
const otherDays = computed(() => props.days.filter(d => d.id !== selected.value?.id).map(d => ({ id: d.id, name: d.name })))

function monthName(i: number) { return props.months[i]?.name ?? `M${i + 1}` }

function onPick(v: { startMonth: number; startDay: number; endMonth: number; endDay: number }) {
    if (selected.value) Object.assign(selected.value, v)
}

function summary(md: MemorableDay): string {
    if (md.type === 'weekly') return md.weekDays.length ? md.weekDays.map(i => props.dayLabels?.[i] ?? `D${i + 1}`).join(', ') : 'No days'
    if (md.type === 'relative') return 'Relative'
    const from = `${monthName(md.startMonth)} ${md.startDay}`
    return md.isRange ? `${from} → ${monthName(md.endMonth)} ${md.endDay}` : from
}
</script>

<template>
    <BaseModal title="Memorable Days" width="min(780px, 94vw)" max-height="88vh" @close="emit('close')">
        <div class="md-body">
            <aside class="md-list">
                <button
                    v-for="md in days" :key="md.id" type="button"
                    class="md-row" :class="{ selected: md.id === selected?.id }"
                    @click="emit('update:selectedId', md.id)"
                >
                    <span class="md-dot" :style="{ background: md.color }" />
                    <span class="md-row-text">
                        <span class="md-row-name">{{ md.name || 'Unnamed' }}</span>
                        <span class="md-row-sub">{{ summary(md) }}</span>
                    </span>
                </button>
                <p v-if="!days.length" class="md-empty">No memorable days yet.</p>
            </aside>

            <section v-if="selected" class="md-editor">
                <div class="md-editor-top">
                    <input type="color" class="md-color" v-model="selected.color" title="Color" />
                    <input type="text" class="md-input md-name" v-model="selected.name" placeholder="Holiday…" />
                    <select class="md-input md-type" v-model="selected.type">
                        <option value="fixed">Fixed Date</option>
                        <option value="weekly" :disabled="!hasWeekDef">Weekly</option>
                        <option value="relative">Relative</option>
                    </select>
                </div>

                <template v-if="selected.type === 'fixed'">
                    <label class="md-check">
                        <input type="checkbox" v-model="selected.isRange" /> Range
                    </label>
                    <CalendarDayPicker
                        :startMonth="selected.startMonth"
                        :startDay="selected.startDay"
                        :endMonth="selected.endMonth"
                        :endDay="selected.endDay"
                        :isRange="selected.isRange"
                        :months="months"
                        :weekLength="hasWeekDef ? weekLength : 7"
                        :dayLabels="dayLabels"
                        :weekendDays="hasWeekDef ? weekendDays : [5, 6]"
                        @select="onPick"
                    />
                    <p class="md-summary">{{ summary(selected) }}</p>
                </template>
                <WeekDayPicker v-else-if="selected.type === 'weekly'" v-model="selected.weekDays" :weekLength="weekLength" :dayLabels="dayLabels" />
                <RelativeRuleEditor
                    v-else
                    v-model="selected.rule"
                    :seasons="seasons"
                    :hasSeasons="hasSeasons"
                    :months="months"
                    :hasWeekDef="hasWeekDef"
                    :weekLength="hasWeekDef ? weekLength : 7"
                    :dayLabels="dayLabels"
                    :weekendDays="hasWeekDef ? weekendDays : [5, 6]"
                    :otherMemDays="otherDays"
                />
            </section>
            <section v-else class="md-editor md-editor-empty">
                <p>Add a day to start.</p>
            </section>
        </div>
        <template #footer>
            <button class="btn btn-secondary md-add" type="button" @click="emit('add')">+ Add Day</button>
            <button class="btn btn-danger md-delete" type="button" :disabled="!selected" @click="selected && emit('remove', selected.id)">Delete</button>
            <button class="btn btn-primary md-close" type="button" data-cancel @click="emit('close')">Close</button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.md-body {
    display: flex;
    min-height: 360px;
    overflow: hidden;
}

.md-list {
    width: 220px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.md-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--app-text, #e2e8f0);
    text-align: left;
    cursor: pointer;

    &:hover { background: var(--app-surface-high, #1e2b44); }
    &.selected { background: #1e3a5f; box-shadow: inset 3px 0 0 #3b82f6; }
}

.md-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}

.md-row-text { display: flex; flex-direction: column; min-width: 0; }
.md-row-name { font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-row-sub  { font-size: 0.72rem; color: var(--app-text-dim, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.md-empty {
    margin: 12px 6px;
    font-size: 0.82rem;
    font-style: italic;
    color: var(--app-text-dim, #4a6080);
}

.md-editor {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.md-editor-empty {
    align-items: center;
    justify-content: center;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
}

.md-editor-top {
    display: flex;
    align-items: center;
    gap: 8px;
}

.md-color {
    width: 36px;
    height: 30px;
    padding: 1px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    background: var(--app-surface, #0c1524);
    cursor: pointer;
    flex-shrink: 0;
}

.md-input {
    padding: 5px 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--app-surface, #0c1524);
    color: var(--app-text, #e2e8f0);
    &:focus { outline: 2px solid var(--app-accent, #3b6ec4); }
}
.md-name { flex: 1; min-width: 0; }
.md-type { width: 120px; flex-shrink: 0; }
select.md-input option { background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0); }

.md-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    input { accent-color: var(--app-accent, #3b6ec4); }
}

.md-summary {
    margin: 0;
    font-size: 0.8rem;
    color: var(--app-text-muted, #94a3b8);
}

.md-add { margin-right: auto; }

.btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.15s;
    &:disabled { opacity: 0.55; cursor: not-allowed; }

    &.btn-primary { background: var(--app-accent, #4a90d9); color: #fff; &:hover:not(:disabled) { background: var(--app-accent-hover, #3578c5); } }
    &.btn-secondary { background: var(--app-surface-high, #334155); color: var(--app-text-muted, #cbd5e1); &:hover:not(:disabled) { background: color-mix(in srgb, var(--app-surface-high, #334155) 80%, var(--app-text, #fff)); } }
    &.btn-danger { background: #7f1d1d; color: #fecaca; &:hover:not(:disabled) { background: #991b1b; } }
}
</style>

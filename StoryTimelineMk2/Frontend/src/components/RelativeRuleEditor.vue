<script setup lang="ts">
import { computed } from 'vue'
import WeekDayPicker from './WeekDayPicker.vue'
import { describeRule } from '@/utils/relativeRule'
import type { RelativeRule } from '@/utils/relativeRule'

const props = defineProps<{
    modelValue: RelativeRule
    seasons: { name: string; start: number; end: number }[]
    hasSeasons: boolean
    months: { name: string; length: number }[]
    hasWeekDef: boolean
    weekLength: number
    dayLabels?: string[]
    weekendDays?: number[]
    otherMemDays: { id: string; name: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [RelativeRule] }>()

function patch(changes: Partial<RelativeRule>) {
    emit('update:modelValue', { ...props.modelValue, ...changes })
}

function setBaseType(t: 'period' | 'anchor') {
    if (t === 'period') {
        patch({
            baseType: 'period',
            periodType: props.modelValue.periodType ?? 'month',
            anchorType: undefined,
            anchorIndex: undefined,
            anchorId: undefined,
        })
    } else {
        const defAnchor = props.hasSeasons ? 'season-start' : 'memorable-day'
        patch({
            baseType: 'anchor',
            anchorType: defAnchor,
            anchorIndex: 0,
            periodType: undefined,
            periodMonth: undefined,
        })
    }
}

function onAnchorTypeChange(v: string) {
    patch({ anchorType: v as RelativeRule['anchorType'], anchorIndex: 0, anchorId: undefined })
}

const hasWeekdays = computed(() => (props.modelValue.weekdays?.length ?? 0) > 0)

function toggleWeekdays(on: boolean) {
    if (on) patch({ weekdays: [0], ordinal: 1 })
    else     patch({ weekdays: [], ordinal: undefined })
}

const preview = computed(() =>
    describeRule(props.modelValue, {
        seasonNames: props.seasons.map(s => s.name),
        monthNames: props.months.map(m => m.name),
        dayLabels: props.dayLabels ?? Array.from({ length: props.weekLength || 7 }, (_, i) => `D${i + 1}`),
        memDayNames: Object.fromEntries(props.otherMemDays.map(d => [d.id, d.name])),
    })
)

const ORDINALS = [
    { value: 1,  label: '1st (first)' },
    { value: 2,  label: '2nd (second)' },
    { value: 3,  label: '3rd (third)' },
    { value: 4,  label: '4th (fourth)' },
    { value: 5,  label: '5th (fifth)' },
    { value: -1, label: 'Last' },
]
</script>

<template>
    <div class="rule-editor">

        <!-- ── Base Type ──────────────────────────────────────────────── -->
        <div class="rule-row">
            <span class="rule-label">Base</span>
            <div class="seg-btns">
                <button
                    type="button"
                    class="seg-btn"
                    :class="{ active: modelValue.baseType === 'period' }"
                    @click="setBaseType('period')"
                >Period</button>
                <button
                    type="button"
                    class="seg-btn"
                    :class="{ active: modelValue.baseType === 'anchor' }"
                    @click="setBaseType('anchor')"
                >Anchor</button>
            </div>
        </div>

        <!-- ── Period options ─────────────────────────────────────────── -->
        <template v-if="modelValue.baseType === 'period'">
            <div class="rule-row">
                <span class="rule-label">Period</span>
                <div class="seg-btns">
                    <button type="button" class="seg-btn" :class="{ active: modelValue.periodType === 'year' }"
                        @click="patch({ periodType: 'year', periodMonth: undefined })">Year</button>
                    <button type="button" class="seg-btn" :class="{ active: modelValue.periodType === 'month' }"
                        @click="patch({ periodType: 'month' })">Month</button>
                </div>
                <select v-if="modelValue.periodType === 'month'"
                    class="rule-select"
                    :value="modelValue.periodMonth ?? ''"
                    @change="patch({ periodMonth: ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value) })"
                >
                    <option value="">Every month</option>
                    <option v-for="(m, i) in months" :key="i" :value="i">{{ m.name }}</option>
                </select>
            </div>
        </template>

        <!-- ── Anchor options ─────────────────────────────────────────── -->
        <template v-else>
            <div class="rule-row">
                <span class="rule-label">Anchor</span>
                <select class="rule-select" :value="modelValue.anchorType ?? ''" @change="onAnchorTypeChange(($event.target as HTMLSelectElement).value)">
                    <option v-if="hasSeasons" value="season-start">Start of season</option>
                    <option v-if="hasSeasons" value="season-end">End of season</option>
                    <option value="memorable-day" :disabled="otherMemDays.length === 0">
                        Another day{{ otherMemDays.length === 0 ? ' (none defined)' : '' }}
                    </option>
                </select>
            </div>

            <div v-if="modelValue.anchorType === 'season-start' || modelValue.anchorType === 'season-end'" class="rule-row">
                <span class="rule-label">Season</span>
                <select class="rule-select"
                    :value="modelValue.anchorIndex ?? 0"
                    @change="patch({ anchorIndex: Number(($event.target as HTMLSelectElement).value) })"
                >
                    <option v-for="(s, i) in seasons" :key="i" :value="i">{{ s.name }}</option>
                </select>
            </div>

            <div v-else-if="modelValue.anchorType === 'memorable-day'" class="rule-row">
                <span class="rule-label">Day</span>
                <select class="rule-select"
                    :value="modelValue.anchorId ?? ''"
                    @change="patch({ anchorId: ($event.target as HTMLSelectElement).value })"
                >
                    <option value="" disabled>Select…</option>
                    <option v-for="d in otherMemDays" :key="d.id" :value="d.id">{{ d.name }}</option>
                </select>
            </div>
        </template>

        <!-- ── Offset ─────────────────────────────────────────────────── -->
        <div class="rule-row">
            <span class="rule-label">Offset</span>
            <input
                type="number"
                class="rule-num"
                :value="modelValue.offsetDays"
                @input="patch({ offsetDays: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="rule-hint">days &nbsp;(negative = before)</span>
        </div>

        <!-- ── Weekday search ─────────────────────────────────────────── -->
        <div class="rule-row">
            <span class="rule-label">Weekday</span>
            <label class="toggle-label">
                <input
                    type="checkbox"
                    :disabled="!hasWeekDef && weekLength === 0"
                    :checked="hasWeekdays"
                    @change="toggleWeekdays(($event.target as HTMLInputElement).checked)"
                />
                Find next occurrence
            </label>
        </div>

        <div v-if="hasWeekdays" class="rule-row rule-row--indent">
            <WeekDayPicker
                :modelValue="modelValue.weekdays ?? []"
                :weekLength="weekLength || 7"
                :dayLabels="dayLabels"
                @update:modelValue="v => patch({ weekdays: v })"
            />
            <select class="rule-select"
                :value="modelValue.ordinal ?? 1"
                @change="patch({ ordinal: Number(($event.target as HTMLSelectElement).value) })"
            >
                <option v-for="o in ORDINALS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
        </div>

        <!-- ── Span ───────────────────────────────────────────────────── -->
        <div class="rule-row">
            <span class="rule-label">Duration</span>
            <input
                type="number"
                class="rule-num"
                min="1"
                :value="modelValue.span"
                @input="patch({ span: Math.max(1, Number(($event.target as HTMLInputElement).value)) })"
            />
            <span class="rule-hint">day(s)</span>
        </div>

        <!-- ── Preview ────────────────────────────────────────────────── -->
        <div class="rule-preview">
            <span class="preview-icon">📅</span>
            <span class="preview-text">{{ preview }}</span>
        </div>

    </div>
</template>

<style scoped lang="scss">
.rule-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
}

.rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    &--indent { padding-left: 72px; }
}

.rule-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #4a6080;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    user-select: none;
    width: 62px;
    flex-shrink: 0;
}

.rule-hint {
    font-size: 0.72rem;
    color: #4a6080;
    font-style: italic;
}

// ── Segmented toggle buttons ──────────────────────────────────────────────────

.seg-btns {
    display: flex;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    overflow: hidden;
}

.seg-btn {
    padding: 3px 10px;
    font-size: 0.78rem;
    font-weight: 500;
    background: #0c1524;
    color: #94a3b8;
    border: none;
    border-right: 1px solid #2d3a56;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    user-select: none;

    &:last-child { border-right: none; }
    &:hover:not(.active) { background: #1e2b44; color: #e2e8f0; }
    &.active { background: #2c5f8a; color: #e8f0ff; font-weight: 600; }
}

// ── Inputs ────────────────────────────────────────────────────────────────────

.rule-select {
    padding: 3px 6px;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    background: #0c1524;
    color: #e2e8f0;
    font-size: 0.8rem;
    cursor: pointer;
    &:focus { outline: 2px solid #3b6ec4; }

    option { background: #0c1524; color: #e2e8f0; }
}

.rule-num {
    width: 64px;
    padding: 3px 6px;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    background: #0c1524;
    color: #e2e8f0;
    font-size: 0.85rem;
    &:focus { outline: 2px solid #3b6ec4; }
}

.toggle-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8rem;
    color: #94a3b8;
    cursor: pointer;
    user-select: none;
}

// ── Preview ───────────────────────────────────────────────────────────────────

.rule-preview {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 4px;
    background: #0d1929;
    border: 1px solid #253048;
    border-radius: 5px;
    padding: 7px 10px;
}

.preview-icon { font-size: 0.85rem; flex-shrink: 0; }

.preview-text {
    font-size: 0.82rem;
    color: #a8c4e8;
    font-style: italic;
    line-height: 1.4;
}
</style>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface MonthDef { name: string; length: number }

const props = defineProps<{
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    isRange: boolean
    months: MonthDef[]
    weekLength: number
    dayLabels?: string[]
    weekendDays?: number[]
}>()

const emit = defineEmits<{
    select: [{ startMonth: number; startDay: number; endMonth: number; endDay: number }]
}>()

const viewMonth = ref(props.startMonth)
const pickingEnd = ref(false)

watch(() => props.startMonth, v => { viewMonth.value = v })
watch(() => props.isRange, () => { pickingEnd.value = false })

const cols = computed(() => Math.max(1, props.weekLength || 7))
const monthName = computed(() => props.months[viewMonth.value]?.name ?? `Month ${viewMonth.value + 1}`)
const monthLength = computed(() => props.months[viewMonth.value]?.length ?? 30)

function colLabel(c: number): string {
    return props.dayLabels?.[c] ?? `D${c + 1}`
}

function isWeekendCol(c: number): boolean {
    if (props.weekendDays && props.weekendDays.length > 0)
        return props.weekendDays.includes(c)
    return props.weekLength === 7 && (c === 5 || c === 6)
}

// Build grid: rows of [day | null] with leading empty cells on row 0 based on
// how many days precede this month in the year, so week alignment is consistent.
const startOffset = computed(() => {
    let days = 0
    for (let i = 0; i < viewMonth.value; i++) days += props.months[i]?.length ?? 30
    return days % cols.value
})

const gridRows = computed(() => {
    const offset = startOffset.value
    const total = monthLength.value
    const w = cols.value
    const cells: (number | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    const pad = (w - (cells.length % w)) % w
    for (let i = 0; i < pad; i++) cells.push(null)
    const rows: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += w) rows.push(cells.slice(i, i + w))
    return rows
})

function absVal(month: number, day: number) { return month * 100_000 + day }

const startAbs = computed(() => absVal(props.startMonth, props.startDay))
const endAbs   = computed(() => absVal(props.endMonth,   props.endDay))

function classify(day: number) {
    if (day === null) return {}
    const a = absVal(viewMonth.value, day)
    const s = startAbs.value
    const e = endAbs.value
    if (!props.isRange) return { selected: a === s }
    return {
        'is-start': a === s,
        'is-end':   a === e,
        'in-range': a > s && a < e,
    }
}

function onDayClick(day: number) {
    const m = viewMonth.value
    if (!props.isRange) {
        emit('select', { startMonth: m, startDay: day, endMonth: m, endDay: day })
        return
    }
    if (!pickingEnd.value) {
        emit('select', { startMonth: m, startDay: day, endMonth: m, endDay: day })
        pickingEnd.value = true
    } else {
        const clickedAbs = absVal(m, day)
        if (clickedAbs >= startAbs.value) {
            emit('select', { startMonth: props.startMonth, startDay: props.startDay, endMonth: m, endDay: day })
        } else {
            emit('select', { startMonth: m, startDay: day, endMonth: props.startMonth, endDay: props.startDay })
        }
        pickingEnd.value = false
    }
}

function prevMonth() { if (viewMonth.value > 0) viewMonth.value-- }
function nextMonth() { if (viewMonth.value < props.months.length - 1) viewMonth.value++ }
</script>

<template>
    <div class="cal-picker">
        <div class="picker-header">
            <button class="nav-btn" @click="prevMonth" :disabled="viewMonth <= 0" type="button">‹</button>
            <span class="month-label">{{ monthName }}</span>
            <button class="nav-btn" @click="nextMonth" :disabled="viewMonth >= months.length - 1" type="button">›</button>
        </div>

        <div v-if="isRange" class="range-hint">
            {{ pickingEnd ? 'Click end date' : 'Click start date' }}
        </div>

        <table class="picker-grid">
            <thead>
                <tr>
                    <th
                        v-for="c in cols"
                        :key="c - 1"
                        :class="{ weekend: isWeekendCol(c - 1) }"
                    >{{ colLabel(c - 1) }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, r) in gridRows" :key="r">
                    <td v-for="(day, c) in row" :key="c" :class="{ weekend: isWeekendCol(c) }">
                        <button
                            v-if="day !== null"
                            class="day-btn"
                            type="button"
                            :class="[classify(day), { weekend: isWeekendCol(c) }]"
                            @click="onDayClick(day)"
                        >{{ day }}</button>
                    </td>
                </tr>
            </tbody>
        </table>

        <div v-if="months.length === 0" class="no-months-note">No months defined.</div>
    </div>
</template>

<style scoped lang="scss">
.cal-picker {
    background: #0d1929;
    border: 1px solid #253048;
    border-radius: 6px;
    padding: 8px 10px;
    display: inline-block;
    min-width: 180px;
}

.picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 4px;
}

.month-label {
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    flex: 1;
    text-align: center;
}

.nav-btn {
    background: transparent;
    border: 1px solid var(--app-border, #2d3a56);
    color: var(--app-text-muted, #94a3b8);
    border-radius: 3px;
    cursor: pointer;
    padding: 1px 8px;
    font-size: 1rem;
    line-height: 1.4;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;

    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.3; cursor: not-allowed; }
}

.range-hint {
    font-size: 0.7rem;
    color: var(--app-text-dim, #4a6080);
    text-align: center;
    margin-bottom: 4px;
    font-style: italic;
}

.picker-grid {
    border-collapse: collapse;
    width: 100%;

    th {
        font-size: 0.68rem;
        font-weight: 600;
        color: var(--app-text-dim, #4a6080);
        text-align: center;
        padding: 2px 1px 4px;
        border-bottom: 1px solid #253048;
        user-select: none;
        min-width: 26px;

        &.weekend { color: #5b8ec4; }
    }

    td {
        padding: 1px;
        text-align: center;
    }
}

.day-btn {
    width: 26px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;

    &:hover { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }

    &.weekend { color: #5b8ec4; }

    &.selected {
        background: #2c5f8a;
        color: #e8f0ff;
        font-weight: 600;
    }

    &.is-start {
        background: #2c5f8a;
        color: #e8f0ff;
        font-weight: 600;
        border-radius: 4px 0 0 4px;
    }

    &.is-end {
        background: #2c5f8a;
        color: #e8f0ff;
        font-weight: 600;
        border-radius: 0 4px 4px 0;
    }

    &.in-range {
        background: #1e3355;
        color: #a8c4e8;
        border-radius: 0;
    }
}

.no-months-note {
    font-size: 0.78rem;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
    text-align: center;
    padding: 6px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

export interface MemDayMarker {
    id: string
    name: string
    color: string
    type: 'fixed' | 'weekly' | 'relative'
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    isRange: boolean
    weekDays: number[]
}

const props = defineProps<{
    monthName: string
    monthIndex: number
    days: number
    weekLength: number
    dayLabels: string[]
    weekendDays: number[]
    memorableDays?: MemDayMarker[]
}>()

const abbrevLen = computed(() => props.weekLength > 10 ? 1 : 2)
function abbrev(label: string): string { return label.slice(0, abbrevLen.value) }

// Build rows of day numbers (null = empty trailing cell)
const rows = computed(() => {
    const result: (number | null)[][] = []
    let day = 1
    while (day <= props.days) {
        const row: (number | null)[] = []
        for (let col = 0; col < props.weekLength; col++) {
            row.push(day <= props.days ? day++ : null)
        }
        result.push(row)
    }
    return result
})

function isWeekend(col: number): boolean {
    return props.weekendDays.includes(col)
}

// Return markers that fall on (monthIndex, day, dayOfWeek)
function markersForCell(day: number, colIndex: number): MemDayMarker[] {
    if (!props.memorableDays?.length) return []
    const mi = props.monthIndex
    const key = mi * 10000 + day

    return props.memorableDays.filter(md => {
        if (md.type === 'fixed') {
            if (!md.isRange) {
                return md.startMonth === mi && md.startDay === day
            }
            // Range: compare as packed integers
            const start = md.startMonth * 10000 + md.startDay
            const end   = md.endMonth   * 10000 + md.endDay
            return start <= end
                ? key >= start && key <= end           // normal range
                : key >= start || key <= end           // wraps year boundary
        }
        if (md.type === 'weekly') {
            return md.weekDays.includes(colIndex % props.weekLength)
        }
        // relative: not positioned without a specific year anchor
        return false
    })
}
</script>

<template>
    <div class="month-card">
        <div class="month-name">{{ monthName }}</div>
        <table class="month-table">
            <thead>
                <tr>
                    <th v-for="(label, i) in dayLabels" :key="i" :class="{ weekend: isWeekend(i) }">
                        {{ abbrev(label) }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, ri) in rows" :key="ri">
                    <td v-for="(day, ci) in row" :key="ci"
                        :class="{ weekend: isWeekend(ci), empty: day === null }">
                        <div v-if="day !== null" class="cell-wrap">
                            <span class="day-num">{{ day }}</span>
                            <div v-if="markersForCell(day, ci).length" class="dot-row">
                                <span
                                    v-for="m in markersForCell(day, ci)"
                                    :key="m.id"
                                    class="mem-dot"
                                    :style="{ background: m.color || '#aaa' }"
                                />
                            </div>
                            <!-- Tooltip -->
                            <div v-if="markersForCell(day, ci).length" class="cell-tooltip">
                                <div v-for="m in markersForCell(day, ci)" :key="m.id" class="tooltip-row">
                                    <span class="tooltip-dot" :style="{ background: m.color || '#aaa' }" />
                                    <span class="tooltip-name">{{ m.name }}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped lang="scss">
.month-card {
    background: #0f1926;
    border: 1px solid #2d3a56;
    border-radius: 6px;
    overflow: visible; // allow tooltips to escape
}

.month-name {
    background: #1e3060;
    color: #c8ddf8;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    padding: 5px 8px;
    letter-spacing: 0.03em;
    border-radius: 5px 5px 0 0;
}

.month-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;

    th {
        text-align: center;
        padding: 3px 2px;
        color: #6a88aa;
        font-weight: 600;
        font-size: 0.65rem;
        text-transform: uppercase;
        border-bottom: 1px solid #1e2b44;

        &.weekend { color: #7aa8e8; }
    }

    td {
        text-align: center;
        padding: 1px 2px;
        color: #b8ccec;
        font-variant-numeric: tabular-nums;
        vertical-align: top;

        &.weekend .day-num { color: #7aa8e8; }
        &.empty { color: transparent; }
    }

    tr:hover td:not(.empty) .day-num {
        background: #162035;
        border-radius: 3px;
    }
}

// ── Cell layout ──────────────────────────────────────────────────────────────

.cell-wrap {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 1px;

    &:hover .cell-tooltip {
        display: block;
    }
}

.day-num {
    display: block;
    line-height: 1.5;
    min-width: 16px;
}

// ── Memorable day dots ───────────────────────────────────────────────────────

.dot-row {
    display: flex;
    gap: 2px;
    justify-content: center;
    flex-wrap: wrap;
}

.mem-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

.cell-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: #0a1220;
    border: 1px solid #3b6ec4;
    border-radius: 5px;
    padding: 5px 8px;
    z-index: 9999;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    pointer-events: none;
}

.tooltip-row {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    color: #c8d8f0;
    line-height: 1.6;
}

.tooltip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.tooltip-name {
    font-size: 0.7rem;
    color: #c8d8f0;
}
</style>

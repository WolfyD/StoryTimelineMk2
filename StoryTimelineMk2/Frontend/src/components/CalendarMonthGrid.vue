<script setup lang="ts">
import { computed } from 'vue'
import type { MemDayMarker } from '@/types/models'

export type { MemDayMarker }

export interface ItemDot { color: string; title: string }

const props = defineProps<{
    monthName: string
    monthIndex: number
    days: number
    weekLength: number
    dayLabels: string[]
    weekendDays: number[]
    memorableDays?: MemDayMarker[]
    itemDots?: Record<number, ItemDot[]>
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
                        :class="{ weekend: isWeekend(ci), empty: day === null, 'has-items': day !== null && !!itemDots?.[day]?.length }">
                        <div v-if="day !== null" class="cell-wrap">
                            <span class="day-num">{{ day }}</span>
                            <!-- Item dots -->
                            <div v-if="itemDots?.[day]?.length" class="dot-row item-dot-row">
                                <template v-if="(itemDots[day]?.length ?? 0) <= 3">
                                    <span
                                        v-for="(dot, di) in itemDots[day]"
                                        :key="di"
                                        class="item-dot"
                                        :style="{ background: dot.color || '#6366f1' }"
                                    />
                                </template>
                                <template v-else>
                                    <span class="item-count-badge">{{ itemDots[day]?.length }}</span>
                                </template>
                            </div>
                            <!-- Memorable day dots -->
                            <div v-if="markersForCell(day, ci).length" class="dot-row">
                                <span
                                    v-for="m in markersForCell(day, ci)"
                                    :key="m.id"
                                    class="mem-dot"
                                    :style="{ background: m.color || '#aaa' }"
                                />
                            </div>
                            <!-- Tooltip: items first, then memorable days -->
                            <div v-if="itemDots?.[day]?.length || markersForCell(day, ci).length" class="cell-tooltip">
                                <div v-for="(dot, di) in (itemDots?.[day] ?? [])" :key="`i${di}`" class="tooltip-row">
                                    <span class="tooltip-dot" :style="{ background: dot.color || '#6366f1' }" />
                                    <span class="tooltip-name">{{ dot.title }}</span>
                                </div>
                                <div v-if="markersForCell(day, ci).length && itemDots?.[day]?.length" class="tooltip-sep" />
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
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 6px);
    overflow: visible; // allow tooltips to escape
}

.month-name {
    background: color-mix(in srgb, var(--app-surface-high, #1e2b44) 80%, var(--app-accent, #6366f1));
    color: var(--app-text, #e2e8f0);
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
        color: var(--app-text-dim, #64748b);
        font-weight: 600;
        font-size: 0.65rem;
        text-transform: uppercase;
        border-bottom: 1px solid var(--app-surface-high, #1e2b44);

        &.weekend { color: var(--app-accent-hover, #818cf8); }
    }

    td {
        text-align: center;
        padding: 1px 2px;
        color: var(--app-text-muted, #94a3b8);
        font-variant-numeric: tabular-nums;
        vertical-align: top;

        &.weekend .day-num { color: var(--app-accent-hover, #818cf8); }
        &.empty { color: transparent; }
    }

    tr:hover td:not(.empty) .day-num {
        background: var(--app-surface-raised, #141e33);
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

// ── Item highlight background ─────────────────────────────────────────────────

td.has-items {
    background: rgba(99, 102, 241, 0.09);
}

// ── Item dots ─────────────────────────────────────────────────────────────────

.item-dot-row {
    margin-bottom: 1px;
}

.item-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
}

.item-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 12px;
    border-radius: 6px;
    background: var(--app-accent, #6366f1);
    color: #fff;
    font-size: 0.58rem;
    font-weight: 700;
    padding: 0 3px;
    line-height: 1;
}

.tooltip-sep {
    height: 1px;
    background: var(--app-border, #2d3a56);
    margin: 3px 0;
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
    background: var(--app-bg, #0f172a);
    border: 1px solid var(--app-accent, #6366f1);
    border-radius: var(--app-radius-sm, 5px);
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
    color: var(--app-text, #e2e8f0);
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
    color: var(--app-text, #e2e8f0);
}
</style>

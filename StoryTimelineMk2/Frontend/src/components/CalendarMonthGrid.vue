<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { PhCake, PhCross } from '@phosphor-icons/vue'
import type { MemDayMarker } from '@/types/models'
import type { LifeMark } from '@/utils/calendarMath'
import { placeTip } from '@/utils/modal'

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
    /** BL-88: birthdays and death anniversaries, by day. */
    lifeMarks?: Record<number, LifeMark[]>
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

// The day's card. It hung above its cell, centred, so a day by an edge pushed it out of the window
// and the scrolling calendar clipped its top; now it is drawn over everything and placed by placeTip.
const tip = ref<{ day: number; col: number } | null>(null)
const tipEl = ref<HTMLElement | null>(null)

function onCellMove(e: MouseEvent, day: number, col: number) {
    if (!itemDotsFor(day).length && !lifeMarksFor(day).length && !markersForCell(day, col).length) {
        tip.value = null
        return
    }
    if (tip.value?.day !== day) tip.value = { day, col }
    void nextTick(() => placeTip(tipEl.value, e.clientX, e.clientY))
}

const itemDotsFor = (day: number) => props.itemDots?.[day] ?? []
const lifeMarksFor = (day: number) => props.lifeMarks?.[day] ?? []
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
                        <div v-if="day !== null" class="cell-wrap"
                            @mousemove="onCellMove($event, day, ci)" @mouseleave="tip = null">
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
                            <!-- Birthdays and death anniversaries -->
                            <div v-if="lifeMarks?.[day]?.length" class="dot-row life-row">
                                <template v-if="(lifeMarks[day]?.length ?? 0) <= 3">
                                    <component
                                        :is="m.kind === 'birth' ? PhCake : PhCross"
                                        v-for="(m, li) in lifeMarks[day]"
                                        :key="li"
                                        :size="9"
                                        weight="fill"
                                        class="life-icon"
                                        :class="`life-icon--${m.kind}`"
                                        :style="{ color: m.color }"
                                    />
                                </template>
                                <span v-else class="item-count-badge life-count-badge">{{ lifeMarks[day]?.length }}</span>
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
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        <!-- The hovered day: items first, then birthdays and anniversaries, then memorable days -->
        <Teleport to="body">
            <div v-if="tip" ref="tipEl" class="cell-tooltip" role="tooltip">
                <div v-for="(dot, di) in itemDotsFor(tip.day)" :key="`i${di}`" class="tooltip-row">
                    <span class="tooltip-dot" :style="{ background: dot.color || '#6366f1' }" />
                    <span class="tooltip-name">{{ dot.title }}</span>
                </div>
                <div v-for="(m, li) in lifeMarksFor(tip.day)" :key="`l${li}`" class="tooltip-row">
                    <component :is="m.kind === 'birth' ? PhCake : PhCross" :size="10" weight="fill" :style="{ color: m.color }" />
                    <span class="tooltip-name">{{ m.title }}</span>
                </div>
                <div v-if="markersForCell(tip.day, tip.col).length && (itemDotsFor(tip.day).length || lifeMarksFor(tip.day).length)" class="tooltip-sep" />
                <div v-for="m in markersForCell(tip.day, tip.col)" :key="m.id" class="tooltip-row">
                    <span class="tooltip-dot" :style="{ background: m.color || '#aaa' }" />
                    <span class="tooltip-name">{{ m.name }}</span>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.month-card {
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 6px);
    user-select: none; // a display, not text — dragging across days must not highlight them
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

// ── Birthdays and death anniversaries ────────────────────────────────────────

.life-icon { flex-shrink: 0; }

.life-count-badge {
    background: var(--app-surface-high, #1e2b44);
    color: var(--app-text, #e2e8f0);
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
    position: fixed;
    top: 0;
    left: 0;
    // A long title wraps rather than widening the card past the window.
    max-width: min(320px, calc(100vw - 8px));
    background: var(--app-bg, #0f172a);
    border: 1px solid var(--app-accent, #6366f1);
    border-radius: var(--app-radius-sm, 5px);
    padding: 5px 8px;
    z-index: var(--z-menu);
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

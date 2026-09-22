<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { BackendAPI, type BridgeMessage } from '@/bridge/api'
import { dayOfYearToMonthDay } from '@/utils/calendarMath'
import { useAppTheme } from '@/utils/useAppTheme'
import { useShortcuts } from '@/utils/shortcuts'
import HelpModal from '@/components/HelpModal.vue'
import ShortcutsModal from '@/components/ShortcutsModal.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import CalendarMonthGrid, { type ItemDot } from '@/components/CalendarMonthGrid.vue'
import type { TimelineItem, MemDayMarker } from '@/types/models'

useAppTheme()

// F1 / F2 (BL-39)
const showHelp      = ref(false)
const showShortcuts = ref(false)
useShortcuts('calendar', { help: () => { showHelp.value = true }, shortcuts: () => { showShortcuts.value = true } })

// ── Query params ──────────────────────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search)
const timelineId = parseInt(params.get('timelineId') ?? '0', 10)
const calendarId = params.get('calendarId') ?? ''

// ── Calendar state ────────────────────────────────────────────────────────────
interface MonthEntry { name: string; length: number; startDay: number }

const loading     = ref(true)
const error       = ref<string | null>(null)
const calName     = ref('Year Calendar')
const yearLength  = ref(365)
const months      = ref<MonthEntry[]>([])
const weekLength  = ref(7)
const dayLabels   = ref<string[]>([])
const weekendDays = ref<number[]>([])
const memorableDays = ref<MemDayMarker[]>([])

function parseYD(json: string) {
    if (!json) return
    try {
        const yd = JSON.parse(json)
        yearLength.value = yd.length ?? 365

        if (yd.month_definition) {
            const count = yd.months ?? 0
            let startDay = 0
            for (let i = 0; i < count; i++) {
                const m = yd.month_definition[String(i)]
                const len = m?.length ?? 0
                months.value.push({ name: m?.name ?? `Month ${i + 1}`, length: len, startDay })
                startDay += len
            }
        }

        if (yd.week_definition) {
            weekLength.value = yd.week_definition.length ?? 7
            dayLabels.value = yd.week_definition.days_have_names && yd.week_definition.days
                ? [...yd.week_definition.days]
                : Array.from({ length: weekLength.value }, (_, i) => `Day ${i + 1}`)
            weekendDays.value = yd.week_definition.weekend ? [...yd.week_definition.weekend] : []
        } else {
            dayLabels.value = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].slice(0, weekLength.value)
        }

        if (yd.memorable_days && Array.isArray(yd.memorable_days)) {
            memorableDays.value = (yd.memorable_days as Record<string, unknown>[]).map((d) => ({
                id:         String(d.id ?? ''),
                name:       String(d.name ?? ''),
                color:      String(d.color ?? '#aaa'),
                type:       (d.type as 'fixed' | 'weekly' | 'relative') ?? 'fixed',
                startMonth: Number(d.startMonth ?? 0),
                startDay:   Number(d.startDay ?? 0),
                endMonth:   Number(d.endMonth ?? 0),
                endDay:     Number(d.endDay ?? 0),
                isRange:    Boolean(d.isRange ?? false),
                weekDays:   Array.isArray(d.weekDays) ? (d.weekDays as number[]) : [],
            }))
        }
    } catch { /* ignore */ }
}

// ── Current year + items ──────────────────────────────────────────────────────
const currentYear  = ref(new Date().getFullYear())
const items        = ref<TimelineItem[]>([])
const showItems    = ref(true)

const itemDaysByMonth = computed((): Record<number, Record<number, ItemDot[]>> => {
    if (!showItems.value) return {}
    const result: Record<number, Record<number, ItemDot[]>> = {}
    for (const item of items.value) {
        const frac = item.AbsoluteStart - Math.floor(item.AbsoluteStart)
        const dayOfYear = Math.round(frac * yearLength.value)
        const { monthIndex, dayOfMonth } = dayOfYearToMonthDay(dayOfYear, months.value)
        const dayNum = dayOfMonth + 1
        if (!result[monthIndex]) result[monthIndex] = {}
        if (!result[monthIndex][dayNum]) result[monthIndex][dayNum] = []
        result[monthIndex][dayNum]!.push({ color: item.Color || '#6366f1', title: item.Title })
    }
    return result
})

async function loadYear(year: number) {
    currentYear.value = year
    if (!timelineId) return
    try {
        const res = await BackendAPI.GetItemsForYear(timelineId, year)
        items.value = res?.items ?? []
    } catch (ex) {
        console.error('GetItemsForYear failed', ex)
    }
}

// ── Backend push listener ─────────────────────────────────────────────────────
function onBridgeMessage(data: BridgeMessage) {
    if (data?.action === 'SetCalendarYear' && typeof data.payload?.year === 'number') {
        loadYear(data.payload.year)
    }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let stopListening: (() => void) | null = null

onMounted(async () => {
    loading.value = true
    try {
        if (calendarId) {
            const cal = await BackendAPI.GetCalendarById(calendarId)
            if (cal) {
                calName.value = cal.Name || 'Year Calendar'
                parseYD(cal.YearDefinition)
            }
        }
    } catch {
        error.value = 'Failed to load calendar.'
    } finally {
        loading.value = false
    }

    await loadYear(currentYear.value)

    stopListening = BackendAPI.onHostMessage(onBridgeMessage)
})

onUnmounted(() => {
    stopListening?.()
    stopListening = null
})

const effectiveDayLabels = computed(() =>
    dayLabels.value.length === weekLength.value
        ? dayLabels.value
        : Array.from({ length: weekLength.value }, (_, i) => `D${i + 1}`)
)
</script>

<template>
    <div class="yc-root">
        <WindowTitleBar :title="calName" :subtitle="String(currentYear)" :show-maximize="true" />

        <div class="yc-toolbar">
            <span class="yc-year-label">Year {{ currentYear }}</span>
            <div class="yc-toolbar-right">
                <button
                    class="yc-toggle"
                    :class="{ active: showItems }"
                    title="Toggle timeline items on calendar"
                    @click="showItems = !showItems"
                >
                    <i class="ri-calendar-event-line" />
                    Items
                </button>
            </div>
        </div>

        <div v-if="loading" class="yc-loading">Loading…</div>
        <div v-else-if="error" class="yc-error">{{ error }}</div>

        <div v-else class="yc-body">
            <p v-if="months.length === 0" class="yc-no-months">No months defined for this calendar.</p>
            <div v-else class="yc-month-grid">
                <CalendarMonthGrid
                    v-for="(m, i) in months"
                    :key="i"
                    :month-name="m.name"
                    :month-index="i"
                    :days="m.length"
                    :week-length="weekLength"
                    :day-labels="effectiveDayLabels"
                    :weekend-days="weekendDays"
                    :memorable-days="memorableDays"
                    :item-dots="itemDaysByMonth[i]"
                />
            </div>
        </div>
    </div>
    <HelpModal v-if="showHelp" @close="showHelp = false" />
    <ShortcutsModal v-if="showShortcuts" context="calendar" @close="showShortcuts = false" />
</template>

<style scoped lang="scss">
.yc-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

.yc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    background: var(--app-surface, #0c1524);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
    gap: 8px;
}

.yc-year-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--app-accent-hover, #818cf8);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
}

.yc-toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
}

.yc-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-dim, #4a6080);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover { color: var(--app-text-muted, #94a3b8); }

    &.active {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
        background: color-mix(in srgb, var(--app-accent, #6366f1) 12%, transparent);
    }
}

// ── Body ──────────────────────────────────────────────────────────────────────

.yc-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
}

.yc-loading,
.yc-error,
.yc-no-months {
    text-align: center;
    padding: 40px 0;
    color: var(--app-text-dim, #64748b);
    font-style: italic;
}

.yc-month-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    align-items: start;
}
</style>

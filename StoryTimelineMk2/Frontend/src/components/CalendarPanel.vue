<script setup lang="ts">
import { computed } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { getYearStartDow, dayOfYearToMonthDay } from '@/utils/calendarMath'
import type { LayoutSettings } from '@/types/models'

const SEASON_PALETTE = ['#e8944a', '#5ba55b', '#5b8ec4', '#b36eb3', '#d4a843', '#5baaaa', '#c0636b', '#6baec0']

const props = defineProps<{ layoutSettings: LayoutSettings | null }>()

const store = useTimelineStore()
const cfg   = computed(() => store.calendarConfig)

const calStyle = computed(() => {
    const ls = props.layoutSettings
    return {
        '--cs-bg':        ls?.CalendarPanelBackgroundColor || '#f5f0e8',
        '--cs-border':    ls?.CalendarPanelBorderColor     || '#d5cec4',
        '--cs-text':      ls?.CalendarPanelTextColor       || '#5c4a38',
        '--cs-week-hl':   ls?.CalendarPanelWeekHighlightColor || '#6366f118',
        '--cs-day-hl':    ls?.CalendarPanelDayHighlightColor  || '#6366f135',
        '--cs-season-hl': ls?.TimelineCalendarOverlaySeasonColor || '#ffffff10',
    }
})

// ── LOD detection — step-fraction thresholds, no hardcoded format keys ───────
const currentStep  = computed(() => store.lodProfile[store.currentLodIndex]?.stepFraction ?? 1.0)
const seasonStep   = computed(() => 1 / (cfg.value.seasons.length || 4))
const monthStep    = computed(() => 1 / (cfg.value.months.length  || 12))
const weekStep     = computed(() => (cfg.value.weekLength || 7) / (cfg.value.yearLength || 365))

type CalLod = 'year' | 'season' | 'month' | 'week' | 'day'
const calLod = computed((): CalLod => {
    const s = currentStep.value
    if (s >= 1.0)             return 'year'
    if (s >= seasonStep.value) return 'season'
    if (s >= monthStep.value)  return 'month'
    if (s >= weekStep.value)   return 'week'
    return 'day'
})

// ── Current calendar position ────────────────────────────────────────────────
const centerYear     = computed(() => Math.floor(store.centerAbsoluteTime))
const centerFraction = computed(() => store.centerAbsoluteTime - centerYear.value)
const centerDayOfYear = computed(() => Math.round(centerFraction.value * (cfg.value.yearLength || 365)))

const centerMonthDay    = computed(() => dayOfYearToMonthDay(centerDayOfYear.value, cfg.value.months))
const currentMonthIdx   = computed(() => centerMonthDay.value.monthIndex)
const currentDayOfMonth = computed(() => centerMonthDay.value.dayOfMonth)

// Month boundaries
const monthStartDay = computed(() => cfg.value.months[currentMonthIdx.value]?.startDay ?? 0)
const monthLength   = computed(() => {
    const months = cfg.value.months
    if (months.length === 0) return Math.round((cfg.value.yearLength || 365) / 12)
    const next = months[currentMonthIdx.value + 1]?.startDay ?? (cfg.value.yearLength || 365)
    return next - (months[currentMonthIdx.value]?.startDay ?? 0)
})
const monthName = computed(() =>
    cfg.value.months[currentMonthIdx.value]?.name ?? `Month ${currentMonthIdx.value + 1}`
)

// First column (0-indexed) this month starts on
const monthStartColumn = computed(() =>
    (getYearStartDow(
        centerYear.value,
        cfg.value.yearLength || 365,
        cfg.value.weekLength || 7,
        cfg.value.yearStartDow,
    ) + monthStartDay.value) % (cfg.value.weekLength || 7)
)

// Week-of-year index for the current day
const currentWeekOfYear = computed(() =>
    Math.floor(centerDayOfYear.value / (cfg.value.weekLength || 7))
)

// Day-of-week labels from calendar definition or generic abbreviations
const dayLabels = computed(() => {
    const w = cfg.value.weekLength || 7
    try {
        const yd = JSON.parse(store.calendar?.YearDefinition ?? '{}')
        const wd = yd?.week_definition
        if (wd?.days_have_short_names && Array.isArray(wd.days_short) && wd.days_short.length >= w)
            return (wd.days_short as string[]).slice(0, w)
        if (wd?.days_have_names && Array.isArray(wd.days) && wd.days.length >= w)
            return (wd.days as string[]).slice(0, w).map((d: string) => String(d).slice(0, 2))
    } catch { /* fallback */ }
    const defaults = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    return Array.from({ length: w }, (_, i) => defaults[i] ?? `D${i + 1}`)
})

// ── Week row containment ─────────────────────────────────────────────────────
function isInCurrentWeek(dayOfMonth: number): boolean {
    return Math.floor((monthStartDay.value + dayOfMonth) / (cfg.value.weekLength || 7)) === currentWeekOfYear.value
}

// ── Season track segments (proportional to day-count, same as CalendarApp) ───
const seasonSegments = computed(() =>
    cfg.value.seasons.map((s, i) => {
        let len = s.end - s.start + 1
        if (len <= 0) len += (cfg.value.yearLength || 365)
        return { name: s.name || `Season ${i + 1}`, length: Math.max(len, 1), color: SEASON_PALETTE[i % SEASON_PALETTE.length]! }
    })
)

// ── Current season index ─────────────────────────────────────────────────────
const currentSeasonIdx = computed(() => {
    if (!cfg.value.seasons.length) return -1
    const day = centerDayOfYear.value
    for (let i = 0; i < cfg.value.seasons.length; i++) {
        const s = cfg.value.seasons[i]!
        const inRange = s.start <= s.end
            ? (day >= s.start && day <= s.end)
            : (day >= s.start || day <= s.end)
        if (inRange) return i
    }
    return 0
})

// ── Age / Period spanning center year ────────────────────────────────────────
const ageItem = computed(() =>
    store.items.find(i => i.TypeId === 3 && i.Year <= centerYear.value && i.EndYear >= centerYear.value)
)
const periodItem = computed(() =>
    store.items.find(i => i.TypeId === 2 && i.Year <= centerYear.value && i.EndYear >= centerYear.value)
)

// ── Importance-8 items at center year ────────────────────────────────────────
const importance8Items = computed(() =>
    store.items.filter(i => i.Importance === 8 && Math.floor(i.AbsoluteStart) === centerYear.value)
)

// ── Memorable days at current position ───────────────────────────────────────
const currentDow = computed(() => {
    const yearDow = getYearStartDow(
        centerYear.value,
        cfg.value.yearLength || 365,
        cfg.value.weekLength || 7,
        cfg.value.yearStartDow,
    )
    return (yearDow + centerDayOfYear.value) % (cfg.value.weekLength || 7)
})

function markToYearDay(monthIdx: number, dayOfMonth: number): number {
    return (cfg.value.months[monthIdx]?.startDay ?? 0) + dayOfMonth
}

const memorableDaysNow = computed(() =>
    cfg.value.memorableDays.filter(md => {
        if (md.type === 'fixed') {
            if (md.isRange) {
                const cur = centerDayOfYear.value
                return cur >= markToYearDay(md.startMonth, md.startDay)
                    && cur <= markToYearDay(md.endMonth, md.endDay)
            }
            return md.startMonth === currentMonthIdx.value && md.startDay === currentDayOfMonth.value
        }
        if (md.type === 'weekly') {
            return md.weekDays.includes(currentDow.value)
        }
        return false
    })
)

// Leading-empty array for month grid offset (Vue v-for doesn't accept 0)
const leadingEmpties = computed(() =>
    monthStartColumn.value > 0 ? Array.from({ length: monthStartColumn.value }) : []
)
</script>

<template>
    <div class="cal-panel" :style="calStyle">

        <!-- ── Calendar display (top) ──────────────────────────────────────── -->
        <div class="cal-section">

            <div v-if="calLod === 'year'" class="no-cal-lod">
                <i class="ri-calendar-2-line" />
                <span>No calendar at this LOD</span>
            </div>

            <!-- Season track (proportional flex bar, same as CalendarApp) -->
            <div v-else-if="calLod === 'season'" class="season-track">
                <div
                    v-for="(seg, i) in seasonSegments"
                    :key="i"
                    :class="['season-seg', { active: i === currentSeasonIdx }]"
                    :style="{ flex: seg.length, background: seg.color }"
                    :title="seg.name"
                >
                    <span class="season-seg-label">{{ seg.name }}</span>
                </div>
            </div>

            <!-- Month mini-grid (month / week / day LOD) -->
            <template v-else>
                <div class="month-mini-header">
                    <span class="month-name">{{ monthName }}</span>
                    <span class="month-year">{{ centerYear }}</span>
                </div>
                <div class="month-grid" :style="{ '--wcols': cfg.weekLength }">
                    <div v-for="(lbl, i) in dayLabels" :key="`h${i}`" class="mg-hdr">{{ lbl }}</div>
                    <div v-for="(_, i) in leadingEmpties" :key="`e${i}`" class="mg-empty"></div>
                    <div
                        v-for="d in monthLength"
                        :key="d"
                        :class="[
                            'mg-day',
                            {
                                'hl-day':  calLod === 'day'  && d - 1 === currentDayOfMonth,
                                'hl-week': calLod === 'week' && isInCurrentWeek(d - 1),
                            }
                        ]"
                    >{{ d }}</div>
                </div>
            </template>
        </div>

        <!-- ── Age / Period ────────────────────────────────────────────────── -->
        <div v-if="ageItem || periodItem" class="age-period-section">
            <div v-if="ageItem" class="age-title">{{ ageItem.Title }}</div>
            <div v-if="periodItem" class="period-title">{{ periodItem.Title }}</div>
        </div>

        <!-- ── Memorable days ─────────────────────────────────────────────── -->
        <div v-if="memorableDaysNow.length" class="cp-sub-section">
            <div class="cp-section-label">Memorable days</div>
            <div v-for="md in memorableDaysNow" :key="md.id" class="mem-day-row">
                <span class="mem-dot" :style="{ background: md.color }" />
                <span>{{ md.name }}</span>
            </div>
        </div>

        <!-- ── Importance-8 items ─────────────────────────────────────────── -->
        <div v-if="importance8Items.length" class="cp-sub-section">
            <div class="cp-section-label">Notable</div>
            <div v-for="item in importance8Items" :key="item.Id" class="sig-item-row">
                {{ item.Title }}
            </div>
        </div>

    </div>
</template>

<style scoped lang="scss">
.cal-panel {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
    padding: 8px;
    background: var(--cs-bg, #0f172a);
    color: var(--cs-text, #94a3b8);
    font-size: 0.82em;
    gap: 0;
}

// ── No-calendar placeholder ──────────────────────────────────────────────────
.no-cal-lod {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 24px 0;
    color: color-mix(in srgb, var(--cs-text, #94a3b8) 50%, transparent);
    font-style: italic;

    i { font-size: 1.8em; }
}

// ── Season track ─────────────────────────────────────────────────────────────
.season-track {
    display: flex;
    height: 28px;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid var(--cs-border, #d5cec4);
    margin: 2px 0 4px;
}

.season-seg {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 2px;
    opacity: 0.55;
    transition: opacity 0.25s ease;

    &.active {
        opacity: 1;
        box-shadow: inset 0 -3px 0 rgba(255,255,255,0.35);
    }
}

.season-seg-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: rgba(255,255,255,0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 6px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    pointer-events: none;
}

// ── Cal section wrapper (separator) ─────────────────────────────────────────
.cal-section {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--cs-border, #1e293b);
    margin-bottom: 8px;
}

// ── Month mini-grid ──────────────────────────────────────────────────────────
.month-mini-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 1px 5px;
}

.month-name {
    font-weight: 600;
    font-size: 0.93em;
}

.month-year {
    opacity: 0.5;
    font-size: 0.82em;
}

.month-grid {
    display: grid;
    grid-template-columns: repeat(var(--wcols, 7), 1fr);
    gap: 2px;
}

.mg-hdr {
    text-align: center;
    font-size: 0.68em;
    opacity: 0.45;
    padding: 2px 0 3px;
    user-select: none;
}

.mg-day {
    text-align: center;
    padding: 3px 1px;
    font-size: 0.78em;
    line-height: 1.4;
    transition: background 0.2s ease;
    cursor: default;

    &.hl-week {
        background: var(--cs-week-hl, #6366f118);
        border-radius: 2px;
    }

    &.hl-day {
        background: var(--cs-day-hl, #6366f135);
        border-radius: 2px;
    }
}

// ── Age / Period section ─────────────────────────────────────────────────────
.age-period-section {
    padding: 4px 2px 8px;
    border-bottom: 1px solid var(--cs-border, #1e293b);
    margin-bottom: 8px;
}

.age-title {
    font-weight: 700;
    font-size: 0.93em;
    letter-spacing: 0.01em;
}

.period-title {
    font-size: 0.87em;
    opacity: 0.78;
    margin-top: 2px;
}

// ── Sub-sections (memorable days, notable items) ─────────────────────────────
.cp-sub-section {
    padding: 4px 2px 8px;
    border-bottom: 1px solid var(--cs-border, #1e293b);
    margin-bottom: 8px;
}

.cp-section-label {
    font-size: 0.68em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.4;
    margin-bottom: 5px;
}

.mem-day-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 0.87em;
}

.mem-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.sig-item-row {
    padding: 2px 2px;
    font-size: 0.87em;
    opacity: 0.88;
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue'
import { BackendAPI } from '@/bridge/api'
import { useAppTheme } from '@/utils/useAppTheme'
import { useShortcuts } from '@/utils/shortcuts'
import { backdropClose } from '@/utils/modal'
import HelpModal from '@/components/HelpModal.vue'
import ShortcutsModal from '@/components/ShortcutsModal.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import type { LodLevel } from '@/types/models'
import MemorableDaysModal, { type MemorableDay } from '@/components/MemorableDaysModal.vue'
import { defaultRelativeRule, type RelativeRule } from '@/utils/relativeRule'

useAppTheme()

// F1 / F2 (BL-39)
const showHelp      = ref(false)
const showShortcuts = ref(false)
useShortcuts('calendar', { help: () => { showHelp.value = true }, shortcuts: () => { showShortcuts.value = true } })

const params = new URLSearchParams(window.location.search)
const calendarIdParam = params.get('calendarId')
const isNew = !calendarIdParam

const isLoading = ref(true)
const isSaving = ref(false)
const saveError = ref('')

// ---- Calendar metadata ----
const calId = ref(calendarIdParam ?? crypto.randomUUID())
const lodProfileId = ref(crypto.randomUUID())
const calName = ref('New Calendar')
const shortName = ref('')
const alternateName = ref('')
const nameBefore0 = ref('')
const nameAfter0 = ref('')
const lodProfileName = ref('LOD Profile')

// ---- LOD levels ----
const lodLevels = ref<LodLevel[]>([])
const KNOWN_FORMAT_KEYS = ['MILLENNIA', 'CENTURIES', 'DECADES', 'YEARS', 'SEASONS', 'MONTHS', 'WEEKS', 'DAYS']
const ADD_LOD_KEYS = KNOWN_FORMAT_KEYS.filter(k => k !== 'YEARS')
const useFractions = ref(false)
const lodManuallyEdited = ref(false)
// Levels the saved profile deliberately lacks: the auto-sync updates rows, it must not re-add these.
const lodAbsentKeys = new Set<string>()

// ---- LOD add-level form ----
const showAddLodForm = ref(false)
const addLodKey = ref('YEARS')
const addLodStep = ref(1)

function openAddLodForm() { showAddLodForm.value = true; addLodKey.value = ''; addLodStep.value = 1 }
function confirmAddLod() {
    const key = addLodKey.value.trim()
    if (!key || key === 'YEARS') return
    lodManuallyEdited.value = true
    lodLevels.value.push({ index: lodLevels.value.length, formatKey: key, stepFraction: addLodStep.value })
    showAddLodForm.value = false
}

function sortLodByStep() {
    const items = [...lodLevels.value].sort((a, b) => b.stepFraction - a.stepFraction)
    items.forEach((l, i) => l.index = i)
    lodLevels.value = items
    lodManuallyEdited.value = true
}

// ---- LOD drag-to-reorder ----
const lodDragIndex = ref<number | null>(null)
const lodDragOver  = ref<number | null>(null)

function onLodDragStart(i: number, e: DragEvent) {
    lodDragIndex.value = i
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onLodDragOver(i: number) { lodDragOver.value = i }
function onLodDrop(i: number) {
    const from = lodDragIndex.value
    if (from === null || from === i) { lodDragIndex.value = null; lodDragOver.value = null; return }
    const items = [...lodLevels.value]
    const [moved] = items.splice(from, 1)
    items.splice(i, 0, moved)
    items.forEach((l, idx) => l.index = idx)
    lodLevels.value = items
    lodManuallyEdited.value = true
    lodDragIndex.value = null
    lodDragOver.value = null
}
function onLodDragEnd() { lodDragIndex.value = null; lodDragOver.value = null }

function addLodLevelManual() {
    lodManuallyEdited.value = true
    lodLevels.value.push({ index: lodLevels.value.length, formatKey: 'YEARS', stepFraction: 1 })
}

function removeLodLevelManual(i: number) {
    if (lodLevels.value[i]?.formatKey === 'YEARS') return
    lodManuallyEdited.value = true
    lodLevels.value.splice(i, 1)
}

function autoSetLod() {
    const levels: LodLevel[] = [
        { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
        { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
        { index: 2, formatKey: 'DECADES',   stepFraction: 10 },
        { index: 3, formatKey: 'YEARS',     stepFraction: 1 },
    ]
    if (hasSeasons.value && seasons.value.length > 0)
        levels.push({ index: levels.length, formatKey: 'SEASONS', stepFraction: 1 / seasons.value.length })
    if (months.value.length > 0)
        levels.push({ index: levels.length, formatKey: 'MONTHS', stepFraction: 1 / months.value.length })
    if (hasWeekDef.value && yearLength.value > 0)
        levels.push({ index: levels.length, formatKey: 'WEEKS', stepFraction: weekLength.value / yearLength.value })
    if (yearLength.value > 0)
        levels.push({ index: levels.length, formatKey: 'DAYS', stepFraction: 1 / yearLength.value })
    lodLevels.value = levels
    lodManuallyEdited.value = false
}

function syncLodStepFractions() {
    // Remove SEASONS row if seasons disabled (and forget it was absent, so re-enabling adds it back)
    if (!hasSeasons.value) {
        lodLevels.value = lodLevels.value.filter(l => l.formatKey !== 'SEASONS')
        lodAbsentKeys.delete('SEASONS')
    }
    // Remove WEEKS row if weeks disabled
    if (!hasWeekDef.value) {
        lodLevels.value = lodLevels.value.filter(l => l.formatKey !== 'WEEKS')
        lodAbsentKeys.delete('WEEKS')
    }
    // Update an existing row; add a missing one at its place in step order (never re-add a removed one)
    const upsert = (formatKey: string, stepFraction: number) => {
        const row = lodLevels.value.find(l => l.formatKey === formatKey)
        if (row) { row.stepFraction = stepFraction; return }
        if (lodAbsentKeys.has(formatKey)) return
        const at = lodLevels.value.findIndex(l => l.stepFraction < stepFraction)
        lodLevels.value.splice(at < 0 ? lodLevels.value.length : at, 0, { index: 0, formatKey, stepFraction })
    }
    if (hasSeasons.value && seasons.value.length > 0) upsert('SEASONS', 1 / seasons.value.length)
    if (months.value.length > 0) upsert('MONTHS', 1 / months.value.length)
    if (hasWeekDef.value && yearLength.value > 0) upsert('WEEKS', weekLength.value / yearLength.value)
    // Update DAYS
    if (yearLength.value > 0) {
        const row = lodLevels.value.find(l => l.formatKey === 'DAYS')
        if (row) row.stepFraction = 1 / yearLength.value
    }
    // Re-index
    lodLevels.value.forEach((l, i) => l.index = i)
}

// ---- Help system ----
const openHelp = ref<string | null>(null)
function toggleHelp(key: string) { openHelp.value = openHelp.value === key ? null : key }

const collapsed = ref<Record<string, boolean>>({})
function toggleCollapse(key: string) { collapsed.value[key] = !collapsed.value[key] }

const helpTexts: Record<string, string> = {
    info: 'The basic details of your calendar. Short Name appears in compact displays. Alternate Name is an unofficial or historical alias. Era Before/After Year 0 are the labels used for dates on either side of year zero (e.g. BCE / CE, or BK / AK for a custom calendar).',
    lod: 'Level of Detail (LOD) controls how the timeline zooms. Each level has a Format Key — the type of unit shown at that zoom — and a Step Fraction: how many years one tick represents. Lower index = broader view (millennia), higher index = finer detail (days). Built-in Format Keys: MILLENNIA, CENTURIES, DECADES, YEARS, SEASONS, MONTHS, WEEKS, DAYS. Use the ½ toggle to enter step fractions as N/D (e.g. 1/365 for a day).',
    months: 'Define every month of your calendar year. Year Length is the total number of days in the year. Each month has a name, optional short name, and a day count. If Seasons are enabled, each month can be assigned a season index (0-based) to link it to one of your defined seasons.',
    weeks: 'Define how weeks work in your calendar. Set the number of days per week, optionally give each day a full and short name, and mark which days count as weekend. If day names are disabled, only the weekend day pattern is stored.',
    seasons: 'Define the seasons of your calendar. Each season has a name, optional short name, a start and end day-of-year (0-indexed), and an optional significance tag like "hottest" or "coldest". Months reference seasons by their index number (0-based) shown in the # column.',
}

// ---- Year Definition ----
let isScalingMonths = false  // prevents months→year feedback loop during year-driven updates
const yearLength = ref(365)

// Months
const monthsHaveShortName = ref(true)
interface MonthEntry { name: string; shortName: string; length: number; season: number }
const months = ref<MonthEntry[]>([])

// Months → Year: keep yearLength in sync with the sum of month lengths
watch(months, () => {
    if (isScalingMonths) return
    // Number(...) || 0: a month length cleared mid-edit is '' — plain `+` would
    // switch to string concatenation ("03030…") and corrupt yearLength.
    yearLength.value = months.value.reduce((s, m) => s + (Number(m.length) || 0), 0)
}, { deep: true })

// Year → Months: scale all months proportionally when the user edits yearLength directly
function onYearLengthInput(newVal: number) {
    if (isNaN(newVal) || newVal < 1) return
    const oldTotal = months.value.reduce((s, m) => s + m.length, 0)
    if (months.value.length === 0 || oldTotal === 0) {
        yearLength.value = newVal
        return
    }
    isScalingMonths = true
    const ratio = newVal / oldTotal
    let distributed = 0
    months.value.forEach((m, i) => {
        if (i < months.value.length - 1) {
            const scaled = Math.max(1, Math.round(m.length * ratio))
            m.length = scaled
            distributed += scaled
        } else {
            m.length = Math.max(1, newVal - distributed)
        }
    })
    yearLength.value = months.value.reduce((s, m) => s + m.length, 0)
    nextTick(() => { isScalingMonths = false })
}

// Weeks
const hasWeekDef = ref(false)
const weekLength = ref(7)
const daysHaveNames = ref(false)
const dayNames = ref<string[]>([])
const daysHaveShortNames = ref(false)
const dayShortNames = ref<string[]>([])
const weekendDays = ref<number[]>([])

// Seasons
const hasSeasons = ref(false)
const seasonsHaveShortName = ref(false)
interface SeasonEntry { name: string; shortName: string; start: number; end: number; significance: string }
const seasons = ref<SeasonEntry[]>([])

// ---- Season track ----
const SEASON_PALETTE = ['#e8944a', '#5ba55b', '#5b8ec4', '#b36eb3', '#d4a843', '#5baaaa', '#c0636b', '#6baec0']

interface SeasonSegment { name: string; length: number; color: string }
const seasonSegments = computed((): SeasonSegment[] => {
    if (!hasSeasons.value || seasons.value.length === 0) return []
    return seasons.value.map((s, i) => {
        let len = s.end - s.start + 1
        if (len <= 0) len += yearLength.value
        return { name: s.name || `Season ${i + 1}`, length: Math.max(len, 1), color: SEASON_PALETTE[i % SEASON_PALETTE.length] }
    })
})

// ---- Season DOY modal ----
const showSeasonDoyModal = ref(false)
const doyBackdrop = backdropClose(() => { showSeasonDoyModal.value = false })
const seasonStartInput = ref(1)

function openSeasonDoyModal() {
    seasonStartInput.value = seasons.value.length > 0 ? seasons.value[0].start + 1 : 1
    showSeasonDoyModal.value = true
}

function applySeasonDOY() {
    showSeasonDoyModal.value = false
    const n = seasons.value.length
    if (n === 0) return
    const startIdx = Math.max(0, seasonStartInput.value - 1) // convert to 0-indexed
    const base = Math.floor(yearLength.value / n)
    const extra = yearLength.value % n
    let cur = startIdx
    seasons.value.forEach((s, i) => {
        const len = base + (i < extra ? 1 : 0)
        s.start = cur % yearLength.value
        s.end = (cur + len - 1) % yearLength.value
        cur += len
    })
}

// ---- Memorable Days ----
const hasMemorableDays = ref(false)
const memorableDays = ref<MemorableDay[]>([])
const showMemDays = ref(false)                    // the list + editor modal
const memDayId = ref<string | null>(null)         // day selected in the modal

function openMemDays(id: string | null = null) {
    memDayId.value = id
    showMemDays.value = true
}

function addMemorableDay() {
    const id = crypto.randomUUID()
    memDayId.value = id
    memorableDays.value.push({
        id,
        name: 'New Day',
        color: '#e8944a',
        type: 'fixed',
        startMonth: 0,
        startDay: 1,
        endMonth: 0,
        endDay: 1,
        isRange: false,
        weekDays: [],
        rule: defaultRelativeRule(),
    })
}

const dayLabelsForPicker = computed((): string[] | undefined => {
    if (!hasWeekDef.value || weekLength.value === 0) return undefined
    if (daysHaveShortNames.value && dayShortNames.value.length >= weekLength.value)
        return dayShortNames.value.slice(0, weekLength.value)
    if (daysHaveNames.value && dayNames.value.length >= weekLength.value)
        return dayNames.value.slice(0, weekLength.value)
    return undefined
})
function removeMemorableDay(i: number) { memorableDays.value.splice(i, 1) }
function removeMemorableDayById(id: string) {
    const i = memorableDays.value.findIndex(d => d.id === id)
    if (i >= 0) removeMemorableDay(i)
}

// ---- Fraction conversion ----
function toFraction(value: number): string {
    if (!isFinite(value) || value === 0) return '0'
    if (Number.isInteger(value)) return String(value)
    const neg = value < 0
    value = Math.abs(value)
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = value
    for (let i = 0; i < 64; i++) {
        const a = Math.floor(b)
        const h = a * h1 + h2
        const k = a * k1 + k2
        if (Math.abs(h / k - value) < 1e-9 || k > 100_000) {
            return k === 1 ? `${neg ? '-' : ''}${h}` : `${neg ? '-' : ''}${h}/${k}`
        }
        b = 1 / (b - a); h2 = h1; h1 = h; k2 = k1; k1 = k
    }
    return String(neg ? -value : value)
}

function parseFraction(str: string): number {
    const s = str.trim()
    const slash = s.indexOf('/')
    if (slash !== -1) {
        const num = parseFloat(s.slice(0, slash))
        const den = parseFloat(s.slice(slash + 1))
        return isNaN(num) || isNaN(den) || den === 0 ? NaN : num / den
    }
    return parseFloat(s)
}

function updateStepFraction(lod: LodLevel, str: string) {
    const v = parseFraction(str)
    if (!isNaN(v) && v >= 0) lod.stepFraction = v
}

// ---- Sync day arrays when week length changes ----
watch(weekLength, (newLen) => {
    // v-model.number yields '' while the user clears the field to retype —
    // splice('') === splice(0) would wipe every custom day name. Ignore
    // transient invalid values; the arrays sync once a real number lands.
    if (!Number.isInteger(newLen) || newLen < 1) return
    while (dayNames.value.length < newLen) {
        const i = dayNames.value.length
        dayNames.value.push(`Day ${i + 1}`)
        dayShortNames.value.push(`D${i + 1}`)
    }
    dayNames.value.splice(newLen)
    dayShortNames.value.splice(newLen)
    weekendDays.value = weekendDays.value.filter(d => d < newLen)
})

// ---- Auto-sync LOD step fractions when not manually edited ----
watch([months, hasSeasons, seasons, hasWeekDef, weekLength, yearLength], () => {
    if (lodManuallyEdited.value) return
    syncLodStepFractions()
}, { deep: true })

// ---- Parse YearDefinition JSON ----
function parseYearDefinition(json: string) {
    if (!json) return
    isScalingMonths = true
    try {
        const yd = JSON.parse(json)
        yearLength.value = yd.length ?? 365

        if (yd.month_definition) {
            monthsHaveShortName.value = yd.month_definition.months_have_short_name ?? false
            const count = yd.months ?? 12
            months.value = []
            for (let i = 0; i < count; i++) {
                const m = yd.month_definition[String(i)]
                months.value.push({ name: m?.name ?? `Month ${i + 1}`, shortName: m?.short_name ?? '', length: m?.length ?? 30, season: m?.season ?? 0 })
            }
        }

        if (yd.week_definition) {
            hasWeekDef.value = true
            weekLength.value = yd.week_definition.length ?? 7
            daysHaveNames.value = yd.week_definition.days_have_names ?? false
            dayNames.value = yd.week_definition.days ? [...yd.week_definition.days] : Array.from({ length: weekLength.value }, (_, i) => `Day ${i + 1}`)
            daysHaveShortNames.value = yd.week_definition.days_have_short_names ?? false
            dayShortNames.value = yd.week_definition.days_short ? [...yd.week_definition.days_short] : Array.from({ length: weekLength.value }, (_, i) => `D${i + 1}`)
            weekendDays.value = yd.week_definition.weekend ? [...yd.week_definition.weekend] : []
        }

        if (yd.season_definition && yd.seasons) {
            hasSeasons.value = true
            seasonsHaveShortName.value = yd.season_definition.seasons_have_short_name ?? false
            seasons.value = []
            for (let i = 0; i < (yd.seasons as number); i++) {
                const s = yd.season_definition[String(i)]
                seasons.value.push({ name: s?.name ?? `Season ${i + 1}`, shortName: s?.short_name ?? '', start: s?.start ?? 0, end: s?.end ?? 89, significance: s?.significance ?? '' })
            }
        }

        if (yd.memorable_days && Array.isArray(yd.memorable_days)) {
            hasMemorableDays.value = true
            memorableDays.value = (yd.memorable_days as Record<string, unknown>[]).map(d => ({
                ...d,
                type: (d.type as 'fixed' | 'weekly' | 'relative') ?? 'fixed',
                weekDays: (d.weekDays as number[]) ?? [],
                rule: (d.rule as RelativeRule) ?? defaultRelativeRule(),
            })) as MemorableDay[]
        }
    } catch (e) {
        console.error('Failed to parse YearDefinition', e)
    } finally {
        nextTick(() => { isScalingMonths = false })
    }
}

// ---- Load ----
onMounted(async () => {
    if (!isNew && calendarIdParam) {
        const cal = await BackendAPI.GetCalendarById(calendarIdParam)
        if (cal) {
            calId.value = cal.Id
            lodProfileId.value = cal.LodProfileId
            calName.value = cal.Name
            shortName.value = cal.ShortName ?? ''
            alternateName.value = cal.AlternateName ?? ''
            nameBefore0.value = cal.NameBefore0 ?? ''
            nameAfter0.value = cal.NameAfter0 ?? ''
            if (cal.LodProfile) {
                lodProfileName.value = cal.LodProfile.Name ?? 'LOD Profile'
                try {
                    const raw = cal.LodProfile.Profile
                    lodLevels.value = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as LodLevel[])
                } catch { lodLevels.value = [] }
            }
            parseYearDefinition(cal.YearDefinition)
            // A level the sync would add but the saved profile lacks was removed on purpose — keep it out.
            const wanted = { SEASONS: hasSeasons.value, MONTHS: months.value.length > 0, WEEKS: hasWeekDef.value }
            for (const [k, on] of Object.entries(wanted))
                if (on && !lodLevels.value.some(l => l.formatKey === k)) lodAbsentKeys.add(k)
        }
    } else {
        months.value = Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, shortName: `M${i + 1}`, length: 30, season: 0 }))
        lodLevels.value = [
            { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
            { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
            { index: 2, formatKey: 'DECADES',   stepFraction: 10 },
            { index: 3, formatKey: 'YEARS',     stepFraction: 1 },
        ]
    }
    isLoading.value = false
})

// ---- Serialize YearDefinition ----
function buildYearDefinition(): string {
    const yd: Record<string, unknown> = { length: yearLength.value, months: months.value.length }

    const md: Record<string, unknown> = { months_have_short_name: monthsHaveShortName.value }
    months.value.forEach((m, i) => {
        const entry: Record<string, unknown> = { name: m.name, length: m.length }
        if (monthsHaveShortName.value) entry.short_name = m.shortName
        if (hasSeasons.value) entry.season = m.season
        md[String(i)] = entry
    })
    yd.month_definition = md

    if (hasWeekDef.value) {
        const wd: Record<string, unknown> = { length: weekLength.value, days_have_names: daysHaveNames.value }
        if (daysHaveNames.value) wd.days = dayNames.value.slice(0, weekLength.value)
        wd.days_have_short_names = daysHaveShortNames.value
        if (daysHaveShortNames.value) wd.days_short = dayShortNames.value.slice(0, weekLength.value)
        wd.weekend = weekendDays.value
        yd.week_definition = wd
    }

    if (hasSeasons.value && seasons.value.length > 0) {
        yd.seasons = seasons.value.length
        const sd: Record<string, unknown> = { seasons_have_short_name: seasonsHaveShortName.value }
        seasons.value.forEach((s, i) => {
            const entry: Record<string, unknown> = { name: s.name, start: s.start, end: s.end }
            if (seasonsHaveShortName.value && s.shortName) entry.short_name = s.shortName
            if (s.significance) entry.significance = s.significance
            sd[String(i)] = entry
        })
        yd.season_definition = sd
    }

    if (hasMemorableDays.value && memorableDays.value.length > 0) {
        yd.memorable_days = memorableDays.value
    }

    return JSON.stringify(yd)
}

function validate(): string {
    if (!calName.value.trim()) return 'Name is required'
    if (lodLevels.value.length === 0) return 'LOD Profile must have at least one level.'
    if (!lodLevels.value.some(l => l.formatKey === 'YEARS')) return 'LOD Profile must include a YEARS level.'
    return ''
}

// Same shape SaveCalendar deserializes into CalendarItem; ExportCalendar takes it as `calendar`.
function buildPayload() {
    return {
        Id: calId.value,
        Name: calName.value.trim(),
        ShortName: shortName.value,
        AlternateName: alternateName.value,
        NameBefore0: nameBefore0.value,
        NameAfter0: nameAfter0.value,
        LodProfileId: lodProfileId.value,
        YearDefinition: buildYearDefinition(),
        LodProfile: {
            Id: lodProfileId.value,
            Name: lodProfileName.value,
            Profile: JSON.stringify(lodLevels.value.map((l, i) => ({ ...l, index: i }))),
        },
    }
}

async function save() {
    saveError.value = validate()
    if (saveError.value) return
    isSaving.value = true
    try {
        const result = await BackendAPI.SaveCalendar(buildPayload())
        if (result?.status === 'ok') window.close()
        else saveError.value = result?.message ?? 'Save failed'
    } catch (e) {
        saveError.value = String(e)
    } finally {
        isSaving.value = false
    }
}

// Exports what is on screen, saved or not — the file is the deliverable, the DB row is optional.
async function exportCalendar() {
    saveError.value = validate()
    if (saveError.value) return
    try {
        const result = await BackendAPI.ExportCalendar({ calendar: buildPayload() })
        if (result?.status === 'error') throw new Error(result.message ?? 'Export failed')
    } catch (e) {
        console.error('[CalendarApp] export failed:', e)
        saveError.value = `Export failed: ${e instanceof Error ? e.message : String(e)}`
    }
}

// ---- Helpers ----
function addMonth()    { months.value.push({ name: `Month ${months.value.length + 1}`, shortName: '', length: 30, season: 0 }) }
function removeMonth(i: number) { months.value.splice(i, 1) }
function addSeason()   { seasons.value.push({ name: `Season ${seasons.value.length + 1}`, shortName: '', start: 0, end: 89, significance: '' }) }
function removeSeason(i: number) { seasons.value.splice(i, 1) }
function isWeekend(d: number) { return weekendDays.value.includes(d) }
function toggleWeekend(d: number) {
    const idx = weekendDays.value.indexOf(d)
    if (idx >= 0) weekendDays.value.splice(idx, 1)
    else weekendDays.value.push(d)
}
</script>

<template>
  <div class="cal-root" v-if="!isLoading">

    <WindowTitleBar :title="calName || 'Calendar Editor'" :show-maximize="false" />

    <!-- Header -->
    <div class="cal-header section">
      <div class="header-row">
        <span class="id-label">{{ isNew ? 'New Calendar' : calId.slice(0, 8) }}</span>
        <input class="name-input" type="text" v-model="calName" placeholder="Calendar name…" />
        <div class="header-actions">
          <button class="btn btn-secondary btn-export" title="Export this calendar to a file" @click="exportCalendar">Export</button>
          <button class="btn btn-secondary" @click="BackendAPI.WindowClose()">Cancel</button>
          <button class="btn btn-primary" :disabled="isSaving" @click="save">
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
      <p v-if="saveError" class="save-error">{{ saveError }}</p>
    </div>

    <div class="cal-body">

      <!-- ===== LEFT COLUMN ===== -->
      <div class="cal-col">

        <!-- Calendar Info -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('info')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['info'] }">›</span>
              <h3 class="section-title">Calendar Info</h3>
            </div>
            <button class="info-btn" :class="{ active: openHelp === 'info' }" @click.stop="toggleHelp('info')" title="Help">i</button>
          </div>
          <div v-show="!collapsed['info']">
            <div v-if="openHelp === 'info'" class="help-bubble">{{ helpTexts.info }}</div>
            <div class="field-grid">
              <div class="field">
                <label>Short Name</label>
                <input type="text" v-model="shortName" placeholder="Greg." />
              </div>
              <div class="field">
                <label>Alternate Name</label>
                <input type="text" v-model="alternateName" placeholder="Western Calendar" />
              </div>
              <div class="field">
                <label>Era Before Year 0</label>
                <input type="text" v-model="nameBefore0" placeholder="BCE" />
              </div>
              <div class="field">
                <label>Era After Year 0</label>
                <input type="text" v-model="nameAfter0" placeholder="CE" />
              </div>
            </div>
          </div>
        </div>

        <!-- LOD Profile -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('lod')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['lod'] }">›</span>
              <h3 class="section-title">LOD Profile</h3>
            </div>
            <div class="header-right">
              <button class="btn btn-secondary btn-sm" @click.stop="sortLodByStep" title="Sort levels by step fraction (broadest first)">Sort</button>
              <button class="btn btn-secondary btn-sm" @click.stop="autoSetLod" title="Reset LOD to defaults">Auto LOD</button>
              <button class="info-btn" :class="{ active: openHelp === 'lod' }" @click.stop="toggleHelp('lod')" title="Help">i</button>
            </div>
          </div>
          <div v-show="!collapsed['lod']">
            <div v-if="openHelp === 'lod'" class="help-bubble">{{ helpTexts.lod }}</div>
            <div class="field" style="margin-bottom:10px">
              <label>Profile Name</label>
              <input type="text" v-model="lodProfileName" />
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th class="drag-th"></th>
                  <th>#</th>
                  <th>Format Key</th>
                  <th>
                    Step Fraction
                    <button
                      class="frac-btn"
                      :class="{ active: useFractions }"
                      @click="useFractions = !useFractions"
                      :title="useFractions ? 'Switch to decimal' : 'Switch to fraction (N/D)'"
                    >{{ useFractions ? '1.0' : '½' }}</button>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(lod, i) in lodLevels" :key="i"
                  draggable="true"
                  :class="{ 'lod-dragging': lodDragIndex === i, 'lod-drag-over': lodDragOver === i && lodDragIndex !== i }"
                  @dragstart="onLodDragStart(i, $event)"
                  @dragover.prevent="onLodDragOver(i)"
                  @drop.prevent="onLodDrop(i)"
                  @dragend="onLodDragEnd"
                >
                  <td class="drag-handle" title="Drag to reorder">⠿</td>
                  <td class="num-cell">{{ i }}</td>
                  <td>
                    <input type="text" class="tbl-input" v-model="lod.formatKey" list="format-keys"
                      @input="lodManuallyEdited = true" @change="lodManuallyEdited = true" />
                    <datalist id="format-keys">
                      <option v-for="k in KNOWN_FORMAT_KEYS" :key="k" :value="k" />
                    </datalist>
                  </td>
                  <td>
                    <input
                      v-if="useFractions"
                      type="text"
                      class="tbl-input step-input frac-input"
                      :value="toFraction(lod.stepFraction)"
                      @change="updateStepFraction(lod, ($event.target as HTMLInputElement).value); lodManuallyEdited = true"
                    />
                    <input
                      v-else
                      type="number"
                      class="tbl-input step-input"
                      v-model.number="lod.stepFraction"
                      step="any"
                      min="0"
                      @input="lodManuallyEdited = true"
                      @change="lodManuallyEdited = true"
                    />
                  </td>
                  <td>
                    <button v-if="lod.formatKey !== 'YEARS'" class="btn-icon" @click="removeLodLevelManual(i)">×</button>
                    <span v-else class="years-lock" title="YEARS level cannot be removed">🔒</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <template v-if="showAddLodForm">
              <div class="add-lod-row mt-8">
                <input type="text" v-model="addLodKey" list="add-lod-keys" class="tbl-input" style="width:140px" placeholder="Format key…" />
                <datalist id="add-lod-keys">
                  <option v-for="k in ADD_LOD_KEYS" :key="k" :value="k" />
                </datalist>
                <input type="number" v-model.number="addLodStep" step="any" min="0" class="tbl-input step-input" />
                <button class="btn btn-primary btn-sm" @click="confirmAddLod"
                  :disabled="!addLodKey.trim() || addLodKey.trim() === 'YEARS'">Add</button>
                <button class="btn btn-secondary btn-sm" @click="showAddLodForm = false">Cancel</button>
              </div>
              <p v-if="addLodKey.trim() === 'YEARS'" class="add-lod-warn">YEARS level already exists and cannot be duplicated.</p>
            </template>
            <button v-else class="btn-add mt-8" @click="openAddLodForm">+ Add Level</button>
          </div>
        </div>

        <!-- Months -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('months')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['months'] }">›</span>
              <h3 class="section-title">Months</h3>
            </div>
            <button class="info-btn" :class="{ active: openHelp === 'months' }" @click.stop="toggleHelp('months')" title="Help">i</button>
          </div>
          <div v-show="!collapsed['months']">
            <div v-if="openHelp === 'months'" class="help-bubble">{{ helpTexts.months }}</div>
            <div class="inline-row mt-8">
              <div class="field flex-1">
                <label>Year Length (days)</label>
                <input type="number" :value="yearLength" min="1" style="width:100px"
                  @change="onYearLengthInput(Number(($event.target as HTMLInputElement).value))" />
                <span v-if="months.length > 0" class="year-hint">auto-computed · edit to scale months</span>
              </div>
              <label class="toggle-label">
                <input type="checkbox" v-model="monthsHaveShortName" />
                Short names
              </label>
            </div>
            <table class="data-table mt-8">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th v-if="monthsHaveShortName">Short</th>
                  <th>Days</th>
                  <th v-if="hasSeasons">Season</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in months" :key="i">
                  <td class="num-cell">{{ i + 1 }}</td>
                  <td><input type="text" class="tbl-input" v-model="m.name" /></td>
                  <td v-if="monthsHaveShortName"><input type="text" class="tbl-input short-input" v-model="m.shortName" /></td>
                  <td><input type="number" class="tbl-input narrow-input" v-model.number="m.length" min="1" /></td>
                  <td v-if="hasSeasons">
                    <input type="number" class="tbl-input narrow-input" v-model.number="m.season" min="0" :max="seasons.length - 1" />
                  </td>
                  <td><button class="btn-icon" @click="removeMonth(i)">×</button></td>
                </tr>
              </tbody>
            </table>
            <button class="btn-add mt-8" @click="addMonth">+ Add Month</button>
          </div>
        </div>

      </div>

      <!-- ===== RIGHT COLUMN ===== -->
      <div class="cal-col">

        <!-- Week Structure -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('weeks')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['weeks'] }">›</span>
              <h3 class="section-title">Week Structure</h3>
            </div>
            <div class="header-right">
              <label class="toggle-label" @click.stop>
                <input type="checkbox" v-model="hasWeekDef" />
                {{ hasWeekDef ? 'Enabled' : 'Disabled' }}
              </label>
              <button class="info-btn" :class="{ active: openHelp === 'weeks' }" @click.stop="toggleHelp('weeks')" title="Help">i</button>
            </div>
          </div>
          <div v-show="!collapsed['weeks']">
            <div v-if="openHelp === 'weeks'" class="help-bubble">{{ helpTexts.weeks }}</div>
            <template v-if="hasWeekDef">
              <div class="inline-row mt-8">
                <div class="field">
                  <label>Days per Week</label>
                  <input type="number" v-model.number="weekLength" min="1" max="30" style="width:70px" />
                </div>
                <label class="toggle-label">
                  <input type="checkbox" v-model="daysHaveNames" />
                  Day names
                </label>
                <label class="toggle-label" v-if="daysHaveNames">
                  <input type="checkbox" v-model="daysHaveShortNames" />
                  Short names
                </label>
              </div>
              <table class="data-table mt-8" v-if="daysHaveNames">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th v-if="daysHaveShortNames">Short</th>
                    <th>Weekend</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="i in weekLength" :key="i">
                    <td class="num-cell">{{ i }}</td>
                    <td><input type="text" class="tbl-input" v-model="dayNames[i - 1]" /></td>
                    <td v-if="daysHaveShortNames"><input type="text" class="tbl-input short-input" v-model="dayShortNames[i - 1]" /></td>
                    <td class="center-cell"><input type="checkbox" :checked="isWeekend(i - 1)" @change="toggleWeekend(i - 1)" /></td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="weekend-row mt-8">
                <span class="field-label">Weekend days:</span>
                <label v-for="d in weekLength" :key="d" class="toggle-label">
                  <input type="checkbox" :checked="isWeekend(d - 1)" @change="toggleWeekend(d - 1)" />
                  {{ d }}
                </label>
              </div>
            </template>
            <p v-else class="empty-note mt-8">Enable to define a week structure.</p>
          </div>
        </div>

        <!-- Seasons -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('seasons')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['seasons'] }">›</span>
              <h3 class="section-title">Seasons</h3>
            </div>
            <div class="header-right">
              <label class="toggle-label" @click.stop>
                <input type="checkbox" v-model="hasSeasons" />
                {{ hasSeasons ? 'Enabled' : 'Disabled' }}
              </label>
              <button class="info-btn" :class="{ active: openHelp === 'seasons' }" @click.stop="toggleHelp('seasons')" title="Help">i</button>
            </div>
          </div>
          <div v-show="!collapsed['seasons']">
            <div v-if="openHelp === 'seasons'" class="help-bubble">{{ helpTexts.seasons }}</div>
            <template v-if="hasSeasons">
              <!-- Season track -->
              <div v-if="seasonSegments.length > 0" class="season-track">
                <div
                  v-for="(seg, i) in seasonSegments"
                  :key="i"
                  class="season-seg"
                  :style="{ flex: seg.length, background: seg.color }"
                  :title="seg.name + ' · ' + seg.length + ' days'"
                >
                  <span class="season-seg-label">{{ seg.name }}</span>
                </div>
              </div>
              <div class="header-right mt-8" style="justify-content:flex-start;gap:8px">
                <label class="toggle-label">
                  <input type="checkbox" v-model="seasonsHaveShortName" />
                  Short names
                </label>
                <button class="btn btn-secondary btn-sm" @click="openSeasonDoyModal" :disabled="seasons.length === 0" title="Auto-calculate season start/end days">Auto DOY</button>
              </div>
              <table class="data-table mt-8">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th v-if="seasonsHaveShortName">Short</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Significance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in seasons" :key="i">
                    <td class="num-cell">{{ i }}</td>
                    <td><input type="text" class="tbl-input" v-model="s.name" /></td>
                    <td v-if="seasonsHaveShortName"><input type="text" class="tbl-input short-input" v-model="s.shortName" /></td>
                    <td><input type="number" class="tbl-input narrow-input" v-model.number="s.start" /></td>
                    <td><input type="number" class="tbl-input narrow-input" v-model.number="s.end" /></td>
                    <td><input type="text" class="tbl-input" v-model="s.significance" placeholder="hottest…" /></td>
                    <td><button class="btn-icon" @click="removeSeason(i)">×</button></td>
                  </tr>
                </tbody>
              </table>
              <button class="btn-add mt-8" @click="addSeason">+ Add Season</button>
            </template>
            <p v-else class="empty-note mt-8">Enable to define seasons.</p>
          </div>
        </div>

        <!-- Memorable Days -->
        <div class="section">
          <div class="section-header-row">
            <div class="section-title-group" @click="toggleCollapse('memdays')">
              <span class="collapse-chevron" :class="{ expanded: !collapsed['memdays'] }">›</span>
              <h3 class="section-title">Memorable Days</h3>
              <span v-if="collapsed['memdays'] && hasMemorableDays" class="section-count">{{ memorableDays.length }}</span>
            </div>
            <div class="header-right">
              <label class="toggle-label" @click.stop>
                <input type="checkbox" v-model="hasMemorableDays" />
                {{ hasMemorableDays ? 'Enabled' : 'Disabled' }}
              </label>
            </div>
          </div>
          <div v-show="!collapsed['memdays']">
            <template v-if="hasMemorableDays">
              <div v-if="memorableDays.length" class="mem-day-list">
                <button v-for="md in memorableDays" :key="md.id" type="button" class="mem-day-chip" title="Edit" @click="openMemDays(md.id)">
                  <span class="mem-day-dot" :style="{ background: md.color }" />{{ md.name || 'Unnamed' }}
                </button>
              </div>
              <p v-else class="empty-note mt-8">No memorable days yet.</p>
              <button class="btn-add mt-8 mem-days-manage" @click="openMemDays()">Manage days…</button>
            </template>
            <p v-else class="empty-note mt-8">Enable to define memorable days.</p>
          </div>
        </div>

      </div>
    </div>

    <MemorableDaysModal
      v-if="showMemDays"
      :days="memorableDays"
      v-model:selectedId="memDayId"
      :months="months"
      :seasons="seasons"
      :hasSeasons="hasSeasons"
      :hasWeekDef="hasWeekDef"
      :weekLength="weekLength"
      :dayLabels="dayLabelsForPicker"
      :weekendDays="weekendDays"
      @add="addMemorableDay"
      @remove="removeMemorableDayById"
      @close="showMemDays = false"
    />

    <!-- Season DOY modal -->
    <div v-if="showSeasonDoyModal" class="doy-backdrop" @mousedown="doyBackdrop.onMousedown" @click="doyBackdrop.onClick">
      <div class="doy-panel">
        <h4 class="doy-title">Auto-calculate Season Days</h4>
        <p class="doy-desc">
          Divides the {{ yearLength }}-day year evenly across {{ seasons.length }} seasons.
          Enter the first day of <strong>{{ seasons[0]?.name || 'Season 1' }}</strong> (1 = first day of year).
        </p>
        <div class="doy-row">
          <label>First day of {{ seasons[0]?.name || 'Season 1' }}</label>
          <input type="number" v-model.number="seasonStartInput" min="1" :max="yearLength" style="width:80px" />
        </div>
        <div class="doy-actions">
          <button class="btn btn-secondary btn-sm" @click="showSeasonDoyModal = false">Cancel</button>
          <button class="btn btn-primary btn-sm" @click="applySeasonDOY">Apply</button>
        </div>
      </div>
    </div>

  </div>

  <div v-else class="loading-screen">Loading…</div>
  <HelpModal v-if="showHelp" @close="showHelp = false" />
  <ShortcutsModal v-if="showShortcuts" context="calendar" @close="showShortcuts = false" />
</template>

<style scoped lang="scss">
* { box-sizing: border-box; }

.cal-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: var(--app-text, #e2e8f0);
  background: #0d1521;
  overflow: hidden;
}

.loading-screen {
  display: flex; align-items: center; justify-content: center;
  height: 100vh; font-size: 1.2rem; color: var(--app-text-dim, #4a6080);
}

.section {
  background: var(--app-surface-raised, #141e33);
  border: 1px solid var(--app-border, #2d3a56);
  border-left: 3px solid #253a5e;
  border-radius: 6px;
  padding: 16px 18px;
}

.section-title {
  margin: 0;
  font-size: 0.87rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #7aa8e8;
  user-select: none;
}

// Entry count shown next to a collapsed section title
.section-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: #7aa8e8;
  background: rgba(122, 168, 232, 0.15);
  border-radius: 10px;
  padding: 1px 8px;
  user-select: none;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid #1a2744;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

// ---- Info button & help bubble ----
.info-btn {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--app-border, #2d3a56);
  background: transparent;
  color: var(--app-text-dim, #4a6080);
  font-size: 11px; font-style: italic; font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0; line-height: 1;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  font-family: Georgia, serif;

  &:hover, &.active {
    border-color: var(--app-accent, #3b6ec4);
    color: #7aa8e8;
    background: var(--app-surface-high, #1e2b44);
  }
}

.help-bubble {
  background: #1a2d44;
  border: 1px solid #2a4468;
  border-radius: 5px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 0.82rem;
  color: #7aa8e8;
  line-height: 1.55;
}

// ---- LOD fraction toggle ----
.frac-btn {
  font-size: 11px; font-weight: 600;
  border: 1px solid var(--app-border, #2d3a56);
  background: var(--app-surface, #0c1524);
  border-radius: 3px; cursor: pointer;
  padding: 1px 6px; margin-left: 6px;
  vertical-align: middle; line-height: 1.4;
  color: var(--app-text-muted, #94a3b8);
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
  &.active { background: var(--app-accent, #3b6ec4); border-color: var(--app-accent-hover, #4a7fd4); color: #fff; }
}

.frac-input { font-family: monospace; }
.years-lock { font-size: 0.8rem; opacity: 0.5; cursor: default; }
.add-lod-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

// ---- Header ----
.cal-header {
  flex-shrink: 0;
  border-radius: 0 !important;
  border-left: none; border-right: none; border-top: none;
  background: var(--app-surface-high, #1e2b44) !important;
  border-bottom: 1px solid var(--app-border, #2d3a56) !important;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.id-label {
  font-size: 0.72rem;
  color: var(--app-text-dim, #4a6080);
  font-family: monospace;
  white-space: nowrap;
  user-select: none;
}

.name-input {
  flex: 1;
  padding: 5px 10px;
  border: 1px solid var(--app-border, #2d3a56);
  border-radius: 4px;
  font-size: 1rem; font-weight: 600;
  background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0);
  &:focus { outline: 2px solid var(--app-accent, #3b6ec4); border-color: transparent; }
  &::placeholder { color: var(--app-text-dim, #4a6080); }
}

.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.save-error { margin: 6px 0 0; color: #e05555; font-size: 0.85rem; }

// ---- Body ----
.cal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}

.cal-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// ---- Fields ----
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;

  label {
    font-size: 0.73rem; font-weight: 600; color: var(--app-text-dim, #4a6080);
    text-transform: uppercase; letter-spacing: 0.04em; user-select: none;
  }

  input[type='text'], input[type='number'] {
    padding: 5px 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0);
    width: 100%;
    &:focus { outline: 2px solid var(--app-accent, #3b6ec4); border-color: transparent; }
    &::placeholder { color: var(--app-text-dim, #4a6080); }
  }
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.field-label {
  font-size: 0.73rem; font-weight: 600; color: var(--app-text-dim, #4a6080);
  text-transform: uppercase; letter-spacing: 0.04em; user-select: none;
}

.inline-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}

.flex-1 { flex: 1; }

.toggle-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  color: var(--app-text-muted, #94a3b8);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  margin-bottom: 3px;
}

// ---- Tables ----
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;

  th {
    text-align: left;
    font-size: 0.72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--app-text-dim, #4a6080);
    padding: 6px 8px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    user-select: none;
  }

  td { padding: 4px 6px; vertical-align: middle; }

  tbody tr:hover td { background: rgba(44, 95, 138, 0.12); }
  tbody tr.lod-dragging td { opacity: 0.35; background: transparent !important; }
  tbody tr.lod-drag-over td { background: rgba(59, 110, 196, 0.22) !important; box-shadow: inset 0 2px 0 var(--app-accent, #3b6ec4); }
}

.drag-th { width: 20px; padding: 0 !important; }

.drag-handle {
  cursor: grab;
  color: var(--app-border, #2d3a56);
  font-size: 1rem;
  user-select: none;
  text-align: center;
  width: 20px;

  &:hover { color: #7aa8e8; }
  &:active { cursor: grabbing; }
}

.num-cell { color: var(--app-text-dim, #4a6080); font-size: 0.78rem; width: 24px; text-align: right; user-select: none; }
.center-cell { text-align: center; }

.tbl-input {
  padding: 4px 6px;
  border: 1px solid #253048;
  border-radius: 3px;
  font-size: 0.85rem;
  background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0);
  width: 100%;
  &:focus { outline: 2px solid var(--app-accent, #3b6ec4); border-color: transparent; }
  &::placeholder { color: var(--app-text-dim, #4a6080); }
}

select.tbl-input option { background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0); }

.short-input  { width: 70px; }
.narrow-input { width: 60px; }
.step-input   { width: 110px; }

// ---- Weekend row ----
.weekend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

// ---- Season track ----
.season-track {
  display: flex;
  height: 28px;
  border-radius: 5px;
  overflow: hidden;
  margin: 8px 0 10px;
  border: 1px solid var(--app-border, #2d3a56);
}
.season-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-width: 2px;
  cursor: default;
  transition: flex 0.3s ease;
}
.season-seg-label {
  font-size: 0.72rem; font-weight: 600;
  color: rgba(255,255,255,0.9);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding: 0 6px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  pointer-events: none;
}

// ---- Season DOY modal ----
.doy-backdrop {
  position: fixed; inset: 0; background: #00000070; z-index: 100;
  display: flex; align-items: center; justify-content: center;
}
.doy-panel {
  background: var(--app-surface-raised, #141e33); border: 1px solid var(--app-border, #2d3a56); border-radius: 8px;
  padding: 20px 24px; max-width: 400px; width: 90%;
  box-shadow: 0 8px 24px #00000066;
}
.doy-title { margin: 0 0 8px; font-size: 0.95rem; font-weight: 700; color: var(--app-text, #e2e8f0); }
.doy-desc { font-size: 0.82rem; color: var(--app-text-muted, #94a3b8); margin: 0 0 14px; line-height: 1.5; }
.doy-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
  label { font-size: 0.8rem; font-weight: 600; color: var(--app-text-dim, #4a6080); text-transform: uppercase; letter-spacing: 0.04em; }
  input {
    padding: 4px 8px; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    font-size: 0.9rem; background: var(--app-surface, #0c1524); color: var(--app-text, #e2e8f0);
    &:focus { outline: 2px solid var(--app-accent, #3b6ec4); }
  }
}
.doy-actions { display: flex; justify-content: flex-end; gap: 8px; }

// ---- Memorable Days ----
.empty-note { color: var(--app-text-dim, #4a6080); font-size: 0.82rem; font-style: italic; margin: 0; }

.mem-day-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.mem-day-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border: 1px solid #253048;
  border-radius: 999px;
  background: #0d1929;
  color: var(--app-text, #e2e8f0);
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;

  &:hover { border-color: var(--app-accent, #3b6ec4); background: #12203a; }
}

.mem-day-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}

// ---- Buttons ----
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem; font-weight: 500;
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &.btn-primary   { background: #2c5f8a; color: var(--app-text, #e2e8f0); &:hover:not(:disabled) { background: #3572a8; } }
  &.btn-secondary { background: var(--app-surface-high, #1e2b44); color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56); &:hover:not(:disabled) { background: #253252; color: var(--app-text, #e2e8f0); } }
  &.btn-sm { padding: 4px 12px; font-size: 0.82rem; }
}

.btn-icon {
  border: none; background: none; cursor: pointer;
  font-size: 1.1rem; color: var(--app-text-dim, #4a6080);
  padding: 0 2px; line-height: 1;
  flex-shrink: 0;
  &:hover { color: #e05555; }
}

.mt-8 { margin-top: 8px; }

// ---- Collapsible section headers ----
.section-title-group {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  flex: 1;
  min-width: 0;
}

.collapse-chevron {
  display: inline-block;
  font-size: 1rem;
  color: var(--app-text-dim, #4a6080);
  line-height: 1;
  transition: transform 0.18s ease, color 0.15s;
  flex-shrink: 0;

  &.expanded { transform: rotate(90deg); }
}

.section-title-group:hover .collapse-chevron { color: #7aa8e8; }

// ---- LOD add warning ----
.add-lod-warn {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: #e05555;
  font-style: italic;
}

// ---- Add-row invite buttons ----
.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 0.82rem;
  font-weight: 500;
  border: 1px dashed var(--app-border, #2d3a56);
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-dim, #4a6080);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--app-accent, #3b6ec4);
    color: #7aa8e8;
    background: #1a2744;
  }
}

// ---- Year length hint ----
.year-hint {
  font-size: 0.72rem;
  color: var(--app-text-dim, #4a6080);
  font-style: italic;
  margin-top: 3px;
}
</style>

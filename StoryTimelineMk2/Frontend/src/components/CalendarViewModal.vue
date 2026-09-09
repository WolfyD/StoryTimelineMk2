<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PhX, PhPencilSimple, PhArrowLeft } from '@phosphor-icons/vue'
import { BackendAPI } from '@/bridge/api'
import type { Calendar, LodLevel } from '@/types/models'
import type { RelativeRule } from '@/utils/relativeRule'
import { describeRule } from '@/utils/relativeRule'

const props = defineProps<{ calendarId: string }>()
const emit = defineEmits<{ close: []; edit: [id: string] }>()

// ── Parsed state ─────────────────────────────────────────────────────────────

interface MonthEntry  { name: string; shortName: string; length: number; season: number }
interface SeasonEntry { name: string; shortName: string; start: number; end: number; significance: string }
interface MemDay { id: string; name: string; color: string; type: 'fixed' | 'weekly' | 'relative'; startMonth: number; startDay: number; endMonth: number; endDay: number; isRange: boolean; weekDays: number[]; rule: RelativeRule }

const loading = ref(true)
const error   = ref<string | null>(null)
const cal     = ref<Calendar | null>(null)

const yearLength  = ref(0)
const months      = ref<MonthEntry[]>([])
const hasWeek     = ref(false)
const weekLength  = ref(7)
const dayNames    = ref<string[]>([])
const weekendDays = ref<number[]>([])
const hasSeasons  = ref(false)
const seasons     = ref<SeasonEntry[]>([])
const lodLevels   = ref<LodLevel[]>([])
const memDays     = ref<MemDay[]>([])

const SEASON_PALETTE = ['#e8944a', '#5ba55b', '#5b8ec4', '#b36eb3', '#d4a843', '#5baaaa', '#c0636b', '#6baec0']

function parseYD(json: string) {
    if (!json) return
    try {
        const yd = JSON.parse(json)
        yearLength.value = yd.length ?? 0

        if (yd.month_definition) {
            const count = yd.months ?? 0
            for (let i = 0; i < count; i++) {
                const m = yd.month_definition[String(i)]
                months.value.push({ name: m?.name ?? `Month ${i + 1}`, shortName: m?.short_name ?? '', length: m?.length ?? 0, season: m?.season ?? 0 })
            }
        }

        if (yd.week_definition) {
            hasWeek.value = true
            weekLength.value = yd.week_definition.length ?? 7
            dayNames.value = yd.week_definition.days_have_names && yd.week_definition.days
                ? [...yd.week_definition.days]
                : Array.from({ length: weekLength.value }, (_, i) => `Day ${i + 1}`)
            weekendDays.value = yd.week_definition.weekend ? [...yd.week_definition.weekend] : []
        }

        if (yd.season_definition && yd.seasons) {
            hasSeasons.value = true
            for (let i = 0; i < (yd.seasons as number); i++) {
                const s = yd.season_definition[String(i)]
                seasons.value.push({ name: s?.name ?? `Season ${i + 1}`, shortName: s?.short_name ?? '', start: s?.start ?? 0, end: s?.end ?? 0, significance: s?.significance ?? '' })
            }
        }

        if (yd.memorable_days && Array.isArray(yd.memorable_days)) {
            memDays.value = yd.memorable_days as MemDay[]
        }
    } catch { /* ignore */ }
}

onMounted(async () => {
    loading.value = true
    try {
        const data = await BackendAPI.GetCalendarById(props.calendarId)
        if (!data) { error.value = 'Calendar not found.'; return }
        cal.value = data
        if (data.LodProfile?.Profile) {
            const raw = data.LodProfile.Profile
            lodLevels.value = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as LodLevel[])
        }
        parseYD(data.YearDefinition)
    } catch {
        error.value = 'Failed to load calendar.'
    } finally {
        loading.value = false
    }
})

// computed helpers
const memDayDescribeCtx = computed(() => ({
    seasonNames: seasons.value.map(s => s.name),
    monthNames:  months.value.map(m => m.name),
    dayLabels:   dayNames.value,
    memDayNames: Object.fromEntries(memDays.value.map(d => [d.id, d.name])),
}))

function memDayDescription(d: MemDay): string {
    if (d.type === 'fixed') {
        const mn = months.value[d.startMonth]?.name ?? `Month ${d.startMonth + 1}`
        if (d.isRange) {
            const en = months.value[d.endMonth]?.name ?? `Month ${d.endMonth + 1}`
            return `${mn} day ${d.startDay} – ${en} day ${d.endDay}`
        }
        return `${mn}, day ${d.startDay}`
    }
    if (d.type === 'weekly') {
        return d.weekDays.map(i => dayNames.value[i] ?? `Day ${i + 1}`).join(', ') || '—'
    }
    try { return describeRule(d.rule, memDayDescribeCtx.value) } catch { return '—' }
}
</script>

<template>
    <Teleport to="body">
        <div class="modal-backdrop" @click.self="emit('close')">
            <div class="modal-panel">

                <!-- Header -->
                <div class="modal-header">
                    <div class="header-left">
                        <button class="icon-btn" title="Back to list" @click="emit('close')">
                            <PhArrowLeft :size="16" />
                        </button>
                        <span class="modal-title">{{ loading ? 'Loading…' : (cal?.Name ?? 'Calendar') }}</span>
                    </div>
                    <div class="header-right">
                        <button v-if="!loading && cal" class="edit-btn" @click="emit('edit', calendarId)">
                            <PhPencilSimple :size="14" />
                            Edit
                        </button>
                        <button class="icon-btn" title="Close" @click="emit('close')">
                            <PhX :size="16" />
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div class="modal-body">
                    <div v-if="loading" class="state-msg">Loading…</div>
                    <div v-else-if="error" class="state-msg error">{{ error }}</div>

                    <template v-else-if="cal">

                        <!-- ── Basic Info ── -->
                        <section class="view-section">
                            <h3 class="section-title">Calendar Info</h3>
                            <div class="info-grid">
                                <span class="info-label">Name</span>
                                <span class="info-value">{{ cal.Name }}</span>

                                <template v-if="cal.ShortName">
                                    <span class="info-label">Short Name</span>
                                    <span class="info-value">{{ cal.ShortName }}</span>
                                </template>

                                <template v-if="cal.AlternateName">
                                    <span class="info-label">Alternate Name</span>
                                    <span class="info-value">{{ cal.AlternateName }}</span>
                                </template>

                                <template v-if="cal.NameBefore0 || cal.NameAfter0">
                                    <span class="info-label">Era Before Year 0</span>
                                    <span class="info-value">{{ cal.NameBefore0 || '—' }}</span>
                                    <span class="info-label">Era After Year 0</span>
                                    <span class="info-value">{{ cal.NameAfter0 || '—' }}</span>
                                </template>
                            </div>
                        </section>

                        <!-- ── Year / Months ── -->
                        <section class="view-section">
                            <h3 class="section-title">Year &amp; Months</h3>
                            <p class="meta-line">
                                <span class="meta-tag">{{ yearLength }} days / year</span>
                                <span class="meta-tag">{{ months.length }} months</span>
                            </p>
                            <table v-if="months.length" class="view-table">
                                <colgroup>
                                    <col style="width:36px" />
                                    <col />
                                    <col style="width:80px" />
                                    <col style="width:50px" />
                                    <col v-if="hasSeasons" style="width:130px" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Name</th>
                                        <th>Short</th>
                                        <th>Days</th>
                                        <th v-if="hasSeasons">Season</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(m, i) in months" :key="i">
                                        <td class="num">{{ i + 1 }}</td>
                                        <td>{{ m.name }}</td>
                                        <td class="muted">{{ m.shortName || '—' }}</td>
                                        <td class="num">{{ m.length }}</td>
                                        <td v-if="hasSeasons" class="season-chip-cell">
                                            <span class="season-chip"
                                                :style="{ background: SEASON_PALETTE[m.season % SEASON_PALETTE.length] + '33', borderColor: SEASON_PALETTE[m.season % SEASON_PALETTE.length] }">
                                                {{ seasons[m.season]?.name ?? `S${m.season + 1}` }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <p v-else class="none-note">No months defined.</p>
                        </section>

                        <!-- ── Week ── -->
                        <section v-if="hasWeek" class="view-section">
                            <h3 class="section-title">Week</h3>
                            <p class="meta-line">
                                <span class="meta-tag">{{ weekLength }}-day week</span>
                                <span v-if="weekendDays.length" class="meta-tag">{{ weekendDays.length }} weekend day(s)</span>
                            </p>
                            <div class="day-chips">
                                <span v-for="(d, i) in dayNames" :key="i"
                                    class="day-chip"
                                    :class="{ weekend: weekendDays.includes(i) }">
                                    {{ d }}
                                </span>
                            </div>
                        </section>

                        <!-- ── Seasons ── -->
                        <section v-if="hasSeasons" class="view-section">
                            <h3 class="section-title">Seasons</h3>
                            <table class="view-table">
                                <colgroup>
                                    <col style="width:24px" />
                                    <col />
                                    <col style="width:70px" />
                                    <col style="width:52px" />
                                    <col style="width:52px" />
                                    <col style="width:120px" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Name</th>
                                        <th>Short</th>
                                        <th>Start</th>
                                        <th>End</th>
                                        <th>Significance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(s, i) in seasons" :key="i">
                                        <td>
                                            <span class="season-dot" :style="{ background: SEASON_PALETTE[i % SEASON_PALETTE.length] }"></span>
                                        </td>
                                        <td>{{ s.name }}</td>
                                        <td class="muted">{{ s.shortName || '—' }}</td>
                                        <td class="num">{{ s.start }}</td>
                                        <td class="num">{{ s.end }}</td>
                                        <td class="muted">{{ s.significance || '—' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <!-- ── LOD Profile ── -->
                        <section class="view-section">
                            <h3 class="section-title">LOD Profile<span class="section-sub">{{ cal.LodProfile?.Name }}</span></h3>
                            <table v-if="lodLevels.length" class="view-table">
                                <colgroup>
                                    <col style="width:52px" />
                                    <col style="width:110px" />
                                    <col />
                                </colgroup>
                                <thead>
                                    <tr><th>Level</th><th>Format Key</th><th>Step Fraction</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(l, i) in lodLevels" :key="i">
                                        <td class="num">{{ i }}</td>
                                        <td><span class="key-badge">{{ l.formatKey }}</span></td>
                                        <td class="step-frac">{{ l.stepFraction }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p v-else class="none-note">No LOD levels defined.</p>
                        </section>

                        <!-- ── Memorable Days ── -->
                        <section v-if="memDays.length" class="view-section">
                            <h3 class="section-title">Memorable Days</h3>
                            <table class="view-table">
                                <colgroup>
                                    <col />
                                    <col style="width:72px" />
                                    <col />
                                </colgroup>
                                <thead>
                                    <tr><th>Name</th><th>Type</th><th>Date / Rule</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="d in memDays" :key="d.id">
                                        <td>
                                            <span class="color-dot" :style="{ background: d.color || '#aaa' }"></span>
                                            {{ d.name }}
                                        </td>
                                        <td><span class="type-badge" :class="d.type">{{ d.type }}</span></td>
                                        <td class="muted small">{{ memDayDescription(d) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                    </template>
                </div>

            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
}

.modal-panel {
    width: 50vw;
    max-height: 85vh;
    background: #141e33;
    border: 1px solid #2d3a56;
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

// ── Header ───────────────────────────────────────────────────────────────────

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #2d3a56;
    background: #0f1926;
    flex-shrink: 0;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 6px;
}

.modal-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #7aa8e8;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #7a8faa;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    &:hover { background: #1e2b44; color: #e2e8f0; }
}

.edit-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    background: #0d1521;
    color: #94a3b8;
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    &:hover { background: #1e2b44; border-color: #3b6ec4; color: #e2e8f0; }
}

// ── Body ─────────────────────────────────────────────────────────────────────

.modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.state-msg {
    padding: 24px;
    text-align: center;
    font-size: 0.85rem;
    color: #64748b;
    &.error { color: #e87a7a; }
}

// ── Sections ─────────────────────────────────────────────────────────────────

.view-section {
    border-left: 3px solid #2d3a56;
    padding-left: 14px;
}

.section-title {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #7aa8e8;
    margin: 0 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.section-sub {
    font-size: 0.72rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #7090b0;
}

.none-note {
    font-size: 0.78rem;
    color: #7090b0;
    font-style: italic;
    margin: 0;
}

// ── Info grid ────────────────────────────────────────────────────────────────

.info-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 4px 12px;
    align-items: baseline;
}

.info-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #7090b0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.info-value {
    font-size: 0.85rem;
    color: #c8d8f0;
}

// ── Meta tags ────────────────────────────────────────────────────────────────

.meta-line {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 10px;
}

.meta-tag {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: #0d1521;
    border: 1px solid #2d3a56;
    color: #7a9cc0;
}

// ── Tables ───────────────────────────────────────────────────────────────────

.view-table {
    width: auto;
    border-collapse: collapse;
    font-size: 0.8rem;

    th {
        text-align: left;
        font-size: 0.68rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #7090b0;
        padding: 4px 8px;
        border-bottom: 1px solid #1e2b44;
    }

    td {
        padding: 5px 8px;
        color: #c8d8f0;
        border-bottom: 1px solid #111d30;
        vertical-align: middle;
    }

    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #151f35; }

    .num { color: #82a8d0; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; }
    .muted { color: #7a9ab8; }
    .small { font-size: 0.76rem; }
    .step-frac { color: #82a8d0; font-variant-numeric: tabular-nums; font-size: 0.75rem; }
}

// ── Day chips ────────────────────────────────────────────────────────────────

.day-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.day-chip {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.78rem;
    background: #0d1521;
    border: 1px solid #2d3a56;
    color: #94a3b8;

    &.weekend {
        border-color: #3b6ec4;
        background: #1a2e50;
        color: #7aa8e8;
    }
}

// ── Season chips & dots ───────────────────────────────────────────────────────

.season-chip-cell { text-align: left; }

.season-chip {
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    border: 1px solid transparent;
    font-weight: 500;
    white-space: nowrap;
}

.season-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    vertical-align: middle;
}

// ── LOD / type badges ────────────────────────────────────────────────────────

.key-badge {
    font-size: 0.72rem;
    font-family: monospace;
    padding: 2px 6px;
    border-radius: 3px;
    background: #0a1220;
    border: 1px solid #253048;
    color: #7aa8e8;
}

.color-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
}

.type-badge {
    font-size: 0.68rem;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: capitalize;
    font-weight: 600;

    &.fixed    { background: #1a2e50; color: #7aa8e8; }
    &.weekly   { background: #1a3020; color: #5ba55b; }
    &.relative { background: #2e1a40; color: #b36eb3; }
}
</style>

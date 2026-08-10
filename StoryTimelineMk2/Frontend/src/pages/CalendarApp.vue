<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { BackendAPI } from '@/bridge/api'
import type { LodLevel } from '@/types/models'

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
const useFractions = ref(false)

// ---- Help system ----
const openHelp = ref<string | null>(null)
function toggleHelp(key: string) { openHelp.value = openHelp.value === key ? null : key }

const helpTexts: Record<string, string> = {
    info: 'The basic details of your calendar. Short Name appears in compact displays. Alternate Name is an unofficial or historical alias. Era Before/After Year 0 are the labels used for dates on either side of year zero (e.g. BCE / CE, or BK / AK for a custom calendar).',
    lod: 'Level of Detail (LOD) controls how the timeline zooms. Each level has a Format Key — the type of unit shown at that zoom — and a Step Fraction: how many years one tick represents. Lower index = broader view (millennia), higher index = finer detail (days). Built-in Format Keys: MILLENNIA, CENTURIES, DECADES, YEARS, SEASONS, MONTHS, WEEKS, DAYS. Use the ½ toggle to enter step fractions as N/D (e.g. 1/365 for a day).',
    months: 'Define every month of your calendar year. Year Length is the total number of days in the year. Each month has a name, optional short name, and a day count. If Seasons are enabled, each month can be assigned a season index (0-based) to link it to one of your defined seasons.',
    weeks: 'Define how weeks work in your calendar. Set the number of days per week, optionally give each day a full and short name, and mark which days count as weekend. If day names are disabled, only the weekend day pattern is stored.',
    seasons: 'Define the seasons of your calendar. Each season has a name, optional short name, a start and end day-of-year (0-indexed), and an optional significance tag like "hottest" or "coldest". Months reference seasons by their index number (0-based) shown in the # column.',
}

// ---- Year Definition ----
const yearLength = ref(365)

// Months
const monthsHaveShortName = ref(true)
interface MonthEntry { name: string; shortName: string; length: number; season: number }
const months = ref<MonthEntry[]>([])

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
    while (dayNames.value.length < newLen) {
        const i = dayNames.value.length
        dayNames.value.push(`Day ${i + 1}`)
        dayShortNames.value.push(`D${i + 1}`)
    }
    dayNames.value.splice(newLen)
    dayShortNames.value.splice(newLen)
    weekendDays.value = weekendDays.value.filter(d => d < newLen)
})

// ---- Parse YearDefinition JSON ----
function parseYearDefinition(json: string) {
    if (!json) return
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
    } catch (e) {
        console.error('Failed to parse YearDefinition', e)
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

    return JSON.stringify(yd)
}

async function save() {
    if (!calName.value.trim()) { saveError.value = 'Name is required'; return }
    saveError.value = ''
    isSaving.value = true
    try {
        const payload = {
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
        const result = await BackendAPI.SaveCalendar(payload)
        if (result?.status === 'ok') window.close()
        else saveError.value = result?.message ?? 'Save failed'
    } catch (e) {
        saveError.value = String(e)
    } finally {
        isSaving.value = false
    }
}

// ---- Helpers ----
function addMonth()    { months.value.push({ name: `Month ${months.value.length + 1}`, shortName: '', length: 30, season: 0 }) }
function removeMonth(i: number) { months.value.splice(i, 1) }
function addLodLevel() { lodLevels.value.push({ index: lodLevels.value.length, formatKey: 'YEARS', stepFraction: 1 }) }
function removeLodLevel(i: number) { lodLevels.value.splice(i, 1) }
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

    <!-- Header -->
    <div class="cal-header section">
      <div class="header-row">
        <span class="id-label">{{ isNew ? 'New Calendar' : calId.slice(0, 8) }}</span>
        <input class="name-input" type="text" v-model="calName" placeholder="Calendar name…" />
        <div class="header-actions">
          <button class="btn btn-secondary" @click="window.close()">Cancel</button>
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
            <h3 class="section-title">Calendar Info</h3>
            <button class="info-btn" :class="{ active: openHelp === 'info' }" @click="toggleHelp('info')" title="Help">i</button>
          </div>
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

        <!-- LOD Profile -->
        <div class="section">
          <div class="section-header-row">
            <h3 class="section-title">LOD Profile</h3>
            <button class="info-btn" :class="{ active: openHelp === 'lod' }" @click="toggleHelp('lod')" title="Help">i</button>
          </div>
          <div v-if="openHelp === 'lod'" class="help-bubble">{{ helpTexts.lod }}</div>
          <div class="field" style="margin-bottom:10px">
            <label>Profile Name</label>
            <input type="text" v-model="lodProfileName" />
          </div>
          <table class="data-table">
            <thead>
              <tr>
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
              <tr v-for="(lod, i) in lodLevels" :key="i">
                <td class="num-cell">{{ i }}</td>
                <td>
                  <input type="text" class="tbl-input" v-model="lod.formatKey" list="format-keys" />
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
                    @change="updateStepFraction(lod, ($event.target as HTMLInputElement).value)"
                  />
                  <input
                    v-else
                    type="number"
                    class="tbl-input step-input"
                    v-model.number="lod.stepFraction"
                    step="any"
                    min="0"
                  />
                </td>
                <td><button class="btn-icon" @click="removeLodLevel(i)">×</button></td>
              </tr>
            </tbody>
          </table>
          <button class="btn btn-secondary btn-sm mt-8" @click="addLodLevel">+ Add Level</button>
        </div>

      </div>

      <!-- ===== RIGHT COLUMN ===== -->
      <div class="cal-col">

        <!-- Months -->
        <div class="section">
          <div class="section-header-row">
            <h3 class="section-title">Months</h3>
            <button class="info-btn" :class="{ active: openHelp === 'months' }" @click="toggleHelp('months')" title="Help">i</button>
          </div>
          <div v-if="openHelp === 'months'" class="help-bubble">{{ helpTexts.months }}</div>
          <div class="inline-row mt-8">
            <div class="field flex-1">
              <label>Year Length (days)</label>
              <input type="number" v-model.number="yearLength" min="1" style="width:100px" />
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
          <button class="btn btn-secondary btn-sm mt-8" @click="addMonth">+ Add Month</button>
        </div>

        <!-- Week Structure -->
        <div class="section">
          <div class="section-header-row">
            <h3 class="section-title">Week Structure</h3>
            <div class="header-right">
              <label class="toggle-label">
                <input type="checkbox" v-model="hasWeekDef" />
                {{ hasWeekDef ? 'Enabled' : 'Disabled' }}
              </label>
              <button class="info-btn" :class="{ active: openHelp === 'weeks' }" @click="toggleHelp('weeks')" title="Help">i</button>
            </div>
          </div>
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
        </div>

        <!-- Seasons -->
        <div class="section">
          <div class="section-header-row">
            <h3 class="section-title">Seasons</h3>
            <div class="header-right">
              <label class="toggle-label">
                <input type="checkbox" v-model="hasSeasons" />
                {{ hasSeasons ? 'Enabled' : 'Disabled' }}
              </label>
              <button class="info-btn" :class="{ active: openHelp === 'seasons' }" @click="toggleHelp('seasons')" title="Help">i</button>
            </div>
          </div>
          <div v-if="openHelp === 'seasons'" class="help-bubble">{{ helpTexts.seasons }}</div>
          <template v-if="hasSeasons">
            <label class="toggle-label mt-8">
              <input type="checkbox" v-model="seasonsHaveShortName" />
              Short names
            </label>
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
            <button class="btn btn-secondary btn-sm mt-8" @click="addSeason">+ Add Season</button>
          </template>
        </div>

      </div>
    </div>
  </div>

  <div v-else class="loading-screen">Loading…</div>
</template>

<style scoped lang="scss">
* { box-sizing: border-box; }

.cal-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: #222;
  background: #f5f5f5;
  overflow: hidden;
}

.loading-screen {
  display: flex; align-items: center; justify-content: center;
  height: 100vh; font-size: 1.2rem; color: #888;
}

.section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 14px 16px;
}

.section-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
  user-select: none;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

// ---- Info button & help bubble ----
.info-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid #bbb;
  background: transparent;
  color: #999;
  font-size: 11px;
  font-style: italic;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  font-family: Georgia, serif;

  &:hover, &.active {
    border-color: #4a90d9;
    color: #4a90d9;
    background: #e8f0fe;
  }
}

.help-bubble {
  background: #f0f7ff;
  border: 1px solid #b8d4f5;
  border-radius: 5px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 0.82rem;
  color: #3a5a80;
  line-height: 1.55;
}

// ---- LOD fraction toggle ----
.frac-btn {
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 3px;
  cursor: pointer;
  padding: 1px 6px;
  margin-left: 6px;
  vertical-align: middle;
  line-height: 1.4;
  color: #555;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover { background: #e8e8e8; }
  &.active { background: #4a90d9; border-color: #3578c5; color: #fff; }
}

.frac-input { font-family: monospace; }

// ---- Header ----
.cal-header {
  flex-shrink: 0;
  border-radius: 0 !important;
  border-left: none; border-right: none; border-top: none;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.id-label {
  font-size: 0.72rem;
  color: #aaa;
  font-family: monospace;
  white-space: nowrap;
  user-select: none;
}

.name-input {
  flex: 1;
  padding: 5px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
}

.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.save-error { margin: 6px 0 0; color: #c0392b; font-size: 0.85rem; }

// ---- Body ----
.cal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}

.cal-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// ---- Fields ----
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;

  label {
    font-size: 0.73rem; font-weight: 600; color: #666;
    text-transform: uppercase; letter-spacing: 0.04em; user-select: none;
  }

  input[type='text'], input[type='number'] {
    padding: 5px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    background: #fafafa;
    color: #222;
    width: 100%;
    &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
  }
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.field-label {
  font-size: 0.73rem; font-weight: 600; color: #666;
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
  color: #444;
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
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #777;
    padding: 4px 6px;
    border-bottom: 1px solid #ddd;
    user-select: none;
  }

  td { padding: 3px 4px; vertical-align: middle; }
}

.num-cell { color: #aaa; font-size: 0.78rem; width: 24px; text-align: right; user-select: none; }
.center-cell { text-align: center; }

.tbl-input {
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 0.85rem;
  background: #fafafa;
  width: 100%;
  &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
}

.short-input  { width: 70px; }
.narrow-input { width: 64px; }
.step-input   { width: 110px; }

// ---- Weekend row ----
.weekend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

// ---- Buttons ----
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &.btn-primary   { background: #4a90d9; color: #fff; &:hover:not(:disabled) { background: #3578c5; } }
  &.btn-secondary { background: #eee; color: #333; &:hover:not(:disabled) { background: #ddd; } }
  &.btn-sm { padding: 4px 12px; font-size: 0.82rem; }
}

.btn-icon {
  border: none; background: none; cursor: pointer;
  font-size: 1.1rem; color: #aaa; padding: 0 2px; line-height: 1;
  &:hover { color: #c0392b; }
}

.mt-8 { margin-top: 8px; }
</style>

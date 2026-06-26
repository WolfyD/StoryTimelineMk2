<script setup lang="ts">
import { computed } from 'vue'
import type { LodLevel } from '@/types/models'

// Month lengths for day-of-year ↔ (month, day) conversion (non-leap Gregorian baseline)
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter']

const props = defineProps<{
  lodIndex: number
  lodProfile: LodLevel[]
  monthNames: string[]   // 12 names from calendar year_definition; falls back to Gregorian
  year: number
  subtick: number
  label: string
}>()

const emit = defineEmits<{
  'update:year': [value: number]
  'update:subtick': [value: number]
}>()

// LOD format keys from the default profile
const LOD_MILLENNIA  = 0
const LOD_CENTURIES  = 1
const LOD_DECADES    = 2
const LOD_YEARS      = 3
const LOD_SEASONS    = 4
const LOD_MONTHS     = 5
const LOD_WEEKS      = 6
const LOD_DAYS       = 7

const showSeasons = computed(() => props.lodIndex === LOD_SEASONS)
const showMonths  = computed(() => props.lodIndex === LOD_MONTHS || props.lodIndex === LOD_DAYS)
const showDays    = computed(() => props.lodIndex === LOD_DAYS)
const showWeeks   = computed(() => props.lodIndex === LOD_WEEKS)
const yearStep    = computed(() => {
  if (props.lodIndex === LOD_MILLENNIA) return 1000
  if (props.lodIndex === LOD_CENTURIES) return 100
  if (props.lodIndex === LOD_DECADES)   return 10
  return 1
})

// For DAYS: subtick is day-of-year (0-based). Decompose into month index + day-of-month.
const monthFromSubtick = computed(() => {
  if (!showDays.value) return props.subtick  // subtick IS month index for LOD_MONTHS
  let rem = props.subtick
  for (let i = 0; i < 12; i++) {
    if (rem < MONTH_LENGTHS[i]) return i
    rem -= MONTH_LENGTHS[i]
  }
  return 11
})

const dayFromSubtick = computed(() => {
  if (!showDays.value) return 1
  let rem = props.subtick
  for (let i = 0; i < 12; i++) {
    if (rem < MONTH_LENGTHS[i]) return rem + 1
    rem -= MONTH_LENGTHS[i]
  }
  return 1
})

const daysInSelectedMonth = computed(() => MONTH_LENGTHS[monthFromSubtick.value] ?? 31)

const resolvedMonthNames = computed(() =>
  props.monthNames.length === 12 ? props.monthNames : [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ]
)

function onYearChange(e: Event) {
  emit('update:year', parseInt((e.target as HTMLInputElement).value) || 0)
}

function onSeasonChange(e: Event) {
  emit('update:subtick', parseInt((e.target as HTMLSelectElement).value))
}

function onMonthChange(e: Event) {
  const newMonth = parseInt((e.target as HTMLSelectElement).value)
  if (showDays.value) {
    // Recompute day-of-year: keep current day but in new month
    let doy = 0
    for (let i = 0; i < newMonth; i++) doy += MONTH_LENGTHS[i]
    const clampedDay = Math.min(dayFromSubtick.value, MONTH_LENGTHS[newMonth])
    emit('update:subtick', doy + clampedDay - 1)
  } else {
    emit('update:subtick', newMonth)
  }
}

function onDayChange(e: Event) {
  const newDay = parseInt((e.target as HTMLInputElement).value) || 1
  let doy = 0
  for (let i = 0; i < monthFromSubtick.value; i++) doy += MONTH_LENGTHS[i]
  emit('update:subtick', doy + newDay - 1)
}

function onWeekChange(e: Event) {
  // subtick for WEEKS is 0-based week index
  emit('update:subtick', Math.max(0, parseInt((e.target as HTMLInputElement).value) - 1) || 0)
}
</script>

<template>
  <div class="lod-date-input">
    <span class="lod-date-label">{{ label }}</span>
    <div class="lod-date-fields">
      <div class="lod-field">
        <label>Year</label>
        <input
          type="number"
          :value="year"
          :step="yearStep"
          @change="onYearChange"
        />
      </div>

      <div v-if="showSeasons" class="lod-field">
        <label>Season</label>
        <select :value="subtick" @change="onSeasonChange">
          <option v-for="(name, i) in SEASON_NAMES" :key="i" :value="i">{{ name }}</option>
        </select>
      </div>

      <div v-if="showMonths" class="lod-field">
        <label>Month</label>
        <select :value="monthFromSubtick" @change="onMonthChange">
          <option v-for="(name, i) in resolvedMonthNames" :key="i" :value="i">{{ name }}</option>
        </select>
      </div>

      <div v-if="showDays" class="lod-field">
        <label>Day</label>
        <input
          type="number"
          :value="dayFromSubtick"
          :min="1"
          :max="daysInSelectedMonth"
          @change="onDayChange"
        />
      </div>

      <div v-if="showWeeks" class="lod-field">
        <label>Week</label>
        <input
          type="number"
          :value="subtick + 1"
          min="1"
          max="52"
          @change="onWeekChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lod-date-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lod-date-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-label, #888);
}

.lod-date-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lod-field {
  display: flex;
  flex-direction: column;
  gap: 2px;

  label {
    font-size: 0.7rem;
    color: var(--color-label, #888);
  }

  input[type='number'] {
    width: 80px;
    padding: 4px 6px;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--color-input-bg, #fff);
    color: var(--color-text, #222);
  }

  select {
    padding: 4px 6px;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--color-input-bg, #fff);
    color: var(--color-text, #222);
  }
}
</style>

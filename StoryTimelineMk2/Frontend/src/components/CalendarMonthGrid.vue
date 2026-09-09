<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
    monthName: string
    days: number
    weekLength: number
    dayLabels: string[]
    weekendDays: number[]
}>()

// How many chars to show in the day header abbreviation
const abbrevLen = computed(() => props.weekLength > 10 ? 1 : 2)

function abbrev(label: string): string {
    return label.slice(0, abbrevLen.value)
}

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
                        {{ day ?? '' }}
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
    overflow: hidden;
}

.month-name {
    background: #1e3060;
    color: #c8ddf8;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    padding: 5px 8px;
    letter-spacing: 0.03em;
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
        padding: 3px 2px;
        color: #b8ccec;
        font-variant-numeric: tabular-nums;
        line-height: 1.6;

        &.weekend { color: #7aa8e8; }
        &.empty    { color: transparent; }
    }

    tr:hover td:not(.empty) {
        background: #162035;
    }
}
</style>

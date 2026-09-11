<script setup lang="ts">
import { computed } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import CalendarMonthGrid from './CalendarMonthGrid.vue'
import type { MemDayMarker } from './CalendarMonthGrid.vue'

const props = defineProps<{
    calendarName: string
    months: { name: string; length: number }[]
    weekLength: number
    dayLabels: string[]
    weekendDays: number[]
    memorableDays?: MemDayMarker[]
}>()

const emit = defineEmits<{ close: [] }>()

// Ensure we always have exactly weekLength labels to pass down
const effectiveLabels = computed(() =>
    props.dayLabels.length === props.weekLength
        ? props.dayLabels
        : Array.from({ length: props.weekLength }, (_, i) => `D${i + 1}`)
)
</script>

<template>
    <Teleport to="body">
        <div class="year-backdrop" @click.self="emit('close')">
            <div class="year-panel">

                <div class="year-header">
                    <span class="year-title">{{ calendarName }} — Year View</span>
                    <button class="close-btn" title="Close" @click="emit('close')">
                        <PhX :size="16" />
                    </button>
                </div>

                <div class="year-body">
                    <p v-if="months.length === 0" class="no-months">No months defined for this calendar.</p>
                    <div v-else class="month-grid">
                        <CalendarMonthGrid
                            v-for="(m, i) in months"
                            :key="i"
                            :month-name="m.name"
                            :month-index="i"
                            :days="m.length"
                            :week-length="weekLength"
                            :day-labels="effectiveLabels"
                            :weekend-days="weekendDays"
                            :memorable-days="memorableDays"
                        />
                    </div>
                </div>

            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.year-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
}

.year-panel {
    width: 50vw;
    max-height: 90vh;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

// ── Header ───────────────────────────────────────────────────────────────────

.year-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    flex-shrink: 0;
}

.year-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
}

.close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    &:hover { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
}

// ── Body ─────────────────────────────────────────────────────────────────────

.year-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: var(--app-surface-raised, #141e33);
}

.no-months {
    text-align: center;
    color: var(--app-text-dim, #64748b);
    font-style: italic;
    padding: 32px;
}

.month-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    align-items: start;
}
</style>

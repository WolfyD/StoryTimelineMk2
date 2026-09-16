<script setup lang="ts">
const props = defineProps<{
    modelValue: number[]
    weekLength: number
    dayLabels?: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [number[]] }>()

function toggle(i: number) {
    const cur = [...props.modelValue]
    const idx = cur.indexOf(i)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(i)
    emit('update:modelValue', cur.sort((a, b) => a - b))
}

function label(i: number): string {
    return props.dayLabels?.[i] ?? `D${i + 1}`
}
</script>

<template>
    <div class="week-picker">
        <button
            v-for="i in weekLength"
            :key="i - 1"
            type="button"
            class="day-chip"
            :class="{ selected: modelValue.includes(i - 1) }"
            @click="toggle(i - 1)"
        >{{ label(i - 1) }}</button>
        <span v-if="weekLength === 0" class="no-week-note">No week defined</span>
    </div>
</template>

<style scoped lang="scss">
.week-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.day-chip {
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.12s, border-color 0.12s, color 0.12s;

    &:hover:not(.selected) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); border-color: #3b5080; }

    &.selected {
        background: #2c5f8a;
        border-color: var(--app-accent, #3b6ec4);
        color: #e8f0ff;
        font-weight: 600;
    }
}

.no-week-note {
    font-size: 0.78rem;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
}
</style>

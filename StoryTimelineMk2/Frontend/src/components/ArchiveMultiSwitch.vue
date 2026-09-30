<script setup lang="ts">
/**
 * BL-88: an Archive tab's *Edit multiple* switch, which puts a tick on every row, and while it is on
 * the tick that takes or drops every row shown. The state is the tab's, from `useMultiPick`.
 */
defineProps<{
    /** Every row shown is ticked. */
    all: boolean
    /** Some row shown is ticked. */
    some: boolean
    /** Nothing shown can be ticked. */
    empty: boolean
}>()
const on = defineModel<boolean>({ required: true })
const emit = defineEmits<{ all: [] }>()
</script>

<template>
    <label class="ar-switch" data-tip="Tick rows to change them all at once">
        <input v-model="on" type="checkbox" role="switch" />
        Edit multiple
    </label>
    <label v-if="on" class="ar-btn ar-select-all" :class="{ 'ar-btn--disabled': empty }" data-tip="Tick every row the filters leave, or untick them">
        <input
            type="checkbox"
            class="ar-pick"
            :checked="all"
            :indeterminate="some && !all"
            :disabled="empty"
            @change="emit('all')"
        />
        Select all shown
    </label>
</template>

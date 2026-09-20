<script setup lang="ts">
// The `N` flow (BL-39): pick a type by click, digit or letter; `N` again repeats the last type.
import { onMounted, onBeforeUnmount } from 'vue'
import { PhCalendarBlank, PhCalendar, PhHourglass, PhImage, PhNote } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ lastTypeId: number | null }>()
const emit = defineEmits<{ pick: [typeId: number]; close: [] }>()

// Canvas context-menu order. Note is `O`: `N` is taken by "same as last time" and P by Period.
const ITEM_TYPE_CHOICES = [
    { id: 1, name: 'Event',   key: 'E', icon: PhCalendarBlank },
    { id: 2, name: 'Period',  key: 'P', icon: PhCalendar },
    { id: 3, name: 'Age',     key: 'A', icon: PhHourglass },
    { id: 4, name: 'Picture', key: 'I', icon: PhImage },
    { id: 5, name: 'Note',    key: 'O', icon: PhNote },
]

const lastName = () => ITEM_TYPE_CHOICES.find(t => t.id === props.lastTypeId)?.name ?? null

function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const key = e.key.toUpperCase()
    const choice = ITEM_TYPE_CHOICES.find((t, i) => t.key === key || String(i + 1) === key)
    const id = choice?.id ?? (key === 'N' ? props.lastTypeId : null)
    if (id == null) return
    e.preventDefault()
    e.stopImmediatePropagation()
    emit('pick', id)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
    <BaseModal title="New item" width="min(420px, 92vw)" @close="$emit('close')">
        <div class="tp-body">
            <button
                v-for="(t, i) in ITEM_TYPE_CHOICES" :key="t.id"
                class="tp-choice" :class="{ 'tp-choice--last': t.id === lastTypeId }"
                @click="$emit('pick', t.id)"
            >
                <component :is="t.icon" :size="22" />
                <span class="tp-name">{{ t.name }}</span>
                <span class="tp-keys"><kbd>{{ i + 1 }}</kbd><kbd>{{ t.key }}</kbd></span>
            </button>
            <p class="tp-tip">
                <template v-if="lastName()"><kbd>N</kbd> again — {{ lastName() }}, same as last time.</template>
                <template v-else>Press a key or click. <kbd>N</kbd> will repeat your last choice.</template>
            </p>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.tp-body {
    padding: 16px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tp-choice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--app-radius-sm, 6px);
    color: var(--app-text, #e2e8f0);
    font: inherit;
    cursor: pointer;
    text-align: left;

    &:hover, &:focus-visible {
        background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
        border-color: var(--app-border, #2d3a56);
        outline: none;
    }
    &--last { border-color: color-mix(in srgb, var(--app-accent, #6366f1) 60%, transparent); }
}

.tp-name { flex: 1; }
.tp-keys { display: flex; gap: 4px; }

kbd {
    display: inline-block;
    min-width: 18px;
    padding: 1px 5px;
    font-size: 0.8em;
    font-family: monospace;
    text-align: center;
    background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 70%, transparent);
    border-radius: 3px;
    color: var(--app-text-muted, #94a3b8);
}

.tp-tip {
    margin: 8px 0 0;
    font-size: 0.85em;
    color: var(--app-text-dim, #4a6080);
}
</style>

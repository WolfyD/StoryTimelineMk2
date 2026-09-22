<script setup lang="ts">
// The `N` flow (BL-39): pick a type by click, digit or letter; the key that opened the picker,
// pressed again, repeats the last type. Every letter here is remappable, so they come from the
// registry rather than from this file — the digits 1–5 always work whatever they are set to.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { PhCalendarBlank, PhCalendar, PhHourglass, PhImage, PhNote } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import { SHORTCUTS, keysOf, chordOf, chordParts } from '@/utils/shortcuts'

const props = defineProps<{ lastTypeId: number | null }>()
const emit = defineEmits<{ pick: [typeId: number]; close: [] }>()

// Canvas context-menu order. Note defaults to `O`: `N` is "same as last time" and P is Period.
const ITEM_TYPE_CHOICES = [
    { id: 1, name: 'Event',   shortcut: 'pickEvent',   icon: PhCalendarBlank },
    { id: 2, name: 'Period',  shortcut: 'pickPeriod',  icon: PhCalendar },
    { id: 3, name: 'Age',     shortcut: 'pickAge',     icon: PhHourglass },
    { id: 4, name: 'Picture', shortcut: 'pickPicture', icon: PhImage },
    { id: 5, name: 'Note',    shortcut: 'pickNote',    icon: PhNote },
]

const chordFor = (id: string) => {
    const s = SHORTCUTS.find(x => x.context === 'timeline' && x.id === id)
    return s ? keysOf(s)[0] ?? '' : ''
}
const choices = computed(() => ITEM_TYPE_CHOICES.map(t => ({ ...t, key: chordFor(t.shortcut) })))
// Whatever opens the picker repeats the last type when pressed again.
const repeatChord = computed(() => chordFor('addItem'))

const lastName = () => ITEM_TYPE_CHOICES.find(t => t.id === props.lastTypeId)?.name ?? null

function onKeydown(e: KeyboardEvent) {
    const chord = chordOf(e)
    const choice = choices.value.find((t, i) => t.key === chord || String(i + 1) === chord)
    const id = choice?.id ?? (chord === repeatChord.value ? props.lastTypeId : null)
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
                v-for="(t, i) in choices" :key="t.id"
                class="tp-choice" :class="{ 'tp-choice--last': t.id === lastTypeId }"
                @click="$emit('pick', t.id)"
            >
                <component :is="t.icon" :size="22" />
                <span class="tp-name">{{ t.name }}</span>
                <span class="tp-keys"><kbd>{{ i + 1 }}</kbd><kbd v-for="part in chordParts(t.key)" :key="part">{{ part }}</kbd></span>
            </button>
            <p class="tp-tip">
                <template v-if="lastName()"><kbd v-for="part in chordParts(repeatChord)" :key="part">{{ part }}</kbd> again — {{ lastName() }}, same as last time.</template>
                <template v-else>Press a key or click. <kbd v-for="part in chordParts(repeatChord)" :key="part">{{ part }}</kbd> will repeat your last choice.</template>
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

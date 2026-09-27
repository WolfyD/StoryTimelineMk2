<script setup lang="ts">
/**
 * A font field with the list under it, each name written in its own face so the choice is the
 * example. The list is teleported to the body and placed by hand: inside a modal it would otherwise
 * be clipped by the panel's own `overflow: hidden` a line and a half in.
 */
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
    modelValue: string
    fonts: string[]
    placeholder?: string
    /** A line in the chosen font under the field: what the thing being styled will look like. */
    sample?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const search = ref(props.modelValue)
const isOpen = ref(false)
const isTyping = ref(false)
const highlightIndex = ref(0)
const field = ref<HTMLElement | null>(null)
/** Where the teleported list goes, in viewport coordinates. */
const at = ref({ left: 0, top: 0, width: 0, maxHeight: 200 })

watch(() => props.modelValue, v => { search.value = v })

/** Under the field, or above it when the field is near the bottom of the window. */
function place() {
    const box = field.value?.getBoundingClientRect()
    if (!box) return
    const below = window.innerHeight - box.bottom - 10
    const above = box.top - 10
    const down = below >= 150 || below >= above
    at.value = {
        left: box.left,
        width: box.width,
        top: down ? box.bottom + 2 : Math.max(8, box.top - Math.min(above, 240) - 2),
        maxHeight: Math.max(120, Math.min(240, down ? below : above)),
    }
}

// The field can move under an open list — a modal being dragged, a panel scrolling. Cheaper to
// follow it than to close on every scroll the page might do.
function watchPlacement(on: boolean) {
    const fn = on ? window.addEventListener : window.removeEventListener
    fn('scroll', place, true)
    fn('resize', place)
}
watch(isOpen, open => {
    watchPlacement(open)
    if (open) void nextTick(place)
})
onBeforeUnmount(() => watchPlacement(false))

const filtered = computed(() => {
    if (!isTyping.value || !search.value) return props.fonts.slice(0, 60)
    const q = search.value.toLowerCase()
    return props.fonts.filter(f => f.toLowerCase().includes(q)).slice(0, 60)
})

function selectFont(f: string) {
    emit('update:modelValue', f)
    search.value = f
    isTyping.value = false
    isOpen.value = false
    highlightIndex.value = 0
}

function onFocus() {
    isTyping.value = false
    place()          // before it is shown, so the list never paints in the wrong place first
    isOpen.value = true
}

function onBlur() {
    setTimeout(() => {
        isOpen.value = false
        search.value = props.modelValue
        isTyping.value = false
    }, 150)
}

function onInput(e: Event) {
    search.value = (e.target as HTMLInputElement).value
    isTyping.value = true
    place()
    isOpen.value = true
    highlightIndex.value = 0
}

function onKeydown(e: KeyboardEvent) {
    if (!isOpen.value && e.key !== 'Escape') { place(); isOpen.value = true; return }
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlightIndex.value = Math.min(filtered.value.length - 1, highlightIndex.value + 1)
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlightIndex.value = Math.max(0, highlightIndex.value - 1)
    } else if (e.key === 'Enter') {
        e.preventDefault()
        const font = filtered.value[highlightIndex.value]
        if (font) selectFont(font)
    } else if (e.key === 'Escape') {
        isOpen.value = false
    }
}
</script>

<template>
    <div ref="field" class="font-picker">
        <input
            class="fp-input"
            type="text"
            :value="search"
            :placeholder="placeholder ?? 'Search fonts…'"
            @input="onInput"
            @focus="onFocus"
            @blur="onBlur"
            @keydown="onKeydown"
        />
        <div v-if="sample" class="fp-sample" :style="{ fontFamily: modelValue }">{{ sample }}</div>
        <Teleport to="body">
            <div
                v-if="isOpen && filtered.length"
                class="fp-dropdown"
                :style="{
                    left: at.left + 'px',
                    top: at.top + 'px',
                    width: at.width + 'px',
                    maxHeight: at.maxHeight + 'px',
                }"
            >
                <div
                    v-for="(f, i) in filtered"
                    :key="f"
                    class="fp-option"
                    :class="{ 'is-highlighted': i === highlightIndex, 'is-selected': f === modelValue }"
                    :style="{ fontFamily: f }"
                    @mousedown.prevent="selectFont(f)"
                >
                    {{ sample || f }}
                    <span v-if="sample" class="fp-name">{{ f }}</span>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.font-picker {
    position: relative;
    width: 100%;
}

.fp-input {
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 13px;
    padding: 4px 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &:focus {
        border-color: var(--app-accent, #3b6ec4);
    }
}

.fp-sample {
    margin-top: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    background: #00000040;
    color: var(--app-text, #e2e8f0);
    font-size: 15px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
}

// Teleported to the body: fixed, and placed by place() above.
.fp-dropdown {
    position: fixed;
    z-index: 4000;
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-accent, #3b6ec4);
    border-radius: 4px;
    overflow-y: auto;
    box-shadow: 0 6px 16px #00000099;

    &::-webkit-scrollbar { width: 4px; }
    &::-webkit-scrollbar-thumb { background: var(--app-border, #2d3a56); border-radius: 2px; }
}

.fp-option {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 10px;
    font-size: 15px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;

    &.is-highlighted {
        background: var(--app-surface-high, #1e2b44);
        color: var(--app-text, #e2e8f0);
    }

    &.is-selected {
        color: #60a5fa;
    }

    &:hover {
        background: #1a2640;
        color: var(--app-text, #e2e8f0);
    }
}

// The family name, always in the UI font — a display face can be unreadable at 11px.
.fp-name {
    flex: 0 0 auto;
    font: 11px Inter, system-ui, sans-serif;
    color: var(--app-text-muted, #94a3b8);
    opacity: 0.75;
}
</style>

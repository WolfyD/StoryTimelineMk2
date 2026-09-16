<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
    modelValue: string
    fonts: string[]
    placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const search = ref(props.modelValue)
const isOpen = ref(false)
const isTyping = ref(false)
const highlightIndex = ref(0)

watch(() => props.modelValue, v => { search.value = v })

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
    isOpen.value = true
    highlightIndex.value = 0
}

function onKeydown(e: KeyboardEvent) {
    if (!isOpen.value && e.key !== 'Escape') { isOpen.value = true; return }
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlightIndex.value = Math.min(filtered.value.length - 1, highlightIndex.value + 1)
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlightIndex.value = Math.max(0, highlightIndex.value - 1)
    } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered.value[highlightIndex.value]) selectFont(filtered.value[highlightIndex.value])
    } else if (e.key === 'Escape') {
        isOpen.value = false
    }
}
</script>

<template>
    <div class="font-picker">
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
        <div v-if="isOpen && filtered.length" class="fp-dropdown">
            <div
                v-for="(f, i) in filtered"
                :key="f"
                class="fp-option"
                :class="{ 'is-highlighted': i === highlightIndex, 'is-selected': f === modelValue }"
                @mousedown.prevent="selectFont(f)"
            >
                {{ f }}
            </div>
        </div>
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

.fp-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 200;
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-accent, #3b6ec4);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 6px 16px #00000099;

    &::-webkit-scrollbar { width: 4px; }
    &::-webkit-scrollbar-thumb { background: var(--app-border, #2d3a56); border-radius: 2px; }
}

.fp-option {
    padding: 5px 10px;
    font-size: 13px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;

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
</style>

<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { DEFAULT_SWATCHES } from '@/utils/timelinePrefs'

// Edits a copy; the caller only sees the result on Apply.
const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void; (e: 'close'): void }>()

const draft = ref<string[]>([...props.modelValue])

function apply() {
    emit('update:modelValue', [...draft.value])
    emit('close')
}
</script>

<template>
    <BaseModal title="Color Swatches" width="min(420px, 92vw)" :z-index="1100" @close="emit('close')">
        <div class="swatch-body">
            <p class="hint">The quick-pick colors offered in the edit item window. Each timeline keeps its own set.</p>
            <div class="swatch-grid">
                <label v-for="(_, i) in draft" :key="i" class="swatch-cell">
                    <input type="color" class="swatch-input" v-model="draft[i]" />
                    <span class="swatch-hex">{{ draft[i] }}</span>
                </label>
            </div>
        </div>
        <template #footer>
            <button class="btn btn-secondary reset-btn" type="button" @click="draft = [...DEFAULT_SWATCHES]">Reset to defaults</button>
            <button class="btn btn-secondary" type="button" data-cancel @click="emit('close')">Cancel</button>
            <button class="btn btn-primary" type="button" data-primary @click="apply">Apply</button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.swatch-body {
    padding: 16px 20px;
}

.hint {
    margin: 0 0 12px;
    font-size: 0.8rem;
    color: var(--app-text-muted, #94a3b8);
}

.swatch-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
}

.swatch-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
}

.swatch-input {
    width: 56px;
    height: 36px;
    padding: 2px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 6px;
    background: var(--app-surface, #0c1524);
    cursor: pointer;
}

.swatch-hex {
    font-family: monospace;
    font-size: 0.72rem;
    color: var(--app-text-dim, #64748b);
}

.reset-btn { margin-right: auto; }

.btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.15s;

    &.btn-primary { background: var(--app-accent, #4a90d9); color: #fff; &:hover { background: var(--app-accent-hover, #3578c5); } }
    &.btn-secondary { background: var(--app-surface-high, #334155); color: var(--app-text-muted, #cbd5e1); &:hover { background: color-mix(in srgb, var(--app-surface-high, #334155) 80%, var(--app-text, #fff)); } }
}
</style>

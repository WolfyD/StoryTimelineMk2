<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { lodLevelLabel } from '@/utils/timelinePrefs'
import type { LodLevel } from '@/types/models'

// Full-name checklist of the calendar's LOD levels; edits a copy of the mask until Apply.
// Default: Apply hands the mask back and closes. With closeOnApply=false the parent runs the
// change on `apply` (showing busy / error here) and closes the modal itself when it succeeded.
const props = withDefaults(defineProps<{
    modelValue: number
    lodProfile: LodLevel[]
    title?: string
    hint?: string
    applyLabel?: string
    danger?: boolean
    closeOnApply?: boolean
    busy?: boolean
    error?: string
}>(), { title: 'Visible At Zoom Levels', applyLabel: 'Apply', closeOnApply: true })
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void; (e: 'apply', v: number): void; (e: 'close'): void }>()

const draft = ref(props.modelValue)
const allMask = props.lodProfile.reduce((m, l) => m | (1 << l.index), 0)

function apply() {
    emit('update:modelValue', draft.value)
    emit('apply', draft.value)
    if (props.closeOnApply) emit('close')
}
</script>

<template>
    <BaseModal :title="title" width="min(380px, 92vw)" :z-index="1100" @close="emit('close')">
        <div class="lod-body">
            <p v-if="hint" class="hint">{{ hint }}</p>
            <div class="quick-row">
                <button type="button" class="link-btn lod-all" @click="draft = allMask">All</button>
                <button type="button" class="link-btn lod-none" @click="draft = 0">None</button>
            </div>
            <label v-for="lod in lodProfile" :key="lod.index" class="lod-row">
                <input
                    type="checkbox" class="lod-check"
                    :checked="(draft & (1 << lod.index)) !== 0"
                    @change="draft ^= (1 << lod.index)"
                />
                <span class="lod-name">{{ lodLevelLabel(lod) }}</span>
            </label>
            <p v-if="error" class="lod-error">{{ error }}</p>
        </div>
        <template #footer>
            <button class="btn btn-secondary" type="button" data-cancel :disabled="busy" @click="emit('close')">Cancel</button>
            <button class="btn lod-apply" :class="danger ? 'btn-danger' : 'btn-primary'" type="button" data-primary :disabled="busy" @click="apply">
                {{ busy ? '…' : applyLabel }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.lod-body {
    padding: 12px 20px 16px;
    display: flex;
    flex-direction: column;
}

.hint {
    margin: 0 0 8px;
    font-size: 0.8rem;
    color: var(--app-text-muted, #94a3b8);
}

.quick-row {
    display: flex;
    gap: 12px;
    margin-bottom: 6px;
}

.link-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.78rem;
    color: var(--app-accent-hover, #818cf8);
    cursor: pointer;

    &:hover { text-decoration: underline; }
}

.lod-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 50%, transparent);
    cursor: pointer;
    font-size: 0.88rem;
    color: var(--app-text, #e2e8f0);

    &:last-child { border-bottom: none; }
    &:hover { background: var(--app-surface-high, #1e2b44); }
}

.lod-check { accent-color: var(--app-accent, #4a90d9); }

.lod-error {
    margin: 10px 0 0;
    font-size: 0.8rem;
    color: #f87171;
}

.btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.15s;
    &:disabled { opacity: 0.55; cursor: not-allowed; }

    &.btn-primary { background: var(--app-accent, #4a90d9); color: #fff; &:hover:not(:disabled) { background: var(--app-accent-hover, #3578c5); } }
    &.btn-secondary { background: var(--app-surface-high, #334155); color: var(--app-text-muted, #cbd5e1); &:hover:not(:disabled) { background: color-mix(in srgb, var(--app-surface-high, #334155) 80%, var(--app-text, #fff)); } }
    &.btn-danger { background: #7f1d1d; color: #fecaca; &:hover:not(:disabled) { background: #991b1b; } }
}
</style>

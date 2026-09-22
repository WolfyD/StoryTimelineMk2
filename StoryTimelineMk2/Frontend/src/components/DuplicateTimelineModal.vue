<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ originalTitle: string }>()
const emit = defineEmits<{ close: []; confirm: [newTitle: string] }>()

const newTitle = ref(`${props.originalTitle}_duplicate`)
const isWorking = ref(false)

function confirm() {
    if (!newTitle.value.trim()) return
    isWorking.value = true
    emit('confirm', newTitle.value.trim())
}
</script>

<template>
    <BaseModal title="Duplicate Timeline" width="min(440px, 92vw)" @close="emit('close')">
        <div class="modal-body">
            <label class="field-label">New title</label>
            <input
                class="field-input"
                type="text"
                v-model="newTitle"
                data-enter-self @keydown.enter="confirm"
                @keydown.escape="emit('close')"
                autofocus
            />
        </div>
        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="emit('close')">Cancel</button>
            <button class="btn btn-primary" data-primary :disabled="!newTitle.trim() || isWorking" @click="confirm">
                {{ isWorking ? 'Duplicating…' : 'Duplicate' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; color: var(--app-text-dim, #64748b); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.field-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 14px; padding: 7px 10px; outline: none; width: 100%; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}
.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.btn-primary {
    background: var(--app-save-accent, #446b40); color: #e8f5e5;
    &:hover:not(:disabled) { background: var(--app-save-accent-hover, #52804c); }
}
</style>

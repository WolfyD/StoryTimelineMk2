<script setup lang="ts">
import { PhWarning } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ title: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
    <BaseModal title="Delete Timeline" width="min(440px, 92vw)" @close="emit('close')">
        <div class="modal-body">
            <PhWarning :size="40" class="warning-icon" />
            <p>Are you sure you want to delete <strong>{{ title }}</strong>?</p>
            <p class="sub">All items, characters, and notes inside it will be permanently removed.</p>
        </div>
        <template #footer>
            <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
            <button class="btn btn-danger" @click="emit('confirm')">Delete</button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 28px 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    color: var(--app-text, #e2e8f0);
    font-size: 14px;
    p { margin: 0; }
    .sub { font-size: 12px; color: var(--app-text-dim, #64748b); }
}
.warning-icon { color: #f59e0b; }
.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s;
}
.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.btn-danger {
    background: #7f1d1d; color: #fecaca;
    &:hover { background: #991b1b; }
}
</style>

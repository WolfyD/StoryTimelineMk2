<script setup lang="ts">
import { PhWarning, PhX } from '@phosphor-icons/vue'

const props = defineProps<{ title: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
    <div class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-panel">
            <div class="modal-header">
                <span class="modal-title">Delete Timeline</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="18" /></button>
            </div>
            <div class="modal-body">
                <PhWarning :size="40" class="warning-icon" />
                <p>Are you sure you want to delete <strong>{{ title }}</strong>?</p>
                <p class="sub">All items, characters, and notes inside it will be permanently removed.</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
                <button class="btn btn-danger" @click="emit('confirm')">Delete</button>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.modal-panel {
    display: flex;
    flex-direction: column;
    background: #141e33;
    border: 1px solid #2d3a56;
    border-radius: 8px;
    width: min(440px, 92vw);
    box-shadow: 0 24px 48px #00000066;
}
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: #1e2b44;
    border-bottom: 1px solid #2d3a56;
    border-radius: 8px 8px 0 0;
}
.modal-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: #64748b; cursor: pointer;
    padding: 4px; border-radius: 4px; transition: color 0.15s, background 0.15s;
    &:hover { color: #e2e8f0; background: #ffffff12; }
}
.modal-body {
    padding: 28px 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    color: #e2e8f0;
    font-size: 14px;
    p { margin: 0; }
    .sub { font-size: 12px; color: #64748b; }
}
.warning-icon { color: #f59e0b; }
.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    background: #1e2b44;
    border-top: 1px solid #2d3a56;
    border-radius: 0 0 8px 8px;
}
.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s;
}
.btn-cancel {
    background: transparent; color: #94a3b8; border: 1px solid #2d3a56;
    &:hover { background: #ffffff0e; color: #e2e8f0; }
}
.btn-danger {
    background: #7f1d1d; color: #fecaca;
    &:hover { background: #991b1b; }
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { PhX } from '@phosphor-icons/vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: []; confirm: [includeIds: boolean] }>()

const includeIds = ref(false)
const isWorking = ref(false)

function confirm() {
    isWorking.value = true
    emit('confirm', includeIds.value)
}
</script>

<template>
    <div class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-panel">
            <div class="modal-header">
                <span class="modal-title">Export Timeline</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="18" /></button>
            </div>
            <div class="modal-body">
                <p class="desc">Exporting <strong>{{ title }}</strong> as JSON.</p>
                <label class="checkbox-row">
                    <input type="checkbox" v-model="includeIds" />
                    <span>Include internal IDs <span class="hint">(useful for re-import)</span></span>
                </label>
            </div>
            <div class="modal-footer">
                <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
                <button class="btn btn-primary" :disabled="isWorking" @click="confirm">
                    {{ isWorking ? 'Exporting…' : 'Choose File & Export' }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed; inset: 0; background: #00000088; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
}
.modal-panel {
    display: flex; flex-direction: column;
    background: #141e33; border: 1px solid #2d3a56; border-radius: 8px;
    width: min(420px, 92vw); box-shadow: 0 24px 48px #00000066;
}
.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: #1e2b44;
    border-bottom: 1px solid #2d3a56; border-radius: 8px 8px 0 0;
}
.modal-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
.close-btn {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: #64748b; cursor: pointer;
    padding: 4px; border-radius: 4px; transition: color 0.15s, background 0.15s;
    &:hover { color: #e2e8f0; background: #ffffff12; }
}
.modal-body {
    padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; color: #e2e8f0;
}
.desc { margin: 0; font-size: 13px; color: #94a3b8; }
.checkbox-row {
    display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px;
    input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: #3b6ec4; }
    .hint { font-size: 11px; color: #4a6080; }
}
.modal-footer {
    display: flex; justify-content: flex-end; gap: 10px;
    padding: 12px 20px; background: #1e2b44;
    border-top: 1px solid #2d3a56; border-radius: 0 0 8px 8px;
}
.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
    background: transparent; color: #94a3b8; border: 1px solid #2d3a56;
    &:hover:not(:disabled) { background: #ffffff0e; color: #e2e8f0; }
}
.btn-primary {
    background: #446b40; color: #e8f5e5;
    &:hover:not(:disabled) { background: #52804c; }
}
</style>

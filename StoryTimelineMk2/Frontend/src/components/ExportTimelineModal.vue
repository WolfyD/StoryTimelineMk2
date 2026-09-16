<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: []; confirm: [includeIds: boolean, includeMedia: boolean] }>()

const includeIds  = ref(false)
const includeMedia = ref(false)
const isWorking   = ref(false)

function confirm() {
    isWorking.value = true
    emit('confirm', includeIds.value, includeMedia.value)
}
</script>

<template>
    <BaseModal title="Export Timeline" width="min(420px, 92vw)" @close="emit('close')">
        <div class="modal-body">
            <p class="desc">Exporting <strong>{{ title }}</strong> as a <code>.stlm</code> archive.</p>
            <label class="checkbox-row">
                <input type="checkbox" v-model="includeIds" />
                <span>Include internal IDs <span class="hint">(allows exact restore — replaces matching timeline on import)</span></span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" v-model="includeMedia" />
                <span>Include media files <span class="hint">(embeds images in the archive; larger file)</span></span>
            </label>
            <p class="info-hint">Without IDs the timeline is always imported as a new entry, even if one with the same name exists.</p>
        </div>
        <template #footer>
            <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
            <button class="btn btn-primary" :disabled="isWorking" @click="confirm">
                {{ isWorking ? 'Exporting…' : 'Choose destination & export' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; color: var(--app-text, #e2e8f0);
}
.desc { margin: 0; font-size: 13px; color: var(--app-text-muted, #94a3b8); }
.info-hint { margin: 4px 0 0; font-size: 11px; color: var(--app-text-dim, #4a6080); line-height: 1.5; }
.checkbox-row {
    display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px;
    input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: var(--app-accent, #3b6ec4); }
    .hint { font-size: 11px; color: var(--app-text-dim, #4a6080); }
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

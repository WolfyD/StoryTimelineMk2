<script setup lang="ts">
import BaseModal from './BaseModal.vue'

defineEmits<{ close: [] }>()

const version = __APP_VERSION__
</script>

<template>
    <BaseModal  style="user-select: none;" @close="$emit('close')">
        <template #header>
            <span class="modal-title">About</span>
        </template>

        <div class="about-body">
            <div class="about-name">Story Timeline <span style="font-size:smaller; opacity: .6">(Mk2)</span></div>
            <div class="about-version">v{{ version }}</div>
            <p class="about-desc" style="white-space: nowrap;">A timeline management tool for creative writers.</p>
			<p class="about-copy"><span style="vertical-align: super; font-size:smaller">&copy;</span> 2026 WolfyD</p>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.about-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 32px 24px 36px;
    text-align: center;
}

.about-name {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    letter-spacing: 0.02em;
}

.about-version {
    font-size: 0.78rem;
    color: var(--app-text-dim, #4a6080);
    font-variant-numeric: tabular-nums;
}

.about-desc {
    margin-top: 12px;
    font-size: 0.85rem;
    color: var(--app-text-muted, #94a3b8);
    max-width: 260px;
    line-height: 1.5;
}
</style>

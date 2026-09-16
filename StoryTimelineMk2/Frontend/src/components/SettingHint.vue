<script setup lang="ts">
defineProps<{ tip: string }>()
</script>

<template>
    <span class="s-hint">
        <svg class="s-hint-icon" viewBox="0 0 14 14" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="7" cy="7" r="6.25" stroke="currentColor" stroke-width="1.25"/>
            <text x="7" y="11" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor">?</text>
        </svg>
        <span class="s-hint-tip">{{ tip }}</span>
    </span>
</template>

<style scoped lang="scss">
.s-hint {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    cursor: help;
    color: var(--app-text-dim, #4a6080);
    line-height: 1;

    &:hover {
        color: var(--app-accent, #6366f1);
        .s-hint-icon { opacity: 1; }
        .s-hint-tip  { opacity: 1; }
    }
}

.s-hint-icon {
    display: block;
    opacity: 0.45;
    transition: opacity 0.15s, color 0.15s;
}

.s-hint-tip {
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--app-surface-high, #1e2b44);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 5px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 11px;
    font-weight: 400;
    padding: 5px 9px;
    width: max-content;
    max-width: 220px;
    white-space: normal;
    line-height: 1.45;
    z-index: 300;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    text-align: left;
}
</style>

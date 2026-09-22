<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue'
import { useModal } from '@/utils/modal'

const props = withDefaults(defineProps<{
    title?: string
    width?: string
    maxHeight?: string
    zIndex?: number
}>(), {
    width: 'min(560px, 92vw)',
    zIndex: 1000,
})

const emit = defineEmits<{ close: [] }>()

// Esc closes, Enter clicks the footer's `data-primary` button, the backdrop survives a drag.
const { root, onMousedown, onClick } = useModal(() => emit('close'))
</script>

<template>
    <div ref="root" class="bm-backdrop" :style="{ zIndex }" @mousedown="onMousedown" @click="onClick">
        <div class="bm-panel" :style="{ width, maxHeight }">
            <div class="bm-header">
                <slot name="header">
                    <span class="bm-title">{{ title ?? '' }}</span>
                    <button class="bm-close" @click="emit('close')"><PhX :size="18" /></button>
                </slot>
            </div>
            <slot />
            <div v-if="$slots.footer" class="bm-footer"><slot name="footer" /></div>
        </div>
    </div>
</template>

<style scoped lang="scss">
// Key hints on the footer buttons — the modals only mark which button is which, the badge and
// the keyboard handling both come from here. :slotted(), because the buttons come from the caller.
.bm-footer :slotted([data-primary])::after,
.bm-footer :slotted([data-cancel])::after {
    display: inline-block;
    margin-left: 7px;
    padding: 0 4px;
    border: 1px solid currentColor;
    border-radius: 3px;
    font-size: 0.75em;
    line-height: 1.5;
    opacity: 0.55;
    vertical-align: 1px;
}

.bm-footer :slotted([data-primary])::after { content: '↵'; }
.bm-footer :slotted([data-cancel])::after { content: 'Esc'; }
.bm-footer :slotted([data-primary]:disabled)::after { opacity: 0.25; }

.bm-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    display: flex;
    align-items: center;
    justify-content: center;
}

.bm-panel {
    display: flex;
    flex-direction: column;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    box-shadow: 0 24px 48px #00000066;
    overflow: hidden;
}

.bm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--app-surface-high, #1e2b44);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}

.bm-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
}

.bm-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    &:hover {
        color: var(--app-text, #e2e8f0);
        background: #ffffff12;
    }
}

.bm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    background: var(--app-surface-high, #1e2b44);
    border-top: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}
</style>

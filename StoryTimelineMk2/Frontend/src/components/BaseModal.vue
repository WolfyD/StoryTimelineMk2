<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import { useModalGuard } from '@/utils/shortcuts'

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

useModalGuard()

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
    <div class="bm-backdrop" :style="{ zIndex }" @click.self="emit('close')">
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

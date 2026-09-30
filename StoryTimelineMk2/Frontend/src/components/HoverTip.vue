<script setup lang="ts">
/**
 * Tooltips that keep clear of the pointer. The OS draws a native `title` right under the arrow and
 * nothing can move it, so an element opts in with `data-tip="…"` instead and one of these, once per
 * page, shows it: after the same short wait as a native one, then beside the pointer (placeTip).
 * An icon-only button still wants an `aria-label` — this is for the eye, not a screen reader.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { placeTip } from '@/utils/modal'

const text = ref('')
const el = ref<HTMLElement | null>(null)
let target: HTMLElement | null = null
let timer = 0
let x = 0
let y = 0

function onMove(e: MouseEvent) {
    x = e.clientX
    y = e.clientY
    const hit = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null
    if (hit === target) {
        if (text.value) placeTip(el.value, x, y)
        return
    }
    hide()
    target = hit
    if (hit) timer = window.setTimeout(() => {
        text.value = hit.dataset.tip ?? ''
        void nextTick(() => placeTip(el.value, x, y))
    }, 450)
}

/** A press, or the pointer leaving the window: the tip was about the moment before. */
function hide() {
    clearTimeout(timer)
    target = null
    text.value = ''
}

onMounted(() => {
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mousedown', hide, true)
    document.documentElement.addEventListener('mouseleave', hide)
})

onBeforeUnmount(() => {
    hide()
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mousedown', hide, true)
    document.documentElement.removeEventListener('mouseleave', hide)
})
</script>

<template>
    <Teleport to="body">
        <div v-if="text" ref="el" class="hover-tip" role="tooltip">{{ text }}</div>
    </Teleport>
</template>

<style scoped lang="scss">
.hover-tip {
    position: fixed;
    z-index: var(--z-menu, 9999);
    max-width: min(280px, calc(100vw - 16px));
    padding: 5px 9px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface-raised, #141e33);
    box-shadow: 0 10px 30px -8px rgb(0 0 0 / 70%);
    pointer-events: none;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--app-text, #e2e8f0);
}
</style>

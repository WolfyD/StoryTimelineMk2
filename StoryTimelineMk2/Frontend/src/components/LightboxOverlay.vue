<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useModalGuard } from '@/utils/shortcuts'

const props = defineProps<{
    src: string
    hasPrev?: boolean
    hasNext?: boolean
}>()

const emit = defineEmits<{
    close: []
    prev: []
    next: []
}>()

useModalGuard()

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape')     { e.preventDefault(); emit('close') }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); if (props.hasPrev) emit('prev') }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (props.hasNext) emit('next') }
}

onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
    <div class="lb-backdrop" @click="emit('close')">
        <button class="lb-close" title="Close (Esc)" @click.stop="emit('close')">
            <i class="ri-close-line"></i>
        </button>
        <button v-if="hasPrev" class="lb-nav lb-nav--prev" title="Previous" @click.stop="emit('prev')">
            <i class="ri-arrow-left-s-line"></i>
        </button>
        <Transition name="lb-swap" mode="out-in">
            <img :key="src" :src="src" class="lb-img" @click.stop />
        </Transition>
        <button v-if="hasNext" class="lb-nav lb-nav--next" title="Next" @click.stop="emit('next')">
            <i class="ri-arrow-right-s-line"></i>
        </button>
    </div>
</template>

<style scoped lang="scss">
.lb-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9500;
    cursor: zoom-out;
}

.lb-img {
    max-width: 80vw;
    max-height: 82vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
    cursor: default;
}

// Cross-fade between images when navigating
.lb-swap-enter-active { transition: opacity 0.15s ease; }
.lb-swap-leave-active { transition: opacity 0.1s ease; }
.lb-swap-enter-from,
.lb-swap-leave-to     { opacity: 0; }

.lb-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
    line-height: 1;

    &:hover {
        background: rgba(255, 255, 255, 0.24);
        border-color: rgba(255, 255, 255, 0.45);
    }
}

.lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #fff;
    font-size: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
    line-height: 1;

    &:hover {
        background: rgba(255, 255, 255, 0.24);
        border-color: rgba(255, 255, 255, 0.45);
    }

    &--prev { left: 20px; }
    &--next { right: 20px; }
}
</style>

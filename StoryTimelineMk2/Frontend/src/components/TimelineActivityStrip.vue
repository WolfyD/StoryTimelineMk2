<script setup lang="ts">
import {
    PhRuler,
    PhUsersThree,
    PhMapPin,
    PhMagnifyingGlass,
    PhChartBar,
    PhFunnel,
    PhGear,
} from '@phosphor-icons/vue'

defineProps<{
    filterActive: boolean
}>()

const emit = defineEmits<{
    'toggle-filter': []
    'open-settings': []
}>()

const navItems = [
    { id: 'timeline', icon: PhRuler,            label: 'Timeline',            active: true,  available: true  },
    { id: 'chars',    icon: PhUsersThree,        label: 'Characters',          active: false, available: false },
    { id: 'map',      icon: PhMapPin,            label: 'Map',                 active: false, available: false },
    { id: 'search',   icon: PhMagnifyingGlass,   label: 'Search',              active: false, available: false },
    { id: 'stats',    icon: PhChartBar,          label: 'Statistics',          active: false, available: false },
]
</script>

<template>
    <nav class="activity-strip" aria-label="App navigation">

        <!-- ── 3-dot actions ─────────────────────────────────────── -->
        <slot name="actions" />

        <!-- ── small gap ─────────────────────────────────────────── -->
        <div class="strip-gap strip-gap--sm" />

        <!-- ── Filter ───────────────────────────────────────────── -->
        <button
            class="strip-btn strip-btn--filter"
            :class="{ 'strip-btn--tool-active': filterActive }"
            title="Filter"
            @click="emit('toggle-filter')"
        >
            <PhFunnel :size="20" :weight="filterActive ? 'fill' : 'regular'" />
        </button>

        <!-- ── gap + separator ───────────────────────────────────── -->
        <div class="strip-gap strip-gap--md" />
        <div class="strip-separator" />

        <!-- ── Navigation icons ──────────────────────────────────── -->
        <button
            v-for="item in navItems"
            :key="item.id"
            class="strip-btn"
            :class="{
                'strip-btn--active':   item.active,
                'strip-btn--disabled': !item.available,
                [`strip-btn--nav-${item.id}`]: true,
            }"
            :title="item.available ? item.label : `${item.label} (coming soon)`"
            :tabindex="item.available ? 0 : -1"
        >
            <component :is="item.icon" :size="20" :weight="item.active ? 'duotone' : 'regular'" />
        </button>

        <!-- ── big spacer ────────────────────────────────────────── -->
        <div class="strip-spacer" />

        <!-- ── Gear — alone at bottom ────────────────────────────── -->
        <button
            class="strip-btn strip-btn--settings"
            title="Settings"
            @click="emit('open-settings')"
        >
            <PhGear :size="20" />
        </button>

    </nav>
</template>

<style scoped lang="scss">
.activity-strip {
    width: 48px;
    height: 100%;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: linear-gradient(180deg, #182236 0%, #0c1422 100%);
    border-right: 1px solid rgba(255, 255, 255, 0.055);
    user-select: none;
}

// ── Spacing helpers ────────────────────────────────────────────────────────────

.strip-spacer {
    flex: 1;
}

.strip-gap {
    flex-shrink: 0;
    &--sm { height: 4px; }
    &--md { height: 10px; }
}

.strip-btn--filter {
	margin-top: 27px;
}

.strip-separator {
    width: 26px;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
    margin: 0 auto 4px;
    flex-shrink: 0;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

.strip-btn {
    width: 48px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: #3d5166;
    cursor: pointer;
    padding: 0;
    transition: color 0.14s, background 0.14s, border-color 0.14s;
    position: relative;

    // Subtle radial glow on hover
    &:hover:not(.strip-btn--active):not(.strip-btn--disabled):not(.strip-btn--tool-active) {
        color: #8ca5bc;
        background: radial-gradient(
            ellipse 80% 70% at 50% 45%,
            rgba(255, 255, 255, 0.07) 0%,
            transparent 100%
        );
    }

    // Current section (timeline)
    &--active {
        color: #818cf8;
        border-left-color: #6366f1;
        background: linear-gradient(
            90deg,
            rgba(99, 102, 241, 0.16) 0%,
            rgba(99, 102, 241, 0.04) 100%
        );
    }

    // Tool active (filter on)
    &--tool-active {
        color: #86efac;
        border-left-color: #4ade80;
        background: linear-gradient(
            90deg,
            rgba(74, 222, 128, 0.14) 0%,
            rgba(74, 222, 128, 0.03) 100%
        );

        &:hover {
            color: #bbf7d0;
            background: linear-gradient(
                90deg,
                rgba(74, 222, 128, 0.22) 0%,
                rgba(74, 222, 128, 0.06) 100%
            );
        }
    }

    // Future features — ghosted so they're visible but clearly inactive
    &--disabled {
        color: #3d5166;
        opacity: 0.28;
        cursor: default;
        pointer-events: none;
    }
}
</style>

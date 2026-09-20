<script setup lang="ts">
import {
    PhRuler,
    PhUsersThree,
    PhMapPin,
    PhMagnifyingGlass,
    PhChartBar,
    PhFunnel,
    PhGear,
    PhQuestion,
    PhArrowsIn,
    PhArrowsOut,
    PhCalendarDots,
    PhTag,
    PhListPlus,
    PhBookOpen,
    PhInfo,
} from '@phosphor-icons/vue'
import { ref } from 'vue'

defineProps<{
    filterActive: boolean
    miniMode: boolean
    yearCalendarOpen: boolean
}>()

const emit = defineEmits<{
    'toggle-filter': []
    'open-settings': []
    'open-about': []
    'open-help': []
    'toggle-mini': []
    'toggle-year-calendar': []
    'open-tags': []
    'open-mass-add': []
}>()

const helpMenuOpen = ref(false)

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

        <!-- ── Mini mode ─────────────────────────────────────────── -->
        <button
            class="strip-btn strip-btn--mini"
            :class="{ 'strip-btn--tool-active': miniMode }"
            :title="miniMode ? 'Expand timeline' : 'Minimise timeline'"
            @click="emit('toggle-mini')"
        >
            <PhArrowsIn v-if="!miniMode" :size="20" />
            <PhArrowsOut v-else :size="20" />
        </button>

        <!-- ── Year calendar ──────────────────────────────────────── -->
        <button
            class="strip-btn strip-btn--year-cal"
            :class="{ 'strip-btn--tool-active': yearCalendarOpen }"
            title="Year calendar"
            @click="emit('toggle-year-calendar')"
        >
            <PhCalendarDots :size="20" :weight="yearCalendarOpen ? 'fill' : 'regular'" />
        </button>

        <!-- ── Tags ───────────────────────────────────────────────── -->
        <button class="strip-btn strip-btn--tags" title="Tags" @click="emit('open-tags')">
            <PhTag :size="20" />
        </button>

        <!-- ── Mass add ───────────────────────────────────────────── -->
        <button class="strip-btn strip-btn--mass-add" title="Mass add items" @click="emit('open-mass-add')">
            <PhListPlus :size="20" />
        </button>

        <!-- ── gap + separator ───────────────────────────────────── -->
        <div class="strip-gap strip-gap--md" />
        <div class="strip-separator" />

        <!-- ── Navigation icons ──────────────────────────────────── -->
        <button
            v-for="item in navItems.filter(i => i.available)"
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

        <!-- ── Help / About flyout ──────────────────────────────── -->
        <div class="strip-help-wrap">
            <button
                class="strip-btn strip-btn--about"
                :class="{ 'strip-btn--tool-active': helpMenuOpen }"
                title="Help / About"
                @click="helpMenuOpen = !helpMenuOpen"
            >
                <PhQuestion :size="20" />
            </button>
            <Transition name="flyout">
                <div v-if="helpMenuOpen" class="help-flyout">
                    <button class="flyout-item" @click="emit('open-help'); helpMenuOpen = false">
                        <PhBookOpen :size="15" /> Help
                    </button>
                    <button class="flyout-item" @click="emit('open-about'); helpMenuOpen = false">
                        <PhInfo :size="15" /> About
                    </button>
                </div>
            </Transition>
        </div>

        <Teleport to="body">
            <div v-if="helpMenuOpen" class="help-backdrop" @click="helpMenuOpen = false" />
        </Teleport>

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
    background: linear-gradient(180deg, var(--app-surface-raised, #182236) 0%, var(--app-surface, #0c1422) 100%);
    border-right: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
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
	margin-top: 21px;
}

.strip-separator {
    width: 26px;
    height: 1px;
    background: color-mix(in srgb, var(--app-border, #2d3a56) 35%, transparent);
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
    color: var(--tb-btn-color, #3d5166);
    cursor: pointer;
    padding: 0;
    transition: color 0.14s, background 0.14s, border-color 0.14s;
    position: relative;

    &:hover:not(.strip-btn--active):not(.strip-btn--disabled):not(.strip-btn--tool-active) {
        color: var(--tb-btn-hover-color, #8ca5bc);
        background: var(--tb-btn-hover-bg, radial-gradient(ellipse 80% 70% at 50% 45%, rgba(255,255,255,0.07) 0%, transparent 100%));
    }

    // Current section (timeline)
    &--active {
        color: var(--app-accent-hover, #818cf8);
        border-left-color: var(--app-accent, #6366f1);
        background: linear-gradient(
            90deg,
            rgba(99, 102, 241, 0.16) 0%,
            rgba(99, 102, 241, 0.04) 100%
        );
    }

    // Tool active (filter on / calendar open)
    &--tool-active {
        color: var(--app-tool-active-color, #86efac);
        border-left-color: var(--app-tool-active-border, #4ade80);
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--app-tool-active-border, #4ade80) 14%, transparent) 0%,
            color-mix(in srgb, var(--app-tool-active-border, #4ade80) 3%, transparent) 100%
        );

        &:hover {
            color: var(--app-tool-active-color, #86efac);
            background: linear-gradient(
                90deg,
                color-mix(in srgb, var(--app-tool-active-border, #4ade80) 22%, transparent) 0%,
                color-mix(in srgb, var(--app-tool-active-border, #4ade80) 6%, transparent) 100%
            );
        }
    }

    // Future features — ghosted
    &--disabled {
        color: var(--tb-btn-color, #3d5166);
        opacity: 0.28;
        cursor: default;
        pointer-events: none;
    }
}

// ── Help / About flyout ───────────────────────────────────────────────────────

.strip-help-wrap {
    position: relative;
}

.help-flyout {
    position: absolute;
    left: 52px;
    bottom: 0;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 7px;
    box-shadow: 0 8px 28px #00000060;
    overflow: hidden;
    z-index: 200;
    white-space: nowrap;
}

.flyout-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 16px;
    background: none;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.82em;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.13s, background 0.13s;

    &:hover {
        color: var(--app-text, #e2e8f0);
        background: #ffffff0e;
    }

    & + & {
        border-top: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 50%, transparent);
    }
}

.help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
}

// flyout transition
.flyout-enter-active, .flyout-leave-active {
    transition: opacity 0.13s ease, transform 0.13s ease;
}
.flyout-enter-from, .flyout-leave-to {
    opacity: 0;
    transform: translateX(-6px);
}
</style>

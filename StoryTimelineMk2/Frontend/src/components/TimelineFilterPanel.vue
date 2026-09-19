<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { PhGear, PhX, PhFloppyDisk, PhFolderOpen, PhTrash } from '@phosphor-icons/vue'
import type { FilterRule, FilterState } from '@/types/models'

// setupOpen: while the filter setup modal is open the chip X removes the rule instead of deactivating it.
const props = withDefaults(defineProps<{ flashedRuleId?: string | null; setupOpen?: boolean }>(), { flashedRuleId: null, setupOpen: false })

function colorFromRule(rule: FilterRule): string {
    try { return (JSON.parse(rule.ParamsJson) as { hex?: string }).hex ?? '#888888' } catch { return '#888888' }
}

const emit = defineEmits<{ openSetup: [] }>()

const store = useTimelineStore()

const showPresetPanel = ref(false)
const newPresetName = ref('')
const savingPreset = ref(false)

const activeRules = computed(() => store.filterRules.filter(r => r.State !== 'neutral'))
const anyActive = computed(() => activeRules.value.length > 0)
const positiveCount = computed(() => store.filterRules.filter(r => r.State === 'positive').length)

const hasMultiplePositives = computed(() => positiveCount.value > 1)

function cycleState(id: string, current: FilterState) {
    const next: FilterState = current === 'neutral' ? 'positive' : current === 'positive' ? 'negative' : 'neutral'
    store.setFilterRuleState(id, next)
}

function removeRule(id: string) {
    store.deleteFilterRule(id)
}

async function onSavePreset() {
    const name = newPresetName.value.trim()
    if (!name) return
    savingPreset.value = true
    await store.saveFilterPreset(name)
    newPresetName.value = ''
    savingPreset.value = false
    showPresetPanel.value = false
}

async function onLoadPreset(presetId: string) {
    await store.loadFilterPreset(presetId)
    showPresetPanel.value = false
}

async function onDeletePreset(id: string) {
    await store.deleteFilterPreset(id)
}

onMounted(() => store.loadFilterPresets())
</script>

<template>
    <div class="filter-panel">
        <div class="filter-panel-inner">

            <!-- Gear: opens setup modal -->
            <button class="fp-icon-btn" title="Filter setup" @click="emit('openSetup')">
                <PhGear :size="15" />
            </button>

            <div class="fp-divider"></div>

            <!-- Chips for every rule -->
            <div v-if="store.filterRules.length === 0" class="fp-empty">
                No filters defined — click <PhGear :size="12" style="display:inline;vertical-align:middle;" /> to add
            </div>

            <template v-for="rule in store.filterRules" :key="rule.Id">
                <div
                    class="filter-chip"
                    :class="{
                        'chip--positive': rule.State === 'positive',
                        'chip--negative': rule.State === 'negative',
                        'chip--flash': rule.Id === props.flashedRuleId,
                    }"
                >
                    <!-- Cycle-state area (click cycles neutral→positive→negative→neutral) -->
                    <div
                        class="chip-body"
                        :title="rule.State === 'neutral' ? 'Click to activate (positive)' : rule.State === 'positive' ? 'Click to negate' : 'Click to deactivate'"
                        @click="cycleState(rule.Id, rule.State)"
                    >
                        <span class="chip-state-dot"></span>
                        <span v-if="rule.Dimension === 'color'" class="chip-color-swatch" :style="{ background: colorFromRule(rule) }"></span>
                        <span class="chip-label">{{ rule.Label }}</span>
                    </div>
                    <!-- X: setup modal open → removes the rule; otherwise only on active chips → back to neutral. Separate from cycle click -->
                    <button
                        v-if="props.setupOpen || rule.State !== 'neutral'"
                        class="chip-remove"
                        :class="{ 'chip-remove--delete': props.setupOpen }"
                        :title="props.setupOpen ? 'Remove filter' : 'Deactivate filter'"
                        @click="props.setupOpen ? removeRule(rule.Id) : store.setFilterRuleState(rule.Id, 'neutral')"
                    >
                        <PhX :size="10" />
                    </button>
                </div>
            </template>

            <!-- AND/OR toggle — only shown when there are multiple positive rules -->
            <template v-if="hasMultiplePositives">
                <div class="fp-divider"></div>
                <button
                    class="and-toggle"
                    :class="{ 'and-on': store.filterAndMode }"
                    :title="store.filterAndMode ? 'AND mode: item must match ALL positive rules — click for OR' : 'OR mode: item must match ANY positive rule — click for AND'"
                    @click="store.setFilterAndMode(!store.filterAndMode)"
                >
                    {{ store.filterAndMode ? 'AND' : 'OR' }}
                </button>
            </template>

            <div class="fp-spacer"></div>

            <!-- Clear all active states -->
            <button
                v-if="anyActive"
                class="fp-icon-btn fp-icon-btn--clear"
                title="Clear all active filters"
                @click="store.clearAllFilters()"
            >
                <PhX :size="13" /> Clear
            </button>

            <!-- Preset save/load -->
            <div class="preset-area">
                <button
                    class="fp-icon-btn"
                    title="Save current filter as preset"
                    @click="showPresetPanel = !showPresetPanel"
                >
                    <PhFloppyDisk :size="14" />
                </button>

                <!-- Preset dropdown -->
                <div v-if="showPresetPanel" class="preset-dropdown">
                    <div class="preset-save-row">
                        <input
                            v-model="newPresetName"
                            class="preset-name-input"
                            placeholder="Preset name…"
                            @keydown.enter="onSavePreset"
                            @keydown.escape="showPresetPanel = false"
                        />
                        <button class="preset-save-btn" :disabled="!newPresetName.trim() || savingPreset" @click="onSavePreset">
                            Save
                        </button>
                    </div>
                    <div v-if="store.filterPresets.length > 0" class="preset-list">
                        <div v-for="p in store.filterPresets" :key="p.Id" class="preset-row">
                            <span class="preset-name" @click="onLoadPreset(p.Id)">
                                <PhFolderOpen :size="12" /> {{ p.Name }}
                            </span>
                            <button class="preset-del-btn" title="Delete preset" @click.stop="onDeletePreset(p.Id)">
                                <PhTrash :size="11" />
                            </button>
                        </div>
                    </div>
                    <p v-else class="preset-empty">No presets saved yet.</p>
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped lang="scss">
.filter-panel {
    flex-shrink: 0;
    background: var(--filter-panel-bg, #111a11);
    border-bottom: 1px solid var(--filter-panel-border, #2a4a2a);
    overflow: visible;
    position: relative;
    z-index: 10;
}

.filter-panel-inner {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 5px 10px;
    min-height: 34px;
}

.fp-divider {
    width: 1px;
    height: 16px;
    background: var(--filter-panel-border, #2a4a2a);
    opacity: 0.7;
    flex-shrink: 0;
}

.fp-spacer { flex: 1 1 auto; }

.fp-empty {
    font-size: 0.72rem;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.7;
    font-style: italic;
}

/* ---- chips ---- */
@keyframes chip-flash {
    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-tool-active-border, #4ade80) 70%, transparent); }
    40%  { box-shadow: 0 0 0 5px color-mix(in srgb, var(--app-tool-active-border, #4ade80) 50%, transparent); }
    100% { box-shadow: 0 0 0 0 transparent; }
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    border-radius: 12px;
    background: transparent;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.73rem;
    user-select: none;
    white-space: nowrap;
    transition: border-color 0.1s;

    &.chip--positive {
        border-color: var(--app-tool-active-border, #4ade80);
        background: color-mix(in srgb, var(--app-tool-active-border, #4ade80) 14%, var(--app-surface, #0c1524));
        color: var(--app-tool-active-color, #86efac);
        .chip-state-dot { background: var(--app-tool-active-border, #4ade80); }
    }

    &.chip--negative {
        border-color: rgba(239, 68, 68, 0.6);
        background: color-mix(in srgb, #ef4444 12%, var(--app-surface, #0c1524));
        color: #f87171;
        .chip-state-dot { background: #ef4444; }
        .chip-label {
            text-decoration: line-through;
            text-decoration-color: rgba(239, 68, 68, 0.5);
        }
    }

    &.chip--flash {
        animation: chip-flash 0.8s ease-out forwards;
    }
}

.chip-body {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 6px 2px 5px;
    border-radius: 12px 0 0 12px;
    cursor: pointer;
    transition: background 0.1s;

    &:hover { background: color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 30%, transparent); }

    .chip-state-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--filter-chip-border, #3a5a3a);
        flex-shrink: 0;
        transition: background 0.1s;
    }

    .chip-color-swatch {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 1px solid var(--filter-chip-border, #3a5a3a);
    }

    .chip-label { line-height: 1.4; }
}

.chip-remove--delete { color: #f87171; opacity: 0.8; }

.chip-remove {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    border-left: 1px solid var(--filter-chip-border, #3a5a3a);
    padding: 2px 5px 2px 4px;
    margin: 0;
    color: inherit;
    cursor: pointer;
    opacity: 0.5;
    border-radius: 0 12px 12px 0;
    transition: opacity 0.1s, background 0.1s, color 0.1s;
    line-height: 1;

    &:hover {
        opacity: 1;
        color: #f87171;
        background: rgba(239, 68, 68, 0.12);
    }
}

/* ---- AND toggle ---- */
.and-toggle {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 1px 7px;
    border-radius: 10px;
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    background: transparent;
    color: var(--filter-chip-color, #7a9a7a);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    &:hover { background: color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 30%, transparent); }
    &.and-on {
        background: color-mix(in srgb, var(--app-tool-active-border, #4ade80) 18%, var(--filter-panel-bg, #111a11));
        border-color: var(--app-tool-active-border, #4ade80);
        color: var(--app-tool-active-color, #86efac);
    }
}

/* ---- icon buttons ---- */
.fp-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 60%, transparent);
    border-radius: 10px;
    background: transparent;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;

    &:hover {
        background: color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 25%, transparent);
        color: var(--filter-chip-color, #7a9a7a);
        filter: brightness(1.2);
    }

    &--clear {
        border-color: rgba(239, 68, 68, 0.3);
        color: #f87171;
        &:hover { background: rgba(239, 68, 68, 0.1); color: #fca5a5; }
    }
}

/* ---- presets ---- */
.preset-area { position: relative; }

.preset-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--filter-panel-bg, #111a11);
    border: 1px solid var(--filter-panel-border, #2a4a2a);
    border-radius: 6px;
    padding: 8px;
    min-width: 200px;
    max-width: 280px;
    z-index: 100;
    box-shadow: 0 4px 12px #00000066;
}

.preset-save-row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
}

.preset-name-input {
    flex: 1;
    background: color-mix(in srgb, var(--filter-panel-border, #2a4a2a) 20%, var(--filter-panel-bg, #111a11));
    border: 1px solid var(--filter-panel-border, #2a4a2a);
    border-radius: 4px;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.75rem;
    padding: 3px 6px;
    outline: none;
    &:focus { border-color: var(--app-tool-active-border, #4ade80); }
}

.preset-save-btn {
    padding: 3px 8px;
    border: 1px solid var(--app-save-accent, #446b40);
    border-radius: 4px;
    background: color-mix(in srgb, var(--app-save-accent, #446b40) 25%, transparent);
    color: var(--app-tool-active-color, #86efac);
    font-size: 0.75rem;
    cursor: pointer;
    &:disabled { opacity: 0.4; cursor: default; }
    &:not(:disabled):hover { background: var(--app-save-accent, #446b40); color: #e8f5e5; }
}

.preset-list { display: flex; flex-direction: column; gap: 2px; }

.preset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 4px;
    padding: 2px 4px;
    &:hover { background: color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 25%, transparent); }
}

.preset-name {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: var(--filter-chip-color, #7a9a7a);
    cursor: pointer;
    flex: 1;
    &:hover { filter: brightness(1.3); }
}

.preset-del-btn {
    background: none;
    border: none;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.6;
    cursor: pointer;
    padding: 1px 3px;
    &:hover { color: #f87171; }
}

.preset-empty {
    font-size: 0.72rem;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.7;
    font-style: italic;
    margin: 0;
}
</style>

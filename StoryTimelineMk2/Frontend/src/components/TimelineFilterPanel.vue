<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { PhGear, PhX, PhFloppyDisk, PhFolderOpen, PhTrash } from '@phosphor-icons/vue'
import type { FilterRule, FilterState } from '@/types/models'

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
                    <!-- Deactivate button — only on active chips, completely separate from cycle click -->
                    <button
                        v-if="rule.State !== 'neutral'"
                        class="chip-remove"
                        title="Deactivate filter"
                        @click="store.setFilterRuleState(rule.Id, 'neutral')"
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
    background: #1a221a99;
    border-bottom: 1px solid #3a4a3a55;
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
    background: #3a4a3a66;
    flex-shrink: 0;
}

.fp-spacer { flex: 1 1 auto; }

.fp-empty {
    font-size: 0.72rem;
    color: #6b7c6b;
    font-style: italic;
}

/* ---- chips ---- */
.filter-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid #4a5c4a;
    border-radius: 12px;
    background: transparent;
    color: #8fa88f;
    font-size: 0.73rem;
    user-select: none;
    white-space: nowrap;
    transition: border-color 0.1s;

    &.chip--positive {
        border-color: #5a9a5a;
        background: #2a5a2a66;
        color: #a8e0a8;
        .chip-state-dot { background: #6aaa6a; }
    }

    &.chip--negative {
        border-color: #9a4a4a;
        background: #5a2a2a66;
        color: #e0a8a8;
        .chip-state-dot { background: #cc6666; }
        .chip-label {
            text-decoration: line-through;
            text-decoration-color: #cc666688;
        }
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

    &:hover { background: rgba(255, 255, 255, 0.06); }

    .chip-state-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #4a5c4a;
        flex-shrink: 0;
        transition: background 0.1s;
    }

    .chip-color-swatch {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .chip-label { line-height: 1.4; }
}

.chip-remove {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
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
        color: #e08080;
        background: rgba(224, 128, 128, 0.12);
    }
}

/* ---- AND toggle ---- */
.and-toggle {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 1px 7px;
    border-radius: 10px;
    border: 1px solid #4a6a4a;
    background: transparent;
    color: #7a9a7a;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    &:hover { background: #3a5a3a55; }
    &.and-on {
        background: #3a6a3a;
        border-color: #6aaa6a;
        color: #d0f0d0;
    }
}

/* ---- icon buttons ---- */
.fp-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border: 1px solid #3a4a3a55;
    border-radius: 10px;
    background: transparent;
    color: #7a8a7a;
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;

    &:hover { background: #2a3a2a55; color: #b0c8b0; }
    &--clear { border-color: #7a4a4a55; color: #b87878; &:hover { background: #7a4a4a33; color: #e09090; } }
}

/* ---- presets ---- */
.preset-area { position: relative; }

.preset-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: #1e2a1e;
    border: 1px solid #3a4a3a88;
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
    background: #0f1a0f;
    border: 1px solid #3a4a3a;
    border-radius: 4px;
    color: #c0d0c0;
    font-size: 0.75rem;
    padding: 3px 6px;
    outline: none;
    &:focus { border-color: #5a8a5a; }
}

.preset-save-btn {
    padding: 3px 8px;
    border: 1px solid #4a7a4a;
    border-radius: 4px;
    background: #2a4a2a;
    color: #a0d0a0;
    font-size: 0.75rem;
    cursor: pointer;
    &:disabled { opacity: 0.4; cursor: default; }
    &:not(:disabled):hover { background: #3a5a3a; }
}

.preset-list { display: flex; flex-direction: column; gap: 2px; }

.preset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 4px;
    padding: 2px 4px;
    &:hover { background: #2a3a2a; }
}

.preset-name {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: #a0c0a0;
    cursor: pointer;
    flex: 1;
    &:hover { color: #c8e0c8; }
}

.preset-del-btn {
    background: none;
    border: none;
    color: #8a6060;
    cursor: pointer;
    padding: 1px 3px;
    &:hover { color: #e09090; }
}

.preset-empty {
    font-size: 0.72rem;
    color: #6b7c6b;
    font-style: italic;
    margin: 0;
}
</style>

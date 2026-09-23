<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import type { ChromeTheme } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { DARK_PRESET, LIGHT_PRESET, applyAppTheme } from '@/utils/useAppTheme'
import { PhX } from '@phosphor-icons/vue'
import { useModal } from '@/utils/modal'

const emit = defineEmits<{ close: [] }>()

const { root, onMousedown, onClick } = useModal(() => emit('close'))

// Color fields shown in the "App Colors" section (key → display label)
const colorFields: Partial<Record<keyof ChromeTheme, string>> = {
    appBg:            'Background',
    appSurface:       'Surface',
    appSurfaceRaised: 'Surface (raised)',
    appSurfaceHigh:   'Surface (high)',
    appBorder:        'Border',
    appText:          'Text',
    appTextMuted:     'Text (muted)',
    appTextDim:       'Text (dim)',
    appAccent:        'Accent',
    appAccentHover:   'Accent (hover)',
    appSaveAccent:      'Save accent',
    appSaveAccentHover: 'Save accent (hover)',
    appToolActiveColor:  'Active tool highlight',
    appToolActiveBorder: 'Active tool border',
}

const filterColorFields: Partial<Record<keyof ChromeTheme, string>> = {
    filterPanelBg:     'Panel background',
    filterPanelBorder: 'Panel border',
    filterChipColor:   'Chip text',
    filterChipBorder:  'Chip border',
}

// Extract a #rrggbb hex from any CSS color string (for rgba fields)
function toPickerHex(color: string): string {
    const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
    if (m) return `#${[m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('')}`
    if (/^#[0-9a-f]{6}/i.test(color)) return color.slice(0, 7)
    return '#000000'
}

const theme = reactive<ChromeTheme>({ ...DARK_PRESET })
const isSaving = ref(false)
const feedback = ref<{ type: 'success' | 'error'; msg: string } | null>(null)

onMounted(async () => {
    const cfg = await BackendAPI.GetAppConfig()
    // Merge saved theme over the preset so new optional fields always have a default
    if (cfg?.chromeTheme) Object.assign(theme, { ...DARK_PRESET, ...cfg.chromeTheme })
})

// Live-preview as values change
watch(theme, (t) => applyAppTheme({ ...t }), { deep: true })

function applyPreset(preset: ChromeTheme) {
    Object.assign(theme, preset)
}

async function save() {
    isSaving.value = true
    feedback.value = null
    const result = await BackendAPI.SaveChromeTheme({ ...theme })
    isSaving.value = false
    if (result?.status === 'ok') {
        feedback.value = { type: 'success', msg: 'Theme saved.' }
        setTimeout(() => { feedback.value = null }, 3000)
    } else {
        feedback.value = { type: 'error', msg: 'Failed to save theme.' }
    }
}

function onColorInput(key: string, e: Event) {
    (theme as Record<string, string>)[key] = (e.target as HTMLInputElement).value
}
</script>

<template>
    <div class="atm-backdrop" ref="root" @mousedown="onMousedown" @click="onClick">
        <div class="atm-panel" role="dialog" aria-modal="true">

            <div class="atm-header">
                <span class="atm-title">App Theme</span>
                <button class="atm-close" @click="emit('close')"><PhX :size="16" /></button>
            </div>

            <div class="atm-body">

                <!-- ── Presets ──────────────────────────────────────────── -->
                <section class="atm-section">
                    <h4 class="atm-section-label">Presets</h4>
                    <div class="preset-row">
                        <button class="preset-btn preset-btn--dark" @click="applyPreset(DARK_PRESET)">
                            <span class="preset-swatches">
                                <span style="background:#060c19"></span>
                                <span style="background:#0f172a"></span>
                                <span style="background:#6366f1"></span>
                            </span>
                            Dark (default)
                        </button>
                        <button class="preset-btn preset-btn--light" @click="applyPreset(LIGHT_PRESET)">
                            <span class="preset-swatches">
                                <span style="background:#f1f5f9"></span>
                                <span style="background:#ffffff"></span>
                                <span style="background:#6366f1"></span>
                            </span>
                            Light (default)
                        </button>
                    </div>
                </section>

                <!-- ── Title Bar ────────────────────────────────────────── -->
                <section class="atm-section">
                    <h4 class="atm-section-label">Title Bar</h4>

                    <div class="field-grid">
                        <div class="color-row">
                            <label>Background</label>
                            <div class="dual-pick">
                                <div class="color-pick-wrap">
                                    <div class="color-swatch" :style="{ background: theme.tbBgFrom }">
                                        <input type="color" :value="theme.tbBgFrom" @input="onColorInput('tbBgFrom', $event)" />
                                    </div>
                                    <input class="color-text" type="text" v-model="theme.tbBgFrom" />
                                </div>
                                <span class="dual-arrow">→</span>
                                <div class="color-pick-wrap">
                                    <div class="color-swatch" :style="{ background: theme.tbBgTo }">
                                        <input type="color" :value="theme.tbBgTo" @input="onColorInput('tbBgTo', $event)" />
                                    </div>
                                    <input class="color-text" type="text" v-model="theme.tbBgTo" />
                                </div>
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Border</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: toPickerHex(theme.tbBorderColor) }">
                                    <input type="color" :value="toPickerHex(theme.tbBorderColor)" @input="onColorInput('tbBorderColor', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbBorderColor" placeholder="rgba(…)" />
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Title text</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme.tbText }">
                                    <input type="color" :value="theme.tbText" @input="onColorInput('tbText', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbText" />
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Subtitle text</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme.tbSub }">
                                    <input type="color" :value="theme.tbSub" @input="onColorInput('tbSub', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbSub" />
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Orb gradient</label>
                            <div class="dual-pick">
                                <div class="color-pick-wrap">
                                    <div class="color-swatch" :style="{ background: theme.tbOrb1 }">
                                        <input type="color" :value="theme.tbOrb1" @input="onColorInput('tbOrb1', $event)" />
                                    </div>
                                    <input class="color-text" type="text" v-model="theme.tbOrb1" />
                                </div>
                                <span class="dual-arrow">→</span>
                                <div class="color-pick-wrap">
                                    <div class="color-swatch" :style="{ background: theme.tbOrb2 }">
                                        <input type="color" :value="theme.tbOrb2" @input="onColorInput('tbOrb2', $event)" />
                                    </div>
                                    <input class="color-text" type="text" v-model="theme.tbOrb2" />
                                </div>
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Button icons</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme.tbBtnColor }">
                                    <input type="color" :value="theme.tbBtnColor" @input="onColorInput('tbBtnColor', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbBtnColor" />
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Button hover icon</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme.tbBtnHoverColor }">
                                    <input type="color" :value="theme.tbBtnHoverColor" @input="onColorInput('tbBtnHoverColor', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbBtnHoverColor" />
                            </div>
                        </div>

                        <div class="color-row">
                            <label>Button hover bg</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: toPickerHex(theme.tbBtnHoverBg) }">
                                    <input type="color" :value="toPickerHex(theme.tbBtnHoverBg)" @input="onColorInput('tbBtnHoverBg', $event)" />
                                </div>
                                <input class="color-text" type="text" v-model="theme.tbBtnHoverBg" placeholder="rgba(…)" />
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── App Colors ───────────────────────────────────────── -->
                <section class="atm-section">
                    <h4 class="atm-section-label">App Colors</h4>

                    <div class="field-grid">
                        <div v-for="(label, key) in colorFields" :key="key" class="color-row">
                            <label>{{ label }}</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme[key] as string }">
                                    <input type="color" :value="theme[key] as string" @input="onColorInput(key, $event)" />
                                </div>
                                <input class="color-text" type="text" :value="theme[key] as string"
                                    @input="e => (theme as any)[key] = (e.target as HTMLInputElement).value" />
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── Filter Panel ────────────────────────────────────── -->
                <section class="atm-section">
                    <h4 class="atm-section-label">Filter Panel</h4>

                    <div class="field-grid">
                        <div v-for="(label, key) in filterColorFields" :key="key" class="color-row">
                            <label>{{ label }}</label>
                            <div class="color-pick-wrap">
                                <div class="color-swatch" :style="{ background: theme[key] as string }">
                                    <input type="color" :value="theme[key] as string" @input="onColorInput(key, $event)" />
                                </div>
                                <input class="color-text" type="text" :value="theme[key] as string"
                                    @input="e => (theme as any)[key] = (e.target as HTMLInputElement).value" />
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── Sizes ────────────────────────────────────────────── -->
                <section class="atm-section">
                    <h4 class="atm-section-label">Sizes</h4>

                    <div class="field-grid field-grid--sizes">
                        <div class="size-row">
                            <label>Border radius</label>
                            <input class="size-input" type="text" v-model="theme.appRadius" placeholder="8px" />
                        </div>
                        <div class="size-row">
                            <label>Radius (small)</label>
                            <input class="size-input" type="text" v-model="theme.appRadiusSm" placeholder="4px" />
                        </div>
                        <div class="size-row">
                            <label>Radius (large)</label>
                            <input class="size-input" type="text" v-model="theme.appRadiusLg" placeholder="12px" />
                        </div>
                    </div>
                </section>

                <!-- ── Feedback ─────────────────────────────────────────── -->
                <div v-if="feedback" class="atm-feedback" :class="`atm-feedback--${feedback.type}`">
                    {{ feedback.msg }}
                </div>

            </div>

            <div class="atm-footer">
                <button class="atm-btn atm-btn--cancel" @click="emit('close')">Cancel</button>
                <button class="atm-btn atm-btn--save" :disabled="isSaving" @click="save">
                    {{ isSaving ? 'Saving…' : 'Save theme' }}
                </button>
            </div>

        </div>
    </div>
</template>

<style scoped lang="scss">
.atm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-lightbox);
    padding: 20px;
}

.atm-panel {
    width: min(640px, 100%);
    max-height: 88vh;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius, 8px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
}

// ── Header ──────────────────────────────────────────────────────────────────

.atm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--app-surface-high, #1e2b44);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}

.atm-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
}

.atm-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;

    &:hover {
        color: var(--app-text, #e2e8f0);
        background: rgba(255, 255, 255, 0.08);
    }
}

// ── Body ────────────────────────────────────────────────────────────────────

.atm-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    &::-webkit-scrollbar { width: 5px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--app-border, #2d3a56); border-radius: 3px; }
}

.atm-section {
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.atm-section-label {
    margin: 0 0 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--app-text-dim, #4a6080);
}

// ── Presets ─────────────────────────────────────────────────────────────────

.preset-row {
    display: flex;
    gap: 10px;
}

.preset-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface-raised, #141e33);
    color: var(--app-text-muted, #94a3b8);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;

    &:hover {
        border-color: var(--app-accent, #6366f1);
        color: var(--app-text, #e2e8f0);
    }
}

.preset-swatches {
    display: flex;
    gap: 3px;
    flex-shrink: 0;

    span {
        display: block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
    }
}

// ── Color rows ──────────────────────────────────────────────────────────────

.field-grid {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.color-row {
    display: flex;
    align-items: center;
    gap: 10px;

    label {
        width: 120px;
        flex-shrink: 0;
        font-size: 12px;
        color: var(--app-text-muted, #94a3b8);
    }
}

.dual-pick {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
}

.dual-arrow {
    font-size: 11px;
    color: var(--app-text-dim, #4a6080);
    flex-shrink: 0;
}

.color-pick-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
}

.color-swatch {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
    cursor: pointer;
    overflow: hidden;

    input[type="color"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        padding: 0;
        border: none;
    }

    &:hover {
        border-color: var(--app-accent, #6366f1);
    }
}

.color-text {
    flex: 1;
    min-width: 0;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 3px;
    color: var(--app-text, #e2e8f0);
    font-size: 11px;
    font-family: monospace;
    padding: 4px 7px;
    outline: none;
    transition: border-color 0.13s;

    &:focus { border-color: var(--app-accent, #6366f1); }

    &--wide { flex: 1; }
}

// ── Sizes ───────────────────────────────────────────────────────────────────

.field-grid--sizes {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 10px;
}

.size-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 100px;

    label {
        font-size: 11px;
        color: var(--app-text-muted, #94a3b8);
    }
}

.size-input {
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 3px;
    color: var(--app-text, #e2e8f0);
    font-size: 12px;
    font-family: monospace;
    padding: 5px 8px;
    outline: none;
    transition: border-color 0.13s;
    width: 100%;
    box-sizing: border-box;

    &:focus { border-color: var(--app-accent, #6366f1); }
}

// ── Feedback ────────────────────────────────────────────────────────────────

.atm-feedback {
    padding: 8px 12px;
    border-radius: var(--app-radius-sm, 4px);
    font-size: 12px;

    &--success { background: #1a3326; color: #6fcf97; border: 1px solid #2d6b4a; }
    &--error   { background: #3a1a1a; color: #f87171; border: 1px solid #6b2d2d; }
}

// ── Footer ──────────────────────────────────────────────────────────────────

.atm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    background: var(--app-surface-high, #1e2b44);
    border-top: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}

.atm-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-radius: var(--app-radius-sm, 4px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:disabled { opacity: 0.45; cursor: not-allowed; }

    &--cancel {
        background: transparent;
        border: 1px solid var(--app-border, #2d3a56);
        color: var(--app-text-muted, #94a3b8);
        &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); color: var(--app-text, #e2e8f0); }
    }

    &--save {
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.4);
        color: var(--app-accent-hover, #818cf8);
        &:hover:not(:disabled) { background: rgba(99, 102, 241, 0.25); border-color: rgba(99, 102, 241, 0.6); color: #a5b4fc; }
    }
}
</style>

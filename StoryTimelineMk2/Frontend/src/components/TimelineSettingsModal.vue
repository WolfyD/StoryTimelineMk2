<script setup lang="ts">
import { reactive, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { PhX, PhPlus } from '@phosphor-icons/vue'
import type { TimelineSettings, LayoutSettings } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import FontPicker from './FontPicker.vue'

const props = defineProps<{
    settings?: TimelineSettings
    layoutSettings?: LayoutSettings
}>()

const emit = defineEmits<{ close: [] }>()
const store = useTimelineStore()

// --- per-timeline settings ---
const local = reactive({
    Font: props.settings?.Font ?? 'Arial',
    FontSizeScale: props.settings?.FontSizeScale ?? 1.0,
    PixelsPerSubtick: props.settings?.PixelsPerSubtick ?? 20,
    ShowGuides: props.settings?.ShowGuides ?? true,
    DisplayRadius: props.settings?.DisplayRadius ?? 10,
    IsFullscreen: props.settings?.IsFullscreen ?? false,
    UseCustomScaling: props.settings?.UseCustomScaling ?? false,
    CustomScale: props.settings?.CustomScale ?? 1.0,
    selectedLayoutId: props.layoutSettings?.Id ?? 'ls_default',
})

// --- layout preset reactive mirror ---
function initLayout(ls: LayoutSettings | null | undefined): LayoutSettings {
    const d = ls ?? ({} as LayoutSettings)
    return {
        Id: d.Id ?? 'ls_default',
        Name: d.Name ?? 'Default',
        TimelineEventBoxWidth: d.TimelineEventBoxWidth ?? 200,
        TimelineEventBoxHeight: d.TimelineEventBoxHeight ?? 60,
        TimelineEventBoxStemOffset: d.TimelineEventBoxStemOffset ?? 10,
        TimelineEventBorderColor: d.TimelineEventBorderColor ?? '#2d3a56',
        TimelineEventBorderWidth: d.TimelineEventBorderWidth ?? 1,
        TimelineEventBorderRadius: d.TimelineEventBorderRadius ?? 5,
        TimelineEventPadding: d.TimelineEventPadding ?? '[]',
        TimelineEventYMargin: d.TimelineEventYMargin ?? 10,
        TimelineEventTextColor: d.TimelineEventTextColor ?? '#e2e8f0',
        TimelineEventBackgroundColor: d.TimelineEventBackgroundColor ?? '#141e33',
        TimelineEventFontFamily: d.TimelineEventFontFamily ?? 'Arial',
        TimelineEventFontSize: d.TimelineEventFontSize ?? 12,
        TimelineEventTextUseEllipsis: d.TimelineEventTextUseEllipsis ?? true,
        TimelineEventBoxShowColor: d.TimelineEventBoxShowColor ?? true,
        TimelineEventBoxShowColorOnBottom: d.TimelineEventBoxShowColorOnBottom ?? false,
        TimelineEventHasHoverHighlight: d.TimelineEventHasHoverHighlight ?? false,
        TimelineEventHoverColor: d.TimelineEventHoverColor ?? '#3b6ec4',
        TimelineAgeHeight: d.TimelineAgeHeight ?? 30,
        TimelineAgeCornerRounding: d.TimelineAgeCornerRounding ?? 5,
        TimelinePeriodHeight: d.TimelinePeriodHeight ?? 15,
        TimelinePeriodCornerRounding: d.TimelinePeriodCornerRounding ?? 3,
        TimelinePeriodYMargin: d.TimelinePeriodYMargin ?? 5,
        TimelinePeriodYOffset: d.TimelinePeriodYOffset ?? 0,
        TimelineBoxTypesShowAsBox: d.TimelineBoxTypesShowAsBox ?? false,
        TimelineBoxTypesBoxWidth: d.TimelineBoxTypesBoxWidth ?? 80,
        TimelineBoxTypesShowImage: d.TimelineBoxTypesShowImage ?? true,
        TimelineCanvasBackgroundColor: d.TimelineCanvasBackgroundColor ?? '#0f172a',
        TimelineShowNowLine: d.TimelineShowNowLine ?? true,
        TimelineShowNowLineText: d.TimelineShowNowLineText ?? true,
        TimelineNowLineColor: d.TimelineNowLineColor ?? '#ef4444',
        TimelineNowLineStyle: d.TimelineNowLineStyle ?? 'dashed',
        TimelineTickDistance: d.TimelineTickDistance ?? 50,
        TimelineTickWidth: d.TimelineTickWidth ?? 1,
        TimelineNonYearTicksSmaller: d.TimelineNonYearTicksSmaller ?? true,
        TimelineTickMarkerFontFamily: d.TimelineTickMarkerFontFamily ?? 'Arial',
        TimelineTickMarkerFontStyle: d.TimelineTickMarkerFontStyle ?? 'normal',
        TimelineTickMarkerTextColor: d.TimelineTickMarkerTextColor ?? '#94a3b8',
        TimelineTickMarkerFontSize: d.TimelineTickMarkerFontSize ?? 12,
        TimelineTickMarkerTextAlwaysOnTop: d.TimelineTickMarkerTextAlwaysOnTop ?? false,
        TimelineShowHoverLine: d.TimelineShowHoverLine ?? true,
        TimelineHoverLineColor: d.TimelineHoverLineColor ?? '#3b6ec4',
        TimelineHoverLineStyle: d.TimelineHoverLineStyle ?? 'dashed',
        TimelineHoverLineWidth: d.TimelineHoverLineWidth ?? 1,
        TimelineEdgeMarginWidth: d.TimelineEdgeMarginWidth ?? 30,
        TimelineDataRangeWidth: d.TimelineDataRangeWidth ?? 100,
        TimelineIsDataRangeVisible: d.TimelineIsDataRangeVisible ?? true,
        TimelineDataRangeColor: d.TimelineDataRangeColor ?? '#3b6ec4',
        TimelineAnimateOnJumpToYear: d.TimelineAnimateOnJumpToYear ?? true,
        TimelineJumpToYearAnimationLength: d.TimelineJumpToYearAnimationLength ?? 600,
        TimelineAnimateLodChange: d.TimelineAnimateLodChange ?? true,
        TimelineLodChangeAnimationLength: d.TimelineLodChangeAnimationLength ?? 300,
    }
}

const localLayout = reactive<LayoutSettings>(initLayout(props.layoutSettings))

const layoutPresets = ref<{ Id: string; Name: string }[]>([])
const systemFonts = ref<string[]>([])
const isSaving = ref(false)
const saveError = ref('')
const showNewPreset = ref(false)
const newPresetName = ref('')

// --- search ---
const searchQuery  = ref('')
const modalBodyRef = ref<HTMLElement | null>(null)

watch(searchQuery, (q) => {
    const body = modalBodyRef.value
    if (!body) return

    body.querySelectorAll('.search-hl').forEach(el => el.classList.remove('search-hl'))
    if (!q.trim()) return

    const lower = q.trim().toLowerCase()
    let firstMatch: Element | null = null

    body.querySelectorAll<HTMLElement>('.section-title').forEach(el => {
        if (el.textContent?.toLowerCase().includes(lower)) {
            el.classList.add('search-hl')
            if (!firstMatch) firstMatch = el
        }
    })

    body.querySelectorAll<HTMLElement>('.s-label').forEach(el => {
        if (el.textContent?.toLowerCase().includes(lower)) {
            el.classList.add('search-hl')
            if (!firstMatch) firstMatch = el
        }
    })

    firstMatch?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

// --- data range color with alpha support ---
function parseHexAlpha(hex: string): { rgb: string; alpha: number } {
    if (!hex) return { rgb: '#3b6ec4', alpha: 30 };
    const h = hex.replace('#', '');
    if (h.length === 4) {
        // #RGBA short form
        const r = h[0] + h[0], g = h[1] + h[1], b = h[2] + h[2], a = h[3] + h[3];
        return { rgb: `#${r}${g}${b}`, alpha: Math.round(parseInt(a, 16) / 255 * 100) };
    }
    if (h.length === 8) {
        // #RRGGBBAA
        return { rgb: `#${h.slice(0, 6)}`, alpha: Math.round(parseInt(h.slice(6, 8), 16) / 255 * 100) };
    }
    if (h.length === 6) return { rgb: `#${h}`, alpha: 100 };
    if (h.length === 3) {
        const r = h[0] + h[0], g = h[1] + h[1], b = h[2] + h[2];
        return { rgb: `#${r}${g}${b}`, alpha: 100 };
    }
    return { rgb: '#3b6ec4', alpha: 30 };
}

function buildHexAlpha(rgb: string, alphaPct: number): string {
    const a = Math.round((alphaPct / 100) * 255).toString(16).padStart(2, '0');
    return rgb + a;
}

const _initDRC = parseHexAlpha(localLayout.TimelineDataRangeColor);
const dataRangeRGB   = ref(_initDRC.rgb);
const dataRangeAlpha = ref(_initDRC.alpha);

watch([dataRangeRGB, dataRangeAlpha], ([rgb, alpha]) => {
    localLayout.TimelineDataRangeColor = buildHexAlpha(rgb, alpha);
});

onMounted(async () => {
    const [presets, fonts] = await Promise.all([
        BackendAPI.GetLayoutSettingsList(),
        BackendAPI.GetSystemFonts(),
    ])
    if (presets) layoutPresets.value = presets
    if (fonts) systemFonts.value = fonts
    window.addEventListener('keydown', onEscKey)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onEscKey)
})

function onEscKey(e: KeyboardEvent) {
    if (e.key === 'Escape') emit('close')
}

watch(() => local.selectedLayoutId, async (newId) => {
    const ls = await BackendAPI.GetLayoutSettingsById(newId)
    if (ls) Object.assign(localLayout, ls)
})

async function createPreset() {
    if (!newPresetName.value.trim()) return
    const result = await BackendAPI.CreateLayoutPreset(newPresetName.value.trim(), local.selectedLayoutId)
    if (result?.status === 'ok' && result.preset) {
        layoutPresets.value.push(result.preset)
        local.selectedLayoutId = result.preset.Id
        if (result.layoutSettings) Object.assign(localLayout, result.layoutSettings)
        showNewPreset.value = false
        newPresetName.value = ''
    }
}

async function save() {
    isSaving.value = true
    saveError.value = ''

    localLayout.Id = local.selectedLayoutId

    const [settingsResult, lsResult] = await Promise.all([
        BackendAPI.SaveSettings({
            timelineId: store.currentProject!.Id,
            font: local.Font,
            fontSizeScale: local.FontSizeScale,
            pixelsPerSubtick: local.PixelsPerSubtick,
            showGuides: local.ShowGuides,
            displayRadius: local.DisplayRadius,
            isFullscreen: local.IsFullscreen,
            useCustomScaling: local.UseCustomScaling,
            customScale: local.CustomScale,
            layoutPresetId: local.selectedLayoutId,
        }),
        BackendAPI.SaveLayoutSettings(localLayout),
    ])

    if (settingsResult?.status === 'ok' && lsResult?.status === 'ok') {
        if (store.settings) {
            store.settings.Font = local.Font
            store.settings.FontSizeScale = local.FontSizeScale
            store.settings.PixelsPerSubtick = local.PixelsPerSubtick
            store.settings.ShowGuides = local.ShowGuides
            store.settings.DisplayRadius = local.DisplayRadius
            store.settings.IsFullscreen = local.IsFullscreen
            store.settings.UseCustomScaling = local.UseCustomScaling
            store.settings.CustomScale = local.CustomScale
        }
        if (lsResult.layoutSettings) store.setLayoutSettings(lsResult.layoutSettings)
        emit('close')
    } else {
        saveError.value = 'Save failed. Please try again.'
    }

    isSaving.value = false
}
</script>

<template>
    <div class="modal-backdrop">
        <div class="modal-panel">

            <div class="modal-header">
                <span class="modal-title">Settings</span>
                <button class="close-btn" @click="emit('close')"><PhX :size="18" /></button>
            </div>

            <div class="search-bar">
                <input
                    class="search-input"
                    type="text"
                    v-model="searchQuery"
                    placeholder="Search settings…"
                    autocomplete="off"
                    spellcheck="false"
                />
            </div>

            <div class="modal-body" ref="modalBodyRef">

                <!-- GENERAL -->
                <div class="section-title">General</div>
                <div class="settings-grid">
                    <span class="s-label">Font</span>
                    <FontPicker v-model="local.Font" :fonts="systemFonts" />

                    <span class="s-label">Font Size Scale</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.FontSizeScale" :step="0.1" min="0.5" max="3" />

                    <span class="s-label">Pixels per Subtick</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PixelsPerSubtick" :step="1" min="5" max="200" />

                    <span class="s-label">Display Radius</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.DisplayRadius" :step="1" min="1" max="100" />

                    <span class="s-label">Show Guides</span>
                    <button class="toggle" :class="{ 'is-on': local.ShowGuides }" type="button" @click="local.ShowGuides = !local.ShowGuides">
                        <span class="toggle-thumb" />
                    </button>
                </div>

                <!-- LAYOUT PRESET -->
                <div class="section-title">Layout Preset</div>
                <div class="settings-grid">
                    <span class="s-label">Active Preset</span>
                    <div class="preset-row">
                        <select class="s-input" v-model="local.selectedLayoutId">
                            <option v-if="layoutPresets.length === 0" :value="local.selectedLayoutId">
                                {{ layoutSettings?.Name ?? 'Loading…' }}
                            </option>
                            <option v-for="p in layoutPresets" :key="p.Id" :value="p.Id">{{ p.Name }}</option>
                        </select>
                        <button class="icon-btn" type="button" title="New preset" @click="showNewPreset = !showNewPreset">
                            <PhPlus :size="14" />
                        </button>
                    </div>

                    <template v-if="showNewPreset">
                        <span class="s-label">New Preset Name</span>
                        <div class="preset-row">
                            <input class="s-input" type="text" v-model="newPresetName" placeholder="My preset…" @keydown.enter="createPreset" @keydown.escape="showNewPreset = false" />
                            <button class="icon-btn icon-btn--ok" type="button" @click="createPreset">Create</button>
                        </div>
                    </template>
                </div>

                <!-- EVENT BOXES -->
                <div class="section-title">Event Boxes</div>
                <div class="settings-grid">
                    <span class="s-label">Box Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxWidth" :step="10" min="50" />

                    <span class="s-label">Box Height</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxHeight" :step="5" min="20" />

                    <span class="s-label">Stem Offset</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxStemOffset" :step="1" />

                    <span class="s-label">Border Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventBorderColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventBorderColor }}</span>
                    </div>

                    <span class="s-label">Border Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderWidth" :step="1" min="0" />

                    <span class="s-label">Border Radius</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderRadius" :step="1" min="0" />

                    <span class="s-label">Y Margin</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventYMargin" :step="1" min="0" />

                    <span class="s-label">Text Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventTextColor }}</span>
                    </div>

                    <span class="s-label">Background Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Font Family</span>
                    <FontPicker v-model="localLayout.TimelineEventFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Size</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Use Text Ellipsis</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventTextUseEllipsis }" type="button" @click="localLayout.TimelineEventTextUseEllipsis = !localLayout.TimelineEventTextUseEllipsis">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Item Color</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColor }" type="button" @click="localLayout.TimelineEventBoxShowColor = !localLayout.TimelineEventBoxShowColor">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color on Bottom</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColorOnBottom }" type="button" @click="localLayout.TimelineEventBoxShowColorOnBottom = !localLayout.TimelineEventBoxShowColorOnBottom">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Hover Highlight</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventHasHoverHighlight }" type="button" @click="localLayout.TimelineEventHasHoverHighlight = !localLayout.TimelineEventHasHoverHighlight">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Hover Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventHoverColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventHoverColor }}</span>
                    </div>
                </div>

                <!-- PERIODS & AGES -->
                <div class="section-title">Periods &amp; Ages</div>
                <div class="settings-grid">
                    <span class="s-label">Age Height</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeHeight" :step="5" min="10" />

                    <span class="s-label">Age Corner Rounding</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Height</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodHeight" :step="2" min="4" />

                    <span class="s-label">Period Corner Rounding</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Y Margin</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYMargin" :step="1" />

                    <span class="s-label">Period Y Offset</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYOffset" :step="1" />
                </div>

                <!-- TIMELINE -->
                <div class="section-title">Timeline</div>
                <div class="settings-grid">
                    <span class="s-label">Canvas Background</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineCanvasBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineCanvasBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Tick Distance</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickDistance" :step="5" min="10" />

                    <span class="s-label">Tick Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickWidth" :step="0.5" min="0.5" />

                    <span class="s-label">Smaller Non-Year Ticks</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineNonYearTicksSmaller }" type="button" @click="localLayout.TimelineNonYearTicksSmaller = !localLayout.TimelineNonYearTicksSmaller">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Edge Margin Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEdgeMarginWidth" :step="5" min="0" />
                </div>

                <!-- TICK MARKERS -->
                <div class="section-title">Tick Markers</div>
                <div class="settings-grid">
                    <span class="s-label">Font Family</span>
                    <FontPicker v-model="localLayout.TimelineTickMarkerFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Style</span>
                    <input class="s-input" type="text" v-model="localLayout.TimelineTickMarkerFontStyle" placeholder="normal" />

                    <span class="s-label">Font Size</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickMarkerFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Text Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineTickMarkerTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineTickMarkerTextColor }}</span>
                    </div>

                    <span class="s-label">Always On Top</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineTickMarkerTextAlwaysOnTop }" type="button" @click="localLayout.TimelineTickMarkerTextAlwaysOnTop = !localLayout.TimelineTickMarkerTextAlwaysOnTop">
                        <span class="toggle-thumb" />
                    </button>
                </div>

                <!-- NOW LINE -->
                <div class="section-title">Now Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Now Line</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLine }" type="button" @click="localLayout.TimelineShowNowLine = !localLayout.TimelineShowNowLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Text</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLineText }" type="button" @click="localLayout.TimelineShowNowLineText = !localLayout.TimelineShowNowLineText">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineNowLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineNowLineColor }}</span>
                    </div>

                    <span class="s-label">Style</span>
                    <select class="s-input" v-model="localLayout.TimelineNowLineStyle">
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                    </select>
                </div>

                <!-- HOVER LINE -->
                <div class="section-title">Hover Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Hover Line</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowHoverLine }" type="button" @click="localLayout.TimelineShowHoverLine = !localLayout.TimelineShowHoverLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineHoverLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineHoverLineColor }}</span>
                    </div>

                    <span class="s-label">Style</span>
                    <input class="s-input" type="text" v-model="localLayout.TimelineHoverLineStyle" placeholder="dashed" />

                    <span class="s-label">Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineHoverLineWidth" :step="0.5" min="0.5" />
                </div>

                <!-- DATA RANGE -->
                <div class="section-title">Data Range</div>
                <div class="settings-grid">
                    <span class="s-label">Visible</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineIsDataRangeVisible }" type="button" @click="localLayout.TimelineIsDataRangeVisible = !localLayout.TimelineIsDataRangeVisible">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Width</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineDataRangeWidth" :step="10" min="20" />

                    <span class="s-label">Color</span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="dataRangeRGB" />
                        <span class="color-hex">{{ localLayout.TimelineDataRangeColor }}</span>
                    </div>

                    <span class="s-label">Opacity</span>
                    <div class="color-row alpha-row">
                        <input type="range" class="s-range" min="0" max="100" step="1" v-model.number="dataRangeAlpha" />
                        <span class="color-hex">{{ dataRangeAlpha }}%</span>
                    </div>
                </div>

                <!-- ANIMATIONS -->
                <div class="section-title">Animations</div>
                <div class="settings-grid">
                    <span class="s-label">Animate Jump to Year</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineAnimateOnJumpToYear }" type="button" @click="localLayout.TimelineAnimateOnJumpToYear = !localLayout.TimelineAnimateOnJumpToYear">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Jump Duration (ms)</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineJumpToYearAnimationLength" :step="50" min="0" />

                    <span class="s-label">Animate LOD Change</span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineAnimateLodChange }" type="button" @click="localLayout.TimelineAnimateLodChange = !localLayout.TimelineAnimateLodChange">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">LOD Duration (ms)</span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineLodChangeAnimationLength" :step="50" min="0" />
                </div>

                <!-- WINDOW -->
                <div class="section-title">Window</div>
                <div class="settings-grid">
                    <span class="s-label">Fullscreen</span>
                    <button class="toggle" :class="{ 'is-on': local.IsFullscreen }" type="button" @click="local.IsFullscreen = !local.IsFullscreen">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Custom Scaling</span>
                    <button class="toggle" :class="{ 'is-on': local.UseCustomScaling }" type="button" @click="local.UseCustomScaling = !local.UseCustomScaling">
                        <span class="toggle-thumb" />
                    </button>

                    <template v-if="local.UseCustomScaling">
                        <span class="s-label">Scale Factor</span>
                        <input class="s-input s-input--narrow" type="number" v-model.number="local.CustomScale" :step="0.1" min="0.5" max="4" />
                    </template>
                </div>

                <p v-if="saveError" class="error-msg">{{ saveError }}</p>

            </div>

            <div class="modal-footer">
                <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
                <button class="btn btn-save" :disabled="isSaving" @click="save">
                    {{ isSaving ? 'Saving…' : 'Save Changes' }}
                </button>
            </div>

        </div>
    </div>
</template>

<style scoped lang="scss">
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-panel {
    display: flex;
    flex-direction: column;
    background: #141e33;
    border: 1px solid #2d3a56;
    border-radius: 8px;
    width: min(560px, 92vw);
    max-height: 82vh;
    box-shadow: 0 24px 48px #00000066;
    overflow: hidden;
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: #1e2b44;
    border-bottom: 1px solid #2d3a56;
    flex-shrink: 0;
}

.modal-title {
    font-size: 15px;
    font-weight: 600;
    color: #e2e8f0;
    letter-spacing: 0.02em;
}

.close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;

    &:hover {
        color: #e2e8f0;
        background: #ffffff12;
    }
}

.search-bar {
    padding: 8px 20px;
    background: #1a2438;
    border-bottom: 1px solid #2d3a56;
    flex-shrink: 0;
}

.search-input {
    width: 100%;
    box-sizing: border-box;
    background: #0c1524;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    color: #e2e8f0;
    font-size: 13px;
    padding: 5px 10px;
    outline: none;
    transition: border-color 0.15s;

    &:focus { border-color: #3b6ec4; }
    &::placeholder { color: #4a5568; }
}

.modal-body {
    overflow-y: auto;
    padding: 12px 20px 20px;
    flex: 1;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: #2d3a56; border-radius: 3px; }
}

.section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 20px 0 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #4a6080;

    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #1e2b44;
    }

    &:first-child {
        margin-top: 6px;
    }

    &.search-hl {
        color: #60a5fa;
        &::after { background: #2563eb; }
    }
}

.s-label.search-hl {
    color: #bfdbfe;
    background: #172554;
    border-radius: 3px;
    padding-left: 8px;
}

.settings-grid {
    display: grid;
    grid-template-columns: 190px 1fr;
    row-gap: 2px;
    align-items: center;
}

.s-label {
    font-size: 13px;
    color: #94a3b8;
    padding: 5px 12px 5px 0;
    line-height: 1.4;
}

.s-input {
    background: #0c1524;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    color: #e2e8f0;
    font-size: 13px;
    padding: 4px 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &:focus {
        border-color: #3b6ec4;
    }

    &.s-input--narrow {
        width: 90px;
    }
}

select.s-input {
    cursor: pointer;
    appearance: auto;
}

.toggle {
    position: relative;
    width: 38px;
    height: 20px;
    border-radius: 10px;
    background: #2d3a56;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.2s;

    &.is-on {
        background: #3b6ec4;
    }

    .toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
        pointer-events: none;
    }

    &.is-on .toggle-thumb {
        transform: translateX(18px);
    }
}

.color-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.s-color {
    width: 36px;
    height: 28px;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    background: #0c1524;
    cursor: pointer;
    padding: 2px;
}

.color-hex {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
}

.s-range {
    flex: 1;
    accent-color: #3b6ec4;
    cursor: pointer;
}

.preset-row {
    display: flex;
    gap: 6px;
    align-items: center;

    .s-input { flex: 1; }
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    background: #1e2b44;
    border: 1px solid #2d3a56;
    border-radius: 4px;
    color: #94a3b8;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
        background: #2a3a5a;
        color: #e2e8f0;
    }

    &.icon-btn--ok {
        width: auto;
        padding: 0 10px;
        font-size: 12px;
        color: #86efac;
        border-color: #446b40;

        &:hover {
            background: #446b40;
            color: #e8f5e5;
        }
    }
}

.error-msg {
    margin: 12px 0 0;
    font-size: 12px;
    color: #f87171;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    background: #1e2b44;
    border-top: 1px solid #2d3a56;
    flex-shrink: 0;
}

.btn {
    font-size: 13px;
    font-weight: 500;
    padding: 6px 16px;
    border-radius: 5px;
    cursor: pointer;
    border: none;
    transition: background 0.15s, opacity 0.15s;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.btn-cancel {
    background: transparent;
    color: #94a3b8;
    border: 1px solid #2d3a56;

    &:hover {
        background: #ffffff0e;
        color: #e2e8f0;
    }
}

.btn-save {
    background: #446b40;
    color: #e8f5e5;

    &:hover:not(:disabled) {
        background: #52804c;
    }
}


.icon-btn--danger {
    background: transparent;
    border: 1px solid #4a2020;
    color: #f87171;

    &:hover {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
    }
}
</style>

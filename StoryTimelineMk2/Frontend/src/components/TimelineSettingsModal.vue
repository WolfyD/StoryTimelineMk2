<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { PhPlus } from '@phosphor-icons/vue'
import type { TimelineSettings, LayoutSettings } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import FontPicker from './FontPicker.vue'
import BaseModal from './BaseModal.vue'
import SettingHint from './SettingHint.vue'

const props = defineProps<{
    settings?: TimelineSettings
    layoutSettings?: LayoutSettings
}>()

const emit = defineEmits<{ close: [] }>()
const store = useTimelineStore()

// --- per-timeline settings ---
const local = reactive({
    PixelsPerSubtick: props.settings?.PixelsPerSubtick ?? 20,
    ShowGuides: props.settings?.ShowGuides ?? true,
    DisplayRadius: props.settings?.DisplayRadius ?? 10,
    IsFullscreen: props.settings?.IsFullscreen ?? false,
    UseCustomScaling: props.settings?.UseCustomScaling ?? false,
    CustomScale: props.settings?.CustomScale ?? 1.0,
    PanSpeedMultiplier: props.settings?.PanSpeedMultiplier ?? 10.0,
    PanDeadzone: props.settings?.PanDeadzone ?? 100,
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
        TimelinePeriodYMargin: d.TimelinePeriodYMargin ?? 20,
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
        TimelineTickColor: d.TimelineTickColor ?? '#c8b9a4',
        TimelineAxisColor: d.TimelineAxisColor ?? '#b5a692',
        NotesPanelBackgroundColor: d.NotesPanelBackgroundColor ?? '#0f172a',
        NotesPanelCardBackgroundColor: d.NotesPanelCardBackgroundColor ?? '#1e293b',
        NotesPanelTextColor: d.NotesPanelTextColor ?? '#e2e8f0',
        NotesPanelHeadingColor: d.NotesPanelHeadingColor ?? '#94a3b8',
        NotesPanelAccentColor: d.NotesPanelAccentColor ?? '#6366f1',
        NotesPanelFontSize: d.NotesPanelFontSize ?? 13,
        DataPanelBackgroundColor: d.DataPanelBackgroundColor ?? '#f5f0e8',
        DataPanelCardBackgroundColor: d.DataPanelCardBackgroundColor ?? '#ffffffaa',
        DataPanelH1Color: d.DataPanelH1Color ?? '#2c1f0f',
        DataPanelH2Color: d.DataPanelH2Color ?? '#3a2b1a',
        DataPanelH3Color: d.DataPanelH3Color ?? '#2c1f0f',
        DataPanelH4Color: d.DataPanelH4Color ?? '#5c4a38',
        DataPanelFontFamily: d.DataPanelFontFamily ?? 'Georgia, serif',
        DataPanelFontSize: d.DataPanelFontSize ?? 14,
        GalleryPanelBackgroundColor: d.GalleryPanelBackgroundColor ?? '#0f172a',
        GalleryPanelBorderColor: d.GalleryPanelBorderColor ?? '#1e293b',
        GalleryPanelTextColor: d.GalleryPanelTextColor ?? '#94a3b8',
        CalendarPanelBackgroundColor: d.CalendarPanelBackgroundColor ?? '#f5f0e8',
        CalendarPanelBorderColor: d.CalendarPanelBorderColor ?? '#d5cec4',
        CalendarPanelTextColor: d.CalendarPanelTextColor ?? '#5c4a38',
        CalendarPanelWeekHighlightColor: d.CalendarPanelWeekHighlightColor ?? '#6366f118',
        CalendarPanelDayHighlightColor: d.CalendarPanelDayHighlightColor ?? '#6366f135',
        TimelineCalendarOverlayEnabled: d.TimelineCalendarOverlayEnabled ?? false,
        TimelineCalendarOverlaySeasonColor: d.TimelineCalendarOverlaySeasonColor ?? '#ffffff0a',
        TimelineCalendarOverlayMonthColor:  d.TimelineCalendarOverlayMonthColor  ?? '#ffffff08',
        TimelineCalendarOverlayWeekColor:   d.TimelineCalendarOverlayWeekColor   ?? '#ffffff06',
        TimelineCalendarOverlayDayColor:    d.TimelineCalendarOverlayDayColor    ?? '#ffffff05',
    }
}

const localLayout = reactive<LayoutSettings>(initLayout(props.layoutSettings))

const layoutPresets = ref<{ Id: string; Name: string }[]>([])
const systemFonts = ref<string[]>([])
const isSaving = ref(false)
const saveError = ref('')
const showNewPreset = ref(false)
const newPresetName = ref('')
const isResetting = ref(false)

const isBuiltinPreset = computed(() =>
    local.selectedLayoutId === 'ls_default' || local.selectedLayoutId === 'ls_dark'
)

async function resetPreset() {
    if (!isBuiltinPreset.value) return
    isResetting.value = true
    const result = await BackendAPI.ResetLayoutPreset(local.selectedLayoutId)
    isResetting.value = false
    if (result?.status === 'ok' && result.layoutSettings) {
        Object.assign(localLayout, result.layoutSettings)
    } else if (result?.status === 'error') {
        console.error('[resetPreset] Backend error:', result.message)
        console.error('[resetPreset] Detail:', result.detail)
        alert(`Reset failed:\n${result.message}`)
    }
}

// --- tabs ---
const activeTab = ref<'general' | 'canvas' | 'panels'>('general')
const showAll   = computed(() => searchQuery.value.trim() !== '')

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

// --- calendar overlay colors (RGBA split into rgb + alpha %) ---
const _initOS = parseHexAlpha(localLayout.TimelineCalendarOverlaySeasonColor);
const overlaySeasonRGB   = ref(_initOS.rgb);
const overlaySeasonAlpha = ref(_initOS.alpha);
watch([overlaySeasonRGB, overlaySeasonAlpha], ([rgb, alpha]) => {
    localLayout.TimelineCalendarOverlaySeasonColor = buildHexAlpha(rgb, alpha);
});

const _initOM = parseHexAlpha(localLayout.TimelineCalendarOverlayMonthColor);
const overlayMonthRGB   = ref(_initOM.rgb);
const overlayMonthAlpha = ref(_initOM.alpha);
watch([overlayMonthRGB, overlayMonthAlpha], ([rgb, alpha]) => {
    localLayout.TimelineCalendarOverlayMonthColor = buildHexAlpha(rgb, alpha);
});

const _initOW = parseHexAlpha(localLayout.TimelineCalendarOverlayWeekColor);
const overlayWeekRGB   = ref(_initOW.rgb);
const overlayWeekAlpha = ref(_initOW.alpha);
watch([overlayWeekRGB, overlayWeekAlpha], ([rgb, alpha]) => {
    localLayout.TimelineCalendarOverlayWeekColor = buildHexAlpha(rgb, alpha);
});

const _initOD = parseHexAlpha(localLayout.TimelineCalendarOverlayDayColor);
const overlayDayRGB   = ref(_initOD.rgb);
const overlayDayAlpha = ref(_initOD.alpha);
watch([overlayDayRGB, overlayDayAlpha], ([rgb, alpha]) => {
    localLayout.TimelineCalendarOverlayDayColor = buildHexAlpha(rgb, alpha);
});

// --- calendar panel week/day highlight colors ---
const _initCPW = parseHexAlpha(localLayout.CalendarPanelWeekHighlightColor);
const calWeekHlRGB   = ref(_initCPW.rgb);
const calWeekHlAlpha = ref(_initCPW.alpha);
watch([calWeekHlRGB, calWeekHlAlpha], ([rgb, alpha]) => {
    localLayout.CalendarPanelWeekHighlightColor = buildHexAlpha(rgb, alpha);
});

const _initCPD = parseHexAlpha(localLayout.CalendarPanelDayHighlightColor);
const calDayHlRGB   = ref(_initCPD.rgb);
const calDayHlAlpha = ref(_initCPD.alpha);
watch([calDayHlRGB, calDayHlAlpha], ([rgb, alpha]) => {
    localLayout.CalendarPanelDayHighlightColor = buildHexAlpha(rgb, alpha);
});

function applyCalendarPanelLight() {
    localLayout.CalendarPanelBackgroundColor = '#f5f0e8'
    localLayout.CalendarPanelBorderColor     = '#d5cec4'
    localLayout.CalendarPanelTextColor       = '#5c4a38'
    calWeekHlRGB.value = '#6366f1'; calWeekHlAlpha.value = 9
    calDayHlRGB.value  = '#6366f1'; calDayHlAlpha.value  = 21
}

function applyCalendarPanelDark() {
    localLayout.CalendarPanelBackgroundColor = '#0f172a'
    localLayout.CalendarPanelBorderColor     = '#1e293b'
    localLayout.CalendarPanelTextColor       = '#94a3b8'
    calWeekHlRGB.value = '#818cf8'; calWeekHlAlpha.value = 9
    calDayHlRGB.value  = '#818cf8'; calDayHlAlpha.value  = 21
}

onMounted(async () => {
    const [presets, fonts] = await Promise.all([
        BackendAPI.GetLayoutSettingsList(),
        BackendAPI.GetSystemFonts(),
    ])
    if (presets) layoutPresets.value = presets
    if (fonts) systemFonts.value = fonts
})

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
            pixelsPerSubtick: local.PixelsPerSubtick,
            showGuides: local.ShowGuides,
            displayRadius: local.DisplayRadius,
            isFullscreen: local.IsFullscreen,
            useCustomScaling: local.UseCustomScaling,
            customScale: local.CustomScale,
            layoutPresetId: local.selectedLayoutId,
            panSpeedMultiplier: local.PanSpeedMultiplier,
            panDeadzone: local.PanDeadzone,
        }),
        BackendAPI.SaveLayoutSettings(localLayout),
    ])

    if (settingsResult?.status === 'ok' && lsResult?.status === 'ok') {
        if (store.settings) {
            store.settings.PixelsPerSubtick = local.PixelsPerSubtick
            store.settings.ShowGuides = local.ShowGuides
            store.settings.DisplayRadius = local.DisplayRadius
            store.settings.IsFullscreen = local.IsFullscreen
            store.settings.UseCustomScaling = local.UseCustomScaling
            store.settings.CustomScale = local.CustomScale
            store.settings.PanSpeedMultiplier = local.PanSpeedMultiplier
            store.settings.PanDeadzone = local.PanDeadzone
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
    <BaseModal title="Settings" width="min(560px, 92vw)" max-height="82vh" @close="emit('close')">
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

            <div class="tab-bar">
                <button class="tab-btn" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">General</button>
                <button class="tab-btn" :class="{ active: activeTab === 'canvas' }" @click="activeTab = 'canvas'">Canvas</button>
                <button class="tab-btn" :class="{ active: activeTab === 'panels' }" @click="activeTab = 'panels'">Panels</button>
            </div>

            <div class="modal-body" ref="modalBodyRef">

                <!-- ── GENERAL TAB ──────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'general'">

                <!-- GENERAL -->
                <div class="section-title">General</div>
                <div class="settings-grid">
                    <span class="s-label">Pixels per Subtick <SettingHint tip="Horizontal pixel distance between the smallest time units at default zoom" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PixelsPerSubtick" :step="1" min="5" max="200" />

                    <span class="s-label">Display Radius <SettingHint tip="How many years around the current view to load and render items" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.DisplayRadius" :step="1" min="1" max="100" />

                    <span class="s-label">Pan Speed <SettingHint tip="Middle-mouse pan speed multiplier. Default 10 = normal feel; lower = slower, higher = faster" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PanSpeedMultiplier" :step="0.1" min="0.01" max="100" />

                    <span class="s-label">Pan Deadzone (px) <SettingHint tip="Width of the neutral zone at screen center where middle-mouse does not pan; cursor shows ↔ but no movement occurs" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PanDeadzone" :step="1" min="0" max="500" />

                    <span class="s-label">Show Guides <SettingHint tip="Toggle guide lines on the canvas (reserved for future use)" /></span>
                    <button class="toggle" :class="{ 'is-on': local.ShowGuides }" type="button" @click="local.ShowGuides = !local.ShowGuides">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Filtered items <SettingHint tip="How items excluded by active filters are displayed — hidden removes them; dimmed fades them out" /></span>
                    <div class="radio-group">
                        <label class="radio-opt">
                            <input type="radio" :checked="store.filterDisplayMode === 'hidden'" @change="store.setFilterDisplayMode('hidden')" />
                            Hidden
                        </label>
                        <label class="radio-opt">
                            <input type="radio" :checked="store.filterDisplayMode === 'dimmed'" @change="store.setFilterDisplayMode('dimmed')" />
                            Dimmed
                        </label>
                    </div>
                </div>

                <!-- WINDOW -->
                <div class="section-title">Window</div>
                <div class="settings-grid">
                    <span class="s-label">Fullscreen <SettingHint tip="Run the timeline window in borderless fullscreen mode" /></span>
                    <button class="toggle" :class="{ 'is-on': local.IsFullscreen }" type="button" @click="local.IsFullscreen = !local.IsFullscreen">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Custom Scaling <SettingHint tip="Override the system DPI scaling for this window" /></span>
                    <button class="toggle" :class="{ 'is-on': local.UseCustomScaling }" type="button" @click="local.UseCustomScaling = !local.UseCustomScaling">
                        <span class="toggle-thumb" />
                    </button>

                    <template v-if="local.UseCustomScaling">
                        <span class="s-label">Scale Factor <SettingHint tip="Zoom factor applied to this window (1.0 = 100%, 2.0 = 200%)" /></span>
                        <input class="s-input s-input--narrow" type="number" v-model.number="local.CustomScale" :step="0.1" min="0.5" max="4" />
                    </template>
                </div>

                </div><!-- end general tab -->

                <!-- ── CANVAS TAB ──────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'canvas'">

                <!-- LAYOUT PRESET -->
                <div class="section-title">Layout Preset</div>
                <div class="settings-grid">
                    <span class="s-label">Active Preset <SettingHint tip="Visual layout preset applied to this timeline — controls box sizes, colors, and canvas appearance" /></span>
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

                    <template v-if="isBuiltinPreset">
                        <span class="s-label">Reset Preset <SettingHint tip="Restore this built-in preset to its factory values, discarding any changes" /></span>
                        <button
                            class="icon-btn icon-btn--reset"
                            type="button"
                            :disabled="isResetting"
                            @click="resetPreset"
                            title="Reset this built-in preset to its default values"
                        >
                            {{ isResetting ? 'Resetting…' : 'Reset to defaults' }}
                        </button>
                    </template>

                    <template v-if="showNewPreset">
                        <span class="s-label">New Preset Name <SettingHint tip="Name for the new preset, which starts as a copy of the currently active preset" /></span>
                        <div class="preset-row">
                            <input class="s-input" type="text" v-model="newPresetName" placeholder="My preset…" @keydown.enter="createPreset" @keydown.escape="showNewPreset = false" />
                            <button class="icon-btn icon-btn--ok" type="button" @click="createPreset">Create</button>
                        </div>
                    </template>
                </div>

                <!-- EVENT BOXES -->
                <div class="section-title">Event Boxes</div>
                <div class="settings-grid">
                    <span class="s-label">Box Width <SettingHint tip="Width in pixels of each event box on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxWidth" :step="10" min="50" />

                    <span class="s-label">Box Height <SettingHint tip="Height in pixels of each event box on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxHeight" :step="5" min="20" />

                    <span class="s-label">Stem Offset <SettingHint tip="Vertical offset of the stem line connecting the box to the timeline axis" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxStemOffset" :step="1" />

                    <span class="s-label">Border Color <SettingHint tip="Color of the event box outline" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventBorderColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventBorderColor }}</span>
                    </div>

                    <span class="s-label">Border Width <SettingHint tip="Thickness of the event box outline in pixels (0 = no border)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderWidth" :step="1" min="0" />

                    <span class="s-label">Border Radius <SettingHint tip="Corner rounding of event boxes in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderRadius" :step="1" min="0" />

                    <span class="s-label">Y Margin <SettingHint tip="Vertical gap between event boxes when they stack on top of each other" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventYMargin" :step="1" min="0" />

                    <span class="s-label">Text Color <SettingHint tip="Color of the title text inside event boxes" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventTextColor }}</span>
                    </div>

                    <span class="s-label">Background Color <SettingHint tip="Fill color of event boxes" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Font Family <SettingHint tip="Font used for text inside event boxes" /></span>
                    <FontPicker v-model="localLayout.TimelineEventFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Size <SettingHint tip="Font size for text inside event boxes in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Use Text Ellipsis <SettingHint tip="Truncate long titles with '…' instead of overflowing the box boundary" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventTextUseEllipsis }" type="button" @click="localLayout.TimelineEventTextUseEllipsis = !localLayout.TimelineEventTextUseEllipsis">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Item Color <SettingHint tip="Display the item's assigned color as a stripe on the edge of the box" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColor }" type="button" @click="localLayout.TimelineEventBoxShowColor = !localLayout.TimelineEventBoxShowColor">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color on Bottom <SettingHint tip="Show the item color stripe on the bottom edge instead of the left edge" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColorOnBottom }" type="button" @click="localLayout.TimelineEventBoxShowColorOnBottom = !localLayout.TimelineEventBoxShowColorOnBottom">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Hover Highlight <SettingHint tip="Change the box border color when the mouse hovers over it" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventHasHoverHighlight }" type="button" @click="localLayout.TimelineEventHasHoverHighlight = !localLayout.TimelineEventHasHoverHighlight">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Hover Color <SettingHint tip="Border color applied to event boxes on mouse hover (requires Hover Highlight enabled)" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventHoverColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventHoverColor }}</span>
                    </div>
                </div>

                <!-- PERIODS & AGES -->
                <div class="section-title">Periods &amp; Ages</div>
                <div class="settings-grid">
                    <span class="s-label">Age Height <SettingHint tip="Height in pixels of age bars spanning the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeHeight" :step="5" min="10" />

                    <span class="s-label">Age Corner Rounding <SettingHint tip="Corner radius of age bars in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Height <SettingHint tip="Height in pixels of period bars on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodHeight" :step="2" min="4" />

                    <span class="s-label">Period Corner Rounding <SettingHint tip="Corner radius of period bars in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Y Margin <SettingHint tip="Vertical spacing above and below period bars" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYMargin" :step="1" />

                    <span class="s-label">Period Y Offset <SettingHint tip="Vertical shift applied to all period bars (positive = down)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYOffset" :step="1" />
                </div>

                <!-- TIMELINE -->
                <div class="section-title">Timeline</div>
                <div class="settings-grid">
                    <span class="s-label">Canvas Background <SettingHint tip="Background fill color of the entire timeline canvas area" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineCanvasBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineCanvasBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Tick Distance <SettingHint tip="Pixel distance between major time axis ticks at default zoom level" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickDistance" :step="5" min="10" />

                    <span class="s-label">Tick Width <SettingHint tip="Stroke width of tick marks on the timeline axis in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickWidth" :step="0.5" min="0.5" />

                    <span class="s-label">Smaller Non-Year Ticks <SettingHint tip="Draw sub-year ticks (months, days) shorter than year-level ticks" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineNonYearTicksSmaller }" type="button" @click="localLayout.TimelineNonYearTicksSmaller = !localLayout.TimelineNonYearTicksSmaller">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Tick Color <SettingHint tip="Color of the tick marks drawn on the timeline axis" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineTickColor" />
                        <span class="color-hex">{{ localLayout.TimelineTickColor }}</span>
                    </div>

                    <span class="s-label">Axis Line Color <SettingHint tip="Color of the horizontal timeline axis line" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineAxisColor" />
                        <span class="color-hex">{{ localLayout.TimelineAxisColor }}</span>
                    </div>

                    <span class="s-label">Edge Margin Width <SettingHint tip="Pixel padding at the left and right edges of the canvas before the timeline content starts" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEdgeMarginWidth" :step="5" min="0" />
                </div>

                <!-- TICK MARKERS -->
                <div class="section-title">Tick Markers</div>
                <div class="settings-grid">
                    <span class="s-label">Font Family <SettingHint tip="Font used for date labels on the timeline axis" /></span>
                    <FontPicker v-model="localLayout.TimelineTickMarkerFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Style <SettingHint tip="CSS font style for axis date labels — e.g. 'normal', 'italic', 'bold'" /></span>
                    <input class="s-input" type="text" v-model="localLayout.TimelineTickMarkerFontStyle" placeholder="normal" />

                    <span class="s-label">Font Size <SettingHint tip="Font size of the date labels on the axis in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickMarkerFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Text Color <SettingHint tip="Color of the date labels on the timeline axis" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineTickMarkerTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineTickMarkerTextColor }}</span>
                    </div>

                    <span class="s-label">Always On Top <SettingHint tip="Draw axis date labels above all other canvas elements including event boxes" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineTickMarkerTextAlwaysOnTop }" type="button" @click="localLayout.TimelineTickMarkerTextAlwaysOnTop = !localLayout.TimelineTickMarkerTextAlwaysOnTop">
                        <span class="toggle-thumb" />
                    </button>
                </div>

                <!-- NOW LINE -->
                <div class="section-title">Now Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Now Line <SettingHint tip="Show a vertical marker line at the current 'now' year set for this timeline" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLine }" type="button" @click="localLayout.TimelineShowNowLine = !localLayout.TimelineShowNowLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Text <SettingHint tip="Display a year label next to the now line" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLineText }" type="button" @click="localLayout.TimelineShowNowLineText = !localLayout.TimelineShowNowLineText">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color <SettingHint tip="Color of the now line" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineNowLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineNowLineColor }}</span>
                    </div>

                    <span class="s-label">Style <SettingHint tip="Line style of the now line" /></span>
                    <select class="s-input" v-model="localLayout.TimelineNowLineStyle">
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                    </select>
                </div>

                <!-- HOVER LINE -->
                <div class="section-title">Hover Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Hover Line <SettingHint tip="Show a vertical line that follows the mouse cursor across the canvas" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowHoverLine }" type="button" @click="localLayout.TimelineShowHoverLine = !localLayout.TimelineShowHoverLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Color <SettingHint tip="Color of the cursor hover line" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineHoverLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineHoverLineColor }}</span>
                    </div>

                    <span class="s-label">Style <SettingHint tip="Line style of the hover line (solid / dashed / dotted)" /></span>
                    <input class="s-input" type="text" v-model="localLayout.TimelineHoverLineStyle" placeholder="dashed" />

                    <span class="s-label">Width <SettingHint tip="Stroke width of the hover line in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineHoverLineWidth" :step="0.5" min="0.5" />
                </div>

                <!-- DATA RANGE -->
                <div class="section-title">Data Range</div>
                <div class="settings-grid">
                    <span class="s-label">Visible <SettingHint tip="Show the data range bar along the axis indicating where items exist in time" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineIsDataRangeVisible }" type="button" @click="localLayout.TimelineIsDataRangeVisible = !localLayout.TimelineIsDataRangeVisible">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Width <SettingHint tip="Height of the data range bar in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineDataRangeWidth" :step="10" min="20" />

                    <span class="s-label">Color <SettingHint tip="Color of the data range bar" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="dataRangeRGB" />
                        <span class="color-hex">{{ localLayout.TimelineDataRangeColor }}</span>
                    </div>

                    <span class="s-label">Opacity <SettingHint tip="Transparency of the data range bar (0 = invisible, 100 = fully opaque)" /></span>
                    <div class="color-row alpha-row">
                        <input type="range" class="s-range" min="0" max="100" step="1" v-model.number="dataRangeAlpha" />
                        <span class="color-hex">{{ dataRangeAlpha }}%</span>
                    </div>
                </div>

                <!-- ANIMATIONS -->
                <div class="section-title">Animations</div>
                <div class="settings-grid">
                    <span class="s-label">Animate Jump to Year <SettingHint tip="Smoothly scroll the canvas when jumping to a specific year instead of cutting instantly" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineAnimateOnJumpToYear }" type="button" @click="localLayout.TimelineAnimateOnJumpToYear = !localLayout.TimelineAnimateOnJumpToYear">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Jump Duration (ms) <SettingHint tip="Duration of the jump-to-year scroll animation in milliseconds (0 = instant)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineJumpToYearAnimationLength" :step="50" min="0" />

                    <span class="s-label">Animate LOD Change <SettingHint tip="Fade the canvas when the level of detail (zoom scale) changes" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineAnimateLodChange }" type="button" @click="localLayout.TimelineAnimateLodChange = !localLayout.TimelineAnimateLodChange">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">LOD Duration (ms) <SettingHint tip="Duration of the level-of-detail change animation in milliseconds (0 = instant)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineLodChangeAnimationLength" :step="50" min="0" />
                </div>

                </div><!-- end canvas tab -->

                <!-- ── PANELS TAB ──────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'panels'">

                <!-- NOTES PANEL -->
                <div class="section-title">Notes Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background <SettingHint tip="Background color of the notes panel area" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Card Background <SettingHint tip="Background color of individual note cards" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelCardBackgroundColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelCardBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Text Color <SettingHint tip="Color of note body text" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelTextColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelTextColor }}</span>
                    </div>

                    <span class="s-label">Heading / Label Color <SettingHint tip="Color of headings and field labels within note cards" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelHeadingColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelHeadingColor }}</span>
                    </div>

                    <span class="s-label">Accent Color <SettingHint tip="Accent color used for highlights and active states in the notes panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelAccentColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelAccentColor }}</span>
                    </div>

                    <span class="s-label">Font Size <SettingHint tip="Base font size for text in the notes panel in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.NotesPanelFontSize" :step="1" min="9" max="24" />
                </div>

                <!-- GALLERY PANEL -->
                <div class="section-title">Gallery Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background <SettingHint tip="Background color of the image gallery panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Borders / Dividers <SettingHint tip="Color of borders and dividers between gallery items" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelBorderColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelBorderColor }}</span>
                    </div>

                    <span class="s-label">Text / Labels <SettingHint tip="Color of image captions and labels in the gallery panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelTextColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelTextColor }}</span>
                    </div>
                </div>

                <!-- CALENDAR PANEL -->
                <div class="section-title">Calendar Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Theme <SettingHint tip="Apply a preset light or dark color scheme to the calendar panel" /></span>
                    <div class="color-row">
                        <button class="s-btn" type="button" @click="applyCalendarPanelLight">☀ Light</button>
                        <button class="s-btn" type="button" @click="applyCalendarPanelDark">☽ Dark</button>
                    </div>

                    <span class="s-label">Background <SettingHint tip="Background color of the calendar panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Borders / Dividers <SettingHint tip="Color of grid lines between days, weeks, and months in the calendar" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelBorderColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelBorderColor }}</span>
                    </div>

                    <span class="s-label">Text / Labels <SettingHint tip="Color of day numbers, weekday headers, and month labels" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelTextColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelTextColor }}</span>
                    </div>

                    <span class="s-label">Week Highlight <SettingHint tip="Background highlight color for the row containing the current week" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="calWeekHlRGB" />
                        <input class="s-slider" type="range" v-model.number="calWeekHlAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.CalendarPanelWeekHighlightColor }}</span>
                    </div>

                    <span class="s-label">Day Highlight <SettingHint tip="Background highlight color for the current day cell" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="calDayHlRGB" />
                        <input class="s-slider" type="range" v-model.number="calDayHlAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.CalendarPanelDayHighlightColor }}</span>
                    </div>
                </div>

                <!-- CALENDAR OVERLAY -->
                <div class="section-title">Calendar Overlay</div>
                <div class="settings-grid">
                    <span class="s-label">Enabled <SettingHint tip="Draw alternating semi-transparent calendar bands over the timeline canvas to show time divisions" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineCalendarOverlayEnabled }" type="button" @click="localLayout.TimelineCalendarOverlayEnabled = !localLayout.TimelineCalendarOverlayEnabled">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Season / Year band <SettingHint tip="Color of alternating season or year bands; use low opacity for a subtle effect" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="overlaySeasonRGB" />
                        <input class="s-slider" type="range" v-model.number="overlaySeasonAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlaySeasonColor }}</span>
                    </div>

                    <span class="s-label">Month band <SettingHint tip="Color of alternating month bands drawn over the canvas" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="overlayMonthRGB" />
                        <input class="s-slider" type="range" v-model.number="overlayMonthAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayMonthColor }}</span>
                    </div>

                    <span class="s-label">Week band <SettingHint tip="Color of alternating week bands drawn over the canvas" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="overlayWeekRGB" />
                        <input class="s-slider" type="range" v-model.number="overlayWeekAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayWeekColor }}</span>
                    </div>

                    <span class="s-label">Day band <SettingHint tip="Color of alternating day bands drawn over the canvas (only visible at high zoom)" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="overlayDayRGB" />
                        <input class="s-slider" type="range" v-model.number="overlayDayAlpha" min="0" max="100" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayDayColor }}</span>
                    </div>
                </div>

                <!-- DATA PANEL -->
                <div class="section-title">Data Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background <SettingHint tip="Background color of the data / export panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.DataPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Card Background <SettingHint tip="Background color of individual item cards in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelCardBackgroundColor" />
                        <span class="color-hex">{{ localLayout.DataPanelCardBackgroundColor }}</span>
                    </div>

                    <span class="s-label">H1 — Age Title <SettingHint tip="Color of the top-level age headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH1Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH1Color }}</span>
                    </div>

                    <span class="s-label">H2 — Period Title <SettingHint tip="Color of period-level headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH2Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH2Color }}</span>
                    </div>

                    <span class="s-label">H3 — Item Title <SettingHint tip="Color of item-level headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH3Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH3Color }}</span>
                    </div>

                    <span class="s-label">H4 — Description <SettingHint tip="Color of description / body text in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH4Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH4Color }}</span>
                    </div>

                    <span class="s-label">Font Family <SettingHint tip="Font used throughout the data panel" /></span>
                    <FontPicker v-model="localLayout.DataPanelFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Size <SettingHint tip="Base font size for the data panel in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.DataPanelFontSize" :step="1" min="9" max="24" />
                </div>

                </div><!-- end panels tab -->

                <p v-if="saveError" class="error-msg">{{ saveError }}</p>

            </div>

        <template #footer>
            <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
            <button class="btn btn-save" :disabled="isSaving" @click="save">
                {{ isSaving ? 'Saving…' : 'Save Changes' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.search-bar {
    padding: 8px 20px;
    background: var(--app-surface-raised, #141e33);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}

.search-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 13px;
    padding: 5px 10px;
    outline: none;
    transition: border-color 0.15s;

    &:focus { border-color: var(--app-accent, #3b6ec4); }
    &::placeholder { color: #4a5568; }
}

.modal-body {
    overflow-y: auto;
    padding: 12px 20px 20px;
    flex: 1;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--app-border, #2d3a56); border-radius: 3px; }
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
    color: var(--app-text-dim, #4a6080);

    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--app-surface-high, #1e2b44);
    }

    &:first-child {
        margin-top: 6px;
    }

    &.search-hl {
        color: var(--app-accent-hover, #818cf8);
        &::after { background: var(--app-accent, #6366f1); }
    }
}

.s-label.search-hl {
    color: var(--app-accent-hover, #818cf8);
    background: color-mix(in srgb, var(--app-accent, #6366f1) 18%, transparent);
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 13px;
    color: var(--app-text-muted, #94a3b8);
    padding: 5px 12px 5px 0;
    line-height: 1.4;
}

.s-input {
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text, #e2e8f0);
    font-size: 13px;
    padding: 4px 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &:focus {
        border-color: var(--app-accent, #3b6ec4);
    }

    &.s-input--narrow {
        width: 90px;
    }
}

select.s-input {
    cursor: pointer;
    appearance: auto;
}

.s-btn {
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 12px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
        background: var(--app-surface-high, #1e2b44);
        color: var(--app-text, #e2e8f0);
    }
}

.toggle {
    position: relative;
    width: 38px;
    height: 20px;
    border-radius: 10px;
    background: var(--app-border, #2d3a56);
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.2s;

    &.is-on {
        background: var(--app-accent, #3b6ec4);
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
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    background: var(--app-surface, #0c1524);
    cursor: pointer;
    padding: 2px;
}

.color-hex {
    font-size: 12px;
    color: var(--app-text-dim, #64748b);
    font-family: monospace;
}

.s-range,
.s-slider {
    flex: 1;
    accent-color: var(--app-accent, #3b6ec4);
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
    background: var(--app-surface-high, #1e2b44);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 4px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
        background: var(--app-surface-high, #1e2b44);
        color: var(--app-text, #e2e8f0);
    }

    &.icon-btn--ok {
        width: auto;
        padding: 0 10px;
        font-size: 12px;
        color: #86efac;
        border-color: var(--app-save-accent, #446b40);

        &:hover {
            background: var(--app-save-accent, #446b40);
            color: #e8f5e5;
        }
    }

    &.icon-btn--reset {
        width: auto;
        padding: 0 10px;
        font-size: 12px;
        color: #fbbf24;
        border-color: #78450a;

        &:hover:not(:disabled) {
            background: #78450a;
            color: #fef3c7;
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
}

.error-msg {
    margin: 12px 0 0;
    font-size: 12px;
    color: #f87171;
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
    color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);

    &:hover {
        background: #ffffff0e;
        color: var(--app-text, #e2e8f0);
    }
}

.btn-save {
    background: var(--app-save-accent, #446b40);
    color: #e8f5e5;

    &:hover:not(:disabled) {
        background: var(--app-save-accent-hover, #52804c);
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

.radio-group {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 2px 0;
}

.radio-opt {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;

    input[type="radio"] {
        accent-color: #6aaa6a;
        cursor: pointer;
    }
}

.tab-bar {
    display: flex;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
    background: var(--app-surface, #0c1524);
}

.tab-btn {
    flex: 1;
    padding: 9px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--app-text-dim, #4a6080);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &:hover { color: var(--app-text-muted, #94a3b8); }

    &.active {
        color: var(--app-text, #e2e8f0);
        border-bottom-color: var(--app-accent, #3b6ec4);
    }
}
</style>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { PhPlus } from '@phosphor-icons/vue'
import type { TimelineSettings, LayoutSettings } from '@/types/models'
import { BackendAPI, type BridgeError } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { MOD } from '@/utils/shortcuts'
import { DEFAULT_SWATCHES, ALL_LODS_MASK, loadSwatches, saveSwatches, loadDefaultLodMask, saveDefaultLodMask, lodMaskSummary } from '@/utils/timelinePrefs'
import SwatchEditorModal from './SwatchEditorModal.vue'
import LodMaskModal from './LodMaskModal.vue'
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
    PanSpeedMultiplier: props.settings?.PanSpeedMultiplier ?? 5.0,
    PanDeadzone: props.settings?.PanDeadzone ?? 100,
    KeyboardPanSpeed: props.settings?.KeyboardPanSpeed ?? 400,
    DefaultItemColor: props.settings?.DefaultItemColor ?? '#000000',
    HeaderMode: props.settings?.HeaderMode ?? 0,
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
        TimelinePictureCaptionFontSize: d.TimelinePictureCaptionFontSize ?? 12,
        TimelineCharacterCaptionFontSize: d.TimelineCharacterCaptionFontSize ?? 12,
        TimelineCanvasBackgroundColor: d.TimelineCanvasBackgroundColor ?? '#0f172a',
        TimelineShowNowLine: d.TimelineShowNowLine ?? true,
        TimelineShowNowLineText: d.TimelineShowNowLineText ?? true,
        TimelineNowLineColor: d.TimelineNowLineColor ?? '#ef4444',
        TimelineNowLineStyle: d.TimelineNowLineStyle ?? 'dashed',
        TimelineNowLineWidth: d.TimelineNowLineWidth ?? 2,
        TimelineTickDistance: d.TimelineTickDistance ?? 50,
        TimelineTickWidth: d.TimelineTickWidth ?? 1,
        TimelineNonYearTicksSmaller: d.TimelineNonYearTicksSmaller ?? true,
        TimelineTickMarkerFontFamily: d.TimelineTickMarkerFontFamily ?? 'Arial',
        TimelineTickMarkerFontStyle: d.TimelineTickMarkerFontStyle ?? 'normal',
        TimelineTickMarkerTextColor: d.TimelineTickMarkerTextColor ?? '#94a3b8',
        TimelineTickMarkerFontSize: d.TimelineTickMarkerFontSize ?? 12,
        TimelineTickMarkerTextAlwaysOnTop: d.TimelineTickMarkerTextAlwaysOnTop ?? false,
        TimelineTickMarkerTextAngled: d.TimelineTickMarkerTextAngled ?? false,
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
        TimelineBreakFillColor:   d.TimelineBreakFillColor   ?? '#b4c8ff0d',
        TimelineBreakBorderColor: d.TimelineBreakBorderColor ?? '#78a0dc88',
        MeasureLineColor:         d.MeasureLineColor         ?? '#0077aa',
    }
}

const localLayout = reactive<LayoutSettings>(expandShortHex(initLayout(props.layoutSettings)))

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
    try {
        const result = await BackendAPI.ResetLayoutPreset(local.selectedLayoutId)
        if (result?.layoutSettings) adoptLayout(result.layoutSettings)
    } catch (e) {
        console.error('[resetPreset] failed:', e, (e as BridgeError).payload?.detail)
        alert(`Reset failed:\n${e instanceof Error ? e.message : String(e)}`)
    } finally {
        isResetting.value = false
    }
}

// --- tabs ---
const activeTab = ref<'general' | 'canvas' | 'overlays' | 'panels'>('general')
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
    // Collected rather than tracked in a `let`: an assignment inside these callbacks is invisible
    // to the checker, which then reads the variable back as `never`. Titles stay ahead of labels.
    const matches: HTMLElement[] = []

    body.querySelectorAll<HTMLElement>('.section-title').forEach(el => {
        if (el.textContent?.toLowerCase().includes(lower)) {
            el.classList.add('search-hl')
            matches.push(el)
        }
    })

    body.querySelectorAll<HTMLElement>('.s-label').forEach(el => {
        if (el.textContent?.toLowerCase().includes(lower)) {
            el.classList.add('search-hl')
            matches.push(el)
        }
    })

    matches[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

// --- colors ---
/**
 * `#f00` and `#44A8` are valid CSS and the canvas draws them, but `<input type="color">` is a
 * six-digit control: hand it `#44A8` and it reads back `#4444aa`, taking the alpha with it. The
 * shipped light preset stores the short forms, so every color is expanded on the way in.
 *
 * ponytail: 3- and 4-digit hex only. A named CSS color (`red`) would survive a round trip as
 * itself and none of the presets hold one; upgrade is a 1px canvas draw to resolve any color.
 */
function expandShortHex<T extends object>(ls: T): T {
    for (const [k, v] of Object.entries(ls)) {
        if (typeof v !== 'string' || !/^#[0-9a-f]{3,4}$/i.test(v)) continue
        ;(ls as Record<string, unknown>)[k] = '#' + v.slice(1).split('').map(c => c + c).join('')
    }
    return ls
}

/**
 * Alpha is the byte the hex actually holds, 0-255, not a percentage of it. As a percentage the
 * round trip lost a step every save -- `#ffffff10` is 6.27%, which stored 6 and came back `0f` --
 * and the calendar bands, which want 2-6%, all pinned to the far left of the slider where one nudge
 * reached zero. On the channel itself nothing is rounded and those bands have 16 usable notches.
 */
function parseHexAlpha(hex: string): { rgb: string; alpha: number } {
    const FALLBACK = { rgb: '#3b6ec4', alpha: 77 }
    if (!hex) return { ...FALLBACK }
    const h = hex.replace('#', '')
    const dbl = (n: number) => h[n]! + h[n]
    if (h.length === 4) return { rgb: `#${dbl(0)}${dbl(1)}${dbl(2)}`, alpha: parseInt(dbl(3), 16) }
    if (h.length === 8) return { rgb: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6, 8), 16) }
    if (h.length === 6) return { rgb: `#${h}`, alpha: 255 }
    if (h.length === 3) return { rgb: `#${dbl(0)}${dbl(1)}${dbl(2)}`, alpha: 255 }
    return { ...FALLBACK }
}

function buildHexAlpha(rgb: string, alpha: number): string {
    return rgb + Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, '0')
}

/**
 * One color field edited as the two controls it needs — a swatch and an opacity percentage — and
 * written back as eight-digit hex, because the swatch alone has nowhere to put the alpha channel.
 */
const alphaPairs: { key: keyof LayoutSettings; pair: { rgb: string; alpha: number } }[] = []
function alphaColor(key: keyof LayoutSettings) {
    const pair = reactive(parseHexAlpha(String(localLayout[key] ?? '')))
    watch(pair, ({ rgb, alpha }) => {
        ;(localLayout as Record<string, unknown>)[key] = buildHexAlpha(rgb, alpha)
    })
    alphaPairs.push({ key, pair })
    return pair
}

const eventBorder = alphaColor('TimelineEventBorderColor')
const dataRange   = alphaColor('TimelineDataRangeColor')
const bandSeason  = alphaColor('TimelineCalendarOverlaySeasonColor')
const bandMonth   = alphaColor('TimelineCalendarOverlayMonthColor')
const bandWeek    = alphaColor('TimelineCalendarOverlayWeekColor')
const bandDay     = alphaColor('TimelineCalendarOverlayDayColor')
const breakFill   = alphaColor('TimelineBreakFillColor')
const breakBorder = alphaColor('TimelineBreakBorderColor')
const calWeekHl   = alphaColor('CalendarPanelWeekHighlightColor')
const calDayHl    = alphaColor('CalendarPanelDayHighlightColor')
const dataCard    = alphaColor('DataPanelCardBackgroundColor')

/**
 * Take a whole preset. Switching the dropdown, creating a preset and resetting a built-in all replace
 * every field at once, and the split color controls have to be re-pointed with them — left on the old
 * preset they show the wrong swatch and write its color back on the next nudge of a slider.
 */
function adoptLayout(ls: LayoutSettings) {
    Object.assign(localLayout, expandShortHex({ ...ls }))
    for (const { key, pair } of alphaPairs) Object.assign(pair, parseHexAlpha(String(localLayout[key] ?? '')))
}

/** The three dashes the canvas can draw: Konva `dash()` for the now line, CSS for the hover line. */
const LINE_STYLES = [
    { value: 'solid',  label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
] as const

/** Konva's `fontStyle` is a CSS font shorthand fragment, and it ignores anything it cannot parse. */
const FONT_STYLES = [
    { value: 'normal',      label: 'Normal' },
    { value: 'bold',        label: 'Bold' },
    { value: 'italic',      label: 'Italic' },
    { value: 'italic bold', label: 'Bold Italic' },
] as const

// The hover line's style used to be a free-text box, so a preset can hold something the select does
// not offer. Kept as an extra option rather than silently rewritten to a line it never drew.
const strayStyle = computed(() =>
    LINE_STYLES.some(o => o.value === localLayout.TimelineHoverLineStyle) ? '' : localLayout.TimelineHoverLineStyle
)

const swatches = ref<string[]>([...DEFAULT_SWATCHES])   // quick-pick colors of the edit item window
const defaultLodMask = ref(ALL_LODS_MASK)                // LOD visibility new items start with
const showSwatchEditor = ref(false)
const showLodPicker = ref(false)
const lodSummary = computed(() => lodMaskSummary(defaultLodMask.value, store.lodProfile))

onMounted(async () => {
    const [presets, fonts, sw, mask] = await Promise.all([
        BackendAPI.GetLayoutSettingsList(),
        BackendAPI.GetSystemFonts(),
        loadSwatches(store.currentProject!.Id),
        loadDefaultLodMask(store.currentProject!.Id),
    ])
    if (presets) layoutPresets.value = presets
    if (fonts) systemFonts.value = fonts
    swatches.value = sw
    defaultLodMask.value = mask
})

watch(() => local.selectedLayoutId, async (newId) => {
    const ls = await BackendAPI.GetLayoutSettingsById(newId)
    if (ls) adoptLayout(ls)
})

async function createPreset() {
    if (!newPresetName.value.trim()) return
    const result = await BackendAPI.CreateLayoutPreset(newPresetName.value.trim(), local.selectedLayoutId)
    if (result?.status === 'ok' && result.preset) {
        layoutPresets.value.push(result.preset)
        local.selectedLayoutId = result.preset.Id
        if (result.layoutSettings) adoptLayout(result.layoutSettings)
        showNewPreset.value = false
        newPresetName.value = ''
    }
}

async function save() {
    isSaving.value = true
    saveError.value = ''

    localLayout.Id = local.selectedLayoutId

    const [settingsResult, lsResult, swResult, maskResult] = await Promise.all([
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
            keyboardPanSpeed: local.KeyboardPanSpeed,
            defaultItemColor: local.DefaultItemColor,
            headerMode: local.HeaderMode,
        }),
        BackendAPI.SaveLayoutSettings(localLayout),
        saveSwatches(store.currentProject!.Id, swatches.value),
        saveDefaultLodMask(store.currentProject!.Id, defaultLodMask.value),
    ])

    if (settingsResult?.status === 'ok' && lsResult?.status === 'ok' && swResult?.status === 'ok' && maskResult?.status === 'ok') {
        if (store.settings) {
            store.settings.PixelsPerSubtick = local.PixelsPerSubtick
            store.settings.ShowGuides = local.ShowGuides
            store.settings.DisplayRadius = local.DisplayRadius
            store.settings.IsFullscreen = local.IsFullscreen
            store.settings.UseCustomScaling = local.UseCustomScaling
            store.settings.CustomScale = local.CustomScale
            store.settings.PanSpeedMultiplier = local.PanSpeedMultiplier
            store.settings.PanDeadzone = local.PanDeadzone
            store.settings.KeyboardPanSpeed = local.KeyboardPanSpeed
            store.settings.DefaultItemColor = local.DefaultItemColor
            store.settings.HeaderMode = local.HeaderMode
        }
        if (lsResult.layoutSettings) store.setLayoutSettings(lsResult.layoutSettings)
        emit('close')
    } else {
        console.error('[TimelineSettingsModal] save failed:', { settingsResult, lsResult, swResult, maskResult })
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
                <button class="tab-btn" :class="{ active: activeTab === 'overlays' }" @click="activeTab = 'overlays'">Overlays</button>
                <button class="tab-btn" :class="{ active: activeTab === 'panels' }" @click="activeTab = 'panels'">Panels</button>
            </div>

            <div class="modal-body" ref="modalBodyRef">

                <!-- ── GENERAL TAB ──────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'general'">

                <!-- NAVIGATION -->
                <div class="section-title">Navigation</div>
                <div class="settings-grid">
                    <span class="s-label">Pan Speed (×) <SettingHint tip="Middle-mouse pan speed multiplier. Default 5 = normal feel; lower = slower, higher = faster" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PanSpeedMultiplier" :step="0.1" min="0.01" max="100" />

                    <span class="s-label">Pan Deadzone (px) <SettingHint tip="Width of the neutral zone at screen center where middle-mouse does not pan; cursor shows ↔ but no movement occurs" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.PanDeadzone" :step="1" min="0" max="500" />

                    <span class="s-label">Keyboard Pan Speed (px/s) <SettingHint tip="How fast ← / → pan the timeline while held; Shift triples it" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="local.KeyboardPanSpeed" :step="50" min="50" max="5000" />
                </div>

                <!-- NEW ITEMS -->
                <div class="section-title">New Items</div>
                <div class="settings-grid">
                    <span class="s-label">Default Item Color <SettingHint tip="Color pre-filled for every new item on this timeline" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="local.DefaultItemColor" />
                        <span class="color-hex">{{ local.DefaultItemColor }}</span>
                    </div>

                    <span class="s-label">Color Swatches <SettingHint tip="The quick-pick colors offered in the edit item window" /></span>
                    <button class="swatch-preview" type="button" title="Edit swatches" @click="showSwatchEditor = true">
                        <span v-for="(c, i) in swatches" :key="i" class="swatch-dot" :style="{ background: c }" />
                    </button>

                    <span class="s-label">Visible At <SettingHint tip="LOD levels a newly created item is visible at; changeable per item in the edit window" /></span>
                    <button class="lod-summary" type="button" title="Choose levels" @click="showLodPicker = true">{{ lodSummary }}</button>
                </div>

                <!-- FILTERING -->
                <div class="section-title">Filtering</div>
                <div class="settings-grid">
                    <span class="s-label">Filtered Items <SettingHint tip="How items excluded by active filters are displayed — hidden removes them; dimmed fades them out" /></span>
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

                <!-- ANIMATION -->
                <div class="section-title">Animation</div>
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

                <!-- WINDOW -->
                <div class="section-title">Window</div>
                <div class="settings-grid">
                    <span class="s-label">Fullscreen <SettingHint tip="Run the timeline window in borderless fullscreen mode" /></span>
                    <button class="toggle" :class="{ 'is-on': local.IsFullscreen }" type="button" @click="local.IsFullscreen = !local.IsFullscreen">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Title Header <SettingHint tip="The title strip above the timeline. Compact is a single small line with just the title; Hidden removes it (the title stays in the window's title bar)" /></span>
                    <select class="s-input s-input--narrow" v-model.number="local.HeaderMode">
                        <option :value="0">Full</option>
                        <option :value="1">Compact</option>
                        <option :value="2">Hidden</option>
                    </select>

                    <span class="s-label">Custom Scaling <SettingHint :tip="`Zoom this window — the same zoom ${MOD}+mouse wheel drives, remembered per timeline. F10 toggles it.`" /></span>
                    <button class="toggle" :class="{ 'is-on': local.UseCustomScaling }" type="button" @click="local.UseCustomScaling = !local.UseCustomScaling">
                        <span class="toggle-thumb" />
                    </button>

                    <template v-if="local.UseCustomScaling">
                        <span class="s-label">Scale Factor (×) <SettingHint tip="Zoom factor applied to this window (1.0 = 100%, 2.0 = 200%)" /></span>
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
                            <input class="s-input" type="text" v-model="newPresetName" placeholder="My preset…" data-enter-self @keydown.enter="createPreset" @keydown.escape="showNewPreset = false" />
                            <button class="icon-btn icon-btn--ok" type="button" @click="createPreset">Create</button>
                        </div>
                    </template>
                </div>

                <!-- CANVAS -->
                <div class="section-title">Canvas</div>
                <div class="settings-grid">
                    <span class="s-label">Background Color <SettingHint tip="Background fill color of the entire timeline canvas area" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineCanvasBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineCanvasBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Edge Margin Width (px) <SettingHint tip="Pixel padding at the left and right edges of the canvas before the timeline content starts" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEdgeMarginWidth" :step="5" min="0" />
                </div>

                <!-- AXIS & TICKS -->
                <div class="section-title">Axis &amp; Ticks</div>
                <div class="settings-grid">
                    <span class="s-label">Axis Line Color <SettingHint tip="Color of the horizontal timeline axis line" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineAxisColor" />
                        <span class="color-hex">{{ localLayout.TimelineAxisColor }}</span>
                    </div>

                    <span class="s-label">Tick Distance (px) <SettingHint tip="Pixel distance between major time axis ticks. Used at every zoom level except the ones your calendar's LOD profile gives a distance of their own" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickDistance" :step="5" min="10" />

                    <span class="s-label">Tick Width (px) <SettingHint tip="Stroke width of tick marks on the timeline axis in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickWidth" :step="0.5" min="0.5" />

                    <span class="s-label">Tick Color <SettingHint tip="Color of the tick marks drawn on the timeline axis" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineTickColor" />
                        <span class="color-hex">{{ localLayout.TimelineTickColor }}</span>
                    </div>

                    <span class="s-label">Show Smaller Non-Year Ticks <SettingHint tip="Draw sub-year ticks (months, days) shorter than year-level ticks" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineNonYearTicksSmaller }" type="button" @click="localLayout.TimelineNonYearTicksSmaller = !localLayout.TimelineNonYearTicksSmaller">
                        <span class="toggle-thumb" />
                    </button>
                </div>

                <!-- TICK LABELS -->
                <div class="section-title">Tick Labels</div>
                <div class="settings-grid">
                    <span class="s-label">Font Family <SettingHint tip="Font used for date labels on the timeline axis" /></span>
                    <FontPicker v-model="localLayout.TimelineTickMarkerFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Style <SettingHint tip="Weight and slant of the axis date labels" /></span>
                    <select class="s-input" v-model="localLayout.TimelineTickMarkerFontStyle">
                        <option v-for="o in FONT_STYLES" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>

                    <span class="s-label">Font Size (px) <SettingHint tip="Font size of the date labels on the axis in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineTickMarkerFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Text Color <SettingHint tip="Color of the date labels on the timeline axis" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineTickMarkerTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineTickMarkerTextColor }}</span>
                    </div>

                    <span class="s-label">Draw Above Everything <SettingHint tip="Draw axis date labels above all other canvas elements including event boxes" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineTickMarkerTextAlwaysOnTop }" type="button" @click="localLayout.TimelineTickMarkerTextAlwaysOnTop = !localLayout.TimelineTickMarkerTextAlwaysOnTop">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Angled Labels <SettingHint tip="Lean axis date labels 45° so long dates do not run into each other when ticks are close together" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineTickMarkerTextAngled }" type="button" @click="localLayout.TimelineTickMarkerTextAngled = !localLayout.TimelineTickMarkerTextAngled">
                        <span class="toggle-thumb" />
                    </button>
                </div>

                <!-- EVENT BOXES -->
                <div class="section-title">Event Boxes</div>
                <div class="settings-grid">
                    <span class="s-label">Box Width (px) <SettingHint tip="Width in pixels of each event box on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxWidth" :step="10" min="50" />

                    <span class="s-label">Box Height (px) <SettingHint tip="Height in pixels of each event box on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxHeight" :step="5" min="20" />

                    <span class="s-label">Y Margin (px) <SettingHint tip="Vertical gap between event boxes when they stack on top of each other" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventYMargin" :step="1" min="0" />

                    <span class="s-label">Stem Offset (px) <SettingHint tip="Vertical offset of the stem line connecting the box to the timeline axis" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBoxStemOffset" :step="1" />

                    <span class="s-label">Background Color <SettingHint tip="Fill color of event boxes" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventBackgroundColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Border Color <SettingHint tip="Color of the event box outline; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="eventBorder.rgb" />
                        <input class="s-slider" type="range" v-model.number="eventBorder.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineEventBorderColor }}</span>
                    </div>

                    <span class="s-label">Border Width (px) <SettingHint tip="Thickness of the event box outline in pixels (0 = no border)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderWidth" :step="1" min="0" />

                    <span class="s-label">Corner Rounding (px) <SettingHint tip="Corner radius of event boxes in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventBorderRadius" :step="1" min="0" />

                    <span class="s-label">Font Family <SettingHint tip="Font used for text inside event boxes" /></span>
                    <FontPicker v-model="localLayout.TimelineEventFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Size (px) <SettingHint tip="Font size for text inside event boxes in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineEventFontSize" :step="1" min="6" max="48" />

                    <span class="s-label">Text Color <SettingHint tip="Color of the title text inside event boxes" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventTextColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventTextColor }}</span>
                    </div>

                    <span class="s-label">Truncate Long Titles <SettingHint tip="Cut long titles off with '…' instead of letting them overflow the box" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventTextUseEllipsis }" type="button" @click="localLayout.TimelineEventTextUseEllipsis = !localLayout.TimelineEventTextUseEllipsis">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Item Color <SettingHint tip="Display the item's assigned color as a stripe on the edge of the box" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColor }" type="button" @click="localLayout.TimelineEventBoxShowColor = !localLayout.TimelineEventBoxShowColor">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Item Color on Bottom <SettingHint tip="Show the item color stripe on the bottom edge instead of the left edge" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventBoxShowColorOnBottom }" type="button" @click="localLayout.TimelineEventBoxShowColorOnBottom = !localLayout.TimelineEventBoxShowColorOnBottom">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Highlight on Hover <SettingHint tip="Change the box border color when the mouse hovers over it" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineEventHasHoverHighlight }" type="button" @click="localLayout.TimelineEventHasHoverHighlight = !localLayout.TimelineEventHasHoverHighlight">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Hover Color <SettingHint tip="Border color applied to event boxes on mouse hover (requires Highlight on Hover)" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineEventHoverColor" />
                        <span class="color-hex">{{ localLayout.TimelineEventHoverColor }}</span>
                    </div>
                </div>

                <!-- PERIODS & AGES -->
                <div class="section-title">Periods &amp; Ages</div>
                <div class="settings-grid">
                    <span class="s-label">Age Height (px) <SettingHint tip="Height in pixels of age bars spanning the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeHeight" :step="5" min="10" />

                    <span class="s-label">Age Corner Rounding (px) <SettingHint tip="Corner radius of age bars in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineAgeCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Height (px) <SettingHint tip="Height in pixels of period bars on the canvas" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodHeight" :step="2" min="4" />

                    <span class="s-label">Period Corner Rounding (px) <SettingHint tip="Corner radius of period bars in pixels (0 = sharp corners)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodCornerRounding" :step="1" min="0" />

                    <span class="s-label">Period Y Margin (px) <SettingHint tip="Vertical spacing above and below period bars" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYMargin" :step="1" />

                    <span class="s-label">Period Y Offset (px) <SettingHint tip="Vertical shift applied to all period bars (positive = down)" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePeriodYOffset" :step="1" />
                </div>

                <!-- PICTURES & PORTRAITS -->
                <div class="section-title">Pictures &amp; Portraits</div>
                <div class="settings-grid">
                    <span class="s-label">Picture Caption Size (px) <SettingHint tip="Font size of the caption strip across the bottom of a picture, in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelinePictureCaptionFontSize" :step="1" min="4" max="48" />

                    <span class="s-label">Portrait Caption Size (px) <SettingHint tip="Font size of the caption under a character portrait, in pixels. Generated titles like 'The birth of …' need a smaller one than event text" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineCharacterCaptionFontSize" :step="1" min="4" max="48" />
                </div>

                </div><!-- end canvas tab -->

                <!-- ── OVERLAYS TAB ────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'overlays'">

                <!-- NOW LINE -->
                <div class="section-title">Now Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Now Line <SettingHint tip="Show a vertical marker line at the current 'now' year set for this timeline" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLine }" type="button" @click="localLayout.TimelineShowNowLine = !localLayout.TimelineShowNowLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Show Label <SettingHint tip="Draw the word “Now” beside the line, at the top and bottom of the canvas" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowNowLineText }" type="button" @click="localLayout.TimelineShowNowLineText = !localLayout.TimelineShowNowLineText">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Line Color <SettingHint tip="Color of the now line and its label" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineNowLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineNowLineColor }}</span>
                    </div>

                    <span class="s-label">Line Style <SettingHint tip="Whether the now line is drawn solid, dashed or dotted" /></span>
                    <select class="s-input" v-model="localLayout.TimelineNowLineStyle">
                        <option v-for="o in LINE_STYLES" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>

                    <span class="s-label">Line Width (px) <SettingHint tip="Stroke width of the now line in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineNowLineWidth" :step="1" min="1" />
                </div>

                <!-- HOVER LINE -->
                <div class="section-title">Hover Line</div>
                <div class="settings-grid">
                    <span class="s-label">Show Hover Line <SettingHint tip="Show a vertical line that follows the mouse cursor across the canvas" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineShowHoverLine }" type="button" @click="localLayout.TimelineShowHoverLine = !localLayout.TimelineShowHoverLine">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Line Color <SettingHint tip="Color of the cursor hover line" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.TimelineHoverLineColor" />
                        <span class="color-hex">{{ localLayout.TimelineHoverLineColor }}</span>
                    </div>

                    <span class="s-label">Line Style <SettingHint tip="Whether the hover line is drawn solid, dashed or dotted" /></span>
                    <select class="s-input" v-model="localLayout.TimelineHoverLineStyle">
                        <option v-for="o in LINE_STYLES" :key="o.value" :value="o.value">{{ o.label }}</option>
                        <option v-if="strayStyle" :value="strayStyle">{{ strayStyle }}</option>
                    </select>

                    <span class="s-label">Line Width (px) <SettingHint tip="Stroke width of the hover line in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineHoverLineWidth" :step="1" min="1" />
                </div>

                <!-- DATA RANGE -->
                <div class="section-title">Data Range</div>
                <div class="settings-grid">
                    <span class="s-label">Show Data Range <SettingHint tip="Show the band down the middle of the canvas that marks the stretch of time the side panels are reading" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineIsDataRangeVisible }" type="button" @click="localLayout.TimelineIsDataRangeVisible = !localLayout.TimelineIsDataRangeVisible">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Band Width (px) <SettingHint tip="Width of the band in pixels. It also sets how much of the timeline the side panels list — the notes, gallery and data panels all show the items inside this band" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.TimelineDataRangeWidth" :step="10" min="20" />

                    <span class="s-label">Band Color <SettingHint tip="Fill color of the data range band; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="dataRange.rgb" />
                        <input class="s-slider" type="range" v-model.number="dataRange.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineDataRangeColor }}</span>
                    </div>
                </div>

                <!-- CALENDAR BANDS -->
                <div class="section-title">Calendar Bands</div>
                <div class="settings-grid">
                    <span class="s-label">Show Calendar Bands <SettingHint tip="Draw alternating semi-transparent calendar bands over the timeline canvas to show time divisions" /></span>
                    <button class="toggle" :class="{ 'is-on': localLayout.TimelineCalendarOverlayEnabled }" type="button" @click="localLayout.TimelineCalendarOverlayEnabled = !localLayout.TimelineCalendarOverlayEnabled">
                        <span class="toggle-thumb" />
                    </button>

                    <span class="s-label">Season / Year Color <SettingHint tip="Color of alternating season or year bands; the slider is its opacity, and a low one keeps the effect subtle" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="bandSeason.rgb" />
                        <input class="s-slider" type="range" v-model.number="bandSeason.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlaySeasonColor }}</span>
                    </div>

                    <span class="s-label">Month Color <SettingHint tip="Color of alternating month bands; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="bandMonth.rgb" />
                        <input class="s-slider" type="range" v-model.number="bandMonth.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayMonthColor }}</span>
                    </div>

                    <span class="s-label">Week Color <SettingHint tip="Color of alternating week bands; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="bandWeek.rgb" />
                        <input class="s-slider" type="range" v-model.number="bandWeek.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayWeekColor }}</span>
                    </div>

                    <span class="s-label">Day Color <SettingHint tip="Color of alternating day bands, only visible at high zoom; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="bandDay.rgb" />
                        <input class="s-slider" type="range" v-model.number="bandDay.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineCalendarOverlayDayColor }}</span>
                    </div>
                </div>

                <!-- TIME BREAKS -->
                <div class="section-title">Time Breaks</div>
                <div class="settings-grid">
                    <span class="s-label">Fill Color <SettingHint tip="Background fill of collapsed time-break strips; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="breakFill.rgb" />
                        <input class="s-slider" type="range" v-model.number="breakFill.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineBreakFillColor }}</span>
                    </div>

                    <span class="s-label">Border Color <SettingHint tip="Color of the left and right border lines of a collapsed time-break strip; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="breakBorder.rgb" />
                        <input class="s-slider" type="range" v-model.number="breakBorder.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.TimelineBreakBorderColor }}</span>
                    </div>
                </div>

                <!-- MEASUREMENT -->
                <div class="section-title">Measurement</div>
                <div class="settings-grid">
                    <span class="s-label">Line Color <SettingHint tip="Color of the dotted bracket shown when measurement points are set" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.MeasureLineColor" />
                        <span class="color-hex">{{ localLayout.MeasureLineColor }}</span>
                    </div>
                </div>

                </div><!-- end overlays tab -->

                <!-- ── PANELS TAB ──────────────────────────────────────────────── -->
                <div v-show="showAll || activeTab === 'panels'">

                <!-- NOTES PANEL -->
                <div class="section-title">Notes Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background Color <SettingHint tip="Background color of the notes panel area" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Card Background Color <SettingHint tip="Background color of individual note cards" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelCardBackgroundColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelCardBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Text Color <SettingHint tip="Color of note body text" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelTextColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelTextColor }}</span>
                    </div>

                    <span class="s-label">Heading Color <SettingHint tip="Color of headings and field labels within note cards" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelHeadingColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelHeadingColor }}</span>
                    </div>

                    <span class="s-label">Accent Color <SettingHint tip="Accent color used for highlights and active states in the notes panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.NotesPanelAccentColor" />
                        <span class="color-hex">{{ localLayout.NotesPanelAccentColor }}</span>
                    </div>

                    <span class="s-label">Font Size (px) <SettingHint tip="Base font size for text in the notes panel in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.NotesPanelFontSize" :step="1" min="9" max="24" />
                </div>

                <!-- GALLERY PANEL -->
                <div class="section-title">Gallery Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background Color <SettingHint tip="Background color of the image gallery panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Border Color <SettingHint tip="Color of borders and dividers between gallery items" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelBorderColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelBorderColor }}</span>
                    </div>

                    <span class="s-label">Text Color <SettingHint tip="Color of image captions and labels in the gallery panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.GalleryPanelTextColor" />
                        <span class="color-hex">{{ localLayout.GalleryPanelTextColor }}</span>
                    </div>
                </div>

                <!-- CALENDAR PANEL -->
                <div class="section-title">Calendar Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background Color <SettingHint tip="Background color of the calendar panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Border Color <SettingHint tip="Color of grid lines between days, weeks, and months in the calendar" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelBorderColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelBorderColor }}</span>
                    </div>

                    <span class="s-label">Text Color <SettingHint tip="Color of day numbers, weekday headers, and month labels" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.CalendarPanelTextColor" />
                        <span class="color-hex">{{ localLayout.CalendarPanelTextColor }}</span>
                    </div>

                    <span class="s-label">Week Highlight Color <SettingHint tip="Background highlight for the row containing the current week; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="calWeekHl.rgb" />
                        <input class="s-slider" type="range" v-model.number="calWeekHl.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.CalendarPanelWeekHighlightColor }}</span>
                    </div>

                    <span class="s-label">Day Highlight Color <SettingHint tip="Background highlight for the current day cell; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="calDayHl.rgb" />
                        <input class="s-slider" type="range" v-model.number="calDayHl.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.CalendarPanelDayHighlightColor }}</span>
                    </div>
                </div>

                <!-- DATA PANEL -->
                <div class="section-title">Data Panel</div>
                <div class="settings-grid">
                    <span class="s-label">Background Color <SettingHint tip="Background color of the data / export panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelBackgroundColor" />
                        <span class="color-hex">{{ localLayout.DataPanelBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Card Background Color <SettingHint tip="Background color of individual item cards in the data panel; the slider is its opacity" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="dataCard.rgb" />
                        <input class="s-slider" type="range" v-model.number="dataCard.alpha" min="0" max="255" />
                        <span class="color-hex">{{ localLayout.DataPanelCardBackgroundColor }}</span>
                    </div>

                    <span class="s-label">Age Title Color <SettingHint tip="Color of the top-level age headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH1Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH1Color }}</span>
                    </div>

                    <span class="s-label">Period Title Color <SettingHint tip="Color of period-level headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH2Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH2Color }}</span>
                    </div>

                    <span class="s-label">Item Title Color <SettingHint tip="Color of item-level headings in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH3Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH3Color }}</span>
                    </div>

                    <span class="s-label">Description Color <SettingHint tip="Color of description / body text in the data panel" /></span>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="localLayout.DataPanelH4Color" />
                        <span class="color-hex">{{ localLayout.DataPanelH4Color }}</span>
                    </div>

                    <span class="s-label">Font Family <SettingHint tip="Font used throughout the data panel" /></span>
                    <FontPicker v-model="localLayout.DataPanelFontFamily" :fonts="systemFonts" />

                    <span class="s-label">Font Size (px) <SettingHint tip="Base font size for the data panel in pixels" /></span>
                    <input class="s-input s-input--narrow" type="number" v-model.number="localLayout.DataPanelFontSize" :step="1" min="9" max="24" />
                </div>

                </div><!-- end panels tab -->
                <p v-if="saveError" class="error-msg">{{ saveError }}</p>

            </div>

        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="emit('close')">Cancel</button>
            <button class="btn btn-save" data-primary :disabled="isSaving" @click="save">
                {{ isSaving ? 'Saving…' : 'Save Changes' }}
            </button>
        </template>
    </BaseModal>
    <SwatchEditorModal v-if="showSwatchEditor" v-model="swatches" @close="showSwatchEditor = false" />
    <LodMaskModal
        v-if="showLodPicker" v-model="defaultLodMask" :lodProfile="store.lodProfile"
        title="New Items Visible At" hint="Newly created items start out visible at these zoom levels."
        @close="showLodPicker = false"
    />
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

// Both open a modal; styled as a soft chip rather than a button so they read as values
.swatch-preview,
.lod-summary {
    justify-self: start;
    padding: 6px 10px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 6px;
    background: color-mix(in srgb, var(--app-accent, #4a90d9) 10%, var(--app-surface, #0c1524));
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;

    &:hover {
        border-color: var(--app-accent, #4a90d9);
        background: color-mix(in srgb, var(--app-accent, #4a90d9) 18%, var(--app-surface, #0c1524));
    }
}

.swatch-preview {
    display: flex;
    gap: 5px;
}

.swatch-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.lod-summary {
    font-size: 0.8rem;
    color: var(--app-text, #e2e8f0);
    text-align: left;
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

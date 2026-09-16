import type { ChromeTheme } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { onMounted } from 'vue'
import { invalidateCanvasThemeCache } from './canvasTheme'

export const DARK_PRESET: ChromeTheme = {
    tbBgFrom:        '#060c19',
    tbBgTo:          '#0a1424',
    tbBorderColor:   'rgba(79, 70, 229, 0.18)',
    tbText:          '#8ea5c0',
    tbSub:           '#3d5166',
    tbBtnColor:      '#3d5166',
    tbBtnHoverColor: '#8ca5bc',
    tbBtnHoverBg:    'rgba(255, 255, 255, 0.07)',
    tbOrb1:          '#4338ca',
    tbOrb2:          '#818cf8',
    appBg:            '#0f172a',
    appSurface:       '#0c1524',
    appSurfaceRaised: '#141e33',
    appSurfaceHigh:   '#1e2b44',
    appBorder:        '#2d3a56',
    appText:          '#e2e8f0',
    appTextMuted:     '#94a3b8',
    appTextDim:       '#4a6080',
    appAccent:        '#6366f1',
    appAccentHover:   '#818cf8',
    appSaveAccent:    '#446b40',
    appSaveAccentHover: '#52804c',
    appToolActiveColor:  '#86efac',
    appToolActiveBorder: '#4ade80',
    filterPanelBg:     '#111a11',
    filterPanelBorder: '#2a4a2a',
    filterChipColor:   '#7a9a7a',
    filterChipBorder:  '#3a5a3a',
    appRadius:   '8px',
    appRadiusSm: '4px',
    appRadiusLg: '12px',
}

export const LIGHT_PRESET: ChromeTheme = {
    tbBgFrom:        '#f0ecfb',
    tbBgTo:          '#e8e2f5',
    tbBorderColor:   'rgba(120, 100, 190, 0.22)',
    tbText:          '#2d2060',
    tbSub:           '#7a6aac',
    tbBtnColor:      '#9585c4',
    tbBtnHoverColor: '#2d2060',
    tbBtnHoverBg:    'rgba(99, 102, 241, 0.1)',
    tbOrb1:          '#4338ca',
    tbOrb2:          '#818cf8',
    appBg:            '#f0edf9',
    appSurface:       '#f9f7fe',
    appSurfaceRaised: '#f4f1fb',
    appSurfaceHigh:   '#e8e4f5',
    appBorder:        '#c8baec',
    appText:          '#1e1640',
    appTextMuted:     '#5b4d8a',
    appTextDim:       '#8b7ab8',
    appAccent:        '#6366f1',
    appAccentHover:   '#4f46e5',
    appSaveAccent:    '#3a7a36',
    appSaveAccentHover: '#4a9445',
    appToolActiveColor:  '#166534',
    appToolActiveBorder: '#16a34a',
    filterPanelBg:     '#e8f5e8',
    filterPanelBorder: '#a8d5a8',
    filterChipColor:   '#2d6b2d',
    filterChipBorder:  '#7ab87a',
    appRadius:   '8px',
    appRadiusSm: '4px',
    appRadiusLg: '12px',
}

export function applyAppTheme(theme: ChromeTheme) {
    invalidateCanvasThemeCache()
    const r = document.documentElement
    r.style.setProperty('--tb-bg-from',         theme.tbBgFrom)
    r.style.setProperty('--tb-bg-to',           theme.tbBgTo)
    r.style.setProperty('--tb-border-color',    theme.tbBorderColor)
    r.style.setProperty('--tb-text',            theme.tbText)
    r.style.setProperty('--tb-sub',             theme.tbSub)
    r.style.setProperty('--tb-btn-color',       theme.tbBtnColor)
    r.style.setProperty('--tb-btn-hover-color', theme.tbBtnHoverColor)
    r.style.setProperty('--tb-btn-hover-bg',    theme.tbBtnHoverBg)
    r.style.setProperty('--tb-orb-1',           theme.tbOrb1)
    r.style.setProperty('--tb-orb-2',           theme.tbOrb2)
    r.style.setProperty('--app-bg',             theme.appBg)
    r.style.setProperty('--app-surface',        theme.appSurface)
    r.style.setProperty('--app-surface-raised', theme.appSurfaceRaised)
    r.style.setProperty('--app-surface-high',   theme.appSurfaceHigh)
    r.style.setProperty('--app-border',         theme.appBorder)
    r.style.setProperty('--app-text',           theme.appText)
    r.style.setProperty('--app-text-muted',     theme.appTextMuted)
    r.style.setProperty('--app-text-dim',       theme.appTextDim)
    r.style.setProperty('--app-accent',            theme.appAccent)
    r.style.setProperty('--app-accent-hover',      theme.appAccentHover)
    r.style.setProperty('--app-save-accent',       theme.appSaveAccent)
    r.style.setProperty('--app-save-accent-hover', theme.appSaveAccentHover)
    r.style.setProperty('--app-tool-active-color',  theme.appToolActiveColor  ?? '#86efac')
    r.style.setProperty('--app-tool-active-border', theme.appToolActiveBorder ?? '#4ade80')
    r.style.setProperty('--filter-panel-bg',     theme.filterPanelBg     ?? '#111a11')
    r.style.setProperty('--filter-panel-border', theme.filterPanelBorder ?? '#2a4a2a')
    r.style.setProperty('--filter-chip-color',   theme.filterChipColor   ?? '#7a9a7a')
    r.style.setProperty('--filter-chip-border',  theme.filterChipBorder  ?? '#3a5a3a')
    r.style.setProperty('--app-radius',            theme.appRadius)
    r.style.setProperty('--app-radius-sm',      theme.appRadiusSm)
    r.style.setProperty('--app-radius-lg',      theme.appRadiusLg)
}

export function useAppTheme() {
    onMounted(async () => {
        const cfg = await BackendAPI.GetAppConfig()
        if (!cfg?.themeInitialized) {
            // Use the OS registry value (passed from C#) — more reliable than
            // window.matchMedia inside WebView2, which doesn't always match the OS.
            const prefersDark = cfg?.systemPrefersDark ?? window.matchMedia('(prefers-color-scheme: dark)').matches
            const preset = prefersDark ? DARK_PRESET : LIGHT_PRESET
            applyAppTheme(preset)
            await BackendAPI.SaveChromeTheme(preset)
        } else if (cfg?.chromeTheme) {
            applyAppTheme(cfg.chromeTheme)
        }
    })
}

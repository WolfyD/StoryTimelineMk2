import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        GetCalendarById: vi.fn().mockResolvedValue(null),
        SaveCalendar: vi.fn().mockResolvedValue({ status: 'ok' }),
        GetAppConfig: vi.fn().mockResolvedValue({ themeInitialized: true }),
        WindowGetMaximized: vi.fn().mockResolvedValue({ isMaximized: false }),
        WindowGetTopMost: vi.fn().mockResolvedValue({ isTopmost: false }),
        send: vi.fn(),
        request: vi.fn(),
    },
}))

// CalendarApp uses window.location.search to detect new vs existing calendar.
// With no ?calendarId param it treats the form as a new calendar (no API call on mount).
Object.defineProperty(window, 'location', {
    value: { ...window.location, search: '' },
    writable: true,
    configurable: true,
})

import CalendarApp from '@/pages/CalendarApp.vue'

function mountApp() {
    return mount(CalendarApp, {
        global: { plugins: [createPinia()] },
    })
}

describe('CalendarApp — new calendar', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
    })

    // ── Basic rendering ────────────────────────────────────────────────────────

    it('renders the calendar editor for a new calendar', async () => {
        const wrapper = mountApp()
        await flushPromises()
        expect(wrapper.find('.cal-root').exists()).toBe(true)
        wrapper.unmount()
    })

    it('renders the LOD Profile section', async () => {
        const wrapper = mountApp()
        await flushPromises()
        expect(wrapper.text()).toContain('LOD Profile')
        wrapper.unmount()
    })

    it('renders the Seasons section', async () => {
        const wrapper = mountApp()
        await flushPromises()
        expect(wrapper.text()).toContain('Seasons')
        wrapper.unmount()
    })

    it('renders the Memorable Days section', async () => {
        const wrapper = mountApp()
        await flushPromises()
        expect(wrapper.text()).toContain('Memorable Days')
        wrapper.unmount()
    })

    // ── Auto LOD ───────────────────────────────────────────────────────────────

    it('Auto LOD button exists in LOD section', async () => {
        const wrapper = mountApp()
        await flushPromises()
        // "Auto LOD" button text
        const buttons = wrapper.findAll('button')
        const autoLodBtn = buttons.find(b => b.text().includes('Auto LOD'))
        expect(autoLodBtn).toBeDefined()
        wrapper.unmount()
    })

    it('autoSetLod produces MILLENNIA, CENTURIES, DECADES, YEARS levels', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.autoSetLod()
        const keys = vm.lodLevels.map((l: any) => l.formatKey)
        expect(keys).toContain('MILLENNIA')
        expect(keys).toContain('CENTURIES')
        expect(keys).toContain('DECADES')
        expect(keys).toContain('YEARS')
        wrapper.unmount()
    })

    it('autoSetLod adds MONTHS level when months are defined', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        // Default new calendar has 12 months
        expect(vm.months.length).toBeGreaterThan(0)
        vm.autoSetLod()
        const keys = vm.lodLevels.map((l: any) => l.formatKey)
        expect(keys).toContain('MONTHS')
        wrapper.unmount()
    })

    it('autoSetLod sets MONTHS stepFraction = 1/numMonths', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.autoSetLod()
        const monthsLod = vm.lodLevels.find((l: any) => l.formatKey === 'MONTHS')
        expect(monthsLod).toBeDefined()
        expect(monthsLod.stepFraction).toBeCloseTo(1 / vm.months.length)
        wrapper.unmount()
    })

    it('autoSetLod resets lodManuallyEdited to false', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.lodManuallyEdited = true
        vm.autoSetLod()
        expect(vm.lodManuallyEdited).toBe(false)
        wrapper.unmount()
    })

    // ── LOD validation ─────────────────────────────────────────────────────────

    it('save() sets error when LOD has no levels', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.lodLevels = []
        await vm.save()
        expect(vm.saveError).toContain('LOD Profile must have at least one level')
        wrapper.unmount()
    })

    it('save() sets error when YEARS level is missing', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.lodLevels = [{ index: 0, formatKey: 'MONTHS', stepFraction: 1 / 12 }]
        await vm.save()
        expect(vm.saveError).toContain('YEARS')
        wrapper.unmount()
    })

    // ── Season DOY calculation ─────────────────────────────────────────────────

    it('applySeasonDOY distributes seasons evenly from the given start day', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any

        // Set up 4 seasons on a 200-day year
        vm.yearLength = 200
        vm.hasSeasons = true
        vm.seasons = [
            { name: 'Spring', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'Summer', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'Autumn', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'Winter', shortName: '', start: 0, end: 0, significance: '' },
        ]
        // Start of first season: display day 1 = index 0
        vm.seasonStartInput = 1
        vm.applySeasonDOY()

        // Each season should be 50 days
        expect(vm.seasons[0].start).toBe(0)
        expect(vm.seasons[0].end).toBe(49)
        expect(vm.seasons[1].start).toBe(50)
        expect(vm.seasons[1].end).toBe(99)
        expect(vm.seasons[2].start).toBe(100)
        expect(vm.seasons[2].end).toBe(149)
        expect(vm.seasons[3].start).toBe(150)
        expect(vm.seasons[3].end).toBe(199)
        wrapper.unmount()
    })

    it('applySeasonDOY respects a non-zero start day and wraps last season', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any

        vm.yearLength = 200
        vm.hasSeasons = true
        vm.seasons = [
            { name: 'A', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'B', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'C', shortName: '', start: 0, end: 0, significance: '' },
            { name: 'D', shortName: '', start: 0, end: 0, significance: '' },
        ]
        vm.seasonStartInput = 21 // 1-indexed, so index 20
        vm.applySeasonDOY()

        expect(vm.seasons[0].start).toBe(20)
        expect(vm.seasons[1].start).toBe(70)
        expect(vm.seasons[2].start).toBe(120)
        expect(vm.seasons[3].start).toBe(170)
        // Season D ends just before Season A restarts: (170+50-1) % 200 = 219 % 200 = 19
        expect(vm.seasons[3].end).toBe(19)
        wrapper.unmount()
    })

    // ── Memorable Days ─────────────────────────────────────────────────────────

    it('addMemorableDay adds an entry to memorableDays', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        expect(vm.memorableDays.length).toBe(0)
        vm.addMemorableDay()
        expect(vm.memorableDays.length).toBe(1)
        wrapper.unmount()
    })

    it('addMemorableDay defaults type to fixed and weekDays to empty', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.addMemorableDay()
        expect(vm.memorableDays[0].type).toBe('fixed')
        expect(vm.memorableDays[0].weekDays).toEqual([])
        wrapper.unmount()
    })

    it('removeMemorableDay removes the correct entry', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.addMemorableDay()
        vm.addMemorableDay()
        const secondId = vm.memorableDays[1].id
        vm.removeMemorableDay(0)
        expect(vm.memorableDays.length).toBe(1)
        expect(vm.memorableDays[0].id).toBe(secondId)
        wrapper.unmount()
    })

    it('memorable day is included in YearDefinition JSON when present', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.hasMemorableDays = true
        vm.addMemorableDay()
        vm.memorableDays[0].name = 'New Year'
        const yd = JSON.parse(vm.buildYearDefinition())
        expect(yd.memorable_days).toBeDefined()
        expect(yd.memorable_days[0].name).toBe('New Year')
        wrapper.unmount()
    })

    // ── Season track ───────────────────────────────────────────────────────────

    it('seasonSegments is empty when hasSeasons is false', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.hasSeasons = false
        expect(vm.seasonSegments.length).toBe(0)
        wrapper.unmount()
    })

    it('seasonSegments has one segment per season with correct length', async () => {
        const wrapper = mountApp()
        await flushPromises()
        const vm = wrapper.vm as any
        vm.hasSeasons = true
        vm.yearLength = 120
        vm.seasons = [
            { name: 'Spring', shortName: '', start: 0, end: 39, significance: '' },
            { name: 'Summer', shortName: '', start: 40, end: 79, significance: '' },
            { name: 'Autumn', shortName: '', start: 80, end: 119, significance: '' },
        ]
        const segs = vm.seasonSegments
        expect(segs.length).toBe(3)
        expect(segs[0].length).toBe(40) // 39 - 0 + 1
        expect(segs[1].length).toBe(40)
        expect(segs[2].length).toBe(40)
        wrapper.unmount()
    })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarDayPicker from '@/components/CalendarDayPicker.vue'

const MONTHS_SHORT = [
    { name: 'January',  length: 30 },
    { name: 'February', length: 28 },
    { name: 'March',    length: 31 },
]

function mountPicker(overrides: Record<string, unknown> = {}) {
    return mount(CalendarDayPicker, {
        props: {
            startMonth: 0,
            startDay: 1,
            endMonth: 0,
            endDay: 1,
            isRange: false,
            months: MONTHS_SHORT,
            weekLength: 7,
            weekendDays: [5, 6],
            ...overrides,
        },
    })
}

describe('CalendarDayPicker', () => {

    // ── Rendering ──────────────────────────────────────────────────────────────

    it('renders the component', () => {
        const w = mountPicker()
        expect(w.find('.cal-picker').exists()).toBe(true)
        w.unmount()
    })

    it('shows the current month name', () => {
        const w = mountPicker({ startMonth: 0 })
        expect(w.find('.month-label').text()).toBe('January')
        w.unmount()
    })

    it('renders 7 column headers for weekLength 7', () => {
        const w = mountPicker()
        expect(w.findAll('th').length).toBe(7)
        w.unmount()
    })

    it('renders custom day labels in column headers', () => {
        const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
        const w = mountPicker({ dayLabels: labels })
        const headers = w.findAll('th').map(th => th.text())
        expect(headers).toEqual(labels)
        w.unmount()
    })

    it('falls back to D1…D7 headers when no dayLabels provided', () => {
        const w = mountPicker({ weekLength: 3 })
        const headers = w.findAll('th').map(th => th.text())
        expect(headers).toEqual(['D1', 'D2', 'D3'])
        w.unmount()
    })

    it('renders a button for every day in the month', () => {
        const w = mountPicker({ startMonth: 0 }) // January = 30 days
        expect(w.findAll('.day-btn').length).toBe(30)
        w.unmount()
    })

    it('marks weekend columns with .weekend on headers', () => {
        const w = mountPicker({ weekendDays: [5, 6] })
        const ths = w.findAll('th')
        expect(ths[5].classes()).toContain('weekend')
        expect(ths[6].classes()).toContain('weekend')
        expect(ths[0].classes()).not.toContain('weekend')
        w.unmount()
    })

    // ── Month navigation ───────────────────────────────────────────────────────

    it('prev button is disabled on the first month', () => {
        const w = mountPicker({ startMonth: 0 })
        const btns = w.findAll('.nav-btn')
        expect(btns[0].attributes('disabled')).toBeDefined()
        w.unmount()
    })

    it('next button is disabled on the last month', () => {
        const w = mountPicker({ startMonth: 2 })
        const btns = w.findAll('.nav-btn')
        expect(btns[1].attributes('disabled')).toBeDefined()
        w.unmount()
    })

    it('clicking next navigates to the next month', async () => {
        const w = mountPicker({ startMonth: 0 })
        await w.findAll('.nav-btn')[1].trigger('click')
        expect(w.find('.month-label').text()).toBe('February')
        w.unmount()
    })

    it('clicking prev navigates to the previous month', async () => {
        const w = mountPicker({ startMonth: 2 })
        await w.findAll('.nav-btn')[0].trigger('click')
        expect(w.find('.month-label').text()).toBe('February')
        w.unmount()
    })

    it('navigating to Feb shows 28 day buttons', async () => {
        const w = mountPicker({ startMonth: 0 })
        await w.findAll('.nav-btn')[1].trigger('click')
        expect(w.findAll('.day-btn').length).toBe(28)
        w.unmount()
    })

    // ── Day selection (single) ─────────────────────────────────────────────────

    it('marks the startDay with .selected class when not range', () => {
        const w = mountPicker({ startMonth: 0, startDay: 5, isRange: false })
        const selected = w.findAll('.day-btn').find(b => b.classes('selected'))
        expect(selected).toBeDefined()
        expect(selected!.text()).toBe('5')
        w.unmount()
    })

    it('emits select with the clicked day (single mode)', async () => {
        const w = mountPicker()
        const dayBtns = w.findAll('.day-btn')
        await dayBtns[9].trigger('click') // clicks day 10 (offset accounts for startOffset)
        const emitted = w.emitted('select')
        expect(emitted).toBeTruthy()
        expect((emitted![0][0] as any).startDay).toBe(10)
        w.unmount()
    })

    it('emitted select sets endMonth/endDay same as start in single mode', async () => {
        const w = mountPicker()
        await w.findAll('.day-btn')[2].trigger('click')
        const payload = w.emitted('select')![0][0] as any
        expect(payload.startMonth).toBe(payload.endMonth)
        expect(payload.startDay).toBe(payload.endDay)
        w.unmount()
    })

    // ── Range selection ────────────────────────────────────────────────────────

    it('shows range-hint when isRange is true', () => {
        const w = mountPicker({ isRange: true })
        expect(w.find('.range-hint').exists()).toBe(true)
        w.unmount()
    })

    it('range-hint says "Click start date" initially', () => {
        const w = mountPicker({ isRange: true })
        expect(w.find('.range-hint').text()).toContain('start')
        w.unmount()
    })

    it('first click in range mode sets start and switches hint to end', async () => {
        const w = mountPicker({ isRange: true })
        await w.findAll('.day-btn')[4].trigger('click')
        expect(w.find('.range-hint').text()).toContain('end')
        w.unmount()
    })

    it('second click in range mode emits full range', async () => {
        const w = mountPicker({ isRange: true })
        const btns = w.findAll('.day-btn')
        await btns[4].trigger('click') // start = day 5
        await btns[9].trigger('click') // end = day 10
        const emissions = w.emitted('select')!
        const last = emissions[emissions.length - 1][0] as any
        expect(last.startDay).toBeLessThanOrEqual(last.endDay)
        w.unmount()
    })

    it('in-range days get .in-range class between is-start and is-end', () => {
        const w = mountPicker({ isRange: true, startMonth: 0, startDay: 3, endMonth: 0, endDay: 7 })
        const dayBtns = w.findAll('.day-btn')
        // day 5 and 6 should be in-range (between 3 and 7)
        const day5 = dayBtns.find(b => b.text() === '5')
        expect(day5?.classes()).toContain('in-range')
        w.unmount()
    })

    // ── No-months edge case ────────────────────────────────────────────────────

    it('shows no-months-note when months array is empty', () => {
        const w = mountPicker({ months: [] })
        expect(w.find('.no-months-note').exists()).toBe(true)
        w.unmount()
    })
})

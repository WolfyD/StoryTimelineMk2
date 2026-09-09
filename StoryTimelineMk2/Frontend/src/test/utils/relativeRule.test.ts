import { describe, it, expect } from 'vitest'
import { describeRule, defaultRelativeRule } from '@/utils/relativeRule'
import type { RelativeRule, DescribeContext } from '@/utils/relativeRule'

const CTX: DescribeContext = {
    seasonNames: ['Winter', 'Spring', 'Summer', 'Autumn'],
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'],
    dayLabels: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    memDayNames: { 'easter-id': 'Easter Sunday', 'solstice-id': 'Winter Solstice' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function rule(overrides: Partial<RelativeRule>): RelativeRule {
    return { ...defaultRelativeRule(), ...overrides }
}

// ── Period base, no weekday search ────────────────────────────────────────────

describe('describeRule — period base, no weekday', () => {
    it('start of every month (no offset)', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 0 }), CTX))
            .toBe('The start of every month')
    })

    it('start of every year (no offset)', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'year', offsetDays: 0 }), CTX))
            .toBe('The start of every year')
    })

    it('start of a specific month (no offset)', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: 10, offsetDays: 0 }), CTX))
            .toBe('The start of November')
    })

    it('offset N days after start of month', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 4 }), CTX))
            .toBe('4 days after the start of every month')
    })

    it('singular "day" when offset is 1', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 1 }), CTX))
            .toBe('1 day after the start of every month')
    })
})

// ── Period base WITH weekday search ───────────────────────────────────────────

describe('describeRule — period base, weekday search', () => {
    it('first Monday of every month', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 0, weekdays: [1], ordinal: 1 }), CTX))
            .toBe('The first Monday of every month')
    })

    it('third Thursday of every month', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 0, weekdays: [4], ordinal: 3 }), CTX))
            .toBe('The third Thursday of every month')
    })

    it('last Sunday of every year', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'year', offsetDays: 0, weekdays: [0], ordinal: -1 }), CTX))
            .toBe('The last Sunday of every year')
    })

    it('first Monday of November', () => {
        expect(describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: 10, offsetDays: 0, weekdays: [1], ordinal: 1 }), CTX))
            .toBe('The first Monday of November')
    })

    it('multiple weekdays — Sunday and Monday', () => {
        const r = describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 0, weekdays: [0, 1], ordinal: 1 }), CTX)
        expect(r).toContain('Sunday and Monday')
    })

    it('three weekdays uses commas + and', () => {
        const r = describeRule(rule({ baseType: 'period', periodType: 'month', periodMonth: null, offsetDays: 0, weekdays: [1, 3, 5], ordinal: 1 }), CTX)
        expect(r).toContain('Monday, Wednesday and Friday')
    })
})

// ── Anchor base, no weekday search ────────────────────────────────────────────

describe('describeRule — anchor base, no weekday', () => {
    it('on the start of Spring (no offset)', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 1, offsetDays: 0 }), CTX))
            .toBe('The start of Spring')
    })

    it('on the end of Summer (no offset)', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'season-end', anchorIndex: 2, offsetDays: 0 }), CTX))
            .toBe('The end of Summer')
    })

    it('1 day before start of Winter', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 0, offsetDays: -1 }), CTX))
            .toBe('1 day before the start of Winter')
    })

    it('3 days after end of Autumn', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'season-end', anchorIndex: 3, offsetDays: 3 }), CTX))
            .toBe('3 days after the end of Autumn')
    })

    it('on a memorable day (no offset)', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'memorable-day', anchorId: 'easter-id', offsetDays: 0 }), CTX))
            .toBe('Easter Sunday')
    })

    it('1 day after a memorable day', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'memorable-day', anchorId: 'easter-id', offsetDays: 1 }), CTX))
            .toBe('1 day after Easter Sunday')
    })

    it('falls back gracefully for missing season name', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 99, offsetDays: 0 }), CTX)
        expect(r).toContain('Season 100')
    })

    it('falls back for unknown memorable day id', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'memorable-day', anchorId: 'unknown', offsetDays: 0 }), CTX)
        expect(r).toBe('a memorable day')
    })
})

// ── Anchor base WITH weekday search (Easter pattern) ──────────────────────────

describe('describeRule — anchor base, weekday search (Easter-style)', () => {
    it('first Sunday on or after the start of Spring', () => {
        expect(describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 1, offsetDays: 0, weekdays: [0], ordinal: 1 }), CTX))
            .toBe('The first Sunday on or after the start of Spring')
    })

    it('first Sunday and Monday on or after anchor — span 2', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 1, offsetDays: 0, weekdays: [0, 1], ordinal: 1, span: 2 }), CTX)
        expect(r).toBe('The first Sunday and Monday on or after the start of Spring, lasting 2 days')
    })

    it('second Monday on or after 2 days after Easter', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'memorable-day', anchorId: 'easter-id', offsetDays: 2, weekdays: [1], ordinal: 2 }), CTX)
        expect(r).toBe('The second Monday on or after 2 days after Easter Sunday')
    })
})

// ── Span ──────────────────────────────────────────────────────────────────────

describe('describeRule — span', () => {
    it('span 1 adds nothing to the description', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 1, offsetDays: 0, span: 1 }), CTX)
        expect(r).not.toContain('lasting')
    })

    it('span 2 appends "lasting 2 days"', () => {
        const r = describeRule(rule({ baseType: 'anchor', anchorType: 'season-start', anchorIndex: 1, offsetDays: 0, weekdays: [0], ordinal: 1, span: 2 }), CTX)
        expect(r).toContain(', lasting 2 days')
    })

    it('span 1 day is singular', () => {
        // span=1 is not appended, but if we ever call with span=1 in the phrase it's fine
        const r = describeRule(rule({ span: 1, baseType: 'period', periodType: 'year', offsetDays: 0 }), CTX)
        expect(r).not.toContain('lasting')
    })
})

// ── defaultRelativeRule ────────────────────────────────────────────────────────

describe('defaultRelativeRule', () => {
    it('returns a valid rule with expected defaults', () => {
        const r = defaultRelativeRule()
        expect(r.baseType).toBe('period')
        expect(r.periodType).toBe('month')
        expect(r.periodMonth).toBeNull()
        expect(r.offsetDays).toBe(0)
        expect(r.span).toBe(1)
    })

    it('produces a describable rule without crashing', () => {
        expect(() => describeRule(defaultRelativeRule(), CTX)).not.toThrow()
    })
})

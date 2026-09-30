import { describe, it, expect } from 'vitest'
import { lifeMarks } from '@/utils/calendarMath'
import type { CharacterItem, LodLevel } from '@/types/models'

// BL-88: birthdays and death anniversaries on the year calendar.
const LOD: LodLevel[] = [
    { index: 5, formatKey: 'months', stepFraction: 1 / 12 },
    { index: 9, formatKey: 'days', stepFraction: 1 / 365 },
]
const MONTHS = [{ startDay: 0 }, { startDay: 31 }]   // day 40 is the 10th of the second month
const at = (year: number, day: number) => year + day / 365
const who = (c: Partial<CharacterItem>) => ({
    Name: 'Mira', Color: '#f00', AbsoluteStart: null, AbsoluteEnd: null,
    BirthGranularity: 9, DeathGranularity: 9, ...c,
}) as CharacterItem

describe('lifeMarks', () => {
    const mira = who({ AbsoluteStart: at(1400, 40) })
    const aldric = who({ Name: 'Aldric', AbsoluteStart: at(1300, 100), AbsoluteEnd: at(1405, 50) })
    const marks = (year: number, cast = [mira, aldric], show?: { birth: boolean; death: boolean }) =>
        lifeMarks(cast, year, 365, MONTHS, LOD, show)

    it('gives the living a birthday with the age they turn, on their day', () => {
        expect(marks(1430, [mira])).toEqual({ 1: { 10: [{ kind: 'birth', color: '#f00', title: 'Mira turns 30' }] } })
        expect(marks(1400, [mira])[1]![10]![0]!.title).toBe('Mira is born')
        expect(marks(1399, [mira])).toEqual({})
    })

    it('stops the birthdays at the death and starts the anniversaries the year after', () => {
        expect(marks(1404, [aldric])[1]![70]![0]!.title).toBe('Aldric turns 104')   // day 100: still alive for it
        expect(marks(1405, [aldric])).toEqual({})                    // died on day 50, before the birthday
        expect(marks(1406, [aldric])[1]![20]![0]!.title).toBe('Aldric died 1 year ago')
        expect(marks(1430, [aldric])[1]![20]![0]!.title).toBe('Aldric died 25 years ago')
    })

    it('shows nothing for a date not picked down to the day', () => {
        expect(marks(1430, [who({ AbsoluteStart: at(1400, 40), BirthGranularity: 5 })])).toEqual({})
        expect(marks(1430, [who({ AbsoluteEnd: at(1405, 50), DeathGranularity: 5 })])).toEqual({})
    })

    it('hides each kind on its own', () => {
        const kinds = (show: { birth: boolean; death: boolean }) =>
            Object.values(marks(1430, [mira, aldric], show)).flatMap(d => Object.values(d)).flat().map(m => m.kind)
        expect(kinds({ birth: true, death: false })).toEqual(['birth'])
        expect(kinds({ birth: false, death: true })).toEqual(['death'])
    })
})

import { describe, it, expect } from 'vitest'
import { planGeneratedItems, buildGeneratedItem, characterAbsolute } from '@/utils/characterItems'
import type { CharacterItem, LodLevel } from '@/types/models'

const LOD: LodLevel[] = [
	{ index: 3, formatKey: 'years', stepFraction: 1 },
	{ index: 5, formatKey: 'months', stepFraction: 1 / 12 },
]

function character(overrides: Partial<CharacterItem> = {}): CharacterItem {
	return {
		Id: 'c1',
		Name: 'Anna Vas',
		FirstName: 'Anna',
		LastName: 'Vas',
		Nicknames: null,
		Aliases: null,
		Race: null,
		Description: null,
		Notes: null,
		BirthYear: null,
		BirthDate: null,
		BirthAlternativeYear: null,
		DeathYear: null,
		DeathDate: null,
		DeathAlternativeYear: null,
		BirthSubtick: 0,
		BirthGranularity: 3,
		DeathSubtick: 0,
		DeathGranularity: 3,
		Color: '#abcdef',
		Importance: 5,
		PortraitPictureId: null,
		PortraitPath: null,
		State: null,
		ShowOnTimeline: false,
		UseHighlightColor: false,
		BirthItemId: null,
		DeathItemId: null,
		TimelineId: 7,
		...overrides,
	}
}

describe('planGeneratedItems', () => {
	it('gives an id to each end that has a date, and drops nothing', () => {
		const c = character({ ShowOnTimeline: true, BirthYear: 100, DeathYear: 160 })
		expect(planGeneratedItems(c)).toEqual([])
		expect(c.BirthItemId).toBeTruthy()
		expect(c.DeathItemId).toBeTruthy()
		expect(c.BirthItemId).not.toBe(c.DeathItemId)
	})

	it('keeps ids it already has, so an edit updates the item instead of making a second one', () => {
		const c = character({ ShowOnTimeline: true, BirthYear: 100, BirthItemId: 'existing' })
		expect(planGeneratedItems(c)).toEqual([])
		expect(c.BirthItemId).toBe('existing')
	})

	it('hands back the ids to delete when the box is unticked', () => {
		const c = character({ ShowOnTimeline: false, BirthYear: 100, DeathYear: 160, BirthItemId: 'b', DeathItemId: 'd' })
		expect(planGeneratedItems(c)).toEqual(['b', 'd'])
		expect(c.BirthItemId).toBeNull()
		expect(c.DeathItemId).toBeNull()
	})

	it('drops only the end whose date was cleared', () => {
		const c = character({ ShowOnTimeline: true, BirthYear: 100, DeathYear: null, BirthItemId: 'b', DeathItemId: 'd' })
		expect(planGeneratedItems(c)).toEqual(['d'])
		expect(c.BirthItemId).toBe('b')
		expect(c.DeathItemId).toBeNull()
	})
})

// The lifeline reads these directly: it has to start and end at the right time even when the
// character owns no items, and an unset date is an open end rather than year 0.
describe('characterAbsolute', () => {
	it('returns null for a date that is not set', () => {
		const c = character({ BirthYear: 100, DeathYear: null })
		expect(characterAbsolute('Birth', c, LOD)).toBeCloseTo(100)
		expect(characterAbsolute('Death', c, LOD)).toBeNull()
	})

	it('lands on the same time as the generated item', () => {
		const c = character({ BirthYear: 100, BirthSubtick: 3, BirthGranularity: 5 })
		expect(characterAbsolute('Birth', c, LOD)).toBe(buildGeneratedItem('Birth', c, 'i', LOD).AbsoluteStart)
	})
})

describe('buildGeneratedItem', () => {
	it('places the item at year + subtick * the granularity step', () => {
		const c = character({ BirthYear: 100, BirthSubtick: 3, BirthGranularity: 5 })
		const item = buildGeneratedItem('Birth', c, 'item-1', LOD)
		expect(item.AbsoluteStart).toBeCloseTo(100.25)
		expect(item.AbsoluteStart).toBe(item.AbsoluteEnd)
		expect(item.Year).toBe(100)
		expect(item.Title).toBe('Birth of Anna Vas')
		expect(item.TypeId).toBe(7)
		expect(item.Color).toBe('#abcdef')
		expect(item.TimelineId).toBe(7)
	})

	it('falls back to whole years when the granularity is not in the profile', () => {
		const c = character({ DeathYear: 160, DeathSubtick: 2, DeathGranularity: 99 })
		const item = buildGeneratedItem('Death', c, 'item-2', LOD)
		expect(item.AbsoluteStart).toBe(162)
	})
})

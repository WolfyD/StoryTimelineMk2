import { describe, it, expect } from 'vitest'
import { planGeneratedItems, buildGeneratedItem, characterAbsolute } from '@/utils/characterItems'
import type { CharacterItem } from '@/types/models'

function character(overrides: Partial<CharacterItem> = {}): CharacterItem {
	return {
		Id: 'c1',
		Name: 'Anna Vas',
		FirstName: 'Anna',
		LastName: 'Vas',
		Nicknames: null,
		Aliases: null,
		Race: null,
		Faction: null,
		Description: null,
		Notes: null,
		BirthYear: null,
		BirthDate: null,
		BirthAlternativeYear: null,
		DeathYear: null,
		DeathDate: null,
		DeathAlternativeYear: null,
		BirthGranularity: 3,
		DeathGranularity: 3,
		AbsoluteStart: null,
		AbsoluteEnd: null,
		Color: '#abcdef',
		Importance: 5,
		PortraitPictureId: null,
		PortraitPath: null,
		State: null,
		Gender: null,
		ShowOnTimeline: false,
		UseHighlightColor: false,
		BirthItemId: null,
		DeathItemId: null,
		BirthLocationId: null,
		DeathLocationId: null,
		Shared: false,
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
		const c = character({ BirthYear: 100, AbsoluteStart: 100, DeathYear: null })
		expect(characterAbsolute('Birth', c)).toBeCloseTo(100)
		expect(characterAbsolute('Death', c)).toBeNull()
	})

	it('lands on the same time as the generated item', () => {
		const c = character({ BirthYear: 100, AbsoluteStart: 100.25, BirthGranularity: 5 })
		expect(characterAbsolute('Birth', c)).toBe(buildGeneratedItem('Birth', c, 'i').AbsoluteStart)
	})

	it('reads the year when the row predates the absolute columns', () => {
		expect(characterAbsolute('Birth', character({ BirthYear: 100 }))).toBe(100)
	})
})

describe('buildGeneratedItem', () => {
	it('places the item where the character says it is', () => {
		const c = character({ BirthYear: 100, AbsoluteStart: 100.25, BirthGranularity: 5 })
		const item = buildGeneratedItem('Birth', c, 'item-1')
		expect(item.AbsoluteStart).toBeCloseTo(100.25)
		expect(item.AbsoluteStart).toBe(item.AbsoluteEnd)
		expect(item.Year).toBe(100)
		expect(item.CreationGranularity).toBe(5)
		expect(item.Title).toBe('Birth of Anna Vas')
		expect(item.TypeId).toBe(7)
		expect(item.Color).toBe('#abcdef')
		expect(item.TimelineId).toBe(7)
	})

	it('sits on the year when the character carries no absolute', () => {
		const item = buildGeneratedItem('Death', character({ DeathYear: 160 }), 'item-2')
		expect(item.AbsoluteStart).toBe(160)
	})
})

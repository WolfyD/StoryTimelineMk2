import { describe, it, expect } from 'vitest'
import {
	blankRelation,
	familyGuesses,
	genderKey,
	pairKey,
	relationLabel,
	relationOtherId,
	relationWhen,
	qualify,
	sameFamily,
	slugifyTypeId,
} from '@/utils/characterRelations'
import { blankCharacter } from '@/utils/characterItems'
import type { CharacterItem, RelationshipType } from '@/types/models'

const PARENT: RelationshipType = {
	Id: 'parent',
	Name: 'Parent / child',
	Type: 'family',
	AToB: 'parent of',
	BToA: 'child of',
	AToBF: 'mother of',
	AToBM: 'father of',
	BToAF: 'daughter of',
	BToAM: 'son of',
	OneWay: 0,
}

function person(id: string, lastName: string, birth: number | null = null): CharacterItem {
	return { ...blankCharacter(1), Id: id, LastName: lastName, BirthYear: birth }
}

const rel = (...args: Parameters<typeof blankRelation>) => blankRelation(...args)

function pair(a: string, b: string) {
	return { ...rel('x', 1, 'parent'), Character1Id: a, Character2Id: b }
}

describe('relationLabel', () => {
	// One row says both things, which is the whole reason there is no mirror row.
	it('reads the kind from whichever end is asking', () => {
		const r = pair('anna', 'bela')
		expect(relationLabel(r, 'anna', PARENT)).toBe('parent of')
		expect(relationLabel(r, 'bela', PARENT)).toBe('child of')
	})

	it('falls back to the name, then to the raw id when the kind is gone', () => {
		const r = pair('anna', 'bela')
		expect(relationLabel(r, 'anna', { ...PARENT, AToB: null })).toBe('Parent / child')
		expect(relationLabel(r, 'anna', undefined)).toBe('parent')
	})

	// The subject's gender picks the word, and only where the kind has one to pick.
	it('uses the gendered word when the subject has a gender the kind knows', () => {
		const r = pair('anna', 'bela')
		expect(relationLabel(r, 'anna', PARENT, 'female')).toBe('mother of')
		expect(relationLabel(r, 'bela', PARENT, 'male')).toBe('son of')
	})

	it('stays neutral for a gender it does not recognise, or a kind with no gendered word', () => {
		const r = pair('anna', 'bela')
		expect(relationLabel(r, 'anna', PARENT, 'non-binary')).toBe('parent of')
		expect(relationLabel(r, 'anna', PARENT, 'Kithborn')).toBe('parent of')
		expect(relationLabel(r, 'anna', { ...PARENT, AToBF: null }, 'female')).toBe('parent of')
	})
})

describe('genderKey', () => {
	it('matches whole words only — female is not a kind of male', () => {
		expect(genderKey('Female')).toBe('F')
		expect(genderKey(' male ')).toBe('M')
		expect(genderKey('female')).not.toBe('M')
	})

	it('is null for anything else, including nothing', () => {
		for (const g of [null, undefined, '', 'intersex', 'other', 'agender'])
			expect(genderKey(g)).toBeNull()
	})
})

describe('sameFamily', () => {
	it('finds the others with the same last name, and nobody when there is no name', () => {
		const anna = person('anna', 'Ravenhold')
		const crew = [anna, person('bela', 'ravenhold'), person('cid', 'Other'), person('dun', '')]
		expect(sameFamily(anna, crew).map(c => c.Id)).toEqual(['bela'])
		expect(sameFamily(person('dun', ''), crew)).toEqual([])
	})
})

describe('familyGuesses', () => {
	it('reads a generation between two births as parent and child, older first', () => {
		const [g] = familyGuesses([person('kid', 'R', 420), person('mum', 'R', 390)])
		expect(g).toEqual({ aId: 'mum', bId: 'kid', kind: 'parent' })
	})

	it('reads a smaller gap, or an unknown year, as siblings', () => {
		expect(familyGuesses([person('a', 'R', 400), person('b', 'R', 410)])[0].kind).toBe('sibling')
		expect(familyGuesses([person('a', 'R', 400), person('b', 'R', null)])[0].kind).toBe('sibling')
	})

	it('covers every pair once', () => {
		const guesses = familyGuesses([person('a', 'R'), person('b', 'R'), person('c', 'R')])
		expect(new Set(guesses.map(g => pairKey(g.aId, g.bId))).size).toBe(3)
	})
})

describe('relationOtherId', () => {
	it('picks the end that is not the focus', () => {
		expect(relationOtherId(pair('anna', 'bela'), 'anna')).toBe('bela')
		expect(relationOtherId(pair('anna', 'bela'), 'bela')).toBe('anna')
	})
})

describe('relationWhen', () => {
	it('says nothing when the relation is implied by its kind', () => {
		expect(relationWhen(rel('anna', 1))).toBe('')
	})

	it('reads one open end as open', () => {
		expect(relationWhen({ ...rel('anna', 1), StartYear: 412 })).toBe('from 412')
		expect(relationWhen({ ...rel('anna', 1), EndYear: 460 })).toBe('until 460')
		expect(relationWhen({ ...rel('anna', 1), StartYear: 412, EndYear: 460 })).toBe('412 – 460')
	})

	it('treats year 0 as a date, not as absent', () => {
		expect(relationWhen({ ...rel('anna', 1), StartYear: 0 })).toBe('from 0')
	})
})

describe('slugifyTypeId', () => {
	it('slugs the name and suffixes a taken one', () => {
		expect(slugifyTypeId('Sworn enemy')).toBe('sworn-enemy')
		expect(slugifyTypeId('Parent / child')).toBe('parent-child')
		expect(slugifyTypeId('Rivals', ['rivals', 'rivals-2'])).toBe('rivals-3')
	})

	it('still produces an id when the name has nothing sluggable in it', () => {
		expect(slugifyTypeId('—')).toBe('kind')
	})
})

// BL-75: a degree and a modifier are two different words about the same tie, and they land in
// two different places in the sentence.
describe('qualify', () => {
	it('leaves a plain relation alone', () => {
		expect(qualify('parent of', null, null)).toBe('parent of')
		expect(qualify('parent of', '  ', '')).toBe('parent of')
	})

	it('prefixes a degree that ends in a hyphen, and follows the noun otherwise', () => {
		expect(qualify('sister of', 'half-', null)).toBe('half-sister of')
		expect(qualify('cousin of', 'once removed', null)).toBe('cousin once removed of')
		expect(qualify('cousin', 'once removed', null)).toBe('cousin once removed')
	})

	it('puts the modifier in front of the whole phrase', () => {
		expect(qualify('sister of', null, 'estranged')).toBe('estranged sister of')
		expect(qualify('sister of', 'half-', 'estranged')).toBe('estranged half-sister of')
	})
})

describe('relationLabel with meaning', () => {
	it('reads the degree and the modifier off the relation itself', () => {
		const r = { ...pair('anna', 'bela'), RelationshipDegree: 'step-', RelationshipModifier: 'former' }
		expect(relationLabel(r, 'anna', PARENT, 'female')).toBe('former step-mother of')
		expect(relationLabel(r, 'bela', PARENT)).toBe('former step-child of')
	})
})

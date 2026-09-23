import { describe, it, expect } from 'vitest'
import { findEntities, matchedEntityIds, type NamedEntity } from '@/utils/entityMatcher'

const anna: NamedEntity = { id: 'a', names: ['Anna Vas', 'Anna', 'Vas', 'Bookworm'] }
const reka: NamedEntity = { id: 'r', names: ['Réka', null, ''] }

describe('findEntities', () => {
	it('matches whole words only', () => {
		expect(matchedEntityIds('Anna waited.', [anna])).toEqual(['a'])
		expect(matchedEntityIds('Annabel waited.', [anna])).toEqual([])
		expect(matchedEntityIds('Vasarely painted it.', [anna])).toEqual([])
	})

	it('ignores case and keeps the text as written', () => {
		const [hit] = findEntities('ANNA and anna', [anna])
		expect(hit).toMatchObject({ id: 'a', text: 'ANNA', start: 0, end: 4 })
	})

	it('prefers the longest name on an overlap', () => {
		const hits = findEntities('Anna Vas arrived', [anna])
		expect(hits).toHaveLength(1)
		expect(hits[0]!.text).toBe('Anna Vas')
	})

	it('treats punctuation as a boundary but not letters in other scripts', () => {
		expect(matchedEntityIds('"Réka!", he said', [reka])).toEqual(['r'])
		expect(matchedEntityIds('Aréka is a place', [reka])).toEqual([])
	})

	it('skips one-letter names and empty input', () => {
		expect(findEntities('X marks it', [{ id: 'x', names: ['X'] }])).toEqual([])
		expect(findEntities('', [anna])).toEqual([])
		expect(findEntities('anything', [])).toEqual([])
	})

	it('returns each entity once, in first-appearance order', () => {
		expect(matchedEntityIds('Réka met Anna, and Anna met Réka.', [anna, reka])).toEqual(['r', 'a'])
	})
})

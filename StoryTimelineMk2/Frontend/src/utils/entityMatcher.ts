/**
 * BL-15 phase 2: finds entity names in free text. Deliberately name-list generic — characters
 * today, place names when BL-16 lands ("Clockwork went to Taiom" matching both lists at once).
 */

export interface NamedEntity {
	id: string
	/** Every name this entity answers to. Blank entries are ignored, so callers can spread fields. */
	names: (string | null | undefined)[]
	color?: string | null
}

export interface EntityMatch {
	id: string
	/** Index into the text the match was found in. */
	start: number
	end: number
	/** The matched text as it was written — a name is matched case-insensitively. */
	text: string
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// \b only knows ASCII word characters, so "Réka" would match inside "Réka's" but also inside
// "Aréka". These lookarounds are the same idea with every script's letters and digits.
const EDGE = '[\\p{L}\\p{N}_]'

/**
 * Every whole-word occurrence of any entity name, in the order they appear. Overlaps go to the
 * longest name — "Anna Vas" wins over "Anna" — and single letters are skipped as noise.
 */
export function findEntities(text: string, entities: NamedEntity[]): EntityMatch[] {
	if (!text) return []

	const byName = new Map<string, string>() // lowercased name → entity id
	for (const entity of entities) {
		for (const raw of entity.names) {
			const name = (raw ?? '').trim()
			if (name.length > 1 && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), entity.id)
		}
	}
	if (!byName.size) return []

	const alternatives = [...byName.keys()]
		.sort((a, b) => b.length - a.length)
		.map(escapeRe)
		.join('|')
	const re = new RegExp(`(?<!${EDGE})(?:${alternatives})(?!${EDGE})`, 'giu')

	const found: EntityMatch[] = []
	for (const m of text.matchAll(re)) {
		const id = byName.get(m[0].toLowerCase())
		if (id) found.push({ id, start: m.index, end: m.index + m[0].length, text: m[0] })
	}
	return found
}

/** The distinct entities present in the text, in first-appearance order. */
export function matchedEntityIds(text: string, entities: NamedEntity[]): string[] {
	return [...new Set(findEntities(text, entities).map(m => m.id))]
}

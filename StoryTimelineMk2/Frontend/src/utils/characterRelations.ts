/**
 * BL-15 phase 4 / BL-17: reading a relation from one end of it. A relation is stored once per
 * pair, so every one of these is asked from the point of view of whoever's panel is open.
 */
import type { CharacterItem, CharacterRelationship, RelationshipType } from '@/types/models'

/** The end of the pair that is not the character whose panel this is. */
export function relationOtherId(rel: CharacterRelationship, focusId: string): string {
	return rel.Character1Id === focusId ? rel.Character2Id : rel.Character1Id
}

// Only the words English has relation words for. Matched whole, never by substring: 'female'
// ends in 'male'. Anything else — a word from the writer's own world, or nothing at all — reads
// neutrally, which is what the unlisted genders in the picker are for.
const FEMALE = new Set(['f', 'female', 'woman', 'girl', 'she', 'she/her', 'trans woman'])
const MALE = new Set(['m', 'male', 'man', 'boy', 'he', 'he/him', 'trans man'])

/** Which gendered wording a character takes, or null for the neutral phrase. */
export function genderKey(gender: string | null | undefined): 'F' | 'M' | null {
	const g = (gender ?? '').trim().toLowerCase()
	if (FEMALE.has(g)) return 'F'
	if (MALE.has(g)) return 'M'
	return null
}

/**
 * How the relation reads from `focusId`'s end — 'parent of' one way, 'child of' the other, and
 * 'mother of' where the subject's gender and the kind both have a word for it. Falls back to the
 * kind's name when it has no wording, and to the raw id when the kind is gone: a deleted kind
 * should leave the relation readable, not blank.
 */
export function relationLabel(
	rel: CharacterRelationship,
	focusId: string,
	type: RelationshipType | undefined,
	gender: string | null = null,
): string {
	if (!type) return rel.RelationshipType
	const dir = rel.Character1Id === focusId ? 'AToB' : 'BToA'
	const key = genderKey(gender)
	const base = ((key && type[`${dir}${key}`]) || type[dir] || type.Name).trim()
	return qualify(base, rel.RelationshipDegree, rel.RelationshipModifier)
}

/** State words a relation can carry. Free text underneath, so a world can use its own. */
export const RELATION_MODIFIERS = ['estranged', 'secret', 'adoptive', 'former', 'alleged']

/** Genealogical qualifiers. A trailing '-' prefixes the kind; the rest follow it. */
export const RELATION_DEGREES = ['half-', 'step-', 'great-', 'once removed', 'twice removed']

/**
 * The kind's wording with its degree and modifier folded in: 'half-' prefixes ('half-sister of'),
 * anything else follows the noun and before 'of' ('cousin once removed of'), and the modifier
 * leads the whole phrase ('estranged half-sister of'). Either may be blank, which is the norm.
 */
export function qualify(
	label: string,
	degree: string | null | undefined,
	modifier: string | null | undefined,
): string {
	let out = label
	const d = degree?.trim()
	if (d) {
		const reads = out.endsWith(' of')
		out = d.endsWith('-') ? d + out : `${reads ? out.slice(0, -3) : out} ${d}${reads ? ' of' : ''}`
	}
	const m = modifier?.trim()
	return m ? `${m} ${out}` : out
}

/**
 * When the relation held, in years — the same coarse reading the appearance rows use. Empty when
 * neither end is dated, which is the normal case: most relations are implied by their kind.
 */
export function relationWhen(rel: CharacterRelationship): string {
	const { StartYear: s, EndYear: e } = rel
	if (s !== null && e !== null) return `${s} – ${e}`
	if (s !== null) return `from ${s}`
	if (e !== null) return `until ${e}`
	return ''
}

/** A new relation from `focusId`, undated: the pair goes in the order the sentence reads. */
export function blankRelation(
	focusId: string,
	timelineId: number,
	relationshipType = '',
): CharacterRelationship {
	return {
		Id: 0,
		Character1Id: focusId,
		Character2Id: '',
		RelationshipType: relationshipType,
		Notes: null,
		StartYear: null,
		StartGranularity: 3,
		EndYear: null,
		EndGranularity: 3,
		AbsoluteStart: null,
		AbsoluteEnd: null,
		RelationshipStrength: 50,
		RelationshipModifier: null,
		RelationshipDegree: null,
		TimelineId: timelineId,
	}
}

/**
 * A kind's id is its name, slugged — readable in the database and stable once saved, since
 * relations store it. Suffixed rather than overwritten when the slug is already taken.
 */
export function slugifyTypeId(name: string, taken: Iterable<string> = []): string {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'kind'
	const used = new Set(taken)
	let id = base
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`
	return id
}

// ── Families ─────────────────────────────────────────────────────────────────

/** Everyone else who shares this character's last name; empty when they have none to share. */
export function sameFamily(character: CharacterItem, characters: CharacterItem[]): CharacterItem[] {
	const key = character.LastName?.trim().toLowerCase() ?? ''
	if (!key) return []
	return characters.filter(c => c.Id !== character.Id && c.LastName?.trim().toLowerCase() === key)
}

/** A guessed relation between two of them, for the user to correct before it is saved. */
export interface FamilyGuess {
	/** The pair in the order the kind reads: for 'parent', A is the parent. */
	aId: string
	bId: string
	kind: string
}

/** A gap this wide between two births reads as a generation rather than a sibling gap. */
export const GENERATION_YEARS = 16

/**
 * Every pair in a family, with a kind guessed from the years between their births. It is only a
 * guess — an aunt looks exactly like a mother from here — so every row is editable and nothing
 * is saved until it is ticked. An unknown birth year reads as siblings, the weaker claim.
 */
export function familyGuesses(members: CharacterItem[]): FamilyGuess[] {
	const out: FamilyGuess[] = []
	for (const [i, a] of members.entries()) {
		for (const b of members.slice(i + 1)) {
			const gap =
				a.BirthYear !== null && b.BirthYear !== null ? b.BirthYear - a.BirthYear : 0
			if (gap >= GENERATION_YEARS) out.push({ aId: a.Id, bId: b.Id, kind: 'parent' })
			else if (-gap >= GENERATION_YEARS) out.push({ aId: b.Id, bId: a.Id, kind: 'parent' })
			else out.push({ aId: a.Id, bId: b.Id, kind: 'sibling' })
		}
	}
	return out
}

/** Order-independent key for a pair, so already-related pairs can be spotted. */
export function pairKey(aId: string, bId: string): string {
	return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`
}

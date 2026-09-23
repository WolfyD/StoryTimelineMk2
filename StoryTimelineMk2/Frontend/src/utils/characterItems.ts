/**
 * BL-15: the birth and death items a character owns when *Show on timeline* is ticked. They are
 * generated rather than edited, so the character stays the single source of truth — editing a
 * date moves the item, unticking the box deletes both.
 */
import type { CharacterItem, LodLevel, TimelineItem } from '@/types/models'
import type { NamedEntity } from '@/utils/entityMatcher'

/** A character as the name matcher sees them: every name they answer to, in one list. */
export function characterEntity(c: CharacterItem): NamedEntity {
	const list = (field: string | null) => (field ?? '').split(',')
	return {
		id: c.Id,
		names: [c.Name, c.FirstName, c.LastName, ...list(c.Nicknames), ...list(c.Aliases)],
		color: c.Color,
	}
}

export type DateKind = 'Birth' | 'Death'

/**
 * A character with nothing filled in. The id is made here rather than backend-side because the
 * generated birth and death items have to name it before anything is written.
 */
export function blankCharacter(timelineId: number): CharacterItem {
	return {
		Id: crypto.randomUUID(),
		Name: '', FirstName: '', LastName: '',
		Nicknames: null, Aliases: null, Race: null, Description: null, Notes: null,
		BirthYear: null, BirthDate: null, BirthAlternativeYear: null,
		DeathYear: null, DeathDate: null, DeathAlternativeYear: null,
		BirthSubtick: 0, BirthGranularity: 3, DeathSubtick: 0, DeathGranularity: 3,
		Color: '#6366f1', Importance: 5,
		PortraitPictureId: null, PortraitPath: null,
		State: null, ShowOnTimeline: false, UseHighlightColor: false, BirthItemId: null, DeathItemId: null,
		TimelineId: timelineId,
	}
}

/**
 * Decides which generated items the character should own, *before* it is written — so one save
 * stores the ids rather than a save, a sync and a second save. Mutates the two id fields and
 * returns the ids that are no longer wanted, which the character itself no longer remembers.
 */
export function planGeneratedItems(character: CharacterItem): string[] {
	const dropped: string[] = []
	for (const kind of ['Birth', 'Death'] as const) {
		const idKey = `${kind}ItemId` as const
		const year = kind === 'Birth' ? character.BirthYear : character.DeathYear
		if (character.ShowOnTimeline && year !== null) {
			character[idKey] ??= crypto.randomUUID()
		} else if (character[idKey]) {
			dropped.push(character[idKey]!)
			character[idKey] = null
		}
	}
	return dropped
}

/**
 * The absolute time of one end of a character's life, or null when that date is unset. The same
 * year + subtick × step an item carries, so a lifeline lands on its own birth item to the pixel —
 * and still knows where to start when *Show on timeline* is off and there is no item at all.
 */
export function characterAbsolute(kind: DateKind, c: CharacterItem, lodProfile: LodLevel[]): number | null {
	const year = kind === 'Birth' ? c.BirthYear : c.DeathYear
	if (year === null) return null
	const subtick = kind === 'Birth' ? c.BirthSubtick : c.DeathSubtick
	const granularity = kind === 'Birth' ? c.BirthGranularity : c.DeathGranularity
	return year + subtick * (lodProfile.find(l => l.index === granularity)?.stepFraction ?? 1)
}

/** The item for one end of a character's life, positioned the way the item editor positions one. */
export function buildGeneratedItem(
	kind: DateKind,
	character: CharacterItem,
	itemId: string,
	lodProfile: LodLevel[],
): TimelineItem {
	const year = (kind === 'Birth' ? character.BirthYear : character.DeathYear)!
	const granularity = kind === 'Birth' ? character.BirthGranularity : character.DeathGranularity
	const absolute = characterAbsolute(kind, character, lodProfile)!

	return {
		Id: itemId,
		Title: `${kind} of ${character.Name}`,
		Description: '',
		Content: '',
		StoryId: null,
		// Type 7 = Character: the canvas draws these as a round portrait rather than a box.
		TypeId: 7,
		Year: year,
		EndYear: year,
		AbsoluteStart: absolute,
		AbsoluteEnd: absolute,
		BookTitle: '',
		Chapter: '',
		Page: '',
		Color: character.Color || '#6366f1',
		CreationGranularity: granularity,
		TimelineId: character.TimelineId,
		ItemIndex: 0,
		Placement: 0,
		Centered: false,
		ShowTitle: true,
		ItemNotes: '',
		ShowInNotes: true,
		Importance: character.Importance,
		MinLodLevel: 3,
		LodVisibilityMask: 255,
	}
}

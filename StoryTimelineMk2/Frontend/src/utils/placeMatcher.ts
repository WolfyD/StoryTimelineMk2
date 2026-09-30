/**
 * BL-16: which place an item's text is talking about.
 *
 * Characters could be matched on the name alone because a character's name is a proper noun. Place
 * names are not — "Market", "Gate", "the docks" are words that turn up in prose meaning nothing — so a
 * bare name match here is a *candidate*, not a hit, and it has to earn its place.
 *
 * The phrase is never matched. "the Helim market", "the market in Helim" and "the market on the
 * outskirts of Helim" are the same shape once you stop reading them as phrases: the place's own name,
 * with an ancestor's name somewhere in the same sentence. So the tree does the disambiguating that
 * grammar would otherwise have to — which is also why no list of patterns appears below.
 *
 * ponytail: sentence scope, whole words, no stemming and no plurals. A writer who puts the qualifier
 * in the sentence before ("They went to Helim. He was born at the market.") gets no ancestor point;
 * paragraph scope is the upgrade if that turns out to be how people write.
 */
import type { MapItem } from '@/types/models'
import type { EntityMatch } from '@/utils/entityMatcher'
import { parentMapIds, trailToPlace } from '@/utils/mapTree'

/** One place the text appears to name, with the way down to it and why we believe it. */
export interface PlaceHit {
	id: string
	/** Root map → place, as `trailToPlace` gives it: what the chip shows, so two Markets are distinct. */
	trail: string[]
	score: number
	/** Where it was found, for highlighting the words that earned it. */
	match: EntityMatch
}

/** Below this a candidate is treated as an ordinary word that happens to be a place name. */
export const PLACE_SCORE_MIN = 2

/**
 * Words that put what follows somewhere. Not grammar — a lookup of the handful of prepositions a
 * writer actually reaches for, which is enough to tell "born at the market" from "the market crashed".
 */
const LOCATIONAL = new Set([
	'at', 'in', 'on', 'near', 'by', 'from', 'to', 'into', 'inside', 'outside',
	'within', 'around', 'through', 'toward', 'towards', 'of', 'past', 'beyond',
])

/**
 * Every whole-word occurrence of any place name, each paired with *every* place that answers to it.
 *
 * This is why `findEntities` is not used here: it keeps one entity per name, which is right for
 * characters and wrong for places, where two towns owning a Market is the ordinary case and the whole
 * thing the score below exists to settle. Longest name first, so "Bent Nail Yard" beats "Bent Nail".
 */
function namedPlaces(text: string, byName: Map<string, string[]>): { ids: string[]; match: EntityMatch }[] {
	const alternatives = [...byName.keys()]
		.filter(n => n.length > 1)
		.sort((a, b) => b.length - a.length)
		.map(escapeRe)
		.join('|')
	if (!alternatives) return []

	const re = new RegExp(`(?<!${EDGE})(?:${alternatives})(?!${EDGE})`, 'giu')
	const out = []
	for (const m of text.matchAll(re)) {
		const ids = byName.get(m[0].toLowerCase())
		if (ids) out.push({ ids, match: { id: ids[0]!, start: m.index, end: m.index + m[0].length, text: m[0] } })
	}
	return out
}

/** The sentence `at` falls in, as [start, end) into the text. */
function sentenceAround(text: string, at: number): [number, number] {
	let start = 0
	for (let i = at - 1; i >= 0; i--) {
		if (text[i] === '\n' || '.!?'.includes(text[i]!)) { start = i + 1; break }
	}
	let end = text.length
	for (let i = at; i < text.length; i++) {
		if (text[i] === '\n' || '.!?'.includes(text[i]!)) { end = i; break }
	}
	return [start, end]
}

const EDGE = '[\\p{L}\\p{N}_]'
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Where this name is written as a whole word in this stretch of text, or -1.
 *
 * ponytail: the first occurrence only. A sentence naming the same town twice, once as the qualifier
 * and once not, would measure to the wrong one — nobody writes that.
 */
const indexOfName = (stretch: string, name: string) =>
	stretch.search(new RegExp(`(?<!${EDGE})${escapeRe(name)}(?!${EDGE})`, 'iu'))

/**
 * Every place the text points at, best first. A candidate scores on four signals, and the one that
 * does the real work is the first: an ancestor's name standing in the same sentence.
 */
export function findPlaces(text: string, maps: MapItem[]): PlaceHit[] {
	if (!text?.trim()) return []

	const parents = parentMapIds(maps)
	const trails = new Map<string, string[]>()
	const byName = new Map<string, string[]>()
	for (const map of maps) {
		for (const loc of map.Locations) {
			trails.set(loc.Id, trailToPlace(maps, loc.Id, parents))
			const key = loc.Name.trim().toLowerCase()
			byName.set(key, [...(byName.get(key) ?? []), loc.Id])
		}
	}

	const hits: PlaceHit[] = []
	for (const { ids, match } of namedPlaces(text, byName)) {
		const [from, to] = sentenceAround(text, match.start)
		const sentence = text.slice(from, to)
		// Shared by every place of this name: how the words around it read.
		let common = 0
		// "born at the market" vs "the market crashed".
		const before = text.slice(Math.max(from, match.start - 40), match.start).trim().split(/\s+/)
		if (before.slice(-3).some(w => LOCATIONAL.has(w.toLowerCase().replace(/[^\p{L}]/gu, '')))) common += 1
		// Written as a name. Not at the start of a sentence, where every word is capitalised anyway.
		if (/^\p{Lu}/u.test(match.text) && text.slice(from, match.start).trim()) common += 1
		// A two-word name is rarely an accident, and a name only one place in the world answers to
		// cannot be the wrong place even when it is the wrong word.
		if (/\s/.test(match.text.trim())) common += 1
		if (ids.length === 1) common += 1

		const scored: { hit: PlaceHit; near: number }[] = []
		for (const id of ids) {
			const trail = trails.get(id)
			if (!trail?.length) continue
			// The whole idea: something this place hangs under is named in the same breath. It is also
			// the only signal that can tell two places of the same name apart — and each ancestor named
			// is one more step of the way down confirmed, so they *add up*. "The inn, in Country's City"
			// has two steps and beats "the inn in the Country", which has one, however the writer
			// happens to word it and however many qualifiers they pile on.
			const found = trail.slice(0, -1).map(name => indexOfName(sentence, name)).filter(i => i >= 0)
			const score = common + found.length * 2
			// How close the nearest of them stands to the name, to separate places the steps tie on:
			// "from Triboar to the market in Waterdeep" names both towns, but only one is by the market.
			const near = found.length ? Math.min(...found.map(i => Math.abs(i - (match.start - from)))) : Infinity
			if (score >= PLACE_SCORE_MIN) scored.push({ hit: { id, trail, score, match: { ...match, id } }, near })
		}
		// One word is one place. Where the qualifiers single one out it is the only candidate left; where
		// three inns are all equally "in the Country" they tie and all three are offered — but they are
		// still one word, and `HighlightedTextarea` paints the span once.
		const top = Math.max(...scored.map(s => s.hit.score))
		const best = scored.filter(s => s.hit.score === top)
		const nearest = Math.min(...best.map(s => s.near))
		hits.push(...best.filter(s => s.near === nearest).map(s => s.hit))
	}

	// Best hit per place, then drop the ones doing qualifier duty: where "Helim" and "Market" both
	// score and Helim is on Market's way down, the text is naming the market, not the town.
	const best = new Map<string, PlaceHit>()
	for (const hit of hits) {
		const had = best.get(hit.id)
		if (!had || hit.score > had.score) best.set(hit.id, hit)
	}
	const kept = [...best.values()]
	const survived = new Set(kept
		.filter(hit => !kept.some(other =>
			other !== hit && other.trail.slice(0, -1).includes(hit.trail[hit.trail.length - 1]!)))
		.map(hit => hit.id))

	// One place decides whether it is meant, on its best showing — but *every* scored mention of it
	// comes back, or naming it twice would underline it once. A caller wanting one row per place
	// takes the first of each: best first is what this order is for.
	return hits
		.filter(hit => survived.has(hit.id))
		.sort((a, b) => b.score - a.score || a.match.start - b.match.start)
}

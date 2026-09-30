/**
 * BL-16: how the map's "who to follow" list is cut up once there are more names in it than a reader
 * can scan. A hundred and fifty ticked boxes is a wall to be searched by eye; the same hundred and
 * fifty under the family or the faction they belong to is a list someone can find one person in.
 *
 * Pure, like the rest of the map's thinking: the sidebar only renders what comes out of here.
 */
import type { CharacterItem, CharacterRelationship, MapEventCast, RelationshipType } from '@/types/models'
import { categoryOf } from '@/utils/relationsGraph'

/** One section of the list: everyone who answered to the same label, in the order they came in. */
export interface CastGroup {
  key: string
  label: string
  members: MapEventCast[]
}

/**
 * Everyone joined by blood or marriage, however many steps apart, as one group per web: character id
 * → the id of whichever member the web was reached from. A brother's wife's mother is in the same
 * family you are, which is what "show me my family" means and what no single relation row says.
 *
 * Only the family kinds join. Left to every kind, one rivalry between two houses would fold both of
 * them — and then, one hop at a time, the whole cast — into a single group.
 */
export function kinGroups(
  relations: CharacterRelationship[],
  types: RelationshipType[],
): Map<string, string> {
  const kinds = new Map(types.map(t => [t.Id, t]))
  const near = new Map<string, string[]>()
  const join = (a: string, b: string) => near.set(a, [...(near.get(a) ?? []), b])
  for (const rel of relations) {
    if (categoryOf(kinds.get(rel.RelationshipType)) !== 'family') continue
    join(rel.Character1Id, rel.Character2Id)
    join(rel.Character2Id, rel.Character1Id)
  }

  const group = new Map<string, string>()
  for (const start of near.keys()) {
    if (group.has(start)) continue
    group.set(start, start)
    // Walked rather than recursed: a web is a graph with cycles in it by nature — two people are
    // each other's in-laws twice over the moment two families marry more than once.
    const queue = [start]
    while (queue.length) {
      for (const next of near.get(queue.pop()!) ?? []) {
        if (group.has(next)) continue
        group.set(next, start)
        queue.push(next)
      }
    }
  }
  return group
}

/**
 * What each family is called: the surname most of its members share, since a spouse who kept their
 * own should not rename the house. A family where nobody has a surname is named for whoever it was
 * walked from, which at least tells two of them apart.
 */
export function kinNames(characters: CharacterItem[], kin: Map<string, string>): Map<string, string> {
  const people = new Map(characters.map(c => [c.Id, c]))
  const tallies = new Map<string, Map<string, number>>()
  for (const [id, key] of kin) {
    const last = people.get(id)?.LastName?.trim()
    if (!last) continue
    const tally = tallies.get(key) ?? new Map<string, number>()
    tally.set(last, (tally.get(last) ?? 0) + 1)
    tallies.set(key, tally)
  }

  const out = new Map<string, string>()
  for (const key of new Set(kin.values())) {
    const best = [...(tallies.get(key) ?? [])].sort((a, b) => b[1] - a[1])[0]
    out.set(key, best ? best[0] : `${people.get(key)?.Name || 'Someone'}’s kin`)
  }
  return out
}

/**
 * The cast in sections. Groups keep the order their first member appeared in, so a list does not
 * reshuffle itself as the year runs, and whoever the label had nothing to say about goes last under
 * `rest` — a character with no family on record is still a character to find.
 */
export function groupCast(
  cast: MapEventCast[],
  labelOf: (who: MapEventCast) => string,
  rest = 'Everyone else',
): CastGroup[] {
  const groups = new Map<string, CastGroup>()
  for (const who of cast) {
    const label = labelOf(who).trim() || rest
    const group = groups.get(label) ?? { key: label, label, members: [] }
    group.members.push(who)
    groups.set(label, group)
  }
  const all = [...groups.values()]
  return [...all.filter(g => g.label !== rest), ...all.filter(g => g.label === rest)]
}

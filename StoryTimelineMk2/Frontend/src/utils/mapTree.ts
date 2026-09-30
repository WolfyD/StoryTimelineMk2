/**
 * BL-16: the shape of the map list. Nesting hangs off the pins — `locations.child_map_id`, with no
 * parent column on the map — so the tree has to be derived, and nothing stops a writer from pointing
 * two pins at each other's maps. Every walk below carries a `seen` set for that reason.
 *
 * Pure on purpose: the map window is a Konva canvas, and this is the part worth testing.
 */
import type { MapItem, LocationItem } from '@/types/models'

/**
 * One line of the list: a place, or — only at the top, where no pin sits above it — a map.
 * A place that opens into a map stands in for that map, so the list never names it twice.
 */
export interface MapTreeRow {
  /** Unique within one list: the path down to this row, since a map may hang off two pins. */
  key: string
  /** The map this row lives on: for a place, the one it is pinned to. */
  map: MapItem
  loc?: LocationItem
  /** The map this place opens into, when it has one and that map still exists. */
  childMap?: MapItem
  depth: number
}

/** Child map id → the id of the map whose pin opens into it. First pin wins if two claim the same map. */
export function parentMapIds(maps: MapItem[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const map of maps)
    for (const loc of map.Locations)
      if (loc.ChildMapId && !out.has(loc.ChildMapId)) out.set(loc.ChildMapId, map.Id)
  return out
}

/** The maps no pin opens into: the tops of the tree. */
export function rootMaps(maps: MapItem[], parents = parentMapIds(maps)): MapItem[] {
  return maps.filter(m => !parents.has(m.Id))
}

/**
 * The pin that stands for a place while one map is on screen: the place itself when it is pinned on
 * that map, and otherwise the door on it that leads down to wherever the place really is — so someone
 * in an inn shows on the city that holds the inn, and on the world map at the city.
 *
 * Null when the place is not on this map or anywhere under it, which is a place there is nothing on
 * this map to draw for.
 *
 * ponytail: a place three maps down draws *at the door pin*, not at its own spot inside that pin's
 * footprint. The footprint is a few percent of the map across, so the error is smaller than the dot
 * that marks it; projecting through the footprint chain is the upgrade if anyone ever wants a journey
 * to read as crossing a city it never entered.
 */
export function pinStandingFor(
  maps: MapItem[],
  locId: string,
  mapId: string,
  parents = parentMapIds(maps),
): LocationItem | null {
  const home = maps.find(m => m.Locations.some(l => l.Id === locId))
  if (!home) return null
  if (home.Id === mapId) return home.Locations.find(l => l.Id === locId) ?? null

  // Up the tree from the place's own map. The moment the map above is the one being looked at, the pin
  // that opens into the branch below is where the place shows.
  const seen = new Set([home.Id])
  let below = home.Id
  let up = parents.get(below)
  while (up && !seen.has(up)) {
    if (up === mapId) {
      return maps.find(m => m.Id === up)?.Locations.find(l => l.ChildMapId === below) ?? null
    }
    seen.add(up)
    below = up
    up = parents.get(up)
  }
  return null
}

/** The way down to a map from its root, parent first, so a jump into the middle still has a trail. */
export function pathToMap(parents: Map<string, string>, id: string): string[] {
  const out = [id]
  const seen = new Set(out)
  let up = parents.get(id)
  while (up && !seen.has(up)) {
    out.unshift(up)
    seen.add(up)
    up = parents.get(up)
  }
  return out
}

/**
 * The deepest map that still holds every one of `mapIds` at or under it: where a reader has to stand
 * to keep all of them in sight at once. One map on its own is itself, two on different branches is
 * whatever they both hang under, and two under different roots is nothing — there is no view that
 * has both, so the caller stays where it is.
 */
export function commonMap(parents: Map<string, string>, mapIds: string[]): string | null {
  let shared: string[] | null = null
  for (const id of mapIds) {
    const path = pathToMap(parents, id)
    if (!shared) { shared = path; continue }
    let same = 0
    while (same < shared.length && same < path.length && shared[same] === path[same]) same++
    shared = shared.slice(0, same)
  }
  return shared?.[shared.length - 1] ?? null
}

/**
 * The way down to a place in names, root map first — `Faerun › Helim › Market`. Each step after the
 * root is the pin that opens into the map below it, so the trail reads as the doors a reader would
 * actually go through, and the place itself is the last name.
 *
 * Empty when the place is on no map here. It is also what the text matcher scores against: every name
 * but the last is a qualifier that could be standing in the same sentence as the place.
 */
export function trailToPlace(
  maps: MapItem[],
  locId: string,
  parents = parentMapIds(maps),
): string[] {
  const home = maps.find(m => m.Locations.some(l => l.Id === locId))
  if (!home) return []

  const chain = pathToMap(parents, home.Id)
  const names = [maps.find(m => m.Id === chain[0])?.Name ?? '—']
  for (let i = 1; i < chain.length; i++) {
    const door = maps.find(m => m.Id === chain[i - 1])?.Locations.find(l => l.ChildMapId === chain[i])
    names.push(door?.Name ?? maps.find(m => m.Id === chain[i])?.Name ?? '—')
  }
  names.push(home.Locations.find(l => l.Id === locId)!.Name)
  return names
}

/**
 * The maps passed through on the way from one to another: out to the nearest map they both hang under,
 * then down the other side. The one being left is not in the list and the destination is, so going
 * nowhere is an empty list and a step to a child is a list of one.
 *
 * Two maps under different roots share no ground to walk across, so that is a single arrival.
 */
export function hopsBetween(parents: Map<string, string>, from: string, to: string): string[] {
  if (from === to) return []
  const up = pathToMap(parents, from)
  const down = pathToMap(parents, to)
  let same = 0
  while (same < up.length && same < down.length && up[same] === down[same]) same++
  if (!same) return [to]
  return [...up.slice(same - 1, -1).reverse(), ...down.slice(same)]
}

/**
 * Which of `hopsBetween`'s hops are flown and which are jumped.
 *
 * `full` flies every level. `cut` arrives at the destination and nothing else happens. `ends` flies
 * out of the map the reader is standing on and into the one they land on, and jumps everything
 * between in one step: the first flight says where they left and the last says where they arrived,
 * and on a nine-level journey the other seven only said how far it was — which is the dizzying part.
 *
 * A journey of two hops or fewer has no middle to leave out, so `ends` is `full` there.
 */
export function flightRoute(
  hops: string[],
  mode: 'full' | 'ends' | 'cut',
): { id: string; fly: boolean }[] {
  const last = hops[hops.length - 1]
  if (!last) return []
  if (mode === 'cut') return [{ id: last, fly: false }]
  if (mode === 'full' || hops.length <= 2) return hops.map(id => ({ id, fly: true }))
  // The jump lands on the map the destination hangs under, which is where the last flight starts.
  return [
    { id: hops[0]!, fly: true },
    { id: hops[hops.length - 2]!, fly: false },
    { id: last, fly: true },
  ]
}

/**
 * Every place on one map as rows, and under a place that is a door, the places on the map behind it —
 * so a place without a map of its own is a row like any other, and a place with one is not listed
 * twice. `match` prunes to the branches leading to a hit; without it every place is a row.
 */
function placeRows(
  maps: MapItem[],
  map: MapItem,
  depth: number,
  key: string,
  seen: Set<string>,
  collapsed: ReadonlySet<string>,
  match: ((loc: LocationItem) => boolean) | null,
): MapTreeRow[] {
  const rows: MapTreeRow[] = []
  for (const loc of map.Locations) {
    const rowKey = `${key}/${loc.Id}`
    const childMap = loc.ChildMapId ? maps.find(m => m.Id === loc.ChildMapId) : undefined
    const below = childMap && !seen.has(childMap.Id) && !collapsed.has(rowKey)
      ? placeRows(maps, childMap, depth + 1, rowKey, new Set(seen).add(childMap.Id), collapsed, match)
      : []
    if (match && !match(loc) && !below.length) continue
    rows.push({ key: rowKey, map, loc, childMap, depth })
    rows.push(...below)
  }
  return rows
}

/**
 * The tree as rows with a depth — one list and some padding instead of a recursive component.
 * A collapsed row keeps itself and loses what is under it.
 */
export function flattenMapTree(maps: MapItem[], collapsed: ReadonlySet<string> = new Set()): MapTreeRow[] {
  return rootMaps(maps).flatMap(root => [
    { key: root.Id, map: root, depth: 0 },
    ...(collapsed.has(root.Id)
      ? []
      : placeRows(maps, root, 1, root.Id, new Set([root.Id]), collapsed, null)),
  ])
}

/** Is there anything under this row to fold away? */
export function rowHasChildren(row: MapTreeRow): boolean {
  return row.loc ? !!row.childMap?.Locations.length : row.map.Locations.length > 0
}

/** The rows at one depth that have something to fold: what "fold to this level" folds. */
export function foldableAt(maps: MapItem[], depth: number): string[] {
  return flattenMapTree(maps).filter(r => r.depth === depth && rowHasChildren(r)).map(r => r.key)
}

/**
 * Fold the list to one depth — every continent folded, say, and the world above them open so they are
 * all in view. Folds already below that depth are kept for when it opens again. When the depth is
 * already folded, it opens instead. A row's depth is in its key: the root id, then `/place` per level.
 */
export function foldToDepth(maps: MapItem[], collapsed: ReadonlySet<string>, depth: number): Set<string> {
  const level = foldableAt(maps, depth)
  if (level.every(k => collapsed.has(k))) return new Set([...collapsed].filter(k => !level.includes(k)))
  return new Set([...[...collapsed].filter(k => k.split('/').length - 1 > depth), ...level])
}

/**
 * The same tree, pruned to the branches that lead to a matching place. Places are what is searched —
 * a map name never matches — and the places above a hit stay on screen, so a tavern in one city is
 * never mistaken for the tavern of the same name in another.
 */
export function filterMapTree(maps: MapItem[], query: string): MapTreeRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const match = (loc: LocationItem) => loc.Name.toLowerCase().includes(q)

  return rootMaps(maps).flatMap(root => {
    const below = placeRows(maps, root, 1, root.Id, new Set([root.Id]), new Set(), match)
    return below.length ? [{ key: root.Id, map: root, depth: 0 }, ...below] : []
  })
}

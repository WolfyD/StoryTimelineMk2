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

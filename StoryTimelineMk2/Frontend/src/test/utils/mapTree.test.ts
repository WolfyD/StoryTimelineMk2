import { describe, it, expect } from 'vitest'
import {
  parentMapIds, rootMaps, pathToMap, hopsBetween, commonMap, flightRoute, flattenMapTree,
  rowHasChildren, filterMapTree, pinStandingFor, foldableAt, foldToDepth, placesUnder, pruneMapTree,
} from '@/utils/mapTree'
import type { MapItem, LocationItem } from '@/types/models'

function place(id: string, mapId: string, name: string, childMapId: string | null = null): LocationItem {
  return {
    Id: id, MapId: mapId, ChildMapId: childMapId, Name: name, Description: null,
    X: 0.5, Y: 0.5, Color: null, FootprintW: null, MarkerStyle: null,
  }
}

function map(id: string, name: string, locations: LocationItem[] = []): MapItem {
  return {
    Id: id, TimelineId: 1, Name: name, Description: null,
    PictureId: null, PicturePath: null, PictureWidth: null, PictureHeight: null,
    NorthOffset: 0, CompassX: 1, CompassY: 0, CompassSize: 38,
    ScaleLength: 10, ScaleUnit: 'miles', ScaleFraction: 0.2,
    GridCols: 0, MarkerStyle: null,
    OverviewPath: null, DetailPath: null, ViewError: null,
    Locations: locations,
  }
}

// world ─ Aurea (kingdom) ─ Highgate (city); world also has a pin with no map behind it.
const world = map('world', 'The world', [
  place('l-aurea', 'world', 'Aurea', 'aurea'),
  place('l-sea', 'world', 'The Long Sea'),
])
const aurea = map('aurea', 'Aurea', [place('l-highgate', 'aurea', 'Highgate', 'highgate')])
const highgate = map('highgate', 'Highgate', [place('l-inn', 'highgate', 'The Bent Nail')])
const nested = [world, aurea, highgate]

describe('mapTree', () => {
  it('a map is a root only when no pin opens into it', () => {
    expect(rootMaps(nested).map(m => m.Id)).toEqual(['world'])
    expect(parentMapIds(nested).get('highgate')).toBe('aurea')
  })

  // Places are the rows. A place with a map behind it stands in for that map — the map is never a
  // row of its own — and a place with no map at all (the Long Sea) is a row like any other.
  it('lists places depth-first, with the map only at the top', () => {
    expect(flattenMapTree(nested).map(r => [r.loc?.Id ?? `[${r.map.Id}]`, r.depth])).toEqual([
      ['[world]', 0],
      ['l-aurea', 1],
      ['l-highgate', 2],
      ['l-inn', 3],
      ['l-sea', 1],
    ])
  })

  it('a row knows the map behind it, so the list can offer a way in', () => {
    const rows = flattenMapTree(nested)
    expect(rows.map(r => r.childMap?.Id ?? null))
      .toEqual([null, 'aurea', 'highgate', null, null])
    // A door with nothing pinned behind it has nothing to fold away.
    expect(rows.map(rowHasChildren)).toEqual([true, true, true, false, false])
    expect(rowHasChildren({ key: 'x', map: world, loc: world.Locations[1]!, depth: 1 })).toBe(false)
  })

  it('a collapsed row keeps itself and loses what is under it', () => {
    expect(flattenMapTree(nested, new Set(['world/l-aurea'])).map(r => r.loc?.Id ?? r.map.Id))
      .toEqual(['world', 'l-aurea', 'l-sea'])
  })

  it('folds to a level: that depth shut, everything above open, deeper folds kept; again opens it', () => {
    // A second kingdom beside Aurea, so a level has more than one row to fold.
    const tree = [
      map('world', 'The world', [...world.Locations, place('l-brin', 'world', 'Brin', 'brin')]),
      aurea, highgate, map('brin', 'Brin', [place('l-port', 'brin', 'Port')]),
    ]
    const shut = foldToDepth(tree, new Set(['world', 'world/l-aurea/l-highgate']), 1)
    expect([...shut].sort()).toEqual(['world/l-aurea', 'world/l-aurea/l-highgate', 'world/l-brin'])
    expect([...foldToDepth(tree, shut, 1)]).toEqual(['world/l-aurea/l-highgate'])
    expect(foldableAt(tree, 3)).toEqual([])
  })

  it('walks up to the root, parent first', () => {
    expect(pathToMap(parentMapIds(nested), 'highgate')).toEqual(['world', 'aurea', 'highgate'])
    expect(pathToMap(parentMapIds(nested), 'world')).toEqual(['world'])
  })

  // The route the view flies: out to the map both sides hang under, then down the other side.
  it('walks out and back down between two maps', () => {
    const parents = parentMapIds(nested)
    expect(hopsBetween(parents, 'world', 'highgate')).toEqual(['aurea', 'highgate'])
    expect(hopsBetween(parents, 'highgate', 'world')).toEqual(['aurea', 'world'])
    expect(hopsBetween(parents, 'aurea', 'highgate')).toEqual(['highgate'])
    expect(hopsBetween(parents, 'world', 'world')).toEqual([])
  })

  it('crosses between two branches through the map they share', () => {
    // world ─ Aurea ─ Highgate, and world ─ Bree. Highgate to Bree goes up twice, then down once.
    const bree = map('bree', 'Bree')
    const twoWays = [
      map('world', 'The world', [
        place('l-aurea', 'world', 'Aurea', 'aurea'),
        place('l-bree', 'world', 'Bree', 'bree'),
      ]),
      aurea, highgate, bree,
    ]
    expect(hopsBetween(parentMapIds(twoWays), 'highgate', 'bree')).toEqual(['aurea', 'world', 'bree'])
  })

  it('arrives rather than walks when two maps share no ground', () => {
    const apart = [map('a', 'A'), map('b', 'B')]
    expect(hopsBetween(parentMapIds(apart), 'a', 'b')).toEqual(['b'])
  })

  // The map a reader has to stand on to keep everyone being followed in sight at once.
  it('is the deepest map that still holds all of them', () => {
    const parents = parentMapIds(nested)
    expect(commonMap(parents, ['highgate'])).toBe('highgate')            // one on its own is itself
    expect(commonMap(parents, ['highgate', 'highgate'])).toBe('highgate')
    expect(commonMap(parents, ['highgate', 'aurea'])).toBe('aurea')      // and the way out when they part
    expect(commonMap(parents, ['highgate', 'world'])).toBe('world')
    expect(commonMap(parents, [])).toBeNull()
  })

  it('has no map for two under different roots, so the view stays put', () => {
    const apart = [map('a', 'A'), map('b', 'B')]
    expect(commonMap(parentMapIds(apart), ['a', 'b'])).toBeNull()
  })

  // Nine dissolves on the way out to the world map is eight too many: only the flight that says
  // where the reader left and the one that says where they arrived carry anything.
  describe('flightRoute', () => {
    const long = ['inn', 'city', 'region', 'country', 'world']

    it('flies every level when that is what was asked for', () => {
      expect(flightRoute(long, 'full')).toEqual(long.map(id => ({ id, fly: true })))
    })

    it('flies out and in, and jumps to the map the destination hangs under', () => {
      expect(flightRoute(long, 'ends')).toEqual([
        { id: 'inn', fly: true },
        { id: 'country', fly: false },
        { id: 'world', fly: true },
      ])
    })

    it('has no middle to leave out on a short journey, so it flies both', () => {
      expect(flightRoute(['city', 'region'], 'ends')).toEqual([
        { id: 'city', fly: true },
        { id: 'region', fly: true },
      ])
      expect(flightRoute(['city'], 'ends')).toEqual([{ id: 'city', fly: true }])
    })

    it('arrives and nothing else when the flight is off', () => {
      expect(flightRoute(long, 'cut')).toEqual([{ id: 'world', fly: false }])
    })

    it('goes nowhere when there is nowhere to go', () => {
      expect(flightRoute([], 'ends')).toEqual([])
      expect(flightRoute([], 'cut')).toEqual([])
    })
  })

  // Nothing in the schema stops two pins opening into each other's maps, and a loop must not hang.
  it('survives a cycle instead of recursing forever', () => {
    const a = map('a', 'A', [place('l-a', 'a', 'door to B', 'b')])
    const b = map('b', 'B', [place('l-b', 'b', 'door to A', 'a')])
    const cyclic = [a, b]

    expect(rootMaps(cyclic)).toEqual([])              // neither is a root…
    expect(flattenMapTree(cyclic)).toEqual([])        // …so a pure cycle lists nothing
    expect(pathToMap(parentMapIds(cyclic), 'a')).toEqual(['b', 'a'])

    // Reachable from a real root, the loop is walked once per branch and stops.
    const withRoot = [map('root', 'Root', [place('l-r', 'root', 'door to A', 'a')]), a, b]
    expect(flattenMapTree(withRoot).map(r => r.loc?.Id ?? r.map.Id))
      .toEqual(['root', 'l-r', 'l-a', 'l-b'])
  })

  it('leaves out a door whose map has been deleted', () => {
    // Aurea is gone, so the pin is just a pin and there is nothing under it.
    const rows = flattenMapTree([world])
    expect(rows.map(r => [r.loc?.Id ?? r.map.Id, r.childMap ?? null]))
      .toEqual([['world', null], ['l-aurea', null], ['l-sea', null]])
  })

  // Places are what is searched; the places above a hit come along so two taverns of the same name
  // in two cities stay apart.
  it('prunes the tree to the branches that lead to a matching place', () => {
    expect(filterMapTree(nested, 'bent nail').map(r => [r.loc?.Id ?? `[${r.map.Id}]`, r.depth])).toEqual([
      ['[world]', 0],
      ['l-aurea', 1],
      ['l-highgate', 2],
      ['l-inn', 3],
    ])
  })

  it('matches places case-insensitively and leaves branches with no hit out', () => {
    expect(filterMapTree(nested, 'SEA').map(r => r.loc?.Name ?? `[${r.map.Name}]`))
      .toEqual(['[The world]', 'The Long Sea'])
  })

  // "Highgate" is both a city map and the pin that opens into it: the pin is what matches, and it
  // matches once, so the name is never listed twice.
  it('matches the pin, not the map behind it', () => {
    expect(filterMapTree(nested, 'Highgate').map(r => r.loc?.Id ?? `[${r.map.Id}]`))
      .toEqual(['[world]', 'l-aurea', 'l-highgate'])
    expect(filterMapTree(nested, '   ')).toEqual([])
  })

  it('can let a top-level map match on its own, with nothing under it matching', () => {
    expect(pruneMapTree(nested, () => false, m => m.Name === 'The world').map(r => r.key)).toEqual(['world'])
    expect(pruneMapTree(nested, () => false)).toEqual([])
  })

  it('gathers every place on a map and behind its doors, and stops at a cycle', () => {
    expect(placesUnder(nested, 'world')).toEqual(['l-aurea', 'l-highgate', 'l-inn', 'l-sea'])
    expect(placesUnder(nested, 'aurea')).toEqual(['l-highgate', 'l-inn'])
    const a = map('a', 'A', [place('l-a', 'a', 'door to B', 'b')])
    const b = map('b', 'B', [place('l-b', 'b', 'door to A', 'a')])
    expect(placesUnder([a, b], 'a')).toEqual(['l-a', 'l-b'])
  })

  it('gives every row a key of its own, even down a cycle', () => {
    const a = map('a', 'A', [place('l-a', 'a', 'door to B', 'b'), place('l-x', 'a', 'The Well')])
    const b = map('b', 'B', [place('l-b', 'b', 'door to A', 'a')])
    const rows = filterMapTree([map('root', 'Root', [place('l-r', 'root', 'door to A', 'a')]), a, b], 'well')
    const keys = rows.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// Someone standing in an inn has to show on the city that holds the inn, and on the world at the
// kingdom — otherwise a journey between two maps is a dot that blinks out and back.
describe('pinStandingFor', () => {
  it('is the place itself on the map it is pinned to', () => {
    expect(pinStandingFor(nested, 'l-inn', 'highgate')?.Id).toBe('l-inn')
  })

  it('is the door one level up', () => {
    expect(pinStandingFor(nested, 'l-inn', 'aurea')?.Id).toBe('l-highgate')
  })

  it('is the door at the top, however deep the place is', () => {
    expect(pinStandingFor(nested, 'l-inn', 'world')?.Id).toBe('l-aurea')
  })

  it('is nothing for a place on another branch, since there is nothing here to draw', () => {
    const bree = map('bree', 'Bree', [place('l-well', 'bree', 'The Well')])
    const twoWays = [
      map('world', 'The world', [
        place('l-aurea', 'world', 'Aurea', 'aurea'),
        place('l-bree', 'world', 'Bree', 'bree'),
      ]),
      aurea, highgate, bree,
    ]
    expect(pinStandingFor(twoWays, 'l-well', 'highgate')).toBeNull()
    expect(pinStandingFor(twoWays, 'l-well', 'world')?.Id).toBe('l-bree')
  })

  it('is nothing for a place that is nowhere and for a map that is not above it', () => {
    expect(pinStandingFor(nested, 'no-such-place', 'world')).toBeNull()
    expect(pinStandingFor(nested, 'l-aurea', 'highgate')).toBeNull()
  })

  it('stops instead of looping when two pins open into each other', () => {
    const a = map('a', 'A', [place('l-a', 'a', 'door to B', 'b')])
    const b = map('b', 'B', [place('l-b', 'b', 'door to A', 'a'), place('l-x', 'b', 'The Well')])
    expect(pinStandingFor([a, b], 'l-x', 'a')?.Id).toBe('l-a')
    expect(pinStandingFor([a, b], 'l-x', 'nowhere')).toBeNull()
  })
})

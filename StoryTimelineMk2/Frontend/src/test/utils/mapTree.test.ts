import { describe, it, expect } from 'vitest'
import {
  parentMapIds, rootMaps, pathToMap, hopsBetween, flattenMapTree, rowHasChildren, filterMapTree,
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
    MarkerStyle: null,
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

  it('gives every row a key of its own, even down a cycle', () => {
    const a = map('a', 'A', [place('l-a', 'a', 'door to B', 'b'), place('l-x', 'a', 'The Well')])
    const b = map('b', 'B', [place('l-b', 'b', 'door to A', 'a')])
    const rows = filterMapTree([map('root', 'Root', [place('l-r', 'root', 'door to A', 'a')]), a, b], 'well')
    const keys = rows.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

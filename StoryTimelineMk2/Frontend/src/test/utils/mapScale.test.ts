import { describe, it, expect } from 'vitest'
import { unitsPerBasePx, distanceInUnits, niceScaleMultiplier, scaleBar, lockAxis, placeDistance } from '@/utils/mapScale'
import type { MapItem } from '@/types/models'

/** A 1000px-wide map whose middle fifth is 10 miles: 200px = 10 miles, so a mile is 20px. */
function map(over: Partial<MapItem> = {}): MapItem {
  return {
    Id: 'm', TimelineId: 1, Name: 'The world', Description: null,
    PictureId: null, PicturePath: null, PictureWidth: 1000, PictureHeight: 800,
    NorthOffset: 0, CompassX: 1, CompassY: 0, CompassSize: 38,
    ScaleLength: 10, ScaleUnit: 'miles', ScaleFraction: 0.2,
    GridCols: 0, MarkerStyle: null,
    OverviewPath: null, DetailPath: null, ViewError: null, Locations: [],
    ...over,
  }
}

describe('unitsPerBasePx', () => {
  it('reads the bar the writer set', () => {
    expect(unitsPerBasePx(map(), 1000)).toBeCloseTo(0.05) // 10 miles / 200px
  })

  it('falls back to the creation default rather than dividing by zero', () => {
    expect(unitsPerBasePx(map({ ScaleFraction: 0 }), 1000)).toBeCloseTo(0.05)
  })
})

describe('distanceInUnits', () => {
  it('measures across and down the same way, because a map has one scale', () => {
    const m = map()
    expect(distanceInUnits(m, 1000, { x: 0, y: 0 }, { x: 400, y: 0 })).toBeCloseTo(20)
    expect(distanceInUnits(m, 1000, { x: 0, y: 0 }, { x: 0, y: 400 })).toBeCloseTo(20)
    expect(distanceInUnits(m, 1000, { x: 0, y: 0 }, { x: 300, y: 400 })).toBeCloseTo(25)
  })
})

describe('placeDistance', () => {
  it('measures on the deepest map that holds both, door to door across it', () => {
    const loc = (Id: string, MapId: string, X: number, Y: number, ChildMapId: string | null = null) => ({
      Id, MapId, ChildMapId, Name: Id, Description: null, X, Y, Color: null, FootprintW: null, MarkerStyle: null,
    })
    const world = map({ Id: 'w', Locations: [loc('city', 'w', 0, 0, 'c'), loc('port', 'w', 0.3, 0.5)] })
    const city = map({ Id: 'c', ScaleUnit: 'yards', Locations: [loc('inn', 'c', 0, 0), loc('gate', 'c', 0.4, 0)] })
    // Two inns of one city: on the city map, in its own unit. 400px at 20px a unit.
    expect(placeDistance([world, city], 'inn', 'gate')).toEqual({ units: 20, unit: 'yards' })
    // The inn and the port: on the world, from the city's door. 300 × 400px is 500px, 25 miles.
    expect(placeDistance([world, city], 'inn', 'port')!.units).toBeCloseTo(25)
    expect(placeDistance([world, city], 'inn', 'port')!.unit).toBe('miles')
    expect(placeDistance([world, map({ Id: 'x' })], 'inn', 'port')).toBeNull()
  })
})

describe('niceScaleMultiplier', () => {
  it('only ever lands on 1, 2 or 5 of a power of ten', () => {
    for (const px of [3, 7, 19, 140, 900, 12345]) {
      const mult = niceScaleMultiplier(px)
      const rest = mult / 10 ** Math.floor(Math.log10(mult))
      expect([1, 2, 5]).toContain(Math.round(rest))
    }
  })

  it('keeps the bar near the length asked for, never past it', () => {
    for (const px of [3, 7, 19, 140, 900, 12345]) {
      const width = px * niceScaleMultiplier(px, 140)
      expect(width).toBeLessThanOrEqual(140)
      expect(width).toBeGreaterThan(140 / 5)
    }
  })

  it('shrugs off a stage that has not been measured yet', () => {
    expect(niceScaleMultiplier(0)).toBe(1)
    expect(niceScaleMultiplier(NaN)).toBe(1)
  })
})

describe('lockAxis', () => {
  const from = { x: 100, y: 100 }

  it('leaves the pointer alone when shift is not held', () => {
    expect(lockAxis(from, { x: 140, y: 180 }, false)).toEqual({ x: 140, y: 180 })
  })

  it('keeps the axis the pointer travelled further along', () => {
    expect(lockAxis(from, { x: 200, y: 130 }, true)).toEqual({ x: 200, y: 100 })
    expect(lockAxis(from, { x: 130, y: 200 }, true)).toEqual({ x: 100, y: 200 })
  })

  it('works whichever way the pointer went', () => {
    expect(lockAxis(from, { x: 10, y: 90 }, true)).toEqual({ x: 10, y: 100 })
    expect(lockAxis(from, { x: 90, y: 10 }, true)).toEqual({ x: 100, y: 10 })
  })

  it('settles on horizontal at exactly 45°, rather than flickering between the two', () => {
    expect(lockAxis(from, { x: 150, y: 150 }, true)).toEqual({ x: 150, y: 100 })
  })
})

describe('scaleBar', () => {
  it('says ten miles when ten miles is what fits', () => {
    // 200px of image at 70% zoom = 140px on screen, which is the length it aims for.
    expect(scaleBar(map(), 1000, 0.7)).toEqual({ px: 140, label: '10 miles' })
  })

  it('walks down the ladder as the map is zoomed into', () => {
    const bar = scaleBar(map(), 1000, 7)
    expect(bar.label).toBe('1 miles')
    expect(bar.px).toBeLessThanOrEqual(140)
  })

  it('walks up it when the whole world is on screen', () => {
    expect(scaleBar(map(), 1000, 0.007).label).toBe('1,000 miles')
  })

  it('carries whatever unit the writer typed', () => {
    expect(scaleBar(map({ ScaleUnit: 'leagues' }), 1000, 0.7).label).toBe('10 leagues')
  })
})

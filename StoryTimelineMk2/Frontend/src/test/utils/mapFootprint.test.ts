import { describe, it, expect } from 'vitest'
import {
  defaultFootprintW, footprintW, footprintRect, descentTransform, throughFootprint, betweenViews,
  centredOn, fitRectScale, FALLBACK_FOOTPRINT_W, type View,
} from '@/utils/mapFootprint'
import type { LocationItem, MapItem } from '@/types/models'

/** A map 1000×800 whose middle fifth is 10 miles, so the whole width is 50 miles across. */
function map(over: Partial<MapItem> = {}): MapItem {
  return {
    Id: 'm', TimelineId: 1, Name: 'The world', Description: null,
    PictureId: null, PicturePath: null, PictureWidth: 1000, PictureHeight: 800,
    NorthOffset: 0, CompassX: 1, CompassY: 0, CompassSize: 38,
    ScaleLength: 10, ScaleUnit: 'miles', ScaleFraction: 0.2,
    MarkerStyle: null,
    OverviewPath: null, DetailPath: null, ViewError: null, Locations: [],
    ...over,
  }
}

function pin(over: Partial<LocationItem> = {}): LocationItem {
  return {
    Id: 'l', MapId: 'm', ChildMapId: 'c', Name: 'Ashvale', Description: null,
    X: 0.5, Y: 0.5, Color: null, FootprintW: null, MarkerStyle: null, ...over,
  }
}

describe('defaultFootprintW', () => {
  it('believes the two maps: a 5-mile city on a 50-mile world is a tenth of it', () => {
    const world = map()                                        // 10 / 0.2 = 50 miles across
    const city = map({ ScaleLength: 1, ScaleFraction: 0.2 })   // 1 / 0.2 = 5 miles across
    expect(defaultFootprintW(world, city)).toBeCloseTo(0.1)
  })

  it('will not convert units it was never given, so a mismatch falls back', () => {
    const world = map()
    const city = map({ ScaleLength: 1, ScaleUnit: 'leagues' })
    expect(defaultFootprintW(world, city)).toBe(FALLBACK_FOOTPRINT_W)
  })

  it('falls back when the child would not fit inside its own parent', () => {
    const world = map()
    const continent = map({ ScaleLength: 400 })  // 2000 miles across: bigger than the map it sits on
    expect(defaultFootprintW(world, continent)).toBe(FALLBACK_FOOTPRINT_W)
  })

  it('prefers what the writer dragged over anything it could work out', () => {
    expect(footprintW(pin({ FootprintW: 0.4 }), map(), map())).toBeCloseTo(0.4)
  })

  it('keeps a bad stored value inside the picture', () => {
    expect(footprintW(pin({ FootprintW: 7 }), map(), map())).toBe(1)
    expect(footprintW(pin({ FootprintW: -1 }), map(), map())).toBeGreaterThan(0)
  })
})

describe('footprintRect', () => {
  it('centres on the pin and takes its shape from the child, not the parent', () => {
    // Child is 2:1 landscape, so a 200px-wide footprint is 100px tall whatever the parent's shape.
    const child = map({ PictureWidth: 400, PictureHeight: 200 })
    const r = footprintRect(pin({ FootprintW: 0.2 }), map(), child, 1000, 800)
    expect(r).toEqual({ x: 500 - 100, y: 400 - 50, w: 200, h: 100 })
  })

  it('is square while the child has no picture to have a shape', () => {
    const r = footprintRect(pin({ FootprintW: 0.1 }), map(), map({ PictureWidth: 0, PictureHeight: 0 }), 1000, 800)
    expect(r.w).toBe(r.h)
  })
})

describe('throughFootprint', () => {
  // The flight out starts here: whatever corner of the child the reader had got to has to be in the
  // same place on screen the instant the map above takes over, or coming out begins with a jump.
  it('puts the child exactly where the reader left it', () => {
    const rect = { x: 400, y: 350, w: 200, h: 100 }
    const childW = 400
    // Zoomed well in on the child, looking at its bottom-right quarter.
    const seen = { scale: 2.5, x: -310, y: -180 }

    const from = throughFootprint(rect, childW, seen)

    // A point on the child, and the point of the parent's footprint that stands for it…
    const onChild = { x: 275, y: 140 }
    const k = rect.w / childW
    const onParent = { x: rect.x + onChild.x * k, y: rect.y + onChild.y * k }
    // …land on the same pixel of the screen.
    expect(from.x + onParent.x * from.scale).toBeCloseTo(seen.x + onChild.x * seen.scale)
    expect(from.y + onParent.y * from.scale).toBeCloseTo(seen.y + onChild.y * seen.scale)
  })

  it('is what the descent aims at, seen from the other end', () => {
    const rect = { x: 400, y: 350, w: 200, h: 100 }
    const fit = 1.4
    const down = descentTransform(rect, 400, 200, fit, 900, 600)
    const up = throughFootprint(rect, 400, {
      scale: fit, x: (900 - 400 * fit) / 2, y: (600 - 200 * fit) / 2,
    })
    expect(up).toEqual(down)
  })
})

describe('betweenViews', () => {
  const stageW = 900, stageH = 600
  /** The point of the map in the middle of the screen: what the flight is aimed at. */
  const centre = (v: View) => ({ x: (stageW / 2 - v.x) / v.scale, y: (stageH / 2 - v.y) / v.scale })

  const from: View = { scale: 1, x: 0, y: 0 }
  const to: View = { scale: 16, x: -3000, y: -1800 }

  it('starts and ends on exactly the two views it was given', () => {
    expect(betweenViews(from, to, 0, stageW, stageH).scale).toBeCloseTo(from.scale)
    expect(betweenViews(from, to, 0, stageW, stageH).x).toBeCloseTo(from.x)
    expect(betweenViews(from, to, 1, stageW, stageH).scale).toBeCloseTo(to.scale)
    expect(betweenViews(from, to, 1, stageW, stageH).x).toBeCloseTo(to.x)
    expect(betweenViews(from, to, 1, stageW, stageH).y).toBeCloseTo(to.y)
  })

  it('reads halfway the way the eye does, geometrically', () => {
    // Not 8.5. A straight tween from 1× to 16× is still at 2× a third of the way in and then lunges,
    // which is the crawl-then-snap a zoom must not have.
    expect(betweenViews(from, to, 0.5, stageW, stageH).scale).toBeCloseTo(4)
    expect(betweenViews(from, to, 0.25, stageW, stageH).scale).toBeCloseTo(2)
  })

  it('walks the middle of the screen straight across the map', () => {
    const a = centre(from)
    const b = centre(to)
    const mid = centre(betweenViews(from, to, 0.5, stageW, stageH))
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2)
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2)
  })

  it('is a plain pan when the scale does not change', () => {
    const at = betweenViews({ scale: 2, x: 0, y: 0 }, { scale: 2, x: -200, y: 0 }, 0.25, stageW, stageH)
    expect(at.scale).toBeCloseTo(2)
    expect(at.x).toBeCloseTo(-50)
  })
})

describe('the shift-dragged box', () => {
  const stageW = 900, stageH = 600

  it('puts what was boxed in the middle of the screen', () => {
    const box = { x: 200, y: 100, w: 300, h: 200 }
    const scale = fitRectScale(box, stageW, stageH)
    const at = centredOn(box.x + box.w / 2, box.y + box.h / 2, scale, stageW, stageH)
    // The box's own middle lands on the middle of the screen…
    expect(at.x + (box.x + box.w / 2) * at.scale).toBeCloseTo(stageW / 2)
    expect(at.y + (box.y + box.h / 2) * at.scale).toBeCloseTo(stageH / 2)
    // …and both its edges are on screen, because it fits rather than fills.
    expect(at.x + box.x * at.scale).toBeGreaterThanOrEqual(0)
    expect(at.x + (box.x + box.w) * at.scale).toBeLessThanOrEqual(stageW + 1e-6)
  })

  it('fits the tighter of the two axes, so nothing boxed in is cropped', () => {
    // A tall thin box on a wide screen is limited by the height, not the width.
    expect(fitRectScale({ x: 0, y: 0, w: 100, h: 400 }, stageW, stageH)).toBeCloseTo(600 / 400)
    expect(fitRectScale({ x: 0, y: 0, w: 600, h: 100 }, stageW, stageH)).toBeCloseTo(900 / 600)
  })

  it('stays centred when the caller clamps the scale', () => {
    // A box round a doorway wants more zoom than the wheel allows; the clamp must not shift it off centre.
    const box = { x: 500, y: 500, w: 4, h: 4 }
    const scale = Math.min(12, fitRectScale(box, stageW, stageH))
    expect(scale).toBe(12)
    const at = centredOn(box.x + box.w / 2, box.y + box.h / 2, scale, stageW, stageH)
    expect(at.x + (box.x + box.w / 2) * at.scale).toBeCloseTo(stageW / 2)
    expect(at.y + (box.y + box.h / 2) * at.scale).toBeCloseTo(stageH / 2)
  })

  it('is the inverse of the flight arithmetic, so the two agree about the middle', () => {
    const at = centredOn(320, 240, 3, stageW, stageH)
    const back = betweenViews(at, at, 0, stageW, stageH)
    expect(back).toEqual(at)
  })
})

describe('descentTransform', () => {
  it('lands on exactly the frame the child map opens with', () => {
    const stageW = 900, stageH = 600
    const childW = 400, childH = 200
    const childFit = Math.min(stageW / childW, stageH / childH) * 0.96
    const rect = { x: 400, y: 350, w: 200, h: 100 }

    const to = descentTransform(rect, childW, childH, childFit, stageW, stageH)

    // Where the footprint's corners end up on screen…
    const at = (x: number, y: number) => ({ x: to.x + x * to.scale, y: to.y + y * to.scale })
    // …is where the child's own fit view puts the whole picture.
    const fitX = (stageW - childW * childFit) / 2
    const fitY = (stageH - childH * childFit) / 2
    expect(at(rect.x, rect.y).x).toBeCloseTo(fitX)
    expect(at(rect.x, rect.y).y).toBeCloseTo(fitY)
    expect(at(rect.x + rect.w, rect.y + rect.h).x).toBeCloseTo(fitX + childW * childFit)
    expect(at(rect.x + rect.w, rect.y + rect.h).y).toBeCloseTo(fitY + childH * childFit)
  })

  it('zooms in, because a child map is always a smaller patch of ground', () => {
    const to = descentTransform({ x: 0, y: 0, w: 100, h: 50 }, 400, 200, 1.4, 900, 600)
    expect(to.scale).toBeGreaterThan(1)
  })
})

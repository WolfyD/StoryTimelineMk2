import { describe, it, expect } from 'vitest'
import {
  defaultFootprintW, footprintW, footprintRect, descentTransform, throughFootprint, betweenViews,
  centredOn, closeScaleFor, DETAIL_CAP,
  fitRectScale, anchoredAt, turnedBy, turnedExtent, FALLBACK_FOOTPRINT_W, type View,
} from '@/utils/mapFootprint'
import type { LocationItem, MapItem } from '@/types/models'

/** A map 1000×800 whose middle fifth is 10 miles, so the whole width is 50 miles across. */
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

describe('how close "show me this place" goes', () => {
  // Four real maps out of one timeline, with the scale their whole picture fits a 1140x830 stage at.
  const stageW = 1140, stageH = 830
  const fitOf = (w: number, h: number) => Math.min(stageW / w, stageH / h) * 0.96
  const closeOn = (w: number, h: number) => closeScaleFor(fitOf(w, h), Math.max(w, h))

  it('goes further in than the whole map, on every size of picture', () => {
    for (const [w, h] of [[10200, 6600], [4016, 8386], [2406, 992], [537, 328]] as const) {
      expect(closeOn(w, h)).toBeGreaterThanOrEqual(fitOf(w, h))
    }
  })

  it('stops where the picture runs out of pixels', () => {
    // The bug: ten times the fit of a 2406px map is 4.5x, which is a blur with a pin in it. Twice the
    // sharpest copy is the ceiling, and for a map past the detail cap that copy is smaller than 1:1.
    expect(closeOn(2406, 992)).toBeCloseTo(2)
    expect(closeOn(10200, 6600)).toBeCloseTo(2 * (DETAIL_CAP / 10200))
  })

  it('does not zoom out of a picture smaller than the window', () => {
    // 537x328 is already magnified 2.04x just to fill the stage — "show me this" cannot pull back.
    expect(closeOn(537, 328)).toBeCloseTo(fitOf(537, 328))
  })

  it('leaves a big map where it was already landing cleanly', () => {
    // 4016x8386 was verified by eye at ~0.95 and the cap must not drag it back out.
    expect(closeOn(4016, 8386)).toBeCloseTo(fitOf(4016, 8386) * 10, 2)
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

// A map held at an angle. One rule covers all of it: a point of the map lands on screen at
// `pos + turned(point × scale)`, which is Konva's own transform written out — so the test says that
// and nothing else has to be trusted.
describe('turning the map', () => {
  const stageW = 900, stageH = 600
  /** Where a point of the map is on screen, under a view. */
  const screenOf = (v: View, x: number, y: number) => {
    const off = turnedBy(x * v.scale, y * v.scale, v.rot ?? 0)
    return { x: v.x + off.x, y: v.y + off.y }
  }

  it('turns clockwise, the way the screen counts angles', () => {
    // Right becomes down: y grows downwards on a canvas, so clockwise is the positive direction.
    expect(turnedBy(1, 0, 90).x).toBeCloseTo(0)
    expect(turnedBy(1, 0, 90).y).toBeCloseTo(1)
    expect(turnedBy(0, 1, 90).x).toBeCloseTo(-1)
    expect(turnedBy(3, 7, 0)).toEqual({ x: 3, y: 7 })
  })

  // Every turned thing here is read back the other way at some point — the point under the pointer,
  // the middle of a shift-dragged box, the map point a flight is aimed at.
  it('undoes itself, which is what reading a turned view back relies on', () => {
    const there = turnedBy(31, -17, 37)
    const back = turnedBy(there.x, there.y, -37)
    expect(back.x).toBeCloseTo(31)
    expect(back.y).toBeCloseTo(-17)
  })

  it('needs more room for a turned map than a straight one', () => {
    expect(turnedExtent(100, 40, 0)).toEqual({ w: 100, h: 40 })
    expect(turnedExtent(100, 40, 90).w).toBeCloseTo(40)
    expect(turnedExtent(100, 40, 90).h).toBeCloseTo(100)
    // On the diagonal it is bigger both ways, which is the corner that used to get cropped off Fit.
    expect(turnedExtent(100, 40, 45).w).toBeCloseTo(140 * Math.SQRT1_2)
    expect(turnedExtent(100, 40, 45).h).toBeCloseTo(140 * Math.SQRT1_2)
  })

  it('puts the map point it was given under the screen point it was given', () => {
    const at = { x: 220, y: 480 }
    const v = anchoredAt(640, 210, at, 2.5, 34)
    const on = screenOf(v, 640, 210)
    expect(on.x).toBeCloseTo(at.x)
    expect(on.y).toBeCloseTo(at.y)
  })

  // The wheel and the +/− buttons are this: read the map point under the pointer, then anchor it back
  // there at the new scale. Turned or straight, whatever was under the pointer stays under it.
  it('keeps the point it zoomed about exactly where it was', () => {
    const at = { x: 700, y: 120 }
    const before = anchoredAt(500, 400, { x: stageW / 2, y: stageH / 2 }, 1.2, 62)
    // The map point under that pixel, found the way the page finds it: through the inverse transform.
    const back = turnedBy(at.x - before.x, at.y - before.y, -62)
    const on = { x: back.x / before.scale, y: back.y / before.scale }

    const after = anchoredAt(on.x, on.y, at, before.scale * 1.25, 62)
    expect(screenOf(after, on.x, on.y).x).toBeCloseTo(at.x)
    expect(screenOf(after, on.x, on.y).y).toBeCloseTo(at.y)
  })

  it('centres on a point however the map is held', () => {
    const v = centredOn(320, 240, 3, stageW, stageH, 115)
    expect(screenOf(v, 320, 240).x).toBeCloseTo(stageW / 2)
    expect(screenOf(v, 320, 240).y).toBeCloseTo(stageH / 2)
  })

  // Rotation must not survive as a special case in the descent: the parent has to show the child's
  // patch of ground exactly as the child was being looked at, angle included.
  it('descends without straightening the map first', () => {
    const rect = { x: 400, y: 350, w: 200, h: 100 }
    const childW = 400
    const seen: View = { scale: 2.5, x: -310, y: -180, rot: 41 }

    const from = throughFootprint(rect, childW, seen)
    expect(from.rot).toBe(41)

    const onChild = { x: 275, y: 140 }
    const k = rect.w / childW
    const onParent = { x: rect.x + onChild.x * k, y: rect.y + onChild.y * k }
    expect(screenOf(from, onParent.x, onParent.y).x)
      .toBeCloseTo(screenOf(seen, onChild.x, onChild.y).x)
    expect(screenOf(from, onParent.x, onParent.y).y)
      .toBeCloseTo(screenOf(seen, onChild.x, onChild.y).y)
  })

  it('still meets its own flight from the other end while turned', () => {
    const rect = { x: 400, y: 350, w: 200, h: 100 }
    const fit = 1.4
    const down = descentTransform(rect, 400, 200, fit, stageW, stageH, 41)
    const up = throughFootprint(rect, 400, centredOn(200, 100, fit, stageW, stageH, 41))
    expect(up).toEqual(down)
  })

  it('turns across a flight, and leaves the angle alone when both ends agree', () => {
    const from = centredOn(100, 100, 1, stageW, stageH, 0)
    const to = centredOn(100, 100, 1, stageW, stageH, 90)
    expect(betweenViews(from, to, 0.5, stageW, stageH).rot).toBeCloseTo(45)
    expect(betweenViews(from, to, 1, stageW, stageH).rot).toBeCloseTo(90)

    const held = centredOn(400, 300, 4, stageW, stageH, 41)
    const mid = betweenViews(centredOn(100, 100, 1, stageW, stageH, 41), held, 0.5, stageW, stageH)
    expect(mid.rot).toBeCloseTo(41)
  })
})

import { describe, it, expect } from 'vitest'
import {
  MARKER_DEFAULTS, diffMarker, mapMarkerStyle, parseMarkerOverride, pinMarkerStyle,
  resolveMarker, serializeMarker, type MarkerStyle,
} from '@/utils/markerStyle'
import {
  fitFontSize, labelCentre, labelDesigned, labelLineFrom, labelStartLine, markerBox,
} from '@/utils/mapMarker'
import type { LocationItem, MapItem } from '@/types/models'

function map(markerStyle: string | null = null): MapItem {
  return {
    Id: 'm', TimelineId: 1, Name: 'The world', Description: null,
    PictureId: null, PicturePath: null, PictureWidth: 1000, PictureHeight: 800,
    NorthOffset: 0, CompassX: 1, CompassY: 0, CompassSize: 38,
    ScaleLength: 10, ScaleUnit: 'miles', ScaleFraction: 0.2,
    GridCols: 0, MarkerStyle: markerStyle,
    OverviewPath: null, DetailPath: null, ViewError: null, Locations: [],
  }
}

function pin(over: Partial<LocationItem> = {}): LocationItem {
  return {
    Id: 'l', MapId: 'm', ChildMapId: null, Name: 'Ashvale', Description: null,
    X: 0.5, Y: 0.5, Color: null, FootprintW: null, MarkerStyle: null, ...over,
  }
}

const style = (over: Partial<MarkerStyle> = {}): MarkerStyle => ({ ...MARKER_DEFAULTS, ...over })

describe('parseMarkerOverride', () => {
  it('believes a stored style only as far as it makes sense', () => {
    expect(parseMarkerOverride('not json')).toEqual({})
    expect(parseMarkerOverride('[1,2]')).toEqual({})
    expect(parseMarkerOverride('{"shape":"hexagon"}')).toEqual({})
    expect(parseMarkerOverride('{"size":"14"}')).toEqual({})
    expect(parseMarkerOverride('{"size":900}')).toEqual({ size: 96 })
  })

  it('keeps a deliberate null apart from a field nobody set', () => {
    expect(parseMarkerOverride('{"fill":null}')).toEqual({ fill: null })
    expect(parseMarkerOverride('{}')).toEqual({})
  })

  it('carries a label outline, and "no outline" as the null it is', () => {
    expect(parseMarkerOverride('{"labelOutline":"#ffffff"}')).toEqual({ labelOutline: '#ffffff' })
    expect(parseMarkerOverride('{"labelOutline":null}')).toEqual({ labelOutline: null })
    expect(MARKER_DEFAULTS.labelOutline).toBeNull()
  })

  it('carries a hand-drawn label line, negative offsets and all', () => {
    expect(parseMarkerOverride('{"labelDx":-40,"labelDy":12,"labelW":80)}')).toEqual({})
    expect(parseMarkerOverride('{"labelDx":-40,"labelDy":12,"labelW":80}'))
      .toEqual({ labelDx: -40, labelDy: 12, labelW: 80 })
    // A line cannot be of negative length, and a label cannot be a mile from its pin.
    expect(parseMarkerOverride('{"labelW":-5,"labelDx":99999}')).toEqual({ labelW: 0, labelDx: 2000 })
    expect(parseMarkerOverride('{"labelW":"80"}')).toEqual({})
  })

  it('carries how thick the text outline is, 0 being "follow the text"', () => {
    expect(parseMarkerOverride('{"labelOutlineWidth":2.5}')).toEqual({ labelOutlineWidth: 2.5 })
    expect(parseMarkerOverride('{"labelOutlineWidth":99}')).toEqual({ labelOutlineWidth: 12 })
    expect(MARKER_DEFAULTS.labelOutlineWidth).toBe(0)
  })
})

describe('a label on a line of its own', () => {
  it('counts as designed the moment the line has a length', () => {
    expect(labelDesigned(style())).toBe(false)
    expect(labelDesigned(style({ labelW: 80 }))).toBe(true)
  })

  it('sets the text as large as spans the line', () => {
    // 'perPx' is the text's width at 1px of font: 4 here, so 80px of line is 20px of font.
    expect(fitFontSize(80, 4)).toBe(20)
    expect(fitFontSize(160, 4)).toBe(40)
  })

  it('never fits a label down to nothing or up into a banner', () => {
    expect(fitFontSize(0, 4)).toBe(5)
    expect(fitFontSize(80, 0)).toBe(5)
    expect(fitFontSize(NaN, 4)).toBe(5)
    expect(fitFontSize(4, 4)).toBe(5)
    expect(fitFontSize(9000, 4)).toBe(400)
  })

  it('reads a dragged line as a middle, a length and a tilt', () => {
    expect(labelLineFrom({ x: 0, y: 0 }, { x: 80, y: 0 }))
      .toEqual({ mid: { x: 40, y: 0 }, len: 80, angle: 0 })
    expect(labelLineFrom({ x: 0, y: 0 }, { x: 30, y: 40 }).len).toBe(50)
    expect(labelLineFrom({ x: 0, y: 0 }, { x: 30, y: 40 }).angle).toBeCloseTo(53.13, 2)
  })

  it('never lets a name end up on its head, or a line shrink to a dot', () => {
    // Dragged right to left: the same line, read the other way round.
    const back = labelLineFrom({ x: 80, y: 0 }, { x: 0, y: 0 })
    expect(back).toEqual({ mid: { x: 40, y: 0 }, len: 80, angle: 0 })
    expect(labelLineFrom({ x: 0, y: 0 }, { x: -30, y: -40 }).angle).toBeCloseTo(53.13, 2)
    expect(labelLineFrom({ x: 10, y: 10 }, { x: 11, y: 10 }).len).toBe(12)
  })

  it('opens the designer on the line already drawn', () => {
    // ponytail: the other branch measures text through Konva, which needs a real canvas — the
    // arithmetic it adds on top is `labelCentre`, which is covered below.
    expect(labelStartLine(style({ labelDx: -40, labelDy: 12, labelW: 80, labelAngle: 30 }), 'Ashvale'))
      .toEqual({ dx: -40, dy: 12, len: 80, angle: 30 })
  })
})

describe('resolveMarker', () => {
  it('fills a colour left to the place in with the place\'s own', () => {
    expect(resolveMarker(pin({ Color: '#123456' }), map()).fill).toBe('#123456')
    expect(resolveMarker(pin(), map()).fill).toBe('#f59e0b')
    expect(resolveMarker(pin({ MarkerStyle: '{"fill":"#ff0000"}' }), map()).fill).toBe('#ff0000')
  })

  it('drops an icon the shape has nowhere to put', () => {
    const stored = '{"shape":"teardrop","icon":"PhCrown"}'
    expect(resolveMarker(pin({ MarkerStyle: stored }), map()).icon).toBeNull()
    expect(resolveMarker(pin({ MarkerStyle: '{"shape":"badge","icon":"PhCrown"}' }), map()).icon)
      .toBe('PhCrown')
  })
})

describe('what a pin stores', () => {
  it('stores nothing at all when it looks like every other place', () => {
    const m = map('{"shape":"teardrop","size":20}')
    const draft = pinMarkerStyle(pin(), m)
    expect(serializeMarker(diffMarker(draft, mapMarkerStyle(m)))).toBeNull()
  })

  it('stores only what was moved, so the rest keeps following the map', () => {
    const m = map('{"shape":"teardrop","size":20}')
    const draft = pinMarkerStyle(pin(), m)
    draft.size = 30
    const stored = serializeMarker(diffMarker(draft, mapMarkerStyle(m)))
    expect(JSON.parse(stored!)).toEqual({ size: 30 })

    // The map changes its mind about the shape; the pin only ever claimed the size.
    const redrawn = map('{"shape":"flag","size":20}')
    const after = pinMarkerStyle(pin({ MarkerStyle: stored }), redrawn)
    expect(after.shape).toBe('flag')
    expect(after.size).toBe(30)
  })
})

describe('markerBox', () => {
  it('hangs a teardrop above the place and centres a dot on it', () => {
    expect(markerBox(style({ shape: 'dot', size: 24 })))
      .toEqual({ x: -12, y: -12, w: 24, h: 24 })
    expect(markerBox(style({ shape: 'teardrop', size: 24 })))
      .toEqual({ x: -7.5, y: -24, w: 15, h: 24 })
  })

  it('scales with the marker, so a label never has to know the size', () => {
    expect(markerBox(style({ shape: 'dot', size: 12 })))
      .toEqual({ x: -6, y: -6, w: 12, h: 12 })
  })

  it('grows to the dashed ring when the place is a door', () => {
    expect(markerBox(style({ shape: 'dot', size: 24 }), true))
      .toEqual({ x: -17, y: -17, w: 34, h: 34 })
  })
})

describe('labelCentre', () => {
  const box = { x: -12, y: -12, w: 24, h: 24 }

  it('sits the name clear of the marker on whichever side it was put', () => {
    expect(labelCentre('right', box, 40, 14)).toEqual({ x: 36, y: 0 })
    expect(labelCentre('left', box, 40, 14)).toEqual({ x: -36, y: 0 })
    expect(labelCentre('above', box, 40, 14)).toEqual({ x: 0, y: -23 })
    expect(labelCentre('below', box, 40, 14)).toEqual({ x: 0, y: 23 })
  })
})

import { describe, it, expect } from 'vitest'
import { columnName, gridOf, squareOf, DEFAULT_GRID_COLS } from '@/utils/mapGrid'
import type { MapItem } from '@/types/models'

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

describe('columnName', () => {
  it('counts the way a spreadsheet does, so Z is followed by AA', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })

  it('has nothing to say about a column that is not one', () => {
    expect(columnName(-1)).toBe('')
  })
})

describe('gridOf', () => {
  it('makes the squares square, so the rows follow from the picture', () => {
    // 1000×800 in 10 columns: 100px squares, so 8 rows exactly.
    const g = gridOf(map({ GridCols: 10 }), 1000, 800)!
    expect(g).toEqual({ cols: 10, rows: 8, side: 100, w: 1000, h: 800 })
  })

  it('covers the whole map, short last row and all', () => {
    // 1000×850 in 10 columns is eight and a half rows — nine, or half the map is in no square at all.
    expect(gridOf(map({ GridCols: 10 }), 1000, 850)!.rows).toBe(9)
  })

  it('draws its own default until the writer says otherwise', () => {
    expect(gridOf(map(), 1200, 600)!.cols).toBe(DEFAULT_GRID_COLS)
  })

  it('keeps a stored number inside what can be drawn and read', () => {
    expect(gridOf(map({ GridCols: 1 }), 1000, 800)!.cols).toBe(2)
    expect(gridOf(map({ GridCols: 5000 }), 1000, 800)!.cols).toBe(200)
  })

  it('is nothing at all before the picture has a size', () => {
    expect(gridOf(map(), 0, 800)).toBeNull()
    expect(gridOf(null, 1000, 0)).toBeNull()
  })
})

// A pin is stored as 0..1 of the picture, so this is the whole journey from a stored place to the
// square a writer would write down.
describe('squareOf', () => {
  const g = gridOf(map({ GridCols: 10 }), 1000, 800)!   // 100px squares, 10 × 8

  it('names the square a point is in', () => {
    expect(squareOf(0, 0, g)).toBe('A1')
    expect(squareOf(0.35, 0.45, g)).toBe('D4')          // x 350 → col 3, y 360 → row 3
    expect(squareOf(0.99, 0.99, g)).toBe('J8')
  })

  it('puts a boundary in the square it starts, not the one it ends', () => {
    expect(squareOf(0.1, 0, g)).toBe('B1')
    expect(squareOf(0.0999, 0, g)).toBe('A1')
  })

  it('names the edge square for a point on or past the edge, rather than nothing', () => {
    // A pin at exactly 1 is otherwise column eleven of ten, and half a pin over the border is still
    // somewhere a reader can be sent.
    expect(squareOf(1, 1, g)).toBe('J8')
    expect(squareOf(1.4, -0.2, g)).toBe('J1')
  })

  it('has nothing to say without a grid or without a place', () => {
    expect(squareOf(0.5, 0.5, null)).toBe('')
    expect(squareOf(Number.NaN, 0.5, g)).toBe('')
  })
})

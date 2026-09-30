import { describe, it, expect } from 'vitest'
import type { MapItem } from '@/types/models'
import type { ChartAsk, ChartId } from '@/utils/mapCast'
import { buildChart, busyCounts, mostAtOnce, sankeyLayout, weaveBands, weaveLayout, weaveNames } from '@/utils/mapCharts'

const stay = (pin: string | null, from: number, to = from) => ({ pin, from, to })
const stop = (locationId: string, from: number, to = from) => ({ locationId, from, to, title: '' })

describe('busyCounts', () => {
  it('counts someone once a slice however often they come and go, and a moment in its slice', () => {
    // 0..10 in five slices: in and out of the keep twice inside the first, back for a moment at 5.
    const one = [stay('keep', 0, 0.5), stay('mill', 0.8), stay('keep', 1, 1.5), stay('keep', 5)]
    const counts = busyCounts([one, [stay('keep', 0, 10)]], 0, 10, 5)
    expect(counts.get('keep')).toEqual([2, 1, 2, 1, 1])
    expect(counts.get('mill')).toEqual([1, 0, 0, 0, 0])
  })
})

describe('mostAtOnce', () => {
  it('is one head for a stay cut in two by an errand, and two for two at one moment', () => {
    const cut = [{ who: 0, from: 0, to: 5 }, { who: 0, from: 5, to: 10 }]
    expect(mostAtOnce(cut)).toBe(1)
    expect(mostAtOnce([...cut, { who: 1, from: 5, to: 5 }])).toBe(2)
  })
})

describe('weaveLayout', () => {
  it('keeps the order from the column before, and a newcomer comes in under whoever they join', () => {
    // a and b at the keep, then b off to the mill, where c turns up.
    const { ys, height } = weaveLayout([['keep', 'keep'], ['keep', 'mill'], [null, 'mill']], 2, 10)
    expect(ys).toEqual([[0, 0], [2, 10], [null, 12]])
    expect(height).toBe(12)
  })
})

describe('weaveBands', () => {
  it('spans a place from its top thread to its bottom one, breaks where it empties, and leaves off-map out', () => {
    // a stays at the keep while b pops over to the mill; c is off the map; d leaves the inn and comes back.
    const at = [['keep', 'keep', 'keep'], ['keep', 'mill', 'keep'], ['~', '~', null], ['inn', null, 'inn']]
    const ys = [[0, 0, 0], [2, 10, 2], [10, 20, null], [20, null, 10]]
    expect(weaveBands(at, ys)).toEqual([
      { place: 'keep', k0: 0, tops: [0, 0, 0], bots: [2, 0, 2] },
      { place: 'inn', k0: 0, tops: [20], bots: [20] },
      { place: 'mill', k0: 1, tops: [10], bots: [10] },
      { place: 'inn', k0: 2, tops: [10], bots: [10] },
    ])
  })
})

describe('weaveNames', () => {
  it('keeps names level with threads that start at the edge, and moves later ones down clear of them', () => {
    // A late thread level with an edge one, and another late one just under that: both go below.
    expect(weaveNames([{ first: 3, y: 10 }, { first: 0, y: 0 }, { first: 0, y: 10 }, { first: 5, y: 14 }], 10))
      .toEqual([20, 0, 10, 30])
  })
})

describe('sankeyLayout', () => {
  it('stands a place\'s bands side by side in the order of their far ends', () => {
    const l = sankeyLayout([{ from: 'a', to: 'b', trips: 2, people: 2 }, { from: 'a', to: 'c', trips: 1, people: 1 }], 30, 4, 2)
    expect(l.left).toEqual([{ id: 'a', y: 0, h: 18 }])
    expect(l.right).toEqual([{ id: 'b', y: 0, h: 12 }, { id: 'c', y: 14, h: 6 }])
    expect(l.bands.map(b => [b.y0, b.y1, b.w])).toEqual([[6, 6, 12], [15, 17, 6]])
    expect(l.height).toBe(20)
  })
})

describe('buildChart', () => {
  const map = {
    Locations: [{ Id: 'keep', Name: 'Keep', X: 0, Y: 0 }, { Id: 'mill', Name: 'Mill', X: 0.3, Y: 0.4 }],
    PictureWidth: 100,
    PictureHeight: 100,
    ScaleLength: 10,
    ScaleFraction: 0.1,
    ScaleUnit: 'miles',
  } as unknown as MapItem
  // Both at the keep a while, apart, then at the same event at the mill.
  const people = [
    { id: 'a', name: 'Ada', colour: '#f00', stops: [stop('keep', 0, 2), stop('mill', 5, 6)] },
    { id: 'b', name: 'Bo', colour: '#00f', stops: [stop('keep', 1, 3), stop('mill', 5, 6)] },
  ]
  const words = { date: (t: number) => `y${t}`, long: (y: number) => `${y}y`, leg: () => ({ units: 1, unit: 'mi' }) }
  const chart = (id: ChartId) =>
    buildChart({ id, ask: {}, lo: 0, hi: 10, map, pinOf: l => l, people, spotlight: null }, words)

  it('works every chart out of the same two journeys', () => {
    expect(chart('story')).toMatchObject({ rows: [{ id: 'keep' }, { id: 'mill' }], ticks: [{ at: 0 }, { at: 3 }, { at: 5 }, { at: 8 }, { at: 10 }] })
    expect(chart('strips')).toMatchObject({ people: [{ id: 'a', bars: [{ text: 'Keep, y0 – y2', place: 'keep' },{ text: 'Mill, y5 – y6' }] }, { id: 'b' }] })
    expect(chart('heat')).toMatchObject({ rows: [{ id: 'keep' }, { id: 'mill' }], max: 2 })
    expect(chart('tables')).toMatchObject({
      people: [{ id: 'a', trips: 1, distanceText: '1 mi', first: 0, last: 6 }, { id: 'b', first: 1 }],
      places: [{ id: 'keep', people: 2, most: 2 }, { id: 'mill', people: 2, most: 2 }],
    })
    expect(chart('met')).toMatchObject({ people: [{ n: 1 }, { n: 1 }], pairs: [[0, 1, 1]] })
    expect(chart('crowd')).toMatchObject({ place: 'keep', people: [{ id: 'a' }, { id: 'b' }] })
    const apart = chart('apart')
    // Bo is not in the story at 0; at 10 both are past their last stop.
    expect(apart).toMatchObject({ a: 'a', b: 'b', unit: 'miles' })
    if (apart.chart === 'apart') expect([apart.points[0], apart.points.at(-1)]).toEqual([null, null])
    expect(chart('weave')).toMatchObject({ places: [{ id: 'keep', name: 'Keep' }, { id: 'mill', name: 'Mill' }], people: [{ id: 'a' }, { id: 'b' }] })
    expect(chart('sankey')).toMatchObject({ links: [{ from: 'keep', to: 'mill', trips: 2, people: 2 }] })
  })

  it('zooms into a stretch cut to what is open, and says who someone ever met', () => {
    // Cy is only ever at the keep alone, long after the others.
    const cy = { id: 'c', name: 'Cy', colour: '#0f0', stops: [stop('keep', 8, 9)] }
    const ask = (a: ChartAsk) =>
      buildChart({ id: 'apart', ask: a, lo: 0, hi: 10, map, pinOf: l => l, people: [...people, cy], spotlight: null }, words)
    // Zoomed past the end: cut to 10, and the mill they met at is outside the stretch but still counts.
    expect(ask({ a: 'a', b: 'b', from: 7, to: 20 })).toMatchObject({ lo: 7, hi: 10, met: 'each other' })
    expect(ask({ a: 'a', b: 'c' })).toMatchObject({ met: 'others' })
    expect(ask({ a: 'c', b: 'a' })).toMatchObject({ met: 'nobody' })
    // Wholly outside what is open is no zoom at all.
    expect(ask({ from: 20, to: 30 })).toMatchObject({ lo: 0, hi: 10 })
  })
})

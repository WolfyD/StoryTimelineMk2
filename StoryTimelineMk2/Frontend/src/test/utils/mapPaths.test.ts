import { describe, it, expect } from 'vitest'
import {
  arc, bundleLegs, dwellRadius, fanRadius, leanOf, sideways, strandOffsets, strandWeight,
} from '@/utils/mapPaths'

describe('leanOf', () => {
  it('gives the same character the same lean every time', () => {
    expect(leanOf('mira')).toBe(leanOf('mira'))
  })

  it('leans two characters differently', () => {
    expect(leanOf('mira')).not.toBe(leanOf('corin'))
  })

  // A lean of nearly nothing draws a straight line, which is exactly the flimsy look bowing exists
  // to get away from.
  it('never lands near zero', () => {
    for (const id of ['a', 'mira', 'corin', 'x9f2', '', 'Æthelred', '00000000-0000-0000-0000-000000000000'])
      expect(Math.abs(leanOf(id))).toBeGreaterThanOrEqual(0.45)
  })

  it('stays inside one lean either way', () => {
    for (const id of ['a', 'mira', 'corin', 'x9f2', 'zzzzzzzzzzzzzzzz'])
      expect(Math.abs(leanOf(id))).toBeLessThanOrEqual(1)
  })

  it('sends some characters one way and some the other', () => {
    const leans = ['a', 'b', 'c', 'd', 'e', 'f'].map(leanOf)
    expect(leans.some(l => l > 0)).toBe(true)
    expect(leans.some(l => l < 0)).toBe(true)
  })
})

describe('arc', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 100, y: 0 }

  it('is the two ends and nothing else when there is no lean', () => {
    expect(arc(a, b, 0, 10)).toEqual([a, b])
  })

  it('starts and ends exactly on the places it joins', () => {
    const pts = arc(a, b, 0.5, 8)
    expect(pts[0]).toEqual(a)
    expect(pts[pts.length - 1]).toEqual(b)
  })

  it('draws one point more than it has segments', () => {
    expect(arc(a, b, 0.5, 8)).toHaveLength(9)
  })

  it('bows off the straight line in the middle', () => {
    const mid = arc(a, b, 0.5, 8)[4]!
    expect(mid.y).not.toBe(0)
    expect(mid.x).toBeCloseTo(50, 6)
  })

  it('sends an opposite lean the opposite way', () => {
    const left = arc(a, b, 0.5, 8)[4]!
    const right = arc(a, b, -0.5, 8)[4]!
    expect(left.y).toBeCloseTo(-right.y, 6)
  })

  // Or a journey across the world would bow the same handful of pixels as a hop across a city, and
  // the long one would read as a ruler line again.
  it('bows in proportion to the length of the leg', () => {
    const short = arc(a, { x: 100, y: 0 }, 0.5, 8)[4]!
    const long = arc(a, { x: 400, y: 0 }, 0.5, 8)[4]!
    expect(Math.abs(long.y)).toBeCloseTo(Math.abs(short.y) * 4, 6)
  })

  it('bows at right angles to a leg at any angle', () => {
    const pts = arc({ x: 0, y: 0 }, { x: 0, y: 100 }, 0.5, 8)
    expect(pts[4]!.x).not.toBe(0)
    expect(pts[4]!.y).toBeCloseTo(50, 6)
  })

  it('does not blow up on a leg of no length', () => {
    expect(arc(a, { ...a }, 0.5, 8)).toEqual([a, { ...a }])
  })
})

describe('fanRadius', () => {
  it('leaves one person where they stand', () => {
    expect(fanRadius(1, 16, 13)).toBe(0)
    expect(fanRadius(0, 16, 13)).toBe(0)
  })

  it('holds a small group at the floor rather than pulling it in tight', () => {
    expect(fanRadius(2, 16, 13)).toBe(13)
  })

  // The whole point: ten people regrouping get a ring ten people fit on.
  it('grows the ring with the crowd', () => {
    expect(fanRadius(10, 16, 13)).toBeGreaterThan(fanRadius(3, 16, 13))
  })

  it('gives everyone the gap they were promised once the ring is past the floor', () => {
    const count = 20
    const r = fanRadius(count, 16, 13)
    // Circumference shared out: each of them has `gap` of arc to themselves.
    expect((2 * Math.PI * r) / count).toBeCloseTo(16, 6)
  })
})

describe('bundleLegs', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }
  const leg = (id: string, key: string, colour = 'red', alpha = 1) => ({ key, id, colour, alpha, a, b })

  it('fuses people who walked the same road at the same time', () => {
    const roads = bundleLegs([leg('mira', 'x'), leg('corin', 'x'), leg('ash', 'y')])
    expect(roads).toHaveLength(2)
    expect(roads[0]!.strands).toEqual([{ colour: 'red', ids: ['mira', 'corin'] }])
  })

  it('keeps one strand per colour, in a stable order', () => {
    const one = bundleLegs([leg('m', 'x', 'red'), leg('c', 'x', 'blue')])[0]!
    const two = bundleLegs([leg('c', 'x', 'blue'), leg('m', 'x', 'red')])[0]!
    expect(one.strands.map(s => s.colour)).toEqual(['blue', 'red'])
    expect(two.strands).toEqual(one.strands)
  })

  it('takes the freshest of the party as the road\'s strength', () => {
    expect(bundleLegs([leg('m', 'x', 'red', 0.2), leg('c', 'x', 'red', 0.7)])[0]!.alpha).toBe(0.7)
  })
})

describe('strandWeight', () => {
  it('is one line for one person, thicker for more, and stops at four', () => {
    expect(strandWeight(1)).toBe(1)
    expect(strandWeight(2)).toBeCloseTo(1.6, 6)
    expect(strandWeight(50)).toBe(4)
  })
})

describe('strandOffsets', () => {
  it('puts a lone strand on the road itself', () => {
    expect(strandOffsets([5], 1)).toEqual([0])
  })

  it('lays strands side by side, centred on the road', () => {
    // 2 + 1 + 4 = 7 wide, from -3.5: centres at -2.5 and 1.5.
    expect(strandOffsets([2, 4], 1)).toEqual([-2.5, 1.5])
  })
})

describe('sideways', () => {
  it('moves both ends the same distance at right angles', () => {
    const [a, b] = sideways({ x: 0, y: 0 }, { x: 10, y: 0 }, 3)
    expect(a).toEqual({ x: 0, y: 3 })
    expect(b).toEqual({ x: 10, y: 3 })
  })

  it('leaves a leg of no length alone', () => {
    const p = { x: 4, y: 4 }
    expect(sideways(p, p, 3)).toEqual([p, p])
  })
})

describe('dwellRadius', () => {
  it('has nothing to draw for a moment in passing', () => {
    expect(dwellRadius(0, 100, 20)).toBe(0)
  })

  it('has nothing to draw when there is no reach to measure against', () => {
    expect(dwellRadius(10, 0, 20)).toBe(0)
  })

  it('fills the ring for a stay as long as the whole reach', () => {
    expect(dwellRadius(100, 100, 20)).toBe(20)
  })

  it('never grows past the biggest ring allowed', () => {
    expect(dwellRadius(9000, 100, 20)).toBe(20)
  })

  // Radius by area, so a short stay is still a ring somebody can see.
  it('leaves a tenth-length stay visible rather than a dot', () => {
    expect(dwellRadius(10, 100, 20)).toBeCloseTo(6.32, 2)
  })
})

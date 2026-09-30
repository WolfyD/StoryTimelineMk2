import { describe, it, expect } from 'vitest'
import { personFacts, summarise, type Journey } from '@/utils/mapSummary'

const stop = (locationId: string, from: number, to = from) => ({ locationId, from, to, title: '' })
const pinOf = (loc: string) => (loc === 'nowhere' ? null : loc.split('.')[0]!)
const walk = (id: string, colour: string, ...stops: ReturnType<typeof stop>[]): Journey => ({ id, colour, stops })

describe('summarise', () => {
  it('draws a road walked a hundred times as one lane with a count', () => {
    const back = [stop('a', 0), stop('b', 1), stop('a', 2), stop('b', 3)]
    const s = summarise([walk('mira', 'red', ...back)], 0, 10, pinOf, 3)
    const ab = s.lanes.find(l => l.key === 'a>b')!
    expect(ab.trips).toBe(2)
    expect(ab.byWho.get('mira')).toBe(2)
    expect(ab.when).toEqual([0, 2])
    // The way back is its own lane, so a two-way road is two.
    expect(s.lanes.find(l => l.key === 'b>a')!.trips).toBe(1)
  })

  it('counts people once each on a lane, in one strand per colour', () => {
    // Each on a journey of their own, so none of them is a party.
    const s = summarise([
      walk('mira', 'red', stop('a', 0), stop('b', 1)),
      walk('corin', 'red', stop('a', 2), stop('b', 3)),
      walk('ash', 'blue', stop('a', 4), stop('b', 5)),
    ], 0, 10, pinOf, 3)
    expect(s.lanes).toHaveLength(1)
    expect(s.lanes[0]!.strands).toEqual([
      { colour: 'blue', ids: ['ash'] },
      { colour: 'red', ids: ['mira', 'corin'] },
    ])
    expect(s.travellers).toBe(3)
    expect(s.parties).toEqual([])
    expect(s.departures.get('a')).toBe(3)
    expect(s.arrivals.get('b')).toBe(3)
  })

  it('makes one strand of a party, in its first member’s colour, and ranks the busiest road first', () => {
    const together = [stop('a', 0), stop('b', 1), stop('c', 2)]
    const s = summarise([
      walk('mira', 'red', ...together),
      walk('ash', 'blue', ...together),
      // The same roads, but not from the same events: not with them.
      walk('corin', 'red', stop('a', 5), stop('b', 6)),
    ], 0, 10, pinOf, 3)
    expect(s.parties).toEqual([{ id: 'mira', ids: ['mira', 'ash'] }])
    expect(s.lanes.map(l => l.key)).toEqual(['a>b', 'b>c'])
    expect(s.lanes[0]!.strands).toEqual([
      { colour: 'red', ids: ['mira', 'ash'], party: 'mira' },
      { colour: 'red', ids: ['corin'] },
    ])
  })

  it('leaves out a trip wholly outside the window', () => {
    const s = summarise([walk('mira', 'red', stop('a', 0), stop('b', 1), stop('c', 20))], 5, 10, pinOf, 3)
    // a→b arrived before the window opened; b→c set off at 1, arrives at 20: it crosses the window.
    expect(s.lanes.map(l => l.key)).toEqual(['b>c'])
  })

  it('is not a road between two places behind the same door', () => {
    const s = summarise([walk('mira', 'red', stop('a.inn', 0), stop('a.mill', 1))], 0, 10, pinOf, 3)
    expect(s.lanes).toEqual([])
  })

  it('breaks the chain at a place this map cannot show', () => {
    const s = summarise([walk('mira', 'red', stop('a', 0), stop('nowhere', 1), stop('b', 2))], 0, 10, pinOf, 3)
    expect(s.lanes).toEqual([])
  })

  it('adds up the time spent at each pin, clipped to the window', () => {
    const s = summarise([
      walk('mira', 'red', stop('a', 0, 4)),
      walk('corin', 'red', stop('a', 3, 20)),
    ], 2, 10, pinOf, 3)
    // Mira 2..4 = 2, Corin 3..10 = 7.
    expect(s.stays.get('a')).toBe(9)
  })

  it('marks a pin where enough of them were at one event', () => {
    const council = stop('a', 5, 6)
    const s = summarise([
      walk('mira', 'red', council),
      walk('corin', 'red', council),
      walk('ash', 'red', council),
      walk('bryn', 'red', stop('b', 5, 6)),
    ], 0, 10, pinOf, 3)
    expect(s.meetings.get('a')).toBe(3)
    expect(s.meetings.has('b')).toBe(false)
  })
})

describe('personFacts', () => {
  const at = (locationId: string, from: number, to: number, ...others: string[]) => ({ ...stop(locationId, from, to), with: others })
  // One mile a letter apart, in miles; nothing measures to or from x.
  const leg = (a: string, b: string) =>
    a === 'x' || b === 'x' ? null : { units: Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), unit: 'miles' }

  it('counts trips, road time, distance and company inside the window', () => {
    const life = [at('a', 0, 1, 'ash'), at('a', 2, 3, 'ash', 'bryn'), at('c', 5, 6, 'ash'), at('x', 8, 9), at('d', 20, 21)]
    const f = personFacts(life, 0, 10, leg)
    // a→a is staying put; a→c, c→x set off inside; x→d arrives after the window, still in it (sets off at 9).
    expect(f.trips).toBe(3)
    expect(f.road).toBe(2 + 2 + 11)
    // Only a→c measures: the trips to and from x do not.
    expect(f.distance).toEqual(new Map([['miles', 2]]))
    expect(f.places).toBe(3)
    expect(f.company).toEqual(new Map([['ash', 3], ['bryn', 1]]))
  })

  it('leaves out what is wholly outside the window', () => {
    const f = personFacts([at('a', 0, 1, 'ash'), at('b', 2, 3), at('c', 12, 13)], 5, 10, leg)
    // a→b arrived before it opened; b→c sets off before and arrives after — across it.
    expect(f.trips).toBe(1)
    expect(f.places).toBe(0)
    expect(f.company.size).toBe(0)
  })
})

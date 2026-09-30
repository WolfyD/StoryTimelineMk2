import { describe, it, expect } from 'vitest'
import {
  eventSpan, happeningAt, timeSpan, moments, stepTo, eventsAt, placeStates, ongoing,
  castOf, castAround, onTheirTimeline, stopsFor, legAt, trailFade, snapTo, tickDensity,
} from '@/utils/mapTime'
import type { CharacterItem, CharacterRelationship, MapEvent } from '@/types/models'

/**
 * A row as the map reads one. The absolutes are what everything here works in; a row stores them
 * beside the years, so unless a test says otherwise they agree and the years can be written alone.
 */
function ev(over: Partial<MapEvent> = {}): MapEvent {
  const Year = over.Year ?? 100
  const EndYear = over.EndYear ?? 0
  return {
    ItemId: 'i', Title: 'Something', TypeId: 1, Color: null,
    Year, EndYear, AbsoluteStart: Year, AbsoluteEnd: EndYear,
    LocationId: 'ashvale', MapId: 'm', Cast: [],
    ...over,
  }
}

describe('eventSpan', () => {
  it('reads a one-moment event as starting and ending there', () => {
    expect(eventSpan(ev({ Year: 812, EndYear: 0 }))).toEqual({ from: 812, to: 812 })
  })

  it('ignores an end that is before the start, rather than running time backwards', () => {
    expect(eventSpan(ev({ Year: 812, EndYear: 400 }))).toEqual({ from: 812, to: 812 })
  })

  it('keeps a real span', () => {
    expect(eventSpan(ev({ Year: 812, EndYear: 830 }))).toEqual({ from: 812, to: 830 })
  })

  it('keeps the sub-year part, which is the whole point of reading absolutes', () => {
    const feast = ev({ Year: 812, EndYear: 812, AbsoluteStart: 812.25, AbsoluteEnd: 812.75 })
    expect(eventSpan(feast)).toEqual({ from: 812.25, to: 812.75 })
  })

  // A missing end is stored as zero in both columns, and a battle in 500 BC has a start below it.
  it('does not read a one-moment event before the reckoning as an age ending at year zero', () => {
    expect(eventSpan(ev({ Year: -500, EndYear: 0, AbsoluteStart: -500.3, AbsoluteEnd: 0 })))
      .toEqual({ from: -500.3, to: -500.3 })
  })

  // Here the zero end year is real: both ends are inside year 0, so only the absolute can tell.
  it('keeps a range that opens and closes inside year zero', () => {
    expect(eventSpan(ev({ Year: 0, EndYear: 0, AbsoluteStart: 0.1, AbsoluteEnd: 0.8 })))
      .toEqual({ from: 0.1, to: 0.8 })
  })
})

describe('happeningAt', () => {
  const siege = ev({ Year: 812, EndYear: 815 })

  it('is happening on both of its own edges', () => {
    expect(happeningAt(siege, 812)).toBe(true)
    expect(happeningAt(siege, 815)).toBe(true)
  })

  it('is happening in every year between', () => {
    expect(happeningAt(siege, 813)).toBe(true)
  })

  it('is not happening before or after', () => {
    expect(happeningAt(siege, 811)).toBe(false)
    expect(happeningAt(siege, 816)).toBe(false)
  })

  it('works for a year 0 timeline, where a falsy year is a real one', () => {
    expect(happeningAt(ev({ Year: 0, EndYear: 0 }), 0)).toBe(true)
    expect(happeningAt(ev({ Year: 0, EndYear: 0 }), 1)).toBe(false)
  })

  it('catches anything overlapping a window at all, not only what spans the whole of it', () => {
    expect(happeningAt(siege, 700, 813)).toBe(true)   // starts inside
    expect(happeningAt(siege, 814, 900)).toBe(true)   // ends inside
    expect(happeningAt(siege, 700, 900)).toBe(true)   // swallowed whole
    expect(happeningAt(siege, 900, 1000)).toBe(false) // after it entirely
  })
})

describe('timeSpan', () => {
  it('covers the earliest start and the latest end, not the latest start', () => {
    // The age begins first and ends last; the battle inside it must not shorten the scrubber.
    const span = timeSpan([ev({ Year: 900 }), ev({ Year: 800, EndYear: 1200 })])
    expect(span).toEqual({ min: 800, max: 1200 })
  })

  it('is null when nothing happened anywhere', () => {
    expect(timeSpan([])).toBeNull()
  })

  it('handles negative years, which a before-the-reckoning timeline is full of', () => {
    expect(timeSpan([ev({ Year: -300 }), ev({ Year: 50 })])).toEqual({ min: -300, max: 50 })
  })
})

describe('moments', () => {
  it('is every start and end, earliest first', () => {
    expect(moments([ev({ Year: 850 }), ev({ Year: 800, EndYear: 900 })])).toEqual([800, 850, 900])
  })

  // Six councils on six days of one year is six moments. A scrubber that only knew the year would
  // stack all six on one tick and step straight past the lot of them.
  it('separates several things inside one year', () => {
    const day = (d: number) => ev({ Year: 800, AbsoluteStart: 800 + d / 365 })
    expect(moments([day(4), day(200), day(9)])).toHaveLength(3)
  })

  it('names an instant once however many things happen on it', () => {
    expect(moments([ev({ Year: 800 }), ev({ Year: 800 }), ev({ Year: 800 })])).toEqual([800])
  })

  it('has nothing for a story with nothing placed in it', () => {
    expect(moments([])).toEqual([])
  })
})

describe('snapTo', () => {
  it('lands on the nearest moment within reach', () => {
    expect(snapTo([100, 110, 120], 108, 5)).toBe(110)
  })

  it('stays put when nothing is close enough', () => {
    expect(snapTo([100, 120], 110, 5)).toBe(110)
  })

  it('picks the closer of two moments both in reach', () => {
    expect(snapTo([100, 104], 103, 5)).toBe(104)
  })
})

describe('tickDensity', () => {
  it('counts moments into equal slices, the last one closed at max', () => {
    expect(tickDensity([0, 1, 5, 9, 10], 0, 10, 2)).toEqual([2, 3])
  })

  it('ignores moments outside the span and survives a span of zero', () => {
    expect(tickDensity([-1, 5, 11], 0, 10, 2)).toEqual([0, 1])
    expect(tickDensity([5, 5], 5, 5, 3)).toEqual([2, 0, 0])
  })
})

describe('stepTo', () => {
  const list = [800, 850, 900]

  it('goes to the next one, not the one it is standing on', () => {
    expect(stepTo(list, 850, 1)).toBe(900)
    expect(stepTo(list, 849, 1)).toBe(850)
  })

  it('goes back to the last one before it', () => {
    expect(stepTo(list, 850, -1)).toBe(800)
    expect(stepTo(list, 851, -1)).toBe(850)
  })

  it('is null at either end, which is what stops a run', () => {
    expect(stepTo(list, 900, 1)).toBeNull()
    expect(stepTo(list, 800, -1)).toBeNull()
    expect(stepTo([], 800, 1)).toBeNull()
  })
})

describe('what the moment lights up', () => {
  const events = [
    ev({ ItemId: 'a', LocationId: 'ashvale', Year: 800, EndYear: 900 }),
    ev({ ItemId: 'b', LocationId: 'harbour', Year: 850 }),
    ev({ ItemId: 'c', LocationId: 'ashvale', Year: 850 }),
    ev({ ItemId: 'd', LocationId: 'keep', Year: 1000 }),
  ]

  it('lists everything running then', () => {
    expect(eventsAt(events, 850).map(e => e.ItemId)).toEqual(['a', 'b', 'c'])
  })

  it('names each place once, however much is going on there', () => {
    expect([...placeStates(events, 850, 850, 0).keys()]).toEqual(['ashvale', 'harbour'])
  })

  it('lights nothing in a quiet year', () => {
    expect(placeStates(events, 950, 950, 0).size).toBe(0)
  })

  it('lights everything a date range covers, not only what is running on its far edge', () => {
    // 950 on its own is quiet; asked as a window back to 840 it has the harbour and the age in it.
    expect([...placeStates(events, 840, 950, 0).keys()].sort()).toEqual(['ashvale', 'harbour'])
    expect(eventsAt(events, 840, 1000).map(e => e.ItemId)).toEqual(['a', 'b', 'c', 'd'])
  })
})

// ── The long things, and how loudly a place says them ────────────────────────────

describe('placeStates', () => {
  // The age runs a century; the council sits for a day of it, in the same city.
  const age = ev({ ItemId: 'age', LocationId: 'ashvale', Year: 800, EndYear: 900 })
  const council = ev({ ItemId: 'council', LocationId: 'ashvale', Year: 850 })
  const harbour = ev({ ItemId: 'harbour', LocationId: 'harbour', Year: 850 })

  it('says a long thing quietly and a short thing loudly', () => {
    const states = placeStates([age, harbour], 850, 850, 50)
    expect(states.get('ashvale')).toBe('quiet')
    expect(states.get('harbour')).toBe('loud')
  })

  // Otherwise the one year in the age when something actually happened looks like all the rest.
  it('lets the council sitting drown out the age around it', () => {
    expect(placeStates([age, council], 850, 850, 50).get('ashvale')).toBe('loud')
  })

  it('does not care which of them was listed first', () => {
    expect(placeStates([council, age], 850, 850, 50).get('ashvale')).toBe('loud')
  })

  // A ring that is always on says nothing, but so does a map that is entirely quiet.
  it('has no backdrop at all when there is no length to measure against', () => {
    expect(placeStates([age, harbour], 850, 850, 0).get('ashvale')).toBe('loud')
  })

  it('leaves a place with nothing going on out of it entirely', () => {
    expect(placeStates([age], 950, 950, 50).has('ashvale')).toBe(false)
  })

  it('counts something exactly as long as the threshold as long', () => {
    expect(placeStates([age], 850, 850, 100).get('ashvale')).toBe('quiet')
    expect(placeStates([age], 850, 850, 101).get('ashvale')).toBe('loud')
  })
})

describe('ongoing', () => {
  const age = ev({ ItemId: 'age', LocationId: 'ashvale', Year: 800, EndYear: 900 })
  const reign = ev({ ItemId: 'reign', LocationId: 'keep', Year: 840, EndYear: 1000 })
  const council = ev({ ItemId: 'council', LocationId: 'ashvale', Year: 850 })

  it('names the long things running and nothing else', () => {
    expect(ongoing([age, reign, council], 850, 850, 50).map(e => e.ItemId)).toEqual(['age', 'reign'])
  })

  it('reads oldest first, so the standing backdrop comes before what joined it', () => {
    expect(ongoing([reign, age], 850, 850, 50).map(e => e.ItemId)).toEqual(['age', 'reign'])
  })

  it('drops one that has ended by the moment asked about', () => {
    expect(ongoing([age, reign], 950, 950, 50).map(e => e.ItemId)).toEqual(['reign'])
  })

  it('has nothing to name on a timeline too small to have a backdrop', () => {
    expect(ongoing([age, reign], 850, 850, 0)).toEqual([])
  })
})

// ── Who was where ────────────────────────────────────────────────────────────────

const mira = { CharacterId: 'mira', Name: 'Mira', Color: '#ef4444' }
const aldo = { CharacterId: 'aldo', Name: 'Aldo', Color: null }

describe('castOf', () => {
  it('names everyone once, alphabetically, however many events they were at', () => {
    const cast = castOf([
      ev({ Cast: [mira, aldo] }),
      ev({ Cast: [mira] }),
    ])
    expect(cast.map(c => c.CharacterId)).toEqual(['aldo', 'mira'])
  })

  it('keeps a colour given on one event when another leaves it out', () => {
    const cast = castOf([
      ev({ Cast: [{ ...mira, Color: null }] }),
      ev({ Cast: [mira] }),
    ])
    expect(cast[0]!.Color).toBe('#ef4444')
  })

  it('is empty when nobody was present anywhere', () => {
    expect(castOf([ev(), ev()])).toEqual([])
  })
})

describe('castAround', () => {
  const bren = { CharacterId: 'bren', Name: 'Bren', Color: null }

  it('is everyone who was somewhere with them, and them', () => {
    const near = castAround([ev({ Cast: [mira, aldo] }), ev({ Cast: [bren] })], 'mira')
    expect(near.map(c => c.CharacterId)).toEqual(['aldo', 'mira'])
  })

  it('has nothing for a character who was never placed anywhere', () => {
    expect(castAround([ev({ Cast: [mira] })], 'bren')).toEqual([])
  })
})

describe('onTheirTimeline', () => {
  const events = [
    ev({ ItemId: 'aldo-born', Year: 600 }),
    ev({ ItemId: 'mira-born', Year: 700 }),
    ev({ ItemId: 'letter', Year: 750 }),           // Mira is only mentioned in it
    ev({ ItemId: 'council', Year: 800, Cast: [mira, aldo] }),
    ev({ ItemId: 'bren-born', Year: 820 }),        // no relation of hers
    ev({ ItemId: 'elsewhere', Year: 900, Cast: [aldo] }),
  ]
  const characters = [
    { Id: 'mira', BirthItemId: 'mira-born' },
    { Id: 'aldo', BirthItemId: 'aldo-born' },
    { Id: 'bren', BirthItemId: 'bren-born' },
  ] as CharacterItem[]
  const relations = [{ Character1Id: 'aldo', Character2Id: 'mira' }] as CharacterRelationship[]

  it('is what her own timeline shows: links, mentions, her birth and her family\'s', () => {
    const theirs = onTheirTimeline(events, 'mira', new Set(['letter', 'council']), characters, relations)
    expect(theirs.map(e => e.ItemId)).toEqual(['aldo-born', 'mira-born', 'letter', 'council'])
    expect(timeSpan(theirs)).toEqual({ min: 600, max: 800 })
  })

  // What is on screen while the links load: already hers, only not all of it yet.
  it('falls back to where she was present before anything else has arrived', () => {
    expect(onTheirTimeline(events, 'mira', new Set(), [], []).map(e => e.ItemId)).toEqual(['council'])
  })
})

describe('stopsFor', () => {
  const events = [
    ev({ Title: 'Harbour', LocationId: 'harbour', Year: 850, Cast: [mira] }),
    ev({ Title: 'Ashvale', LocationId: 'ashvale', Year: 800, EndYear: 810, Cast: [mira, aldo] }),
    ev({ Title: 'Keep', LocationId: 'keep', Year: 900, Cast: [aldo] }),
  ]

  it('lists only the events that character was at, earliest first', () => {
    expect(stopsFor(events, 'mira')).toEqual([
      { locationId: 'ashvale', from: 800, to: 810, title: 'Ashvale' },
      { locationId: 'harbour', from: 850, to: 850, title: 'Harbour' },
    ])
  })

  it('gives nothing for someone who was never anywhere', () => {
    expect(stopsFor(events, 'nobody')).toEqual([])
  })
})

describe('legAt', () => {
  const stops = stopsFor([
    ev({ LocationId: 'ashvale', Year: 800, EndYear: 810, Cast: [mira] }),
    ev({ LocationId: 'harbour', Year: 850, Cast: [mira] }),
  ], 'mira')

  it('stands them at a place for every year that event runs', () => {
    expect(legAt(stops, 805)).toMatchObject({ at: { locationId: 'ashvale' }, next: null, t: 0 })
    expect(legAt(stops, 810)).toMatchObject({ at: { locationId: 'ashvale' }, t: 0 })
  })

  it('puts them on the road between one place and the next', () => {
    const leg = legAt(stops, 830)
    expect(leg?.at.locationId).toBe('ashvale')
    expect(leg?.next?.locationId).toBe('harbour')
    expect(leg?.t).toBeCloseTo(0.5)
  })

  it('is nowhere before their first event and after their last', () => {
    expect(legAt(stops, 799)).toBeNull()
    expect(legAt(stops, 851)).toBeNull()
  })

  it('prefers the place they arrived at over an age still running around them', () => {
    const inside = stopsFor([
      ev({ LocationId: 'realm', Year: 800, EndYear: 900, Cast: [mira] }),
      ev({ LocationId: 'keep', Year: 850, EndYear: 860, Cast: [mira] }),
    ], 'mira')
    expect(legAt(inside, 855)?.at.locationId).toBe('keep')
  })

  it('is nowhere for someone with no stops at all', () => {
    expect(legAt([], 850)).toBeNull()
  })
})

describe('trailFade', () => {
  const stops = stopsFor([
    ev({ LocationId: 'ashvale', Year: 800, Cast: [mira] }),
    ev({ LocationId: 'harbour', Year: 850, Cast: [mira] }),
    ev({ LocationId: 'keep', Year: 900, Cast: [mira] }),
  ], 'mira')

  it('is the places already reached, and not the ones still to come', () => {
    expect(trailFade(stops, 860, Infinity).map(s => s.stop.locationId)).toEqual(['ashvale', 'harbour'])
  })

  it('is empty before the first of them', () => {
    expect(trailFade(stops, 700, Infinity)).toEqual([])
  })

  it('drops the stops further back than the trail reaches', () => {
    // 60 years back from 860 keeps the harbour (10 years old) and loses Ashvale (60).
    expect(trailFade(stops, 860, 60).map(s => s.stop.locationId)).toEqual(['harbour'])
  })

  it('fades from solid where they are standing to nothing at the tail', () => {
    const faded = trailFade(stops, 860, 100)
    expect(faded.find(s => s.stop.locationId === 'harbour')!.alpha).toBeCloseTo(0.9)
    expect(faded.find(s => s.stop.locationId === 'ashvale')!.alpha).toBeCloseTo(0.4)
  })

  it('holds a stop still running at full strength', () => {
    const inside = stopsFor([ev({ LocationId: 'realm', Year: 800, EndYear: 900, Cast: [mira] })], 'mira')
    expect(trailFade(inside, 880, 50)[0]!.alpha).toBe(1)
  })

  it('draws no trail at all at zero', () => {
    expect(trailFade(stops, 860, 0)).toEqual([])
  })

  // A date range is a window someone chose, so everything inside it is drawn as strongly as
  // everything else — a fade would make the far half of their own choice nearly invisible.
  it('holds the whole reach solid when the fade is off', () => {
    const flat = trailFade(stops, 860, 100, false)
    expect(flat.map(s => s.stop.locationId)).toEqual(['ashvale', 'harbour'])
    expect(flat.every(s => s.alpha === 1)).toBe(true)
  })
})

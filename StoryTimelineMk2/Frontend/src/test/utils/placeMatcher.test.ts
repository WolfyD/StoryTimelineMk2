import { describe, it, expect } from 'vitest'
import { findPlaces } from '@/utils/placeMatcher'
import { trailToPlace } from '@/utils/mapTree'
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
    GridCols: 0, MarkerStyle: null,
    OverviewPath: null, DetailPath: null, ViewError: null,
    Locations: locations,
  }
}

// Faerun ─ Helim (town) ─ its Market; Waterdeep and Triboar have a Market each, so the name is
// ambiguous on its own and only the town in the sentence can tell the three apart.
const faerun = map('faerun', 'Faerun', [
  place('l-helim', 'faerun', 'Helim', 'helim'),
  place('l-waterdeep', 'faerun', 'Waterdeep', 'waterdeep'),
  place('l-triboar', 'faerun', 'Triboar', 'triboar'),
])
const helim = map('helim', 'Helim', [
  place('l-h-market', 'helim', 'Market'),
  place('l-h-inn', 'helim', 'The Bent Nail'),
])
const waterdeep = map('waterdeep', 'Waterdeep', [place('l-w-market', 'waterdeep', 'Market')])
const triboar = map('triboar', 'Triboar', [place('l-t-market', 'triboar', 'Market')])
const maps = [faerun, helim, waterdeep, triboar]

const ids = (text: string) => findPlaces(text, maps).map(h => h.id)

describe('trailToPlace', () => {
  it('names the doors down to a place, root map first', () => {
    expect(trailToPlace(maps, 'l-h-market')).toEqual(['Faerun', 'Helim', 'Market'])
    expect(trailToPlace(maps, 'l-triboar')).toEqual(['Faerun', 'Triboar'])
    expect(trailToPlace(maps, 'nobody')).toEqual([])
  })
})

describe('findPlaces', () => {
  // The three shapes the same sentence comes in. None of them is matched as a phrase.
  it.each([
    'She was born at the Helim market.',
    'She was born at the market in Helim.',
    'She was born near the market on the outskirts of Helim.',
  ])('finds the right Market in %j', text => {
    expect(ids(text)).toEqual(['l-h-market'])
  })

  it('names the place, not the town it is in', () => {
    // Helim scores too — it is capitalised, unique and follows "in" — but it is on the way down to
    // the market, so it was the qualifier.
    const hits = findPlaces('She was born at the market in Helim.', maps)
    expect(hits.map(h => h.trail.join(' > '))).toEqual(['Faerun > Helim > Market'])
  })

  it('leaves an ambiguous market to be picked by hand', () => {
    // No town in the sentence, the name is not unique, and it is not capitalised: nothing to go on.
    expect(ids('He was born at the market.')).toEqual([])
  })

  it('offers both when the text points at two places', () => {
    expect(ids('She rode from Triboar to the market in Waterdeep.').sort())
      .toEqual(['l-triboar', 'l-w-market'])
  })

  it('an ordinary word that happens to be a place name is not a place', () => {
    expect(ids('The market crashed and the gate was shut.')).toEqual([])
    // Capitalised only because the sentence starts there.
    expect(ids('Market day came and went.')).toEqual([])
  })

  it('a name only one place answers to is enough on its own', () => {
    expect(ids('They met at The Bent Nail.')).toEqual(['l-h-inn'])
  })

  it('the qualifier has to be in the same sentence', () => {
    expect(ids('They rode to Helim. He was born at the market.')).toEqual(['l-helim'])
  })

  it('one word is one stretch of text, however many places answer to the name', () => {
    // Three Markets, all of them in Faerun: the sentence does not tell them apart, so all three are
    // offered — but they are the same six letters and must not be painted three times over.
    const hits = findPlaces('She was born at the market in Faerun.', maps)
    expect(new Set(hits.map(h => h.id)).size).toBe(3)
    expect(new Set(hits.map(h => h.match.start)).size).toBe(1)
  })

  it('drills down through as many qualifiers as the sentence carries', () => {
    // Faerun is on all three ways down; Helim is on one. Two confirmed steps beat one, so the other
    // two Markets do not even get offered.
    expect(ids("She was born at the market, in Faerun's Helim.")).toEqual(['l-h-market'])
    expect(ids('She was born at the market, in Helim, Faerun.')).toEqual(['l-h-market'])
  })

  it('marks every mention of a place it has decided on, not just the best one', () => {
    // Second sentence scores lower — sentence-initial, no preposition — but the place is already
    // spoken for, and an underline that skips the second "Bent Nail" just looks broken.
    const hits = findPlaces('They met at The Bent Nail. The Bent Nail was shut.', maps)
    expect(hits.map(h => h.id)).toEqual(['l-h-inn', 'l-h-inn'])
    expect(hits.map(h => h.match.start)).toEqual([12, 27])
  })

  it('says where it found each one, so the words can be highlighted', () => {
    const [hit] = findPlaces('She was born at the market in Helim.', maps)
    expect(hit && 'match' in hit).toBe(true)
    expect(hit!.match.text).toBe('market')
    expect(hit!.score).toBeGreaterThanOrEqual(2)
  })

  it('has nothing to say about empty text or a timeline with no places', () => {
    expect(findPlaces('', maps)).toEqual([])
    expect(findPlaces('She was born at the market in Helim.', [])).toEqual([])
  })
})

/**
 * BL-16: a date range read as a summary rather than as a replay. A hundred crossings of the same road
 * are one road, as thick as the number of people who used it, with a count of how often — the map
 * says who went where, how many and how much, instead of drawing the same line a hundred times.
 *
 * Everything is in *pins on the map in front of the reader*: `pinOf` turns a place into the pin that
 * stands for it (itself, or the door down to it), so two villages behind one door are one point here
 * and a walk between them is not a road on this map at all.
 */
import type { CastStop } from './mapTime'

/** One followed character, the colour they are drawn in, and where they were. */
export interface Journey {
  id: string
  colour: string
  stops: CastStop[]
}

/**
 * Everyone of one colour on a lane, once each: a strand as thick as its headcount. Or a party — people
 * who made every trip of the window together — as one strand in its first member's colour.
 */
export interface LaneStrand {
  colour: string
  ids: string[]
  /** The party's first member, when this strand is one. */
  party?: string
}

/** Every trip one way between two pins. The other way is another lane. */
export interface Lane {
  key: string
  from: string
  to: string
  strands: LaneStrand[]
  /** Trips, counting the same person's return journeys each time. */
  trips: number
  /** How many times each of them made it. */
  byWho: Map<string, number>
  /** When each trip set off, earliest first. */
  when: number[]
}

export interface RangeSummary {
  lanes: Lane[]
  /** Time spent at each pin inside the window, added up over everyone. */
  stays: Map<string, number>
  /** For pins where at least `meetMin` of them were at one event: the most there at once. */
  meetings: Map<string, number>
  /** Everyone who made at least one trip. */
  travellers: number
  /** Two or more who made the same trips from the same events in the same order, first member first. */
  parties: { id: string; ids: string[] }[]
  /** Trips that ended at each pin inside the window, and trips that set off from it. */
  arrivals: Map<string, number>
  departures: Map<string, number>
}

/** One stop of one person, with everyone else who was at that event. */
export interface CompanyStop extends CastStop {
  with: string[]
}

export interface PersonFacts {
  trips: number
  places: number
  /** Time between leaving one place and reaching the next, over every trip. */
  road: number
  /** How far the trips went, by unit, counting only those `leg` could measure. */
  distance: Map<string, number>
  /** How many events each of the others shared with them. */
  company: Map<string, number>
}

/**
 * One person's window, the cast window's detail. A trip is what `summarise` calls one — a change of
 * place between two stops in a row, set off before the window closed and arrived after it opened —
 * but by place rather than by pin: a walk across a city is a journey whichever map is on screen.
 * `leg` measures one, or says it cannot.
 */
export function personFacts(
  stops: CompanyStop[],
  lo: number,
  hi: number,
  leg: (fromLoc: string, toLoc: string) => { units: number; unit: string } | null,
): PersonFacts {
  const places = new Set<string>()
  const company = new Map<string, number>()
  const distance = new Map<string, number>()
  let trips = 0
  let road = 0
  stops.forEach((stop, i) => {
    if (stop.from <= hi && stop.to >= lo) {
      places.add(stop.locationId)
      for (const id of stop.with) company.set(id, (company.get(id) ?? 0) + 1)
    }
    const prev = stops[i - 1]
    if (!prev || prev.locationId === stop.locationId || prev.to > hi || stop.from < lo) return
    trips++
    road += Math.max(0, stop.from - prev.to)
    const d = leg(prev.locationId, stop.locationId)
    if (d) distance.set(d.unit, (distance.get(d.unit) ?? 0) + d.units)
  })
  return { trips, places: places.size, road, distance, company }
}

export function summarise(
  journeys: Journey[],
  lo: number,
  hi: number,
  pinOf: (locationId: string) => string | null,
  meetMin: number,
): RangeSummary {
  const lanes = new Map<string, Lane>()
  const stays = new Map<string, number>()
  /** Who was at each event, by the event's own identity — place and times — and the pin it is on. */
  const gatherings = new Map<string, { pin: string; ids: Set<string> }>()
  const travellers = new Set<string>()
  const arrivals = new Map<string, number>()
  const departures = new Map<string, number>()
  /** Everyone's trips, event to event, as one key each: the same key is the same party. */
  const tripsOf = new Map<string, string>()
  const stopKey = (s: CastStop) => `${s.locationId}@${s.from}-${s.to}`

  for (const j of journeys) {
    let prev: { pin: string; stop: CastStop } | null = null
    let trips = ''
    for (const stop of j.stops) {
      const pin = pinOf(stop.locationId)
      // Somewhere this map cannot show breaks the chain: a road to it would have no far end here.
      if (!pin) { prev = null; continue }

      const held = Math.min(stop.to, hi) - Math.max(stop.from, lo)
      if (held > 0) stays.set(pin, (stays.get(pin) ?? 0) + held)

      if (stop.from <= hi && stop.to >= lo) {
        const key = stopKey(stop)
        const met = gatherings.get(key)
        if (met) met.ids.add(j.id)
        else gatherings.set(key, { pin, ids: new Set([j.id]) })
      }

      // A trip is in the window if any of the road is: it set off before the window closed and got
      // there after it opened.
      if (prev && prev.pin !== pin && prev.stop.to <= hi && stop.from >= lo) {
        const key = `${prev.pin}>${pin}`
        let lane = lanes.get(key)
        if (!lane) {
          lane = { key, from: prev.pin, to: pin, strands: [], trips: 0, byWho: new Map(), when: [] }
          lanes.set(key, lane)
        }
        lane.trips++
        lane.when.push(prev.stop.to)
        lane.byWho.set(j.id, (lane.byWho.get(j.id) ?? 0) + 1)
        departures.set(prev.pin, (departures.get(prev.pin) ?? 0) + 1)
        arrivals.set(pin, (arrivals.get(pin) ?? 0) + 1)
        travellers.add(j.id)
        trips += `${stopKey(prev.stop)}>${stopKey(stop)}|`
      }
      prev = { pin, stop }
    }
    if (trips) tripsOf.set(j.id, trips)
  }

  // Everyone with the same trips is one party. Keyed by the trips, so a party is found in one pass.
  const byTrips = new Map<string, string[]>()
  for (const [id, trips] of tripsOf) byTrips.set(trips, [...byTrips.get(trips) ?? [], id])
  const parties = [...byTrips.values()].filter(ids => ids.length > 1).map(ids => ({ id: ids[0]!, ids }))
  const partyOf = new Map(parties.flatMap(p => p.ids.map(id => [id, p.id] as const)))
  const colourOf = new Map(journeys.map(j => [j.id, j.colour]))

  const meetings = new Map<string, number>()
  for (const { pin, ids } of gatherings.values())
    if (ids.size >= meetMin && ids.size > (meetings.get(pin) ?? 0)) meetings.set(pin, ids.size)

  for (const lane of lanes.values()) {
    // ponytail: a party of several colours takes its first member's, so a mixed band loses the rest.
    for (const id of lane.byWho.keys()) {
      const party = partyOf.get(id)
      const colour = colourOf.get(party ?? id)!
      const strand = lane.strands.find(s => (party ? s.party === party : !s.party && s.colour === colour))
      if (strand) strand.ids.push(id)
      else lane.strands.push(party ? { colour, ids: [id], party } : { colour, ids: [id] })
    }
    lane.when.sort((a, b) => a - b)
    lane.strands.sort((x, y) => (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0))
  }
  // Busiest first — most people, then most trips — so "the top ten roads" is the first ten.
  const ranked = [...lanes.values()].sort((x, y) => y.byWho.size - x.byWho.size || y.trips - x.trips)
  return { lanes: ranked, stays, meetings, travellers: travellers.size, parties, arrivals, departures }
}

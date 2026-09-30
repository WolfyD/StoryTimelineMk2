/**
 * BL-16: what a moment does to a map. The pins never move — a town is where it is — so the time only
 * decides what is *happening*: a place with an event running in it is lit and everywhere else dims.
 * And who is where: a character was at an event, the event has a place, so between two of them they
 * were travelling.
 *
 * Positions are the rows' own absolutes — the year with the sub-year part multiplied out — and not
 * whole years. A person can be in a hundred places in one year, and a scrubber that only knows the
 * year puts all hundred on top of each other and calls it standing still.
 *
 * Every function here takes a window rather than an instant, with the far end defaulting to the near
 * one. One instant is a window of no width, so a scrubber sitting on a date and a date range painting
 * everything between two of them are the same question asked twice.
 *
 * ponytail: nothing here knows when a place was founded or abandoned, because `locations` has no
 * columns for it. Add those and this is where "the city is not there yet" belongs.
 */
import type { CharacterItem, CharacterRelationship, MapEvent, MapEventCast } from '@/types/models'
import { relationOtherId } from '@/utils/characterRelations'

/**
 * How close two positions have to be to count as the same instant. It grows with the year because an
 * absolute carries the float error of a number its own size: a fixed epsilon that is ample at year
 * 800 is under the noise at year ten million. Even at that size this is a fraction of a second.
 */
const same = (at: number) => Math.max(1e-9, Math.abs(at) * 1e-12)

/**
 * The stretch of time an event covers, as absolutes.
 *
 * An event that happens at one moment has no end at all, and stores that as a zero in both columns
 * rather than a copy of its start — so a zero end is *absent*, not year zero. Testing the absolute
 * alone would read a battle in 500 BC as a thousand-year age ending at the reckoning; testing
 * `EndYear` alone would read a range that opens and closes inside year 0 as a single instant. An end
 * exists when either column says so, and then the absolute is what it measures.
 */
export function eventSpan(ev: MapEvent): { from: number; to: number } {
  const hasEnd = ev.EndYear !== 0 || ev.AbsoluteEnd !== 0
  const to = hasEnd && ev.AbsoluteEnd > ev.AbsoluteStart ? ev.AbsoluteEnd : ev.AbsoluteStart
  return { from: ev.AbsoluteStart, to }
}

/**
 * Is this event running anywhere inside `from`..`to`? An age that spans a century is happening at
 * every moment of it, and a window catches anything that overlaps it at all.
 */
export function happeningAt(ev: MapEvent, from: number, to = from): boolean {
  const span = eventSpan(ev)
  return span.from <= to && span.to >= from
}

/** The span the scrubber covers, or null when nothing in the timeline happened anywhere yet. */
export function timeSpan(events: MapEvent[]): { min: number; max: number } | null {
  if (!events.length) return null
  let min = Infinity
  let max = -Infinity
  for (const ev of events) {
    const { from, to } = eventSpan(ev)
    if (from < min) min = from
    if (to > max) max = to
  }
  return { min, max }
}

/**
 * Every instant where something starts or stops, earliest first and each one only once. These are the
 * positions worth stepping to: the scrubber can land anywhere, but only here does the map change.
 */
export function moments(events: MapEvent[]): number[] {
  const all: number[] = []
  for (const ev of events) {
    const { from, to } = eventSpan(ev)
    all.push(from)
    if (to !== from) all.push(to)
  }
  all.sort((a, b) => a - b)
  const out: number[] = []
  for (const at of all) if (!out.length || at - out[out.length - 1]! > same(at)) out.push(at)
  return out
}

/**
 * The next moment after `at`, or the last one before it. Null at either end of the story, which is
 * what stops the play loop rather than a separate count.
 *
 * Strictly past `at`, so stepping from a moment goes to the next one rather than standing on itself.
 */
export function stepTo(list: number[], at: number, dir: 1 | -1): number | null {
  const gap = same(at)
  if (dir > 0) {
    for (const m of list) if (m - at > gap) return m
    return null
  }
  for (let i = list.length - 1; i >= 0; i--) if (at - list[i]! > gap) return list[i]!
  return null
}

/**
 * The moment nearest `at` if one is within `reach`, else `at` itself: what a handle let go near a tick
 * lands on, so dropping it "on" the council means on the council rather than a day beside it.
 */
export function snapTo(list: number[], at: number, reach: number): number {
  let best = at
  let gap = reach
  for (const m of list) {
    const d = Math.abs(m - at)
    if (d <= gap) { best = m; gap = d }
  }
  return best
}

/**
 * How many moments fall in each of `buckets` equal slices of `min..max`, for the marks along the
 * scrubber's track. Counted rather than drawn one each, because a long chronicle has thousands of
 * moments and a track has a few hundred pixels.
 */
export function tickDensity(list: number[], min: number, max: number, buckets: number): number[] {
  const out = Array.from({ length: buckets }, () => 0)
  const width = max - min
  for (const m of list) {
    if (m < min || m > max) continue
    const i = width > 0 ? Math.min(buckets - 1, Math.floor(((m - min) / width) * buckets)) : 0
    out[i]!++
  }
  return out
}

/** What is going on in the window, in the order it was given — earliest first, from the query. */
export function eventsAt(events: MapEvent[], from: number, to = from): MapEvent[] {
  return events.filter(ev => happeningAt(ev, from, to))
}

/**
 * Is this one of the long things — an age, a reign, a war — rather than something that happens?
 *
 * `longerThan` is a length of time and not a share or a count of years, so what counts as long is the
 * caller's to scale: a chronicle of three millennia and a story told over a fortnight both have a
 * backdrop, and it is a different number of days in each.
 *
 * Nothing is long when the threshold is zero or less, which is a timeline too small to have a backdrop
 * at all. Without that, everything would be long and the whole map would go quiet at once.
 */
function isLong(ev: MapEvent, longerThan: number): boolean {
  if (!(longerThan > 0)) return false
  const { from, to } = eventSpan(ev)
  return to - from >= longerThan
}

/** How a place with something going on is shown. */
export type PlaceState =
  /** Something is happening there: the amber ring. */
  | 'loud'
  /** Something long is merely still running there: lit, but quietly. */
  | 'quiet'

/**
 * Which places have something going on, and which kind. An age covering a third of the story would
 * otherwise ring its city in alarm colour for that whole third, and a ring that is always on says
 * nothing at all — "happening" has to mean something happened.
 *
 * Somewhere with a war on *and* a council sitting reads as the council: the loud one wins, because the
 * long one is the backdrop it is happening against.
 */
export function placeStates(
  events: MapEvent[],
  from: number,
  to: number,
  longerThan: number,
): Map<string, PlaceState> {
  const out = new Map<string, PlaceState>()
  for (const ev of events) {
    if (!happeningAt(ev, from, to)) continue
    const state: PlaceState = isLong(ev, longerThan) ? 'quiet' : 'loud'
    if (state === 'loud' || !out.has(ev.LocationId)) out.set(ev.LocationId, state)
  }
  return out
}

/**
 * The long things in force at this moment, earliest first: what the reader would have to already know
 * to make sense of what they are watching. Naming them is the whole of how an age is shown — a wash of
 * colour over the ground it covers would claim a border the story never drew.
 */
export function ongoing(
  events: MapEvent[],
  from: number,
  to: number,
  longerThan: number,
): MapEvent[] {
  return events
    .filter(ev => isLong(ev, longerThan) && happeningAt(ev, from, to))
    .sort((a, b) => eventSpan(a).from - eventSpan(b).from)
}

// ── Who was where: a character's whereabouts, derived from the events they were present at ──────

/** One place a character was, and the stretch of time they were there. */
export interface CastStop {
  locationId: string
  from: number
  to: number
  /** The event that put them there, for saying why they are standing in a field. */
  title: string
}

/**
 * Everyone who was present somewhere, once each, in the order their names read. Only *present* —
 * `GetMapEvents` leaves the merely-mentioned out, because a character named in a letter did not travel.
 */
export function castOf(events: MapEvent[]): MapEventCast[] {
  const byId = new Map<string, MapEventCast>()
  for (const ev of events)
    for (const who of ev.Cast)
      if (!byId.has(who.CharacterId)) byId.set(who.CharacterId, who)
      // A character with a colour on one event and none on another keeps the colour.
      else if (!byId.get(who.CharacterId)!.Color && who.Color) byId.set(who.CharacterId, who)
  return [...byId.values()].sort((a, b) => a.Name.localeCompare(b.Name))
}

/**
 * The events one character was present at, in the order given. Present only, like everything else on
 * the map: a mention does not put anyone anywhere.
 */
export function eventsWith(events: MapEvent[], characterId: string): MapEvent[] {
  return events.filter(ev => ev.Cast.some(c => c.CharacterId === characterId))
}

/**
 * The events on one character's own timeline, which is more than the ones they were at: anything they
 * are linked to at all, mentioned or present, and the birth and death of themselves and of everyone
 * they are related to. The same list the character window draws, so a scrubber opened from it runs
 * over the same story — the timeline store's `belongsToFocus` is the other half of this.
 *
 * `linked` is every item id the character is linked to; while it is still loading, the events they
 * were present at stand in for it, so the clock is theirs from the first frame.
 */
export function onTheirTimeline(
  events: MapEvent[],
  characterId: string,
  linked: ReadonlySet<string>,
  characters: CharacterItem[],
  relations: CharacterRelationship[],
): MapEvent[] {
  const kin = new Set([characterId])
  for (const r of relations)
    if (r.Character1Id === characterId || r.Character2Id === characterId) kin.add(relationOtherId(r, characterId))
  const ids = new Set(linked)
  for (const c of characters) {
    if (!kin.has(c.Id)) continue
    if (c.BirthItemId) ids.add(c.BirthItemId)
    if (c.DeathItemId) ids.add(c.DeathItemId)
  }
  return events.filter(ev => ids.has(ev.ItemId) || ev.Cast.some(c => c.CharacterId === characterId))
}

/**
 * Everyone who was somewhere with one character, themselves included. The map opened from a
 * character's own timeline is about their story, and a hundred and fifty names with no line between
 * them and the reader's character is exactly the wall they came here to get out of.
 *
 * Empty when that character was never placed anywhere — there is nothing of theirs to show.
 */
export function castAround(events: MapEvent[], characterId: string): MapEventCast[] {
  return castOf(eventsWith(events, characterId))
}

/**
 * Where one character was, earliest first. Two events in the same place stay two stops: merging them
 * would hide that they were there twice, and nothing downstream cares.
 */
export function stopsFor(events: MapEvent[], characterId: string): CastStop[] {
  return eventsWith(events, characterId)
    .map(ev => ({ ...eventSpan(ev), locationId: ev.LocationId, title: ev.Title }))
    .sort((a, b) => a.from - b.from)
}

/**
 * Where a character is at `when`: standing at a stop, or `t` of the way from one to the next. Travel
 * fills the gap between the end of one event and the start of the next, which is the only honest
 * reading — the story says they were in two places and says nothing about the road between.
 *
 * Null before their first placed event and after their last: a character with nowhere to be is not
 * drawn at all, rather than frozen on the spot they died.
 */
export function legAt(
  stops: CastStop[],
  when: number,
): { at: CastStop; next: CastStop | null; t: number } | null {
  // The latest one that has started, so a character who arrived somewhere while an age runs on around
  // them is at the place they arrived at.
  let here: CastStop | null = null
  for (const stop of stops) if (stop.from <= when && stop.to >= when) here = stop
  if (here) return { at: here, next: null, t: 0 }

  for (let i = 0; i < stops.length - 1; i++) {
    const at = stops[i]!
    const next = stops[i + 1]!
    if (at.to < when && when < next.from) {
      return { at, next, t: (when - at.to) / (next.from - at.to) }
    }
  }
  return null
}

/**
 * The stops a character has already reached, oldest first, with how solid each should be drawn: full
 * where they are standing now, nothing `back` in time behind them. The path a dashed trail is made of.
 *
 * `back` is a length of time rather than a count of stops because the trail is a memory of the recent
 * past. It comes from a share of the whole story rather than a number of years, so a tale told over
 * three days and one told over three millennia both get a tail about a tenth of themselves long —
 * a fixed count of years would be the whole of the first story and none of the second.
 *
 * `fade` off keeps every stop inside the reach at full strength, which is what a date range wants:
 * the window was asked for on purpose, so nothing chosen is allowed to be nearly invisible.
 *
 * Nothing at all at `back` of zero, which is the setting for a walker with no trail behind them.
 */
export function trailFade(
  stops: CastStop[],
  when: number,
  back: number,
  fade = true,
): { stop: CastStop; alpha: number }[] {
  if (back <= 0) return []
  const out: { stop: CastStop; alpha: number }[] = []
  for (const stop of stops) {
    if (stop.from > when) continue
    // Measured from the last moment they were there, so a stop still running is at full strength.
    const age = (when - Math.min(stop.to, when)) / back
    if (age >= 1) continue
    out.push({ stop, alpha: fade ? 1 - age : 1 })
  }
  return out
}

/**
 * BL-16: what the map and its cast window say to each other. The window is on another screen, so it is
 * another page, and the two of them talk through the host's broadcast (`MapCast`) rather than sharing a
 * store. The map owns everything — who is followed, the clock, the range, how the list is cut — and
 * sends a snapshot of it; the window only ever sends back what the reader asked for.
 *
 * A search and which sections are folded belong to the window alone: they change what is listed, not
 * what the map draws.
 */
import type { MapFlightMode, MapMovementStyle, MapPlacesShow } from './timelinePrefs'
import type { StoryStay } from './storyline'

export type CastGrouping = 'none' | 'moving' | 'family' | 'faction'

/**
 * The map's own settings, at the foot of the cast window where a change reaches the open map at once.
 * The map owns and saves them, per timeline; the window only shows them and asks.
 */
export interface CastPrefs {
  movement: MapMovementStyle
  /** Trail length, as a share of the whole story. */
  trail: number
  flight: MapFlightMode
  fade: boolean
  /** How many of a range's roads are drawn in full; 0 is all of them. */
  roads: number
  places: MapPlacesShow
}

/** Milliseconds the last drag frame cost, by stage — the Debug build's readout, null in a release. */
export interface CastTiming {
  /** The moment: pins, dots and trails. */
  frame: number
  /** Working the range summary out. */
  sum: number
  /** Building its shapes. */
  draw: number
  /** The canvas painting all of it. */
  paint: number
}

/** One name on the list, with what its right-click menu needs to grey itself out. */
export interface CastPerson {
  id: string
  name: string
  colour: string
  /** Whether they turn up again after the clock (1) or before it (-1). */
  next: boolean
  prev: boolean
}

export interface CastSection {
  key: string
  label: string
  ids: string[]
  /** What its people are drawn in on the map; null while the list is flat and each wears their own. */
  colour: string | null
  /** The colour was set by hand, rather than the hue its name has everywhere. */
  own: boolean
}

/** The range in words: the map draws the shape, this is the numbers. */
export interface RangeFacts {
  moved: number
  trips: number
  roads: number
  busiest?: { text: string; people: number }
  stay?: { text: string; long: string }
  meetings: { text: string; n: number }[]
  /** Roads past the "Roads shown" setting, drawn faint. */
  faint: number
  /** The biggest bands who went everywhere together, as "Mira + 6". */
  parties: string[]
}

/**
 * The one picked out, said in full: where they are, where they have been, how far they went and who
 * with. The stats and company are over the range while one is open, and over their whole story
 * otherwise; every stop is listed either way, so a click that slides the range leaves the list be.
 */
export interface CastDetail {
  id: string
  name: string
  colour: string
  /** Where the clock finds them, in words, and the event that put them there or is calling them on. */
  now: { text: string; why: string | null }
  stops: { from: number; to: number; date: string; place: string; event: string }[]
  trips: number
  places: number
  /** Time between leaving one place and reaching the next, in words. */
  road: string
  /** How far those trips were, in each map's own units; null when none could be measured. */
  distance: string | null
  /** Everyone at the same events, most shared first. */
  company: { id: string; name: string; colour: string; n: number }[]
}

export interface CastState {
  kind: 'state'
  /** Off means the map has put its clock away and the window has nothing to show. */
  timeOn: boolean
  cast: CastPerson[]
  sections: CastSection[]
  /** Null is everyone, the way the map says it. */
  following: string[] | null
  grouping: CastGrouping
  /** Opened from one character's timeline: the list is only who they were somewhere with. */
  focus: { id: string; name: string } | null
  facts: RangeFacts | null
  prefs: CastPrefs
  /** The map's clock: the far end, the near end while a range is open, and both as a date. */
  clock: { at: number; from: number | null; text: string }
  timing: CastTiming | null
  /** The one picked out — a click on their dot, name or line — whom everyone else steps back from. */
  spotlight: string | null
  /** The one under the pointer, in either window. */
  hover: string | null
  detail: CastDetail | null
}

/** The charts the window can show in place of its list, one at a time. */
export type ChartId = 'story' | 'strips' | 'heat' | 'tables' | 'met' | 'crowd' | 'apart' | 'weave' | 'sankey'

/** The charts drawn along time: the ones a drag across can zoom into. */
export const isTimed = (id: ChartId) => id !== 'tables' && id !== 'met' && id !== 'sankey'

/** What a chart was asked about beyond the cast: the place it is about, or the two people. */
export interface ChartAsk {
  place?: string
  a?: string
  b?: string
  /** The stretch of time a time chart is zoomed into. The map cuts it to what it has open. */
  from?: number
  to?: number
}

export interface ChartPerson {
  id: string
  name: string
  colour: string
}

/** A pin on the map in front of the reader. */
export interface ChartPlace {
  id: string
  name: string
}

/** A stay as a bar along the time axis, and what its hover card says. */
export interface ChartBar {
  from: number
  to: number
  colour: string
  text: string
  /** The pin it was at, where a click on it opens that place's own chart. */
  place?: string
}

/** One person in the tables: each number to sort by, and in words where it is not one already. */
export interface PersonRow extends ChartPerson {
  trips: number
  places: number
  road: number
  roadText: string
  /** Every unit added together, which is only a sort order; the words keep them apart. */
  distance: number
  distanceText: string
  first: number
  firstText: string
  last: number
  lastText: string
}

export interface PlaceRow extends ChartPlace {
  people: number
  visits: number
  /** Everyone's time there added up. */
  time: number
  timeText: string
  most: number
}

/**
 * The chart whose tab is up. The map works it out for the people followed, over the range while one is
 * open and the whole story otherwise, and sends it only while the tab is up and no hand is on the
 * scrubber. Places are pins on the map in front of the reader, the way the range summary counts them.
 */
export type ChartState = {
  kind: 'chart'
  lo: number
  hi: number
  /** Dates along the bottom. */
  ticks: { at: number; text: string }[]
} & (
  /** One row per place, top to bottom as they lie on the map, and each person a line between them. */
  | { chart: 'story'; rows: ChartPlace[]; people: (ChartPerson & { runs: StoryStay[][] })[] }
  /** A bar per person, coloured by where they were; the gaps are the road. */
  | { chart: 'strips'; people: (ChartPerson & { bars: ChartBar[] })[] }
  /** Heads at each place in each slice of time, busiest place first; `cuts` dates the slices' edges. */
  | { chart: 'heat'; rows: ChartPlace[]; cells: number[][]; max: number; cuts: string[] }
  | { chart: 'tables'; people: PersonRow[]; places: PlaceRow[] }
  /** How often each two were at one event: people most-met first, pairs as [i, j, times] with i < j. */
  | { chart: 'met'; people: (ChartPerson & { n: number })[]; pairs: [number, number, number][] }
  /** One place, busiest first unless asked: heads per slice of time, and who was there when. */
  | {
      chart: 'crowd'
      places: (ChartPlace & { n: number })[]
      place: string | null
      counts: number[]
      cuts: string[]
      people: (ChartPerson & { bars: ChartBar[] })[]
    }
  /**
   * How far apart two people were, evenly sampled; null where either is not on this map. `met` is who
   * `a` was ever at an event with, anywhere: `b`, only others followed, or nobody followed.
   */
  | {
      chart: 'apart'
      people: ChartPerson[]
      a: string | null
      b: string | null
      unit: string
      points: (number | null)[]
      when: string[]
      met: 'each other' | 'others' | 'nobody'
    }
  /**
   * Each person's place in each slice of time: a pin, '~' on their own, null not in the story. `places`
   * names every pin in it, for the bands the threads run in.
   */
  | { chart: 'weave'; places: ChartPlace[]; people: (ChartPerson & { at: (string | null)[] })[] }
  /** Journeys from place to place, one link per way, most travelled first. */
  | { chart: 'sankey'; places: ChartPlace[]; links: { from: string; to: string; trips: number; people: number }[] }
)

/**
 * What the right-click menu asks the map to do with one person. The sheet goes through the map too: a
 * window opens as a child of whoever asked, and one owned by the cast window would close with the clock.
 */
export type WhoAction = 'sheet' | 'only' | 'journey' | 'next' | 'prev'

export type CastCommand =
  /** A window just opened and has nothing to draw yet. */
  | { kind: 'hello' }
  | { kind: 'follow'; ids: string[] | null }
  | { kind: 'group'; grouping: CastGrouping }
  /** A group's colour set by hand, as #rrggbb, or null to give it back the hue its name has. */
  | { kind: 'colour'; group: string; colour: string | null }
  | { kind: 'unfocus' }
  | { kind: 'who'; what: WhoAction; id: string }
  | { kind: 'prefs'; prefs: Partial<CastPrefs> }
  /** Which tab is up and what its chart asks, so the map only works out the chart someone is looking at. */
  | { kind: 'tab'; tab: 'people' | ChartId; ask?: ChartAsk }
  /** A click on a chart: the map's clock to there. */
  | { kind: 'clock'; at: number }
  /** Pick someone out, or let them go with null. Someone not followed is followed first. */
  | { kind: 'spot'; id: string | null }
  | { kind: 'hover'; id: string | null }
  /** The clock's keys pressed in the window, done as if pressed on the map. */
  | { kind: 'key'; key: ClockKey }
  /** A double-click on a name: go to them — and to when they are next in the story, if not now. */
  | { kind: 'fly'; id: string }

export type CastMessage = CastState | ChartState | CastCommand

export type ClockKey = ' ' | 'ArrowLeft' | 'ArrowRight'

/**
 * A press meant for the map's clock: Space, ← or →, bare, and not into a field. A slider keeps its arrows
 * but has no use for the space, so play still answers with a handle focused.
 */
export function clockKey(e: KeyboardEvent): ClockKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return null
  const target = e.target as Element | null
  if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return null
  return e.key !== ' ' && target?.closest?.('[role="slider"]') ? null : e.key
}

/**
 * The sections as they are listed: people instead of ids, only the ones the search found, and no
 * heading left standing over nobody.
 */
export function listSections(
  state: Pick<CastState, 'cast' | 'sections'>,
  query: string,
): (Omit<CastSection, 'ids'> & { members: CastPerson[] })[] {
  const byId = new Map(state.cast.map(p => [p.id, p]))
  const q = query.trim().toLowerCase()
  return state.sections
    .map(({ ids, ...s }) => ({
      ...s,
      members: ids
        .map(id => byId.get(id))
        .filter((p): p is CastPerson => !!p && (!q || p.name.toLowerCase().includes(q))),
    }))
    .filter(s => s.members.length)
}

/**
 * The followed set after ticking a whole section on or off. The untouched list (null) is everyone, so
 * unticking one section has to leave everyone else in.
 */
export function followSection(
  following: string[] | null,
  everyone: string[],
  members: string[],
  on: boolean,
): string[] {
  const next = new Set(following ?? everyone)
  for (const id of members) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return [...next]
}

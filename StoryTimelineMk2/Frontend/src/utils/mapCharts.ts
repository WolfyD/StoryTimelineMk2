/**
 * BL-16: the cast window's charts, worked out on the map's side. The map has the events, the pins and
 * the calendar; the window is sent only what it draws. Every chart is the people followed over lo..hi,
 * in pins on the map in front of the reader, the way the range summary counts them.
 *
 * `weaveLayout` and `sankeyLayout` at the bottom are the window's half: pure, so here to be tested.
 */
import type { MapItem } from '@/types/models'
import type { ChartAsk, ChartBar, ChartId, ChartPerson, ChartState } from './mapCast'
import { distanceInUnits, formatDistance } from './mapScale'
import { personFacts, summarise } from './mapSummary'
import { legAt, type CastStop } from './mapTime'
import { categoryColor, type GraphEdge } from './relationsGraph'
import { matrixOrder } from './relationsLayouts'
import { flatStays, storyRuns, type FlatStay } from './storyline'

/** What a chart is worked out from: the map as it is while the tab is up. */
export interface ChartJob {
  id: ChartId
  ask: ChartAsk
  lo: number
  hi: number
  map: MapItem
  pinOf: (locationId: string) => string | null
  people: (ChartPerson & { stops: CastStop[] })[]
  /** The one picked out on the map: who "how far apart" measures from until the reader picks. */
  spotlight: string | null
}

/** What only the map can say: a date in the timeline's calendar, a stretch of time, how far a trip was. */
export interface ChartWords {
  date: (at: number) => string
  long: (years: number) => string
  leg: (fromLoc: string, toLoc: string) => { units: number; unit: string } | null
}

/** Slices of time across the busy-places and one-place charts. */
export const SLICES = 48
/** The weave's columns: fewer than the slices, so a change of place has room to curve. */
export const COLUMNS = 32
/** Points along the "how far apart" line. */
const SAMPLES = 200
/** Somewhere this map has no pin for, on a life strip. */
const ELSEWHERE = '#475569'

const sliceOf = (t: number, lo: number, hi: number, n: number) =>
  hi > lo ? Math.min(n - 1, Math.max(0, Math.floor(((t - lo) / (hi - lo)) * n))) : 0

/** An event by its own identity, place and times, the way the range summary keys one. */
const eventKey = (s: CastStop) => `${s.locationId}@${s.from}-${s.to}`

/**
 * Heads at each pin in each of `n` slices of lo..hi. Someone counts once in a slice however often they
 * come and go in it, and a one-moment event counts in the slice it falls in.
 */
export function busyCounts(people: FlatStay[][], lo: number, hi: number, n: number): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const stays of people) {
    /** The last slice this person has been counted in, at each pin. */
    const done = new Map<string, number>()
    for (const s of stays) {
      if (!s.pin || s.to < lo || s.from > hi) continue
      let row = out.get(s.pin)
      if (!row) out.set(s.pin, (row = Array.from({ length: n }, () => 0)))
      const was = done.get(s.pin) ?? -1
      const last = sliceOf(s.to, lo, hi, n)
      for (let k = Math.max(sliceOf(s.from, lo, hi, n), was + 1); k <= last; k++) row[k]! += 1
      done.set(s.pin, Math.max(was, last))
    }
  }
  return out
}

/**
 * The most people at once among some stays at one place. `who` tells people apart, so someone whose
 * stay is cut in two by an errand elsewhere — two stays touching end to start — is still one head.
 */
export function mostAtOnce(stays: { who: number; from: number; to: number }[]): number {
  // Arrivals before departures at the same moment: touching stays overlap, and so does a one-moment event.
  const marks = stays
    .flatMap(s => [{ at: s.from, d: 1, who: s.who }, { at: s.to, d: -1, who: s.who }])
    .sort((x, y) => x.at - y.at || y.d - x.d)
  const open = new Map<number, number>()
  let heads = 0
  let most = 0
  for (const m of marks) {
    const n = (open.get(m.who) ?? 0) + m.d
    open.set(m.who, n)
    if (m.d > 0 && n === 1) most = Math.max(most, ++heads)
    else if (m.d < 0 && n === 0) heads--
  }
  return most
}

/** The chart whose tab is up. */
export function buildChart(job: ChartJob, words: ChartWords): ChartState {
  const { id, map, pinOf, people } = job
  // Zoomed into a stretch: that, cut to what the map has open. One wholly outside it is no zoom at all.
  const inside = (t: number | undefined, or: number) => Math.min(job.hi, Math.max(job.lo, t ?? or))
  let lo = inside(job.ask.from, job.lo)
  let hi = inside(job.ask.to, job.hi)
  if (hi <= lo) [lo, hi] = [job.lo, job.hi]
  const len = hi - lo
  // Five marks along the bottom, on whole years once the stretch is long enough to have them.
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(k => (len >= 5 ? Math.round(lo + k * len) : lo + k * len))
    .filter((t, i, all) => t >= lo && t <= hi && all.indexOf(t) === i)
    .map(t => ({ at: t, text: words.date(t) }))
  const frame = { kind: 'chart' as const, lo, hi, ticks }

  const pins = new Map(map.Locations.map(l => [l.Id, l]))
  const nameOf = (pin: string | null) => (pin ? pins.get(pin)?.Name || 'A place' : 'Elsewhere')
  const who = (p: ChartPerson): ChartPerson => ({ id: p.id, name: p.name, colour: p.colour })
  const dates = (s: { from: number; to: number }) =>
    s.to > s.from ? `${words.date(s.from)} – ${words.date(s.to)}` : words.date(s.from)
  const overlaps = (s: { from: number; to: number }) => s.from <= hi && s.to >= lo
  /** A stay as a bar, cut to lo..hi; its words keep the real dates. */
  const bar = (s: { from: number; to: number }, colour: string, text: string): ChartBar =>
    ({ from: Math.max(s.from, lo), to: Math.min(s.to, hi), colour, text })
  const cuts = () => Array.from({ length: SLICES + 1 }, (_, k) => words.date(lo + (k / SLICES) * len))
  const flat = () => people.map(p => flatStays(p.stops, pinOf))

  switch (id) {
    case 'story': {
      const list = people
        .map(p => ({
          ...who(p),
          runs: storyRuns(p.stops, pinOf)
            .map(run => run.filter(overlaps).map(s => ({ pin: s.pin, from: Math.max(s.from, lo), to: Math.min(s.to, hi) })))
            .filter(run => run.length),
        }))
        .filter(p => p.runs.length)
      const used = new Set(list.flatMap(p => p.runs.flat().map(s => s.pin)))
      // Top to bottom as they lie on the map, so the chart reads like the map turned on its side.
      const rows = map.Locations
        .filter(l => used.has(l.Id))
        .sort((x, y) => x.Y - y.Y)
        .map(l => ({ id: l.Id, name: l.Name || 'A place' }))
      return { ...frame, chart: 'story', rows, people: list }
    }

    case 'strips':
      return {
        ...frame,
        chart: 'strips',
        people: people.flatMap(p => {
          const bars = flatStays(p.stops, pinOf)
            .filter(overlaps)
            .map(s => ({
              ...bar(s, s.pin ? categoryColor(s.pin) : ELSEWHERE, `${nameOf(s.pin)}, ${dates(s)}`),
              place: s.pin ?? undefined,
            }))
          return bars.length ? [{ ...who(p), bars }] : []
        }),
      }

    case 'heat': {
      const rows = [...busyCounts(flat(), lo, hi, SLICES)]
        .map(([pin, row]) => ({ pin, row, sum: row.reduce((a, b) => a + b, 0) }))
        .sort((x, y) => y.sum - x.sum)
      return {
        ...frame,
        chart: 'heat',
        rows: rows.map(r => ({ id: r.pin, name: nameOf(r.pin) })),
        cells: rows.map(r => r.row),
        max: rows.reduce((m, r) => Math.max(m, ...r.row), 0),
        cuts: cuts(),
      }
    }

    case 'tables': {
      const rows = people.flatMap(p => {
        const seen = p.stops.filter(overlaps)
        if (!seen.length) return []
        // Company is the people tab's; no column here asks for it.
        const f = personFacts(p.stops.map(s => ({ ...s, with: [] })), lo, hi, words.leg)
        const first = Math.max(lo, seen[0]!.from)
        const last = Math.min(hi, seen.reduce((m, s) => Math.max(m, s.to), -Infinity))
        return [{
          ...who(p),
          trips: f.trips,
          places: f.places,
          road: f.road,
          roadText: words.long(f.road),
          distance: [...f.distance.values()].reduce((a, b) => a + b, 0),
          distanceText: [...f.distance].map(([unit, n]) => `${formatDistance(n)} ${unit}`).join(' + ') || '—',
          first,
          firstText: words.date(first),
          last,
          lastText: words.date(last),
        }]
      })
      const byPin = new Map<string, { who: number; from: number; to: number }[]>()
      flat().forEach((stays, i) => {
        for (const s of stays) {
          if (!s.pin || !overlaps(s)) continue
          let list = byPin.get(s.pin)
          if (!list) byPin.set(s.pin, (list = []))
          list.push({ who: i, from: Math.max(s.from, lo), to: Math.min(s.to, hi) })
        }
      })
      const places = [...byPin].map(([pin, list]) => {
        const time = list.reduce((sum, s) => sum + s.to - s.from, 0)
        return {
          id: pin,
          name: nameOf(pin),
          people: new Set(list.map(s => s.who)).size,
          visits: list.length,
          time,
          timeText: words.long(time),
          most: mostAtOnce(list),
        }
      })
      return { ...frame, chart: 'tables', people: rows, places }
    }

    case 'met': {
      // Who was at each event, by the event's own identity — place and times — the way the summary keys one.
      const at = new Map<string, number[]>()
      people.forEach((p, i) => {
        for (const s of p.stops) {
          if (!overlaps(s)) continue
          const key = eventKey(s)
          const ids = at.get(key)
          if (!ids) at.set(key, [i])
          else if (ids.at(-1) !== i) ids.push(i)
        }
      })
      const n = people.length
      /** Events two people were at together, keyed i * n + j with i < j. */
      const times = new Map<number, number>()
      /** Events each was at with anyone else. */
      const shared = Array.from({ length: n }, () => 0)
      for (const ids of at.values()) {
        if (ids.length < 2) continue
        for (const i of ids) shared[i]! += 1
        for (let x = 0; x < ids.length; x++)
          for (let y = x + 1; y < ids.length; y++) {
            const key = ids[x]! * n + ids[y]!
            times.set(key, (times.get(key) ?? 0) + 1)
          }
      }
      const edges: GraphEdge[] = [...times].map(([key, t], e) => ({
        id: e,
        aId: people[Math.floor(key / n)]!.id,
        bId: people[key % n]!.id,
        kind: '',
        category: '',
        strength: Math.min(100, t * 10),
        modifier: null,
      }))
      // The relations window's matrix order: the ones who keep meeting together, best-connected first.
      const order = matrixOrder(people.filter((_, i) => shared[i]).map(p => p.id), edges)
      const index = new Map(people.map((p, i) => [p.id, i]))
      const row = new Map(order.map((pid, k) => [index.get(pid)!, k]))
      return {
        ...frame,
        chart: 'met',
        people: order.map(pid => {
          const i = index.get(pid)!
          return { ...who(people[i]!), n: shared[i]! }
        }),
        pairs: [...times].map(([key, t]): [number, number, number] => {
          const a = row.get(Math.floor(key / n))!
          const b = row.get(key % n)!
          return [Math.min(a, b), Math.max(a, b), t]
        }),
      }
    }

    case 'crowd': {
      const stays = flat()
      const counts = busyCounts(stays, lo, hi, SLICES)
      const heads = new Map<string, Set<number>>()
      stays.forEach((list, i) => {
        for (const s of list) {
          if (!s.pin || !overlaps(s)) continue
          const set = heads.get(s.pin)
          if (set) set.add(i)
          else heads.set(s.pin, new Set([i]))
        }
      })
      const places = [...heads]
        .map(([pin, set]) => ({ id: pin, name: nameOf(pin), n: set.size }))
        .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name))
      const place = job.ask.place && heads.has(job.ask.place) ? job.ask.place : places[0]?.id ?? null
      return {
        ...frame,
        chart: 'crowd',
        places,
        place,
        counts: (place && counts.get(place)) || Array.from({ length: SLICES }, () => 0),
        cuts: cuts(),
        people: place
          ? people.flatMap((p, i) => {
              const bars = stays[i]!.filter(s => s.pin === place && overlaps(s)).map(s => bar(s, p.colour, dates(s)))
              return bars.length ? [{ ...who(p), bars }] : []
            })
          : [],
      }
    }

    case 'apart': {
      const list = people.filter(p => p.stops.length).map(who)
      const known = (pid: string | null | undefined) => (pid && list.some(p => p.id === pid) ? pid : null)
      const a = known(job.ask.a) ?? known(job.spotlight) ?? list[0]?.id ?? null
      const b = (job.ask.b !== a && known(job.ask.b)) || list.find(p => p.id !== a)?.id || null
      const w = map.PictureWidth
      const h = map.PictureHeight
      const stopsOf = new Map(people.map(p => [p.id, p.stops]))
      /** Where someone is at `t`, in the picture's pixels: null off this map, before them or after. */
      const where = (stops: CastStop[], t: number) => {
        const leg = legAt(stops, t)
        const p = leg && pins.get(pinOf(leg.at.locationId) ?? '')
        const q = leg?.next ? pins.get(pinOf(leg.next.locationId) ?? '') : p
        if (!leg || !p || !q || !w || !h) return null
        return { x: (p.X + (q.X - p.X) * leg.t) * w, y: (p.Y + (q.Y - p.Y) * leg.t) * h }
      }
      const sa = (a && stopsOf.get(a)) || []
      const sb = (b && stopsOf.get(b)) || []
      const points: (number | null)[] = []
      const when: string[] = []
      for (let k = 0; k < SAMPLES; k++) {
        const t = lo + (k / (SAMPLES - 1)) * len
        const pa = where(sa, t)
        const pb = pa && where(sb, t)
        points.push(pa && pb ? distanceInUnits(map, w!, pa, pb) : null)
        when.push(words.date(t))
      }
      // Met the way the met chart counts it: at one event, anywhere, over everything the charts were
      // asked about rather than the stretch zoomed into, so a zoom cannot make two people strangers.
      const inAll = (s: CastStop) => s.from <= job.hi && s.to >= job.lo
      const mine = new Set(sa.filter(inAll).map(eventKey))
      const metWith = (p: ChartJob['people'][number]) => p.id !== a && p.stops.some(s => inAll(s) && mine.has(eventKey(s)))
      const met = people.some(p => p.id === b && metWith(p)) ? 'each other' : people.some(metWith) ? 'others' : 'nobody'
      return { ...frame, chart: 'apart', people: list, a, b, unit: w && h ? map.ScaleUnit : '', points, when, met }
    }

    case 'weave': {
      const threads = people.flatMap(p => {
        const stays = flatStays(p.stops, pinOf)
        const first = stays[0]
        const last = stays.at(-1)
        if (!first || !last) return []
        const off = (s: FlatStay, t: number) => (s.from > t ? s.from - t : s.to < t ? t - s.to : 0)
        const at: (string | null)[] = []
        let i = 0
        for (let k = 0; k < COLUMNS; k++) {
          const s0 = lo + (k / COLUMNS) * len
          const s1 = lo + ((k + 1) / COLUMNS) * len
          if (s1 < first.from || s0 > last.to) {
            at.push(null)
            continue
          }
          // ponytail: the stay nearest the column's middle, so a visit shorter than a column between
          // two longer ones can drop out. More columns is the fix, at the price of a busier weave.
          const mid = (s0 + s1) / 2
          while (i + 1 < stays.length && stays[i + 1]!.from <= mid) i++
          const next = stays[i + 1]
          const s = next && off(next, mid) <= off(stays[i]!, mid) ? next : stays[i]!
          at.push(s.pin ?? '~')
        }
        return at.some(x => x && x !== '~') ? [{ ...who(p), at }] : []
      })
      const pinsUsed = new Set(threads.flatMap(t => t.at).filter((x): x is string => !!x && x !== '~'))
      return { ...frame, chart: 'weave', places: [...pinsUsed].map(id => ({ id, name: nameOf(id) })), people: threads }
    }

    case 'sankey': {
      const lanes = summarise(people, lo, hi, pinOf, 2).lanes
      return {
        ...frame,
        chart: 'sankey',
        places: [...new Set(lanes.flatMap(l => [l.from, l.to]))].map(pin => ({ id: pin, name: nameOf(pin) })),
        links: lanes.map(l => ({ from: l.from, to: l.to, trips: l.trips, people: l.byWho.size })),
      }
    }
  }
}

// ── The window's half ─────────────────────────────────────────────────────────

/**
 * The weave, laid out: each column's people top to bottom, the ones at one place together `gap` apart
 * and `between` from the next place. A place keeps the order its people had the column before, so the
 * lines only cross where somebody moves; anyone new comes in at the bottom.
 */
export function weaveLayout(
  at: (string | null)[][],
  gap: number,
  between: number,
): { ys: (number | null)[][]; height: number } {
  const ys = at.map(row => row.map((): number | null => null))
  /** Where each person was last drawn. */
  const last: (number | null)[] = at.map(() => null)
  const was = (p: number) => last[p] ?? Infinity
  let height = 0
  for (let k = 0; k < (at[0]?.length ?? 0); k++) {
    const groups = new Map<string, number[]>()
    at.forEach((row, p) => {
      const key = row[k]
      if (key == null) return
      // Somewhere off this map is nobody's company: a place of their own.
      const g = key === '~' ? `~${p}` : key
      const list = groups.get(g)
      if (list) list.push(p)
      else groups.set(g, [p])
    })
    const mean = (ps: number[]) => {
      const seen = ps.map(was).filter(Number.isFinite)
      return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : Infinity
    }
    // Infinity minus Infinity is NaN, which falls through to the tie-break.
    const ordered = [...groups.values()]
      .map(ps => ({ ps: ps.sort((a, b) => was(a) - was(b) || a - b), y: mean(ps) }))
      .sort((a, b) => a.y - b.y || a.ps[0]! - b.ps[0]!)
    let y = 0
    for (const { ps } of ordered) {
      for (const p of ps) {
        ys[p]![k] = last[p] = y
        height = Math.max(height, y)
        y += gap
      }
      y += between - gap
    }
  }
  return { ys, height }
}

/** A place's band behind the weave: the columns it has people in, from `k0`, and its top and bottom thread in each. */
export interface WeaveBand {
  place: string
  k0: number
  tops: number[]
  bots: number[]
}

/**
 * The weave's places as bands, from where `weaveLayout` put everyone. A place's people are side by side
 * in a column, so its top and bottom thread are its whole extent there. A column without anyone there
 * ends the band, and the next one there starts another. Off this map ('~') is no place: no band.
 */
export function weaveBands(at: (string | null)[][], ys: (number | null)[][]): WeaveBand[] {
  const out: WeaveBand[] = []
  /** The bands still running in the last column. */
  const open = new Map<string, WeaveBand>()
  for (let k = 0; k < (at[0]?.length ?? 0); k++) {
    const here = new Map<string, { top: number; bot: number }>()
    at.forEach((row, p) => {
      const pin = row[k]
      const y = ys[p]?.[k]
      if (!pin || pin === '~' || y == null) return
      const b = here.get(pin)
      here.set(pin, b ? { top: Math.min(b.top, y), bot: Math.max(b.bot, y) } : { top: y, bot: y })
    })
    for (const place of open.keys()) if (!here.has(place)) open.delete(place)
    for (const [place, { top, bot }] of here) {
      let band = open.get(place)
      if (!band) {
        band = { place, k0: k, tops: [], bots: [] }
        out.push(band)
        open.set(place, band)
      }
      band.tops.push(top)
      band.bots.push(bot)
    }
  }
  return out
}

/**
 * The weave's names down its left, one per thread, as heights: level with where the thread starts in
 * column `first` at `y`, or the next clear height down from there. Threads that start at the left edge
 * are placed first; they are a gap apart already, so their names sit level with them.
 */
export function weaveNames(starts: { first: number; y: number }[], gap: number): number[] {
  const tops: number[] = []
  const taken: number[] = []
  const order = starts.map((_, i) => i)
    .sort((a, b) => Math.sign(starts[a]!.first) - Math.sign(starts[b]!.first) || starts[a]!.y - starts[b]!.y)
  for (const i of order) {
    let top = starts[i]!.y
    let block: number | undefined
    while ((block = taken.find(t => Math.abs(t - top) < gap)) !== undefined) top = block + gap
    taken.push((tops[i] = top))
  }
  return tops
}

export interface SankeyNode {
  id: string
  y: number
  h: number
}

export interface SankeyBand {
  from: string
  to: string
  trips: number
  people: number
  /** The band's middle at either end, and how thick it is. */
  y0: number
  y1: number
  w: number
}

/**
 * Journeys as two columns: where they set off on the left and where they ended on the right, busiest at
 * the top. A band is as thick as its trips, and each place's bands stand side by side in the order their
 * other ends do. `tallest` is the busiest place's height, `least` the thinnest a place may be and still
 * carry its name, `gap` the space between two.
 */
export function sankeyLayout(
  links: { from: string; to: string; trips: number; people: number }[],
  tallest: number,
  least: number,
  gap: number,
): { left: SankeyNode[]; right: SankeyNode[]; bands: SankeyBand[]; height: number } {
  const out = new Map<string, number>()
  const into = new Map<string, number>()
  for (const l of links) {
    out.set(l.from, (out.get(l.from) ?? 0) + l.trips)
    into.set(l.to, (into.get(l.to) ?? 0) + l.trips)
  }
  // ponytail: six pixels a trip at most, so a story of three journeys is not three slabs.
  const k = Math.min(6, tallest / Math.max(1, ...out.values(), ...into.values()))
  const stack = (flows: Map<string, number>) => {
    let y = 0
    return [...flows]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const node = { id, y, h: Math.max(least, n * k) }
        y += node.h + gap
        return node
      })
  }
  const left = stack(out)
  const right = stack(into)
  const L = new Map(left.map((n, i) => [n.id, i]))
  const R = new Map(right.map((n, i) => [n.id, i]))
  // Where the next band starts at each place: its bands are centred on it.
  const from = new Map(left.map(n => [n.id, n.y + (n.h - out.get(n.id)! * k) / 2]))
  const to = new Map(right.map(n => [n.id, n.y + (n.h - into.get(n.id)! * k) / 2]))
  const bands: SankeyBand[] = links.map(l => ({ ...l, y0: 0, y1: 0, w: l.trips * k }))
  for (const b of [...bands].sort((x, y) => L.get(x.from)! - L.get(y.from)! || R.get(x.to)! - R.get(y.to)!)) {
    b.y0 = from.get(b.from)! + b.w / 2
    from.set(b.from, from.get(b.from)! + b.w)
  }
  for (const b of [...bands].sort((x, y) => R.get(x.to)! - R.get(y.to)! || L.get(x.from)! - L.get(y.from)!)) {
    b.y1 = to.get(b.to)! + b.w / 2
    to.set(b.to, to.get(b.to)! + b.w)
  }
  const end = (nodes: SankeyNode[]) => (nodes.length ? nodes.at(-1)!.y + nodes.at(-1)!.h : 0)
  return { left, right, bands, height: Math.max(end(left), end(right)) }
}

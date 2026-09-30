/**
 * BL-16: the story as a storyline chart — one row per place, time running left to right, and each
 * person a line that hops from row to row as they travel. People at the same place at the same time run
 * side by side, so a gathering is a bundle of lines on one row and a party is a band that moves as one.
 *
 * Places are pins on the map in front of the reader, the way the range summary counts them: `pinOf`
 * turns a place into the pin that stands for it, or null when this map has nothing to show it with.
 */
import type { CastStop } from './mapTime'

/** Somewhere a person was, as a pin on this map, and from when to when. */
export interface StoryStay {
  pin: string
  from: number
  to: number
}

/** A stay anywhere: null is a place this map has no pin for. */
export interface FlatStay {
  pin: string | null
  from: number
  to: number
}

/**
 * One person's whereabouts as one stay after another, earliest first. The time between two stays is the
 * road, and is not in the list.
 *
 * Overlapping stops read the way `legAt` reads them: the latest one to start is where they are, and when
 * it ends they are back at the one it interrupted, if that one is still running. `stops` earliest first,
 * as `stopsFor` gives them.
 */
export function flatStays(stops: CastStop[], pinOf: (locationId: string) => string | null): FlatStay[] {
  const flat: FlatStay[] = []
  /** The stops still running, in the order they started: the last is where they are. */
  const open: CastStop[] = []
  let since = 0
  // Every open stop that ends before `t`, soonest first. One under the top ends unseen; the top ending
  // hands the time back to the one under it.
  const closeUntil = (t: number) => {
    for (;;) {
      let i = -1
      for (let k = 0; k < open.length; k++) if (open[k]!.to < t && (i < 0 || open[k]!.to < open[i]!.to)) i = k
      if (i < 0) return
      const [x] = open.splice(i, 1)
      if (i === open.length) {
        flat.push({ pin: pinOf(x!.locationId), from: since, to: x!.to })
        since = x!.to
      }
    }
  }
  for (const s of stops) {
    closeUntil(s.from)
    const top = open.at(-1)
    if (top) flat.push({ pin: pinOf(top.locationId), from: since, to: s.from })
    open.push(s)
    since = s.from
  }
  closeUntil(Infinity)

  const out: FlatStay[] = []
  for (const f of flat) {
    const last = out.at(-1)
    // The same place again straight after is one stay: nobody else takes their seat on the row meanwhile.
    if (last && last.pin === f.pin) last.to = Math.max(last.to, f.to)
    else out.push(f)
  }
  return out
}

/**
 * One person's stays in runs: a line is drawn through each run, and a place this map cannot show breaks
 * it — there is no row for them to be on in between.
 */
export function storyRuns(stops: CastStop[], pinOf: (locationId: string) => string | null): StoryStay[][] {
  const runs: StoryStay[][] = []
  let run: StoryStay[] | null = null
  for (const s of flatStays(stops, pinOf)) {
    if (!s.pin) {
      run = null
      continue
    }
    if (!run) runs.push((run = []))
    run.push({ pin: s.pin, from: s.from, to: s.to })
  }
  return runs
}

export interface StoryLayout {
  /** Each row's top and height, in pixels. */
  rows: { top: number; height: number }[]
  height: number
  /** The y of every stay, by person, run and stay. */
  ys: number[][][]
}

/**
 * Where every stay sits: each row is as many lanes deep as the most people on it at once, and a stay
 * takes the highest lane free when it starts. `gap` is one lane, `pad` the space round a row.
 */
export function layoutStory(
  rows: { id: string }[],
  people: { runs: StoryStay[][] }[],
  gap: number,
  pad: number,
): StoryLayout {
  const rowOf = new Map(rows.map((r, i) => [r.id, i]))
  const onRow: { p: number; r: number; s: number; from: number; to: number }[][] = rows.map(() => [])
  const lane = people.map(person => person.runs.map(run => run.map(() => 0)))
  people.forEach((person, p) => person.runs.forEach((run, r) => run.forEach((stay, s) => {
    const i = rowOf.get(stay.pin)
    if (i !== undefined) onRow[i]!.push({ p, r, s, from: stay.from, to: stay.to })
  })))

  let top = 0
  const out = onRow.map(list => {
    list.sort((a, b) => a.from - b.from || a.to - b.to || a.p - b.p)
    const ends: number[] = []
    for (const x of list) {
      // Strictly after: two people at the same one-moment event are side by side, not on top of each other.
      let k = ends.findIndex(end => end < x.from)
      if (k < 0) k = ends.push(x.to) - 1
      else ends[k] = x.to
      lane[x.p]![x.r]![x.s] = k
    }
    const row = { top, height: Math.max(1, ends.length) * gap + pad }
    top += row.height
    return row
  })

  const ys = people.map((person, p) => person.runs.map((run, r) => run.map((stay, s) => {
    const row = out[rowOf.get(stay.pin) ?? -1]
    return row ? row.top + pad / 2 + (lane[p]![r]![s]! + 0.5) * gap : 0
  })))
  return { rows: out, height: top, ys }
}

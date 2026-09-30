<script setup lang="ts">
/**
 * BL-16: the cast window's charts. The map works out the one whose tab is up (mapCharts.ts) and sends
 * only that; this draws it, and sends back what the reader does with it: someone picked out, the clock
 * moved, or a different place or pair of people to chart.
 *
 * The time charts share one frame: names down the left, the chart beside them, dates along the bottom,
 * one scroll for all three. Over the whole story a click on the chart sets the map's clock; a range is
 * drawn edge to edge, and a click there would slide it out from under the pointer. A drag across any of
 * them zooms all of them into that stretch.
 *
 * A place or a pair of people clicked here opens the chart that says more about it, on its own tab.
 * Someone double-clicked is gone to on the map, and right-clicked has the window's menu, as on People.
 * Whatever is pointed at is said on one line above the chart, at once, instead of in a tooltip.
 */
import { computed, ref, watch } from 'vue'
import { PhArrowsLeftRight, PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import { isTimed, type CastCommand, type CastState, type ChartAsk, type ChartId, type ChartState, type PersonRow, type PlaceRow } from '@/utils/mapCast'
import { COLUMNS, SLICES, sankeyLayout, weaveBands, weaveLayout, weaveNames, type SankeyNode } from '@/utils/mapCharts'
import { formatDistance } from '@/utils/mapScale'
import { categoryColor } from '@/utils/relationsGraph'
import { layoutStory } from '@/utils/storyline'

/** `zoomed`: the time charts are into a stretch of what the map has open, not all of it. */
const props = defineProps<{ chart: ChartState | null; state: CastState; zoomed: boolean }>()
const emit = defineEmits<{
    send: [command: CastCommand]
    ask: [ask: ChartAsk]
    /** Another chart, about what was clicked: its tab, opened if need be. */
    go: [tab: ChartId, ask: ChartAsk]
    /** A stretch dragged across, to zoom the time charts into. */
    zoom: [stretch: { from: number; to: number }]
    /** A right-click on someone: the window's own menu for them. */
    menu: [e: MouseEvent, id: string]
}>()

type Of<K extends ChartId> = Extract<ChartState, { chart: K }>
/** The chart, while it is this one. */
const only = <K extends ChartId>(k: K) => computed(() => (props.chart?.chart === k ? (props.chart as Of<K>) : null))
const story = only('story')
const strips = only('strips')
const heat = only('heat')
const tables = only('tables')
const met = only('met')
const crowd = only('crowd')
const apart = only('apart')
const weave = only('weave')
const sankey = only('sankey')

/** A chart's own width in SVG units: stretched to the window, and its lines keep their width. */
const W = 1000
/** A person's or a place's row on the bar charts, in pixels. */
const ROW = 14
const ZOOM_TIP = 'Drag across to zoom in'
const CLICK_TIP = `Click to set the map's clock to that moment. ${ZOOM_TIP}`
const PLACE_TIP = ' — click for who was there, and when'
const WHO_TIP = ' — click to pick them out, double-click to go to them, right-click for more'

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const valueOf = (e: Event) => (e.target as HTMLSelectElement).value

/** Why there is nothing to draw, or '' when there is. */
const empty = computed(() => {
    const c = props.chart
    if (!c) return ''
    if (props.state.following?.length === 0) return 'Nobody is on the map.'
    const nowhere = `Nobody shown was anywhere on this map${props.zoomed ? ' in this stretch' : ''}.`
    switch (c.chart) {
        case 'story':
        case 'heat':
            return c.rows.length ? '' : nowhere
        case 'strips':
            return c.people.length ? '' : 'Nobody shown turns up in this stretch of the story.'
        case 'weave':
            return c.people.length ? '' : nowhere
        case 'crowd':
            return c.place ? '' : nowhere
        case 'met':
            return c.pairs.length ? '' : 'Nobody shown was at an event with anyone else shown.'
        case 'sankey':
            return c.links.length ? '' : 'Nobody shown travelled between places on this map.'
        case 'apart':
            if (c.people.length < 2) return 'Show two people on the map to see how far apart they were.'
            if (!c.unit) return 'Distances cannot be measured on this map: its picture has not loaded yet, or its scale has no unit.'
            if (c.points.some(v => v !== null)) return ''
            return `They were never both on this map ${props.zoomed ? 'in this stretch' : 'at the same time'}.`
        default:
            // The tables say it for each of their two.
            return ''
    }
})
/** Nothing to draw for want of people on the map: one click puts everyone back. */
const fixable = computed(() =>
    !!props.state.following && (!props.state.following.length || (apart.value?.people.length ?? 2) < 2))

/** What is under the pointer, said at once above the chart, where a tooltip takes a second to come. */
const readout = ref('')
// What it was about is gone with the chart.
watch(() => props.chart?.chart, () => { readout.value = '' })

// ── Who is picked out ──────────────────────────────────────────────────────────

/** Pick someone out on the map, or put the one already picked back among everyone. */
const spot = (id: string) => emit('send', { kind: 'spot', id: props.state.spotlight === id ? null : id })
const hover = (id: string | null) => emit('send', { kind: 'hover', id })
/** Pointing at someone: their dot swells on the map, and the line above the chart says who, and what a click does. */
function point(p: { id: string; name: string } | null, text = p ? p.name + WHO_TIP : '') {
    hover(p?.id ?? null)
    readout.value = text
}
/** Go to them on the map, and to when they are next in the story if not now. */
const fly = (id: string) => emit('send', { kind: 'fly', id })
/** Their menu, the same one as on the People tab. */
function menuOf(e: MouseEvent, id: string) {
    e.preventDefault()
    emit('menu', e, id)
}
/** Someone else is picked out, and this one is not being pointed at. */
const dim = (id: string) => !!props.state.spotlight && props.state.spotlight !== id && props.state.hover !== id
const lit = (id: string) => props.state.spotlight === id || props.state.hover === id
/** The one picked out drawn last, so they run over everyone they cross. */
function spotLast<T extends { id: string }>(list: T[]) {
    const id = props.state.spotlight
    return id ? [...list.filter(p => p.id !== id), ...list.filter(p => p.id === id)] : list
}

// ── Time, left to right ────────────────────────────────────────────────────────

const whole = computed(() => props.state.clock.from === null)
const timed = computed(() => !!props.chart && isTimed(props.chart.chart))
/** What the line above the chart says while the pointer is on nothing in particular. */
const idle = computed(() => (!timed.value ? 'Point at the chart to read it here.' : whole.value ? CLICK_TIP : ZOOM_TIP))

/** Where a moment is across the chart, as a share of it. */
function across(t: number) {
    const c = props.chart
    return c && c.hi > c.lo ? Math.min(1, Math.max(0, (t - c.lo) / (c.hi - c.lo))) : 0
}
const pct = (t: number) => `${across(t) * 100}%`
const wide = (b: { from: number; to: number }) => `${(across(b.to) - across(b.from)) * 100}%`

function clockClick(e: MouseEvent) {
    const c = props.chart
    if (!c || !whole.value) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    emit('send', { kind: 'clock', at: c.lo + ((e.clientX - r.left) / Math.max(1, r.width)) * (c.hi - c.lo) })
}

/** The stretch being dragged across, as shares of the chart's width. */
const sweep = ref<{ x0: number; x1: number } | null>(null)
/** The press became a drag, so the click it ends in is not one. */
let swept = false

/** A drag across the chart zooms into the stretch it swept; a press that barely moves stays a click. */
function sweepStart(e: PointerEvent) {
    const c = props.chart
    if (e.button !== 0 || !c) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (at: number) => Math.min(1, Math.max(0, (at - r.left) / Math.max(1, r.width)))
    swept = false
    const move = (m: PointerEvent) => {
        if (!swept && Math.abs(m.clientX - e.clientX) < 4) return
        swept = true
        sweep.value = { x0: x(e.clientX), x1: x(m.clientX) }
    }
    const end = (m: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        const s = sweep.value
        sweep.value = null
        if (m.type === 'pointercancel' || !s || Math.abs(s.x1 - s.x0) < 0.005) return
        const at = (k: number) => c.lo + k * (c.hi - c.lo)
        emit('zoom', { from: at(Math.min(s.x0, s.x1)), to: at(Math.max(s.x0, s.x1)) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
}
function sweepClick(e: MouseEvent) {
    if (swept) e.stopPropagation()
}

/** A place's own chart, from its name or a bar of time spent there. */
function toPlace(place: string, e?: Event) {
    e?.stopPropagation()
    emit('go', 'crowd', { place })
}

// ── The storyline: a row per place, a line per person ──────────────────────────

/** One lane of a row, and the room round a row, in pixels. */
const STORY_GAP = 5
const STORY_PAD = 10
const storyLayout = computed(() => story.value && layoutStory(story.value.rows, story.value.people, STORY_GAP, STORY_PAD))

/** Each person as one path per run: along a row while they stay, straight down or up where they travel. */
const storyLines = computed(() => {
    const s = story.value
    const l = storyLayout.value
    if (!s || !l) return []
    return s.people.map((p, pi) => ({
        id: p.id,
        name: p.name,
        colour: p.colour,
        d: p.runs.map((run, ri) => run
            .map((stay, si) => {
                const y = l.ys[pi]![ri]![si]!.toFixed(1)
                return `${si ? 'L' : 'M'}${(across(stay.from) * W).toFixed(1)} ${y}L${(across(stay.to) * W).toFixed(1)} ${y}`
            })
            .join('')).join(''),
    }))
})

// ── The weave: threads that run together while their people are together ──────

const WEAVE_GAP = 10
/** From one place's last thread to the next place's first: room for two band edges and a place's name. */
const WEAVE_BETWEEN = 28
/** Above the top thread: its band's edge and name. */
const WEAVE_PAD = 18
/** How far a band reaches past its outermost threads. */
const BAND_PAD = 5
/** Columns a band needs before it is named on the chart; a shorter one is named by the line above. */
const BAND_NAMED = 3

const f = (n: number) => n.toFixed(1)
/**
 * Through one height per column from column `k0`: level for most of each column, then an S-bend into
 * the next, so a move reads as a move. `back` goes right to left, for a band's lower edge.
 */
function wave(k0: number, vs: number[], back = false) {
    const cw = W / COLUMNS
    let d = back ? '' : `M${f(k0 * cw)} ${f(vs[0]!)}`
    const at = (i: number) => {
        const x = (k0 + i) * cw
        const v = vs[i]!
        const next = vs[i + 1]
        if (next === undefined) return back ? `L${f(x + cw)} ${f(v)}L${f(x)} ${f(v)}` : `L${f(x + cw)} ${f(v)}`
        const mid = f(x + cw * 0.8)
        return back
            ? `C${mid} ${f(next)} ${mid} ${f(v)} ${f(x + cw * 0.6)} ${f(v)}L${f(x)} ${f(v)}`
            : `L${f(x + cw * 0.6)} ${f(v)}C${mid} ${f(v)} ${mid} ${f(next)} ${f(x + cw)} ${f(next)}`
    }
    for (let i = 0; i < vs.length; i++) d += at(back ? vs.length - 1 - i : i)
    return d
}

const weaveLines = computed(() => {
    const c = weave.value
    if (!c) return { lines: [], names: [], bands: [], places: new Map<string, string>(), height: 0 }
    const at = c.people.map(p => p.at)
    const { ys, height } = weaveLayout(at, WEAVE_GAP, WEAVE_BETWEEN)
    const cw = W / COLUMNS
    const places = new Map(c.places.map(p => [p.id, p.name]))
    const lines = c.people.map((p, i) => {
        const y = ys[i]!.map(v => (v === null ? null : v + WEAVE_PAD))
        // A path per stretch in the story, split wherever they are out of it.
        const runs: { k0: number; vs: number[] }[] = []
        y.forEach((v, k) => {
            if (v === null) return
            if (y[k - 1] == null) runs.push({ k0: k, vs: [] })
            runs.at(-1)!.vs.push(v)
        })
        const first = Math.max(0, y.findIndex(v => v !== null))
        const d = runs.map(r => wave(r.k0, r.vs)).join('')
        return { id: p.id, name: p.name, colour: p.colour, d, first, start: y[first] ?? 0, lead: '' }
    })
    // Names down the left; one that is not level with the start of its thread gets a dotted lead to it.
    const tops = weaveNames(lines.map(l => ({ first: l.first, y: l.start })), WEAVE_GAP)
    const names = lines.map((l, i) => {
        const top = tops[i]!
        if (l.first || top !== l.start) l.lead = `M0 ${f(top)}L${f(l.first * cw)} ${f(l.start)}`
        return { id: l.id, name: l.name, colour: l.colour, top }
    })
    // Height alone says nothing, since a place moves up and down as people come and go: a band behind
    // each place's threads, and its name where it starts, say where they are.
    const bands = weaveBands(at, ys).map(b => {
        const top = b.tops.map(v => v + WEAVE_PAD - BAND_PAD)
        const bot = b.bots.map(v => v + WEAVE_PAD + BAND_PAD)
        return {
            key: `${b.place}@${b.k0}`,
            place: b.place,
            name: places.get(b.place) ?? '',
            colour: categoryColor(b.place),
            d: `${wave(b.k0, top)}${wave(b.k0, bot, true)}Z`,
            left: `${(b.k0 / COLUMNS) * 100}%`,
            width: `${(top.length / COLUMNS) * 100}%`,
            top: top[0]!,
            named: top.length >= BAND_NAMED,
        }
    })
    return { lines, names, bands, places, height: Math.max(height + 2 * WEAVE_PAD, ...tops.map(t => t + WEAVE_GAP / 2)) }
})

/** Along a thread, the line above says where its person was at that point. */
function pointThread(e: MouseEvent, p: { id: string; name: string }) {
    const c = weave.value
    const svg = (e.currentTarget as SVGElement).ownerSVGElement
    if (!c || !svg) return
    const r = svg.getBoundingClientRect()
    const k = Math.min(COLUMNS - 1, Math.max(0, Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * COLUMNS)))
    const pin = c.people.find(x => x.id === p.id)?.at[k]
    const where = pin === '~' ? ', off this map' : pin ? `, at ${weaveLines.value.places.get(pin) ?? 'a place'}` : ''
    readout.value = p.name + where + WHO_TIP
}

/** The storyline's lines or the weave's threads, whichever is up. */
const lineSet = computed<{ id: string; name: string; colour: string; d: string; lead?: string }[]>(() =>
    story.value ? storyLines.value : weaveLines.value.lines)

// ── Busy places, and one place ─────────────────────────────────────────────────

const heatCells = computed(() => {
    const c = heat.value
    if (!c) return []
    return c.cells.flatMap((row, r) => row.flatMap((n, k) => n
        ? [{
            key: `${r}-${k}`,
            r,
            k,
            o: 0.15 + (0.85 * n) / Math.max(1, c.max),
            text: `${c.rows[r]!.name}: ${count(n, 'person', 'people')}, ${c.cuts[k]} – ${c.cuts[k + 1]}`,
        }]
        : []))
})

/** The strip of heads over one place's visitors, in pixels. */
const CROWD_H = 40
const crowdBars = computed(() => {
    const c = crowd.value
    if (!c) return []
    const most = Math.max(1, ...c.counts)
    return c.counts.flatMap((n, k) => n
        ? [{ k, h: (n / most) * (CROWD_H - 4), text: `${count(n, 'person', 'people')}, ${c.cuts[k]} – ${c.cuts[k + 1]}` }]
        : [])
})

/** A lane of bars per person: the life strips, or one place's visitors under its strip of heads. */
const lanes = computed(() => {
    const c = strips.value ?? crowd.value
    const top = crowd.value ? CROWD_H : 0
    return c ? c.people.map((p, i) => ({ ...p, top: top + i * ROW })) : []
})

/** Place names down the side: the storyline's rows, as deep as their lanes, or the busy places'. */
const rowNames = computed(() => {
    const l = storyLayout.value
    if (story.value && l) return story.value.rows.map((r, i) => ({ ...r, top: l.rows[i]!.top, height: l.rows[i]!.height }))
    return heat.value?.rows.map((r, i) => ({ ...r, top: i * ROW, height: ROW })) ?? []
})

// ── How far apart ──────────────────────────────────────────────────────────────

const APART_H = 150
const apartMax = computed(() => (apart.value?.points ?? []).reduce<number>((m, v) => (v !== null && v > m ? v : m), 0))
/** The line, broken wherever either of them is off this map. */
const apartPath = computed(() => {
    const c = apart.value
    if (!c) return ''
    const top = apartMax.value || 1
    const last = Math.max(1, c.points.length - 1)
    return c.points
        .map((v, k) => (v === null ? '' : `${c.points[k - 1] == null ? 'M' : 'L'}${((k / last) * W).toFixed(1)} ${(96 - (v / top) * 92).toFixed(1)}`))
        .join('')
})
/** The sample under the pointer. */
const apartAt = ref<number | null>(null)
function apartMove(e: MouseEvent) {
    const n = apart.value?.points.length ?? 0
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    apartAt.value = n > 1 ? Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))) * (n - 1)) : null
}
/** What the pointer is over, or else how far apart they ever got. */
const apartText = computed(() => {
    const c = apart.value
    if (!c) return ''
    const k = apartAt.value ?? c.points.indexOf(apartMax.value)
    const v = c.points[k]
    if (v == null) return `${c.when[k] ?? ''}: not both on this map`
    const d = `${formatDistance(v)} ${c.unit}`
    return apartAt.value === null ? `Furthest apart: ${d}, ${c.when[k]}` : `${c.when[k]}: ${d} apart`
})
/** Who the first was ever at an event with, where that is news: never the second, or nobody at all. */
const apartMet = computed(() => {
    const c = apart.value
    if (!c?.a || !c.b || c.met === 'each other') return ''
    const name = (id: string) => c.people.find(p => p.id === id)?.name ?? ''
    return c.met === 'nobody' ? `${name(c.a)} never met anyone else on the map.` : `${name(c.a)} and ${name(c.b)} never met.`
})
function askApart(side: 'a' | 'b', e: Event) {
    const c = apart.value
    if (!c) return
    const v = valueOf(e)
    emit('ask', side === 'a' ? { a: v, b: c.b ?? undefined } : { a: c.a ?? undefined, b: v })
}

/** The frame's height: the names and the chart beside them. */
const frameHeight = computed(() => {
    if (story.value) return storyLayout.value?.height ?? 0
    if (weave.value) return weaveLines.value.height
    if (heat.value) return heat.value.rows.length * ROW
    if (apart.value) return APART_H
    return (crowd.value ? CROWD_H : 0) + lanes.value.length * ROW
})

// ── Tables ─────────────────────────────────────────────────────────────────────

interface Col<T> {
    label: string
    /** What the column sorts by, and says unless `text` says it in words. */
    v: (row: T) => string | number
    text?: (row: T) => string
    title?: string
}
const PERSON_COLS: Col<PersonRow>[] = [
    { label: 'Name', v: r => r.name },
    { label: 'Journeys', v: r => r.trips },
    { label: 'Places', v: r => r.places },
    { label: 'On the road', v: r => r.road, text: r => r.roadText },
    { label: 'Distance', v: r => r.distance, text: r => r.distanceText, title: 'Maps in different units are added together to sort; the words keep them apart' },
    { label: 'First seen', v: r => r.first, text: r => r.firstText },
    { label: 'Last seen', v: r => r.last, text: r => r.lastText },
]
const PLACE_COLS: Col<PlaceRow>[] = [
    { label: 'Place', v: r => r.name },
    { label: 'People', v: r => r.people },
    { label: 'Visits', v: r => r.visits },
    { label: 'Time there', v: r => r.time, text: r => r.timeText, title: "Everyone's time there, added up" },
    { label: 'Most at once', v: r => r.most },
]

const tableOf = ref<'people' | 'places'>('people')
/** Each table's sort: names A to Z first, numbers biggest first. */
const sorts = ref({ people: { col: 1, dir: -1 }, places: { col: 1, dir: -1 } })
const sort = computed(() => sorts.value[tableOf.value])
function sortBy(col: number) {
    sorts.value[tableOf.value] = { col, dir: sort.value.col === col ? -sort.value.dir : col ? -1 : 1 }
}
const cellsOf = <T,>(row: T, cols: Col<T>[]) => cols.map(c => ({ v: c.v(row), text: c.text?.(row) ?? String(c.v(row)) }))
const table = computed(() => {
    const c = tables.value
    if (!c) return null
    const people = tableOf.value === 'people'
    const rows = people
        ? c.people.map(p => ({ id: p.id, colour: p.colour, cells: cellsOf(p, PERSON_COLS) }))
        : c.places.map(p => ({ id: p.id, colour: categoryColor(p.id), cells: cellsOf(p, PLACE_COLS) }))
    const { col, dir } = sort.value
    rows.sort((x, y) => {
        const a = x.cells[col]!.v
        const b = y.cells[col]!.v
        return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * dir
    })
    return { cols: people ? PERSON_COLS : PLACE_COLS, rows }
})

// ── Who met whom ───────────────────────────────────────────────────────────────

/** A cell, and the room for names down the side, in pixels. */
const MET_CELL = 10
const MET_NAME = 96
/** The best-connected until asked for everyone: as many as fit the window. */
const MET_SHOWN = 26
const metAll = ref(false)
const metView = computed(() => {
    const c = met.value
    if (!c) return null
    const n = metAll.value ? c.people.length : Math.min(MET_SHOWN, c.people.length)
    const pairs = c.pairs.filter(([, j]) => j < n)
    const most = pairs.reduce((m, [, , t]) => Math.max(m, t), 1)
    return {
        people: c.people.slice(0, n),
        size: n * MET_CELL,
        hidden: c.people.length - n,
        // Both halves: a row reads across as everyone that person met.
        // A click measures from the row's person to the column's.
        cells: pairs.flatMap(([i, j, t]) => {
            const o = 0.2 + (0.8 * t) / most
            const [a, b] = [c.people[i]!, c.people[j]!]
            const text = `${a.name} & ${b.name}: ${count(t, 'event')} together — click for how far apart they were`
            return [
                { key: `${i}-${j}`, x: j, y: i, a: a.id, b: b.id, o, text },
                { key: `${j}-${i}`, x: i, y: j, a: b.id, b: a.id, o, text },
            ]
        }),
    }
})
const short = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)

// ── Flows ──────────────────────────────────────────────────────────────────────

const SANKEY_SHOWN = 30
const sankeyAll = ref(false)
const sankeyView = computed(() => {
    const c = sankey.value
    if (!c) return null
    const links = sankeyAll.value ? c.links : c.links.slice(0, SANKEY_SHOWN)
    // The busiest place 160px tall, none too thin for its name, 5px between two.
    const l = sankeyLayout(links, 160, 14, 5)
    const names = new Map(c.places.map(p => [p.id, p.name]))
    const node = (n: SankeyNode) => ({ ...n, name: names.get(n.id) ?? '', colour: categoryColor(n.id) })
    return {
        left: l.left.map(node),
        right: l.right.map(node),
        height: l.height,
        hidden: c.links.length - links.length,
        bands: l.bands.map(b => {
            const y0 = b.y0.toFixed(1)
            const y1 = b.y1.toFixed(1)
            return {
                key: `${b.from}>${b.to}`,
                d: `M0 ${y0}C${W / 2} ${y0} ${W / 2} ${y1} ${W} ${y1}`,
                w: Math.max(1, b.w),
                colour: categoryColor(b.from),
                text: `${names.get(b.from)} → ${names.get(b.to)}: ${count(b.trips, 'journey')} by ${count(b.people, 'person', 'people')}`,
            }
        }),
    }
})
</script>

<template>
    <div class="charts">
        <p v-if="!chart" class="side-note">Working it out…</p>
        <template v-else>
            <!-- What the chart is about, where it can be about something else. -->
            <div v-if="crowd && crowd.places.length" class="chart-tools">
                <select :value="crowd.place ?? ''" class="chart-pick" title="The place charted" @change="emit('ask', { place: valueOf($event) })">
                    <option v-for="p in crowd.places" :key="p.id" :value="p.id">{{ p.name }} · {{ count(p.n, 'person', 'people') }}</option>
                </select>
            </div>
            <template v-if="apart && apart.people.length > 1 && apart.unit">
                <div class="chart-tools">
                    <select :value="apart.a ?? ''" class="chart-pick" title="Measured from" @change="askApart('a', $event)">
                        <option v-for="p in apart.people" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                    <PhArrowsLeftRight :size="12" />
                    <select :value="apart.b ?? ''" class="chart-pick" title="Measured to" @change="askApart('b', $event)">
                        <option v-for="p in apart.people" :key="p.id" :value="p.id" :disabled="p.id === apart.a">{{ p.name }}</option>
                    </select>
                </div>
                <p v-if="apartMet" class="chart-read">{{ apartMet }}</p>
            </template>

            <template v-if="empty">
                <p class="side-note">{{ empty }}</p>
                <button v-if="fixable" class="chart-more" @click="emit('send', { kind: 'follow', ids: null })">Show everyone</button>
            </template>

            <template v-else>
                <!-- One line, always there, so what it says never moves the chart under the pointer. -->
                <p v-if="!tables" class="chart-read live" :class="{ faint: !apart && !readout }">
                    {{ apart ? apartText : readout || idle }}
                </p>

                <div v-if="timed" class="chart-scroll chart-frame">
                    <div class="chart-names" :style="{ height: `${frameHeight}px` }">
                        <button
                            v-for="n in rowNames"
                            :key="n.id"
                            class="chart-name place"
                            :style="{ top: `${n.top}px`, height: `${n.height}px`, lineHeight: `${n.height}px` }"
                            @click="toPlace(n.id)"
                            @mouseenter="readout = n.name + PLACE_TIP"
                            @mouseleave="readout = ''"
                        >{{ n.name }}</button>
                        <span v-if="crowd" class="chart-name faint" :style="{ top: 0, height: `${CROWD_H}px`, lineHeight: `${CROWD_H}px` }">
                            How many
                        </span>
                        <button
                            v-for="p in lanes"
                            :key="p.id"
                            class="chart-name who"
                            :class="{ dim: dim(p.id), lit: lit(p.id) }"
                            :style="{ top: `${p.top}px`, height: `${ROW}px`, lineHeight: `${ROW}px` }"
                            @click="$event.detail < 2 && spot(p.id)"
                            @dblclick="fly(p.id)"
                            @contextmenu="menuOf($event, p.id)"
                            @mouseenter="point(p)"
                            @mouseleave="point(null)"
                        >{{ p.name }}</button>
                        <button
                            v-for="p in weaveLines.names"
                            :key="p.id"
                            class="chart-name who weave-name"
                            :class="{ dim: dim(p.id), lit: lit(p.id) }"
                            :style="{ top: `${p.top - WEAVE_GAP / 2}px`, color: p.colour }"
                            @click="$event.detail < 2 && spot(p.id)"
                            @dblclick="fly(p.id)"
                            @contextmenu="menuOf($event, p.id)"
                            @mouseenter="point(p)"
                            @mouseleave="point(null)"
                        >{{ p.name }}</button>
                        <template v-if="apart">
                            <span class="chart-axis" :style="{ top: 0 }">{{ formatDistance(apartMax) }} {{ apart.unit }}</span>
                            <span class="chart-axis" :style="{ bottom: 0 }">0</span>
                        </template>
                    </div>

                    <!-- No tooltips here: the line above says what is under the pointer, and what a click does. -->
                    <div
                        class="chart-plot"
                        :style="{ height: `${frameHeight}px` }"
                        @pointerdown="sweepStart"
                        @click.capture="sweepClick"
                        @click="clockClick"
                        @mousemove="apartMove"
                        @mouseleave="apartAt = null"
                    >
                        <div
                            v-for="(row, i) in storyLayout?.rows ?? []"
                            :key="i"
                            class="chart-row"
                            :class="{ odd: i % 2 }"
                            :style="{ top: `${row.top}px`, height: `${row.height}px` }"
                        />
                        <svg v-if="lineSet.length" class="chart-svg lines" :viewBox="`0 0 ${W} ${frameHeight}`" preserveAspectRatio="none">
                            <!--
                                The weave's places, under the threads; not in a g, so pointing at one steps no
                                thread back. They are the chart's ground, as the storyline's rows are, so a click
                                on one is the chart's own click; the name is what opens the place.
                            -->
                            <path
                                v-for="b in weaveLines.bands"
                                :key="b.key"
                                class="band"
                                :d="b.d"
                                :style="{ fill: b.colour }"
                                @mouseenter="readout = `${b.name}. ${idle}`"
                                @mouseleave="readout = ''"
                            />
                            <!-- A wide see-through stroke under each line, so a two-pixel line can be clicked. -->
                            <g
                                v-for="p in spotLast(lineSet)"
                                :key="p.id"
                                :class="{ dim: dim(p.id), lit: lit(p.id) }"
                                @click.stop="$event.detail < 2 && spot(p.id)"
                                @dblclick="fly(p.id)"
                                @contextmenu="menuOf($event, p.id)"
                                @mouseenter="point(p)"
                                @mousemove="weave && pointThread($event, p)"
                                @mouseleave="point(null)"
                            >
                                <path class="hit" :d="p.d" />
                                <path v-if="p.lead" class="lead" :d="p.lead" :stroke="p.colour" />
                                <path :d="p.d" :stroke="p.colour" />
                            </g>
                        </svg>
                        <!-- Out here, not in the SVG, which is stretched to the width and would stretch the letters. -->
                        <template v-for="b in weaveLines.bands" :key="`n${b.key}`">
                            <button
                                v-if="b.named"
                                class="band-name"
                                :style="{ left: b.left, maxWidth: b.width, top: `${b.top}px`, color: b.colour }"
                                @click="toPlace(b.place, $event)"
                                @mouseenter="readout = b.name + PLACE_TIP"
                                @mouseleave="readout = ''"
                            >{{ b.name }}</button>
                        </template>

                        <svg v-if="heat" class="chart-svg heat" :viewBox="`0 0 ${SLICES} ${heat.rows.length}`" preserveAspectRatio="none">
                            <rect
                                v-for="c in heatCells"
                                :key="c.key"
                                :x="c.k + 0.05"
                                :y="c.r + 0.1"
                                width="0.9"
                                height="0.8"
                                :fill-opacity="c.o"
                                @mouseenter="readout = c.text"
                                @mouseleave="readout = ''"
                            />
                        </svg>

                        <svg
                            v-if="crowd"
                            class="crowd-counts"
                            :viewBox="`0 0 ${SLICES} ${CROWD_H}`"
                            preserveAspectRatio="none"
                            :style="{ height: `${CROWD_H}px` }"
                        >
                            <rect
                                v-for="b in crowdBars"
                                :key="b.k"
                                :x="b.k + 0.1"
                                :y="CROWD_H - b.h"
                                width="0.8"
                                :height="b.h"
                                @mouseenter="readout = b.text"
                                @mouseleave="readout = ''"
                            />
                        </svg>
                        <div
                            v-for="p in lanes"
                            :key="p.id"
                            class="chart-lane"
                            :class="{ dim: dim(p.id) }"
                            :style="{ top: `${p.top}px` }"
                            @mouseenter="hover(p.id)"
                            @mouseleave="hover(null)"
                        >
                            <span
                                v-for="(b, k) in p.bars"
                                :key="k"
                                class="chart-bar"
                                :class="{ link: b.place }"
                                :style="{ left: pct(b.from), width: wide(b), background: b.colour }"
                                @click="b.place && toPlace(b.place, $event)"
                                @mouseenter="readout = `${p.name}: ${b.text}${b.place ? PLACE_TIP : ''}`"
                                @mouseleave="readout = ''"
                            />
                        </div>

                        <template v-if="apart">
                            <svg class="chart-svg lines" :viewBox="`0 0 ${W} 100`" preserveAspectRatio="none">
                                <path class="apart-line" :d="apartPath" />
                            </svg>
                            <div
                                v-if="apartAt !== null"
                                class="chart-cursor"
                                :style="{ left: `${(apartAt / Math.max(1, apart.points.length - 1)) * 100}%` }"
                            />
                        </template>

                        <div
                            v-if="whole && state.clock.at >= chart.lo && state.clock.at <= chart.hi"
                            class="chart-now"
                            :style="{ left: pct(state.clock.at) }"
                        />
                        <div
                            v-if="sweep"
                            class="chart-sweep"
                            :style="{ left: `${Math.min(sweep.x0, sweep.x1) * 100}%`, width: `${Math.abs(sweep.x1 - sweep.x0) * 100}%` }"
                        />
                    </div>

                    <!-- Each label is pulled back by as much of itself as it is along, so the ends stay inside. -->
                    <div class="chart-ticks">
                        <span
                            v-for="t in chart.ticks"
                            :key="t.at"
                            :style="{ left: pct(t.at), transform: `translateX(-${across(t.at) * 100}%)` }"
                        >{{ t.text }}</span>
                    </div>
                </div>

                <template v-else-if="tables && table">
                    <div class="chart-tools">
                        <button class="chart-toggle" :class="{ on: tableOf === 'people' }" @click="tableOf = 'people'">
                            People · {{ tables.people.length }}
                        </button>
                        <button class="chart-toggle" :class="{ on: tableOf === 'places' }" @click="tableOf = 'places'">
                            Places · {{ tables.places.length }}
                        </button>
                    </div>
                    <p v-if="!table.rows.length" class="side-note">
                        {{ tableOf === 'people' ? 'Nobody shown turns up in this stretch of the story.' : 'Nobody shown was at a place on this map.' }}
                    </p>
                    <div v-else class="chart-scroll">
                        <table class="chart-table">
                            <thead>
                                <tr>
                                    <th
                                        v-for="(col, i) in table.cols"
                                        :key="col.label"
                                        :class="{ on: sort.col === i }"
                                        :title="col.title ?? 'Sort by this'"
                                        @click="sortBy(i)"
                                    >
                                        {{ col.label }}
                                        <template v-if="sort.col === i">
                                            <PhCaretUp v-if="sort.dir > 0" :size="9" />
                                            <PhCaretDown v-else :size="9" />
                                        </template>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="r in table.rows"
                                    :key="r.id"
                                    :class="{ on: state.spotlight === r.id, hot: state.hover === r.id }"
                                    :title="tableOf === 'places'
                                        ? 'Click for who was there, and when'
                                        : 'Pick them out — double-click to go to them, right-click for more'"
                                    @click="tableOf === 'places' ? toPlace(r.id) : $event.detail < 2 && spot(r.id)"
                                    @dblclick="tableOf === 'people' && fly(r.id)"
                                    @contextmenu="tableOf === 'people' && menuOf($event, r.id)"
                                    @mouseenter="tableOf === 'people' && hover(r.id)"
                                    @mouseleave="tableOf === 'people' && hover(null)"
                                >
                                    <td :title="r.cells[0]!.text">
                                        <span class="dot" :style="{ background: r.colour }" />{{ r.cells[0]!.text }}
                                    </td>
                                    <td v-for="(c, i) in r.cells.slice(1)" :key="i">{{ c.text }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>

                <template v-else-if="metView">
                    <div class="chart-scroll">
                        <svg class="met" :width="MET_NAME + metView.size" :height="metView.size">
                            <!-- Each name, and their own square on the diagonal, in their colour. -->
                            <g
                                v-for="(p, i) in metView.people"
                                :key="p.id"
                                class="met-who"
                                :class="{ dim: dim(p.id), lit: lit(p.id) }"
                                @click="$event.detail < 2 && spot(p.id)"
                                @dblclick="fly(p.id)"
                                @contextmenu="menuOf($event, p.id)"
                                @mouseenter="point(p, `${p.name}: ${count(p.n, 'event')} with someone else shown${WHO_TIP}`)"
                                @mouseleave="point(null)"
                            >
                                <text :x="MET_NAME - 5" :y="(i + 0.5) * MET_CELL">{{ short(p.name) }}</text>
                                <rect :x="MET_NAME + i * MET_CELL" :y="i * MET_CELL" :width="MET_CELL" :height="MET_CELL" :fill="p.colour" />
                            </g>
                            <rect
                                v-for="c in metView.cells"
                                :key="c.key"
                                class="met-cell"
                                :x="MET_NAME + c.x * MET_CELL + 0.5"
                                :y="c.y * MET_CELL + 0.5"
                                :width="MET_CELL - 1"
                                :height="MET_CELL - 1"
                                :fill-opacity="c.o"
                                @click="emit('go', 'apart', { a: c.a, b: c.b })"
                                @mouseenter="readout = c.text"
                                @mouseleave="readout = ''"
                            />
                        </svg>
                    </div>
                    <button v-if="metView.hidden" class="chart-more" @click="metAll = true">
                        +{{ count(metView.hidden, 'more person', 'more people') }}
                    </button>
                </template>

                <template v-else-if="sankeyView">
                    <div class="sankey-head"><span>Set off from</span><span>Arrived at</span></div>
                    <div class="chart-scroll sankey">
                        <div class="sankey-side" :style="{ height: `${sankeyView.height}px` }">
                            <button
                                v-for="n in sankeyView.left"
                                :key="n.id"
                                class="sankey-node"
                                :style="{ top: `${n.y}px`, height: `${n.h}px`, lineHeight: `${n.h}px`, borderColor: n.colour }"
                                @click="toPlace(n.id)"
                                @mouseenter="readout = n.name + PLACE_TIP"
                                @mouseleave="readout = ''"
                            >{{ n.name }}</button>
                        </div>
                        <svg
                            class="sankey-bands"
                            :viewBox="`0 0 ${W} ${sankeyView.height}`"
                            preserveAspectRatio="none"
                            :style="{ height: `${sankeyView.height}px` }"
                        >
                            <path
                                v-for="b in sankeyView.bands"
                                :key="b.key"
                                :d="b.d"
                                :stroke="b.colour"
                                :stroke-width="b.w"
                                @mouseenter="readout = b.text"
                                @mouseleave="readout = ''"
                            />
                        </svg>
                        <div class="sankey-side right" :style="{ height: `${sankeyView.height}px` }">
                            <button
                                v-for="n in sankeyView.right"
                                :key="n.id"
                                class="sankey-node"
                                :style="{ top: `${n.y}px`, height: `${n.h}px`, lineHeight: `${n.h}px`, borderColor: n.colour }"
                                @click="toPlace(n.id)"
                                @mouseenter="readout = n.name + PLACE_TIP"
                                @mouseleave="readout = ''"
                            >{{ n.name }}</button>
                        </div>
                    </div>
                    <button v-if="sankeyView.hidden" class="chart-more" @click="sankeyAll = true">
                        +{{ count(sankeyView.hidden, 'quieter road') }}
                    </button>
                </template>
            </template>
        </template>
    </div>
</template>

<style scoped lang="scss">
.charts {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.side-note { margin: 0; font-size: 0.75rem; font-style: italic; color: var(--app-text-dim, #64748b); }

.chart-tools {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--app-text-dim, #64748b);
}

.chart-pick {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-size: 0.72rem;
}

.chart-read {
    margin: 0;
    font-size: 0.74rem;
    color: var(--app-text-muted, #94a3b8);
    font-variant-numeric: tabular-nums;

    // The readout: one line whatever it says, so the chart under it stays put.
    &.live { flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    &.faint { font-style: italic; color: var(--app-text-dim, #64748b); }
}

.chart-toggle, .chart-more {
    padding: 2px 7px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text-muted, #94a3b8);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;

    &:hover, &.on { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
}

.chart-more { align-self: flex-start; }

.chart-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    // Clicked and hovered, never read off.
    user-select: none;
}

// Names down the left, the chart beside them, the dates along the bottom — one scroll for all three.
.chart-frame {
    display: grid;
    grid-template-columns: 96px 1fr;
    align-content: start;
}

.chart-names { position: relative; }

.chart-name {
    position: absolute;
    left: 0;
    right: 6px;
    display: block;
    padding: 0;
    border: none;
    background: none;
    overflow: hidden;
    font: inherit;
    font-size: 0.72rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    color: var(--app-text-muted, #94a3b8);

    &.faint { font-style: italic; color: var(--app-text-dim, #64748b); }

    &.who, &.place {
        cursor: pointer;

        &:hover, &.lit { color: var(--app-accent-hover, #818cf8); }
        &.dim { opacity: 0.4; }
    }
}

.chart-axis {
    position: absolute;
    right: 6px;
    font-size: 0.66rem;
    white-space: nowrap;
    color: var(--app-text-dim, #64748b);
}

.chart-plot {
    position: relative;
    cursor: crosshair;
}

.chart-row {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;

    &.odd { background: color-mix(in srgb, var(--app-text, #e2e8f0) 4%, transparent); }
}

.chart-now, .chart-cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #fbbf24;
    pointer-events: none;
}

.chart-cursor { background: var(--app-text-dim, #64748b); }

.chart-sweep {
    position: absolute;
    top: 0;
    bottom: 0;
    border-inline: 1px solid var(--app-accent, #6366f1);
    background: color-mix(in srgb, var(--app-accent, #6366f1) 20%, transparent);
    pointer-events: none;
}

.chart-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

// A line per person. Pointing at one, or picking them out, steps everyone else back.
.lines {
    g { cursor: pointer; }

    path {
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
        transition: opacity 0.1s;
    }

    .hit { stroke: transparent; stroke-width: 9; }
    // A place in the weave: faint enough that the threads stay the thing read.
    .band { stroke: none; fill-opacity: 0.13; transition: fill-opacity 0.1s; }
    .band:hover { fill-opacity: 0.22; }
    .lead { stroke-width: 1; stroke-dasharray: 2 3; }
    .apart-line { stroke: var(--app-accent, #6366f1); }

    &:has(g:hover) g:not(:hover) path, .dim path { opacity: 0.2; }
    g:hover path:not(.hit, .lead), .lit path:not(.hit, .lead) { opacity: 1; stroke-width: 3; }
}

// A band's place, just over where the band starts, and never wider than the band runs.
.band-name {
    position: absolute;
    transform: translateY(-100%);
    padding: 0 0 0 2px;
    border: none;
    background: none;
    overflow: hidden;
    font: inherit;
    font-size: 0.6rem;
    line-height: 1.25;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
    text-shadow: 0 0 3px var(--app-bg, #0f172a), 0 0 3px var(--app-bg, #0f172a);

    &:hover { text-decoration: underline; }
}

// A thread's name, in its colour, as tall as the gap between two threads.
.weave-name {
    height: 10px;
    font-size: 0.62rem;
    line-height: 10px;
    text-align: right;

    &.lit { font-weight: 600; }
}

.heat rect, .crowd-counts rect { fill: #fbbf24; }

.crowd-counts {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}

.chart-lane {
    position: absolute;
    left: 0;
    right: 0;
    height: 14px;

    &.dim { opacity: 0.3; }
}

.chart-bar {
    position: absolute;
    top: 2px;
    bottom: 2px;
    min-width: 2px;
    border-radius: 2px;

    &.link { cursor: pointer; }
    &.link:hover { filter: brightness(1.35); }
}

.chart-ticks {
    grid-column: 2;
    position: sticky;
    bottom: 0;
    height: 16px;
    background: var(--app-surface, #0c1524);

    span {
        position: absolute;
        top: 2px;
        font-size: 0.66rem;
        white-space: nowrap;
        color: var(--app-text-dim, #64748b);
    }
}

.chart-table {
    border-collapse: collapse;
    font-size: 0.72rem;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;

    th, td { padding: 3px 8px 3px 0; text-align: right; }

    // The names stay put while the numbers scroll under them.
    th:first-child, td:first-child {
        position: sticky;
        left: 0;
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
        background: var(--app-surface, #0c1524);
    }

    th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--app-surface, #0c1524);
        color: var(--app-text-dim, #64748b);
        font-weight: 600;
        cursor: pointer;

        &:hover, &.on { color: var(--app-text, #e2e8f0); }
        &:first-child { z-index: 2; }
    }

    tbody tr {
        cursor: pointer;

        &:hover td, &.hot td { background: var(--app-surface-high, #1e293b); }
        &.on td { color: var(--app-accent-hover, #818cf8); }
    }

    .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 5px;
        border-radius: 50%;
    }
}

.met {
    display: block;

    text {
        font-size: 9px;
        fill: var(--app-text-muted, #94a3b8);
        text-anchor: end;
        dominant-baseline: central;
    }

    .met-who { cursor: pointer; }
    .met-who:hover text, .lit text { fill: var(--app-accent-hover, #818cf8); font-weight: 600; }
    .dim { opacity: 0.4; }

    .met-cell {
        fill: #fbbf24;
        cursor: pointer;

        &:hover { fill-opacity: 1; stroke: var(--app-text, #e2e8f0); }
    }
}

.sankey-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.66rem;
    color: var(--app-text-dim, #64748b);
}

.sankey {
    display: grid;
    grid-template-columns: 96px 1fr 96px;
    align-content: start;
}

.sankey-side { position: relative; }

// A place's name, with its bar where the bands meet it.
.sankey-node {
    position: absolute;
    left: 0;
    right: 0;
    padding: 0 5px 0 0;
    border: none;
    border-right: 4px solid;
    background: none;
    overflow: hidden;
    font: inherit;
    font-size: 0.7rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    color: var(--app-text-muted, #94a3b8);
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); }
    .right & { padding: 0 0 0 5px; border-right: none; border-left: 4px solid; text-align: left; }
}

.sankey-bands {
    display: block;
    width: 100%;

    path {
        fill: none;
        stroke-opacity: 0.45;
        vector-effect: non-scaling-stroke;
        transition: stroke-opacity 0.1s;

        &:hover { stroke-opacity: 0.85; }
    }
}
</style>

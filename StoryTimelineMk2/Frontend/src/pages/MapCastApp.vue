<script setup lang="ts">
/**
 * BL-16: the map's cast, in a window of its own so it can live on a second screen. It holds nothing of
 * its own but a search and which sections are folded: the map sends what to show (`CastState`) and this
 * sends back what the reader asked for. See mapCast.ts.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
    PhArrowCounterClockwise, PhArrowsInLineVertical, PhArrowsLeftRight, PhArrowsOutLineVertical, PhCaretRight, PhChartBarHorizontal, PhClock, PhFlowArrow, PhFootprints,
    PhGridNine, PhHandshake, PhMagnifyingGlass, PhMagnifyingGlassMinus, PhMapPin, PhMapPinArea, PhPath, PhPencilSimple, PhQuestion, PhRows, PhSkipBack,
    PhSkipForward, PhSlidersHorizontal, PhSquaresFour, PhTable, PhUser, PhUserFocus, PhUserMinus, PhUserPlus, PhUsers, PhUsersThree,
    PhWaveSine, PhX,
} from '@phosphor-icons/vue'
import CastCharts from '@/components/CastCharts.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import { BackendAPI, type BridgeMessage } from '@/bridge/api'
import { keepOnScreen } from '@/utils/modal'
import {
    clockKey, followSection, isTimed, listSections,
    type CastCommand, type CastGrouping, type CastPerson, type CastPrefs, type CastState, type ChartAsk, type ChartId,
    type ChartState, type WhoAction,
} from '@/utils/mapCast'
import { HEX, ROADS_SHOWN, loadMapCastView, saveMapCastView } from '@/utils/timelinePrefs'

const state = ref<CastState | null>(null)
const tab = ref<'people' | ChartId>('people')
/** The chart whose tab is up, sent by the map only while it is. */
const chart = ref<ChartState | null>(null)
/** What each chart was last asked about, for as long as the window is open. */
const asks: Partial<Record<ChartId, ChartAsk>> = {}
/** Each stretch the time charts were zoomed into, one set for all of them, so Zoom out goes back one. */
const zooms = ref<{ from: number; to: number }[]>([])
/** The stretch they are in now; null is all the map has open. */
const zoom = computed(() => zooms.value.at(-1) ?? null)
/** The tab that is up and what it asks: the map works a chart out only while someone is looking at it. */
function sendTab() {
    const t = tab.value
    send({ kind: 'tab', tab: t, ask: t === 'people' ? undefined : { ...asks[t], ...(isTimed(t) ? zoom.value : null) } })
}
watch([tab, zoom], ([t], [was]) => {
    if (t !== was) chart.value = null
    sendTab()
})
// A zoom is into the story or the range it was dragged across: a different one is all of it again.
watch(() => {
    const c = state.value?.clock
    return c?.from == null ? 'whole' : `${c.from}-${c.at}`
}, () => { zooms.value = [] })
/** A chart asked about a different place, or a different two people. */
function ask(a: ChartAsk) {
    const t = tab.value
    if (t === 'people') return
    asks[t] = a
    sendTab()
}
const error = ref('')
const query = ref('')
/** Sections the reader folded away, by key. */
const closed = ref(new Set<string>())

function failed(what: string, ex: unknown) {
    error.value = `${what}: ${ex instanceof Error ? ex.message : String(ex)}`
    console.error(`[MapCastApp] ${what}`, ex)
}

function send(command: CastCommand) {
    BackendAPI.MapCast(command).catch(ex => failed('Could not reach the map', ex))
}

let stopListening: (() => void) | null = null

/**
 * The map's clock keys work here too, so the story can be stepped from the second screen. Not during a
 * range, where the map ignores them as well, and Space scrolls this list as it always did.
 */
function onKey(e: KeyboardEvent) {
    // Escape backs out of whatever is up: a menu, then one zoom of a time chart.
    if (e.key === 'Escape' && !e.defaultPrevented) {
        if (menu.value || pickAt.value) {
            menu.value = null
            pickAt.value = null
        } else if (zooms.value.length && tab.value !== 'people' && isTimed(tab.value)) zooms.value.pop()
        else return
        e.preventDefault()
        return
    }
    const key = clockKey(e)
    if (!key || !state.value?.timeOn || state.value.clock.from !== null || menu.value || pickAt.value) return
    e.preventDefault()
    // A button left focused by a click would take the space as a press of its own on the way up.
    if (key === ' ' && e.target instanceof HTMLButtonElement) e.target.blur()
    send({ kind: 'key', key })
}

onMounted(() => {
    stopListening = BackendAPI.onHostMessage((m: BridgeMessage) => {
        if (m?.action !== 'MapCast') return
        if (m.payload?.kind === 'state') state.value = m.payload as CastState
        // One sent for the tab before last is too late to show.
        else if (m.payload?.kind === 'chart' && m.payload.chart === tab.value) chart.value = m.payload as ChartState
    })
    window.addEventListener('keydown', onKey)
    // Opened after the map last spoke: ask it to say it again.
    send({ kind: 'hello' })
    void restoreView()
})

onBeforeUnmount(() => {
    stopListening?.()
    window.removeEventListener('keydown', onKey)
})

// ── The search and the folds, kept per timeline ────────────────────────────────

const timelineId = parseInt(new URLSearchParams(location.search).get('timelineId') ?? '0', 10)
let viewTimer = 0
/** Off until the stored view is in, so the empty one it starts with is not saved over it. */
let viewLoaded = false

async function restoreView() {
    const view = await loadMapCastView(timelineId)
    // Typed into before it arrived: what the reader typed wins.
    if (!query.value) query.value = view.query
    closed.value = new Set([...closed.value, ...view.closed])
    viewLoaded = true
}

watch([query, closed], () => {
    if (!viewLoaded) return
    window.clearTimeout(viewTimer)
    viewTimer = window.setTimeout(() => {
        saveMapCastView(timelineId, { query: query.value, closed: [...closed.value] })
            .catch(ex => failed('Could not remember the search and folds', ex))
    }, 500)
})

const everyone = computed(() => state.value?.cast.map(p => p.id) ?? [])
const followCount = computed(() => state.value?.following?.length ?? everyone.value.length)
const isFollowed = (id: string) => !state.value?.following || state.value.following.includes(id)

const sections = computed(() => (state.value ? listSections(state.value, query.value) : []))
const visible = (s: { key: string; label: string; members: CastPerson[] }) =>
    s.label && closed.value.has(s.key) ? [] : s.members

function toggleClosed(key: string) {
    const next = new Set(closed.value)
    if (!next.delete(key)) next.add(key)
    closed.value = next
}

const groupKeys = computed(() => sections.value.filter(s => s.label).map(s => s.key))
const allFolded = computed(() => groupKeys.value.length > 0 && groupKeys.value.every(k => closed.value.has(k)))
/** Any group open folds them all; all folded opens them all. Groups of another grouping keep theirs. */
function foldAll() {
    const keys = new Set(groupKeys.value)
    closed.value = allFolded.value
        ? new Set([...closed.value].filter(k => !keys.has(k)))
        : new Set([...closed.value, ...keys])
}

let paint: CanvasRenderingContext2D | null | undefined
/**
 * What a colour picker can open on: it takes #rrggbb only, and a group's own hue is an hsl(). A canvas
 * reads any CSS colour back as #rrggbb.
 */
function pickerHex(colour: string): string {
    paint ??= document.createElement('canvas').getContext('2d')
    if (!paint) return HEX.test(colour) ? colour : '#94a3b8'
    paint.fillStyle = '#94a3b8'
    paint.fillStyle = colour
    return String(paint.fillStyle)
}

function follow(ids: string[], on: boolean) {
    send({ kind: 'follow', ids: followSection(state.value?.following ?? null, everyone.value, ids, on) })
}

function groupState(members: CastPerson[]): 'all' | 'some' | 'none' {
    const on = members.filter(p => isFollowed(p.id)).length
    return on === members.length ? 'all' : on ? 'some' : 'none'
}

function setGrouping(e: Event) {
    send({ kind: 'group', grouping: (e.target as HTMLSelectElement).value as CastGrouping })
}

// ── The one picked out ─────────────────────────────────────────────────────────

/** Pick someone out on the map, or put the one already picked back among everyone. */
const spot = (id: string | null) => send({ kind: 'spot', id: id && state.value?.spotlight === id ? null : id })
/** Point at someone here and their dot swells on the map. */
const hover = (id: string | null) => send({ kind: 'hover', id })

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Scroll a list just enough to show one of its rows — the list only, never the window round it. */
function reveal(list: HTMLElement | null, row: Element | null | undefined) {
    if (!list || !(row instanceof HTMLElement)) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
}

const listEl = ref<HTMLElement | null>(null)
// Someone clicked on the map: bring their name into view here.
watch(() => state.value?.spotlight, id => {
    if (id) void nextTick(() => reveal(listEl.value, listEl.value?.querySelector(`[data-who="${CSS.escape(id)}"]`)))
})

/** A long list of company is the top dozen until asked for the rest. */
const COMPANY_SHOWN = 12
const allCompany = ref(false)
watch(() => state.value?.detail?.id, () => { allCompany.value = false })
const company = computed(() => {
    const all = state.value?.detail?.company ?? []
    return allCompany.value ? all : all.slice(0, COMPANY_SHOWN)
})

/** The last stop they had reached by the map's clock: the one the stops list keeps in view. */
const nowStop = computed(() => {
    const at = state.value?.clock.at ?? 0
    return state.value?.detail?.stops.reduce((last, s, i) => (s.from <= at ? i : last), -1) ?? -1
})
/** Stops outside the range are faint; with no range, the ones still to come are. */
function faint(s: { from: number; to: number }) {
    const c = state.value!.clock
    return c.from !== null ? s.to < c.from || s.from > c.at : s.from > c.at
}
const stopsEl = ref<HTMLElement | null>(null)
watch([() => state.value?.detail?.id, nowStop], () =>
    void nextTick(() => reveal(stopsEl.value, stopsEl.value?.querySelector('.now'))))

// ── How the window is laid out ─────────────────────────────────────────────────
// Both per machine, like the sidebar widths (see useSideWidth): about the screen, not the story.

const CARD_KEY = 'mapCastCardHeight'
const RANGE_KEY = 'mapCastRangeFolded'
const HELP_KEY = 'mapCastHelpOpen'
/** The card's height, dragged by the strip under it. Null is the default: up to half the window. */
const cardHeight = ref<number | null>(Number(localStorage.getItem(CARD_KEY)) || null)
const cardEl = ref<HTMLElement | null>(null)

function resizeCard(e: PointerEvent) {
    const grip = e.currentTarget as HTMLElement
    const card = cardEl.value
    if (!card) return
    grip.setPointerCapture(e.pointerId)
    const top = card.getBoundingClientRect().top
    // The list below keeps room for a few names.
    const max = card.offsetHeight + ((grip.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 0) - 100
    const move = (m: PointerEvent) => { cardHeight.value = Math.round(Math.max(80, Math.min(max, m.clientY - top))) }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', () => {
        grip.removeEventListener('pointermove', move)
        localStorage.setItem(CARD_KEY, String(cardHeight.value))
    }, { once: true })
}

function resetCard() {
    cardHeight.value = null
    localStorage.removeItem(CARD_KEY)
}

const rangeFolded = ref(localStorage.getItem(RANGE_KEY) === '1')
watch(rangeFolded, f => localStorage.setItem(RANGE_KEY, f ? '1' : '0'))

/** "How to read this" under a chart: opened or folded for every chart at once. */
const helpOpen = ref(localStorage.getItem(HELP_KEY) === '1')
watch(helpOpen, o => localStorage.setItem(HELP_KEY, o ? '1' : '0'))

// ── The right-click menu ────────────────────────────────────────────────────────

const menu = ref<{ x: number; y: number; id: string } | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWho = computed(() => state.value?.cast.find(p => p.id === menu.value?.id) ?? null)

function openMenu(e: MouseEvent, id: string) {
    menu.value = { x: e.clientX, y: e.clientY, id }
    void nextTick(() => menu.value && keepOnScreen(menuEl.value, menu.value))
}

function fromMenu(what: WhoAction | 'toggle') {
    const who = menuWho.value
    menu.value = null
    if (!who) return
    if (what === 'toggle') follow([who.id], !isFollowed(who.id))
    else send({ kind: 'who', what, id: who.id })
}

// ── The charts ─────────────────────────────────────────────────────────────────
// Each has a tab only if the reader ticked it, so the strip stays short; which ones is per machine.

const CHARTS: { id: ChartId; label: string; icon: Component; about: string }[] = [
    { id: 'story', label: 'Storyline', icon: PhRows, about: 'Every place on this map as a row, and each person a line moving between them' },
    { id: 'strips', label: 'Life strips', icon: PhChartBarHorizontal, about: 'A bar per person across time, coloured by where they were' },
    { id: 'heat', label: 'Busy places', icon: PhGridNine, about: 'How many people were at each place, slice by slice of time' },
    { id: 'tables', label: 'Tables', icon: PhTable, about: "Each person's and each place's numbers, sortable" },
    { id: 'met', label: 'Who met whom', icon: PhHandshake, about: 'How often each two were at the same event' },
    { id: 'crowd', label: 'At one place', icon: PhMapPinArea, about: 'One place: how busy it was, and who was there when' },
    { id: 'apart', label: 'How far apart', icon: PhArrowsLeftRight, about: 'The distance between two people over time' },
    { id: 'weave', label: 'Weave', icon: PhWaveSine, about: 'Each person a thread; threads in one band are at one place together' },
    { id: 'sankey', label: 'Flows', icon: PhFlowArrow, about: 'Journeys from place to place, as thick as they were travelled' },
]
/** What "How to read this" says under each chart, with a made-up story to show it. */
const CHART_HELP: Record<ChartId, { how: string; eg: string }> = {
    story: {
        how: 'Each row is a place, top to bottom as they lie on the map. Each person is a line: it runs along a row while they stay, '
            + 'and jumps to another row when they travel. Lines side by side in one row are people there together. '
            + "Click a line or a name to pick that person out, or a place's name to open At one place.",
        eg: "Ada's line runs along the Mill's row from 1203 to 1210, then drops to the Harbour's, where Bo's line joins it.",
    },
    strips: {
        how: 'One strip per person, with time running left to right. Each bar is a stay, coloured by the place; grey is '
            + 'somewhere off this map, and a gap is time on the road. Click a bar to open At one place for that place.',
        eg: "Ada's strip is blue for the Mill until 1210, breaks for the journey, then turns green for the Harbour.",
    },
    heat: {
        how: 'Each row is a place, the busiest at the top, with time running left to right. The brighter a square, the more '
            + 'people were there in that slice of time; point at one for the count and the dates. '
            + "Click a place's name to open At one place.",
        eg: "The Harbour's row is brightest around 1205, when six of the people on the map were there.",
    },
    tables: {
        how: 'The numbers for each person, or each place, over the story, or the range while one is open. Click a heading '
            + 'to sort by it, and again to turn the order round. Click a person to pick them out, or a place to open At one place.',
        eg: 'Sort People by Distance, and Ada comes top with 1,200 miles travelled.',
    },
    met: {
        how: 'Everyone on the map is both a row and a column. A lit square means those two were at the same event at least '
            + 'once, and the brighter, the more often. Read along a row for everyone that person met. '
            + 'Click a square to see how far apart those two were over time.',
        eg: "Ada's row lights up under Bo and Cy, brightest under Bo: Ada met both, and Bo far more often.",
    },
    crowd: {
        how: 'One place, chosen at the top: the busiest, unless you pick another. The bars along the top show how many people '
            + "were there in each slice of time, and below them are each person's visits. Visits that overlap are people there together.",
        eg: "The Mill is busiest around 1206, when Ada's and Bo's visits overlap for two years.",
    },
    apart: {
        how: "Pick two people at the top. The line is the distance between them over time, in the map's own units: high is far "
            + 'apart, and it drops to zero where they are in the same place. A gap means one of them was off this map. '
            + 'Point along the line to read the distance on any date.',
        eg: 'Ada and Bo start 300 miles apart, and the line falls to 0 in 1205 when both reach the Harbour.',
    },
    weave: {
        how: 'Each person is a thread, with time running left to right. Threads inside one shaded band are people at the '
            + "same place, and the place's name is written where its band starts. How high a band sits means nothing: "
            + 'places move up and down to keep the threads from crossing. A thread that bends into another band is someone '
            + 'travelling. Point along a thread to read where that person was; click it or a name to pick them out.',
        eg: "Ada's and Bo's threads run together in the Mill's band from 1200 to 1205, then Bo's bends away into the Harbour's.",
    },
    sankey: {
        how: 'Where people set off from is on the left, and where they arrived on the right. Each band is the journeys between '
            + 'two places, as thick as there were journeys. Point at a band for the numbers; click a place to open At one place.',
        eg: 'A thick band from the Mill to the Harbour: 12 journeys, made by 5 people.',
    },
}
const TIMED_HELP = "Over the whole story, a click on the chart moves the map's clock to that moment. "
    + 'Drag across the chart to zoom in on a stretch of time; Zoom out, at the top, or Escape goes back one step.'

const CHARTS_KEY = 'mapCastCharts'

function loadCharts(): ChartId[] {
    try {
        const ids: unknown = JSON.parse(localStorage.getItem(CHARTS_KEY) ?? '["story"]')
        return CHARTS.map(c => c.id).filter(id => Array.isArray(ids) && ids.includes(id))
    } catch (ex) {
        failed('Could not read which charts had a tab', ex)
        return ['story']
    }
}

const openCharts = ref<ChartId[]>(loadCharts())
watch(openCharts, ids => localStorage.setItem(CHARTS_KEY, JSON.stringify(ids)))
const shownCharts = computed(() => CHARTS.filter(c => openCharts.value.includes(c.id)))
const chartInfo = computed(() => CHARTS.find(c => c.id === tab.value))

/** A tab on or off; its place in the strip is always the same. Taking away the tab that is up goes back to People. */
function toggleChart(id: ChartId) {
    const on = openCharts.value.includes(id)
    openCharts.value = CHARTS.map(c => c.id).filter(c => (c === id ? !on : openCharts.value.includes(c)))
    if (on && tab.value === id) tab.value = 'people'
}

/** A click on something another chart says more about: that chart, about it, its tab added if need be. */
function go(t: ChartId, a: ChartAsk) {
    // Tables, who met whom and flows are over all the map has open, and so is the chart they lead to.
    if (tab.value !== 'people' && !isTimed(tab.value)) zooms.value = []
    if (!openCharts.value.includes(t)) toggleChart(t)
    asks[t] = a
    tab.value = t
}

/** The flyout that picks which charts have a tab. */
const pickAt = ref<{ x: number; y: number } | null>(null)
const pickEl = ref<HTMLElement | null>(null)

function openPick(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    pickAt.value = { x: r.left, y: r.bottom + 2 }
    void nextTick(() => pickAt.value && keepOnScreen(pickEl.value, pickAt.value))
}

// ── The map's settings ─────────────────────────────────────────────────────────

function setPref<K extends keyof CastPrefs>(key: K, value: CastPrefs[K]) {
    send({ kind: 'prefs', prefs: { [key]: value } })
}

const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const ms = (n: number) => n.toFixed(1)
</script>

<template>
    <div class="cast-root">
        <WindowTitleBar title="Who is where" subtitle="Map" />

        <div class="cast-body">
            <p v-if="error" class="cast-flash">
                {{ error }}
                <button class="icon-btn" title="Dismiss" @click="error = ''"><PhX :size="11" /></button>
            </p>

            <p v-if="!state" class="side-note">Waiting for the map…</p>
            <p v-else-if="!state.timeOn" class="side-note">The map's clock is off. Turn on Time to see who is where.</p>

            <template v-else>
                <p class="cast-clock" title="The map's clock"><PhClock :size="13" /> {{ state.clock.text }}</p>

                <div class="cast-tabs" role="tablist">
                    <button role="tab" :aria-selected="tab === 'people'" :class="{ on: tab === 'people' }" @click="tab = 'people'">
                        <PhUsers :size="16" /> People
                    </button>
                    <button
                        v-for="c in shownCharts"
                        :key="c.id"
                        role="tab"
                        :aria-selected="tab === c.id"
                        :aria-label="c.label"
                        :class="{ on: tab === c.id }"
                        :title="`${c.label} — ${c.about}`"
                        @click="tab = c.id"
                    >
                        <component :is="c.icon" :size="18" />
                    </button>
                    <button class="tab-pick" title="Pick which charts have a tab" :aria-expanded="!!pickAt" @click="openPick">
                        <PhSquaresFour :size="15" /> Charts
                    </button>
                </div>

                <template v-if="tab === 'people'">
                <!-- A range, said in words: the map shows the shape, this says the numbers. -->
                <section v-if="state.facts" class="side-block range-block">
                    <button class="side-head fold-head" :aria-expanded="!rangeFolded" @click="rangeFolded = !rangeFolded">
                        <PhCaretRight :size="11" class="fold-caret" :class="{ open: !rangeFolded }" />
                        <PhPath :size="14" /> In this range
                    </button>
                    <template v-if="!rangeFolded">
                    <p v-if="!state.facts.trips" class="side-note">Nobody shown moved between places here.</p>
                    <template v-else>
                        <p class="range-line">
                            {{ state.facts.moved }} {{ state.facts.moved === 1 ? 'person' : 'people' }} travelled,
                            {{ state.facts.trips }} {{ state.facts.trips === 1 ? 'journey' : 'journeys' }}
                            along {{ state.facts.roads }} {{ state.facts.roads === 1 ? 'road' : 'roads' }}
                        </p>
                        <p v-if="state.facts.busiest" class="range-line">
                            Busiest: {{ state.facts.busiest.text }}
                            <span class="pin-count">{{ state.facts.busiest.people }}</span>
                        </p>
                        <p v-if="state.facts.faint" class="side-note">
                            +{{ state.facts.faint }} minor {{ state.facts.faint === 1 ? 'road' : 'roads' }} drawn faint
                        </p>
                        <p v-if="state.facts.parties.length" class="range-line" title="People who made every journey of the range together">
                            Together: {{ state.facts.parties.join(' · ') }}
                        </p>
                    </template>
                    <p v-if="state.facts.stay" class="range-line">
                        Longest stay: {{ state.facts.stay.text }}, {{ state.facts.stay.long }}
                    </p>
                    <p v-for="m in state.facts.meetings" :key="m.text" class="range-line">
                        Met at {{ m.text }} <span class="pin-count">{{ m.n }}</span>
                    </p>
                    </template>
                </section>

                <!-- The one picked out: where they are, where they have been, how far, and with whom. -->
                <section
                    v-if="state.detail"
                    ref="cardEl"
                    class="side-block who-block"
                    :style="cardHeight ? { height: `${cardHeight}px`, maxHeight: 'none' } : undefined"
                >
                    <header class="who-head">
                        <span class="place-dot" :style="{ background: state.detail.colour }" />
                        <span class="who-name">{{ state.detail.name }}</span>
                        <button class="icon-btn" title="Put them back among everyone" @click="spot(null)">
                            <PhX :size="12" />
                        </button>
                    </header>
                    <p class="who-now">{{ state.detail.now.text }}</p>
                    <p v-if="state.detail.now.why" class="side-note">{{ state.detail.now.why }}</p>
                    <p class="range-line">
                        <span class="who-label">{{ state.clock.from !== null ? 'In this range' : 'In all' }}:</span>
                        {{ count(state.detail.trips, 'journey') }}, {{ count(state.detail.places, 'place') }}
                        <template v-if="state.detail.trips">, {{ state.detail.road }} on the road</template>
                        <template v-if="state.detail.distance">, {{ state.detail.distance }}</template>
                    </p>
                    <div v-if="state.detail.company.length" class="who-company">
                        <span class="who-label"><PhUsers :size="12" /> Most often with</span>
                        <button
                            v-for="c in company"
                            :key="c.id"
                            class="chip"
                            :class="{ hot: state.hover === c.id }"
                            :title="`${count(c.n, 'event')} together — pick them out`"
                            @click="spot(c.id)"
                            @mouseenter="hover(c.id)"
                            @mouseleave="hover(null)"
                        >
                            <span class="place-dot" :style="{ background: c.colour }" /> {{ c.name }}
                            <span class="pin-count">{{ c.n }}</span>
                        </button>
                        <button v-if="company.length < state.detail.company.length" class="chip" @click="allCompany = true">
                            +{{ state.detail.company.length - company.length }} more
                        </button>
                    </div>
                    <span class="who-label"><PhMapPin :size="12" /> {{ count(state.detail.stops.length, 'stop') }}</span>
                    <ol ref="stopsEl" class="who-stops">
                        <li v-for="(s, i) in state.detail.stops" :key="i">
                            <button
                                :class="{ now: i === nowStop, faint: faint(s) }"
                                :title="`${s.event} — set the map's clock here`"
                                @click="send({ kind: 'clock', at: s.from })"
                            >
                                <span class="stop-date">{{ s.date }}</span>
                                <span class="stop-place">{{ s.place }}</span>
                                <span class="stop-event">{{ s.event }}</span>
                            </button>
                        </li>
                    </ol>
                </section>
                <!-- Between the card and the list, so the reader decides which gets the room. -->
                <div
                    v-if="state.detail"
                    class="card-grip"
                    title="Drag to resize — double-click for the default"
                    @pointerdown.prevent="resizeCard"
                    @dblclick="resetCard"
                />

                <section class="side-block cast-block">
                    <header class="side-head"><PhFootprints :size="14" /> Who is on the map</header>

                    <p v-if="!state.cast.length" class="side-note">Nobody in this timeline has been anywhere yet.</p>
                    <template v-else>
                        <!-- Opened from one character's timeline: the list is already only who they meet. -->
                        <p v-if="state.focus" class="cast-focus">
                            <PhUserFocus :size="13" />
                            <span class="focus-name">Around {{ state.focus.name || 'that character' }}</span>
                            <button class="icon-btn" title="Show everyone on this timeline" @click="send({ kind: 'unfocus' })">
                                <PhX :size="11" />
                            </button>
                        </p>

                        <div class="search-row">
                            <PhMagnifyingGlass :size="13" class="search-icon" />
                            <input v-model="query" placeholder="Find someone…" />
                            <button v-if="query" class="icon-btn" title="Clear" @click="query = ''">
                                <PhX :size="12" />
                            </button>
                        </div>

                        <div class="cast-tools">
                            <button class="chip" title="Show everyone" @click="send({ kind: 'follow', ids: null })">All</button>
                            <button class="chip" title="Show nobody" @click="send({ kind: 'follow', ids: [] })">None</button>
                            <select :value="state.grouping" class="cast-pick" title="How the list is cut up" @change="setGrouping">
                                <option value="none">Flat list</option>
                                <option value="moving">By who is moving</option>
                                <option value="family">By family</option>
                                <option value="faction">By faction</option>
                            </select>
                        </div>

                        <!-- Above the carets it works on. -->
                        <div class="list-head">
                            <button
                                v-if="state.grouping !== 'none'"
                                class="chip"
                                :title="allFolded ? 'Open every group' : 'Fold every group'"
                                @click="foldAll"
                            >
                                <PhArrowsOutLineVertical v-if="allFolded" :size="12" />
                                <PhArrowsInLineVertical v-else :size="12" />
                                {{ allFolded ? 'Open all' : 'Fold all' }}
                            </button>
                            <p class="side-note">{{ followCount }} of {{ state.cast.length }} on the map</p>
                        </div>

                        <ul ref="listEl" class="cast-list">
                            <template v-for="group in sections" :key="group.key">
                                <li v-if="group.label" class="cast-group-head">
                                    <button
                                        class="icon-btn twisty"
                                        :title="closed.has(group.key) ? 'Show them' : 'Hide them'"
                                        @click="toggleClosed(group.key)"
                                    >
                                        <PhCaretRight :size="11" :class="{ open: !closed.has(group.key) }" />
                                    </button>
                                    <input
                                        type="checkbox"
                                        :checked="groupState(group.members) === 'all'"
                                        :indeterminate="groupState(group.members) === 'some'"
                                        :title="`Show all of ${group.label}`"
                                        @change="follow(group.members.map(p => p.id), groupState(group.members) !== 'all')"
                                    />
                                    <span v-if="group.colour" class="place-dot" :style="{ background: group.colour }" />
                                    <span class="group-name">{{ group.label }}</span>
                                    <template v-if="group.colour">
                                        <!-- The picker itself, unseen over the pencil, so it opens where it was clicked. -->
                                        <label class="icon-btn colour-btn" :title="`Colour ${group.label} on the map and in the relations window`">
                                            <PhPencilSimple :size="11" />
                                            <input
                                                type="color"
                                                :value="pickerHex(group.colour)"
                                                @change="send({ kind: 'colour', group: group.label, colour: valueOf($event) })"
                                            />
                                        </label>
                                        <button
                                            v-if="group.own"
                                            class="icon-btn"
                                            :title="`Give ${group.label} back its own colour`"
                                            @click="send({ kind: 'colour', group: group.label, colour: null })"
                                        >
                                            <PhArrowCounterClockwise :size="11" />
                                        </button>
                                    </template>
                                    <span class="pin-count">{{ group.members.length }}</span>
                                </li>
                                <!-- The box puts them on the map; the name picks them out. -->
                                <li
                                    v-for="who in visible(group)"
                                    :key="who.id"
                                    class="cast-row"
                                    :class="{ nested: !!group.label, on: state.spotlight === who.id, hot: state.hover === who.id }"
                                    :data-who="who.id"
                                    @contextmenu.prevent="openMenu($event, who.id)"
                                    @mouseenter="hover(who.id)"
                                    @mouseleave="hover(null)"
                                >
                                    <input
                                        type="checkbox"
                                        :title="isFollowed(who.id) ? 'Take them off the map' : 'Show them on the map'"
                                        :checked="isFollowed(who.id)"
                                        @change="follow([who.id], !isFollowed(who.id))"
                                    />
                                    <!-- The second click of a double-click is not a second toggle. -->
                                    <button
                                        class="who"
                                        :title="state.spotlight === who.id
                                            ? 'Put them back among everyone — double-click to go to them'
                                            : 'Pick them out on the map — double-click to go to them'"
                                        @click="$event.detail < 2 && spot(who.id)"
                                        @dblclick="send({ kind: 'fly', id: who.id })"
                                    >
                                        <span class="place-dot" :style="{ background: who.colour }" />
                                        {{ who.name }}
                                    </button>
                                </li>
                            </template>
                            <li v-if="!sections.length" class="side-note">Nobody by that name.</li>
                        </ul>
                    </template>
                </section>
                </template>

                <!-- The chart whose tab is up, over the people followed: the range if one is open, else the whole story. -->
                <section v-else-if="chartInfo" class="side-block chart-block">
                    <header class="side-head">
                        <component :is="chartInfo.icon" :size="14" /> {{ chartInfo.label }}
                        <button
                            v-if="zoom && isTimed(chartInfo.id)"
                            class="icon-btn chart-scope zoom-out"
                            :title="zooms.length > 1
                                ? 'Back one step, to the stretch zoomed into before (Escape)'
                                : `Back to ${state.clock.from !== null ? 'the whole range' : 'the whole story'} (Escape)`"
                            @click="zooms.pop()"
                        >
                            <PhMagnifyingGlassMinus :size="12" /> Zoom out
                        </button>
                        <span v-else class="chart-scope">{{ state.clock.from !== null ? 'This range' : 'The whole story' }}</span>
                    </header>
                    <CastCharts
                        :chart="chart"
                        :state="state"
                        :zoomed="!!zoom"
                        @send="send"
                        @ask="ask"
                        @go="go"
                        @zoom="zooms.push($event)"
                        @menu="openMenu"
                    />
                    <details class="chart-help" :open="helpOpen" @toggle="helpOpen = ($event.target as HTMLDetailsElement).open">
                        <summary><PhQuestion :size="13" /> How to read this</summary>
                        <p>{{ CHART_HELP[chartInfo.id].how }}</p>
                        <p v-if="isTimed(chartInfo.id)">{{ TIMED_HELP }}</p>
                        <p class="help-eg"><span>Example</span> {{ CHART_HELP[chartInfo.id].eg }}</p>
                    </details>
                </section>
            </template>
        </div>

        <!-- The map's own settings: set here, they reach the open map at once and are kept per timeline. -->
        <details v-if="state" class="cast-settings">
            <summary><PhSlidersHorizontal :size="13" /> Map settings</summary>
            <label class="set-row" title="How people get from one place to the next on the map">
                <span>Movement</span>
                <select :value="state.prefs.movement" @change="setPref('movement', valueOf($event) as CastPrefs['movement'])">
                    <option value="glide">Glide</option>
                    <option value="trail">Dashed trail</option>
                    <option value="flow">Flowing trail</option>
                    <option value="comet">Comet</option>
                </select>
            </label>
            <label v-if="state.prefs.movement !== 'glide'" class="set-row" title="How far back the trail reaches, as a share of the whole story">
                <span>Trail length (%)</span>
                <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    :value="state.prefs.trail"
                    @change="setPref('trail', Number(valueOf($event)))"
                />
            </label>
            <label class="set-row" title="How much of a journey across several maps is flown">
                <span>Flight</span>
                <select :value="state.prefs.flight" @change="setPref('flight', valueOf($event) as CastPrefs['flight'])">
                    <option value="full">Every level</option>
                    <option value="ends">Ends only</option>
                    <option value="cut">Arrive</option>
                </select>
            </label>
            <label class="set-row" title="Dissolve into the map behind a place while the view flies into it; off cuts instead">
                <span>Descent fade</span>
                <input type="checkbox" :checked="state.prefs.fade" @change="setPref('fade', ($event.target as HTMLInputElement).checked)" />
            </label>
            <label class="set-row" title="In a date range, how many of the busiest roads are drawn in full; the rest are faint">
                <span>Roads shown</span>
                <select :value="state.prefs.roads" @change="setPref('roads', Number(valueOf($event)))">
                    <option v-for="n in ROADS_SHOWN" :key="n" :value="n">{{ n ? `Busiest ${n}` : 'All' }}</option>
                </select>
            </label>
            <label class="set-row" title="In a date range, what the soft disc at each place measures">
                <span>Places show</span>
                <select :value="state.prefs.places" @change="setPref('places', valueOf($event) as CastPrefs['places'])">
                    <option value="time">Time spent</option>
                    <option value="flow">Arrivals vs departures</option>
                </select>
            </label>
            <!-- Debug builds only: what the last frame of a drag cost, to find what is slow. -->
            <p v-if="state.timing" class="side-note timing">
                frame {{ ms(state.timing.frame) }} ms · summary {{ ms(state.timing.sum) }} ms ·
                build {{ ms(state.timing.draw) }} ms · paint {{ ms(state.timing.paint) }} ms
            </p>
        </details>

        <div v-if="menu && menuWho" ref="menuEl" class="map-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
            <p class="menu-title">
                <span class="place-dot" :style="{ background: menuWho.colour }" /> {{ menuWho.name }}
            </p>
            <button @click="fromMenu('sheet')"><PhUser :size="14" /> Open their character sheet</button>
            <hr />
            <!-- The same words as the map's own menu. -->
            <button @click="fromMenu('only')"><PhUserFocus :size="14" /> Show only {{ menuWho.name }}</button>
            <button @click="fromMenu('toggle')">
                <template v-if="isFollowed(menuWho.id)"><PhUserMinus :size="14" /> Hide from the map</template>
                <template v-else><PhUserPlus :size="14" /> Show on the map</template>
            </button>
            <button v-if="state?.following" @click="menu = null; send({ kind: 'follow', ids: null })">
                <PhUsersThree :size="14" /> Show everyone again
            </button>
            <button @click="fromMenu('journey')"><PhPath :size="14" /> Show only their whole journey</button>
            <hr />
            <button :disabled="!menuWho.prev" @click="fromMenu('prev')">
                <PhSkipBack :size="14" /> Their previous appearance
            </button>
            <button :disabled="!menuWho.next" @click="fromMenu('next')">
                <PhSkipForward :size="14" /> Their next appearance
            </button>
        </div>

        <!-- Ticking one gives it a tab; it stays open for ticking several. -->
        <div v-if="pickAt" ref="pickEl" class="map-menu" :style="{ left: `${pickAt.x}px`, top: `${pickAt.y}px` }">
            <p class="menu-title"><PhSquaresFour :size="14" /> Charts with a tab</p>
            <label v-for="c in CHARTS" :key="c.id" :title="c.about">
                <input type="checkbox" :checked="openCharts.includes(c.id)" @change="toggleChart(c.id)" />
                <component :is="c.icon" :size="14" /> {{ c.label }}
            </label>
        </div>
        <div
            v-if="menu || pickAt"
            class="map-menu-backdrop"
            @click="menu = null; pickAt = null"
            @contextmenu.prevent="menu = null; pickAt = null"
        />
    </div>
</template>

<style scoped lang="scss">
// The same look as the map's sidebar it came out of, so the two read as one thing on two screens.
.cast-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-surface, #0c1524);
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
}

.cast-body {
    flex: 1;
    min-height: 0;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.side-block { display: flex; flex-direction: column; gap: 7px; min-height: 0; }

.range-block { flex: 0 0 auto; }

// A zero basis: the list takes what the card leaves. Sized by its content it shared every drag
// with the card, which then moved half as far as the pointer.
.cast-block {
    flex: 1 1 0;

    .cast-list { flex: 1 1 auto; min-height: 0; }
}

.side-head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-dim, #64748b);
}

.icon-btn {
    background: none;
    border: none;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;

    &:hover { color: var(--app-accent-hover, #818cf8); }
}

.side-note { margin: 0; font-size: 0.75rem; font-style: italic; color: var(--app-text-dim, #64748b); }

.cast-flash {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 5px 8px;
    border: 1px solid #7f1d1d;
    border-radius: var(--app-radius-sm, 4px);
    background: #7f1d1d33;
    color: #fca5a5;
    font-size: 0.75rem;

    .icon-btn { margin-left: auto; }
}

.range-line { margin: 0 0 3px; font-size: 0.78rem; }

.pin-count {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--app-text-dim, #4a6080);
}

.place-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
}

.search-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);

    &:focus-within { border-color: var(--app-accent, #6366f1); }

    input {
        flex: 1;
        min-width: 0;
        border: none;
        background: none;
        color: var(--app-text, #e2e8f0);
        font-size: 0.78rem;
        font-family: inherit;
        outline: none;
    }
}

.search-icon { color: var(--app-text-dim, #4a6080); flex-shrink: 0; }

.twisty {
    flex-shrink: 0;

    svg { transition: transform 0.14s; }
    svg.open { transform: rotate(90deg); }
}

.cast-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
}

.cast-list, .who-stops { position: relative; }

.cast-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 2px;
    border-radius: var(--app-radius-sm, 4px);
    font-size: 0.8rem;
    color: var(--app-text, #e2e8f0);

    input { accent-color: var(--app-accent, #6366f1); margin: 0; cursor: pointer; }
    &.nested { padding-left: 15px; }
    // Pointed at here or on the map.
    &.hot { background: color-mix(in srgb, var(--app-accent, #6366f1) 14%, transparent); }

    .who {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover { color: var(--app-accent, #6366f1); }
    }

    &.on .who { color: var(--app-accent-hover, #818cf8); font-weight: 600; }
}

.who-block {
    flex: 0 1 auto;
    max-height: 50%;
    // The stops list gives way first; past its floor, the whole panel scrolls.
    overflow-y: auto;
    padding: 7px 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    gap: 5px;
}

// Sits in the gap between the card and the list, so it costs no room.
.card-grip {
    flex: 0 0 6px;
    margin: -10px 0;
    border-radius: 3px;
    cursor: row-resize;
    touch-action: none;
    transition: background 0.12s ease;

    &:hover, &:active { background: var(--app-accent, #6366f1); }
}

.fold-head {
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); }

    .fold-caret { transition: transform 0.14s; }
    .fold-caret.open { transform: rotate(90deg); }
}

.who-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;

    .who-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.who-now { margin: 0; font-size: 0.8rem; }

.who-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--app-text-dim, #64748b);
}

.who-company {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;

    .who-label { flex-basis: 100%; }
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 2px 7px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text-muted, #94a3b8);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;

    &:hover, &.hot { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    .pin-count { margin-left: 2px; }
}

.who-stops {
    flex: 1 1 auto;
    min-height: 48px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;

    button {
        display: flex;
        gap: 8px;
        width: 100%;
        padding: 2px 4px;
        border: none;
        border-radius: var(--app-radius-sm, 4px);
        background: none;
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.74rem;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;

        &:hover { background: var(--app-surface-high, #1e293b); }
        &.faint { opacity: 0.45; }
        &.now { box-shadow: inset 2px 0 #fbbf24; background: color-mix(in srgb, #fbbf24 10%, transparent); }
    }

    .stop-date { flex-shrink: 0; color: var(--app-text-muted, #94a3b8); font-variant-numeric: tabular-nums; }
    .stop-place { flex-shrink: 0; }
    .stop-event { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--app-text-dim, #64748b); }
}

.cast-tools {
    display: flex;
    align-items: center;
    gap: 4px;

    .cast-pick {
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
}

.cast-focus {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    font-size: 0.74rem;
    color: var(--app-accent, #818cf8);

    .focus-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.cast-group-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 0 1px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--app-text-dim, #64748b);
    user-select: none;

    input { accent-color: var(--app-accent, #6366f1); margin: 0; flex-shrink: 0; }

    .group-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .colour-btn {
        position: relative;
        display: inline-flex;

        input { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; opacity: 0; cursor: pointer; }
    }
}

.list-head {
    display: flex;
    align-items: center;
    gap: 6px;
}

.cast-clock {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    font-size: 0.8rem;
    color: #fbbf24;
}

// People and up to nine chart icons: in a window narrower than they are, the strip scrolls.
.cast-tabs {
    display: flex;
    flex-shrink: 0;
    gap: 1px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    overflow-x: auto;
    scrollbar-width: none;

    button {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        color: var(--app-text-muted, #94a3b8);
        font: inherit;
        font-size: 0.76rem;
        cursor: pointer;

        &:hover { color: var(--app-text, #e2e8f0); }
        &.on { color: var(--app-text, #e2e8f0); border-bottom-color: var(--app-accent, #6366f1); }
    }

    // Not a tab but what changes the tabs, so it looks like a button: outlined in the accent, filled while open.
    .tab-pick {
        align-self: center;
        margin: 0 2px 0 auto;
        padding: 3px 9px;
        border: 1px solid var(--app-accent, #6366f1);
        border-radius: var(--app-radius-sm, 4px);
        color: var(--app-accent-hover, #818cf8);

        &:hover, &[aria-expanded="true"] { background: rgb(99 102 241 / 0.2); color: var(--app-text, #e2e8f0); }
    }
}

.chart-block { flex: 1 1 auto; }

.chart-scope { margin-left: auto; text-transform: none; letter-spacing: 0; }

.zoom-out {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    font: inherit;
    color: var(--app-accent-hover, #818cf8);

    &:hover { color: var(--app-text, #e2e8f0); }
}

// A fold's heading, under the chart and at the foot of the window alike.
.chart-help summary, .cast-settings summary {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--app-text-dim, #64748b);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;

    &:hover { color: var(--app-text, #e2e8f0); }
}

// Under the chart; opened, it takes its room from the chart, and scrolls past a point.
.chart-help {
    flex: 0 0 auto;
    max-height: 40vh;
    overflow-y: auto;
    padding-top: 6px;
    border-top: 1px solid var(--app-border, #2d3a56);
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--app-text-muted, #94a3b8);

    &[open] summary { margin-bottom: 5px; }
    p { margin: 0 0 5px; }

    .help-eg span {
        margin-right: 4px;
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--app-text-dim, #64748b);
    }
}

.cast-settings {
    flex-shrink: 0;
    padding: 6px 10px 8px;
    border-top: 1px solid var(--app-border, #2d3a56);
    font-size: 0.76rem;

    &[open] summary { margin-bottom: 6px; }

    .timing { margin-top: 6px; font-style: normal; font-variant-numeric: tabular-nums; }
}

.set-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;

    span { flex: 1; color: var(--app-text-muted, #94a3b8); }

    select, input[type='number'] {
        width: 150px;
        padding: 2px 4px;
        border: 1px solid var(--app-border, #2d3a56);
        border-radius: var(--app-radius-sm, 4px);
        background: var(--app-bg, #0f172a);
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.74rem;
    }

    input[type='checkbox'] { accent-color: var(--app-accent, #6366f1); margin: 0; }
}

.map-menu {
    position: fixed;
    z-index: var(--z-menu, 9999);
    display: flex;
    flex-direction: column;
    min-width: 195px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    box-shadow: 0 10px 30px -8px rgb(0 0 0 / 70%);
    user-select: none;

    button, label {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 8px;
        border: none;
        border-radius: var(--app-radius-sm, 4px);
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.78rem;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;

        &:hover { background: var(--app-surface-high, #1e293b); }
        &:disabled { opacity: 0.4; cursor: default; background: transparent; }
    }

    input { accent-color: var(--app-accent, #6366f1); margin: 0; }

    .menu-title {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0;
        padding: 5px 8px 3px;
        font-size: 0.78rem;
        font-weight: 600;
    }

    hr {
        margin: 4px 6px;
        border: none;
        border-top: 1px solid var(--app-border, #2d3a56);
    }
}

.map-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-menu-backdrop, 9998);
}
</style>

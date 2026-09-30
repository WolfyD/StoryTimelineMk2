<script setup lang="ts">
/**
 * BL-16: the map window. A picture with places pinned on it, and a pin that has its own map is a
 * door into it — so the world map, the kingdom and the city are the same screen three times, with a
 * trail back up.
 *
 * What the canvas draws is never the upload: the backend derives two capped copies of every map
 * image (`MapViews`) and this page swaps the sharper one in when it is zoomed past the point where
 * the first one would show its pixels. Pins are 0..1 fractions of the image, so none of that moves
 * them and re-uploading a redrawn map at another size keeps every one in place.
 *
 * Time is a mode, not the map: the clock button turns on a scrubber, the places with something going
 * on stay lit while the rest dim, and the characters who were present walk between them. The scrubber
 * reads dates rather than years, steps between the moments something actually happens, and can be
 * opened out into a range that draws every path inside it at once.
 *
 * The map can also be turned. That is one angle for the window and it is never saved, because it is how
 * the reader is holding the map rather than anything about the map — and since Konva's own hit testing
 * goes through the same transform, every drag, pin and handle stays correct at an angle for free.
 *
 * And it can be ruled into lettered squares, so a place has a name a reader can be sent to: `D7`.
 */
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, nextTick, watch, toRaw } from 'vue'
import Konva from 'konva'
import { BackendAPI, type BridgeMessage } from '@/bridge/api'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ImagePickerModal from '@/components/ImagePickerModal.vue'
import EditPlaceModal from '@/components/EditPlaceModal.vue'
import EditMapModal from '@/components/EditMapModal.vue'
import MapInfoPanel from '@/components/MapInfoPanel.vue'
import TimeTrack from '@/components/TimeTrack.vue'
import { useSideWidth } from '@/composables/useSideWidth'
import { useAppTheme } from '@/utils/useAppTheme'
import { mediaUrl } from '@/utils/mediaUrl'
import {
    parentMapIds, pathToMap, hopsBetween, commonMap, flattenMapTree, rowHasChildren, filterMapTree,
    pinStandingFor, flightRoute, rootMaps as mapRoots, foldableAt, foldToDepth, type MapTreeRow,
} from '@/utils/mapTree'
import { scaleBar, distanceInUnits, formatDistance, lockAxis, placeDistance } from '@/utils/mapScale'
import { columnName, gridOf, squareOf } from '@/utils/mapGrid'
import {
    footprintRect, anchoredAt, betweenViews, centredOn, closeScaleFor, descentTransform, fitRectScale,
    throughFootprint, turnedBy, turnedExtent, childAspect, type View,
} from '@/utils/mapFootprint'
import {
    LABEL_LIFT, MAP_LABEL, buildMarker, fitFontSize, labelDesigned, labelLineFrom, labelStartLine,
    markerBox,
} from '@/utils/mapMarker'
import {
    diffMarker, mapMarkerStyle, pinMarkerStyle, resolveMarker, serializeMarker,
} from '@/utils/markerStyle'
import type { MarkerStyle } from '@/utils/markerStyle'
import {
    castAround, castOf, eventSpan, eventsAt, eventsWith, legAt, moments, onTheirTimeline, ongoing, placeStates, stepTo,
    stopsFor, timeSpan, trailFade, type CastStop,
} from '@/utils/mapTime'
import {
    arc, bundleLegs, dwellRadius, fanRadius, leanOf, sideways, strandOffsets, strandWeight, type LegIn,
} from '@/utils/mapPaths'
import { personFacts, summarise, type CompanyStop, type Lane, type RangeSummary } from '@/utils/mapSummary'
import { buildChart, type ChartJob, type ChartWords } from '@/utils/mapCharts'
import { parseCalendarConfig } from '@/utils/calendarDef'
import { categoryColor } from '@/utils/relationsGraph'
import {
    DEFAULT_CALENDAR_CONFIG, buildFormatRegistry, dayOfYearAt, type CalendarFormatConfig,
} from '@/utils/timelineLayout'
import { groupCast, kinGroups, kinNames, type CastGroup } from '@/utils/castGroups'
import {
    clockKey, followSection, type CastCommand, type CastDetail, type ClockKey, type CastGrouping, type CastPrefs, type CastState,
    type CastTiming, type ChartAsk, type ChartId, type ChartState, type RangeFacts, type WhoAction,
} from '@/utils/mapCast'
import { keepOnScreen, placeTip } from '@/utils/modal'
import {
    DEFAULT_TRAIL_PERCENT, HEX, loadGroupColours, loadMapDescentFade, loadMapFlight, loadMapMovementStyle,
    loadMapPlacesShow, loadMapRoadsShown, loadMapTrailLength, saveGroupColours, saveMapDescentFade,
    saveMapFlight, saveMapMovementStyle, saveMapPlacesShow, saveMapRoadsShown, saveMapTrailLength,
    type MapFlightMode, type MapMovementStyle, type MapPlacesShow,
} from '@/utils/timelinePrefs'
import {
    PhMapPin, PhPlus, PhMinus, PhTrash, PhImage, PhCrosshair,
    PhSignIn, PhCaretRight, PhCaretLeft, PhCaretUp, PhCaretDown,
    PhMapTrifold, PhWarning, PhPencilSimple, PhRuler,
    PhMagnifyingGlass, PhX, PhInfo, PhSignOut,
    PhArrowsOutCardinal, PhFrameCorners, PhTextAa, PhCompass, PhCopy, PhDownloadSimple, PhCheck,
    PhClock, PhPlay, PhPause, PhUserFocus, PhUser, PhUserMinus, PhUserPlus, PhUsers,
    PhArrowArcLeft, PhArrowArcRight, PhArrowLineUp, PhGridFour,
    PhPath, PhAirplaneTilt, PhLightning, PhCircleHalf,
    PhSkipBack, PhSkipForward, PhArrowsHorizontal, PhHourglassMedium, PhSlidersHorizontal,
    PhArrowsInLineVertical, PhArrowsOutLineVertical, PhVideoCamera, PhUsersThree,
} from '@phosphor-icons/vue'
import type {
    CharacterItem, CharacterRelationship, RelationshipType,
    MapEvent, MapItem, LocationItem, TimelineItem, MediaItem,
} from '@/types/models'

useAppTheme()

const params = new URLSearchParams(location.search)
const timelineId = parseInt(params.get('timelineId') ?? '0', 10)
const openOnMapId = params.get('mapId')
/** A place to land on, sent by the item editor's "Show on map". */
const openOnLocId = params.get('locationId')
/**
 * Opened from one character's timeline: the cast is cut to the people they were somewhere with.
 * A ref rather than a const because the chip that says so can be dismissed, and because the host
 * points an already-open window at another character the same way it points it at another map.
 */
const focusId = ref(params.get('characterId') || null)

const maps = ref<MapItem[]>([])
const currentId = ref('')
/** The way down here, parent first. Rebuilt on every drill, so the trail is always the real one. */
const trail = ref<string[]>([])
const selectedId = ref<string | null>(null)
const pinItems = ref<TimelineItem[]>([])
const loading = ref(true)
const placing = ref(false)
const showPicker = ref(false)
const editingPin = ref(false)
const editingMap = ref(false)
/** Whether the floating map card is up — remembered per machine, like the sidebar's width. */
const showInfo = ref(localStorage.getItem('mapInfoPanel') !== '0')
/**
 * Whether the things that only drive the map are up: the nav pad and the hint under it. A drawn map is
 * a picture as well as an instrument, and there are moments — showing someone, taking a screenshot,
 * just looking — when every control on it is in the way. The compass and the scale bar are not among
 * them: those are how a map is read, and they stay on it the way they stay on a printed one. Remembered
 * per machine, like the card.
 */
const showChrome = ref(localStorage.getItem('mapChrome') !== '0')
const confirmDelete = ref<{ what: 'map' | 'pin'; name: string } | null>(null)
const { width: sideWidth, startResize } = useSideWidth('mapSideWidth')

/**
 * How wide the clock is, once the reader has pulled it wider or narrower; null is the default. Pulled
 * from its right end with the middle held, so it grows both ways at once. The stylesheet still keeps
 * it clear of the corners however small the window gets, and the wish comes back when it grows again.
 * Per machine, like the sidebar: it is about the monitor, not the story.
 */
const dockWidth = ref<number | null>(Number(localStorage.getItem('mapDockWidth')) || null)
/** Narrower than this and the buttons at either end squeeze the track to nothing. */
const DOCK_MIN = 400

function startDockResize(e: PointerEvent) {
    e.preventDefault()
    const grip = e.currentTarget as HTMLElement
    const dock = grip.closest<HTMLElement>('.map-dock')!
    // The 340 is the corners the stylesheet keeps clear, so pulling stops where the drawing would.
    const room = dock.offsetParent!.clientWidth - 340
    const from = dock.getBoundingClientRect().width
    const x0 = e.clientX
    const move = (m: PointerEvent) => {
        dockWidth.value = Math.round(Math.min(room, Math.max(DOCK_MIN, from + 2 * (m.clientX - x0))))
    }
    grip.setPointerCapture(e.pointerId)
    grip.addEventListener('pointermove', move)
    grip.addEventListener('lostpointercapture', () => {
        grip.removeEventListener('pointermove', move)
        if (dockWidth.value) localStorage.setItem('mapDockWidth', String(dockWidth.value))
    }, { once: true })
}

/**
 * Which on-map edit is running. Nothing on a map moves unless its own mode is on: a reader panning
 * about used to drag a village into the sea, and a modal's "Move on the map" button is the deliberate
 * act that earns the drag. Every mode came from an editor and goes back to it when it finishes.
 */
const mode = ref<null | 'place' | 'footprint' | 'label' | 'compass'>(null)
/** What is said when something failed, for as long as it takes to read. */
const error = ref('')
/** Said for a moment after something worked — a picture copied has no other sign of it. */
const notice = ref('')
let noticeTimer = 0

function say(what: string, ms = 2500) {
    notice.value = what
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => { notice.value = '' }, ms)
}

/** Everything a caught exception knows, in the log, and its point in the window. */
function failed(what: string, ex: unknown) {
    error.value = `${what}: ${ex instanceof Error ? ex.message : String(ex)}`
    console.error(`[MapApp] ${what}`, ex)
}

const current = computed(() => maps.value.find(m => m.Id === currentId.value) ?? null)
const selected = computed(() =>
    current.value?.Locations.find(l => l.Id === selectedId.value) ?? null)
const childMapOf = (pin: LocationItem | null) =>
    pin?.ChildMapId ? maps.value.find(m => m.Id === pin.ChildMapId) ?? null : null
const breadcrumb = computed(() =>
    trail.value.map(id => maps.value.find(m => m.Id === id)?.Name ?? '—'))
/**
 * The map one level up, when there is one: the way out should not depend on a reader working out that
 * the trail along the top is made of buttons.
 */
const upMap = computed(() => {
    const up = trail.value[trail.value.indexOf(currentId.value) - 1]
    return up ? maps.value.find(m => m.Id === up) ?? null : null
})

// ── The list: places, nested through the maps they open into ───────────────────

const collapsed = ref(new Set<string>())
const query = ref('')
const searching = computed(() => !!query.value.trim())

const rootMaps = computed(() => mapRoots(maps.value))
/**
 * A list of places, not of maps: a place with no map of its own is a row like any other, and a place
 * that is a door stands in for the map behind it rather than repeating its name on the next line.
 * A search prunes the same tree to the branches holding a hit, so a tavern is always read as "this
 * city's tavern".
 */
const rows = computed(() => searching.value
    ? filterMapTree(maps.value, query.value)
    : flattenMapTree(maps.value, collapsed.value))

function toggleInfo() {
    showInfo.value = !showInfo.value
    localStorage.setItem('mapInfoPanel', showInfo.value ? '1' : '0')
}

function toggleChrome() {
    showChrome.value = !showChrome.value
    localStorage.setItem('mapChrome', showChrome.value ? '1' : '0')
}

function toggleCollapsed(id: string) {
    const next = new Set(collapsed.value)
    if (!next.delete(id)) next.add(id)
    collapsed.value = next
}

/**
 * Go where something is and put it in the middle: a map, or one place on one. The journey is flown,
 * level by level — an inn three maps down used to arrive as a cut, which told the reader nothing about
 * where in the world it was. The place goes to the journey too, so the last leg ends over it rather than
 * on the whole map with a second move to correct itself.
 */
async function goTo(mapId: string, locId?: string) {
    if (mapId !== currentId.value) await travelTo(mapId, locId)
    if (!locId) return
    await select(locId)
    centreOn(locId)
}

/** The pencil on a row: go to the thing, then open its editor. */
async function editRow(row: MapTreeRow) {
    await goTo(row.map.Id, row.loc?.Id)
    if (row.loc) editingPin.value = true
    else editingMap.value = true
}

/**
 * The enter button, on a place that opens into a map: all the way down to that map, however far away it
 * is, flying every level between here and there. Clicking the row itself does the other thing — the
 * place shown on the map it is pinned to, flown to in the same way and then centred on.
 */
function enterRow(row: MapTreeRow) {
    if (!row.childMap) return
    // Two pins may open the same map, so from the map on screen the flight leaves the one that was
    // clicked rather than whichever the tree happens to name as the way in.
    if (row.loc && row.map.Id === currentId.value) return descend(row.childMap.Id, row.loc)
    return travelTo(row.childMap.Id)
}

// ── Loading ───────────────────────────────────────────────────────────────────

async function reload(keepId = currentId.value) {
    maps.value = await BackendAPI.GetMaps(timelineId) ?? []
    const wanted = maps.value.find(m => m.Id === keepId) ?? rootMaps.value[0] ?? maps.value[0]
    if (wanted && wanted.Id !== currentId.value) {
        currentId.value = wanted.Id
        trail.value = [wanted.Id]
    } else if (wanted) {
        currentId.value = wanted.Id
    } else {
        currentId.value = ''
        trail.value = []
    }
    if (currentId.value) await show(currentId.value, { keepTrail: true })
}

/**
 * The capped copies of a map's picture, waited for once. `GetMaps` already carries the paths of every
 * map whose copies are on disk, so this round trip happens the first time a big picture is opened and
 * never again — a flight through three maps used to stop at each one to ask a question it knew.
 */
async function ensureViews(id: string) {
    const known = maps.value.find(m => m.Id === id)
    if (known?.OverviewPath) return known
    const fresh = await BackendAPI.EnsureMapViews(id)
    if (!fresh) return known
    const at = maps.value.findIndex(m => m.Id === id)
    if (at >= 0) maps.value[at] = fresh
    else maps.value.push(fresh)
    return fresh
}

/**
 * A map's picture, fetched and decoded before anyone asks to see it: the doors on the map being looked
 * at, and every map along a journey about to be flown. A descent then begins on the click rather than
 * on sixteen megabytes of WebP.
 */
async function warmAll(ids: string[]) {
    for (const id of ids) {
        try {
            const map = await ensureViews(id)
            if (map?.OverviewPath) await loadImage(mediaUrl(map.OverviewPath))
        } catch (ex) {
            // Nothing is on screen because of this, so it is logged and not said: going there is what
            // puts the failure in front of the reader, with the same message.
            console.error(`[MapApp] The picture of map ${id} could not be read ahead of time`, ex)
        }
    }
}

/** The maps this one's pins open into — where a reader is most likely to go next. */
const doorsOf = (map: MapItem | null) =>
    (map?.Locations ?? []).map(l => l.ChildMapId).filter((id): id is string => !!id)

/**
 * Switch to a map and draw it. `view` is where the stage has to be the instant it appears, for the
 * flight out — otherwise it opens with the whole map in view, which is where every map starts.
 */
async function show(id: string, opts: { keepTrail?: boolean; view?: (w: number, h: number) => View } = {}) {
    currentId.value = id
    selectedId.value = null
    pinItems.value = []
    placing.value = false
    editingPin.value = false
    editingMap.value = false
    menu.value = null
    // Not the error: one raised on the way here has to stay until it is read and dismissed.
    leaveMode()
    stopPicking()
    if (!opts.keepTrail) {
        const at = trail.value.indexOf(id)
        trail.value = at >= 0 ? trail.value.slice(0, at + 1) : [...trail.value, id]
    }

    try {
        await ensureViews(id)
        await nextTick()
        await drawCurrent(opts.view)
    } catch (ex) {
        // One guard for every way onto a map — a click, a flight, a reload, the host pointing the window
        // somewhere. A picture that will not load has to say so rather than leave an empty canvas, and
        // these callers are all `void`ed or in a template, so a throw here would vanish.
        failed('Could not draw that map', ex)
    }
}

let stopListening: (() => void) | null = null
let stopCastListening: (() => void) | null = null

onMounted(async () => {
    // Before the load, unlike the host's own messages: the cast window can open while it runs and
    // say hello, and a hello nobody heard is a window that stays empty.
    stopCastListening = BackendAPI.onHostMessage(onCastMessage)
    try {
        descentFade.value = await loadMapDescentFade(timelineId)
        flight.value = await loadMapFlight(timelineId)
        movement.value = await loadMapMovementStyle(timelineId)
        trailPercent.value = await loadMapTrailLength(timelineId)
        roadsShown.value = await loadMapRoadsShown(timelineId)
        placesShow.value = await loadMapPlacesShow(timelineId)
        groupColours.value = await loadGroupColours(timelineId)
        maps.value = await BackendAPI.GetMaps(timelineId) ?? []
        events.value = await BackendAPI.GetMapEvents(timelineId) ?? []
        // Only for reading dates back off the scrubber, so a failure here is a worse label and not a
        // map that will not open: the Gregorian default already in the ref stands in.
        try {
            const cal = await BackendAPI.GetTimelineCalendar(timelineId)
            if (cal) calendarCfg.value = parseCalendarConfig(cal.YearDefinition)
        } catch (ex) {
            failed('Could not load the calendar — map dates will read in the default one', ex)
        }
        // Before the scrubber is placed, so it starts at the focus's first event and not their first stop.
        await loadFocus(focusId.value)
        // The scrubber starts at the beginning of the story, so play runs through it.
        if (span.value) now.value = span.value.min
        // Opened from a character, the question is where they went, so the clock is already running.
        if (focusId.value && span.value) timeOn.value = true
        const first = maps.value.find(m => m.Id === openOnMapId) ?? rootMaps.value[0] ?? maps.value[0]
        if (first) {
            trail.value = [first.Id]
            await show(first.Id, { keepTrail: true })
            // Sent here to look at one place: select it and put it in the middle.
            if (openOnLocId) await goTo(first.Id, openOnLocId)
        }
    } finally {
        loading.value = false
    }
    stopListening = BackendAPI.onHostMessage(onBridgeMessage)
})

function onBridgeMessage(data: BridgeMessage) {
    // The host points an already-open window at a map, at a character, or at both, rather than
    // opening a second one.
    if (data?.action !== 'ShowMap') return
    const charId = data.payload?.CharacterId
    // Cleared when there is no character in it: the same window opened again from somewhere that is
    // not a character's timeline is no longer about that character.
    focusId.value = typeof charId === 'string' && charId ? charId : null
    if (focusId.value && span.value) timeOn.value = true

    const mapId = data.payload?.MapId
    if (typeof mapId !== 'string' || !mapId) return
    const locId = data.payload.LocationId
    trail.value = []
    void show(mapId).then(() => typeof locId === 'string' && locId ? goTo(mapId, locId) : undefined)
}

onBeforeUnmount(() => {
    stopListening?.()
    stopCastListening?.()
    window.clearTimeout(castTimer)
    cancelAnimationFrame(summaryFrame)
    pausePlay()
    observer?.disconnect()
    stage?.destroy()
    stage = null
})

// ── Canvas ────────────────────────────────────────────────────────────────────

const stageHost = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let imageNode: Konva.Image | null = null
let pinLayer: Konva.Group | null = null
let marks: Konva.Group | null = null
/** The footprints of the pins that are doors — map coordinates, so they zoom with the picture. */
let plots: Konva.Group | null = null
/** The characters crossing the map, above the pins: a traveller passing a town is in front of it. */
let movers: Konva.Group | null = null
/** A date range's roads and stays, under the pins so a pin at the end of a road is still a pin to click. */
let summary: Konva.Group | null = null
/** The lettered squares, ruled straight onto the picture and under everything else. */
let gridBox: Konva.Group | null = null
/** Set while a descent is in the air: calling it lands immediately on the destination. */
let skipFlight: (() => void) | null = null
let observer: ResizeObserver | null = null
/** What the last frame of a drag cost, for the Debug build's readout in the cast window. */
const cost: CastTiming = { frame: 0, sum: 0, draw: 0, paint: 0 }
/** Map-image pixels: the canvas' own coordinate space, and what a pin's fraction multiplies up by. */
let baseW = 1
let baseH = 1
/** The three of those the overlays need, where Vue can see them change. */
const baseWidth = ref(1)
const baseHeight = ref(1)
const zoom = ref(1)
/**
 * Degrees the map is turned on screen. One angle for the window rather than one per map: it is how the
 * reader is holding the map, not a fact about any map — which is `NorthOffset`, and is saved. Keeping it
 * across a descent is also what makes the flight into a child map seamless while the view is turned.
 */
const viewRot = ref(0)
/** The stage's own size, for the furniture that is placed as a fraction of it. */
const viewW = ref(1)
const viewH = ref(1)
/** Natural width of the copy currently drawn — the swap to the sharper one is measured against it. */
let drawnWidth = 0
let detailShown = false
/** The shift-drag zoom: the rectangle being drawn, and the map point the drag started from. */
let band: Konva.Rect | null = null
let bandFrom: { x: number; y: number } | null = null

function mountStage() {
    const host = stageHost.value
    if (!host || stage) return
    viewW.value = host.clientWidth || 800
    viewH.value = host.clientHeight || 600
    stage = new Konva.Stage({
        container: host,
        width: viewW.value,
        height: viewH.value,
        draggable: true,
    })
    layer = new Konva.Layer()
    imageNode = new Konva.Image({ image: undefined, x: 0, y: 0 })
    pinLayer = new Konva.Group()
    marks = new Konva.Group({ listening: false })
    plots = new Konva.Group()
    // Listening for the heads' own menu; everything under them (roads, rings) is built deaf.
    movers = new Konva.Group()
    gridBox = new Konva.Group({ listening: false })
    summary = new Konva.Group()
    layer.add(imageNode)
    // Ruled onto the picture, so everything a writer put on the map sits on top of the squares.
    layer.add(gridBox)
    layer.add(plots)
    layer.add(summary)
    layer.add(marks)
    layer.add(pinLayer)
    layer.add(movers)
    stage.add(layer)
    if (import.meta.env.DEV) {
        let t0 = 0
        layer.on('beforeDraw', () => { t0 = performance.now() })
        layer.on('draw', () => { cost.paint = performance.now() - t0 })
    }

    stage.on('wheel', e => {
        e.evt.preventDefault()
        // Reaching for the wheel mid-flight means "get me there" — it lands rather than fights.
        if (skipFlight) return skipFlight()
        const pointer = stage!.getPointerPosition()
        if (pointer) zoomAbout(pointer, e.evt.deltaY > 0 ? 0.9 : 1.1)
    })

    // Shift-drag a rectangle and the view zooms until it fills the screen — the shortest way from a
    // continent to one bay. Not while a mode or a measurement is running, where shift already means
    // "keep this line straight".
    stage.on('mousedown', e => {
        if (!e.evt.shiftKey || e.evt.button !== 0) return
        if (picking.value || mode.value || placing.value || !current.value?.OverviewPath) return
        if (skipFlight) return skipFlight()
        const at = imageNode?.getRelativePointerPosition()
        if (!at || !marks) return
        bandFrom = { x: at.x, y: at.y }
        band = new Konva.Rect({
            x: at.x, y: at.y, width: 0, height: 0,
            // Map coordinates, so it stays over the ground it was drawn on, but an unscaled stroke, so
            // the line is one pixel whether the map is at 0.05× or 8×. Its own turn undoes the view's, so
            // the box a reader drags is square to the screen even while the map is held at an angle.
            rotation: -viewRot.value,
            stroke: '#fff', strokeWidth: 1, strokeScaleEnabled: false, dash: [6, 4],
            fill: 'rgba(255, 255, 255, 0.12)', listening: false,
        })
        marks.add(band)
        window.addEventListener('mouseup', endBand, { once: true })
    })

    // The stage pans on a left drag, so a band has to take that drag away from it. Vetoed here rather than
    // by turning `draggable` off and on again: switching it back on makes Konva re-register its own drag
    // listener *behind* ours, so only the very first shift-drag would have won and every one after it
    // panned the map. `dragstart` fires before the stage is moved, so cancelling it moves nothing.
    stage.on('dragstart', e => {
        if (band) stage?.stopDrag()
        // A pin being moved says so here too, on its way up: only the map itself freezes the trails.
        else if (e.target === stage) freezeTrails()
    })
    stage.on('dragend', e => { if (e.target === stage) thawTrails() })

    stage.on('mousemove', () => {
        if (!band || !bandFrom) return
        const at = imageNode?.getRelativePointerPosition()
        if (!at) return
        // The corner stays where the drag began and only the size follows the pointer, in the band's own
        // screen-square frame. Dragging up or left makes that negative, which canvas draws the same either
        // way — and saves normalising a corner that is turned with the map.
        const size = turnedBy(at.x - bandFrom.x, at.y - bandFrom.y, viewRot.value)
        band.size({ width: size.x, height: size.y })
        layer?.batchDraw()
    })

    // A click on the map itself lands a measurement, drops a pin, or clears the selection and whoever
    // was picked out.
    imageNode.on('click', e => {
        if (skipFlight) skipFlight()
        else if (picking.value) addPickPoint(e.evt.shiftKey)
        else if (placing.value) void placePin()
        else {
            selectedId.value = null
            spotlight.value = null
        }
    })

    // Half a measurement: the line follows the pointer, so what is being asked for is visible.
    // ponytail: the shift lock is read off the move, so pressing shift without moving the mouse does
    // not redraw. One pixel of movement fixes it, which is what a hand does anyway.
    stage.on('mousemove', e => {
        if (!picking.value || pickPoints.value.length !== 1) return
        const at = imageNode?.getRelativePointerPosition()
        if (!at) return
        pickHover = lockAxis(pickPoints.value[0]!, at, e.evt.shiftKey)
        drawPickMarks()
    })

    // Nothing on the map itself has a menu of the browser's worth having, so the stage grows its own —
    // and a right-click on the backdrop is about the map, not about any one place.
    stage.on('contextmenu', e => {
        e.evt.preventDefault()
        openMenu(e.evt, '')
    })

    observer = new ResizeObserver(() => {
        if (!stage || !host.clientWidth) return
        viewW.value = host.clientWidth
        viewH.value = host.clientHeight
        stage.width(host.clientWidth)
        stage.height(host.clientHeight)
        stage.batchDraw()
    })
    observer.observe(host)
}

/**
 * Every map picture this window has already decoded. A 2048px copy costs ~16 MB decoded and a second
 * or two of stutter to decode, and a journey passes through the same maps on the way back.
 *
 * ponytail: the last eight, oldest out first — enough for any trail a writer is actually walking, and
 * an LRU is not worth the bookkeeping until someone has more maps open than that at once.
 */
const pictures = new Map<string, Promise<HTMLImageElement>>()
const PICTURE_CACHE = 8

/**
 * A map picture, ready to be drawn without a hitch. The promise is what is kept, so the picture a
 * journey is warming and the one it then asks for are the same single fetch.
 */
function loadImage(url: string) {
    const had = pictures.get(url)
    if (had) return had
    const load = decodePicture(url)
    pictures.set(url, load)
    // A picture that would not load is not remembered as one: asking again should try again.
    void load.catch(() => { if (pictures.get(url) === load) pictures.delete(url) })
    if (pictures.size > PICTURE_CACHE) pictures.delete(pictures.keys().next().value!)
    return load
}

/**
 * `decode()` rather than `onload`, because a picture that has loaded is still decoded on the first
 * frame that draws it — which is exactly the frame a flight starts on, and is what made going into a
 * map feel like it stuck.
 */
async function decodePicture(url: string) {
    const img = new window.Image()
    img.src = url
    try {
        await img.decode()
    } catch (ex) {
        throw new Error(`The map image at ${url} could not be loaded: ${
            ex instanceof Error ? ex.message : String(ex)}`)
    }
    return img
}

async function drawCurrent(view?: (w: number, h: number) => View) {
    const map = current.value
    if (!map?.OverviewPath) {
        // A map with no image of its own must not leave the last one's on the canvas.
        imageNode?.image(undefined)
        pinLayer?.destroyChildren()
        plots?.destroyChildren()
        marks?.destroyChildren()
        gridBox?.destroyChildren()
        layer?.batchDraw()
        return
    }
    mountStage()
    if (!stage || !imageNode) return

    const img = await loadImage(mediaUrl(map.OverviewPath))
    baseW = map.PictureWidth || img.naturalWidth
    baseH = map.PictureHeight || img.naturalHeight
    baseWidth.value = baseW
    baseHeight.value = baseH
    drawnWidth = img.naturalWidth
    detailShown = map.DetailPath === map.OverviewPath
    imageNode.image(img)
    imageNode.size({ width: baseW, height: baseH })
    redrawPins()
    // The squares are this picture's, so they are ruled on with it rather than a tick later.
    drawGrid()
    applyView(view ? view(baseW, baseH) : fitTransform())
    // Where the reader is most likely to go next, decoded while they are still deciding.
    void warmAll(doorsOf(map))
}

/**
 * The sharper copy, brought in once the overview is being stretched past its own pixels. Loaded
 * once and kept: it is the same bitmap the browser has already cached, and swapping back and forth
 * on every scroll tick would only flicker.
 */
async function maybeSwapToDetail() {
    const map = current.value
    if (detailShown || !stage || !imageNode || !map?.DetailPath) return
    if (stage.scaleX() * baseW <= drawnWidth * 1.15) return
    detailShown = true
    const img = await loadImage(mediaUrl(map.DetailPath))
    drawnWidth = img.naturalWidth
    imageNode.image(img)
    layer?.batchDraw()
}

/**
 * The scale at which a map of these dimensions is wholly in view. One definition of "fits" — and it is
 * the *turned* map that has to fit, or pressing Fit on a map held at an angle crops its corners off.
 */
const fitScaleFor = (w: number, h: number) => {
    if (!stage) return 1
    const box = turnedExtent(w, h, viewRot.value)
    return Math.min(stage.width() / box.w, stage.height() / box.h) * 0.96
}

/** The scale at which the whole map is in view. */
const fitScale = () => fitScaleFor(baseW, baseH)

/**
 * How close "looking at a place" is. Four times into the map left the arrival looking at the quarter of
 * the world the place sits in rather than at the place, which is not what anyone means by "show me this
 * on the map"; `closeScaleFor` says how far in this particular picture can go before it is only a
 * bigger blur. The wheel still goes to 12× for anyone who wants the brush strokes.
 */
const closeScale = () => closeScaleFor(fitScale(), Math.max(baseW, baseH))

/** Where the stage sits with one place in the middle of the screen. */
const placeView = (loc: LocationItem, scale: number): View =>
    centredOn(loc.X * baseW, loc.Y * baseH, scale, stage?.width() ?? 0, stage?.height() ?? 0, viewRot.value)

/** Where the stage is standing, as the flights and the turns all want it. */
const currentView = (): View =>
    ({ scale: stage!.scaleX(), x: stage!.x(), y: stage!.y(), rot: stage!.rotation() })

/** The map point under a point of the screen, through whatever the view is doing — turn, zoom and all. */
const mapPointAt = (at: { x: number; y: number }) =>
    stage!.getAbsoluteTransform().copy().invert().point(at)

/**
 * Slide and zoom until a place sits in the middle, so following a search result is a journey rather
 * than a jump cut. Going *into* a place is the descent below, which is a different move.
 */
function centreOn(locId: string) {
    const loc = current.value?.Locations.find(l => l.Id === locId)
    if (!stage || !loc || !current.value?.OverviewPath) return
    // Stay where the view already is if it is closer than this: arriving zoomed in and then being pushed
    // back out to a fixed distance is not what "show me this place" means. (The cap belongs to how close
    // to *go*, not to how close the reader is allowed to already be — outside it, this pulled someone
    // standing at 5× back out to 2× for the crime of asking where something was.)
    const to = placeView(loc, Math.max(stage.scaleX(), closeScale()))
    // The stage is already turned; only the scale and the position are being tweened here.
    // A flight that already landed here has nothing to correct, and 0.4s of tweening to where the stage
    // is standing reads as a hitch at the end of every journey.
    if (Math.abs(to.scale - stage.scaleX()) < 1e-3
        && Math.abs(to.x - stage.x()) < 1 && Math.abs(to.y - stage.y()) < 1) return
    stage.to({
        x: to.x,
        y: to.y,
        scaleX: to.scale,
        scaleY: to.scale,
        duration: 0.4,
        easing: Konva.Easings.EaseInOut,
        onUpdate: scalePins,
        onFinish: () => { scalePins(); void maybeSwapToDetail() },
    })
}

/**
 * Zoom about a point on the stage — the only zoom that does not lose what you were aiming at. The
 * wheel aims at the pointer, the +/− buttons at the middle of the view; the maths is the same.
 */
function zoomAbout(at: { x: number; y: number }, factor: number) {
    if (!stage) return
    const next = Math.min(12, Math.max(0.02, stage.scaleX() * factor))
    // Whatever was under that point stays under it: read the map point off the view as it stands, then
    // build the view that puts it back there. Turned or straight, the sentence is the same one.
    const on = mapPointAt(at)
    applyView(anchoredAt(on.x, on.y, at, next, stage.rotation()))
    void maybeSwapToDetail()
}

/**
 * Letting go of a shift-drag: the rectangle becomes the view. Bound to the window rather than the stage so
 * a drag that finishes past the edge of the canvas still counts.
 */
function endBand() {
    const rect = band
    band = null
    bandFrom = null
    if (!rect) return
    // Sides of the box as the screen sees them — which is what "fits the screen" is about, and what the
    // band was drawn in. The signs only said which way the drag went; the lengths are what is left.
    const w = Math.abs(rect.width())
    const h = Math.abs(rect.height())
    const corner = { x: rect.x(), y: rect.y() }
    const half = turnedBy(rect.width() / 2, rect.height() / 2, -viewRot.value)
    rect.destroy()
    layer?.batchDraw()
    // Measured on screen rather than on the map, so the floor means the same at every zoom: a shift-click
    // or a twitch is not a request to go anywhere.
    if (!stage || !layer || w * zoom.value < 8 || h * zoom.value < 8) return
    // The same limits the wheel has — a box drawn round a doorway cannot zoom further than scrolling to it.
    const scale = Math.min(12, Math.max(0.02, fitRectScale({ x: 0, y: 0, w, h }, stage.width(), stage.height())))
    void fly(
        centredOn(corner.x + half.x, corner.y + half.y, scale, stage.width(), stage.height(), viewRot.value),
        () => void maybeSwapToDetail(),
        0.25,
    )
}

/** The +/− buttons, about the middle of what is on screen. */
const zoomBy = (factor: number) => {
    if (skipFlight) return skipFlight()
    if (stage) zoomAbout({ x: stage.width() / 2, y: stage.height() / 2 }, factor)
}

/** The arrows: a fifth of the view at a time, gliding rather than jumping. */
function panBy(dx: number, dy: number) {
    if (skipFlight) return skipFlight()
    if (!stage) return
    stage.to({
        x: stage.x() + dx * stage.width() * 0.2,
        y: stage.y() + dy * stage.height() * 0.2,
        duration: 0.18,
        easing: Konva.Easings.EaseInOut,
        onUpdate: scalePins,
        onFinish: scalePins,
    })
}

/** Where the stage sits with the whole map in view: where every map opens, and where a flight out ends. */
function fitTransform(): View {
    return centredOn(baseW / 2, baseH / 2, fitScale(), stage?.width() ?? 0, stage?.height() ?? 0, viewRot.value)
}

/**
 * Put the stage somewhere, with everything that has to hear about it. `draw` is false only inside a
 * flight, where the animation draws the layer itself and a second batched draw is a wasted frame on a
 * picture this big.
 */
function applyView(at: View, draw = true) {
    if (!stage) return
    stage.scale({ x: at.scale, y: at.scale })
    stage.rotation(at.rot ?? 0)
    stage.position({ x: at.x, y: at.y })
    // The stage is where the angle really lives; this is the copy the overlays and the rose read.
    viewRot.value = stage.rotation()
    scalePins()
    if (draw) stage.batchDraw()
}

/** The whole map in view, which is where every map starts. */
const fitView = () => applyView(fitTransform())

/**
 * Pins are drawn at a fixed size on screen, so zooming in does not grow them into blobs — and the
 * measurement's end crosses and the footprint handles with them. Everything that moves or scales the
 * view calls this, which makes it the one place the overlays can hear about it from.
 */
function scalePins() {
    if (!pinLayer || !stage) return
    const inverse = 1 / stage.scaleX()
    // Turning the map turns its ground, never its writing: everything held at a fixed size on screen is
    // turned back the other way, so names stay readable and a grip stays square however the map is held.
    // It is also what keeps the editors honest — a drag inside an upright group is still screen pixels.
    const back = -stage.rotation()
    const upright = (n: Konva.Node) => {
        n.scale({ x: inverse, y: inverse })
        n.rotation(back)
    }
    pinLayer.getChildren().forEach(upright)
    // And back again for the names that asked to be part of the ground: a wrapper at the zoom inside a
    // pin group at its inverse is map space, so those names grow with the valley they are written across.
    const scale = stage.scaleX()
    const forward = stage.rotation()
    pinLayer.find(`.${MAP_LABEL}`).forEach((n) => {
        n.scale({ x: scale, y: scale })
        n.rotation(forward)
    })
    marks?.find('.pick-mark').forEach(upright)
    plots?.find('.plot-handle').forEach(upright)
    movers?.find('.cast-mark').forEach(upright)
    summary?.find('.cast-mark').forEach(upright)
    zoom.value = stage.scaleX()
}

// ── Turning the map ────────────────────────────────────────────────────────────

/** One press of a turn button. Fifteen degrees is a step a reader can see and count in. */
const TURN_STEP = 15

/**
 * The view that has the map held at `deg`, turned about the middle of the screen: whatever the reader
 * was looking at stays where they were looking. Turning about the map's own corner would throw the
 * place they are reading off the screen entirely.
 */
function turnedView(deg: number): View | null {
    if (!stage) return null
    const mid = { x: stage.width() / 2, y: stage.height() / 2 }
    const on = mapPointAt(mid)
    return anchoredAt(on.x, on.y, mid, stage.scaleX(), ((deg % 360) + 360) % 360)
}

/** Hold the map at an angle. Nothing is saved: an angle is how the map is held, not what it is. */
function turnViewTo(deg: number) {
    const to = turnedView(deg)
    if (to) applyView(to)
}

const turnViewBy = (step: number) => {
    if (skipFlight) return skipFlight()
    turnViewTo(viewRot.value + step)
}

/** Back to north-up, flown rather than snapped — a jump of 137° tells the reader nothing about where. */
function straighten() {
    if (skipFlight) return skipFlight()
    const to = turnedView(0)
    if (to && stage) void fly(to, () => {}, 0.3)
}

/** The dial in the nav pad. */
const dial = ref<HTMLElement | null>(null)

/** How near north a drag has to come before it is taken as meaning north. Degrees. */
const DIAL_SNAP = 5

/** What the dial reads. 359.6 rounds to 360, which is a number no compass shows. */
const degrees = computed(() => Math.round(viewRot.value) % 360)

/** Where a pointer is about the middle of `box`, clockwise from up, as the screen sees it. */
const aimedAt = (box: DOMRect, ev: PointerEvent) =>
    (Math.atan2(ev.clientX - (box.left + box.width / 2),
                (box.top + box.height / 2) - ev.clientY) * 180 / Math.PI + 360) % 360

/**
 * Drag the dial and the map is held wherever it is pointed — no steps, so a coastline can be laid
 * flat. Near north it snaps, because square is the one angle a reader means *exactly* and no pointer
 * lands on 0.0°. The buttons under it are the same turn in countable steps, and the keyboard's only
 * way in.
 */
function turnDial(e: PointerEvent) {
    if (skipFlight) return skipFlight()
    const box = dial.value?.getBoundingClientRect()
    if (!box) return
    const move = (ev: PointerEvent) => {
        const deg = aimedAt(box, ev)
        turnViewTo(deg < DIAL_SNAP || deg > 360 - DIAL_SNAP ? 0 : deg)
    }
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    move(e)
}

// ── The lettered grid ──────────────────────────────────────────────────────────

/** Whether the squares are being shown. Per window and not saved: it is a reader looking. */
const showGrid = ref(false)

/** The squares over the map on screen, or nothing until there is a picture to rule them onto. */
const grid = computed(() => gridOf(current.value, baseWidth.value, baseHeight.value))

/**
 * The whole grid is **one** node with a `sceneFunc` rather than a few hundred lines and labels.
 *
 * Not for the node count on its own — for what a node count would cost every frame. Lines and text as
 * their own nodes would each need inverse-scaling and counter-rotating on every wheel tick, the way the
 * pins do, and a flight would drag four hundred of them through sixty frames. Drawn here they are
 * arithmetic on a path the canvas already has to walk.
 *
 * It also buys the thing a printed grid cannot do: the label is repeated in every square, so the square
 * a reader has zoomed into names itself instead of leaving them to count columns back to an edge that is
 * off screen. Only the squares actually in view are lettered, so that costs nothing on a fine grid.
 */
function drawGrid() {
    if (!gridBox) return
    gridBox.destroyChildren()
    const g = showGrid.value ? grid.value : null
    if (!g) {
        layer?.batchDraw()
        return
    }

    gridBox.add(new Konva.Shape({
        listening: false,
        sceneFunc: ctx => {
            if (!stage) return
            const zoom = stage.scaleX()
            const deg = stage.rotation()

            ctx.lineWidth = 1 / zoom
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.34)'
            ctx.beginPath()
            for (let c = 0; c <= g.cols; c++) {
                const x = Math.min(c * g.side, g.w)
                ctx.moveTo(x, 0)
                ctx.lineTo(x, g.h)
            }
            for (let r = 0; r <= g.rows; r++) {
                const y = Math.min(r * g.side, g.h)
                ctx.moveTo(0, y)
                ctx.lineTo(g.w, y)
            }
            ctx.stroke()

            // A square too small on screen to hold its own name is left bare rather than smeared over.
            const onScreen = g.side * zoom
            if (onScreen < 34) return
            const size = Math.min(13 / zoom, g.side * 0.3)

            const pad = 4 / zoom
            // The name sits just inside the square's own top-left corner, which on a turned map is not the
            // top-left a reader sees. So the text is laid out *towards* the square rather than always down
            // and to the right: `into` is where the square lies from that corner, once the map is held.
            const into = turnedBy(1, 1, deg)

            const corners = [
                { x: 0, y: 0 }, { x: stage.width(), y: 0 },
                { x: 0, y: stage.height() }, { x: stage.width(), y: stage.height() },
            ].map(mapPointAt)
            const first = (v: number) => Math.max(0, Math.floor(v / g.side))
            const last = (v: number, n: number) => Math.min(n - 1, Math.floor(v / g.side))
            const xs = corners.map(p => p.x)
            const ys = corners.map(p => p.y)

            ctx.font = `600 ${size}px system-ui, sans-serif`
            ctx.textAlign = into.x >= 0 ? 'left' : 'right'
            ctx.textBaseline = into.y >= 0 ? 'top' : 'bottom'
            ctx.fillStyle = 'rgba(248, 250, 252, 0.72)'
            for (let c = first(Math.min(...xs)); c <= last(Math.max(...xs), g.cols); c++) {
                for (let r = first(Math.min(...ys)); r <= last(Math.max(...ys), g.rows); r++) {
                    // The name is printed on the ground but read by a person, so it is turned back
                    // upright about its own corner — the same bargain the pins strike in `scalePins`.
                    ctx.save()
                    ctx.translate(c * g.side + pad, r * g.side + pad)
                    if (deg) ctx.rotate((-deg * Math.PI) / 180)
                    ctx.fillText(`${columnName(c)}${r + 1}`, 0, 0)
                    ctx.restore()
                }
            }
        },
    }))
    layer?.batchDraw()
}

/** Where a place is, as a writer would cite it: `D7`, or nothing while the grid is off. */
const squareFor = (loc: LocationItem) => (showGrid.value ? squareOf(loc.X, loc.Y, grid.value) : '')

// The grid is the map's own and its labels are worked out from the view, so both of those move it.
watch([showGrid, grid], () => drawGrid())

// ── Between maps: the view flies rather than cuts ──────────────────────────────

/** How long one flight between two maps takes. A chain of them shares this out. */
const DESCENT_SECONDS = 0.9

/** Whether the dissolve is wanted on this timeline. */
const descentFade = ref(true)

/** How much of a journey across several maps is actually flown. See `flightRoute`. */
const flight = ref<MapFlightMode>('ends')

/** The three, in the order the button cycles them, most flown first. */
const FLIGHTS: { mode: MapFlightMode; hint: string }[] = [
    { mode: 'full', hint: 'Flying every map between here and there — click for the ends only' },
    { mode: 'ends', hint: 'Flying out of this map and into the last one, jumping the levels between — click to cut straight there' },
    { mode: 'cut', hint: 'Arriving with no flight at all — click to fly every level' },
]
const flightHint = computed(() => FLIGHTS.find(f => f.mode === flight.value)?.hint ?? '')

function cycleFlight() {
    const i = FLIGHTS.findIndex(f => f.mode === flight.value)
    setPrefs({ flight: FLIGHTS[(i + 1) % FLIGHTS.length]!.mode })
}

function toggleFade() {
    setPrefs({ fade: !descentFade.value })
}

/**
 * The map's own settings, from its buttons or from the foot of the cast window: set here, saved per
 * timeline, and the window hears the new values with its next snapshot.
 */
function setPrefs(p: Partial<CastPrefs>) {
    const saved = (what: string) => (ex: unknown) => failed(`Could not save ${what}`, ex)
    if (p.movement !== undefined) {
        movement.value = p.movement
        saveMapMovementStyle(timelineId, p.movement).catch(saved('how people move'))
    }
    if (p.trail !== undefined) {
        trailPercent.value = Math.min(100, Math.max(0, Math.round(p.trail) || 0))
        saveMapTrailLength(timelineId, trailPercent.value).catch(saved('the trail length'))
    }
    if (p.flight !== undefined) {
        flight.value = p.flight
        saveMapFlight(timelineId, p.flight).catch(saved('how far the view flies'))
    }
    if (p.fade !== undefined) {
        descentFade.value = p.fade
        saveMapDescentFade(timelineId, p.fade).catch(saved('the dissolve setting'))
    }
    if (p.roads !== undefined) {
        roadsShown.value = p.roads
        saveMapRoadsShown(timelineId, p.roads).catch(saved('how many roads are shown'))
    }
    if (p.places !== undefined) {
        placesShow.value = p.places
        saveMapPlacesShow(timelineId, p.places).catch(saved('what the places show'))
    }
}

/**
 * The one flight, and the one way out of the air: the promise settles once the stage is at `to`,
 * whether the flight took it there or a wheel, a click or a button cut it short. `land` is the caller's
 * moment to put its own nodes in their final state, so a cut short and a finish look the same.
 *
 * Driven frame by frame rather than by a tween on the stage's own scale, because zoom has to move
 * geometrically to look like anything — `betweenViews` is where that is worked out and tested.
 */
function fly(to: View, land: () => void, secs: number) {
    const from = currentView()
    return new Promise<void>(landed => {
        const flight = new Konva.Animation(frame => {
            const t = Math.min(1, (frame?.time ?? 0) / (secs * 1000))
            const eased = Konva.Easings.EaseInOut(t, 0, 1, 1)
            applyView(betweenViews(from, to, eased, stage!.width(), stage!.height()), false)
            if (t >= 1) skipFlight?.()
        }, layer)
        skipFlight = () => {
            skipFlight = null
            flight.stop()
            applyView(to)
            land()
            layer!.batchDraw()
            landed()
        }
        flight.start()
    })
}

/**
 * Going into a place: the child map is drawn inside its own footprint on the parent, the view flies
 * until that footprint fills the screen, and only then does the page switch to the child — which lands
 * on exactly the frame the flight ended on, so the swap cannot be seen. The dissolve over the parent is
 * the timeline's `map_descent_fade` setting; the flight is not, because a cut into a zoomed-in patch of
 * a map is how a reader loses track of where they are.
 *
 * Anything that cannot be grown from — a parent or child with no picture yet — falls back to the plain
 * switch rather than inventing a rectangle.
 */
async function descend(childId: string, pin: LocationItem, secs = DESCENT_SECONDS) {
    try {
        await flyInto(childId, pin, secs)
    } catch (ex) {
        failed('Could not go into that map', ex)
    }
}

async function flyInto(childId: string, pin: LocationItem, secs: number) {
    const parent = current.value
    if (skipFlight) return
    // A map being seen for the first time may not have its capped copies yet; asking here means the
    // first descent into it flies like every other one instead of falling back to a cut.
    const child = await ensureViews(childId)
    if (!stage || !layer || !parent?.OverviewPath || !child?.OverviewPath) return show(childId)

    const rect = footprintRect(pin, parent, child, baseW, baseH)
    const img = await loadImage(mediaUrl(child.OverviewPath))
    const childW = child.PictureWidth || img.naturalWidth
    const childH = child.PictureHeight || img.naturalHeight
    // The rect's height already follows the child's aspect, so the picture fills it without stretching.
    // It starts invisible either way: the fade brings it in during the flight, and without the fade it
    // appears at the landing, which is the cut the setting means.
    const grown = new Konva.Image({
        image: img, x: rect.x, y: rect.y, width: rect.w, height: rect.h,
        opacity: 0, listening: false,
    })
    layer.add(grown)

    const to = descentTransform(
        rect, childW, childH, fitScaleFor(childW, childH), stage.width(), stage.height(), viewRot.value,
    )
    const fade = descentFade.value
        ? new Konva.Tween({ node: grown, opacity: 1, duration: secs * 0.7 })
        : null
    fade?.play()

    await fly(to, () => { fade?.destroy(); grown.opacity(1) }, secs)

    await show(childId)
    // Destroyed after the child is the map on screen, so there is never a frame of the parent again.
    grown.destroy()
    layer.batchDraw()
}

/**
 * Coming back out: the map on screen shrinks into the patch of ground it takes up on the map above,
 * which opens out around it. The descent backwards — and it starts from wherever the reader had got to
 * rather than from a straightened-up view, so there is nothing to snap before the flight begins.
 *
 * With the dissolve off there is no picture to shrink: the cut has already happened, and what flies is
 * the map above pulling back from the patch the reader was standing on.
 *
 * A map nothing opens into, or a pair with no pictures, has nothing to shrink into and simply arrives.
 *
 * `land` is where to stop instead of the whole map in view, asked for once the map above is on screen so
 * it can be a place on it. Without it the flight pulls all the way out.
 */
async function ascend(parentId: string, secs = DESCENT_SECONDS, land?: () => View | null) {
    try {
        await flyOut(parentId, secs, land)
    } catch (ex) {
        failed('Could not come back out of that map', ex)
    }
}

async function flyOut(parentId: string, secs: number, land?: () => View | null) {
    const child = current.value
    const parent = maps.value.find(m => m.Id === parentId)
    const pin = parent?.Locations.find(l => l.ChildMapId === child?.Id)
    // The bitmap already on the canvas, sharper copy and all — not a second trip for the same picture.
    const picture = imageNode?.image()
    if (skipFlight) return
    if (!stage || !layer || !child?.OverviewPath || !parent?.OverviewPath || !pin || !picture)
        return show(parentId)

    // Where the child is being looked at right now, and how wide it is — both about to be overwritten.
    const seen = currentView()
    const childW = baseW

    // The parent arrives already showing the child's patch of ground exactly as the child was left, so
    // there is no frame of its fit view to snap through: the flight out starts where the reader stood.
    let rect = { x: 0, y: 0, w: 0, h: 0 }
    await show(parentId, { view: (w, h) => {
        rect = footprintRect(pin, parent, child, w, h)
        return throughFootprint(rect, childW, seen)
    } })
    if (!stage || !layer || !rect.w) return

    const shrunk = descentFade.value
        ? new Konva.Image({
            image: picture, x: rect.x, y: rect.y, width: rect.w, height: rect.h,
            listening: false,
        })
        : null
    if (shrunk) layer.add(shrunk)
    const fade = shrunk ? new Konva.Tween({ node: shrunk, opacity: 0, duration: secs * 0.8 }) : null
    fade?.play()

    await fly(land?.() ?? fitTransform(), () => { fade?.destroy(); shrunk?.opacity(0) }, secs)

    shrunk?.destroy()
    layer.batchDraw()
    void maybeSwapToDetail()
}

/**
 * Go to a map the way a reader would walk there: out of the maps between here and the one they share,
 * then down into the ones below it. One hop is the plain flight; several is the same flight repeated,
 * quicker each, so crossing from a tavern to another kingdom still shows where the two of them sit.
 *
 * `endOn` is a place on the destination map that the journey is really about. The last leg out then
 * stops over that place instead of pulling back to the whole map — otherwise the view swings out to the
 * world and is immediately dragged back in on top of the city it just left, which is two moves where the
 * reader asked for one.
 *
 * How many of those hops are flown is the reader's own setting: nine dissolves on the way out to the
 * world map is eight ways of saying "still further", and `flightRoute` is where that is decided.
 *
 * ponytail: a wheel mid-chain lands the hop it is on and the rest still fly — chains are two or three
 * long in practice. Worth a flag only if anyone ever builds six levels deep.
 */
async function travelTo(mapId: string, endOn?: string) {
    if (skipFlight || mapId === currentId.value) return
    const parents = parentMapIds(maps.value)
    const hops = hopsBetween(parents, currentId.value, mapId)
    if (!hops.length) return show(mapId)

    const route = flightRoute(hops, flight.value)
    // Every picture on the route, decoded while the first leg is in the air, so the chain does not stop
    // between levels.
    void warmAll(route.map(h => h.id))
    // Shorter legs the further it is, but by the square root — divided by the count, three levels was
    // three flights too quick to read as flights at all. Only the flown ones take any time.
    const flights = route.filter(h => h.fly).length
    const secs = Math.max(0.35, DESCENT_SECONDS / Math.sqrt(Math.max(1, flights)))
    // Asked for after the last map is on screen, which is the only moment the place is on it.
    const landing = endOn
        ? () => {
            const loc = current.value?.Locations.find(l => l.Id === endOn)
            return loc ? placeView(loc, closeScale()) : null
        }
        : undefined
    for (let i = 0; i < route.length; i++) {
        const { id: next, fly: flying } = route[i]!
        const last = i === route.length - 1
        const here = currentId.value
        if (!flying) {
            // A jumped hop is a switch and nothing else, so the trail is rebuilt from the destination's
            // own root rather than grown a level at a time by the flights that are not happening.
            trail.value = pathToMap(parents, next)
            await show(next, { keepTrail: true })
            continue
        }
        // The tree says which way each hop goes, so a pair of pins pointing at each other cannot make
        // a flight out look like a flight in.
        if (parents.get(here) === next) {
            await ascend(next, secs, last ? landing : undefined)
            continue
        }
        const door = maps.value.find(m => m.Id === here)?.Locations.find(l => l.ChildMapId === next)
        if (door) await descend(next, door, secs)
        else {
            // Two maps under different roots share no ground to fly across: this is an arrival.
            trail.value = pathToMap(parents, next)
            await show(next, { keepTrail: true })
        }
    }
}

function redrawPins() {
    const map = current.value
    if (!pinLayer || !map) return
    pinLayer.destroyChildren()

    for (const loc of map.Locations) {
        // A place moves only while its own "Move on the map" is running: a reader shoving the view
        // about used to drag a village into the sea and save it there.
        const group = new Konva.Group({
            x: loc.X * baseW,
            y: loc.Y * baseH,
            draggable: mode.value === 'place' && loc.Id === modePin.value,
            name: loc.Id,
        })
        // The map says what its places look like and the pin says where it differs; a dashed ring says
        // this one is a door, with another map behind it.
        for (const node of buildMarker(resolveMarker(loc, map), loc.Name, !!loc.ChildMapId)) {
            group.add(node)
        }

        group.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'pointer' })
        group.on('mouseleave', () => { if (stage) stage.container().style.cursor = '' })
        group.on('click', e => {
            e.cancelBubble = true          // not a click on the map underneath
            void select(loc.Id)
        })
        // A menu about this place rather than about the map it is pinned to.
        group.on('contextmenu', e => {
            e.evt.preventDefault()
            e.cancelBubble = true
            void select(loc.Id)
            openMenu(e.evt, loc.Id)
        })
        // Single click selects so a door can be edited at all; entering it is the deliberate act.
        group.on('dblclick', e => {
            e.cancelBubble = true
            if (loc.ChildMapId) void descend(loc.ChildMapId, loc)
        })
        // The footprint is centred on the pin, so it has to travel with it rather than trail behind.
        group.on('dragmove', () => {
            loc.X = group.x() / baseW
            loc.Y = group.y() / baseH
            redrawPlots()
        })
        group.on('dragend', () => {
            loc.X = Math.min(1, Math.max(0, group.x() / baseW))
            loc.Y = Math.min(1, Math.max(0, group.y() / baseH))
            void BackendAPI.SaveLocation(loc)
        })
        pinLayer.add(group)
    }
    redrawPlots()
    // The selection ring and the designer's own line live in this layer too, so both are put back
    // after it is emptied — the ring without its flare, which belongs to the act of selecting.
    drawSelection(false)
    drawDesign()
    paintTime()
    drawCast()
    paintSummary()
    scalePins()
    layer?.batchDraw()
}

/**
 * The footprint of every pin that is a door: the patch of this map the child covers, dashed, with one
 * corner to drag. Its own group, in the map's coordinates, because a footprint is a piece of ground —
 * pins are held at a fixed size on screen and this must not be.
 *
 * ponytail: one corner handle, the smallest thing that can set the column, and the width is all it
 * sets — the height follows the child's shape. If a draw-a-rectangle tool is wanted later, it replaces
 * this function and nothing else; the geometry is in `mapFootprint.ts`.
 */
function redrawPlots() {
    const map = current.value
    if (!plots || !map) return
    plots.destroyChildren()

    for (const loc of map.Locations) {
        const child = childMapOf(loc)
        if (!child) continue
        // A footprint is a setting, not scenery: it is only drawn while its own place is being set,
        // so a map of forty doors is a map and not a quilt of dashed rectangles.
        if (!(mode.value === 'footprint' && loc.Id === modePin.value)) continue
        const rect = footprintRect(loc, map, child, baseW, baseH)
        const colour = loc.Color || '#f59e0b'
        const aspect = childAspect(child)
        let w = rect.w

        // A wash inside it, because a dashed line alone disappeared into a busy map — the patch reads
        // as a patch, and the outline gets its full strength back instead of being dimmed to 60%.
        const box = new Konva.Rect({
            x: rect.x, y: rect.y, width: rect.w, height: rect.h,
            fill: '#0f172a4d',
            stroke: colour, strokeWidth: 1.5, dash: [7, 6],
            strokeScaleEnabled: false, listening: false,
        })
        plots.add(box)

        // Scaled about its own centre by `scalePins`, so it stays a grip rather than becoming a slab.
        const handle = new Konva.Rect({
            x: rect.x + rect.w, y: rect.y + rect.h,
            width: 9, height: 9, offsetX: 4.5, offsetY: 4.5,
            fill: colour, stroke: '#0f172a', strokeWidth: 1.5,
            name: 'plot-handle', draggable: true,
        })

        const place = () => {
            const h = w * aspect
            const x = loc.X * baseW - w / 2
            const y = loc.Y * baseH - h / 2
            box.setAttrs({ x, y, width: w, height: h })
            handle.position({ x: x + w, y: y + h })
        }

        handle.on('mouseenter', () => {
            if (stage) stage.container().style.cursor = 'nwse-resize'
        })
        handle.on('mouseleave', () => { if (stage) stage.container().style.cursor = '' })
        // Only the width is dragged: the corner follows the child's own proportions back to the pin.
        handle.on('dragmove', () => {
            w = Math.min(baseW, Math.max(baseW * 0.004, 2 * Math.abs(handle.x() - loc.X * baseW)))
            place()
        })
        handle.on('dragend', () => {
            loc.FootprintW = w / baseW
            place()
            layer?.batchDraw()
            void BackendAPI.SaveLocation(loc)
        })

        plots.add(handle)
    }
    scalePins()
}

/**
 * A ring round the place that is selected: a flare that says which one was just picked, then a steady
 * circle that keeps saying it. Both live inside the pin's own group, so they are held at a fixed size
 * on screen and travel with a pin that is being moved.
 */
function drawSelection(flare = true) {
    if (!pinLayer) return
    pinLayer.find('.sel-ring').forEach(n => n.destroy())
    const map = current.value
    const loc = map?.Locations.find(l => l.Id === selectedId.value)
    const group = loc ? pinLayer.findOne<Konva.Group>(`.${loc.Id}`) : null
    if (!map || !loc || !group) return

    const box = markerBox(resolveMarker(loc, map), !!loc.ChildMapId)
    const rest = Math.max(box.w, box.h) / 2 + 7
    const ring = new Konva.Circle({
        y: box.y + box.h / 2, radius: rest,
        stroke: '#ffffff', strokeWidth: 2, strokeScaleEnabled: false,
        shadowColor: '#0f172a', shadowBlur: 4,
        listening: false, name: 'sel-ring',
    })
    group.add(ring)
    // The flare is a second ring that gets out of the way: it grows out of the first and fades, which
    // is a moment of movement rather than something else left on the map to read.
    if (flare) {
        const glow = ring.clone({ strokeWidth: 3 }) as Konva.Circle
        group.add(glow)
        glow.to({
            radius: rest * 2.6, opacity: 0, duration: 0.45,
            easing: Konva.Easings.EaseOut, onFinish: () => glow.destroy(),
        })
    }
    layer?.batchDraw()
}

// Selecting does not rebuild the pins, so the ring is drawn on its own — and put back by every redraw.
watch(selectedId, () => drawSelection())

// ── The moment the map is showing ──────────────────────────────────────────────

/**
 * Everything in this timeline that happened somewhere, loaded once: the scrubber reads it a moment at
 * a time and asking the backend per frame would be absurd.
 */
const events = ref<MapEvent[]>([])
/** Whether the map is showing one moment rather than all of time. Off is the plain map. */
const timeOn = ref(false)
/**
 * Where the scrubber is, as a timeline absolute — the year with the sub-year part in it. A whole year
 * is too coarse to be the unit here: someone can be in six places in one, and a year-wide scrubber
 * stacks all six on one tick and calls it standing still.
 */
const now = ref(0)
const playing = ref(false)
/**
 * Moments a second while it plays — see `moments`. Shown as a multiple of the default rather than as
 * "2/s", which nobody reading it knew was a count of happenings and not of years.
 */
const speed = ref(2)
const SPEEDS = [
    { v: 0.5, name: '¼×' }, { v: 1, name: '½×' }, { v: 2, name: '1×' }, { v: 4, name: '2×' }, { v: 8, name: '4×' },
]

/**
 * The relations web, fetched the first time a reader asks for family or faction, or opens the map from
 * a character's timeline. A hundred and fifty characters and everything between them is a real
 * payload, and most map opens never want it.
 */
const web = ref<{
    Characters: CharacterItem[]
    Relations: CharacterRelationship[]
    Types: RelationshipType[]
} | null>(null)
let fetchingWeb = false

async function ensureWeb() {
    if (web.value || fetchingWeb) return
    fetchingWeb = true
    try {
        web.value = await BackendAPI.GetTimelineRelations(timelineId) ?? null
    } catch (ex) {
        failed('Could not load who is related to whom', ex)
    } finally {
        fetchingWeb = false
    }
}

/**
 * What the scrubber runs along: everything, or — opened from one character's timeline — what that
 * timeline shows, so its ends are its first and last event and every tick is one of them.
 *
 * Someone with nothing on their timeline placed anywhere gets the whole timeline instead: an empty
 * scrubber would lock Time off, and with it the cast window where the focus is dismissed.
 */
const clockEvents = computed(() => {
    const id = focusId.value
    const theirs = id
        ? onTheirTimeline(events.value, id, focusLinks.value, web.value?.Characters ?? [], web.value?.Relations ?? [])
        : []
    return theirs.length ? theirs : events.value
})

/** Every item the focus is linked to, mentioned ones included — what their timeline is made of. */
const focusLinks = ref<ReadonlySet<string>>(new Set())

async function loadFocus(id: string | null) {
    focusLinks.value = new Set()
    if (!id) return
    try {
        // The web brings the family, whose births and deaths are on the timeline too.
        const [links] = await Promise.all([BackendAPI.GetCharacterAppearances(id), ensureWeb()])
        // A second character asked for while this one loaded is the one that counts.
        if (focusId.value === id) focusLinks.value = new Set((links ?? []).map(l => l.ItemId))
    } catch (ex) {
        failed('Could not load what is on their timeline — the time bar shows only where they were', ex)
    }
}

watch(focusId, id => void loadFocus(id))
const span = computed(() => timeSpan(clockEvents.value))
/** Every instant where something starts or stops: what ⏮ and ⏭ walk, and what play runs along. */
const beats = computed(() => moments(clockEvents.value))

/**
 * A date range rather than a single date: the second handle, and whether it is out at all. Off, the
 * map answers for one instant; on, it answers for everything between the two handles, which is how
 * you see a campaign as a shape instead of as a dot that moves while you watch.
 *
 * `now` is the far handle, so the range grows backwards from wherever the scrubber already was and
 * nobody has to set two dates to see anything.
 */
const rangeOn = ref(false)
const rangeFrom = ref(0)

// A new character moves the scrubber's ends, and a handle left outside them would be off the track.
watch(span, at => {
    if (!at) return
    now.value = Math.min(Math.max(now.value, at.min), at.max)
    rangeFrom.value = Math.min(Math.max(rangeFrom.value, at.min), now.value)
})

/**
 * The window the map is showing: one instant normally, and back to the near handle while a date range
 * is open. Everything that answers "what is going on" reads this rather than `now`, so the range costs
 * one definition instead of a branch in each of them.
 */
const window0 = computed(() => rangeOn.value ? Math.min(rangeFrom.value, now.value) : now.value)

/**
 * How much of the whole story something has to cover before it stops being an event and becomes the
 * age it happens inside. A share rather than a count of years, the same way the trail length is, so a
 * chronicle of three millennia and a story told over a fortnight both get a backdrop — a fixed number
 * of years would make the whole of the second one an age and none of the first.
 */
const LONG_SHARE = 0.05

/**
 * That share as an actual length of time, which is what `mapTime` wants. Of the whole story even when the
 * scrubber is one character's: whether a war is an age is a fact about the world, not about who is watching.
 */
const longEnough = computed(() => {
    const at = timeSpan(events.value)
    return at ? (at.max - at.min) * LONG_SHARE : 0
})

/** The places with something going on and how loudly, or null when time is not being shown at all. */
const lit = computed(() => timeOn.value
    ? placeStates(events.value, window0.value, now.value, longEnough.value)
    : null)

/**
 * The ages, reigns and wars in force right now, anywhere — not only on the map in front of the reader,
 * because an age is a fact about the world and not about the patch of it being looked at.
 */
const backdrop = computed(() => timeOn.value
    ? ongoing(events.value, window0.value, now.value, longEnough.value)
    : [])

/** How many of them the strip names before it gives up and counts the rest. */
const BACKDROP_SHOWN = 3
const backdropNames = computed(() => backdrop.value.slice(0, BACKDROP_SHOWN).map(ev => ev.Title))
const backdropMore = computed(() => Math.max(0, backdrop.value.length - BACKDROP_SHOWN))
/** What is happening on the map in front of the reader, for the strip to count. */
const happeningHere = computed(() => {
    const here = current.value
    if (!here || !timeOn.value) return []
    return eventsAt(events.value, window0.value, now.value).filter(ev => ev.MapId === here.Id)
})
/** Which of the selected place's items those are, for its list to light them. */
const nowIds = computed(() => new Set(happeningHere.value.map(ev => ev.ItemId)))
/** The selected place's items on the clock, for a click in its list to go to. */
const pinEvents = computed(() =>
    new Map(events.value.filter(ev => ev.LocationId === selectedId.value).map(ev => [ev.ItemId, ev])))

/**
 * The timeline's own calendar, for turning an absolute back into a date a reader recognises. Loaded
 * with the maps; the Gregorian default stands in until it arrives, and for a timeline with no
 * calendar of its own.
 */
const calendarCfg = ref<CalendarFormatConfig>(DEFAULT_CALENDAR_CONFIG)
const dateFormat = computed(() => buildFormatRegistry(calendarCfg.value))

/**
 * An absolute as a date. A position on a year boundary is just the year — a story written in whole
 * years reads exactly as it always has — and anything inside one names its day, because that is the
 * only way two councils a week apart look like two different moments.
 */
function dateOf(at: number): string {
    const { year, day } = dayOfYearAt(at, calendarCfg.value)
    return day === 0 && Math.abs(at - year) < 1e-9 ? `${year}` : `${dateFormat.value.DAYS!(year, day)} ${year}`
}

/**
 * The widest the date can read, stacked unseen under it so its button is always that wide: a label
 * that grows and shrinks as it moves shoved the whole track sideways under the hand dragging it.
 *
 * Each month on its last day, because month names differ in width and the last day has the most
 * digits; and both ends' years, because every year between is no longer than the longer of them.
 */
const dateSizers = computed(() => {
    const at = span.value
    if (!at) return []
    const { months, yearLength } = calendarCfg.value
    const lastDays = months.length
        ? months.map((_, i) => (months[i + 1]?.startDay ?? yearLength) - 1)
        : [yearLength - 1]
    const years = [Math.floor(at.min), Math.floor(at.max)]
    return [...new Set(years.flatMap(y => lastDays.map(d => `${dateFormat.value.DAYS!(y, d)} ${y}`)))]
})

/** One day of the calendar, as a fraction of a year: what one nudge of the scrubber is worth. */
const oneDay = computed(() => 1 / Math.max(1, calendarCfg.value.yearLength))

/** How much of a pin is left when its place has nothing going on: enough to see, not enough to read. */
const DIMMED = 0.28

function toggleTime() {
    timeOn.value = !timeOn.value
    dateEdit.value = null
    if (!timeOn.value) pausePlay()
    paintTime()
}

/**
 * ⏮ / ⏭: to the next instant where something actually changes, however far off that is.
 *
 * ponytail: every moment on the scrubber, not only the ones on this map or belonging to the people
 * being followed. "The next thing that happens" is the honest reading of the button, and narrowing it
 * would make it skip past a map the reader is about to be flown to. Filter `beats` by the followed
 * cast if watching one person's journey turns out to want it. (A character's own timeline already
 * narrows the scrubber to them — see `clockEvents`.)
 */
function step(dir: 1 | -1) {
    // A second press while the first is still on its way counts on from where that one is going, or
    // two quick presses would both land on the same moment.
    const from = glideGoal ?? now.value
    pausePlay()
    const to = stepTo(beats.value, from, dir)
    if (to !== null) glideTo(to, STEP_MS, true)
}

/** How long one ⏮ / ⏭ takes to get there: long enough to see who went where, short enough to click on. */
const STEP_MS = 420

/**
 * The clock itself is what moves, not the heads: every frame of the way is a real date, so the trail
 * grows, the rings light and the count changes in step with the people walking — a tween on the heads
 * alone would carry them to a moment the rest of the map had already jumped to.
 */
let glideFrame = 0
/** Where the running glide ends, so a step pressed mid-way counts from there. */
let glideGoal: number | null = null

function stopGlide() {
    cancelAnimationFrame(glideFrame)
    glideFrame = 0
    glideGoal = null
}

/** `now` to `to` over `ms`, eased at both ends for a step, even for a hop of play so hops run on. */
function glideTo(to: number, ms: number, eased: boolean, then?: () => void) {
    stopGlide()
    const from = now.value
    const t0 = performance.now()
    glideGoal = to
    const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms)
        const e = !eased ? k : k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2
        now.value = from + (to - from) * e
        if (k < 1) { glideFrame = requestAnimationFrame(tick); return }
        glideFrame = 0
        glideGoal = null
        then?.()
    }
    glideFrame = requestAnimationFrame(tick)
}

/**
 * Play walks the moments rather than the years. A story told over three millennia has no watchable
 * speed in years a second — a century of empty scrubbing is a century of nothing moving — and one
 * told over a fortnight would be over before the first frame. Every stop is a stop worth seeing, and
 * the road between two of them is walked rather than jumped.
 *
 * Changing the speed mid-play needs nothing: each hop reads it as it sets off.
 */
function startPlay() {
    if (!beats.value.length) return
    // Pressing play at the end starts again rather than doing nothing.
    if (stepTo(beats.value, now.value, 1) === null) now.value = beats.value[0]!
    playing.value = true
    hop()
}

function hop() {
    const to = playing.value ? stepTo(beats.value, now.value, 1) : null
    if (to === null) { pausePlay(); return }
    glideTo(to, 1000 / speed.value, false, hop)
}

function pausePlay() {
    playing.value = false
    stopGlide()
}

/** A modal up: the story holds still under it, and its keys are the modal's. */
const modalOpen = computed(() => editingPin.value || editingMap.value || !!confirmDelete.value || showPicker.value)
watch(modalOpen, open => { if (open) pausePlay() })

/**
 * The date being typed in, in the pieces the calendar has: day of the month, month, year. `which` is
 * the handle it goes to, so either end of a window can be typed.
 */
const dateEdit = ref<{ which: 'at' | 'from'; day: number; month: number; year: number } | null>(null)

/** Months as day ranges; a calendar with none is one long month the length of the year. */
const monthStarts = computed(() => {
    const months = calendarCfg.value.months
    return months.length ? months.map(m => m.startDay) : [0]
})

/** Days in the month being typed, for the day box's upper limit. */
const dateEditDays = computed(() => {
    const m = dateEdit.value?.month ?? 0
    return (monthStarts.value[m + 1] ?? calendarCfg.value.yearLength) - (monthStarts.value[m] ?? 0)
})

function openDateEdit(which: 'at' | 'from') {
    const { year, day } = dayOfYearAt(which === 'at' ? now.value : window0.value, calendarCfg.value)
    let month = 0
    monthStarts.value.forEach((start, i) => { if (start <= day) month = i })
    dateEdit.value = { which, year, month, day: day - monthStarts.value[month]! + 1 }
    // The year is what gets typed most, and a box that needs a second click to type in is a speed bump.
    void nextTick(() => yearInput.value?.select())
}

const yearInput = ref<HTMLInputElement | null>(null)

/** Off to the typed date — gliding, like a step, so it reads as going there rather than appearing. */
function applyDate() {
    const edit = dateEdit.value
    const at = span.value
    if (!edit || !at) return
    const day = Math.min(Math.max(1, Math.round(edit.day) || 1), dateEditDays.value)
    const abs = Math.round(edit.year || 0)
        + ((monthStarts.value[edit.month] ?? 0) + day - 1) / Math.max(1, calendarCfg.value.yearLength)
    const to = Math.min(Math.max(abs, at.min), at.max)
    if (to !== abs) say(`The story runs ${dateOf(at.min)} – ${dateOf(at.max)}, so that is as far as it goes.`, 4000)
    dateEdit.value = null
    pausePlay()
    if (edit.which === 'from') {
        rangeFrom.value = Math.min(to, now.value)
        return
    }
    if (rangeOn.value) {
        // The far end cannot go behind the near one; pushed past it, the window moves with it.
        rangeFrom.value = Math.min(rangeFrom.value, to)
        now.value = to
        return
    }
    glideTo(to, STEP_MS, true)
}

/**
 * The clock's keys while it is showing: Space plays and pauses, ← and → step. Never while typing, under
 * a modal or a menu, and a focused handle keeps the arrows for itself (`TimeTrack`).
 */
function onTimeKey(e: KeyboardEvent) {
    const key = clockKey(e)
    if (!key || !timeOn.value || rangeOn.value || modalOpen.value || menu.value) return
    if (key === ' ' && e.target instanceof HTMLButtonElement) {
        // Tabbed to, a button is being pressed with the space. Clicked, it only kept the focus, and would
        // take the space as a second press of its own on the way up — the Time button turning time off.
        if (e.target.matches(':focus-visible')) return
        e.target.blur()
    }
    e.preventDefault()
    timeKey(key)
}

/** Escape backs out of whatever is open on the map, nearest first. A modal handles its own. */
function onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || modalOpen.value) return
    if (menu.value) menu.value = null
    else if (dateEdit.value) dateEdit.value = null
    else if (picking.value) stopPicking()
    else if (placing.value) placing.value = false
    // Finish rather than throw away: what was dragged is already saved, and a label keeps its design.
    else if (mode.value) void finishMode()
    else return
    e.preventDefault()
}
window.addEventListener('keydown', onEscape)
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))

/** What the clock's keys do, pressed here or in the cast window. */
function timeKey(key: ClockKey) {
    if (key !== ' ') step(key === 'ArrowLeft' ? -1 : 1)
    else if (playing.value) pausePlay()
    else startPlay()
}
window.addEventListener('keydown', onTimeKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onTimeKey))
// `rangeOn` is in here for its own sake: opening the range changes how the trail is drawn even in the
// case where it happens to leave both ends of the window where they already were.
watch([now, window0, rangeOn], () => {
    const t0 = performance.now()
    paintTime()
    paintCast()
    cost.frame = performance.now() - t0
    void chaseCast()
})

/** Ages drawn round one pin before the rest are only counted. */
const AGE_RINGS = 3

/**
 * The moment, on the map. Pins are not rebuilt for it — a scrubber being dragged would rebuild every
 * one of them sixty times a second — so this sets only what the clock owns: the dimming, an amber ring
 * round the places where something is happening, and a filling ring for each age running there.
 * `redrawPins` calls it after building them.
 */
function paintTime() {
    const map = current.value
    if (!pinLayer || !map) return
    pinLayer.find('.lit-ring').forEach(n => n.destroy())
    const ages = new Map<string, MapEvent[]>()
    for (const ev of backdrop.value) ages.set(ev.LocationId, [...ages.get(ev.LocationId) ?? [], ev])
    for (const loc of map.Locations) {
        const group = pinLayer.findOne<Konva.Group>(`.${loc.Id}`)
        if (!group) continue
        const state = lit.value?.get(loc.Id)
        group.opacity(!timeOn.value || state ? 1 : DIMMED)
        if (!state) continue
        const box = markerBox(resolveMarker(loc, map), !!loc.ChildMapId)
        const y = box.y + box.h / 2
        const r = Math.max(box.w, box.h) / 2 + 4
        // Amber and glowing is "something is happening here". An age is not: the city inside a war
        // that covers a third of the story is not on fire for that third, and an alarm that never
        // goes off is one nobody reads. The glow is a gradient band rather than a shadow blur, which is
        // worked out afresh on every frame of a drag.
        if (state === 'loud') group.add(
            new Konva.Ring({
                y, innerRadius: r - 4, outerRadius: r + 8,
                fillRadialGradientStartRadius: r - 4, fillRadialGradientEndRadius: r + 8,
                fillRadialGradientColorStops: [0, 'rgba(251, 191, 36, 0)', 1 / 3, 'rgba(251, 191, 36, 0.5)', 1, 'rgba(251, 191, 36, 0)'],
                listening: false, name: 'lit-ring',
            }),
            new Konva.Circle({
                y, radius: r, stroke: '#fbbf24', strokeWidth: 2, strokeScaleEnabled: false,
                listening: false, name: 'lit-ring',
            }),
        )
        // An age is a ring in its own colour that fills clockwise from its start to its end: there
        // means running, how full is how far through, and it is gone once it is over. Earliest innermost.
        const here = ages.get(loc.Id) ?? []
        here.slice(0, AGE_RINGS).forEach((ev, i) => {
            const inner = r + 3 + i * 4
            const { from, to } = eventSpan(ev)
            const through = Math.min(1, Math.max(0, (now.value - from) / Math.max(to - from, 1e-9)))
            const colour = ev.Color || '#94a3b8'
            group.add(new Konva.Ring({ y, innerRadius: inner, outerRadius: inner + 2.5, fill: colour, opacity: 0.2, listening: false, name: 'lit-ring' }))
            group.add(new Konva.Arc({ y, innerRadius: inner, outerRadius: inner + 2.5, angle: 360 * through, rotation: -90, fill: colour, listening: false, name: 'lit-ring' }))
        })
        if (here.length > AGE_RINGS) {
            const outer = r + 3 + AGE_RINGS * 4
            group.add(new Konva.Text({
                x: outer * 0.7, y: y - outer * 0.7 - 10,
                text: `+${here.length - AGE_RINGS}`, fontSize: 10, fill: '#cbd5e1',
                listening: false, name: 'lit-ring',
            }))
        }
    }
    layer?.batchDraw()
}

// ── Who is crossing the map, and where they have been ──────────────────────────

/**
 * Everyone with somewhere to be, once each. Names read in order, which is how the list is ticked —
 * or, when the window was opened from one character's timeline, only the people they were somewhere
 * with, because that is the story the reader came in on.
 */
const cast = computed(() =>
    focusId.value ? castAround(events.value, focusId.value) : castOf(events.value))
/** The focused character's own name, for the chip that says why the list is short. */
const focusName = computed(() =>
    cast.value.find(c => c.CharacterId === focusId.value)?.Name ?? '')
/**
 * Who the reader singled out. Null is everyone, so a timeline of a hundred and fifty characters shows
 * the whole crowd until someone thins it — asking for a choice before showing anything would show
 * nothing. An empty set is nobody, which is what "None" leaves behind.
 */
const following = ref<Set<string> | null>(null)
const followed = computed(() => {
    const only = following.value
    return only ? cast.value.filter(c => only.has(c.CharacterId)) : cast.value
})
const isFollowed = (id: string) => !following.value || following.value.has(id)
/** Where each of them was, worked out once per load rather than per tick of the scrubber. */
const stopsByCharacter = computed(() =>
    new Map(cast.value.map(c => [c.CharacterId, stopsFor(events.value, c.CharacterId)])))
/** Glide between the places, or draw the dashed line of the way — the timeline's own setting. */
const movement = ref<MapMovementStyle>('glide')
/** How far back that line reaches, as a share of the whole story. See `loadMapTrailLength`. */
const trailPercent = ref(DEFAULT_TRAIL_PERCENT)
/**
 * How far back the trail reaches, in timeline units, for the span this timeline actually covers. 0
 * draws no trail at all. A date range has no trail — it is drawn as a summary (`paintSummary`).
 */
const trailBack = computed(() => {
    const at = span.value
    if (!at || trailPercent.value <= 0) return 0
    // A floor of one day, or a story told inside a single day would have a trail of zero length and
    // the setting would look broken on exactly the timelines that need the shortest tail.
    return Math.max(oneDay.value, ((at.max - at.min) * trailPercent.value) / 100)
})

/**
 * Open the range on the stretch the trail was already drawing, so turning it on shows what was there
 * a moment ago and the handle is somewhere worth dragging from rather than at the dawn of the world.
 */
function toggleRange() {
    rangeOn.value = !rangeOn.value
    dateEdit.value = null
    if (!rangeOn.value) return
    // Play has no button in a window, so it cannot be left running behind one.
    pausePlay()
    const at = span.value
    const back = at ? Math.max(oneDay.value, ((at.max - at.min) * trailPercent.value) / 100) : 0
    rangeFrom.value = Math.max(at?.min ?? 0, now.value - back)
}

/**
 * Tick one name. While the list is untouched every box is ticked, so the first click is an *un*tick and
 * has to leave everyone else in — clicking it as "follow only this one" is not what a ticked box means.
 */
function toggleFollow(id: string) {
    following.value = new Set(followSection(
        following.value && [...following.value],
        cast.value.map(c => c.CharacterId),
        [id],
        !isFollowed(id),
    ))
}

// ── How the cast window cuts the list up ───────────────────────────────────────

/** How the list is cut up. `none` is the flat list it has always been. */
const grouping = ref<CastGrouping>('none')

watch(grouping, how => { if (how === 'family' || how === 'faction') void ensureWeb() })

const kin = computed(() => kinGroups(web.value?.Relations ?? [], web.value?.Types ?? []))
const familyNames = computed(() => kinNames(web.value?.Characters ?? [], kin.value))
const factions = computed(() =>
    new Map((web.value?.Characters ?? []).map(c => [c.Id, c.Faction ?? ''])))

/** What each grouping calls the ones it has no group for. */
const REST: Record<CastGrouping, string> = {
    none: '',
    moving: 'Not in the story now',
    family: 'No family on record',
    faction: 'No faction',
}

/**
 * The list as the cast window draws it: one unlabelled section when it is flat, and named ones when it
 * is not. Everyone, unsearched — the search box is the window's own.
 */
const castSections = computed<CastGroup[]>(() => {
    const found = cast.value
    const rest = REST[grouping.value]
    switch (grouping.value) {
        case 'moving':
            // The moment's own answer, so a reader watching it run can see who it is about right now.
            return groupCast(found, w => {
                const leg = legAt(stopsByCharacter.value.get(w.CharacterId) ?? [], now.value)
                if (!leg) return ''
                return leg.next ? 'On the road' : 'Standing somewhere'
            }, rest)
        case 'family':
            return groupCast(found, w => familyNames.value.get(kin.value.get(w.CharacterId) ?? '') ?? '', rest)
        case 'faction':
            return groupCast(found, w => factions.value.get(w.CharacterId) ?? '', rest)
        default:
            return found.length ? [{ key: '', label: '', members: found }] : []
    }
})

/** Those a grouping has no group for, while the map is coloured by groups: there, but not a side. */
const UNSIDED = '#94a3b8'

/** Colours set by hand in the cast window, by group name, for this timeline's every window. */
const groupColours = ref<Record<string, string>>({})

/**
 * A group's colour: the one set by hand, else the hue the relations window gives the same name, so a
 * faction is one colour everywhere. Grey for the ones left over.
 */
const groupColour = (label: string) =>
    groupColours.value[label] ?? (label === REST[grouping.value] ? UNSIDED : categoryColor(label))

/** Set by hand from the cast window, or given back to its name's own hue with null. */
function setGroupColour(group: string, colour: string | null) {
    if (colour !== null && !HEX.test(colour)) return failed('Could not set the group colour', new Error(`Not a colour: ${colour}`))
    const next = { ...groupColours.value }
    if (colour) next[group] = colour
    else delete next[group]
    groupColours.value = next
    saveGroupColours(timelineId, next).catch(ex => failed('Could not save the group colour', ex))
}

/**
 * Colours by group, while the list is cut up: the map then answers "which houses are on the march"
 * rather than "which twelve people", and a road two houses share becomes two strands. Null while the
 * list is flat, and each character wears their own colour.
 *
 * The same map as last time when nothing in it changed, so a clock running under "By who is moving"
 * does not rebuild every dot every frame. ponytail: someone setting off or arriving still does — dots,
 * summary and chart — which is the point of the grouping; cache by group if that ever stutters.
 */
const sideColours = computed<Map<string, string> | null>(prev => {
    if (grouping.value === 'none') return null
    const out = new Map<string, string>()
    for (const s of castSections.value) {
        const colour = groupColour(s.label)
        for (const w of s.members) out.set(w.CharacterId, colour)
    }
    return prev?.size === out.size && [...out].every(([id, c]) => prev.get(id) === c) ? prev : out
})

/** What a character is drawn in: their side's colour when the map is showing sides, else their own. */
const colourOf = (who: { CharacterId: string; Color?: string | null }) =>
    sideColours.value?.get(who.CharacterId) ?? (who.Color || '#38bdf8')

/** The head of each character being drawn, kept so a time change moves them instead of rebuilding. */
const castNodes = new Map<string, {
    head: Konva.Group
    rings: Konva.Group | null
    colour: string
}>()

/** The dwell rings, under everything; the gathering marks, over them. */
let ground: Konva.Group | null = null
let swells: Konva.Group | null = null
/** Every road anyone walked, fused per party — see `bundleLegs`. A pool of lines, at the very bottom. */
let roads: Konva.Group | null = null
/** Whether any road on screen is a cable of several strands, whose spacing is in pixels and so zoom-bound. */
let cabled = false

/**
 * The one character a left-click picked out: everyone else steps back and their whole way across this
 * map is drawn, walked solid and still to walk faint. Null is nobody. The clock is left alone — the
 * menu's "Show their journey" is the one that takes it over.
 */
const spotlight = ref<string | null>(null)
/** How far everyone else steps back while someone is picked out. */
const SPOTLIT_DIM = 0.25
/** Full strength for anything drawn for the one picked out, or with nobody picked; dimmed otherwise. */
const lightFor = (ids: readonly string[]) => (!spotlight.value || ids.includes(spotlight.value) ? 1 : SPOTLIT_DIM)
/** Their way, already walked and still to walk. In `ground`, over everyone's roads and under the heads. */
let routeWalked: Konva.Line | null = null
let routeAhead: Konva.Line | null = null

/**
 * The one under the pointer: on their dot here, or on their name or line in the cast window. Their dot
 * swells and comes to the top, so a name pointed at on the other screen can be found in a crowd.
 */
const hovered = ref<string | null>(null)
const HOVER_SWELL = 1.35

function swellDot(id: string | null, by: number) {
    const head = id ? castNodes.get(id)?.head : undefined
    // The glow and the dot, which are its first two; not the name.
    head?.getChildren().slice(0, 2).forEach(n => n.scale({ x: by, y: by }))
    if (by > 1) head?.moveToTop()
}

/**
 * A soft glow of `colour` fading out from radius `from` to `to`, drawn under a dot. A gradient where it
 * was a shadow blur: a blur is worked out afresh every frame, and a hundred of them made a drag crawl.
 */
function halo(colour: string, from: number, to: number) {
    const { r, g, b } = Konva.Util.colorToRGBA(colour) ?? { r: 56, g: 189, b: 248 }
    return new Konva.Circle({
        radius: to, listening: false,
        fillRadialGradientStartRadius: from, fillRadialGradientEndRadius: to,
        fillRadialGradientColorStops: [0, `rgba(${r}, ${g}, ${b}, 0.7)`, 1, `rgba(${r}, ${g}, ${b}, 0)`],
    })
}

/** The trails while the map is dragged: the group standing down, and the picture standing in for it. */
let frozen: { group: Konva.Group; still: Konva.Image } | null = null

/**
 * The trails as one picture while the map is dragged, taken as the drag starts: the screen and half a
 * screen round it, turned and scaled to lie exactly where the lines do. Hundreds of fading lines drawn
 * again every frame is what made dragging a busy map lag; a picture of them is one copy a frame. The
 * lines come back when the drag ends. A range's roads are `summary`; the moment's are in `ground`.
 *
 * ponytail: the picture is of the moment the drag began, so with the clock playing the dots walk on
 * over trails that wait for the drag to end. It is twice the view each way at the screen's pixel ratio,
 * ~100 MB on a 4K screen for as long as the drag lasts; take the ratio down if that ever bites.
 */
function freezeTrails() {
    const group = rangeOn.value ? summary : look.value ? ground : null
    if (!stage || !group?.hasChildren() || frozen) return
    const w = stage.width()
    const h = stage.height()
    const zoomNow = stage.scaleX()
    const still = new Konva.Image({
        image: group.toCanvas({ x: -w / 2, y: -h / 2, width: w * 2, height: h * 2, pixelRatio: window.devicePixelRatio }),
        ...mapPointAt({ x: -w / 2, y: -h / 2 }),
        width: w * 2, height: h * 2,
        scale: { x: 1 / zoomNow, y: 1 / zoomNow }, rotation: -stage.rotation(),
        listening: false,
    })
    group.parent?.add(still)
    still.zIndex(group.zIndex() + 1)
    group.visible(false)
    frozen = { group, still }
}

/** The lines back, where the picture was. Harmless if a rebuild mid-drag already threw both away. */
function thawTrails() {
    if (!frozen) return
    frozen.group.visible(true)
    frozen.still.destroy()
    frozen = null
    layer?.batchDraw()
}

watch(hovered, (id, was) => {
    swellDot(was, 1)
    swellDot(id, HOVER_SWELL)
    layer?.batchDraw()
})

/**
 * Where a place shows on the map in front of the reader: itself if it is pinned here, otherwise the
 * door that leads down to it. Null for a place on another branch entirely — there is nothing here to
 * stand for it, so whoever is there is not drawn.
 */
function pointFor(locId: string): { x: number; y: number } | null {
    const pin = standingPin.value(locId)
    return pin ? { x: pin.X * baseW, y: pin.Y * baseH } : null
}

/**
 * `pinStandingFor`, remembered per place until the maps or the map on screen change. A frame asks it
 * for every stop of every trail, and each ask scanned every place of every map through Vue's proxies:
 * 1000 events cost 330 ms a frame. The scan runs on the raw maps; the one reactive read is the doors,
 * which is what a new place, a moved door or a reload changes. A dragged pin keeps its object, so its
 * X and Y are read fresh.
 */
const standingPin = computed(() => {
    const parents = parentMapIds(maps.value)
    const raw = toRaw(maps.value)
    const on = currentId.value
    const memo = new Map<string, LocationItem | null>()
    return (locId: string) => {
        if (!memo.has(locId)) memo.set(locId, pinStandingFor(raw, locId, on, parents))
        return memo.get(locId)!
    }
})

/**
 * A dot per character, and under it the line of where they have been. Built once per map, per cast,
 * per style — `paintCast` does the moving, because a scrubber being dragged must not rebuild nodes.
 */
function drawCast() {
    if (!movers) return
    movers.destroyChildren()
    castNodes.clear()
    // A dot rebuilt under the pointer never says it was left, and its cursor would stay behind.
    if (stage?.container().style.cursor === 'pointer') stage.container().style.cursor = ''
    ground = swells = roads = routeWalked = routeAhead = null
    if (spotlight.value && !followed.value.some(w => w.CharacterId === spotlight.value)) spotlight.value = null
    if (!timeOn.value) {
        layer?.batchDraw()
        return
    }

    // Three storeys, added in the order they stack. A comet's tail is seven pixels wide where the old
    // dashed line was two, so "whoever was drawn last wins" stopped being good enough: the roads go
    // under everything, the gathering rings over them, and the names on top of the lot.
    ground = new Konva.Group({ listening: false })
    swells = new Konva.Group({ listening: false })
    movers.add(ground, swells)
    // Map coordinates, unscaled stroke: the way someone came is ground, not furniture, so it lies on the
    // map and stays a line of the same few pixels at any zoom. Shared by everyone rather than one per
    // person, because people walking together are drawn as one road.
    if (look.value) {
        roads = new Konva.Group({ listening: false })
        ground.add(roads)
    }
    const routeLine = { strokeWidth: 3, strokeScaleEnabled: false, lineCap: 'round', lineJoin: 'round', listening: false, visible: false } as const
    routeWalked = new Konva.Line(routeLine)
    routeAhead = new Konva.Line({ ...routeLine, dash: [2, 7], opacity: 0.6 })
    ground.add(routeWalked, routeAhead)

    for (const who of followed.value) {
        const colour = colourOf(who)
        // Dwell rings are the opposite: a ring meaning "they were here a while" has to stay the size it
        // means whatever the zoom, so it goes in `.cast-mark` groups like a pin does.
        const ringPool = look.value?.rings ? new Konva.Group({ listening: false }) : null
        if (ringPool) ground.add(ringPool)

        // Held at a fixed size on screen by `scalePins`, like a pin: a walking character is a marker,
        // not a feature of the ground.
        const head = new Konva.Group({ name: 'cast-mark', visible: false })
        // The one whose timeline the map was opened from is a star, bigger and edged in white: they are
        // who the reader came to watch, so they are the one to find first in a crowd.
        const star = who.CharacterId === focusId.value
        // hitStrokeWidth: a few pixels of slack round the mark, so a click just off it still reaches
        // them rather than landing on the map and looking like there is nothing to click.
        const dot = star
            ? new Konva.Star({
                numPoints: 5, innerRadius: 4.5, outerRadius: 10, fill: colour, stroke: '#f8fafc',
                strokeWidth: 1.5, hitStrokeWidth: 8,
            })
            : new Konva.Circle({ radius: 6, fill: colour, stroke: '#0f172a', strokeWidth: 1.5, hitStrokeWidth: 8 })
        head.add(halo(colour, star ? 4.5 : 6, star ? 17 : 13), dot)
        head.add(new Konva.Text({
            text: who.Name, fontSize: 11, fontStyle: 'bold', x: star ? 13 : 9, y: -6,
            fill: '#f8fafc', stroke: '#0f172a', strokeWidth: 3, fillAfterStrokeEnabled: true,
            // Only the dot takes the clicks: a name across a pin would steal the pin's.
            listening: false,
        }))
        // Their own menu, not the map's: who they are, not where the click landed.
        head.on('contextmenu', e => {
            e.evt.preventDefault()
            e.cancelBubble = true
            openWhoMenu(e.evt, who.CharacterId)
        })
        // A left-click picks them out, and a second one on the same dot lets them go.
        head.on('click', e => {
            if (e.evt.button !== 0) return
            e.cancelBubble = true
            spotlight.value = spotlight.value === who.CharacterId ? null : who.CharacterId
        })
        // Saying so before the click: the pointer, and the mark swells. One hit test per mouse move,
        // which Konva already does for the clicks.
        head.on('mouseenter', () => {
            if (stage) stage.container().style.cursor = 'pointer'
            hovered.value = who.CharacterId
        })
        head.on('mouseleave', () => {
            if (stage) stage.container().style.cursor = ''
            hovered.value = null
        })
        movers.add(head)
        castNodes.set(who.CharacterId, { head, rings: ringPool, colour })
    }
    // Over everyone else, or a crowd standing where they stand hides the one the map is about.
    if (focusId.value) castNodes.get(focusId.value)?.head.moveToTop()
    if (spotlight.value) castNodes.get(spotlight.value)?.head.moveToTop()
    // Still pointed at from the cast window, most likely: a tick box clicked on the row rebuilt them.
    swellDot(hovered.value, HOVER_SWELL)
    // A head built while the map is zoomed in has to be shrunk to screen size before it is ever seen:
    // this is also reached from the watcher, where nothing else would do it.
    scalePins()
    paintCast()
}

/** The tightest ring two characters standing in the same place are fanned onto, in screen pixels. */
const FAN_RADIUS = 13

/** Elbow room each of them gets on that ring once there are enough to need more of it. */
const FAN_GAP = 17

/** How many have to be in one place before it is a gathering worth marking rather than a queue. */
const GATHER_MIN = 3

/** How much of a character's own colour the freshest part of their trail is given. */
const TRAIL_ALPHA = 0.75

/** Segments a bowed leg is drawn with. Ten is past the point where the curve shows its corners. */
const BOW_STEPS = 10

/** The biggest a dwell ring gets, in screen pixels — a stay as long as the trail reaches. */
const DWELL_MAX = 17

interface TrailLook {
    /** Konva's dash pattern, or null for a solid stroke. */
    dash: number[] | null
    /** Stroke width at the head, in screen pixels. */
    width: number
    /** How much of that width is given up at the far end: 0 keeps an even line. */
    taper: number
    /** The power the fade is raised to. 1 is even; higher leaves only the last stretch bright. */
    falloff: number
    /** How far a leg bows off the straight line, as a share of its own length. 0 is a ruler. */
    bow: number
    /** Whether a ring is drawn where they stayed put. */
    rings: boolean
}

/**
 * What each movement style leaves behind. `glide` is absent on purpose — it draws no road at all.
 *
 * `trail` is the dashed line exactly as it was, so nobody's map changes under them. `flow` is the
 * whole journey as a bowed ribbon that thins out behind, with a ring at each place they stayed, and
 * answers "where has this person been". `comet` is the same ribbon with the strength falling away
 * cubed, so only the last stretch is bright, and answers "where are they going right now".
 */
const TRAIL_LOOK: Record<string, TrailLook> = {
    trail: { dash: [8, 6], width: 2, taper: 0, falloff: 1, bow: 0, rings: false },
    flow: { dash: null, width: 5, taper: 0.75, falloff: 1, bow: 0.22, rings: true },
    comet: { dash: null, width: 7, taper: 0.9, falloff: 3, bow: 0.14, rings: false },
}

const look = computed<TrailLook | null>(() => TRAIL_LOOK[movement.value] ?? null)

// Set from the cast window now, with the map open, rather than only read as it opens.
watch(trailBack, () => paintCast())

/** Screen pixels between two strands of one cable. */
const STRAND_GAP = 1

/**
 * One line per strand of every road, reusing the lines already in the pool: a scrubber being dragged
 * sets a few attributes instead of building a trail per frame.
 *
 * A party is one road as thick as its headcount (`strandWeight`); a party of several colours is a cable
 * of strands side by side. Their spacing is screen pixels on a line drawn in map units, so it is divided
 * by the zoom here and the whole thing is repainted when the zoom changes (`cabled`).
 *
 * ponytail: the fade and the taper step down per leg rather than running smoothly along one. A stroke
 * gradient per segment is the upgrade, and it needs the character's colour parsed into rgba, which
 * nothing here does yet.
 */
function paintRoads(pool: Konva.Group, how: TrailLook, legs: LegIn[]) {
    const zoomNow = stage?.scaleX() || 1
    cabled = false
    let n = 0
    for (const road of bundleLegs(legs)) {
        // The newer end decides: a leg is as fresh as the arrival it ends on.
        const fresh = Math.pow(road.alpha, how.falloff)
        const base = how.width * (1 - how.taper * (1 - fresh))
        const widths = road.strands.map(s => base * strandWeight(s.ids.length))
        const offsets = strandOffsets(widths, STRAND_GAP)
        if (road.strands.length > 1) cabled = true
        // A party bows the way its first member does, so a lone walker's road is the one it always was.
        const lean = leanOf(road.strands[0]!.ids[0]!) * how.bow
        road.strands.forEach((strand, i) => {
            let line = pool.getChildren()[n++] as Konva.Line | undefined
            if (!line) {
                line = new Konva.Line({
                    strokeScaleEnabled: false, lineCap: 'round', lineJoin: 'round', listening: false,
                })
                pool.add(line)
            }
            const [a, b] = sideways(road.a, road.b, offsets[i]! / zoomNow)
            line.visible(true)
            line.stroke(strand.colour)
            line.dash(how.dash ?? [])
            line.strokeWidth(widths[i]!)
            line.opacity(fresh * TRAIL_ALPHA * lightFor(strand.ids))
            line.points(arc(a, b, lean, BOW_STEPS).flatMap(p => [p.x, p.y]))
        })
    }
    for (const spare of pool.getChildren().slice(n)) spare.visible(false)
}

// A cable's strands are spaced in screen pixels, so a zoom has to re-space them. A plain road needs
// nothing: its width is already unscaled.
watch(zoom, () => { if (cabled) paintCast() })

/**
 * Everyone, put where the date says they are: on a place, or partway along the road to the next one.
 * Only the position changes here, so dragging the scrubber costs a few attribute writes per character.
 *
 * ponytail: a leg whose either end is on another branch of the tree is not drawn — the character
 * vanishes for those years rather than sliding in from off the map. Drawing them walking to the edge
 * needs a point outside the picture to walk to, which is a bigger idea than this.
 */
function paintCast() {
    if (!movers || !castNodes.size) return
    /** Who is standing on each point, so a crowd can be fanned apart rather than stacked. */
    const crowd = new Map<string, { at: { x: number; y: number }; ids: string[] }>()
    const at = new Map<string, { x: number; y: number }>()
    // Rings and gathering marks are pooled, and a pooled node made here has missed the `scalePins` at
    // the end of `drawCast` — so it would sit at map scale until the next time the view moved.
    let born = false
    const pooled = (holder: Konva.Group, i: number, make: () => Konva.Group) => {
        const kids = holder.getChildren()
        if (i < kids.length) return kids[i] as Konva.Group
        const node = make()
        holder.add(node)
        born = true
        return node
    }

    /** Every leg walked by anyone, to be fused into roads once everyone has been through. */
    const legs: LegIn[] = []

    for (const [id, { head, rings, colour }] of castNodes) {
        const stops = stopsByCharacter.value.get(id) ?? []
        const leg = legAt(stops, now.value)
        const here = leg && pointFor(leg.at.locationId)

        // Where they are at the far end of the window, if they are anywhere at all. Null is ordinary:
        // before their first placed event, after their last, or off on another branch of the tree.
        let spot: { x: number; y: number } | null = null
        if (leg && here) {
            // Between two places: `t` of the way along the straight line, which is all the story says.
            spot = here
            if (leg.next) {
                const to = pointFor(leg.next.locationId)
                if (to) spot = { x: here.x + (to.x - here.x) * leg.t, y: here.y + (to.y - here.y) * leg.t }
            }
            at.set(id, spot)

            // Only a character standing still shares a point worth fanning; two mid-journey rarely collide.
            if (!leg.next) {
                const key = `${Math.round(spot.x)},${Math.round(spot.y)}`
                const met = crowd.get(key)
                if (met) met.ids.push(id)
                else crowd.set(key, { at: spot, ids: [id] })
            }
        } else head.visible(false)

        // A date range is drawn as a summary instead (`paintSummary`): one road per way between two
        // places rather than every walk along it, so each person's own trail stands down.
        if (!look.value || rangeOn.value) {
            rings?.getChildren().forEach(r => r.visible(false))
            continue
        }
        const behind = trailFade(stops, now.value, trailBack.value)
        // Each point named by the stop it is — place and times — so two people at the same events have
        // the same names for their points, and so the same keys for their legs.
        const walked = behind
            .map(s => ({
                at: pointFor(s.stop.locationId),
                alpha: s.alpha,
                key: `${s.stop.locationId}@${s.stop.from}-${s.stop.to}`,
            }))
            .filter((p): p is { at: { x: number; y: number }; alpha: number; key: string } => !!p.at)
        // The head is the freshest point of all, so the last leg runs at full strength into it. And
        // the road is still drawn without one: someone whose story ends inside the window walked it
        // all the same, and dropping them would empty the window of exactly the people it was
        // dragged open to find.
        if (spot && leg) {
            walked.push({
                at: spot, alpha: 1,
                key: leg.next ? `>${leg.next.locationId}@${leg.next.from}` : `${walked.at(-1)?.key}`,
            })
        }
        for (let i = 1; i < walked.length; i++) {
            const a = walked[i - 1]!, b = walked[i]!
            // Standing still is not a leg — and the head on its own stop would be one of no length.
            if (a.at.x === b.at.x && a.at.y === b.at.y) continue
            legs.push({ key: `${a.key}|${b.key}`, id, colour, alpha: b.alpha, a: a.at, b: b.at })
        }

        // A ring where they stopped and stayed, sized by how long. Standing somewhere for an age and
        // passing through on the way to somewhere else are the same dot without this, and the whole
        // complaint about a trail of dashes is that it cannot tell the two apart.
        if (!rings) continue
        let n = 0
        for (const { stop, alpha } of behind) {
            const r = dwellRadius(stop.to - stop.from, trailBack.value, DWELL_MAX)
            const where = r >= 2 ? pointFor(stop.locationId) : null
            if (!where) continue
            const ring = pooled(rings, n++, () => {
                const g = new Konva.Group({ name: 'cast-mark', listening: false })
                g.add(new Konva.Circle({ stroke: colour, strokeWidth: 1.5, fillEnabled: false }))
                return g
            })
            ring.position(where)
            ring.visible(true)
            const circle = ring.getChildren()[0] as Konva.Circle
            circle.radius(r)
            circle.stroke(colour)
            ring.opacity(alpha * TRAIL_ALPHA * lightFor([id]))
        }
        for (const spare of rings.getChildren().slice(n)) spare.visible(false)
    }

    if (roads && look.value) paintRoads(roads, look.value, legs)

    for (const [id, { head }] of castNodes) {
        const spot = at.get(id)
        if (!spot) continue
        const key = `${Math.round(spot.x)},${Math.round(spot.y)}`
        const sharing = crowd.get(key)?.ids ?? [id]
        const nth = sharing.indexOf(id)
        // Konva applies offset inside the group's own scale, and this group is inverse-scaled, so these
        // are already screen pixels — a fanned crowd keeps its spacing at every zoom.
        if (sharing.length > 1 && nth >= 0) {
            const r = fanRadius(sharing.length, FAN_GAP, FAN_RADIUS)
            const angle = (nth / sharing.length) * Math.PI * 2
            head.offset({ x: -Math.cos(angle) * r, y: -Math.sin(angle) * r })
        } else head.offset({ x: 0, y: 0 })

        // No tween: a step glides the clock itself (`glideTo`), so every frame is already a real date.
        head.position(spot)
        head.opacity(lightFor([id]))
        head.visible(true)
    }

    // The one picked out: every stop of theirs this map can show, up to where they are now and on from
    // there. Drawn whether or not the movement style leaves a road, because the click asked for it.
    // ponytail: straight lines, and a stop on another branch of the tree is skipped, so the line jumps
    // across it. Bow it like `arc` and walk it to a door if that reads wrong.
    const picked = spotlight.value
    const colour = picked ? castNodes.get(picked)?.colour : undefined
    routeWalked?.visible(!!colour)
    routeAhead?.visible(!!colour)
    if (picked && colour && routeWalked && routeAhead) {
        const stops = stopsByCharacter.value.get(picked) ?? []
        const walked = stops.filter(s => s.from <= now.value).map(s => pointFor(s.locationId)).filter(p => p !== null)
        const ahead = stops.filter(s => s.from > now.value).map(s => pointFor(s.locationId)).filter(p => p !== null)
        const here = at.get(picked) ?? walked.at(-1)
        if (here) {
            walked.push(here)
            ahead.unshift(here)
        }
        routeWalked.stroke(colour).points(walked.flatMap(p => [p.x, p.y]))
        routeAhead.stroke(colour).points(ahead.flatMap(p => [p.x, p.y]))
    }

    // Ten people coming from all corners of the world and meeting is the moment the map exists to
    // show, and ten fanned dots on their own do not say it — the eye reads a scatter, not an event.
    // A ring drawn round the lot of them with the count in it says how big the moment is at a glance,
    // and it is in the same amber as the pins that have something going on, because it is the same
    // thing being said.
    if (swells) {
        let n = 0
        // In a date range the meetings of the whole window are marked instead, by `paintSummary`.
        for (const { at: where, ids } of rangeOn.value ? [] : crowd.values()) {
            if (ids.length < GATHER_MIN) continue
            const mark = pooled(swells, n++, () => {
                const g = new Konva.Group({ name: 'cast-mark', listening: false })
                g.add(new Konva.Circle({
                    fill: 'rgba(251, 191, 36, 0.10)', stroke: '#fbbf24',
                    strokeWidth: 1.5, dash: [3, 4],
                }))
                g.add(new Konva.Text({
                    fontSize: 11, fontStyle: 'bold', fill: '#fbbf24',
                    stroke: '#0f172a', strokeWidth: 3, fillAfterStrokeEnabled: true,
                }))
                return g
            })
            const r = fanRadius(ids.length, FAN_GAP, FAN_RADIUS) + 11
            const ring = mark.getChildren()[0] as Konva.Circle
            const count = mark.getChildren()[1] as Konva.Text
            ring.radius(r)
            count.text(String(ids.length))
            // On the ring at the upper right, where a name label running off to the right is not.
            count.position({ x: r * 0.7 + 1, y: -r * 0.7 - 11 })
            mark.position(where)
            mark.visible(true)
        }
        for (const spare of swells.getChildren().slice(n)) spare.visible(false)
    }

    // A node made this pass has never been through `scalePins`, so it is still at map scale.
    if (born) scalePins()
    layer?.batchDraw()
}

// A rebuild is only needed when *who* is drawn changes, or how. Moving the scrubber does the cheap
// thing, and a change of map comes through `redrawPins`, once the new picture's size is known.
watch([timeOn, following, movement, cast, sideColours], () => drawCast())

/**
 * Keep everyone being followed on screen at the closest map that still holds all of them: in through a
 * door the moment they all go through it, and back out the moment they part. Off by default — it takes
 * the map out of the reader's hands, which is only wanted while watching.
 */
const autoFollow = ref(false)
/** Set while an auto-flight is in the air, so the clock ticking on cannot stack a second one. */
let chasing = false

/** The map to be standing on to see these people at `at`, or null when none of them is anywhere then. */
function followTarget(ids = followed.value.map(w => w.CharacterId), at = now.value): string | null {
    const home = new Map<string, string>()
    for (const m of maps.value) for (const l of m.Locations) home.set(l.Id, m.Id)

    const wanted: string[] = []
    for (const id of ids) {
        const leg = legAt(stopsByCharacter.value.get(id) ?? [], at)
        if (!leg) continue
        // Both ends of a journey count, so someone crossing from one kingdom to another pulls the view
        // out to the map that holds both rather than walking off the edge of this one.
        for (const loc of [leg.at.locationId, leg.next?.locationId]) {
            const m = loc ? home.get(loc) : undefined
            if (m) wanted.push(m)
        }
    }
    return wanted.length ? commonMap(parentMapIds(maps.value), wanted) : null
}

async function chaseCast() {
    if (!autoFollow.value || !timeOn.value || chasing) return
    // Arriving on a map closes every editor, menu and pick on the one it left, so it never flies out from
    // under one: a place half-typed into its modal used to go with it. It catches up on the next tick.
    if (modalOpen.value || menu.value || mode.value || picking.value || placing.value) return
    const want = followTarget()
    if (!want || want === currentId.value) return
    chasing = true
    try {
        await travelTo(want)
    } finally {
        chasing = false
    }
}

// Ticking the clock is what moves them, and changing who is followed changes where "everyone" is.
watch([autoFollow, following, timeOn], () => void chaseCast())

function toggleAutoFollow() {
    autoFollow.value = !autoFollow.value
    // Turned on with nobody anywhere at this date, it would look like it did nothing.
    if (autoFollow.value && !followTarget()) {
        say(following.value?.size === 0
            ? 'Nobody is on the map to fly with — right-click a person, or tick them in Who is where.'
            : 'Nobody on the map is anywhere at this date; the view goes with them once someone turns up.', 5000)
    }
}

/**
 * A double-click on a name in the cast window: go to them and pick them out. Someone not in the story
 * at this moment is gone to where they next turn up, or where they were last, and the clock goes too.
 */
async function flyToWho(id: string) {
    const stops = stopsByCharacter.value.get(id) ?? []
    if (!stops.length) return
    if (!isFollowed(id)) toggleFollow(id)
    spotlight.value = id
    let at = glideGoal ?? now.value
    if (!legAt(stops, at)) {
        at = (stops.find(s => s.from > at) ?? stops[stops.length - 1]!).from
        setClock(at)
    }
    const leg = legAt(stops, at)
    const want = followTarget([id], at)
    if (!leg || !want) return
    // Where they are, as the pin that stands for it on the map the view lands on.
    const pin = pinStandingFor(maps.value, leg.at.locationId, want)
    if (want !== currentId.value) await travelTo(want, pin?.Id)
    if (pin) centreOn(pin.Id)
}

// ── A date range, read as a summary ────────────────────────────────────────────

/** Every place as the id of the pin that stands for it here, for the summary and the storyline. */
function pinsHere() {
    const pin = standingPin.value
    return (locId: string) => pin(locId)?.Id ?? null
}

/**
 * What a summary is worked out from, or null outside a range. The summary itself is not a computed: a
 * drag of the handles would work it out on every pointer move, and it is the slow part.
 */
const summaryJob = computed(() => {
    if (!timeOn.value || !rangeOn.value || !current.value) return null
    return {
        journeys: followed.value.map(who => ({
            id: who.CharacterId,
            colour: colourOf(who),
            stops: stopsByCharacter.value.get(who.CharacterId) ?? [],
        })),
        lo: window0.value,
        hi: now.value,
    }
})

/**
 * Everything the followed cast did inside the window, in pins on this map. Null outside a range.
 * See `summarise`: one lane per way between two pins, as wide as the people who used it.
 */
const rangeSummary = shallowRef<RangeSummary | null>(null)

/** A hand on the scrubber: the summary waits for it to lift, and the last one stays up, faded. */
const holding = ref(false)
let summaryFrame = 0
/** Whether the summary on the map is for a window the handles have since left. */
let summaryStale = false
/** How faint a summary is while the handles are away from the window it was worked out for. */
const STALE_ALPHA = 0.35

/** At most once a frame, and not at all while the handles are held — the dots follow the hand alone. */
function queueSummary() {
    cancelAnimationFrame(summaryFrame)
    if (holding.value && summaryJob.value) {
        summaryStale = true
        summary?.opacity(STALE_ALPHA)
        layer?.batchDraw()
        return
    }
    summaryFrame = requestAnimationFrame(() => {
        summaryFrame = 0
        const t0 = performance.now()
        const next = summaryJob.value
        summaryStale = false
        rangeSummary.value = next && summarise(next.journeys, next.lo, next.hi, pinsHere(), GATHER_MIN)
        cost.sum = performance.now() - t0
    })
}

watch(summaryJob, queueSummary)
watch(holding, held => { if (!held && summaryStale) queueSummary() })

/** How many of a range's roads are drawn in full; 0 is all. The rest are faint. See `ROADS_SHOWN`. */
const roadsShown = ref(0)
/** What the soft disc at each place measures: time spent there, or comings and goings. */
const placesShow = ref<MapPlacesShow>('time')
/** The traffic tint's two ends: more set off from here, and more came here. */
const LEFT_RGB = [251, 146, 60]
const CAME_RGB = [56, 189, 248]

/** Screen-pixel width of a summary lane for one person; more people multiply it (`strandWeight`). */
const LANE_WIDTH = 3
/** How far a lane bows. The same way for both directions, so a two-way road opens into two lanes. */
const LANE_BOW = 0.16

/** A hover card over the map: a road, a stay or a meeting, said in words. */
const tip = ref<{ x: number; y: number; lines: string[] } | null>(null)
const tipEl = ref<HTMLElement | null>(null)

// Placed once drawn, since how far it has to stand off depends on how big it came out.
watch(tip, t => { if (t) placeTip(tipEl.value, t.x, t.y) }, { flush: 'post' })

const nameOfCast = (id: string) => cast.value.find(c => c.CharacterId === id)?.Name ?? 'Someone'
const nameOfPin = (id: string) => current.value?.Locations.find(l => l.Id === id)?.Name || 'a place'

/** A stretch of time in the timeline's own days and years, rounded to the day. */
function howLong(years: number): string {
    const perYear = Math.max(1, calendarCfg.value.yearLength)
    const days = Math.round(years * perYear)
    if (days < perYear) return days === 1 ? '1 day' : `${days} days`
    const y = Math.floor(days / perYear)
    const d = days - y * perYear
    return `${y} year${y === 1 ? '' : 's'}${d ? `, ${d} day${d === 1 ? '' : 's'}` : ''}`
}

/** What a lane's hover card says: which way, how often, who, and when. */
function laneLines(lane: Lane): string[] {
    const people = lane.byWho.size
    const who = [...lane.byWho].sort((x, y) => y[1] - x[1])
    const names = who.slice(0, 8).map(([id, n]) => (n > 1 ? `${nameOfCast(id)} ×${n}` : nameOfCast(id)))
    if (who.length > 8) names.push(`and ${who.length - 8} more`)
    const dates = lane.when.slice(0, 4).map(dateOf).join(' · ') + (lane.when.length > 4 ? ` +${lane.when.length - 4}` : '')
    return [
        `${nameOfPin(lane.from)} → ${nameOfPin(lane.to)}`,
        `${lane.trips} ${lane.trips === 1 ? 'journey' : 'journeys'} by ${people} ${people === 1 ? 'person' : 'people'}`,
        names.join(', '),
        dates,
    ]
}

/** Hover wiring for one summary node: the card follows the pointer, and goes when it leaves. */
function tipOn(node: Konva.Node, lines: () => string[]) {
    node.on('mouseenter mousemove', e => { tip.value = { x: e.evt.clientX, y: e.evt.clientY, lines: lines() } })
    node.on('mouseleave', () => { tip.value = null })
}

/**
 * The range on the map: a lane per way between two pins with chevrons saying which way and a ×N where
 * the same people went more than once; a soft disc at each pin as big as the time spent there; and an
 * amber ring where enough of them met.
 *
 * ponytail: rebuilt from nothing on every change, where the moment view pools its nodes. A range has a
 * road per pair of places rather than a node per step, so it is a few dozen nodes; pool them if a drag
 * of the handles ever stutters.
 */
function paintSummary() {
    if (!summary) return
    const t0 = performance.now()
    summary.destroyChildren()
    summary.opacity(summaryStale ? STALE_ALPHA : 1)
    tip.value = null
    const sum = rangeSummary.value
    const map = current.value
    if (!sum || !map) { layer?.batchDraw(); return }

    const pinAt = (id: string) => {
        const loc = map.Locations.find(l => l.Id === id)
        return loc ? { x: loc.X * baseW, y: loc.Y * baseH } : null
    }
    const z = stage?.scaleX() || 1

    // Stays first, under the roads: a disc is where the roads come from, not something on top of them.
    // Or, asked for, the traffic: as big as the comings and goings, orange where more left than came and
    // sky blue where more came than left — where people gather to, and where they are sent out from.
    const flow = placesShow.value === 'flow'
    const discs = flow
        ? [...new Set([...sum.arrivals.keys(), ...sum.departures.keys()])]
            .map(pin => [pin, (sum.arrivals.get(pin) ?? 0) + (sum.departures.get(pin) ?? 0)] as const)
        : [...sum.stays]
    const largest = Math.max(0, ...discs.map(d => d[1]))
    for (const [pin, amount] of discs) {
        const at = pinAt(pin)
        const r = largest > 0 ? DWELL_MAX * 1.6 * Math.sqrt(amount / largest) : 0
        if (!at || r < 3) continue
        const came = sum.arrivals.get(pin) ?? 0
        const left = sum.departures.get(pin) ?? 0
        const k = came / Math.max(1, came + left)
        const tint = flow ? LEFT_RGB.map((c, i) => Math.round(c + (CAME_RGB[i]! - c) * k)).join(', ') : '226, 232, 240'
        const disc = new Konva.Group({ name: 'cast-mark', ...at })
        disc.add(new Konva.Circle({
            radius: r + 8, fill: `rgba(${tint}, ${flow ? 0.22 : 0.13})`,
            stroke: `rgba(${tint}, ${flow ? 0.7 : 0.45})`, strokeWidth: 1,
        }))
        tipOn(disc, () => flow
            ? [nameOfPin(pin), `${came} ${came === 1 ? 'arrival' : 'arrivals'}, ${left} ${left === 1 ? 'departure' : 'departures'}`]
            : [nameOfPin(pin), `${howLong(amount)} spent here, everyone together`])
        summary.add(disc)
    }

    // Past "Roads shown", a road is one faint hairline: still there to hover, not there to read.
    const full = roadsShown.value || sum.lanes.length
    /** Each party's label goes on the longest road of theirs on screen, where there is room for it. */
    const partyAt = new Map<string, { at: { x: number; y: number }; len: number; colour: string }>()
    // Quietest first, so the busiest roads are drawn over them.
    for (let li = sum.lanes.length - 1; li >= 0; li--) {
        const lane = sum.lanes[li]!
        const a = pinAt(lane.from)
        const b = pinAt(lane.to)
        if (!a || !b) continue
        if (li >= full) {
            const line = new Konva.Line({
                points: arc(a, b, LANE_BOW, BOW_STEPS).flatMap(p => [p.x, p.y]),
                stroke: lane.strands[0]!.colour, strokeWidth: 1, strokeScaleEnabled: false,
                lineCap: 'round', lineJoin: 'round', opacity: 0.25 * lightFor([...lane.byWho.keys()]),
                hitStrokeWidth: 8,
            })
            tipOn(line, () => laneLines(lane))
            summary.add(line)
            continue
        }
        const widths = lane.strands.map(s => LANE_WIDTH * strandWeight(s.ids.length))
        const offsets = strandOffsets(widths, STRAND_GAP)
        lane.strands.forEach((strand, i) => {
            const [sa, sb] = sideways(a, b, offsets[i]! / z)
            const line = new Konva.Line({
                points: arc(sa, sb, LANE_BOW, BOW_STEPS).flatMap(p => [p.x, p.y]),
                stroke: strand.colour, strokeWidth: widths[i]!, strokeScaleEnabled: false,
                lineCap: 'round', lineJoin: 'round', opacity: 0.8 * lightFor(strand.ids),
                hitStrokeWidth: Math.max(12, widths[i]! + 6),
            })
            tipOn(line, () => laneLines(lane))
            summary!.add(line)
        })

        // Chevrons on the middle line, pointing the way the lane runs: one per stretch of about a
        // hundred and forty pixels on screen, and never none.
        const mid = arc(a, b, LANE_BOW, 40)
        const across = widths.reduce((s, w) => s + w, 0)
        const size = (3 + across / 2) / z
        const screenLen = Math.hypot(b.x - a.x, b.y - a.y) * z
        const count = Math.max(1, Math.floor(screenLen / 140))
        for (let k = 1; k <= count; k++) {
            const i = Math.round((k / (count + 1)) * 40)
            const p = mid[i]!, q = mid[Math.min(40, i + 1)]!, o = mid[Math.max(0, i - 1)]!
            const len = Math.hypot(q.x - o.x, q.y - o.y) || 1
            const tx = (q.x - o.x) / len, ty = (q.y - o.y) / len
            summary.add(new Konva.Line({
                points: [
                    p.x - tx * size - ty * size, p.y - ty * size + tx * size,
                    p.x, p.y,
                    p.x - tx * size + ty * size, p.y - ty * size - tx * size,
                ],
                stroke: '#0f172a', strokeWidth: 1.5, strokeScaleEnabled: false,
                lineCap: 'round', lineJoin: 'round', opacity: 0.85, listening: false,
            }))
        }

        // The same people over and over is a count, not a thicker line.
        if (lane.trips > lane.byWho.size) {
            const tag = new Konva.Group({ name: 'cast-mark', ...mid[20]!, listening: false })
            tag.add(new Konva.Text({
                text: `×${lane.trips}`, fontSize: 11, fontStyle: 'bold', fill: '#f8fafc', x: 5, y: -14,
                stroke: '#0f172a', strokeWidth: 3, fillAfterStrokeEnabled: true,
            }))
            summary.add(tag)
        }

        for (const s of lane.strands) {
            if (!s.party || (partyAt.get(s.party)?.len ?? -1) >= screenLen) continue
            partyAt.set(s.party, { at: mid[20]!, len: screenLen, colour: s.colour })
        }
    }

    // "Mira + 6": a band that went everywhere together, named on the road where it is easiest to read.
    // Stacked where two share a road, rather than printed over each other.
    const stacked = new Map<string, number>()
    for (const p of sum.parties) {
        const where = partyAt.get(p.id)
        if (!where) continue
        const key = `${Math.round(where.at.x)},${Math.round(where.at.y)}`
        const nth = stacked.get(key) ?? 0
        stacked.set(key, nth + 1)
        const tag = new Konva.Group({ name: 'cast-mark', ...where.at, listening: false, opacity: lightFor(p.ids) })
        tag.add(new Konva.Text({
            text: `${nameOfCast(p.id)} + ${p.ids.length - 1}`, fontSize: 11, fontStyle: 'bold',
            fill: where.colour, x: 5, y: 4 + nth * 13,
            stroke: '#0f172a', strokeWidth: 3, fillAfterStrokeEnabled: true,
        }))
        summary.add(tag)
    }

    for (const [pin, count] of sum.meetings) {
        const at = pinAt(pin)
        if (!at) continue
        const r = fanRadius(count, FAN_GAP, FAN_RADIUS) + 11
        const mark = new Konva.Group({ name: 'cast-mark', ...at })
        mark.add(new Konva.Circle({
            radius: r, fill: 'rgba(251, 191, 36, 0.08)', stroke: '#fbbf24', strokeWidth: 1.5, dash: [3, 4],
        }))
        mark.add(new Konva.Text({
            text: String(count), fontSize: 11, fontStyle: 'bold', fill: '#fbbf24',
            stroke: '#0f172a', strokeWidth: 3, fillAfterStrokeEnabled: true,
            x: r * 0.7 + 1, y: -r * 0.7 - 11,
        }))
        tipOn(mark, () => [nameOfPin(pin), `${count} of them here together at once`])
        summary.add(mark)
    }

    scalePins()
    layer?.batchDraw()
    cost.draw = performance.now() - t0
}

watch([rangeSummary, roadsShown, placesShow], () => paintSummary())
watch(spotlight, () => {
    paintCast()
    if (rangeSummary.value) paintSummary()
})
// Strand spacing and chevron size are screen pixels on map-unit lines.
watch(zoom, () => { if (rangeSummary.value) paintSummary() })

/** The range in words, for the cast window: how much moved, the busiest road, the longest stay. */
const rangeFacts = computed<RangeFacts | null>(() => {
    const sum = rangeSummary.value
    if (!sum) return null
    const trips = sum.lanes.reduce((s, l) => s + l.trips, 0)
    // `summarise` already ranks them busiest first.
    const busiest = sum.lanes[0]
    const stay = [...sum.stays].sort((x, y) => y[1] - x[1])[0]
    const meetings = [...sum.meetings].sort((x, y) => y[1] - x[1])
    return {
        moved: sum.travellers,
        trips,
        roads: sum.lanes.length,
        busiest: busiest && {
            text: `${nameOfPin(busiest.from)} → ${nameOfPin(busiest.to)}`,
            people: busiest.byWho.size,
        },
        stay: stay && { text: nameOfPin(stay[0]), long: howLong(stay[1]) },
        meetings: meetings.slice(0, 3).map(([pin, n]) => ({ text: nameOfPin(pin), n })),
        faint: roadsShown.value ? Math.max(0, sum.lanes.length - roadsShown.value) : 0,
        parties: [...sum.parties]
            .sort((x, y) => y.ids.length - x.ids.length)
            .slice(0, 3)
            .map(p => `${nameOfCast(p.id)} + ${p.ids.length - 1}`),
    }
})

// ── The one picked out, in full ────────────────────────────────────────────────

/** Every place on every map by id: someone picked out is named where they really were, not by a door. */
const placeById = computed(() => new Map(maps.value.flatMap(m => m.Locations.map(l => [l.Id, l] as const))))
const placeName = (id: string) => placeById.value.get(id)?.Name || 'a place'

/** Their stops, each with who else was at the event. Worked out when the pick changes, not per frame. */
const spotStops = computed<CompanyStop[]>(() => {
    const id = spotlight.value
    if (!id) return []
    return eventsWith(events.value, id)
        .map(ev => ({
            ...eventSpan(ev), locationId: ev.LocationId, title: ev.Title,
            with: ev.Cast.map(c => c.CharacterId).filter(c => c !== id),
        }))
        .sort((a, b) => a.from - b.from)
})

/** The same stops as the cast window lists them — dated once, not on every send. */
const spotList = computed(() => spotStops.value.map(s => ({
    from: s.from, to: s.to, date: dateOf(s.from), place: placeName(s.locationId), event: s.title,
})))

/** How far one trip was, remembered per pair of places until the maps change: a long life is hundreds. */
const legLength = computed(() => {
    const all = maps.value
    const parents = parentMapIds(all)
    const memo = new Map<string, ReturnType<typeof placeDistance>>()
    return (a: string, b: string) => {
        const key = `${a}>${b}`
        if (!memo.has(key)) memo.set(key, placeDistance(all, a, b, parents))
        return memo.get(key)!
    }
})

const datesOf = (s: CastStop) => (s.to > s.from ? `${dateOf(s.from)} – ${dateOf(s.to)}` : dateOf(s.from))

/** Where the clock finds them, in words, and the event that has them there or is calling them on. */
function whereNow(stops: CastStop[]): CastDetail['now'] {
    const leg = legAt(stops, now.value)
    if (leg?.next && leg.next.locationId !== leg.at.locationId) {
        return {
            text: `On the road from ${placeName(leg.at.locationId)} to ${placeName(leg.next.locationId)}, arriving ${dateOf(leg.next.from)}`,
            why: leg.next.title,
        }
    }
    // Between two events at the same place is staying put, not a road.
    if (leg) {
        const at = placeName(leg.at.locationId)
        return { text: leg.next ? `At ${at}` : `At ${at}, ${datesOf(leg.at)}`, why: leg.at.title }
    }
    const first = stops[0]
    const last = stops.at(-1)
    if (!first || !last) return { text: 'Never anywhere on a map', why: null }
    return first.from > now.value
        ? { text: `Not on the map yet: first at ${placeName(first.locationId)}, ${datesOf(first)}`, why: first.title }
        : { text: `Last seen at ${placeName(last.locationId)}, ${datesOf(last)}`, why: last.title }
}

/** The one picked out, for the cast window — over the range if one is open, their whole story if not. */
function castDetail(): CastDetail | null {
    const byId = new Map(cast.value.map(c => [c.CharacterId, c]))
    const who = spotlight.value ? byId.get(spotlight.value) : undefined
    if (!who) return null
    const stops = spotStops.value
    const [lo, hi] = rangeOn.value ? [window0.value, now.value] : [-Infinity, Infinity]
    const f = personFacts(stops, lo, hi, legLength.value)
    return {
        id: who.CharacterId,
        name: who.Name,
        colour: colourOf(who),
        now: whereNow(stops),
        stops: spotList.value,
        trips: f.trips,
        places: f.places,
        road: howLong(f.road),
        distance: f.distance.size ? [...f.distance].map(([unit, n]) => `${formatDistance(n)} ${unit}`).join(' + ') : null,
        // ponytail: only people on the list. Opened from one character's timeline, the list is who they
        // met, and someone they never met cannot be picked out from it.
        company: [...f.company]
            .sort((x, y) => y[1] - x[1])
            .flatMap(([id, n]) => {
                const c = byId.get(id)
                return c ? [{ id, name: c.Name, colour: colourOf(c), n }] : []
            }),
    }
}

// ── Editing on the map: one mode at a time, handed over by an editor ───────────

/**
 * Which place the running mode is about. A drag on a map is only ever wanted right after asking for
 * it, so every one of these comes from a button in an editor and hands the editor back on Finish.
 */
const modePin = ref('')
const modeLoc = computed(() => current.value?.Locations.find(l => l.Id === modePin.value) ?? null)
/** The name as it is being typed in the label designer, live on the map above its line. */
const labelText = ref('')
/** The line being drawn, as its two ends: screen pixels, offset from the pin. */
let labelEnds = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }
let designGroup: Konva.Group | null = null
/** The designer's own redraw, so typing a name can reach it. */
let designPlace: (() => void) | null = null

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The two ends being dragged, as the style stores them. */
const labelGeometry = () => labelLineFrom(labelEnds.a, labelEnds.b)

/**
 * What one of a stored label pixel is worth on screen. A name held to the glass is stored in screen
 * pixels, so one is one; a name written on the ground is stored in map pixels, and the designer works
 * in screen pixels like every other overlay — so it multiplies on the way in and divides on the way
 * out. That the unit is the current zoom is the whole of it: a ground-written label is designed at the
 * zoom it is being looked at, and looks then exactly as it will at that zoom.
 */
const labelUnit = (style: MarkerStyle) => (style.labelScales && stage ? stage.scaleX() : 1)

/** The modal closes, the map lets go of exactly one thing, and Finish puts the modal back. */
function enterMode(what: 'place' | 'footprint' | 'label', pin: LocationItem) {
    editingPin.value = false
    stopPicking()
    placing.value = false
    selectedId.value = pin.Id
    modePin.value = pin.Id
    labelText.value = pin.Name
    mode.value = what
}

/** The compass belongs to the map, not to a place, so it is handed over by the map's editor. */
function placeCompass() {
    editingMap.value = false
    modePin.value = ''
    mode.value = 'compass'
}

/** Out of a mode without going back to any editor — what changing maps does. */
function leaveMode() {
    mode.value = null
    modePin.value = ''
    clearDesign()
}

/** Finish: save whatever was designed, then put the editor back up where it came from. */
async function finishMode() {
    const what = mode.value
    const pin = modeLoc.value
    if (what === 'label' && pin) await saveLabelDesign(pin)
    leaveMode()
    if (what === 'compass') editingMap.value = true
    else if (pin) editingPin.value = true
}

// A mode changes what is draggable, which is drawn into the nodes themselves.
watch(mode, () => redrawPins())
watch(labelText, () => designPlace?.())

/**
 * What the designer drew, stored the way every other marker field is: the difference from what this
 * map's places look like anyway, so the line is this pin's and the rest keeps following the map.
 */
async function saveLabelDesign(pin: LocationItem) {
    const map = current.value
    if (!map || !designGroup) return
    const style = pinMarkerStyle(pin, map)
    const { mid, len, angle } = labelGeometry()
    const unit = labelUnit(style)
    style.labelDx = Math.round(mid.x / unit)
    style.labelDy = Math.round(mid.y / unit)
    style.labelW = Math.round(len / unit)
    style.labelAngle = Math.round(angle)
    // `labelSide` is left alone: a drawn line is reason enough to draw the name, hidden or not.
    pin.Name = labelText.value.trim() || pin.Name
    pin.MarkerStyle = serializeMarker(diffMarker(style, mapMarkerStyle(map)))
    try {
        await BackendAPI.SaveLocation(pin)
    } catch (ex) {
        failed('Could not save the label', ex)
    }
}

function clearDesign() {
    designGroup?.destroy()
    designGroup = null
    designPlace = null
    layer?.batchDraw()
}

/**
 * The label designer: the name standing on a line with an end to drag at either side. The line is the
 * whole of the setting — how long it is *is* the text size, and how it tilts is the label's angle, so
 * the two numbers a writer could never picture are now the thing they are looking at. Dragging the name
 * itself moves the line with it, and shift on an end keeps the line straight.
 *
 * It hangs off the pin inside `pinLayer`, so it is inverse-scaled with every other marker and stays the
 * same size on screen at every zoom — which is what the label it stands for is.
 */
function drawDesign() {
    clearDesign()
    const map = current.value
    const pin = modeLoc.value
    if (!pinLayer || !stage || !map || !pin || mode.value !== 'label') return

    const style = pinMarkerStyle(pin, map)
    const start = labelStartLine(style, pin.Name, !!pin.ChildMapId)
    // A line already drawn for a ground-written name is in map pixels and has to come up to the screen.
    // A line being drawn for the first time was measured off the text itself, so it is screen pixels
    // already — which is also why the first drag of a ground-written name is where its scale is decided.
    const unit = labelDesigned(style) ? labelUnit(style) : 1
    const rad = (start.angle * Math.PI) / 180
    const len = start.len * unit
    const mid = { x: start.dx * unit, y: start.dy * unit }
    const half = { x: (Math.cos(rad) * len) / 2, y: (Math.sin(rad) * len) / 2 }
    labelEnds = {
        a: { x: mid.x - half.x, y: mid.y - half.y },
        b: { x: mid.x + half.x, y: mid.y + half.y },
    }

    const anchor = new Konva.Group({ x: pin.X * baseW, y: pin.Y * baseH })
    const line = new Konva.Group({ draggable: true })
    const rule = new Konva.Line({
        stroke: '#818cf8', strokeWidth: 2, dash: [6, 4],
        strokeScaleEnabled: false, hitStrokeWidth: 14,
    })
    // Listening, and inside the draggable group: dragging the name is dragging its line.
    const text = new Konva.Text({
        fontFamily: style.labelFont, fontStyle: '600', fill: style.labelColor ?? '#e2e8f0',
    })
    const ends = [0, 1].map(() => new Konva.Circle({
        radius: 6, fill: '#818cf8', stroke: '#0f172a', strokeWidth: 1.5,
        strokeScaleEnabled: false, draggable: true,
    }))
    /** One line's width at one pixel of font size: text width is linear in it, so it is measured once. */
    const probe = new Konva.Text({ fontSize: 100, fontFamily: style.labelFont, fontStyle: '600' })

    const place = () => {
        const { mid, len, angle } = labelGeometry()
        probe.text(labelText.value || 'Name')
        text.text(probe.text())
        text.fontSize(fitFontSize(len, probe.width() / 100))
        line.position(mid)
        line.rotation(angle)
        rule.points([-len / 2, 0, len / 2, 0])
        // Standing on the line, centred across it — the same lift `buildMarker` draws it with.
        text.position({ x: -text.width() / 2, y: -text.height() - LABEL_LIFT })
        ends[0]!.position({ x: -len / 2, y: 0 })
        ends[1]!.position({ x: len / 2, y: 0 })
        layer?.batchDraw()
    }

    const cursor = (node: Konva.Node, shape: string) => {
        node.on('mouseenter', () => { if (stage) stage.container().style.cursor = shape })
        node.on('mouseleave', () => { if (stage) stage.container().style.cursor = '' })
    }
    cursor(rule, 'move')
    cursor(text, 'move')

    // The group moved; the ends it was built from have to agree, or the next drag jumps back.
    line.on('dragmove', () => {
        const { mid } = labelGeometry()
        const dx = line.x() - mid.x
        const dy = line.y() - mid.y
        for (const end of [labelEnds.a, labelEnds.b]) {
            end.x += dx
            end.y += dy
        }
    })
    ends.forEach((handle, i) => {
        cursor(handle, 'grab')
        handle.on('dragmove', e => {
            // In the anchor's frame, which is screen pixels from the pin — what is stored.
            const at = anchor.getRelativePointerPosition()
            if (!at) return
            const other = i === 0 ? labelEnds.b : labelEnds.a
            const moved = lockAxis(other, at, e.evt.shiftKey)
            if (i === 0) labelEnds.a = moved
            else labelEnds.b = moved
            place()
        })
    })

    line.add(rule)
    line.add(text)
    for (const handle of ends) line.add(handle)
    anchor.add(line)
    pinLayer.add(anchor)
    designGroup = anchor
    designPlace = place
    place()
}

// ── The compass: where it sits, how big, and which way is north ───────────────

const rose = ref<HTMLElement | null>(null)

/** Never nothing — a rose of no size could not be grabbed to make it bigger again. */
const compassSize = (map: MapItem | null) => Math.min(160, Math.max(24, map?.CompassSize || 38))

/**
 * Where the rose sits: its stored 0..1 of the free space in the view, so a map placed on a wide
 * window still has its compass on screen on a narrow one.
 */
const compassStyle = computed(() => {
    const map = current.value
    const size = compassSize(map)
    return {
        width: `${size}px`,
        height: `${size}px`,
        left: `${12 + clamp01(map?.CompassX ?? 1) * Math.max(0, viewW.value - size - 24)}px`,
        top: `${12 + clamp01(map?.CompassY ?? 0) * Math.max(0, viewH.value - size - 24)}px`,
    }
})

/**
 * A drag on a piece of the map's furniture: `move` gets every step of it and letting go saves the
 * map, since all three of these write a column.
 */
function dragFurniture(move: (ev: PointerEvent) => void) {
    const map = current.value
    if (!map) return
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        BackendAPI.SaveMap(map).catch(ex => failed('Could not save the compass', ex))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
}

/**
 * Drag the rose and the needle follows the pointer — but which of the two angles gives way depends on
 * which one the reader is entitled to move.
 *
 * In *Place the compass* it is the map's own north, a fact about a picture that was not drawn square, and
 * it is saved. Any other time it is the view: the needle is held still under the finger and the map turns
 * under it, which is a reader tilting a map on a table and is not written down anywhere.
 */
function turnNorth(e: PointerEvent) {
    const map = current.value
    const box = rose.value?.getBoundingClientRect()
    if (!map || !box) return
    // Where the needle is being pointed — the same reading the dial takes.
    const aimed = (ev: PointerEvent) => aimedAt(box, ev)

    if (mode.value === 'compass') {
        // The needle on screen is drawn at `NorthOffset + viewRot`, so a turned view has to come back out
        // of the angle before it is stored — otherwise placing north while tilted stores the tilt too.
        const move = (ev: PointerEvent) => {
            map.NorthOffset = Math.round((aimed(ev) - viewRot.value + 360) % 360)
        }
        dragFurniture(move)
        move(e)
        return
    }

    const move = (ev: PointerEvent) => turnViewTo(aimed(ev) - map.NorthOffset)
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    move(e)
}

/** Double-click: north back to up in compass mode, otherwise the map back to square. */
async function resetNorth() {
    const map = current.value
    if (!map) return
    if (mode.value !== 'compass') return straighten()
    map.NorthOffset = 0
    await BackendAPI.SaveMap(map)
}

/** The grip on the rose: the pointer becomes the middle of it, inside the view. */
function moveCompass(e: PointerEvent) {
    const map = current.value
    const host = stageHost.value?.getBoundingClientRect()
    if (!map || !host) return
    const size = compassSize(map)
    const freeW = Math.max(1, host.width - size - 24)
    const freeH = Math.max(1, host.height - size - 24)
    const move = (ev: PointerEvent) => {
        map.CompassX = clamp01((ev.clientX - host.left - 12 - size / 2) / freeW)
        map.CompassY = clamp01((ev.clientY - host.top - 12 - size / 2) / freeH)
    }
    dragFurniture(move)
    move(e)
}

/** The corner on the rose: out from where it was grabbed, in whichever direction went further. */
function sizeCompass(e: PointerEvent) {
    const map = current.value
    if (!map) return
    const from = { x: e.clientX, y: e.clientY, size: compassSize(map) }
    dragFurniture(ev => {
        const by = ((ev.clientX - from.x) + (ev.clientY - from.y)) / 2
        map.CompassSize = Math.min(160, Math.max(24, from.size + by))
    })
}

// ── The right-click menu, and a picture of the map ─────────────────────────────

/** An open menu: where it is on screen, what point of the map it is about, and whose pin if any. */
const menu = ref<{
    x: number; y: number; at: { x: number; y: number } | null; pin: string
    /** A character's menu instead: opened on their marker or their row in the list. */
    who?: string
    /** A row of the places list instead: fold the list to its depth, or open that depth if it is folded. */
    level?: { depth: number; unfold: boolean }
} | null>(null)
const menuPin = computed(() => current.value?.Locations.find(l => l.Id === menu.value?.pin) ?? null)
const menuWho = computed(() => cast.value.find(c => c.CharacterId === menu.value?.who) ?? null)

const menuEl = ref<HTMLElement | null>(null)

function openMenu(evt: MouseEvent, pinId: string) {
    menu.value = {
        x: evt.clientX,
        y: evt.clientY,
        at: imageNode?.getRelativePointerPosition() ?? null,
        pin: pinId,
    }
    void nextTick(() => menu.value && keepOnScreen(menuEl.value, menu.value))
}

function openWhoMenu(evt: MouseEvent, id: string) {
    menu.value = { x: evt.clientX, y: evt.clientY, at: null, pin: '', who: id }
    void nextTick(() => menu.value && keepOnScreen(menuEl.value, menu.value))
}

/** A row with nothing folding at its depth, or a search (which has no folds), has no menu. */
function openRowMenu(evt: MouseEvent, row: MapTreeRow) {
    const level = searching.value ? [] : foldableAt(maps.value, row.depth)
    if (!level.length) return
    const unfold = level.every(k => collapsed.value.has(k))
    menu.value = { x: evt.clientX, y: evt.clientY, at: null, pin: '', level: { depth: row.depth, unfold } }
    void nextTick(() => menu.value && keepOnScreen(menuEl.value, menu.value))
}

function foldLevel(depth: number) {
    menu.value = null
    collapsed.value = foldToDepth(maps.value, collapsed.value, depth)
}

/**
 * When a character turns up anywhere on the scrubber, earliest first: where next / previous appearance
 * steps to. A companion's life runs past the ends of a character's scrubber, and a step off the track
 * would put the handle where it cannot be drawn.
 */
const appearances = (id: string) => {
    const at = span.value
    return (stopsByCharacter.value.get(id) ?? []).map(s => s.from).filter(t => !at || (t >= at.min && t <= at.max))
}
/** Whether there is a next (1) or previous (-1) appearance to go to, for greying the entry out. */
const canAppear = (id: string, dir: 1 | -1) => stepTo(appearances(id), glideGoal ?? now.value, dir) !== null

function fromWhoMenu(what: WhoAction | 'toggle') {
    const id = menu.value?.who
    menu.value = null
    if (!id) return
    if (what === 'toggle') toggleFollow(id)
    else doForWho(what, id)
}

/** What the character menu does, here or in the cast window. */
function doForWho(what: WhoAction, id: string) {
    if (what === 'sheet') {
        BackendAPI.OpenCharactersWindow(timelineId, id).catch(ex => failed('Could not open the character', ex))
    } else if (what === 'only') {
        following.value = new Set([id])
    } else if (what === 'journey') {
        // First turn-up to last, and nobody else: their whole story as one summary map — as much of it
        // as the scrubber holds, which on a character's timeline ends where that character's does.
        const stops = stopsByCharacter.value.get(id) ?? []
        const at = span.value
        if (!stops.length || !at) return
        pausePlay()
        dateEdit.value = null
        following.value = new Set([id])
        rangeOn.value = true
        rangeFrom.value = Math.max(at.min, Math.min(...stops.map(s => s.from)))
        now.value = Math.min(at.max, Math.max(...stops.map(s => s.to)))
    } else {
        const to = stepTo(appearances(id), glideGoal ?? now.value, what === 'next' ? 1 : -1)
        pausePlay()
        if (to !== null) glideTo(to, STEP_MS, true)
    }
}

// ── The cast window: what it is told, and what it asks for ─────────────────────

/**
 * Everything the cast window shows, as it stands. Built when it is sent rather than kept as a computed:
 * the clock moves every frame while it plays, and this goes out a few times a second at most.
 */
function castSnapshot(): CastState {
    return {
        kind: 'state',
        timeOn: timeOn.value,
        cast: cast.value.map(c => ({
            id: c.CharacterId,
            name: c.Name,
            colour: colourOf(c),
            prev: canAppear(c.CharacterId, -1),
            next: canAppear(c.CharacterId, 1),
        })),
        sections: castSections.value.map(s => ({
            key: s.key,
            label: s.label,
            ids: s.members.map(m => m.CharacterId),
            colour: grouping.value === 'none' ? null : groupColour(s.label),
            own: s.label in groupColours.value,
        })),
        following: following.value && [...following.value],
        grouping: grouping.value,
        focus: focusId.value ? { id: focusId.value, name: focusName.value } : null,
        facts: rangeFacts.value,
        prefs: {
            movement: movement.value,
            trail: trailPercent.value,
            flight: flight.value,
            fade: descentFade.value,
            roads: roadsShown.value,
            places: placesShow.value,
        },
        clock: {
            at: now.value,
            from: rangeOn.value ? window0.value : null,
            text: rangeOn.value ? `${dateOf(window0.value)} – ${dateOf(now.value)}` : dateOf(now.value),
        },
        timing: import.meta.env.DEV ? { ...cost } : null,
        spotlight: spotlight.value,
        hover: hovered.value,
        detail: castDetail(),
    }
}

/** How often the window hears about a running clock: a list re-sorting itself every frame is noise. */
const CAST_SEND_MS = 150
let castTimer = 0
/**
 * Whether there is a cast window to talk to: its hello says it is, the host says when it closes. The
 * snapshot goes to every open page, so a clock playing with nobody listening is not worth sending.
 */
let castOpen = false
/** Closed by the reader while the clock ran, so turning the clock on stops opening it. Until it says hello again. */
let castDismissed = false

function sendCast() {
    window.clearTimeout(castTimer)
    castTimer = 0
    if (!castOpen) return
    BackendAPI.MapCast(castSnapshot()).catch(ex => failed('Could not update the cast window', ex))
}

/** Trailing: whatever changed in the meantime goes out with the one send. */
function queueCast() {
    if (castOpen && !castTimer) castTimer = window.setTimeout(sendCast, CAST_SEND_MS)
}

watch([
    timeOn, cast, following, grouping, focusId, sideColours, groupColours, rangeSummary, now, window0, web,
    movement, trailPercent, flight, descentFade, roadsShown, placesShow, spotlight, hovered, spotStops,
], queueCast)

// ── The cast window's charts ───────────────────────────────────────────────────

/** The chart tab the cast window has up: nobody looking, nothing worked out. */
const chartOpen = ref<ChartId | null>(null)
/** What that chart was asked about beyond the cast: a place, or two people. */
const chartAsk = ref<ChartAsk>({})

/**
 * What the open chart is worked out from: the people followed, over the range while one is open and the
 * whole story otherwise. A computed of the inputs only, like `summaryJob`: the chart itself waits for the
 * send, so a playing clock does not work it out on every frame.
 */
const chartJob = computed<ChartJob | null>(() => {
    const id = chartOpen.value
    const map = current.value
    const at = span.value
    if (!id || !timeOn.value || !map || !at) return null
    return {
        id,
        ask: chartAsk.value,
        map,
        lo: rangeOn.value ? window0.value : at.min,
        hi: rangeOn.value ? now.value : at.max,
        pinOf: pinsHere(),
        people: followed.value.map(w => ({
            id: w.CharacterId,
            name: w.Name,
            colour: colourOf(w),
            stops: stopsByCharacter.value.get(w.CharacterId) ?? [],
        })),
        // Read only by the one chart that starts from them, so picking someone out redraws no other.
        spotlight: id === 'apart' ? spotlight.value : null,
    }
})

const chartWords: ChartWords = { date: dateOf, long: howLong, leg: (a, b) => legLength.value(a, b) }
let chartTimer = 0
/** Whether the chart in the window is for a range the handles have since left. */
let chartStale = false

/** As often as the list at most, and not at all while the handles are held — see `queueSummary`. */
function queueChart() {
    if (holding.value) {
        chartStale = true
        return
    }
    if (!chartTimer) chartTimer = window.setTimeout(sendChart, CAST_SEND_MS)
}

function sendChart() {
    window.clearTimeout(chartTimer)
    chartTimer = 0
    const job = chartJob.value
    if (!job || !castOpen) return
    // A hand came down on the scrubber while this one was waiting to go.
    if (holding.value) return queueChart()
    let chart: ChartState
    try {
        chart = buildChart(job, chartWords)
    } catch (ex) {
        return failed('Could not work the chart out', ex)
    }
    BackendAPI.MapCast(chart).catch(ex => failed('Could not send the chart to the cast window', ex))
}

watch(chartJob, queueChart)
watch(holding, held => {
    if (held || !chartStale) return
    chartStale = false
    queueChart()
})

/** A click on a chart: the clock to there. A window keeps its length and slides with it. */
function setClock(at: number) {
    const s = span.value
    if (!s) return
    const to = Math.min(s.max, Math.max(s.min, at))
    pausePlay()
    if (!rangeOn.value) return glideTo(to, STEP_MS, true)
    const len = now.value - window0.value
    now.value = Math.max(to, s.min + len)
    rangeFrom.value = now.value - len
}

function onCastMessage(data: BridgeMessage) {
    // A window shut with a name under the pointer never says it left.
    if (data?.action === 'MapCastClosed') {
        // Shut by hand with the clock still on: it stays shut until asked for, not back on the next toggle.
        if (timeOn.value) castDismissed = true
        castOpen = false
        chartOpen.value = null
        hovered.value = null
    }
    if (data?.action !== 'MapCast') return
    const m = data.payload as CastCommand | CastState | ChartState
    switch (m?.kind) {
        // A window just opened starts on its people tab.
        case 'hello': castOpen = true; castDismissed = false; chartOpen.value = null; sendCast(); break
        case 'follow': following.value = m.ids ? new Set(m.ids) : null; break
        case 'group': grouping.value = m.grouping; break
        case 'colour': setGroupColour(m.group, m.colour); break
        case 'unfocus': focusId.value = null; break
        case 'who': doForWho(m.what, m.id); break
        case 'prefs': setPrefs(m.prefs); break
        case 'tab':
            chartOpen.value = m.tab === 'people' ? null : m.tab
            chartAsk.value = m.ask ?? {}
            break
        case 'clock': setClock(m.at); break
        case 'spot':
            // Picked out has to be drawn: someone not followed is followed first.
            if (m.id && !isFollowed(m.id)) toggleFollow(m.id)
            spotlight.value = m.id
            break
        case 'hover': hovered.value = m.id; break
        case 'key': if (timeOn.value && !rangeOn.value) timeKey(m.key); break
        case 'fly': flyToWho(m.id).catch(ex => failed('Could not go to them', ex)); break
    }
}

function openCastWindow(activate: boolean) {
    BackendAPI.OpenMapCastWindow(timelineId, activate)
        .then(r => {
            // In a browser, opened with no click behind it: pop-ups need one.
            if (r?.status === 'blocked') say('The browser held back the Who is where window — the people button opens it.', 8000)
        })
        .catch(ex => failed('Could not open the cast window', ex))
}

// It comes and goes with the clock. Nobody to list is no reason for a window.
watch(timeOn, on => {
    if (on) {
        if (cast.value.length && !castDismissed) openCastWindow(false)
    } else {
        BackendAPI.CloseMapCastWindow().catch(ex => failed('Could not close the cast window', ex))
    }
})

/** Whether the next measuring click is the far end of one already started. */
const measuringFrom = computed(() => picking.value === 'measure' && pickPoints.value.length === 1)

/** Measure from where the menu was opened — or to there, if one end is already down. */
function measureHere() {
    const at = menu.value?.at
    menu.value = null
    if (!at) return
    const first = measuringFrom.value ? pickPoints.value[0]! : null
    startPicking('measure')
    pickPoints.value = first ? [first, at] : [at]
    pickHover = null
    drawPickMarks()
}

/**
 * The view as a PNG, at twice the window's resolution.
 * ponytail: what is on screen, not the whole map at full size — a map is already a picture with a
 * frame the reader chose. Whole-map export is `toCanvas` over the image's own box, once the sharper
 * copy is known to be the one loaded.
 */
async function mapBlob(): Promise<Blob> {
    if (!stage) throw new Error('the map is not drawn yet')
    const shot = stage.toCanvas({
        x: 0, y: 0, width: stage.width(), height: stage.height(), pixelRatio: 2,
    })
    const out = document.createElement('canvas')
    out.width = shot.width
    out.height = shot.height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('this window would not give the page a 2D canvas')
    // The stage is transparent wherever the map is not, and a picture wants something behind it.
    ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--app-bg').trim() || '#0f172a'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(shot, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
        out.toBlob(b => (b ? resolve(b) : reject(new Error('the picture would not encode as a PNG'))), 'image/png')
    })
}

async function copyPicture() {
    menu.value = null
    try {
        // `ClipboardItem` is missing outside a secure context, which a `file://` build is.
        if (typeof ClipboardItem === 'undefined') {
            throw new Error('this window has no clipboard access — save the picture instead')
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await mapBlob() })])
        say('Picture copied.')
    } catch (ex) {
        failed('Could not copy the picture', ex)
    }
}

async function savePicture() {
    menu.value = null
    let url = ''
    try {
        url = URL.createObjectURL(await mapBlob())
        const a = document.createElement('a')
        a.href = url
        a.download = `${(current.value?.Name || 'map').replace(/[^\w -]+/g, '').trim() || 'map'}.png`
        a.click()
        say('Picture saved.')
    } catch (ex) {
        failed('Could not save the picture', ex)
    } finally {
        // The click is synchronous, so the download has the URL by now.
        if (url) URL.revokeObjectURL(url)
    }
}

/**
 * The native menu is a list of things to do to a *web page* — reload it, view its source. None of
 * that is true of this window, so it goes, except over the text fields where it is the only cut and
 * paste a WebView offers.
 */
function noNativeMenu(evt: MouseEvent) {
    if ((evt.target as HTMLElement | null)?.closest('input, textarea, select')) return
    evt.preventDefault()
}

// ── The ruler: measuring, and telling the map its scale ───────────────────────

/** Which two-point pick is running, if any — measuring and calibrating want the same two clicks. */
const picking = ref<null | 'measure' | 'calibrate'>(null)
const pickPoints = ref<{ x: number; y: number }[]>([])
/** Where the pointer is while only one end has been picked: the far end of the rubber-band line. */
let pickHover: { x: number; y: number } | null = null
const calLength = ref(10)
const calUnit = ref('miles')
const calError = ref('')

/** What the two picked points are apart, in the map's own units. */
const pickedUnits = computed(() => {
    const [a, b] = pickPoints.value
    return current.value && a && b ? distanceInUnits(current.value, baseWidth.value, a, b) : 0
})

/** The scale bar: how wide it should be at this zoom, and the round number it reads. */
const bar = computed(() =>
    current.value ? scaleBar(current.value, baseWidth.value, zoom.value) : { px: 0, label: '' })

function startPicking(what: 'measure' | 'calibrate') {
    if (!current.value?.OverviewPath) return
    placing.value = false
    picking.value = what
    calError.value = ''
    calLength.value = current.value.ScaleLength
    calUnit.value = current.value.ScaleUnit
    clearPickPoints()
}

function stopPicking() {
    picking.value = null
    clearPickPoints()
}

function clearPickPoints() {
    pickPoints.value = []
    pickHover = null
    drawPickMarks()
}

/** Dropping a pin and measuring both want the map's clicks, so starting one ends the other. */
function startPlacing() {
    stopPicking()
    placing.value = !placing.value
}

/**
 * Where the click landed, in image pixels. A third click starts a fresh pair, and shift on the second
 * one takes the straight line the rubber band was already showing.
 */
function addPickPoint(lock = false) {
    const at = imageNode?.getRelativePointerPosition()
    if (!at) return
    const first = pickPoints.value[0]
    pickPoints.value = pickPoints.value.length >= 2
        ? [at]
        : [...pickPoints.value, first ? lockAxis(first, at, lock) : at]
    pickHover = null
    calError.value = ''
    drawPickMarks()
}

/** A white line in a dark edge, drawn twice — one colour was always invisible on somebody's map. */
function measureLine(a: { x: number; y: number }, b: { x: number; y: number }, dashed: boolean) {
    return ([['#0f172a', 4.5], ['#ffffff', 1.6]] as const).map(([stroke, strokeWidth]) =>
        new Konva.Line({
            points: [a.x, a.y, b.x, b.y],
            stroke, strokeWidth,
            dash: dashed ? [7, 5] : undefined,
            lineCap: 'round', strokeScaleEnabled: false,
        }))
}

/** What the line measures, on the line and on a plate: a bare number on a map cannot be read. */
function distanceTag(a: { x: number; y: number }, b: { x: number; y: number }) {
    const map = current.value!
    const tag = new Konva.Label({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, name: 'pick-mark' })
    tag.add(new Konva.Tag({ fill: '#0f172aee', stroke: '#ffffff59', strokeWidth: 1, cornerRadius: 3 }))
    tag.add(new Konva.Text({
        text: `${formatDistance(distanceInUnits(map, baseWidth.value, a, b))} ${map.ScaleUnit}`,
        fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif', fontStyle: '600',
        fill: '#e2e8f0', padding: 4,
    }))
    tag.offset({ x: tag.width() / 2, y: tag.height() / 2 })
    return tag
}

/**
 * Crosses where the clicks landed, the line between them, and how far that is. With only one click
 * down the line runs to the pointer instead, dashed, so what the second click will do is visible.
 */
function drawPickMarks() {
    if (!marks) return
    marks.destroyChildren()
    const [a, b] = pickPoints.value
    const far = b ?? pickHover
    if (a && far) {
        for (const line of measureLine(a, far, !b)) marks.add(line)
        if (current.value) marks.add(distanceTag(a, far))
    }
    for (const p of pickPoints.value) {
        const cross = new Konva.Group({ x: p.x, y: p.y, name: 'pick-mark' })
        for (const points of [[-7, 0, 7, 0], [0, -7, 0, 7]]) {
            cross.add(new Konva.Line({ points, stroke: '#0f172a', strokeWidth: 4, lineCap: 'round' }))
            cross.add(new Konva.Line({ points, stroke: '#ffffff', strokeWidth: 1.6, lineCap: 'round' }))
        }
        marks.add(cross)
    }
    scalePins()
    layer?.batchDraw()
}

/**
 * The distance the writer typed for the two points they picked, which is what the map's scale now
 * means. Both this and typing a number into the editor write the same three columns.
 */
async function applyCalibration() {
    const map = current.value
    const [a, b] = pickPoints.value
    if (!map || !a || !b) return
    const fraction = Math.hypot(b.x - a.x, b.y - a.y) / baseW
    if (!(fraction > 0.002)) {
        calError.value = 'Those are practically the same spot — pick two points further apart.'
        return
    }
    if (!(calLength.value > 0)) {
        calError.value = 'A distance has to be more than nothing.'
        return
    }
    map.ScaleFraction = fraction
    map.ScaleLength = calLength.value
    map.ScaleUnit = calUnit.value.trim() || 'miles'
    await BackendAPI.SaveMap(map)
    stopPicking()
}

// ── Pins ──────────────────────────────────────────────────────────────────────

async function select(id: string) {
    selectedId.value = id
    pinItems.value = await BackendAPI.GetLocationItems(id) ?? []
}

/** Where the last click landed, as fractions of the image. */
async function placePin() {
    const at = imageNode?.getRelativePointerPosition()
    if (!at) return
    placing.value = false
    await addPlaceAt(at)
}

/** A new place at one point of the image — from the Add place click, or from the menu's own spot. */
async function addPlaceAt(at: { x: number; y: number }) {
    const map = current.value
    if (!map) return
    try {
        const saved = await BackendAPI.SaveLocation({
            MapId: map.Id,
            Name: 'New place',
            X: clamp01(at.x / baseW),
            Y: clamp01(at.y / baseH),
        })
        if (!saved?.location) return
        map.Locations.push(saved.location)
        redrawPins()
        await select(saved.location.Id)
        // A pin called "New place" is worth naming straight away, so the editor opens on it.
        editingPin.value = true
    } catch (ex) {
        failed('Could not add a place', ex)
    }
}

/** The menu's "Add a place here": where it was opened, not where the next click lands. */
function placeHere() {
    const at = menu.value?.at
    menu.value = null
    if (at) void addPlaceAt(at)
}

/** Everything the menu offers about one place, with the menu shut behind it. */
function fromMenu(what: 'enter' | 'edit' | 'move' | 'footprint' | 'label' | 'delete') {
    const pin = menuPin.value
    menu.value = null
    if (!pin) return
    switch (what) {
        case 'enter': if (pin.ChildMapId) void descend(pin.ChildMapId, pin); return
        case 'edit': editingPin.value = true; return
        case 'delete': confirmDelete.value = { what: 'pin', name: pin.Name }; return
        case 'move': return enterMode('place', pin)
        default: return enterMode(what, pin)
    }
}

/**
 * What the editor modal came back with.
 * ponytail: no cycle check past the modal's own "not this map". A writer who points two pins at each
 * other's maps gets a loop the trail walks them out of, which is not worth a graph search.
 */
async function applyPinEdits(patch: Partial<LocationItem>) {
    const pin = selected.value
    if (!pin) return
    editingPin.value = false
    Object.assign(pin, patch)
    await savePin()
}

async function savePin() {
    const pin = selected.value
    if (!pin) return
    await BackendAPI.SaveLocation(pin)
    redrawPins()
}

/** A pin that needs a map of its own: make one, hang it off the pin, and go in. */
async function mapFromPin() {
    const pin = selected.value
    if (!pin) return
    const saved = await BackendAPI.SaveMap({ TimelineId: timelineId, Name: pin.Name })
    if (!saved?.map) return
    pin.ChildMapId = saved.map.Id
    await BackendAPI.SaveLocation(pin)
    await reload(currentId.value)
    await show(saved.map.Id)
}

// ── Maps ──────────────────────────────────────────────────────────────────────

async function newMap() {
    const saved = await BackendAPI.SaveMap({ TimelineId: timelineId, Name: 'New map' })
    if (!saved?.map) return
    await reload(saved.map.Id)
    trail.value = [saved.map.Id]
}

/** What the map editor came back with. Closing it is the modal's own Cancel, not this. */
async function saveMapEdits(patch: Partial<MapItem>) {
    const map = current.value
    if (!map) return
    editingMap.value = false
    Object.assign(map, patch)
    // The map carries what its places look like, so changing it moves every pin that inherits.
    redrawPins()
    await BackendAPI.SaveMap(map)
}

/** The host's file dialog, which imports the picture and points the map at it in one go. */
async function importImage() {
    if (!current.value) return
    const res = await BackendAPI.SetMapPicture(current.value.Id)
    if (res?.status === 'ok' && res.Map) {
        const at = maps.value.findIndex(m => m.Id === res.Map!.Id)
        if (at >= 0) maps.value[at] = res.Map
        await drawCurrent()
    }
}

/** The map editor hands these back to the page, and gets out of the way for them. */
function fromMapModal(what: 'pick' | 'import' | 'calibrate' | 'delete') {
    editingMap.value = false
    if (what === 'pick') showPicker.value = true
    else if (what === 'import') void importImage()
    else if (what === 'calibrate') startPicking('calibrate')
    else if (current.value) confirmDelete.value = { what: 'map', name: current.value.Name }
}

async function pickImage(chosen: MediaItem[]) {
    showPicker.value = false
    const map = current.value
    const picture = chosen[0]
    if (!map || !picture) return
    map.PictureId = picture.Id
    // The drawable copies on this map are the old picture's. Forgetting them is what makes the redraw
    // ask the backend for the new one's — `ensureViews` believes a path it already has.
    map.OverviewPath = null
    map.DetailPath = null
    await BackendAPI.SaveMap(map)
    await show(map.Id, { keepTrail: true })
}

async function doDelete() {
    const what = confirmDelete.value?.what
    confirmDelete.value = null
    if (what === 'pin') {
        const pin = selected.value
        const map = current.value
        if (!pin || !map) return
        await BackendAPI.DeleteLocation(pin.Id)
        map.Locations = map.Locations.filter(l => l.Id !== pin.Id)
        selectedId.value = null
        redrawPins()
        return
    }
    if (what === 'map') {
        const map = current.value
        if (!map) return
        await BackendAPI.DeleteMap(map.Id)
        // Back up the trail if there is one, otherwise to whatever root is left.
        const up = trail.value[trail.value.indexOf(map.Id) - 1]
        trail.value = trail.value.filter(id => id !== map.Id)
        await reload(up ?? '')
    }
}

const isDesktop = !!window.chrome?.webview
</script>

<template>
    <div class="map-root" @contextmenu="noNativeMenu">
        <WindowTitleBar :title="current?.Name || 'Maps'" :subtitle="breadcrumb.join(' › ')" />

        <div class="map-bar">
            <!-- Even a single map is its own crumb: its name says more than "top level" did. -->
            <nav class="crumbs">
                <template v-for="(name, i) in breadcrumb" :key="trail[i]">
                    <PhCaretRight v-if="i" :size="11" class="crumb-sep" />
                    <button
                        class="crumb"
                        :class="{ here: i === breadcrumb.length - 1 }"
                        @click="travelTo(trail[i]!)"
                    >{{ name }}</button>
                </template>
            </nav>

            <div class="bar-actions" v-if="current">
                <button class="tool" :class="{ active: placing }" :disabled="!current.OverviewPath"
                        title="Click the map to drop a new place" @click="startPlacing">
                    <PhMapPin :size="15" /> {{ placing ? 'Click the map…' : 'Add place' }}
                </button>
                <button class="tool" :disabled="!current.OverviewPath" title="Fit the whole map in view"
                        @click="fitView">
                    <PhCrosshair :size="15" /> Fit
                </button>
                <button
                    class="tool"
                    :class="{ active: timeOn }"
                    :disabled="!span"
                    :title="!span
                        ? 'Nothing in this timeline has a place yet'
                        : timeOn
                            ? 'Turn the clock off: back to the plain map'
                            : 'Show one moment at a time: the places where something is happening stay lit'"
                    @click="toggleTime"
                >
                    <!-- On is the active style; the date is the strip's. Here it made the bar shake as it played. -->
                    <PhClock :size="15" /> Time
                </button>
            </div>
        </div>

        <div class="map-body">
            <aside class="map-side" :style="{ flexBasis: `${sideWidth}px` }">
                <section class="side-block places-block">
                    <header class="side-head">
                        <PhMapPin :size="14" /> Places
                        <button class="icon-btn" title="New top-level map" @click="newMap">
                            <PhPlus :size="14" />
                        </button>
                    </header>
                    <p v-if="loading" class="side-note">Loading…</p>
                    <p v-else-if="!maps.length" class="side-note">No maps yet. Make one, then give it an image.</p>
                    <template v-else>
                        <div class="search-row">
                            <PhMagnifyingGlass :size="13" class="search-icon" />
                            <input v-model="query" placeholder="Find a place…" />
                            <button v-if="query" class="icon-btn" title="Clear" @click="query = ''">
                                <PhX :size="12" />
                            </button>
                        </div>

                        <!--
                            One list either way. A search keeps the places above a hit on screen and
                            hides the twisties, since a pruned branch already shows everything it has.
                        -->
                        <ul class="map-list">
                            <li v-for="row in rows" :key="row.key">
                                <div
                                    class="tree-row"
                                    :style="{ paddingLeft: `${row.depth * 11}px` }"
                                    @contextmenu.prevent="openRowMenu($event, row)"
                                >
                                    <button
                                        v-if="!searching && rowHasChildren(row)"
                                        class="icon-btn twisty"
                                        :title="collapsed.has(row.key) ? 'Show what is inside' : 'Hide what is inside'"
                                        @click="toggleCollapsed(row.key)"
                                    >
                                        <PhCaretRight :size="11" :class="{ open: !collapsed.has(row.key) }" />
                                    </button>
                                    <span v-else class="twisty-gap" />
                                    <!-- Clicking a place shows it on the map it is pinned to; going
                                         inside the map behind it is the button next to the pencil. -->
                                    <button
                                        class="map-link"
                                        :class="{ here: row.loc ? row.loc.Id === selectedId : row.map.Id === currentId }"
                                        @click="goTo(row.map.Id, row.loc?.Id)"
                                    >
                                        <PhMapPin v-if="row.loc" :size="12" class="row-icon" />
                                        <PhMapTrifold v-else :size="12" class="row-icon" />
                                        {{ row.loc?.Name ?? row.map.Name }}
                                        <span v-if="row.childMap" class="pin-count">
                                            {{ row.childMap.Locations.length || '' }}
                                        </span>
                                        <span v-else-if="!row.loc" class="pin-count">
                                            {{ row.map.Locations.length || '' }}
                                        </span>
                                    </button>
                                    <button
                                        v-if="row.childMap"
                                        class="icon-btn row-edit"
                                        :title="`Go into ${row.childMap.Name}`"
                                        @click="enterRow(row)"
                                    >
                                        <PhSignIn :size="12" />
                                    </button>
                                    <button
                                        class="icon-btn row-edit"
                                        :title="row.loc ? 'Edit this place' : 'Edit this map'"
                                        @click="editRow(row)"
                                    >
                                        <PhPencilSimple :size="12" />
                                    </button>
                                </div>
                            </li>
                            <li v-if="searching && !rows.length" class="side-note">No place by that name.</li>
                        </ul>
                    </template>
                </section>

                <!--
                    Selecting a pin shows it; changing it is the deliberate act, in the modal. It is a
                    panel of its own at the foot of the bar rather than a third thing in a single
                    scroll: with the cast list above it, clicking a place used to answer somewhere off
                    the bottom of the screen.
                -->
                <section class="side-block place-block" v-if="selected">
                    <header class="side-head"><PhMapPin :size="14" /> Place</header>
                    <p class="place-name">
                        <span class="place-dot" :style="{ background: selected.Color || '#f59e0b' }" />
                        {{ selected.Name }}
                        <!-- The square, once there is a grid to cite: the point of ruling one on. -->
                        <span v-if="squareFor(selected)" class="place-square">{{ squareFor(selected) }}</span>
                    </p>
                    <p class="place-desc" :class="{ empty: !selected.Description }">
                        {{ selected.Description || 'No description yet.' }}
                    </p>
                    <p v-if="childMapOf(selected)" class="place-door">
                        Opens into {{ childMapOf(selected)!.Name }}
                    </p>
                    <div class="side-actions">
                        <button v-if="childMapOf(selected)" class="tool" @click="descend(selected.ChildMapId!, selected)">
                            <PhSignIn :size="15" /> Enter
                        </button>
                        <button class="tool" @click="editingPin = true">
                            <PhPencilSimple :size="15" /> Edit
                        </button>
                        <button v-if="!childMapOf(selected)" class="tool" @click="mapFromPin">
                            <PhPlus :size="15" /> Give it a map
                        </button>
                        <button class="tool danger" @click="confirmDelete = { what: 'pin', name: selected.Name }">
                            <PhTrash :size="15" /> Delete place
                        </button>
                    </div>

                    <p v-if="pinItems.length" class="side-head">What happened here</p>
                    <!-- Amber is going on at the clock's date; with the clock on, each is a way to its own. -->
                    <ul class="here-items">
                        <li v-for="it in pinItems" :key="it.Id" :class="{ now: nowIds.has(it.Id) }">
                            <button
                                v-if="timeOn && pinEvents.has(it.Id)"
                                class="here-go"
                                title="Take the clock to when this happened"
                                @click="setClock(pinEvents.get(it.Id)!.AbsoluteStart)"
                            >{{ it.Title }}</button>
                            <template v-else>{{ it.Title }}</template>
                        </li>
                    </ul>
                </section>
            </aside>
            <div class="side-grip" title="Drag to resize" @pointerdown="startResize" />

            <div class="map-stage-wrap">
                <div ref="stageHost" class="map-stage" />
                <div v-if="!loading && !current" class="stage-note">
                    <PhMapTrifold :size="34" />
                    <p>No maps in this timeline yet.</p>
                    <button class="tool" @click="newMap"><PhPlus :size="15" /> New map</button>
                </div>
                <div v-else-if="current && !current.PictureId" class="stage-note">
                    <PhImage :size="34" />
                    <p>“{{ current.Name }}” has no image yet.</p>
                    <button class="tool" @click="showPicker = true"><PhImage :size="15" /> Choose image…</button>
                </div>
                <div v-else-if="current?.ViewError" class="stage-note error">
                    <PhWarning :size="34" />
                    <p>{{ current.ViewError }}</p>
                </div>
                <!-- The way out, on any map that is inside another one. -->
                <button
                    v-if="upMap"
                    class="exit-up"
                    :title="`Back out to ${upMap.Name}`"
                    @click="travelTo(upMap.Id)"
                >
                    <PhSignOut :size="14" /> {{ upMap.Name }}
                </button>

                <!--
                    Everything that talks along the bottom of the map, in one column so that none of it
                    lands on top of the rest — the hint, whichever edit is running, the ages in force,
                    the clock. They used to be four things all anchored to the same 8px, and a label
                    being named disappeared under the scrubber. The clock sits lowest because it is the
                    one a hand keeps going back to, and the column grows upward off it.
                -->
                <div class="map-dock" :style="dockWidth ? { '--dock-w': `${dockWidth}px` } : undefined">
                <!-- What went wrong stays until it is dismissed; what worked says so and goes. Top of the
                     column, so it grows the stack instead of landing on the clock. -->
                <p v-if="error" class="map-flash bad">
                    {{ error }}
                    <button class="icon-btn" title="Dismiss" @click="error = ''"><PhX :size="11" /></button>
                </p>
                <p v-else-if="notice" class="map-flash">{{ notice }}</p>

                <p v-if="current?.OverviewPath && showChrome && !picking && !mode" class="stage-hint">
                    <template v-if="timeOn && span">
                        Drag the clock, or ← → to step and Space to play. Right-click a person to show only
                        them or see their journey; click a place to see what happened there.
                    </template>
                    <template v-else>
                        Scroll to zoom, drag to pan. Double-click a place with a ring to go inside;
                        right-click for the rest — measuring, a new place, a picture of the map.
                    </template>
                </p>

                <!--
                    One strip for every on-map edit: what it is for, and the way back to the editor
                    that started it. The label designer types its name in here, live on the map.
                -->
                <div v-if="mode" class="pick-strip">
                    <PhTextAa v-if="mode === 'label'" :size="14" class="strip-icon edit" />
                    <PhCompass v-else-if="mode === 'compass'" :size="14" class="strip-icon edit" />
                    <PhArrowsOutCardinal v-else :size="14" class="strip-icon edit" />
                    <template v-if="mode === 'label'">
                        <input
                            class="strip-name" type="text" v-model="labelText"
                            placeholder="Name" aria-label="What the label says"
                        />
                        <span>
                            Drag the name to move it; drag either end of its line to set how long —
                            and so how big — it is. Hold shift for a straight line.
                        </span>
                    </template>
                    <span v-else-if="mode === 'place'">
                        Drag {{ modeLoc?.Name || 'the place' }} where it belongs.
                    </span>
                    <span v-else-if="mode === 'footprint'">
                        Drag the dashed corner to set how much ground
                        {{ childMapOf(modeLoc)?.Name || 'that map' }} covers.
                    </span>
                    <span v-else>
                        Drag the compass to move it, its corner to resize it, the rose itself to turn
                        north — double-click it to put north back to up.
                    </span>
                    <button class="tool" @click="finishMode"><PhCheck :size="14" /> Finish</button>
                </div>

                <!--
                    Measuring and calibrating are the same two clicks on the map, so they are the same
                    strip: one reads the distance out, the other asks what it really is.
                -->
                <div v-if="picking && current" class="pick-strip">
                    <PhRuler :size="14" class="strip-icon" />
                    <template v-if="picking === 'measure'">
                        <span v-if="pickPoints.length < 2">Click two places to measure between.</span>
                        <span v-else class="strip-value">
                            {{ formatDistance(pickedUnits) }} {{ current.ScaleUnit }}
                        </span>
                        <button class="tool" @click="clearPickPoints">Again</button>
                        <button class="tool" @click="stopPicking">Done</button>
                    </template>
                    <template v-else>
                        <span v-if="pickPoints.length < 2">Click the two places you know the distance between.</span>
                        <template v-else>
                            <span>That is</span>
                            <input class="strip-num" type="number" min="0" step="any" v-model.number="calLength" />
                            <input class="strip-unit" type="text" list="map-scale-units" v-model="calUnit" />
                            <button class="tool" @click="applyCalibration">Set scale</button>
                        </template>
                        <button class="tool" @click="stopPicking">Cancel</button>
                    </template>
                    <span v-if="calError" class="strip-error">{{ calError }}</span>
                </div>

                <!--
                    One moment of the story. Drag it, step it between the instants where something
                    actually changes, or press play and watch it run: the pins stay where they are — a
                    town does not move — and the ones with something happening stay lit. It steps aside
                    for the editing strips, which are about something the reader is doing.
                -->
                <template v-if="timeOn && span">
                    <!--
                        What the reader would have to already know to make sense of what they are
                        watching: the ages, reigns and wars still running. Named rather than drawn — a
                        wash of colour over the ground an age covers would claim a border the story
                        never drew, and most of these have no edge on any map at all.
                    -->
                    <div v-if="backdrop.length" class="age-strip" :title="backdrop.map(ev => ev.Title).join('\n')">
                        <PhHourglassMedium :size="12" />
                        <span class="age-names">{{ backdropNames.join(' · ') }}</span>
                        <span v-if="backdropMore" class="age-more">+{{ backdropMore }}</span>
                    </div>

                    <!-- A thinned cast says so, and how to undo it: "only their journey" left no other sign. -->
                    <button
                        v-if="following"
                        class="age-strip shown-chip"
                        title="Put everyone back on the map"
                        @click="following = null"
                    >
                        <PhUsers :size="12" />
                        Showing {{ followed.length }} of {{ cast.length }} · <b>Show all</b>
                    </button>

                    <!-- A date typed rather than dragged to, in the timeline's own calendar. -->
                    <div
                        v-if="dateEdit"
                        class="date-edit"
                        @keydown.enter.prevent="applyDate"
                        @keydown.esc.prevent="dateEdit = null"
                    >
                        <span class="range-tag">{{ !rangeOn ? 'Go to' : dateEdit.which === 'from' ? 'From' : 'To' }}</span>
                        <input
                            v-model.number="dateEdit.day"
                            class="strip-num day"
                            type="number"
                            min="1"
                            :max="dateEditDays"
                            aria-label="Day"
                        />
                        <select
                            v-if="calendarCfg.months.length"
                            v-model.number="dateEdit.month"
                            class="strip-unit month"
                            aria-label="Month"
                        >
                            <option v-for="(m, i) in calendarCfg.months" :key="i" :value="i">{{ m.name }}</option>
                        </select>
                        <input ref="yearInput" v-model.number="dateEdit.year" class="strip-num" type="number" aria-label="Year" />
                        <button class="tool" @click="applyDate">Go</button>
                        <button class="nav" title="Cancel" @click="dateEdit = null"><PhX :size="12" /></button>
                    </div>

                    <div class="time-strip">
                        <div class="dock-grip" title="Drag to make the clock wider or narrower" @pointerdown="startDockResize" />
                        <!--
                            One date: step, play, or drag. A window: the stepper and player go, because
                            everything between the two handles is already on the map at once, and the
                            dates at either end say what it covers.
                        -->
                        <span v-if="!rangeOn" class="time-lead">
                            <button
                                class="nav"
                                :disabled="stepTo(beats, now, -1) === null"
                                title="Back to the previous thing that happened (←)"
                                @click="step(-1)"
                            >
                                <PhSkipBack :size="13" weight="fill" />
                            </button>
                            <button
                                class="nav"
                                :title="playing ? 'Pause (Space)' : 'Play: walk from one happening to the next (Space)'"
                                @click="playing ? pausePlay() : startPlay()"
                            >
                                <PhPause v-if="playing" :size="13" weight="fill" />
                                <PhPlay v-else :size="13" weight="fill" />
                            </button>
                            <button
                                class="nav"
                                :disabled="stepTo(beats, now, 1) === null"
                                title="On to the next thing that happens (→)"
                                @click="step(1)"
                            >
                                <PhSkipForward :size="13" weight="fill" />
                            </button>
                        </span>
                        <button
                            class="strip-value date-btn"
                            :title="rangeOn ? 'Type where the date range starts' : 'Type a date to go to'"
                            @click="openDateEdit(rangeOn ? 'from' : 'at')"
                        >
                            <span>{{ dateOf(rangeOn ? window0 : now) }}</span>
                            <span v-for="s in dateSizers" :key="s" class="sizer" aria-hidden="true">{{ s }}</span>
                        </button>
                        <!-- Dragging it while it plays is a fight, so the drag wins and play stops. -->
                        <TimeTrack
                            v-model:at="now"
                            :from="rangeOn ? rangeFrom : null"
                            :min="span.min"
                            :max="span.max"
                            :ticks="beats"
                            :step="oneDay"
                            :label="dateOf"
                            @update:from="v => (rangeFrom = v)"
                            @grab="pausePlay"
                            @hold="h => (holding = h)"
                        />
                        <button
                            v-if="rangeOn"
                            class="strip-value date-btn"
                            title="Type where the date range ends"
                            @click="openDateEdit('at')"
                        >
                            <span>{{ dateOf(now) }}</span>
                            <span v-for="s in dateSizers" :key="s" class="sizer" aria-hidden="true">{{ s }}</span>
                        </button>
                        <span class="time-tail">
                            <select
                                v-if="!rangeOn"
                                v-model.number="speed"
                                class="strip-unit"
                                title="How fast play walks: at 1× each step to the next happening takes half a second"
                            >
                                <option v-for="s in SPEEDS" :key="s.v" :value="s.v">{{ s.name }}</option>
                            </select>
                            <!-- One date, or everything between two of them. -->
                            <button
                                class="nav"
                                :class="{ on: rangeOn }"
                                :title="rangeOn
                                    ? 'Back to one date at a time'
                                    : 'Open a date range: every path between the two dates, drawn at once'"
                                @click="toggleRange"
                            >
                                <PhArrowsHorizontal :size="13" weight="bold" />
                            </button>
                            <!-- Hand the view over to the cast, or take it back. A camera, not Fit's crosshair. -->
                            <button
                                class="nav"
                                :class="{ on: autoFollow }"
                                :title="autoFollow
                                    ? 'Stop flying with them: the map stays where you put it'
                                    : 'Fly with the people on the map: into the closest map that holds all of them, and back out when they part'"
                                @click="toggleAutoFollow"
                            >
                                <PhVideoCamera :size="13" />
                            </button>
                            <!-- The cast lives in its own window; this brings it back if it was closed. -->
                            <button
                                class="nav"
                                title="Who is where: the cast, in its own window"
                                @click="openCastWindow(true)"
                            >
                                <PhUsers :size="13" />
                            </button>
                            <!-- An empty range is worth saying; an instant between two happenings is just the clock. -->
                            <span class="time-count" :title="happeningHere.map(ev => ev.Title).join('\n')">
                                <span>{{ happeningHere.length ? `${happeningHere.length} event${happeningHere.length === 1 ? '' : 's'}` : rangeOn ? 'nothing here' : '' }}</span>
                                <span class="sizer" aria-hidden="true">nothing here</span>
                                <span class="sizer" aria-hidden="true">88 events</span>
                            </span>
                        </span>
                    </div>
                </template>
                </div>

                <!--
                    A bar that says how far, in the units the writer gave, at whatever zoom this is. On
                    its own chip: over a map it can be any colour, a bare hairline and pale text were
                    invisible on half of them.
                -->
                <div v-if="current?.OverviewPath" class="scale-bar">
                    <span class="scale-label">{{ bar.label }}</span>
                    <span class="scale-line" :style="{ width: `${Math.round(bar.px)}px` }" />
                </div>

                <!--
                    North, as the writer set it, plus however the reader is holding the map — the needle
                    is where north is *on screen*, so it keeps pointing at the same ground while the view
                    turns. Where the rose sits and how big it is belong to the map, like its own angle
                    does, and neither of those moves until "Place the compass" is running.
                -->
                <div
                    v-if="current?.OverviewPath"
                    ref="rose"
                    class="compass"
                    :class="{ live: mode === 'compass' }"
                    :style="compassStyle"
                    :title="mode === 'compass'
                        ? `North is ${Math.round(current.NorthOffset)}° from up on this map — drag the rose to turn it, double-click to reset`
                        : `North is ${Math.round(current.NorthOffset)}° from up on this map — drag the rose to turn the view, double-click to square it up`"
                    @pointerdown.prevent="turnNorth"
                    @dblclick="resetNorth"
                >
                    <svg viewBox="-20 -20 40 40" :style="{ transform: `rotate(${current.NorthOffset + viewRot}deg)` }">
                        <circle r="17" class="rose-ring" />
                        <polygon points="0,-13 4.5,1 0,-2 -4.5,1" class="rose-needle" />
                        <polygon points="0,13 4.5,-1 0,2 -4.5,-1" class="rose-tail" />
                        <text y="-6.5" class="rose-n">N</text>
                    </svg>
                    <template v-if="mode === 'compass'">
                        <button class="rose-grip move" title="Move the compass" @pointerdown.prevent.stop="moveCompass">
                            <PhArrowsOutCardinal :size="11" />
                        </button>
                        <button class="rose-grip size" title="Resize the compass" @pointerdown.prevent.stop="sizeCompass" />
                    </template>
                </div>

                <!-- The view tools, stacked above the ⓘ, with the ruler beside it. -->
                <div v-if="current?.OverviewPath && showChrome" class="nav-pad">
                    <button class="nav" title="Pan up" @click="panBy(0, 1)">
                        <PhCaretUp :size="14" weight="bold" />
                    </button>
                    <div class="nav-mid">
                        <button class="nav" title="Pan left" @click="panBy(1, 0)">
                            <PhCaretLeft :size="14" weight="bold" />
                        </button>
                        <button class="nav" title="Fit the whole map in view" @click="fitView">
                            <PhCrosshair :size="14" weight="bold" />
                        </button>
                        <button class="nav" title="Pan right" @click="panBy(-1, 0)">
                            <PhCaretRight :size="14" weight="bold" />
                        </button>
                    </div>
                    <button class="nav" title="Pan down" @click="panBy(0, -1)">
                        <PhCaretDown :size="14" weight="bold" />
                    </button>
                    <div class="nav-mid">
                        <button class="nav" title="Zoom in" @click="zoomBy(1.25)">
                            <PhPlus :size="14" weight="bold" />
                        </button>
                        <button class="nav" title="Zoom out" @click="zoomBy(0.8)">
                            <PhMinus :size="14" weight="bold" />
                        </button>
                    </div>
                    <!--
                        Turning the map. Drag the dial anywhere round the ring and the map follows the
                        pointer; the ring itself carries the grip, so the angle it is held at is legible
                        without reading the number. The number is there anyway, and does not turn with it.
                    -->
                    <div
                        ref="dial"
                        class="dial"
                        :title="`Held at ${degrees}° — drag to turn the map, double-click to square it up`"
                        @pointerdown.prevent="turnDial"
                        @dblclick="straighten"
                    >
                        <svg viewBox="-20 -20 40 40" :style="{ transform: `rotate(${viewRot}deg)` }">
                            <circle r="16" class="dial-track" />
                            <circle cy="-16" r="3.6" class="dial-grip" />
                        </svg>
                        <span class="dial-read">{{ degrees }}°</span>
                    </div>
                    <!-- The same turn in steps, for a reader who wants to count them — and for the keyboard. -->
                    <div class="nav-mid">
                        <button class="nav" title="Turn the map left" @click="turnViewBy(-TURN_STEP)">
                            <PhArrowArcLeft :size="14" weight="bold" />
                        </button>
                        <button class="nav" :disabled="!viewRot" title="Square the map up again" @click="straighten">
                            <PhArrowLineUp :size="14" weight="bold" />
                        </button>
                        <button class="nav" title="Turn the map right" @click="turnViewBy(TURN_STEP)">
                            <PhArrowArcRight :size="14" weight="bold" />
                        </button>
                    </div>
                    <button
                        class="nav"
                        :class="{ on: showGrid }"
                        :title="showGrid
                            ? `Hide the grid — ${grid?.cols ?? 0} squares across (Edit map to change)`
                            : 'Show the lettered grid'"
                        @click="showGrid = !showGrid"
                    >
                        <PhGridFour :size="14" weight="bold" />
                    </button>
                    <!--
                        How a journey across several maps is shown. Both live here rather than in the
                        settings modal because a reader works out that nine dissolves are too many
                        while they are watching the ninth, not while they are setting the map up.
                    -->
                    <div class="nav-mid">
                        <button class="nav" :title="flightHint" @click="cycleFlight">
                            <PhPath v-if="flight === 'full'" :size="14" weight="bold" />
                            <PhAirplaneTilt v-else-if="flight === 'ends'" :size="14" weight="bold" />
                            <PhLightning v-else :size="14" weight="bold" />
                        </button>
                        <button
                            class="nav"
                            :class="{ on: descentFade }"
                            :disabled="flight === 'cut'"
                            :title="descentFade
                                ? 'Stop dissolving between one map and the next'
                                : 'Dissolve between one map and the next'"
                            @click="toggleFade"
                        >
                            <PhCircleHalf :size="14" weight="bold" />
                        </button>
                    </div>
                </div>

                <!-- The current map's own card, over the map rather than beside the selected place. -->
                <MapInfoPanel
                    v-if="current && showInfo"
                    :map="current"
                    :places="current.Locations.length"
                    @close="toggleInfo"
                    @edit="editingMap = true"
                />
                <button
                    v-if="current?.OverviewPath"
                    class="info-toggle measure-toggle"
                    :class="{ active: picking === 'measure' }"
                    title="Measure between two places"
                    @click="picking === 'measure' ? stopPicking() : startPicking('measure')"
                >
                    <PhRuler :size="16" />
                </button>
                <!--
                    Clears the map of the things that only drive it. The scale bar and the compass are
                    not among them — they are how a map is read, and belong on it the way they belong
                    on a printed one. This button stays put too: a switch that hides the way back to
                    itself is a trap.
                -->
                <button
                    v-if="current?.OverviewPath"
                    class="info-toggle chrome-toggle"
                    :class="{ active: showChrome }"
                    :title="showChrome
                        ? 'Hide the map controls — the pan and zoom pad, and the hint under it'
                        : 'Show the map controls'"
                    @click="toggleChrome"
                >
                    <PhSlidersHorizontal :size="16" />
                </button>
                <button
                    v-if="current"
                    class="info-toggle"
                    :class="{ active: showInfo }"
                    :title="showInfo ? 'Hide the map panel' : 'Show the map panel'"
                    @click="toggleInfo"
                >
                    <PhInfo :size="17" />
                </button>

            </div>
        </div>
    </div>

    <!-- ── Right-click menu ────────────────────────────────────────────────── -->
    <div v-if="menu && menuWho" ref="menuEl" class="map-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
        <p class="menu-title">
            <span class="place-dot" :style="{ background: colourOf(menuWho) }" /> {{ menuWho.Name }}
        </p>
        <button @click="fromWhoMenu('sheet')"><PhUser :size="14" /> Open their character sheet</button>
        <hr />
        <!-- Shown or not, in the same words as the cast window's list. -->
        <button @click="fromWhoMenu('only')"><PhUserFocus :size="14" /> Show only {{ menuWho.Name }}</button>
        <button @click="fromWhoMenu('toggle')">
            <template v-if="isFollowed(menuWho.CharacterId)"><PhUserMinus :size="14" /> Hide from the map</template>
            <template v-else><PhUserPlus :size="14" /> Show on the map</template>
        </button>
        <button v-if="following" @click="menu = null; following = null"><PhUsersThree :size="14" /> Show everyone again</button>
        <button @click="fromWhoMenu('journey')"><PhPath :size="14" /> Show only their whole journey</button>
        <hr />
        <button :disabled="!canAppear(menuWho.CharacterId, -1)" @click="fromWhoMenu('prev')">
            <PhSkipBack :size="14" /> Their previous appearance
        </button>
        <button :disabled="!canAppear(menuWho.CharacterId, 1)" @click="fromWhoMenu('next')">
            <PhSkipForward :size="14" /> Their next appearance
        </button>
    </div>
    <div v-else-if="menu?.level" ref="menuEl" class="map-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
        <button @click="foldLevel(menu.level.depth)">
            <template v-if="menu.level.unfold"><PhArrowsOutLineVertical :size="14" /> Unfold this level</template>
            <template v-else><PhArrowsInLineVertical :size="14" /> Fold to this level</template>
        </button>
    </div>
    <div v-else-if="menu" ref="menuEl" class="map-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
        <template v-if="menuPin">
            <button v-if="menuPin.ChildMapId" @click="fromMenu('enter')">
                <PhSignIn :size="14" /> Enter {{ childMapOf(menuPin)?.Name || 'the map' }}
            </button>
            <button @click="fromMenu('edit')"><PhPencilSimple :size="14" /> Edit this place</button>
            <button @click="fromMenu('move')"><PhArrowsOutCardinal :size="14" /> Move it on the map</button>
            <button @click="fromMenu('label')"><PhTextAa :size="14" /> Design its label</button>
            <button v-if="menuPin.ChildMapId" @click="fromMenu('footprint')">
                <PhFrameCorners :size="14" /> Set its footprint
            </button>
            <button class="bad" @click="fromMenu('delete')"><PhTrash :size="14" /> Delete this place</button>
            <hr />
        </template>
        <template v-else>
            <button @click="placeHere"><PhMapPin :size="14" /> Add a place here</button>
            <hr />
        </template>
        <!-- Measuring starts wherever the menu was opened, which is more exact than a click. -->
        <button @click="measureHere">
            <PhRuler :size="14" /> {{ measuringFrom ? 'Measure to here' : 'Measure from here' }}
        </button>
        <button v-if="picking" @click="menu = null; stopPicking()">
            <PhX :size="14" /> Stop measuring
        </button>
        <hr />
        <button @click="menu = null; fitView()"><PhCrosshair :size="14" /> Fit the whole map</button>
        <button v-if="upMap" @click="menu = null; travelTo(upMap.Id)">
            <PhSignOut :size="14" /> Back out to {{ upMap.Name }}
        </button>
        <button @click="copyPicture"><PhCopy :size="14" /> Copy the picture</button>
        <button @click="savePicture"><PhDownloadSimple :size="14" /> Save the picture…</button>
    </div>
    <div v-if="menu" class="map-menu-backdrop" @click="menu = null" @contextmenu.prevent="menu = null" />

    <!-- A road, a stay or a meeting on the range map, in words. -->
    <div v-if="tip" ref="tipEl" class="map-tip">
        <p v-for="(line, i) in tip.lines" :key="i" :class="{ first: i === 0 }">{{ line }}</p>
    </div>

    <!--
        One list of units for both places that ask for one — the editor's row and the calibration
        strip, which are never on screen together. A datalist is found by id from anywhere in the page.
    -->
    <datalist id="map-scale-units">
        <option value="miles" />
        <option value="kilometres" />
        <option value="leagues" />
        <option value="metres" />
        <option value="feet" />
        <option value="days' travel" />
    </datalist>

    <EditMapModal
        v-if="editingMap && current"
        :map="current"
        :can-import="isDesktop"
        @close="editingMap = false"
        @save="saveMapEdits"
        @pick-image="fromMapModal('pick')"
        @import-image="fromMapModal('import')"
        @calibrate="fromMapModal('calibrate')"
        @place-compass="placeCompass"
        @remove="fromMapModal('delete')"
    />

    <EditPlaceModal
        v-if="editingPin && selected"
        :pin="selected"
        :maps="maps"
        :current-map-id="currentId"
        @close="editingPin = false"
        @save="applyPinEdits"
        @move-pin="enterMode('place', selected)"
        @design-label="enterMode('label', selected)"
        @set-footprint="enterMode('footprint', selected)"
    />

    <ImagePickerModal
        v-if="showPicker"
        item-id=""
        :already-linked="[]"
        pick-only
        @close="showPicker = false"
        @linked="pickImage"
    />

    <ConfirmModal
        v-if="confirmDelete"
        :title="confirmDelete.what === 'map' ? 'Delete this map?' : 'Delete this place?'"
        :message="confirmDelete.what === 'map'
            ? `“${confirmDelete.name}” and its places go. A pin on another map that opened into it keeps its spot and loses the doorway.`
            : `“${confirmDelete.name}” goes. Events that happened there keep their dates and forget the place.`"
        confirm-label="Delete"
        danger
        @confirm="doDelete"
        @cancel="confirmDelete = null"
    />
</template>

<style scoped lang="scss">
.map-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
}

// ── Bar ───────────────────────────────────────────────────────────────────────

.map-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 12px;
    background: var(--app-surface, #0c1524);
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
}

.crumbs {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    font-size: 0.78rem;
}

.crumb {
    background: none;
    border: none;
    padding: 2px 4px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    border-radius: 3px;

    &:hover { color: var(--app-accent-hover, #818cf8); }
    &.here { color: var(--app-text, #e2e8f0); font-weight: 600; cursor: default; }
}

.crumb-sep { color: var(--app-text-dim, #4a6080); flex-shrink: 0; }

.bar-actions { display: flex; gap: 6px; }

.tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.4; cursor: default; }

    &.active {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
        background: color-mix(in srgb, var(--app-accent, #6366f1) 14%, transparent);
    }

    &.danger:hover { color: #fecaca; border-color: #7f1d1d; background: #7f1d1d33; }
}

// ── Body ──────────────────────────────────────────────────────────────────────

.map-body { display: flex; flex: 1; min-height: 0; }

.map-side {
    flex-grow: 0;
    flex-shrink: 0;
    // Three panels, each scrolling in its own right, rather than one column scrolled past. The bar
    // itself no longer moves: whatever is in it is in it.
    overflow: hidden;
    background: var(--app-surface, #0c1524);
    border-right: 1px solid var(--app-border, #2d3a56);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.side-grip {
    flex: 0 0 4px;
    cursor: col-resize;
    background: transparent;

    &:hover { background: var(--app-accent, #6366f1); }
}

.side-block { display: flex; flex-direction: column; gap: 7px; min-height: 0; }

// Places takes half the bar at most, and only once there is something under it to be pushed off. Two
// hundred places used to run the selected place clean off the bottom of the screen.
.places-block .map-list { min-height: 0; overflow-y: auto; }

.map-side:has(.side-block + .side-block) .places-block { flex: 0 1 auto; max-height: 50%; }

// The selected place is the one panel that does not give. It is the answer to a click, so it takes its
// own height off the bottom of the bar and the list above it squeezes to make room — a place named,
// described and with its buttons under it, whole, every time. The two parts of it with no natural end
// scroll inside it instead, or one long description would have the bar to itself.
.place-block {
    flex: 0 0 auto;

    .place-desc { max-height: 7em; overflow-y: auto; }

    .here-items { max-height: 116px; overflow-y: auto; }
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

    .icon-btn { margin-left: auto; }
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

.map-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.tree-row {
    display: flex;
    align-items: center;
    gap: 1px;

    // The rename button stays out of the way until the row is pointed at.
    .row-edit { opacity: 0; }
    &:hover .row-edit { opacity: 1; }
}

.twisty {
    flex-shrink: 0;

    svg { transition: transform 0.14s; }
    svg.open { transform: rotate(90deg); }
}

.twisty-gap { flex: 0 0 15px; }

.row-icon { flex-shrink: 0; color: var(--app-text-dim, #4a6080); }

.map-link {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.8rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;

    &:hover { background: var(--app-surface-high, #1e293b); color: var(--app-text, #e2e8f0); }
    &.here { background: var(--app-surface-high, #1e293b); color: var(--app-accent-hover, #818cf8); font-weight: 600; }
}

.pin-count {
    margin-left: auto;
    flex-shrink: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.7rem;
    color: var(--app-text-dim, #4a6080);
}

.side-actions { display: flex; flex-wrap: wrap; gap: 5px; }

// ── The selected place, read-only ─────────────────────────────────────────────

.place-name {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
}

.place-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
}

.place-desc {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--app-text-muted, #94a3b8);
    white-space: pre-wrap;

    &.empty { font-style: italic; color: var(--app-text-dim, #64748b); }
}

.place-door { margin: 0; font-size: 0.75rem; color: var(--app-text-dim, #64748b); }

// The square, on a chip so it reads as a reference rather than as part of the name.
.place-square {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 70%, transparent);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--app-text-muted, #94a3b8);
}

.here-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.78rem;
    color: var(--app-text-muted, #94a3b8);

    // Going on at the clock's date: the amber of the ring round the pin.
    .now { color: #fbbf24; }
}

.here-go {
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover { color: var(--app-accent-hover, #818cf8); text-decoration: underline; }
}

// ── Stage ─────────────────────────────────────────────────────────────────────

.map-stage-wrap { position: relative; flex: 1; min-width: 0; }

.map-stage { position: absolute; inset: 0; }

.stage-note {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--app-text-dim, #64748b);
    text-align: center;
    padding: 20px;

    p { margin: 0; font-size: 0.85rem; max-width: 44ch; }
    &.error p { color: #fca5a5; }
}

// ── Stage furniture: scale, compass, view tools ───────────────────────────────

.scale-bar {
    position: absolute;
    left: 12px;
    bottom: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 4px 8px 6px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 92%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    pointer-events: none;
    user-select: none;
}

.scale-label {
    font-size: 0.7rem;
    color: var(--app-text, #e2e8f0);
}

// A bar with two feet, the way a paper map draws one.
.scale-line {
    height: 6px;
    border: 1px solid var(--app-text, #e2e8f0);
    border-top: none;
    transition: width 0.12s linear;
}

// The way out of a map that is inside another one, in the corner the reader is not using.
.exit-up {
    position: absolute;
    left: 10px;
    top: 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 40%;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 94%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text, #e2e8f0);
    font-family: inherit;
    font-size: 0.74rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    user-select: none;
    transition: color 0.14s, border-color 0.14s, background 0.14s;

    &:hover { color: #fff; background: var(--app-accent, #6366f1); border-color: var(--app-accent-hover, #818cf8); }
}

// Placed and sized from the map's own columns, so the inline style is the whole of its geometry.
.compass {
    position: absolute;
    touch-action: none;
    user-select: none;

    // Not a control at all until the map is being edited: the whole point of #8.
    &.live {
        cursor: grab;

        &:active { cursor: grabbing; }
    }

    // Lifted off a pale map the same way the nav pad below it is.
    svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 1px 4px rgb(0 0 0 / 55%)); }

    .rose-ring {
        fill: color-mix(in srgb, var(--app-surface, #0c1524) 94%, transparent);
        stroke: color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
        stroke-width: 1;
    }

    .rose-needle { fill: #ef4444; }
    .rose-tail { fill: var(--app-text-muted, #94a3b8); }

    .rose-n {
        fill: var(--app-text, #e2e8f0);
        font-size: 7px;
        font-weight: 700;
        text-anchor: middle;
    }

    &.live .rose-ring { stroke: var(--app-accent, #6366f1); }
    &.live:hover .rose-ring { stroke: var(--app-accent-hover, #818cf8); }
}

// The two grips, on the rose only while it is being placed: one to move it, one to size it.
.rose-grip {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 3px;
    border: 1px solid #0f172a;
    background: var(--app-accent, #6366f1);
    color: #fff;
    cursor: grab;
    touch-action: none;

    &.move { left: -7px; top: -7px; width: 15px; height: 15px; }
    &.size { right: -6px; bottom: -6px; width: 12px; height: 12px; cursor: nwse-resize; }
}

.nav-pad {
    position: absolute;
    right: 8px;
    bottom: 46px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.nav-mid { display: flex; gap: 2px; }

// The turn dial. Same chip colours as the buttons under it, so the pad still reads as one thing.
.dial {
    position: relative;
    width: 58px;
    height: 58px;
    margin: 2px 0 1px;
    cursor: grab;
    touch-action: none;
    user-select: none;

    &:active { cursor: grabbing; }

    svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 1px 4px rgb(0 0 0 / 55%)); }

    .dial-track {
        fill: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
        stroke: color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
        stroke-width: 1.5;
    }

    .dial-grip {
        fill: var(--app-accent, #6366f1);
        stroke: #0f172a;
        stroke-width: 0.8;
    }

    &:hover {
        .dial-track { stroke: var(--app-accent-hover, #818cf8); }
        .dial-grip  { fill: var(--app-accent-hover, #818cf8); }
    }

    // Outside the svg on purpose: a readout that turned with the map would be the one thing on
    // screen you could not read.
    .dial-read {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--app-text, #e2e8f0);
        pointer-events: none;
    }
}

// These sit on top of a picture that can be any colour, so the contrast has to come from the button
// itself: a near-opaque chip, a bright icon on it, and a shadow to lift it off a pale map.
.nav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text, #e2e8f0);
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s, background 0.14s;

    &:hover {
        color: #fff;
        background: var(--app-accent, #6366f1);
        border-color: var(--app-accent-hover, #818cf8);
    }

    &:active { transform: translateY(1px); }

    // A toggle that is on says so, the way the ruler and the ⓘ do.
    &.on {
        color: #fff;
        background: var(--app-accent, #6366f1);
        border-color: var(--app-accent-hover, #818cf8);
    }

    // Straightening a map that is already straight: still there, so the row never changes shape.
    &:disabled {
        opacity: 0.4;
        cursor: default;

        &:hover {
            color: var(--app-text, #e2e8f0);
            background: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
            border-color: color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
        }
    }
}

.pick-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
    padding: 6px 11px;
    // A rounded rectangle, not a pill: this one wraps to two and three lines — the label designer's
    // says four things — and a 999px radius on something that tall is a lozenge the size of a hand.
    border-radius: 12px;
    border: 1px solid var(--app-border, #2d3a56);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 94%, transparent);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.74rem;
}

.strip-icon {
    color: #f59e0b;
    flex-shrink: 0;

    // An edit in progress is the app's own colour; measuring is the ruler's amber.
    &.edit { color: var(--app-accent-hover, #818cf8); }
}

.strip-value { color: var(--app-text, #e2e8f0); font-weight: 600; font-size: 0.82rem; }

.strip-error { color: #fca5a5; }

.strip-num, .strip-unit {
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font-family: inherit;
    font-size: 0.74rem;
    padding: 2px 5px;
    outline: none;

    &:focus { border-color: var(--app-accent, #6366f1); }
}

.strip-num { width: 62px; }
.strip-unit { width: 92px; }

// The clock, where the scale bar and the nav pad are not: a wide chip along the bottom middle. It gets
// out of the way of the editing strips, which share that corner and are about a job in hand.
//
// The dock does the positioning rather than the clock itself, so what is stacked in it — one row, two
// rows, with or without the ages above — grows upward off a fixed bottom edge instead of shifting the
// clock about under the reader's hand.
// Everything that speaks along the bottom of the map, stacked instead of piled: the hint, the edit
// strip, the ages, the clock. One column anchored to the bottom edge, growing upward, so whatever is
// showing sits above whatever is showing under it and the clock never moves out from under the hand.
.map-dock {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    // Clear of both bottom corners: the scale bar on the left, the three round buttons on the right.
    width: min(var(--dock-w, 560px), calc(100% - 340px));
    // The column is as wide as it is whether or not there is anything in it, and a band of empty gap
    // across the bottom of a map would swallow drags that belong to the map.
    pointer-events: none;

    > * { pointer-events: auto; }
}

// Not a pin, because an age has no one place: naming it is the whole of how it is shown.
.age-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, #94a3b8 35%, transparent);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 90%, transparent);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.7rem;
    letter-spacing: 0.02em;
    // Quieter than the clock under it on purpose: it is the standing state of the world, not the thing
    // the reader is moving.
    opacity: 0.85;
}

.age-names {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.age-more { color: #fbbf24; }

.time-strip, .date-edit {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--app-border, #2d3a56);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 94%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.74rem;
}

.time-strip {
    position: relative;
    width: 100%;
    // All controls: a drag that strays off the track should not come back as a selection to drag.
    user-select: none;

    .strip-unit { width: 48px; }
}

// The strip's right end, where the pill rounds off: wide enough to find, with nothing in it to hit instead.
.dock-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    width: 9px;
    cursor: ew-resize;
    touch-action: none;

    // A grip that cannot be seen is one nobody finds: a notch, brighter while the strip is under the hand.
    &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        width: 2px;
        height: 12px;
        margin-top: -6px;
        border-radius: 1px;
        background: var(--app-border, #2d3a56);
    }

    .time-strip:hover > &::after { background: var(--app-text-muted, #94a3b8); }
}

// Which of the people are on the map, when not all of them: the ages' chip, as a button.
.shown-chip {
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;

    b { color: var(--app-accent-hover, #818cf8); font-weight: 600; }
    &:hover { color: var(--app-text, #e2e8f0); opacity: 1; }
}

.date-edit {
    gap: 5px;

    .day { width: 46px; }
    .month { width: auto; }
}

// The date is a button: clicking it is how a date gets typed rather than dragged to.
.date-btn {
    padding: 1px 4px;
    border: 1px solid transparent;
    border-radius: var(--app-radius-sm, 4px);
    background: none;
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-weight: 700;
    white-space: nowrap;
    cursor: text;

    &:hover { border-color: var(--app-border, #2d3a56); }
}

.time-lead, .time-tail { display: flex; align-items: center; gap: 8px; }
.time-lead { gap: 3px; }

.range-tag { letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.64rem; }

// Amber, like the rings it is counting.
.time-count { color: #fbbf24; white-space: nowrap; }

// The date and the count change as the clock moves; each is as wide as the widest it can read, so the
// track between them holds still. The unseen widest readings share one grid cell with the real one.
.date-btn, .time-count {
    display: inline-grid;
    justify-items: center;
    font-variant-numeric: tabular-nums;

    > * { grid-area: 1 / 1; }
    > .sizer { visibility: hidden; }
}

// The label's own text, edited where the label is rather than back in the modal.
.strip-name {
    width: 150px;
    border: 1px solid var(--app-accent, #6366f1);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font-family: inherit;
    font-size: 0.78rem;
    padding: 2px 6px;
    outline: none;
}

// What worked, and what did not. The top of the dock, above the strips, which is where the eye already is.
.map-flash {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    margin: 0;
    padding: 4px 10px;
    // An error can run to two lines, and a pill that tall is a lozenge — see `.pick-strip`.
    border-radius: 12px;
    border: 1px solid var(--app-border, #2d3a56);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text, #e2e8f0);
    font-size: 0.74rem;

    &.bad { border-color: #7f1d1d; color: #fca5a5; }
}

.map-tip {
    position: fixed;
    z-index: var(--z-menu, 9999);
    max-width: 300px;
    padding: 6px 9px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    box-shadow: 0 10px 30px -8px rgb(0 0 0 / 70%);
    pointer-events: none;
    font-size: 0.75rem;
    color: var(--app-text-dim, #94a3b8);

    p { margin: 0; }
    .first { font-weight: 600; color: var(--app-text, #e2e8f0); }
}

.map-menu {
    position: fixed;
    z-index: var(--z-menu, 9999);
    display: flex;
    flex-direction: column;
    min-width: 195px;
    // A window shorter than the menu scrolls it, rather than losing its last items off the bottom.
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    box-shadow: 0 10px 30px -8px rgb(0 0 0 / 70%);
    user-select: none;

    button {
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
        &.bad:hover { color: #fecaca; background: #7f1d1d33; }
        &:disabled { opacity: 0.4; cursor: default; background: transparent; }
    }

    .menu-title {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0;
        padding: 5px 8px 3px;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--app-text, #e2e8f0);
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

.info-toggle {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text, #e2e8f0);
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s, background 0.14s;

    &:hover { color: #fff; background: var(--app-accent, #6366f1); border-color: var(--app-accent-hover, #818cf8); }
    &.active { color: var(--app-accent-hover, #818cf8); border-color: var(--app-accent, #6366f1); }
}

// The ruler and the switch for the controls sit beside the ⓘ rather than above it: all three are
// about reading the map, not moving it, and they are the row that never goes away.
.chrome-toggle { right: 44px; }

.measure-toggle {
    right: 78px;

    &.active { color: #fbbf24; border-color: #b45309; }
}

.stage-hint {
    margin: 0;
    padding: 3px 10px;
    max-width: 100%;
    // Same reason as the strip above it: it wraps now, and a wrapped pill is a lozenge.
    border-radius: 10px;
    background: color-mix(in srgb, var(--app-surface, #0c1524) 80%, transparent);
    color: var(--app-text-dim, #64748b);
    font-size: 0.7rem;
    text-align: center;
    // It is the one thing down here nobody clicks, and it used to run out past the dock and under the
    // scale bar rather than wrap.
    pointer-events: none;
}
</style>

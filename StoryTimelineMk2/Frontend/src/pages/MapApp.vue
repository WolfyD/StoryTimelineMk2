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
 * ponytail: static display only, which is the first of BL-16's three steps — the scrubber and the
 * movement between places come next, and nothing here is in their way.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import Konva from 'konva'
import { BackendAPI, type BridgeMessage } from '@/bridge/api'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ImagePickerModal from '@/components/ImagePickerModal.vue'
import EditPlaceModal from '@/components/EditPlaceModal.vue'
import EditMapModal from '@/components/EditMapModal.vue'
import MapInfoPanel from '@/components/MapInfoPanel.vue'
import { useSideWidth } from '@/composables/useSideWidth'
import { useAppTheme } from '@/utils/useAppTheme'
import { mediaUrl } from '@/utils/mediaUrl'
import {
    parentMapIds, pathToMap, hopsBetween, flattenMapTree, rowHasChildren, filterMapTree,
    rootMaps as mapRoots, type MapTreeRow,
} from '@/utils/mapTree'
import { scaleBar, distanceInUnits, formatDistance, lockAxis } from '@/utils/mapScale'
import {
    footprintRect, betweenViews, centredOn, descentTransform, fitRectScale, throughFootprint,
    childAspect, type View,
} from '@/utils/mapFootprint'
import {
    LABEL_LIFT, buildMarker, fitFontSize, labelLineFrom, labelStartLine, markerBox,
} from '@/utils/mapMarker'
import {
    diffMarker, mapMarkerStyle, pinMarkerStyle, resolveMarker, serializeMarker,
} from '@/utils/markerStyle'
import { loadMapDescentFade } from '@/utils/timelinePrefs'
import {
    PhMapPin, PhPlus, PhMinus, PhTrash, PhImage, PhCrosshair,
    PhSignIn, PhCaretRight, PhCaretLeft, PhCaretUp, PhCaretDown,
    PhMapTrifold, PhWarning, PhPencilSimple, PhRuler,
    PhMagnifyingGlass, PhX, PhInfo, PhSignOut,
    PhArrowsOutCardinal, PhFrameCorners, PhTextAa, PhCompass, PhCopy, PhDownloadSimple, PhCheck,
} from '@phosphor-icons/vue'
import type { MapItem, LocationItem, TimelineItem, MediaItem } from '@/types/models'

useAppTheme()

const params = new URLSearchParams(location.search)
const timelineId = parseInt(params.get('timelineId') ?? '0', 10)
const openOnMapId = params.get('mapId')

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
const confirmDelete = ref<{ what: 'map' | 'pin'; name: string } | null>(null)
const { width: sideWidth, startResize } = useSideWidth('mapSideWidth')

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

function say(what: string) {
    notice.value = what
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => { notice.value = '' }, 2500)
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
    error.value = ''
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

onMounted(async () => {
    try {
        descentFade.value = await loadMapDescentFade(timelineId)
        maps.value = await BackendAPI.GetMaps(timelineId) ?? []
        const first = maps.value.find(m => m.Id === openOnMapId) ?? rootMaps.value[0] ?? maps.value[0]
        if (first) {
            trail.value = [first.Id]
            await show(first.Id, { keepTrail: true })
        }
    } finally {
        loading.value = false
    }
    stopListening = BackendAPI.onHostMessage(onBridgeMessage)
})

function onBridgeMessage(data: BridgeMessage) {
    // The host points an already-open window at a map rather than opening a second one.
    if (data?.action === 'ShowMap' && typeof data.payload?.MapId === 'string') {
        trail.value = []
        void show(data.payload.MapId as string)
    }
}

onBeforeUnmount(() => {
    stopListening?.()
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
/** Set while a descent is in the air: calling it lands immediately on the destination. */
let skipFlight: (() => void) | null = null
let observer: ResizeObserver | null = null
/** Map-image pixels: the canvas' own coordinate space, and what a pin's fraction multiplies up by. */
let baseW = 1
let baseH = 1
/** The two of those the overlays need, where Vue can see them change. */
const baseWidth = ref(1)
const zoom = ref(1)
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
    layer.add(imageNode)
    layer.add(plots)
    layer.add(marks)
    layer.add(pinLayer)
    stage.add(layer)

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
            // the line is one pixel whether the map is at 0.05× or 8×.
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
    stage.on('dragstart', () => {
        if (band) stage?.stopDrag()
    })

    stage.on('mousemove', () => {
        if (!band || !bandFrom) return
        const at = imageNode?.getRelativePointerPosition()
        if (!at) return
        band.position({ x: Math.min(bandFrom.x, at.x), y: Math.min(bandFrom.y, at.y) })
        band.size({ width: Math.abs(at.x - bandFrom.x), height: Math.abs(at.y - bandFrom.y) })
        layer?.batchDraw()
    })

    // A click on the map itself lands a measurement, drops a pin, or clears the selection.
    imageNode.on('click', e => {
        if (skipFlight) skipFlight()
        else if (picking.value) addPickPoint(e.evt.shiftKey)
        else if (placing.value) void placePin()
        else selectedId.value = null
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
        layer?.batchDraw()
        return
    }
    mountStage()
    if (!stage || !imageNode) return

    const img = await loadImage(mediaUrl(map.OverviewPath))
    baseW = map.PictureWidth || img.naturalWidth
    baseH = map.PictureHeight || img.naturalHeight
    baseWidth.value = baseW
    drawnWidth = img.naturalWidth
    detailShown = map.DetailPath === map.OverviewPath
    imageNode.image(img)
    imageNode.size({ width: baseW, height: baseH })
    redrawPins()
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

/** The scale at which a map of these dimensions is wholly in view. One definition of "fits". */
const fitScaleFor = (w: number, h: number) =>
    stage ? Math.min(stage.width() / w, stage.height() / h) * 0.96 : 1

/** The scale at which the whole map is in view. */
const fitScale = () => fitScaleFor(baseW, baseH)

/** How close "looking at a place" is: four times into the whole map, and never nearer than 2×. */
const closeScale = () => Math.min(2, fitScale() * 4)

/** Where the stage sits with one place in the middle of the screen. */
const placeView = (loc: LocationItem, scale: number): View =>
    centredOn(loc.X * baseW, loc.Y * baseH, scale, stage?.width() ?? 0, stage?.height() ?? 0)

/**
 * Slide and zoom until a place sits in the middle, so following a search result is a journey rather
 * than a jump cut. Going *into* a place is the descent below, which is a different move.
 */
function centreOn(locId: string) {
    const loc = current.value?.Locations.find(l => l.Id === locId)
    if (!stage || !loc || !current.value?.OverviewPath) return
    // Stay where the view already is if it is closer than this: arriving zoomed in and then being pushed
    // back out to a fixed distance is not what "show me this place" means.
    const to = placeView(loc, Math.min(2, Math.max(stage.scaleX(), fitScale() * 4)))
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
    const old = stage.scaleX()
    const next = Math.min(12, Math.max(0.02, old * factor))
    const rel = { x: (at.x - stage.x()) / old, y: (at.y - stage.y()) / old }
    stage.scale({ x: next, y: next })
    stage.position({ x: at.x - rel.x * next, y: at.y - rel.y * next })
    scalePins()
    stage.batchDraw()
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
    const w = rect.width()
    const h = rect.height()
    const at = { x: rect.x(), y: rect.y() }
    rect.destroy()
    layer?.batchDraw()
    // Measured on screen rather than on the map, so the floor means the same at every zoom: a shift-click
    // or a twitch is not a request to go anywhere.
    if (!stage || !layer || w * zoom.value < 8 || h * zoom.value < 8) return
    // The same limits the wheel has — a box drawn round a doorway cannot zoom further than scrolling to it.
    const scale = Math.min(12, Math.max(0.02, fitRectScale({ ...at, w, h }, stage.width(), stage.height())))
    void fly(
        centredOn(at.x + w / 2, at.y + h / 2, scale, stage.width(), stage.height()),
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
    const scale = fitScale()
    return {
        scale,
        x: ((stage?.width() ?? 0) - baseW * scale) / 2,
        y: ((stage?.height() ?? 0) - baseH * scale) / 2,
    }
}

/**
 * Put the stage somewhere, with everything that has to hear about it. `draw` is false only inside a
 * flight, where the animation draws the layer itself and a second batched draw is a wasted frame on a
 * picture this big.
 */
function applyView(at: View, draw = true) {
    if (!stage) return
    stage.scale({ x: at.scale, y: at.scale })
    stage.position({ x: at.x, y: at.y })
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
    pinLayer.getChildren().forEach(g => g.scale({ x: inverse, y: inverse }))
    marks?.find('.pick-mark').forEach(n => n.scale({ x: inverse, y: inverse }))
    plots?.find('.plot-handle').forEach(n => n.scale({ x: inverse, y: inverse }))
    zoom.value = stage.scaleX()
}

// ── Between maps: the view flies rather than cuts ──────────────────────────────

/** How long one flight between two maps takes. A chain of them shares this out. */
const DESCENT_SECONDS = 0.9

/** Whether the dissolve is wanted on this timeline — the flight itself is not optional. */
const descentFade = ref(true)

/**
 * The one flight, and the one way out of the air: the promise settles once the stage is at `to`,
 * whether the flight took it there or a wheel, a click or a button cut it short. `land` is the caller's
 * moment to put its own nodes in their final state, so a cut short and a finish look the same.
 *
 * Driven frame by frame rather than by a tween on the stage's own scale, because zoom has to move
 * geometrically to look like anything — `betweenViews` is where that is worked out and tested.
 */
function fly(to: View, land: () => void, secs: number) {
    const from: View = { scale: stage!.scaleX(), x: stage!.x(), y: stage!.y() }
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

    const to = descentTransform(rect, childW, childH, fitScaleFor(childW, childH), stage.width(), stage.height())
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
    const seen = { scale: stage.scaleX(), x: stage.x(), y: stage.y() }
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
 * ponytail: a wheel mid-chain lands the hop it is on and the rest still fly — chains are two or three
 * long in practice. Worth a flag only if anyone ever builds six levels deep.
 */
async function travelTo(mapId: string, endOn?: string) {
    if (skipFlight || mapId === currentId.value) return
    const parents = parentMapIds(maps.value)
    const hops = hopsBetween(parents, currentId.value, mapId)
    if (!hops.length) return show(mapId)

    // Every picture on the route, decoded while the first leg is in the air, so the chain does not stop
    // between levels.
    void warmAll(hops)
    // Shorter legs the further it is, but by the square root — divided by the count, three levels was
    // three flights too quick to read as flights at all.
    const secs = Math.max(0.35, DESCENT_SECONDS / Math.sqrt(hops.length))
    // Asked for after the last map is on screen, which is the only moment the place is on it.
    const landing = endOn
        ? () => {
            const loc = current.value?.Locations.find(l => l.Id === endOn)
            return loc ? placeView(loc, closeScale()) : null
        }
        : undefined
    for (let i = 0; i < hops.length; i++) {
        const next = hops[i]!
        const last = i === hops.length - 1
        const here = currentId.value
        // The tree says which way each hop goes, so a pair of pins pointing at each other cannot make
        // a flight out look like a flight in.
        if (parents.get(here) === next) {
            await ascend(next, secs, last ? landing : undefined)
            continue
        }
        const door = maps.value.find(m => m.Id === here)?.Locations.find(l => l.ChildMapId === next)
        if (door) await descend(next, door, secs)
        else {
            // Two maps under different roots share no ground to fly across: this is an arrival, and the
            // trail is rebuilt from the destination's own root rather than appended to.
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
    style.labelDx = Math.round(mid.x)
    style.labelDy = Math.round(mid.y)
    style.labelW = Math.round(len)
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
    const rad = (start.angle * Math.PI) / 180
    const half = { x: (Math.cos(rad) * start.len) / 2, y: (Math.sin(rad) * start.len) / 2 }
    labelEnds = {
        a: { x: start.dx - half.x, y: start.dy - half.y },
        b: { x: start.dx + half.x, y: start.dy + half.y },
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
 * Drag the rose itself to say where north really is on a map that was not drawn square: the needle
 * follows the pointer and the angle is saved when it is let go. Double-click puts north back to up.
 */
function turnNorth(e: PointerEvent) {
    const map = current.value
    const box = rose.value?.getBoundingClientRect()
    if (!map || !box || mode.value !== 'compass') return
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const move = (ev: PointerEvent) => {
        map.NorthOffset = Math.round((Math.atan2(ev.clientX - cx, cy - ev.clientY) * 180 / Math.PI + 360) % 360)
    }
    dragFurniture(move)
    move(e)
}

async function resetNorth() {
    const map = current.value
    if (!map || mode.value !== 'compass') return
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
const menu = ref<{ x: number; y: number; at: { x: number; y: number } | null; pin: string } | null>(null)
const menuPin = computed(() => current.value?.Locations.find(l => l.Id === menu.value?.pin) ?? null)

function openMenu(evt: MouseEvent, pinId: string) {
    menu.value = {
        x: evt.clientX,
        y: evt.clientY,
        at: imageNode?.getRelativePointerPosition() ?? null,
        pin: pinId,
    }
}

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
            </div>
        </div>

        <div class="map-body">
            <aside class="map-side" :style="{ flexBasis: `${sideWidth}px` }">
                <section class="side-block">
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
                                <div class="tree-row" :style="{ paddingLeft: `${row.depth * 11}px` }">
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

                <!-- Selecting a pin shows it; changing it is the deliberate act, in the modal. -->
                <section class="side-block" v-if="selected">
                    <header class="side-head"><PhMapPin :size="14" /> Place</header>
                    <p class="place-name">
                        <span class="place-dot" :style="{ background: selected.Color || '#f59e0b' }" />
                        {{ selected.Name }}
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
                    <ul class="here-items">
                        <li v-for="it in pinItems" :key="it.Id">{{ it.Title }}</li>
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
                <p v-if="current?.OverviewPath && !picking && !mode" class="stage-hint">
                    Scroll to zoom, drag to pan. Double-click a place with a ring to go inside;
                    right-click for the rest — measuring, a new place, a picture of the map.
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
                    A bar that says how far, in the units the writer gave, at whatever zoom this is. On
                    its own chip: over a map it can be any colour, a bare hairline and pale text were
                    invisible on half of them.
                -->
                <div v-if="current?.OverviewPath" class="scale-bar">
                    <span class="scale-label">{{ bar.label }}</span>
                    <span class="scale-line" :style="{ width: `${Math.round(bar.px)}px` }" />
                </div>

                <!--
                    North, as the writer set it. Where the rose sits and how big it is belong to the
                    map, like the angle does — and none of the three moves until "Place the compass"
                    is running, because a rose in the corner used to turn north by being brushed past.
                -->
                <div
                    v-if="current?.OverviewPath"
                    ref="rose"
                    class="compass"
                    :class="{ live: mode === 'compass' }"
                    :style="compassStyle"
                    :title="mode === 'compass'
                        ? `North is ${Math.round(current.NorthOffset)}° from up — drag the rose to turn it, double-click to reset`
                        : `North is ${Math.round(current.NorthOffset)}° from up — Edit map ▸ Place the compass to move or turn it`"
                    @pointerdown.prevent="turnNorth"
                    @dblclick="resetNorth"
                >
                    <svg viewBox="-20 -20 40 40" :style="{ transform: `rotate(${current.NorthOffset}deg)` }">
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
                <div v-if="current?.OverviewPath" class="nav-pad">
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
                <button
                    v-if="current"
                    class="info-toggle"
                    :class="{ active: showInfo }"
                    :title="showInfo ? 'Hide the map panel' : 'Show the map panel'"
                    @click="toggleInfo"
                >
                    <PhInfo :size="17" />
                </button>

                <!-- What went wrong stays until it is dismissed; what worked says so and goes. -->
                <p v-if="error" class="map-flash bad">
                    {{ error }}
                    <button class="icon-btn" title="Dismiss" @click="error = ''"><PhX :size="11" /></button>
                </p>
                <p v-else-if="notice" class="map-flash">{{ notice }}</p>
            </div>
        </div>
    </div>

    <!-- ── Right-click menu ────────────────────────────────────────────────── -->
    <div v-if="menu" class="map-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
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
    overflow-y: auto;
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

.side-block { display: flex; flex-direction: column; gap: 7px; }

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

.here-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.78rem;
    color: var(--app-text-muted, #94a3b8);
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
}

.pick-strip {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    max-width: min(560px, 90%);
    padding: 5px 10px;
    border-radius: 999px;
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

// What worked, and what did not. Above the strips, which is where the eye already is.
.map-flash {
    position: absolute;
    bottom: 42px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: min(620px, 92%);
    margin: 0;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--app-border, #2d3a56);
    background: color-mix(in srgb, var(--app-surface, #0c1524) 96%, transparent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 55%);
    color: var(--app-text, #e2e8f0);
    font-size: 0.74rem;

    &.bad { border-color: #7f1d1d; color: #fca5a5; }
}

.map-menu {
    position: fixed;
    z-index: var(--z-menu, 9999);
    display: flex;
    flex-direction: column;
    min-width: 195px;
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

// The ruler sits beside the ⓘ, not above it: they are both about reading the map, not moving it.
.measure-toggle {
    right: 44px;

    &.active { color: #fbbf24; border-color: #b45309; }
}

.stage-hint {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--app-surface, #0c1524) 80%, transparent);
    color: var(--app-text-dim, #64748b);
    font-size: 0.7rem;
    pointer-events: none;
    white-space: nowrap;
}
</style>

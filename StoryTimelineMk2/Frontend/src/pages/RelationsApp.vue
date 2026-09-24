<script setup lang="ts">
/**
 * BL-73 / BL-76 / BL-77: the relations window. Nine views over the same web — a loose force
 * graph, the same graph with its knots pulled apart, rings around one character, rows by
 * distance, an adjacency grid, a genogram, an arc along the birth years, factions in boxes and a
 * chord circle — sharing one Konva stage, one selection and one set of node drawings.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Konva from 'konva'
import { BackendAPI } from '@/bridge/api'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import { useSideWidth } from '@/composables/useSideWidth'
import { mediaUrl } from '@/utils/mediaUrl'
import { initials, lifespan } from '@/utils/characterItems'
import { genderKey, relationLabel, relationOtherId } from '@/utils/characterRelations'
import * as G from '@/utils/relationsGraph'
import * as L from '@/utils/relationsLayouts'
import {
    PhTreeStructure, PhMagnifyingGlass, PhPushPinSlash, PhPath, PhCrosshair,
    PhCalendarBlank, PhArrowsOut, PhCirclesThree, PhGridFour,
    PhRainbow, PhArrowsInLineHorizontal, PhArrowsOutLineHorizontal, PhUsersThree, PhChartDonut,
    PhLineSegments, PhFrameCorners, PhCopy, PhDownloadSimple, PhRows, PhFootprints,
    PhSlidersHorizontal,
} from '@phosphor-icons/vue'
import type { CharacterItem, CharacterRelationship, RelationshipType } from '@/types/models'

const params = new URLSearchParams(location.search)
// A ref, not a const: the host pre-navigates this page before it knows which timeline to show,
// so on that path the ids arrive later as a SetRelationsContext push.
const timelineId = ref(parseInt(params.get('timelineId') ?? '0', 10))
let openOnCharacterId = params.get('characterId')

const characters = ref<CharacterItem[]>([])
const relations = ref<CharacterRelationship[]>([])
const types = ref<RelationshipType[]>([])
const loading = ref(true)
const error = ref('')

type Mode = 'clusters' | 'matrix' | 'tree' | 'arc' | 'sociogram' | 'chord' | 'chain'
const mode = ref<Mode>('clusters')

/** What each view is for, in the sidebar, because none of them explain themselves. */
const MODE_HINTS: Record<Mode, string> = {
    clusters: 'Everyone loose, pulled together by their ties, with the knots shoved apart instead'
        + ' of settling on top of one another — each blob is a set of people who mostly know each'
        + ' other, named after whoever in it has the most ties. Drag someone and they stay put.',
    matrix: 'Everyone down the side and across the top, with a square where two of them are'
        + ' related — brighter the closer they are, grouped by faction so each house is a block on'
        + ' the diagonal. Click a square, or a name down the side and one across the top, to ask'
        + ' how those two are related.',
    tree: 'Ancestors above, descendants below, one row per generation. Everything else between'
        + ' two people on the chart is overlaid as a curve — jagged where it is hostile. A man is'
        + ' a square, a woman a circle, anyone else a diamond; a cross means they are dead.',
    arc: 'The whole cast on one line by birth year, oldest on the left. Family arcs over the'
        + ' line, everything else under it. Anyone with no birth year waits past the dashed'
        + ' fence at the end.',
    sociogram: 'One box per faction, in a ring. The ties that leave a box are drawn bold and the'
        + ' ones inside it faint, so what you see is where the loyalties cross. Anyone with no'
        + ' faction rings the outside.',
    chord: 'Groups round a circle, each as wide as it has ties, joined by ribbons as thick as the'
        + ' number that cross between them. A ribbon looping back on its own arc is a group'
        + ' keeping to itself. Click an arc or a ribbon to see who it is made of.',
    chain: 'The shortest way from one person to another, laid out left to right with the tie that'
        + ' makes each step written over it. Round everyone on the way is a ring of small circles:'
        + ' who else they are directly related to, up to five by their initials, and a count of'
        + ' the rest. Drag anyone out of the way.',
}
const selectedId = ref<string | null>(null)
const treeRootId = ref<string | null>(null)
const search = ref('')
const yearOn = ref(false)
const year = ref(0)
const hiddenCategories = ref<string[]>([])
/**
 * The genogram's kind checkboxes are not the other views'. The tree is drawn from descent and
 * marriage whatever you tick, so these only decide which ties are laid *over* it — and they start
 * all off, because a chart you have to clear before you can read it is one nobody reads twice.
 *
 * Held apart from `hiddenCategories`, and listed as what to *show* rather than what to hide, for
 * two reasons: switching views must not carry the genogram's blank overlay into the knots, and an
 * empty show-list needs nothing seeded from `categories`, which does not exist until the cast
 * loads. The path finder keeps reading `visibleEdges`, so clearing the overlay here does not make
 * two people stop being related.
 */
const treeShown = ref<string[]>([])
/** The arc's spacing knob, 0–100 for the slider. See `arcLayout`. */
const arcSpread = ref(50)
/**
 * One row per generation rather than one line. Session-only, like the chain's side circles: it is
 * a way of looking at the cast for a minute, not a property of the timeline, and the two remembered
 * sliders are remembered because they are fiddled with until they are right.
 */
const arcRows = ref(false)
/** 0-100 on the sidebar slider; `KNOT_ROOM` turns it into the px per √member the sim wants. */
const knotRoom = ref(50)
/**
 * How much of their opacity the sociogram's crossing ties keep, 0–100. Starts at 100, which is
 * exactly what the view looked like before the slider existed — the crossings are the point of
 * it. On a cast where every house deals with every other the middle of the ring fills in, and
 * then turning them down is the only way to see the boxes at all.
 */
const crossFade = ref(100)
/** The chain's side circles. Off when the route is all you want to read. */
const haloOn = ref(true)
/** The chain folded into rows to fit the window, rather than run off both edges of it. */
const chainWrap = ref(false)
/** The matrix's staircase and the genogram's numbered trail. Session-only, like the arc's rows. */
const showPath = ref(false)
const pathFrom = ref('')
const pathTo = ref('')
/** An open right-click menu. `id` is who it is about, or `''` for the one about the view. */
const menu = ref<{ x: number; y: number; id: string } | null>(null)
/** The template's narrowing of `menu?.id` is not worth fighting; this is the same thing, typed. */
const menuId = computed(() => menu.value?.id ?? '')
/** Said out loud for a moment after something worked, where the errors are said for longer. */
const notice = ref('')
let noticeTimer = 0
/** How wide the sidebar is, dragged by the grip beside it. */
const { width: sideWidth, startResize } = useSideWidth('relationsSideWidth')

// ── Derived ───────────────────────────────────────────────────────────────────

const charById = computed(() => new Map(characters.value.map(c => [c.Id, c])))
const typeById = computed(() => new Map(types.value.map(t => [t.Id, t])))
const relById = computed(() => new Map(relations.value.map(r => [r.Id, r])))
const knownIds = computed(() => new Set(characters.value.map(c => c.Id)))
const allEdges = computed(() => G.buildEdges(relations.value, typeById.value, knownIds.value))
const categories = computed(() => [...new Set(allEdges.value.map(e => e.category))].sort())
/** Null means "whenever" — the scrubber is opt-in, because most relations were never dated. */
const asOfYear = computed(() => (yearOn.value ? year.value : null))
const range = computed(() => G.yearRange(characters.value, relations.value))

/**
 * Every recorded tie that held in the chosen year. The year is a claim about the story, so it
 * belongs here; the kind checkboxes are about what a picture draws and do not. This is what the
 * path finder and the genogram read.
 */
const datedEdges = computed(() =>
    allEdges.value.filter(e => {
        const rel = relById.value.get(e.id)
        return !rel || G.relationActiveAt(rel, asOfYear.value)
    }),
)

/** The above, less the kinds unticked in the legend. What the views that own that legend draw. */
const visibleEdges = computed(() =>
    datedEdges.value.filter(e => !hiddenCategories.value.includes(e.category)),
)

/** The knots both the clustered layout and the grid order by — one pass over the same web. */
const clusters = computed(() => L.communities(sorted.value.map(c => c.Id), visibleEdges.value))
/**
 * The one view the sim runs in. Every other view builds its own shapes and never moves them, so
 * this doubles as "is this the view `paintGraph` paints" — there used to be a second computed
 * saying exactly that, back when Rings and Rows were also circles-and-lines.
 */
const isForce = computed(() => mode.value === 'clusters')

/**
 * The cast split by faction for the sociogram. Alphabetical, so the ring keeps its order across
 * sessions instead of reshuffling itself every time somebody changes houses.
 */
/** Who is in which faction, flat — the matrix groups rows by it, the sociogram draws boxes. */
const factionOf = computed(() => new Map(characters.value.map(c => [c.Id, c.Faction ?? ''])))

const factions = computed(() => {
    const by = new Map<string, string[]>()
    const loose: string[] = []
    for (const c of sorted.value) {
        const name = c.Faction?.trim()
        if (!name) { loose.push(c.Id); continue }
        const members = by.get(name)
        if (members) members.push(c.Id)
        else by.set(name, [c.Id])
    }
    const groups = [...by.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, ids]) => ({ name, ids }))
    return { groups, loose }
})
/** What goes round the chord circle. A faction groups people; a kind groups the ties themselves. */
type ChordBy = 'faction' | 'kind'
const chordBy = ref<ChordBy>('faction')
/** The last arc or ribbon clicked. `b === null` is a whole arc, `a === b` a group's own loop. */
const chordPick = ref<{ a: number; b: number | null } | null>(null)

/** Everyone the writer never put in a faction still gets an arc — belonging to nothing is a fact. */
const NO_FACTION = 'No faction'

/**
 * The circle's groups and the square of ties between them, in whichever of the two readings is
 * switched on.
 *
 * **Faction** is the straight one: a group is a set of people, `counts[i][j]` is the ties running
 * between two of them and `counts[i][i]` the ties that stay at home.
 *
 * **Kind** groups the ties instead, and a person can be in several groups at once, so it asks a
 * different question: of everyone with a family tie, how many also have a hostile one? A ribbon is
 * the people who have both, and a group's own loop is the people who have only that kind. It is
 * about the cast, not about any one pair — two people almost never have two relations between
 * them, so a ribbon counted per pair would be an empty circle on real data.
 */
const chordMatrix = computed(() => {
    const zeros = (n: number) => Array.from({ length: n }, () => Array.from({ length: n }, () => 0))

    if (chordBy.value === 'kind') {
        const names = categories.value
        const idx = new Map(names.map((n, i) => [n, i]))
        const has = new Map<string, Set<number>>()
        for (const e of visibleEdges.value) {
            const k = idx.get(e.category)
            if (k === undefined) continue
            for (const id of [e.aId, e.bId]) {
                const there = has.get(id)
                if (there) there.add(k)
                else has.set(id, new Set([k]))
            }
        }
        const counts = zeros(names.length)
        for (const set of has.values()) {
            const ks = [...set]
            if (ks.length === 1) { counts[ks[0]!]![ks[0]!]! += 1; continue }
            for (let a = 0; a < ks.length; a++) {
                for (let b = a + 1; b < ks.length; b++) {
                    counts[ks[a]!]![ks[b]!]! += 1
                    counts[ks[b]!]![ks[a]!]! += 1
                }
            }
        }
        return { by: 'kind' as const, names, counts, has, of: new Map<string, number>() }
    }

    const { groups, loose } = factions.value
    const names = groups.map(g => g.name)
    if (loose.length) names.push(NO_FACTION)
    const of = new Map<string, number>()
    for (const [i, g] of groups.entries()) for (const id of g.ids) of.set(id, i)
    for (const id of loose) of.set(id, names.length - 1)

    const counts = zeros(names.length)
    for (const e of visibleEdges.value) {
        const i = of.get(e.aId)
        const j = of.get(e.bId)
        if (i === undefined || j === undefined) continue
        counts[i]![j]! += 1
        if (i !== j) counts[j]![i]! += 1
    }
    return { by: 'faction' as const, names, counts, has: new Map<string, Set<number>>(), of }
})

/** Does a tie between groups `i` and `j` belong to what was clicked? */
function inPick(i: number, j: number, pick: { a: number; b: number | null }): boolean {
    if (pick.b === null) return i === pick.a || j === pick.a
    return (i === pick.a && j === pick.b) || (i === pick.b && j === pick.a)
}

/** What the clicked arc or ribbon is actually made of: ties by name, or people by name. */
const chordRows = computed(() => {
    const pick = chordPick.value
    const m = chordMatrix.value
    if (!pick) return []
    const nameOf = (id: string) => charById.value.get(id)?.Name ?? 'someone'
    const rows: { key: string; id: string; text: string; sub: string; color: string }[] = []

    if (m.by === 'kind') {
        for (const [id, set] of m.has) {
            const keep = pick.b === null
                ? set.has(pick.a)
                // A group's own loop is the people who have that kind and nothing else, which is
                // exactly what the matrix counted — so the list has to agree with the ribbon.
                : pick.a === pick.b
                    ? set.size === 1 && set.has(pick.a)
                    : set.has(pick.a) && set.has(pick.b)
            if (!keep) continue
            rows.push({
                key: id, id, text: nameOf(id),
                sub: [...set].map(k => m.names[k] ?? '').sort().join(', '),
                color: G.categoryColor(m.names[pick.a] ?? ''),
            })
        }
        return rows.sort((a, b) => a.text.localeCompare(b.text))
    }

    for (const e of visibleEdges.value) {
        const i = m.of.get(e.aId)
        const j = m.of.get(e.bId)
        if (i === undefined || j === undefined || !inPick(i, j, pick)) continue
        rows.push({
            key: String(e.id), id: e.aId,
            text: `${nameOf(e.aId)} — ${nameOf(e.bId)}`,
            sub: e.kind,
            color: G.categoryColor(e.category),
        })
    }
    return rows.sort((a, b) => a.text.localeCompare(b.text))
})

/** The heading over that list: what was clicked, and how much of it there is. */
const chordPickLabel = computed(() => {
    const pick = chordPick.value
    const m = chordMatrix.value
    if (!pick) return ''
    const a = m.names[pick.a] ?? ''
    const what = m.by === 'kind' ? 'characters' : 'ties'
    if (pick.b === null) return `${a} — ${chordRows.value.length} ${what}`
    if (pick.a === pick.b) {
        return m.by === 'kind'
            ? `${a} only — ${chordRows.value.length} characters`
            : `Inside ${a} — ${chordRows.value.length} ties`
    }
    const joiner = m.by === 'kind' ? 'and' : '↔'
    return `${a} ${joiner} ${m.names[pick.b] ?? ''} — ${chordRows.value.length} ${what}`
})

const modeHint = computed(() => MODE_HINTS[mode.value])

const loners = computed(() => G.unconnected(characters.value, relations.value))
const sorted = computed(() => [...characters.value].sort((a, b) => a.Name.localeCompare(b.Name)))

const matches = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return []
    return sorted.value.filter(c => c.Name.toLowerCase().includes(q)).slice(0, 8)
})

const selected = computed(() => (selectedId.value ? charById.value.get(selectedId.value) ?? null : null))

/** The selected character's ties, worded from their end — the review list the graph is for. */
const selectedTies = computed(() => {
    const id = selectedId.value
    if (!id) return []
    return relations.value
        .filter(r => r.Character1Id === id || r.Character2Id === id)
        .map(r => {
            const otherId = relationOtherId(r, id)
            return {
                id: r.Id,
                otherId,
                other: charById.value.get(otherId)?.Name ?? 'someone',
                label: relationLabel(r, id, typeById.value.get(r.RelationshipType), selected.value?.Gender ?? null),
                color: G.categoryColor(G.categoryOf(typeById.value.get(r.RelationshipType))),
            }
        })
})

/**
 * The route between the finder's two ends, or null. Off `datedEdges` rather than `visibleEdges`,
 * because a kind unticked to unclutter a picture is not an answer to "how are they related" — and
 * the answer said so all along: *not through the relations recorded here*. The genogram made the
 * gap plain. Its legend edits `treeShown` and shows `hiddenCategories` nowhere, so a list left
 * behind in another view reported a married couple, drawn side by side with their children under
 * them, as unconnected.
 *
 * One search rather than one per reader: the sentence, the trail and the chain view all want the
 * same route, and a BFS over a few hundred people is not free to run three times a frame.
 */
const pathFound = computed(() =>
    pathFrom.value && pathTo.value && pathFrom.value !== pathTo.value
        ? G.shortestPath(datedEdges.value, pathFrom.value, pathTo.value)
        : null,
)

const pathText = computed(() => {
    if (!pathFrom.value || !pathTo.value) return ''
    if (pathFrom.value === pathTo.value) return 'Pick two different characters.'
    if (!pathFound.value) return 'Nothing connects them — not through the relations recorded here.'
    return G.describePath(pathFound.value, relById.value, charById.value, typeById.value)
})

/** The route between the two ends in order, ends included. Empty when there is none. */
const pathRoute = computed(() => pathFound.value?.nodes ?? [])

/** The nodes on the path, so the stage can trace it. Empty when there is no route. */
const pathNodes = computed(() => new Set(pathRoute.value))

// ── Loading ───────────────────────────────────────────────────────────────────

async function load() {
    loading.value = true
    error.value = ''
    try {
        const data = await BackendAPI.GetTimelineRelations(timelineId.value)
        characters.value = data?.Characters ?? []
        relations.value = data?.Relations ?? []
        types.value = data?.Types ?? []

        const first = characters.value[0]?.Id ?? null
        selectedId.value = openOnCharacterId ?? first
        treeRootId.value = selectedId.value
        pathFrom.value = selectedId.value ?? ''

        const span = range.value
        if (span) year.value = span.max
        pinned = await loadPinned()
        // Three reads in a row rather than one `Promise.all`: they are settings, not the cast,
        // and the window is already drawn by the time any of them land.
        arcSpread.value = await arcSpreadPref.load()
        knotRoom.value = await knotRoomPref.load()
        crossFade.value = await crossFadePref.load()
    } catch (ex) {
        error.value = `Could not load the relations: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('RelationsApp load failed', ex)
    } finally {
        loading.value = false
    }
    await nextTick()
    mountStage()
    rebuild()
}

/**
 * The pre-warmed path: the page was navigated with no query string, so the host pushes the ids
 * once the window is actually asked for. Mirrors SetCharactersContext on the characters window.
 */
const stopContextListener = BackendAPI.onHostMessage(msg => {
    if (msg?.action === 'FocusCharacter') {
        const id = msg.payload?.CharacterId as string | undefined
        if (id) focusCharacter(id)
        return
    }
    if (msg?.action !== 'SetRelationsContext') return
    timelineId.value = msg.payload.timelineId
    openOnCharacterId = msg.payload.characterId ?? null
    // The pre-warmed URL carries no ids, so without this F5 would land on an empty window.
    history.replaceState(null, '', `?timelineId=${timelineId.value}`
        + (openOnCharacterId ? `&characterId=${encodeURIComponent(openOnCharacterId)}` : ''))
    load()
})

onMounted(() => { if (timelineId.value) load() })

// ── Pinned positions ──────────────────────────────────────────────────────────
// A dragged node stays put, and staying put is only worth anything if it survives the window.
// misc_settings already keys on (key, timeline_id), so this needs no table of its own.

const POSITIONS_KEY = 'relations_positions'
let pinned: Record<string, { x: number; y: number }> = {}
let saveTimer = 0

async function loadPinned(): Promise<Record<string, { x: number; y: number }>> {
    try {
        const res = await BackendAPI.GetMiscSetting(POSITIONS_KEY, timelineId.value)
        const parsed = res?.value ? JSON.parse(res.value) : null
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (ex) {
        // A lost layout is not worth an error dialog over the window it was opening.
        console.error('[RelationsApp] pinned positions unreadable, starting loose:', ex)
        return {}
    }
}

function savePinnedSoon() {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
        BackendAPI.SetMiscSetting(POSITIONS_KEY, JSON.stringify(pinned), timelineId.value).catch(ex => {
            error.value = `Could not remember where you put them: ${ex instanceof Error ? ex.message : String(ex)}`
            console.error('[RelationsApp] saving pinned positions failed', ex)
        })
    }, 600)
}

/**
 * A slider the window remembers, per timeline. Both of them are 0-100 numbers nobody would open a
 * dialog over, so a failed read starts in the middle and only a failed *write* is worth saying
 * out loud — losing a setting you deliberately moved is the one you would notice.
 */
function rememberedSlider(key: string, what: string, fallback = 50) {
    let timer = 0
    return {
        async load(): Promise<number> {
            try {
                const res = await BackendAPI.GetMiscSetting(key, timelineId.value)
                const n = res?.value ? Number(res.value) : NaN
                return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback
            } catch (ex) {
                // Same reasoning as the pinned positions: a forgotten slider is not a dialog.
                console.error(`[RelationsApp] ${what} unreadable, starting at ${fallback}:`, ex)
                return fallback
            }
        },
        saveSoon(value: number) {
            window.clearTimeout(timer)
            timer = window.setTimeout(() => {
                BackendAPI.SetMiscSetting(key, String(value), timelineId.value).catch(ex => {
                    error.value = `Could not remember the ${what}: ${ex instanceof Error ? ex.message : String(ex)}`
                    console.error(`[RelationsApp] saving ${what} failed`, ex)
                })
            }, 600)
        },
    }
}

const arcSpreadPref = rememberedSlider('relations_arc_spread', 'spread')
const crossFadePref = rememberedSlider('relations_cross_fade', 'crossing ties', 100)
const knotRoomPref = rememberedSlider('relations_knot_room', 'knot distance')

function unpinAll() {
    menu.value = null
    pinned = {}
    for (const n of simNodes) n.pinned = false
    savePinnedSoon()
    kick()
}

// ── The stage ─────────────────────────────────────────────────────────────────

const NODE_R = 26
const stageHost = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let hullGroup: Konva.Group | null = null
let linkGroup: Konva.Group | null = null
let nodeGroup: Konva.Group | null = null
let simNodes: G.SimNode[] = []
const shapes = new Map<string, Konva.Group>()
const images = new Map<string, HTMLImageElement>()
let raf = 0
/** How hot the sim is. A kick reheats it; every tick cools it, and at ALPHA_MIN it stops. */
let alpha = 1
/** True once the current gesture has moved the view, so the click that ends it picks nothing. */
let panned = false
/**
 * Set when the selection came from opening a context menu rather than from a click, so the watcher
 * can ring the character without moving the picture. Cleared on every `mousedown`, which always
 * comes before both the menu and the click that would read it.
 */
let menuPick = false
/** Fit the view once the sim first settles — knots shoved apart can end up wider than the stage. */
let fitOnSettle = false
let observer: ResizeObserver | null = null

function mountStage() {
    const host = stageHost.value
    if (!host || stage) return
    stage = new Konva.Stage({
        container: host,
        width: host.clientWidth || 800,
        height: host.clientHeight || 600,
        draggable: true,
    })
    layer = new Konva.Layer()
    // Behind everything and deaf to clicks: the knot blobs are a backdrop, and a blob that ate
    // the click meant for the character standing on it would be worse than no blob at all.
    hullGroup = new Konva.Group({ listening: false })
    linkGroup = new Konva.Group({ listening: false })
    nodeGroup = new Konva.Group()
    layer.add(hullGroup, linkGroup, nodeGroup)
    stage.add(layer)

    // Wheel zooms about the pointer, which is the only zoom that does not lose what you aimed at.
    stage.on('wheel', e => {
        e.evt.preventDefault()
        const s = stage!
        const old = s.scaleX()
        const pointer = s.getPointerPosition()
        if (!pointer) return
        const next = Math.min(3, Math.max(0.15, old * (e.evt.deltaY > 0 ? 0.92 : 1.08)))
        const rel = { x: (pointer.x - s.x()) / old, y: (pointer.y - s.y()) / old }
        s.scale({ x: next, y: next })
        s.position({ x: pointer.x - rel.x * next, y: pointer.y - rel.y * next })
        s.batchDraw()
    })
    // A pan that starts on the grid ends in a click on the grid, and picking a pair out of the
    // matrix every time you shove the view sideways would make it unusable. Konva bubbles the
    // stage's own drag, so one flag at the top catches every pan however it started.
    stage.on('contextmenu', e => {
        // A character's own handler stops the bubble, so anything reaching here is the backdrop:
        // the grid, a faction box, the empty dark. The menu that belongs to those is the view's.
        e.evt.preventDefault()
        menu.value = { x: e.evt.clientX, y: e.evt.clientY, id: '' }
    })
    stage.on('mousedown touchstart', () => { panned = false; menuPick = false; shotOpen.value = false })
    stage.on('dragmove', () => { panned = true })
    stage.on('click tap', e => {
        if (e.target === stage) {
            selectedId.value = null
            chordPick.value = null
        }
        menu.value = null
    })

    observer = new ResizeObserver(() => {
        if (!stage || !host.clientWidth) return
        stage.width(host.clientWidth)
        stage.height(host.clientHeight)
        stage.batchDraw()
    })
    observer.observe(host)
}

onBeforeUnmount(() => {
    stopContextListener()
    window.clearTimeout(saveTimer)
    cancelAnimationFrame(raf)
    observer?.disconnect()
    stage?.destroy()
})

/** The portrait, loaded once per character and painted in when it arrives. */
function portrait(c: CharacterItem, circle: Konva.Circle) {
    if (!c.PortraitPath) return
    const cached = images.get(c.Id)
    const paint = (img: HTMLImageElement) => {
        const scale = (NODE_R * 2) / Math.min(img.width, img.height)
        circle.fillPriority('pattern')
        circle.fillPatternImage(img)
        circle.fillPatternScale({ x: scale, y: scale })
        circle.fillPatternOffset({ x: img.width / 2, y: img.height / 2 })
        layer?.batchDraw()
    }
    if (cached) {
        paint(cached)
        return
    }
    const img = new window.Image()
    img.onload = () => {
        images.set(c.Id, img)
        paint(img)
    }
    // A missing portrait file leaves the initials showing, which is the same as having none.
    img.onerror = () => console.warn(`[RelationsApp] portrait missing for ${c.Name}`)
    img.src = mediaUrl(c.PortraitPath)
}

/** How far outside the portrait disc the genogram's sex frame and death cross sit. */
const FRAME_R = 34
/** One generation's worth of stage, the natural unit for "is this tie near or far". */
const TREE_ROW_PX = G.TREE_ROW
/** Below this a portrait is a dot and a name is a smudge, so there is no point fitting past it. */
const MIN_READABLE_SCALE = 0.45

/**
 * The genogram convention: a man is a square, a woman a circle, anyone else a diamond. It is
 * drawn as a frame around the portrait disc rather than instead of it, so a face is still a face
 * — the shape is the one piece of information the disc cannot carry.
 *
 * Gender is free text, so this reads it through the same `genderKey` the relation wording uses:
 * a world that writes 'he/him' gets a square, and one that writes something else gets a diamond
 * rather than a guess.
 */
function genderFrame(c: CharacterItem): Konva.Shape {
    const common = { stroke: c.Color || '#6366f1', strokeWidth: 2, listening: false }
    const key = genderKey(c.Gender)
    if (key === 'F') return new Konva.Circle({ ...common, radius: FRAME_R })
    return new Konva.Rect({
        ...common,
        width: FRAME_R * 1.8, height: FRAME_R * 1.8,
        offsetX: FRAME_R * 0.9, offsetY: FRAME_R * 0.9,
        rotation: key === 'M' ? 0 : 45,
    })
}

/**
 * How solid an overlaid tie draws, by how far it has to reach. Full within a couple of rows,
 * tailing off to a quarter beyond about ten — see the comment where it is used.
 */
function overlayFade(distance: number): number {
    const far = TREE_ROW_PX * 10
    if (distance <= TREE_ROW_PX * 2) return 0.9
    return 0.9 - 0.65 * Math.min(1, (distance - TREE_ROW_PX * 2) / (far - TREE_ROW_PX * 2))
}

/** Dead: a cross through the frame, which is how a genogram has always said it. */
function deathCross(): Konva.Shape {
    return new Konva.Line({
        points: [-FRAME_R, -FRAME_R, FRAME_R, FRAME_R],
        stroke: '#e2e8f0', strokeWidth: 2, opacity: 0.85, listening: false,
    })
}

function buildNode(c: CharacterItem, draggable: boolean): Konva.Group {
    const group = new Konva.Group({ id: c.Id, draggable })
    const circle = new Konva.Circle({
        radius: NODE_R,
        fill: '#1e293b',
        stroke: c.Color || '#6366f1',
        strokeWidth: 2.5,
    })
    group.add(circle)
    // Who you last clicked, in every view that draws discs. It is built hidden unless it is them
    // and flipped by `markSelection`, so a view that re-lays out under the click gets the mark for
    // free and one that does not still gets it.
    group.add(new Konva.Circle({
        name: 'sel',
        radius: NODE_R + 5,
        stroke: '#f8fafc',
        strokeWidth: 3,
        shadowColor: '#020617',
        shadowBlur: 6,
        visible: c.Id === selectedId.value,
        listening: false,
    }))
    if (c.PortraitPath) portrait(c, circle)
    else
        group.add(new Konva.Text({
            text: initials(c),
            fontSize: 15,
            fontStyle: 'bold',
            fill: '#e2e8f0',
            width: NODE_R * 2,
            offsetX: NODE_R,
            offsetY: 7,
            align: 'center',
            listening: false,
        }))

    group.add(new Konva.Text({
        // Named so the arc can move it above the disc — below the line is where its ties hang.
        name: 'label',
        text: c.Name,
        fontSize: 12,
        fill: '#cbd5e1',
        width: 150,
        offsetX: 75,
        y: NODE_R + 7,
        align: 'center',
        listening: false,
    }))

    group.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'pointer' })
    group.on('mouseleave', () => { if (stage) stage.container().style.cursor = 'default' })
    group.on('click tap', evt => {
        // Konva fires `click` for every mouse button — there is no button test anywhere in its
        // `_pointerup` — so a right-click ran this as well as the menu handler below, re-rooting
        // the genogram out from under the menu it had just opened. A tap carries no button at
        // all, which is why this asks whether there is one rather than comparing straight away.
        if ('button' in evt.evt && evt.evt.button !== 0) return
        evt.cancelBubble = true
        menu.value = null
        selectedId.value = c.Id
        // In the tree a click is a re-root: there is no dimming there, and "show me their
        // family" is the only thing clicking a relative could sensibly mean.
        if (mode.value === 'tree') treeRootId.value = c.Id
    })
    group.on('dblclick dbltap', evt => {
        evt.cancelBubble = true
        BackendAPI.OpenCharactersWindow(timelineId.value, c.Id).catch(ex => {
            error.value = `Could not open the characters window: ${ex}`
            console.error('OpenCharactersWindow failed', ex)
        })
    })
    group.on('contextmenu', evt => {
        evt.evt.preventDefault()
        evt.cancelBubble = true
        // Ringed, so you can see whose menu this is; the watcher does the rest of a selection —
        // re-laying out and re-fitting three of the views — and a picture that re-fits under an
        // open menu walks the character out from under the cursor that picked them.
        menuPick = true
        selectedId.value = c.Id
        // The menu is position: fixed, so the native event's viewport coords are the answer —
        // no adding up the sidebar width and the title bar height and getting it wrong.
        menu.value = { x: evt.evt.clientX, y: evt.evt.clientY, id: c.Id }
    })
    group.on('dragend', () => {
        const node = simNodes.find(n => n.id === c.Id)
        if (!node) return
        node.x = group.x()
        node.y = group.y()
        node.pinned = true
        pinned[c.Id] = { x: node.x, y: node.y }
        savePinnedSoon()
        kick()
    })
    return group
}

// ── Graph mode ────────────────────────────────────────────────────────────────

function buildGraph() {
    if (!stage || !linkGroup || !nodeGroup) return
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()

    const width = stage.width()
    const height = stage.height()
    const ids = characters.value.map(c => c.Id)
    simNodes = mode.value === 'clusters'
        ? L.clusterSeed(ids, clusters.value, width, height)
        : G.seedPositions(ids, width, height)
    for (const n of simNodes) {
        const saved = pinned[n.id]
        if (!saved) continue
        n.x = saved.x
        n.y = saved.y
        n.pinned = true
    }

    for (const e of allEdges.value) {
        linkGroup.add(new Konva.Line({
            name: `edge-${e.id}`,
            points: [0, 0, 0, 0],
            stroke: G.categoryColor(e.category),
            strokeWidth: G.edgeWidth(e.strength),
            dash: G.edgeDash(e.modifier),
        }))
    }
    for (const c of characters.value) {
        const group = buildNode(c, true)
        shapes.set(c.Id, group)
        nodeGroup.add(group)
    }
    paintGraph()
    // Only on the way in. Refitting on every settle would yank the view out from under anyone who
    // had just dragged somebody, and a drag reheats the sim.
    fitOnSettle = mode.value === 'clusters'
    kick()
}

/** Reheats the sim; called whenever something moved or the set of edges changed. */
function kick(heat = 1) {
    if (!isForce.value || !stage) return
    alpha = Math.max(alpha, heat)
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tick)
}

function tick() {
    if (!stage || !isForce.value) return
    const moved = G.stepForces(simNodes, visibleEdges.value, {
        width: stage.width(),
        height: stage.height(),
        clusterOf: mode.value === 'clusters' ? clusters.value : undefined,
        clusterRoom: knotRoomPx(knotRoom.value),
        alpha,
    })
    alpha *= G.ALPHA_DECAY
    paintGraph()
    // Two ways to stop. Settled: under a twentieth of a pixel a frame each, which is a total
    // across the cast, not a fixed number — at eighty nodes a fixed one asks for stillness no
    // spring sim ever reaches. Or cooled off: a big enough web never quite settles, and a layout
    // that keeps crawling is unreadable and eats the battery.
    raf = alpha > G.ALPHA_MIN && moved > simNodes.length * 0.05 ? requestAnimationFrame(tick) : 0
    if (raf || !fitOnSettle) return
    fitOnSettle = false
    // Room for the blob round the outermost node and the name sitting above it.
    const pad = L.HULL_PAD + 34
    fitStage(
        Math.min(...simNodes.map(n => n.x)) - pad, Math.min(...simNodes.map(n => n.y)) - pad,
        Math.max(...simNodes.map(n => n.x)) + pad, Math.max(...simNodes.map(n => n.y)) + pad,
    )
}

function paintGraph() {
    if (!linkGroup || !isForce.value) return
    const byId = new Map(simNodes.map(n => [n.id, n]))
    paintHulls(byId)
    // Dimming belongs to the views that move: in a fixed layout the shape is the answer, and
    // greying out everyone but one person hides it. There the selection gets a ring instead.
    const focus = isForce.value && selectedId.value ? G.oneHop(visibleEdges.value, selectedId.value) : null
    const shown = new Set(visibleEdges.value.map(e => e.id))
    const path = pathNodes.value

    for (const e of allEdges.value) {
        const line = linkGroup.findOne<Konva.Line>(`.edge-${e.id}`)
        const a = byId.get(e.aId)
        const b = byId.get(e.bId)
        if (!line || !a || !b) continue
        const onPath = path.has(e.aId) && path.has(e.bId)
        const dim = focus ? !(focus.has(e.aId) && focus.has(e.bId)) : false
        line.points([a.x, a.y, b.x, b.y])
        line.visible(shown.has(e.id))
        line.strokeWidth(onPath ? 3.4 : G.edgeWidth(e.strength))
        line.opacity(onPath ? 1 : dim ? 0.1 : 0.55)
    }

    for (const c of characters.value) {
        const group = shapes.get(c.Id)
        const node = byId.get(c.Id)
        if (!group || !node) continue
        group.position({ x: node.x, y: node.y })
        const state = G.lifeStateAt(c, asOfYear.value)
        const dim = focus ? !focus.has(c.Id) : false
        // Not born yet is a stronger statement than dead: one is "not here", the other "was".
        const life = state === 'unborn' ? 0.12 : state === 'dead' ? 0.45 : 1
        group.opacity(path.size && !path.has(c.Id) ? 0.15 : dim ? 0.18 : life)
        group.findOne<Konva.Circle>('Circle')?.strokeWidth(c.Id === selectedId.value ? 5 : 2.5)
    }
    layer?.batchDraw()
}

// ── Knots ─────────────────────────────────────────────────────────────────────

/**
 * What the distance slider means, in px of room a knot claims per √member. The bottom of the
 * range is roughly where the knots touch — the old behaviour, minus the stacking — and the top
 * pushes them right apart, at the cost of a smaller picture, since the view then has to zoom out
 * to fit.
 *
 * `mid` is the middle of the dial, and it is a fixed point rather than whatever the arithmetic
 * lands on: the top of the range has been raised twice (78 → 160 → 200), and each of those on a
 * single curve would have dragged the midpoint up with it and changed what every saved setting
 * drew on reopening. Two geometric halves instead, so 50 always means 46px whatever the top says.
 */
const KNOT_ROOM = { min: 14, mid: 46, max: 200 }

/** The slider's 0–100 as px per √member. See `KNOT_ROOM`. */
function knotRoomPx(v: number): number {
    return v < 50
        ? KNOT_ROOM.min * (KNOT_ROOM.mid / KNOT_ROOM.min) ** (v / 50)
        : KNOT_ROOM.mid * (KNOT_ROOM.max / KNOT_ROOM.mid) ** ((v - 50) / 50)
}

/** A knot of one is a stray, not a group; a blob drawn round a lone character is just noise. */
const HULL_MIN = 2
const HULL_FILL = 0.16
const HULL_LABEL = 0.78

/** What the knots were last built for, so they are only rebuilt when they actually change. */
let hullSig = ''

/**
 * The soft blob behind each knot. Runs inside the sim loop, so it does as little as it can get
 * away with: the shapes are only rebuilt when the knots themselves change — which is when the
 * edges do, not when the nodes move — and every other frame is just new points on the same Line.
 */
function paintHulls(byId: Map<string, G.SimNode>) {
    if (!hullGroup) return
    hullGroup.visible(mode.value === 'clusters')
    if (mode.value !== 'clusters') return

    const byKnot = new Map<number, string[]>()
    for (const n of simNodes) {
        const key = clusters.value.get(n.id)
        if (key === undefined) continue
        const got = byKnot.get(key)
        if (got) got.push(n.id)
        else byKnot.set(key, [n.id])
    }
    const keys = [...byKnot.keys()]
        .filter(k => (byKnot.get(k)?.length ?? 0) >= HULL_MIN)
        .sort((a, b) => a - b)

    const sig = keys.map(k => `${k}:${byKnot.get(k)!.length}`).join('|')
    if (sig !== hullSig) {
        hullSig = sig
        hullGroup.destroyChildren()
        const degree = new Map<string, number>()
        for (const e of visibleEdges.value) {
            degree.set(e.aId, (degree.get(e.aId) ?? 0) + 1)
            degree.set(e.bId, (degree.get(e.bId) ?? 0) + 1)
        }
        for (const [i, k] of keys.entries()) {
            const ids = byKnot.get(k)!
            // Spread evenly round the wheel rather than hashed: a hash is free but it collides,
            // and two knots sitting side by side in the same dusty pink is the one thing this
            // view cannot afford. Keys are sorted, so a knot keeps its colour while you look.
            const color = `hsl(${Math.round((i / keys.length) * 360)}, 68%, 62%)`
            hullGroup.add(new Konva.Line({
                name: `hull-${k}`,
                points: [0, 0],
                fill: color,
                stroke: color,
                // The stroke *is* the padding: half of it lands outside the hull, and round joins
                // and caps turn the corners over. No offsetting maths, no inflated polygon.
                strokeWidth: L.HULL_PAD * 2,
                lineJoin: 'round',
                lineCap: 'round',
                opacity: HULL_FILL,
            }))
            // Named after whoever in it has the most ties. "Knot 3" says nothing; this is usually
            // the character the rest of them are in the same knot because of.
            const lead = ids.reduce((a, b) => ((degree.get(b) ?? 0) > (degree.get(a) ?? 0) ? b : a))
            const name = characters.value.find(c => c.Id === lead)?.Name ?? ''
            hullGroup.add(new Konva.Text({
                name: `hullname-${k}`,
                text: `${name} and ${ids.length - 1} other${ids.length === 2 ? '' : 's'}`,
                fontSize: 13,
                fontStyle: '600',
                fill: color,
                opacity: HULL_LABEL,
                listening: false,
            }))
        }
    }

    for (const k of keys) {
        const line = hullGroup.findOne<Konva.Line>(`.hull-${k}`)
        if (!line) continue
        const pts: { x: number; y: number }[] = []
        for (const id of byKnot.get(k)!) {
            const n = byId.get(id)
            if (n) pts.push({ x: n.x, y: n.y })
        }
        if (!pts.length) continue
        const hull = L.convexHull(pts)
        line.points(hull.flatMap(p => [p.x, p.y]))
        // Two people make a capsule, not a polygon — closing it would double the line back.
        line.closed(hull.length >= 3)
        const label = hullGroup.findOne<Konva.Text>(`.hullname-${k}`)
        if (!label) continue
        label.position({
            x: hull.reduce((s, p) => s + p.x, 0) / hull.length,
            y: Math.min(...hull.map(p => p.y)) - L.HULL_PAD - 20,
        })
        label.offsetX(label.width() / 2)
    }
}

// ── Fitting ────────────────────────────────────────────────────────────────

/** Zoom and pan so a worked-out layout is on screen, instead of half off the edge of it. */
function fitStage(minX: number, minY: number, maxX: number, maxY: number) {
    if (!stage) return
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const scale = Math.max(0.15, Math.min(1, (stage.width() - 40) / w, (stage.height() - 40) / h))
    stage.scale({ x: scale, y: scale })
    stage.position({
        x: (stage.width() - w * scale) / 2 - minX * scale,
        y: (stage.height() - h * scale) / 2 - minY * scale,
    })
}

/**
 * Show the whole layout while that is still readable; past that hold `floor`, open on `focus` and
 * let the writer pan. `clampPan` keeps the content covering the stage, so you are never looking at
 * half a screen of nothing with chart still off the edge. Both charts that use this run several
 * stages wide on a real cast, so the floor is the usual branch, not the corner.
 *
 * The genogram can stand 0.45, because its shape still reads when the faces have gone: you can see
 * a family is wide or deep from across the room. The arc is a row of names and years and nothing
 * else, so zooming it out leaves nothing to look at — it holds 1 and pans instead.
 */
function fitOrHold(
    minX: number, minY: number, maxX: number, maxY: number,
    focus?: { x: number; y: number },
    floor = MIN_READABLE_SCALE,
) {
    if (!stage) return
    const fit = Math.min(1,
        (stage.width() - 40) / Math.max(1, maxX - minX),
        (stage.height() - 40) / Math.max(1, maxY - minY))
    if (fit >= floor || !focus) {
        fitStage(minX, minY, maxX, maxY)
        return
    }
    stage.scale({ x: floor, y: floor })
    stage.position({
        x: G.clampPan(stage.width() / 2 - focus.x * floor, minX, maxX, stage.width(), floor),
        y: G.clampPan(stage.height() / 2 - focus.y * floor, minY, maxY, stage.height(), floor),
    })
}


/** Flip the selection ring onto whoever is picked, wherever discs are drawn. */
function markSelection() {
    for (const [id, group] of shapes) {
        group.findOne<Konva.Circle>('.sel')?.visible(id === selectedId.value)
    }
}

/**
 * Keep the selected character on screen after a layout that moved them. The genogram re-roots under
 * the click, the arc and the sociogram re-thread, and switching views places everyone somewhere
 * else entirely — so the person you just picked can end up off the edge, which is exactly the
 * complaint: the chart jumps and you cannot find yourself in it.
 *
 * Only when they are actually out of sight. A view that already shows them should not lurch to
 * centre them every time you click, and the ring is enough on its own when they are on screen.
 */
function holdSelection() {
    if (!stage || !selectedId.value) return
    const group = shapes.get(selectedId.value)
    if (!group) return
    const scale = stage.scaleX()
    const x = group.x() * scale + stage.x()
    const y = group.y() * scale + stage.y()
    const pad = NODE_R * scale + 30
    if (x >= pad && x <= stage.width() - pad && y >= pad && y <= stage.height() - pad) return
    stage.position({
        x: stage.width() / 2 - group.x() * scale,
        y: stage.height() / 2 - group.y() * scale,
    })
}


// ── Grid mode ─────────────────────────────────────────────────────────────────

const CELL = 22
/** Room for the names down the side and up the top. */
const GUTTER = 150

function buildMatrix() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()
    simNodes = []

    const order = L.matrixOrder(
        sorted.value.map(c => c.Id), visibleEdges.value, clusters.value, factionOf.value,
    )
    const at = new Map(order.map((id, i) => [id, i]))
    const size = order.length * CELL

    linkGroup.add(new Konva.Rect({
        x: GUTTER, y: GUTTER, width: size, height: size,
        fill: '#0b1220', stroke: '#1e293b', strokeWidth: 1,
    }))
    // A line every fifth row and column, so the eye can count across a wide grid.
    for (let i = 5; i < order.length; i += 5) {
        const p = GUTTER + i * CELL
        linkGroup.add(new Konva.Line({ points: [p, GUTTER, p, GUTTER + size], stroke: '#1e293b' }))
        linkGroup.add(new Konva.Line({ points: [GUTTER, p, GUTTER + size, p], stroke: '#1e293b' }))
    }
    // The diagonal is nobody's relation with themselves; it is there to follow a row across.
    for (let i = 0; i < order.length; i++) {
        linkGroup.add(new Konva.Rect({
            x: GUTTER + i * CELL, y: GUTTER + i * CELL, width: CELL, height: CELL, fill: '#1e293b',
        }))
    }

    const focusAt = selectedId.value ? at.get(selectedId.value) : undefined
    if (focusAt !== undefined) {
        for (const band of [
            { x: GUTTER, y: GUTTER + focusAt * CELL, width: size, height: CELL },
            { x: GUTTER + focusAt * CELL, y: GUTTER, width: CELL, height: size },
        ]) linkGroup.add(new Konva.Rect({ ...band, fill: '#6366f1', opacity: 0.14 }))
    }

    // Which square the finder is asking about. A click off the diagonal filled the two
    // dropdowns and changed nothing on the grid, so there was no telling what you had just hit —
    // and on an eighty-row grid the bands are how you find it again.
    const fromAt = at.get(pathFrom.value)
    const toAt = at.get(pathTo.value)
    const pair = fromAt !== undefined && toAt !== undefined && fromAt !== toAt
        ? { row: fromAt, col: toAt }
        : null
    if (pair) {
        for (const band of [
            { x: GUTTER, y: GUTTER + pair.row * CELL, width: size, height: CELL },
            { x: GUTTER + pair.col * CELL, y: GUTTER, width: CELL, height: size },
        ]) linkGroup.add(new Konva.Rect({ ...band, fill: '#f8fafc', opacity: 0.07 }))
    }

    for (const e of visibleEdges.value) {
        const i = at.get(e.aId)
        const j = at.get(e.bId)
        if (i === undefined || j === undefined) continue
        const fill = G.categoryColor(e.category)
        const opacity = 0.35 + (Math.max(0, Math.min(e.strength, 100)) / 100) * 0.65
        // Both halves: the grid is symmetric because a relation is stored once and read both ways.
        for (const [r, c] of [[i, j], [j, i]]) {
            linkGroup.add(new Konva.Rect({
                x: GUTTER + c! * CELL + 1.5, y: GUTTER + r! * CELL + 1.5,
                width: CELL - 3, height: CELL - 3,
                fill, opacity, cornerRadius: 3,
            }))
        }
    }

    // Over the squares rather than under them: the mark has to read on a filled cell and on an
    // empty one, and an empty one is exactly the pair you asked about to find out there is
    // nothing there. Both halves, because the grid is symmetric.
    for (const cell of pair ? [[pair.row, pair.col], [pair.col, pair.row]] : []) {
        linkGroup.add(new Konva.Rect({
            x: GUTTER + cell[1]! * CELL, y: GUTTER + cell[0]! * CELL,
            width: CELL, height: CELL,
            stroke: '#f8fafc', strokeWidth: 2, cornerRadius: 3,
        }))
    }

    // The route as a staircase. Each step is the square where its two people meet, and the elbow
    // joining one step to the next turns on the diagonal square of the person they have in common
    // — which is what going *through* somebody looks like on a grid. Only with a middle step to
    // draw: two people directly related are the pair mark above, and saying it twice says less.
    const route = showPath.value && pathRoute.value.length > 2 ? pathRoute.value : []
    const mid = (i: number) => GUTTER + i * CELL + CELL / 2
    for (const [k, id] of route.slice(0, -1).entries()) {
        const i = at.get(id)
        const j = at.get(route[k + 1]!)
        if (i === undefined || j === undefined) continue
        const next = k + 2 < route.length ? at.get(route[k + 2]!) : undefined
        if (next !== undefined) {
            linkGroup.add(new Konva.Line({
                points: [mid(j), mid(i), mid(j), mid(j), mid(next), mid(j)],
                stroke: '#f8fafc', strokeWidth: 2.5, dash: [5, 3], opacity: 0.95, listening: false,
            }))
        }
        linkGroup.add(new Konva.Rect({
            x: GUTTER + j * CELL, y: GUTTER + i * CELL, width: CELL, height: CELL,
            stroke: '#f8fafc', strokeWidth: 2, cornerRadius: 3,
        }))
        linkGroup.add(new Konva.Text({
            text: String(k + 1), x: GUTTER + j * CELL, y: GUTTER + i * CELL + 5,
            width: CELL, align: 'center', fontSize: 11, fontStyle: 'bold',
            fill: '#f8fafc', listening: false,
        }))
    }

    // One transparent sheet over the whole grid rather than a listening rect per pair: every
    // square answers, including the empty ones. "How are these two related" is a question you ask
    // precisely about the pairs with no line between them.
    const sheet = new Konva.Rect({
        x: GUTTER, y: GUTTER, width: size, height: size, fill: 'transparent',
    })
    sheet.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'crosshair' })
    sheet.on('mouseleave', () => { if (stage) stage.container().style.cursor = 'default' })
    sheet.on('click tap', () => {
        if (panned) return
        // Relative to the sheet, whose own origin is already the grid's top-left corner —
        // taking the gutter off again would read a click seven rows up and to the left of itself.
        const p = sheet.getRelativePointerPosition()
        if (!p) return
        const row = order[Math.floor(p.y / CELL)]
        const col = order[Math.floor(p.x / CELL)]
        if (!row || !col) return
        // The diagonal is nobody's relation with themselves, so it means the other obvious thing.
        if (row === col) { selectedId.value = row; return }
        pathFrom.value = row
        pathTo.value = col
    })
    nodeGroup.add(sheet)

    for (const [i, id] of order.entries()) {
        const c = charById.value.get(id)
        if (!c) continue
        const on = id === selectedId.value
        const style = {
            fontSize: 11,
            fill: on ? '#f8fafc' : '#94a3b8',
            fontStyle: on ? 'bold' : 'normal',
            wrap: 'none' as const,
            ellipsis: true,
            width: GUTTER - 20,
        }
        const row = new Konva.Text({
            ...style, text: c.Name, x: 8, y: GUTTER + i * CELL + CELL / 2 - 6, align: 'right',
        })
        // Rotated a quarter turn: the column names read upward out of their own column.
        const col = new Konva.Text({
            ...style, text: c.Name, x: GUTTER + i * CELL + CELL / 2, y: GUTTER - 10,
            offsetY: 6, rotation: -90, align: 'left',
        })
        // Down the side is A and across the top is B, so a name does half of what a cell does
        // and two names do the whole of it. Selecting as well, because the name is still the only
        // way to band a row, and a click that only filled a dropdown would feel like it missed.
        for (const [label, slot] of [[row, pathFrom], [col, pathTo]] as const) {
            label.on('click tap', () => {
                if (panned) return
                slot.value = id
                selectedId.value = id
            })
            label.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'pointer' })
            label.on('mouseleave', () => { if (stage) stage.container().style.cursor = 'default' })
            nodeGroup.add(label)
        }
    }

    fitStage(0, 0, GUTTER + size + 10, GUTTER + size + 10)
    layer?.batchDraw()
}

// ── Tree mode ─────────────────────────────────────────────────────────────────

const treeEmpty = ref(false)

function buildTree() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()

    const rootId = treeRootId.value ?? selectedId.value
    const tree = rootId
        ? G.hourglassLayout(characters.value, relations.value, rootId)
        : { nodes: [], unions: [], width: 0, height: 0 }
    treeEmpty.value = tree.nodes.length <= 1

    const centre = tree.nodes.find(n => n.id === rootId)
    const dx = stage.width() / 2 - (centre?.x ?? 0)
    const dy = stage.height() / 2 - (centre?.y ?? 0)
    const at = new Map(tree.nodes.map(n => [n.id, { x: n.x + dx, y: n.y + dy }]))
    /** Each union's sibling bar, filled in as the elbows are drawn and read back by the route. */
    const barAt = new Map<(typeof tree.unions)[number], number>()

    // Orthogonal elbows: parents drop into the union, the union drops to a sibling bar, each
    // child rises to it. The convention, and the one you can actually follow with your eye.
    for (const union of tree.unions) {
        const ux = union.x + dx
        const uy = union.y + dy
        for (const parentId of union.parentIds) {
            const p = at.get(parentId)
            if (!p) continue
            linkGroup.add(new Konva.Line({
                points: [p.x, p.y + NODE_R, p.x, uy, ux, uy],
                stroke: '#475569',
                strokeWidth: 1.6,
            }))
        }
        const kids = union.childIds.map(id => at.get(id)).filter((p): p is { x: number; y: number } => !!p)
        if (!kids.length) continue
        const barY = Math.min(...kids.map(k => k.y)) - NODE_R - 22
        barAt.set(union, barY)
        linkGroup.add(new Konva.Line({
            points: [ux, uy, ux, barY, Math.min(...kids.map(k => k.x)), barY, Math.max(...kids.map(k => k.x)), barY],
            stroke: '#475569',
            strokeWidth: 1.6,
        }))
        for (const kid of kids) {
            linkGroup.add(new Konva.Line({
                points: [kid.x, barY, kid.x, kid.y - NODE_R],
                stroke: '#475569',
                strokeWidth: 1.6,
            }))
        }
        linkGroup.add(new Konva.Rect({
            x: ux - 5, y: uy - 5, width: 10, height: 10,
            fill: '#64748b', cornerRadius: 2,
        }))
    }

    // Everything the chart is not built from. Drawn after the kinship elbows so it sits over
    // them, and before the nodes so it runs under the faces rather than across them.
    for (const e of G.overlayEdges(datedEdges.value, new Set(at.keys()))) {
        if (!treeShown.value.includes(e.category)) continue
        const a = at.get(e.aId)
        const b = at.get(e.bId)
        if (!a || !b) continue
        const hostile = e.category === 'hostile'
        linkGroup.add(new Konva.Line({
            points: hostile ? G.jaggedPoints(a, b, FRAME_R) : G.bowPoints(a, b, FRAME_R),
            stroke: G.categoryColor(e.category),
            strokeWidth: G.edgeWidth(e.strength),
            dash: G.edgeDash(e.modifier),
            // A bow is three points; the tension rounds it into the curve. A sawtooth is already
            // the shape it wants to be, and smoothing it would round the teeth off.
            tension: hostile ? 0 : 0.5,
            // Faded by how far it reaches. A chart of eighty people is wide, and at full strength
            // the ties between opposite ends of it cross everything and drown the family under
            // them. Near ties are the ones a genogram is read for; distant ones stay visible as a
            // hint that the two are connected at all, which is as much as a line that long can say.
            opacity: overlayFade(Math.hypot(b.x - a.x, b.y - a.y)),
            listening: false,
        }))
    }

    // Past the last year the scrubber knows about, so an undated 'as of' still marks anyone with
    // a death date — on a genogram the cross is a fact about the person, not about the moment.
    const asOf = asOfYear.value ?? Number.POSITIVE_INFINITY
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of tree.nodes) {
        const c = charById.value.get(node.id)
        const pos = at.get(node.id)
        if (!c || !pos) continue
        minX = Math.min(minX, pos.x - FRAME_R)
        minY = Math.min(minY, pos.y - FRAME_R)
        maxX = Math.max(maxX, pos.x + FRAME_R)
        maxY = Math.max(maxY, pos.y + FRAME_R + 22)
        const group = buildNode(c, false)
        group.position(pos)
        const frame = genderFrame(c)
        group.add(frame)
        frame.moveToBottom()
        if (G.lifeStateAt(c, asOf) === 'dead') group.add(deathCross())
        if (node.id === rootId) {
            const ring = group.findOne<Konva.Circle>('Circle')
            ring?.strokeWidth(5)
        }
        shapes.set(c.Id, group)
        nodeGroup.add(group)
    }
    // The route between the finder's two ends — but found *inside this chart*. The genogram is
    // one hourglass around one root, not the whole cast, so a shortest path through the whole web
    // can step through people who are not drawn here, and a numbered trail with gaps in it is
    // worse than no trail. Searching only the ties this chart draws also keeps the legend honest:
    // a category it has hidden is not a step the route is allowed to take.
    const onChart = new Set(at.keys())
    const hiddenHere = new Set(G.overlayEdges(datedEdges.value, onChart)
        .filter(e => !treeShown.value.includes(e.category)).map(e => e.id))
    const route = showPath.value && pathFrom.value !== pathTo.value
        && onChart.has(pathFrom.value) && onChart.has(pathTo.value)
        ? G.shortestPath(
            datedEdges.value.filter(e => onChart.has(e.aId) && onChart.has(e.bId) && !hiddenHere.has(e.id)),
            pathFrom.value, pathTo.value,
        )?.nodes ?? []
        : []

    for (const [k, id] of route.slice(0, -1).entries()) {
        const nextId = route[k + 1]!
        const a = at.get(id)
        const b = at.get(nextId)
        if (!a || !b) continue
        // Traced along the chart's own elbows rather than cut straight across it: a line drawn
        // from a grandparent to a grandchild says nothing about how they are related, and the
        // elbows are what the eye follows in a genogram anyway. Each end of a step is either a
        // parent dropping into the union or a child rising to the sibling bar, which is the same
        // two shapes the loop above drew. Anything that is not kin — a friendship, a rivalry —
        // has no union to follow and takes the bow the overlay already drew it as.
        const union = tree.unions.find(u =>
            (u.parentIds.includes(id) && (u.parentIds.includes(nextId) || u.childIds.includes(nextId)))
            || (u.childIds.includes(id) && u.parentIds.includes(nextId)))
        const legs: number[][] = []
        if (union) {
            const ux = union.x + dx
            const uy = union.y + dy
            const barY = barAt.get(union)
            const ends: [{ x: number; y: number }, string][] = [[a, id], [b, nextId]]
            for (const [who, whoId] of ends) {
                if (union.parentIds.includes(whoId)) legs.push([who.x, who.y + NODE_R, who.x, uy, ux, uy])
                else if (barY !== undefined) legs.push([ux, uy, ux, barY, who.x, barY, who.x, who.y - NODE_R])
            }
        } else {
            legs.push(G.bowPoints(a, b, FRAME_R))
        }
        for (const points of legs) {
            linkGroup.add(new Konva.Line({
                points,
                stroke: '#f8fafc',
                strokeWidth: 3,
                opacity: 0.95,
                // Same rule as the overlay: a three-point bow needs the tension to become a curve,
                // an elbow is already the shape it means and smoothing would round the corners off.
                tension: union ? 0 : 0.5,
                listening: false,
            }))
        }
    }
    // Into `nodeGroup` after every face, or the numbers end up buried under the people they
    // belong to — the same mistake the chain's step wording made. Numbered by person rather than
    // by step, so the digits count off the names in the sentence in the sidebar.
    for (const [k, id] of route.entries()) {
        const p = at.get(id)
        if (!p) continue
        nodeGroup.add(new Konva.Circle({
            x: p.x, y: p.y, radius: FRAME_R + 7,
            stroke: '#f8fafc', strokeWidth: 2.5, listening: false,
        }))
        nodeGroup.add(new Konva.Text({
            text: String(k + 1), x: p.x - FRAME_R - 30, y: p.y - FRAME_R - 24,
            fontSize: 15, fontStyle: 'bold', fill: '#f8fafc', listening: false,
        }))
    }

    // A whole family on screen at once, rather than the root at whatever zoom the last view
    // happened to leave behind — a chart you have to hunt around to read is not a chart.
    if (Number.isFinite(minX)) fitOrHold(minX, minY, maxX, maxY, rootId ? at.get(rootId) : undefined)
    layer?.batchDraw()
}

// ── Arc ───────────────────────────────────────────────────────────────────────

/** A disc and then some: the closest two people are ever placed along the axis. */
const ARC_GAP = 72
/** Where an arc stops climbing. Past this a tie across the whole cast is a ceiling, not a bow. */
const ARC_RISE_MAX = 260
/** The drop between two generations' rows: a disc, the two heights its name sits at, and daylight. */
const ARC_ROW = 170

function buildArc() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()
    simNodes = []

    const years = new Map(characters.value.map(c => [c.Id, c.BirthYear]))
    const layout = L.arcLayout(sorted.value.map(c => c.Id), years, arcSpread.value / 100, ARC_GAP)
    const at = new Map(layout.placed.map(p => [p.id, p]))

    // `arcLayout` puts everyone on one line and has nothing to say about who anyone's parents
    // are, so the rows are written onto its answer here: same x, one row down per generation.
    const gens = arcRows.value ? G.generationOf(relations.value, layout.placed.map(p => p.id)) : null
    if (gens) for (const p of layout.placed) p.y = (gens.get(p.id) ?? 0) * ARC_ROW
    const rows = gens?.size ? Math.max(...gens.values()) + 1 : 1

    for (let row = 0; row < rows; row++) {
        const y = row * ARC_ROW
        linkGroup.add(new Konva.Line({
            points: [-ARC_GAP, y, layout.width + ARC_GAP, y],
            stroke: '#334155', strokeWidth: 1.5, listening: false,
        }))
        // Under the line at the left end: above it is where the first person's name and year are.
        if (gens) {
            linkGroup.add(new Konva.Text({
                text: `generation ${row + 1}`, x: -ARC_GAP, y: y + NODE_R + 10,
                fontSize: 11, fill: '#64748b', listening: false,
            }))
        }
    }
    // The undated wait past a fence, rather than at the end of a century they were never in.
    if (layout.undatedFrom !== null && layout.undatedFrom > 0) {
        const fence = layout.undatedFrom - ARC_GAP
        linkGroup.add(new Konva.Line({
            points: [fence, -90, fence, (rows - 1) * ARC_ROW + 90],
            stroke: '#334155', dash: [4, 4], listening: false,
        }))
        linkGroup.add(new Konva.Text({
            text: 'no birth year', x: fence + 8, y: -88,
            fontSize: 11, fill: '#64748b', listening: false,
        }))
    }

    const lit = selectedId.value
    for (const e of visibleEdges.value) {
        const pa = at.get(e.aId)
        const pb = at.get(e.bId)
        if (!pa || !pb) continue
        const [l, r] = pa.x <= pb.x ? [pa, pb] : [pb, pa]
        // Descent and marriage over the line, everything chosen rather than inherited under it:
        // twice the room, and which side a curve is on already says which kind it is. A positive
        // bow offsets towards +y on a left-to-right chord, so "above" is the negative one.
        const above = e.category === 'family'
        // In rows, a bow is capped at less than half the drop: past that it wanders into the
        // discs of the row below and stops reading as this row's tie.
        const rise = Math.max(30, Math.min(gens ? ARC_ROW * 0.45 : ARC_RISE_MAX, (r.x - l.x) * 0.42))
        linkGroup.add(new Konva.Line({
            points: G.bowPoints(l, r, 0, above ? -rise : rise),
            stroke: G.categoryColor(e.category),
            strokeWidth: G.edgeWidth(e.strength),
            dash: G.edgeDash(e.modifier),
            tension: 0.5,
            // Selecting somebody leaves their own ties lit and everyone else's a whisper: the
            // only way to follow one person's threads across a cast this wide.
            opacity: !lit || e.aId === lit || e.bId === lit ? 0.85 : 0.1,
            listening: false,
        }))
    }

    // How many are already on each row, so the names can alternate along it. Counted per row and
    // not by position in the list, because once the rows are on, the person to your left is not
    // the one before you in birth order.
    const alongRow = new Map<number, number>()
    for (const p of layout.placed) {
        const c = charById.value.get(p.id)
        if (!c) continue
        const i = alongRow.get(p.y) ?? 0
        alongRow.set(p.y, i + 1)
        const group = buildNode(c, false)
        group.position({ x: p.x, y: p.y })
        // Name and year above the disc; below the line belongs to the ties. A full name is wider
        // than the closest two people are ever placed, so the names alternate between two rows:
        // the nearest name on your own row is two people away, which is two gaps of room.
        group.findOne<Konva.Text>('.label')?.setAttrs({
            y: -(NODE_R + (i % 2 ? 44 : 28)), width: ARC_GAP * 2, offsetX: ARC_GAP,
            wrap: 'none', ellipsis: true,
        })
        group.add(new Konva.Text({
            text: c.BirthYear === null ? '—' : String(c.BirthYear),
            fontSize: 10, fill: '#64748b',
            width: ARC_GAP, offsetX: ARC_GAP / 2, y: -(NODE_R + 14),
            align: 'center', listening: false,
        }))
        if (p.id === lit) group.findOne<Konva.Circle>('Circle')?.strokeWidth(5)
        shapes.set(c.Id, group)
        nodeGroup.add(group)
    }

    // What got drawn, not what the constants allow: the bows are nearly all on one side on a
    // real cast, and reserving symmetric room for them centres the axis in a half-empty stage.
    const r = layer?.getClientRect({ skipTransform: true })
    if (r) {
        fitOrHold(r.x, r.y, r.x + r.width, r.y + r.height,
            (lit ? at.get(lit) : undefined) ?? layout.placed[0], 1)
    }
    layer?.batchDraw()
}

// ── Sociogram ─────────────────────────────────────────────────────────────────

/** How faint a tie that stays inside one box gets. Present, but not what you are looking at. */
const SOCIO_INSIDE = 0.12
/** What a tie that leaves its box is worth at the top of the slider — near solid, never quite. */
const SOCIO_CROSS = 0.85
/** What everyone else's ties keep once somebody is selected — a backdrop, still the right shape. */
const SOCIO_BACKDROP = 0.35

function buildSociogram() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()
    simNodes = []

    const { groups, loose } = factions.value
    const layout = L.sociogramLayout(groups, loose)
    const at = new Map(layout.placed.map(p => [p.id, p]))
    // Which box somebody is in, so a tie can be asked whether it leaves one.
    const home = new Map<string, string>()
    for (const g of groups) for (const id of g.ids) home.set(id, g.name)

    for (const b of layout.boxes) {
        linkGroup.add(new Konva.Rect({
            x: b.x, y: b.y, width: b.w, height: b.h, cornerRadius: 10,
            fill: '#0b1220', stroke: '#334155', strokeWidth: 1.5, listening: false,
        }))
        linkGroup.add(new Konva.Text({
            text: b.name, x: b.x + 10, y: b.y + 8, width: b.w - 20, align: 'center',
            fontSize: 14, fontStyle: 'bold', fill: '#94a3b8',
            wrap: 'none', ellipsis: true, listening: false,
        }))
    }

    const lit = selectedId.value
    for (const e of visibleEdges.value) {
        const pa = at.get(e.aId)
        const pb = at.get(e.bId)
        if (!pa || !pb) continue
        // Sharing a box is the expected thing and the grey mass; a tie that leaves one is the
        // whole point of the view. Nobody shares a box with the unaffiliated, so all of theirs
        // count as crossings — which is right: they owe the ring nothing.
        const inside = home.has(e.aId) && home.get(e.aId) === home.get(e.bId)
        linkGroup.add(new Konva.Line({
            // Straight, not bowed: a crossing tie is read by where it lands, and a ring of boxes
            // already leaves it an empty middle to be seen in.
            points: G.bowPoints(pa, pb, NODE_R, 0),
            stroke: G.categoryColor(e.category),
            strokeWidth: G.edgeWidth(e.strength),
            dash: G.edgeDash(e.modifier),
            // Selecting somebody dims the rest rather than flattening them: the window always
            // opens with somebody selected, so an override would mean the crossing contrast this
            // whole view is for is never what you see first.
            // The selected person's own ties stay lit whatever the slider says: turning the
            // crossings down is about the background, and losing the threads you actually asked
            // about would make the control useless at the bottom of its range.
            opacity: e.aId === lit || e.bId === lit
                ? 0.9
                : (inside ? SOCIO_INSIDE : SOCIO_CROSS * (crossFade.value / 100))
                    * (lit ? SOCIO_BACKDROP : 1),
            listening: false,
        }))
    }

    for (const p of layout.placed) {
        const c = charById.value.get(p.id)
        if (!c) continue
        const group = buildNode(c, false)
        group.position({ x: p.x, y: p.y })
        if (p.id === lit) group.findOne<Konva.Circle>('Circle')?.strokeWidth(5)
        shapes.set(c.Id, group)
        nodeGroup.add(group)
    }

    // Fit, with no floor under it: the genogram and the arc hold a minimum and pan because they
    // are read a branch at a time, but a ring is read whole — which box is fat, which is off on
    // its own, which pair of them the lines run between. Held at a floor it just gets clipped,
    // and a clipped ring is not a ring.
    // ponytail: two dozen factions would fit to something you need to zoom into anyway. A
    // minimum with panning, like the genogram's, if anyone ever has that many.
    const r = layer?.getClientRect({ skipTransform: true })
    if (r) fitStage(r.x, r.y, r.x + r.width, r.y + r.height)
    layer?.batchDraw()
}

// ── Chord ─────────────────────────────────────────────────────────────────────

/** What a ribbon nobody clicked keeps once something else is picked out. */
const CHORD_BACKDROP = 0.14
const CHORD_LIT = 0.85
/** A ribbon at rest. They overlap heavily near the middle, so they are see-through by default. */
const CHORD_REST = 0.62
/**
 * A group's own loop, at rest. The same call the sociogram makes and for the same reason: on a
 * real cast most ties are internal, and drawn at full strength one big group's loop is a solid
 * wedge over half the circle with every crossing lost under it. Faint, it is still plainly there
 * — you can see at a glance which arc keeps to itself — and the crossings read over the top.
 */
const CHORD_SELF = 0.2
/** Screen pixels kept clear round the ring for the names, which do not shrink with the circle. */
const CHORD_LABEL_ROOM = 150
/** How big a name is on screen, whatever the circle got scaled to. */
const CHORD_LABEL_PX = 13

const deg = (rad: number) => (rad * 180) / Math.PI

function buildChord() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()
    simNodes = []

    const m = chordMatrix.value
    const layout = L.chordLayout(m.names, m.counts)
    const R = layout.radius
    const pick = chordPick.value
    const on = (i: number, j: number) => !pick || inPick(i, j, pick)

    // Fit first, then draw: the names are laid out in whatever world units come to a fixed size
    // on screen, so they stay readable on a big cast instead of shrinking with the circle. The
    // ring is centred on the origin, so putting the origin at the middle of the stage centres it.
    const outer = R + L.CHORD_BAND
    const room = Math.min(stage.width(), stage.height()) - CHORD_LABEL_ROOM * 2
    const scale = Math.max(0.05, Math.min(1, room / (outer * 2)))
    stage.scale({ x: scale, y: scale })
    stage.position({ x: stage.width() / 2, y: stage.height() / 2 })
    const labelPx = CHORD_LABEL_PX / scale

    // Everything goes in `nodeGroup`: `linkGroup` is deaf to clicks, which is right for the views
    // with hundreds of edges nobody can click, and wrong for the one where the ribbon is the
    // thing you click. Own loops first, so the crossings sit over them rather than under — on a
    // real cast the loops are the bigger shapes, and which ties leave a group is the question.
    const ribbons = [...layout.ribbons].sort((x, y) => Number(x.a !== x.b) - Number(y.a !== y.b))
    for (const r of ribbons) {
        // Whichever end is the smaller group takes the colour, so a big faction does not paint
        // every ribbon on the circle its own shade and hide who it is dealing with.
        const lead = (layout.arcs[r.a]?.weight ?? 0) <= (layout.arcs[r.b]?.weight ?? 0) ? r.a : r.b
        nodeGroup.add(new Konva.Shape({
            fill: G.categoryColor(m.names[lead] ?? ''),
            opacity: pick
                ? (on(r.a, r.b) ? CHORD_LIT : CHORD_BACKDROP)
                : (r.a === r.b ? CHORD_SELF : CHORD_REST),
            sceneFunc: (ctx, shape) => {
                ctx.beginPath()
                ctx.arc(0, 0, R, r.a0, r.a1, false)
                // Through the middle rather than straight across: a fat ribbon drawn as a
                // quadrilateral would cover the circle, and the pinch is what lets them cross.
                ctx.quadraticCurveTo(0, 0, Math.cos(r.b0) * R, Math.sin(r.b0) * R)
                ctx.arc(0, 0, R, r.b0, r.b1, false)
                ctx.quadraticCurveTo(0, 0, Math.cos(r.a0) * R, Math.sin(r.a0) * R)
                ctx.closePath()
                ctx.fillStrokeShape(shape)
            },
        // Clicking the same ribbon again lets it go, so there is a way back to the whole
        // picture without having to find empty canvas.
        }).on('click', () => {
            chordPick.value = pick && pick.a === r.a && pick.b === r.b ? null : { a: r.a, b: r.b }
        }))
    }

    for (const arc of layout.arcs) {
        const lit = !pick || pick.a === arc.index || pick.b === arc.index
        const color = G.categoryColor(arc.name)
        if (arc.end > arc.start) {
            nodeGroup.add(new Konva.Arc({
                innerRadius: R, outerRadius: R + L.CHORD_BAND,
                angle: deg(arc.end - arc.start), rotation: deg(arc.start),
                fill: color, opacity: lit ? 1 : 0.35,
            }).on('click', () => {
                chordPick.value = pick && pick.b === null && pick.a === arc.index
                    ? null
                    : { a: arc.index, b: null }
            }))
        }

        // Names read outward, flipping on the left half so none of them are upside down. Sized
        // and placed off the real text rather than a fixed box, or every name on the left half
        // hangs off the end of a 260-wide one.
        const mid = (arc.start + arc.end) / 2
        const flip = Math.cos(mid) < 0
        const lr = outer + 8 / scale
        const label = new Konva.Text({
            text: arc.name,
            x: Math.cos(mid) * lr, y: Math.sin(mid) * lr,
            rotation: deg(mid) + (flip ? 180 : 0),
            fontSize: labelPx, fill: lit ? '#cbd5e1' : '#475569',
            wrap: 'none', listening: false,
        })
        label.offsetX(flip ? label.width() : 0)
        label.offsetY(label.height() / 2)
        nodeGroup.add(label)
    }

    layer?.batchDraw()
}

// ── Chain ───────────────────────────────────────────────────────────────

/** How small a satellite draws beside a chain member: a face, but plainly a footnote to one. */
const HALO_SCALE = 0.46

/** What the chain drew, so a drag can put the lines and the words back where the people now are. */
let chainLines: { line: Konva.Line; a: string; b: string }[] = []
let chainWords: { text: Konva.Text; a: string; b: string }[] = []
/** Everything hanging off a chain member: the satellites and the "+n", and how far off it they sit. */
let chainRing: { node: Konva.Group; of: string; id: string; dx: number; dy: number }[] = []

/**
 * Follow the discs. The chain is placed once and moved after that only by hand: a route of six
 * people with a ring each will overlap somewhere, and letting you shove one out of the way is
 * cheaper than a placer clever enough never to need it.
 *
 * Drag someone on the route and their whole ring travels with them, because it is theirs. Drag a
 * satellite and it stays where you put it, offset and all, so the next time its owner moves it
 * comes from there rather than from where the fan first dropped it.
 */
function dragChain(evt?: Konva.KonvaEventObject<DragEvent>) {
    const target = evt?.target
    const movedId = target instanceof Konva.Group ? String(target.id() ?? '') : ''
    for (const r of chainRing) {
        const owner = shapes.get(r.of)?.position()
        if (!owner) continue
        if (r.id && r.id === movedId) {
            const p = r.node.position()
            r.dx = p.x - owner.x
            r.dy = p.y - owner.y
        } else if (r.of === movedId) {
            r.node.position({ x: owner.x + r.dx, y: owner.y + r.dy })
        }
    }
    const at = (id: string) => shapes.get(id)?.position()
    for (const { line, a, b } of chainLines) {
        const p = at(a)
        const q = at(b)
        if (p && q) line.points([p.x, p.y, q.x, q.y])
    }
    for (const { text, a, b } of chainWords) {
        const p = at(a)
        const q = at(b)
        if (p && q) text.position({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - 20 })
    }
    layer?.batchDraw()
}

function buildChain() {
    if (!stage || !linkGroup || !nodeGroup) return
    cancelAnimationFrame(raf)
    raf = 0
    linkGroup.destroyChildren()
    nodeGroup.destroyChildren()
    shapes.clear()
    simNodes = []
    chainLines = []
    chainWords = []
    chainRing = []

    const found = pathFound.value
    if (!found) {
        nodeGroup.add(new Konva.Text({
            text: pathText.value
                || 'Pick two people under "How are they related?", or right-click anyone on any'
                    + ' other view and set them as Relation A or B.',
            fontSize: 15, fill: '#64748b', lineHeight: 1.5,
            width: 460, offsetX: 230, align: 'center', listening: false,
        }))
        fitStage(-240, -50, 240, 50)
        layer?.batchDraw()
        return
    }

    // Wrapped, the row length is worked out from the window the chain has to fit in, so the
    // shape follows a resize or a narrowed sidebar rather than a number picked once.
    const steps = L.chainLayout(found.nodes, visibleEdges.value,
        chainWrap.value ? L.chainColumns(found.nodes.length, stage.width(), stage.height()) : 0)
    const at = new Map<string, { x: number; y: number }>()
    for (const step of steps) {
        at.set(step.id, step)
        for (const h of step.halo) at.set(h.id, h)
    }

    // One thin spoke from each satellite to whoever on the route knows them, and nothing else. A
    // satellite is here to say the person has other ties — drawing the web between them turns the
    // one line this view is about into the middle of a thicket. The full mesh is the knots' job.
    const spokes = new Map<string, G.GraphEdge>()
    for (const e of visibleEdges.value) {
        spokes.set(`${e.aId}|${e.bId}`, e)
        spokes.set(`${e.bId}|${e.aId}`, e)
    }
    for (const step of steps) {
        if (!haloOn.value) break
        for (const h of step.halo) {
            const e = spokes.get(`${step.id}|${h.id}`)
            const line = new Konva.Line({
                points: [step.x, step.y, h.x, h.y],
                stroke: e ? G.categoryColor(e.category) : '#475569',
                strokeWidth: 1.4,
                dash: e ? G.edgeDash(e.modifier) : undefined,
                opacity: 0.45,
                listening: false,
            })
            chainLines.push({ line, a: step.id, b: h.id })
            linkGroup.add(line)
        }
    }

    // The route itself over the top, thick and labelled: it is the whole question the view answers,
    // and the nth edge of a path found breadth-first joins its nth and (n+1)th people.
    for (const [i, e] of found.edges.entries()) {
        const a = steps[i]
        const b = steps[i + 1]
        if (!a || !b) continue
        const line = new Konva.Line({
            points: [a.x, a.y, b.x, b.y],
            stroke: G.categoryColor(e.category),
            strokeWidth: 4.5,
            dash: G.edgeDash(e.modifier),
            listening: false,
        })
        chainLines.push({ line, a: a.id, b: b.id })
        linkGroup.add(line)
        const rel = relById.value.get(e.id)
        const said = rel
            ? relationLabel(rel, a.id, typeById.value.get(rel.RelationshipType),
                charById.value.get(a.id)?.Gender ?? null)
            : e.kind
        const text = new Konva.Text({
            // Read left to right, so it is whose end it is said from that matters, not which of
            // the two the relation happens to have been written down against.
            text: said,
            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20,
            fontSize: 12, fill: '#94a3b8',
            width: L.CHAIN_GAP, offsetX: L.CHAIN_GAP / 2,
            align: 'center', wrap: 'none', ellipsis: true, listening: false,
        })
        chainWords.push({ text, a: a.id, b: b.id })
    }

    for (const step of steps) {
        if (!haloOn.value) break
        for (const h of step.halo) {
            const c = charById.value.get(h.id)
            if (!c) continue
            // The same disc as everywhere else, shrunk: a satellite is a character, so it wants
            // the portrait, the click, the double-click and the right-click menu that go with one.
            const small = buildNode(c, true)
            small.position(h)
            small.scale({ x: HALO_SCALE, y: HALO_SCALE })
            // No name under it: five of these round one person and the names run into each other
            // whatever the radius. The initials are on the disc, and a click says who in full.
            small.findOne<Konva.Text>('.label')?.destroy()
            small.findOne<Konva.Circle>('.sel')?.strokeWidth(3 / HALO_SCALE)
            small.on('dragmove', dragChain)
            chainRing.push({ node: small, of: step.id, id: c.Id, dx: h.x - step.x, dy: h.y - step.y })
            shapes.set(c.Id, small)
            nodeGroup.add(small)
        }
        if (step.extraAt) {
            const more = new Konva.Group({ ...step.extraAt, listening: false })
            more.add(new Konva.Circle({
                radius: NODE_R * HALO_SCALE,
                fill: '#0f172a', stroke: '#475569', strokeWidth: 1.5, dash: [3, 3],
            }))
            more.add(new Konva.Text({
                text: `+${step.extra}`,
                fontSize: 11, fill: '#94a3b8',
                width: NODE_R * 2, offsetX: NODE_R, offsetY: 5, align: 'center',
            }))
            chainRing.push({
                node: more, of: step.id, id: '',
                dx: step.extraAt.x - step.x, dy: step.extraAt.y - step.y,
            })
            nodeGroup.add(more)
        }
    }

    for (const step of steps) {
        const c = charById.value.get(step.id)
        if (!c) continue
        const group = buildNode(c, true)
        group.position(step)
        group.findOne<Konva.Text>('.label')?.setAttrs({ y: NODE_R + 12, fontStyle: 'bold' })
        group.on('dragmove', dragChain)
        shapes.set(c.Id, group)
        nodeGroup.add(group)
    }

    // Last of all, and in the node group rather than the link group: what a step of the route is
    // called is the sentence this view exists to draw, and it was being written under the very
    // discs it names.
    for (const { text } of chainWords) nodeGroup.add(text)

    const r = layer?.getClientRect({ skipTransform: true })
    if (r) {
        // Wrapped, *fit* is the whole instruction — it is the button you pressed, and holding a
        // readable floor and panning instead is the thing you pressed it to stop doing.
        if (chainWrap.value) fitStage(r.x, r.y, r.x + r.width, r.y + r.height)
        else {
            fitOrHold(r.x, r.y, r.x + r.width, r.y + r.height,
                (selectedId.value ? at.get(selectedId.value) : undefined) ?? steps[0])
        }
    }
    layer?.batchDraw()
}

// ── Wiring ────────────────────────────────────────────────────────────────────

function rebuild() {
    if (!stage) return
    // The views that draw their own shapes never reach `paintHulls`, so the blobs have to be put
    // away here or a switch to the chord leaves last knot's backdrop sitting under it.
    hullGroup?.visible(mode.value === 'clusters')
    hullSig = ''
    if (isForce.value) buildGraph()
    else if (mode.value === 'tree') buildTree()
    else if (mode.value === 'matrix') buildMatrix()
    else if (mode.value === 'arc') buildArc()
    else if (mode.value === 'sociogram') buildSociogram()
    else if (mode.value === 'chord') buildChord()
    else buildChain()
    // Not in the knots: the sim goes on moving everyone for a second or two after a build, so a
    // hold there would aim at where somebody was rather than where they are about to be.
    if (!isForce.value) holdSelection()
}

watch(mode, () => {
    // What was picked out on the circle means nothing in any other view, and the groups may not
    // even be the same ones when you come back to it.
    chordPick.value = null
    rebuild()
})
// Declared before the rebuild below so it runs first in the same flush: switching what goes
// round the circle drops the pick, and the two changes then redraw once between them.
watch(chordBy, () => { chordPick.value = null })
watch([chordBy, chordPick], () => { if (mode.value === 'chord') buildChord() })
watch(treeRootId, () => { if (mode.value === 'tree') buildTree() })
watch(haloOn, () => { if (mode.value === 'chain') buildChain() })
watch(chainWrap, () => { if (mode.value === 'chain') buildChain() })
watch(arcRows, () => { if (mode.value === 'arc') buildArc() })
watch(showPath, () => {
    if (mode.value === 'matrix') buildMatrix()
    else if (mode.value === 'tree') buildTree()
})
watch(selectedId, () => {
    // A right-click rings them and stops there. Everything below moves the picture one way or
    // another, and only a left click is allowed to do that.
    if (menuPick) {
        markSelection()
        layer?.batchDraw()
        return
    }
    // The matrix bands their row, and the arc and the sociogram light their threads alone: those
    // three lay out again. The knots only change what is lit.
    if (mode.value === 'matrix' || mode.value === 'arc' || mode.value === 'sociogram') rebuild()
    else if (isForce.value) paintGraph()
    markSelection()
    if (!isForce.value) holdSelection()
    layer?.batchDraw()
})

watch(arcSpread, () => {
    if (mode.value === 'arc') buildArc()
    arcSpreadPref.saveSoon(arcSpread.value)
})
watch(crossFade, () => {
    if (mode.value === 'sociogram') buildSociogram()
    crossFadePref.saveSoon(crossFade.value)
})
watch(knotRoom, () => {
    knotRoomPref.saveSoon(knotRoom.value)
    if (mode.value !== 'clusters') return
    // Reheat rather than rebuild: the knots have not changed, only how much room they want and
    // how much slack the ties between them get — `stepForces` reads both off `clusterRoom` — and
    // rebuilding would throw away a layout the writer may have spent a while dragging into shape.
    // The picture changes size, so it has to be re-fitted once it settles again.
    fitOnSettle = true
    kick()
})
watch([asOfYear, hiddenCategories, treeShown, pathNodes], () => {
    if (mode.value === 'matrix') buildMatrix()
    // The genogram draws the overlaid ties and the death crosses itself, so a year or a hidden
    // category changes the picture rather than only what is lit. The arc's bows likewise.
    else if (mode.value === 'tree') buildTree()
    else if (mode.value === 'arc') buildArc()
    else if (mode.value === 'sociogram') buildSociogram()
    // Hiding a kind or scrubbing the year changes what the ribbons are counting, and on a big
    // enough change a group can lose every tie it had, so the pick goes with it.
    else if (mode.value === 'chord') { chordPick.value = null; buildChord() }
    // `pathNodes` is in the list above, so picking either end redraws the chain from here.
    else if (mode.value === 'chain') buildChain()
    // A nudge, not a kick: dragging the year scrubber would otherwise reheat the sim every frame
    // and the layout would never stand still long enough to read.
    else if (isForce.value) { paintGraph(); kick(0.4) }
}, { deep: true })

function toggleCategory(category: string) {
    // The genogram lists what to show and every other view lists what to hide, so the same
    // checkbox moves the same name into or out of whichever list is behind it.
    const list = mode.value === 'tree' ? treeShown : hiddenCategories
    const at = list.value.indexOf(category)
    if (at === -1) list.value.push(category)
    else list.value.splice(at, 1)
}

/** Search or sidebar click: select them and bring them to the middle of the stage. */
function focusCharacter(id: string) {
    selectedId.value = id
    search.value = ''
    if (mode.value === 'tree') {
        treeRootId.value = id
        return
    }
    // The grid has no middle to bring anyone to; selecting them lights their row and column.
    if (mode.value === 'matrix') return
    // The sim only exists in the knots. Everywhere else the shape that got drawn knows where it
    // went, which is the same answer — and the only one the laid-out views have.
    const spot = simNodes.find(n => n.id === id) ?? shapes.get(id)?.position()
    if (!stage || !spot) return
    const scale = stage.scaleX()
    stage.position({ x: stage.width() / 2 - spot.x * scale, y: stage.height() / 2 - spot.y * scale })
    stage.batchDraw()
}

function resetView() {
    if (!stage) return
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })
    stage.batchDraw()
}

/**
 * Zoom and pan until everything drawn is on screen — which is not what *Reset view* does, and is
 * usually what you wanted. Asks the layer what it actually drew rather than the layout what it
 * meant to, so it is right in every view without knowing which one is up.
 */
function fitToWindow() {
    menu.value = null
    const r = layer?.getClientRect({ skipTransform: true })
    if (!r || !r.width || !r.height) return
    fitStage(r.x - 20, r.y - 20, r.x + r.width + 20, r.y + r.height + 20)
}

/** Right-click → Relation A/B: fill one end of the finder without hunting through the dropdown. */
function relationSlot(slot: 'a' | 'b', id: string) {
    menu.value = null
    if (slot === 'a') pathFrom.value = id
    else pathTo.value = id
}

function say(what: string) {
    notice.value = what
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => { notice.value = '' }, 2500)
}

/** A margin round the exported picture, in stage units, so nothing stands against the edge. */
const SHOT_PAD = 44
/** How far apart the paper is ruled, in stage units — about a disc and a half. */
const SHOT_GRID = 64
const SHOT_INK = 'rgba(148, 163, 184, 0.22)'
// Past either of these a browser hands back a blank canvas rather than throwing, so the export
// comes down to fit and says so instead of writing out an empty PNG.
const SHOT_MAX_SIDE = 16384
const SHOT_MAX_AREA = 2.4e8

const SHOT_BACKS = [
    { id: 'plain', label: 'Plain' },
    { id: 'lines', label: 'Ruled paper' },
    { id: 'dots', label: 'Dotted paper' },
    { id: 'none', label: 'Transparent' },
] as const

/** How the picture comes out. Session-only, like the rest of this window's knobs, and shared by
 *  Copy and Save — the two are the same picture going to two places. */
const shotBack = ref<(typeof SHOT_BACKS)[number]['id']>('plain')
const shotScale = ref(2)
const shotOpen = ref(false)
const shotDims = ref('')

/**
 * The crop, in the stage's own coordinates, and the pixel ratio it can actually bear. Asks the
 * layer what it drew rather than the layout what it meant to, so it is right in every view.
 */
function shotBox(want: number) {
    const r = layer?.getClientRect({ skipTransform: true })
    if (!r || !r.width || !r.height) return null
    const box = {
        x: r.x - SHOT_PAD, y: r.y - SHOT_PAD,
        width: r.width + SHOT_PAD * 2, height: r.height + SHOT_PAD * 2,
    }
    const ratio = Math.max(0.05, Math.min(want,
        SHOT_MAX_SIDE / box.width, SHOT_MAX_SIDE / box.height,
        Math.sqrt(SHOT_MAX_AREA / (box.width * box.height))))
    return { box, ratio, capped: ratio < want - 0.005 }
}

/** What the next picture will measure, for the panel. Recomputed rather than watched: the layer
 *  changes size without telling anyone, so it is read when the panel is opened. */
function refreshShotDims() {
    const fit = shotBox(shotScale.value)
    if (!fit) {
        shotDims.value = 'Nothing drawn yet.'
        return
    }
    const size = `${Math.round(fit.box.width * fit.ratio)} × ${Math.round(fit.box.height * fit.ratio)}`
    shotDims.value = fit.capped
        ? `${size} pixels — as large as a picture this size can be encoded.`
        : `${size} pixels.`
}

watch([shotScale, shotOpen], refreshShotDims)

/**
 * The sheet the picture is drawn on. Konva draws on transparency and the window's dark comes from
 * CSS behind it, so without this an export is an invisible tangle of pale threads on whatever the
 * reader's page happens to be — which is still the right answer when transparency is what was
 * asked for.
 */
function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, ratio: number) {
    if (shotBack.value === 'none') return
    ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--app-bg').trim() || '#0f172a'
    ctx.fillRect(0, 0, w, h)
    if (shotBack.value === 'plain') return
    // Ruled in export pixels, so the paper looks the same at 1× and at 4× instead of the grid
    // getting four times finer the larger you ask for.
    const step = SHOT_GRID * ratio
    const pen = Math.max(1, ratio * 0.6)
    if (shotBack.value === 'lines') {
        ctx.strokeStyle = SHOT_INK
        ctx.lineWidth = pen
        ctx.beginPath()
        for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
        for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
        ctx.stroke()
        return
    }
    // A dot covers a fraction of what a line does, so the same ink comes out half as dark.
    ctx.fillStyle = 'rgba(148, 163, 184, 0.34)'
    for (let x = step; x < w; x += step) {
        for (let y = step; y < h; y += step) {
            ctx.beginPath()
            ctx.arc(x, y, pen * 1.4, 0, Math.PI * 2)
            ctx.fill()
        }
    }
}

/**
 * Everything drawn, as a PNG — not the window's worth of it you happen to be looking at. A chain
 * or a genogram runs several screens wide on a real cast, and a picture of the middle of one is
 * not a picture of it.
 */
async function stageBlob(): Promise<Blob> {
    if (!stage) throw new Error('the stage is not up yet')
    const fit = shotBox(shotScale.value)
    if (!fit) throw new Error('there is nothing drawn to make a picture of')
    // The crop is in the stage's own coordinates, which the zoom and the pan are part of, so they
    // come off first — and go back in the `finally`, because taking a picture of a view must not
    // move it.
    const scale = stage.scale()
    const pos = stage.position()
    let shot: HTMLCanvasElement
    try {
        stage.scale({ x: 1, y: 1 })
        stage.position({ x: 0, y: 0 })
        shot = stage.toCanvas({ ...fit.box, pixelRatio: fit.ratio })
    } finally {
        stage.scale(scale)
        stage.position(pos)
        stage.batchDraw()
    }
    const out = document.createElement('canvas')
    out.width = shot.width
    out.height = shot.height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('this browser would not give the page a 2D canvas')
    paintBackdrop(ctx, out.width, out.height, fit.ratio)
    ctx.drawImage(shot, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
        out.toBlob(b => (b ? resolve(b) : reject(new Error('the picture would not encode as a PNG'))), 'image/png')
    })
}

async function copyImage() {
    menu.value = null
    shotOpen.value = false
    try {
        // `ClipboardItem` is missing outside a secure context, which a `file://` build is. Worth
        // saying plainly rather than letting `write` throw something about undefined.
        if (typeof ClipboardItem === 'undefined') {
            throw new Error('this window has no clipboard access — use Save instead')
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await stageBlob() })])
        say('Picture copied.')
    } catch (ex) {
        error.value = `Could not copy the picture: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('[RelationsApp] copyImage failed', ex)
    }
}

async function saveImage() {
    menu.value = null
    shotOpen.value = false
    let url = ''
    try {
        url = URL.createObjectURL(await stageBlob())
        const a = document.createElement('a')
        a.href = url
        a.download = `relations-${mode.value}.png`
        a.click()
        say('Picture saved.')
    } catch (ex) {
        error.value = `Could not save the picture: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('[RelationsApp] saveImage failed', ex)
    } finally {
        // The click is synchronous, so the download has the URL by now; holding it would leak the
        // whole bitmap for as long as the window is open.
        if (url) URL.revokeObjectURL(url)
    }
}

/**
 * The native menu is a list of things to do to a *web page* — reload it, view its source, save
 * the canvas. None of that is true of this window, so it goes, except over the text fields where
 * it is the only cut and paste a WebView offers.
 */
function noNativeMenu(evt: MouseEvent) {
    if ((evt.target as HTMLElement | null)?.closest('input, textarea, select')) return
    evt.preventDefault()
}

function openTheirTimeline(id: string) {
    menu.value = null
    BackendAPI.OpenCharacterTimeline(timelineId.value, id)
}

function openInCharacters(id: string) {
    menu.value = null
    BackendAPI.OpenCharactersWindow(timelineId.value, id).catch(ex => {
        error.value = `Could not open the characters window: ${ex}`
        console.error('OpenCharactersWindow failed', ex)
    })
}

function treeFrom(id: string) {
    menu.value = null
    treeRootId.value = id
    mode.value = 'tree'
}

function unpinOne(id: string) {
    menu.value = null
    delete pinned[id]
    const node = simNodes.find(n => n.id === id)
    if (node) node.pinned = false
    savePinnedSoon()
    kick()
}
</script>

<template>
    <div class="rel-root" @contextmenu="noNativeMenu">
        <WindowTitleBar title="Relations" :subtitle="`${characters.length}`" :show-maximize="true" />

        <div v-if="loading" class="rel-loading">Loading…</div>

        <div v-else class="rel-body">
            <aside class="rel-side" :style="{ flexBasis: `${sideWidth}px` }">
                <!-- ── Mode ──────────────────────────────────────────── -->
                <div class="rel-modes">
                    <button :class="{ 'is-on': mode === 'clusters' }" @click="mode = 'clusters'">
                        <PhCirclesThree :size="15" /> Knots
                    </button>
                    <button :class="{ 'is-on': mode === 'matrix' }" @click="mode = 'matrix'">
                        <PhGridFour :size="15" /> Matrix
                    </button>
                    <button :class="{ 'is-on': mode === 'tree' }" @click="mode = 'tree'">
                        <PhTreeStructure :size="15" /> Genogram
                    </button>
                    <button :class="{ 'is-on': mode === 'arc' }" @click="mode = 'arc'">
                        <PhRainbow :size="15" /> Arc
                    </button>
                    <button :class="{ 'is-on': mode === 'sociogram' }" @click="mode = 'sociogram'">
                        <PhUsersThree :size="15" /> Sociogram
                    </button>
                    <button :class="{ 'is-on': mode === 'chord' }" @click="mode = 'chord'">
                        <PhChartDonut :size="15" /> Chord
                    </button>
                    <button :class="{ 'is-on': mode === 'chain' }" @click="mode = 'chain'">
                        <PhPath :size="15" /> Chain
                    </button>
                </div>
                <p class="rel-hint rel-modehint">{{ modeHint }}</p>

                <!-- ── Search ────────────────────────────────────────── -->
                <label class="rel-search">
                    <PhMagnifyingGlass :size="14" />
                    <input v-model="search" type="text" placeholder="Find someone…" />
                </label>
                <ul v-if="matches.length" class="rel-hits">
                    <li v-for="c in matches" :key="c.Id" @click="focusCharacter(c.Id)">
                        <span class="rel-dot" :style="{ background: c.Color || '#6366f1' }" />
                        {{ c.Name }} <em>{{ lifespan(c) }}</em>
                    </li>
                </ul>

                <!-- ── Nobody has a faction ──────────────────────────── -->
                <p v-if="mode === 'sociogram' && !factions.groups.length" class="rel-hint">
                    Nobody has a faction yet, so there is one ring and no boxes. Set
                    <b>Faction</b> on a character and they get a box to stand in.
                </p>

                <!-- ── What goes round the circle ────────────────────── -->
                <section v-if="mode === 'chord'" class="rel-block">
                    <h3><PhChartDonut :size="14" /> Round the circle</h3>
                    <div class="rel-modes">
                        <button :class="{ 'is-on': chordBy === 'faction' }" @click="chordBy = 'faction'">
                            Factions
                        </button>
                        <button :class="{ 'is-on': chordBy === 'kind' }" @click="chordBy = 'kind'">
                            Kinds
                        </button>
                    </div>
                    <p class="rel-hint">
                        {{ chordBy === 'faction'
                            ? 'One arc per faction, as wide as it has ties. A ribbon is the'
                                + ' relations running between two of them; a loop back onto an arc'
                                + ' is the ones that stay at home.'
                            : 'One arc per kind of relation. A ribbon is the characters who have'
                                + ' both kinds — who your family is also your enemy — and a loop is'
                                + ' the ones who only ever have that one.' }}
                    </p>
                    <p v-if="chordBy === 'faction' && !factions.groups.length" class="rel-hint">
                        Nobody has a faction yet, so there is one arc and nothing to cross between.
                        Set <b>Faction</b> on a character to give the circle something to draw.
                    </p>
                </section>

                <!-- ── What was clicked on the circle ────────────────── -->
                <section v-if="mode === 'chord' && chordPick" class="rel-block rel-block--grow rel-block--chord">
                    <h3>{{ chordPickLabel }}</h3>
                    <p v-if="!chordRows.length" class="rel-hint">Nothing in it.</p>
                    <ul v-else class="rel-ties">
                        <li v-for="row in chordRows.slice(0, 120)" :key="row.key" @click="focusCharacter(row.id)">
                            <span class="rel-dot" :style="{ background: row.color }" />
                            <span class="rel-tie-text">{{ row.text }}</span>
                            <em>{{ row.sub }}</em>
                        </li>
                    </ul>
                    <p v-if="chordRows.length > 120" class="rel-hint">
                        …and {{ chordRows.length - 120 }} more.
                    </p>
                </section>

                <!-- ── Spread ────────────────────────────────────────── -->
                <section v-if="mode === 'arc'" class="rel-block">
                    <label class="rel-check">
                        <PhArrowsInLineHorizontal :size="14" /> Spread <b>{{ arcSpread }}</b>
                    </label>
                    <input v-model.number="arcSpread" class="rel-range" type="range" min="0" max="100" />
                    <p class="rel-hint">
                        Left: everyone the same distance apart, oldest first. Right: true to the
                        year, so a quiet century is as wide as it really was.
                    </p>
                    <label class="rel-check">
                        <input v-model="arcRows" type="checkbox" />
                        <PhRows :size="14" />
                        Rows by generation
                    </label>
                    <p class="rel-hint">
                        Anyone whose parents are not in the cast on the top row, their children on
                        the next one down, and so on. Birth order still runs left to right.
                    </p>
                </section>

                <!-- ── Knot distance ─────────────────────────────────── -->
                <section v-if="mode === 'clusters'" class="rel-block">
                    <label class="rel-check">
                        <PhArrowsOutLineHorizontal :size="14" /> Knot distance <b>{{ knotRoom }}</b>
                    </label>
                    <input v-model.number="knotRoom" class="rel-range" type="range" min="0" max="100" />
                    <p class="rel-hint">
                        How hard the knots push each other away. The knots themselves stay the
                        size they are: it is the ties <em>between</em> them that give. Right for
                        daylight between them, at the cost of a smaller picture — the view zooms
                        out to keep it all on screen.
                    </p>
                </section>

                <!-- ── Crossing ties ─────────────────────────────────── -->
                <section v-if="mode === 'chain'" class="rel-block">
                    <label class="rel-check">
                        <input v-model="haloOn" type="checkbox" />
                        <PhCirclesThree :size="14" />
                        Side circles
                    </label>
                    <p class="rel-hint">
                        Who else each person on the route is directly related to, by their
                        initials. Turn them off for the route on its own. Drag anyone to tidy
                        the picture up; a ring follows whoever it belongs to.
                    </p>
                    <button class="rel-btn" @click="chainWrap = !chainWrap">
                        <component :is="chainWrap ? PhArrowsOutLineHorizontal : PhFrameCorners" :size="14" />
                        {{ chainWrap ? 'Straighten the chain out' : 'Fit the chain on screen' }}
                    </button>
                    <p class="rel-hint">
                        A long route folds into rows that read back and forth like lines of
                        writing, sized to the window, instead of one line running off both edges
                        of it.
                    </p>
                </section>

                <section v-if="mode === 'sociogram'" class="rel-block">
                    <label class="rel-check">
                        <PhLineSegments :size="14" /> Crossing ties <b>{{ crossFade }}</b>
                    </label>
                    <input v-model.number="crossFade" class="rel-range" type="range" min="0" max="100" />
                    <p class="rel-hint">
                        How strongly the ties that leave a box are drawn. Turn it down when
                        the middle of the ring fills in and you want to see the boxes.
                        Whoever is selected keeps their own threads either way.
                    </p>
                </section>

                <!-- ── Year scrubber ─────────────────────────────────── -->
                <section v-if="range" class="rel-block">
                    <label class="rel-check">
                        <input v-model="yearOn" type="checkbox" />
                        <PhCalendarBlank :size="14" />
                        As of year <b v-if="yearOn">{{ year }}</b>
                    </label>
                    <input
                        v-model.number="year"
                        class="rel-range"
                        type="range"
                        :min="range.min"
                        :max="range.max"
                        :disabled="!yearOn"
                    />
                    <p class="rel-hint">
                        {{ mode === 'tree'
                            ? 'Only the ties that held that year, and a cross on whoever had died by it.'
                            : 'Only the ties that held that year, with the unborn faded out and the dead half-lit.' }}
                    </p>
                </section>

                <!-- ── Legend ────────────────────────────────────────── -->
                <section v-if="categories.length" class="rel-block">
                    <h3>Kinds</h3>
                    <label v-for="cat in categories" :key="cat" class="rel-check">
                        <input
                            type="checkbox"
                            :checked="mode === 'tree' ? treeShown.includes(cat) : !hiddenCategories.includes(cat)"
                            @change="toggleCategory(cat)"
                        />
                        <span class="rel-dot" :style="{ background: G.categoryColor(cat) }" />
                        {{ cat }}
                    </label>
                    <!-- The genogram is drawn from descent and marriage; hiding `family` would
                         leave no chart to hide anything on, so it only takes the overlay away. -->
                    <p v-if="mode === 'tree'" class="rel-hint">
                        Off by default here — tick a kind to lay those ties over the chart.
                        The tree itself is always drawn.
                    </p>
                </section>

                <!-- ── How are they related ──────────────────────────── -->
                <section class="rel-block">
                    <h3><PhPath :size="14" /> How are they related?</h3>
                    <select v-model="pathFrom" class="rel-select">
                        <option value="">Someone…</option>
                        <option v-for="c in sorted" :key="c.Id" :value="c.Id">{{ c.Name }}</option>
                    </select>
                    <select v-model="pathTo" class="rel-select">
                        <option value="">…and someone else</option>
                        <option v-for="c in sorted" :key="c.Id" :value="c.Id">{{ c.Name }}</option>
                    </select>
                    <p v-if="pathText" class="rel-path">{{ pathText }}</p>
                    <label v-if="mode === 'matrix' || mode === 'tree'" class="rel-check">
                        <input v-model="showPath" type="checkbox" />
                        <PhFootprints :size="14" />
                        Show the route on the {{ mode === 'tree' ? 'chart' : 'grid' }}
                    </label>
                    <p v-if="mode === 'matrix'" class="rel-hint">
                        Rings the square where each step of the route meets, numbered in order, and
                        turns the corner on the square of whoever the two steps have in common.
                    </p>
                    <p v-if="mode === 'tree'" class="rel-hint">
                        Numbers everyone along the route and lights the chart's own lines between
                        them. Only when both ends are on the chart in front of you — a genogram is
                        one family around one root, not the whole cast.
                    </p>
                </section>

                <!-- ── The selected character's ties ─────────────────── -->
                <section v-if="selected" class="rel-block rel-block--grow">
                    <h3>{{ selected.Name }}</h3>
                    <p v-if="!selectedTies.length" class="rel-hint">No relations recorded.</p>
                    <ul v-else class="rel-ties">
                        <li v-for="tie in selectedTies" :key="tie.id" @click="focusCharacter(tie.otherId)">
                            <span class="rel-dot" :style="{ background: tie.color }" />
                            <span class="rel-tie-text">{{ tie.label }} <b>{{ tie.other }}</b></span>
                        </li>
                    </ul>
                </section>

                <!-- ── Nobody's business ─────────────────────────────── -->
                <section v-if="loners.length" class="rel-block">
                    <h3>Not related to anyone</h3>
                    <ul class="rel-hits rel-hits--flat">
                        <li v-for="c in loners" :key="c.Id" @click="focusCharacter(c.Id)">
                            <span class="rel-dot" :style="{ background: c.Color || '#6366f1' }" />
                            {{ c.Name }}
                        </li>
                    </ul>
                </section>

                <div class="rel-tools">
                    <button title="Reset the zoom and the pan" @click="resetView">
                        <PhArrowsOut :size="14" /> Reset view
                    </button>
                    <button v-if="isForce" title="Let the layout loose again" @click="unpinAll">
                        <PhPushPinSlash :size="14" /> Unpin all
                    </button>
                </div>
            </aside>
            <div class="side-grip" title="Drag to resize" @pointerdown="startResize" />

            <!-- ── Stage ─────────────────────────────────────────────── -->
            <div class="rel-stage-wrap">
                <div ref="stageHost" class="rel-stage" />
                <div class="rel-shots">
                    <button title="Copy the picture to the clipboard" @click="copyImage">
                        <PhCopy :size="15" />
                    </button>
                    <button title="Save the picture as a PNG" @click="saveImage">
                        <PhDownloadSimple :size="15" />
                    </button>
                    <button
                        :class="{ on: shotOpen }"
                        title="How the picture comes out"
                        @click="shotOpen = !shotOpen"
                    >
                        <PhSlidersHorizontal :size="15" />
                    </button>
                </div>
                <div v-if="shotOpen" class="rel-shot-opts">
                    <p class="rel-shot-head">Behind the picture</p>
                    <label v-for="b in SHOT_BACKS" :key="b.id" class="rel-check">
                        <input v-model="shotBack" type="radio" :value="b.id" />
                        {{ b.label }}
                    </label>
                    <p class="rel-shot-head">Size</p>
                    <div class="rel-shot-row">
                        <button
                            v-for="s in [1, 2, 4]"
                            :key="s"
                            class="rel-btn"
                            :class="{ on: shotScale === s }"
                            @click="shotScale = s"
                        >{{ s }}×</button>
                    </div>
                    <p class="rel-hint">Everything drawn, not just what is on screen. {{ shotDims }}</p>
                </div>
                <p v-if="mode === 'tree' && treeEmpty" class="rel-overlay">
                    No parents or children recorded for this character yet — add a
                    <b>parent</b> or <b>spouse</b> relation and the tree fills in.
                </p>
                <p v-else-if="!characters.length" class="rel-overlay">
                    This timeline has no characters yet.
                </p>
                <p v-if="error" class="rel-error">{{ error }}</p>
                <p v-else-if="notice" class="rel-notice">{{ notice }}</p>
            </div>
        </div>

        <!-- ── Right-click menu ──────────────────────────────────────── -->
        <div v-if="menu" class="rel-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
            <template v-if="menuId">
                <button @click="openTheirTimeline(menuId)">
                    <PhCrosshair :size="14" /> Their timeline
                </button>
                <button @click="openInCharacters(menuId)">
                    <PhMagnifyingGlass :size="14" /> Open in characters
                </button>
                <button @click="treeFrom(menuId)">
                    <PhTreeStructure :size="14" /> Centre the genogram here
                </button>
                <button v-if="isForce" @click="unpinOne(menuId)">
                    <PhPushPinSlash :size="14" /> Unpin
                </button>
                <!-- Always here, in every view: the two ends of the finder are the one thing you
                     want from a character you have just spotted and may not find again. -->
                <hr />
                <button @click="relationSlot('a', menuId)">
                    <PhPath :size="14" /> Relation A
                </button>
                <button @click="relationSlot('b', menuId)">
                    <PhPath :size="14" /> Relation B
                </button>
            </template>
            <template v-else>
                <button @click="fitToWindow"><PhFrameCorners :size="14" /> Fit to window</button>
                <button v-if="isForce" @click="unpinAll">
                    <PhPushPinSlash :size="14" /> Unpin all
                </button>
            </template>
        </div>
        <div v-if="menu" class="rel-menu-backdrop" @click="menu = null" @contextmenu.prevent="menu = null" />
    </div>
</template>

<style scoped lang="scss">
.rel-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font-size: 0.82rem;
    overflow: hidden;
}

.rel-loading {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--app-text-dim, #64748b);
}

.rel-body {
    flex: 1;
    display: flex;
    min-height: 0;
}

.rel-side {
    flex: 0 0 260px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-right: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    overflow-y: auto;
}

.rel-modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;

    button {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 5px;
        padding: 5px 6px;
        border: 1px solid var(--app-border, #2d3a56);
        border-radius: var(--app-radius-sm, 4px);
        background: transparent;
        color: var(--app-text-muted, #94a3b8);
        font: inherit;
        font-size: 0.74rem;
        cursor: pointer;

        &.is-on {
            color: var(--app-text, #e2e8f0);
            border-color: var(--app-accent, #6366f1);
            background: color-mix(in srgb, var(--app-accent, #6366f1) 18%, transparent);
        }
    }
}

.rel-modehint {
    margin: 0;
}

.rel-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    color: var(--app-text-dim, #64748b);

    input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.78rem;
        outline: none;
    }
}

.rel-hits,
.rel-ties {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 5px;
        border-radius: var(--app-radius-sm, 4px);
        cursor: pointer;
        font-size: 0.76rem;

        &:hover { background: var(--app-surface-high, #1e2b44); }

        em {
            margin-left: auto;
            font-style: normal;
            font-size: 0.68rem;
            color: var(--app-text-dim, #64748b);
        }
    }
}

.rel-block--grow {
    // A column flex item shrinks below its own content and then paints over the blocks under it,
    // which is what the tie list was doing to the year slider. These are the only blocks that run
    // to a hundred rows, so they are the only ones that have to say so: keep the height, and
    // scroll the rows rather than the whole sidebar.
    flex-shrink: 0;

    .rel-ties {
        max-height: 38vh;
        overflow-y: auto;
    }
}

.rel-tie-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    b { font-weight: 500; }
}

.rel-block {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 9px;
    border-top: 1px solid var(--app-border, #2d3a56);

    h3 {
        display: flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--app-text-dim, #64748b);
    }

    &--grow { min-height: 0; }
}

.rel-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    text-transform: capitalize;
    cursor: pointer;

    b { color: var(--app-accent-hover, #818cf8); }
}

.rel-range { width: 100%; accent-color: var(--app-accent, #6366f1); }

.rel-select {
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-size: 0.76rem;
    padding: 3px 5px;
    outline: none;

    &:focus { border-color: var(--app-accent, #6366f1); }
}

.rel-path {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: var(--app-text-muted, #94a3b8);
}

.rel-hint {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--app-text-dim, #64748b);
}

.rel-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
}

.rel-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: auto;
    padding-top: 9px;
    border-top: 1px solid var(--app-border, #2d3a56);
}

.rel-tools button,
.rel-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &.on { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
}

.rel-stage-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
}

.rel-stage {
    position: absolute;
    inset: 0;
}

.rel-overlay {
    position: absolute;
    left: 50%;
    top: 22%;
    transform: translateX(-50%);
    max-width: 380px;
    margin: 0;
    text-align: center;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--app-text-dim, #64748b);
    pointer-events: none;

    b { color: var(--app-text-muted, #94a3b8); }
}

.rel-error,
.rel-notice {
    position: absolute;
    left: 14px;
    bottom: 12px;
    margin: 0;
    padding: 6px 10px;
    border-radius: var(--app-radius-sm, 4px);
    background: rgba(15, 23, 42, 0.92);
    font-size: 0.76rem;
    color: #f87171;
}

.rel-notice {
    color: var(--app-text-dim, #94a3b8);
}

// Where the native menu's "Save image as…" used to live, near enough. Top right rather than
// bottom, because the bottom left corner is already the error's and the views fill from there.
.rel-shots {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    gap: 4px;

    button {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--app-border, #1e293b);
        border-radius: var(--app-radius-sm, 4px);
        background: rgba(15, 23, 42, 0.82);
        color: var(--app-text-dim, #94a3b8);
        cursor: pointer;

        &:hover,
        &.on {
            color: var(--app-text, #e2e8f0);
            border-color: var(--app-accent, #6366f1);
        }
    }
}

// Under the buttons it belongs to. Over the stage rather than in the sidebar, because it is about
// the picture that is there and you close it again as soon as you have taken one.
.rel-shot-opts {
    position: absolute;
    top: 44px;
    right: 12px;
    z-index: 5;
    width: 196px;
    padding: 9px 11px 10px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.7);

    .rel-check { margin: 3px 0; }
    .rel-hint { margin-top: 8px; }
}

.rel-shot-head {
    margin: 9px 0 4px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;

    &:first-child { margin-top: 0; }
}

.rel-shot-row {
    display: flex;
    gap: 4px;

    button {
        flex: 1;
        justify-content: center;
    }
}

.rel-menu {
    position: fixed;
    z-index: var(--z-menu, 9999);
    display: flex;
    flex-direction: column;
    min-width: 190px;
    padding: 4px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
    box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.7);

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
        cursor: pointer;

        &:hover { background: var(--app-surface-high, #1e2b44); }
    }

    hr {
        margin: 4px 6px;
        border: none;
        border-top: 1px solid var(--app-border, #2d3a56);
    }
}

.rel-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-menu-backdrop, 9998);
}
</style>

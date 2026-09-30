/** BL-88: the Archive's lists — which rows a chip, a search and a sort leave, in what order. */
import type { Book, CharacterItem, MapEvent, MediaItem, QuoteLine, Story, TimelineItem } from '@/types/models'

/** What the session trash holds. Nothing in it is deleted until the Archive closes. */
export interface TrashEntry {
    kind: 'item' | 'story' | 'book' | 'chapter' | 'picture' | 'place' | 'map' | 'tag' | 'note' | 'character'
    /** A tag's is `tag:<id>`: tag ids are numbers, and a legacy item id can be one too. */
    id: string
    title: string
    /** The date for an item, the book for a chapter. */
    sub?: string
    typeId?: number
}

const quoteLine = (l: unknown): QuoteLine => l && typeof l === 'object'
    ? { text: String((l as QuoteLine).text ?? ''), speaker: String((l as QuoteLine).speaker ?? '') }
    : { text: String(l), speaker: '' }

/**
 * Quotes are stored as a JSON array of quotes, each an array of lines. The first shape, an array of
 * plain strings, reads as quotes nobody said; anything else comes back as the one quote, so a save
 * from the editor writes it back as it was rather than dropping it.
 */
export function storyQuotes(json: string | null | undefined): QuoteLine[][] {
    if (!json) return []
    try {
        const v: unknown = JSON.parse(json)
        if (Array.isArray(v)) return v.map(q => Array.isArray(q) ? q.map(quoteLine) : [quoteLine(q)])
    } catch { /* not JSON: kept whole, below */ }
    return [[quoteLine(json)]]
}

/**
 * Stories are shared by every timeline. The Archive lists the ones this timeline uses — an item cites
 * it, or it has this timeline's characters or places — and the ones no other timeline uses yet.
 */
export function archiveStories(stories: Story[], citedHere: Set<string>): Story[] {
    return stories.filter(s => citedHere.has(s.Id) || !s.OtherTimelineRefs || s.Characters?.length || s.LocationIds?.length)
}

/** The same for books, which also come with any story listed here. */
export function archiveBooks(books: Book[], listedStories: Story[]): Book[] {
    const linked = new Set(listedStories.flatMap(s => s.BookIds ?? []))
    return books.filter(b => linked.has(b.Id) || !b.OtherTimelineRefs || b.Chapters?.some(c => c.ItemIds?.length))
}

export type ArchiveSort = 'date' | 'length' | 'name' | 'importance' | 'added'

const span = (i: TimelineItem) => i.AbsoluteEnd - i.AbsoluteStart

const ORDER: Record<ArchiveSort, (a: TimelineItem, b: TimelineItem) => number> = {
    date: (a, b) => a.AbsoluteStart - b.AbsoluteStart,
    length: (a, b) => span(b) - span(a),
    name: (a, b) => (a.Title ?? '').localeCompare(b.Title ?? ''),
    importance: (a, b) => b.Importance - a.Importance,
    // ISO stamps, so the text order is the time order. Newest first; a row without one goes last.
    added: (a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''),
}

/**
 * `type` is a TypeId, or 0 for all of them. The search reads the title and the short description.
 * Anything the sort calls equal falls back to date order, so a tie never reads as shuffled.
 */
export function archiveRows(items: TimelineItem[], type: number, query: string, sort: ArchiveSort): TimelineItem[] {
    const needle = query.trim().toLowerCase()
    return items
        .filter(i => (type === 0 || i.TypeId === type)
            && (!needle || [i.Title, i.Description].some(f => f?.toLowerCase().includes(needle))))
        .sort((a, b) => ORDER[sort](a, b) || a.AbsoluteStart - b.AbsoluteStart)
}

// ── The timeline's search (phase 8) ───────────────────────────────────────────

/**
 * Title, description and tag names, in date order, so ↓ walks forward in time. An empty query finds
 * nothing: listing everything is the Archive's job.
 */
export function timelineMatches(items: TimelineItem[], tags: Map<string, { TagName: string }[]>, query: string): TimelineItem[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return items
        .filter(i => [i.Title, i.Description, ...(tags.get(i.Id) ?? []).map(t => t.TagName)].some(f => f?.toLowerCase().includes(needle)))
        .sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
}

/**
 * The match a step lands on, wrapping at both ends. The first step (from -1) starts where the view is:
 * forward, the first match at or past `at`; back, the last one before it.
 */
export function stepMatch(matches: TimelineItem[], index: number, forward: boolean, at: number): number {
    const n = matches.length
    if (!n) return -1
    if (index >= 0) return (index + (forward ? 1 : n - 1)) % n
    const next = matches.findIndex(m => m.AbsoluteStart >= at)
    return forward ? Math.max(next, 0) : (next <= 0 ? n - 1 : next - 1)
}

// ── Media ─────────────────────────────────────────────────────────────────────

export type MediaSection = 'images' | 'maps' | 'portraits'
export type MediaSort = 'added' | 'usage' | 'size'

/** By what this timeline uses it as: a map's image before a portrait, a portrait before anything else. */
export function mediaSection(p: MediaItem): MediaSection {
    const here = (p.Uses ?? []).filter(u => u.Here)
    return here.some(u => u.Kind === 'map') ? 'maps' : here.some(u => u.Kind === 'portrait') ? 'portraits' : 'images'
}

/** Lower case, and jpeg reads as jpg, so the two are one chip. */
export const fileType = (p: MediaItem) => (p.FileType || '?').toLowerCase().replace('jpeg', 'jpg')

export function fileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MEDIA_ORDER: Record<MediaSort, (a: MediaItem, b: MediaItem) => number> = {
    added: (a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''),
    usage: (a, b) => (b.Uses?.length ?? 0) - (a.Uses?.length ?? 0),
    size: (a, b) => b.FileSize - a.FileSize,
}

/** `type` is a {@link fileType}, or '' for all. A tie falls back to newest first. */
export function archiveMedia(pics: MediaItem[], type: string, query: string, sort: MediaSort): MediaItem[] {
    const needle = query.trim().toLowerCase()
    return pics
        .filter(p => (!type || fileType(p) === type)
            && (!needle || [p.Title, p.FileName, p.Description].some(f => f?.toLowerCase().includes(needle))))
        .sort((a, b) => MEDIA_ORDER[sort](a, b) || MEDIA_ORDER.added(a, b))
}

// ── Characters and places ─────────────────────────────────────────────────────

export type CastSort = 'name' | 'refs' | 'birth'

/**
 * The search reads every name a character goes by, and their faction. `refs` is the items naming each.
 * An undated birth sorts last, and a tie falls back to the name.
 */
export function archiveCast(cast: CharacterItem[], refs: Map<string, unknown[]>, query: string, sort: CastSort): CharacterItem[] {
    const needle = query.trim().toLowerCase()
    const n = (c: CharacterItem) => refs.get(c.Id)?.length ?? 0
    const born = (c: CharacterItem) => c.AbsoluteStart ?? Infinity
    const order: Record<CastSort, (a: CharacterItem, b: CharacterItem) => number> = {
        name: () => 0,
        refs: (a, b) => n(b) - n(a),
        // Infinity - Infinity is NaN, which is falsy, so two undated births reach the name too.
        birth: (a, b) => born(a) - born(b),
    }
    return cast
        .filter(c => !needle || [c.Name, c.Nicknames, c.Aliases, c.Faction].some(f => f?.toLowerCase().includes(needle)))
        .sort((a, b) => order[sort](a, b) || a.Name.localeCompare(b.Name))
}

// ── Loose ends ────────────────────────────────────────────────────────────────

/** Items a description is expected on. Pictures show themselves, a bookmark is a marker. */
const DESCRIBED = new Set([1, 2, 3, 5])

/**
 * What the MISC tab's Loose ends lists: pictures, tags and stories nothing uses, characters with no
 * birth, items with no description, and titles worn more than once — each group earliest first.
 * `citedHere` is the stories an item here cites; a story cited in another timeline is not loose.
 */
export function looseEnds(
    items: TimelineItem[], media: MediaItem[], tags: { Id: number; Name: string; UsageCount: number }[],
    stories: Story[], citedHere: Set<string>, cast: CharacterItem[],
) {
    const byTitle = new Map<string, TimelineItem[]>()
    for (const i of items) {
        const key = i.TypeId < 8 ? i.Title?.trim().toLowerCase() : ''
        if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), i])
    }
    const early = (a: TimelineItem, b: TimelineItem) => a.AbsoluteStart - b.AbsoluteStart
    return {
        pictures: media.filter(p => !p.Uses?.length),
        tags: tags.filter(t => t.UsageCount === 0),
        stories: stories.filter(s => !citedHere.has(s.Id) && !s.OtherTimelineRefs),
        unborn: cast.filter(c => c.BirthYear == null),
        undescribed: items.filter(i => DESCRIBED.has(i.TypeId) && !i.Description?.trim()).sort(early),
        duplicates: [...byTitle.values()].filter(g => g.length > 1).map(g => g.sort(early))
            .sort((a, b) => (a[0]!.Title ?? '').localeCompare(b[0]!.Title ?? '')),
    }
}

type Tally = Map<string, Map<string, number>>

/**
 * Who was where, both ways round — place → character → times, and character → place → times — from the
 * map's events, which count only the present: someone talked about in a letter was not there.
 */
export function whereabouts(events: MapEvent[]): { byPlace: Tally; byCharacter: Tally } {
    const byPlace: Tally = new Map()
    const byCharacter: Tally = new Map()
    const bump = (t: Tally, a: string, b: string) => {
        const inner = t.get(a) ?? t.set(a, new Map()).get(a)!
        inner.set(b, (inner.get(b) ?? 0) + 1)
    }
    for (const e of events) {
        for (const c of e.Cast) {
            bump(byPlace, e.LocationId, c.CharacterId)
            bump(byCharacter, c.CharacterId, e.LocationId)
        }
    }
    return { byPlace, byCharacter }
}

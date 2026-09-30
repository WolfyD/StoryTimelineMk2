import { describe, it, expect } from 'vitest'
import { archiveBooks, archiveCast, archiveMedia, archiveRows, archiveStories, looseEnds, mediaSection, stepMatch, storyQuotes, timelineMatches, whereabouts } from '@/utils/archiveItems'
import type { Book, CharacterItem, MapEvent, MediaItem, MediaUse, Story, TimelineItem } from '@/types/models'

const item = (Id: string, TypeId: number, AbsoluteStart: number, AbsoluteEnd: number, extra: Partial<TimelineItem> = {}) =>
    ({ Id, TypeId, AbsoluteStart, AbsoluteEnd, Title: Id, Description: '', Importance: 5, ...extra }) as TimelineItem

const items = [
    item('war', 2, 100, 130, { Description: 'the long siege', Importance: 9, CreatedAt: '2026-01-02T00:00:00' }),
    item('birth', 1, 50, 50, { CreatedAt: '2026-03-01T00:00:00' }),
    item('age', 3, 0, 500, { CreatedAt: '2025-12-31T00:00:00' }),
    item('crowning', 1, 120, 120),
]
const ids = (rows: TimelineItem[]) => rows.map(r => r.Id)

describe('archiveRows', () => {
    it('keeps one type, or all of them on 0', () => {
        expect(ids(archiveRows(items, 1, '', 'date'))).toEqual(['birth', 'crowning'])
        expect(ids(archiveRows(items, 0, '', 'date'))).toEqual(['age', 'birth', 'war', 'crowning'])
    })

    it('searches the title and the description, whatever the case', () => {
        expect(ids(archiveRows(items, 0, 'SIEGE', 'date'))).toEqual(['war'])
        expect(ids(archiveRows(items, 0, ' crown ', 'date'))).toEqual(['crowning'])
    })

    it('sorts each way, and a tie falls back to date', () => {
        expect(ids(archiveRows(items, 0, '', 'length'))).toEqual(['age', 'war', 'birth', 'crowning'])
        expect(ids(archiveRows(items, 0, '', 'name'))).toEqual(['age', 'birth', 'crowning', 'war'])
        expect(ids(archiveRows(items, 0, '', 'importance'))).toEqual(['war', 'age', 'birth', 'crowning'])
        expect(ids(archiveRows(items, 0, '', 'added')), 'newest first, undated last').toEqual(['birth', 'war', 'age', 'crowning'])
    })

    it('does not reorder the list it was handed', () => {
        archiveRows(items, 0, '', 'name')
        expect(ids(items)).toEqual(['war', 'birth', 'age', 'crowning'])
    })
})

describe('the timeline search', () => {
    const tags = new Map([['birth', [{ TagName: 'Royal line' }]]])

    it('reads the title, the description and the tags, in date order, and finds nothing for nothing', () => {
        expect(ids(timelineMatches(items, tags, 'ROYAL'))).toEqual(['birth'])
        expect(ids(timelineMatches(items, tags, 'r'))).toEqual(['birth', 'war', 'crowning'])
        expect(timelineMatches(items, tags, '  ')).toEqual([])
    })

    it('starts from the view, then walks and wraps', () => {
        const m = timelineMatches(items, tags, 'r')   // birth 50, war 100, crowning 120
        expect(stepMatch(m, -1, true, 60), 'first at or past the view').toBe(1)
        expect(stepMatch(m, -1, false, 60), 'last before it').toBe(0)
        expect(stepMatch(m, -1, true, 999), 'nothing ahead: the first').toBe(0)
        expect(stepMatch(m, -1, false, 10), 'nothing behind: the last').toBe(2)
        expect(stepMatch(m, 2, true, 0)).toBe(0)
        expect(stepMatch(m, 0, false, 0)).toBe(2)
        expect(stepMatch([], -1, true, 0)).toBe(-1)
    })
})

describe('stories and books', () => {
    it('reads quotes and exchanges, the old list of strings, and anything else whole', () => {
        const said = (text: string, speaker = '') => ({ text, speaker })
        expect(storyQuotes('[[{"text":"Run","speaker":"Ada"},{"text":"Where?","speaker":"Bo"}]]'))
            .toEqual([[said('Run', 'Ada'), said('Where?', 'Bo')]])
        expect(storyQuotes('["a","b"]')).toEqual([[said('a')], [said('b')]])
        expect(storyQuotes(null)).toEqual([])
        expect(storyQuotes('just a line')).toEqual([[said('just a line')]])
    })

    it("lists this timeline's stories and books and the unused ones, not another timeline's", () => {
        const story = (Id: string, extra: Partial<Story> = {}) => ({ Id, Title: Id, Description: null, ...extra }) as Story
        const stories = [
            story('cited', { OtherTimelineRefs: 3 }),
            story('unused'),
            story('theirs', { OtherTimelineRefs: 2 }),
            story('cast', { OtherTimelineRefs: 2, Characters: [{ CharacterId: 'c', Pov: false }], BookIds: ['linked'] }),
        ]
        const listed = archiveStories(stories, new Set(['cited']))
        expect(listed.map(s => s.Id)).toEqual(['cited', 'unused', 'cast'])

        const book = (Id: string, extra: Partial<Book> = {}) => ({ Id, Title: Id, Author: null, OtherTimelineRefs: 1, ...extra }) as Book
        const books = [
            book('linked'), book('unused', { OtherTimelineRefs: 0 }), book('theirs'),
            book('cited', { Chapters: [{ Id: 'ch', BookId: 'cited', Number: 1, Title: null, ItemIds: ['i'] }] }),
        ]
        expect(archiveBooks(books, listed).map(b => b.Id)).toEqual(['linked', 'unused', 'cited'])
    })
})

describe('media', () => {
    const use = (Kind: MediaUse['Kind'], Here = true) => ({ Kind, Id: Kind, Name: null, TypeId: null, Here })
    const pic = (Id: string, FileType: string, FileSize: number, CreatedAt: string, Uses: MediaUse[] = [], Title = '') =>
        ({ Id, FileType, FileSize, CreatedAt, Uses, Title, FileName: `${Id}.${FileType}`, Description: '' }) as MediaItem
    const pics = [
        pic('world', 'png', 900, '2026-01-01T00:00:00', [use('map'), use('item')]),
        pic('ada', 'JPEG', 50, '2026-03-01T00:00:00', [use('portrait'), use('item'), use('item', false)], 'Ada at twenty'),
        pic('siege', 'jpg', 300, '2026-02-01T00:00:00', [use('item'), use('map', false)]),
    ]

    it("sorts a picture by what this timeline uses it as, not another timeline's map", () => {
        expect(pics.map(mediaSection)).toEqual(['maps', 'portraits', 'images'])
    })

    it('filters by file type, jpeg and jpg as one, and searches the name', () => {
        expect(archiveMedia(pics, 'jpg', '', 'added').map(p => p.Id)).toEqual(['ada', 'siege'])
        expect(archiveMedia(pics, '', 'TWENTY', 'added').map(p => p.Id)).toEqual(['ada'])
        expect(archiveMedia(pics, '', 'siege.jpg', 'added').map(p => p.Id)).toEqual(['siege'])
    })

    it('sorts by date added, usage and size, a tie newest first', () => {
        expect(archiveMedia(pics, '', '', 'added').map(p => p.Id)).toEqual(['ada', 'siege', 'world'])
        expect(archiveMedia(pics, '', '', 'usage').map(p => p.Id)).toEqual(['ada', 'siege', 'world'])
        expect(archiveMedia(pics, '', '', 'size').map(p => p.Id)).toEqual(['world', 'siege', 'ada'])
    })
})

describe('characters and places', () => {
    const ch = (Id: string, AbsoluteStart: number | null, extra: Partial<CharacterItem> = {}) =>
        ({ Id, Name: Id, AbsoluteStart, Nicknames: null, Aliases: null, Faction: null, ...extra }) as CharacterItem
    const cast = [ch('Toma', 30), ch('Ada', null, { Aliases: 'the Grey' }), ch('Bo', 10), ch('Cy', null)]
    const refs = new Map([['Toma', [1, 2]], ['Bo', [1, 2]], ['Cy', [1, 2, 3]]])
    const names = (list: CharacterItem[]) => list.map(c => c.Id)

    it('sorts by name, by how often they are named and by birth, undated last, a tie by name', () => {
        expect(names(archiveCast(cast, refs, '', 'name'))).toEqual(['Ada', 'Bo', 'Cy', 'Toma'])
        expect(names(archiveCast(cast, refs, '', 'refs'))).toEqual(['Cy', 'Bo', 'Toma', 'Ada'])
        expect(names(archiveCast(cast, refs, '', 'birth'))).toEqual(['Bo', 'Toma', 'Ada', 'Cy'])
        expect(names(archiveCast(cast, refs, 'GREY', 'name')), 'an alias finds them').toEqual(['Ada'])
    })

    it('counts who was where, both ways round', () => {
        const ev = (LocationId: string, ...who: string[]) =>
            ({ LocationId, Cast: who.map(CharacterId => ({ CharacterId, Name: CharacterId, Color: null })) }) as MapEvent
        const { byPlace, byCharacter } = whereabouts([ev('keep', 'Ada', 'Bo'), ev('keep', 'Ada'), ev('ford', 'Bo'), ev('ford')])
        expect([...byPlace.get('keep')!]).toEqual([['Ada', 2], ['Bo', 1]])
        expect([...byCharacter.get('Bo')!]).toEqual([['keep', 1], ['ford', 1]])
        expect(byPlace.has('nowhere')).toBe(false)
    })
})

describe('looseEnds', () => {
    it('finds what nothing uses, what is missing, and titles worn twice', () => {
        const pool = [
            item('siege', 1, 20, 20, { Title: ' The Siege', Description: 'walls' }),
            item('siege2', 2, 10, 30, { Title: 'the siege ' }),
            item('mark', 6, 5, 5),
            item('start', 8, 0, 0, { Title: 'Start' }),
            item('start2', 8, 0, 0, { Title: 'Start' }),
        ]
        const pic = (Id: string, Uses: MediaUse[] | null) => ({ Id, Uses }) as MediaItem
        const tag = (Id: number, UsageCount: number) => ({ Id, Name: String(Id), UsageCount })
        const story = (Id: string, OtherTimelineRefs = 0) => ({ Id, OtherTimelineRefs }) as Story
        const ch = (Id: string, BirthYear: number | null) => ({ Id, BirthYear }) as CharacterItem
        const loose = looseEnds(
            pool,
            [pic('used', [{ Kind: 'map', Id: 'm', Name: null, TypeId: null, Here: false }]), pic('none', null), pic('empty', [])],
            [tag(1, 0), tag(2, 4)],
            [story('cited'), story('elsewhere', 2), story('loose')],
            new Set(['cited']),
            [ch('ada', 0), ch('bo', null)],
        )
        expect(loose.pictures.map(p => p.Id)).toEqual(['none', 'empty'])
        expect(loose.tags.map(t => t.Id)).toEqual([1])
        expect(loose.stories.map(s => s.Id)).toEqual(['loose'])
        expect(loose.unborn.map(c => c.Id)).toEqual(['bo'])
        expect(ids(loose.undescribed), 'a bookmark and the markers need none').toEqual(['siege2'])
        expect(loose.duplicates.map(ids), 'the markers are not duplicates').toEqual([['siege2', 'siege']])
    })
})

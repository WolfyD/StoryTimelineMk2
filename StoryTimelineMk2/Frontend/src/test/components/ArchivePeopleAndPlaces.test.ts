import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        OpenCharacterTimeline: vi.fn(), OpenMapWindow: vi.fn(() => Promise.resolve()),
        OpenRelationsWindow: vi.fn(() => Promise.resolve()), OpenCharactersWindow: vi.fn(() => Promise.resolve()),
        request: vi.fn(), send: vi.fn(),
    },
}))

import { BackendAPI } from '@/bridge/api'
import ArchiveCharactersTab from '@/components/ArchiveCharactersTab.vue'
import ArchivePlacesTab from '@/components/ArchivePlacesTab.vue'
import type { CharacterItem, CharacterRelationship, LocationItem, MapItem, RelationshipType, TimelineItem } from '@/types/models'

const ch = (Id: string, Gender: string | null = null) =>
    ({ Id, Name: Id, Gender, AbsoluteStart: null, AbsoluteEnd: null, Nicknames: null, Aliases: null, Faction: null, Shared: false }) as CharacterItem
const place = (Id: string, MapId: string, extra: Partial<LocationItem> = {}) => ({ Id, MapId, Name: Id, Description: null, ChildMapId: null, Color: null, ...extra }) as LocationItem
const siege = { Id: 'siege', Title: 'Siege', TypeId: 1, AbsoluteStart: 5, AbsoluteEnd: 5 } as TimelineItem

const ada = ch('Ada', 'female')
const bo = ch('Bo')
const keep = place('Keep', 'realm', { ChildMapId: 'town' })
const MAPS = [
    { Id: 'realm', Name: 'Realm', Locations: [keep, place('Ford', 'realm')] },
    { Id: 'town', Name: 'Town', Locations: [place('Gate', 'town')] },
] as MapItem[]
const parent = { Id: 'p', Name: 'Parent', AToB: 'parent of', BToA: 'child of', AToBF: 'mother of' } as RelationshipType
const tie = { Id: 1, Character1Id: 'Ada', Character2Id: 'Bo', RelationshipType: 'p', StartYear: null, EndYear: null } as CharacterRelationship

const row = (w: Pick<ReturnType<typeof mount>, 'findAll'>, name: string) => w.findAll('.ar-row').find(r => r.text().includes(name))!

describe('ArchiveCharactersTab', () => {
    const mountTab = () => mount(ArchiveCharactersTab, {
        props: {
            timelineId: 3, cast: [ada, bo], refs: new Map([['Ada', [siege]]]), relations: [tie], types: [parent],
            whereabouts: new Map([['Ada', new Map([['Keep', 2], ['Gone', 1]])]]),
            places: new Map([['Keep', keep]]), dateOf: String, icons: {},
        },
    })

    it("opens a character's own timeline from the name, and folds out the rest", async () => {
        const w = mountTab()
        await row(w, 'Ada').find('.ar-row-title').trigger('click')
        expect(BackendAPI.OpenCharacterTimeline).toHaveBeenCalledWith(3, 'Ada')

        await row(w, 'Ada').find('.ar-fold-btn').trigger('click')
        const fold = w.find('.ar-fold')
        expect(fold.text()).toContain('Siege')
        expect(fold.text()).toContain('mother of Bo')
        expect(fold.text(), 'a place in the trash is left out').not.toContain('Gone')

        await fold.findAll('.ap-chip').find(c => c.text().includes('Keep'))!.trigger('click')
        expect(w.emitted('place')?.[0]).toEqual(['Keep'])

        await fold.find('.ac-who').trigger('click')
        expect(w.find('.ar-fold').text(), "a relation opens the other's row").toContain('child of Ada')
    })
})

describe('ArchivePlacesTab', () => {
    const feast = { Id: 'feast', Title: 'Feast', TypeId: 1, AbsoluteStart: 9, AbsoluteEnd: 9 } as TimelineItem
    const mountTab = () => mount(ArchivePlacesTab, {
        props: {
            timelineId: 3, maps: MAPS, refs: new Map([['Keep', [siege]], ['Gate', [feast]]]),
            whereabouts: new Map([['Keep', new Map([['Ada', 3], ['Bo', 1]])], ['Gate', new Map([['Bo', 5]])]]),
            cast: new Map([['Ada', ada], ['Bo', bo]]), icons: {},
        },
        attachTo: document.body,
    })
    const details = (w: ReturnType<typeof mountTab>, name: string) => row(w, name).find('.ar-name .ar-fold-btn').trigger('click')

    it('is the map tree: a top-level map is a row, and a door carries the places behind it', async () => {
        const w = mountTab()
        expect(w.findAll('.ar-row-title').map(b => b.text())).toEqual(['Realm', 'Keep', 'Gate', 'Ford'])

        await row(w, 'Realm').find('.ar-row-title').trigger('click')
        expect(BackendAPI.OpenMapWindow).toHaveBeenLastCalledWith(3, 'realm', undefined)
        await row(w, 'Keep').find('.ar-row-title').trigger('click')
        expect(BackendAPI.OpenMapWindow).toHaveBeenLastCalledWith(3, 'realm', 'Keep')

        // The door counts what happened behind it: Bo was at the Gate five times, at the Keep once.
        await details(w, 'Keep')
        const fold = w.find('.ar-fold').text()
        expect(fold).toContain('Siege')
        expect(fold).toContain('Feast')
        expect(fold.indexOf('Bo'), 'most often first').toBeLessThan(fold.indexOf('Ada'))
        expect(fold).toContain('Town')
        expect(row(w, 'Realm').text()).toContain('2 places · 2 items · 2 characters')

        await row(w, 'Keep').find('.ar-row-head > .ar-fold-btn').trigger('click')
        expect(w.text()).not.toContain('Gate')

        // From the Characters tab: the branch opens again and the place folds out.
        ;(w.vm as unknown as { open: (id: string) => void }).open('Gate')
        await w.vm.$nextTick()
        expect(row(w, 'Gate').find('.ar-fold').exists()).toBe(true)
        w.unmount()
    })

    it('finds a map by its name, a door by the map behind it, and trashes either', async () => {
        const w = mountTab()
        await w.find('.ar-search input').setValue('town')
        expect(w.findAll('.ar-row-title').map(b => b.text())).toEqual(['Realm', 'Keep'])
        await w.find('.ar-search input').setValue('realm')
        expect(w.findAll('.ar-row-title').map(b => b.text())).toEqual(['Realm'])

        await row(w, 'Realm').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')?.[0]?.[0]).toMatchObject({ kind: 'map', id: 'realm', sub: 'with 2 places' })
        await w.find('.ar-search input').setValue('')
        await row(w, 'Ford').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')?.[1]?.[0]).toMatchObject({ kind: 'place', id: 'Ford', sub: 'Realm' })
        w.unmount()
    })
})

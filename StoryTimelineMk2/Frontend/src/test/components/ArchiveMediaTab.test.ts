import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/bridge/api', () => ({
    BackendAPI: { SavePictureInfo: vi.fn(), BulkEditMedia: vi.fn(async () => ({ status: 'ok', affected: 1 })), request: vi.fn(), send: vi.fn() },
    logError: vi.fn(),
}))

import { BackendAPI } from '@/bridge/api'
import ArchiveMediaTab from '@/components/ArchiveMediaTab.vue'
import type { MediaItem, MediaUse, TimelineItem } from '@/types/models'

const use = (Kind: MediaUse['Kind'], Name: string, Here = true): MediaUse => ({ Kind, Id: Name, Name, TypeId: null, Here })
const pic = (Id: string, Uses: MediaUse[]) =>
    ({ Id, Title: Id, FileName: `${Id}.png`, FileType: 'png', FileSize: 1, CreatedAt: '', Uses, FilePath: '', ThumbPath: '' }) as unknown as MediaItem
const MEDIA = [pic('world', [use('map', 'Realm'), use('item', 'Siege', false)]), pic('spare', [])]
const ITEMS = new Map([['i1', { Id: 'i1', Title: 'Coronation', TypeId: 1, AbsoluteStart: 0 } as TimelineItem]])

function mountTab() {
    return mount(ArchiveMediaTab, {
        attachTo: document.body,
        props: { timelineId: 1, media: MEDIA, items: ITEMS, icons: {}, when: () => '1200' },
    })
}
const row = (w: ReturnType<typeof mountTab>, id: string) => w.findAll('.ar-row').find(r => r.text().includes(id))!

describe('ArchiveMediaTab', () => {
    it('trashes an unused picture at once, and lists every use of a used one first', async () => {
        const w = mountTab()
        await row(w, 'spare').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')?.[0]?.[0]).toMatchObject({ kind: 'picture', id: 'spare' })

        await row(w, 'world').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')).toHaveLength(1)                    // asked first
        const list = document.body.querySelector('.ar-trash-list')!.textContent!
        expect(list).toContain('Realm')
        expect(list).toContain('Siege item, another timeline')

        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()
        expect(w.emitted('trash')?.[1]?.[0]).toMatchObject({ kind: 'picture', id: 'world' })
        w.unmount()
    })

    it('folds a section away and back', async () => {
        const w = mountTab()
        const maps = w.findAll('.ar-section button').find(b => b.text().includes('Maps'))!
        await maps.trigger('click')
        expect(row(w, 'world').isVisible()).toBe(false)
        expect(row(w, 'spare').isVisible()).toBe(true)
        await maps.trigger('click')
        expect(row(w, 'world').isVisible()).toBe(true)
        w.unmount()
    })

    it('asks before an edited picture folds shut', async () => {
        const w = mountTab()
        await row(w, 'world').find('.ar-row-title').trigger('click')
        await w.find('.ar-fold input').setValue('The Realm')
        await row(w, 'spare').find('.ar-row-title').trigger('click')
        expect(document.body.textContent).toContain('Discard changes?')
        expect((w.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(true)

        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()
        expect((w.find('.ar-fold input').element as HTMLInputElement).value).toBe('spare')
        w.unmount()
    })

    it('ticks only while Edit multiple is on, puts the ticked on an item, and asks once before trashing used ones', async () => {
        const w = mountTab()
        expect(w.find('.ar-row .ar-pick').exists()).toBe(false)
        await w.find('.ar-switch input').setValue(true)
        await w.find('.ar-select-all input').trigger('change')
        expect(w.find('.ab-count').text()).toBe('2 selected')

        await w.findAll('.ab-bar .ar-btn').find(b => b.text().includes('Put on an item'))!.trigger('click')
        const select = document.body.querySelector('.ab-body select') as HTMLSelectElement
        expect(select.textContent).toContain('Coronation · 1200')
        select.value = 'i1'
        select.dispatchEvent(new Event('change'))
        await flushPromises()
        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()
        expect(BackendAPI.BulkEditMedia).toHaveBeenCalledWith({ ids: ['spare', 'world'], attachTo: 'i1' })   // as listed: Images, then Maps
        expect(w.emitted('saved')).toHaveLength(1)

        await w.find('.ab-danger').trigger('click')
        expect(w.emitted('trash')).toBeUndefined()                    // world is still used: asked first
        expect(document.body.querySelector('.ar-trash-list')!.textContent).toContain('world')
        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()
        expect(w.emitted('trash')!.map(e => (e[0] as { id: string }).id)).toEqual(['spare', 'world'])
        expect(w.find('.ab-bar').exists()).toBe(false)
        w.unmount()
    })
})

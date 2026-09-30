import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    logError: vi.fn(),
    BackendAPI: {
        RenameTag: vi.fn(() => Promise.resolve({ status: 'ok' })), MergeTag: vi.fn(() => Promise.resolve({ status: 'ok' })),
        SaveNote: vi.fn(() => Promise.resolve({ status: 'ok' })), FocusTimelineItem: vi.fn(() => Promise.resolve()),
        OpenAddEditItemWindow: vi.fn(), request: vi.fn(), send: vi.fn(),
    },
}))

import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import ArchiveTagsTab from '@/components/ArchiveTagsTab.vue'
import ArchiveNotesTab from '@/components/ArchiveNotesTab.vue'
import type { TimelineItem, TimelineNote } from '@/types/models'

const siege = { Id: 'siege', Title: 'Siege', TypeId: 1, AbsoluteStart: 5, AbsoluteEnd: 5 } as TimelineItem
const row = (w: Pick<ReturnType<typeof mount>, 'findAll'>, name: string) => w.findAll('.ar-row').find(r => r.text().includes(name))!

beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
})

describe('ArchiveTagsTab', () => {
    const TAGS = [
        { Id: 1, Name: 'dragon', UsageCount: 3 }, { Id: 2, Name: 'dragons', UsageCount: 1 },
        { Id: 3, Name: 'spare', UsageCount: 0 }, { Id: 4, Name: 'elsewhere', UsageCount: 2 },
    ]
    const mountTab = (trashed = new Set<string>()) => mount(ArchiveTagsTab, {
        props: {
            timelineId: 3, tags: TAGS, refs: new Map([['1', [siege]]]),
            local: new Map([[1, 1], [2, 1]]), trashed, when: () => 'then',
        },
        attachTo: document.body,
    })

    it("lists this timeline's tags and the unused ones, counts the rest as elsewhere, and folds out the items", async () => {
        const w = mountTab()
        expect(w.findAll('.ar-row-title').map(b => b.text())).toEqual(['dragon', 'dragons', 'spare'])
        expect(row(w, 'dragon').text()).toContain('1 item · 2 in other timelines')
        expect(row(w, 'spare').text()).toContain('unused')

        await row(w, 'dragon').find('.ar-row-title').trigger('click')
        await w.find('.al-title').trigger('click')
        expect(w.emitted('jump')?.[0]).toEqual([siege])

        await row(w, 'dragon').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')?.[0]?.[0]).toMatchObject({ kind: 'tag', id: 'tag:1', sub: 'on 3 items' })
        w.unmount()
    })

    it('renames, and merges onto an existing name only after a confirm', async () => {
        const w = mountTab()
        await row(w, 'spare').find('[aria-label="Rename"]').trigger('click')
        await w.find('.at-rename input').setValue('  Reserve ')
        await w.find('.at-rename input').trigger('keydown', { key: 'Enter' })
        expect(BackendAPI.RenameTag).toHaveBeenCalledWith(3, 'reserve')

        await row(w, 'dragon').find('[aria-label="Rename"]').trigger('click')
        await w.find('.at-rename input').setValue('Dragons')
        expect(w.find('.at-hint').text()).toContain('merges it into “dragons”')
        await w.find('.at-rename input').trigger('keydown', { key: 'Enter' })
        expect(BackendAPI.RenameTag).toHaveBeenCalledTimes(1)
        await w.find('[data-primary]').trigger('click')
        expect(BackendAPI.MergeTag).toHaveBeenCalledWith(1, 2)
        w.unmount()
    })

    it('will not merge into a tag waiting in the trash', async () => {
        const w = mountTab(new Set(['tag:2']))
        await row(w, 'dragon').find('[aria-label="Rename"]').trigger('click')
        await w.find('.at-rename input').setValue('dragons')
        expect(w.find('.at-hint--warn').exists()).toBe(true)
        await w.find('.at-rename input').trigger('keydown', { key: 'Enter' })
        expect(w.find('[data-primary]').exists()).toBe(false)
        expect(BackendAPI.MergeTag).not.toHaveBeenCalled()
        w.unmount()
    })
})

describe('ArchiveNotesTab', () => {
    const note = (Id: string, NoteContents: string, AbsoluteTime: number) =>
        ({ Id, NoteContents, ConnectedItemId: '', TimelineId: 3, NearestYear: 0, AbsoluteTime, UpdatedAt: '' }) as TimelineNote
    const NOTES = [note('a', 'Check the siege date\nsecond line', 5), note('b', 'Rename the keep', 9)]
    const mountTab = () => mount(ArchiveNotesTab, { props: { notes: NOTES, dateOf: (at: number) => `Y${at}` }, attachTo: document.body })

    it('searches the text, jumps by the date, edits in place and trashes', async () => {
        const store = useTimelineStore()
        store.notes = [...NOTES]
        const w = mountTab()

        await w.find('.ar-search input').setValue('KEEP')
        expect(w.findAll('.ar-row-title').map(b => b.text())).toEqual(['Y9'])
        await w.find('.ar-search input').setValue('')

        await row(w, 'siege').find('.ar-row-title').trigger('click')
        expect(BackendAPI.FocusTimelineItem).toHaveBeenCalledWith('a', 5)

        await row(w, 'siege').find('[aria-label="Edit"]').trigger('click')
        await w.find('.an-edit textarea').setValue('  Siege is in 5  ')
        await w.find('.an-edit .ap-btn--primary').trigger('click')
        await vi.waitFor(() => expect(store.notes[0]!.NoteContents).toBe('Siege is in 5'))
        expect(BackendAPI.SaveNote).toHaveBeenCalledWith(expect.objectContaining({ Id: 'a', NoteContents: 'Siege is in 5' }))

        await row(w, 'keep').find('.ar-icon--danger').trigger('click')
        expect(w.emitted('trash')?.[0]?.[0]).toEqual({ kind: 'note', id: 'b', title: 'Rename the keep', sub: 'Y9' })
        w.unmount()
    })

    it('asks before another note replaces unsaved changes', async () => {
        const w = mountTab()
        await row(w, 'siege').find('[aria-label="Edit"]').trigger('click')
        await w.find('.an-edit textarea').setValue('half typed')
        await row(w, 'keep').find('[aria-label="Edit"]').trigger('click')
        expect((w.find('.an-edit textarea').element as HTMLTextAreaElement).value, 'kept until the answer').toBe('half typed')
        expect((w.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(true)

        await w.find('[data-primary]').trigger('click')
        expect((w.find('.an-edit textarea').element as HTMLTextAreaElement).value).toBe('Rename the keep')
        w.unmount()
    })
})

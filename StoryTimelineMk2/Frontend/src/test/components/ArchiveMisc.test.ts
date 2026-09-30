import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const history = {
    timelineTitle: 'T', lastExportedAt: '2026-09-20 10:00:00', lastExportDay: '2026-09-20', emptyDays: 2,
    days: [
        { day: '2026-09-30', startedAt: '2026-09-30 09:00:00', open: true, added: 0, changed: 1, removed: 0 },
        { day: '2026-09-28', startedAt: '2026-09-28 09:00:00', open: false, added: 2, changed: 0, removed: 0 },
        { day: '2026-09-25', startedAt: '2026-09-25 09:00:00', open: false, added: 0, changed: 3, removed: 1 },
        { day: '2026-09-20', startedAt: '2026-09-19 09:00:00', open: false, added: 1, changed: 0, removed: 0 },
    ],
}

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        GetSessionHistory: vi.fn(() => Promise.resolve({ status: 'ok', history })),
        GetSessionChanges: vi.fn(() => Promise.resolve({ status: 'ok', summary: { entries: [{ id: 'a', op: 'insert', title: 'Siege' }] } })),
        MergeSessionDays: vi.fn(() => Promise.resolve({ status: 'ok', history })),
        PruneSessionDays: vi.fn(() => Promise.resolve({ status: 'ok' })),
        DeleteHiddenRange: vi.fn(() => Promise.resolve({ status: 'ok' })),
        BulkEditItems: vi.fn(() => Promise.resolve({ status: 'ok', affected: 2 })),
        request: vi.fn(), send: vi.fn(),
    },
    logError: vi.fn(() => Promise.resolve('')),
}))

import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import ArchiveSessions from '@/components/ArchiveSessions.vue'
import ArchiveMiscTab from '@/components/ArchiveMiscTab.vue'
import ArchiveBulkBar from '@/components/ArchiveBulkBar.vue'
import type { HiddenRange, TimelineItem } from '@/types/models'

const row = (w: Pick<ReturnType<typeof mount>, 'findAll'>, day: string) => w.findAll('.ar-row').find(r => r.attributes('data-day') === day)!

beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
})

describe('ArchiveSessions', () => {
    it('merges neighbouring finished days on one side of the export, and says why not otherwise', async () => {
        const w = mount(ArchiveSessions, { props: { timelineId: 3 }, attachTo: document.body })
        await flushPromises()
        expect(row(w, '2026-09-30').find('input').exists(), 'today has no tick').toBe(false)
        expect(w.find('.as-export').exists()).toBe(true)
        const merge = () => w.findAll('.ap-btn').find(b => b.text().startsWith('Merge'))!

        await row(w, '2026-09-28').find('input').trigger('change')
        expect(merge().attributes('disabled')).toBeDefined()
        await row(w, '2026-09-20').find('input').trigger('change')
        expect(w.find('.as-why').text()).toContain('next to each other')
        await row(w, '2026-09-25').find('input').trigger('change')
        expect(w.find('.as-why').text()).toContain('both sides of the last export')

        await row(w, '2026-09-20').find('input').trigger('change')
        expect(w.find('.as-why').exists()).toBe(false)
        await merge().trigger('click')
        await w.find('[data-primary]').trigger('click')
        expect(BackendAPI.MergeSessionDays).toHaveBeenCalledWith(3, ['2026-09-28', '2026-09-25'])

        await w.findAll('.ap-btn').find(b => b.text().includes('Prune 2 empty days'))!.trigger('click')
        expect(BackendAPI.PruneSessionDays).toHaveBeenCalledWith(3)
        w.unmount()
    })
})

describe('ArchiveMiscTab', () => {
    it('restores a hidden range and drops it from the list', async () => {
        const store = useTimelineStore()
        store.setHiddenRanges([{ Id: 7, TimelineId: 3, StartYear: 10, EndYear: 20, Label: 'The gap' } as HiddenRange])
        const none = { pictures: [], tags: [], stories: [], unborn: [], undescribed: [], duplicates: [] }
        const w = mount(ArchiveMiscTab, { props: { timelineId: 3, loose: none, when: () => '' }, attachTo: document.body })
        expect(w.text()).toContain('No loose ends.')

        await w.findAll('[role="tab"]').find(c => c.text().startsWith('Hidden ranges'))!.trigger('click')
        expect(w.find('.ar-row').text()).toContain('The gap')
        await w.find('.ar-row .ar-btn').trigger('click')
        await flushPromises()
        expect(BackendAPI.DeleteHiddenRange).toHaveBeenCalledWith(7)
        expect(w.find('.ar-row').exists()).toBe(false)
        w.unmount()
    })
})

describe('ArchiveBulkBar', () => {
    const items = [
        { Id: 'a', TypeId: 1, Importance: 4, LodVisibilityMask: 3, Color: null },
        { Id: 'b', TypeId: 2, Importance: 4, LodVisibilityMask: 1, Color: '#fff' },
    ] as TimelineItem[]
    const mountBar = (binned: string[] = []) => mount(ArchiveBulkBar, {
        props: { timelineId: 3, items, tags: [{ Id: 5, Name: 'war' }, { Id: 6, Name: 'siege' }], binned, stories: [] },
        attachTo: document.body,
    })
    const button = (w: ReturnType<typeof mountBar>, text: string) => w.findAll('button').find(b => b.text().includes(text))!

    it('adds a tag to all, and removes one only when it exists', async () => {
        const w = mountBar()
        await button(w, 'Tags').trigger('click')
        await w.find('input[list]').setValue('Famine')
        expect(button(w, 'Remove from all').attributes('disabled'), 'no such tag').toBeDefined()
        await button(w, 'Add to all').trigger('click')
        await flushPromises()
        expect(BackendAPI.BulkEditItems).toHaveBeenCalledWith({ ids: ['a', 'b'], addTag: 'Famine' })
        expect(w.find('input[list]').exists(), 'closed on success').toBe(false)

        await button(w, 'Tags').trigger('click')
        await w.find('input[list]').setValue(' WAR ')
        await button(w, 'Remove from all').trigger('click')
        expect(BackendAPI.BulkEditItems).toHaveBeenLastCalledWith({ ids: ['a', 'b'], removeTagId: 5 })
        w.unmount()
    })

    it('will not add a tag that is in the trash, but still removes it', async () => {
        const w = mountBar(['siege'])
        await button(w, 'Tags').trigger('click')
        await w.find('input[list]').setValue('Siege ')
        expect(w.find('.ab-hint--warn').text()).toContain('in the trash')
        expect(button(w, 'Add to all').attributes('disabled')).toBeDefined()
        expect(button(w, 'Remove from all').attributes('disabled')).toBeUndefined()
        w.unmount()
    })

    it('starts importance at what the items share, and keeps the dialog open on a failure', async () => {
        vi.mocked(BackendAPI.BulkEditItems).mockRejectedValueOnce(new Error('locked'))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const w = mountBar()
        await button(w, 'Importance').trigger('click')
        expect((w.find('input[type="range"]').element as HTMLInputElement).value).toBe('4')
        await button(w, 'Apply to 2 items').trigger('click')
        await flushPromises()
        expect(BackendAPI.BulkEditItems).toHaveBeenCalledWith({ ids: ['a', 'b'], importance: 4 })
        expect(w.find('.ab-error').text()).toContain('locked')
        w.unmount()
    })
})

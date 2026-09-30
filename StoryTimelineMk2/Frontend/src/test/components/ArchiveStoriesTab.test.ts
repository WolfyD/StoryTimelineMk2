import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    logError: vi.fn(),
    BackendAPI: { SaveStory: vi.fn(), request: vi.fn(), send: vi.fn() },
}))

import ArchiveStoriesTab from '@/components/ArchiveStoriesTab.vue'
import type { Book, Story } from '@/types/models'

const BOOK: Book = {
    Id: 'b', Title: 'The Long Winter', Author: null,
    Chapters: [4, 6, 8].map(n => ({ Id: `c${n}`, BookId: 'b', Number: n, Title: null })),
}
const STORIES: Story[] = [
    { Id: 's1', Title: 'One', Description: null, BookIds: ['b'], ChapterIds: ['c4', 'c8'] },
    { Id: 's2', Title: 'Two', Description: null },
]

function mountTab() {
    return mount(ArchiveStoriesTab, {
        attachTo: document.body,
        props: { timelineId: 1, stories: STORIES, books: [BOOK], maps: [], trashed: new Set<string>(),refs: new Map(), when: () => '' },
    })
}

const rows = (w: ReturnType<typeof mountTab>) => w.findAll('.ap-row')
const title = (w: ReturnType<typeof mountTab>) => (w.find('.ap-field input').element as HTMLInputElement).value

describe('ArchiveStoriesTab', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('names the picked chapters on the book chip, and a toggle adds one', async () => {
        const w = mountTab()
        await rows(w)[0]!.trigger('click')
        expect(w.find('.ap-book .ap-chip').text()).toBe('The Long Winter · ch. 4, 8')
        await w.findAll('.ap-book .ap-pov')[1]!.trigger('click')
        expect(w.find('.ap-book .ap-chip').text()).toBe('The Long Winter · ch. 4, 6, 8')
        w.unmount()
    })

    it('asks before an edited story is swapped for another, and not before an untouched one', async () => {
        const w = mountTab()
        await rows(w)[0]!.trigger('click')
        await rows(w)[1]!.trigger('click')
        expect(title(w)).toBe('Two')                                  // untouched: no question

        await w.find('.ap-field input').setValue('Two, retold')
        await rows(w)[0]!.trigger('click')
        expect(document.body.textContent).toContain('Discard changes?')
        expect(title(w)).toBe('Two, retold')                          // still open until answered

        ;(document.body.querySelector('[data-cancel]') as HTMLElement).click()
        await flushPromises()
        expect(document.body.textContent).not.toContain('Discard changes?')
        expect((w.vm as unknown as { isDirty: () => boolean }).isDirty()).toBe(true)

        await rows(w)[0]!.trigger('click')
        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()
        expect(title(w)).toBe('One')
        w.unmount()
    })

    it('writes an exchange in the quote modal, shows it as one card and saves who said what', async () => {
        const { BackendAPI } = await import('@/bridge/api')
        vi.mocked(BackendAPI.SaveStory).mockResolvedValue({ status: 'ok', story: STORIES[1] })
        const w = mountTab()
        await rows(w)[1]!.trigger('click')
        await w.findAll('.ap-btn').find(b => b.text().includes('Add quote'))!.trigger('click')

        const fill = async (n: number, text: string, speaker: string) => {
            const textareas = document.body.querySelectorAll<HTMLTextAreaElement>('.sq-line textarea')
            const inputs = document.body.querySelectorAll<HTMLInputElement>('.sq-line input')
            textareas[n]!.value = text; textareas[n]!.dispatchEvent(new Event('input'))
            inputs[n]!.value = speaker; inputs[n]!.dispatchEvent(new Event('input'))
            await flushPromises()
        }
        await fill(0, 'Run.', 'Ada')
        ;[...document.body.querySelectorAll<HTMLElement>('.act')].find(b => b.textContent!.includes('Add a line'))!.click()
        await flushPromises()
        await fill(1, 'Where? ', ' the guard')
        ;(document.body.querySelector('[data-primary]') as HTMLElement).click()
        await flushPromises()

        expect(w.findAll('.ap-quote')).toHaveLength(1)
        expect(w.find('.ap-quote--exchange').text()).toBe('AdaRun.the guardWhere?')

        await w.find('.ap-bar .ap-btn--primary').trigger('click')
        await flushPromises()
        expect(JSON.parse(vi.mocked(BackendAPI.SaveStory).mock.calls[0]![0].Quotes!))
            .toEqual([[{ text: 'Run.', speaker: 'Ada' }, { text: 'Where?', speaker: 'the guard' }]])
        w.unmount()
    })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/bridge/api', () => ({
    BackendAPI: {
        GetTagList: vi.fn(),
        RenameTag: vi.fn(),
        DeleteTag: vi.fn(),
        request: vi.fn(),
        send: vi.fn(),
    },
}))

vi.mock('@phosphor-icons/vue', () => {
    const stub = (name: string) => ({ template: '<span />', name })
    return {
        PhX: stub('PhX'), PhPencilSimple: stub('PhPencilSimple'), PhTrash: stub('PhTrash'),
        PhArrowsClockwise: stub('PhArrowsClockwise'), PhCheck: stub('PhCheck'),
        PhMagnifyingGlass: stub('PhMagnifyingGlass'), PhWarning: stub('PhWarning'),
    }
})

import TagManagerModal from '@/components/TagManagerModal.vue'
import { BackendAPI } from '@/bridge/api'

const TAGS = [
    { Id: 1, Name: 'battle', UsageCount: 3 },
    { Id: 2, Name: 'romance', UsageCount: 0 },
]

function mountModal() {
    return mount(TagManagerModal, { attachTo: document.body })
}

describe('TagManagerModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
        ;(BackendAPI.GetTagList as ReturnType<typeof vi.fn>).mockResolvedValue(TAGS)
    })

    it('lists tags with their usage counts', async () => {
        const wrapper = mountModal()
        await flushPromises()
        const rows = document.body.querySelectorAll('.tag-row')
        expect(rows.length).toBe(2)
        expect(rows[0].textContent).toContain('battle')
        expect(rows[0].textContent).toContain('3 items')
        expect(rows[1].textContent).toContain('romance')
        wrapper.unmount()
    })

    it('search filters the list client-side', async () => {
        const wrapper = mountModal()
        await flushPromises()
        const input = document.body.querySelector('.search-input') as HTMLInputElement
        input.value = 'rom'
        input.dispatchEvent(new Event('input'))
        await flushPromises()
        const rows = document.body.querySelectorAll('.tag-row')
        expect(rows.length).toBe(1)
        expect(rows[0].textContent).toContain('romance')
        wrapper.unmount()
    })

    it('delete asks for confirmation, mentions usage, then calls DeleteTag', async () => {
        ;(BackendAPI.DeleteTag as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', unlinked: 3 })
        const wrapper = mountModal()
        await flushPromises()
        ;(document.body.querySelector('.tag-row .action-btn.delete') as HTMLButtonElement).click()
        await flushPromises()
        expect(BackendAPI.DeleteTag).not.toHaveBeenCalled()
        expect(document.body.textContent).toContain('Used by 3 items')
        ;(document.body.querySelector('.btn-danger') as HTMLButtonElement).click()
        await flushPromises()
        expect(BackendAPI.DeleteTag).toHaveBeenCalledWith(1)
        expect(BackendAPI.GetTagList).toHaveBeenCalledTimes(2)
        wrapper.unmount()
    })

    it('edit renames via RenameTag on Enter and shows backend errors', async () => {
        ;(BackendAPI.RenameTag as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'error', message: "A tag named 'romance' already exists." })
        const wrapper = mountModal()
        await flushPromises()
        ;(document.body.querySelector('.tag-row .action-btn.edit') as HTMLButtonElement).click()
        await flushPromises()
        const input = document.body.querySelector('.tag-edit-input') as HTMLInputElement
        input.value = 'Romance'
        input.dispatchEvent(new Event('input'))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await flushPromises()
        expect(BackendAPI.RenameTag).toHaveBeenCalledWith(1, 'romance')
        expect(document.body.querySelector('.state-msg.error')?.textContent).toContain('already exists')
        wrapper.unmount()
    })
})

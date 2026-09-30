import { describe, it, expect } from 'vitest'
import { nextTick, ref } from 'vue'
import { useMultiPick } from '@/composables/useMultiPick'

const click = (shiftKey = false) => ({ shiftKey }) as MouseEvent

describe('useMultiPick', () => {
    it('ticks a shift run, toggles all shown, counts a twice-listed row once, and drops the ticks when switched off', async () => {
        const rows = ref(['a', 'b', 'c', 'b'])
        const p = useMultiPick(() => rows.value, r => r)
        p.multi.value = true
        await nextTick()

        p.pick('a', click())
        p.pick('c', click(true))
        expect(p.selection.value).toEqual(['a', 'b', 'c'])
        expect(p.allShown.value).toBe(true)

        p.toggleAll()
        expect(p.selection.value, 'all shown were ticked, so it unticks').toEqual([])
        p.pick('b', click())
        p.toggleAll()
        expect(p.selection.value).toEqual(['a', 'b', 'c'])

        rows.value = ['a', 'b']
        expect(p.selection.value, 'a hidden row stays out').toEqual(['a', 'b'])

        p.multi.value = false
        await nextTick()
        expect(p.picked.value.size).toBe(0)
    })
})

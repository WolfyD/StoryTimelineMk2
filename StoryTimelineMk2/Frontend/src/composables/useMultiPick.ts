/**
 * BL-88: ticking rows to change them together, the same in every Archive tab. Off until the tab's
 * *Edit multiple* switch is on, and switching it off drops every tick.
 *
 * `shown` is the rows that can be ticked, as the tab shows them. A tick a chip or search hides stays
 * ticked but out of `selection` until the row shows again. A row listed twice (a map hanging off two
 * doors lists its places twice) is one tick and one entry in `selection`.
 */
import { computed, ref, watch } from 'vue'

export function useMultiPick<T>(shown: () => T[], keyOf: (row: T) => string) {
    const multi = ref(false)
    const picked = ref(new Set<string>())
    /** The last row ticked or unticked, where a shift-click's run starts. */
    let anchor: string | null = null

    const selection = computed(() => {
        const seen = new Set<string>()
        return shown().filter(r => {
            const k = keyOf(r)
            if (!picked.value.has(k) || seen.has(k)) return false
            seen.add(k)
            return true
        })
    })
    const allShown = computed(() => shown().length > 0 && shown().every(r => picked.value.has(keyOf(r))))

    function clear() {
        picked.value = new Set()
        anchor = null
    }
    watch(multi, on => { if (!on) clear() })

    /** A shift-click sets every row from the last one clicked to this one as this one goes. */
    function pick(row: T, e: MouseEvent) {
        const key = keyOf(row)
        const on = !picked.value.has(key)
        const list = shown()
        const a = list.findIndex(r => keyOf(r) === anchor)
        const b = list.findIndex(r => keyOf(r) === key)
        for (const r of e.shiftKey && a >= 0 && b >= 0 ? list.slice(Math.min(a, b), Math.max(a, b) + 1) : [row]) {
            if (on) picked.value.add(keyOf(r))
            else picked.value.delete(keyOf(r))
        }
        anchor = key
    }

    /** Every row shown ticked, or, when they already all are, every one of them unticked. */
    function toggleAll() {
        const on = !allShown.value
        for (const r of shown()) {
            if (on) picked.value.add(keyOf(r))
            else picked.value.delete(keyOf(r))
        }
    }

    /** Taken out of the tick, as a row going to the trash is: restored, it comes back unticked. */
    const drop = (key: string) => picked.value.delete(key)

    return { multi, picked, selection, allShown, pick, toggleAll, clear, drop }
}

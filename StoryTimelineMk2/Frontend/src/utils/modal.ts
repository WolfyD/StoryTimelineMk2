// What every modal in the app needs and kept re-implementing: a backdrop that closes on a click
// but not on a drag, Esc to leave, Enter to confirm, and staying out of the way of the modal on
// top of it. One place, so a new modal cannot forget half of it.
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useModalGuard } from './shortcuts'

/** Enter belongs to the field when the field does something with it. Ctrl+Enter confirms anyway. */
function fieldOwnsEnter(el: HTMLElement | null): boolean {
    if (!el) return false
    return el.tagName === 'TEXTAREA' || el.isContentEditable || el.hasAttribute('data-enter-self')
}

/**
 * A backdrop that closes on a click but not on a drag. `useModal` includes it; call this directly
 * for a modal that lives inline in a page and so has no component lifecycle of its own.
 *
 * A `click` fires on the common ancestor of mousedown and mouseup, so selecting text inside the
 * panel and releasing outside it targeted the backdrop and closed the modal. The press is what
 * decides: only one that landed on the backdrop itself counts.
 */
export function backdropClose(close: () => void) {
    let pressed = false
    return {
        onMousedown: (e: MouseEvent) => { pressed = e.target === e.currentTarget },
        onClick: (e: MouseEvent) => {
            if (pressed && e.target === e.currentTarget) close()
            pressed = false
        },
    }
}

/**
 * @param close   what Esc and a backdrop click should do
 * @param confirm optional: what Enter should do. Left out, Enter clicks the footer's
 *                `[data-primary]` button, which is what almost every modal wants.
 */
export function useModal(close: () => void, confirm?: () => void) {
    /** Put on the backdrop element — Enter looks for the primary button inside it. */
    const root = ref<HTMLElement | null>(null)
    const isTop = useModalGuard()

    const { onMousedown, onClick } = backdropClose(close)

    function onKeydown(e: KeyboardEvent) {
        if (!isTop()) return   // a nested dialog owns the keys; the one underneath must not act too
        if (e.key === 'Escape') {
            e.preventDefault()
            close()
            return
        }
        if (e.key !== 'Enter' || e.altKey || e.shiftKey) return
        const el = document.activeElement as HTMLElement | null
        if (el?.tagName === 'BUTTON' || el?.tagName === 'A') return   // the browser presses it already
        if (!e.ctrlKey && !e.metaKey && fieldOwnsEnter(el)) return
        const primary = root.value?.querySelector<HTMLElement>('[data-primary]:not([disabled])')
        if (!confirm && !primary) return
        e.preventDefault()
        if (confirm) confirm()
        else primary!.click()
    }

    onMounted(() => window.addEventListener('keydown', onKeydown))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

    return { root, onMousedown, onClick, isTop }
}

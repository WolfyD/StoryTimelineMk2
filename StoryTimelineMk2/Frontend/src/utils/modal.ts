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
 * Pulls a menu opened near an edge back inside the window, whole. Measured as drawn, so call it after
 * the render: a menu is as tall as whatever it holds that time, and a guessed height let the bottom
 * items fall off the screen.
 */
export function keepOnScreen(el: HTMLElement | null | undefined, at: { x: number; y: number }, edge = 4) {
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    at.x = Math.max(edge, Math.min(at.x, window.innerWidth - width - edge))
    at.y = Math.max(edge, Math.min(at.y, window.innerHeight - height - edge))
}

/** How far down from its tip the pointer's arrow reaches, which a tip put under it has to clear. */
const ARROW = 24

/**
 * Puts a hover card by the pointer at (x, y) and never under it: above and to the right, clear by
 * `gap`. At the right edge it goes to the left of the pointer instead, and at the top below the arrow.
 * Measured as drawn, so call it after the render.
 */
export function placeTip(el: HTMLElement | null | undefined, x: number, y: number, gap = 16) {
    if (!el) return
    // Measured from the corner: left where it was last time, near an edge it would squeeze to fit.
    el.style.left = el.style.top = '0px'
    const { width, height } = el.getBoundingClientRect()
    const left = x + gap + width <= window.innerWidth - 4 ? x + gap : x - gap - width
    const top = y - gap - height >= 4 ? y - gap - height : y + ARROW + gap
    el.style.left = `${Math.max(4, left)}px`
    el.style.top = `${Math.max(4, Math.min(top, window.innerHeight - height - 4))}px`
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

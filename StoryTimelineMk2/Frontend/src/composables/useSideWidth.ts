import { ref } from 'vue'

/**
 * A left-hand panel you can drag wider, with a `.side-grip` strip beside it.
 *
 * Remembered per machine rather than per timeline: how wide a column of names wants to be is
 * about the monitor you are sitting at and how long your characters' names are, not about the
 * story — so `localStorage`, not `misc_settings`. A blocked or empty store just starts at
 * `fallback`; there is nothing here worth a dialog over.
 *
 * Only for a panel that starts at the left edge of the window, which is what lets the pointer's
 * own x be the width with nothing measured. Pointer capture rather than listeners on `window`, so
 * the drag survives the cursor crossing a canvas and ends itself if the window loses the pointer.
 *
 * ```
 * const { width, startResize } = useSideWidth('charactersSideWidth')
 * <aside :style="{ flexBasis: `${width}px` }"> … </aside>
 * <div class="side-grip" title="Drag to resize" @pointerdown="startResize" />
 * ```
 */
export function useSideWidth(key: string, fallback = 260, min = 200, max = 560) {
	const clamp = (n: number) => Math.min(max, Math.max(min, n))
	const width = ref(clamp(Number(localStorage.getItem(key)) || fallback))

	function startResize(e: PointerEvent) {
		const grip = e.currentTarget as HTMLElement
		grip.setPointerCapture(e.pointerId)
		const move = (m: PointerEvent) => { width.value = clamp(Math.round(m.clientX)) }
		grip.addEventListener('pointermove', move)
		grip.addEventListener('pointerup', () => {
			grip.removeEventListener('pointermove', move)
			localStorage.setItem(key, String(width.value))
		}, { once: true })
	}

	return { width, startResize }
}

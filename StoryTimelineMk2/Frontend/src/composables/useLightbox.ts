import { ref } from 'vue'

/**
 * Shared lightbox state + animated transition hooks.
 *
 * openLightbox(e, src, collection?)
 *   Pass an ordered array of URLs to enable prev/next navigation.
 *   Omit (or pass a single-element array) for a standalone image.
 *
 * Wire in template:
 *   <Transition :css="false" @before-enter="onLbBeforeEnter" @enter="onLbEnter"
 *               @before-leave="onLbBeforeLeave" @leave="onLbLeave">
 *     <LightboxOverlay v-if="lightboxSrc" :src="lightboxSrc"
 *         :has-prev="lightboxIndex > 0"
 *         :has-next="lightboxIndex < lightboxCollection.length - 1"
 *         @close="closeLightbox" @prev="lightboxPrev" @next="lightboxNext" />
 *   </Transition>
 */
export function useLightbox() {
    const lightboxSrc        = ref<string | null>(null)
    const lightboxOrigin     = ref<DOMRect | null>(null)
    const lightboxCollection = ref<string[]>([])
    const lightboxIndex      = ref(0)

    function openLightbox(e: MouseEvent, src: string, collection?: string[]) {
        lightboxOrigin.value     = (e.currentTarget as HTMLElement).getBoundingClientRect()
        lightboxCollection.value = collection ?? [src]
        lightboxIndex.value      = lightboxCollection.value.indexOf(src)
        if (lightboxIndex.value < 0) lightboxIndex.value = 0
        lightboxSrc.value = lightboxCollection.value[lightboxIndex.value]
    }

    function closeLightbox() {
        lightboxSrc.value = null
    }

    function lightboxPrev() {
        if (lightboxIndex.value > 0) {
            lightboxIndex.value--
            lightboxSrc.value = lightboxCollection.value[lightboxIndex.value]
        }
    }

    function lightboxNext() {
        if (lightboxIndex.value < lightboxCollection.value.length - 1) {
            lightboxIndex.value++
            lightboxSrc.value = lightboxCollection.value[lightboxIndex.value]
        }
    }

    // ── Transition hooks ─────────────────────────────────────────────────────
    // Scale from the thumbnail's viewport position on open; reverse on close.
    // :css="false" — Vue doesn't apply transition classes; done() called via setTimeout.

    function onLbBeforeEnter(el: Element) {
        const bd  = el as HTMLElement
        const img = bd.querySelector('img') as HTMLElement | null
        bd.style.opacity    = '0'
        bd.style.transition = 'none'
        if (img) {
            img.style.opacity    = '0'
            img.style.transform  = 'scale(0.05)'
            img.style.transition = 'none'
        }
    }

    function onLbEnter(el: Element, done: () => void) {
        const bd  = el as HTMLElement
        const img = bd.querySelector('img') as HTMLElement | null
        requestAnimationFrame(() => {
            if (img && lightboxOrigin.value) {
                const o  = lightboxOrigin.value
                // getBoundingClientRect on scale(0.05): visual center = natural center.
                const r  = img.getBoundingClientRect()
                const cx = (r.left + r.right)  / 2
                const cy = (r.top  + r.bottom) / 2
                // offsetWidth/Height are layout dimensions, unaffected by CSS transform.
                const ox = (o.left + o.width  / 2) - (cx - img.offsetWidth  / 2)
                const oy = (o.top  + o.height / 2) - (cy - img.offsetHeight / 2)
                img.style.transformOrigin = `${ox}px ${oy}px`
            }
            bd.style.transition = 'opacity 0.22s ease'
            bd.style.opacity    = '1'
            if (img) {
                img.style.transition = 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease'
                img.style.transform  = 'scale(1)'
                img.style.opacity    = '1'
            }
            setTimeout(done, 340)
        })
    }

    function onLbBeforeLeave(el: Element) {
        const img = (el as HTMLElement).querySelector('img') as HTMLElement | null
        if (img && lightboxOrigin.value) {
            const o = lightboxOrigin.value
            const r = img.getBoundingClientRect()  // scale(1) — r is the natural rect
            img.style.transformOrigin = `${o.left + o.width / 2 - r.left}px ${o.top + o.height / 2 - r.top}px`
        }
    }

    function onLbLeave(el: Element, done: () => void) {
        const bd  = el as HTMLElement
        const img = bd.querySelector('img') as HTMLElement | null
        requestAnimationFrame(() => {
            bd.style.transition = 'opacity 0.2s ease'
            bd.style.opacity    = '0'
            if (img) {
                img.style.transition = 'transform 0.2s ease, opacity 0.18s ease'
                img.style.transform  = 'scale(0.05)'
                img.style.opacity    = '0'
            }
            setTimeout(done, 220)
        })
    }

    return {
        lightboxSrc, lightboxOrigin, lightboxCollection, lightboxIndex,
        openLightbox, closeLightbox, lightboxPrev, lightboxNext,
        onLbBeforeEnter, onLbEnter, onLbBeforeLeave, onLbLeave,
    }
}

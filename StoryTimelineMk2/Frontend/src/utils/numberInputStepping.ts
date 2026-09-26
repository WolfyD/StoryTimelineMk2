// Chromium never steps <input type="number"> on the mouse wheel. One delegated listener per window
// steps the *focused* number input on wheel (respecting step/min/max) and swallows the event so the
// page / canvas behind does not scroll. Arrow keys go through the same path so every number input
// steps the same way regardless of how it is bound (v-model or :value + @change).
//
// The same installer also gives every <input type="range"> a right-click numeric field, because a
// slider is a lossy way to reach an exact number -- a 0-255 opacity track is a couple of hundred
// pixels wide, so single steps are a fight with the mouse. Delegated for the same reason: it reaches
// the sliders that exist and the ones added later, with nothing to remember at the call site.

function stepNumberInput(target: EventTarget | null, dir: 1 | -1): boolean {
  const el = target as HTMLInputElement | null
  if (!el || el.tagName !== 'INPUT' || el.type !== 'number' || el.disabled || el.readOnly || el.step === 'any') return false
  if (dir > 0) el.stepUp()
  else el.stepDown()
  // stepUp/stepDown set the value silently; fire what a typed edit would so v-model and @change react
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/**
 * A number field laid over the slider itself, so the value appears where the eye already is. Plain
 * DOM rather than a Vue component: this runs on all six entry points and outside any app.
 *
 * ponytail: one editor at a time, positioned once on open. A slider inside a panel that scrolls while
 * the field is open would leave it behind -- it commits on blur, and scrolling a panel takes the click
 * that blurs it, so the case closes itself.
 */
function openSliderEntry(slider: HTMLInputElement) {
  document.querySelector('.slider-entry')?.remove()

  const r = slider.getBoundingClientRect()
  const box = document.createElement('input')
  box.type = 'number'
  box.className = 'slider-entry'
  box.value = slider.value
  box.min = slider.min
  box.max = slider.max
  box.step = slider.step || '1'
  box.style.cssText = `position:fixed;left:${r.left}px;top:${r.top - 2}px;width:${Math.max(56, Math.min(r.width, 90))}px;z-index:99999`

  let done = false
  const close = (commit: boolean) => {
    if (done) return
    done = true
    // An empty field or a stray "-" is not a number; treat it as a cancel rather than writing NaN.
    const v = Number(box.value)
    if (commit && box.value.trim() !== '' && Number.isFinite(v)) {
      slider.value = String(v)   // the range input clamps to its own min/max for us
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    }
    box.remove()
  }

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); close(true) }
    else if (e.key === 'Escape') { e.preventDefault(); close(false) }
    e.stopPropagation()   // Escape here closes the field, not the modal the slider lives in
  })
  box.addEventListener('blur', () => close(true))

  document.body.appendChild(box)
  box.focus()
  box.select()
}

export function installNumberInputStepping(doc: Document = document) {
  doc.addEventListener('wheel', (e) => {
    if (e.target !== doc.activeElement || e.deltaY === 0) return
    if (e.ctrlKey || e.metaKey) return   // that wheel belongs to the zoom gesture, not the input
    if (stepNumberInput(e.target, e.deltaY < 0 ? 1 : -1)) e.preventDefault()
  }, { passive: false })

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (stepNumberInput(e.target, e.key === 'ArrowUp' ? 1 : -1)) e.preventDefault()
  })

  doc.addEventListener('contextmenu', (e) => {
    const el = e.target as HTMLInputElement | null
    if (!el || el.tagName !== 'INPUT' || el.type !== 'range' || el.disabled) return
    e.preventDefault()
    e.stopPropagation()   // canvases and panels here open menus of their own on right-click
    openSliderEntry(el)
  })
}

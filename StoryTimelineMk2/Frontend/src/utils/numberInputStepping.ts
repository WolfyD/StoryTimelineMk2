// Chromium never steps <input type="number"> on the mouse wheel. One delegated listener per window
// steps the *focused* number input on wheel (respecting step/min/max) and swallows the event so the
// page / canvas behind does not scroll. Arrow keys go through the same path so every number input
// steps the same way regardless of how it is bound (v-model or :value + @change).

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
}

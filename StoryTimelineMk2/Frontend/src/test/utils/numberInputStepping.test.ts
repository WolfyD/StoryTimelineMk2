import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installNumberInputStepping } from '@/utils/numberInputStepping'

function makeInput(attrs: Record<string, string>) {
  const el = document.createElement('input')
  el.type = 'number'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

describe('installNumberInputStepping', () => {
  installNumberInputStepping(document)   // once — listeners accumulate per call
  beforeEach(() => { document.body.innerHTML = '' })

  it('wheel on the focused number input steps it, fires input/change and swallows the event', () => {
    const el = makeInput({ value: '5', step: '1', max: '6' })
    const onChange = vi.fn()
    el.addEventListener('change', onChange)
    el.focus()

    const up = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    el.dispatchEvent(up)
    expect(el.value).toBe('6')
    expect(up.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    expect(el.value).toBe('6')   // max respected

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
    expect(el.value).toBe('5')
  })

  it('wheel on an unfocused number input scrolls the page instead', () => {
    const el = makeInput({ value: '5' })
    const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    expect(el.value).toBe('5')
    expect(ev.defaultPrevented).toBe(false)
  })

  it('arrow keys step by the step attribute', () => {
    const el = makeInput({ value: '1000', step: '1000' })
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(el.value).toBe('2000')
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(el.value).toBe('0')
  })

  // --- right-click numeric entry on sliders ---

  function makeSlider(attrs: Record<string, string> = {}) {
    const el = document.createElement('input')
    el.type = 'range'
    el.min = '0'; el.max = '255'
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.value = attrs.value ?? '6'   // after the attributes: a set property wins over a later attribute
    document.body.appendChild(el)
    return el
  }
  const entry = () => document.querySelector('.slider-entry') as HTMLInputElement | null
  const rightClick = (el: Element) =>
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

  it('right-clicking a slider opens a number field on its current value', () => {
    const s = makeSlider()
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    s.dispatchEvent(ev)
    expect(ev.defaultPrevented, 'the browser menu still opened').toBe(true)
    expect(entry()?.value).toBe('6')
    expect(entry()?.max).toBe('255')
  })

  it('Enter writes the typed number back and fires input/change', () => {
    const s = makeSlider()
    const onInput = vi.fn()
    s.addEventListener('input', onInput)
    rightClick(s)
    entry()!.value = '184'
    entry()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(s.value).toBe('184')
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(entry(), 'the field stayed open').toBeNull()
  })

  it('Escape leaves the slider alone, and a value past the end is clamped', () => {
    const s = makeSlider()
    rightClick(s)
    entry()!.value = '99'
    entry()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(s.value).toBe('6')
    expect(entry()).toBeNull()

    rightClick(s)
    entry()!.value = '9000'
    entry()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(s.value).toBe('255')
  })

  it('an empty field commits nothing, and only one field is ever open', () => {
    const a = makeSlider()
    const b = makeSlider({ value: '40' })
    rightClick(a)
    rightClick(b)
    expect(document.querySelectorAll('.slider-entry').length).toBe(1)
    expect(entry()?.value).toBe('40')
    entry()!.value = ''
    entry()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(b.value).toBe('40')
  })

  it('leaves a disabled slider to the browser', () => {
    const s = makeSlider({ disabled: '' })
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    s.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(entry()).toBeNull()
  })

  it('ignores text inputs', () => {
    const el = document.createElement('input')
    el.value = 'abc'
    document.body.appendChild(el)
    el.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    expect(el.value).toBe('abc')
    expect(ev.defaultPrevented).toBe(false)
  })
})

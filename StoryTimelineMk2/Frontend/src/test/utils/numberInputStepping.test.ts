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

import { describe, it, expect } from 'vitest'
import { placeTip } from '@/utils/modal'

describe('placeTip', () => {
  const tip = () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ width: 100, height: 40 }) as DOMRect
    return el
  }
  const at = (x: number, y: number) => {
    const el = tip()
    placeTip(el, x, y)
    return [el.style.left, el.style.top]
  }

  it('stands clear of the pointer: above and right, left at the right edge, below the arrow at the top', () => {
    const { innerWidth: w } = window
    expect(at(200, 300)).toEqual(['216px', '244px'])
    expect(at(w - 50, 300)).toEqual([`${w - 50 - 16 - 100}px`, '244px'])
    expect(at(200, 20)).toEqual(['216px', `${20 + 24 + 16}px`])
  })
})

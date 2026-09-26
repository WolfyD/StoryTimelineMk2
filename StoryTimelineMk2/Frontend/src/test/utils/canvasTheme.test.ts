import { describe, it, expect } from 'vitest'
import { textHalo } from '@/utils/canvasTheme'

describe('textHalo', () => {
  it('sends the halo the opposite way to the text', () => {
    expect(textHalo('#ffffff').shadowColor, 'a white label needs a dark halo').toBe('#000000')
    expect(textHalo('#000000').shadowColor, 'a black label needs a light halo').toBe('#ffffff')
  })

  it('weighs the channels rather than averaging them', () => {
    // Pure green reads far brighter than pure blue at the same channel value, which a flat average
    // would miss: both would land at 85/255 and take the same halo.
    expect(textHalo('#00ff00').shadowColor).toBe('#000000')
    expect(textHalo('#0000ff').shadowColor).toBe('#ffffff')
  })

  it('takes every hex length the presets hold, and ignores the alpha', () => {
    // A tick colour can arrive as #fff, #fffa, #ffffff or #ffffff88 -- the label's own transparency
    // does not change which way its halo should go.
    for (const hex of ['#fff', '#fffa', '#ffffff', '#ffffff88', 'ffffff'])
      expect(textHalo(hex).shadowColor, hex).toBe('#000000')
    for (const hex of ['#000', '#0000', '#000000', '#00000011'])
      expect(textHalo(hex).shadowColor, hex).toBe('#ffffff')
  })

  it('falls back to white-on-dark rather than throwing on nothing', () => {
    expect(textHalo('').shadowColor).toBe('#000000')
    expect(textHalo('#zzz').shadowColor, 'unparseable reads as black, so a light halo').toBe('#ffffff')
  })

  it('offsets nothing, so the halo sits under the glyphs', () => {
    const h = textHalo('#ffffff')
    expect([h.shadowOffsetX, h.shadowOffsetY]).toEqual([0, 0])
    expect(h.shadowBlur).toBeGreaterThan(0)
  })
})

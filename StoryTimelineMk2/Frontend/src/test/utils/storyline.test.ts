import { describe, it, expect } from 'vitest'
import { layoutStory, storyRuns } from '@/utils/storyline'

const stop = (locationId: string, from: number, to = from) => ({ locationId, from, to, title: '' })
const pinOf = (loc: string) => (loc === 'nowhere' ? null : loc)

describe('storyRuns', () => {
  it('is back where it was once the thing that interrupted it is over', () => {
    // A war at the keep from 0 to 100, and a council at the mill at 50.
    const runs = storyRuns([stop('keep', 0, 100), stop('mill', 50)], pinOf)
    expect(runs).toEqual([[
      { pin: 'keep', from: 0, to: 50 },
      { pin: 'mill', from: 50, to: 50 },
      { pin: 'keep', from: 50, to: 100 },
    ]])
  })

  it('makes one stay of the same place twice running, and breaks where this map has nothing', () => {
    const runs = storyRuns([stop('a', 0, 2), stop('a', 5), stop('nowhere', 8), stop('b', 9)], pinOf)
    expect(runs).toEqual([[{ pin: 'a', from: 0, to: 5 }], [{ pin: 'b', from: 9, to: 9 }]])
  })
})

describe('layoutStory', () => {
  it('puts two people at one place at once side by side, and reuses a lane once it is free', () => {
    const at = (pin: string, from: number, to: number) => ({ runs: [[{ pin, from, to }]] })
    const l = layoutStory([{ id: 'a' }, { id: 'b' }], [at('a', 0, 5), at('a', 5, 6), at('a', 7, 9), at('b', 0, 1)], 4, 10)
    // Three at a: the second arrives the moment the first leaves, so it cannot share; the third can.
    expect(l.rows).toEqual([{ top: 0, height: 18 }, { top: 18, height: 14 }])
    expect(l.ys.map(p => p[0]![0])).toEqual([7, 11, 7, 25])
  })
})

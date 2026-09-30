import { describe, it, expect } from 'vitest'
import { clockKey, listSections, followSection, type CastPerson } from '@/utils/mapCast'

const who = (id: string, name: string): CastPerson => ({ id, name, colour: '', next: false, prev: false })
const cast = [who('m', 'Mira'), who('c', 'Corin'), who('a', 'Ash')]
const section = (key: string, ids: string[]) => ({ key, label: key.toUpperCase(), ids, colour: null, own: false })

describe('listSections', () => {
  it('turns ids back into people, in the section order', () => {
    const out = listSections({ cast, sections: [section('x', ['c', 'm'])] }, '')
    expect(out[0]!.members.map(p => p.name)).toEqual(['Corin', 'Mira'])
  })

  it('drops a heading the search left empty', () => {
    const out = listSections({ cast, sections: [section('x', ['m']), section('y', ['a', 'c'])] }, ' cor')
    expect(out).toEqual([{ key: 'y', label: 'Y', colour: null, own: false, members: [cast[1]] }])
  })
})

describe('followSection', () => {
  it('unticking a section from the untouched list keeps everyone else', () => {
    expect(followSection(null, ['m', 'c', 'a'], ['c'], false)).toEqual(['m', 'a'])
  })

  it('ticking adds to what was already followed', () => {
    expect(followSection(['m'], ['m', 'c', 'a'], ['a'], true)).toEqual(['m', 'a'])
  })
})

describe('clockKey', () => {
  const on = (key: string, html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return clockKey({ key, target: host.firstElementChild } as unknown as KeyboardEvent)
  }

  it('lets the space past a focused handle but leaves it its arrows, and stays out of fields', () => {
    expect(on(' ', '<div role="slider"></div>')).toBe(' ')
    expect(on('ArrowLeft', '<div role="slider"></div>')).toBeNull()
    expect(on(' ', '<input>')).toBeNull()
    expect(on('ArrowRight', '<button></button>')).toBe('ArrowRight')
  })
})

import { describe, it, expect } from 'vitest'
import { groupCast, kinGroups, kinNames } from '@/utils/castGroups'
import { blankCharacter } from '@/utils/characterItems'
import { blankRelation } from '@/utils/characterRelations'
import type { CharacterItem, CharacterRelationship, MapEventCast, RelationshipType } from '@/types/models'

const FAMILY: RelationshipType = {
  Id: 'parent', Name: 'Parent / child', Type: 'family',
  AToB: 'parent of', BToA: 'child of',
  AToBF: null, AToBM: null, BToAF: null, BToAM: null, OneWay: 0,
}
const SOCIAL: RelationshipType = {
  Id: 'rival', Name: 'Rivals', Type: 'social',
  AToB: 'rival of', BToA: 'rival of',
  AToBF: null, AToBM: null, BToAF: null, BToAM: null, OneWay: 0,
}
const TYPES = [FAMILY, SOCIAL]

function person(id: string, first: string, last = ''): CharacterItem {
  return { ...blankCharacter(1), Id: id, FirstName: first, LastName: last, Name: `${first} ${last}`.trim() }
}

function tie(a: string, b: string, kind = 'parent'): CharacterRelationship {
  return { ...blankRelation(a, 1, kind), Character1Id: a, Character2Id: b }
}

const who = (id: string, name = id): MapEventCast => ({ CharacterId: id, Name: name, Color: null })

describe('kinGroups', () => {
  it('puts everyone joined by family under one key, however many steps apart', () => {
    // mira ─ corin ─ rhea: Mira and Rhea have no relation row between them at all.
    const kin = kinGroups([tie('mira', 'corin'), tie('corin', 'rhea')], TYPES)
    expect(kin.get('mira')).toBe(kin.get('rhea'))
    expect(kin.get('corin')).toBe(kin.get('mira'))
  })

  it('keeps two families apart', () => {
    const kin = kinGroups([tie('mira', 'corin'), tie('bren', 'tass')], TYPES)
    expect(kin.get('mira')).not.toBe(kin.get('bren'))
  })

  // Without this one rivalry between two houses folds both of them — and then, a hop at a time,
  // the whole cast — into a single group, which is the same as no grouping at all.
  it('does not let a rivalry marry two families together', () => {
    const kin = kinGroups([tie('mira', 'corin'), tie('bren', 'tass'), tie('corin', 'bren', 'rival')], TYPES)
    expect(kin.get('mira')).not.toBe(kin.get('bren'))
  })

  it('has nothing to say about someone with no family on record', () => {
    expect(kinGroups([tie('mira', 'corin')], TYPES).has('alone')).toBe(false)
  })

  it('survives a web that loops back on itself', () => {
    // Two families that married twice: every walk comes back round to where it started.
    const kin = kinGroups(
      [tie('a', 'b'), tie('b', 'c'), tie('c', 'd'), tie('d', 'a')],
      TYPES,
    )
    expect(new Set(kin.values()).size).toBe(1)
    expect(kin.size).toBe(4)
  })

  it('ignores a kind that was deleted rather than treating it as family', () => {
    expect(kinGroups([tie('mira', 'corin', 'gone')], TYPES).size).toBe(0)
  })
})

describe('kinNames', () => {
  const people = [person('mira', 'Mira', 'Vance'), person('corin', 'Corin', 'Vance'), person('rhea', 'Rhea', 'Ward')]

  it('names a family for the surname most of it shares, not whoever married in', () => {
    const kin = kinGroups([tie('mira', 'corin'), tie('corin', 'rhea')], TYPES)
    expect(kinNames(people, kin).get(kin.get('mira')!)).toBe('Vance')
  })

  it('falls back to a name when nobody in the family has a surname', () => {
    const kin = kinGroups([tie('mira', 'corin')], TYPES)
    const named = kinNames([person('mira', 'Mira'), person('corin', 'Corin')], kin)
    expect(named.get(kin.get('mira')!)).toMatch(/kin$/)
  })
})

describe('groupCast', () => {
  const cast = [who('mira', 'Mira'), who('bren', 'Bren'), who('corin', 'Corin')]
  const house = new Map([['mira', 'Vance'], ['corin', 'Vance']])

  it('sections the cast and keeps each section in the order it came in', () => {
    const groups = groupCast(cast, w => house.get(w.CharacterId) ?? '', 'No family')
    expect(groups.map(g => [g.label, g.members.map(m => m.CharacterId)])).toEqual([
      ['Vance', ['mira', 'corin']],
      ['No family', ['bren']],
    ])
  })

  // Whoever the label had nothing to say about goes last however early they turned up, or a single
  // stray name would push the family a reader is looking for down the list.
  it('puts the catch-all last however early its first member appeared', () => {
    const groups = groupCast([who('bren'), who('mira')], w => house.get(w.CharacterId) ?? '', 'No family')
    expect(groups.map(g => g.label)).toEqual(['Vance', 'No family'])
  })

  it('is one section when every name answers to the same label', () => {
    expect(groupCast(cast, () => 'On the map now').map(g => g.members.length)).toEqual([3])
  })

  it('has nothing to show for an empty cast', () => {
    expect(groupCast([], () => 'x')).toEqual([])
  })
})

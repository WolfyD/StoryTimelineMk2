import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import SessionChangesImportModal from '@/components/SessionChangesImportModal.vue'
import type { SessionChangePreview, SessionChangeEntryPreview } from '@/types/models'

function entry(overrides: Partial<SessionChangeEntryPreview> = {}): SessionChangeEntryPreview {
  return {
    id: overrides.id ?? 'item-1',
    op: 'update',
    title: 'The siege',
    collision: false,
    missingLocally: false,
    incoming: { title: 'The siege', when: '300', description: 'Theirs', tags: 'war', updatedAt: '' },
    local: { title: 'The siege', when: '300', description: 'Mine', tags: 'war', updatedAt: '2026-09-22 10:00:00' },
    ...overrides,
  }
}

function makePreview(entries: SessionChangeEntryPreview[]): SessionChangePreview {
  return {
    sourcePath: 'C:/tmp/changes.stlc',
    timelineTitle: 'Shared Story',
    exportedAt: '2026-09-22 11:00:00',
    targetTimelineId: 3,
    targetTimelineTitle: 'Shared Story',
    added: entries.filter((e) => e.op === 'insert').length,
    changed: entries.filter((e) => e.op === 'update').length,
    removed: entries.filter((e) => e.op === 'delete').length,
    collisions: entries.filter((e) => e.collision).length,
    entries,
  }
}

const open = (entries: SessionChangeEntryPreview[]) =>
  mount(SessionChangesImportModal, { props: { preview: makePreview(entries) } })

describe('SessionChangesImportModal', () => {
  it('takes every incoming change by default, naming none of them', async () => {
    const wrapper = open([entry({ id: 'a' }), entry({ id: 'b' })])

    expect(wrapper.find('[data-primary]').text()).toContain('Apply 2 changes')
    await wrapper.find('[data-primary]').trigger('click')

    // Only the kept rows travel; an empty map means "take the file's version for all of them".
    expect(wrapper.emitted('confirm')![0]).toEqual(['C:/tmp/changes.stlc', {}])
  })

  it('names the rows the user chose to keep, and drops them from the count', async () => {
    const wrapper = open([entry({ id: 'a' }), entry({ id: 'b' })])

    await wrapper.findAll('.picker input[value="local"]')[0]!.setValue()

    expect(wrapper.find('[data-primary]').text()).toContain('Apply 1 change')
    await wrapper.find('[data-primary]').trigger('click')
    expect(wrapper.emitted('confirm')![0]![1]).toEqual({ a: 'local' })
  })

  // "Local" on a row this copy has never seen is how you decline someone else's new item, so
  // the choice has to be offered there too.
  it('lets an item that is missing here be declined', async () => {
    const wrapper = open([entry({ id: 'a', op: 'insert', missingLocally: true, local: null })])

    expect(wrapper.text()).toContain('Not in this copy yet')
    expect(wrapper.find('.entry-meaning').text()).toBe('Add it to this copy')

    await wrapper.find('.picker input[value="local"]').setValue()
    expect(wrapper.find('.entry-meaning').text()).toBe('Leave it out — nothing is added here')
    expect(wrapper.find('[data-primary]').attributes('disabled')).toBeDefined()
  })

  it('spells out what each side means for a delete', async () => {
    const wrapper = open([entry({ id: 'a', op: 'delete', incoming: null })])

    expect(wrapper.find('.entry-meaning').text()).toBe('Delete it here as well')
    await wrapper.find('.picker input[value="local"]').setValue()
    expect(wrapper.find('.entry-meaning').text()).toBe('Leave my version exactly as it is')
  })

  it('compares the two versions side by side only where both sides moved', () => {
    const contested = entry({
      id: 'a',
      collision: true,
      incoming: { title: 'Their siege', when: '300', description: 'Theirs', tags: 'war', updatedAt: '' },
    })
    const wrapper = open([contested, entry({ id: 'b' })])

    expect(wrapper.findAll('.compare')).toHaveLength(1)
    expect(wrapper.find('.conflict-header').text()).toContain('1 item')
    // Title and description differ, `when` and `tags` do not.
    const diffLabels = wrapper.findAll('.compare .cell.diff .cell-label').map((c) => c.text())
    expect(new Set(diffLabels)).toEqual(new Set(['Title', 'Description']))
  })

  it('the bulk buttons move every row at once', async () => {
    const wrapper = open([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c', missingLocally: true, local: null })])

    const [takeAll, keepAll] = wrapper.findAll('.bulk-btn')
    await keepAll!.trigger('click')
    expect(wrapper.find('.bulk-tally').text()).toBe('0 of 3 will be applied')

    await takeAll!.trigger('click')
    expect(wrapper.find('.bulk-tally').text()).toBe('3 of 3 will be applied')
    expect(wrapper.find('[data-primary]').text()).toContain('Apply 3 changes')
  })

  // The two words the whole screen turns on: if they are not on screen, the user is guessing.
  it('says what incoming and local mean', () => {
    const wrapper = open([entry({ id: 'a' })])
    const explain = wrapper.find('.explain').text()
    expect(explain).toContain('the version in the file you are importing')
    expect(explain).toContain('what is in this copy right now')
  })

  it('will not apply nothing', async () => {
    const wrapper = open([entry({ id: 'a' })])
    await wrapper.findAll('.bulk-btn')[1]!.trigger('click')
    expect(wrapper.find('[data-primary]').attributes('disabled')).toBeDefined()
  })

  it('keeping everything local names every row, so the file changes nothing', async () => {
    const wrapper = open([entry({ id: 'a' }), entry({ id: 'b' })])
    await wrapper.findAll('.bulk-btn')[1]!.trigger('click')
    await wrapper.findAll('.picker input[value="incoming"]')[0]!.setValue()

    await wrapper.find('[data-primary]').trigger('click')
    expect(wrapper.emitted('confirm')![0]![1]).toEqual({ b: 'local' })
  })
})

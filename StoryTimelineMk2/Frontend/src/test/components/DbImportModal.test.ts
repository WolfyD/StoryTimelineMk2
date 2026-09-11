import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DbImportModal from '@/components/DbImportModal.vue'
import type { ImportPreview } from '@/types/models'

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourcePath: 'C:/test/export.sqlite',
    isV2: true,
    timelineCount: 2,
    itemCount: 84,
    conflictingTimelines: [],
    ...overrides,
  }
}

describe('DbImportModal', () => {
  it('renders modal title', () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    expect(wrapper.find('.modal-title').text()).toBe('Import Database')
  })

  it('displays shortened source path', () => {
    const preview = makePreview({ sourcePath: 'C:/test/export.sqlite' })
    const wrapper = mount(DbImportModal, { props: { preview } })
    expect(wrapper.find('.source-path').text()).toContain('export.sqlite')
  })

  it('truncates very long source paths', () => {
    const longPath = 'C:/' + 'a'.repeat(80) + '/export.sqlite'
    const preview = makePreview({ sourcePath: longPath })
    const wrapper = mount(DbImportModal, { props: { preview } })
    const text = wrapper.find('.source-path').text()
    expect(text.startsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(61)
  })

  it('shows V2 version label for v2 db', () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview({ isV2: true }) } })
    expect(wrapper.text()).toContain('V2 (current)')
  })

  it('shows V1 version label for legacy db', () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview({ isV2: false }) } })
    expect(wrapper.text()).toContain('V1 (legacy)')
  })

  it('shows timeline and item counts', () => {
    const preview = makePreview({ timelineCount: 3, itemCount: 150 })
    const wrapper = mount(DbImportModal, { props: { preview } })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('150')
  })

  it('shows no-conflict message when no conflicts', () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview({ conflictingTimelines: [] }) } })
    expect(wrapper.find('.no-conflict').exists()).toBe(true)
    expect(wrapper.find('.conflict-block').exists()).toBe(false)
  })

  it('shows conflict block when conflicts present', () => {
    const preview = makePreview({ conflictingTimelines: ['My Story', 'Another Story'] })
    const wrapper = mount(DbImportModal, { props: { preview } })
    expect(wrapper.find('.conflict-block').exists()).toBe(true)
    expect(wrapper.find('.no-conflict').exists()).toBe(false)
    expect(wrapper.text()).toContain('My Story')
    expect(wrapper.text()).toContain('Another Story')
  })

  it('conflict block message uses singular for one conflict', () => {
    const preview = makePreview({ conflictingTimelines: ['Only Timeline'] })
    const wrapper = mount(DbImportModal, { props: { preview } })
    expect(wrapper.find('.conflict-header').text()).toContain('1 timeline will be replaced')
  })

  it('conflict block message uses plural for multiple conflicts', () => {
    const preview = makePreview({ conflictingTimelines: ['A', 'B'] })
    const wrapper = mount(DbImportModal, { props: { preview } })
    expect(wrapper.find('.conflict-header').text()).toContain('2 timelines will be replaced')
  })

  it('emits close when Cancel is clicked', async () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close when backdrop is clicked', async () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    await wrapper.find('.modal-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close when X button is clicked', async () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits confirm with sourcePath when Import is clicked', async () => {
    const preview = makePreview({ sourcePath: 'C:/data/export.sqlite' })
    const wrapper = mount(DbImportModal, { props: { preview } })
    await wrapper.find('.btn-danger').trigger('click')
    const confirmed = wrapper.emitted('confirm')
    expect(confirmed).toHaveLength(1)
    expect(confirmed![0]).toEqual(['C:/data/export.sqlite'])
  })

  it('disables buttons and changes label while working', async () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    await wrapper.find('.btn-danger').trigger('click')
    expect(wrapper.find('.btn-danger').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn-cancel').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn-danger').text()).toBe('Importing…')
  })

  it('does not emit a second confirm when Import is clicked while working', async () => {
    const wrapper = mount(DbImportModal, { props: { preview: makePreview() } })
    const btn = wrapper.find('.btn-danger')
    await btn.trigger('click')
    await btn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})

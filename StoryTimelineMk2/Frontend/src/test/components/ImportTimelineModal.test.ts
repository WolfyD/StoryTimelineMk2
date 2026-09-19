import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ImportTimelineModal from '@/components/ImportTimelineModal.vue'
import type { TimelineImportPreview } from '@/types/models'

function makePreview(overrides: Partial<TimelineImportPreview> = {}): TimelineImportPreview {
  return {
    sourcePath: 'C:/test/timeline.zip',
    timelineTitle: 'Test Timeline',
    includeIds: false,
    hasMedia: false,
    itemCount: 15,
    mediaCount: 0,
    hasConflict: false,
    conflictingTimelineTitle: null,
    timelineId: null,
    ...overrides,
  }
}

describe('ImportTimelineModal', () => {
  it('renders modal title', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    expect(wrapper.find('.bm-title').text()).toBe('Import Timeline')
  })

  it('shows the timeline title', () => {
    const preview = makePreview({ timelineTitle: 'My Great Story' })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.text()).toContain('My Great Story')
  })

  it('shows item count', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview({ itemCount: 42 }) } })
    expect(wrapper.text()).toContain('42')
  })

  it('shows media row when hasMedia is true', () => {
    const preview = makePreview({ hasMedia: true, mediaCount: 7 })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('Media')
  })

  it('hides media row when hasMedia is false', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview({ hasMedia: false }) } })
    expect(wrapper.text()).not.toContain('Media')
  })

  it('shows badge-new mode when includeIds is false', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview({ includeIds: false }) } })
    expect(wrapper.find('.mode-badge.badge-new').exists()).toBe(true)
    expect(wrapper.find('.mode-badge').text()).toBe('New entry')
  })

  it('shows badge-replace mode when includeIds is true', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview({ includeIds: true }) } })
    expect(wrapper.find('.mode-badge.badge-replace').exists()).toBe(true)
    expect(wrapper.find('.mode-badge').text()).toBe('Restore (with IDs)')
  })

  it('shows conflict block when hasConflict and includeIds', () => {
    const preview = makePreview({
      hasConflict: true,
      includeIds: true,
      conflictingTimelineTitle: 'Old Timeline Name',
    })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.find('.conflict-block').exists()).toBe(true)
    expect(wrapper.find('.conflict-name').text()).toBe('Old Timeline Name')
  })

  it('does not show conflict block when hasConflict but not includeIds', () => {
    const preview = makePreview({ hasConflict: true, includeIds: false })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.find('.conflict-block').exists()).toBe(false)
  })

  it('shows no-conflict note when includeIds is false', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview({ includeIds: false }) } })
    expect(wrapper.find('.no-conflict').exists()).toBe(true)
  })

  it('confirm button says "Import" with no conflict', () => {
    const preview = makePreview({ hasConflict: false, includeIds: false })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.find('.btn-primary').text()).toBe('Import')
  })

  it('confirm button says "Replace & Import" with conflict and includeIds', () => {
    const preview = makePreview({ hasConflict: true, includeIds: true })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.find('.btn-danger').text()).toBe('Replace & Import')
  })

  it('confirm button uses btn-danger class when conflict + includeIds', () => {
    const preview = makePreview({ hasConflict: true, includeIds: true })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    expect(wrapper.find('.btn-danger').exists()).toBe(true)
    expect(wrapper.find('.btn-primary').exists()).toBe(false)
  })

  it('confirm button uses btn-primary class when no conflict', () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    expect(wrapper.find('.btn-primary').exists()).toBe(true)
    expect(wrapper.find('.btn-danger').exists()).toBe(false)
  })

  it('emits close when Cancel is clicked', async () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close when X button is clicked', async () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    await wrapper.find('.bm-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close on backdrop click', async () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    await wrapper.find('.bm-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits confirm with sourcePath when Import is clicked', async () => {
    const preview = makePreview({ sourcePath: 'C:/exports/my-timeline.zip' })
    const wrapper = mount(ImportTimelineModal, { props: { preview } })
    await wrapper.find('.btn-primary').trigger('click')
    const confirmed = wrapper.emitted('confirm')
    expect(confirmed).toHaveLength(1)
    expect(confirmed![0]).toEqual(['C:/exports/my-timeline.zip'])
  })

  it('disables buttons and changes label while working', async () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn-cancel').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn-primary').text()).toBe('Importing…')
  })

  it('does not emit a second confirm when clicked while working', async () => {
    const wrapper = mount(ImportTimelineModal, { props: { preview: makePreview() } })
    const btn = wrapper.find('.btn-primary')
    await btn.trigger('click')
    await btn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})

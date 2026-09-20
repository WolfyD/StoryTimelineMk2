import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@phosphor-icons/vue', () => ({ PhX: { template: '<span class="ph-icon-stub" />', name: 'PhX' } }))

import ShortcutsModal from '@/components/ShortcutsModal.vue'
import { SHORTCUTS } from '@/utils/shortcuts'

describe('ShortcutsModal', () => {
  it('puts the current window first and renders one kbd per chord part', () => {
    const w = mount(ShortcutsModal, { props: { context: 'edit' } })
    const titles = w.findAll('section h2').map(h => h.text())
    expect(titles).toEqual(['Edit item window', 'Timeline window', 'Calendar windows'])
    expect(w.find('section').classes()).toContain('sc-current')

    const saveRow = w.findAll('section.sc-current tr').find(r => r.text().includes('Save and close'))!
    expect(saveRow.findAll('kbd').map(k => k.text())).toEqual(['Ctrl', 'S'])
    w.unmount()
  })

  it('renders every registry entry exactly once', () => {
    const w = mount(ShortcutsModal, { props: { context: 'timeline' } })
    const rows = w.findAll('tr').filter(r => !r.classes().includes('sc-group'))
    expect(rows).toHaveLength(SHORTCUTS.length)
    expect(w.text()).toContain('Pan 3× faster')
    expect(w.text()).toContain('Esc leaves the field')
    w.unmount()
  })

  it('emits close from the modal', async () => {
    const w = mount(ShortcutsModal, { props: { context: 'calendar' } })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})

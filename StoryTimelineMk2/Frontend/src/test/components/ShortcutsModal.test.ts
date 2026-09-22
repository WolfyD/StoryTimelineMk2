import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@phosphor-icons/vue', () => ({ PhX: { template: '<span class="ph-icon-stub" />', name: 'PhX' } }))

// Remaps save through the bridge, which is not there in a test run.
const setMisc = vi.fn().mockResolvedValue({ status: 'ok' })
vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetMiscSetting: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
    SetMiscSetting: (...a: unknown[]) => setMisc(...a),
  },
}))

import ShortcutsModal from '@/components/ShortcutsModal.vue'
import { SHORTCUTS, keysOf, setShortcutOverrides, shortcutsFor } from '@/utils/shortcuts'

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

describe('ShortcutsModal — customise', () => {
  afterEach(() => { setShortcutOverrides({}); setMisc.mockClear() })

  const open = () => mount(ShortcutsModal, { props: { context: 'timeline' }, attachTo: document.body })
  const rowFor = (w: ReturnType<typeof open>, label: string) =>
    w.findAll('tr').find(r => r.text().includes(label))!
  const customise = async (w: ReturnType<typeof open>) => {
    await w.findAll('.sc-btn').find(b => b.text().startsWith('Customise'))!.trigger('click')
  }
  const press = (init: KeyboardEventInit & { key: string }) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

  it('only turns the remappable rows into buttons', async () => {
    const w = open()
    expect(w.findAll('button.sc-chords')).toHaveLength(0)
    await customise(w)
    const remappable = shortcutsFor('timeline').filter(sc => !sc.fixed).length
    expect(w.findAll('button.sc-chords')).toHaveLength(remappable)
    expect(rowFor(w, 'Pan 3× faster').find('button.sc-chords').exists()).toBe(false)
    w.unmount()
  })

  it('click a row, press a chord, and that is what the shortcut answers to', async () => {
    const w = open()
    await customise(w)
    const row = rowFor(w, 'New item — pick the type')
    await row.find('button.sc-chords').trigger('click')
    expect(row.text()).toContain('Press a key')

    press({ key: 'i', ctrlKey: true })
    await nextTick()
    expect(keysOf(shortcutsFor('timeline').find(sc => sc.id === 'addItem')!)).toEqual(['Ctrl+I'])
    expect(rowFor(w, 'New item — pick the type').findAll('kbd').map(k => k.text())).toEqual(['Ctrl', 'I'])
    expect(setMisc).toHaveBeenCalledOnce()
    w.unmount()
  })

  it('refuses a chord another shortcut already owns and keeps waiting', async () => {
    const w = open()
    await customise(w)
    await rowFor(w, 'Filter panel').find('button.sc-chords').trigger('click')

    press({ key: 't' })            // Tags
    await nextTick()
    expect(w.find('.sc-error').text()).toContain('Tags')
    expect(setMisc).not.toHaveBeenCalled()

    press({ key: 'q' })            // still capturing: the next press is taken
    await nextTick()
    expect(keysOf(shortcutsFor('timeline').find(sc => sc.id === 'filter')!)).toEqual(['Q'])
    w.unmount()
  })

  // Esc has to mean "stop capturing", not "close the list" — otherwise the modal vanishes the
  // moment you change your mind.
  it('Escape cancels the capture without closing the modal', async () => {
    const w = open()
    await customise(w)
    await rowFor(w, 'Tags').find('button.sc-chords').trigger('click')

    press({ key: 'Escape' })
    await nextTick()
    expect(w.emitted('close')).toBeUndefined()
    expect(w.text()).not.toContain('Press a key')

    press({ key: 'Escape' })       // no capture in progress: now it closes
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('Backspace puts a remapped shortcut back to its default', async () => {
    const w = open()
    await customise(w)
    await rowFor(w, 'Mini mode').find('button.sc-chords').trigger('click')
    press({ key: 'j', altKey: true })
    await nextTick()
    expect(rowFor(w, 'Mini mode').findAll('kbd').map(k => k.text())).toEqual(['Alt', 'J'])

    await rowFor(w, 'Mini mode').find('button.sc-chords').trigger('click')
    press({ key: 'Backspace' })
    await nextTick()
    expect(rowFor(w, 'Mini mode').findAll('kbd').map(k => k.text())).toEqual(['M'])
    w.unmount()
  })
})

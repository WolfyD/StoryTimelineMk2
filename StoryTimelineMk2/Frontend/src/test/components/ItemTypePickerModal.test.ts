import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@phosphor-icons/vue', () => {
  const cache = new Map<string, object>()
  const isIconKey = (prop: string | symbol): prop is string =>
    typeof prop === 'string' && prop !== 'then' && prop !== 'default' && prop !== '__esModule'
  return new Proxy({}, {
    get(_t, prop) {
      if (!isIconKey(prop)) return undefined
      if (!cache.has(prop)) cache.set(prop, { template: '<span class="ph-icon-stub" />', name: prop })
      return cache.get(prop)
    },
    has: (_t, prop) => isIconKey(prop),
  })
})

import ItemTypePickerModal from '@/components/ItemTypePickerModal.vue'

const press = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))

describe('ItemTypePickerModal', () => {
  it('lists the five types with digit and letter hints, Note on O', () => {
    const w = mount(ItemTypePickerModal, { props: { lastTypeId: null } })
    expect(w.findAll('.tp-choice').map(b => b.find('.tp-name').text())).toEqual(['Event', 'Period', 'Age', 'Picture', 'Note'])
    expect(w.findAll('.tp-choice')[4].findAll('kbd').map(k => k.text())).toEqual(['5', 'O'])
    expect(w.text()).toContain('N will repeat your last choice')
    w.unmount()
  })

  it('picks by letter, by digit or by click', async () => {
    const w = mount(ItemTypePickerModal, { props: { lastTypeId: null } })
    press('p')
    press('3')
    await w.findAll('.tp-choice')[3].trigger('click')
    expect(w.emitted('pick')).toEqual([[2], [3], [4]])
    w.unmount()
  })

  it('N repeats the last type and is a no-op when there is none; modifier chords are ignored', () => {
    const none = mount(ItemTypePickerModal, { props: { lastTypeId: null } })
    press('n')
    expect(none.emitted('pick')).toBeUndefined()
    none.unmount()

    const last = mount(ItemTypePickerModal, { props: { lastTypeId: 4 } })
    expect(last.find('.tp-choice--last .tp-name').text()).toBe('Picture')
    expect(last.text()).toContain('Picture, same as last time')
    press('p', { ctrlKey: true })
    expect(last.emitted('pick')).toBeUndefined()
    press('n')
    expect(last.emitted('pick')).toEqual([[4]])
    last.unmount()
  })
})

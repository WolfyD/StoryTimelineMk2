import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { chordOf, chordParts, isTextTarget, useShortcuts, useModalGuard, isModalOpen, SHORTCUTS, type ShortcutHandler } from '@/utils/shortcuts'

const key = (init: KeyboardEventInit & { key: string }) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })

describe('chordOf', () => {
  it('uppercases letters and orders modifiers Ctrl, Alt, Shift', () => {
    expect(chordOf(key({ key: 'f' }))).toBe('F')
    expect(chordOf(key({ key: 'a', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+A')
    expect(chordOf(key({ key: 'A', altKey: true, ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Alt+Shift+A')
  })
  it('drops Shift when it only produced the character (+, ?)', () => {
    expect(chordOf(key({ key: '+', shiftKey: true }))).toBe('+')
    expect(chordOf(key({ key: '?', shiftKey: true }))).toBe('?')
    expect(chordOf(key({ key: '-' }))).toBe('-')
  })
  it('treats Meta as Ctrl and names Space', () => {
    expect(chordOf(key({ key: ',', metaKey: true }))).toBe('Ctrl+,')
    expect(chordOf(key({ key: ' ' }))).toBe('Space')
    expect(chordOf(key({ key: 'ArrowLeft', shiftKey: true }))).toBe('Shift+ArrowLeft')
  })
})

describe('chordParts', () => {
  it('splits on + and keeps the + key itself', () => {
    expect(chordParts('Ctrl+Shift+A')).toEqual(['Ctrl', 'Shift', 'A'])
    expect(chordParts('+')).toEqual(['+'])
    expect(chordParts('Ctrl++')).toEqual(['Ctrl', '+'])
  })
  it('prettifies arrows and Esc', () => {
    expect(chordParts('Shift+ArrowLeft')).toEqual(['Shift', '←'])
    expect(chordParts('Escape')).toEqual(['Esc'])
    expect(chordParts('F2')).toEqual(['F2'])
  })
})

describe('isTextTarget', () => {
  const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild }
  it('text-ish fields are targets, buttons and checkboxes are not', () => {
    expect(isTextTarget(el('<input type="text">'))).toBe(true)
    expect(isTextTarget(el('<input type="number">'))).toBe(true)
    expect(isTextTarget(el('<textarea></textarea>'))).toBe(true)
    expect(isTextTarget(el('<select></select>'))).toBe(true)
    expect(isTextTarget(el('<input type="checkbox">'))).toBe(false)
    expect(isTextTarget(el('<button></button>'))).toBe(false)
    expect(isTextTarget(el('<div></div>'))).toBe(false)
    expect(isTextTarget(window)).toBe(false)
    expect(isTextTarget(null)).toBe(false)
  })
})

describe('SHORTCUTS registry', () => {
  it('has no duplicate chords within a context', () => {
    for (const ctx of ['timeline', 'edit', 'calendar'] as const) {
      const seen = new Set<string>()
      for (const s of SHORTCUTS.filter(s => s.context === ctx))
        for (const k of Array.isArray(s.keys) ? s.keys : [s.keys]) {
          expect(seen.has(k), `${ctx}: ${k} bound twice`).toBe(false)
          seen.add(k)
        }
    }
  })
})

describe('useShortcuts', () => {
  function host(handlers: Record<string, ShortcutHandler>) {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const Host = defineComponent({ setup() { useShortcuts('timeline', handlers); return () => h('div', [h('input', { id: 'txt', type: 'text' })]) } })
    const wrapper = mount(Host, { attachTo: root })
    const input = document.getElementById('txt') as HTMLInputElement
    return { wrapper, input, done: () => { wrapper.unmount(); root.remove() } }
  }

  it('fires the handler and prevents default outside text fields', () => {
    const filter = vi.fn()
    const { done } = host({ filter })
    const e = key({ key: 'f' })
    window.dispatchEvent(e)
    expect(filter).toHaveBeenCalledOnce()
    expect(e.defaultPrevented).toBe(true)
    done()
  })

  it('plain keys stay with a focused text field; Ctrl chords and F-keys still fire; inInputs:false never does', () => {
    const filter = vi.fn(), settings = vi.fn(), help = vi.fn(), undoDelete = vi.fn()
    const { input, done } = host({ filter, settings, help, undoDelete })
    input.dispatchEvent(key({ key: 'f' }))
    input.dispatchEvent(key({ key: ',', ctrlKey: true }))
    input.dispatchEvent(key({ key: 'F1' }))
    input.dispatchEvent(key({ key: 'z', ctrlKey: true }))
    expect(filter).not.toHaveBeenCalled()
    expect(settings).toHaveBeenCalledOnce()
    expect(help).toHaveBeenCalledOnce()
    expect(undoDelete).not.toHaveBeenCalled()
    done()
  })

  it('Esc in a text field blurs it and stops there', () => {
    const { input, done } = host({})
    input.focus()
    expect(document.activeElement).toBe(input)
    const e = key({ key: 'Escape' })
    input.dispatchEvent(e)
    expect(document.activeElement).not.toBe(input)
    expect(e.defaultPrevented).toBe(true)
    done()
  })

  it('auto-repeat only reaches repeat-able shortcuts', () => {
    const pan = vi.fn(), filter = vi.fn()
    const { done } = host({ pan, filter })
    window.dispatchEvent(key({ key: 'ArrowLeft', repeat: true }))
    window.dispatchEvent(key({ key: 'f', repeat: true }))
    expect(pan).toHaveBeenCalledOnce()
    expect(filter).not.toHaveBeenCalled()
    done()
  })

  it('a handler returning false leaves the default behaviour alone', () => {
    const { done } = host({ filter: () => false })
    const e = key({ key: 'f' })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    done()
  })

  it('an open modal switches shortcuts off until it unmounts', () => {
    const filter = vi.fn()
    const { done } = host({ filter })
    const Modal = defineComponent({ setup() { useModalGuard(); return () => h('div') } })
    const modal = mount(Modal)
    expect(isModalOpen()).toBe(true)
    window.dispatchEvent(key({ key: 'f' }))
    expect(filter).not.toHaveBeenCalled()
    modal.unmount()
    expect(isModalOpen()).toBe(false)
    window.dispatchEvent(key({ key: 'f' }))
    expect(filter).toHaveBeenCalledOnce()
    done()
  })

  it('unmounting removes the listener', () => {
    const filter = vi.fn()
    const { done } = host({ filter })
    done()
    window.dispatchEvent(key({ key: 'f' }))
    expect(filter).not.toHaveBeenCalled()
  })
})

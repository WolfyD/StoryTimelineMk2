import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    WindowGetMaximized: vi.fn().mockResolvedValue({ isMaximized: false }),
    WindowGetTopMost:   vi.fn().mockResolvedValue({ isTopmost: false }),
    WindowSetTopMost:   vi.fn(),
    WindowMinimize:     vi.fn(),
    WindowMaximizeRestore: vi.fn(),
    WindowClose:        vi.fn(),
    WindowStartDrag:    vi.fn(),
  },
}))

import WindowTitleBar from '@/components/WindowTitleBar.vue'
import { BackendAPI } from '@/bridge/api'

describe('WindowTitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(BackendAPI.WindowGetMaximized as ReturnType<typeof vi.fn>).mockResolvedValue({ isMaximized: false })
    ;(BackendAPI.WindowGetTopMost as ReturnType<typeof vi.fn>).mockResolvedValue({ isTopmost: false })
  })

  function mountBar(props = {}) {
    return mount(WindowTitleBar, {
      props: { title: 'Test Window', showMaximize: true, ...props },
    })
  }

  // ── Initial state ──────────────────────────────────────────────────────────

  it('calls WindowGetTopMost on mount and reflects the result', async () => {
    ;(BackendAPI.WindowGetTopMost as ReturnType<typeof vi.fn>).mockResolvedValue({ isTopmost: true })

    const wrapper = mountBar()
    await flushPromises()

    expect(BackendAPI.WindowGetTopMost).toHaveBeenCalledOnce()
    const pinBtn = wrapper.find('.tb-btn--pin')
    expect(pinBtn.classes()).toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  it('pin button is not active when WindowGetTopMost returns false', async () => {
    const wrapper = mountBar()
    await flushPromises()

    const pinBtn = wrapper.find('.tb-btn--pin')
    expect(pinBtn.classes()).not.toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  // ── toggleTopmost ──────────────────────────────────────────────────────────

  it('clicking the pin button calls WindowSetTopMost(true) and marks button active', async () => {
    const wrapper = mountBar()
    await flushPromises()

    const pinBtn = wrapper.find('.tb-btn--pin')
    await pinBtn.trigger('click')

    expect(BackendAPI.WindowSetTopMost).toHaveBeenCalledWith(true)
    expect(pinBtn.classes()).toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  it('clicking pin button twice toggles back to false', async () => {
    const wrapper = mountBar()
    await flushPromises()

    const pinBtn = wrapper.find('.tb-btn--pin')
    await pinBtn.trigger('click')
    await pinBtn.trigger('click')

    const calls = (BackendAPI.WindowSetTopMost as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBe(true)
    expect(calls[1][0]).toBe(false)
    expect(pinBtn.classes()).not.toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  // ── TopMostChanged push ────────────────────────────────────────────────────

  it('onTopMostPush updates isTopmost when action is TopMostChanged', async () => {
    const wrapper = mountBar()
    await flushPromises()

    // Retrieve the listener registered on webview
    const addSpy = window.chrome.webview.addEventListener as ReturnType<typeof vi.fn>
    const call = addSpy.mock.calls.find(([evt]: [string]) => evt === 'message')
    expect(call).toBeDefined()

    const handler = call![1]
    handler({ data: { action: 'TopMostChanged', payload: { isTopmost: true } } })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tb-btn--pin').classes()).toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  it('ignores push messages with a different action', async () => {
    const wrapper = mountBar()
    await flushPromises()

    const addSpy = window.chrome.webview.addEventListener as ReturnType<typeof vi.fn>
    const handler = addSpy.mock.calls.find(([evt]: [string]) => evt === 'message')![1]
    handler({ data: { action: 'SomethingElse', payload: { isTopmost: true } } })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tb-btn--pin').classes()).not.toContain('tb-btn--pin-active')

    wrapper.unmount()
  })

  // ── Listener cleanup ───────────────────────────────────────────────────────

  it('removes the message listener on unmount', async () => {
    const wrapper = mountBar()
    await flushPromises()

    const removeSpy = window.chrome.webview.removeEventListener as ReturnType<typeof vi.fn>
    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })

  // ── pin icon class ─────────────────────────────────────────────────────────

  it('shows ri-pushpin-line icon when not pinned', async () => {
    const wrapper = mountBar()
    await flushPromises()

    expect(wrapper.find('.tb-btn--pin i').classes()).toContain('ri-pushpin-line')
    wrapper.unmount()
  })

  it('shows ri-pushpin-fill icon when pinned', async () => {
    ;(BackendAPI.WindowGetTopMost as ReturnType<typeof vi.fn>).mockResolvedValue({ isTopmost: true })

    const wrapper = mountBar()
    await flushPromises()

    expect(wrapper.find('.tb-btn--pin i').classes()).toContain('ri-pushpin-fill')
    wrapper.unmount()
  })
})

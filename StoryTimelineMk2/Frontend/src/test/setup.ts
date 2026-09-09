import { vi } from 'vitest'

// Mock window.chrome.webview (WebView2 bridge not available in test env)
Object.defineProperty(window, 'chrome', {
  value: {
    webview: {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  },
  writable: true,
})

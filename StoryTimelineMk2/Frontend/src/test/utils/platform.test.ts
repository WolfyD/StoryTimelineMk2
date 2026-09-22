import { describe, it, expect, vi, afterEach } from 'vitest'

// The constants are read once at import, so each platform needs its own module instance.
async function platformOn(id: string) {
	vi.stubGlobal('navigator', { platform: id, userAgent: id })
	vi.resetModules()
	return await import('@/utils/platform')
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('platform', () => {
	it('calls the folder window what the machine calls it', async () => {
		expect((await platformOn('MacIntel')).FILE_MANAGER).toBe('Finder')
		expect((await platformOn('Win32')).FILE_MANAGER).toBe('Explorer')
		expect((await platformOn('Linux x86_64')).FILE_MANAGER).toBe('your file manager')
	})

	it('reads an iPad as a Mac and nothing else as one', async () => {
		expect((await platformOn('iPad')).IS_MAC).toBe(true)
		expect((await platformOn('Win32')).IS_MAC).toBe(false)
		expect((await platformOn('Linux x86_64')).IS_MAC).toBe(false)
	})
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as browserHost from '@/bridge/browserHost'

/**
 * The browser's stand-in for the WinForms host (BL-68 phase 3). These cover the routing:
 * which action becomes a window, a picker, an upload or a download.
 */

const opened: { closed: boolean }[] = []

function fakeWindow() {
	const w = { closed: false, focus: vi.fn(), close: vi.fn(), postMessage: vi.fn(), location: { replace: vi.fn() } }
	opened.push(w)
	return w
}

let openSpy: ReturnType<typeof vi.fn>
let backend: ReturnType<typeof vi.fn>

beforeEach(() => {
	// The shim reuses a window it still holds; retire the previous test's so each starts fresh.
	for (const w of opened.splice(0)) w.closed = true
	openSpy = vi.fn(() => fakeWindow())
	vi.stubGlobal('open', openSpy)
	backend = vi.fn().mockResolvedValue({ status: 'ok' })
	browserHost.useBackend(backend as never)
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('browserHost routing', () => {
	it('claims the host actions and leaves the data actions to the backend', () => {
		expect(browserHost.handles('OpenAddEditItemWindow')).toBe(true)
		expect(browserHost.handles('WindowMaximizeRestore')).toBe(true)
		expect(browserHost.handles('ExportFullDB')).toBe(true)
		expect(browserHost.handles('GetTimelineData')).toBe(false)
		expect(browserHost.handles('SaveItem')).toBe(false)
	})

	it('rejects instead of throwing when a handler fails, so the caller sees it', async () => {
		openSpy.mockReturnValue(null) // the browser blocked the pop-up
		await expect(browserHost.run('OpenAddEditItemWindow', { timelineId: 1, itemId: 'i1' })).rejects.toThrow(/pop-ups/i)
	})
})

describe('windows', () => {
	it('opens the edit window with the same query string the host builds', async () => {
		await browserHost.run('OpenAddEditItemWindow', { timelineId: 3, typeId: 2, year: 1500, granularity: 4 })
		const [url] = openSpy.mock.calls[0]!
		expect(url).toBe('editItem.html?timelineId=3&typeId=2&year=1500&granularity=4')
	})

	it('reuses the open edit window and leaves out the new-item fields', async () => {
		const popup = fakeWindow()
		openSpy.mockReturnValue(popup)
		await browserHost.run('OpenAddEditItemWindow', { timelineId: 3, typeId: 1 })

		await browserHost.run('OpenAddEditItemWindow', { timelineId: 3, itemId: 'abc' })

		// Second open steers the window that is already there, the way the host reuses its form.
		expect(openSpy).toHaveBeenCalledTimes(1)
		expect(popup.location.replace).toHaveBeenCalledWith('editItem.html?timelineId=3&itemId=abc')
		expect(popup.focus).toHaveBeenCalled()
	})

	it('toggles the year calendar the way the host window does', async () => {
		const popup = fakeWindow()
		openSpy.mockReturnValue(popup)

		expect(await browserHost.run('OpenYearCalendarWindow', { timelineId: 1, calendarId: 'c1' }))
			.toEqual({ status: 'opened' })
		expect(await browserHost.run('OpenYearCalendarWindow', { timelineId: 1, calendarId: 'c1' }))
			.toEqual({ status: 'closed' })
		expect(popup.close).toHaveBeenCalled()
	})

	it('pushes the year into the open calendar window', async () => {
		const popup = fakeWindow()
		openSpy.mockReturnValue(popup)
		await browserHost.run('OpenYearCalendarWindow', { timelineId: 1, calendarId: 'c1' })

		await browserHost.run('SetCalendarYear', { year: 1200 })

		expect(popup.postMessage).toHaveBeenCalledWith(
			{ __storytimeline: true, action: 'SetCalendarYear', payload: { year: 1200 } },
			location.origin
		)
	})
})

describe('window chrome', () => {
	it('reports fullscreen as the browser is maximised', async () => {
		expect(await browserHost.run('WindowGetMaximized', {})).toEqual({ isMaximized: false })
	})

	it('has no always-on-top to report', async () => {
		expect(await browserHost.run('WindowGetTopMost', {})).toEqual({ isTopmost: false })
	})
})

describe('fonts', () => {
	it('falls back to the web-safe list when the browser has no local font access', async () => {
		const fonts = (await browserHost.run('GetSystemFonts', {})) as string[]
		expect(fonts).toContain('Segoe UI')
		expect(fonts).toContain('monospace')
	})

	it('uses queryLocalFonts when the user granted it', async () => {
		vi.stubGlobal('queryLocalFonts', vi.fn().mockResolvedValue([{ family: 'Fira Code' }, { family: 'Fira Code' }]))
		expect(await browserHost.run('GetSystemFonts', {})).toEqual(['Fira Code'])
	})
})

describe('export', () => {
	it('posts the bridge message to /export and saves what comes back', async () => {
		const click = vi.fn()
		vi.spyOn(document, 'createElement').mockReturnValue({ click, href: '', download: '' } as never)
		vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: { get: () => 'My%20Timeline.stlm' },
			blob: async () => new Blob(['zip']),
		})
		vi.stubGlobal('fetch', fetchMock)

		const result = await browserHost.run('ExportTimeline', { id: 4, includeIds: true, includeMedia: false })

		const [url, init] = fetchMock.mock.calls[0]!
		expect(url).toBe('/export')
		expect(JSON.parse(init.body)).toEqual({
			action: 'ExportTimeline',
			payload: { id: 4, includeIds: true, includeMedia: false },
		})
		expect(click).toHaveBeenCalled()
		expect(result).toEqual({ status: 'ok', path: 'My Timeline.stlm' })
	})

	it('fails loudly when the server refuses', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }))
		await expect(browserHost.run('ExportFullDB', {})).rejects.toThrow(/500 boom/)
	})
})

describe('import', () => {
	it('uploads the picked file and hands its path to the data action', async () => {
		const file = new File(['db'], 'backup.sqlite')
		const input = { type: '', accept: '', multiple: false, style: {}, files: [file], remove: vi.fn(), click: vi.fn(), addEventListener: vi.fn() }
		// Fire `change` as soon as the picker is clicked.
		input.click = vi.fn(() => {
			const change = input.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'change')![1] as () => void
			change()
		})
		vi.spyOn(document, 'createElement').mockReturnValue(input as never)
		vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'C:/tmp/abc.sqlite' }) }))

		await browserHost.run('BrowseAndPreviewImport', {})

		expect(backend).toHaveBeenCalledWith('PreviewImportDb', { path: 'C:/tmp/abc.sqlite' })
	})

	it('reports a cancelled picker without calling the backend', async () => {
		const input = { type: '', accept: '', multiple: false, style: {}, files: [], remove: vi.fn(), click: vi.fn(), addEventListener: vi.fn() }
		input.click = vi.fn(() => {
			const cancel = input.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'cancel')![1] as () => void
			cancel()
		})
		vi.spyOn(document, 'createElement').mockReturnValue(input as never)
		vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)

		expect(await browserHost.run('ImportCalendar', {})).toEqual({ status: 'cancelled' })
		expect(backend).not.toHaveBeenCalled()
	})
})

/**
 * The browser's stand-in for the WinForms host (BL-68 phase 3).
 *
 * Everything the desktop app does with a window, a file dialog or the shell arrives here as
 * the same bridge action, and leaves as a tab, an `<input type="file">` or an HTTP call. The
 * rest of the app never learns which host it is running on — it calls BackendAPI either way.
 *
 * Only reached when `window.chrome.webview` is absent; see api.ts.
 */

import { IS_MAC, IS_WINDOWS, FILE_MANAGER } from '@/utils/platform'

type Payload = Record<string, unknown>
type RawRequest = <T>(action: string, payload?: unknown) => Promise<T>

/**
 * The transport's own request(), injected by api.ts. It bypasses this shim, so a handler can
 * call a real backend action without routing straight back into itself.
 */
let backend: RawRequest = () =>
	Promise.reject(new Error('[Bridge] The browser host was used before the transport was ready.'))

export function useBackend(request: RawRequest) {
	backend = request
}

// ── Windows ────────────────────────────────────────────────────────────────
// A WinForms window is a tab. Named, so re-opening the same kind of window reuses it the way
// the singleton forms do rather than littering the screen.

const popups = new Map<string, Window>()

function openPopup(name: string, url: string, width: number, height: number): Window {
	const existing = popups.get(name)
	if (existing && !existing.closed) {
		existing.location.replace(url)
		existing.focus()
		return existing
	}
	const opened = window.open(url, name, `popup=yes,width=${width},height=${height}`)
	if (!opened) throw new Error('The browser blocked the window. Allow pop-ups for this page and try again.')
	popups.set(name, opened)
	return opened
}

/** Polling is the only way a browser reports that someone closed a pop-up. */
function whenClosed(popup: Window, then: () => void) {
	const timer = window.setInterval(() => {
		if (!popup.closed) return
		window.clearInterval(timer)
		then()
	}, 500)
}

/** Delivers a push into this page the way the socket would, so api.ts routes it as usual. */
function pushToSelf(action: string, payload: unknown) {
	window.postMessage({ __storytimeline: true, action, payload }, location.origin)
}

function pushTo(target: Window, action: string, payload: unknown) {
	target.postMessage({ __storytimeline: true, action, payload }, location.origin)
}

function query(parts: Record<string, string | number | boolean | null | undefined>): string {
	const pairs = Object.entries(parts)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
	return pairs.length ? `?${pairs.join('&')}` : ''
}

// ── Files ──────────────────────────────────────────────────────────────────

/** Resolves to [] when the user cancels. */
function pickFiles(accept: string, multiple = false): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = accept
		input.multiple = multiple
		input.style.display = 'none'
		document.body.appendChild(input)

		const finish = (files: File[]) => {
			input.remove()
			resolve(files)
		}
		input.addEventListener('change', () => finish([...(input.files ?? [])]))
		// Chromium/Firefox fire this when the dialog is dismissed. Without it a cancelled
		// picker would leave the caller's promise pending until the bridge's 30s timeout.
		input.addEventListener('cancel', () => finish([]))
		input.click()
	})
}

/** Hands the bytes to the server and gets back the path the import actions expect. */
async function upload(file: File): Promise<string> {
	const response = await fetch(`/upload?name=${encodeURIComponent(file.name)}`, {
		method: 'POST',
		body: file,
	})
	if (!response.ok) {
		throw new Error(`Upload of '${file.name}' failed: ${response.status} ${await response.text()}`)
	}
	const { path } = (await response.json()) as { path: string }
	return path
}

/** Runs an export on the server and saves the result through the browser's own download. */
async function download(action: string, payload: Payload): Promise<{ status: string; path?: string }> {
	const response = await fetch('/export', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, payload }),
	})
	if (!response.ok) {
		throw new Error(`${action} failed: ${response.status} ${await response.text()}`)
	}

	const name = decodeURIComponent(response.headers.get('X-Export-Filename') ?? 'export')
	const url = URL.createObjectURL(await response.blob())
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	URL.revokeObjectURL(url)
	return { status: 'ok', path: name }
}

/** Picks one file, uploads it, and runs a path-based backend action on it. */
async function pickUploadThen<T>(accept: string, action: string, extra: Payload = {}): Promise<T | { status: string }> {
	const [file] = await pickFiles(accept)
	if (!file) return { status: 'cancelled' }
	return await backend<T>(action, { ...extra, path: await upload(file) })
}

// ── Fonts ──────────────────────────────────────────────────────────────────

/**
 * What a browser can offer instead of enumerating the OS font list. queryLocalFonts() gives
 * the real list where the user grants it; this is the fallback, and it has to name families
 * the machine actually has — a Mac has no Segoe UI and a Linux box has neither set.
 */
const COMMON_FONTS = [
	'Arial', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Times New Roman',
	'Trebuchet MS', 'Verdana',
]
const WINDOWS_FONTS = [
	'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel',
	'Franklin Gothic Medium', 'Gabriola', 'Lucida Console', 'Lucida Sans Unicode',
	'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Tahoma',
]
const MAC_FONTS = [
	'American Typewriter', 'Avenir', 'Baskerville', 'Chalkboard', 'Charter', 'Futura',
	'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Menlo', 'Monaco',
	'Optima', 'Palatino', 'Papyrus', 'Zapfino',
]
// What fontconfig has shipped for years, plus the metric-compatible Liberation set.
const LINUX_FONTS = [
	'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'FreeMono', 'FreeSans',
	'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans',
	'Noto Serif', 'Ubuntu', 'Ubuntu Mono',
]
const GENERIC_FONTS = ['cursive', 'monospace', 'sans-serif', 'serif']

const WEB_SAFE_FONTS = [
	...COMMON_FONTS,
	...(IS_MAC ? MAC_FONTS : IS_WINDOWS ? WINDOWS_FONTS : LINUX_FONTS),
	...GENERIC_FONTS,
].sort()

async function systemFonts(): Promise<string[]> {
	const queryLocalFonts = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> })
		.queryLocalFonts
	if (typeof queryLocalFonts !== 'function') return WEB_SAFE_FONTS
	try {
		const families = [...new Set((await queryLocalFonts.call(window)).map((f) => f.family))].sort()
		return families.length ? families : WEB_SAFE_FONTS
	} catch (err) {
		// Declined or unavailable: the fixed list still lets the user pick something.
		console.warn('[Browser Host] Local font access denied, falling back to the web-safe list.', err)
		return WEB_SAFE_FONTS
	}
}

// ── Window chrome ──────────────────────────────────────────────────────────
// A tab has no title bar to drive. Fullscreen is the honest reading of "maximize"; minimize
// and always-on-top have no browser equivalent at all.

function toggleFullscreen() {
	// No await before this call: fullscreen needs the click that got us here.
	const promise = document.fullscreenElement
		? document.exitFullscreen()
		: document.documentElement.requestFullscreen()
	promise.catch((err) => console.warn('[Browser Host] Fullscreen refused by the browser.', err))
}

function closeWindow() {
	if (window.opener) {
		window.close()
		return
	}
	// The desktop app shows the project list again when a timeline window closes.
	if (!location.pathname.endsWith('/') && !location.pathname.endsWith('index.html')) {
		location.href = 'index.html'
		return
	}
	window.close()
}

/** Fire-and-forget actions a browser simply cannot do; saying so beats a silent no-op. */
async function showFolderPath(which: 'DataRoot' | 'BackupsFolder', label: string) {
	const config = await backend<Record<string, string>>('GetAppConfig', {})
	window.alert(`${label}:\n\n${config[which]}\n\nA web page cannot open a folder — copy the path into ${FILE_MANAGER}.`)
}

// ── The actions ────────────────────────────────────────────────────────────

const handlers: Record<string, (payload: Payload) => unknown> = {
	// Windows
	OpenTimeline: (p) => {
		const url = `timeline.html${query({
			id: p.id as number,
			readOnly: p.readOnly ? 1 : null,
			characterId: (p.characterId as string) ?? null,   // BL-15 phase 3: the appearances window
		})}`
		// A reference timeline is meant to sit beside the one that opened it; a normal open
		// replaces the project list, the way the desktop app hides it.
		if (p.readOnly) openPopup('storytimeline-reference', url, 1200, 800)
		else location.href = url
	},

	OpenAddEditItemWindow: (p) => {
		const url = `editItem.html${query(
			p.itemId
				? { timelineId: p.timelineId as number, itemId: p.itemId as string }
				: {
						timelineId: p.timelineId as number,
						typeId: (p.typeId as number) ?? 1,
						year: p.year as number | undefined,
						granularity: p.granularity as number | undefined,
					},
		)}`
		openPopup('storytimeline-edit-item', url, 1100, 850)
	},

	OpenCalendarEditorWindow: (p) => {
		const popup = openPopup(
			'storytimeline-calendar',
			`calendar.html${query({ calendarId: p.calendarId as string | undefined })}`,
			1250,
			900,
		)
		// Saving closes the editor, so its closing is the opener's "the list may have changed".
		whenClosed(popup, () => pushToSelf('CalendarsChanged', {}))
	},

	OpenCharactersWindow: (p) => {
		// Re-opening the same named window navigates it, so the character rides the query string
		// here rather than needing the broadcast the desktop host uses.
		openPopup(
			'storytimeline-characters',
			`characters.html${query({ timelineId: p.timelineId as number, characterId: p.characterId as string })}`,
			1200,
			860,
		)
	},

	OpenYearCalendarWindow: (p) => {
		const open = popups.get('storytimeline-year-calendar')
		if (open && !open.closed) {
			open.close()
			popups.delete('storytimeline-year-calendar')
			return { status: 'closed' }
		}
		const popup = openPopup(
			'storytimeline-year-calendar',
			`yearCalendar.html${query({
				timelineId: p.timelineId as number,
				calendarId: p.calendarId as string | undefined,
			})}`,
			1000,
			800,
		)
		whenClosed(popup, () => pushToSelf('YearCalendarClosed', {}))
		return { status: 'opened' }
	},

	SetCalendarYear: (p) => {
		const popup = popups.get('storytimeline-year-calendar')
		if (popup && !popup.closed) pushTo(popup, 'SetCalendarYear', { year: p.year })
	},

	// Window chrome
	WindowMinimize: () => {},
	WindowStartDrag: () => {},
	WindowMaximizeRestore: () => toggleFullscreen(),
	WindowGetMaximized: () => ({ isMaximized: !!document.fullscreenElement }),
	WindowClose: () => closeWindow(),
	WindowGetTopMost: () => ({ isTopmost: false }),
	WindowSetTopMost: () => {},

	// Exports — the browser saves the file the server produces.
	ExportTimeline: (p) => download('ExportTimeline', p),
	ExportFullDB: (p) => download('ExportFullDB', p),
	ExportCalendar: (p) => download('ExportCalendar', p),
	ExportSessionChanges: (p) => download('ExportSessionChanges', p),

	// Imports — the page picks the file, the server reads it from where it was uploaded.
	ImportCalendar: () => pickUploadThen('.json,application/json', 'ImportCalendarFile'),
	BrowseAndPreviewImport: () => pickUploadThen('.sqlite,.db,.db3,.sql,.sqlite3,.stlm', 'PreviewImportDb'),
	BrowseAndPreviewTimelineImport: () => pickUploadThen('.stlm', 'PreviewTimelineImport'),
	BrowseAndPreviewSessionChanges: () => pickUploadThen('.stlc,application/json', 'PreviewSessionChanges'),

	ImportDB: async () => {
		const preview = await pickUploadThen<{ status: string; preview?: { timelineCount: number; itemCount: number; sourcePath: string } }>(
			'.sqlite,.db,.db3,.sql,.sqlite3,.stlm',
			'PreviewImportDb',
		)
		if (!('preview' in preview) || !preview.preview) return preview
		const { timelineCount, itemCount, sourcePath } = preview.preview
		const go = window.confirm(`Import ${timelineCount} timeline(s) and ${itemCount} item(s) from this file?`)
		return go ? await backend('ExecuteImportDB', { path: sourcePath }) : { status: 'cancelled' }
	},

	SetCharacterPortrait: async (p) => {
		const files = await pickFiles('image/*', false)
		if (!files.length) return { status: 'cancelled' }
		const path = await upload(files[0]!)
		return await backend('SetCharacterPortraitFromPath', { characterId: p.characterId, path })
	},

	AddImageToItem: async (p) => {
		const files = await pickFiles('image/*', true)
		if (!files.length) return { status: 'cancelled' }
		const paths = await Promise.all(files.map(upload))
		return await backend('AddImagesToItem', { itemId: p.itemId, paths })
	},

	// Shell
	OpenExternalUrl: (p) => {
		window.open(p.url as string, '_blank', 'noopener,noreferrer')
	},
	OpenDataFolder: () => showFolderPath('DataRoot', 'Data folder'),
	OpenBackupsFolder: () => showFolderPath('BackupsFolder', 'Backups folder'),

	BrowseDataFolder: () => {
		// A file picker hands out a handle, never a path, so the server could not use the
		// answer. Changing the data folder stays a desktop action.
		window.alert(
			'Choosing a data folder is only possible in the desktop app.\n\n' +
				'Start the server with STORYTIMELINE_DATA_ROOT set to use a different folder.',
		)
		return { path: null }
	},

	GetSystemFonts: () => systemFonts(),
}

export function handles(action: string): boolean {
	return Object.hasOwn(handlers, action)
}

export function run(action: string, payload: Payload): Promise<unknown> {
	// Wrapped so a throwing handler rejects the caller's promise rather than the call site.
	return Promise.resolve().then(() => handlers[action]!(payload ?? {}))
}

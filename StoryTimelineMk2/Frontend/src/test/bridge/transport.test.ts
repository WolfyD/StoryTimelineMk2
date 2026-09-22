import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The browser transport (BL-68). Without WebView2, the bridge has to reach the local server
 * over a WebSocket — and, above all, it must never leave a caller awaiting a reply that is
 * never coming.
 */

class FakeSocket {
	static readonly CONNECTING = 0
	static readonly OPEN = 1
	static readonly CLOSED = 3
	static instances: FakeSocket[] = []

	readyState = FakeSocket.CONNECTING
	sent: string[] = []
	private listeners: Record<string, ((event: MessageEvent) => void)[]> = {}

	constructor(public url: string) {
		FakeSocket.instances.push(this)
	}

	addEventListener(type: string, fn: (event: MessageEvent) => void) {
		;(this.listeners[type] ??= []).push(fn)
	}

	send(data: string) {
		this.sent.push(data)
	}

	private emit(type: string, event?: MessageEvent) {
		for (const fn of this.listeners[type] ?? []) fn(event)
	}

	/** The server accepted the connection. */
	open() {
		this.readyState = FakeSocket.OPEN
		this.emit('open')
	}

	/** The server said something. */
	deliver(message: unknown) {
		this.emit('message', { data: JSON.stringify(message) } as MessageEvent)
	}

	drop() {
		this.readyState = FakeSocket.CLOSED
		this.emit('close')
	}

	get lastSent() {
		return JSON.parse(this.sent[this.sent.length - 1]!)
	}
}

/** Loads a fresh copy of the bridge with no WebView2 in sight. */
async function loadBrowserBridge() {
	FakeSocket.instances = []
	vi.resetModules()
	vi.stubGlobal('WebSocket', FakeSocket)
	// setup.ts installs a WebView2 mock for every test file; the browser build has none.
	window.chrome = undefined

	const { BackendAPI } = await import('@/bridge/api')
	const socket = FakeSocket.instances[0]!
	return { BackendAPI, socket }
}

describe('bridge transport without WebView2', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it('connects to /bridge on the page origin', async () => {
		const { socket } = await loadBrowserBridge()

		expect(socket.url).toMatch(/^ws:\/\/.+\/bridge$/)
	})

	it('queues requests made before the socket opens, then flushes them', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()

		const pending = BackendAPI.request<{ status: string }>('GetAllTimelines', { args: [] })
		expect(socket.sent).toHaveLength(0)

		socket.open()
		expect(socket.sent).toHaveLength(1)

		const sent = socket.lastSent
		expect(sent.action).toBe('GetAllTimelines')
		socket.deliver({ messageId: sent.messageId, payload: { status: 'ok' } })

		await expect(pending).resolves.toEqual({ status: 'ok' })
	})

	it('correlates replies by messageId', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()

		const first = BackendAPI.request<number>('CreateProject', { title: 'A' })
		const second = BackendAPI.request<number>('CreateProject', { title: 'B' })
		const [a, b] = socket.sent.map((s) => JSON.parse(s))

		socket.deliver({ messageId: b.messageId, payload: 2 })
		socket.deliver({ messageId: a.messageId, payload: 1 })

		await expect(first).resolves.toBe(1)
		await expect(second).resolves.toBe(2)
	})

	it('sends fire-and-forget messages too', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()

		BackendAPI.send('DeleteNote', { noteId: 'n1' })

		expect(socket.lastSent).toEqual({ action: 'DeleteNote', payload: { noteId: 'n1' } })
		expect(socket.lastSent.messageId).toBeUndefined()
	})

	it('keeps host actions off the socket — the page handles them itself', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()

		BackendAPI.send('WindowMinimize', {})

		expect(socket.sent).toHaveLength(0)
	})

	it('rejects everything in flight when the connection drops', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()

		const pending = BackendAPI.request('GetAllTimelines', { args: [] })
		socket.drop()

		await expect(pending).rejects.toThrow(/connection to Story Timeline closed/i)
	})

	it('fails new requests immediately once the connection is gone', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()
		socket.drop()

		await expect(BackendAPI.request('GetAllTimelines', { args: [] })).rejects.toThrow(/Bridge Offline/)
	})
})

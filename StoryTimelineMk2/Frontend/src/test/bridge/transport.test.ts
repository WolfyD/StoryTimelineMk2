import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BridgeError } from '@/bridge/api'

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
		// open/close carry no event; the transport under test only reads .data on 'message'.
		for (const fn of this.listeners[type] ?? []) fn(event as MessageEvent)
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
	let alertMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		alertMock = vi.fn()
		vi.stubGlobal('alert', alertMock)
	})

	afterEach(() => {
		vi.useRealTimers()
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

	// BL-18 (FC-C1): an error reply rejects instead of resolving with an error object nobody reads.
	it('rejects on a status: error reply, keeping the payload', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()

		const pending = BackendAPI.request('RenameTag', { id: 1 })
		socket.deliver({
			messageId: socket.lastSent.messageId,
			payload: { status: 'error', message: 'nope', detail: 'C# stack', reported: true },
		})

		await expect(pending).rejects.toThrow('nope')
		const err = (await pending.catch((e) => e)) as BridgeError
		expect(err.bridge).toBe(true)
		expect(err.payload?.detail).toBe('C# stack')
		expect(err.payload?.reported).toBe(true)
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
		expect(((await pending.catch((e) => e)) as BridgeError).bridge).toBe(true)
	})

	it('fails new requests immediately once the connection is gone', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()
		socket.drop()

		const pending = BackendAPI.request('GetAllTimelines', { args: [] })
		await expect(pending).rejects.toThrow(/Bridge Offline/)
		expect(((await pending.catch((e) => e)) as BridgeError).bridge).toBe(true)
	})

	// BL-18, the second half of FC-C1. The `unhandledrejection` net in api.ts is the only thing
	// that shows an uncaught bridge failure to the user, and it keys on `err.bridge`. It used to
	// test `err.payload`, which only an error *reply* carries — so a timeout and a dropped
	// connection, the two failures where nothing can be saved, went to the console and nowhere
	// else. Every path is marked now; the tests above and below are what keeps it that way.
	it('marks a timeout, which has no payload to carry the news', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()
		vi.useFakeTimers()

		const pending = BackendAPI.request('GetAllTimelines', { args: [] })
		vi.advanceTimersByTime(30_000)

		const err = (await pending.catch((e) => e)) as BridgeError
		expect(err.bridge).toBe(true)
		expect(err.message).toMatch(/timeout/i)
	})

	it('tells the user when a fire-and-forget send is dropped', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()
		socket.drop()

		// `send` has no messageId, so there is no promise for the net to catch: the report has to
		// come from `send` itself or not at all.
		BackendAPI.send('DeleteNote', { noteId: 'n1' })

		expect(alertMock).toHaveBeenCalledOnce()
		expect(alertMock.mock.calls[0]![0]).toMatch(/no connection to Story Timeline/)
	})

	it('alerts once, not once per dropped call', async () => {
		const { BackendAPI, socket } = await loadBrowserBridge()
		socket.open()
		socket.drop()

		// A dropped socket fails everything at once; one alert per call is worse than silence.
		BackendAPI.send('DeleteNote', { noteId: 'n1' })
		BackendAPI.send('DeleteNote', { noteId: 'n2' })
		BackendAPI.send('DeleteNote', { noteId: 'n3' })

		expect(alertMock).toHaveBeenCalledOnce()
	})
})

import type {
	FullTimelineProject,
	TimelineProjectContainer,
	ItemForEdit,
	Tag,
	Calendar,
	CharacterItem,
	CharacterAppearance,
	CharacterRelationship,
	RelationshipType,
	MediaItem,
	Story,
	Book,
	Chapter,
	TimelineItem,
	LayoutSettings,
	FilterRule,
	FilterPreset,
	ChromeTheme,
	ImportPreview,
	BackupSettings,
	TimelineImportPreview,
	SessionHistory,
	SessionChangeSummary,
	SessionChangePreview,
	SessionApplyResult,
	BulkItemEdit,
	BulkRelation,
	BulkPlaceEdit,
	MapItem,
	LocationItem,
	MapEvent,
} from '@/types/models';
// Type-only: `installErrorReporting` needs the App shape, and importing Vue for real here would
// pull the runtime into the transport.
import type { App } from 'vue';
import type { CastMessage } from '@/utils/mapCast';
import { useTimelineStore } from '@/stores/timelineStore';
import * as browserHost from './browserHost';

export interface BridgeMessage {
	action: string;
	payload?: any;
	messageId?: number;
}

/** What the backend sends when a handler fails: `message` plus whatever that action adds. */
export interface BridgeErrorPayload {
	status?: string;
	message?: string;
	detail?: string;          // the C# stack trace
	[key: string]: unknown;
}

/** What `request()` rejects with — the payload is kept for callers that need its extra fields. */
export interface BridgeError extends Error {
	/**
	 * Always true. The net at the bottom of this block keys on this rather than on `payload`,
	 * which only a backend *reply* carries: a timeout, a dropped connection and an offline send
	 * have no payload to check, and those are exactly the failures where nothing can be saved.
	 */
	bridge: true;
	payload?: BridgeErrorPayload;
}

/** The one place a bridge failure becomes an Error, so none of them can go unmarked. */
function bridgeError(message: string, payload?: BridgeErrorPayload): BridgeError {
	const err = new Error(message) as BridgeError;
	err.bridge = true;
	if (payload) err.payload = payload;
	return err;
}

// `failAll` rejects every in-flight request at once, so one dropped socket can mean six
// identical alerts — worse than the silence it replaces. ponytail: dedupe on the message text
// for 5s; per-action suppression if a real case ever needs two different alerts that fast.
let lastAlert = { message: '', at: 0 };

/** Where the backend said it wrote the detail. Filled by the first report that got through. */
let logPath: string | null = null;

/**
 * Tells the user once, and tells them the log exists — most people never find out there is one
 * until someone asks them for it.
 *
 * ponytail: window.alert, not ConfirmModal. This is the net that has to work when the page's own
 * UI is the thing that broke, and a modal needs a mounted component and a store to render. Every
 * *other* alert in the app should be a modal; these ones stay crude on purpose.
 */
function alertFailure(message: string) {
	if (message === lastAlert.message && Date.now() - lastAlert.at < 5000) return;
	lastAlert.message = message;
	window.alert(
		`Something went wrong:\n\n${message}\n\n` +
			(logPath
				? `The full details were written to the error log:\n${logPath}`
				: 'The full details could not be written to the error log — Story Timeline is not responding.'),
	);
	// Stamped after the alert returns: one that sat open for a minute must not re-fire on close.
	lastAlert.at = Date.now();
}

/**
 * The page's half of the project rule, and a deliberate mirror of what `MessageRouter.Dispatch`
 * does on the backend: write the full stack to app.log, then tell the user. Every global net
 * below funnels through here, so there is one place to change how a frontend failure is handled.
 *
 * The log round trip is awaited rather than fired off, so the alert can name the file the detail
 * actually went to — and so the detail is on disk before the user is invited to go looking.
 */
async function reportError(context: string, error: unknown): Promise<void> {
	alertFailure(await logError(context, error));
}

/**
 * The log half of `reportError`, for a page that catches a failure and shows it itself — a banner,
 * a line in a dialog — so the alert would say it twice. Resolves to the message, never rejects.
 */
export async function logError(context: string, error: unknown): Promise<string> {
	const err = error instanceof Error ? error : undefined;
	const message = err?.message ?? String(error ?? 'Unknown error');
	console.error(`[${context}]`, error);

	try {
		const res = await sendRequest<{ logPath?: string }>('LogFrontendError', {
			context,
			message,
			stack: err?.stack ?? message,
		});
		if (res?.logPath) logPath = res.logPath;
	} catch {
		// Swallowed on purpose, and this is the one catch in the file that must stay silent:
		// letting it reject would land straight back in the net below and report the failure
		// to report, forever. `alertFailure` says so in its message instead.
	}

	return message;
}

const pendingRequests = new Map<number, (data: any) => void>();
const rejectRequests = new Map<number, (reason: Error) => void>();
let messageCounter = 0;

// --- Transport -------------------------------------------------------------
// Two pipes, one protocol. WebView2 on Windows; a WebSocket to the local server in a
// browser (BL-68). Same JSON both ways, so everything below this block is unaware.

const webview = window.chrome?.webview;
/** True in the browser build, where the page — not a WinForms form — owns the window. */
export const IS_BROWSER_HOST = !webview;
let socket: WebSocket | null = null;
let socketQueue: string[] = [];
let socketClosed = false;

if (!webview) {
	openSocket();
	// Anything the WinForms host would have done — windows, dialogs, the shell — is handled
	// in the page instead. `direct` keeps the shim's own calls from routing back into it.
	browserHost.useBackend((action, payload) => sendRequest(action, payload, true));
	// Pop-ups and openers push through here; the socket cannot reach another tab.
	window.addEventListener('message', (event) => {
		if (event.origin !== location.origin) return;
		if (event.data?.__storytimeline) handleIncoming(event.data);
	});
}

function openSocket() {
	// Same origin as the page: the server serves both, so there is no port to configure.
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	const ws = new WebSocket(`${scheme}://${location.host}/bridge`);
	socket = ws;

	ws.addEventListener('open', () => {
		for (const message of socketQueue) ws.send(message);
		socketQueue = [];
	});
	ws.addEventListener('message', (event) => {
		try {
			handleIncoming(JSON.parse(event.data));
		} catch (err) {
			void reportError(
				'bridge',
				new Error(`Story Timeline sent a message this page could not read: ${(err as Error).message}`),
			);
		}
	});
	// ponytail: no reconnect. The server is this page's own process — if it goes, the page
	// is stale anyway and a reload is the honest fix. Add reconnect when it proves annoying.
	ws.addEventListener('close', () => failAll('The connection to Story Timeline closed. Reload the page.'));
	ws.addEventListener('error', () => failAll('The connection to Story Timeline failed. Reload the page.'));
}

/** No reply is ever coming: reject now rather than let every caller wait out its 30s. */
function failAll(message: string) {
	socketClosed = true;
	socketQueue = [];
	const waiting = [...rejectRequests.values()];
	pendingRequests.clear();
	rejectRequests.clear();
	for (const reject of waiting) reject(bridgeError(message));
}

/** False when the message could not be handed over — the caller must fail loudly. */
function post(message: BridgeMessage, direct = false): boolean {
	if (webview) {
		webview.postMessage(message);
		return true;
	}
	if (!direct && browserHost.handles(message.action)) {
		runInBrowser(message);
		return true;
	}
	if (socketClosed || !socket) return false;
	const json = JSON.stringify(message);
	// Sends during CONNECTING would throw; the open handler drains this.
	if (socket.readyState === WebSocket.OPEN) socket.send(json);
	else socketQueue.push(json);
	return true;
}

/** Runs a host action in the page and answers it exactly as the backend would have. */
function runInBrowser(message: BridgeMessage) {
	browserHost.run(message.action, message.payload ?? {}).then(
		(payload) => {
			if (message.messageId) handleIncoming({ action: message.action, payload, messageId: message.messageId });
		},
		(err: Error) => {
			console.error(`[Browser Host] '${message.action}' failed:`, err);
			// ponytail: alert() is all a transport has — a toast needs a store and a mounted
			// component. A blocked pop-up must not fail silently, so crude beats invisible.
			window.alert(`${message.action} failed:\n\n${err.message}`);
			if (message.messageId) rejectRequests.get(message.messageId)?.(err);
		}
	);
}

function sendRequest<T>(action: string, payload: unknown = null, direct = false): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const id = ++messageCounter;
		// Safety net: if the backend never replies (handler crash before the
		// centralized catch, dropped message), reject after 30s instead of
		// leaving the caller awaiting forever.
		const timeout = setTimeout(() => {
			if (pendingRequests.has(id)) {
				pendingRequests.delete(id);
				rejectRequests.delete(id);
				console.error(`[Bridge Timeout] No reply for '${action}' after 30s`);
				reject(bridgeError(`Bridge timeout: no reply for '${action}' after 30s`));
			}
		}, 30_000);
		pendingRequests.set(id, (data) => {
			clearTimeout(timeout);
			rejectRequests.delete(id);
			resolve(data);
		});
		rejectRequests.set(id, (reason) => {
			pendingRequests.delete(id);
			rejectRequests.delete(id);
			clearTimeout(timeout);
			console.error(`[Bridge] '${action}' failed: ${reason.message}`);
			reject(reason);
		});
		if (!post({ action, payload, messageId: id }, direct)) {
			pendingRequests.delete(id);
			rejectRequests.delete(id);
			clearTimeout(timeout);
			reject(bridgeError(`[Bridge Offline] Cannot request '${action}': no connection to the backend`));
		}
	});
}

// BL-18 (FC-C1): a caller that catches its own bridge error handles it however it likes. One
// that does not used to leave the failure in the console, which is not "shown to the user" —
// so the last uncaught one lands here. This used to report only failures stamped `bridge`,
// which meant a rejected promise from anywhere else in the page was silent; now every uncaught
// rejection is logged and shown, bridge or not. The browser host raises its own alert for the
// ones it makes, and the 5s dedupe below collapses the pair when one reaches both.
window.addEventListener('unhandledrejection', (event) => {
	const err = event.reason as BridgeError | undefined;
	event.preventDefault();
	void reportError(err?.bridge ? 'bridge' : 'unhandledrejection', event.reason);
});

/**
 * Registers the page's global error nets, the frontend counterpart to the try/catch wrapped
 * around every backend action in `MessageRouter.Dispatch`. Each HTML entry point is its own Vue
 * app with its own handler, so every entry calls this — alongside `installDevHelpers()`.
 */
export function installErrorReporting(app: App): void {
	// Anything a render, a watcher or a lifecycle hook throws. Vue swallows these by default.
	app.config.errorHandler = (err, _instance, info) => {
		void reportError(`vue: ${info}`, err);
	};
	window.addEventListener('error', (event) => {
		// Failed <img>/<script> loads fire here too and carry no Error; they are not crashes.
		if (!event.error) return;
		void reportError('window', event.error);
	});
}

/** Pushes that are not replies: InitReload, ItemSaved, and the host's own notifications. */
const hostListeners = new Set<(message: BridgeMessage) => void>();

export const BackendAPI = {
	// Fire and forget
	send(action: string, payload: unknown = null) {
		if (!post({ action, payload })) {
			// No messageId means no promise, so there is nothing to reject and the net above
			// never sees this one. Report it here instead of leaving it in the console.
			void reportError(
				'bridge',
				new Error(`Cannot do '${action}': no connection to Story Timeline. Reload the page.`),
			);
		}
	},

	// Request-response
	request<T>(action: string, payload: unknown = null): Promise<T> {
		return sendRequest<T>(action, payload);
	},

	/**
	 * Subscribes to unprompted pushes, already parsed. Returns the unsubscribe.
	 * Use this instead of listening on the pipe directly — a browser tab has no WebView2.
	 */
	onHostMessage(listener: (message: BridgeMessage) => void): () => void {
		hostListeners.add(listener);
		return () => hostListeners.delete(listener);
	},

	// --- Timeline list ---

	async ImportDatabase() {
		const x: { status: string; message?: string } | null = await this.request('ImportDB', { args: [] });
		// A failure rejects now; 'cancelled' and anything else means there is nothing new to show.
		if (x?.status !== 'ok') return null;
		return await this.request<TimelineProjectContainer>('GetAllTimelines', { args: [] });
	},

	async BrowseAndPreviewImport() {
		return await this.request<{ status: string; preview?: ImportPreview }>('BrowseAndPreviewImport', {});
	},

	async ExecuteImportDB(path: string) {
		// `skipped` counts what a legacy backup could not bring across; `logPath` is where the
		// detail went. Both are absent on a v2 backup, which is all-or-nothing.
		return await this.request<{
			status: string;
			message?: string;
			reported?: boolean;
			skipped?: number;
			logPath?: string;
		}>('ExecuteImportDB', { path });
	},

	async ExportFullDB(includeMedia: boolean) {
		return await this.request<{ status: string; message?: string; path?: string }>('ExportFullDB', { includeMedia });
	},

	async GetBackupSettings() {
		return await this.request<BackupSettings>('GetBackupSettings', {});
	},

	async SaveBackupSettings(interval: string) {
		return await this.request<{ status: string }>('SaveBackupSettings', { interval });
	},

	OpenBackupsFolder() {
		this.send('OpenBackupsFolder', {});
	},

	async BrowseAndPreviewTimelineImport() {
		return await this.request<{ status: string; preview?: TimelineImportPreview }>('BrowseAndPreviewTimelineImport', {});
	},

	async ImportTimeline(path: string) {
		return await this.request<{ status: string; message?: string }>('ImportTimeline', { path });
	},

	async GetAllTimelines() {
		return await this.request<TimelineProjectContainer>('GetAllTimelines', { args: [] });
	},

	async CreateNewProject(title: string, author?: string, calendarId?: string) {
		return await this.request<number>('CreateProject', { title, author: author ?? '', calendarId: calendarId ?? null });
	},

	async OpenTimeline(id: number) {
		this.send('OpenTimeline', { id });
	},

	/**
	 * BL-15 phase 3: the appearances window — the BL-66 read-only timeline narrowed to one
	 * character, so a writer can read their life without the rest of the world in the way.
	 */
	OpenCharacterTimeline(timelineId: number, characterId: string) {
		this.send('OpenTimeline', { id: timelineId, readOnly: true, characterId });
	},

	async LoadTimelineData(id: number) {
		return await this.request<FullTimelineProject>('GetTimelineData', { id });
	},

	// --- EditItem ---

	async GetItemForEdit(timelineId: number, itemId: string | null, typeId: number = 1) {
		return await this.request<ItemForEdit>('GetItemForEdit', { timelineId, itemId, typeId });
	},

	async SaveItem(
		item: TimelineItem,
		tagNames: string[],
		characterAppearances: {
			CharacterId: string;
			Role: string | null;
			AutoDetected?: boolean;
			MentionedOnly?: boolean;
		}[],
		storyRefs: string[],
		chapterRefs: string[]
	) {
		return await this.request<{ status: string; itemId: string; message?: string }>('SaveItem', {
			item,
			tagNames,
			characterAppearances,
			storyRefs,
			chapterRefs,
		});
	},

	async SearchTags(query: string) {
		return await this.request<Tag[]>('SearchTags', { query });
	},

	/** Most-used tags of a timeline, busiest first */
	async GetTopTags(timelineId: number, limit = 8) {
		return await this.request<Tag[]>('GetTopTags', { timelineId, limit });
	},

	async GetTagList() {
		return await this.request<{ Id: number; Name: string; UsageCount: number }[]>('GetTagList', {});
	},

	async RenameTag(id: number, name: string) {
		return await this.request<{ status: string; message?: string }>('RenameTag', { id, name });
	},

	async DeleteTag(id: number) {
		return await this.request<{ status: string; unlinked?: number; message?: string }>('DeleteTag', { id });
	},

	/** Every item carrying `fromId` carries `intoId` instead, and `fromId` is gone. */
	async MergeTag(fromId: number, intoId: number) {
		return await this.request<{ status: string }>('MergeTag', { fromId, intoId });
	},

	/** Just the calendar, for windows that need dates but not the whole project. */
	async GetTimelineCalendar(timelineId: number) {
		return await this.request<Calendar | null>('GetTimelineCalendar', { timelineId });
	},

	async GetTimelineCharacters(timelineId: number) {
		return await this.request<CharacterItem[]>('GetTimelineCharacters', { timelineId });
	},

	// ── BL-16: maps and locations ────────────────────────────────────────────────────────────────

	/** Every map in the timeline with its pins already attached — the tree, in one call. */
	async GetMaps(timelineId: number) {
		return await this.request<MapItem[]>('GetMaps', { timelineId });
	},
	/**
	 * One map with its pins and its drawable copies built — `GetMaps` deliberately does not wait for
	 * those. Call it for the map about to be shown; it can take a moment on a first open.
	 */
	async EnsureMapViews(mapId: string) {
		return await this.request<MapItem>('EnsureMapViews', { mapId });
	},
	/** The saved map comes back: a new one's Id is made backend-side. */
	async SaveMap(map: Partial<MapItem>) {
		return await this.request<{ status: string; map: MapItem }>('SaveMap', map);
	},
	/**
	 * Opens a file dialog on the host, imports what is picked and points the map at it. The map comes
	 * back with its drawable copies built. Replies `status: 'cancelled'` if the dialog is closed.
	 */
	async SetMapPicture(mapId: string) {
		return await this.request<{ status: string; Map?: MapItem }>('SetMapPicture', { mapId });
	},
	/**
	 * `mapId` opens the window on that map, or points the open one at it. `locationId` goes one step
	 * further and lands on the pin — the map flies the journey down to it itself. `characterId` comes
	 * from a character's own timeline and cuts the map's cast down to the people they appear with.
	 */
	async OpenMapWindow(timelineId: number, mapId?: string, locationId?: string, characterId?: string, toggle = false) {
		return await this.request<{ status: string }>(
			'OpenMapWindow',
			{ timelineId, mapId, locationId, characterId, toggle },
		);
	},
	/** BL-16: the map's cast window. `activate` false leaves the keys with the map. */
	async OpenMapCastWindow(timelineId: number, activate = true) {
		return await this.request<{ status: string }>('OpenMapCastWindow', { timelineId, activate });
	},
	async CloseMapCastWindow() {
		return await this.request<{ status: string }>('CloseMapCastWindow', {});
	},
	/** Passed on to every page as a `MapCast` push: the map and its cast window talking. */
	async MapCast(message: CastMessage) {
		return await this.request<{ status: string }>('MapCast', message);
	},
	/**
	 * The map and its own pins. A pin on another map that opened into this one keeps its place and
	 * loses only the doorway — deleting a map does not delete the place it depicted.
	 */
	async DeleteMap(mapId: string) {
		return await this.request<{ status: string }>('DeleteMap', { mapId });
	},
	async SaveLocation(location: Partial<LocationItem>) {
		return await this.request<{ status: string; location: LocationItem }>('SaveLocation', location);
	},
	/** The events that pointed here keep their dates and forget the place. */
	async DeleteLocation(locationId: string) {
		return await this.request<{ status: string }>('DeleteLocation', { locationId });
	},
	/** Refused whole when anything would go under a map inside it. */
	async BulkEditPlaces(edit: BulkPlaceEdit) {
		return await this.request<{ status: string; affected: number }>('BulkEditPlaces', edit);
	},
	/** What happened at this place, earliest first. */
	async GetLocationItems(locationId: string) {
		return await this.request<TimelineItem[]>('GetLocationItems', { locationId });
	},
	/**
	 * Everything that happened somewhere in this timeline, earliest first, with whoever was present —
	 * what the year scrubber reads and what the paths across the map are made of.
	 */
	async GetMapEvents(timelineId: number) {
		return await this.request<MapEvent[]>('GetMapEvents', { timelineId });
	},

	/** Remembers that the user took a character off an item, so the matcher stops re-adding them. */
	async DismissCharacterLink(itemId: string, characterId: string) {
		return await this.request<{ status: string }>('DismissCharacterLink', { itemId, characterId });
	},
	/** The reverse of an item's character list: every item a character appears in. */
	async GetCharacterAppearances(characterId: string) {
		return await this.request<CharacterAppearance[]>('GetCharacterAppearances', { characterId });
	},
	/** Asks whichever window is drawing the timeline to jump to an item and pulse it. */
	async FocusTimelineItem(itemId: string, absoluteStart: number) {
		return await this.request<{ status: string }>('FocusTimelineItem', { itemId, absoluteStart });
	},
	async SaveCharacter(character: Partial<CharacterItem>) {
		// The saved row comes back: a new character's Id is made backend-side, and Name is derived there.
		return await this.request<{ status: string; character: CharacterItem }>('SaveCharacter', character);
	},

	/**
	 * The character and the birth/death items *Show on timeline* generates for them, written as one
	 * transaction. `droppedItemIds` are the generated items they no longer own. The two items are
	 * re-titled backend-side, where `Name` is derived.
	 */
	async SaveCharacterFull(
		character: CharacterItem,
		droppedItemIds: string[],
		birthItem: TimelineItem | null,
		deathItem: TimelineItem | null,
	) {
		return await this.request<{ status: string; character: CharacterItem }>('SaveCharacterFull', {
			character,
			droppedItemIds,
			birthItem,
			deathItem,
		});
	},

	async DeleteCharacter(id: string) {
		return await this.request<{ status: string }>('DeleteCharacter', { id });
	},

	/**
	 * `characterId` opens the window on that character, or points the open one at them. `toggle` is the
	 * sidebar's: an open window closes instead. The same goes for the relations, map and archive opens.
	 */
	async OpenCharactersWindow(timelineId: number, characterId?: string, toggle = false) {
		return await this.request<{ status: string }>('OpenCharactersWindow', { timelineId, characterId, toggle });
	},

	/** BL-88: the Archive — everything the timeline holds, in one window that stays open. */
	async OpenArchiveWindow(timelineId: number, toggle = false) {
		return await this.request<{ status: string }>('OpenArchiveWindow', { timelineId, toggle });
	},

	/** The character a birth/death item belongs to — null for every other item. */
	async GetCharacterIdForItem(itemId: string) {
		return await this.request<{ characterId: string | null }>('GetCharacterIdForItem', { itemId });
	},

	/** Both halves in one round trip: the character's relations and the kinds to read them by. */
	async GetCharacterRelations(characterId: string) {
		return await this.request<{
			Relations: CharacterRelationship[];
			Types: RelationshipType[];
		}>('GetCharacterRelations', { characterId });
	},

	/** BL-73: the whole web at once — the relations window draws all three together. */
	async GetTimelineRelations(timelineId: number) {
		return await this.request<{
			Characters: CharacterItem[];
			Relations: CharacterRelationship[];
			Types: RelationshipType[];
		}>('GetTimelineRelations', { timelineId });
	},

	/** `characterId` centres the graph and roots the family tree on them. */
	async OpenRelationsWindow(timelineId: number, characterId?: string, toggle = false) {
		return await this.request<{ status: string }>('OpenRelationsWindow', { timelineId, characterId, toggle });
	},

	/** BL-88: the genogram alone, rooted on `characterId`, in a window of its own. */
	async OpenFamilyTreeWindow(timelineId: number, characterId: string) {
		return await this.request<{ status: string }>('OpenFamilyTreeWindow', { timelineId, characterId });
	},

	async SaveCharacterRelation(relation: CharacterRelationship) {
		// The saved row comes back, so a new relation picks up its backend-side id.
		return await this.request<{ status: string; relation: CharacterRelationship }>(
			'SaveCharacterRelation',
			relation,
		);
	},

	/** BL-88: `affected` is how many of them it related; the other, ticked too, is skipped. */
	async BulkRelate(bulk: BulkRelation) {
		return await this.request<{ status: string; affected: number }>('BulkRelate', bulk);
	},

	async DeleteCharacterRelation(id: number) {
		return await this.request<{ status: string }>('DeleteCharacterRelation', { id });
	},

	async GetRelationshipTypes() {
		return await this.request<RelationshipType[]>('GetRelationshipTypes', {});
	},

	async SaveRelationshipType(type: RelationshipType) {
		return await this.request<{ status: string }>('SaveRelationshipType', type);
	},

	/** Relations that used the kind keep its id, and show it raw until pointed at another. */
	async DeleteRelationshipType(id: string) {
		return await this.request<{ status: string }>('DeleteRelationshipType', { id });
	},

	/** Opens a file dialog on the host; replies `status: 'cancelled'` if the user closes it. */
	async SetCharacterPortrait(characterId: string) {
		return await this.request<{ status: string; Picture?: MediaItem }>('SetCharacterPortrait', {
			characterId,
		});
	},

	async GetAllStories() {
		return await this.request<Story[]>('GetAllStories', {});
	},

	async SearchBooks(query: string) {
		return await this.request<Book[]>('SearchBooks', { query });
	},

	async GetBookChapters(bookId: string) {
		return await this.request<Chapter[]>('GetBookChapters', { bookId });
	},

	// ── BL-88: the Archive's stories and books. Every write pushes `StoriesChanged`. ────────────────

	/** Every story, with this timeline's links; the page decides which to list. */
	async GetArchiveStories(timelineId: number) {
		return await this.request<Story[]>('GetArchiveStories', { timelineId });
	},
	/**
	 * A new story's Id is made backend-side. `timelineId` replaces that timeline's character, place and
	 * book links with the story's lists; without it (the item editor's quick create) links are untouched.
	 */
	async SaveStory(story: Partial<Story>, timelineId?: number) {
		return await this.request<{ status: string; story: Story }>('SaveStory', { story, timelineId });
	},
	/** Everywhere: items in every timeline lose the reference. */
	async DeleteStory(id: string) {
		return await this.request<{ status: string }>('DeleteStory', { id });
	},
	async GetArchiveBooks(timelineId: number) {
		return await this.request<Book[]>('GetArchiveBooks', { timelineId });
	},
	async SaveBook(book: Partial<Book>) {
		return await this.request<{ status: string; book: Book }>('SaveBook', book);
	},
	async SaveChapter(chapter: Partial<Chapter>) {
		return await this.request<{ status: string; chapter: Chapter }>('SaveChapter', chapter);
	},
	/** The book, its chapters and every item's reference to them. */
	async DeleteBook(id: string) {
		return await this.request<{ status: string }>('DeleteBook', { id });
	},
	async DeleteChapter(id: string) {
		return await this.request<{ status: string }>('DeleteChapter', { id });
	},
	/** This timeline's pictures and the unused ones, each with every use it has anywhere. */
	async GetArchiveMedia(timelineId: number) {
		return await this.request<import('@/types/models').MediaItem[]>('GetArchiveMedia', { timelineId });
	},
	async SavePictureInfo(id: string, title: string, description: string) {
		return await this.request<{ status: string }>('SavePictureInfo', { id, title, description });
	},
	/** The picture and every use of it; `timelineId`'s items that showed it are pushed again as ItemSaved. */
	async DeletePicture(id: string, timelineId: number) {
		return await this.request<{ status: string }>('DeletePicture', { id, timelineId });
	},
	/** BL-88: pictures onto one item, or off every item of a timeline (a character's birth and death kept); the items changed are pushed as ItemSaved. */
	async BulkEditMedia(edit: { ids: string[]; attachTo?: string; detachFrom?: number }) {
		return await this.request<{ status: string; affected: number }>('BulkEditMedia', edit);
	},

	async GetLayoutSettingsList() {
		return await this.request<{ Id: string; Name: string }[]>('GetLayoutSettingsList', {});
	},

	async DeleteTimeline(id: number) {
		return await this.request<{ status: string }>('DeleteTimeline', { id });
	},

	async DuplicateTimeline(id: number, newTitle: string) {
		return await this.request<{ status: string; newId?: number }>('DuplicateTimeline', { id, newTitle });
	},

	async SaveTimelineInfo(id: number, title: string, author: string, description: string, startYear: number, color: string | null, calendarId?: string) {
		return await this.request<{ status: string }>('SaveTimelineInfo', { id, title, author, description, startYear, color, calendarId });
	},

	/** `characterId` exports that character's timeline alone — sent by the appearances window. */
	async ExportTimeline(id: number, includeIds: boolean, includeMedia = false, characterId?: string) {
		return await this.request<{ status: string; path?: string }>('ExportTimeline', { id, includeIds, includeMedia, characterId });
	},

	// ── BL-33: session changes ───────────────────────────────────────────────

	/** Every day this timeline was worked on, and where the last export stopped. */
	async GetSessionHistory(timelineId: number) {
		return await this.request<{ status: string; history?: SessionHistory }>('GetSessionHistory', { timelineId });
	},

	/** How much the given days changed, for the export tab. Nothing is written. */
	async GetSessionChanges(timelineId: number, days?: string[]) {
		return await this.request<{ status: string; summary?: SessionChangeSummary }>('GetSessionChanges', {
			timelineId,
			days,
		});
	},

	async ExportSessionChanges(timelineId: number, days?: string[]) {
		return await this.request<{ status: string; path?: string; message?: string }>('ExportSessionChanges', {
			timelineId,
			days,
		});
	},

	/** Picks a .stlc file and reports what applying it would do — collisions included. */
	async BrowseAndPreviewSessionChanges() {
		return await this.request<{ status: string; preview?: SessionChangePreview; message?: string }>(
			'BrowseAndPreviewSessionChanges',
			{},
		);
	},

	/** BL-88: deletes the sealed days that changed nothing. */
	async PruneSessionDays(timelineId: number) {
		return await this.request<{ status: string; pruned: number }>('PruneSessionDays', { timelineId });
	},

	/** BL-88: folds neighbouring sealed days into one; replies with the new history. */
	async MergeSessionDays(timelineId: number, days: string[]) {
		return await this.request<{ status: string; history: SessionHistory }>('MergeSessionDays', { timelineId, days });
	},

	/** `decisions` names only the items to keep as they are: `{ itemId: 'local' }`. */
	async ApplySessionChanges(path: string, decisions: Record<string, string>) {
		return await this.request<{ status: string; result?: SessionApplyResult; message?: string }>('ApplySessionChanges', {
			path,
			decisions,
		});
	},

	async SaveSettings(payload: {
		timelineId: number;
		pixelsPerSubtick: number;
		showGuides: boolean;
		displayRadius: number;
		isFullscreen: boolean;
		useCustomScaling: boolean;
		customScale: number;
		layoutPresetId: string;
		panSpeedMultiplier: number;
		panDeadzone: number;
		keyboardPanSpeed: number;
		defaultItemColor: string;
		headerMode: number;
	}) {
		return await this.request<{ status: string }>('SaveSettings', payload);
	},

	async GetSystemFonts() {
		return await this.request<string[]>('GetSystemFonts', {});
	},

	async GetCalendarList() {
		return await this.request<{ Id: string; Name: string; UsageCount: number }[]>('GetCalendarList', {});
	},

	async GetCalendarById(id: string) {
		return await this.request<import('@/types/models').Calendar>('GetCalendarById', { id });
	},

	async SaveCalendar(calendar: object) {
		return await this.request<{ status: string; message?: string }>('SaveCalendar', calendar);
	},

	async CreateCalendar(cloneFrom = 'cal_default_gregorian') {
		return await this.request<{ status: string; calendarId?: string }>('CreateCalendar', { cloneFrom });
	},

	async DeleteCalendar(id: string) {
		return await this.request<{ status: string; reassigned?: number; message?: string }>('DeleteCalendar', { id });
	},

	/** Native save dialog. `{ id }` exports a stored calendar, `{ calendar }` the editor's unsaved state. */
	async ExportCalendar(payload: { id: string } | { calendar: object }) {
		return await this.request<{ status: string; path?: string; message?: string }>('ExportCalendar', payload);
	},

	/** Native open dialog; always creates a new calendar. */
	async ImportCalendar() {
		return await this.request<{ status: string; calendarId?: string; name?: string; nameCollision?: boolean; message?: string }>('ImportCalendar', {});
	},

	async GetAppConfig() {
		return await this.request<{ DataRoot: string; DbPath: string; MediaFolder: string; chromeTheme: ChromeTheme; themeInitialized: boolean; systemPrefersDark: boolean; performantPanning: boolean; showAchievementPopups: boolean; achievementSound: boolean }>('GetAppConfig', {});
	},

	async SaveChromeTheme(theme: ChromeTheme) {
		return await this.request<{ status: string }>('SaveChromeTheme', theme);
	},

	async SavePerformantPanning(value: boolean) {
		return await this.request<{ status: string }>('SavePerformantPanning', { value });
	},

	async SaveTimelineMinimised(timelineId: number, minimised: boolean) {
		return await this.request<{ status: string }>('SaveTimelineMinimised', { timelineId, minimised });
	},

	async BrowseDataFolder() {
		return await this.request<{ path: string | null }>('BrowseDataFolder', {});
	},

	async SetDataRoot(path: string) {
		return await this.request<{ status: string; message?: string; path?: string }>('SetDataRoot', { path });
	},

	async MoveDataFolder(path: string) {
		return await this.request<{ status: string; message?: string; path?: string }>('MoveDataFolder', { path });
	},

	OpenDataFolder() {
		this.send('OpenDataFolder', {});
	},

	async CreateBackup(includeMedia: boolean) {
		return await this.request<{ status: string; message?: string; path?: string }>('CreateBackup', { includeMedia });
	},

	async GetAllPictures() {
		return await this.request<import('@/types/models').MediaItem[]>('GetAllPictures', {});
	},

	async LinkImageToItem(pictureId: string, itemId: string) {
		return await this.request<{ status: string; message?: string }>('LinkImageToItem', { pictureId, itemId });
	},

	async AddImageToItem(itemId: string) {
		return await this.request<{ status: string; message?: string; Pictures?: import('@/types/models').MediaItem[] }>('AddImageToItem', { itemId });
	},

	async RemoveImageFromItem(pictureId: string, itemId: string) {
		return await this.request<{ status: string; message?: string }>('RemoveImageFromItem', { pictureId, itemId });
	},

	async DeleteItem(itemId: string) {
		return await this.request<{ status: string }>('DeleteItem', { itemId });
	},

	async SaveNote(note: import('@/types/models').TimelineNote) {
		return await this.request<{ status: string; noteId: string }>('SaveNote', note);
	},

	async DeleteNote(noteId: string) {
		return await this.request<{ status: string }>('DeleteNote', { noteId });
	},

	async GetHiddenRanges(timelineId: number) {
		return await this.request<import('@/types/models').HiddenRange[]>('GetHiddenRanges', { timelineId });
	},

	async SaveHiddenRange(timelineId: number, startYear: number, endYear: number, label: string | null = null, id = 0) {
		return await this.request<{ status: string; range?: import('@/types/models').HiddenRange }>('SaveHiddenRange', { timelineId, startYear, endYear, label, id });
	},

	async DeleteHiddenRange(id: number) {
		return await this.request<{ status: string }>('DeleteHiddenRange', { id });
	},

	async ShiftTimelineItems(timelineId: number, delta: number) {
		return await this.request<{ status: string; affected?: number }>('ShiftTimelineItems', { timelineId, delta });
	},

	/** BL-88: the Archive's bulk edit. Every field left out is left alone; each item then comes
	 *  back as an ItemSaved push. */
	async BulkEditItems(edit: BulkItemEdit) {
		return await this.request<{ status: string; affected: number }>('BulkEditItems', edit);
	},

	/** Overwrites the LOD visibility mask of every item of the timeline */
	async SetTimelineItemsLodMask(timelineId: number, mask: number) {
		return await this.request<{ status: string; affected?: number; message?: string }>('SetTimelineItemsLodMask', { timelineId, mask });
	},

	async ResetLayoutPreset(id: string) {
		return await this.request<{ status: string; layoutSettings?: import('@/types/models').LayoutSettings }>('ResetLayoutPreset', { id });
	},

	async GetLayoutSettingsById(id: string) {
		return await this.request<LayoutSettings>('GetLayoutSettingsById', { id });
	},

	async CreateLayoutPreset(name: string, cloneFrom = 'ls_default') {
		return await this.request<{ status: string; preset?: { Id: string; Name: string }; layoutSettings?: LayoutSettings }>('CreateLayoutPreset', { name, cloneFrom });
	},

	async SaveLayoutSettings(ls: LayoutSettings) {
		return await this.request<{ status: string; layoutSettings?: LayoutSettings }>('SaveLayoutSettings', ls);
	},

	// --- Filter rules ---

	async GetFilterRules(timelineId: number) {
		return await this.request<{ status: string; rules: FilterRule[] }>('GetFilterRules', { timelineId });
	},

	async SaveFilterRule(rule: FilterRule) {
		return await this.request<{ status: string }>('SaveFilterRule', rule);
	},

	async DeleteFilterRule(id: string) {
		return await this.request<{ status: string }>('DeleteFilterRule', { id });
	},

	// --- Filter presets ---

	async GetFilterPresets() {
		return await this.request<{ status: string; presets: FilterPreset[] }>('GetFilterPresets', {});
	},

	async SaveFilterPreset(preset: FilterPreset) {
		return await this.request<{ status: string }>('SaveFilterPreset', preset);
	},

	async DeleteFilterPreset(id: string) {
		return await this.request<{ status: string }>('DeleteFilterPreset', { id });
	},

	// --- Notification settings ---

	async GetNotificationSettings() {
		return await this.request<{ showAchievementPopups: boolean; achievementSound: boolean }>('GetNotificationSettings', {})
	},

	async SaveNotificationSettings(showAchievementPopups: boolean, achievementSound: boolean) {
		return await this.request<{ status: string }>('SaveNotificationSettings', { showAchievementPopups, achievementSound })
	},

	// --- Achievement dev tools ---

	async TriggerTestAchievement(key: string) {
		return await this.request<{ status: string }>('TriggerTestAchievement', { key })
	},

	async TriggerRandomAchievement() {
		return await this.request<{ status: string }>('TriggerRandomAchievement', {})
	},

	async TriggerRandomMilestone() {
		return await this.request<{ status: string }>('TriggerRandomMilestone', {})
	},

	async ListAchievementKeys() {
		return await this.request<{ key: string; title: string; tier: string }[]>('ListAchievementKeys', {})
	},

	// --- Misc settings ---

	async GetMiscSetting(key: string, timelineId = 0) {
		return await this.request<{ status: string; value: string | null }>('GetMiscSetting', { key, timelineId });
	},

	async SetMiscSetting(key: string, value: string, timelineId = 0) {
		return await this.request<{ status: string }>('SetMiscSetting', { key, value, timelineId });
	},

	OpenAddEditItemWindow(timelineId: number, itemId: string | null) {
		this.send('OpenAddEditItemWindow', { timelineId, itemId })
	},

	async OpenYearCalendarWindow(timelineId: number, calendarId: string) {
		return await this.request<{ status: string }>('OpenYearCalendarWindow', { timelineId, calendarId });
	},

	async GetItemsForYear(timelineId: number, year: number) {
		return await this.request<{ status: string; items: import('@/types/models').TimelineItem[] }>('GetItemsForYear', { timelineId, year });
	},

	SetCalendarYear(year: number) {
		this.send('SetCalendarYear', { year });
	},

	// Window chrome (borderless) — fire-and-forget, no response needed
	WindowMinimize()        { this.send('WindowMinimize', {}) },
	WindowMaximizeRestore() { this.send('WindowMaximizeRestore', {}) },
	WindowClose()           { this.send('WindowClose', {}) },
	WindowStartDrag()       { this.send('WindowStartDrag', {}) },

	async WindowGetMaximized() {
		return await this.request<{ isMaximized: boolean }>('WindowGetMaximized', {});
	},
	async WindowGetTopMost() {
		return await this.request<{ isTopmost: boolean }>('WindowGetTopMost', {});
	},
	WindowSetTopMost(topmost: boolean) { this.send('WindowSetTopMost', { topmost }) },

	async CheckForUpdates() {
		return await this.request<{
			status: string;
			updateAvailable: boolean;
			version?: string;
			url?: string;
			notes?: string;
		}>('CheckForUpdates', {});
	},
	async SkipVersion(version: string) {
		return await this.request<{ status: string }>('SkipVersion', { version });
	},
	OpenExternalUrl(url: string) { this.send('OpenExternalUrl', { url }) },
};

// Replies and unprompted pushes from C#, whichever pipe they arrived on.
function handleIncoming(data: BridgeMessage) {
	if (data.messageId && pendingRequests.has(data.messageId)) {
		// BL-18 (FC-C1): the backend answers a failure with `{ status: 'error', message, detail }`.
		// That used to resolve, so every caller had to remember to look — and most did not. It
		// rejects here instead, once, and a caller that wants the message catches it.
		const failed = data.payload as BridgeErrorPayload | null;
		if (failed?.status === 'error') {
			// `payload` carries `detail` (the stack) and per-action flags such as `reported`.
			const err = bridgeError(failed.message ?? `'${data.action}' failed`, failed);
			rejectRequests.get(data.messageId)?.(err);   // also clears both maps and the timeout
			pendingRequests.delete(data.messageId);
			return;
		}
		const resolveFn = pendingRequests.get(data.messageId)!;
		resolveFn(data.payload);
		pendingRequests.delete(data.messageId);
	} else if (data.action) {
		if (data.action == 'InitReload') {
			const store = useTimelineStore();
			store.loadTimelines();
		} else if (data.action === 'ItemSaved') {
			const store = useTimelineStore();
			store.upsertItem(data.payload.Item, data.payload.Tags, data.payload.Characters, data.payload.StoryRefs, data.payload.HasPicture);
		} else if (data.action === 'ItemDeleted') {
			useTimelineStore().removeItem(data.payload.ItemId);
		} else if (data.action === 'StoriesChanged') {
			// Only a window with story links loaded has titles to fix.
			const store = useTimelineStore();
			if (store.itemStoryMap.size) {
				BackendAPI.GetAllStories().then(s => store.syncStories(s ?? []), err => reportError('StoriesChanged', err));
			}
		} else if (data.action === 'TagsChanged') {
			useTimelineStore().syncTag(data.payload.Id, data.payload.Into ?? null);
		} else if (data.action === 'HiddenRangesChanged') {
			const store = useTimelineStore();
			if (store.currentProject?.Id === data.payload.TimelineId) store.setHiddenRanges(data.payload.Ranges);
		} else if (data.action === 'NoteSaved') {
			useTimelineStore().syncNote(data.payload);
		} else if (data.action === 'NoteDeleted') {
			useTimelineStore().removeNote(data.payload.NoteId);
		} else if (data.action === 'CalendarsChanged') {
			// Calendar editor window closed — any open calendar list reloads itself.
			window.dispatchEvent(new Event('calendars-changed'));
		} else if (data.action === 'AchievementUnlocked') {
			// Lazy import to avoid circular deps at module load time
			import('@/stores/notificationsStore').then(({ useNotificationsStore }) => {
				useNotificationsStore().push(data.payload);
			});
		}
		for (const listener of hostListeners) listener(data);
		console.log('Unprompted C# Push:', data.action, data.payload);
	}
}

if (webview) {
	webview.addEventListener('message', (event) => {
		// PostWebMessageAsJson delivers an object, PostWebMessageAsString a string.
		try {
			handleIncoming(typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
		} catch (err) {
			// Whatever this reply belonged to is now waiting out its 30s timeout, so say so
			// now rather than let the page look merely slow.
			void reportError(
				'bridge',
				new Error(`Story Timeline sent a message this window could not read: ${(err as Error).message}`),
			);
		}
	});
}

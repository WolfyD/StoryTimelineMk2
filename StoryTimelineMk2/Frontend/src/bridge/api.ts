import type {
	FullTimelineProject,
	TimelineProjectContainer,
	ItemForEdit,
	Tag,
	CharacterItem,
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
} from '@/types/models';
import { useTimelineStore } from '@/stores/timelineStore';
import * as browserHost from './browserHost';

export interface BridgeMessage {
	action: string;
	payload?: any;
	messageId?: number;
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
			console.error('[Bridge] Unreadable message from the server:', event.data, err);
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
	for (const reject of waiting) reject(new Error(message));
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
				reject(new Error(`Bridge timeout: no reply for '${action}' after 30s`));
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
			reject(new Error(`[Bridge Offline] Cannot request '${action}': no connection to the backend`));
		}
	});
}

/** Pushes that are not replies: InitReload, ItemSaved, and the host's own notifications. */
const hostListeners = new Set<(message: BridgeMessage) => void>();

export const BackendAPI = {
	// Fire and forget
	send(action: string, payload: unknown = null) {
		if (!post({ action, payload })) {
			console.error(`[Bridge Offline] Dropped '${action}': no connection to the backend`);
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
		if (x?.status === 'ok') {
			const timelines: TimelineProjectContainer = await this.request('GetAllTimelines', { args: [] });
			return timelines;
		}
		if (x?.status === 'error') {
			console.error(`[ImportDB] ${x.message ?? 'Import failed'}`);
		}
		return null;
	},

	async BrowseAndPreviewImport() {
		return await this.request<{ status: string; preview?: ImportPreview }>('BrowseAndPreviewImport', {});
	},

	async ExecuteImportDB(path: string) {
		return await this.request<{ status: string; message?: string; reported?: boolean }>('ExecuteImportDB', { path });
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
		characterAppearances: { CharacterId: string; Role: string | null }[],
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

	async GetTimelineCharacters(timelineId: number) {
		return await this.request<CharacterItem[]>('GetTimelineCharacters', { timelineId });
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

	async ExportTimeline(id: number, includeIds: boolean, includeMedia = false) {
		return await this.request<{ status: string; path?: string }>('ExportTimeline', { id, includeIds, includeMedia });
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
		return await this.request<{ DataRoot: string; DbPath: string; MediaFolder: string; chromeTheme: ChromeTheme; themeInitialized: boolean; performantPanning: boolean; showAchievementPopups: boolean; achievementSound: boolean }>('GetAppConfig', {});
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
			console.error('[Bridge] Unreadable message from the host:', event.data, err);
		}
	});
}

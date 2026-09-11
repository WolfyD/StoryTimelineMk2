import type {
	FullTimelineProject,
	TimelineProjectContainer,
	ItemForEdit,
	Tag,
	CharacterItem,
	Story,
	Book,
	Chapter,
	ItemCharacterAppearance,
	TimelineItem,
	LayoutSettings,
	FilterRule,
	FilterPreset,
	ChromeTheme,
} from '@/types/models';
import { useTimelineStore } from '@/stores/timelineStore';

interface BridgeMessage {
	action: string;
	payload?: any;
	messageId?: number;
}

const pendingRequests = new Map<number, (data: any) => void>();
let messageCounter = 0;

export const BackendAPI = {
	// Fire and forget
	send(action: string, payload: unknown = null) {
		if (window.chrome?.webview) {
			window.chrome.webview.postMessage({ action, payload });
		}
	},

	// Request-response
	request<T>(action: string, payload: unknown = null): Promise<T> {
		return new Promise((resolve) => {
			if (!window.chrome?.webview) {
				console.warn(`[Bridge Offline] Cannot request ${action}`);
				return resolve(null as T);
			}
			const id = ++messageCounter;
			// Safety net: if the backend never replies (handler crash before the
			// centralized catch, dropped message), resolve null after 30s instead of
			// leaving the caller awaiting forever. Callers already handle null
			// (bridge-offline path returns it too).
			const timeout = setTimeout(() => {
				if (pendingRequests.has(id)) {
					pendingRequests.delete(id);
					console.error(`[Bridge Timeout] No reply for '${action}' after 30s`);
					resolve(null as T);
				}
			}, 30_000);
			pendingRequests.set(id, (data) => {
				clearTimeout(timeout);
				resolve(data);
			});
			window.chrome.webview.postMessage({ action, payload, messageId: id });
		});
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
		return await this.request<{ status: string; itemId: string }>('SaveItem', {
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

	async GetTimelineCharacters(timelineId: number) {
		return await this.request<CharacterItem[]>('GetTimelineCharacters', { timelineId });
	},

	async GetTimelineStories(timelineId: number) {
		return await this.request<Story[]>('GetTimelineStories', { timelineId });
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

	async ExportTimeline(id: number, includeIds: boolean) {
		return await this.request<{ status: string }>('ExportTimeline', { id, includeIds });
	},

	async SaveSettings(payload: {
		timelineId: number;
		font: string;
		fontSizeScale: number;
		pixelsPerSubtick: number;
		showGuides: boolean;
		displayRadius: number;
		isFullscreen: boolean;
		useCustomScaling: boolean;
		customScale: number;
		layoutPresetId: string;
	}) {
		return await this.request<{ status: string }>('SaveSettings', payload);
	},

	async GetSystemFonts() {
		return await this.request<string[]>('GetSystemFonts', {});
	},

	async GetCalendarList() {
		return await this.request<{ Id: string; Name: string }[]>('GetCalendarList', {});
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
		return await this.request<{ status: string }>('DeleteCalendar', { id });
	},

	async GetAppConfig() {
		return await this.request<{ DataRoot: string; DbPath: string; MediaFolder: string; chromeTheme: ChromeTheme; themeInitialized: boolean }>('GetAppConfig', {});
	},

	async SaveChromeTheme(theme: ChromeTheme) {
		return await this.request<{ status: string }>('SaveChromeTheme', theme);
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

	// Window chrome (borderless) — fire-and-forget, no response needed
	WindowMinimize()        { this.send('WindowMinimize', {}) },
	WindowMaximizeRestore() { this.send('WindowMaximizeRestore', {}) },
	WindowClose()           { this.send('WindowClose', {}) },
	WindowStartDrag()       { this.send('WindowStartDrag', {}) },
};

// Listen for replies and unprompted pushes from C#
if (window.chrome?.webview) {
	window.chrome.webview.addEventListener('message', (event) => {
		const data = event.data;

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
				store.upsertItem(data.payload.Item);
			}
			console.log('Unprompted C# Push:', data.action, data.payload);
		}
	});
}

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
	ImportPreview,
	BackupSettings,
	TimelineImportPreview,
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
		return new Promise<T>((resolve, reject) => {
			if (!window.chrome?.webview) {
				return reject(new Error(`[Bridge Offline] Cannot request '${action}': WebView2 not available`));
			}
			const id = ++messageCounter;
			// Safety net: if the backend never replies (handler crash before the
			// centralized catch, dropped message), reject after 30s instead of
			// leaving the caller awaiting forever.
			const timeout = setTimeout(() => {
				if (pendingRequests.has(id)) {
					pendingRequests.delete(id);
					console.error(`[Bridge Timeout] No reply for '${action}' after 30s`);
					reject(new Error(`Bridge timeout: no reply for '${action}' after 30s`));
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

	async BrowseAndPreviewImport() {
		return await this.request<{ status: string; preview?: ImportPreview }>('BrowseAndPreviewImport', {});
	},

	async ExecuteImportDB(path: string) {
		return await this.request<{ status: string; message?: string; reported?: boolean }>('ExecuteImportDB', { path });
	},

	async ExportFullDB() {
		return await this.request<{ status: string; message?: string; path?: string }>('ExportFullDB', {});
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
		defaultItemColor: string;
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
				store.upsertItem(data.payload.Item, data.payload.Tags, data.payload.Characters, data.payload.StoryRefs, data.payload.HasPicture);
			} else if (data.action === 'AchievementUnlocked') {
				// Lazy import to avoid circular deps at module load time
				import('@/stores/notificationsStore').then(({ useNotificationsStore }) => {
					useNotificationsStore().push(data.payload);
				});
			}
			console.log('Unprompted C# Push:', data.action, data.payload);
		}
	});
}

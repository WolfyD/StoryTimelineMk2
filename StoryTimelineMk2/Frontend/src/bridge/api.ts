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
			pendingRequests.set(id, resolve);
			window.chrome.webview.postMessage({ action, payload, messageId: id });
		});
	},

	// --- Timeline list ---

	async ImportDatabase() {
		const x: { status: string } = await this.request('ImportDB', { args: [] });
		if (x.status == 'ok') {
			const timelines: TimelineProjectContainer = await this.request('GetAllTimelines', { args: [] });
			return timelines;
		}
		return null;
	},

	async GetAllTimelines() {
		return await this.request<TimelineProjectContainer>('GetAllTimelines', { args: [] });
	},

	async CreateNewProject(title: string) {
		this.send('CreateProject', { title });
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

	async GetLayoutSettingsById(id: string) {
		return await this.request<LayoutSettings>('GetLayoutSettingsById', { id });
	},

	async CreateLayoutPreset(name: string, cloneFrom = 'ls_default') {
		return await this.request<{ status: string; preset?: { Id: string; Name: string }; layoutSettings?: LayoutSettings }>('CreateLayoutPreset', { name, cloneFrom });
	},

	async SaveLayoutSettings(ls: LayoutSettings) {
		return await this.request<{ status: string; layoutSettings?: LayoutSettings }>('SaveLayoutSettings', ls);
	},
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
			}
			console.log('Unprompted C# Push:', data.action, data.payload);
		}
	});
}

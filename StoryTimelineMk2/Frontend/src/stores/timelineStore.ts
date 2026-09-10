import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { type TimelineProject, type TimelineItem, type FullTimelineProject, type TimelineSettings, type LodLevel, type Calendar, type LayoutSettings, type HiddenRange, type TimelineNote } from '@/types/models';
import { BackendAPI } from '@/bridge/api';
import { buildFormatRegistry, DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig, type FormatRegistryType } from '@/utils/timelineLayout';

interface LastDeletedState {
    item: TimelineItem;
    tagNames: string[];
    characterAppearances: { CharacterId: string; Role: string | null }[];
    storyRefs: string[];
    chapterRefs: string[];
}


export const useTimelineStore = defineStore('timeline', () => {
	// ==========================================
	// 1. State (The raw data)
	// ==========================================
	const projects = ref<TimelineProject[]>([]);
	const items = ref<TimelineItem[]>([]);
	const currentNowYear = ref<number>(0); // The center of the screen
	const zoomLevel = ref<number>(1.0);
	const isLoading = ref<boolean>(true);
	const title = ref<string>('Loading...');
	const author = ref<string>('Loading...');
	const currentProject = ref<TimelineProject>({} as TimelineProject);
	const settings = ref<TimelineSettings>();
	const layoutSettings = ref<LayoutSettings>();
	const fps = ref<number>(0);
	const visibleItems = ref<number>(0);
	const currentLodIndex = ref<number>(3);
	const currentLodTitle = ref<string>('Year');
	const lodProfile = ref<LodLevel[]>([]);
	const calendar = ref<Calendar>();
	const hiddenRanges = ref<HiddenRange[]>([]);
	const notes = ref<TimelineNote[]>([]);
	const lastDeleted = ref<LastDeletedState | null>(null);
	const centerAbsoluteTime = ref<number>(0); // fractional center position (e.g. 1495.8), unlike currentNowYear which is floored
	const distanceFrom = ref<number | null>(null);
	const distanceTo = ref<number | null>(null);
	const notesDistanceTab = ref<'notes' | 'distance'>('notes');
	const viewportWidthPx = ref<number>(0); // pixel width of the main timeline canvas, used by minimap
	let _undoTimer: ReturnType<typeof setTimeout> | null = null;
	//const konvaItems = ref<KonvaGroupObject[]>([]);

	const ItemTypes = [
		"Event",
		"Period",
		"Age",
		"Picture",
		"Note",
		"Bookmark",
		"Character",
		"Timeline_start",
		"Timeline_end"
	]

	// ==========================================
	// 2. Getters (Computed derived data)
	// ==========================================
	// Useful for the Konva layout algorithm to split items based on the NOW line
	const pastItems = computed(() => items.value.filter(i => i.Year < currentNowYear.value));
	const futureItems = computed(() => items.value.filter(i => i.Year >= currentNowYear.value));

	// ==========================================
	// 3. Actions (Functions to mutate the state)
	// ==========================================
	function loadItems(newItems: TimelineItem[]) {
		items.value = newItems;
	}

	async function loadTimelines() {
		const response = await BackendAPI.request("GetAllTimelines", { args: [] });
		projects.value = response?.data ?? [];
	}

	async function loadTimelineData (id:number) {
		try {
			// 1. Fire the request across the bridge to C#
			const response:FullTimelineProject = await BackendAPI.LoadTimelineData(id);
			if (!response) return;

			// 2. Populate the state with the C# response
			title.value = response.Project.Title;
			author.value = response.Project.Author;
			items.value = response.Items;
			settings.value = response.Project.Settings;
			layoutSettings.value = response.Project.LayoutSettings;
			currentProject.value = response.Project;
			calendar.value = response.Project.Calendar;
			hiddenRanges.value = (response.HiddenRanges ?? []).sort((a, b) => a.StartYear - b.StartYear);
			notes.value = (response.Notes ?? []).sort((a, b) => a.AbsoluteTime - b.AbsoluteTime);
			const lProf = response.Project.Calendar.LodProfile;
			const _lp = lProf.Profile;
			if(_lp){
				lodProfile.value = JSON.parse(_lp.toString());
			}
		} catch (error) {
			console.error("Bridge Error loading timeline:", error);
		} finally {
			isLoading.value = false;
		}
	}

		function setProjects(newProjects: TimelineProject[]) {
				projects.value = newProjects;
		}

	function addItem(item: TimelineItem) {
		items.value.push(item);
	}

	function upsertItem(item: TimelineItem) {
		const idx = items.value.findIndex(i => i.Id === item.Id)
		if (idx >= 0) {
			items.value[idx] = item
		} else {
			items.value.push(item)
			items.value.sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
		}
	}

	function removeItem(id: string) {
		items.value = items.value.filter(i => i.Id !== id);
	}

	function setFpsDisplay(_fps:number) {
		fps.value = _fps;
	}

	function setNowYear(year: number) {
		currentNowYear.value = year;
	}

	function setVisibleItems(count: number) {
		visibleItems.value = count;
	}

	function setDistanceFrom(value: number | null) {
		distanceFrom.value = value;
	}

	function setDistanceTo(value: number | null) {
		distanceTo.value = value;
	}

	function setNotesDistanceTab(tab: 'notes' | 'distance') {
		notesDistanceTab.value = tab;
	}

	function setHiddenRanges(ranges: HiddenRange[]) {
		hiddenRanges.value = ranges;
	}

	function setLayoutSettings(ls: LayoutSettings) {
		layoutSettings.value = ls;
	}

	function setCenterAbsoluteTime(t: number) {
		centerAbsoluteTime.value = t;
	}

	function setViewportWidth(w: number) {
		viewportWidthPx.value = w;
	}

	function addNote(note: TimelineNote) {
		notes.value.push(note);
		notes.value.sort((a, b) => a.AbsoluteTime - b.AbsoluteTime);
	}

	function updateNote(note: TimelineNote) {
		const idx = notes.value.findIndex(n => n.Id === note.Id);
		if (idx !== -1) notes.value[idx] = note;
	}

	function removeNote(noteId: string) {
		notes.value = notes.value.filter(n => n.Id !== noteId);
	}

	function setLastDeleted(data: LastDeletedState) {
		if (_undoTimer) clearTimeout(_undoTimer);
		lastDeleted.value = data;
		_undoTimer = setTimeout(() => { lastDeleted.value = null; _undoTimer = null; }, 30000);
	}

	function clearLastDeleted() {
		if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
		lastDeleted.value = null;
	}


	function lodZoomIn(){
		if(!lodProfile.value) return;
		if (currentLodIndex.value < lodProfile.value.length - 1) {
			currentLodIndex.value++;
			const _myProf = lodProfile.value.find(x=>x.index == currentLodIndex.value);
			if(_myProf){
				currentLodTitle.value = _myProf.formatKey;
			}
		}
	};

	function lodZoomOut(){

		if(!lodProfile.value) return;
		if (currentLodIndex.value > 0) {
			currentLodIndex.value--;
			const _myProf = lodProfile.value.find(x=>x.index == currentLodIndex.value);
			if(_myProf){
				currentLodTitle.value = _myProf.formatKey;
			}
		}
	};

	// Parse the loaded calendar's YearDefinition into a format config
	const calendarConfig = computed((): CalendarFormatConfig => {
		const ydStr = calendar.value?.YearDefinition
		if (!ydStr) return DEFAULT_CALENDAR_CONFIG
		try {
			const yd = JSON.parse(ydStr)
			const yearLength: number = yd.length ?? 365

			const months: CalendarFormatConfig['months'] = []
			if (yd.month_definition && yd.months) {
				let cumulative = 0
				for (let i = 0; i < (yd.months as number); i++) {
					const m = yd.month_definition[String(i)]
					const len: number = m?.length ?? 30
					months.push({
						name: m?.name ?? `Month ${i + 1}`,
						shortName: m?.short_name ?? (m?.name ? String(m.name).slice(0, 3) : `M${i + 1}`),
						startDay: cumulative,
					})
					cumulative += len
				}
			}

			const seasons: CalendarFormatConfig['seasons'] = []
			if (yd.season_definition && yd.seasons) {
				for (let i = 0; i < (yd.seasons as number); i++) {
					const s = yd.season_definition[String(i)]
					seasons.push({ name: s?.name ?? `Season ${i + 1}`, start: s?.start ?? 0, end: s?.end ?? 0 })
				}
			}

			const weekLength: number = yd.week_definition?.length ?? 7
			return { yearLength, weekLength, months, seasons }
		} catch {
			return DEFAULT_CALENDAR_CONFIG
		}
	})

	const activeFormatRegistry = computed((): FormatRegistryType => buildFormatRegistry(calendarConfig.value))

	// Expose everything so Vue components can use them
	return {
		// variables
		items, currentNowYear, centerAbsoluteTime, viewportWidthPx, zoomLevel, settings, layoutSettings, fps, visibleItems, lodProfile, currentLodIndex,
		pastItems, futureItems, projects, isLoading, title, author, currentProject, calendar, currentLodTitle, hiddenRanges,
		notes, lastDeleted, distanceFrom, distanceTo, notesDistanceTab, activeFormatRegistry, calendarConfig,

		// functions
		loadItems, addItem, upsertItem, removeItem, setNowYear, setVisibleItems, setCenterAbsoluteTime, setViewportWidth, setProjects, loadTimelines, loadTimelineData, setFpsDisplay, lodZoomIn, lodZoomOut,
		setDistanceFrom, setDistanceTo, setNotesDistanceTab, setHiddenRanges, setLayoutSettings,
		addNote, updateNote, removeNote,
		setLastDeleted, clearLastDeleted,

		// constants
		ItemTypes
	};
});

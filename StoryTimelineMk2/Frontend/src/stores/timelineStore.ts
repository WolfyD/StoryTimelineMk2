import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { type TimelineProject, type TimelineItem, type FullTimelineProject, type TimelineSettings, type LodLevel, type Calendar, type LayoutSettings, type HiddenRange } from '@/types/models';
import { BackendAPI } from '@/bridge/api';


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
	const pastItems = computed(() => items.value.filter(i => i.year < currentNowYear.value));
	const futureItems = computed(() => items.value.filter(i => i.year >= currentNowYear.value));

	// ==========================================
	// 3. Actions (Functions to mutate the state)
	// ==========================================
	function loadItems(newItems: TimelineItem[]) {
		items.value = newItems;
	}

	async function loadTimelines() {
			projects.value = await BackendAPI.request("GetTimelines", { args: [] });
	}

	async function loadTimelineData (id:number) {
		try {
			// 1. Fire the request across the bridge to C#
			const response:FullTimelineProject = await BackendAPI.LoadTimelineData(id);

			console.log(response);

			// 2. Populate the state with the C# response
			title.value = response.Project.Title;
			author.value = response.Project.Author;
			items.value = response.Items;
			settings.value = response.Project.Settings;
			layoutSettings.value = response.Project.LayoutSettings;
			currentProject.value = response.Project;
			calendar.value = response.Project.Calendar;
			hiddenRanges.value = (response.HiddenRanges ?? []).sort((a, b) => a.StartYear - b.StartYear);
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

	function removeItem(id: string) {
		items.value = items.value.filter(i => i.Id !== id);
	}

	function setFpsDisplay(_fps:number) {
		fps.value = _fps;
	}

	function setNowYear(year: number) {
		currentNowYear.value = year;
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

	// Expose everything so Vue components can use them
	return {
		// variables
		items, currentNowYear, zoomLevel, settings, layoutSettings, fps, visibleItems, lodProfile, currentLodIndex,
		pastItems, futureItems, projects, isLoading, title, author, currentProject, calendar, currentLodTitle, hiddenRanges,

		// functions
		loadItems, addItem, removeItem, setNowYear, setProjects, loadTimelines, loadTimelineData,setFpsDisplay,lodZoomIn, lodZoomOut,

		// constants
		ItemTypes
	};
});

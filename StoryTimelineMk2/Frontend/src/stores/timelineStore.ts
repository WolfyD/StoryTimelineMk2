import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { type TimelineProject, type TimelineItem, type FullTimelineProject, type TimelineSettings, type LodLevel, type Calendar, type LayoutSettings, type HiddenRange, type TimelineNote, type CharacterItem, type ItemTagLink, type ItemCharacterLink, type ItemStoryRefLink, type FilterRule, type FilterPreset, type FilterState } from '@/types/models';
import { BackendAPI } from '@/bridge/api';
import { buildFormatRegistry, DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig, type FormatRegistryType } from '@/utils/timelineLayout';
import type { MemDayMarker } from '@/types/models';
import { applyFilters, buildItemDataMap } from '@/utils/filterMatcher';
import { relationOtherId } from '@/utils/characterRelations';

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

	// Filter state
	const allTimelineTags = ref<{ TagId: number; TagName: string }[]>([]);
	const allTimelineCharacters = ref<CharacterItem[]>([]);
	const allTimelineStories = ref<{ StoryId: string; StoryTitle: string }[]>([]);
	const allTimelineColors = ref<string[]>([]);
	const itemTagMap = ref<Map<string, ItemTagLink[]>>(new Map());
	const itemCharacterMap = ref<Map<string, ItemCharacterLink[]>>(new Map());
	const itemStoryMap = ref<Map<string, ItemStoryRefLink[]>>(new Map());
	const itemPictureSet = ref<Set<string>>(new Set());
	const filterRules = ref<FilterRule[]>([]);
	const filterAndMode = ref<boolean>(false);
	const filterDisplayMode = ref<'hidden' | 'dimmed'>('hidden');
	const filterPanelOpen = ref<boolean>(false);
	const filterPresets = ref<FilterPreset[]>([]);
	const centerAbsoluteTime = ref<number>(0); // fractional center position (e.g. 1495.8), unlike currentNowYear which is floored
	const distanceFrom = ref<number | null>(null);
	const distanceTo = ref<number | null>(null);
	const notesDistanceTab = ref<'notes' | 'distance'>('notes');
	const showMeasureInTimeline = ref<boolean>(localStorage.getItem('showMeasureInTimeline') !== 'false');
	const viewportWidthPx = ref<number>(0); // pixel width of the main timeline canvas, used by minimap
	const pulseItemId = ref<string | null>(null);
	const performantPanning = ref<boolean>(true);
	// App-wide, not per timeline: both live in the misc-settings table under timeline 0.
	const onScreenControls = ref<boolean>(false);
	const lowResourceMode = ref<boolean>(false);
	// BL-15 phase 3: an appearances window. The id is set from the URL before the load, the
	// character itself comes out of the load — session-only, never written back.
	const characterFocusId = ref<string | null>(null);
	const characterFocus = ref<CharacterItem | null>(null);
	// BL-17: the birth and death items of everyone the focus is related to — a life reads better
	// with the family in it. Filled from the relations once, at load, and read by belongsToFocus.
	const focusKinItemIds = ref<Set<string>>(new Set());

	/** Boundary markers carry the timeline's extent, so they belong to every character. */
	function belongsToFocus(item: TimelineItem, charLinks?: ItemCharacterLink[]): boolean {
		const c = characterFocus.value;
		if (!c) return true;
		if (item.TypeId >= 8 || item.Id === c.BirthItemId || item.Id === c.DeathItemId) return true;
		if (focusKinItemIds.value.has(item.Id)) return true;
		return (charLinks ?? itemCharacterMap.value.get(item.Id) ?? []).some(l => l.CharacterId === c.Id);
	}

	/**
	 * Who counts as family: relations, not surnames — an in-law shares no name and belongs, a
	 * namesake who is nobody's relative does not. Only the two generated items can be shown, so a
	 * relative with <em>Show on timeline</em> off stays absent, same as they are everywhere else.
	 */
	async function loadKinItemIds(focus: CharacterItem): Promise<Set<string>> {
		const ids = new Set<string>();
		try {
			const res = await BackendAPI.GetCharacterRelations(focus.Id);
			const kin = new Set((res?.Relations ?? []).map(r => relationOtherId(r, focus.Id)));
			for (const c of allTimelineCharacters.value) {
				if (!kin.has(c.Id)) continue;
				if (c.BirthItemId) ids.add(c.BirthItemId);
				if (c.DeathItemId) ids.add(c.DeathItemId);
			}
		} catch (ex) {
			// The window still works without the family, so this must not take the whole load down.
			console.error('Could not load the relations for the character window', ex);
			const why = ex instanceof Error ? ex.message : String(ex);
			window.alert(`${focus.Name}'s family could not be loaded, so only their own items are shown.\n\n${why}`);
		}
		return ids;
	}

	const readOnly = ref<boolean>(false); // BL-66: reference window — view only, no edit affordances
	// BL-66 step 2: another timeline drawn underneath this one. Which one, and the `shift` in years,
	// are remembered per timeline in misc settings; the items themselves are re-fetched each time.
	const reference = ref<{ project: TimelineProject; items: TimelineItem[]; shift: number } | null>(null);
	const referenceError = ref<string | null>(null);   // surfaced by ReferenceTimelineModal
	let _undoTimer: ReturnType<typeof setTimeout> | null = null;
	let _pulseTimer: ReturnType<typeof setTimeout> | null = null;
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

	const _filterResults = computed(() => {
		const dataMap = buildItemDataMap(
			items.value,
			itemTagMap.value,
			itemCharacterMap.value,
			itemStoryMap.value,
			itemPictureSet.value,
		);
		return applyFilters(items.value, filterRules.value, filterAndMode.value, dataMap);
	});

	const filteredItems = computed(() => _filterResults.value.visible);
	const dimmableItems = computed(() =>
		filterDisplayMode.value === 'dimmed' ? _filterResults.value.dimmed : []
	);

	// ==========================================
	// 3. Actions (Functions to mutate the state)
	// ==========================================
	function loadItems(newItems: TimelineItem[]) {
		items.value = newItems;
	}

	async function loadTimelines() {
		const response = await BackendAPI.request<{ data?: TimelineProject[] }>("GetAllTimelines", { args: [] });
		projects.value = response?.data ?? [];
	}

	let _loadSeq = 0;

	async function loadReference(id: number, shift = 0) {
		const response: FullTimelineProject = await BackendAPI.LoadTimelineData(id);
		if (!response?.Project) throw new Error((response as any)?.message ?? `Timeline ${id} returned no data`);
		reference.value = {
			project: response.Project,
			items: (response.Items ?? []).filter(i => i.TypeId !== 8 && i.TypeId !== 9),   // boundaries are the active timeline's business
			shift,
		};
		referenceError.value = null;
	}

	function clearReference() { reference.value = null; referenceError.value = null; }

	const REFERENCE_KEY = 'reference_timeline';

	// One watcher instead of a save call at each mutation site: picking a reference, removing it and
	// nudging the shift all land here. The writes are idempotent, so a restore re-writing what it
	// just read costs nothing.
	watch(() => [reference.value?.project.Id, reference.value?.shift], () => {
		const tlId = currentProject.value?.Id;
		if (!tlId) return;
		const r = reference.value;
		void BackendAPI.SetMiscSetting(REFERENCE_KEY, r ? JSON.stringify({ id: r.project.Id, shift: r.shift }) : '', tlId);
	});

	// Restores whatever was drawn underneath this timeline last time. A reference that will not load
	// (deleted, renumbered) is dropped rather than retried, and the reason shows in the reference modal.
	async function restoreReference(raw: string | null | undefined, seq: number) {
		let saved: { id?: number; shift?: number } | null = null;
		if (raw) { try { saved = JSON.parse(raw); } catch { saved = null; } }
		if (!saved?.id) { if (reference.value) clearReference(); return; }
		try {
			await loadReference(saved.id, saved.shift ?? 0);
		} catch (err) {
			console.error('[timelineStore] restoring reference timeline failed', err);
			if (seq !== _loadSeq) return;
			clearReference();
			referenceError.value = `The timeline drawn underneath could not be loaded and was removed: ${(err as Error).message}`;
		}
	}

	async function loadTimelineData (id:number) {
		const seq = ++_loadSeq;
		try {
			// 1. Fire the request across the bridge to C#
			const response:FullTimelineProject = await BackendAPI.LoadTimelineData(id);
			if (!response || seq !== _loadSeq) return;

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

			// Build filter data structures
			const tagLinks = response.ItemTags ?? [];
			const charLinks = response.ItemCharacters ?? [];
			const storyLinks = response.ItemStoryRefs ?? [];
			const tagMapNew = new Map<string, ItemTagLink[]>();
			const charMapNew = new Map<string, ItemCharacterLink[]>();
			const storyMapNew = new Map<string, ItemStoryRefLink[]>();
			for (const t of tagLinks) {
				const arr = tagMapNew.get(t.ItemId) ?? [];
				arr.push(t);
				tagMapNew.set(t.ItemId, arr);
			}
			for (const c of charLinks) {
				const arr = charMapNew.get(c.ItemId) ?? [];
				arr.push(c);
				charMapNew.set(c.ItemId, arr);
			}
			for (const s of storyLinks) {
				const arr = storyMapNew.get(s.ItemId) ?? [];
				arr.push(s);
				storyMapNew.set(s.ItemId, arr);
			}
			itemTagMap.value = tagMapNew;
			itemCharacterMap.value = charMapNew;
			itemStoryMap.value = storyMapNew;
			itemPictureSet.value = new Set(response.ItemsWithPictures ?? []);

			const seenTags = new Map<number, string>();
			for (const t of tagLinks) seenTags.set(t.TagId, t.TagName);
			allTimelineTags.value = [...seenTags.entries()].map(([TagId, TagName]) => ({ TagId, TagName })).sort((a, b) => a.TagName.localeCompare(b.TagName));
			allTimelineCharacters.value = (response.Characters ?? []).sort((a, b) => a.Name.localeCompare(b.Name));

			// BL-15 phase 3: narrow the items, not the filter, so the minimap, the notes panel and
			// the export see the character's timeline too — not just the canvas.
			characterFocus.value = characterFocusId.value
				? allTimelineCharacters.value.find(c => c.Id === characterFocusId.value) ?? null
				: null;
			focusKinItemIds.value = characterFocus.value
				? await loadKinItemIds(characterFocus.value)
				: new Set();
			if (characterFocus.value) items.value = items.value.filter(i => belongsToFocus(i));

			const seenStories = new Map<string, string>();
			for (const s of storyLinks) seenStories.set(s.StoryId, s.StoryTitle);
			allTimelineStories.value = [...seenStories.entries()].map(([StoryId, StoryTitle]) => ({ StoryId, StoryTitle })).sort((a, b) => a.StoryTitle.localeCompare(b.StoryTitle));

			const seenColors = new Set<string>();
			for (const item of response.Items ?? []) {
				if (item.Color) seenColors.add(item.Color.toLowerCase().slice(0, 7));
			}
			allTimelineColors.value = [...seenColors].sort();

			// Load filter rules and misc settings for this timeline
			const tlId = response.Project.Id;
			const [rulesResult, andModeResult, panelOpenResult, displayModeResult, oscResult, lowResResult, refResult] = await Promise.all([
				BackendAPI.GetFilterRules(tlId),
				BackendAPI.GetMiscSetting('filter_and_mode', tlId),
				BackendAPI.GetMiscSetting('filter_panel_open', tlId),
				BackendAPI.GetMiscSetting('filter_display_mode', 0),
				BackendAPI.GetMiscSetting('on_screen_controls', 0),
				BackendAPI.GetMiscSetting('low_resource_mode', 0),
				BackendAPI.GetMiscSetting(REFERENCE_KEY, tlId),
			]);
			if (seq !== _loadSeq) return;
			filterRules.value = rulesResult?.rules ?? [];
			filterAndMode.value = andModeResult?.value === '1';
			filterPanelOpen.value = panelOpenResult?.value === '1';
			filterDisplayMode.value = displayModeResult?.value === 'dimmed' ? 'dimmed' : 'hidden';
			onScreenControls.value = oscResult?.value === '1';
			lowResourceMode.value = lowResResult?.value === '1';
			void restoreReference(refResult?.value, seq);   // a second full fetch — never block the timeline on it
			const lProf = response.Project.Calendar.LodProfile;
			const _lp = lProf.Profile;
			if(_lp){
				lodProfile.value = JSON.parse(_lp.toString());
				const yearLevel = lodProfile.value.find(l => l.formatKey.toLowerCase().includes('year'))
				if (yearLevel) {
					currentLodIndex.value = yearLevel.index
					currentLodTitle.value = yearLevel.formatKey
				}
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

	function upsertItem(
		item: TimelineItem,
		tagLinks?: ItemTagLink[],
		charLinks?: ItemCharacterLink[],
		storyLinks?: ItemStoryRefLink[],
		hasPicture?: boolean,
	) {
		// An edit in the main window reaches every open window; an appearances window must not
		// collect the items of characters it is not about.
		if (!belongsToFocus(item, charLinks)) return

		const idx = items.value.findIndex(i => i.Id === item.Id)
		if (idx >= 0) {
			items.value[idx] = item
		} else {
			items.value.push(item)
			items.value.sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
		}

		if (tagLinks !== undefined) {
			const next = new Map(itemTagMap.value)
			next.set(item.Id, tagLinks)
			itemTagMap.value = next
			// Merge any newly-created tags into the filter dropdown list
			const knownIds = new Set(allTimelineTags.value.map(t => t.TagId))
			const fresh = tagLinks.filter(t => !knownIds.has(t.TagId)).map(t => ({ TagId: t.TagId, TagName: t.TagName }))
			if (fresh.length) {
				allTimelineTags.value = [...allTimelineTags.value, ...fresh].sort((a, b) => a.TagName.localeCompare(b.TagName))
			}
		}

		if (charLinks !== undefined) {
			const next = new Map(itemCharacterMap.value)
			next.set(item.Id, charLinks)
			itemCharacterMap.value = next
		}

		if (storyLinks !== undefined) {
			const next = new Map(itemStoryMap.value)
			next.set(item.Id, storyLinks)
			itemStoryMap.value = next
		}

		if (hasPicture !== undefined) {
			const next = new Set(itemPictureSet.value)
			if (hasPicture) next.add(item.Id)
			else next.delete(item.Id)
			itemPictureSet.value = next
		}

		if (item.Color) {
			const color = item.Color.toLowerCase().slice(0, 7)
			if (!allTimelineColors.value.includes(color)) {
				allTimelineColors.value = [...allTimelineColors.value, color].sort()
			}
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

	function setShowMeasureInTimeline(val: boolean) {
		showMeasureInTimeline.value = val;
		localStorage.setItem('showMeasureInTimeline', String(val));
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

	function setPerformantPanning(value: boolean) {
		performantPanning.value = value;
	}

	async function setOnScreenControls(value: boolean) {
		onScreenControls.value = value;
		await BackendAPI.SetMiscSetting('on_screen_controls', value ? '1' : '0', 0);
	}

	async function setLowResourceMode(value: boolean) {
		lowResourceMode.value = value;
		await BackendAPI.SetMiscSetting('low_resource_mode', value ? '1' : '0', 0);
	}

	// The speed box next to the FPS counter edits the same per-timeline setting the settings modal
	// owns, and SaveSettings wants the whole row back — everything but the speed is what is loaded.
	async function savePanSpeed(speed: number) {
		const s = settings.value;
		if (!s || !currentProject.value) return;
		s.KeyboardPanSpeed = speed;
		await BackendAPI.SaveSettings({
			timelineId: currentProject.value.Id,
			pixelsPerSubtick: s.PixelsPerSubtick,
			showGuides: s.ShowGuides,
			displayRadius: s.DisplayRadius,
			isFullscreen: s.IsFullscreen,
			useCustomScaling: s.UseCustomScaling,
			customScale: s.CustomScale,
			layoutPresetId: layoutSettings.value?.Id ?? '',
			panSpeedMultiplier: s.PanSpeedMultiplier,
			panDeadzone: s.PanDeadzone,
			keyboardPanSpeed: speed,
			defaultItemColor: s.DefaultItemColor,
			headerMode: s.HeaderMode,
		});
	}

	async function setFilterRuleState(id: string, state: FilterState) {
		const idx = filterRules.value.findIndex(r => r.Id === id);
		if (idx < 0) return;
		const updated: FilterRule = { ...filterRules.value[idx]!, State: state };
		filterRules.value = filterRules.value.map(r => r.Id === id ? updated : r);
		await BackendAPI.SaveFilterRule(updated);
	}

	async function upsertFilterRule(rule: FilterRule) {
		const idx = filterRules.value.findIndex(r => r.Id === rule.Id);
		if (idx >= 0) {
			filterRules.value = filterRules.value.map(r => r.Id === rule.Id ? rule : r);
		} else {
			filterRules.value = [...filterRules.value, rule].sort((a, b) => a.SortOrder - b.SortOrder);
		}
		await BackendAPI.SaveFilterRule(rule);
	}

	async function deleteFilterRule(id: string) {
		filterRules.value = filterRules.value.filter(r => r.Id !== id);
		await BackendAPI.DeleteFilterRule(id);
	}

	async function setFilterAndMode(mode: boolean) {
		filterAndMode.value = mode;
		await BackendAPI.SetMiscSetting('filter_and_mode', mode ? '1' : '0', currentProject.value?.Id ?? 0);
	}

	async function setFilterDisplayMode(mode: 'hidden' | 'dimmed') {
		filterDisplayMode.value = mode;
		await BackendAPI.SetMiscSetting('filter_display_mode', mode, 0);
	}

	async function setFilterPanelOpen(open: boolean) {
		filterPanelOpen.value = open;
		await BackendAPI.SetMiscSetting('filter_panel_open', open ? '1' : '0', currentProject.value?.Id ?? 0);
	}

	async function loadFilterPresets() {
		const result = await BackendAPI.GetFilterPresets();
		filterPresets.value = result?.presets ?? [];
	}

	async function saveFilterPreset(name: string) {
		const preset: FilterPreset = {
			Id: crypto.randomUUID(),
			Name: name,
			RulesJson: JSON.stringify(filterRules.value.map(r => ({ ...r, TimelineId: 0 }))),
			AndMode: filterAndMode.value ? 1 : 0,
		};
		await BackendAPI.SaveFilterPreset(preset);
		filterPresets.value = [...filterPresets.value, preset];
	}

	async function loadFilterPreset(presetId: string) {
		const preset = filterPresets.value.find(p => p.Id === presetId);
		if (!preset) return;
		const tlId = currentProject.value?.Id ?? 0;
		let rules: FilterRule[] = [];
		try {
			rules = (JSON.parse(preset.RulesJson) as FilterRule[]).map((r, i) => ({
				...r,
				Id: crypto.randomUUID(),
				TimelineId: tlId,
				SortOrder: i,
			}));
		} catch { return; }
		const oldRules = filterRules.value;
		const andMode = preset.AndMode === 1;
		// Persist to DB before updating in-memory state so a failure leaves the store consistent
		await Promise.all(oldRules.map(r => BackendAPI.DeleteFilterRule(r.Id)));
		await Promise.all([
			...rules.map(r => BackendAPI.SaveFilterRule(r)),
			BackendAPI.SetMiscSetting('filter_and_mode', andMode ? '1' : '0', tlId),
		]);
		filterRules.value = rules;
		filterAndMode.value = andMode;
	}

	async function deleteFilterPreset(id: string) {
		filterPresets.value = filterPresets.value.filter(p => p.Id !== id);
		await BackendAPI.DeleteFilterPreset(id);
	}

	function clearAllFilters() {
		filterRules.value = filterRules.value.map(r => ({ ...r, State: 'neutral' as FilterState }));
		filterRules.value.forEach(r => BackendAPI.SaveFilterRule(r));
	}


	function pulseItem(id: string) {
		if (_pulseTimer) clearTimeout(_pulseTimer)
		pulseItemId.value = id
		_pulseTimer = setTimeout(() => { pulseItemId.value = null }, 1400)
	}

	function lodZoomIn(){
		if(!lodProfile.value?.length) return;
		const sorted = [...lodProfile.value].sort((a, b) => a.index - b.index);
		const pos = sorted.findIndex(l => l.index === currentLodIndex.value);
		if (pos < sorted.length - 1) {
			const next = sorted[pos + 1]!;
			currentLodIndex.value = next.index;
			currentLodTitle.value = next.formatKey;
		}
	};

	function lodZoomOut(){
		if(!lodProfile.value?.length) return;
		const sorted = [...lodProfile.value].sort((a, b) => a.index - b.index);
		const pos = sorted.findIndex(l => l.index === currentLodIndex.value);
		if (pos > 0) {
			const prev = sorted[pos - 1]!;
			currentLodIndex.value = prev.index;
			currentLodTitle.value = prev.formatKey;
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
					seasons.push({
						name: s?.name ?? `Season ${i + 1}`,
						start: s?.start ?? 0,
						end: s?.end ?? 0,
						significance: s?.significance,
					})
				}
			}

			const memorableDays: MemDayMarker[] = Array.isArray(yd.memorable_days)
				? (yd.memorable_days as MemDayMarker[])
				: []

			const weekLength: number = yd.week_definition?.length ?? 7
			const yearStartDow: number = yd.year_start_dow ?? 0
			return { yearLength, weekLength, yearStartDow, months, seasons, memorableDays }
		} catch {
			return DEFAULT_CALENDAR_CONFIG
		}
	})

	const activeFormatRegistry = computed((): FormatRegistryType => buildFormatRegistry(calendarConfig.value))

	// Expose everything so Vue components can use them
	return {
		// variables
		items, currentNowYear, centerAbsoluteTime, viewportWidthPx, zoomLevel, settings, layoutSettings, fps, visibleItems, lodProfile, currentLodIndex,
		pastItems, futureItems, filteredItems, dimmableItems, projects, isLoading, title, author, currentProject, calendar, currentLodTitle, hiddenRanges,
		notes, lastDeleted, distanceFrom, distanceTo, notesDistanceTab, showMeasureInTimeline, activeFormatRegistry, calendarConfig,
		allTimelineTags, allTimelineCharacters, allTimelineStories, allTimelineColors,
		itemTagMap, itemCharacterMap, itemStoryMap, itemPictureSet,
		filterRules, filterAndMode, filterDisplayMode, filterPanelOpen, filterPresets,
		pulseItemId, performantPanning, onScreenControls, lowResourceMode, readOnly, reference, referenceError,
		characterFocusId, characterFocus, focusKinItemIds,

		// functions
		loadItems, addItem, upsertItem, removeItem, setNowYear, setVisibleItems, setCenterAbsoluteTime, setViewportWidth, setProjects, loadTimelines, loadTimelineData, loadReference, clearReference, setFpsDisplay, lodZoomIn, lodZoomOut,
		setDistanceFrom, setDistanceTo, setNotesDistanceTab, setShowMeasureInTimeline, setHiddenRanges, setLayoutSettings,
		pulseItem,
		addNote, updateNote, removeNote,
		setLastDeleted, clearLastDeleted, setPerformantPanning, setOnScreenControls, setLowResourceMode, savePanSpeed,
		setFilterRuleState, upsertFilterRule, deleteFilterRule, clearAllFilters,
		setFilterAndMode, setFilterDisplayMode, setFilterPanelOpen,
		loadFilterPresets, saveFilterPreset, loadFilterPreset, deleteFilterPreset,

		// constants
		ItemTypes
	};
});

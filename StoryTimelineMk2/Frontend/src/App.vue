<script setup lang="ts">
	import ProjectContainer from "./components/ProjectContainer.vue";
	import SplashTitle from "./components/SplashTitle.vue";
	import WindowTitleBar from "./components/WindowTitleBar.vue";
	import { BackendAPI } from "./bridge/api";
	import { ref, onMounted } from "vue";
	import { PhTrayArrowUp, PhTrayArrowDown, PhFileArrowDown, PhPlusCircle, PhPlayCircle, PhCalendarDots, PhCalendarBlank, PhGear, PhDatabase } from "@phosphor-icons/vue";
	import { useTimelineStore } from '@/stores/timelineStore';
	import AppSettingsModal from './components/AppSettingsModal.vue';
	import AuthorReminderModal from './components/AuthorReminderModal.vue';
	import SelectCalendarModal from './components/SelectCalendarModal.vue';
	import CalendarManagerModal from './components/CalendarManagerModal.vue';
	import DbImportModal from './components/DbImportModal.vue';
	import ImportTimelineModal from './components/ImportTimelineModal.vue';
	import type { ImportPreview, TimelineImportPreview } from '@/types/models';
	import { useAppTheme } from '@/utils/useAppTheme';

	const store = useTimelineStore();
	useAppTheme();

	const newProjectOpen = ref<boolean>(false)
	const dbMenuOpen = ref<boolean>(false)
	const showAppSettings = ref(false)
	const showCalendarManager = ref(false)
	const newProjectTitle = ref('')
	const hasCustomCal = ref(false)

	const showAuthorModal = ref(false)
	const showCalendarModal = ref(false)
	const pendingTitle = ref('')
	const pendingAuthor = ref('')
	const pendingCalendarId = ref<string | null>(null)

	const dbImportPreview = ref<ImportPreview | null>(null)
	const timelineImportPreview = ref<TimelineImportPreview | null>(null)

	async function HandleImportDatabase() {
		const result = await BackendAPI.BrowseAndPreviewImport()
		if (result?.status === 'ok' && result.preview) {
			dbImportPreview.value = result.preview
		}
	}

	async function executeImport(path: string) {
		const result = await BackendAPI.ExecuteImportDB(path)
		dbImportPreview.value = null
		if (result?.status === 'ok') {
			await HandleGetTimelines()
		} else {
			const msg = result?.message ?? 'No response from the backend — check the application log.'
			console.error('[ImportDB]', msg)
			alert(`Database import failed:\n\n${msg}`)
		}
	}

	async function HandleExportDatabase() {
		await BackendAPI.ExportFullDB()
	}

	async function HandleImportTimeline() {
		const result = await BackendAPI.BrowseAndPreviewTimelineImport()
		if (result?.status === 'ok' && result.preview) {
			timelineImportPreview.value = result.preview
		}
	}

	async function executeTimelineImport(path: string) {
		const result = await BackendAPI.ImportTimeline(path)
		timelineImportPreview.value = null
		if (result?.status === 'ok') {
			await HandleGetTimelines()
		} else {
			const msg = result?.message ?? 'No response from the backend — check the application log.'
			console.error('[ImportTimeline]', msg)
			alert(`Timeline import failed:\n\n${msg}`)
		}
	}

	function toggleDbMenu() {
		dbMenuOpen.value = !dbMenuOpen.value
	}

	async function HandleToggleNewProject() {
		newProjectOpen.value = !newProjectOpen.value;
	}

	async function HandleStartProject() {
		const title = newProjectTitle.value.trim() || 'New Project'
		pendingTitle.value = title
		pendingAuthor.value = localStorage.getItem('lastAuthor') ?? ''
		pendingCalendarId.value = null

		if (!pendingAuthor.value) {
			showAuthorModal.value = true
		} else if (hasCustomCal.value) {
			showCalendarModal.value = true
		} else {
			await doCreateTimeline()
		}
	}

	function onAuthorResult(author: string) {
		showAuthorModal.value = false
		pendingAuthor.value = author
		if (hasCustomCal.value) {
			showCalendarModal.value = true
		} else {
			doCreateTimeline()
		}
	}

	function onCalendarSelected(calId: string) {
		showCalendarModal.value = false
		pendingCalendarId.value = calId
		doCreateTimeline()
	}

	function onCalendarSkipped() {
		showCalendarModal.value = false
		doCreateTimeline()
	}

	async function doCreateTimeline() {
		await BackendAPI.CreateNewProject(
			pendingTitle.value,
			pendingAuthor.value,
			pendingCalendarId.value ?? undefined
		)
		if (pendingAuthor.value) {
			localStorage.setItem('lastAuthor', pendingAuthor.value)
		}
		newProjectTitle.value = ''
		hasCustomCal.value = false
		newProjectOpen.value = false
		await HandleGetTimelines()
	}

	async function HandleGetTimelines() {
		const container = await BackendAPI.GetAllTimelines();
		if(container){
			store.projects = container.data
		}
	}

	onMounted(() => {
		HandleGetTimelines();
	})
</script>


<template>
	<div id="center">
		<WindowTitleBar title="Story Timeline" />
		<SplashTitle />
		<ProjectContainer :timelines="store.projects" @refresh="HandleGetTimelines" />
		<div id="bottom-menu-container">
			<div id="import-export-container">
				<div id="db-menu-container">
					<div @click="toggleDbMenu" :title="dbMenuOpen ? 'Close DB menu' : 'Database'">
						<PhDatabase
							class="button-icon"
							:class="{ 'db-active': dbMenuOpen }"
							:size="36"
							color="#79876b"
						/>
					</div>
					<div id="db-expand" :class="{ open: dbMenuOpen }">
						<div v-on:click="HandleImportDatabase()" title="Import / restore database">
							<PhTrayArrowDown class="button-icon" :size="36" color="#79876b" />
						</div>
						<div v-on:click="HandleExportDatabase()" title="Export full database">
							<PhTrayArrowUp class="button-icon" :size="36" color="#79876b" />
						</div>
						<div v-on:click="HandleImportTimeline()" title="Import timeline (.stlm)">
							<PhFileArrowDown class="button-icon" :size="36" color="#79876b" />
						</div>
					</div>
				</div>
				<div @click="showCalendarManager = true" title="Manage Calendars">
					<PhCalendarBlank class="button-icon" :size="36" color="#79876b" />
				</div>
				<div @click="showAppSettings = true" title="App Settings">
					<PhGear class="button-icon" :size="36" color="#79876b" />
				</div>
			</div>

			<div id="new-project-container" :class="{'open': newProjectOpen}">
				<div v-on:click="HandleToggleNewProject()">
					<PhPlusCircle
						class="button-icon"
						id="new-project-open-button"
						:class="{'open': newProjectOpen}"
						:size="42"
						color="#79876b"
					/>
				</div>

				<div id="new-project-setup">
					<input id="new-project-title" type="text" placeholder="Project name..." v-model="newProjectTitle" />

					<div id="checkbox-div">
						<input name="CustomCal" id="custom-cal" type="checkbox" v-model="hasCustomCal" />
						<label class="cal-icon-label" title="Has custom calendar" for="custom-cal">
							<PhCalendarDots :size="24" />
						</label>
					</div>

					<div id="start-project-button" v-on:click="HandleStartProject()">
						<PhPlayCircle class="button-icon" :size="42" color="#79876b" />
					</div>
				</div>
			</div>
		</div>
	<AppSettingsModal
		v-if="showAppSettings"
		@close="showAppSettings = false"
		@refresh="HandleGetTimelines"
	/>
	<AuthorReminderModal v-if="showAuthorModal" @set="onAuthorResult" @skip="onAuthorResult('')" />
	<SelectCalendarModal v-if="showCalendarModal" @selected="onCalendarSelected" @skipped="onCalendarSkipped" />
	<CalendarManagerModal v-if="showCalendarManager" @close="showCalendarManager = false" />
	<DbImportModal
		v-if="dbImportPreview"
		:preview="dbImportPreview"
		@close="dbImportPreview = null"
		@confirm="executeImport"
	/>
	<ImportTimelineModal
		v-if="timelineImportPreview"
		:preview="timelineImportPreview"
		@close="timelineImportPreview = null"
		@confirm="executeTimelineImport"
	/>
	</div>
</template>

<style scoped lang="scss">

	#center {
		display: flex;
		position: relative;
		flex-direction: column;
		justify-self: stretch;
		align-items: center;
		width: 100%;
		height: 100vh;
	}

	#bottom-menu-container {
		position: relative; /* Changed from inherit for stability */
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		margin-top: 22px;
	}

	#import-export-container {
		display: flex;
		gap: 12px;
		margin-left: 20px;
		align-items: center;
	}

	#db-menu-container {
		display: flex;
		align-items: center;
	}

	#db-expand {
		display: flex;
		gap: 12px;
		width: 0;
		overflow: hidden;
		transition: width 0.35s cubic-bezier(0.25, 1, 0.5, 1), margin-left 0.35s ease;
		margin-left: 0;

		> div {
			opacity: 0;
			transform: translateX(-6px);
			transition: opacity 0.2s ease, transform 0.2s ease;
			pointer-events: none;
		}
	}

	#db-expand.open {
		width: 132px;
		margin-left: 12px;

		> div {
			opacity: 1;
			transform: translateX(0);
			pointer-events: auto;
			transition-delay: 0.15s;
		}
	}

	.db-active {
		filter: brightness(1.4);
	}

	/* Base interactive button styling for all of them */
	.button-icon {
		cursor: pointer;
		transition: transform 0.2s ease, filter 0.2s ease;
	}
	.button-icon:hover {
		filter: brightness(1.1);
		transform: scale(1.05); /* Subtle pop on hover */
		fill: #762f69 !important;
	}

	/* The expanding container */
	#new-project-container {
		display: flex;
		align-items: center;
		margin-right: 20px;
		width: 42px;
		height: 48px;
		overflow: hidden;
		/* This cubic-bezier gives it a sleek, snappy "whip" motion */
		transition: width 0.45s cubic-bezier(0.25, 1, 0.5, 1);
	}

	#new-project-container.open {
		width: 480px; /* Adjusted slightly so it matches standard flex content */
	}

	/* FIXING THE "UNDER THE RUG" SLIDE:
	We wrap the form and fade it in *only* when open, preventing text-squeezing */
	#new-project-setup {
		display: flex;
		align-items: center;
		gap: 15px;
		margin-left: 15px;
		opacity: 0;
		transform: translateX(10px);
		transition: opacity 0.2s ease, transform 0.3s ease;
		pointer-events: none; /* Block clicks while hidden */
	}

	#new-project-container.open #new-project-setup {
		opacity: 1;
		transform: translateX(0);
		pointer-events: auto;
		/* Delay the form fade slightly until the bar is wide enough */
		transition-delay: 0.15s;
	}

	#new-project-setup input[type="text"] {
		font-size: 1.2em; /* 2em was massive, making it hard to fit everything */
		padding: 6px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		outline: none;
		flex-grow: 1;
	}

	/* THE PLUS TO X BUTTON */
	#new-project-open-button {
		cursor: pointer;
		transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy rotation */
	}

	#new-project-open-button.open {
		transform: rotate(45deg);
	}

	/* THE WIGGLE: When it's an X (open), hovering shakes it gently */
	#new-project-open-button.open:hover {
		animation: gentle-wiggle 0.3s ease-in-out infinite alternate;
	}

	@keyframes gentle-wiggle {
		0% { transform: rotate(41deg); }
		100% { transform: rotate(49deg); }
	}

	/* CLEAN CALENDAR CHECKBOX STYLING */
	#checkbox-div {
		display: flex;
		align-items: center;
		position: relative;
	}

	/* Hide the ugly native checkbox completely */
	#custom-cal {
		position: absolute;
		opacity: 0;
		cursor: pointer;
		height: 0;
		width: 0;
	}

	/* Use the label as the button wrapper */
	.cal-icon-label {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		background: #f0f2ee;
		color: #79876b;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	/* Hover state for the fake checkbox button */
	.cal-icon-label:hover {
		background: #e2e7dc;
		box-shadow: 0 0 0 4px rgba(121, 135, 107, 0.15);
	}

	/* Active/Checked State: When the checkbox is checked, light up the label! */
	#custom-cal:checked + .cal-icon-label {
		background: #79876b;
		color: #ffffff;
		border-color: #637056;
	}
</style>

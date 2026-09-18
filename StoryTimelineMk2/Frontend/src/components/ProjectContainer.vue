<template>
	<div id="project-container">
		<template v-for="tl in timelines" :key="tl.Id">
			<div @click="OpenTimeline(tl.Id)" v-if="tl" class="project-timeline-row-container">
				<span class="timeline-color-dot" :style="{ background: tl.Color ?? '#55555566' }"></span>
				<div class="project-timeline-row">{{ tl.Title }}</div>

				<div class="row-action-buttons" @click.stop :class="{ 'visible': openMenuId === tl.Id }">
					<div class="row-action-button ellipsis-button" @click.stop="toggleButtonsVisible(tl.Id)">
						<PhDotsThreeCircle class="button-icon toggle-icon" :size="26" />
					</div>

					<div class="hidden-buttons-group" v-show="openMenuId === tl.Id">
						<div class="row-action-button" title="Edit" @click.stop="openEdit(tl)">
							<PhPencilSimple class="button-icon" :size="24" />
						</div>
						<div class="row-action-button" title="Export" @click.stop="openExport(tl)">
							<PhDatabase class="button-icon" :size="24" />
						</div>
						<div class="row-action-button" title="Duplicate" @click.stop="openDuplicate(tl)">
							<PhCopySimple class="button-icon" :size="24" />
						</div>
						<div class="row-action-button" title="Delete" @click.stop="openDelete(tl)">
							<PhTrashSimple class="button-icon button-icon--danger" :size="24" />
						</div>
					</div>
				</div>
			</div>
		</template>
	</div>

	<!-- Modals -->
	<ConfirmDeleteModal
		v-if="deleteTarget"
		:title="deleteTarget.Title"
		@close="deleteTarget = null"
		@confirm="confirmDelete"
	/>
	<DuplicateTimelineModal
		v-if="duplicateTarget"
		:original-title="duplicateTarget.Title"
		@close="duplicateTarget = null"
		@confirm="confirmDuplicate"
	/>
	<ExportTimelineModal
		v-if="exportTarget"
		:title="exportTarget.Title"
		@close="exportTarget = null"
		@confirm="confirmExport"
	/>
	<EditTimelineModal
		v-if="editTarget"
		:timeline="editTarget"
		@close="editTarget = null"
		@saved="onEdited"
	/>
</template>

<script setup lang="ts">
import type { TimelineProject } from '@/types/models'
import { BackendAPI } from '@/bridge/api'
import { ref } from 'vue'
import { PhPencilSimple, PhDatabase, PhCopySimple, PhTrashSimple, PhDotsThreeCircle } from '@phosphor-icons/vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import DuplicateTimelineModal from './DuplicateTimelineModal.vue'
import ExportTimelineModal from './ExportTimelineModal.vue'
import EditTimelineModal from './EditTimelineModal.vue'

const props = defineProps<{ timelines: TimelineProject[] | null }>()
const emit = defineEmits<{ refresh: [] }>()

const openMenuId = ref<number | null>(null)

function toggleButtonsVisible(id: number) {
	openMenuId.value = openMenuId.value === id ? null : id
}

function OpenTimeline(id: number) {
	BackendAPI.OpenTimeline(id)
}

// ── Modal targets ───────────────────────────────────────────
const deleteTarget    = ref<TimelineProject | null>(null)
const duplicateTarget = ref<TimelineProject | null>(null)
const exportTarget    = ref<TimelineProject | null>(null)
const editTarget      = ref<TimelineProject | null>(null)

function openDelete(tl: TimelineProject)    { openMenuId.value = null; deleteTarget.value = tl }
function openDuplicate(tl: TimelineProject) { openMenuId.value = null; duplicateTarget.value = tl }
function openExport(tl: TimelineProject)    { openMenuId.value = null; exportTarget.value = tl }
function openEdit(tl: TimelineProject)      { openMenuId.value = null; editTarget.value = tl }

// ── Action handlers ─────────────────────────────────────────
async function confirmDelete() {
	if (!deleteTarget.value) return
	await BackendAPI.DeleteTimeline(deleteTarget.value.Id)
	deleteTarget.value = null
	emit('refresh')
}

async function confirmDuplicate(newTitle: string) {
	if (!duplicateTarget.value) return
	await BackendAPI.DuplicateTimeline(duplicateTarget.value.Id, newTitle)
	duplicateTarget.value = null
	emit('refresh')
}

async function confirmExport(includeIds: boolean, includeMedia: boolean) {
	if (!exportTarget.value) return
	await BackendAPI.ExportTimeline(exportTarget.value.Id, includeIds, includeMedia)
	exportTarget.value = null
}

async function onEdited() {
	editTarget.value = null
	emit('refresh')
}
</script>

<style scoped lang="scss">
@import url('https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,400..700;1,400..700&display=swap');

* {
	user-select: none;
	-webkit-user-drag: none;
}

#project-container {
	display: flex;
	flex-direction: column;
	position: relative;
	height: calc(100% - 260px);
	min-height: 200px;
	width: 80vw;
	border: 1px solid #444;
	border-radius: 10px;
	background-color: #55555533;
	font-family: "gelasio";
	font-size: 1.5rem;
	transition-duration: 3s;
	transition-property: box-shadow;
}

#project-container:hover {
	box-shadow: 0 0 300px #2217bb22;
}

.project-timeline-row-container {
	position: relative;
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: 15px 195px 15px 15px;
	gap: 12px;
	transition-duration: .4s;
}

.timeline-color-dot {
	flex-shrink: 0;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	opacity: 0.85;
}

.project-timeline-row-container:nth-child(1) {
	border-top-left-radius: 10px;
	border-top-right-radius: 10px;
}

.project-timeline-row-container:last-child {
	border-bottom-left-radius: 10px;
	border-bottom-right-radius: 10px;
}

.project-timeline-row-container:hover {
	background-color: #5277fb22;
	color: #ba45a4ee;
	cursor: pointer;
	transition-duration: .4s;
}

.row-action-buttons {
	position: absolute;
	right: 15px;
	top: 50%;
	transform: translateY(-50%);
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: flex-end;
	overflow: hidden;

	width: 34px;
	height: 34px;
	padding: 2px;
	border-radius: 20px;

	transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.2s;
}

.row-action-buttons.visible {
	width: 140px;
	background-color: rgba(121, 135, 107, 0.1);
}

.ellipsis-button {
	order: 2;
	z-index: 10;
	flex-shrink: 0;
}

.hidden-buttons-group {
	display: flex;
	flex-direction: row;
	align-items: center;
	order: 1;
	gap: 4px;

	opacity: 0;
	transform: translateX(15px);
	transition: opacity 0.15s ease 0s, transform 0.2s ease 0s;
}

.row-action-buttons.visible .hidden-buttons-group {
	opacity: 1;
	transform: translateX(0);
	transition: opacity 0.25s ease 0.1s, transform 0.25s ease 0.1s;
}

.row-action-button {
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
}

.button-icon {
	fill: #79876b;
	color: #79876b;
	padding: 4px;
	border-radius: 20px;
	transition: all 0.2s ease;

	&:hover {
		background-color: rgba(121, 135, 107, 0.2);
		border-radius: 20px;
		color: #ba45a4;
		fill: #ba45a4;
	}

	&.button-icon--danger:hover {
		color: #f87171;
		fill: #f87171;
		background-color: rgba(239, 68, 68, 0.15);
	}
}

.row-action-buttons.visible .toggle-icon {
	transform: rotate(90deg);
	color: #ba45a4;
}
</style>

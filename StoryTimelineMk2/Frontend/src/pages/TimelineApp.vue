<script setup lang="ts">
// imports
import { useTimelineStore } from '@/stores/timelineStore'
import { PhArrowArcRight, PhGear, PhMinusCircle, PhPlusCircle, PhSpinner, PhWarningCircle } from '@phosphor-icons/vue'
import TimelineActionsMenu from '@/components/TimelineActionsMenu.vue'
import { Splitpanes, Pane } from 'splitpanes'
import { ref, onMounted, onBeforeUnmount } from 'vue';
import TimelineCanvas from "@/components/TimelineCanvas.vue";
import TimelineSettingsModal from "@/components/TimelineSettingsModal.vue";
import TimelineNotesPanel from "@/components/TimelineNotesPanel.vue";
import TimelineDataPanel from "@/components/TimelineDataPanel.vue";
import TimelineGalleryPanel from "@/components/TimelineGalleryPanel.vue";
import TimelineMinimap from "@/components/TimelineMinimap.vue";
import TimelineItemViewModal from "@/components/TimelineItemViewModal.vue";
import { BackendAPI } from '@/bridge/api';

const store = useTimelineStore()

const loadError = ref<boolean>(false)
const timelineCanvasRef = ref();
const showSettings = ref(false);
const viewItemId = ref<string | null>(null);
const lightboxUrl = ref<string | null>(null);

function onItemClick(itemId: string) {
    BackendAPI.send('OpenAddEditItemWindow', {
        timelineId: store.currentProject?.Id,
        itemId,
    })
}

async function onViewItem(itemId: string) {
    const storeItem = store.items.find((i: { Id?: string; id?: string; TypeId?: number }) => (i.Id ?? i.id) === itemId);
    if (storeItem?.TypeId === 4) {
        const data = await BackendAPI.GetItemForEdit(store.currentProject!.Id, itemId, 4);
        const fp = data?.Pictures?.[0]?.FilePath;
        if (fp) lightboxUrl.value = `https://media.app/${fp}`;
    } else {
        viewItemId.value = itemId;
    }
}

function onAddItem(typeId: number, absoluteTime: number, lodIndex: number) {
    BackendAPI.send('OpenAddEditItemWindow', {
        timelineId: store.currentProject?.Id,
        typeId,
        year: absoluteTime,
        granularity: lodIndex,
    })
}

async function undoDelete() {
    const d = store.lastDeleted;
    if (!d) return;
    const result = await BackendAPI.SaveItem(d.item, d.tagNames, d.characterAppearances, d.storyRefs, d.chapterRefs);
    if (result?.status === 'ok') {
        store.addItem(d.item);
        store.clearLastDeleted();
    }
}

// functions
async function HandleLoadTimeline() {
	// 1. Grab the ID from the WebView2 URL (e.g., ?id=5) passed by C#
	const urlParams = new URLSearchParams(window.location.search)
	const idParam = urlParams.get('id')


	if (idParam) {
    const timelineId = parseInt(idParam, 10)

		await store.loadTimelineData(timelineId)
	} else {
		loadError.value = true
	}
}

let scheduled:boolean = false;
let throttleTimer:number = -1;
let debounceTimer:number;

function jump() {
	const input = document.querySelector("#jump-to-year-input") as HTMLInputElement | null;
	if(input){
		if(store.layoutSettings?.TimelineAnimateOnJumpToYear){
			timelineCanvasRef.value.animateJumpToYear(input.valueAsNumber);
		} else {
			timelineCanvasRef.value.jumpToYear(input.valueAsNumber);
		}
	}
}

function handleResizeEvent(){
	if(timelineCanvasRef.value){
		if (!scheduled) {
			scheduled = true;

			requestAnimationFrame(() => {
				scheduled = false;
				if (throttleTimer == -1) {
					timelineCanvasRef.value.updateStageSize(timelineCanvasRef.value.gridLayer, timelineCanvasRef.value.uiLayer);
					throttleTimer = setTimeout(() => {
						throttleTimer = -1;
						return;
					}, 100);
				}

				// Debounce: final update after resize ends
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					timelineCanvasRef.value.updateStageSize(timelineCanvasRef.value.gridLayer, timelineCanvasRef.value.uiLayer);
				}, 100);
			});
		}
	}
}

function onMinimapJump(year: number) {
    if (store.layoutSettings?.TimelineAnimateOnJumpToYear) {
        timelineCanvasRef.value?.animateJumpToYear(year);
    } else {
        timelineCanvasRef.value?.jumpToYear(year);
    }
}

function onHotkey(e: KeyboardEvent) {
    if (e.key === 'F11') {
        e.preventDefault()
        BackendAPI.send('ToggleFullscreen', { timelineId: store.currentProject?.Id })
    } else if (e.key === 'F10') {
        e.preventDefault()
        BackendAPI.send('ToggleCustomScaling', { timelineId: store.currentProject?.Id })
    }
}

onMounted(() => {
	HandleLoadTimeline();
	window.onresize = function(){
		handleResizeEvent();
	}
    window.addEventListener('keydown', onHotkey)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onHotkey)
})
</script>

<template>
	<div id="timeline-center">
		<div v-if="store.isLoading && !loadError" id="status-container">
			<PhSpinner class="spinner-icon" :size="48" color="#79876b" />
			<h2>Loading Timeline Data...</h2>
		</div>

		<div v-else-if="loadError" id="status-container">
			<PhWarningCircle :size="48" color="#ff4d4d" />
			<h2>Critical Error: No Timeline ID provided by the host window.</h2>
		</div>

		<div v-else id="timeline-workspace">
    <div id="timeline-header">
        <div class="timeline-header-spacer"></div>
        <div id="timeline-header-info-container">
            <h1>{{ store.title }}</h1>
            <h2>{{ store.author }}</h2>
        </div>
        <div class="timeline-header-actions">
            <TimelineActionsMenu />
            <button class="header-icon-btn" title="Settings" @click="showSettings = true">
                <PhGear :size="22" />
            </button>
        </div>
        <div
            v-if="store.currentProject?.Color"
            class="timeline-header-color-strip"
            :style="{ background: store.currentProject.Color }"
        ></div>
    </div>

    <TimelineSettingsModal
        v-if="showSettings"
        :settings="store.settings"
        :layout-settings="store.layoutSettings"
        @close="showSettings = false"
    />

    <Splitpanes horizontal class="timeline-splitpanes-wrapper" @resize="handleResizeEvent();">

        <Pane id="timeline-data" :size="40" min-size="20" max-size="70">
            <Splitpanes>
                <Pane id="timeline-data-images" class="timeline-data-block" :size="27">
                    <TimelineGalleryPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
                <Pane id="timeline-data-notes" class="timeline-data-block" :size="27">
                    <TimelineNotesPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
                <Pane id="timeline-data-contents" class="timeline-data-block" :size="46">
                    <TimelineDataPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
            </Splitpanes>
        </Pane>

		<!-- MAIN PANEL -->
        <Pane id="timeline-main" size="80" :style="{backgroundColor:store.layoutSettings?.TimelineCanvasBackgroundColor}">
			<TimelineCanvas
				ref="timelineCanvasRef"
				:timeline-items="store.items"
				:timeline-settings="store.settings ?? null"
				:timeline-info="store.currentProject"
				:layout-settings="store.layoutSettings ?? null"
				@item-click="onItemClick"
				@view-item="onViewItem"
				@add-item="onAddItem"
			></TimelineCanvas>
        </Pane>

    </Splitpanes>

    <div id="timeline-overview">
        <TimelineMinimap @jump-to-year="onMinimapJump" />
    </div>

    <!-- Item view modal -->
    <TimelineItemViewModal
        v-if="viewItemId && store.currentProject"
        :item-id="viewItemId"
        :timeline-id="store.currentProject.Id"
        @close="viewItemId = null"
    />

    <!-- Picture lightbox -->
    <Teleport to="body">
        <div v-if="lightboxUrl" class="picture-lightbox-backdrop" @click="lightboxUrl = null">
            <img :src="lightboxUrl" class="picture-lightbox-img" @click.stop />
        </div>
    </Teleport>

	<div id="timeline-nav">
		<div id="undo-delete-bar" v-if="store.lastDeleted">
			<span class="undo-text">Undo deletion of <em>"{{ store.lastDeleted.item.Title }}"</em></span>
			<button class="undo-btn" @click="undoDelete">↩ Undo</button>
			<button class="undo-dismiss" @click="store.clearLastDeleted">✕</button>
		</div>
		<div id="timeline-nav-container">
			<p>Jump to year</p>
			<input id="jump-to-year-input" type="number" :step="1" :value="store.currentNowYear" />
			<div id="jump-to-year-button" class="button default" @click="jump"><PhArrowArcRight :size="32" /></div>
		</div>

		<div id="timeline-lod-container">
			<div class="button" @click="store.lodZoomOut"><PhMinusCircle :size="32" /></div>
			<p>LoD level: {{ store.currentLodTitle }}</p>
			<div class="button" @click="store.lodZoomIn"><PhPlusCircle :size="32" /></div>
		</div>
	</div>

    <div id="timeline-info">
		<div id="timeline-info-left">
			<p>Current year: {{ store.currentNowYear }}</p> <p>Items loaded: {{ store.items.length }}</p> <p>Items visible: {{ store.visibleItems }}</p>
		</div>

		<div id="timeline-info-right">
			<p>FPS: {{ store.fps }}</p>
		</div>
	</div>
</div>
	</div>
</template>

<style scoped lang="scss">
#timeline-center {
	display: flex;
	position: relative;
	flex-direction: column;
	justify-content: stretch;
	align-items: center;
	width: 100%;
	height: 100vh;
	background-color: #0f172a; /* Adjust to match your App.vue theme */
}

#status-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	color: #79876b;

	h2 {
		margin-top: 1rem;
		font-family: sans-serif;
	}
}

.spinner-icon {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	100% {
		transform: rotate(360deg);
	}
}

#timeline-workspace {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
}

#timeline-header {
	position: relative;
	display: flex;
	width: 100%;
	height: auto !important;
	background-color: #2a2a2a66;
	border-bottom: 1px solid #333;
	color: #fff;
	align-items: center;

	.timeline-header-spacer,
	.timeline-header-actions {
		flex: 0 0 80px;
	}

	.timeline-header-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding-right: 8px;
	}

	#timeline-header-info-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	h1, h2 {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		margin: 6px auto;
	}

	h2 {
		font-size: medium;
		font-style: italic;
	}

	h2::before {
		content: url("data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjZmZmIiB3aWR0aD0iMzAiIGhlaWdodD0iMjAiIHZpZXdCb3g9Ii0xIDIgMjAgMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcvPjxnIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjx0aXRsZT5lbWRhc2g8L3RpdGxlPjxwYXRoIGQ9Ik0xOS42NTYgMTIuOTA2djIuMjgxSC0uNDM4di0yLjI4MXoiLz48L3N2Zz4=");
	}

	.header-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #aaa;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: color 0.15s, background 0.15s;

		&:hover {
			color: #fff;
			background: #ffffff18;
		}
	}
}

/* 1. Constrain the parent and establish a flex column */
#timeline-workspace {
    display: flex;
    flex-direction: column;
    height: 100vh; /* Adjust to 100% if this sits inside another constrained wrapper */
    overflow: hidden;
}

/* 2. Force the Splitpanes wrapper to absorb the exact remaining space */
.timeline-splitpanes-wrapper {
    flex-grow: 1;
    min-height: 0; /* Critical: prevents nested flex items from expanding beyond the container */
}

/* 3. Lock the static elements so they don't get squished by Flexbox */
#timeline-header {
    flex-shrink: 0;
}

#timeline-info {
	display: flex;
    background-color: #404d6b88;
    height: 40px !important;
    flex-shrink: 0;
	justify-content: space-between;
	user-select: none;

	#timeline-info-left{
		display: flex;
		flex-direction: row;
		gap: 5px;
		margin-left: 10px;
	}

	#timeline-info-right {
		display: flex;
		flex-direction: row;
		margin-right: 10px;
	}

}

#timeline-nav {
	display: flex;
	flex-direction: row;
    background-color: #446b4088;
    height: 40px !important;
    flex-shrink: 0;
	user-select: none;
}

#undo-delete-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 12px;
	margin: auto 0;
	flex-shrink: 0;

	.undo-text {
		font-size: 0.85em;
		color: #fde68a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 280px;

		em {
			font-style: italic;
			color: #fbbf24;
		}
	}

	.undo-btn {
		background: #d97706;
		color: #fff;
		border: none;
		border-radius: 4px;
		padding: 3px 10px;
		font-size: 0.82em;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s;

		&:hover { background: #b45309; }
	}

	.undo-dismiss {
		background: transparent;
		color: #9ca3af;
		border: none;
		cursor: pointer;
		font-size: 0.9em;
		padding: 2px 4px;
		line-height: 1;

		&:hover { color: #fff; }
	}
}

#timeline-nav-container {
	position: relative;
	display: flex;
	flex-direction: row;
	justify-content: center;
	align-items: center;
	margin: auto;
	bottom: 5px;
	gap: 4px;

	input {
		height: 20px;
		align-items: center;
		align-self: center;
		width: 100px;
		font-size: 1.6em;
	}
}

#timeline-lod-container {
	position: relative;
	display: flex;
	flex-direction: row;
	align-items: center;
	margin: auto 10px ;
	bottom: 5px;
	gap: 4px;

	.button {
		padding: 2px 2px 0;
	}
}

#timeline-overview {
    height: 100px !important;
    flex-shrink: 0;
    border-top: 2px solid #00000033;
    box-shadow: inset 0 4px 8px #00000018;
}

/* 4. Let the inner splitpanes handle the height */
#timeline-data .timeline-data-block {
    height: 100%;
}

#canvas-container {
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
}

/* Global Splitpanes Styling */
.splitpanes__splitter {
    background: transparent;
    position: relative;
    background: #fefefe33;
}

.splitpanes--horizontal > .splitpanes__splitter {
    height: 8px;
    cursor: row-resize;
}

.splitpanes--vertical > .splitpanes__splitter {
    width: 8px;
    cursor: col-resize;
}

#jump-to-year-button {
	scale: .8;
}

.timeline-header-color-strip {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    pointer-events: none;
}

.picture-lightbox-backdrop {
    position: fixed;
    inset: 0;
    background: #000000cc;
    z-index: 9500;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
}

.picture-lightbox-img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 6px;
    box-shadow: 0 8px 60px #00000099;
    cursor: default;
}
</style>

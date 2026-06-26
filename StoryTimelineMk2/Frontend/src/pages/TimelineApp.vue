<script setup lang="ts">
// imports
import { useTimelineStore } from '@/stores/timelineStore'
import { PhArrowArcRight, PhMinusCircle, PhPlusCircle, PhSpinner, PhWarningCircle } from '@phosphor-icons/vue'
import { Splitpanes, Pane } from 'splitpanes'
import { ref, onMounted } from 'vue';
import TimelineCanvas from "@/components/TimelineCanvas.vue" ;
import { BackendAPI } from '@/bridge/api';

const store = useTimelineStore()

const loadError = ref<boolean>(false)
const timelineCanvasRef = ref();

function onItemClick(itemId: string) {
    BackendAPI.send('OpenAddEditItemWindow', {
        timelineId: store.currentProject?.Id,
        itemId,
    })
}

function onAddItem(typeId: number, year: number) {
    BackendAPI.send('OpenAddEditItemWindow', {
        timelineId: store.currentProject?.Id,
        typeId,
        year,
    })
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
	const input = document.querySelector("#jump-to-year-input");
	if(input){
		if(store.layoutSettings?.TimelineAnimateOnJumpToYear){
			timelineCanvasRef.value.animateJumpToYear(input.value);
		} else {
			timelineCanvasRef.value.jumpToYear(input.value);
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

onMounted(() => {
	HandleLoadTimeline();
	window.onresize = function(){
		handleResizeEvent();
	}
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
        <div id="timeline-header-info-container">
            <h1>{{ store.title }}</h1>
            <h2>{{ store.author }}</h2>
        </div>
    </div>

    <Splitpanes horizontal class="timeline-splitpanes-wrapper" @resize="handleResizeEvent();">

        <Pane id="timeline-data" :size="40" min-size="20" max-size="70">
            <Splitpanes >
                <Pane id="timeline-data-images" class="timeline-data-block" :size="27">

				</Pane>
                <Pane id="timeline-data-notes" class="timeline-data-block" :size="27">

				</Pane>
                <Pane id="timeline-data-contents" class="timeline-data-block" :size="46">

				</Pane>
            </Splitpanes>
        </Pane>

		<!-- MAIN PANEL -->
        <Pane id="timeline-main" size="80" :style="{backgroundColor:store.layoutSettings?.TimelineCanvasBackgroundColor}">
			<TimelineCanvas
				ref="timelineCanvasRef"
				:timeline-items="store.items"
				:timeline-settings="store.settings"
				:timeline-info="store.currentProject"
				:layout-settings="store.layoutSettings"
				@item-click="onItemClick"
				@add-item="onAddItem"
			></TimelineCanvas>
        </Pane>

    </Splitpanes>

    <div id="timeline-overview">

	</div>

	<div id="timeline-nav">
		<div id="timeline-nav-container">
			<p>Jump to year</p>
			<input id="jump-to-year-input" type="number" :step="1" :value="0" />
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
	display: flex;
	width: 100%;
	height: auto !important;
	background-color: #2a2a2a66; /* Adjust to your theme */
	border-bottom: 1px solid #333;
	color: #fff;
	justify-content: center;

	h1, h2 {
		display: flex;
		justify-content: center;
		align-items: center;
		align-self: center;
		align-content: center;
		width: 100%;
		margin: 10px auto;
	}

	h2 {
		font-size: medium;
		font-style: italic;
		margin-left: 17%;
	}

	h2::before {
		content: url("data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjZmZmIiB3aWR0aD0iMzAiIGhlaWdodD0iMjAiIHZpZXdCb3g9Ii0xIDIgMjAgMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcvPjxnIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjx0aXRsZT5lbWRhc2g8L3RpdGxlPjxwYXRoIGQ9Ik0xOS42NTYgMTIuOTA2djIuMjgxSC0uNDM4di0yLjI4MXoiLz48L3N2Zz4=");
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
    background-color: #6b564088;
    height: 100px !important;
    flex-shrink: 0;
}

#timeline-main {
    __background-color: #6b406188;
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

#timeline-data-images {

}

#timeline-data-notes {

}

#timeline-data-contents {

}
</style>

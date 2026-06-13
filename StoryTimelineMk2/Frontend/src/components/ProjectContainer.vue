<template>
		<div id="project-container">
				<template v-for="tl in timelines" :key="tl.Id">
						<div @click="OpenTimeline(tl['Id']);" v-if="tl" class="project-timeline-row-container">
							<div class="project-timeline-row">{{ tl["Title"] }}</div>

							<div class="row-action-buttons" @click="buttonRowClicked()" :class="{ 'visible': buttonsVisible }">
								<div class="row-action-button ellipsis-button" @click.stop="toggleButtonsVisible">
									<PhDotsThreeCircle class="button-icon toggle-icon" :size="26" />
								</div>

								<div class="hidden-buttons-group" v-show="buttonsVisible">
									<div class="row-action-button" title="Edit">
										<PhPencilSimple class="button-icon" :size="24" />
									</div>
									<div class="row-action-button" title="Export">
										<PhDatabase class="button-icon" :size="24" />
									</div>
									<div class="row-action-button" title="Duplicate">
										<PhCopySimple class="button-icon" :size="24" />
									</div>
									<div class="row-action-button" title="Remove">
										<PhTrashSimple class="button-icon" :size="24" />
									</div>
								</div>
							</div>
						</div>
				</template>
		</div>
</template>

<script setup lang="ts">
	// 1. Add 'setup' to the script tag

	// 2. Define the exact shape of your incoming data using TypeScript
	import type { TimelineProject } from '@/types/models';
	import { BackendAPI } from "@/bridge/api"
	import { ref, watch } from 'vue';
	import { PhPencilSimple, PhDatabase, PhCopySimple, PhTrashSimple, PhDotsThreeCircle } from "@phosphor-icons/vue";

	// 3. Declare the prop. 
	// You don't need to assign it to a local variable. Vue handles the reactivity automatically.
	const props = defineProps<{
		timelines: TimelineProject[]|null
	}>();

	const buttonsVisible = ref<boolean>(false);

	function toggleButtonsVisible() {
		buttonsVisible.value = !buttonsVisible.value;
	}

	function buttonRowClicked(){
		console.log("click")
		event?.stopPropagation();
	}

	function OpenTimeline(id:number) {
		BackendAPI.OpenTimeline(id);
	}

	watch(() => props.timelines, (newVal) => {
		console.log("The parent updated the timelines!", newVal);
	});
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
		display: flex;
		flex-direction: row;
		padding: 15px;
		justify-content: space-between;
		transition-duration: .4s;
	}

	.project-timeline-row-container:nth-child(1){
		border-top-left-radius: 10px;
		border-top-right-radius: 10px;
	}

	.project-timeline-row-container:last-child{
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
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-end;
		position: relative;
		overflow: hidden;
		
		/* Initial state: Just wide enough for the single ellipsis button */
		width: 34px;
		height: 34px;
		padding: 2px;
		border-radius: 20px;
		
		/* Smooth container expansion */
		transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.2s;
	}

	.row-action-buttons.visible {
		width: 175px; 
		background-color: rgba(121, 135, 107, 0.1); /* Optional background track track */
	}

	/* THE ANCHOR: Forces the toggle button to stick to the absolute right side */
	.ellipsis-button {
		order: 2; 
		z-index: 10;
		flex-shrink: 0;
	}

	/* THE SLIDER: Holds the action items and glides out to the left */
	.hidden-buttons-group {
		display: flex;
		flex-direction: row;
		align-items: center;
		order: 1;
		gap: 4px;
		
		/* Start invisible and slightly shifted right */
		opacity: 0;
		transform: translateX(15px);
		
		/* CLOSING TRANSITION: Fade out instantly with 0s delay */
		transition: opacity 0.15s ease 0s, transform 0.2s ease 0s;
	}

	/* OPENED STATE TRANSITION */
	.row-action-buttons.visible .hidden-buttons-group {
		opacity: 1;
		transform: translateX(0);
		
		/* OPENING TRANSITION: Wait 0.1s for width expansion to begin before showing icons */
		transition: opacity 0.25s ease 0.1s, transform 0.25s ease 0.1s;
	}

	/* GENERAL ICON HOVER EFFECTS */
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
	}

	.button-icon:hover {
		background-color: rgba(121, 135, 107, 0.2);
		
		border-radius: 20px;
		color: #ba45a4;
		fill: #ba45a4;
	}

	/* Visual polish: Rotate the ellipsis icon 90 degrees when open */
	.row-action-buttons.visible .toggle-icon {
		transform: rotate(90deg);
		color: #ba45a4;
	}

</style>
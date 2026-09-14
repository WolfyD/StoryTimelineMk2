<script setup lang="ts">
// imports
import { useTimelineStore } from '@/stores/timelineStore'
import NotificationContainer from '@/components/NotificationContainer.vue'
import { PhArrowArcRight, PhMinusCircle, PhPlusCircle, PhSpinner, PhWarningCircle } from '@phosphor-icons/vue'
import TimelineActivityStrip from '@/components/TimelineActivityStrip.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import TimelineActionsMenu from '@/components/TimelineActionsMenu.vue'
import TimelineFilterPanel from '@/components/TimelineFilterPanel.vue'
import TimelineFilterSetupModal from '@/components/TimelineFilterSetupModal.vue'
import { Splitpanes, Pane } from 'splitpanes'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { TimelineItem } from '@/types/models';
import TimelineCanvas from "@/components/TimelineCanvas.vue";
import TimelineSettingsModal from "@/components/TimelineSettingsModal.vue";
import TimelineNotesPanel from "@/components/TimelineNotesPanel.vue";
import TimelineDataPanel from "@/components/TimelineDataPanel.vue";
import TimelineGalleryPanel from "@/components/TimelineGalleryPanel.vue";
import TimelineMinimap from "@/components/TimelineMinimap.vue";
import TimelineItemViewModal from "@/components/TimelineItemViewModal.vue";
import { BackendAPI } from '@/bridge/api';
import { useAppTheme } from '@/utils/useAppTheme';

const store = useTimelineStore()
useAppTheme()

const loadError = ref<boolean>(false)
const timelineCanvasRef = ref();
const showSettings = ref(false);
const showFilterSetup = ref(false);
const viewItemId = ref<string | null>(null);
const lightboxUrl = ref<string | null>(null);

const isMinimised = ref(false)
const miniHoverState = ref<{ item: TimelineItem; x: number; y: number } | null>(null)

async function toggleMiniMode() {
    isMinimised.value = !isMinimised.value
    if (store.currentProject?.Id) {
        await BackendAPI.SaveTimelineMinimised(store.currentProject.Id, isMinimised.value)
    }
}

function onMiniHover(payload: { item: TimelineItem; x: number; y: number } | null) {
    miniHoverState.value = payload
}

const jumpYear = ref(Math.round(store.currentNowYear))
const jumpInputRef = ref<HTMLInputElement | null>(null)

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
    const year = jumpYear.value
    // Number.isFinite: v-model.number yields '' when cleared, and global
    // isFinite('') coerces to 0 → jumped to year 0 on empty input.
    if (!Number.isFinite(year)) return
    if (store.layoutSettings?.TimelineAnimateOnJumpToYear) {
        timelineCanvasRef.value?.animateJumpToYear(year, store.layoutSettings.TimelineJumpToYearAnimationLength)
    } else {
        timelineCanvasRef.value?.jumpToYear(year)
    }
}

const navStyle = computed(() => {
    const ls = store.layoutSettings
    if (!ls) return {}
    return {
        '--nav-bg':     ls.TimelineCanvasBackgroundColor || '#0f172a',
        '--nav-border': ls.TimelineAxisColor             || '#334155',
        '--nav-text':   ls.TimelineTickMarkerTextColor    || '#94a3b8',
    }
})

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
        timelineCanvasRef.value?.animateJumpToYear(year, store.layoutSettings.TimelineJumpToYearAnimationLength);
    } else {
        timelineCanvasRef.value?.jumpToYear(year);
    }
}

async function onShiftComplete(delta: number) {
    const targetYear = store.currentNowYear + delta;
    await store.loadTimelineData(store.currentProject!.Id);
    timelineCanvasRef.value?.animateJumpToYear(targetYear, store.layoutSettings?.TimelineJumpToYearAnimationLength ?? 600);
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

onMounted(async () => {
	HandleLoadTimeline();
	const cfg = await BackendAPI.GetAppConfig();
	if (cfg) store.setPerformantPanning(cfg.performantPanning ?? true);
	// addEventListener (not window.onresize =) so nothing else gets clobbered
	// and the handler can be removed symmetrically on unmount.
	window.addEventListener('resize', handleResizeEvent)
    window.addEventListener('keydown', onHotkey)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResizeEvent)
    window.removeEventListener('keydown', onHotkey)
    clearTimeout(throttleTimer)
    clearTimeout(debounceTimer)
})
</script>

<template>
	<div id="timeline-center">
		<WindowTitleBar :title="store.title || 'Story Timeline'" />
		<div v-if="store.isLoading && !loadError" id="status-container">
			<PhSpinner class="spinner-icon" :size="48" color="#79876b" />
			<h2>Loading Timeline Data...</h2>
		</div>

		<div v-else-if="loadError" id="status-container">
			<PhWarningCircle :size="48" color="#ff4d4d" />
			<h2>Critical Error: No Timeline ID provided by the host window.</h2>
		</div>

		<div v-else id="timeline-layout">
            <TimelineActivityStrip
                :filter-active="store.filterPanelOpen"
                :mini-mode="isMinimised"
                @toggle-filter="store.setFilterPanelOpen(!store.filterPanelOpen)"
                @toggle-mini="toggleMiniMode"
                @open-settings="showSettings = true"
            >
                <template #actions>
                    <TimelineActionsMenu @shift-complete="onShiftComplete" />
                </template>
            </TimelineActivityStrip>

            <div id="timeline-workspace">
    <div id="timeline-header">
        <div id="timeline-header-info-container">
            <h1>{{ store.title }}</h1>
            <h2>{{ store.author }}</h2>
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

    <TimelineFilterPanel
        v-if="store.filterPanelOpen"
        @open-setup="showFilterSetup = true"
    />

    <TimelineFilterSetupModal
        v-if="showFilterSetup"
        @close="showFilterSetup = false"
    />

    <!-- Normal mode: full horizontal splitpanes -->
    <template v-if="!isMinimised">
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
				:timeline-items="store.filteredItems"
				:dimmed-items="store.dimmableItems"
				:timeline-settings="store.settings ?? null"
				:timeline-info="store.currentProject"
				:layout-settings="store.layoutSettings ?? null"
				:mini-mode="false"
				@item-click="onItemClick"
				@view-item="onViewItem"
				@add-item="onAddItem"
			></TimelineCanvas>
        </Pane>

    </Splitpanes>
    </template>

    <!-- Mini mode: data panels + 100px canvas rail -->
    <template v-else>
    <div class="mini-timeline-layout">
        <div class="mini-data-area">
            <Splitpanes>
                <Pane id="timeline-data-images" class="timeline-data-block" :size="12">
                    <TimelineGalleryPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
                <Pane id="timeline-data-notes" class="timeline-data-block" :size="13">
                    <TimelineNotesPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
                <Pane id="timeline-data-contents" class="timeline-data-block" :size="75">
                    <TimelineDataPanel :layout-settings="store.layoutSettings ?? null" />
                </Pane>
            </Splitpanes>
        </div>
        <div class="mini-rail" :style="{ backgroundColor: store.layoutSettings?.TimelineCanvasBackgroundColor }">
            <TimelineCanvas
                ref="timelineCanvasRef"
                :timeline-items="store.filteredItems"
                :dimmed-items="store.dimmableItems"
                :timeline-settings="store.settings ?? null"
                :timeline-info="store.currentProject"
                :layout-settings="store.layoutSettings ?? null"
                :mini-mode="true"
                @item-click="onItemClick"
                @view-item="onViewItem"
                @add-item="onAddItem"
                @mini-hover="onMiniHover"
            ></TimelineCanvas>
        </div>
    </div>
    </template>

    <div id="timeline-overview">
        <TimelineMinimap @jump-to-year="onMinimapJump" />
    </div>

    <!-- Item view modal -->
    <TimelineItemViewModal
        v-if="viewItemId && store.currentProject"
        :item-id="viewItemId"
        :timeline-id="store.currentProject.Id"
        :layout-settings="store.layoutSettings ?? null"
        @close="viewItemId = null"
    />

    <!-- Picture lightbox -->
    <Teleport to="body">
        <div v-if="lightboxUrl" class="picture-lightbox-backdrop" @click="lightboxUrl = null">
            <img :src="lightboxUrl" class="picture-lightbox-img" @click.stop />
        </div>
    </Teleport>

    <!-- Mini mode item tooltip -->
    <Teleport to="body">
        <div
            v-if="miniHoverState"
            class="mini-hover-tooltip"
            :style="{ left: miniHoverState.x + 12 + 'px', top: miniHoverState.y - 28 + 'px' }"
        >{{ miniHoverState.item.Title }}</div>
    </Teleport>

	<div id="timeline-nav" :style="navStyle">
		<div id="undo-delete-bar" v-if="store.lastDeleted">
			<span class="undo-text">Undo deletion of <em>"{{ store.lastDeleted.item.Title }}"</em></span>
			<button class="undo-btn" @click="undoDelete">↩ Undo</button>
			<button class="undo-dismiss" @click="store.clearLastDeleted">✕</button>
		</div>
		<div id="timeline-nav-container">
			<p>Jump to year</p>
			<input
                ref="jumpInputRef"
                id="jump-to-year-input"
                type="number"
                step="1"
                min="-2147483648"
                max="2147483647"
                v-model.number="jumpYear"
                @keydown.enter="jump"
            />
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
			<p>Current year: {{ store.currentNowYear }}</p>
			<p>Items: {{ store.filteredItems.length }}<span v-if="store.filteredItems.length !== store.items.length"> / {{ store.items.length }}</span></p>
			<p>Visible: {{ store.visibleItems }}</p>
		</div>

		<div id="timeline-info-right">
			<p>FPS: {{ store.fps }}</p>
		</div>
	</div>
</div><!-- end #timeline-workspace -->
        </div><!-- end #timeline-layout -->
	</div>
	<NotificationContainer />
</template>

<style scoped lang="scss">
#timeline-center {
	display: flex;
	position: relative;
	flex-direction: column;
	align-items: stretch;
	width: 100%;
	height: 100vh;
	background-color: #0f172a;
}

#timeline-layout {
	flex: 1;
	min-height: 0;
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

// Row wrapper: strip + workspace side by side
#timeline-layout {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
}

#timeline-workspace {
	display: flex;
	flex-direction: column;
    flex: 1;
    min-width: 0;
	height: 100%;
}

#timeline-header {
	position: relative;
	display: flex;
	width: 100%;
	height: auto !important;
	background: color-mix(in srgb, var(--app-bg, #060c19) 75%, transparent);
	border-bottom: 1px solid var(--app-border, #2d3a56);
	color: var(--app-text, #e2e8f0);
	align-items: center;

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
		color: var(--app-text-muted, #94a3b8);
	}

	h2::before {
		content: "—";
		margin-right: 6px;
		font-style: normal;
		opacity: 0.6;
	}
}

/* 1. Constrain the parent and establish a flex column */
#timeline-workspace {
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
    background: var(--app-surface-raised, #141e33);
    border-top: 1px solid var(--app-border, #2d3a56);
    color: var(--app-text, #e2e8f0);
    height: 40px !important;
    flex-shrink: 0;
	justify-content: space-between;
	user-select: none;
    font-size: 0.8em;

	#timeline-info-left{
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px;
		margin-left: 10px;
		color: var(--app-text-muted, #94a3b8);
	}

	#timeline-info-right {
		display: flex;
		flex-direction: row;
		align-items: center;
		margin-right: 10px;
		color: var(--app-text-muted, #94a3b8);
	}

}

#timeline-nav {
	display: flex;
	flex-direction: row;
    background: color-mix(in srgb, var(--nav-bg, #0f172a) 85%, #000);
    border-top: 1px solid var(--nav-border, #334155);
    color: var(--nav-text, #94a3b8);
    height: 40px !important;
    flex-shrink: 0;
	user-select: none;

    p { color: var(--nav-text, #94a3b8); }

    input {
        background: color-mix(in srgb, var(--nav-bg, #0f172a) 70%, #000);
        color: var(--nav-text, #94a3b8);
        border: 1px solid var(--nav-border, #334155);
        border-radius: 4px;
    }

    .button {
        color: var(--nav-text, #94a3b8);
        &:hover {
            background: rgba(128, 128, 128, 0.2);
            color: var(--nav-text, #94a3b8);
        }
    }
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

// ── Mini mode layout ──────────────────────────────────────────────────────────
.mini-timeline-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.mini-data-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .splitpanes { height: 100%; }
}

.mini-rail {
    height: 100px;
    flex-shrink: 0;
    position: relative;
    border-top: 1px solid var(--app-border, #2d3a56);
}
</style>

<style lang="scss">
// Not scoped: mini tooltip is teleported to body
.mini-hover-tooltip {
    position: fixed;
    z-index: 9999;
    background: #1e293b;
    color: #f1f5f9;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
</style>

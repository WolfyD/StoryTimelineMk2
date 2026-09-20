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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import type { TimelineItem } from '@/types/models';
import TimelineCanvas from "@/components/TimelineCanvas.vue";
import TimelineSettingsModal from "@/components/TimelineSettingsModal.vue";
import AboutModal from "@/components/AboutModal.vue";
import TagManagerModal from "@/components/TagManagerModal.vue";
import MassAddItemsModal from "@/components/MassAddItemsModal.vue";
import HelpModal from "@/components/HelpModal.vue";
import ShortcutsModal from "@/components/ShortcutsModal.vue";
import ItemTypePickerModal from "@/components/ItemTypePickerModal.vue";
import ReferenceTimelineModal from "@/components/ReferenceTimelineModal.vue";
import { useShortcuts, type ShortcutHandler } from '@/utils/shortcuts';
import TimelineNotesPanel from "@/components/TimelineNotesPanel.vue";
import TimelineDataPanel from "@/components/TimelineDataPanel.vue";
import TimelineGalleryPanel from "@/components/TimelineGalleryPanel.vue";
import TimelineMinimap from "@/components/TimelineMinimap.vue";
import TimelineItemViewModal from "@/components/TimelineItemViewModal.vue";
import { BackendAPI } from '@/bridge/api';
import { useAppTheme, applyAppTheme } from '@/utils/useAppTheme';

const store = useTimelineStore()
useAppTheme()

const loadError = ref<boolean>(false)
const waitingForId = ref<boolean>(false)
const timelineCanvasRef = ref();
const showSettings = ref(false);
const showAbout = ref(false);
const showTags = ref(false);
const showMassAdd = ref(false);
const showHelp = ref(false);
const showShortcuts = ref(false);
const showTypePicker = ref(false);
const showReference = ref(false);
const lastTypeId = ref<number | null>(null);   // the `N` flow remembers the last type per session
const actionsMenuRef = ref<InstanceType<typeof TimelineActionsMenu> | null>(null);
const showFilterSetup = ref(false);
const flashedRuleId = ref<string | null>(null);
let _flashTimer = 0;
function onAlreadyExists(id: string) {
    flashedRuleId.value = id
    clearTimeout(_flashTimer)
    _flashTimer = window.setTimeout(() => { flashedRuleId.value = null }, 900)
}
const viewItemId = ref<string | null>(null);
const refViewItemId = ref<string | null>(null);   // BL-66 underlay: Alt+click / data panel → view only
const lightboxUrl = ref<string | null>(null);

const isMinimised = ref(false)
const miniHoverState = ref<{ item: TimelineItem; x: number; y: number } | null>(null)
const yearCalendarOpen = ref(false)

const updateBanner = ref<{ version: string; url: string } | null>(null)

function onHostPush(e: MessageEvent) {
    let msg: any
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
    if (msg?.action === 'UpdateAvailable') updateBanner.value = { version: msg.payload.version, url: msg.payload.url }
    // Host persisted a Ctrl+wheel / F10 zoom — keep the store in step so a settings Save keeps it
    if (msg?.action === 'ZoomChanged' && store.settings) {
        store.settings.UseCustomScaling = !!msg.payload.useCustomScaling
        store.settings.CustomScale = msg.payload.customScale
    }
}
async function dismissUpdate() { updateBanner.value = null }
async function skipUpdate() {
    if (updateBanner.value) await BackendAPI.SkipVersion(updateBanner.value.version)
    updateBanner.value = null
}
function openUpdateUrl() {
    if (updateBanner.value) BackendAPI.OpenExternalUrl(updateBanner.value.url)
}

async function toggleYearCalendar() {
    const calendarId = store.calendar?.Id ?? ''
    const timelineId = store.currentProject?.Id ?? 0
    const res = await BackendAPI.OpenYearCalendarWindow(timelineId, calendarId)
    yearCalendarOpen.value = res?.status === 'opened'
}

function onYearCalendarClosePush(e: MessageEvent) {
    let msg: any
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
    if (msg?.action === 'YearCalendarClosed') yearCalendarOpen.value = false
}

// Debounced year sender — fires SetCalendarYear when centerAbsoluteTime crosses a year boundary
let _yearSendTimer = 0
let _lastSentYear = -Infinity
watch(() => store.filterPanelOpen, (open) => { if (!open) showFilterSetup.value = false })

watch(() => store.centerAbsoluteTime, (t) => {
    const year = Math.floor(t)
    // The year-calendar slot is the active timeline's; a reference window must not steer it.
    if (store.readOnly || year === _lastSentYear) return
    clearTimeout(_yearSendTimer)
    _yearSendTimer = window.setTimeout(() => {
        _lastSentYear = year
        BackendAPI.SetCalendarYear(year)
    }, 300)
})

async function toggleMiniMode() {
    isMinimised.value = !isMinimised.value
    if (store.currentProject?.Id && !store.readOnly) {
        await BackendAPI.SaveTimelineMinimised(store.currentProject.Id, isMinimised.value)
    }
}

function onMiniHover(payload: { item: TimelineItem; x: number; y: number } | null) {
    miniHoverState.value = payload
}

const jumpYear = ref(Math.round(store.currentNowYear))
const jumpInputRef = ref<HTMLInputElement | null>(null)

function onItemClick(itemId: string) {
    if (store.readOnly) { onViewItem(itemId); return }   // reference window: Shift+click / Edit → view only
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
    if (store.readOnly) return
    BackendAPI.send('OpenAddEditItemWindow', {
        timelineId: store.currentProject?.Id,
        typeId,
        year: absoluteTime,
        granularity: lodIndex,
    })
}

// `N` (picker) / `Shift+N` (last type): a new item at the NOW line, at the current level of detail.
function onTypePicked(typeId: number) {
    showTypePicker.value = false
    lastTypeId.value = typeId
    onAddItem(typeId, store.centerAbsoluteTime, store.currentLodIndex)
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
	const urlParams = new URLSearchParams(window.location.search)
	const id = parseInt(urlParams.get('id') ?? '0', 10)
	store.readOnly = urlParams.get('readOnly') === '1'   // BL-66 reference window (cold-start path)

	if (id > 0) {
		await store.loadTimelineData(id)
	} else {
		// Pre-warmed: no id in URL — wait for SetTimelineId push from C#
		waitingForId.value = true
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
    jumpTo(year)
}

function jumpTo(year: number) {
    if (store.layoutSettings?.TimelineAnimateOnJumpToYear) {
        timelineCanvasRef.value?.animateJumpToYear(year, store.layoutSettings.TimelineJumpToYearAnimationLength);
    } else {
        timelineCanvasRef.value?.jumpToYear(year);
    }
}

// Home / End: the start / end boundary when the timeline has one, otherwise the first / last item.
function jumpToEdge(end: boolean) {
    const boundary = store.items.find(i => i.TypeId === (end ? 9 : 8))
    const rest = store.items.filter(i => i.TypeId !== 8 && i.TypeId !== 9)
    const target = boundary ? boundary.AbsoluteStart
        : !rest.length ? null
        : end ? Math.max(...rest.map(i => i.AbsoluteEnd ?? i.AbsoluteStart))
        : Math.min(...rest.map(i => i.AbsoluteStart))
    if (target != null && Number.isFinite(target)) jumpTo(target)
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

async function onShiftComplete(delta: number) {
    const targetYear = store.currentNowYear + delta;
    await store.loadTimelineData(store.currentProject!.Id);
    timelineCanvasRef.value?.animateJumpToYear(targetYear, store.layoutSettings?.TimelineJumpToYearAnimationLength ?? 600);
}

// ← / → pan at a constant px/s while held (Shift = 3×); keydown auto-repeat keeps `fast` current.
const keyPan = { dir: 0, fast: false, raf: 0, last: 0 }
function panFrame(t: number) {
    if (!keyPan.dir) { keyPan.raf = 0; return }
    const dt = keyPan.last ? (t - keyPan.last) / 1000 : 0
    keyPan.last = t
    const speed = (store.settings?.KeyboardPanSpeed ?? 400) * (keyPan.fast ? 3 : 1)
    timelineCanvasRef.value?.applyPan(keyPan.dir * speed * dt)
    keyPan.raf = requestAnimationFrame(panFrame)
}
function startPan(e: KeyboardEvent) {
    keyPan.dir = e.key === 'ArrowLeft' ? 1 : -1   // positive deltaX drags the view towards earlier years
    keyPan.fast = e.shiftKey
    if (!keyPan.raf) { keyPan.last = 0; keyPan.raf = requestAnimationFrame(panFrame) }
}
function stopPan(e?: KeyboardEvent) {
    if (!e || e.key === 'ArrowLeft' || e.key === 'ArrowRight') keyPan.dir = 0
}
const onWindowBlur = () => stopPan()

// Anything that edits or opens a child window is off in a reference window (BL-66).
const rw = (fn: ShortcutHandler): ShortcutHandler => e => store.readOnly ? false : fn(e)

useShortcuts('timeline', {
    pan: startPan,
    panFast: startPan,
    stepTick: e => timelineCanvasRef.value?.stepTick(e.key === 'ArrowUp'),
    stepYear: e => timelineCanvasRef.value?.stepTick(e.key === 'ArrowUp', true),
    zoomIn: () => store.lodZoomIn(),
    zoomOut: () => store.lodZoomOut(),
    jumpStart: () => jumpToEdge(false),
    jumpEnd: () => jumpToEdge(true),
    focusJump: () => { jumpInputRef.value?.focus(); jumpInputRef.value?.select() },
    addItem: rw(() => { showTypePicker.value = true }),
    addItemLast: rw(() => { if (lastTypeId.value) onTypePicked(lastTypeId.value); else showTypePicker.value = true }),
    undoDelete: rw(() => { undoDelete() }),
    filter: () => { store.setFilterPanelOpen(!store.filterPanelOpen) },
    tags: rw(() => { showTags.value = true }),
    yearCalendar: rw(() => { toggleYearCalendar() }),
    miniMode: () => { toggleMiniMode() },
    massAdd: rw(() => { showMassAdd.value = true }),
    settings: rw(() => { showSettings.value = true }),
    actionsMenu: rw(() => actionsMenuRef.value?.openMenu()),
    reference: rw(() => { showReference.value = true }),
    help: () => { showHelp.value = true },
    shortcuts: () => { showShortcuts.value = true },
    customScaling: () => BackendAPI.send('ToggleCustomScaling', { timelineId: store.currentProject?.Id }),
    fullscreen: () => BackendAPI.send('ToggleFullscreen', { timelineId: store.currentProject?.Id }),
})

let _setIdListener: ((e: MessageEvent) => void) | null = null

onMounted(async () => {
	HandleLoadTimeline()

	// Listen for SetTimelineId — sent by C# when the window was pre-warmed
	// (no ?id in URL, so Vue waited for this push to know which timeline to load)
	_setIdListener = (e: MessageEvent) => {
		const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
		if (msg.action !== 'SetTimelineId') return
		window.chrome.webview.removeEventListener('message', _setIdListener!)
		_setIdListener = null
		waitingForId.value = false
		const id = msg.payload?.id
		if (id > 0) {
			store.readOnly = !!msg.payload?.readOnly
			history.replaceState(null, '', '?id=' + id + (store.readOnly ? '&readOnly=1' : '')) // pre-warmed URL has no ?id; F5 must still work
			store.loadTimelineData(id)
			BackendAPI.GetAppConfig().then(cfg => {
				if (cfg) store.setPerformantPanning(cfg.performantPanning ?? true)
				// Pre-warmed at app start: the theme applied on mount may have been changed since
				if (cfg?.chromeTheme) applyAppTheme(cfg.chromeTheme)
			})
		}
	}
	window.chrome.webview.addEventListener('message', _setIdListener)

	// For the cold-start path (id in URL) the bridge is already ready — call GetAppConfig now
	const urlId = parseInt(new URLSearchParams(window.location.search).get('id') ?? '0', 10)
	if (urlId > 0) {
		const cfg = await BackendAPI.GetAppConfig()
		if (cfg) store.setPerformantPanning(cfg.performantPanning ?? true)
	}

	window.addEventListener('resize', handleResizeEvent)
    window.addEventListener('keyup', stopPan)
    window.addEventListener('blur', onWindowBlur)
    window.chrome?.webview?.addEventListener('message', onYearCalendarClosePush)
    window.chrome?.webview?.addEventListener('message', onHostPush)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResizeEvent)
    window.removeEventListener('keyup', stopPan)
    window.removeEventListener('blur', onWindowBlur)
    stopPan()
    if (keyPan.raf) cancelAnimationFrame(keyPan.raf)
    window.chrome?.webview?.removeEventListener('message', onYearCalendarClosePush)
    window.chrome?.webview?.removeEventListener('message', onHostPush)
    if (_setIdListener) {
        window.chrome.webview.removeEventListener('message', _setIdListener)
        _setIdListener = null
    }
    clearTimeout(throttleTimer)
    clearTimeout(debounceTimer)
})
</script>

<template>
	<div id="timeline-center">
		<WindowTitleBar :title="(store.title || 'Story Timeline') + (store.readOnly ? ' (reference)' : '')" />
		<div v-if="(store.isLoading || waitingForId) && !loadError" id="status-container">
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
                :year-calendar-open="yearCalendarOpen"
                :read-only="store.readOnly"
                :reference-active="!!store.reference"
                @toggle-filter="store.setFilterPanelOpen(!store.filterPanelOpen)"
                @toggle-mini="toggleMiniMode"
                @open-settings="showSettings = true"
                @open-about="showAbout = true"
                @open-tags="showTags = true"
                @open-mass-add="showMassAdd = true"
                @open-reference="showReference = true"
                @open-help="showHelp = true"
                @open-shortcuts="showShortcuts = true"
                @toggle-year-calendar="toggleYearCalendar"
            >
                <template #actions>
                    <TimelineActionsMenu ref="actionsMenuRef" @shift-complete="onShiftComplete" />
                </template>
            </TimelineActivityStrip>

            <div id="timeline-workspace">
    <div v-if="updateBanner" class="update-banner">
        <span class="update-banner-text">
            <i class="ri-arrow-up-circle-line"></i>
            Story Timeline <strong>{{ updateBanner.version }}</strong> is available.
        </span>
        <div class="update-banner-actions">
            <button class="update-banner-btn primary" @click="openUpdateUrl">Download</button>
            <button class="update-banner-btn" @click="skipUpdate">Skip this version</button>
            <button class="update-banner-close" @click="dismissUpdate" title="Dismiss"><i class="ri-close-line"></i></button>
        </div>
    </div>
    <!-- HeaderMode (timeline settings): 0 full, 1 compact (title only), 2 hidden — the window title bar keeps the title -->
    <div v-if="store.settings?.HeaderMode !== 2" id="timeline-header" :class="{ 'timeline-header--compact': store.settings?.HeaderMode === 1 }" style="user-select: none;">
        <div id="timeline-header-info-container">
            <h1>{{ store.title }}</h1>
            <h2 v-if="store.settings?.HeaderMode !== 1">{{ store.author }}</h2>
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

    <AboutModal v-if="showAbout" @close="showAbout = false" />
    <TagManagerModal v-if="showTags" @close="showTags = false" />
    <MassAddItemsModal v-if="showMassAdd" @close="showMassAdd = false" />
    <HelpModal v-if="showHelp" @close="showHelp = false" />
    <ShortcutsModal v-if="showShortcuts" context="timeline" @close="showShortcuts = false" />
    <ItemTypePickerModal v-if="showTypePicker" :last-type-id="lastTypeId" @pick="onTypePicked" @close="showTypePicker = false" />
    <ReferenceTimelineModal v-if="showReference" :current-id="store.currentProject?.Id" @close="showReference = false" />

    <div v-if="store.filterPanelOpen" class="filter-area">
        <TimelineFilterPanel :flashed-rule-id="flashedRuleId" :setup-open="showFilterSetup" @open-setup="showFilterSetup = !showFilterSetup" />
        <TimelineFilterSetupModal
            v-if="showFilterSetup"
            @close="showFilterSetup = false"
            @already-exists="onAlreadyExists"
        />
    </div>

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
				:dimmable-items="store.dimmableItems"
				:timeline-settings="store.settings ?? null"
				:timeline-info="store.currentProject"
				:layout-settings="store.layoutSettings ?? null"
				:mini-mode="false"
				@item-click="onItemClick"
				@view-item="onViewItem"
				@view-reference-item="refViewItemId = $event"
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
        <TimelineMinimap @jump-to-year="jumpTo" />
    </div>

    <!-- Item view modal -->
    <TimelineItemViewModal
        v-if="viewItemId && store.currentProject"
        :item-id="viewItemId"
        :timeline-id="store.currentProject.Id"
        :layout-settings="store.layoutSettings ?? null"
        @close="viewItemId = null"
    />
    <TimelineItemViewModal
        v-if="refViewItemId && store.reference"
        :item-id="refViewItemId"
        :timeline-id="store.reference.project.Id"
        :layout-settings="store.layoutSettings ?? null"
        view-only
        @close="refViewItemId = null"
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
.update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px;
    background: color-mix(in srgb, var(--app-accent, #6366f1) 15%, var(--app-surface, #0c1524));
    border-bottom: 1px solid color-mix(in srgb, var(--app-accent, #6366f1) 35%, transparent);
    font-size: 13px;
    color: var(--app-text, #e2e8f0);

    .update-banner-text {
        display: flex;
        align-items: center;
        gap: 6px;
        i { color: var(--app-accent, #6366f1); font-size: 15px; }
    }

    .update-banner-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .update-banner-btn {
        padding: 3px 10px;
        border-radius: 4px;
        border: 1px solid var(--app-border, #2d3a56);
        background: transparent;
        color: var(--app-text-muted, #94a3b8);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.15s;
        &:hover { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
        &.primary {
            background: var(--app-accent, #6366f1);
            border-color: var(--app-accent, #6366f1);
            color: #fff;
            &:hover { background: var(--app-accent-hover, #818cf8); }
        }
    }

    .update-banner-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px; height: 22px;
        border: none;
        background: transparent;
        color: var(--app-text-muted, #94a3b8);
        font-size: 16px;
        cursor: pointer;
        border-radius: 3px;
        &:hover { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    }
}

#timeline-center {
	display: flex;
	position: relative;
	flex-direction: column;
	align-items: stretch;
	width: 100%;
	height: 100vh;
	background-color: var(--app-bg, #0f172a);
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

.filter-area {
    position: relative;
    flex-shrink: 0;
    z-index: 50;
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

	&.timeline-header--compact {
		#timeline-header-info-container { align-items: flex-start; }
		h1 { font-size: 1rem; margin: 6px 12px; width: auto; justify-content: flex-start; }
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
		height: 28px;
		align-self: center;
		width: 100px;
		font-size: 1.6em;
		padding: 0 4px;
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

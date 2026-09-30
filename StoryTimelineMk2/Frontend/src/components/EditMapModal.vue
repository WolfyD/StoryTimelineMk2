<script setup lang="ts">
/**
 * BL-16: the editor for one map, so the sidebar can show a map without offering to change it. The
 * name is a draft with Save and Cancel; picking an image and deleting are acts of their own, handled
 * by the page — the modal steps out of the way for both.
 */
import { reactive, ref, onMounted } from 'vue'
import BaseModal from './BaseModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import MarkerStylePanel from './MarkerStylePanel.vue'
import { PhImage, PhUploadSimple, PhTrash, PhRuler, PhCompass } from '@phosphor-icons/vue'
import {
    MARKER_DEFAULTS, diffMarker, mapMarkerStyle, serializeMarker,
} from '@/utils/markerStyle'
import { DEFAULT_GRID_COLS, MAX_GRID_COLS, MIN_GRID_COLS } from '@/utils/mapGrid'
import type { MapItem } from '@/types/models'

const props = defineProps<{ map: MapItem; canImport?: boolean }>()
const emit = defineEmits<{
    close: []
    save: [Partial<MapItem>]
    pickImage: []
    importImage: []
    calibrate: []
    /** Out to the map to put the compass where this map has room for it. Saves first, like the rest. */
    placeCompass: []
    remove: []
}>()

const draft = reactive({
    Name:        props.map.Name,
    Description: props.map.Description ?? '',
    ScaleLength: props.map.ScaleLength,
    ScaleUnit:   props.map.ScaleUnit,
    GridCols:    props.map.GridCols || DEFAULT_GRID_COLS,
})

/** What every place on this map looks like unless the pin itself says otherwise. */
const marker = reactive(mapMarkerStyle(props.map))

const nameInput = ref<HTMLInputElement | null>(null)
onMounted(() => { nameInput.value?.focus(); nameInput.value?.select() })

// Cancel, the X, Esc and the backdrop all have a map's worth of deliberate changes to lose. Same
// snapshot guard as every other editor in the app.
const showDiscard = ref(false)
const snapshot = () => JSON.stringify([draft, marker])
const clean = snapshot()

function requestClose() {
    if (snapshot() === clean) emit('close')
    else showDiscard.value = true
}

function save() {
    emit('save', {
        Name:        draft.Name.trim() || 'Untitled map',
        Description: draft.Description,
        // A scale of nothing would divide every distance by zero; the map keeps the one it had.
        ScaleLength: draft.ScaleLength > 0 ? draft.ScaleLength : props.map.ScaleLength,
        ScaleUnit:   draft.ScaleUnit.trim() || 'miles',
        // A grid of one square is not one, and past two hundred the letters are thinner than the lines.
        GridCols:    Math.min(MAX_GRID_COLS, Math.max(MIN_GRID_COLS, Math.round(draft.GridCols || DEFAULT_GRID_COLS))),
        MarkerStyle: serializeMarker(diffMarker(marker, MARKER_DEFAULTS)),
    })
}
</script>

<template>
    <BaseModal title="Edit map" width="min(540px, 94vw)" @close="requestClose">
        <div class="modal-body">
            <div class="field">
                <label>Name</label>
                <input ref="nameInput" class="s-input" type="text" v-model="draft.Name" data-enter-self @keydown.enter="save" />
            </div>
            <div class="field">
                <label>Description</label>
                <textarea class="s-input s-textarea" v-model="draft.Description" rows="4" />
            </div>
            <!--
                The scale is the bar itself: this many units across a fixed slice of the map. Typing
                a number relabels the bar; picking two points on the map moves the slice instead, out
                in the page where the map is actually visible.
            -->
            <div class="field">
                <label>Scale</label>
                <!--
                    The bar itself, drawn the way the map's corner draws it — "the bar reads 10 miles"
                    means nothing to a reader who has not noticed there is a bar.
                -->
                <div class="bar-demo">
                    <span class="bar-label">{{ draft.ScaleLength > 0 ? draft.ScaleLength : '?' }}
                        {{ draft.ScaleUnit.trim() || 'miles' }}</span>
                    <span class="bar-line" />
                </div>
                <div class="scale-row">
                    <span class="lead">The bar in the map's bottom-left corner says</span>
                    <input class="s-input num" type="number" min="0" step="any" v-model.number="draft.ScaleLength" />
                    <input class="s-input unit" type="text" list="map-scale-units" v-model="draft.ScaleUnit" />
                    <button class="act" @click="save(); emit('calibrate')">
                        <PhRuler :size="15" /> Set from map
                    </button>
                </div>
                <!-- The unit list is the page's (`map-scale-units`): the calibration strip shares it. -->
                <p class="note">
                    Zooming in or out keeps the bar honest — it counts down to a mile and up to a thousand.
                    Setting it from the map saves the name too, then asks you to click two places.
                </p>
            </div>
            <!--
                The squares a writer cites. One number, because the squares are square and the rows
                follow from the picture's shape — a grid with two numbers is a grid of rectangles.
            -->
            <div class="field">
                <label>Grid</label>
                <div class="scale-row">
                    <span class="lead">The map is</span>
                    <input
                        class="s-input num" type="number" :min="MIN_GRID_COLS" :max="MAX_GRID_COLS" step="1"
                        v-model.number="draft.GridCols"
                    />
                    <span class="lead">squares across</span>
                </div>
                <p class="note">
                    Columns are lettered A, B, C… and rows numbered 1, 2, 3…, so a place can be cited as
                    D7 — its square shows beside its name. The grid button under the zoom controls shows
                    and hides it.
                </p>
            </div>
            <div class="field">
                <label>Image</label>
                <!-- Picking happens out in the page, so the name is saved first rather than lost. -->
                <div class="actions">
                    <button class="act" @click="save(); emit('pickImage')">
                        <PhImage :size="15" /> {{ map.PictureId ? 'Change image…' : 'Choose image…' }}
                    </button>
                    <button v-if="canImport" class="act" @click="save(); emit('importImage')">
                        <PhUploadSimple :size="15" /> Import image…
                    </button>
                </div>
                <p class="note">Picking an image saves the name too.</p>
            </div>
            <!--
                The rose is this map's: an ocean in the top-right corner has room for it and a city
                map may not. Where it sits, how big it is and which way north points are all set out
                on the map, and nowhere else — a compass that turned when it was brushed past was
                turning the whole map's north with it.
            -->
            <div class="field">
                <label>Compass</label>
                <button class="act" @click="save(); emit('placeCompass')">
                    <PhCompass :size="15" /> Place the compass
                </button>
                <p class="note">
                    Drag it where this map has room, its corner to resize it, the rose itself to point
                    north the way the map was drawn.
                </p>
            </div>
            <!-- The default every place on this map starts from; a pin overrides only what it differs in. -->
            <MarkerStylePanel v-model="marker" :inherited="MARKER_DEFAULTS" scope="map" />
            <button class="act danger" @click="emit('remove')">
                <PhTrash :size="15" /> Delete this map
            </button>
        </div>
        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="requestClose">Cancel</button>
            <button class="btn btn-primary" data-primary @click="save">Save</button>
        </template>
    </BaseModal>
    <ConfirmModal
        v-if="showDiscard"
        title="Discard changes?" message="This map has unsaved changes."
        confirm-label="Discard" cancel-label="Keep editing" danger
        @confirm="emit('close')" @cancel="showDiscard = false"
    />
</template>

<style scoped lang="scss">
.modal-body { padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 14px; }

.field {
    display: flex; flex-direction: column; gap: 4px;
    label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--app-text-dim, #4a6080); }
}

.s-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

.s-textarea { resize: vertical; min-height: 70px; font-family: inherit; }

.actions { display: flex; flex-wrap: wrap; gap: 6px; }

.scale-row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;

    .lead { font-size: 12px; color: var(--app-text-muted, #94a3b8); }
    .num { width: 76px; }
    .unit { width: 108px; }
}

// The same chip the map's corner shows, so the number above has a picture attached to it.
.bar-demo {
    display: inline-flex; flex-direction: column; align-self: flex-start;
    gap: 3px; padding: 4px 8px 6px;
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 65%, #fff);
    border-radius: 4px;
    background: var(--app-surface, #0c1524);
    user-select: none;

    .bar-label { font-size: 11px; color: var(--app-text, #e2e8f0); }
    .bar-line {
        width: 132px; height: 6px;
        border: 1px solid var(--app-text, #e2e8f0); border-top: none;
    }
}

.act {
    display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
    padding: 5px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); color: var(--app-text-muted, #94a3b8);
    transition: background 0.15s, color 0.15s, border-color 0.15s;

    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
    &.danger:hover { color: #fecaca; border-color: #7f1d1d; background: #7f1d1d33; }
}

.note { margin: 2px 0 0; font-size: 11px; color: var(--app-text-dim, #4a6080); }

.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
}

.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}

.btn-primary {
    background: var(--app-save-accent, #446b40); color: #e8f5e5;
    &:hover { background: var(--app-save-accent-hover, #52804c); }
}
</style>

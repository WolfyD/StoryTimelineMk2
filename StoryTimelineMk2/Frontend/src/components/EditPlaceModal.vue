<script setup lang="ts">
/**
 * BL-16: the editor for one pin on a map. Clicking a place only shows it — changing it happens here,
 * on a draft, so Cancel means what it says.
 *
 * The marker panel starts from what this pin *would* look like anyway — its map's default with any
 * override it already has — so saving the difference against that default records only the fields the
 * writer actually moved, and the rest keep following the map.
 */
import { computed, reactive, ref, onMounted } from 'vue'
import BaseModal from './BaseModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import MarkerStylePanel from './MarkerStylePanel.vue'
import { PhArrowsOutCardinal, PhTextAa, PhFrameCorners } from '@phosphor-icons/vue'
import { diffMarker, mapMarkerStyle, pinMarkerStyle, serializeMarker } from '@/utils/markerStyle'
import type { LocationItem, MapItem } from '@/types/models'

const props = defineProps<{ pin: LocationItem; maps: MapItem[]; currentMapId: string }>()
const emit = defineEmits<{
    close: []
    save: [Partial<LocationItem>]
    /** The three that happen out on the map, where the map is actually visible. Each saves first. */
    movePin: []
    designLabel: []
    setFootprint: []
}>()

const map = computed(() => props.maps.find(m => m.Id === props.currentMapId))

const draft = reactive({
    Name:        props.pin.Name,
    Description: props.pin.Description ?? '',
    Color:       props.pin.Color || '#f59e0b',
    ChildMapId:  props.pin.ChildMapId ?? '',
})

/** What the map says every place looks like: what this pin's own look is measured against. */
const inherited = mapMarkerStyle(map.value)
const marker = reactive(pinMarkerStyle(props.pin, map.value))

const nameInput = ref<HTMLInputElement | null>(null)
onMounted(() => { nameInput.value?.focus(); nameInput.value?.select() })

// Cancel, the X, Esc and the backdrop all have a marker's worth of deliberate changes to lose. Same
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
        Name:        draft.Name.trim() || 'New place',
        Description: draft.Description,
        Color:       draft.Color,
        ChildMapId:  draft.ChildMapId || null,
        MarkerStyle: serializeMarker(diffMarker(marker, inherited)),
    })
}
</script>

<template>
    <BaseModal title="Edit place" width="min(540px, 94vw)" @close="requestClose">
        <div class="modal-body">
            <div class="field">
                <label>Name</label>
                <input ref="nameInput" class="s-input" type="text" v-model="draft.Name" data-enter-self @keydown.enter="save" />
            </div>
            <div class="field">
                <label>Description</label>
                <textarea class="s-input s-textarea" v-model="draft.Description" rows="4" />
            </div>
            <div class="field-row">
                <div class="field">
                    <label>Colour</label>
                    <input class="s-color" type="color" v-model="draft.Color" />
                </div>
                <div class="field field--grow">
                    <label>Opens into</label>
                    <select class="s-input" v-model="draft.ChildMapId">
                        <option value="">— nothing —</option>
                        <option v-for="m in maps.filter(m => m.Id !== currentMapId)" :key="m.Id" :value="m.Id">
                            {{ m.Name }}
                        </option>
                    </select>
                </div>
            </div>
            <!--
                The three things that cannot be done in a box: where the place sits, where its name
                sits, and how much ground the map behind it covers. Each one saves what is typed here,
                steps out of the way, and comes back when the writer says Finish.
            -->
            <div class="field">
                <label>On the map</label>
                <div class="actions">
                    <button class="act" @click="save(); emit('movePin')">
                        <PhArrowsOutCardinal :size="15" /> Move on the map
                    </button>
                    <button class="act" @click="save(); emit('designLabel')">
                        <PhTextAa :size="15" /> Set label design
                    </button>
                    <button v-if="draft.ChildMapId" class="act" @click="save(); emit('setFootprint')">
                        <PhFrameCorners :size="15" /> Set location footprint
                    </button>
                </div>
                <p class="note">
                    Each of these saves this place first, then hands the map over until you are done —
                    nothing on a map drags about on its own any more.
                </p>
            </div>
            <MarkerStylePanel
                v-model="marker" :inherited="inherited" scope="pin"
                :own-colour="draft.Color" :sample-name="draft.Name"
            />
        </div>
        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="requestClose">Cancel</button>
            <button class="btn btn-primary" data-primary @click="save">Save</button>
        </template>
    </BaseModal>
    <ConfirmModal
        v-if="showDiscard"
        title="Discard changes?" message="This place has unsaved changes."
        confirm-label="Discard" cancel-label="Keep editing" danger
        @confirm="emit('close')" @cancel="showDiscard = false"
    />
</template>

<style scoped lang="scss">
.modal-body { padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 12px; }

.field {
    display: flex; flex-direction: column; gap: 4px;
    label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--app-text-dim, #4a6080); }
}

.field-row {
    display: flex; gap: 16px; align-items: flex-end;
    .field--grow { flex: 1; }
}

.s-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

.s-textarea { resize: vertical; min-height: 70px; font-family: inherit; }

.s-color {
    width: 44px; height: 30px; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    background: var(--app-surface, #0c1524); cursor: pointer; padding: 2px;
}

.actions { display: flex; flex-wrap: wrap; gap: 6px; }

.act {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); color: var(--app-text-muted, #94a3b8);
    transition: background 0.15s, color 0.15s, border-color 0.15s;

    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
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

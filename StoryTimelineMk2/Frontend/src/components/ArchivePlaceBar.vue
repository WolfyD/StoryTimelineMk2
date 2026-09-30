<script setup lang="ts">
/**
 * BL-88: the Places tab's bulk edit — the bar while anything is ticked, and the dialog each button opens.
 * One backend call per change, refused whole when a move would hang something under a map inside it.
 */
import { computed, ref } from 'vue'
import { PhArrowBendDownRight, PhArrowCounterClockwise, PhPalette, PhTrash, PhX } from '@phosphor-icons/vue'
import { BackendAPI, logError } from '@/bridge/api'
import { parentMapIds, pathToMap, type MapTreeRow } from '@/utils/mapTree'
import { DEFAULT_SWATCHES, loadSwatches } from '@/utils/timelinePrefs'
import BaseModal from '@/components/BaseModal.vue'
import type { BulkPlaceEdit, MapItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** The ticked rows, never empty while the bar shows. */
    rows: MapTreeRow[]
    maps: MapItem[]
}>()
const emit = defineEmits<{ trash: []; clear: []; saved: [] }>()

type Mode = 'colour' | 'look' | 'move'
const TITLES: Record<Mode, string> = { colour: 'Pin colour', look: 'Reset pin look', move: 'Move under a map' }
const mode = ref<Mode | null>(null)
const busy = ref(false)
const error = ref('')

const colour = ref('#f59e0b')
const swatches = ref<string[]>([...DEFAULT_SWATCHES])
const target = ref('')

const pins = computed(() => props.rows.flatMap(r => r.loc ? [r.loc] : []))
const tops = computed(() => props.rows.flatMap(r => r.loc ? [] : [r.map]))
const n = computed(() => props.rows.length)
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`

const parents = computed(() => parentMapIds(props.maps))
const nameOf = (id: string) => props.maps.find(m => m.Id === id)?.Name || 'Unnamed map'
/** Every map as the way down to it, so two maps called "Harbour" can be told apart. */
const targets = computed(() => {
    // What is ticked, as the map it stands for: nothing may go under one of those.
    const moved = new Set(props.rows.flatMap(r => r.loc ? (r.loc.ChildMapId ? [r.loc.ChildMapId] : []) : [r.map.Id]))
    return props.maps
        .map(m => {
            const path = pathToMap(parents.value, m.Id)
            return { id: m.Id, label: path.map(nameOf).join(' › '), inside: path.some(id => moved.has(id)) }
        })
        .sort((a, b) => a.label.localeCompare(b.label))
})

async function open(m: Mode) {
    error.value = ''
    const own = pins.value[0]?.Color
    colour.value = (own && pins.value.every(p => p.Color === own) ? own : null) || '#f59e0b'
    target.value = ''
    mode.value = m
    if (m !== 'colour') return
    try {
        swatches.value = await loadSwatches(props.timelineId)
    } catch (ex) {
        fail('Could not read the colour swatches', ex)
    }
}

/** Shown in the dialog, so logged without the alert. */
function fail(what: string, ex: unknown) {
    error.value = `${what}: ${ex instanceof Error ? ex.message : String(ex)}`
    void logError(`ArchivePlaceBar: ${what}`, ex)
}

/** Not while a change is on its way: its failure would have nowhere to show. */
function close() {
    if (!busy.value) mode.value = null
}

async function apply(edit: Omit<BulkPlaceEdit, 'ids'>) {
    busy.value = true
    error.value = ''
    try {
        await BackendAPI.BulkEditPlaces({ ids: pins.value.map(p => p.Id), ...edit })
        mode.value = null
        emit('saved')
    } catch (ex) {
        fail('Nothing was changed', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="ab-bar">
        <span class="ab-count">{{ n }} selected</span>
        <button class="ar-btn" :disabled="!pins.length" @click="open('colour')"><PhPalette :size="15" /> Pin colour</button>
        <button class="ar-btn" :disabled="!pins.length" @click="open('look')"><PhArrowCounterClockwise :size="15" /> Reset look</button>
        <button class="ar-btn" @click="open('move')"><PhArrowBendDownRight :size="15" /> Move under…</button>
        <button class="ar-btn ab-danger" data-tip="Move them to the trash" @click="emit('trash')"><PhTrash :size="15" /> Trash</button>
        <button class="ar-icon ab-clear" aria-label="Clear the selection" data-tip="Clear the selection" @click="emit('clear')"><PhX :size="18" /></button>

        <BaseModal v-if="mode" :title="TITLES[mode]" width="min(420px, 92vw)" @close="close">
            <div class="ab-body">
                <template v-if="mode === 'colour'">
                    <div class="ab-swatches">
                        <button
                            v-for="c in swatches"
                            :key="c"
                            type="button"
                            class="ab-swatch"
                            :class="{ 'ab-swatch--on': colour.toLowerCase() === c.toLowerCase() }"
                            :style="{ background: c }"
                            :aria-label="c"
                            @click="colour = c"
                        />
                        <input v-model="colour" type="color" aria-label="Any colour" data-tip="Any colour" />
                    </div>
                    <p class="ab-hint">A marker given a colour of its own in the map window keeps it; Reset look takes that off.</p>
                </template>

                <p v-else-if="mode === 'look'" class="ab-hint">
                    Their markers and labels go back to how their map draws its places, a label placed on the map
                    included. Their colour stays.
                </p>

                <template v-else>
                    <label class="ap-field">
                        <span>Under</span>
                        <select v-model="target">
                            <option value="" disabled>Pick a map…</option>
                            <option v-for="t in targets" :key="t.id" :value="t.id" :disabled="t.inside">
                                {{ t.label }}{{ t.inside ? ' — inside what is ticked' : '' }}
                            </option>
                        </select>
                    </label>
                    <p class="ab-hint">
                        A place keeps its spot on the picture — as far across and down as it was — so it may need a nudge
                        in the map window. <template v-if="tops.length">A top-level map gets a door in the middle of the
                        map picked, named after it.</template>
                    </p>
                </template>

                <p v-if="mode !== 'move' && tops.length" class="ab-hint ab-hint--warn">
                    {{ tops.length === 1 ? 'One top-level map has' : `${tops.length} top-level maps have` }} no pin of
                    {{ tops.length === 1 ? 'its' : 'their' }} own and {{ tops.length === 1 ? 'is' : 'are' }} left alone.
                </p>
                <p v-if="error" class="ab-error">{{ error }}</p>
            </div>

            <template #footer>
                <button class="ap-btn" data-cancel :disabled="busy" @click="mode = null">Cancel</button>
                <template v-if="mode === 'colour'">
                    <button class="ap-btn" :disabled="busy" @click="apply({ color: '' })">No colour</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="apply({ color: colour })">
                        Apply to {{ plural(pins.length, 'place') }}
                    </button>
                </template>
                <button v-else-if="mode === 'look'" class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="apply({ resetLook: true })">
                    Reset {{ plural(pins.length, 'place') }}
                </button>
                <button
                    v-else
                    class="ap-btn ap-btn--primary"
                    data-primary
                    :disabled="busy || !target"
                    @click="apply({ mapIds: tops.map(m => m.Id), moveTo: target })"
                >Move {{ plural(n, 'place') }}</button>
            </template>
        </BaseModal>
    </div>
</template>
<!-- Styled by ArchiveApp's ab- block, which every tab's bar shares. -->

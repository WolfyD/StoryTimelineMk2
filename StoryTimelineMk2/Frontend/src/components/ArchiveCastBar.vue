<script setup lang="ts">
/**
 * BL-88: the Characters tab's bulk edit — the bar while anyone is ticked, and the dialog each button opens.
 * Faction, colour and *Show on timeline* are the character window's own save, once per character; a
 * relation is one backend call for all of them. The tab rereads on `saved`, a failure half way included.
 */
import { computed, ref } from 'vue'
import { PhArrowsLeftRight, PhEye, PhFlag, PhGraph, PhPalette, PhTrash, PhX } from '@phosphor-icons/vue'
import { BackendAPI, logError } from '@/bridge/api'
import { buildGeneratedItem, planGeneratedItems } from '@/utils/characterItems'
import { blankRelation, groupRelationTypes, relationLabel, RELATION_DEGREES, RELATION_MODIFIERS } from '@/utils/characterRelations'
import { DEFAULT_SWATCHES, loadSwatches } from '@/utils/timelinePrefs'
import BaseModal from '@/components/BaseModal.vue'
import type { CharacterItem, RelationshipType } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** The ticked characters, never empty while the bar shows. */
    characters: CharacterItem[]
    /** Everyone, for the faction suggestions and who to relate them to. */
    cast: CharacterItem[]
    types: RelationshipType[]
}>()
const emit = defineEmits<{ trash: []; clear: []; saved: [] }>()

type Mode = 'faction' | 'colour' | 'show' | 'relation'
const TITLES: Record<Mode, string> = { faction: 'Faction', colour: 'Colour', show: 'Show on timeline', relation: 'Relation' }
const mode = ref<Mode | null>(null)
const busy = ref(false)
const error = ref('')

const faction = ref('')
const colour = ref('#6366f1')
const swatches = ref<string[]>([...DEFAULT_SWATCHES])

const n = computed(() => props.characters.length)
const applyLabel = computed(() => `Apply to ${n.value} character${n.value === 1 ? '' : 's'}`)
const factions = computed(() => [...new Set(props.cast.map(c => c.Faction?.trim()).filter(Boolean) as string[])].sort())
/** Nothing of theirs to draw: the items come from the dates. */
const undated = computed(() => props.characters.filter(c => c.BirthYear === null && c.DeathYear === null).length)

/** What every ticked character shares, or the fallback when they differ. */
function shared<T>(of: (c: CharacterItem) => T, fallback: T): T {
    const v = of(props.characters[0]!)
    return props.characters.every(c => of(c) === v) ? v : fallback
}

// ── The relation ──────────────────────────────────────────────────────────────

const kindId = ref('')
const otherId = ref('')
/** Each of them is the end the kind reads from: parent, not child. */
const tickedFirst = ref(false)
const modifier = ref<string | null>(null)
const degree = ref<string | null>(null)
const replace = ref(false)

/** Stands in for any one of them in the wording, which is neutral: they need not share a gender. */
const EACH = '\u0000each'
const typeGroups = computed(() => groupRelationTypes(props.types))
const kind = computed(() => props.types.find(t => t.Id === kindId.value))
const other = computed(() => props.cast.find(c => c.Id === otherId.value))
const others = computed(() => [...props.cast].sort((a, b) => (a.Name || '').localeCompare(b.Name || '')))
const mirrored = computed(() => (kind.value?.AToB ?? '').trim().toLowerCase() === (kind.value?.BToA ?? '').trim().toLowerCase())
const sample = computed(() => ({
    ...blankRelation(EACH, props.timelineId, kindId.value),
    Character1Id: tickedFirst.value ? EACH : otherId.value,
    Character2Id: tickedFirst.value ? otherId.value : EACH,
    RelationshipModifier: modifier.value,
    RelationshipDegree: degree.value,
}))
const reads = computed(() => relationLabel(sample.value, EACH, kind.value))
const readsBack = computed(() => other.value ? relationLabel(sample.value, other.value.Id, kind.value, other.value.Gender) : '')
/** Replace takes every tie of the kind at their end, whatever its modifier or degree. */
const plain = computed(() => relationLabel({ ...sample.value, RelationshipModifier: null, RelationshipDegree: null }, EACH, kind.value))
const otherTicked = computed(() => props.characters.some(c => c.Id === otherId.value))

// ── Dialogs ───────────────────────────────────────────────────────────────────

async function open(m: Mode) {
    error.value = ''
    faction.value = shared(c => c.Faction?.trim() ?? '', '')
    colour.value = shared(c => c.Color, null) || '#6366f1'
    if (m === 'relation' && !kind.value) kindId.value = props.types.find(t => t.Id === 'parent')?.Id ?? props.types[0]?.Id ?? ''
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
    void logError(`ArchiveCastBar: ${what}`, ex)
}

/** Not while a change is on its way: its failure would have nowhere to show. */
function close() {
    if (!busy.value) mode.value = null
}

/**
 * The character window's save, one character at a time, each on a fresh copy: the one this window
 * loaded may be older than an edit made since. Colour and the switch reach the birth and death items.
 */
async function saveEach(change: (c: CharacterItem) => void) {
    busy.value = true
    error.value = ''
    let done = 0
    try {
        const fresh = new Map(((await BackendAPI.GetTimelineCharacters(props.timelineId)) ?? []).map(c => [c.Id, c]))
        for (const ticked of props.characters) {
            const c = fresh.get(ticked.Id)
            if (!c) throw new Error(`${ticked.Name || 'A character'} is no longer in this timeline.`)
            change(c)
            const dropped = planGeneratedItems(c)
            const result = await BackendAPI.SaveCharacterFull(
                c, dropped,
                c.BirthItemId ? buildGeneratedItem('Birth', c, c.BirthItemId) : null,
                c.DeathItemId ? buildGeneratedItem('Death', c, c.DeathItemId) : null,
            )
            if (result?.status !== 'ok') throw new Error(`${c.Name || 'A character'} was not saved.`)
            done++
        }
        mode.value = null
    } catch (ex) {
        fail(done ? `Stopped after ${done} of ${n.value}` : 'Nothing was changed', ex)
    } finally {
        busy.value = false
        if (done) emit('saved')
    }
}

async function relate() {
    busy.value = true
    error.value = ''
    try {
        await BackendAPI.BulkRelate({
            ids: props.characters.map(c => c.Id),
            otherId: otherId.value,
            relationshipType: kindId.value,
            tickedFirst: tickedFirst.value,
            relationshipModifier: modifier.value,
            relationshipDegree: degree.value,
            replace: replace.value,
            timelineId: props.timelineId,
        })
        mode.value = null
        emit('saved')
    } catch (ex) {
        fail('The relations were not changed', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="ab-bar">
        <span class="ab-count">{{ n }} selected</span>
        <button class="ar-btn" @click="open('faction')"><PhFlag :size="15" /> Faction</button>
        <button class="ar-btn" @click="open('colour')"><PhPalette :size="15" /> Colour</button>
        <button class="ar-btn" @click="open('show')"><PhEye :size="15" /> Show on timeline</button>
        <button class="ar-btn" @click="open('relation')"><PhGraph :size="15" /> Relation</button>
        <button class="ar-btn ab-danger" data-tip="Move them to the trash" @click="emit('trash')"><PhTrash :size="15" /> Trash</button>
        <button class="ar-icon ab-clear" aria-label="Clear the selection" data-tip="Clear the selection" @click="emit('clear')"><PhX :size="18" /></button>

        <BaseModal v-if="mode" :title="TITLES[mode]" :width="mode === 'relation' ? 'min(480px, 92vw)' : 'min(400px, 92vw)'" @close="close">
            <div class="ab-body">
                <template v-if="mode === 'faction'">
                    <label class="ap-field">
                        <span>Faction</span>
                        <input v-model="faction" type="text" list="ab-factions" placeholder="Pick a faction, or type a new one" />
                    </label>
                    <datalist id="ab-factions"><option v-for="f in factions" :key="f" :value="f" /></datalist>
                </template>

                <template v-else-if="mode === 'colour'">
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
                    <p class="ab-hint">Their birth and death items take it too.</p>
                </template>

                <template v-else-if="mode === 'show'">
                    <p class="ab-hint">Draws their birth and death on the timeline. Hiding keeps both items and what is written on them; they only stop drawing.</p>
                    <p v-if="undated" class="ab-hint ab-hint--warn">
                        {{ undated === n ? 'None of them has a' : `${undated} of them have no` }} birth or death date, so there is nothing of theirs to draw.
                    </p>
                </template>

                <template v-else>
                    <div class="ab-line">
                        <label class="ap-field">
                            <span>Kind</span>
                            <select v-model="kindId">
                                <option value="" disabled>Kind…</option>
                                <optgroup v-for="[group, list] in typeGroups" :key="group" :label="group">
                                    <option v-for="t in list" :key="t.Id" :value="t.Id">{{ t.Name }}</option>
                                </optgroup>
                            </select>
                        </label>
                        <button
                            v-if="!mirrored"
                            type="button"
                            class="ar-icon"
                            aria-label="Swap the two ends"
                            data-tip="Swap the two ends — reverses how it reads"
                            @click="tickedFirst = !tickedFirst"
                        ><PhArrowsLeftRight :size="18" /></button>
                        <label class="ap-field">
                            <span>Of</span>
                            <select v-model="otherId">
                                <option value="" disabled>Who…</option>
                                <option v-for="c in others" :key="c.Id" :value="c.Id">{{ c.Name || 'Unnamed' }}</option>
                            </select>
                        </label>
                    </div>
                    <div class="ab-line">
                        <label class="ap-field">
                            <span>Modifier</span>
                            <select v-model="modifier">
                                <option :value="null">plain</option>
                                <option v-for="m in RELATION_MODIFIERS" :key="m" :value="m">{{ m }}</option>
                            </select>
                        </label>
                        <label class="ap-field">
                            <span>Degree</span>
                            <select v-model="degree">
                                <option :value="null">no degree</option>
                                <option v-for="d in RELATION_DEGREES" :key="d" :value="d">{{ d }}</option>
                            </select>
                        </label>
                    </div>

                    <p class="ab-hint">
                        Each of them is <b>{{ reads || '…' }}</b> {{ other?.Name || '…' }}<template v-if="other && readsBack">
                            · {{ other.Name }} is {{ readsBack }} each of them</template>
                    </p>
                    <label class="ab-check">
                        <input v-model="replace" type="checkbox" />
                        Replace — each stops being {{ plain || '…' }} anyone else
                    </label>
                    <p class="ab-hint">
                        A tie that is already there keeps its dates and notes, and takes this modifier and degree. New ones are
                        undated: they hold for as long as both are there.
                    </p>
                    <p v-if="otherTicked" class="ab-hint ab-hint--warn">{{ other?.Name }} is ticked too, and is left out.</p>
                </template>

                <p v-if="error" class="ab-error">{{ error }}</p>
            </div>

            <template #footer>
                <button class="ap-btn" data-cancel :disabled="busy" @click="mode = null">Cancel</button>
                <template v-if="mode === 'faction'">
                    <button class="ap-btn" :disabled="busy" @click="saveEach(c => { c.Faction = null })">No faction</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy || !faction.trim()" @click="saveEach(c => { c.Faction = faction.trim() })">{{ applyLabel }}</button>
                </template>
                <button v-else-if="mode === 'colour'" class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="saveEach(c => { c.Color = colour })">{{ applyLabel }}</button>
                <template v-else-if="mode === 'show'">
                    <button class="ap-btn" :disabled="busy" @click="saveEach(c => { c.ShowOnTimeline = false })">Hide from timeline</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="saveEach(c => { c.ShowOnTimeline = c.BirthYear !== null || c.DeathYear !== null })">Show on timeline</button>
                </template>
                <button v-else class="ap-btn ap-btn--primary" data-primary :disabled="busy || !kindId || !otherId" @click="relate">{{ applyLabel }}</button>
            </template>
        </BaseModal>
    </div>
</template>

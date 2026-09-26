<script setup lang="ts">
/**
 * BL-17: one place for a character's relations — who they already are to people down the side,
 * and in the middle the person, the kind and the years for the one being added or changed.
 * Every save goes straight to the backend; the panel behind reloads on `changed`.
 */
import { ref, computed } from 'vue'
import { BackendAPI } from '@/bridge/api'
import BaseModal from '@/components/BaseModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LodDateInput from '@/components/LodDateInput.vue'
import { mediaUrl } from '@/utils/mediaUrl'
import { effectiveState, initials, lifespan } from '@/utils/characterItems'
import {
    blankRelation, relationLabel, relationOtherId, relationWhen, slugifyTypeId,
    RELATION_DEGREES, RELATION_MODIFIERS,
} from '@/utils/characterRelations'
import { holdDate, placeDate, type HeldDate } from '@/utils/lodDates'
import {
    PhPlus, PhTrash, PhPencilSimple, PhFloppyDisk, PhX, PhArrowsLeftRight, PhSlidersHorizontal,
    PhMagnifyingGlass, PhCheck,
} from '@phosphor-icons/vue'
import type { CalendarFormatConfig } from '@/utils/timelineLayout'
import type {
    CharacterItem, CharacterRelationship, LodLevel, RelationshipType,
} from '@/types/models'

const props = defineProps<{
    character: CharacterItem
    characters: CharacterItem[]
    relations: CharacterRelationship[]
    types: RelationshipType[]
    /** The relation to open on, or null to start a new one. */
    editing: CharacterRelationship | null
    timelineId: number
    lodProfile: LodLevel[]
    monthNames: string[]
    monthLengths: number[]
    seasonNames: string[]
    weekCount: number
    /** Real month and season boundaries, so a sub-year date is stored where its label says (BL-79). */
    calendarConfig: CalendarFormatConfig
}>()

const emit = defineEmits<{ close: []; changed: [] }>()

const draft = ref<CharacterRelationship>(
    props.editing
        ? { ...props.editing }
        : blankRelation(props.character.Id, props.timelineId, props.types[0]?.Id ?? ''))
/** Editor-local, like the character window's: the relation stores the absolute (BL-75). */
const subticks  = ref<Record<'Start' | 'End', number>>({ Start: 0, End: 0 })
/** The same positions as loaded, so saving a date nobody touched leaves it exactly where it was. */
const held      = ref<Record<'Start' | 'End', HeldDate | null>>({ Start: null, End: null })
const typeDraft = ref<RelationshipType | null>(null)
const showTypes = ref(false)
const search    = ref('')
const error     = ref('')
const busy      = ref(false)

/**
 * Read a relation's stored dates into the form. Opening the modal on one hands it through
 * `props.editing` rather than through `edit()`, and that path used to skip this entirely — so a
 * relation dated to a month or a season opened showing the first one, whatever it actually said.
 */
function loadDates(r: CharacterRelationship) {
    held.value = {
        Start: holdDate(r.AbsoluteStart, r.StartYear, r.StartGranularity, props.lodProfile, props.calendarConfig),
        End: holdDate(r.AbsoluteEnd, r.EndYear, r.EndGranularity, props.lodProfile, props.calendarConfig),
    }
    subticks.value = { Start: held.value.Start!.subtick, End: held.value.End!.subtick }
}
if (props.editing) loadDates(props.editing)

const byId     = computed(() => new Map(props.characters.map(c => [c.Id, c])))
const typeById = computed(() => new Map(props.types.map(t => [t.Id, t])))
/** Everyone but the character themselves — nobody is their own sibling. */
const others   = computed(() => props.characters.filter(c => c.Id !== props.character.Id))
/** Who they are already tied to, so the list can say so rather than let it happen twice. */
const relatedIds = computed(() =>
    new Set(props.relations.map(r => relationOtherId(r, props.character.Id))))

const matches = computed(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return others.value
    return others.value.filter(c =>
        [c.Name, c.Nicknames, c.Aliases, c.Race].some(f => f?.toLowerCase().includes(needle)))
})

/** The kinds, grouped for the picker's optgroups; ungrouped ones land under 'other'. */
const typeGroups = computed(() => {
    const groups = new Map<string, RelationshipType[]>()
    for (const t of props.types) {
        const key = t.Type?.trim() || 'other'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(t)
    }
    return [...groups.entries()]
})

/**
 * Which end of the draft the person picker writes to. Editing must not flip the pair: swapping A
 * and B reverses the reading, so that is a button the user presses on purpose.
 */
const otherKey = computed<'Character1Id' | 'Character2Id'>(() =>
    draft.value.Character1Id !== props.character.Id ? 'Character1Id' : 'Character2Id')

const chosen = computed(() => byId.value.get(draft.value[otherKey.value]) ?? null)
const kind   = computed(() => typeById.value.get(draft.value.RelationshipType))

const draftLabel = computed(() =>
    relationLabel(draft.value, props.character.Id, kind.value, props.character.Gender))
/** The same row read from the other end, which is the half that is easy to get backwards. */
const reverseLabel = computed(() =>
    chosen.value
        ? relationLabel(draft.value, chosen.value.Id, kind.value, chosen.value.Gender)
        : '')

function name(id: string): string {
    return byId.value.get(id)?.Name || 'Someone else'
}

function label(r: CharacterRelationship): string {
    return relationLabel(r, props.character.Id, typeById.value.get(r.RelationshipType), props.character.Gender)
}

function fail(what: string, ex: unknown) {
    error.value = `${what}: ${ex instanceof Error ? ex.message : String(ex)}`
    console.error(what, ex)
}

// ── Relations ─────────────────────────────────────────────────────────────────

function pick(c: CharacterItem) {
    error.value = ''
    draft.value[otherKey.value] = c.Id
}

function startNew() {
    error.value = ''
    draft.value = blankRelation(props.character.Id, props.timelineId, props.types[0]?.Id ?? '')
    subticks.value = { Start: 0, End: 0 }
    held.value = { Start: null, End: null }
}

function edit(r: CharacterRelationship) {
    error.value = ''
    showTypes.value = false
    draft.value = { ...r }
    loadDates(r)
}

function swap() {
    const d = draft.value
    ;[d.Character1Id, d.Character2Id] = [d.Character2Id, d.Character1Id]
}

/** A dated end starts from this character's birth — the year a relation most often begins. */
function toggleEnd(end: 'Start' | 'End', on: boolean) {
    const d = draft.value
    d[`${end}Year`] = on ? (props.character.BirthYear ?? 0) : null
    if (!on) subticks.value[end] = 0
}

async function saveRelation() {
    const d = draft.value
    if (!d.RelationshipType) { error.value = 'Pick what kind of relation this is.'; return }
    if (!d.Character1Id || !d.Character2Id) { error.value = 'Pick the other character.'; return }
    d.AbsoluteStart = placeDate(d.StartYear, subticks.value.Start, d.StartGranularity, held.value.Start, props.lodProfile, props.calendarConfig)
    d.AbsoluteEnd   = placeDate(d.EndYear, subticks.value.End, d.EndGranularity, held.value.End, props.lodProfile, props.calendarConfig)
    busy.value = true
    try {
        const res = await BackendAPI.SaveCharacterRelation(d)
        if (res?.status !== 'ok') throw new Error('The backend did not save the relation.')
        emit('changed')
        startNew()
    } catch (ex) {
        fail('Could not save the relation', ex)
    } finally {
        busy.value = false
    }
}

async function removeRelation(r: CharacterRelationship) {
    busy.value = true
    try {
        await BackendAPI.DeleteCharacterRelation(r.Id)
        if (draft.value.Id === r.Id) startNew()
        emit('changed')
    } catch (ex) {
        fail('Could not delete the relation', ex)
    } finally {
        busy.value = false
    }
}

// ── Kinds ─────────────────────────────────────────────────────────────────────

function addType() {
    error.value = ''
    typeDraft.value = {
        Id: '', Name: '', Type: 'social', AToB: '', BToA: '',
        AToBF: null, AToBM: null, BToAF: null, BToAM: null, OneWay: 0,
    }
}

async function saveType() {
    const t = typeDraft.value
    if (!t) return
    if (!t.Name.trim()) { error.value = 'A kind needs a name.'; return }
    // The id is made from the name once, on the way in: relations store it, so it cannot move after.
    if (!t.Id) t.Id = slugifyTypeId(t.Name, typeById.value.keys())
    busy.value = true
    try {
        await BackendAPI.SaveRelationshipType(t)
        typeDraft.value = null
        emit('changed')
    } catch (ex) {
        fail('Could not save the kind', ex)
    } finally {
        busy.value = false
    }
}

/** The kind waiting on the confirm dialog — the app's own, since we have one. */
const typeToRemove = ref<RelationshipType | null>(null)

const removeTypeWarning = computed(() => {
    const t = typeToRemove.value
    if (!t) return ''
    const used = props.relations.filter(r => r.RelationshipType === t.Id).length
    return used
        ? `${used} of this character's relations use it and will show “${t.Id}”.`
        : 'Nothing in this character’s relations uses it.'
})

async function removeType() {
    const t = typeToRemove.value
    typeToRemove.value = null
    if (!t) return
    busy.value = true
    try {
        await BackendAPI.DeleteRelationshipType(t.Id)
        if (typeDraft.value?.Id === t.Id) typeDraft.value = null
        emit('changed')
    } catch (ex) {
        fail('Could not delete the kind', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <BaseModal
        :title="`Relations — ${character.Name || 'this character'}`"
        width="min(940px, 95vw)"
        maxHeight="86vh"
        @close="emit('close')"
    >
        <div class="rm">
            <!-- ── Already related ──────────────────────────────── -->
            <aside class="rm-side">
                <h4>Already related <span>{{ relations.length }}</span></h4>
                <p v-if="!relations.length" class="rm-empty">Nobody yet.</p>
                <ul v-else class="rm-rels">
                    <li
                        v-for="r in relations"
                        :key="r.Id"
                        :class="{ 'rm-rel--editing': draft.Id === r.Id }"
                    >
                        <span
                            class="rm-dot"
                            :style="{ background: byId.get(relationOtherId(r, character.Id))?.Color || '#64748b' }"
                        />
                        <span class="rm-rel-text">
                            <span class="rm-rel-label">{{ label(r) }}</span>
                            <b>{{ name(relationOtherId(r, character.Id)) }}</b>
                            <em v-if="relationWhen(r)">{{ relationWhen(r) }}</em>
                            <em v-if="r.Notes" :title="r.Notes">{{ r.Notes }}</em>
                        </span>
                        <button class="rm-icon" title="Edit" @click="edit(r)">
                            <PhPencilSimple :size="13" />
                        </button>
                        <button class="rm-icon rm-icon--danger" title="Remove" :disabled="busy" @click="removeRelation(r)">
                            <PhTrash :size="13" />
                        </button>
                    </li>
                </ul>
            </aside>

            <!-- ── Kinds ────────────────────────────────────────── -->
            <section v-if="showTypes" class="rm-main rm-main--types">
                <ul class="rm-types">
                    <li v-for="t in types" :key="t.Id">
                        <span class="rm-t-name">{{ t.Name }}</span>
                        <span class="rm-t-read">{{ t.AToB || '—' }} / {{ t.BToA || '—' }}</span>
                        <button class="rm-icon" title="Edit" @click="typeDraft = { ...t }">
                            <PhPencilSimple :size="13" />
                        </button>
                        <button class="rm-icon rm-icon--danger" title="Delete" :disabled="busy" @click="typeToRemove = t">
                            <PhTrash :size="13" />
                        </button>
                    </li>
                </ul>

                <div v-if="typeDraft" class="rm-type-form">
                    <div class="rm-line">
                        <input v-model="typeDraft.Name" class="rm-input" placeholder="Name — Sworn enemies" />
                        <input v-model="typeDraft.Type" class="rm-input rm-input--narrow" placeholder="Group" />
                    </div>
                    <div class="rm-line">
                        <input v-model="typeDraft.AToB" class="rm-input" placeholder="A is … B — enemy of" />
                        <input v-model="typeDraft.BToA" class="rm-input" placeholder="B is … A — enemy of" />
                    </div>
                    <div class="rm-line">
                        <input v-model="typeDraft.AToBF" class="rm-input" placeholder="…if A is female" />
                        <input v-model="typeDraft.AToBM" class="rm-input" placeholder="…if A is male" />
                        <input v-model="typeDraft.BToAF" class="rm-input" placeholder="…if B is female" />
                        <input v-model="typeDraft.BToAM" class="rm-input" placeholder="…if B is male" />
                    </div>
                    <p class="rm-hint">Leave the last row empty unless the kind has a word for it — “cousin” has none.</p>
                    <div class="rm-line">
                        <button class="rm-btn rm-btn--primary" :disabled="busy" @click="saveType">
                            <PhFloppyDisk :size="14" /> Save kind
                        </button>
                        <button class="rm-btn" :disabled="busy" @click="typeDraft = null"><PhX :size="14" /> Cancel</button>
                    </div>
                </div>
                <button v-else class="rm-btn" @click="addType"><PhPlus :size="14" /> New kind</button>
            </section>

            <!-- ── Pick someone ─────────────────────────────────── -->
            <section v-else class="rm-main">
                <div class="rm-search">
                    <PhMagnifyingGlass :size="14" />
                    <input v-model="search" type="search" placeholder="Search by name, alias or race…" />
                </div>

                <p v-if="!others.length" class="rm-empty">There is nobody else in this timeline yet.</p>
                <p v-else-if="!matches.length" class="rm-empty">Nothing matches “{{ search }}”.</p>

                <ul v-else class="rm-people">
                    <li
                        v-for="c in matches"
                        :key="c.Id"
                        :class="{ 'rm-person--picked': c.Id === draft[otherKey] }"
                        @click="pick(c)"
                    >
                        <img v-if="c.PortraitPath" class="rm-face" :src="mediaUrl(c.PortraitPath)" :alt="c.Name" />
                        <span v-else class="rm-face rm-face--initials" :style="{ background: c.Color || '#6366f1' }">
                            {{ initials(c) }}
                        </span>
                        <span class="rm-person-text">
                            <span class="rm-person-name">{{ c.Name || 'Unnamed' }}</span>
                            <span class="rm-person-sub">
                                {{ [lifespan(c), c.Race, effectiveState(c)].filter(Boolean).join(' · ') }}
                            </span>
                        </span>
                        <PhCheck v-if="c.Id === draft[otherKey]" :size="14" class="rm-person-tick" />
                        <span v-else-if="relatedIds.has(c.Id)" class="rm-person-tag">related</span>
                    </li>
                </ul>

                <div class="rm-edit">
                    <div class="rm-line">
                        <select v-model="draft.RelationshipType" class="rm-select">
                            <option value="" disabled>Kind…</option>
                            <optgroup v-for="[group, list] in typeGroups" :key="group" :label="group">
                                <option v-for="t in list" :key="t.Id" :value="t.Id">{{ t.Name }}</option>
                            </optgroup>
                        </select>
                        <button class="rm-icon" title="Swap the two — reverses how it reads" @click="swap">
                            <PhArrowsLeftRight :size="14" />
                        </button>
                        <p class="rm-reads">
                            {{ character.Name || 'This character' }} is <b>{{ draftLabel || '…' }}</b>
                            {{ chosen ? chosen.Name : '…' }}
                            <em v-if="chosen && reverseLabel">· {{ chosen.Name }} is {{ reverseLabel }} {{ character.Name }}</em>
                        </p>
                    </div>

                    <div class="rm-dates">
                        <div v-for="end in (['Start', 'End'] as const)" :key="end" class="rm-date">
                            <label class="rm-check">
                                <input
                                    type="checkbox"
                                    :checked="draft[`${end}Year`] !== null"
                                    @change="toggleEnd(end, ($event.target as HTMLInputElement).checked)"
                                />
                                <span>{{ end === 'Start' ? 'From' : 'Until' }}</span>
                            </label>
                            <template v-if="draft[`${end}Year`] !== null">
                                <select v-model.number="draft[`${end}Granularity`]" class="rm-select rm-select--lod">
                                    <option v-for="lod in lodProfile" :key="lod.index" :value="lod.index">
                                        {{ lod.formatKey }}
                                    </option>
                                </select>
                                <LodDateInput
                                    label=""
                                    :lodIndex="draft[`${end}Granularity`]"
                                    :lodProfile="lodProfile"
                                    :monthNames="monthNames"
                                    :monthLengths="monthLengths"
                                    :seasonNames="seasonNames"
                                    :weekCount="weekCount"
                                    :year="draft[`${end}Year`] ?? 0"
                                    :subtick="subticks[end]"
                                    @update:year="draft[`${end}Year`] = $event"
                                    @update:subtick="subticks[end] = $event"
                                />
                            </template>
                            <em v-else-if="end === 'Start'">as long as they both were here</em>
                        </div>
                    </div>

                    <div class="rm-meaning">
                        <label class="rm-strength">
                            <span>Closeness</span>
                            <input v-model.number="draft.RelationshipStrength" type="range" min="0" max="100" step="5" />
                            <b>{{ draft.RelationshipStrength }}</b>
                        </label>
                        <select v-model="draft.RelationshipDegree" class="rm-select">
                            <option :value="null">no degree</option>
                            <option v-for="d in RELATION_DEGREES" :key="d" :value="d">{{ d }}</option>
                        </select>
                        <select v-model="draft.RelationshipModifier" class="rm-select">
                            <option :value="null">plain</option>
                            <option v-for="m in RELATION_MODIFIERS" :key="m" :value="m">{{ m }}</option>
                        </select>
                    </div>

                    <input v-model="draft.Notes" class="rm-input" placeholder="Notes — where they met, what it cost…" />
                </div>
            </section>
        </div>

        <p v-if="error" class="rm-error">{{ error }}</p>

        <template #footer>
            <button class="rm-btn rm-btn--ghost" @click="showTypes = !showTypes">
                <PhSlidersHorizontal :size="14" /> {{ showTypes ? 'Back to people' : 'Kinds of relation' }}
            </button>
            <span class="rm-spacer" />
            <button class="rm-btn" data-cancel @click="emit('close')">Close</button>
            <button v-if="!showTypes" class="rm-btn rm-btn--primary" data-primary :disabled="busy" @click="saveRelation">
                <PhFloppyDisk :size="14" /> {{ draft.Id ? 'Save changes' : 'Add relation' }}
            </button>
        </template>
    </BaseModal>

    <ConfirmModal
        v-if="typeToRemove"
        :title="`Delete the “${typeToRemove.Name}” kind?`"
        :message="removeTypeWarning"
        confirm-label="Delete" cancel-label="Keep" danger
        @confirm="removeType" @cancel="typeToRemove = null"
    />
</template>

<style scoped lang="scss">
.rm-meaning {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.rm-strength {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    opacity: 0.85;

    input { width: 96px; }
    b { min-width: 24px; text-align: right; }
}

.rm {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 14px;
    padding: 14px 18px;
    min-height: 0;
    overflow: hidden;
}

h4 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-dim, #64748b);

    span { font-weight: 400; opacity: 0.7; }
}

ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.rm-side {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--app-border, #2d3a56);
    padding-right: 12px;
}

.rm-rels {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;

    li {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;
        color: var(--app-text, #e2e8f0);

        &:hover { background: var(--app-surface, #0c1524); }
    }
}

.rm-rel--editing {
    background: var(--app-surface, #0c1524);
    box-shadow: inset 2px 0 0 var(--app-accent, #6366f1);
}

.rm-rel-text {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;

    b { font-weight: 500; }

    em,
    .rm-rel-label {
        font-size: 0.7rem;
        font-style: normal;
        color: var(--app-text-dim, #64748b);
    }

    em {
        font-style: italic;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
}

.rm-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.rm-main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
}

.rm-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text-dim, #64748b);

    input {
        flex: 1 1 auto;
        padding: 6px 0;
        border: none;
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.8rem;
        outline: none;
    }
}

.rm-people {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-height: 120px;
    max-height: 34vh;
    overflow-y: auto;

    li {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 5px 7px;
        border-radius: var(--app-radius-sm, 4px);
        cursor: pointer;

        &:hover { background: var(--app-surface, #0c1524); }
    }
}

.rm-person--picked {
    background: var(--app-surface-high, #1e2b44);
    box-shadow: inset 0 0 0 1px var(--app-accent, #6366f1);
}

.rm-face {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;

    &--initials {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.68rem;
        font-weight: 600;
        color: #fff;
    }
}

.rm-person-text {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
}

.rm-person-name {
    font-size: 0.82rem;
    color: var(--app-text, #e2e8f0);
}

.rm-person-sub {
    font-size: 0.7rem;
    color: var(--app-text-dim, #64748b);
}

.rm-person-tick { color: var(--app-accent-hover, #818cf8); }

.rm-person-tag {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--app-surface-high, #1e2b44);
    font-size: 0.64rem;
    color: var(--app-text-dim, #64748b);
}

.rm-edit,
.rm-type-form {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-surface, #0c1524);
}

.rm-line {
    display: flex;
    align-items: center;
    gap: 7px;
}

.rm-dates {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
}

.rm-date {
    display: flex;
    align-items: center;
    gap: 6px;

    em {
        font-size: 0.68rem;
        font-style: italic;
        color: var(--app-text-dim, #64748b);
    }
}

.rm-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    cursor: pointer;
}

.rm-reads {
    flex: 1 1 auto;
    margin: 0;
    min-width: 0;
    font-size: 0.78rem;
    color: var(--app-text-dim, #64748b);

    b { color: var(--app-text, #e2e8f0); font-weight: 500; }
    em { font-style: italic; opacity: 0.8; }
}

.rm-hint {
    margin: 0;
    font-size: 0.68rem;
    font-style: italic;
    color: var(--app-text-dim, #64748b);
}

.rm-types {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    max-height: 46vh;

    li {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 4px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;
        color: var(--app-text, #e2e8f0);

        &:hover { background: var(--app-surface, #0c1524); }
    }
}

.rm-t-name { font-weight: 500; min-width: 150px; }

.rm-t-read {
    flex: 1 1 auto;
    font-size: 0.72rem;
    color: var(--app-text-dim, #64748b);
}

.rm-select,
.rm-input {
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-size: 0.78rem;
    padding: 4px 6px;
    outline: none;
    min-width: 0;

    &:focus { border-color: var(--app-accent, #6366f1); }
}

.rm-input { flex: 1 1 120px; }
.rm-input--narrow { flex: 0 0 90px; }
.rm-select--lod { flex: 0 0 auto; }

.rm-icon {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); }
    &--danger:hover:not(:disabled) { color: #f87171; }
    &:disabled { opacity: 0.5; cursor: default; }
}

.rm-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled { opacity: 0.5; cursor: default; }

    &--primary {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
    }

    &--ghost { border-color: transparent; }
}

.rm-spacer { flex: 1 1 auto; }

.rm-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--app-text-dim, #64748b);
}

.rm-error {
    margin: 0;
    padding: 0 18px 10px;
    font-size: 0.78rem;
    color: #f87171;
}

@media (max-width: 760px) {
    .rm {
        grid-template-columns: 1fr;
    }

    .rm-side {
        border-right: none;
        border-bottom: 1px solid var(--app-border, #2d3a56);
        padding: 0 0 10px;
        max-height: 22vh;
    }
}
</style>

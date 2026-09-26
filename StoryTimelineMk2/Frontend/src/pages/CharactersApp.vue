<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { BackendAPI } from '@/bridge/api'
import { useAppTheme } from '@/utils/useAppTheme'
import { parseCalendarDef, parseCalendarConfig } from '@/utils/calendarDef'
import { DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig } from '@/utils/timelineLayout'
import { mediaUrl } from '@/utils/mediaUrl'
import {
    planGeneratedItems, buildGeneratedItem, blankCharacter, effectiveState, initials,
} from '@/utils/characterItems'
import { holdDate, placeDate, type HeldDate } from '@/utils/lodDates'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import { useSideWidth } from '@/composables/useSideWidth'
import LodDateInput from '@/components/LodDateInput.vue'
import CharacterRelationsPanel from '@/components/CharacterRelationsPanel.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import {
    PhPlus, PhTrash, PhFloppyDisk, PhImage, PhMagnifyingGlass, PhUser, PhPencilSimple, PhUserFocus,
    PhUsersThree,
} from '@phosphor-icons/vue'
import type { CharacterAppearance, CharacterItem, LodLevel } from '@/types/models'

useAppTheme()

/** How wide the list is, dragged by the grip beside it. */
const { width: listWidth, startResize } = useSideWidth('charactersSideWidth')

const params     = new URLSearchParams(window.location.search)
// A ref, not a const: the host pre-navigates this page before it knows which timeline to show, so
// on that path both ids arrive later as a SetCharactersContext push.
const timelineId = ref(parseInt(params.get('timelineId') ?? '0', 10))
// Set when the window was opened from a character's birth/death item on the timeline.
let openOnCharacterId = params.get('characterId')

// ── State ─────────────────────────────────────────────────────────────────────
const characters = ref<CharacterItem[]>([])
const draft      = ref<CharacterItem | null>(null)
const search     = ref('')
const loading    = ref(true)
const saving     = ref(false)
const error      = ref('')
const showDelete = ref(false)

const appearances  = ref<CharacterAppearance[]>([])

/**
 * Where inside the year each date sits, in steps of its own LOD. Editor-local on purpose: the
 * character stores the absolute (BL-75), and a step only means anything next to a granularity.
 */
const subticks = ref<Record<'Birth' | 'Death', number>>({ Birth: 0, Death: 0 })
/** The same positions as loaded, so saving a date nobody touched leaves it exactly where it was. */
const held = ref<Record<'Birth' | 'Death', HeldDate | null>>({ Birth: null, Death: null })

const lodProfile   = ref<LodLevel[]>([])
const monthNames   = ref<string[]>([])
const monthLengths = ref<number[]>([])
const seasonNames  = ref<string[]>([])
// Real month and season boundaries, so a sub-year date is stored where its label says (BL-79).
const calendarConfig = ref<CalendarFormatConfig>(DEFAULT_CALENDAR_CONFIG)
const weekCount    = ref(52)

/** Free text, so a writer can invent one; these are only the ones worth suggesting. */
const STATE_SUGGESTIONS = ['alive', 'dead', 'missing', 'presumed dead', 'undead', 'unknown']

/** Every faction name already spelled out somewhere in this cast, for the editor's datalist. */
const factionsInUse = computed(() =>
    [...new Set(characters.value.map(c => c.Faction?.trim()).filter(Boolean) as string[])].sort())

/**
 * Also free text — a world may have its own — and read by one thing only: whether a relation says
 * “mother of” or “parent of”. Anything outside the two English has words for reads neutrally,
 * which is not a gap in the list but how the wording works.
 */
const GENDER_SUGGESTIONS = [
    'female', 'male', 'non-binary', 'genderfluid', 'agender', 'intersex', 'prefer not to say',
]

const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return characters.value
    return characters.value.filter(c =>
        [c.Name, c.Nicknames, c.Aliases, c.Race, c.Faction].some(f => f?.toLowerCase().includes(needle)))
})

/** Item type names, by TypeId — the same order the store keeps them in. */
const TYPE_NAMES = ['Event', 'Period', 'Age', 'Picture', 'Note', 'Bookmark', 'Character', 'Start', 'End']

// ── Loading ───────────────────────────────────────────────────────────────────
async function loadCharacters(selectId?: string) {
    characters.value = (await BackendAPI.GetTimelineCharacters(timelineId.value)) ?? []
    if (selectId) draft.value = clone(characters.value.find(c => c.Id === selectId) ?? null)
}

// A saved character keeps its id, so this misses the save that creates the first appearances —
// save() reloads the list itself.
watch(() => draft.value?.Id, () => loadAppearances())

async function loadAppearances() {
    appearances.value = []
    if (!draft.value || isNew.value) return
    try {
        appearances.value = (await BackendAPI.GetCharacterAppearances(draft.value.Id)) ?? []
    } catch (ex) {
        error.value = `Could not load the appearances: ${ex}`
        console.error('GetCharacterAppearances failed', ex)
    }
}

/**
 * The timeline asked for a character while this window was already open, so the query string
 * never got a chance to say so. Reload first: the character may be newer than our list.
 */
const stopFocusListener = BackendAPI.onHostMessage(msg => {
    if (msg?.action !== 'FocusCharacter') return
    loadCharacters(msg.payload.CharacterId).catch(ex => {
        error.value = `Could not open that character: ${ex}`
        console.error('FocusCharacter failed', ex)
    })
})
onBeforeUnmount(stopFocusListener)

/** Row click: the open timeline window jumps to the item and pulses it. */
function showAppearance(a: CharacterAppearance) {
    BackendAPI.FocusTimelineItem(a.ItemId, a.AbsoluteStart).catch(ex => {
        error.value = `Could not reach the timeline window: ${ex}`
        console.error('FocusTimelineItem failed', ex)
    })
}

async function load() {
    loading.value = true
    try {
        // Two independent reads, and how long this window takes to open is the whole point — so
        // they go together rather than one after the other.
        const [calendar] = await Promise.all([
            BackendAPI.GetTimelineCalendar(timelineId.value),
            loadCharacters(openOnCharacterId ?? undefined),
        ])
        if (calendar) {
            const raw = calendar.LodProfile?.Profile
            if (raw) lodProfile.value = typeof raw === 'string' ? JSON.parse(raw) : raw
            calendarConfig.value = parseCalendarConfig(calendar.YearDefinition)
            const def = parseCalendarDef(calendar.YearDefinition ?? '')
            monthNames.value   = def.monthNames
            monthLengths.value = def.monthLengths
            seasonNames.value  = def.seasonNames
            weekCount.value    = def.weekCount
        }
    } catch (ex) {
        error.value = `Failed to load: ${ex}`
        console.error('CharactersApp load failed', ex)
    } finally {
        loading.value = false
    }
}

/**
 * The pre-warmed path: the page was navigated with no query string, so the host pushes the ids once
 * the window is actually asked for. Mirrors SetTimelineId on the timeline window.
 */
const stopContextListener = BackendAPI.onHostMessage(msg => {
    if (msg?.action !== 'SetCharactersContext') return
    timelineId.value = msg.payload.timelineId
    openOnCharacterId = msg.payload.characterId ?? null
    // The pre-warmed URL carries no ids, so without this F5 would land on an empty window.
    history.replaceState(null, '', `?timelineId=${timelineId.value}`
        + (openOnCharacterId ? `&characterId=${encodeURIComponent(openOnCharacterId)}` : ''))
    load()
})
onBeforeUnmount(stopContextListener)

// No id yet means the pre-warm navigated us; the spinner stays up until the push lands.
onMounted(() => { if (timelineId.value) load() })

// ── Selection ─────────────────────────────────────────────────────────────────
function clone(c: CharacterItem | null): CharacterItem | null {
    return c ? JSON.parse(JSON.stringify(c)) : null
}

const isNew = computed(() => !!draft.value && !characters.value.some(c => c.Id === draft.value!.Id))

/** The bottom bar's Relate button drives the relations panel's own modal. */
const relationsPanel = ref<InstanceType<typeof CharacterRelationsPanel> | null>(null)
/** Nobody to tie them to yet — a saved cast of one, or a character that has no row of its own. */
const canRelate = computed(() => !isNew.value && characters.value.length > 1)

function select(c: CharacterItem) {
    error.value = ''
    draft.value = clone(c)
    held.value = {
        Birth: holdDate(c.AbsoluteStart, c.BirthYear, c.BirthGranularity, lodProfile.value, calendarConfig.value),
        Death: holdDate(c.AbsoluteEnd, c.DeathYear, c.DeathGranularity, lodProfile.value, calendarConfig.value),
    }
    subticks.value = { Birth: held.value.Birth!.subtick, Death: held.value.Death!.subtick }
}

function newCharacter() {
    error.value = ''
    draft.value = blankCharacter(timelineId.value)
    subticks.value = { Birth: 0, Death: 0 }
    held.value = { Birth: null, Death: null }
}

// ── Birth / death toggles ─────────────────────────────────────────────────────
function toggleDate(kind: 'Birth' | 'Death', on: boolean) {
    const c = draft.value!
    if (kind === 'Birth') c.BirthYear = on ? (c.BirthYear ?? 0) : null
    else c.DeathYear = on ? (c.DeathYear ?? 0) : null
    if (!on) subticks.value[kind] = 0
    if (c.BirthYear === null && c.DeathYear === null) c.ShowOnTimeline = false
}

// ── Generated items ───────────────────────────────────────────────────────────
async function writeItems(c: CharacterItem, dropped: string[]) {
    for (const id of dropped) await BackendAPI.DeleteItem(id)
    for (const kind of ['Birth', 'Death'] as const) {
        const itemId = kind === 'Birth' ? c.BirthItemId : c.DeathItemId
        if (!itemId) continue
        await BackendAPI.SaveItem(
            buildGeneratedItem(kind, c, itemId),
            [kind.toLowerCase()],
            [{ CharacterId: c.Id, Role: kind.toLowerCase() }],
            [], [],
        )
    }
    await linkPortraitToItems(c)
}

/**
 * The character's face belongs on the items they own. Linking is idempotent, and a portrait that
 * is replaced is deleted outright, so the old link cascades away with the picture row.
 */
async function linkPortraitToItems(c: CharacterItem) {
    if (!c.PortraitPictureId) return
    for (const itemId of [c.BirthItemId, c.DeathItemId])
        if (itemId) await BackendAPI.LinkImageToItem(c.PortraitPictureId, itemId)
}

// ── Save / delete ─────────────────────────────────────────────────────────────
async function save() {
    const c = draft.value
    if (!c) return
    if (!c.FirstName.trim() && !c.LastName.trim()) { error.value = 'A character needs a name.'; return }

    error.value = ''
    saving.value = true
    try {
        // The date inputs work in steps; the row stores where that put them.
        c.AbsoluteStart = placeDate(c.BirthYear, subticks.value.Birth, c.BirthGranularity, held.value.Birth, lodProfile.value, calendarConfig.value)
        c.AbsoluteEnd   = placeDate(c.DeathYear, subticks.value.Death, c.DeathGranularity, held.value.Death, lodProfile.value, calendarConfig.value)
        const dropped = planGeneratedItems(c)
        const result = await BackendAPI.SaveCharacter(c)
        if (result?.status !== 'ok') throw new Error('The character was not saved.')
        // The backend derives Name from the two halves, so take its copy back before the items
        // are titled from it.
        Object.assign(c, result.character)
        await writeItems(c, dropped)
        await loadCharacters(c.Id)
        await loadAppearances()
    } catch (ex) {
        error.value = `Save failed: ${ex}`
        console.error('SaveCharacter failed', ex)
    } finally {
        saving.value = false
    }
}

/** Nothing is saved for a new character, so there is nothing to warn about — that one just drops. */
function remove() {
    if (!draft.value || isNew.value) { draft.value = null; return }
    showDelete.value = true
}

async function deleteCharacter() {
    showDelete.value = false
    const c = draft.value
    if (!c) return

    saving.value = true
    try {
        await BackendAPI.DeleteCharacter(c.Id)
        draft.value = null
        await loadCharacters()
    } catch (ex) {
        error.value = `Delete failed: ${ex}`
        console.error('DeleteCharacter failed', ex)
    } finally {
        saving.value = false
    }
}

// ── Portrait ──────────────────────────────────────────────────────────────────
async function pickPortrait() {
    const c = draft.value
    if (!c) return
    // The host imports the file against a character id, so a brand new one has to exist first.
    if (isNew.value) { await save(); if (error.value) return }

    try {
        const result = await BackendAPI.SetCharacterPortrait(c.Id)
        if (result?.status !== 'ok') return
        await loadCharacters(c.Id)
        if (draft.value) await linkPortraitToItems(draft.value)
    } catch (ex) {
        error.value = `Could not set the portrait: ${ex}`
        console.error('SetCharacterPortrait failed', ex)
    }
}
</script>

<template>
    <div class="ch-root">
        <WindowTitleBar title="Characters" :subtitle="`${characters.length}`" :show-maximize="true" />

        <div v-if="loading" class="ch-loading">Loading…</div>

        <div v-else class="ch-body" :style="{ gridTemplateColumns: `${listWidth}px 5px 1fr` }">
            <!-- ── List ─────────────────────────────────────────────── -->
            <aside class="ch-list">
                <div class="ch-list-head">
                    <label class="ch-search">
                        <PhMagnifyingGlass :size="14" />
                        <input v-model="search" type="text" placeholder="Search…" />
                    </label>
                    <button class="ch-btn ch-btn--primary" title="New character" @click="newCharacter">
                        <PhPlus :size="15" />
                    </button>
                </div>

                <p v-if="characters.length === 0" class="ch-empty">
                    No characters yet. Add the first one.
                </p>
                <p v-else-if="filtered.length === 0" class="ch-empty">Nothing matches “{{ search }}”.</p>

                <ul v-else class="ch-rows">
                    <li
                        v-for="c in filtered"
                        :key="c.Id"
                        class="ch-row"
                        :class="{ 'ch-row--selected': draft?.Id === c.Id }"
                        @click="select(c)"
                    >
                        <img v-if="c.PortraitPath" class="ch-avatar" :src="mediaUrl(c.PortraitPath)" :alt="c.Name" />
                        <span v-else class="ch-avatar ch-avatar--initials" :style="{ background: c.Color || '#6366f1' }">
                            {{ initials(c) }}
                        </span>
                        <span class="ch-row-text">
                            <span class="ch-row-name">{{ c.Name }}</span>
                            <span class="ch-row-sub">{{ [c.Race, effectiveState(c)].filter(Boolean).join(' · ') }}</span>
                        </span>
                    </li>
                </ul>
            </aside>
            <div class="side-grip" title="Drag to resize" @pointerdown="startResize" />

            <!-- ── Detail ───────────────────────────────────────────── -->
            <div class="ch-pane">
            <section v-if="!draft" class="ch-detail ch-detail--blank">
                <PhUser :size="48" weight="thin" />
                <p>Pick a character, or add a new one.</p>
            </section>

            <section v-else class="ch-detail">
                <div class="ch-portrait-row">
                    <img v-if="draft.PortraitPath" class="ch-portrait" :src="mediaUrl(draft.PortraitPath)" :alt="draft.Name" />
                    <span v-else class="ch-portrait ch-portrait--initials" :style="{ background: draft.Color || '#6366f1' }">
                        {{ initials(draft) }}
                    </span>
                    <button class="ch-btn" @click="pickPortrait">
                        <PhImage :size="15" />
                        {{ draft.PortraitPath ? 'Change portrait' : 'Set portrait' }}
                    </button>
                </div>

                <div class="ch-grid">
                    <label class="ch-field">
                        <span>First name</span>
                        <input v-model="draft.FirstName" type="text" />
                    </label>
                    <label class="ch-field">
                        <span>Last name</span>
                        <input v-model="draft.LastName" type="text" />
                    </label>
                    <label class="ch-field">
                        <span>Nicknames</span>
                        <input v-model="draft.Nicknames" type="text" placeholder="comma separated" />
                    </label>
                    <label class="ch-field">
                        <span>Aliases</span>
                        <input v-model="draft.Aliases" type="text" placeholder="comma separated" />
                    </label>
                    <label class="ch-field">
                        <span>Race</span>
                        <input v-model="draft.Race" type="text" />
                    </label>
                    <label class="ch-field">
                        <span>Faction</span>
                        <input v-model="draft.Faction" type="text" list="ch-factions" />
                        <!-- The names already in use, so a cast does not end up split between
                             "Night Watch" and "night watch" — the relations views group by this. -->
                        <datalist id="ch-factions">
                            <option v-for="f in factionsInUse" :key="f" :value="f" />
                        </datalist>
                    </label>
                    <label class="ch-field">
                        <span>State</span>
                        <input v-model="draft.State" type="text" list="ch-states" :placeholder="effectiveState(draft)" />
                        <datalist id="ch-states">
                            <option v-for="s in STATE_SUGGESTIONS" :key="s" :value="s" />
                        </datalist>
                    </label>
                    <label class="ch-field">
                        <span>Gender</span>
                        <input
                            v-model="draft.Gender"
                            type="text"
                            list="ch-genders"
                            placeholder="not stated"
                            title="Only used to word relations — mother of, brother of"
                        />
                        <datalist id="ch-genders">
                            <option v-for="g in GENDER_SUGGESTIONS" :key="g" :value="g" />
                        </datalist>
                    </label>
                    <label class="ch-field ch-field--narrow">
                        <span>Importance</span>
                        <input v-model.number="draft.Importance" type="number" min="1" max="10" />
                    </label>
                    <label class="ch-field ch-field--narrow">
                        <span>Color</span>
                        <input v-model="draft.Color" type="color" />
                    </label>
                </div>

                <!-- ── Dates ────────────────────────────────────────── -->
                <div class="ch-dates">
                    <div v-for="kind in (['Birth', 'Death'] as const)" :key="kind" class="ch-date-block">
                        <label class="ch-check">
                            <input
                                type="checkbox"
                                :checked="draft[`${kind}Year`] !== null"
                                @change="toggleDate(kind, ($event.target as HTMLInputElement).checked)"
                            />
                            <span>{{ kind === 'Birth' ? 'Born' : 'Died' }}</span>
                        </label>

                        <template v-if="draft[`${kind}Year`] !== null">
                            <select v-model.number="draft[`${kind}Granularity`]" class="ch-lod-select">
                                <option v-for="lod in lodProfile" :key="lod.index" :value="lod.index">
                                    {{ lod.formatKey }}
                                </option>
                            </select>
                            <LodDateInput
                                label=""
                                :lodIndex="draft[`${kind}Granularity`]"
                                :lodProfile="lodProfile"
                                :monthNames="monthNames"
                                :monthLengths="monthLengths"
                                :seasonNames="seasonNames"
                                :weekCount="weekCount"
                                :year="draft[`${kind}Year`] ?? 0"
                                :subtick="subticks[kind]"
                                @update:year="draft[`${kind}Year`] = $event"
                                @update:subtick="subticks[kind] = $event"
                            />
                        </template>
                    </div>

                    <label class="ch-check ch-check--timeline" :class="{ 'ch-check--off': draft.BirthYear === null && draft.DeathYear === null }">
                        <input
                            v-model="draft.ShowOnTimeline"
                            type="checkbox"
                            :disabled="draft.BirthYear === null && draft.DeathYear === null"
                        />
                        <span>Show on timeline</span>
                        <em>birth and death become items this character owns</em>
                    </label>

                    <label class="ch-check ch-check--timeline">
                        <input v-model="draft.UseHighlightColor" type="checkbox" />
                        <span>Use highlight color</span>
                        <em>fills the portrait disc — off leaves the color on the ring only</em>
                    </label>

                    <label class="ch-check ch-check--timeline">
                        <input v-model="draft.Shared" type="checkbox" />
                        <span>Shared character</span>
                        <em>appears in every timeline's cast — they still belong to this one</em>
                    </label>
                </div>

                <label class="ch-field">
                    <span>Description</span>
                    <textarea v-model="draft.Description" rows="4" />
                </label>
                <label class="ch-field">
                    <span>Notes</span>
                    <textarea v-model="draft.Notes" rows="3" />
                </label>

                <div v-if="!isNew" class="ch-appearances">
                    <h3>
                        Appears in <span>{{ appearances.length }}</span>
                    </h3>
                    <p v-if="!appearances.length" class="ch-appearances-empty">
                        Nothing yet — attach them to an item in the item editor.
                    </p>
                    <ul v-else>
                        <li v-for="a in appearances" :key="a.ItemId" @click="showAppearance(a)">
                            <span class="ch-app-dot" :style="{ background: a.Color || '#64748b' }" />
                            <span class="ch-app-title">{{ a.Title || 'Untitled' }}</span>
                            <span class="ch-app-meta">{{ TYPE_NAMES[a.TypeId - 1] ?? 'Item' }} · {{ a.Year }}</span>
                            <span v-if="a.Role" class="ch-app-role">{{ a.Role }}</span>
                            <button
                                class="ch-app-edit"
                                title="Open in the item editor"
                                @click.stop="BackendAPI.OpenAddEditItemWindow(timelineId, a.ItemId)"
                            ><PhPencilSimple :size="13" /></button>
                        </li>
                    </ul>
                </div>

                <CharacterRelationsPanel
                    v-if="!isNew"
                    ref="relationsPanel"
                    :key="draft.Id"
                    :character="draft"
                    :characters="characters"
                    :timelineId="timelineId"
                    :lodProfile="lodProfile"
                    :monthNames="monthNames"
                    :monthLengths="monthLengths"
                    :seasonNames="seasonNames"
                    :weekCount="weekCount"
                    :calendarConfig="calendarConfig"
                />

                <p v-if="error" class="ch-error">{{ error }}</p>
            </section>

            <!-- Pinned to the bottom of the form's own pane, not the window: every one of these
                 acts on the character above it, and the list beside it is a different subject. -->
            <footer v-if="draft" class="ch-bar">
                <button class="ch-btn ch-btn--primary" :disabled="saving" @click="save">
                    <PhFloppyDisk :size="15" />
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
                <button class="ch-btn ch-btn--danger" :disabled="saving" @click="remove">
                    <PhTrash :size="15" />
                    {{ isNew ? 'Discard' : 'Delete' }}
                </button>

                <div class="ch-bar-right">
                    <button
                        class="ch-btn"
                        :disabled="!canRelate"
                        :title="canRelate ? 'Tie them to someone else' : 'Save them first, and add someone to tie them to'"
                        @click="relationsPanel?.open(null)"
                    ><PhUsersThree :size="15" /> Relate</button>
                    <button
                        class="ch-btn"
                        :disabled="isNew"
                        title="Open a read-only timeline of this character alone"
                        @click="BackendAPI.OpenCharacterTimeline(timelineId, draft.Id)"
                    ><PhUserFocus :size="15" /> Their timeline</button>
                </div>
            </footer>
            </div>
        </div>

        <ConfirmModal
            v-if="showDelete"
            :title="`Delete ${draft?.Name || 'this character'}?`"
            message="Their portrait and any generated timeline items go too."
            confirm-label="Delete" cancel-label="Keep" danger
            @confirm="deleteCharacter" @cancel="showDelete = false"
        />
    </div>
</template>

<style scoped lang="scss">
.ch-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
}

.ch-loading {
    text-align: center;
    padding: 40px 0;
    color: var(--app-text-dim, #64748b);
    font-style: italic;
}

.ch-body {
    flex: 1;
    display: grid;
    // Overridden inline by the width the grip was last dragged to; this is the first run's.
    grid-template-columns: 260px 5px 1fr;
    min-height: 0;
}

// ── List ──────────────────────────────────────────────────────────────────────

.ch-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    // A grid item is min-content wide unless told otherwise, and the search box's own minimum is a
    // good 170px — so a narrow column used to push the New button out over the grip and the form.
    min-width: 0;
    overflow: hidden;
    border-right: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ch-list-head {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid var(--app-border, #2d3a56);

    // The button keeps its size; the search box gives way, down to its icon if it has to.
    > .ch-btn { flex: 0 0 auto; }
}

.ch-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    color: var(--app-text-dim, #64748b);

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--app-text, #e2e8f0);
        font-size: 0.78rem;
        padding: 5px 0;
        outline: none;
    }
}

.ch-rows {
    list-style: none;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    flex: 1;
}

.ch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    border-radius: var(--app-radius-sm, 4px);
    cursor: pointer;

    &:hover { background: color-mix(in srgb, var(--app-accent, #6366f1) 10%, transparent); }

    &--selected {
        background: color-mix(in srgb, var(--app-accent, #6366f1) 20%, transparent);
    }
}

.ch-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;

    &--initials {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.68rem;
        font-weight: 600;
        color: #fff;
    }
}

.ch-row-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.ch-row-name {
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ch-row-sub {
    font-size: 0.68rem;
    color: var(--app-text-dim, #64748b);
}

.ch-empty {
    padding: 20px 14px;
    text-align: center;
    font-size: 0.75rem;
    font-style: italic;
    color: var(--app-text-dim, #64748b);
}

// ── Detail ────────────────────────────────────────────────────────────────────

// The form and its bar: the form scrolls, the bar stays.
.ch-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}

.ch-detail {
    flex: 1;
    min-height: 0;
    padding: 14px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;

    &--blank {
        align-items: center;
        justify-content: center;
        color: var(--app-text-dim, #64748b);
        font-style: italic;
    }
}

.ch-portrait-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.ch-portrait {
    width: 76px;
    height: 76px;
    border-radius: var(--app-radius-sm, 4px);
    object-fit: cover;

    &--initials {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 600;
        color: #fff;
    }
}

.ch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
}

.ch-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    > span {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--app-text-dim, #64748b);
    }

    input,
    textarea,
    select {
        border-radius: var(--app-radius-sm, 4px);
        border: 1px solid var(--app-border, #2d3a56);
        background: var(--app-surface, #0c1524);
        color: var(--app-text, #e2e8f0);
        font: inherit;
        font-size: 0.8rem;
        padding: 5px 7px;
        outline: none;

        &:focus { border-color: var(--app-accent, #6366f1); }
    }

    textarea { resize: vertical; }
    input[type='color'] { padding: 2px; height: 30px; }

    &--narrow { max-width: 120px; }
}

// ── Dates ─────────────────────────────────────────────────────────────────────

.ch-dates {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
}

.ch-date-block {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}

.ch-lod-select {
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    color: var(--app-text, #e2e8f0);
    font-size: 0.78rem;
    padding: 4px 6px;
}

.ch-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    min-width: 76px;
    cursor: pointer;

    em {
        font-size: 0.68rem;
        font-style: italic;
        color: var(--app-text-dim, #64748b);
    }

    &--timeline { min-width: 0; }
    &--off { opacity: 0.45; cursor: not-allowed; }
}

// ── Actions ───────────────────────────────────────────────────────────────────

.ch-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
}

.ch-bar-right {
    display: flex;
    gap: 8px;
    margin-left: auto;
}

.ch-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.78rem;
    cursor: pointer;
    transition: color 0.14s, background 0.14s, border-color 0.14s;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled { opacity: 0.5; cursor: default; }

    &--primary {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
    }

    // Red standing, not only on hover — the one button here you want to notice before clicking.
    &--danger {
        color: #f87171;
        border-color: color-mix(in srgb, #f87171 55%, transparent);

        &:hover:not(:disabled) {
            color: #fecaca;
            border-color: #f87171;
            background: color-mix(in srgb, #f87171 14%, transparent);
        }
    }
}

// ── Appearances ───────────────────────────────────────────────────────────────

.ch-appearances {
    display: flex;
    flex-direction: column;
    gap: 6px;

    h3 {
        display: flex;
        align-items: center;
        margin: 0;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--app-text-dim, #64748b);

        span {
            margin-left: 5px;
            font-weight: 400;
            opacity: 0.7;
        }
    }

    ul {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 4px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;
        color: var(--app-text, #e2e8f0);
        cursor: pointer;

        &:hover {
            background: var(--app-bg-hover, #1e293b);

            .ch-app-edit { opacity: 1; }
        }
    }
}

.ch-appearances-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--app-text-dim, #64748b);
}

.ch-app-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.ch-app-title {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ch-app-meta {
    flex: 0 0 auto;
    font-size: 0.7rem;
    color: var(--app-text-dim, #64748b);
}

.ch-app-role {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--app-bg-soft, #1e293b);
    font-size: 0.68rem;
    color: var(--app-text-muted, #94a3b8);
}

.ch-app-edit {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 2px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.14s, color 0.14s;

    &:hover { color: var(--app-accent-hover, #818cf8); }
}

.ch-error {
    margin: 0;
    font-size: 0.78rem;
    color: #f87171;
}
</style>

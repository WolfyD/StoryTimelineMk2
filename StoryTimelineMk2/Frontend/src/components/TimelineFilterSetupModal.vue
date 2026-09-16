<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PhX, PhPlus } from '@phosphor-icons/vue'
import { useTimelineStore } from '@/stores/timelineStore'
import type { FilterRule } from '@/types/models'

const emit = defineEmits<{ close: []; 'already-exists': [id: string] }>()
const store = useTimelineStore()

// ── dimension add forms ──────────────────────────────────────────────────────
const typeForm   = ref({ typeId: 1 })
const tagForm    = ref({ tagId: 0, tagName: '' })
const charForm   = ref({ characterId: '', characterName: '' })
const storyForm  = ref({ storyId: '', storyTitle: '' })
const kwForm     = ref({ query: '' })
const impForm    = ref({ op: '>', value: 5 })
const timeForm   = ref({ op: '>', year: 0, year2: null as number | null })
const boolForm   = ref({ field: 'has_picture' })
const lodForm    = ref({ lodIndex: 0 })
const colorForm  = ref({ hex: '#000000', tolerance: 10 })

const TYPE_LABELS: Record<number, string> = {
    1: 'Event', 2: 'Period', 3: 'Age', 4: 'Picture', 5: 'Note', 6: 'Bookmark'
}

// types that EXIST in the timeline's items
const usedTypeIds = computed(() =>
    [...new Set(store.items.map(i => i.TypeId).filter(t => t in TYPE_LABELS))].sort()
)

// ── already-in-filters sets ──────────────────────────────────────────────────
function parseRuleParams<T>(json: string): T | null {
    try { return JSON.parse(json) as T } catch { return null }
}

const inFilters = computed(() => {
    const types = new Set<number>(), tags = new Set<number>()
    const chars = new Set<string>(), stories = new Set<string>()
    const bools = new Set<string>(), lods = new Set<number>()
    for (const r of store.filterRules) {
        const p = parseRuleParams<Record<string, unknown>>(r.ParamsJson)
        if (!p) continue
        switch (r.Dimension) {
            case 'type':      types.add(p.typeId as number);        break
            case 'tag':       tags.add(p.tagId as number);          break
            case 'character': chars.add(p.characterId as string);   break
            case 'story':     stories.add(p.storyId as string);     break
            case 'boolean':   bools.add(p.field as string);         break
            case 'lod_level': lods.add(p.lodIndex as number);       break
        }
    }
    return { types, tags, chars, stories, bools, lods }
})

const availableTypeIds    = computed(() => usedTypeIds.value.filter(tid => !inFilters.value.types.has(tid)))
const availableTags       = computed(() => store.allTimelineTags.filter(t => !inFilters.value.tags.has(t.TagId)))
const availableCharacters = computed(() => store.allTimelineCharacters.filter(c => !inFilters.value.chars.has(c.Id)))
const availableStories    = computed(() => store.allTimelineStories.filter(s => !inFilters.value.stories.has(s.StoryId)))
const availableLodLevels  = computed(() => store.lodProfile.filter(l => !inFilters.value.lods.has(l.index)))

const BOOL_FIELDS = [
    { value: 'has_picture',    label: 'Has picture' },
    { value: 'has_tags',       label: 'Has tags' },
    { value: 'show_in_notes',  label: 'Shown in notes' },
]
const availableBoolFields = computed(() => BOOL_FIELDS.filter(f => !inFilters.value.bools.has(f.value)))

// auto-reset selects when their current value gets filtered out
watch(availableTypeIds,   (ids)    => { if (!ids.includes(typeForm.value.typeId))          typeForm.value.typeId    = ids[0] ?? 1 })
watch(availableLodLevels, (levels) => { if (!levels.find(l => l.index === lodForm.value.lodIndex)) lodForm.value.lodIndex = levels[0]?.index ?? 0 })
watch(availableBoolFields,(fields) => { if (!fields.find(f => f.value === boolForm.value.field))   boolForm.value.field   = fields[0]?.value ?? '' })

// ── duplicate detection for dynamic rules ────────────────────────────────────
const duplicateRuleId = ref<string | null>(null)
let _dupTimer = 0

function findDuplicate(dimension: string, params: Record<string, unknown>): string | null {
    const match = store.filterRules.find(r => {
        if (r.Dimension !== dimension) return false
        const p = parseRuleParams<Record<string, unknown>>(r.ParamsJson)
        return p ? Object.keys(params).every(k => p[k] === params[k]) : false
    })
    return match?.Id ?? null
}

function alertDuplicate(ruleId: string) {
    duplicateRuleId.value = ruleId
    emit('already-exists', ruleId)
    clearTimeout(_dupTimer)
    _dupTimer = window.setTimeout(() => { duplicateRuleId.value = null }, 2000)
}

function makeId() { return 'fr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12) }
function nextOrder() { return store.filterRules.length }

async function addRule(dimension: string, params: object, label: string) {
    const rule: FilterRule = {
        Id: makeId(),
        TimelineId: store.currentProject?.Id ?? 0,
        Dimension: dimension,
        ParamsJson: JSON.stringify(params),
        Label: label,
        State: 'neutral',
        SortOrder: nextOrder(),
    }
    await store.upsertFilterRule(rule)
}

function addType() {
    const label = TYPE_LABELS[typeForm.value.typeId] ?? `Type ${typeForm.value.typeId}`
    addRule('type', { typeId: typeForm.value.typeId }, `Type: ${label}`)
}

function addTag() {
    if (!tagForm.value.tagId) return
    addRule('tag', { tagId: tagForm.value.tagId }, `Tag: ${tagForm.value.tagName}`)
    tagForm.value = { tagId: 0, tagName: '' }
}

function addCharacter() {
    if (!charForm.value.characterId) return
    addRule('character', { characterId: charForm.value.characterId }, `Character: ${charForm.value.characterName}`)
    charForm.value = { characterId: '', characterName: '' }
}

function addStory() {
    if (!storyForm.value.storyId) return
    addRule('story', { storyId: storyForm.value.storyId }, `Story: ${storyForm.value.storyTitle}`)
    storyForm.value = { storyId: '', storyTitle: '' }
}

function addKeyword() {
    const q = kwForm.value.query.trim()
    if (!q) return
    const dup = findDuplicate('keyword', { query: q })
    if (dup) { alertDuplicate(dup); return }
    addRule('keyword', { query: q }, `Keyword: "${q}"`)
    kwForm.value.query = ''
}

function addImportance() {
    const { op, value } = impForm.value
    const dup = findDuplicate('importance', { op, value })
    if (dup) { alertDuplicate(dup); return }
    const opLabel = op === '>' ? '>' : op === '<' ? '<' : '='
    addRule('importance', { op, value }, `Importance ${opLabel} ${value}`)
}

function addTimeRange() {
    const { op, year, year2 } = timeForm.value
    const params: any = { op, year }
    if (op === 'between') params.year2 = year2
    const dup = findDuplicate('time_range', params)
    if (dup) { alertDuplicate(dup); return }
    let label = ''
    if (op === 'between') { label = `Year ${year}–${year2 ?? year}` }
    else label = `Year ${op} ${year}`
    addRule('time_range', params, label)
}

function addBoolean() {
    const labels: Record<string, string> = { has_picture: 'Has picture', has_tags: 'Has tags', show_in_notes: 'Shown in notes' }
    addRule('boolean', { field: boolForm.value.field }, labels[boolForm.value.field] ?? boolForm.value.field)
}

function addLod() {
    const level = store.lodProfile.find(l => l.index === lodForm.value.lodIndex)
    const name = level?.formatKey ?? `LOD ${lodForm.value.lodIndex}`
    addRule('lod_level', { lodIndex: lodForm.value.lodIndex }, `Visible at: ${name}`)
}

function addColor() {
    const { hex, tolerance } = colorForm.value
    const dup = findDuplicate('color', { hex, tolerance })
    if (dup) { alertDuplicate(dup); return }
    addRule('color', { hex, tolerance }, `Color ±${tolerance}`)
}

function selectTagFromList(t: { TagId: number; TagName: string }) {
    tagForm.value = { tagId: t.TagId, tagName: t.TagName }
}
function selectCharFromList(c: { Id: string; Name: string }) {
    charForm.value = { characterId: c.Id, characterName: c.Name }
}
function selectStoryFromList(s: { StoryId: string; StoryTitle: string }) {
    storyForm.value = { storyId: s.StoryId, storyTitle: s.StoryTitle }
}
function selectColorFromPalette(hex: string) {
    colorForm.value.hex = hex
}
</script>

<template>
    <div class="fsetup-panel">

        <div class="fsetup-topbar">
            <span class="fsetup-topbar-label">Add filters</span>
            <button class="fsetup-close" @click="emit('close')"><PhX :size="14" /></button>
        </div>

        <div class="dup-msg-anchor">
            <Transition name="dup-fade">
                <div v-if="duplicateRuleId" class="dup-msg">Already added — highlighted above</div>
            </Transition>
        </div>

                <!-- ── add new rules ── -->
                <div class="fsetup-section fsetup-section--add">

                    <div class="add-grid">

                        <!-- Type -->
                        <div class="add-block" v-if="availableTypeIds.length > 0">
                            <div class="add-block-title">Item Type</div>
                            <div class="add-row">
                                <select class="fs-select" v-model.number="typeForm.typeId">
                                    <option v-for="tid in availableTypeIds" :key="tid" :value="tid">{{ TYPE_LABELS[tid] }}</option>
                                </select>
                                <button class="add-btn" @click="addType"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Tag -->
                        <div class="add-block">
                            <div class="add-block-title">Tag</div>
                            <div v-if="availableTags.length === 0" class="all-added-msg">All tags already added</div>
                            <template v-else>
                                <div class="tag-chip-list">
                                    <button
                                        v-for="t in availableTags" :key="t.TagId"
                                        class="picker-chip"
                                        :class="{ selected: tagForm.tagId === t.TagId }"
                                        @click="selectTagFromList(t)"
                                    >{{ t.TagName }}</button>
                                </div>
                                <button class="add-btn add-btn--inline" :disabled="!tagForm.tagId" @click="addTag">
                                    <PhPlus :size="12" /> Add "{{ tagForm.tagName || '…' }}"
                                </button>
                            </template>
                        </div>

                        <!-- Character -->
                        <div class="add-block">
                            <div class="add-block-title">Character</div>
                            <div v-if="availableCharacters.length === 0" class="all-added-msg">All characters already added</div>
                            <template v-else>
                                <div class="tag-chip-list">
                                    <button
                                        v-for="c in availableCharacters" :key="c.Id"
                                        class="picker-chip"
                                        :class="{ selected: charForm.characterId === c.Id }"
                                        :style="c.Color ? { borderColor: c.Color } : {}"
                                        @click="selectCharFromList(c)"
                                    >{{ c.Name }}</button>
                                </div>
                                <button class="add-btn add-btn--inline" :disabled="!charForm.characterId" @click="addCharacter">
                                    <PhPlus :size="12" /> Add "{{ charForm.characterName || '…' }}"
                                </button>
                            </template>
                        </div>

                        <!-- Story -->
                        <div class="add-block" v-if="store.allTimelineStories.length > 0">
                            <div class="add-block-title">Story</div>
                            <div v-if="availableStories.length === 0" class="all-added-msg">All stories already added</div>
                            <template v-else>
                                <div class="tag-chip-list">
                                    <button
                                        v-for="s in availableStories" :key="s.StoryId"
                                        class="picker-chip"
                                        :class="{ selected: storyForm.storyId === s.StoryId }"
                                        @click="selectStoryFromList(s)"
                                    >{{ s.StoryTitle }}</button>
                                </div>
                                <button class="add-btn add-btn--inline" :disabled="!storyForm.storyId" @click="addStory">
                                    <PhPlus :size="12" /> Add "{{ storyForm.storyTitle || '…' }}"
                                </button>
                            </template>
                        </div>

                        <!-- Keyword -->
                        <div class="add-block">
                            <div class="add-block-title">Keyword (title / description / content)</div>
                            <div class="add-row">
                                <input class="fs-input" v-model="kwForm.query" placeholder="Search text…" @keydown.enter="addKeyword" />
                                <button class="add-btn" :disabled="!kwForm.query.trim()" @click="addKeyword"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Importance -->
                        <div class="add-block">
                            <div class="add-block-title">Importance</div>
                            <div class="add-row">
                                <select class="fs-select fs-select--narrow" v-model="impForm.op">
                                    <option value=">">Greater than</option>
                                    <option value="<">Less than</option>
                                    <option value="=">Equal to</option>
                                </select>
                                <input class="fs-input fs-input--narrow" type="number" min="1" max="10" v-model.number="impForm.value" />
                                <button class="add-btn" @click="addImportance"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Time range -->
                        <div class="add-block">
                            <div class="add-block-title">Time / Year</div>
                            <div class="add-row">
                                <select class="fs-select fs-select--narrow" v-model="timeForm.op">
                                    <option value=">">After year</option>
                                    <option value="<">Before year</option>
                                    <option value="=">At year</option>
                                    <option value="between">Between</option>
                                </select>
                                <input class="fs-input fs-input--narrow" type="number" v-model.number="timeForm.year" placeholder="Year" />
                                <template v-if="timeForm.op === 'between'">
                                    <span class="range-sep">–</span>
                                    <input class="fs-input fs-input--narrow" type="number" v-model.number="timeForm.year2" placeholder="Year 2" />
                                </template>
                                <button class="add-btn" @click="addTimeRange"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Boolean flags -->
                        <div class="add-block" v-if="availableBoolFields.length > 0">
                            <div class="add-block-title">Flag</div>
                            <div class="add-row">
                                <select class="fs-select" v-model="boolForm.field">
                                    <option v-for="f in availableBoolFields" :key="f.value" :value="f.value">{{ f.label }}</option>
                                </select>
                                <button class="add-btn" @click="addBoolean"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- LOD visibility -->
                        <div class="add-block" v-if="availableLodLevels.length > 0">
                            <div class="add-block-title">Visible at LOD level</div>
                            <div class="add-row">
                                <select class="fs-select" v-model.number="lodForm.lodIndex">
                                    <option v-for="l in availableLodLevels" :key="l.index" :value="l.index">{{ l.formatKey }}</option>
                                </select>
                                <button class="add-btn" @click="addLod"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Color -->
                        <div class="add-block">
                            <div class="add-block-title">Item color (±tolerance per channel)</div>
                            <div class="add-row">
                                <input class="fs-color" type="color" v-model="colorForm.hex" />
                                <span class="color-hex">{{ colorForm.hex }}</span>
                                <span class="range-sep">±</span>
                                <input class="fs-input fs-input--narrow" type="number" min="0" max="255" v-model.number="colorForm.tolerance" />
                                <button class="add-btn" @click="addColor"><PhPlus :size="12" /></button>
                            </div>
                            <!-- palette from items in this timeline -->
                            <div class="color-palette" v-if="store.allTimelineColors.length > 0">
                                <button
                                    v-for="hex in store.allTimelineColors" :key="hex"
                                    class="palette-swatch"
                                    :style="{ background: hex }"
                                    :title="hex"
                                    :class="{ selected: colorForm.hex === hex }"
                                    @click="selectColorFromPalette(hex)"
                                />
                            </div>
                        </div>

                    </div>
                </div>

    </div>
</template>

<style scoped lang="scss">
/* ── duplicate message ── */
.dup-msg-anchor {
    position: relative;
    height: 0;
    overflow: visible;
    z-index: 10;
}

.dup-msg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 4px 14px;
    font-size: 0.7rem;
    color: var(--app-tool-active-color, #86efac);
    background: color-mix(in srgb, var(--app-tool-active-border, #4ade80) 15%, var(--filter-panel-bg, #111a11));
    border-top: 1px solid color-mix(in srgb, var(--app-tool-active-border, #4ade80) 30%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--app-tool-active-border, #4ade80) 30%, transparent);
    pointer-events: none;
}

.dup-fade-enter-active, .dup-fade-leave-active { transition: opacity 0.2s; }
.dup-fade-enter-from, .dup-fade-leave-to { opacity: 0; }

/* ── "all already added" placeholder ── */
.all-added-msg {
    font-size: 0.68rem;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.5;
    font-style: italic;
}

/* ── panel shell ── */
.fsetup-panel {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 200;
    background: var(--filter-panel-bg, #111a11);
    border-bottom: 1px solid var(--filter-panel-border, #2a4a2a);
    border-left: 1px solid var(--filter-panel-border, #2a4a2a);
    border-right: 1px solid var(--filter-panel-border, #2a4a2a);
    border-radius: 0 0 6px 6px;
    max-height: 56vh;
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);

    &::-webkit-scrollbar { width: 5px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--filter-panel-border, #2a4a2a); border-radius: 3px; }
}

/* ── top bar: active rules + close ── */
.fsetup-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--filter-panel-border, #2a4a2a);
    flex-shrink: 0;
    flex-wrap: wrap;
}

.fsetup-topbar-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.7;
    flex-shrink: 0;
}


.fsetup-close {
    margin-left: auto;
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.6;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: opacity 0.1s;
    &:hover { opacity: 1; }
}

.fsetup-section {
    padding: 10px 14px;
    &--add { border-top: none; }
}

/* ── add grid ── */
.add-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
}

.add-block {
    background: color-mix(in srgb, var(--filter-panel-border, #2a4a2a) 20%, var(--filter-panel-bg, #111a11));
    border: 1px solid color-mix(in srgb, var(--filter-panel-border, #2a4a2a) 60%, transparent);
    border-radius: 5px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.add-block-title {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--filter-chip-color, #7a9a7a);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.add-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
}

.range-sep {
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.8rem;
    opacity: 0.6;
}

.fs-select {
    flex: 1;
    background: color-mix(in srgb, var(--filter-panel-border, #2a4a2a) 12%, var(--filter-panel-bg, #111a11));
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    border-radius: 4px;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.76rem;
    padding: 3px 5px;
    outline: none;
    &:focus { border-color: var(--app-tool-active-border, #4ade80); }
    &--narrow { flex: 0 0 auto; max-width: 140px; }
}

.fs-input {
    flex: 1;
    background: color-mix(in srgb, var(--filter-panel-border, #2a4a2a) 12%, var(--filter-panel-bg, #111a11));
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    border-radius: 4px;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.76rem;
    padding: 3px 5px;
    outline: none;
    min-width: 0;
    &:focus { border-color: var(--app-tool-active-border, #4ade80); }
    &--narrow { flex: 0 0 70px; width: 70px; }
}

.fs-color {
    width: 30px;
    height: 22px;
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    border-radius: 3px;
    background: none;
    cursor: pointer;
    padding: 1px;
}

.color-hex {
    font-size: 0.7rem;
    color: var(--filter-chip-color, #7a9a7a);
    opacity: 0.7;
    font-family: monospace;
}

.add-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border: 1px solid var(--app-save-accent, #446b40);
    border-radius: 4px;
    background: color-mix(in srgb, var(--app-save-accent, #446b40) 25%, transparent);
    color: var(--app-tool-active-color, #86efac);
    font-size: 0.73rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.12s;
    &:disabled { opacity: 0.35; cursor: default; }
    &:not(:disabled):hover { background: var(--app-save-accent, #446b40); color: #e8f5e5; }
    &--inline { align-self: flex-start; }
}

/* ── chip pickers (tag / char / story) ── */
.tag-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    max-height: 72px;
    overflow-y: auto;
}

.picker-chip {
    padding: 1px 7px;
    border: 1px solid var(--filter-chip-border, #3a5a3a);
    border-radius: 10px;
    background: transparent;
    color: var(--filter-chip-color, #7a9a7a);
    font-size: 0.7rem;
    cursor: pointer;
    transition: background 0.1s;
    &:hover { background: color-mix(in srgb, var(--filter-chip-border, #3a5a3a) 30%, transparent); }
    &.selected {
        background: color-mix(in srgb, var(--app-tool-active-border, #4ade80) 16%, transparent);
        border-color: var(--app-tool-active-border, #4ade80);
        color: var(--app-tool-active-color, #86efac);
    }
}

/* ── color palette ── */
.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
}

.palette-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
    &.selected { border-color: rgba(255, 255, 255, 0.7); }
    &:hover { transform: scale(1.18); }
}
</style>

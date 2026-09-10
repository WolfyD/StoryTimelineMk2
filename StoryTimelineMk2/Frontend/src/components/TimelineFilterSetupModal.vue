<script setup lang="ts">
import { ref, computed } from 'vue'
import { PhX, PhTrash, PhPlus } from '@phosphor-icons/vue'
import { useTimelineStore } from '@/stores/timelineStore'
import type { FilterRule } from '@/types/models'

const emit = defineEmits<{ close: [] }>()
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

const usedTypeIds = computed(() =>
    [...new Set(store.items.map(i => i.TypeId).filter(t => t in TYPE_LABELS))].sort()
)

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
    addRule('keyword', { query: q }, `Keyword: "${q}"`)
    kwForm.value.query = ''
}

function addImportance() {
    const { op, value } = impForm.value
    const opLabel = op === '>' ? '>' : op === '<' ? '<' : '='
    addRule('importance', { op, value }, `Importance ${opLabel} ${value}`)
}

function addTimeRange() {
    const { op, year, year2 } = timeForm.value
    const params: any = { op, year }
    let label = ''
    if (op === 'between') { params.year2 = year2; label = `Year ${year}–${year2 ?? year}` }
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
    addRule('color', { hex: colorForm.value.hex, tolerance: colorForm.value.tolerance },
        `Color ±${colorForm.value.tolerance}`)
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
    <Teleport to="body">
        <div class="fsetup-backdrop" @click.self="emit('close')">
            <div class="fsetup-modal">
                <div class="fsetup-header">
                    <span class="fsetup-title">Filter Setup</span>
                    <button class="fsetup-close" @click="emit('close')"><PhX :size="16" /></button>
                </div>

                <!-- ── TOP SECTION: active rules ── -->
                <div class="fsetup-section">
                    <div class="fsetup-section-label">Active rules</div>
                    <div v-if="store.filterRules.length === 0" class="fsetup-empty">
                        No rules yet — add some below.
                    </div>
                    <div class="rules-list">
                        <div v-for="rule in store.filterRules" :key="rule.Id" class="rule-row">
                            <span class="rule-label">{{ rule.Label }}</span>
                            <span class="rule-dim">{{ rule.Dimension }}</span>
                            <button class="rule-del" title="Delete rule" @click="store.deleteFilterRule(rule.Id)">
                                <PhTrash :size="13" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ── BOTTOM SECTION: add new rules ── -->
                <div class="fsetup-section fsetup-section--add">
                    <div class="fsetup-section-label">Add new rules</div>

                    <div class="add-grid">

                        <!-- Type -->
                        <div class="add-block">
                            <div class="add-block-title">Item Type</div>
                            <div class="add-row">
                                <select class="fs-select" v-model.number="typeForm.typeId">
                                    <option v-for="tid in usedTypeIds" :key="tid" :value="tid">{{ TYPE_LABELS[tid] }}</option>
                                </select>
                                <button class="add-btn" @click="addType"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- Tag -->
                        <div class="add-block">
                            <div class="add-block-title">Tag</div>
                            <div class="tag-chip-list">
                                <button
                                    v-for="t in store.allTimelineTags" :key="t.TagId"
                                    class="picker-chip"
                                    :class="{ selected: tagForm.tagId === t.TagId }"
                                    @click="selectTagFromList(t)"
                                >{{ t.TagName }}</button>
                            </div>
                            <button class="add-btn add-btn--inline" :disabled="!tagForm.tagId" @click="addTag">
                                <PhPlus :size="12" /> Add "{{ tagForm.tagName || '…' }}"
                            </button>
                        </div>

                        <!-- Character -->
                        <div class="add-block">
                            <div class="add-block-title">Character</div>
                            <div class="tag-chip-list">
                                <button
                                    v-for="c in store.allTimelineCharacters" :key="c.Id"
                                    class="picker-chip"
                                    :class="{ selected: charForm.characterId === c.Id }"
                                    :style="c.Color ? { borderColor: c.Color } : {}"
                                    @click="selectCharFromList(c)"
                                >{{ c.Name }}</button>
                            </div>
                            <button class="add-btn add-btn--inline" :disabled="!charForm.characterId" @click="addCharacter">
                                <PhPlus :size="12" /> Add "{{ charForm.characterName || '…' }}"
                            </button>
                        </div>

                        <!-- Story -->
                        <div class="add-block" v-if="store.allTimelineStories.length > 0">
                            <div class="add-block-title">Story</div>
                            <div class="tag-chip-list">
                                <button
                                    v-for="s in store.allTimelineStories" :key="s.StoryId"
                                    class="picker-chip"
                                    :class="{ selected: storyForm.storyId === s.StoryId }"
                                    @click="selectStoryFromList(s)"
                                >{{ s.StoryTitle }}</button>
                            </div>
                            <button class="add-btn add-btn--inline" :disabled="!storyForm.storyId" @click="addStory">
                                <PhPlus :size="12" /> Add "{{ storyForm.storyTitle || '…' }}"
                            </button>
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
                        <div class="add-block">
                            <div class="add-block-title">Flag</div>
                            <div class="add-row">
                                <select class="fs-select" v-model="boolForm.field">
                                    <option value="has_picture">Has picture</option>
                                    <option value="has_tags">Has tags</option>
                                    <option value="show_in_notes">Shown in notes</option>
                                </select>
                                <button class="add-btn" @click="addBoolean"><PhPlus :size="12" /></button>
                            </div>
                        </div>

                        <!-- LOD visibility -->
                        <div class="add-block" v-if="store.lodProfile.length > 0">
                            <div class="add-block-title">Visible at LOD level</div>
                            <div class="add-row">
                                <select class="fs-select" v-model.number="lodForm.lodIndex">
                                    <option v-for="l in store.lodProfile" :key="l.index" :value="l.index">{{ l.formatKey }}</option>
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
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
.fsetup-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 5vh;
    z-index: 1000;
}

.fsetup-modal {
    width: 90vw;
    max-height: 88vh;
    overflow-y: auto;
    background: #151e15;
    border: 1px solid #3a4a3a88;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0;
    box-shadow: 0 8px 32px #00000088;
}

.fsetup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #2a3a2a;
    flex-shrink: 0;
}

.fsetup-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #c0d0c0;
}

.fsetup-close {
    background: none;
    border: none;
    color: #8a9a8a;
    cursor: pointer;
    padding: 2px;
    &:hover { color: #e0e0e0; }
}

.fsetup-section {
    padding: 12px 16px;
    border-bottom: 1px solid #1e2e1e;

    &--add {
        border-bottom: none;
    }
}

.fsetup-section-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #6a8a6a;
    margin-bottom: 10px;
}

.fsetup-empty {
    font-size: 0.78rem;
    color: #5a6a5a;
    font-style: italic;
}

/* ── active rules list ── */
.rules-list { display: flex; flex-direction: column; gap: 4px; }

.rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: #1e2a1e55;
    border-radius: 4px;
    border: 1px solid #2a3a2a55;
}

.rule-label { flex: 1; font-size: 0.8rem; color: #b0c8b0; }

.rule-dim {
    font-size: 0.68rem;
    color: #5a7a5a;
    background: #1a2a1a;
    border-radius: 3px;
    padding: 1px 5px;
}

.rule-del {
    background: none;
    border: none;
    color: #8a6060;
    cursor: pointer;
    padding: 2px;
    &:hover { color: #e09090; }
}

/* ── add grid ── */
.add-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
}

.add-block {
    background: #1a261a66;
    border: 1px solid #2a3a2a55;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.add-block-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: #7a9a7a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.add-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.range-sep { color: #6a8a6a; font-size: 0.8rem; }

.fs-select {
    flex: 1;
    background: #0f1a0f;
    border: 1px solid #3a4a3a;
    border-radius: 4px;
    color: #c0d0c0;
    font-size: 0.78rem;
    padding: 3px 6px;
    outline: none;
    &:focus { border-color: #5a8a5a; }
    &--narrow { flex: 0 0 auto; max-width: 140px; }
}

.fs-input {
    flex: 1;
    background: #0f1a0f;
    border: 1px solid #3a4a3a;
    border-radius: 4px;
    color: #c0d0c0;
    font-size: 0.78rem;
    padding: 3px 6px;
    outline: none;
    min-width: 0;
    &:focus { border-color: #5a8a5a; }
    &--narrow { flex: 0 0 70px; width: 70px; }
}

.fs-color {
    width: 32px;
    height: 24px;
    border: 1px solid #3a4a3a;
    border-radius: 3px;
    background: none;
    cursor: pointer;
    padding: 1px;
}

.color-hex {
    font-size: 0.72rem;
    color: #8a9a8a;
    font-family: monospace;
}

.add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid #4a7a4a;
    border-radius: 4px;
    background: #2a4a2a;
    color: #a0d0a0;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    &:disabled { opacity: 0.4; cursor: default; }
    &:not(:disabled):hover { background: #3a5a3a; }
    &--inline { align-self: flex-start; }
}

/* ── chip pickers ── */
.tag-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 80px;
    overflow-y: auto;
}

.picker-chip {
    padding: 2px 8px;
    border: 1px solid #4a5c4a;
    border-radius: 10px;
    background: transparent;
    color: #8fa88f;
    font-size: 0.72rem;
    cursor: pointer;
    &:hover { background: #2a3a2a66; color: #c8d8c8; }
    &.selected { background: #2a5a2a; border-color: #5a9a5a; color: #c0f0c0; }
}

/* ── color palette ── */
.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
}

.palette-swatch {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: 2px solid transparent;
    cursor: pointer;
    &.selected { border-color: #ffffffaa; }
    &:hover { transform: scale(1.15); }
}
</style>

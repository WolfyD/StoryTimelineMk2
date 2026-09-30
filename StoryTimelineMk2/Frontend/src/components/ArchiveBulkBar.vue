<script setup lang="ts">
/**
 * BL-88: the Archive's bulk edit — the bar under the Items tab while anything is ticked, and the dialog
 * each of its buttons opens. A dialog changes one thing on every ticked item and leaves the rest alone.
 * The rows follow by the ItemSaved push each changed item sends.
 */
import { computed, ref } from 'vue'
import { PhBookOpenText, PhPalette, PhStack, PhStar, PhTag, PhTrash, PhX } from '@phosphor-icons/vue'
import { BackendAPI, logError } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { ALL_LODS_MASK, DEFAULT_SWATCHES, loadSwatches } from '@/utils/timelinePrefs'
import BaseModal from '@/components/BaseModal.vue'
import LodMaskModal from '@/components/LodMaskModal.vue'
import type { BulkItemEdit, Story, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** The ticked items, never empty while the bar shows. */
    items: TimelineItem[]
    tags: { Id: number; Name: string }[]
    /** The names of the tags in the trash: one added now would go with it when the Archive closes. */
    binned: string[]
    stories: Story[]
}>()
const emit = defineEmits<{ trash: []; clear: [] }>()

const store = useTimelineStore()

type Mode = 'lod' | 'importance' | 'colour' | 'tag' | 'story'
const TITLES: Record<Mode, string> = { lod: 'Visible at zoom levels', importance: 'Importance', colour: 'Colour', tag: 'Tag', story: 'Story' }
const mode = ref<Mode | null>(null)
const busy = ref(false)
const error = ref('')

const lodMask = ref(ALL_LODS_MASK)
const importance = ref(5)
const colour = ref('#6366f1')
const swatches = ref<string[]>([...DEFAULT_SWATCHES])
const tagName = ref('')
const storyId = ref('')

const n = computed(() => props.items.length)
const applyLabel = computed(() => `Apply to ${n.value} item${n.value === 1 ? '' : 's'}`)
/** Tags are stored lowercased and trimmed; Remove needs one that exists. */
const tagMatch = computed(() => props.tags.find(t => t.Name === tagName.value.trim().toLowerCase()))
const tagBinned = computed(() => props.binned.includes(tagName.value.trim().toLowerCase()))
const sortedStories = computed(() => [...props.stories].sort((a, b) => (a.Title || '').localeCompare(b.Title || '')))

/** What every ticked item shares, or the fallback when they differ. */
function shared<T>(of: (i: TimelineItem) => T, fallback: T): T {
    const v = of(props.items[0]!)
    return props.items.every(i => of(i) === v) ? v : fallback
}

async function open(m: Mode) {
    error.value = ''
    lodMask.value = shared(i => i.LodVisibilityMask, ALL_LODS_MASK)
    importance.value = shared(i => i.Importance, 5)
    colour.value = shared(i => i.Color, null) || '#6366f1'
    tagName.value = ''
    storyId.value = ''
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
    void logError(`ArchiveBulkBar: ${what}`, ex)
}

/** Not while a change is on its way: its failure would have nowhere to show. */
function close() {
    if (!busy.value) mode.value = null
}

async function apply(edit: Omit<BulkItemEdit, 'ids'>) {
    busy.value = true
    error.value = ''
    try {
        await BackendAPI.BulkEditItems({ ids: props.items.map(i => i.Id), ...edit })
        mode.value = null
    } catch (ex) {
        fail('The items were not changed', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="ab-bar">
        <span class="ab-count">{{ n }} selected</span>
        <button class="ar-btn" @click="open('lod')"><PhStack :size="15" /> LOD</button>
        <button class="ar-btn" @click="open('importance')"><PhStar :size="15" /> Importance</button>
        <button class="ar-btn" @click="open('colour')"><PhPalette :size="15" /> Colour</button>
        <button class="ar-btn" @click="open('tag')"><PhTag :size="15" /> Tags</button>
        <button class="ar-btn" @click="open('story')"><PhBookOpenText :size="15" /> Story</button>
        <button class="ar-btn ab-danger" data-tip="Move them to the trash" @click="emit('trash')"><PhTrash :size="15" /> Trash</button>
        <button class="ar-icon ab-clear" aria-label="Clear the selection" data-tip="Clear the selection" @click="emit('clear')"><PhX :size="18" /></button>

        <LodMaskModal
            v-if="mode === 'lod'"
            v-model="lodMask"
            :lod-profile="store.lodProfile"
            :title="TITLES.lod"
            :hint="`Replaces the setting of the ${n} ticked item${n === 1 ? '' : 's'}.`"
            :apply-label="applyLabel"
            :close-on-apply="false"
            :busy="busy"
            :error="error"
            @apply="apply({ lodMask: $event })"
            @close="close"
        />
        <BaseModal v-else-if="mode" :title="TITLES[mode]" width="min(400px, 92vw)" @close="close">
            <div class="ab-body">
                <label v-if="mode === 'importance'" class="ap-field">
                    <span>Importance ({{ importance }})</span>
                    <input v-model.number="importance" type="range" min="1" max="10" step="1" />
                </label>

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
                    <p v-if="items.some(i => i.TypeId === 7)" class="ab-hint">Birth and death items keep their character's colour.</p>
                </template>

                <template v-else-if="mode === 'tag'">
                    <label class="ap-field">
                        <span>Tag</span>
                        <input v-model="tagName" type="text" list="ab-tags" placeholder="Pick a tag, or type a new one" />
                    </label>
                    <datalist id="ab-tags"><option v-for="t in tags" :key="t.Id" :value="t.Name" /></datalist>
                    <p v-if="tagBinned" class="ab-hint ab-hint--warn">“{{ tagName.trim().toLowerCase() }}” is in the trash. Restore it to add it.</p>
                    <p v-else class="ab-hint">Add puts it on every ticked item; a new name makes a new tag. Remove takes it off the ones that have it.</p>
                </template>

                <label v-else class="ap-field">
                    <span>Story</span>
                    <select v-model="storyId">
                        <option value="" disabled>Pick a story…</option>
                        <option v-for="s in sortedStories" :key="s.Id" :value="s.Id">{{ s.Title || 'Untitled' }}</option>
                    </select>
                </label>

                <p v-if="error" class="ab-error">{{ error }}</p>
            </div>

            <template #footer>
                <button class="ap-btn" data-cancel :disabled="busy" @click="mode = null">Cancel</button>
                <template v-if="mode === 'tag'">
                    <button class="ap-btn ap-btn--danger" :disabled="busy || !tagMatch" @click="apply({ removeTagId: tagMatch!.Id })">Remove from all</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy || !tagName.trim() || tagBinned" @click="apply({ addTag: tagName })">Add to all</button>
                </template>
                <template v-else-if="mode === 'story'">
                    <button class="ap-btn ap-btn--danger" :disabled="busy || !storyId" @click="apply({ removeStoryId: storyId })">Remove from all</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy || !storyId" @click="apply({ addStoryId: storyId })">Add to all</button>
                </template>
                <template v-else-if="mode === 'colour'">
                    <button class="ap-btn" :disabled="busy" @click="apply({ color: '' })">No colour</button>
                    <button class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="apply({ color: colour })">{{ applyLabel }}</button>
                </template>
                <button v-else class="ap-btn ap-btn--primary" data-primary :disabled="busy" @click="apply({ importance })">{{ applyLabel }}</button>
            </template>
        </BaseModal>
    </div>
</template>
<!-- Styled by ArchiveApp's ab- block, which every tab's bar shares. -->

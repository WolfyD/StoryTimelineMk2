<script setup lang="ts">
/**
 * BL-88: the Media tab's bulk edit — the bar while any picture is ticked, and the dialog each button
 * opens. One backend call per change; the items it touches are pushed back to the canvas from there.
 */
import { computed, ref } from 'vue'
import { PhImages, PhLinkBreak, PhTrash, PhX } from '@phosphor-icons/vue'
import { BackendAPI, logError } from '@/bridge/api'
import BaseModal from '@/components/BaseModal.vue'
import type { MediaItem, TimelineItem } from '@/types/models'

const props = defineProps<{
    timelineId: number
    /** The ticked pictures, never empty while the bar shows. */
    pictures: MediaItem[]
    /** This timeline's items not in the trash — what a picture can be put on. */
    items: Map<string, TimelineItem>
    when: (i: TimelineItem) => string
}>()
const emit = defineEmits<{ trash: []; clear: []; saved: [] }>()

type Mode = 'attach' | 'detach'
const TITLES: Record<Mode, string> = { attach: 'Put on an item', detach: 'Take off this timeline’s items' }
const mode = ref<Mode | null>(null)
const busy = ref(false)
const error = ref('')

const query = ref('')
const itemId = ref('')

const n = computed(() => props.pictures.length)
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`

/**
 * A character's birth or death shows the portrait and nothing else; a timeline's ends show nothing.
 * ponytail: every match in one list; a search is the way through a long timeline.
 */
const choices = computed(() => {
    const needle = query.value.trim().toLowerCase()
    return [...props.items.values()]
        .filter(i => i.TypeId < 7 && (!needle || (i.Title || '').toLowerCase().includes(needle)))
        .sort((a, b) => a.AbsoluteStart - b.AbsoluteStart)
})

/** The items here that lose one of them — a character's birth or death keeps its portrait. */
const losing = computed(() => new Set(props.pictures.flatMap(p =>
    (p.Uses ?? []).filter(u => u.Kind === 'item' && u.Here && u.TypeId !== 7).map(u => u.Id))).size)

function open(m: Mode) {
    error.value = ''
    query.value = ''
    itemId.value = ''
    mode.value = m
}

/** Not while a change is on its way: its failure would have nowhere to show. */
function close() {
    if (!busy.value) mode.value = null
}

async function apply(edit: { attachTo?: string; detachFrom?: number }) {
    busy.value = true
    error.value = ''
    try {
        await BackendAPI.BulkEditMedia({ ids: props.pictures.map(p => p.Id), ...edit })
        mode.value = null
        emit('saved')
    } catch (ex) {
        // Shown in the dialog, so logged without the alert.
        error.value = `Nothing was changed: ${ex instanceof Error ? ex.message : String(ex)}`
        void logError('ArchiveMediaBar: Nothing was changed', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="ab-bar">
        <span class="ab-count">{{ n }} selected</span>
        <button class="ar-btn" @click="open('attach')"><PhImages :size="15" /> Put on an item</button>
        <button class="ar-btn" @click="open('detach')"><PhLinkBreak :size="15" /> Take off items</button>
        <button class="ar-btn ab-danger" data-tip="Move them to the trash" @click="emit('trash')"><PhTrash :size="15" /> Trash</button>
        <button class="ar-icon ab-clear" aria-label="Clear the selection" data-tip="Clear the selection" @click="emit('clear')"><PhX :size="18" /></button>

        <BaseModal v-if="mode" :title="TITLES[mode]" width="min(440px, 92vw)" @close="close">
            <div class="ab-body">
                <template v-if="mode === 'attach'">
                    <label class="ap-field">
                        <span>Find the item</span>
                        <input v-model="query" type="text" placeholder="Type part of its title…" />
                    </label>
                    <label class="ap-field">
                        <span>Item</span>
                        <select v-model="itemId" size="8" @dblclick="itemId && apply({ attachTo: itemId })">
                            <option v-for="i in choices" :key="i.Id" :value="i.Id">{{ i.Title || 'Untitled' }} · {{ when(i) }}</option>
                        </select>
                    </label>
                    <p v-if="!choices.length" class="ab-hint">{{ query.trim() ? `No item matches “${query.trim()}”.` : 'This timeline has no item to put them on.' }}</p>
                    <p class="ab-hint">They are added to the pictures it shows already.</p>
                </template>

                <template v-else>
                    <p class="ab-hint">
                        <template v-if="losing">{{ plural(losing, 'item') }} of this timeline stop showing them.</template>
                        <template v-else>None of them is on an item of this timeline.</template>
                        The pictures stay in the library, and on maps, portraits and other timelines. A character’s
                        birth or death keeps its portrait.
                    </p>
                </template>

                <p v-if="error" class="ab-error">{{ error }}</p>
            </div>

            <template #footer>
                <button class="ap-btn" data-cancel :disabled="busy" @click="mode = null">Cancel</button>
                <button
                    v-if="mode === 'attach'"
                    class="ap-btn ap-btn--primary"
                    data-primary
                    :disabled="busy || !itemId"
                    @click="apply({ attachTo: itemId })"
                >Put {{ n === 1 ? 'it' : `all ${n}` }} on it</button>
                <button
                    v-else
                    class="ap-btn ap-btn--primary"
                    data-primary
                    :disabled="busy || !losing"
                    @click="apply({ detachFrom: timelineId })"
                >Take off {{ plural(losing, 'item') }}</button>
            </template>
        </BaseModal>
    </div>
</template>
<!-- Styled by ArchiveApp's ab- block, which every tab's bar shares. -->

<script setup lang="ts">
/**
 * BL-88: one of a story's memorable quotes — a line and who said it, or an exchange of several.
 * Works on a copy, so Cancel means what it says. A speaker is a name as typed, the timeline's
 * characters offered first; the narrator or an unnamed guard can say things too.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import type { QuoteLine } from '@/types/models'

const props = defineProps<{ quote: QuoteLine[]; names: string[] }>()
const emit = defineEmits<{ close: []; save: [QuoteLine[]] }>()

const lines = ref<QuoteLine[]>(props.quote.length ? props.quote.map(l => ({ ...l })) : [{ text: '', speaker: '' }])
/** Blank lines drop; so does the speaker's stray space. */
const kept = computed(() => lines.value
    .map(l => ({ text: l.text.trim(), speaker: l.speaker.trim() }))
    .filter(l => l.text))

const body = ref<HTMLElement | null>(null)
const focusLine = (n: number) => body.value?.querySelectorAll('textarea')[n]?.focus()
onMounted(() => focusLine(0))

async function addLine() {
    lines.value.push({ text: '', speaker: '' })
    await nextTick()
    focusLine(lines.value.length - 1)
}

const showDiscard = ref(false)
const snapshot = () => JSON.stringify(kept.value)
const clean = snapshot()

function requestClose() {
    if (snapshot() === clean) emit('close')
    else showDiscard.value = true
}
</script>

<template>
    <BaseModal :title="quote.length ? 'Edit quote' : 'New quote'" width="min(560px, 94vw)" @close="requestClose">
        <div ref="body" class="modal-body">
            <div v-for="(l, n) in lines" :key="n" class="sq-line">
                <textarea v-model="l.text" class="s-input s-textarea" rows="2" placeholder="What was said" />
                <div class="sq-by">
                    <span aria-hidden="true">—</span>
                    <!-- Enter picks a suggestion here; Ctrl+Enter still says Done. -->
                    <input v-model="l.speaker" class="s-input" type="text" list="sq-speakers" placeholder="Who said it" data-enter-self />
                    <button v-if="lines.length > 1" class="sq-x" aria-label="Remove the line" data-tip="Remove the line" @click="lines.splice(n, 1)">
                        <PhX :size="14" />
                    </button>
                </div>
            </div>
            <datalist id="sq-speakers">
                <option v-for="s in names" :key="s" :value="s" />
            </datalist>
            <div>
                <button class="act" @click="addLine"><PhPlus :size="14" /> Add a line</button>
                <p class="note">Two lines or more make it an exchange.</p>
            </div>
        </div>
        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="requestClose">Cancel</button>
            <button class="btn btn-primary" data-primary :disabled="!kept.length" @click="emit('save', kept)">Done</button>
        </template>
    </BaseModal>
    <ConfirmModal
        v-if="showDiscard"
        title="Discard changes?" message="This quote has unsaved changes."
        confirm-label="Discard" cancel-label="Keep editing" danger
        @confirm="emit('close')" @cancel="showDiscard = false"
    />
</template>

<style scoped lang="scss">
.modal-body { padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }

.sq-line { display: flex; flex-direction: column; gap: 6px; }

.sq-by {
    display: flex; align-items: center; gap: 8px; padding-left: 24px;
    span { color: var(--app-text-dim, #4a6080); }
    .s-input { flex: 1; }
}

.sq-x {
    display: flex; background: transparent; border: none; padding: 4px; border-radius: 4px; cursor: pointer;
    color: var(--app-text-muted, #94a3b8);
    &:hover { color: var(--app-text, #e2e8f0); background: #ffffff12; }
}

.s-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

// The quote in the face it will be shown in.
.s-textarea { resize: vertical; min-height: 52px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 14px; }

.act {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); color: var(--app-text-muted, #94a3b8);
    transition: background 0.15s, color 0.15s;
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}

.note { margin: 6px 0 0; font-size: 11px; color: var(--app-text-dim, #4a6080); }

.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.5; cursor: default; }
}

.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}

.btn-primary {
    background: var(--app-save-accent, #446b40); color: #e8f5e5;
    &:hover:not(:disabled) { background: var(--app-save-accent-hover, #52804c); }
}
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { PhWarning } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import type { SessionChangePreview, SessionChangeEntryPreview } from '@/types/models'

const props = defineProps<{ preview: SessionChangePreview }>()
const emit  = defineEmits<{ close: []; confirm: [path: string, decisions: Record<string, string>] }>()

const isWorking = ref(false)

/** Default is the incoming version for everything — BL-33's last write wins. */
const choices = reactive<Record<string, 'incoming' | 'local'>>(
    Object.fromEntries(props.preview.entries.map((e) => [e.id, 'incoming' as const])),
)

const applyCount = computed(() => props.preview.entries.filter((e) => choices[e.id] === 'incoming').length)

function setAll(pick: 'incoming' | 'local') {
    for (const entry of props.preview.entries) choices[entry.id] = pick
}

function confirm() {
    isWorking.value = true
    // Only the rows being kept need naming; everything else is taken from the file.
    const decisions = Object.fromEntries(Object.entries(choices).filter(([, pick]) => pick === 'local'))
    emit('confirm', props.preview.sourcePath, decisions)
}

const opLabel: Record<string, string> = { insert: 'Added', update: 'Changed', delete: 'Removed' }

/** What each side actually does to this row — the op changes the meaning of both words. */
function means(entry: SessionChangeEntryPreview, side: 'incoming' | 'local') {
    if (side === 'local') {
        return entry.missingLocally
            ? 'Leave it out — nothing is added here'
            : 'Leave my version exactly as it is'
    }
    if (entry.op === 'delete') return 'Delete it here as well'
    if (entry.missingLocally) return 'Add it to this copy'
    return 'Overwrite my version with theirs'
}

/** A word for the state of this row in this copy, shown next to the title. */
function flagFor(entry: SessionChangeEntryPreview) {
    if (entry.collision) return { text: 'Changed on both sides', strong: true }
    if (entry.missingLocally) return { text: entry.op === 'delete' ? 'Already gone here' : 'Not in this copy yet', strong: false }
    return null
}

const FIELDS = [
    { key: 'title', label: 'Title' },
    { key: 'when', label: 'When' },
    { key: 'description', label: 'Description' },
    { key: 'tags', label: 'Tags' },
    { key: 'updatedAt', label: 'Edited' },
] as const

const differs = (entry: SessionChangeEntryPreview, key: (typeof FIELDS)[number]['key']) =>
    key !== 'updatedAt' && (entry.incoming?.[key] ?? '') !== (entry.local?.[key] ?? '')

function formatPath(p: string) {
    return p.length > 60 ? '…' + p.slice(-57) : p
}
</script>

<template>
    <BaseModal title="Import Session Changes" width="min(780px, 94vw)" @close="emit('close')">
        <div class="modal-body">
            <p class="source-path" :title="preview.sourcePath">{{ formatPath(preview.sourcePath) }}</p>

            <div class="head-row">
                <div class="stats">
                    <span class="count count--add">{{ preview.added }} added</span>
                    <span class="count count--change">{{ preview.changed }} changed</span>
                    <span class="count count--remove">{{ preview.removed }} removed</span>
                </div>
                <p class="target">
                    From <strong>{{ preview.timelineTitle }}</strong>
                    <span v-if="preview.exportedAt"> ({{ preview.exportedAt }})</span>
                    → <strong>{{ preview.targetTimelineTitle }}</strong>
                </p>
            </div>

            <!-- Two words the whole screen turns on, so they get said plainly once. -->
            <div class="explain">
                <p>
                    <strong class="word word--incoming">Incoming</strong> is the version in the file you are
                    importing — someone else's work.
                    <strong class="word word--local">Local</strong> is what is in this copy right now — your own.
                </p>
                <p class="explain-note">
                    Tick one per item. Items left alone take the incoming version; nothing you pick
                    <strong>Local</strong> for is touched at all.
                </p>
            </div>

            <div v-if="preview.collisions" class="conflict-block">
                <div class="conflict-header">
                    <PhWarning :size="15" />
                    {{ preview.collisions }} item{{ preview.collisions === 1 ? '' : 's' }} changed on both sides
                </div>
                <p class="conflict-note">
                    You and they both edited these since the copies last matched, so one version has to give
                    way. Those rows are marked below and show both versions side by side.
                </p>
            </div>

            <div class="bulk-row">
                <button class="bulk-btn bulk-btn--incoming" @click="setAll('incoming')">Take incoming for all</button>
                <button class="bulk-btn" @click="setAll('local')">Keep local for all</button>
                <span class="bulk-tally">{{ applyCount }} of {{ preview.entries.length }} will be applied</span>
            </div>

            <ul class="entries">
                <li v-for="entry in preview.entries" :key="entry.id" :class="{ collides: entry.collision }">
                    <div class="entry-head">
                        <span class="op" :class="`op--${entry.op}`">{{ opLabel[entry.op] }}</span>
                        <span class="entry-title">{{ entry.title || '(untitled)' }}</span>
                        <span
                            v-if="flagFor(entry)"
                            class="flag"
                            :class="{ 'flag--collide': flagFor(entry)!.strong }"
                        >{{ flagFor(entry)!.text }}</span>

                        <div class="picker" role="group" :aria-label="`Which version of ${entry.title || 'this item'} to keep`">
                            <label
                                class="pick" :class="{ on: choices[entry.id] === 'incoming' }"
                                :title="means(entry, 'incoming')"
                            >
                                <input type="radio" :name="`pick-${entry.id}`" value="incoming" v-model="choices[entry.id]" />
                                <span class="box" aria-hidden="true">✓</span>Incoming
                            </label>
                            <label
                                class="pick" :class="{ on: choices[entry.id] === 'local' }"
                                :title="means(entry, 'local')"
                            >
                                <input type="radio" :name="`pick-${entry.id}`" value="local" v-model="choices[entry.id]" />
                                <span class="box" aria-hidden="true">✓</span>Local
                            </label>
                        </div>
                    </div>

                    <p class="entry-meaning">{{ means(entry, choices[entry.id]!) }}</p>

                    <div v-if="entry.collision" class="compare">
                        <div class="col-head col-head--incoming">Incoming</div>
                        <div class="col-head col-head--local">Local</div>
                        <template v-for="field in FIELDS" :key="field.key">
                            <div class="cell" :class="{ diff: differs(entry, field.key) }">
                                <span class="cell-label">{{ field.label }}</span>
                                <span class="cell-value">{{
                                    entry.op === 'delete' ? '—' : entry.incoming?.[field.key] || '—'
                                }}</span>
                            </div>
                            <div class="cell" :class="{ diff: differs(entry, field.key) }">
                                <span class="cell-label">{{ field.label }}</span>
                                <span class="cell-value">{{ entry.local?.[field.key] || '—' }}</span>
                            </div>
                        </template>
                    </div>
                </li>
            </ul>
        </div>

        <template #footer>
            <button class="btn btn-cancel" data-cancel :disabled="isWorking" @click="emit('close')">Cancel</button>
            <button class="btn btn-primary" data-primary :disabled="isWorking || !applyCount" @click="confirm">
                {{ isWorking ? 'Applying…' : `Apply ${applyCount} change${applyCount === 1 ? '' : 's'}` }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;
    color: var(--app-text, #e2e8f0);
}
.source-path {
    margin: 0; font-size: 11px; font-family: monospace; color: var(--app-text-dim, #4a6080);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.head-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.stats { display: flex; gap: 8px; flex-wrap: wrap; }
.target { margin: 0; font-size: 11.5px; color: var(--app-text-muted, #94a3b8); }
.count {
    font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 10px; background: #ffffff0e;
}
.count--add    { color: #7fc47f; }
.count--change { color: #d8b45c; }
.count--remove { color: #d16a6a; }

.explain {
    border-left: 2px solid var(--app-accent, #3b6ec4); background: #ffffff08;
    border-radius: 0 4px 4px 0; padding: 9px 12px;
    p { margin: 0; font-size: 12px; line-height: 1.55; color: var(--app-text-muted, #94a3b8); }
}
.explain-note { margin-top: 5px !important; color: var(--app-text-dim, #4a6080) !important; }
.word { font-weight: 700; }
.word--incoming { color: var(--app-accent, #3b6ec4); }
.word--local    { color: #b08cc4; }

.conflict-block {
    border: 1px solid #a5793a66; background: #a5793a18; border-radius: 5px; padding: 10px 12px;
}
.conflict-header {
    display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: #d8b45c;
}
.conflict-note { margin: 5px 0 0; font-size: 11.5px; color: var(--app-text-muted, #94a3b8); line-height: 1.5; }

.bulk-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.bulk-btn {
    background: transparent; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text-muted, #94a3b8); font-size: 11.5px; padding: 4px 10px; cursor: pointer;
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.bulk-btn--incoming:hover { border-color: var(--app-accent, #3b6ec4); }
.bulk-tally { margin-left: auto; color: var(--app-text-dim, #4a6080); }

.entries {
    list-style: none; margin: 0; padding: 0; max-height: 44vh; overflow-y: auto;
    border: 1px solid var(--app-border, #2d3a56); border-radius: 5px;
    > li {
        padding: 8px 10px;
        & + li { border-top: 1px solid var(--app-border, #2d3a56); }
        &.collides { background: #a5793a10; }
    }
}
.entry-head { display: flex; align-items: center; gap: 9px; font-size: 12.5px; }
.op { flex: 0 0 62px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.op--insert { color: #7fc47f; }
.op--update { color: #d8b45c; }
.op--delete { color: #d16a6a; }
.entry-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flag {
    font-size: 10.5px; padding: 2px 7px; border-radius: 9px; background: #ffffff0e;
    color: var(--app-text-dim, #4a6080); white-space: nowrap;
}
.flag--collide { background: #a5793a2e; color: #d8b45c; }
.entry-meaning {
    margin: 3px 0 0 71px; font-size: 11px; color: var(--app-text-dim, #4a6080);
}

.picker { display: flex; gap: 10px; flex: 0 0 auto; }
.pick {
    display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 11.5px;
    color: var(--app-text-muted, #94a3b8); white-space: nowrap;
    &:hover { color: var(--app-text, #e2e8f0); }
    input { position: absolute; opacity: 0; width: 0; height: 0; }
    &:focus-within .box { outline: 2px solid var(--app-accent, #3b6ec4); outline-offset: 1px; }
    .box {
        display: inline-flex; align-items: center; justify-content: center;
        width: 14px; height: 14px; border-radius: 3px; font-size: 10px; line-height: 1;
        border: 1px solid var(--app-border, #2d3a56); color: transparent;
    }
    &.on {
        color: var(--app-text, #e2e8f0); font-weight: 600;
        .box { color: #fff; }
    }
}
.pick:first-child.on  .box { background: var(--app-accent, #3b6ec4); border-color: var(--app-accent, #3b6ec4); }
.pick:last-child.on   .box { background: #7d5b8e; border-color: #7d5b8e; }

.compare {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px; margin: 8px 0 2px 71px;
}
.col-head {
    font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    padding-bottom: 3px;
}
.col-head--incoming { color: var(--app-accent, #3b6ec4); }
.col-head--local    { color: #b08cc4; }
.cell {
    display: flex; gap: 7px; font-size: 11.5px; padding: 2px 5px; border-radius: 3px;
    color: var(--app-text-muted, #94a3b8);
    &.diff { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.cell-label { flex: 0 0 66px; color: var(--app-text-dim, #4a6080); }
.cell-value { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.btn {
    font-size: 13px; font-weight: 500; padding: 6px 16px;
    border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8); border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
.btn-primary {
    background: var(--app-save-accent, #446b40); color: #e8f5e5;
    &:hover:not(:disabled) { background: var(--app-save-accent-hover, #52804c); }
}
</style>

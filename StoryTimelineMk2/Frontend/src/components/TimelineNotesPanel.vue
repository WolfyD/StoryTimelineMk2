<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import { BackendAPI } from '@/bridge/api';
import BaseModal from '@/components/BaseModal.vue';
import type { TimelineNote, LayoutSettings } from '@/types/models';
import { MOD } from '@/utils/shortcuts';

const props = defineProps<{
    layoutSettings: LayoutSettings | null;
}>();

const store = useTimelineStore();

// ── Notes state ──────────────────────────────────────────────────────────────
const newNoteText = ref('');
const editingId = ref<string | null>(null);
const editingText = ref('');
const viewingNote = ref<TimelineNote | null>(null);

// ── Height modes ─────────────────────────────────────────────────────────────
// tall: input above the list (original) · short: list left, textarea right · tiny: one button → modal
const NOTES_SHORT_HEIGHT = 260; // px, below this the side-by-side layout is used
const NOTES_TINY_HEIGHT  = 120; // px, below this only the modal button fits
const panelRef = ref<HTMLElement | null>(null);
const panelHeight = ref(Infinity);
const notesMode = computed(() =>
    panelHeight.value < NOTES_TINY_HEIGHT ? 'tiny' : panelHeight.value < NOTES_SHORT_HEIGHT ? 'short' : 'tall');
const notesModalOpen = ref(false);
watch(notesMode, m => { if (m !== 'tiny') notesModalOpen.value = false; });

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
    if (!panelRef.value) return;
    resizeObserver = new ResizeObserver(entries => { panelHeight.value = entries[0]?.contentRect.height ?? Infinity; });
    resizeObserver.observe(panelRef.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

// Shared by the panel and the teleported modals (CSS vars don't cross a Teleport to body)
const npVars = computed(() => ({
    '--np-bg':      props.layoutSettings?.NotesPanelBackgroundColor     || 'var(--app-bg)',
    '--np-card':    props.layoutSettings?.NotesPanelCardBackgroundColor  || 'var(--app-surface)',
    '--np-text':    props.layoutSettings?.NotesPanelTextColor            || 'var(--app-text)',
    '--np-heading': props.layoutSettings?.NotesPanelHeadingColor         || 'var(--app-text-muted)',
    '--np-accent':  props.layoutSettings?.NotesPanelAccentColor          || 'var(--app-accent)',
    '--np-fs':      (props.layoutSettings?.NotesPanelFontSize ?? 13) + 'px',
}));

const inRangeNotes = computed(() => {
    if (!props.layoutSettings) return store.notes;
    const tickDist = props.layoutSettings.TimelineTickDistance || 100;
    const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
    const halfAbsolute = (props.layoutSettings.TimelineDataRangeWidth / 2 / tickDist) * lodStep;
    if (!halfAbsolute) return store.notes;
    const center = store.centerAbsoluteTime;
    return store.notes.filter(n =>
        n.AbsoluteTime >= center - halfAbsolute &&
        n.AbsoluteTime <= center + halfAbsolute
    );
});

function formatYear(absoluteTime: number): string {
    const year = Math.floor(absoluteTime);
    const frac = absoluteTime - year;
    if (frac < 0.0001) return String(year);
    return `${year} .${frac.toFixed(4).slice(2).replace(/0+$/, '')}`;
}

async function addNote() {
    const text = newNoteText.value.trim();
    if (!text) return;
    const note: TimelineNote = {
        Id: crypto.randomUUID(),
        NoteContents: text,
        ConnectedItemId: '',
        TimelineId: store.currentProject?.Id ?? 0,
        NearestYear: Math.floor(store.centerAbsoluteTime),
        AbsoluteTime: store.centerAbsoluteTime,
        UpdatedAt: new Date().toISOString(),
    };
    store.addNote(note);
    newNoteText.value = '';
    try {
        await BackendAPI.SaveNote(note);
    } catch (e) {
        // Put the note back in the box rather than pretend it was saved.
        store.removeNote(note.Id);
        newNoteText.value = text;
        noteFailed('Saving the note', e);
    }
}

function noteFailed(what: string, e: unknown) {
    console.error(`[TimelineNotesPanel] ${what} failed:`, e);
    alert(`${what} failed:\n\n${e instanceof Error ? e.message : String(e)}`);
}

function startEdit(note: TimelineNote) {
    editingId.value = note.Id;
    editingText.value = note.NoteContents;
}

async function saveEdit(note: TimelineNote) {
    const updated = { ...note, NoteContents: editingText.value.trim() };
    try {
        await BackendAPI.SaveNote(updated);
        store.updateNote(updated);
        editingId.value = null;
    } catch (e) {
        noteFailed('Saving the note', e);   // stays in edit mode, so the text is not lost
    }
}

function cancelEdit() { editingId.value = null; }

async function deleteNote(noteId: string) {
    try {
        await BackendAPI.DeleteNote(noteId);
        store.removeNote(noteId);
    } catch (e) {
        noteFailed('Deleting the note', e);
    }
}

// ── Distance state ────────────────────────────────────────────────────────────
const specificMode = ref(false);

const currentFormatKey = computed(() => {
    const lod = store.lodProfile.find(l => l.index === store.currentLodIndex);
    return (lod?.formatKey ?? 'YEARS').toUpperCase();
});

function formatPoint(abs: number | null): string {
    if (abs === null) return '—';
    const year = Math.floor(abs);
    const frac = abs - year;
    const fmt = store.activeFormatRegistry[currentFormatKey.value];
    if (!fmt) return String(year);
    const sub = fmt(year, frac);
    if (!sub || sub === String(year)) return String(year);
    return `${year} ${sub}`;
}

const distanceText = computed(() => {
    const from = store.distanceFrom;
    const to   = store.distanceTo;
    if (from === null || to === null) return null;
    const dist = Math.abs(to - from);
    if (dist === 0) return 'Same point';
    return specificMode.value ? formatSpecific(dist) : formatApproximate(dist);
});

function formatSpecific(dist: number): string {
    const cfg = store.calendarConfig
    const yearLength = cfg.yearLength || 365
    const weekLength = cfg.weekLength || 7

    const years = Math.floor(dist)
    let remainingDays = Math.round((dist - years) * yearLength)

    // Decompose remaining days into months using actual calendar month lengths
    const monthLengths = cfg.months.map((m, i) => {
        const next = cfg.months[i + 1]
        return next ? next.startDay - m.startDay : yearLength - m.startDay
    })
    let months = 0
    for (const len of monthLengths) {
        if (remainingDays < len) break
        months++
        remainingDays -= len
    }

    const weeks = Math.floor(remainingDays / weekLength)
    remainingDays -= weeks * weekLength

    const parts: string[] = []
    if (years > 0)         parts.push(`${years} year${years !== 1 ? 's' : ''}`)
    if (months > 0)        parts.push(`${months} month${months !== 1 ? 's' : ''}`)
    if (weeks > 0)         parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`)
    if (remainingDays > 0 && months === 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`)
    return parts.length ? parts.join(', ') : '< 1 day'
}

function formatApproximate(dist: number): string {
    const cfg = store.calendarConfig
    const yearLength = cfg.yearLength || 365
    const weekLength = cfg.weekLength || 7
    const monthCount = cfg.months.length || 12
    const seasonCount = cfg.seasons.length || 4
    const weeksPerYear = Math.round(yearLength / weekLength)

    const key = currentFormatKey.value
    switch (key) {
        case 'MILLENNIA': { const n = Math.floor(dist / 1000); return `${n} millennium${n !== 1 ? 's' : ''}` }
        case 'CENTURIES': { const n = Math.floor(dist / 100);  return `${n} centur${n !== 1 ? 'ies' : 'y'}` }
        case 'DECADES':   { const n = Math.floor(dist / 10);   return `${n} decade${n !== 1 ? 's' : ''}` }
        case 'QUARTERS':  { const n = Math.floor(dist * 4);    return `${n} quarter${n !== 1 ? 's' : ''}` }
        case 'SEASONS':   { const n = Math.floor(dist * seasonCount); return `${n} season${n !== 1 ? 's' : ''}` }
        case 'MONTHS':    { const n = Math.floor(dist * monthCount);  return `${n} month${n !== 1 ? 's' : ''}` }
        case 'WEEKS':     { const n = Math.floor(dist * weeksPerYear); return `${n} week${n !== 1 ? 's' : ''}` }
        case 'DAYS':      { const n = Math.floor(dist * yearLength);   return `${n} day${n !== 1 ? 's' : ''}` }
        default:          { const n = Math.floor(dist); return `${n} year${n !== 1 ? 's' : ''}` }
    }
}
</script>

<template>
    <div ref="panelRef" class="notes-panel" :style="npVars">
        <!-- Tab bar -->
        <div class="tab-bar">
            <button
                class="tab-btn"
                :class="{ active: store.notesDistanceTab === 'notes' }"
                @click="store.setNotesDistanceTab('notes')"
            >
                <i class="ri-sticky-note-fill"></i> Notes
            </button>
            <button
                class="tab-btn"
                :class="{ active: store.notesDistanceTab === 'distance' }"
                @click="store.setNotesDistanceTab('distance')"
            >
                <i class="ri-ruler-line"></i> Distance
                <i v-if="store.distanceFrom !== null || store.distanceTo !== null"
                   class="ri-close-line dist-tab-clear"
                   title="Clear both points"
                   @click.stop="store.setDistanceFrom(null); store.setDistanceTo(null)"
                ></i>
            </button>
        </div>

        <!-- ═══ NOTES TAB ═══════════════════════════════════════════════════ -->
        <template v-if="store.notesDistanceTab === 'notes'">
            <button v-if="notesMode === 'tiny'" class="notes-open-btn" @click="notesModalOpen = true">
                <i class="ri-sticky-note-fill"></i> Notes ({{ inRangeNotes.length }} in range)
            </button>
            <Teleport to="body">
                <BaseModal v-if="notesModalOpen" title="Notes" width="min(640px, 92vw)" @close="notesModalOpen = false">
                    <div id="notes-modal-body" class="notes-modal-body" :style="npVars" />
                </BaseModal>
            </Teleport>

            <!-- One copy of the notes UI; in tiny mode it is teleported into the modal above.
                 :key remounts the Teleport so the target is resolved after the modal exists (Vue caches it per mount) -->
            <Teleport :key="String(notesModalOpen)" to="#notes-modal-body" :disabled="!notesModalOpen">
            <div v-show="notesMode !== 'tiny' || notesModalOpen" class="notes-tab" :class="notesMode === 'short' ? 'mode-short' : 'mode-tall'">
            <div v-if="!store.readOnly" class="notes-input-row">
                <textarea
                    v-model="newNoteText"
                    class="notes-textarea"
                    :placeholder="notesMode === 'short' ? `Write a note for this moment… ${MOD}+Enter to send` : 'Write a note for this moment…'"
                    @keydown.ctrl.enter="addNote"
                />
                <div v-if="notesMode !== 'short'" class="notes-input-meta">
                    <div class="notes-current-year-label">Current Year</div>
                    <div class="notes-current-year-value">{{ Math.floor(store.currentNowYear) }}</div>
                    <button class="notes-add-btn" @click="addNote">Add Note</button>
                </div>
            </div>

            <div class="notes-divider" />

            <div class="notes-list" v-if="inRangeNotes.length > 0">
                <div v-for="note in inRangeNotes" :key="note.Id" class="note-entry">
                    <div class="note-body">
                        <div class="note-year">{{ formatYear(note.AbsoluteTime) }}</div>
                        <div v-if="editingId === note.Id" class="note-edit-area">
                            <textarea v-model="editingText" class="note-edit-textarea" />
                            <div class="note-edit-actions">
                                <button class="note-save-btn" @click="saveEdit(note)">Save</button>
                                <button class="note-cancel-btn" @click="cancelEdit">Cancel</button>
                            </div>
                        </div>
                        <div v-else class="note-content">{{ note.NoteContents }}</div>
                    </div>
                    <div class="note-actions" v-if="editingId !== note.Id">
                        <button v-if="!store.readOnly" class="note-action-btn" @click="startEdit(note)" title="Edit">
                            <i class="ri-edit-line" /><span>Edit</span>
                        </button>
                        <button class="note-action-btn" @click="viewingNote = note" title="View">
                            <i class="ri-eye-line" /><span>View</span>
                        </button>
                        <button v-if="!store.readOnly" class="note-action-btn danger" @click="deleteNote(note.Id)" title="Delete">
                            <i class="ri-delete-bin-line" /><span>Trash</span>
                        </button>
                    </div>
                </div>
            </div>
            <div v-else  style="user-select: none;" class="notes-empty">No notes in range</div>
            </div>
            </Teleport>
        </template>

        <!-- ═══ DISTANCE TAB ════════════════════════════════════════════════ -->
        <template v-else>
            <div class="dist-panel">
                <!-- From row -->
                <div class="dist-row">
                    <div class="dist-row-label dist-from-label">
                        <i class="ri-map-pin-2-fill"></i> From
                    </div>
                    <div class="dist-row-value" :class="{ unset: store.distanceFrom === null }">
                        {{ formatPoint(store.distanceFrom) }}
                    </div>
                    <button
                        v-if="store.distanceFrom !== null"
                        class="dist-clear-btn"
                        title="Clear"
                        @click="store.setDistanceFrom(null)"
                    >
                        <i class="ri-close-line"></i>
                    </button>
                </div>

                <!-- To row -->
                <div class="dist-row">
                    <div class="dist-row-label dist-to-label">
                        <i class="ri-map-pin-time-fill"></i> To
                    </div>
                    <div class="dist-row-value" :class="{ unset: store.distanceTo === null }">
                        {{ formatPoint(store.distanceTo) }}
                    </div>
                    <button
                        v-if="store.distanceTo !== null"
                        class="dist-clear-btn"
                        title="Clear"
                        @click="store.setDistanceTo(null)"
                    >
                        <i class="ri-close-line"></i>
                    </button>
                </div>

                <!-- Result (only when both are set) -->
                <template v-if="store.distanceFrom !== null && store.distanceTo !== null">
                    <div class="dist-divider"></div>

                    <div class="dist-summary-label">
                        <span class="dist-point from">{{ formatPoint(store.distanceFrom) }}</span>
                        <i class="ri-arrow-right-line dist-arrow"></i>
                        <span class="dist-point to">{{ formatPoint(store.distanceTo) }}</span>
                    </div>

                    <div class="dist-result">
                        <i class="ri-ruler-2-line"></i>
                        <span class="dist-result-value">{{ distanceText }}</span>
                    </div>

                    <label class="dist-specificity">
                        <input type="checkbox" v-model="specificMode" />
                        <span>Specific breakdown</span>
                    </label>
                </template>

                <div v-else class="dist-hint">
                    Right-click items or the canvas to set From / To
                </div>

                <label class="dist-show-toggle">
                    <input type="checkbox" :checked="store.showMeasureInTimeline" @change="store.setShowMeasureInTimeline(($event.target as HTMLInputElement).checked)" />
                    <span>Show in timeline</span>
                </label>
            </div>
        </template>

        <!-- View modal (shared) -->
        <Teleport to="body">
            <div v-if="viewingNote" class="note-view-backdrop" :style="npVars" @click="viewingNote = null">
                <div class="note-view-modal" @click.stop>
                    <div class="note-view-year">{{ formatYear(viewingNote.AbsoluteTime) }}</div>
                    <div class="note-view-content">{{ viewingNote.NoteContents }}</div>
                    <button class="note-view-close" @click="viewingNote = null">Close</button>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped lang="scss">
.notes-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--np-bg);
    color: var(--np-text);
    overflow: hidden;
    font-family: sans-serif;
    font-size: var(--np-fs);
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
.tab-bar {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--np-card);
}

.tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 4px;
    background: none;
    border: none;
    color: var(--np-heading);
    font-size: 0.8em;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: color 0.15s, border-bottom 0.15s;
    border-bottom: 2px solid transparent;

    i { font-size: 1.1em; }

    &:hover { color: var(--np-text); }

    &.active {
        color: var(--np-text);
        border-bottom-color: var(--np-accent);
    }
}

.dist-tab-clear {
    margin-left: 2px;
    font-size: 1em;
    opacity: 0.55;
    border-radius: 3px;
    transition: opacity 0.15s, color 0.15s;

    &:hover {
        opacity: 1;
        color: #ef4444;
    }
}

// ── Notes tab ────────────────────────────────────────────────────────────────
.notes-tab {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

// Short panel: list on the left, textarea on the right (DOM order is kept, row-reverse flips it)
.mode-short {
    flex-direction: row-reverse;
    .notes-input-row { flex: 1 1 50%; min-width: 0; }
    .notes-textarea  { min-height: 0; }
    .notes-divider   { width: 1px; height: auto; margin: 10px 0; }
    .notes-list, .notes-empty { flex: 1 1 50%; min-width: 0; padding-bottom: 10px; }
}

.notes-open-btn {
    margin: 10px;
    padding: 6px 10px;
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 40%, transparent);
    border-radius: 4px;
    color: var(--np-text);
    font-size: 0.85em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    i { color: var(--np-accent); }
    &:hover { border-color: var(--np-accent); }
}

.notes-modal-body {
    height: min(70vh, 520px);
    display: flex;
    flex-direction: column;
    background: var(--np-bg);
    color: var(--np-text);
    font-size: var(--np-fs);
}

.notes-input-row {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
    padding: 10px;
}

.notes-textarea {
    flex: 1;
    min-height: 80px;
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 40%, transparent);
    border-radius: 4px;
    color: var(--np-text);
    padding: 8px;
    font-size: 0.85em;
    resize: none;
    font-family: inherit;

    &:focus { outline: none; border-color: var(--np-accent); }
}

.notes-input-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 90px;
}

.notes-current-year-label {
    font-size: 0.7em;
    color: var(--np-heading);
    text-align: center;
}

.notes-current-year-value {
    font-size: 1.3em;
    font-weight: 700;
    color: var(--np-text);
    text-align: center;
}

.notes-add-btn {
    background: var(--np-accent);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    font-size: 0.8em;
    cursor: pointer;
    white-space: nowrap;
    width: 100%;
    &:hover { filter: brightness(1.15); }
}

.notes-divider {
    height: 1px;
    background: var(--np-card);
    margin: 0 10px;
    flex-shrink: 0;
}

.notes-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 24px;
}

.notes-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #475569;
    font-size: 0.85em;
    font-style: italic;
}

.note-entry {
    display: flex;
    gap: 8px;
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 30%, transparent);
    border-radius: 4px;
    padding: 8px;
}

.note-body { flex: 1; min-width: 0; }

.note-year {
    font-size: 0.78em;
    color: var(--np-heading);
    margin-bottom: 4px;
    font-weight: 600;
}

.note-content {
    font-size: 0.85em;
    color: var(--np-text);
    word-break: break-word;
    white-space: pre-wrap;
    text-align: center;
}

.note-edit-area { display: flex; flex-direction: column; gap: 4px; }

.note-edit-textarea {
    width: 100%;
    min-height: 60px;
    background: var(--np-bg);
    border: 1px solid var(--np-accent);
    border-radius: 3px;
    color: var(--np-text);
    padding: 6px;
    font-size: 0.85em;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
    &:focus { outline: none; }
}

.note-edit-actions { display: flex; gap: 4px; }

.note-save-btn {
    background: var(--np-accent); color: #fff; border: none; border-radius: 3px;
    padding: 3px 8px; font-size: 0.78em; cursor: pointer;
    &:hover { filter: brightness(1.15); }
}

.note-cancel-btn {
    background: var(--np-card); color: var(--np-heading); border: none; border-radius: 3px;
    padding: 3px 8px; font-size: 0.78em; cursor: pointer;
    &:hover { color: var(--np-text); }
}

.note-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
}

.note-action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: var(--np-heading);
    cursor: pointer;
    font-size: 0.8em;
    padding: 2px 4px;
    border-radius: 3px;
    white-space: nowrap;
    &:hover { color: var(--np-text); background: var(--np-card); }
    &.danger:hover { color: #f87171; }
    i { font-size: 1em; }
}

// ── Distance tab ─────────────────────────────────────────────────────────────
.dist-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 12px 24px;
    gap: 10px;
    overflow-y: auto;
}

.dist-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 30%, transparent);
    border-radius: 6px;
    padding: 8px 10px;
}

.dist-row-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex-shrink: 0;
    width: 54px;

    i { font-size: 1.1em; }
}

.dist-from-label { color: #34d399; }
.dist-to-label   { color: #60a5fa; }

.dist-row-value {
    flex: 1;
    font-size: 0.92em;
    color: var(--np-text);
    font-weight: 500;

    &.unset {
        color: var(--np-heading);
        font-style: italic;
        font-weight: 400;
    }
}

.dist-clear-btn {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 1em;
    line-height: 1;
    flex-shrink: 0;
    &:hover { color: #f87171; background: rgba(248,113,113,0.1); }
}

.dist-divider {
    height: 1px;
    background: var(--np-card);
    flex-shrink: 0;
}

.dist-summary-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82em;
    flex-wrap: wrap;
}

.dist-point {
    font-weight: 600;
    &.from { color: #34d399; }
    &.to   { color: #60a5fa; }
}

.dist-arrow {
    color: #475569;
    font-size: 1.1em;
}

.dist-result {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 30%, transparent);
    border-radius: 6px;
    padding: 10px 14px;

    i {
        color: var(--np-accent);
        font-size: 1.3em;
        flex-shrink: 0;
    }
}

.dist-result-value {
    font-size: 1em;
    font-weight: 600;
    color: var(--np-text);
}

.dist-specificity {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78em;
    color: var(--np-heading);
    cursor: pointer;
    user-select: none;

    input[type="checkbox"] {
        accent-color: var(--np-accent);
        width: 14px;
        height: 14px;
        cursor: pointer;
    }

    &:hover { color: var(--np-text); }
}

.dist-hint {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #334155;
    font-size: 0.82em;
    font-style: italic;
    padding: 20px;
}

.dist-show-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78em;
    color: var(--np-heading);
    cursor: pointer;
    user-select: none;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--np-text) 15%, transparent);

    input[type="checkbox"] {
        accent-color: var(--np-accent);
        width: 14px;
        height: 14px;
        cursor: pointer;
    }

    &:hover { color: var(--np-text); }
}

// ── View modal ───────────────────────────────────────────────────────────────
.note-view-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
}

.note-view-modal {
    background: var(--np-card);
    border: 1px solid color-mix(in srgb, var(--np-heading) 30%, transparent);
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.note-view-year {
    font-size: 0.85em;
    color: var(--np-heading);
    font-weight: 600;
}

.note-view-content {
    font-size: 1em;
    color: var(--np-text);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
}

.note-view-close {
    align-self: flex-end;
    background: var(--np-bg);
    color: var(--np-heading);
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 0.85em;
    &:hover { color: var(--np-text); }
}
</style>

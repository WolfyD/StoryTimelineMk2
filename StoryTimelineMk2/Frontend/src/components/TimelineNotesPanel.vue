<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTimelineStore } from '@/stores/timelineStore';
import { BackendAPI } from '@/bridge/api';
import { FormatRegistry } from '@/utils/timelineLayout';
import type { TimelineNote, LayoutSettings } from '@/types/models';

const props = defineProps<{
    layoutSettings: LayoutSettings | null;
}>();

const store = useTimelineStore();

// ── Notes state ──────────────────────────────────────────────────────────────
const newNoteText = ref('');
const editingId = ref<string | null>(null);
const editingText = ref('');
const viewingNote = ref<TimelineNote | null>(null);

const inRangeNotes = computed(() => {
    if (!props.layoutSettings) return [];
    const tickDist = props.layoutSettings.TimelineTickDistance || 100;
    const lodStep  = store.lodProfile.find(l => l.index === store.currentLodIndex)?.stepFraction ?? 1;
    const halfAbsolute = (props.layoutSettings.TimelineDataRangeWidth / 2 / tickDist) * lodStep;
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
    const result = await BackendAPI.SaveNote(note);
    if (result?.status === 'ok') {
        store.addNote({ ...note, Id: result.noteId });
        newNoteText.value = '';
    }
}

function startEdit(note: TimelineNote) {
    editingId.value = note.Id;
    editingText.value = note.NoteContents;
}

async function saveEdit(note: TimelineNote) {
    const updated = { ...note, NoteContents: editingText.value.trim() };
    const result = await BackendAPI.SaveNote(updated);
    if (result?.status === 'ok') {
        store.updateNote(updated);
        editingId.value = null;
    }
}

function cancelEdit() { editingId.value = null; }

async function deleteNote(noteId: string) {
    const result = await BackendAPI.DeleteNote(noteId);
    if (result?.status === 'ok') store.removeNote(noteId);
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
    const fmt = FormatRegistry[currentFormatKey.value];
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
    const years = Math.floor(dist);
    const afterYears = dist - years;
    const totalMonths = afterYears * 12;
    const months = Math.floor(totalMonths);
    const afterMonths = totalMonths - months;
    const weeks = Math.floor(afterMonths * 4.33);
    const afterWeeks = afterMonths * 4.33 - weeks;
    const days = Math.floor(afterWeeks * 7);

    const parts: string[] = [];
    if (years > 0)  parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    if (weeks > 0)  parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
    if (days > 0 && months === 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    return parts.length ? parts.join(', ') : '< 1 day';
}

function formatApproximate(dist: number): string {
    const key = currentFormatKey.value;
    switch (key) {
        case 'MILLENNIA': { const n = Math.floor(dist / 1000); return `${n} millennium${n !== 1 ? 's' : ''}`; }
        case 'CENTURIES': { const n = Math.floor(dist / 100);  return `${n} centur${n !== 1 ? 'ies' : 'y'}`; }
        case 'DECADES':   { const n = Math.floor(dist / 10);   return `${n} decade${n !== 1 ? 's' : ''}`; }
        case 'QUARTERS':  { const n = Math.floor(dist * 4);    return `${n} quarter${n !== 1 ? 's' : ''}`; }
        case 'SEASONS':   { const n = Math.floor(dist * 4);    return `${n} season${n !== 1 ? 's' : ''}`; }
        case 'MONTHS':    { const n = Math.floor(dist * 12);   return `${n} month${n !== 1 ? 's' : ''}`; }
        case 'WEEKS':     { const n = Math.floor(dist * 52);   return `${n} week${n !== 1 ? 's' : ''}`; }
        case 'DAYS':      { const n = Math.floor(dist * 365);  return `${n} day${n !== 1 ? 's' : ''}`; }
        default: { const n = Math.floor(dist); return `${n} year${n !== 1 ? 's' : ''}`; }
    }
}
</script>

<template>
    <div class="notes-panel">
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
            </button>
        </div>

        <!-- ═══ NOTES TAB ═══════════════════════════════════════════════════ -->
        <template v-if="store.notesDistanceTab === 'notes'">
            <div class="notes-input-row">
                <textarea
                    v-model="newNoteText"
                    class="notes-textarea"
                    placeholder="Write a note for this moment…"
                    @keydown.ctrl.enter="addNote"
                />
                <div class="notes-input-meta">
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
                        <button class="note-action-btn" @click="startEdit(note)" title="Edit">
                            <i class="ri-edit-line" /><span>Edit</span>
                        </button>
                        <button class="note-action-btn" @click="viewingNote = note" title="View">
                            <i class="ri-eye-line" /><span>View</span>
                        </button>
                        <button class="note-action-btn danger" @click="deleteNote(note.Id)" title="Delete">
                            <i class="ri-delete-bin-line" /><span>Trash</span>
                        </button>
                    </div>
                </div>
            </div>
            <div v-else class="notes-empty">No notes in range</div>
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
            </div>
        </template>

        <!-- View modal (shared) -->
        <Teleport to="body">
            <div v-if="viewingNote" class="note-view-backdrop" @click="viewingNote = null">
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
    background: #0f172a;
    color: #e2e8f0;
    overflow: hidden;
    font-family: sans-serif;
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
.tab-bar {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid #1e293b;
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
    color: #64748b;
    font-size: 0.8em;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: color 0.15s, border-bottom 0.15s;
    border-bottom: 2px solid transparent;

    i { font-size: 1.1em; }

    &:hover { color: #94a3b8; }

    &.active {
        color: #e2e8f0;
        border-bottom-color: #6366f1;
    }
}

// ── Notes tab ────────────────────────────────────────────────────────────────
.notes-input-row {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
    padding: 10px;
}

.notes-textarea {
    flex: 1;
    min-height: 80px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #e2e8f0;
    padding: 8px;
    font-size: 0.85em;
    resize: none;
    font-family: inherit;

    &:focus { outline: none; border-color: #6366f1; }
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
    color: #94a3b8;
    text-align: center;
}

.notes-current-year-value {
    font-size: 1.3em;
    font-weight: 700;
    color: #f8fafc;
    text-align: center;
}

.notes-add-btn {
    background: #4f46e5;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    font-size: 0.8em;
    cursor: pointer;
    white-space: nowrap;
    width: 100%;
    &:hover { background: #4338ca; }
}

.notes-divider {
    height: 1px;
    background: #1e293b;
    margin: 0 10px;
    flex-shrink: 0;
}

.notes-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
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
    background: #1e293b;
    border: 1px solid #2d3f55;
    border-radius: 4px;
    padding: 8px;
}

.note-body { flex: 1; min-width: 0; }

.note-year {
    font-size: 0.78em;
    color: #94a3b8;
    margin-bottom: 4px;
    font-weight: 600;
}

.note-content {
    font-size: 0.85em;
    color: #cbd5e1;
    word-break: break-word;
    white-space: pre-wrap;
    text-align: center;
}

.note-edit-area { display: flex; flex-direction: column; gap: 4px; }

.note-edit-textarea {
    width: 100%;
    min-height: 60px;
    background: #0f172a;
    border: 1px solid #6366f1;
    border-radius: 3px;
    color: #e2e8f0;
    padding: 6px;
    font-size: 0.85em;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
    &:focus { outline: none; }
}

.note-edit-actions { display: flex; gap: 4px; }

.note-save-btn {
    background: #4f46e5; color: #fff; border: none; border-radius: 3px;
    padding: 3px 8px; font-size: 0.78em; cursor: pointer;
    &:hover { background: #4338ca; }
}

.note-cancel-btn {
    background: #334155; color: #94a3b8; border: none; border-radius: 3px;
    padding: 3px 8px; font-size: 0.78em; cursor: pointer;
    &:hover { color: #e2e8f0; }
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
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.8em;
    padding: 2px 4px;
    border-radius: 3px;
    white-space: nowrap;
    &:hover { color: #e2e8f0; background: #334155; }
    &.danger:hover { color: #f87171; }
    i { font-size: 1em; }
}

// ── Distance tab ─────────────────────────────────────────────────────────────
.dist-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 10px;
    overflow-y: auto;
}

.dist-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1e293b;
    border: 1px solid #2d3f55;
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
    color: #f1f5f9;
    font-weight: 500;

    &.unset {
        color: #475569;
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
    background: #1e293b;
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
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px 14px;

    i {
        color: #a78bfa;
        font-size: 1.3em;
        flex-shrink: 0;
    }
}

.dist-result-value {
    font-size: 1em;
    font-weight: 600;
    color: #f1f5f9;
}

.dist-specificity {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78em;
    color: #64748b;
    cursor: pointer;
    user-select: none;

    input[type="checkbox"] {
        accent-color: #6366f1;
        width: 14px;
        height: 14px;
        cursor: pointer;
    }

    &:hover { color: #94a3b8; }
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

// ── View modal ───────────────────────────────────────────────────────────────
.note-view-backdrop {
    position: fixed;
    inset: 0;
    background: #00000088;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
}

.note-view-modal {
    background: #1e293b;
    border: 1px solid #334155;
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
    color: #94a3b8;
    font-weight: 600;
}

.note-view-content {
    font-size: 1em;
    color: #e2e8f0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
}

.note-view-close {
    align-self: flex-end;
    background: #334155;
    color: #94a3b8;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 0.85em;
    &:hover { color: #e2e8f0; }
}
</style>

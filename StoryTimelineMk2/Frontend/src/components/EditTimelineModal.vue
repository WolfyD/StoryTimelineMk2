<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import BaseModal from './BaseModal.vue'
import type { TimelineProject } from '@/types/models'
import { BackendAPI } from '@/bridge/api'

const props = defineProps<{ timeline: TimelineProject }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const local = reactive({
    title:       props.timeline.Title,
    author:      props.timeline.Author,
    description: props.timeline.Description,
    startYear:   props.timeline.StartYear,
    color:       props.timeline.Color ?? '',
    calendarId:  props.timeline.CalendarId || props.timeline.Calendar?.Id || '',
})

const calendars = ref<{ Id: string; Name: string }[]>([])
const isSaving = ref(false)
const error = ref('')

function openCalendarEditor(calendarId: string | null) {
    BackendAPI.send('OpenCalendarEditorWindow', { calendarId })
}

async function refreshCalendars() {
    const prevIds = new Set(calendars.value.map(c => c.Id))
    const list = await BackendAPI.GetCalendarList()
    if (list) {
        calendars.value = list
        const newCal = list.find(c => !prevIds.has(c.Id))
        if (newCal) local.calendarId = newCal.Id
    }
}

onMounted(async () => {
    const list = await BackendAPI.GetCalendarList()
    if (list) calendars.value = list
    window.addEventListener('calendars-changed', refreshCalendars)
})

onUnmounted(() => {
    window.removeEventListener('calendars-changed', refreshCalendars)
})

async function save() {
    if (!local.title.trim()) { error.value = 'Title is required.'; return }
    isSaving.value = true
    error.value = ''
    const result = await BackendAPI.SaveTimelineInfo(
        props.timeline.Id,
        local.title.trim(),
        local.author,
        local.description,
        local.startYear,
        local.color || null,
        local.calendarId || undefined
    )
    isSaving.value = false
    if (result?.status === 'ok') emit('saved')
    else error.value = 'Save failed. Please try again.'
}
</script>

<template>
    <BaseModal title="Edit Timeline" width="min(480px, 92vw)" @close="emit('close')">
        <div class="modal-body">
            <div class="field">
                <label>Title</label>
                <input class="s-input" type="text" v-model="local.title" @keydown.enter="save" />
            </div>
            <div class="field">
                <label>Author</label>
                <input class="s-input" type="text" v-model="local.author" />
            </div>
            <div class="field">
                <label>Description</label>
                <textarea class="s-input s-textarea" v-model="local.description" rows="3" />
            </div>
            <div class="field-row">
                <div class="field field--narrow">
                    <label>Start Year</label>
                    <input class="s-input" type="number" v-model.number="local.startYear" />
                </div>
                <div class="field field--narrow">
                    <label>Color Tag</label>
                    <div class="color-row">
                        <input class="s-color" type="color" v-model="local.color" />
                        <span class="color-hex">{{ local.color || 'none' }}</span>
                        <button v-if="local.color" class="clear-color" @click="local.color = ''" title="Clear color">×</button>
                    </div>
                </div>
            </div>
            <div class="field">
                <label>Calendar</label>
                <div class="calendar-row">
                    <select class="s-input cal-select" v-model="local.calendarId" :disabled="calendars.length === 0">
                        <option value="" disabled>{{ calendars.length === 0 ? 'Loading…' : 'Select a calendar' }}</option>
                        <option v-for="c in calendars" :key="c.Id" :value="c.Id">{{ c.Name }}</option>
                    </select>
                    <button
                        class="cal-btn"
                        title="Edit selected calendar"
                        :disabled="!local.calendarId"
                        @click="openCalendarEditor(local.calendarId)"
                    >Edit</button>
                    <button
                        class="cal-btn cal-btn--new"
                        title="Create new calendar"
                        @click="openCalendarEditor(null)"
                    >+ New</button>
                </div>
            </div>
            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <button class="btn btn-cancel" @click="emit('close')">Cancel</button>
            <button class="btn btn-primary" :disabled="isSaving" @click="save">
                {{ isSaving ? 'Saving…' : 'Save Changes' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 12px;
}
.field {
    display: flex; flex-direction: column; gap: 4px;
    label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--app-text-dim, #4a6080); }
}
.field-row {
    display: flex; gap: 16px;
    .field--narrow { flex: 1; }
}
.s-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}
.s-textarea { resize: vertical; min-height: 60px; font-family: inherit; }
.color-row { display: flex; align-items: center; gap: 8px; }
.s-color {
    width: 36px; height: 28px; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    background: var(--app-surface, #0c1524); cursor: pointer; padding: 2px;
}
.color-hex { font-size: 12px; color: var(--app-text-dim, #64748b); font-family: monospace; }
.clear-color {
    background: transparent; border: none; color: var(--app-text-dim, #64748b); cursor: pointer;
    font-size: 16px; line-height: 1; padding: 0 4px;
    &:hover { color: var(--app-text, #e2e8f0); }
}
.error-msg { margin: 0; font-size: 12px; color: #f87171; }
.calendar-row {
    display: flex; gap: 6px; align-items: center;
    .cal-select { flex: 1; }
}
.cal-btn {
    padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); color: var(--app-text-muted, #94a3b8); white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    &:hover:not(:disabled) { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.35; cursor: not-allowed; }
    &.cal-btn--new { border-color: var(--app-accent, #3b6ec4); color: #7aa8e8; &:hover { background: #3b6ec420; } }
}
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

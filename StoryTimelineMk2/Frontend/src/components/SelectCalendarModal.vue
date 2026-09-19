<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { PhArrowsClockwise } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import { BackendAPI } from '@/bridge/api'

const emit = defineEmits<{ selected: [string]; skipped: [] }>()

const calendars = ref<{ Id: string; Name: string }[]>([])
const selectedId = ref('')
const loading = ref(false)

async function loadCalendars(prevIds?: Set<string>) {
	loading.value = true
	const list = await BackendAPI.GetCalendarList()
	loading.value = false
	if (list) {
		calendars.value = list
		if (prevIds) {
			const newCal = list.find(c => !prevIds.has(c.Id))
			if (newCal) selectedId.value = newCal.Id
		}
	}
}

async function refresh() {
	const prevIds = new Set(calendars.value.map(c => c.Id))
	await loadCalendars(prevIds)
}

function createNew() {
	BackendAPI.send('OpenCalendarEditorWindow', { calendarId: null })
}

onMounted(() => { loadCalendars(); window.addEventListener('calendars-changed', refresh) })
onUnmounted(() => window.removeEventListener('calendars-changed', refresh))
</script>

<template>
	<BaseModal title="Select Calendar" width="min(440px, 92vw)" @close="emit('skipped')">
		<div class="modal-body">
			<div class="field">
				<label>Calendar</label>
				<div class="calendar-row">
					<select
						class="s-input cal-select"
						v-model="selectedId"
						:disabled="calendars.length === 0"
					>
						<option value="" disabled>
							{{ loading ? 'Loading…' : calendars.length === 0 ? 'No calendars yet.' : 'Select a calendar' }}
						</option>
						<option v-for="c in calendars" :key="c.Id" :value="c.Id">{{ c.Name }}</option>
					</select>
					<button class="cal-btn" title="Refresh list" @click="refresh">
						<PhArrowsClockwise :size="14" />
					</button>
					<button class="cal-btn cal-btn--new" title="Create new calendar" @click="createNew">
						+ Create New
					</button>
				</div>
			</div>
		</div>
		<template #footer>
			<button class="btn btn-cancel" @click="emit('skipped')">Skip</button>
			<button class="btn btn-primary" :disabled="!selectedId" @click="emit('selected', selectedId)">
				Select
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
.s-input {
	background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
	color: var(--app-text, #e2e8f0); font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
	&:focus { border-color: var(--app-accent, #3b6ec4); }
}
.calendar-row {
	display: flex; gap: 6px; align-items: center;
	.cal-select { flex: 1; }
}
.cal-btn {
	display: flex; align-items: center; gap: 4px;
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

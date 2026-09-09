<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhX, PhArrowsClockwise } from '@phosphor-icons/vue'
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

onMounted(() => loadCalendars())
</script>

<template>
	<div class="modal-backdrop" @click.self="emit('skipped')">
		<div class="modal-panel">
			<div class="modal-header">
				<span class="modal-title">Select Calendar</span>
				<button class="close-btn" @click="emit('skipped')"><PhX :size="18" /></button>
			</div>

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

			<div class="modal-footer">
				<button class="btn btn-cancel" @click="emit('skipped')">Skip</button>
				<button class="btn btn-primary" :disabled="!selectedId" @click="emit('selected', selectedId)">
					Select
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped lang="scss">
.modal-backdrop {
	position: fixed; inset: 0; background: #00000088; z-index: 1000;
	display: flex; align-items: center; justify-content: center;
}
.modal-panel {
	display: flex; flex-direction: column;
	background: #141e33; border: 1px solid #2d3a56; border-radius: 8px;
	width: min(440px, 92vw); box-shadow: 0 24px 48px #00000066;
}
.modal-header {
	display: flex; align-items: center; justify-content: space-between;
	padding: 14px 20px; background: #1e2b44;
	border-bottom: 1px solid #2d3a56; border-radius: 8px 8px 0 0;
}
.modal-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
.close-btn {
	display: flex; align-items: center; justify-content: center;
	background: transparent; border: none; color: #64748b; cursor: pointer;
	padding: 4px; border-radius: 4px; transition: color 0.15s, background 0.15s;
	&:hover { color: #e2e8f0; background: #ffffff12; }
}
.modal-body {
	padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 12px;
}
.field {
	display: flex; flex-direction: column; gap: 4px;
	label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #4a6080; }
}
.s-input {
	background: #0c1524; border: 1px solid #2d3a56; border-radius: 4px;
	color: #e2e8f0; font-size: 13px; padding: 6px 9px; outline: none; width: 100%; box-sizing: border-box;
	&:focus { border-color: #3b6ec4; }
}
.calendar-row {
	display: flex; gap: 6px; align-items: center;
	.cal-select { flex: 1; }
}
.cal-btn {
	display: flex; align-items: center; gap: 4px;
	padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 4px; cursor: pointer;
	background: transparent; border: 1px solid #2d3a56; color: #94a3b8; white-space: nowrap;
	transition: background 0.15s, color 0.15s;
	&:hover:not(:disabled) { background: #ffffff0e; color: #e2e8f0; }
	&:disabled { opacity: 0.35; cursor: not-allowed; }
	&.cal-btn--new { border-color: #3b6ec4; color: #7aa8e8; &:hover { background: #3b6ec420; } }
}
.modal-footer {
	display: flex; justify-content: flex-end; gap: 10px;
	padding: 12px 20px; background: #1e2b44;
	border-top: 1px solid #2d3a56; border-radius: 0 0 8px 8px;
}
.btn {
	font-size: 13px; font-weight: 500; padding: 6px 16px;
	border-radius: 5px; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
	&:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-cancel {
	background: transparent; color: #94a3b8; border: 1px solid #2d3a56;
	&:hover:not(:disabled) { background: #ffffff0e; color: #e2e8f0; }
}
.btn-primary {
	background: #446b40; color: #e8f5e5;
	&:hover:not(:disabled) { background: #52804c; }
}
</style>

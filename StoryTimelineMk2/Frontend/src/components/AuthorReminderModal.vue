<script setup lang="ts">
import { ref } from 'vue'
import { PhX } from '@phosphor-icons/vue'

const emit = defineEmits<{ set: [string]; skip: [] }>()

const authorInput = ref('')

function onSet() {
	emit('set', authorInput.value)
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter') onSet()
}
</script>

<template>
	<div class="modal-backdrop" @click.self="emit('skip')">
		<div class="modal-panel">
			<div class="modal-header">
				<span class="modal-title">Author Name</span>
				<button class="close-btn" @click="emit('skip')"><PhX :size="18" /></button>
			</div>

			<div class="modal-body">
				<p class="note-text">This timeline has no author set. You can add one now — it's optional.</p>
				<div class="field">
					<label>Author</label>
					<input
						class="s-input"
						type="text"
						placeholder="Author name…"
						v-model="authorInput"
						@keydown="onKeydown"
						autofocus
					/>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn btn-cancel" @click="emit('skip')">Keep Empty</button>
				<button class="btn btn-primary" @click="onSet">Set Author</button>
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
	width: min(400px, 92vw); box-shadow: 0 24px 48px #00000066;
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
.note-text {
	margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;
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

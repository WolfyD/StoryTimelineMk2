<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'

const emit = defineEmits<{ set: [string]; skip: [] }>()

const authorInput = ref('')

function onSet() {
	emit('set', authorInput.value)
}

</script>

<template>
	<BaseModal title="Author Name" width="min(400px, 92vw)" @close="emit('skip')">
		<div class="modal-body">
			<p class="note-text">This timeline has no author set. You can add one now — it's optional.</p>
			<div class="field">
				<label>Author</label>
				<input
					class="s-input"
					type="text"
					placeholder="Author name…"
					v-model="authorInput"
					autofocus
				/>
			</div>
		</div>
		<template #footer>
			<button class="btn btn-cancel" data-cancel @click="emit('skip')">Keep Empty</button>
			<button class="btn btn-primary" data-primary @click="onSet">Set Author</button>
		</template>
	</BaseModal>
</template>

<style scoped lang="scss">
.modal-body {
	padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 12px;
}
.note-text {
	margin: 0; font-size: 13px; color: var(--app-text-muted, #94a3b8); line-height: 1.5;
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

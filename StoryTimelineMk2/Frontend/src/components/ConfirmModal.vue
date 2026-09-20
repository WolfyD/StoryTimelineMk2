<script setup lang="ts">
import BaseModal from './BaseModal.vue'

// The app's yes/no dialog — replaces window.confirm(), which cannot be themed and looks nothing like the rest.
// Not teleported on purpose: callers that sit inside a popover wrap it in <Teleport to="body"> themselves.
withDefaults(defineProps<{
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    /** Red confirm button for destructive actions */
    danger?: boolean
}>(), {
    confirmLabel: 'OK',
    cancelLabel: 'Cancel',
    danger: false,
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <BaseModal :title="title" width="min(400px, 92vw)" :z-index="1100" @close="emit('cancel')">
        <p v-if="message" class="confirm-msg">{{ message }}</p>
        <template #footer>
            <button class="btn btn-secondary" @click="emit('cancel')">{{ cancelLabel }}</button>
            <button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmLabel }}</button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.confirm-msg {
    margin: 0;
    padding: 16px 20px;
    font-size: 0.88rem;
    line-height: 1.45;
    color: var(--app-text-muted, #94a3b8);
}

.btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: opacity 0.15s, background 0.15s;

    &.btn-primary { background: var(--app-accent, #4a90d9); color: #fff; &:hover { background: var(--app-accent-hover, #3578c5); } }
    &.btn-secondary { background: var(--app-surface-high, #334155); color: var(--app-text-muted, #cbd5e1); &:hover { background: color-mix(in srgb, var(--app-surface-high, #334155) 80%, var(--app-text, #fff)); } }
    &.btn-danger { background: #7f1d1d; color: #fecaca; &:hover { background: #991b1b; } }
}
</style>

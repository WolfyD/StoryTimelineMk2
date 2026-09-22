<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { PhX, PhPencilSimple, PhTrash, PhArrowsClockwise, PhCheck, PhMagnifyingGlass } from '@phosphor-icons/vue'
import BaseModal from './BaseModal.vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'

const emit = defineEmits<{ close: [] }>()

type TagRow = { Id: number; Name: string; UsageCount: number }
const tags = ref<TagRow[]>([])
const search = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const editingId = ref<number | null>(null)
const editName = ref('')
const deleteTarget = ref<TagRow | null>(null)

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    return q ? tags.value.filter(t => t.Name.includes(q)) : tags.value
})

async function load() {
    loading.value = true
    error.value = null
    try {
        tags.value = (await BackendAPI.GetTagList()) ?? []
    } catch (e) {
        console.error('[TagManagerModal] load failed:', e)
        error.value = 'Failed to load tags.'
    } finally {
        loading.value = false
    }
}

// Tag names live in the store's itemTagMap (canvas filters), so a change means a reload.
function refreshTimeline() {
    const store = useTimelineStore()
    if (store.currentProject?.Id) store.loadTimelineData(store.currentProject.Id)
}

function startEdit(t: TagRow) {
    editingId.value = t.Id
    editName.value = t.Name
    nextTick(() => (document.querySelector('.tag-edit-input') as HTMLInputElement | null)?.select())
}

async function commitEdit() {
    const id = editingId.value
    if (id == null) return
    const current = tags.value.find(t => t.Id === id)
    const name = editName.value.trim().toLowerCase()
    editingId.value = null
    if (!current || !name || name === current.Name) return
    error.value = null
    try {
        const result = await BackendAPI.RenameTag(id, name)
        if (result?.status !== 'ok') throw new Error(result?.message ?? 'Rename failed')
        await load()
        refreshTimeline()
    } catch (e) {
        console.error('[TagManagerModal] rename failed:', e)
        error.value = `Failed to rename tag: ${e instanceof Error ? e.message : String(e)}`
    }
}

function deleteSub(t: TagRow) {
    return t.UsageCount > 0
        ? `Used by ${usageText(t.UsageCount)} — it will be removed from them.`
        : 'This cannot be undone.'
}

function usageText(n: number) {
    return n === 1 ? '1 item' : `${n} items`
}

async function confirmDelete() {
    const target = deleteTarget.value
    if (!target) return
    deleteTarget.value = null
    error.value = null
    try {
        const result = await BackendAPI.DeleteTag(target.Id)
        if (result?.status !== 'ok') throw new Error(result?.message ?? 'Delete failed')
        await load()
        if (result.unlinked) refreshTimeline()
    } catch (e) {
        console.error('[TagManagerModal] delete failed:', e)
        error.value = `Failed to delete tag: ${e instanceof Error ? e.message : String(e)}`
    }
}

onMounted(load)
</script>

<template>
    <Teleport to="body">
        <BaseModal width="min(520px, 92vw)" max-height="75vh" @close="emit('close')">
            <template #header>
                <span class="modal-title">Tags</span>
                <div class="modal-header-actions">
                    <button class="icon-btn" title="Refresh" :disabled="loading" @click="load">
                        <PhArrowsClockwise :size="15" />
                    </button>
                    <button class="icon-btn" title="Close" @click="emit('close')">
                        <PhX :size="16" />
                    </button>
                </div>
            </template>

            <div class="search-row">
                <PhMagnifyingGlass :size="14" class="search-icon" />
                <input v-model="search" class="search-input" type="text" placeholder="Search tags…" />
            </div>

            <div class="modal-body">
                <div v-if="error" class="state-msg error">{{ error }}</div>
                <div v-if="loading" class="state-msg">Loading…</div>
                <div v-else-if="tags.length === 0" class="state-msg empty">No tags yet.</div>
                <div v-else-if="filtered.length === 0" class="state-msg empty">No tags match "{{ search }}".</div>
                <ul v-else class="tag-list">
                    <li v-for="t in filtered" :key="t.Id" class="tag-row">
                        <template v-if="editingId === t.Id">
                            <input
                                v-model="editName"
                                class="tag-edit-input"
                                type="text"
                                data-enter-self
                                @keydown.enter.prevent="commitEdit"
                                @keydown.esc.stop.prevent="editingId = null"
                                @blur="commitEdit"
                            />
                            <div class="row-actions">
                                <button class="action-btn edit" title="Save name" @mousedown.prevent @click="commitEdit">
                                    <PhCheck :size="14" />
                                    Save
                                </button>
                            </div>
                        </template>
                        <template v-else>
                            <span class="tag-name">{{ t.Name }}</span>
                            <span class="usage-badge" :title="`Used by ${usageText(t.UsageCount)}`">{{ usageText(t.UsageCount) }}</span>
                            <div class="row-actions">
                                <button class="action-btn edit" title="Rename tag" @click="startEdit(t)">
                                    <PhPencilSimple :size="14" />
                                    Edit
                                </button>
                                <button class="action-btn delete" title="Delete tag" @click="deleteTarget = t">
                                    <PhTrash :size="14" />
                                    Delete
                                </button>
                            </div>
                        </template>
                    </li>
                </ul>
            </div>
        </BaseModal>

        <ConfirmDeleteModal
            v-if="deleteTarget"
            heading="Delete Tag"
            :title="deleteTarget.Name"
            :sub="deleteSub(deleteTarget)"
            @close="deleteTarget = null"
            @confirm="confirmDelete"
        />
    </Teleport>
</template>

<style scoped lang="scss">
.modal-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    letter-spacing: 0.04em;
}

.modal-header-actions {
    display: flex;
    gap: 4px;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;

    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.4; cursor: default; }
}

.search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    background: var(--app-surface, #0c1524);
    flex-shrink: 0;
}

.search-icon { color: var(--app-text-dim, #64748b); flex-shrink: 0; }

.search-input,
.tag-edit-input {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font-size: 0.82rem;

    &:focus { outline: none; border-color: var(--app-accent, #6366f1); }
}

.modal-body {
    flex: 1;
    overflow-y: auto;
    min-height: 60px;
}

.state-msg {
    padding: 20px 16px;
    font-size: 0.82rem;
    color: var(--app-text-dim, #64748b);
    text-align: center;

    &.error { color: #e87a7a; padding: 10px 16px; }
    &.empty { color: var(--app-text-dim, #4a6080); }
}

.tag-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
}

.tag-row {
    display: flex;
    align-items: center;
    padding: 6px 14px;
    gap: 10px;
    border-bottom: 1px solid var(--app-surface-high, #1e2b44);
    transition: background 0.1s;

    &:last-child { border-bottom: none; }
    &:hover { background: color-mix(in srgb, var(--app-surface-raised, #141e33) 70%, var(--app-accent, #6366f1)); }
}

.tag-name {
    flex: 1;
    font-size: 0.88rem;
    color: var(--app-text, #e2e8f0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.usage-badge {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--app-accent, #6366f1) 22%, transparent);
    color: var(--app-accent-hover, #818cf8);
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
}

.row-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: var(--app-bg, #0f172a);
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    &:hover {
        background: var(--app-surface-high, #1e2b44);
        border-color: var(--app-accent, #6366f1);
        color: var(--app-text, #e2e8f0);
    }

    &.edit:hover { border-color: #5ba55b; color: #8ecf8e; }
    &.delete:hover { border-color: #a55b5b; color: #e87a7a; }
}
</style>

<script setup lang="ts">
/**
 * BL-17: everyone who shares a last name, paired up with a guess at how they are related. The
 * guess is only the birth years talking — an aunt looks exactly like a mother from here — so
 * every row can be re-kinded, swapped or dropped, and nothing is written until it is ticked.
 */
import { ref, computed, onMounted } from 'vue'
import { BackendAPI } from '@/bridge/api'
import BaseModal from '@/components/BaseModal.vue'
import { mediaUrl } from '@/utils/mediaUrl'
import { initials, lifespan } from '@/utils/characterItems'
import {
    blankRelation, familyGuesses, pairKey, relationLabel, relationOtherId, sameFamily,
} from '@/utils/characterRelations'
import { PhArrowsLeftRight, PhUsersThree } from '@phosphor-icons/vue'
import type { CharacterItem, RelationshipType } from '@/types/models'

const props = defineProps<{
    character: CharacterItem
    characters: CharacterItem[]
    types: RelationshipType[]
    timelineId: number
}>()

const emit = defineEmits<{ close: []; changed: [] }>()

interface Row {
    aId: string
    bId: string
    kind: string
    on: boolean
    /** These two are related already — shown, but never ticked by default. */
    known: boolean
}

const rows    = ref<Row[]>([])
const loading = ref(true)
const busy    = ref(false)
const error   = ref('')

const members  = computed(() => [props.character, ...sameFamily(props.character, props.characters)])
const byId     = computed(() => new Map(props.characters.map(c => [c.Id, c])))
const typeById = computed(() => new Map(props.types.map(t => [t.Id, t])))
const picked   = computed(() => rows.value.filter(r => r.on))

/** The kinds, grouped for the picker's optgroups; family first, since that is what this is. */
const typeGroups = computed(() => {
    const groups = new Map<string, RelationshipType[]>()
    for (const t of props.types) {
        const key = t.Type?.trim() || 'other'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(t)
    }
    return [...groups.entries()].sort(([a], [b]) => (a === 'family' ? -1 : b === 'family' ? 1 : 0))
})

function person(id: string): CharacterItem | undefined {
    return byId.value.get(id)
}

/** How the row reads left to right, with each end's own gender choosing the word. */
function reads(row: Row): string {
    const rel = { ...blankRelation(row.aId, props.timelineId, row.kind), Character2Id: row.bId }
    return relationLabel(rel, row.aId, typeById.value.get(row.kind), person(row.aId)?.Gender ?? null)
}

function swap(row: Row) {
    ;[row.aId, row.bId] = [row.bId, row.aId]
}

/**
 * Pairs already related are left in the list but untick themselves: seeing "already related" is
 * more use than a row silently missing, and saving one again would write a second row.
 */
onMounted(async () => {
    try {
        const loaded = await Promise.all(members.value.map(async m => ({
            id: m.Id,
            relations: (await BackendAPI.GetCharacterRelations(m.Id))?.Relations ?? [],
        })))
        const known = new Set<string>()
        for (const { id, relations } of loaded)
            for (const r of relations) known.add(pairKey(id, relationOtherId(r, id)))
        rows.value = familyGuesses(members.value).map(g => ({
            ...g,
            on: !known.has(pairKey(g.aId, g.bId)),
            known: known.has(pairKey(g.aId, g.bId)),
        }))
    } catch (ex) {
        error.value = `Could not check who is already related: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('Family suggestion load failed', ex)
    } finally {
        loading.value = false
    }
})

async function save() {
    busy.value = true
    error.value = ''
    try {
        for (const row of picked.value) {
            const rel = { ...blankRelation(row.aId, props.timelineId, row.kind), Character2Id: row.bId }
            const res = await BackendAPI.SaveCharacterRelation(rel)
            if (res?.status !== 'ok') throw new Error(`The backend did not save ${reads(row)}.`)
        }
        emit('changed')
        emit('close')
    } catch (ex) {
        error.value = `Could not add the relations: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('Family relations save failed', ex)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <BaseModal
        :title="`The ${character.LastName} family`"
        width="min(820px, 95vw)"
        maxHeight="84vh"
        @close="emit('close')"
    >
        <div class="fm">
            <p class="fm-lead">
                <PhUsersThree :size="15" />
                {{ members.length }} characters share the name <b>{{ character.LastName }}</b>.
                The kinds below are guessed from their birth years — change or untick anything that is wrong.
            </p>

            <p v-if="loading" class="fm-empty">Checking who is already related…</p>
            <p v-else-if="!rows.length" class="fm-empty">Nothing left to suggest.</p>

            <ul v-else class="fm-rows">
                <li v-for="(row, i) in rows" :key="i" :class="{ 'fm-row--off': !row.on }">
                    <input v-model="row.on" type="checkbox" />

                    <span class="fm-who">
                        <img v-if="person(row.aId)?.PortraitPath" class="fm-face" :src="mediaUrl(person(row.aId)!.PortraitPath!)" alt="" />
                        <span v-else class="fm-face fm-face--initials" :style="{ background: person(row.aId)?.Color || '#6366f1' }">
                            {{ initials(person(row.aId)!) }}
                        </span>
                        <span class="fm-who-text">
                            <b>{{ person(row.aId)?.Name }}</b>
                            <em>{{ lifespan(person(row.aId)!) }}</em>
                        </span>
                    </span>

                    <span class="fm-is">is</span>
                    <select v-model="row.kind" class="fm-select">
                        <optgroup v-for="[group, list] in typeGroups" :key="group" :label="group">
                            <option v-for="t in list" :key="t.Id" :value="t.Id">{{ t.Name }}</option>
                        </optgroup>
                    </select>
                    <button class="fm-icon" title="Swap the two — reverses how it reads" @click="swap(row)">
                        <PhArrowsLeftRight :size="13" />
                    </button>

                    <span class="fm-who">
                        <img v-if="person(row.bId)?.PortraitPath" class="fm-face" :src="mediaUrl(person(row.bId)!.PortraitPath!)" alt="" />
                        <span v-else class="fm-face fm-face--initials" :style="{ background: person(row.bId)?.Color || '#6366f1' }">
                            {{ initials(person(row.bId)!) }}
                        </span>
                        <span class="fm-who-text">
                            <b>{{ person(row.bId)?.Name }}</b>
                            <em>{{ lifespan(person(row.bId)!) }}</em>
                        </span>
                    </span>

                    <span class="fm-tail">
                        <span v-if="row.known" class="fm-tag">already related</span>
                        <em v-else>{{ reads(row) }}</em>
                    </span>
                </li>
            </ul>

            <p v-if="error" class="fm-error">{{ error }}</p>
        </div>

        <template #footer>
            <button class="fm-btn" data-cancel @click="emit('close')">Cancel</button>
            <button
                class="fm-btn fm-btn--primary"
                data-primary
                :disabled="busy || !picked.length"
                @click="save"
            >
                Add {{ picked.length }} {{ picked.length === 1 ? 'relation' : 'relations' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped lang="scss">
.fm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 18px;
    min-height: 0;
    overflow: hidden;
}

.fm-lead {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 0.78rem;
    color: var(--app-text-dim, #64748b);

    b { color: var(--app-text, #e2e8f0); font-weight: 500; }
}

.fm-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;

    li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.8rem;
        color: var(--app-text, #e2e8f0);

        &:hover { background: var(--app-surface, #0c1524); }
    }
}

.fm-row--off { opacity: 0.45; }

.fm-who {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 0;
    min-width: 0;
}

.fm-who-text {
    display: flex;
    flex-direction: column;
    min-width: 0;

    b {
        font-weight: 500;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    em {
        font-size: 0.68rem;
        font-style: normal;
        color: var(--app-text-dim, #64748b);
    }
}

.fm-face {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;

    &--initials {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.62rem;
        font-weight: 600;
        color: #fff;
    }
}

.fm-is {
    font-size: 0.72rem;
    color: var(--app-text-dim, #64748b);
}

.fm-tail {
    flex: 0 0 132px;
    text-align: right;

    em {
        font-size: 0.7rem;
        font-style: italic;
        color: var(--app-text-dim, #64748b);
    }
}

.fm-tag {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--app-surface-high, #1e2b44);
    font-size: 0.64rem;
    color: var(--app-text-dim, #64748b);
}

.fm-select {
    flex: 0 0 auto;
    max-width: 170px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    font: inherit;
    font-size: 0.75rem;
    padding: 3px 5px;
    outline: none;

    &:focus { border-color: var(--app-accent, #6366f1); }
}

.fm-icon {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;

    &:hover { color: var(--app-text, #e2e8f0); }
}

.fm-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.75rem;
    cursor: pointer;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled { opacity: 0.5; cursor: default; }

    &--primary {
        color: var(--app-accent-hover, #818cf8);
        border-color: var(--app-accent, #6366f1);
    }
}

.fm-empty {
    margin: 0;
    font-size: 0.78rem;
    color: var(--app-text-dim, #64748b);
}

.fm-error {
    margin: 0;
    font-size: 0.78rem;
    color: #f87171;
}
</style>

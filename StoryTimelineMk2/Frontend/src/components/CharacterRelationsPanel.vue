<script setup lang="ts">
/**
 * BL-15 phase 4 / BL-17: who a character is to everybody else. One row per pair — the kind carries
 * both readings, so relating A to B relates B to A without a second row to keep in step. The list
 * is the summary; adding and editing happen in the modal, which has room for it.
 */
import { ref, computed, watch } from 'vue'
import { BackendAPI } from '@/bridge/api'
import CharacterRelateModal from '@/components/CharacterRelateModal.vue'
import CharacterFamilyModal from '@/components/CharacterFamilyModal.vue'
import { relationLabel, relationOtherId, relationWhen, sameFamily } from '@/utils/characterRelations'
import { PhPlus, PhPencilSimple, PhUsersThree } from '@phosphor-icons/vue'
import type {
    CharacterItem, CharacterRelationship, LodLevel, RelationshipType,
} from '@/types/models'

const props = defineProps<{
    character: CharacterItem
    characters: CharacterItem[]
    timelineId: number
    lodProfile: LodLevel[]
    monthNames: string[]
    monthLengths: number[]
    seasonNames: string[]
    weekCount: number
}>()

const relations = ref<CharacterRelationship[]>([])
const types     = ref<RelationshipType[]>([])
const error     = ref('')
/** Null while closed; otherwise the relation to open on, or a blank one for a new tie. */
const editing    = ref<CharacterRelationship | null>(null)
const modalOpen  = ref(false)
const familyOpen = ref(false)

const byId   = computed(() => new Map(props.characters.map(c => [c.Id, c])))
const typeById = computed(() => new Map(types.value.map(t => [t.Id, t])))
/** Everyone but the character themselves — nobody is their own sibling. */
const others = computed(() => props.characters.filter(c => c.Id !== props.character.Id))

/** Same last name, not related yet: the suggestion only appears when it has something to offer. */
const family = computed(() => {
    const kin = sameFamily(props.character, props.characters)
    const tied = new Set(relations.value.map(r => relationOtherId(r, props.character.Id)))
    return kin.some(c => !tied.has(c.Id)) ? kin : []
})

function name(id: string): string {
    return byId.value.get(id)?.Name || 'Someone else'
}

function label(r: CharacterRelationship): string {
    return relationLabel(r, props.character.Id, typeById.value.get(r.RelationshipType), props.character.Gender)
}

// ── Loading ───────────────────────────────────────────────────────────────────

watch(() => props.character.Id, load, { immediate: true })

async function load() {
    modalOpen.value = false
    familyOpen.value = false
    relations.value = []
    try {
        const res = await BackendAPI.GetCharacterRelations(props.character.Id)
        relations.value = res?.Relations ?? []
        types.value = res?.Types ?? []
    } catch (ex) {
        error.value = `Could not load the relations: ${ex instanceof Error ? ex.message : String(ex)}`
        console.error('GetCharacterRelations failed', ex)
    }
}

function open(r: CharacterRelationship | null) {
    error.value = ''
    editing.value = r
    modalOpen.value = true
}
</script>

<template>
    <div class="rl">
        <h3>
            Relations <span>{{ relations.length }}</span>
            <button class="ch-btn" :disabled="!others.length" @click="open(null)">
                <PhPlus :size="14" /> Relate
            </button>
        </h3>

        <p v-if="!others.length" class="rl-empty">
            There is nobody else in this timeline yet.
        </p>
        <p v-else-if="!relations.length" class="rl-empty">
            Nobody yet — <em>Relate</em> ties them to someone.
        </p>

        <ul v-if="relations.length">
            <li v-for="r in relations" :key="r.Id" @click="open(r)">
                <span
                    class="rl-dot"
                    :style="{ background: byId.get(relationOtherId(r, character.Id))?.Color || '#64748b' }"
                />
                <span class="rl-label">{{ label(r) }}</span>
                <span class="rl-name">{{ name(relationOtherId(r, character.Id)) }}</span>
                <span class="rl-tail">
                    <span v-if="relationWhen(r)" class="rl-when">{{ relationWhen(r) }}</span>
                    <span v-if="r.Notes" class="rl-notes" :title="r.Notes">{{ r.Notes }}</span>
                </span>
                <button class="rl-icon" title="Edit"><PhPencilSimple :size="13" /></button>
            </li>
        </ul>

        <button v-if="family.length" class="rl-family" @click="familyOpen = true">
            <PhUsersThree :size="15" />
            {{ family.length + 1 }} characters named <b>{{ character.LastName }}</b> — add family?
        </button>

        <p v-if="error" class="rl-error">{{ error }}</p>

        <CharacterRelateModal
            v-if="modalOpen"
            :character="character"
            :characters="characters"
            :relations="relations"
            :types="types"
            :editing="editing"
            :timelineId="timelineId"
            :lodProfile="lodProfile"
            :monthNames="monthNames"
            :monthLengths="monthLengths"
            :seasonNames="seasonNames"
            :weekCount="weekCount"
            @changed="load"
            @close="modalOpen = false"
        />

        <CharacterFamilyModal
            v-if="familyOpen"
            :character="character"
            :characters="characters"
            :types="types"
            :timelineId="timelineId"
            @changed="load"
            @close="familyOpen = false"
        />
    </div>
</template>

<style scoped lang="scss">
.rl {
    display: flex;
    flex-direction: column;
    gap: 6px;

    h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--app-text-dim, #64748b);

        span {
            margin-right: auto;
            font-weight: 400;
            opacity: 0.7;
        }
    }

    ul {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 4px 6px;
        border-radius: var(--app-radius-sm, 4px);
        font-size: 0.78rem;
        color: var(--app-text, #e2e8f0);
        cursor: pointer;

        &:hover { background: var(--app-surface, #0c1524); }
    }
}

.ch-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--app-radius-sm, 4px);
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.72rem;
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s;

    &:hover:not(:disabled) { color: var(--app-text, #e2e8f0); border-color: var(--app-accent, #6366f1); }
    &:disabled { opacity: 0.5; cursor: default; }
}

.rl-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.rl-label {
    flex: 0 0 auto;
    color: var(--app-text-dim, #64748b);
}

.rl-name {
    font-weight: 500;
}

.rl-when,
.rl-notes {
    font-size: 0.72rem;
    color: var(--app-text-dim, #64748b);
}

.rl-notes {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-style: italic;
}

.rl-tail {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-left: auto;
    min-width: 0;
}

.rl-icon {
    flex: 0 0 auto;
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    cursor: pointer;
}

li:hover .rl-icon { color: var(--app-text, #e2e8f0); }

.rl-family {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border: 1px dashed var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    background: transparent;
    color: var(--app-text-dim, #64748b);
    font: inherit;
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;

    b { color: var(--app-text, #e2e8f0); font-weight: 500; }

    &:hover { border-color: var(--app-accent, #6366f1); color: var(--app-text, #e2e8f0); }
}

.rl-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--app-text-dim, #64748b);

    em { font-style: italic; }
}

.rl-error {
    margin: 0;
    font-size: 0.75rem;
    color: #f87171;
}
</style>

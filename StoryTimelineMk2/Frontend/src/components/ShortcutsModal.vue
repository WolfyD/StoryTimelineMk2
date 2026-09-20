<script setup lang="ts">
// Renders straight from the shortcut registry, so it can never drift from what actually fires.
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import { SHORTCUTS, chordParts, type ShortcutContext } from '@/utils/shortcuts'

const props = defineProps<{ context: ShortcutContext }>()
defineEmits<{ close: [] }>()

const CONTEXT_TITLES: Record<ShortcutContext, string> = {
    timeline: 'Timeline window',
    edit: 'Edit item window',
    calendar: 'Calendar windows',
}

// The window the user is in comes first; the rest follow so the list is complete from anywhere.
const sections = computed(() => {
    const order: ShortcutContext[] = [props.context, ...(Object.keys(CONTEXT_TITLES) as ShortcutContext[]).filter(c => c !== props.context)]
    return order.map(context => {
        const groups = new Map<string, typeof SHORTCUTS>()
        for (const s of SHORTCUTS.filter(s => s.context === context)) {
            if (!groups.has(s.group)) groups.set(s.group, [])
            groups.get(s.group)!.push(s)
        }
        return { context, title: CONTEXT_TITLES[context], groups: [...groups] }
    })
})

const chordsOf = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]).map(chordParts)
</script>

<template>
    <BaseModal title="Keyboard shortcuts" width="min(680px, 94vw)" max-height="82vh" @close="$emit('close')">
        <div class="sc-body">
            <section v-for="sec in sections" :key="sec.context" :class="{ 'sc-current': sec.context === context }">
                <h2>{{ sec.title }}</h2>
                <table>
                    <tbody v-for="[group, list] in sec.groups" :key="group">
                        <tr v-if="sec.groups.length > 1" class="sc-group"><td colspan="2">{{ group }}</td></tr>
                        <tr v-for="s in list" :key="s.id">
                            <td>
                                <template v-for="(chord, i) in chordsOf(s.keys)" :key="i">
                                    <span v-if="i > 0" class="sc-or">/</span>
                                    <template v-for="(part, j) in chord" :key="j">
                                        <span v-if="j > 0" class="sc-plus">+</span><kbd>{{ part }}</kbd>
                                    </template>
                                </template>
                            </td>
                            <td>{{ s.label }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <p class="sc-tip">While a text field has focus only Ctrl / Alt combinations and F-keys work; Esc leaves the field.</p>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.sc-body {
    padding: 20px 28px 28px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    color: var(--app-text-muted, #94a3b8);
    font-size: 0.87em;
    line-height: 1.6;
}

section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

h2 {
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--app-text-dim, #4a6080);
    margin: 0;
    padding-bottom: 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 50%, transparent);

    .sc-current & { color: var(--app-accent, #79876b); }
}

table {
    width: 100%;
    border-collapse: collapse;

    td {
        padding: 4px 10px 4px 0;
        vertical-align: top;

        &:first-child {
            white-space: nowrap;
            width: 1%;
            padding-right: 20px;
        }
    }

    tr + tr td {
        border-top: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 25%, transparent);
    }

    .sc-group td {
        padding-top: 10px;
        font-size: 0.82em;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-text-dim, #4a6080);
        border-top: none;
    }
}

kbd {
    display: inline-block;
    padding: 1px 6px;
    font-size: 0.85em;
    font-family: monospace;
    background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 70%, transparent);
    border-radius: 3px;
    color: var(--app-text, #e2e8f0);
}

.sc-plus { margin: 0 3px; color: var(--app-text-dim, #4a6080); }
.sc-or   { margin: 0 6px; color: var(--app-text-dim, #4a6080); }

.sc-tip {
    margin: 0;
    font-size: 0.92em;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
}
</style>

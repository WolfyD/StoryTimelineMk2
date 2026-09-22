<script setup lang="ts">
// Renders straight from the shortcut registry, so it can never drift from what actually fires —
// and, in Customise mode, writes back to it: click a row, press the chord you want.
import { computed, ref, shallowRef, onBeforeUnmount } from 'vue'
import BaseModal from './BaseModal.vue'
import { SHORTCUTS, chordParts, chordOf, keysOf, conflictOf, rejectChord, remapKey, shortcutOverrides, IS_MAC, MOD, ALT, type Shortcut, type ShortcutContext } from '@/utils/shortcuts'
import { setShortcutKey, resetShortcutKeys } from '@/utils/shortcutOverrides'

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

// ── Customise ────────────────────────────────────────────────────

const editing = ref(false)
// shallowRef: a plain ref would hand back a reactive proxy, and `capturing === s` in the
// template compares it against the raw registry entry.
const capturing = shallowRef<Shortcut | null>(null)
const error = ref('')

const isRemapped = (s: Shortcut) => remapKey(s) in shortcutOverrides.value
const hasRemaps = computed(() => Object.keys(shortcutOverrides.value).length > 0)

function startCapture(s: Shortcut) {
    if (!editing.value || s.fixed || capturing.value === s) return
    capturing.value = s
    error.value = ''
    // Capture phase, so the chord is swallowed before Esc reaches BaseModal or F11 reaches the
    // window — while capturing, every key means "this is the one I want", nothing else.
    window.addEventListener('keydown', onCapture, true)
}

function stopCapture() {
    capturing.value = null
    window.removeEventListener('keydown', onCapture, true)
}

async function apply(s: Shortcut, chord: string | null) {
    try {
        await setShortcutKey(s, chord)
    } catch (e) {
        console.error('[shortcuts] saving the remap failed', e)
        error.value = 'Could not save that — see the log for details.'
    }
}

function onCapture(e: KeyboardEvent) {
    const s = capturing.value
    if (!s) return
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return   // a modifier alone: keep waiting
    e.preventDefault()
    e.stopImmediatePropagation()

    if (e.key === 'Escape') return stopCapture()
    if (e.key === 'Backspace' || e.key === 'Delete') {
        void apply(s, null)
        return stopCapture()
    }

    const chord = chordOf(e)
    const taken = conflictOf(s.context, chord, s)
    const bad = rejectChord(chord) ?? (taken ? `Already used by “${taken.label}”.` : null)
    if (bad) {
        error.value = bad   // stay in capture: the next press replaces it
        return
    }
    void apply(s, chord)
    stopCapture()
}

function toggleEdit() {
    stopCapture()
    error.value = ''
    editing.value = !editing.value
}

async function resetAll() {
    stopCapture()
    error.value = ''
    try {
        await resetShortcutKeys()
    } catch (e) {
        console.error('[shortcuts] resetting the remaps failed', e)
        error.value = 'Could not reset — see the log for details.'
    }
}

onBeforeUnmount(stopCapture)
</script>

<template>
    <BaseModal title="Keyboard shortcuts" width="min(680px, 94vw)" max-height="82vh" @close="$emit('close')">
        <div class="sc-body">
            <section v-for="sec in sections" :key="sec.context" :class="{ 'sc-current': sec.context === context }">
                <h2>{{ sec.title }}</h2>
                <table>
                    <tbody v-for="[group, list] in sec.groups" :key="group">
                        <tr v-if="sec.groups.length > 1" class="sc-group"><td colspan="2">{{ group }}</td></tr>
                        <tr v-for="s in list" :key="s.id" :class="{ 'sc-editable': editing && !s.fixed }">
                            <td>
                                <component
                                    :is="editing && !s.fixed ? 'button' : 'span'"
                                    class="sc-chords" :class="{ 'sc-capturing': capturing === s }"
                                    @click="startCapture(s)"
                                >
                                    <template v-if="capturing === s">Press a key…</template>
                                    <template v-else>
                                        <template v-for="(chord, i) in chordsOf(keysOf(s))" :key="i">
                                            <span v-if="i > 0" class="sc-or">/</span>
                                            <template v-for="(part, j) in chord" :key="j">
                                                <span v-if="j > 0" class="sc-plus">+</span><kbd>{{ part }}</kbd>
                                            </template>
                                        </template>
                                        <span v-if="isRemapped(s)" class="sc-changed" title="Changed from the default">•</span>
                                    </template>
                                </component>
                            </td>
                            <td>{{ s.label }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <p v-if="error" class="sc-error">{{ error }}</p>
            <p v-if="editing" class="sc-tip">
                Click a shortcut, then press the keys you want. <kbd>Backspace</kbd> puts it back to the default,
                <kbd>Esc</kbd> cancels. Greyed-out rows are conventions the app relies on and cannot be changed.
            </p>
            <p class="sc-tip">While a text field has focus only {{ MOD }} / {{ ALT }} combinations and F-keys work; Esc leaves the field.</p>
            <p v-if="IS_MAC" class="sc-tip">
                macOS gives the F-keys to brightness and volume: press them with <kbd>fn</kbd>, or turn on
                “Use F1, F2, etc. as standard function keys” in System Settings → Keyboard. <kbd>F11</kbd> is
                Show Desktop there — if it never reaches the window, use the fullscreen button instead.
            </p>
        </div>
        <template #footer>
            <button v-if="editing && hasRemaps" class="sc-btn" @click="resetAll">Reset all</button>
            <button class="sc-btn" @click="toggleEdit">{{ editing ? 'Done' : 'Customise…' }}</button>
            <button class="sc-btn sc-btn-close" data-cancel @click="$emit('close')">Close</button>
        </template>
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

// The chord cell is a <span> normally and a <button> in Customise mode — same box either way,
// so the table does not reflow when the mode flips.
.sc-chords {
    display: inline-block;
    padding: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: inherit;
    font: inherit;
    text-align: left;
}

button.sc-chords {
    padding: 1px 5px;
    margin: -1px -5px;
    cursor: pointer;
    border-color: color-mix(in srgb, var(--app-border, #2d3a56) 60%, transparent);

    &:hover { background: #ffffff0e; }
}

.sc-capturing {
    border-color: var(--app-accent, #79876b);
    color: var(--app-accent, #79876b);
    font-style: italic;
}

.sc-changed {
    margin-left: 6px;
    color: var(--app-accent, #79876b);
}

.sc-editable td:last-child { color: var(--app-text, #e2e8f0); }

.sc-error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--app-danger, #b4524a) 18%, transparent);
    color: var(--app-danger, #b4524a);
}

.sc-btn {
    font-size: 13px;
    font-weight: 500;
    padding: 6px 16px;
    border-radius: 5px;
    cursor: pointer;
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);

    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}

.sc-btn-close { margin-left: auto; }

.sc-tip {
    margin: 0;
    font-size: 0.92em;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
}
</style>

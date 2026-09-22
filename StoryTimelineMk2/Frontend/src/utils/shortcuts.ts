// Keyboard shortcuts — the one registry every window and the Shortcuts modal read from (BL-39).
// `keys` are the defaults; a user remap overrides them (see `utils/shortcutOverrides.ts`, which
// owns loading and saving so this module stays free of the bridge). Handlers never change.
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
import { IS_MAC } from './platform'

export type ShortcutContext = 'timeline' | 'edit' | 'calendar'

export interface Shortcut {
    id: string
    /** Normalised chord(s): modifiers in Ctrl, Alt, Shift order, then the key — `Ctrl+Shift+A`, `F2`, `ArrowLeft`, `+`. */
    keys: string | string[]
    group: string
    label: string
    context: ShortcutContext
    /** Fires while a text field has focus. Default: only Ctrl / Alt chords and F-keys do. */
    inInputs?: boolean
    /** Fires on key auto-repeat too (held keys). */
    repeat?: boolean
    /** A convention the user cannot remap: Esc, Enter, Ctrl+S, the F-keys, arrows, Tab, Ctrl+Z. */
    fixed?: boolean
}

// ── Key names ──────────────────────────────────────────────────────
//
// Chords are stored in one spelling (`Ctrl+…`) and chordOf() already folds ⌘ into `Ctrl+`, so the
// keys themselves have always worked on a Mac — only the labels were wrong. Everything on screen
// goes through chordParts() or these two constants, so this is the only place that has to know.
export { IS_MAC }   // lived here before platform.ts; callers still import it from here
export const MOD = IS_MAC ? '⌘' : 'Ctrl'
export const ALT = IS_MAC ? '⌥' : 'Alt'

export const SHORTCUTS: Shortcut[] = [
    // ── Timeline window ──────────────────────────────────────────────────────
    { id: 'pan',         keys: ['ArrowLeft', 'ArrowRight'],             group: 'Navigation', label: 'Pan left / right while held (speed: Timeline settings → General)', context: 'timeline', repeat: true, fixed: true },
    { id: 'panFast',     keys: ['Shift+ArrowLeft', 'Shift+ArrowRight'], group: 'Navigation', label: 'Pan 3× faster',                                                    context: 'timeline', repeat: true, fixed: true },
    { id: 'stepTick',    keys: ['ArrowUp', 'ArrowDown'],                group: 'Navigation', label: 'Forward / back one tick',                                          context: 'timeline', repeat: true, fixed: true },
    { id: 'stepYear',    keys: ['Shift+ArrowUp', 'Shift+ArrowDown'],    group: 'Navigation', label: 'Forward / back one year',                                          context: 'timeline', repeat: true, fixed: true },
    { id: 'zoomIn',      keys: '+',    group: 'Navigation', label: 'Zoom in one level of detail',  context: 'timeline' },
    { id: 'zoomOut',     keys: '-',    group: 'Navigation', label: 'Zoom out one level of detail', context: 'timeline' },
    { id: 'jumpStart',   keys: 'Home', group: 'Navigation', label: 'Jump to the timeline start — the start boundary if there is one, else the first item', context: 'timeline' },
    { id: 'jumpEnd',     keys: 'End',  group: 'Navigation', label: 'Jump to the timeline end — the end boundary if there is one, else the last item',     context: 'timeline' },
    { id: 'focusJump',   keys: 'G',    group: 'Navigation', label: 'Go to year — focus the jump box (Enter jumps, Esc leaves it)', context: 'timeline' },

    { id: 'addItem',     keys: 'N',       group: 'Items', label: 'New item — pick the type, then the edit window opens at the current year', context: 'timeline' },
    { id: 'addItemLast', keys: 'Shift+N', group: 'Items', label: 'New item of the last used type, no picker',                                  context: 'timeline' },
    { id: 'undoDelete',  keys: 'Ctrl+Z',  group: 'Items', label: 'Undo the last deletion', context: 'timeline', inInputs: false, fixed: true },

    // The type picker's own keys — it reads them from here, and 1–5 always work as a fallback.
    { id: 'pickEvent',   keys: 'E', group: 'New item type', label: 'Event',   context: 'timeline' },
    { id: 'pickPeriod',  keys: 'P', group: 'New item type', label: 'Period',  context: 'timeline' },
    { id: 'pickAge',     keys: 'A', group: 'New item type', label: 'Age',     context: 'timeline' },
    { id: 'pickPicture', keys: 'I', group: 'New item type', label: 'Picture', context: 'timeline' },
    { id: 'pickNote',    keys: 'O', group: 'New item type', label: 'Note',    context: 'timeline' },

    { id: 'filter',       keys: 'F',            group: 'Panels & windows', label: 'Filter panel',      context: 'timeline' },
    { id: 'tags',         keys: 'T',            group: 'Panels & windows', label: 'Tags',              context: 'timeline' },
    { id: 'yearCalendar', keys: 'Y',            group: 'Panels & windows', label: 'Year calendar',     context: 'timeline' },
    { id: 'miniMode',     keys: 'M',            group: 'Panels & windows', label: 'Mini mode',         context: 'timeline' },
    { id: 'massAdd',      keys: 'Shift+M',      group: 'Panels & windows', label: 'Mass add items',    context: 'timeline' },
    { id: 'settings',     keys: 'Ctrl+,',       group: 'Panels & windows', label: 'Timeline settings', context: 'timeline' },
    { id: 'actionsMenu',  keys: 'Ctrl+Shift+A', group: 'Panels & windows', label: 'Actions menu',      context: 'timeline' },
    { id: 'reference',    keys: 'R',            group: 'Panels & windows', label: 'Reference timeline — open another timeline read-only in its own window', context: 'timeline' },

    { id: 'help',          keys: 'F1',     group: 'App', label: 'Help',                  context: 'timeline', fixed: true },
    { id: 'shortcuts',     keys: 'F2',     group: 'App', label: 'This list',             context: 'timeline', fixed: true },
    { id: 'customScaling', keys: 'F10',    group: 'App', label: `Toggle custom scaling — saved zoom ↔ 100% (${MOD}+wheel zoom is remembered too)`, context: 'timeline', fixed: true },
    { id: 'fullscreen',    keys: 'F11',    group: 'App', label: 'Toggle fullscreen',     context: 'timeline', fixed: true },
    { id: 'escape',        keys: 'Escape', group: 'App', label: 'Leave a text field, or close the open panel / menu', context: 'timeline', inInputs: true, fixed: true },

    // ── Edit item window ─────────────────────────────────────────────────────
    { id: 'save',      keys: 'Ctrl+S',     group: 'Edit item', label: 'Save and close', context: 'edit', fixed: true },
    { id: 'saveEnter', keys: 'Ctrl+Enter', group: 'Edit item', label: 'Save and close (from inside a text field)', context: 'edit', fixed: true },
    { id: 'cancel',    keys: 'Escape',     group: 'Edit item', label: 'Leave a text field, or cancel', context: 'edit', inInputs: true, fixed: true },
    { id: 'tabPath',   keys: ['Tab', 'Shift+Tab'], group: 'Edit item', label: 'Title → description → end date (Period / Age) → tags; Shift+Tab goes back', context: 'edit', inInputs: true, fixed: true },
    { id: 'help',      keys: 'F1', group: 'Edit item', label: 'Help',      context: 'edit', fixed: true },
    { id: 'shortcuts', keys: 'F2', group: 'Edit item', label: 'This list', context: 'edit', fixed: true },

    // ── Calendar windows ─────────────────────────────────────────────────────
    { id: 'help',      keys: 'F1', group: 'Calendar windows', label: 'Help',      context: 'calendar', fixed: true },
    { id: 'shortcuts', keys: 'F2', group: 'Calendar windows', label: 'This list', context: 'calendar', fixed: true },
]

export const shortcutsFor = (context: ShortcutContext) => SHORTCUTS.filter(s => s.context === context)

// ── User remaps ───────────────────────────────────────────────────
//
// `id` repeats across contexts (help, save, shortcuts …), so a remap is keyed by both.
// `utils/shortcutOverrides.ts` loads and saves these; this module only resolves them.
const overrides = ref<Record<string, string>>({})

export const remapKey = (s: Pick<Shortcut, 'context' | 'id'>) => `${s.context}:${s.id}`

/** Replaces the whole remap table — everything reading `keysOf` updates with it. */
export function setShortcutOverrides(map: Record<string, string>) {
    overrides.value = { ...map }
}
export const shortcutOverrides = computed(() => overrides.value)

/** The chords a shortcut actually answers to. A remap always replaces every default chord. */
export function keysOf(s: Shortcut): string[] {
    const o = overrides.value[remapKey(s)]
    if (o) return [o]
    return Array.isArray(s.keys) ? s.keys : [s.keys]
}

/** The shortcut a chord is already taken by in this context, if any. */
export function conflictOf(context: ShortcutContext, chord: string, exclude?: Shortcut) {
    return shortcutsFor(context).find(s => s !== exclude && keysOf(s).includes(chord))
}

/** A chord that would leave the user stuck, or that the field under the cursor needs. */
export function rejectChord(chord: string): string | null {
    if (['Escape', 'Enter', 'Tab', 'Shift+Tab', ' ', 'Space'].includes(chord)) return `${chord} is reserved.`
    if (/^(Ctrl\+)?(Alt\+)?(Shift\+)?(Control|Alt|Shift|Meta)$/.test(chord)) return 'Add a key to the modifier.'
    if (chord === 'F1' || chord === 'F2') return 'F1 and F2 always open Help and this list.'
    return null
}

/** The chord string for a key event, in the registry's spelling. */
export function chordOf(e: KeyboardEvent): string {
    let key = e.key === ' ' ? 'Space' : e.key
    let shift = e.shiftKey
    if (key.length === 1) {
        if (/[a-z]/i.test(key)) key = key.toUpperCase()
        else shift = false // Shift already produced the character (+, ?, …); it is not part of the chord
    }
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key
}

const KEY_LABELS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' }
const MAC_LABELS: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧' }
/** `Ctrl+Shift+A` → `['Ctrl', 'Shift', 'A']`, arrows and Esc prettified — one `<kbd>` per part. */
export function chordParts(chord: string): string[] {
    if (chord === '+') return ['+']
    const parts = chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+')
    return parts.map(p => (IS_MAC ? MAC_LABELS[p] : undefined) ?? KEY_LABELS[p] ?? p)
}

const isFKey = (key: string) => /^F\d{1,2}$/.test(key)
const firesInInputs = (chord: string) => chord.includes('Ctrl+') || chord.includes('Alt+') || isFKey(chord)

/** Text-ish focus: the key belongs to the field unless the shortcut says otherwise. */
export function isTextTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null
    if (!el?.tagName) return false
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
    if (el.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)
    return el.isContentEditable
}

// Modals switch the window's shortcuts off (except Esc) while they are open. A stack rather than
// a counter, because Esc and Enter belong to the modal on top: with a counter a nested dialog and
// the one under it both acted on the same key.
const modalStack: symbol[] = []
export const isModalOpen = () => modalStack.length > 0
/** Registers an open modal. The returned predicate is true only while this one is the topmost. */
export function useModalGuard() {
    const token = Symbol('modal')
    onMounted(() => { modalStack.push(token) })
    onBeforeUnmount(() => {
        const i = modalStack.indexOf(token)
        if (i >= 0) modalStack.splice(i, 1)   // modals do not always close in the order they opened
    })
    return () => modalStack[modalStack.length - 1] === token
}

export type ShortcutHandler = (e: KeyboardEvent) => void | false

/**
 * One window-level keydown listener for a context. A handler returning `false` means "not mine",
 * the key then keeps its default behaviour.
 */
export function useShortcuts(context: ShortcutContext, handlers: Record<string, ShortcutHandler>) {
    // Computed, so a remap saved in the Shortcuts modal is live on the next key press.
    const table = computed(() => {
        const m = new Map<string, Shortcut>()
        for (const s of shortcutsFor(context)) for (const k of keysOf(s)) m.set(k, s)
        return m
    })

    function onKeydown(e: KeyboardEvent) {
        const inText = isTextTarget(e.target)
        if (e.key === 'Escape' && inText) {
            // Esc leaves the field; the next key is a shortcut again. Modals must not close on it.
            (e.target as HTMLElement).blur()
            e.preventDefault()
            e.stopImmediatePropagation()
            return
        }
        if (isModalOpen()) return
        const chord = chordOf(e)
        const sc = table.value.get(chord)
        if (!sc || (e.repeat && !sc.repeat)) return
        if (inText && !(sc.inInputs ?? firesInInputs(chord))) return
        const handler = handlers[sc.id]
        if (!handler || handler(e) === false) return
        e.preventDefault()
    }

    onMounted(() => window.addEventListener('keydown', onKeydown))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
    return onKeydown
}

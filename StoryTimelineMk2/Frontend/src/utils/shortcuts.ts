// Keyboard shortcuts — the one registry every window and the Shortcuts modal read from (BL-39).
// Keys are fixed for now; when users get to remap them, `keys` become the defaults and the
// overrides live in app settings. Handlers never change.
import { onMounted, onBeforeUnmount } from 'vue'

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
}

export const SHORTCUTS: Shortcut[] = [
    // ── Timeline window ──────────────────────────────────────────────────────
    { id: 'pan',         keys: ['ArrowLeft', 'ArrowRight'],             group: 'Navigation', label: 'Pan left / right while held (speed: Timeline settings → General)', context: 'timeline', repeat: true },
    { id: 'panFast',     keys: ['Shift+ArrowLeft', 'Shift+ArrowRight'], group: 'Navigation', label: 'Pan 3× faster',                                                    context: 'timeline', repeat: true },
    { id: 'stepTick',    keys: ['ArrowUp', 'ArrowDown'],                group: 'Navigation', label: 'Forward / back one tick',                                          context: 'timeline', repeat: true },
    { id: 'stepYear',    keys: ['Shift+ArrowUp', 'Shift+ArrowDown'],    group: 'Navigation', label: 'Forward / back one year',                                          context: 'timeline', repeat: true },
    { id: 'zoomIn',      keys: '+',    group: 'Navigation', label: 'Zoom in one level of detail',  context: 'timeline' },
    { id: 'zoomOut',     keys: '-',    group: 'Navigation', label: 'Zoom out one level of detail', context: 'timeline' },
    { id: 'jumpStart',   keys: 'Home', group: 'Navigation', label: 'Jump to the timeline start — the start boundary if there is one, else the first item', context: 'timeline' },
    { id: 'jumpEnd',     keys: 'End',  group: 'Navigation', label: 'Jump to the timeline end — the end boundary if there is one, else the last item',     context: 'timeline' },
    { id: 'focusJump',   keys: 'G',    group: 'Navigation', label: 'Go to year — focus the jump box (Enter jumps, Esc leaves it)', context: 'timeline' },

    { id: 'addItem',     keys: 'N',       group: 'Items', label: 'New item — pick the type, then the edit window opens at the current year', context: 'timeline' },
    { id: 'addItemLast', keys: 'Shift+N', group: 'Items', label: 'New item of the last used type, no picker',                                  context: 'timeline' },
    { id: 'undoDelete',  keys: 'Ctrl+Z',  group: 'Items', label: 'Undo the last deletion', context: 'timeline', inInputs: false },

    { id: 'filter',       keys: 'F',            group: 'Panels & windows', label: 'Filter panel',      context: 'timeline' },
    { id: 'tags',         keys: 'T',            group: 'Panels & windows', label: 'Tags',              context: 'timeline' },
    { id: 'yearCalendar', keys: 'Y',            group: 'Panels & windows', label: 'Year calendar',     context: 'timeline' },
    { id: 'miniMode',     keys: 'M',            group: 'Panels & windows', label: 'Mini mode',         context: 'timeline' },
    { id: 'massAdd',      keys: 'Shift+M',      group: 'Panels & windows', label: 'Mass add items',    context: 'timeline' },
    { id: 'settings',     keys: 'Ctrl+,',       group: 'Panels & windows', label: 'Timeline settings', context: 'timeline' },
    { id: 'actionsMenu',  keys: 'Ctrl+Shift+A', group: 'Panels & windows', label: 'Actions menu',      context: 'timeline' },
    { id: 'reference',    keys: 'R',            group: 'Panels & windows', label: 'Reference timeline — open another timeline read-only in its own window', context: 'timeline' },

    { id: 'help',          keys: 'F1',     group: 'App', label: 'Help',                  context: 'timeline' },
    { id: 'shortcuts',     keys: 'F2',     group: 'App', label: 'This list',             context: 'timeline' },
    { id: 'customScaling', keys: 'F10',    group: 'App', label: 'Toggle custom scaling — saved zoom ↔ 100% (Ctrl+wheel zoom is remembered too)', context: 'timeline' },
    { id: 'fullscreen',    keys: 'F11',    group: 'App', label: 'Toggle fullscreen',     context: 'timeline' },
    { id: 'escape',        keys: 'Escape', group: 'App', label: 'Leave a text field, or close the open panel / menu', context: 'timeline', inInputs: true },

    // ── Edit item window ─────────────────────────────────────────────────────
    { id: 'save',      keys: 'Ctrl+S',     group: 'Edit item', label: 'Save and close', context: 'edit' },
    { id: 'saveEnter', keys: 'Ctrl+Enter', group: 'Edit item', label: 'Save and close (from inside a text field)', context: 'edit' },
    { id: 'cancel',    keys: 'Escape',     group: 'Edit item', label: 'Leave a text field, or cancel', context: 'edit', inInputs: true },
    { id: 'tabPath',   keys: ['Tab', 'Shift+Tab'], group: 'Edit item', label: 'Title → description → end date (Period / Age) → tags; Shift+Tab goes back', context: 'edit', inInputs: true },
    { id: 'help',      keys: 'F1', group: 'Edit item', label: 'Help',      context: 'edit' },
    { id: 'shortcuts', keys: 'F2', group: 'Edit item', label: 'This list', context: 'edit' },

    // ── Calendar windows ─────────────────────────────────────────────────────
    { id: 'help',      keys: 'F1', group: 'Calendar windows', label: 'Help',      context: 'calendar' },
    { id: 'shortcuts', keys: 'F2', group: 'Calendar windows', label: 'This list', context: 'calendar' },
]

export const shortcutsFor = (context: ShortcutContext) => SHORTCUTS.filter(s => s.context === context)

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
/** `Ctrl+Shift+A` → `['Ctrl', 'Shift', 'A']`, arrows and Esc prettified — one `<kbd>` per part. */
export function chordParts(chord: string): string[] {
    if (chord === '+') return ['+']
    const parts = chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+')
    return parts.map(p => KEY_LABELS[p] ?? p)
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

// Modals switch the window's shortcuts off (except Esc) while they are open.
let modalDepth = 0
export const isModalOpen = () => modalDepth > 0
export function useModalGuard() {
    onMounted(() => { modalDepth++ })
    onBeforeUnmount(() => { modalDepth-- })
}

export type ShortcutHandler = (e: KeyboardEvent) => void | false

/**
 * One window-level keydown listener for a context. A handler returning `false` means "not mine",
 * the key then keeps its default behaviour.
 */
export function useShortcuts(context: ShortcutContext, handlers: Record<string, ShortcutHandler>) {
    const table = new Map<string, Shortcut>()
    for (const s of shortcutsFor(context))
        for (const k of Array.isArray(s.keys) ? s.keys : [s.keys]) table.set(k, s)

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
        const sc = table.get(chord)
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

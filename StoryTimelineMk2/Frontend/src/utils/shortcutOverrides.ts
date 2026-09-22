// Loading and saving the user's key remaps. Separate from `shortcuts.ts` so the registry itself
// never has to know about the bridge — it only resolves whatever table it is handed.
//
// Stored app-wide (timeline 0) as one JSON blob: `{ "timeline:addItem": "Ctrl+I", … }`.
import { BackendAPI } from '@/bridge/api'
import { setShortcutOverrides, shortcutOverrides, remapKey, type Shortcut } from './shortcuts'

const KEY = 'shortcut_overrides'

/** Every window calls this once at startup. A bad or missing value just means "no remaps". */
export async function loadShortcutOverrides(): Promise<void> {
    try {
        const raw = (await BackendAPI.GetMiscSetting(KEY, 0))?.value
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setShortcutOverrides(parsed as Record<string, string>)
    } catch (e) {
        // Not fatal: the defaults still work, and the next save replaces the unreadable value.
        console.error('[shortcuts] saved remaps could not be read', e)
    }
}

async function save(map: Record<string, string>) {
    setShortcutOverrides(map)
    await BackendAPI.SetMiscSetting(KEY, JSON.stringify(map), 0)
}

/** `chord` null puts the shortcut back to its registry default. */
export async function setShortcutKey(s: Shortcut, chord: string | null): Promise<void> {
    const map = { ...shortcutOverrides.value }
    if (chord) map[remapKey(s)] = chord
    else delete map[remapKey(s)]
    await save(map)
}

export async function resetShortcutKeys(): Promise<void> {
    await save({})
}

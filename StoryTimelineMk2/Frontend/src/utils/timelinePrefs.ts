import { BackendAPI } from '@/bridge/api'
import type { LodLevel } from '@/types/models'

// Per-timeline preferences that live in misc_settings (key + timeline_id) rather than in a
// dedicated column: the read side of each is defensive because the value is free text.

async function loadPref(key: string, timelineId: number): Promise<string | null> {
  // A preference that cannot be read falls back to its default rather than stopping the caller:
  // losing a color swatch is not worth an error dialog over the window it was opening.
  try {
    const res = await BackendAPI.GetMiscSetting(key, timelineId)
    return res?.value ?? null
  } catch (e) {
    console.error(`[timelinePrefs] loading ${key} failed:`, e)
    return null
  }
}

function savePref(key: string, timelineId: number, value: string) {
  return BackendAPI.SetMiscSetting(key, value, timelineId)
}

// ---- Color swatches: the 12 quick-pick colors of the edit item window ----

export const SWATCHES_KEY = 'color_swatches'

export const DEFAULT_SWATCHES: readonly string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b',
]

const HEX = /^#[0-9a-f]{6}$/i

/** Falls back to the defaults when unset or invalid. */
export async function loadSwatches(timelineId: number): Promise<string[]> {
  const raw = await loadPref(SWATCHES_KEY, timelineId)
  if (!raw) return [...DEFAULT_SWATCHES]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === DEFAULT_SWATCHES.length && parsed.every(c => typeof c === 'string' && HEX.test(c))) return parsed
    console.error('[timelinePrefs] ignoring malformed swatches:', raw)
  } catch (e) {
    console.error('[timelinePrefs] ignoring unparsable swatches:', raw, e)
  }
  return [...DEFAULT_SWATCHES]
}

export function saveSwatches(timelineId: number, swatches: string[]) {
  return savePref(SWATCHES_KEY, timelineId, JSON.stringify(swatches))
}

// ---- Default LOD visibility mask for new items (bit n = visible at LOD index n) ----

export const DEFAULT_LOD_MASK_KEY = 'default_lod_mask'
export const ALL_LODS_MASK = 255

/** Falls back to "visible everywhere" when unset or invalid. The backend applies the same value to new-item stubs. */
export async function loadDefaultLodMask(timelineId: number): Promise<number> {
  const raw = await loadPref(DEFAULT_LOD_MASK_KEY, timelineId)
  if (raw == null) return ALL_LODS_MASK
  const n = Number(raw)
  if (Number.isInteger(n) && n >= 0) return n
  console.error('[timelinePrefs] ignoring malformed default LOD mask:', raw)
  return ALL_LODS_MASK
}

export function saveDefaultLodMask(timelineId: number, mask: number) {
  return savePref(DEFAULT_LOD_MASK_KEY, timelineId, String(mask))
}

// ---- Whether a character attached to an item starts as present or only mentioned (BL-16) ----

export const DEFAULT_MENTIONED_ONLY_KEY = 'appearance_default_mentioned_only'

/**
 * Stored in the column's own terms (`mentioned_only`) so nothing is inverted on the way through, and
 * anything other than a stored `'1'` means present — which is the default, and what a character
 * named in an event usually was. Timelines where most mentions are hearsay can flip it.
 */
export async function loadDefaultMentionedOnly(timelineId: number): Promise<boolean> {
  return (await loadPref(DEFAULT_MENTIONED_ONLY_KEY, timelineId)) === '1'
}

export function saveDefaultMentionedOnly(timelineId: number, mentionedOnly: boolean) {
  return savePref(DEFAULT_MENTIONED_ONLY_KEY, timelineId, mentionedOnly ? '1' : '0')
}

// ---- Whether the map descent dissolves into the child map or cuts to it (BL-16) ----

export const MAP_DESCENT_FADE_KEY = 'map_descent_fade'

/**
 * On unless it was deliberately turned off: the dissolve is the intended effect, but it is a matter of
 * taste, and off means the same flight into the child's region with a cut where the fade was.
 */
export async function loadMapDescentFade(timelineId: number): Promise<boolean> {
  return (await loadPref(MAP_DESCENT_FADE_KEY, timelineId)) !== '0'
}

export function saveMapDescentFade(timelineId: number, fade: boolean) {
  return savePref(MAP_DESCENT_FADE_KEY, timelineId, fade ? '1' : '0')
}

/** Human-readable LOD level name: formatKey is an upper-case token like "MILLENNIA". */
export function lodLevelLabel(lod: LodLevel): string {
  const k = lod.formatKey.toLowerCase()
  return k.charAt(0).toUpperCase() + k.slice(1)
}

/** "All levels", "No levels" or the visible level names joined with commas. */
export function lodMaskSummary(mask: number, profile: LodLevel[]): string {
  const visible = profile.filter(l => mask & (1 << l.index))
  if (!profile.length) return 'No calendar'
  if (visible.length === profile.length) return 'All levels'
  if (!visible.length) return 'No levels'
  return visible.map(lodLevelLabel).join(', ')
}

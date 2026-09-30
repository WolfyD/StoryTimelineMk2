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

export const HEX = /^#[0-9a-f]{6}$/i

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

// ---- How far the view flies when a journey crosses several maps (BL-16) ----

export const MAP_FLIGHT_KEY = 'map_flight'

/**
 * `full`: every level between here and there is flown. `ends`: out of the map the reader is standing
 * on and into the one they land on, with the levels between jumped. `cut`: the destination arrives.
 */
export type MapFlightMode = 'full' | 'ends' | 'cut'

/**
 * Ends only unless asked otherwise. The two flights worth watching are the one that says where the
 * reader left and the one that says where they arrived; a nine-level journey out to the world map
 * spent the other seven saying only how far it was, which is what made it disorienting.
 */
export async function loadMapFlight(timelineId: number): Promise<MapFlightMode> {
  const raw = await loadPref(MAP_FLIGHT_KEY, timelineId)
  return raw === 'full' || raw === 'cut' ? raw : 'ends'
}

export function saveMapFlight(timelineId: number, mode: MapFlightMode) {
  return savePref(MAP_FLIGHT_KEY, timelineId, mode)
}

// ---- How a character crosses the map while the year runs (BL-16) ----

export const MAP_MOVEMENT_STYLE_KEY = 'map_movement_style'

/**
 * `glide`: the character walks between the places they were, leaving nothing behind. `trail`: a dashed
 * line draws the way. `flow`: a bowed ribbon that thins out behind them, with a ring where they stayed
 * put. `comet`: the same ribbon with the strength falling away fast, so only the last stretch is bright.
 */
export type MapMovementStyle = 'glide' | 'trail' | 'flow' | 'comet'

const MOVEMENT_STYLES: readonly string[] = ['glide', 'trail', 'flow', 'comet']

/** Gliding unless the writer asked for something else, since a moving dot needs no explaining. */
export async function loadMapMovementStyle(timelineId: number): Promise<MapMovementStyle> {
  const raw = await loadPref(MAP_MOVEMENT_STYLE_KEY, timelineId)
  return MOVEMENT_STYLES.includes(raw as string) ? (raw as MapMovementStyle) : 'glide'
}

export function saveMapMovementStyle(timelineId: number, style: MapMovementStyle) {
  return savePref(MAP_MOVEMENT_STYLE_KEY, timelineId, style)
}

// ---- How far behind a character the dashed trail reaches (BL-16) ----

export const MAP_TRAIL_LENGTH_KEY = 'map_trail_length'

/**
 * A share of the whole story rather than a count of years: the trail should look the same on a tale
 * told over three days and one told over three millennia, and a fixed number of years would be the
 * whole of the first and invisible on the second.
 */
export const DEFAULT_TRAIL_PERCENT = 15

/** 0 leaves the walker no trail at all; 100 draws every step they ever took. */
export async function loadMapTrailLength(timelineId: number): Promise<number> {
  const raw = await loadPref(MAP_TRAIL_LENGTH_KEY, timelineId)
  if (raw == null) return DEFAULT_TRAIL_PERCENT
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  console.error('[timelinePrefs] ignoring malformed map trail length:', raw)
  return DEFAULT_TRAIL_PERCENT
}

/** Clamped on the way in, so a typed 500 is a full trail rather than a stored lie. */
export function saveMapTrailLength(timelineId: number, percent: number) {
  const n = Number.isFinite(percent) ? Math.round(Math.min(100, Math.max(0, percent))) : DEFAULT_TRAIL_PERCENT
  return savePref(MAP_TRAIL_LENGTH_KEY, timelineId, String(n))
}

// ---- How many of a date range's roads are drawn in full (BL-16) ----

export const MAP_ROADS_SHOWN_KEY = 'map_roads_shown'

/** 0 is every road; otherwise only the busiest that many are drawn in full and the rest faint. */
export const ROADS_SHOWN: readonly number[] = [0, 10, 25, 50]

/** Every road unless asked otherwise, so nobody's range changes under them. */
export async function loadMapRoadsShown(timelineId: number): Promise<number> {
  const n = Number(await loadPref(MAP_ROADS_SHOWN_KEY, timelineId))
  return ROADS_SHOWN.includes(n) ? n : 0
}

export function saveMapRoadsShown(timelineId: number, count: number) {
  return savePref(MAP_ROADS_SHOWN_KEY, timelineId, String(count))
}

// ---- What a date range marks at each place (BL-16) ----

export const MAP_PLACES_SHOW_KEY = 'map_places_show'

/** `time`: a disc as big as the time spent there. `flow`: as big as the traffic, tinted by which way it went. */
export type MapPlacesShow = 'time' | 'flow'

export async function loadMapPlacesShow(timelineId: number): Promise<MapPlacesShow> {
  return (await loadPref(MAP_PLACES_SHOW_KEY, timelineId)) === 'flow' ? 'flow' : 'time'
}

export function saveMapPlacesShow(timelineId: number, show: MapPlacesShow) {
  return savePref(MAP_PLACES_SHOW_KEY, timelineId, show)
}

// ---- What the cast window's list was left showing: its search and its folded groups (BL-16) ----

export const MAP_CAST_VIEW_KEY = 'map_cast_view'

export interface MapCastView { query: string; closed: string[] }

export async function loadMapCastView(timelineId: number): Promise<MapCastView> {
  const raw = await loadPref(MAP_CAST_VIEW_KEY, timelineId)
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (typeof v?.query === 'string' && Array.isArray(v.closed) && v.closed.every((k: unknown) => typeof k === 'string')) return v
      console.error('[timelinePrefs] ignoring malformed cast window view:', raw)
    } catch (e) {
      console.error('[timelinePrefs] ignoring unparsable cast window view:', raw, e)
    }
  }
  return { query: '', closed: [] }
}

export function saveMapCastView(timelineId: number, view: MapCastView) {
  return savePref(MAP_CAST_VIEW_KEY, timelineId, JSON.stringify(view))
}

// ---- Colours set by hand for a group of people: a family, a faction, those on the road (BL-16) ----

export const GROUP_COLOURS_KEY = 'group_colours'

/**
 * By the group's name alone, as `categoryColor` does, so a faction is one colour in every window and
 * under every grouping. A name not in here keeps the hue its name has.
 */
export async function loadGroupColours(timelineId: number): Promise<Record<string, string>> {
  const raw = await loadPref(GROUP_COLOURS_KEY, timelineId)
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(c => typeof c === 'string' && HEX.test(c))) return v
      console.error('[timelinePrefs] ignoring malformed group colours:', raw)
    } catch (e) {
      console.error('[timelinePrefs] ignoring unparsable group colours:', raw, e)
    }
  }
  return {}
}

export function saveGroupColours(timelineId: number, colours: Record<string, string>) {
  return savePref(GROUP_COLOURS_KEY, timelineId, JSON.stringify(colours))
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

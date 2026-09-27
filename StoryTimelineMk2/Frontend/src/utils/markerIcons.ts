/**
 * BL-16: the icons a map marker can hold. The picker shows these components as themselves; the canvas
 * cannot, so `iconPath` renders one once and keeps its outline as SVG path data for `Konva.Path`.
 *
 * ponytail: a hand-picked 36, imported by name. Phosphor has nine thousand icons and a name→component
 * lookup over all of them would pull every one into the map bundle. Add to the list when a writer asks
 * for something that is not here; swap to a lazy dynamic import if it ever grows past a screenful.
 */
import { h, render, type Component } from 'vue'
import {
	PhAnchor, PhBarn, PhBookOpen, PhBridge, PhBuildings, PhCactus, PhCampfire, PhCastleTurret,
	PhChurch, PhCity, PhCoins, PhCrown, PhEye, PhFactory, PhFootprints, PhHeart, PhHorse,
	PhHouseLine, PhIsland, PhKey, PhLighthouse, PhMountains, PhPath, PhSailboat, PhScroll, PhShield,
	PhSkull, PhStar, PhStorefront, PhSword, PhTent, PhTree, PhTreeEvergreen, PhWarning, PhWaves,
	PhWindmill,
} from '@phosphor-icons/vue'

/** Grouped only so the picker can put a heading over each row; the stored value is the key. */
export const MARKER_ICON_GROUPS: { label: string; icons: Record<string, Component> }[] = [
	{
		label: 'Built',
		icons: {
			PhCastleTurret, PhHouseLine, PhBuildings, PhCity, PhTent, PhBarn, PhChurch, PhStorefront,
			PhFactory, PhLighthouse, PhWindmill, PhBridge,
		},
	},
	{
		label: 'Land',
		icons: {
			PhMountains, PhTree, PhTreeEvergreen, PhCactus, PhIsland, PhWaves, PhPath, PhFootprints,
		},
	},
	{
		label: 'Story',
		icons: {
			PhCrown, PhSword, PhShield, PhSkull, PhKey, PhScroll, PhBookOpen, PhCoins, PhAnchor,
			PhSailboat, PhCampfire, PhStar, PhEye, PhHeart, PhWarning, PhHorse,
		},
	},
]

/** Every icon by the name that goes in the column, for the picker and for `iconPath`. */
export const MARKER_ICONS: Record<string, Component> =
	Object.assign({}, ...MARKER_ICON_GROUPS.map(g => g.icons))

/** Rendering a component costs a DOM round trip; the outline never changes, so it is kept. */
const outlines = new Map<string, string | null>()

/**
 * One icon as SVG path data in Phosphor's own 256-unit box, or null if the name is not one of ours —
 * a marker whose icon was renamed out of the set draws without it rather than not at all.
 *
 * The filled weight, because a glyph inside a 6-pixel well has to read as a silhouette. Several paths
 * are joined into one: they are wound for the non-zero fill rule the canvas uses anyway, so a hole
 * stays a hole.
 */
export function iconPath(name: string | null | undefined): string | null {
	if (!name) return null
	const cached = outlines.get(name)
	if (cached !== undefined) return cached

	const icon = MARKER_ICONS[name]
	let data: string | null = null
	if (icon) {
		const box = document.createElement('div')
		render(h(icon, { weight: 'fill' }), box)
		const paths = [...box.querySelectorAll('path')].map(p => p.getAttribute('d')).filter(Boolean)
		data = paths.length ? paths.join(' ') : null
		render(null, box)
	}
	outlines.set(name, data)
	return data
}

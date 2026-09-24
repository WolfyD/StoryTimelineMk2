import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HighlightedTextarea from '@/components/HighlightedTextarea.vue'

function mountWith(color: string | null) {
	return mount(HighlightedTextarea, {
		props: {
			modelValue: 'Risha Pathmaker is born near Maegon.',
			entities: [{ id: 'c1', names: ['Risha Pathmaker'], color }],
		},
	})
}

/** The lightness out of an `hsl(H S% L% / A)` string. */
function lightness(style: string) {
	return Number(/hsl\(\s*[\d.]+\s+[\d.]+%\s+([\d.]+)%/.exec(style)?.[1])
}

describe('HighlightedTextarea', () => {
	it('wraps a matched name in a tinted span and leaves the rest plain', () => {
		const spans = mountWith('#ff0000').findAll('.hl-mirror span')
		expect(spans[0]!.text()).toBe('Risha Pathmaker')
		expect(spans[0]!.attributes('style')).toContain('hsl(')
		expect(spans[1]!.attributes('style')).toBeUndefined()
	})

	// The bug: a character's own color can be near-black, which washed the field darker than its
	// background and drew an underline nobody could see.
	it('lifts a near-black color to a visible lightness, keeping its hue', () => {
		const style = mountWith('#00011f').findAll('.hl-mirror span')[0]!.attributes('style')!
		expect(lightness(style)).toBeGreaterThanOrEqual(60)
		expect(style).toMatch(/hsl\(\s*23[0-9]\s/)   // still blue
	})

	// Asked for padding around the highlight: an inline span can only get it from shadow spread.
	it('pads the highlight with a ring rather than layout-shifting padding', () => {
		const style = mountWith('#ff0000').findAll('.hl-mirror span')[0]!.attributes('style')!
		expect(style).toMatch(/box-shadow:[^;]*0 0 0 2px/)
		expect(style).toMatch(/box-shadow:[^;]*0 0 0 3px/)
		expect(style).not.toMatch(/padding/)
	})

	it('falls back when there is no usable color', () => {
		for (const color of [null, 'rebeccapurple']) {
			const style = mountWith(color).findAll('.hl-mirror span')[0]!.attributes('style')!
			expect(lightness(style)).toBeGreaterThanOrEqual(60)
		}
	})

	it('reports the entities it found when the field loses focus', async () => {
		const wrapper = mountWith('#ff0000')
		await wrapper.find('textarea').trigger('blur')
		expect(wrapper.emitted('matched')).toEqual([[['c1']]])
	})
})

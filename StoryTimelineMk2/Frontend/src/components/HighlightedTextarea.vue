<script setup lang="ts">
/**
 * A plain textarea with names highlighted behind it (BL-15 phase 2). The text stays plain text —
 * the highlight is a mirror <div> under a transparent-background textarea.
 *
 * ponytail: the mirror only lines up while its metrics match the textarea's exactly — font,
 * padding, border, line-height and wrapping are duplicated below for that reason. If it ever
 * drifts, the upgrade is a contenteditable, which costs undo, IME and paste handling.
 */
import { computed, ref } from 'vue'
import { findEntities, type EntityMatch, type NamedEntity } from '@/utils/entityMatcher'

const props = defineProps<{
	modelValue: string | null
	entities: NamedEntity[]
	/**
	 * Highlights worked out by the caller, in its own colours — BL-16's places, where a bare name match
	 * is not enough to light up ("market" is a word) and only the scored occurrences come through.
	 * They are drawn, not reported: `matched` stays the entity list's own.
	 */
	extraMatches?: (EntityMatch & { color?: string | null })[]
	rows?: number
	placeholder?: string
}>()

const emit = defineEmits<{
	'update:modelValue': [string]
	/** On blur: the distinct entity ids the text mentions. */
	matched: [string[]]
}>()

const el     = ref<HTMLTextAreaElement | null>(null)
const mirror = ref<HTMLDivElement | null>(null)

const matches = computed(() => findEntities(props.modelValue ?? '', props.entities))

/** Both kinds in reading order, each already carrying its colour. An extra that lands on an
 *  entity's words gives way to it. */
const painted = computed(() => [
	...matches.value.map(m => ({
		...m, color: props.entities.find(e => e.id === m.id)?.color ?? null, extra: false,
	})),
	...(props.extraMatches ?? [])
		.filter(x => !matches.value.some(m => x.start < m.end && m.start < x.end))
		.map(x => ({ ...x, color: x.color ?? null, extra: true })),
].sort((a, b) => a.start - b.start))

/** The text cut into plain and matched runs, so only the matches get wrapped. */
const runs = computed(() => {
	const text = props.modelValue ?? ''
	const out: { text: string; color?: string | null; extra?: boolean }[] = []
	let at = 0
	for (const m of painted.value) {
		// Two matches over the same words — three inns all answering to "the inn in the Country" — are
		// still one stretch of text. Painting the second would emit its words twice and push everything
		// after it out of line with the textarea above.
		if (m.start < at) continue
		if (m.start > at) out.push({ text: text.slice(at, m.start) })
		out.push({ text: m.text, color: m.color, extra: m.extra })
		at = m.end
	}
	// The trailing newline keeps the mirror as tall as the textarea on a text that ends in one.
	out.push({ text: text.slice(at) + '\n' })
	return out
})

/**
 * A hex color as usable HSL parts. Anything else falls back, rather than producing `undefined40`.
 *
 * The color is lifted to a lightness floor: a character can be near-black (#00011f), and against the
 * dark field that wash comes out darker than the background with an underline nobody can see.
 * Clamping lightness keeps the hue that tells characters apart and still shows up.
 */
function hslOf(color?: string | null) {
	const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#6366f1'
	const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const chroma = max - min
	const light = (max + min) / 2
	const hue = chroma === 0 ? 0
		: max === r ? ((g - b) / chroma + 6) % 6
		: max === g ? (b - r) / chroma + 2
		:             (r - g) / chroma + 4
	// chroma === 0 also covers light 0 and 1, where the saturation divisor would be zero.
	const sat = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1))
	return `${Math.round(hue * 60)} ${Math.round(sat * 100)}% ${Math.round(Math.max(light, 0.6) * 100)}%`
}

/**
 * How a match is painted. A character is a wash in three rings, back to front: the wash spread 2px
 * past the glyphs for breathing room, a 1px border outside that, and the underline. Spread costs no
 * layout, which is the whole point — horizontal padding on an inline span would shift the text off
 * the textarea above it.
 *
 * A place gets the underline alone and a dot out in the margin (drawn by `.is-place::before`, which
 * is absolutely positioned for the same reason), so the two never read as the same kind of thing.
 */
function tint(color: string | null | undefined, extra = false) {
	const hsl = hslOf(color)
	if (extra) return { '--dot': `hsl(${hsl})`, boxShadow: `inset 0 -2px 0 hsl(${hsl})` }
	return {
		background: `hsl(${hsl} / 0.22)`,
		boxShadow: `0 0 0 2px hsl(${hsl} / 0.22), 0 0 0 3px hsl(${hsl} / 0.5), inset 0 -2px 0 hsl(${hsl})`,
	}
}

function syncScroll() {
	if (!mirror.value || !el.value) return
	mirror.value.scrollTop  = el.value.scrollTop
	mirror.value.scrollLeft = el.value.scrollLeft
}

defineExpose({ el })
</script>

<template>
	<div class="hl-wrap">
		<div ref="mirror" class="hl-mirror" aria-hidden="true"><span
			v-for="(run, i) in runs"
			:key="i"
			:class="{ 'is-place': run.extra }"
			:style="run.color !== undefined ? tint(run.color, run.extra) : undefined"
		>{{ run.text }}</span></div>
		<textarea
			ref="el"
			class="hl-input"
			:rows="rows ?? 5"
			:value="modelValue ?? ''"
			:placeholder="placeholder"
			@input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
			@scroll="syncScroll"
			@blur="emit('matched', [...new Set(matches.map(m => m.id))])"
		/>
	</div>
</template>

<style scoped lang="scss">
.hl-wrap {
	position: relative;
	width: 100%;
}

// Every metric here has a twin in .hl-input — they have to wrap identically.
.hl-mirror,
.hl-input {
	padding: 5px 8px;
	border: 1px solid var(--app-border, #334155);
	border-radius: 4px;
	font-family: inherit;
	font-size: 0.9rem;
	line-height: 1.45;
	letter-spacing: normal;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	box-sizing: border-box;
}

.hl-mirror {
	position: absolute;
	inset: 0;
	overflow: hidden;
	// The textarea above is transparent, so this is what the field's background actually is.
	background: var(--app-bg, #0f172a);
	border-color: transparent;
	color: transparent;
	pointer-events: none;
	user-select: none;

	// Vertical padding grows the highlight without touching the line box; horizontal padding would
	// move the text, so the box-shadow spread in tint() does that side instead.
	span { border-radius: 3px; padding: 2px 0; }

	// The place dot, at the near end of the underline. Absolutely positioned — anything in flow would
	// push the glyphs off the textarea above. `position: relative` on an inline box is the anchor and
	// changes no metric.
	//
	// It sits *on the underline* rather than between the words because the space before a word is
	// about 4px wide and the mirror may not take any of it: a dot big enough to read would always be
	// touching the letter before it. Dropped to the baseline it has the line's own leading to breathe
	// in, and only a descender right before a place can come near it — which the ring then separates.
	span.is-place {
		position: relative;

		&::before {
			content: '';
			position: absolute;
			left: -8px;
			bottom: -2px;
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--dot, currentColor);
			box-shadow: 0 0 0 2px var(--app-bg, #0f172a);
		}
	}
}

.hl-input {
	position: relative;
	display: block;
	width: 100%;
	resize: vertical;
	background: transparent;
	color: var(--app-text, #e2e8f0);

	&:focus { outline: 2px solid var(--app-accent, #4a90d9); border-color: transparent; }
	&::placeholder { color: var(--app-text-dim, #64748b); }
}
</style>

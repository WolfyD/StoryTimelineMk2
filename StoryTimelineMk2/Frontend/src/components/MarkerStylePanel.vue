<script setup lang="ts">
/**
 * BL-16: what a place looks like on the map — the marker, and the name beside it. Two sections, not
 * one: the label is not part of the marker's shape and setting it was hidden under a picker for one.
 * The same panel edits a map's default look and one pin's, because they are the same object; only the
 * wording and what "unset" falls back to differ.
 *
 * There is no inherit tick beside each field. The panel works on a full style that *starts* as what
 * the pin would look like anyway, and the modal saves `diffMarker` of it — so a field nobody touched
 * is a field that still matches and is never written, and the map's default keeps moving it.
 * ponytail: setting a field to the value the map happens to have is therefore not recorded as a
 * deliberate choice. Give each field its own tick the day someone is bitten by that.
 */
import { computed, onMounted, ref } from 'vue'
import { BackendAPI } from '@/bridge/api'
import FontPicker from './FontPicker.vue'
import { PhProhibit } from '@phosphor-icons/vue'
import { MARKER_SHAPE_DEFS, SHAPE_LABELS, labelDesigned } from '@/utils/mapMarker'
import { MARKER_ICON_GROUPS } from '@/utils/markerIcons'
import {
    ICON_SHAPES, LABEL_SIDES, MARKER_DEFAULTS, MARKER_SHAPES, diffMarker,
    type LabelSide, type MarkerShape, type MarkerStyle,
} from '@/utils/markerStyle'

const props = defineProps<{
    /** What would apply if the draft said nothing — the map's look for a pin, the built-in for a map. */
    inherited: MarkerStyle
    scope: 'map' | 'pin'
    /** The place's own colour, which is what "no colour of its own" means. Absent on a map. */
    ownColour?: string | null
    /** The name this label will hold, so the font list can show it rather than font names. */
    sampleName?: string
}>()

/** The caller's reactive draft, edited in place: the modal saves the difference from `inherited`. */
const draft = defineModel<MarkerStyle>({ required: true })

const SIDE_LABELS: Record<LabelSide, string> = {
    right: 'Right', left: 'Left', above: 'Above', below: 'Below', none: 'Hidden',
}

const systemFonts = ref<string[]>([])
onMounted(async () => {
    const fonts = await BackendAPI.GetSystemFonts()
    if (fonts) systemFonts.value = fonts
})

const holdsIcon = computed(() => ICON_SHAPES.has(draft.value.shape))
const sample = computed(() => props.sampleName?.trim() || 'Your place name')

// Every label field is named label*, so the two sections can report and undo their own changes
// without keeping a list of which field belongs where.
const isLabel = (key: string) => key.startsWith('label')
const changed = computed(() => Object.keys(diffMarker(draft.value, props.inherited)))
const markerDiffers = computed(() => changed.value.some(k => !isLabel(k)))
const labelDiffers = computed(() => changed.value.some(isLabel))

/**
 * A label standing on a line drawn on the map takes its size and its angle from that line, so the two
 * fields that used to set them would be lying. They come back the moment the line is given up.
 */
const designed = computed(() => labelDesigned(draft.value))
const undesign = () => Object.assign(draft.value, {
    labelDx: props.inherited.labelDx,
    labelDy: props.inherited.labelDy,
    labelW: props.inherited.labelW,
})

const fallbackColour = () => props.ownColour || '#f59e0b'

/** Null fill means "whatever colour the place itself is", which is the tick beside the swatch. */
const usesOwnColour = computed({
    get: () => draft.value.fill === null,
    set: (on: boolean) => { draft.value.fill = on ? null : fallbackColour() },
})
const fillColour = computed({
    get: () => draft.value.fill ?? fallbackColour(),
    set: (v: string) => { draft.value.fill = v },
})
const strokeColour = computed({
    get: () => draft.value.stroke ?? '#0f172a',
    set: (v: string) => { draft.value.stroke = v },
})
const labelColour = computed({
    get: () => draft.value.labelColor ?? '#e2e8f0',
    set: (v: string) => { draft.value.labelColor = v },
})
const hasLabelOutline = computed({
    get: () => draft.value.labelOutline !== null,
    set: (on: boolean) => { draft.value.labelOutline = on ? '#0f172a' : null },
})
const labelOutlineColour = computed({
    get: () => draft.value.labelOutline ?? '#0f172a',
    set: (v: string) => { draft.value.labelOutline = v },
})

/** The shape previews are the shapes themselves — the same table the canvas draws from. */
function previewBox(shape: MarkerShape) {
    const b = MARKER_SHAPE_DEFS[shape].box
    return `${b.x - 1.5} ${b.y - 1.5} ${b.w + 3} ${b.h + 3}`
}

/** Put one section's fields back to what they inherit, leaving the other section's alone. */
function reset(labels: boolean) {
    for (const key of Object.keys(MARKER_DEFAULTS) as (keyof MarkerStyle)[]) {
        if (isLabel(key) === labels) Object.assign(draft.value, { [key]: props.inherited[key] })
    }
}

const backTo = computed(() => (props.scope === 'pin' ? "Back to this map's look" : 'Back to the built-in look'))
</script>

<template>
    <details class="marker">
        <summary>
            Marker
            <span class="sum">{{ SHAPE_LABELS[draft.shape] }}, {{ draft.size }}px</span>
            <span v-if="markerDiffers" class="badge">changed</span>
        </summary>

        <div class="rows">
            <div class="field">
                <label>Shape</label>
                <div class="pills">
                    <button
                        v-for="s in MARKER_SHAPES" :key="s" type="button"
                        class="pill shape" :class="{ on: draft.shape === s }"
                        :title="SHAPE_LABELS[s]" @click="draft.shape = s"
                    >
                        <svg :viewBox="previewBox(s)" width="18" height="20" preserveAspectRatio="xMidYMid meet">
                            <circle v-if="s === 'dot'" r="12" fill="currentColor" />
                            <circle v-else-if="s === 'ring'" r="10.5" fill="none" stroke="currentColor" stroke-width="3" />
                            <path v-else :d="MARKER_SHAPE_DEFS[s].path!" fill="currentColor" />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="field-row">
                <div class="field">
                    <label>Size</label>
                    <input class="s-input num" type="number" min="4" max="96" v-model.number="draft.size" />
                </div>
                <div class="field">
                    <label>Outline</label>
                    <div class="inline">
                        <input class="s-color" type="color" v-model="strokeColour" />
                        <input
                            class="s-input num narrow" type="number" min="0" max="12" step="0.5"
                            v-model.number="draft.strokeWidth" title="0 turns the outline off"
                        />
                    </div>
                </div>
                <div class="field field--grow">
                    <label>Colour</label>
                    <div class="inline">
                        <input class="s-color" type="color" v-model="fillColour" :disabled="usesOwnColour" />
                        <label class="check">
                            <input type="checkbox" v-model="usesOwnColour" />
                            {{ scope === 'map' ? "each place's own" : "the place's own" }}
                        </label>
                    </div>
                </div>
            </div>

            <div v-if="holdsIcon" class="field">
                <label>Icon</label>
                <div class="icons">
                    <button
                        type="button" class="pill icon" :class="{ on: !draft.icon }"
                        title="No icon" @click="draft.icon = null"
                    >
                        <PhProhibit :size="15" />
                    </button>
                    <template v-for="group in MARKER_ICON_GROUPS" :key="group.label">
                        <button
                            v-for="(comp, name) in group.icons" :key="name" type="button"
                            class="pill icon" :class="{ on: draft.icon === name }"
                            :title="group.label" @click="draft.icon = name"
                        >
                            <component :is="comp" :size="15" weight="fill" />
                        </button>
                    </template>
                </div>
            </div>

            <button v-if="markerDiffers" type="button" class="act" @click="reset(false)">{{ backTo }}</button>
        </div>
    </details>

    <details class="marker">
        <summary>
            Label
            <span class="sum">
                {{ designed ? 'placed on the map'
                    : draft.labelSide === 'none' ? 'hidden'
                    : `${SIDE_LABELS[draft.labelSide].toLowerCase()}, ${draft.labelSize}px` }}
            </span>
            <span v-if="labelDiffers" class="badge">changed</span>
        </summary>

        <div class="rows">
            <div v-if="designed" class="field">
                <label>Where it sits</label>
                <p class="note">
                    On the map, on a line you drew — its size and angle come from that line. Use
                    “Set label design” above to redraw it, or put it back beside the marker:
                </p>
                <button type="button" class="act" @click="undesign">Hang it off the marker again</button>
            </div>
            <div v-else class="field">
                <label>Where it sits</label>
                <div class="pills">
                    <button
                        v-for="s in LABEL_SIDES" :key="s" type="button"
                        class="pill wide" :class="{ on: draft.labelSide === s }"
                        @click="draft.labelSide = s"
                    >
                        {{ SIDE_LABELS[s] }}
                    </button>
                </div>
            </div>

            <template v-if="draft.labelSide !== 'none' || designed">
                <div class="field-row">
                    <template v-if="!designed">
                        <div class="field">
                            <label>Angle</label>
                            <input class="s-input num" type="number" min="-180" max="180" v-model.number="draft.labelAngle" />
                        </div>
                        <div class="field">
                            <label>Text size</label>
                            <input class="s-input num" type="number" min="6" max="64" v-model.number="draft.labelSize" />
                        </div>
                    </template>
                    <div class="field">
                        <label>Colour</label>
                        <input class="s-color" type="color" v-model="labelColour" />
                    </div>
                    <div class="field">
                        <label>Text outline</label>
                        <div class="inline">
                            <input type="checkbox" v-model="hasLabelOutline" title="An edge around the letters" />
                            <input class="s-color" type="color" v-model="labelOutlineColour" :disabled="!hasLabelOutline" />
                            <!-- 0 is the sane default: an edge a seventh of the text, at any size. -->
                            <input
                                class="s-input num thin" type="number" min="0" max="12" step="0.5"
                                v-model.number="draft.labelOutlineWidth" :disabled="!hasLabelOutline"
                                title="How thick, in pixels — 0 follows the text size"
                            />
                        </div>
                    </div>
                    <div class="field field--grow">
                        <label>&nbsp;</label>
                        <label class="check">
                            <input type="checkbox" v-model="draft.labelPlate" /> card behind it
                        </label>
                    </div>
                </div>
                <div class="field">
                    <label>Font</label>
                    <FontPicker v-model="draft.labelFont" :fonts="systemFonts" :sample="sample" />
                </div>
            </template>

            <button v-if="labelDiffers" type="button" class="act" @click="reset(true)">{{ backTo }}</button>
        </div>
    </details>
</template>

<style scoped lang="scss">
.marker {
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: 5px;
    padding: 6px 10px;

    summary {
        cursor: pointer;
        font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--app-text-dim, #4a6080);
        display: flex; align-items: center; gap: 8px;

        &:hover { color: var(--app-text-muted, #94a3b8); }
    }

    .sum { text-transform: none; letter-spacing: 0; font-weight: 400; }

    .badge {
        text-transform: none; letter-spacing: 0; font-weight: 500;
        padding: 0 5px; border-radius: 3px;
        background: var(--app-accent, #6366f1); color: #fff;
    }
}

.rows { display: flex; flex-direction: column; gap: 10px; padding: 10px 0 4px; }

.field {
    display: flex; flex-direction: column; gap: 4px;
    label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--app-text-dim, #4a6080); }
}

.field-row {
    display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;
    .field--grow { flex: 1; }
}

.inline { display: flex; align-items: center; gap: 6px; }

.pills { display: flex; flex-wrap: wrap; gap: 4px; }

// The icon set is a grid rather than a row: three dozen of them wrap into something scannable.
.icons {
    display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px;
    max-height: 132px; overflow-y: auto;

    &::-webkit-scrollbar { width: 4px; }
    &::-webkit-scrollbar-thumb { background: var(--app-border, #2d3a56); border-radius: 2px; }
}

.pill {
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text-muted, #94a3b8); cursor: pointer;
    transition: background 0.14s, color 0.14s, border-color 0.14s;

    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
    &.on { border-color: var(--app-accent, #6366f1); color: var(--app-accent-hover, #818cf8); background: #6366f11f; }
}

.shape { width: 30px; height: 30px; padding: 0; }
.icon { width: 100%; aspect-ratio: 1; padding: 0; }
.wide { padding: 4px 9px; font-size: 12px; }

.s-input {
    background: var(--app-surface, #0c1524); border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    color: var(--app-text, #e2e8f0); font-size: 13px; padding: 5px 8px; outline: none; box-sizing: border-box;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

.num { width: 72px; }
.num.thin { width: 54px; }
.narrow { width: 58px; }

.s-color {
    width: 36px; height: 28px; border: 1px solid var(--app-border, #2d3a56); border-radius: 4px;
    background: var(--app-surface, #0c1524); cursor: pointer; padding: 2px;
    &:disabled { opacity: 0.4; cursor: default; }
}

.check {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 400; letter-spacing: 0; text-transform: none;
    color: var(--app-text-muted, #94a3b8); cursor: pointer;
}

.note { margin: 0 0 2px; font-size: 11px; color: var(--app-text-dim, #4a6080); }

.act {
    display: inline-flex; align-self: flex-start;
    padding: 5px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid var(--app-border, #2d3a56); color: var(--app-text-muted, #94a3b8);
    &:hover { background: #ffffff0e; color: var(--app-text, #e2e8f0); }
}
</style>

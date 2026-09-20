<script setup lang="ts">
import BaseModal from './BaseModal.vue'
defineEmits<{ close: [] }>()
</script>

<template>
    <BaseModal width="min(680px, 94vw)" max-height="82vh" @close="$emit('close')">
        <template #header>
            <span class="bm-title">Help</span>
            <button class="bm-close" @click="$emit('close')"><i class="ri-close-line" /></button>
        </template>

        <div class="help-body">

            <!-- NAVIGATION -->
            <section>
                <h2>Navigation</h2>
                <table>
                    <tr><td>Pan</td><td>Drag the canvas, or scroll horizontally</td></tr>
                    <tr><td>Zoom</td><td>Scroll wheel, or the <kbd>+</kbd> / <kbd>−</kbd> buttons</td></tr>
                    <tr><td>Jump to year</td><td>Type in the year input and press <kbd>Enter</kbd></td></tr>
                    <tr><td>Change LOD</td><td>LOD buttons in the toolbar (Millennia → Days)</td></tr>
                    <tr><td>Minimise view</td><td>Arrow-in button in the activity strip</td></tr>
                </table>
            </section>

            <!-- ADDING ITEMS -->
            <section>
                <h2>Adding items</h2>
                <p>Right-click anywhere on the empty canvas to open the context menu.</p>
                <table>
                    <tr><th>Type</th><th>Description</th></tr>
                    <tr><td>Event</td><td>A single point in time — labelled box with a stem</td></tr>
                    <tr><td>Period</td><td>A span of time — horizontal bar</td></tr>
                    <tr><td>Age</td><td>A named era — wide background bar</td></tr>
                    <tr><td>Picture</td><td>An image pinned to a point on the timeline</td></tr>
                    <tr><td>Note</td><td>A text note anchored to a point in time</td></tr>
                    <tr><td>Bookmark</td><td>A quick marker pin with no label</td></tr>
                </table>
                <p class="help-tip">To add a <strong>Timeline Start / End</strong> boundary, right-click → Special.</p>
            </section>

            <!-- EDITING -->
            <section>
                <h2>Editing items</h2>
                <table>
                    <tr><td>View item</td><td>Left-click the item</td></tr>
                    <tr><td>Open edit form</td><td><kbd>Shift</kbd> + click the item, or right-click → Edit</td></tr>
                    <tr><td>Quick actions</td><td>Right-click the item (edit, delete, distance points)</td></tr>
                    <tr><td>LOD visibility</td><td>Set which zoom levels show this item in the edit form</td></tr>
                    <tr><td>Undo delete</td><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td></tr>
                </table>
            </section>

            <!-- DISTANCE -->
            <section>
                <h2>Distance measurement</h2>
                <ol>
                    <li>Right-click a point on the canvas → <strong>Distance – From</strong></li>
                    <li>Right-click another point → <strong>Distance – To</strong></li>
                    <li>Open the <strong>Distance</strong> tab in the Notes panel to see the duration</li>
                </ol>
                <p>Right-clicking a <strong>Period</strong> or <strong>Age</strong> shows <em>Calculate Distance</em> which sets both endpoints at once.</p>
                <p>Enable <strong>Show in timeline</strong> in the Distance tab to display a dotted bracket on the canvas. Click the <strong>×</strong> next to the Distance tab label to clear both points.</p>
            </section>

            <!-- FILTERS -->
            <section>
                <h2>Filters</h2>
                <p>Click the <strong>funnel</strong> icon in the activity strip to open the filter panel. Filter by type, tags, characters, stories, or colour. Filtered items can be <em>hidden</em> or <em>dimmed</em>. Save combinations as <strong>presets</strong>.</p>
            </section>

            <!-- NOTES -->
            <section>
                <h2>Notes</h2>
                <p>The <strong>Notes panel</strong> (right side) shows notes anchored to the visible time range. Write in the text box and press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save.</p>
            </section>

            <!-- CALENDAR -->
            <section>
                <h2>Calendar &amp; dates</h2>
                <p>Create custom calendars with configurable months, weeks, and days via <strong>Manage Calendars</strong> (calendar icon in the main menu). When a timeline uses a custom calendar, all dates use its month and day names.</p>
                <p>At <strong>Months LOD</strong> the canvas shows season bands; at <strong>Days LOD</strong> it shows week bands — if those divisions exist in the calendar. Toggle and colour these in <strong>Timeline Settings → Calendar Overlay</strong>.</p>
            </section>

            <!-- TIME BREAKS -->
            <section>
                <h2>Time breaks</h2>
                <p>Hide large empty gaps with a <strong>hidden range</strong> — the canvas shows a striped break strip instead. Click the strip to temporarily expand it. Colours are set in <strong>Timeline Settings → Time Breaks</strong>.</p>
            </section>

            <!-- IMPORT / EXPORT -->
            <section>
                <h2>Import / Export</h2>
                <table>
                    <tr><td>Import database</td><td>Restore a full backup <em>(.sqlite)</em> — replaces all data</td></tr>
                    <tr><td>Export database</td><td>Save a full backup of everything</td></tr>
                    <tr><td>Import timeline</td><td>Add a single timeline from a <em>.stlm</em> file</td></tr>
                </table>
                <p>Access these via the <strong>database icon</strong> in the main menu.</p>
            </section>

            <!-- KEYBOARD -->
            <section>
                <h2>Keyboard shortcuts</h2>
                <p>Press <kbd>F2</kbd> (or <strong>?</strong> → <strong>Shortcuts</strong>) for the full list: panning and stepping with the arrow keys, <kbd>N</kbd> for a new item, one key per panel, <kbd>F1</kbd> for this help.</p>
                <table>
                    <tr><td><kbd>Ctrl</kbd> + <kbd>Enter</kbd></td><td>Save note</td></tr>
                    <tr><td><kbd>Shift</kbd> + click</td><td>Open the item in the edit window</td></tr>
                    <tr><td><kbd>Esc</kbd></td><td>Leave a text field; close modals and context menus</td></tr>
                </table>
            </section>

        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.help-body {
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
}

p {
    margin: 0;
}

ol {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

table {
    width: 100%;
    border-collapse: collapse;

    th {
        text-align: left;
        font-size: 0.82em;
        font-weight: 600;
        color: var(--app-text-dim, #4a6080);
        padding: 3px 10px 3px 0;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    td {
        padding: 4px 10px 4px 0;
        vertical-align: top;

        &:first-child {
            color: var(--app-text, #e2e8f0);
            font-weight: 500;
            white-space: nowrap;
            width: 1%;
            padding-right: 20px;
        }
    }

    tr + tr td {
        border-top: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 25%, transparent);
    }
}

kbd {
    display: inline-block;
    padding: 1px 5px;
    font-size: 0.85em;
    font-family: monospace;
    background: color-mix(in srgb, var(--app-border, #2d3a56) 40%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-border, #2d3a56) 70%, transparent);
    border-radius: 3px;
    color: var(--app-text, #e2e8f0);
}

.help-tip {
    font-size: 0.92em;
    color: var(--app-text-dim, #4a6080);
    font-style: italic;
}

.bm-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 1.2em;
    transition: color 0.15s, background 0.15s;
    &:hover {
        color: var(--app-text, #e2e8f0);
        background: #ffffff12;
    }
}
</style>

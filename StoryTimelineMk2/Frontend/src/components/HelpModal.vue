<script setup lang="ts">
import BaseModal from './BaseModal.vue'
import { MOD } from '@/utils/shortcuts'
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
                    <tbody>
                        <tr><td>Pan</td><td>Drag the canvas, or scroll horizontally</td></tr>
                        <tr><td>Zoom</td><td>Scroll wheel, or the <kbd>+</kbd> / <kbd>−</kbd> buttons</td></tr>
                        <tr><td>Jump to year</td><td>Type in the year input and press <kbd>Enter</kbd></td></tr>
                        <tr><td>Change LOD</td><td>LOD buttons in the toolbar (Millennia → Days)</td></tr>
                        <tr><td>Minimise view</td><td>Arrow-in button in the activity strip</td></tr>
                        <tr><td>On-screen buttons</td><td>A round button on each side that scrolls while you hold it — turn them on in <strong>App settings → Appearance</strong>. Hold <kbd>Shift</kbd> as well for triple speed.</td></tr>
                        <tr><td>Scroll speed</td><td>The number box at the bottom of the window, beside the FPS counter. It is the same setting as the one in Timeline settings.</td></tr>
                    </tbody>
                </table>
            </section>

            <!-- ACTIVITY STRIP -->
            <section>
                <h2>The activity strip</h2>
                <p>The row of buttons across the top of the timeline window.</p>
                <table>
                    <tbody>
                        <tr><th>Button</th><th>What it does</th></tr>
                        <tr><td>Funnel</td><td>Show or hide the filter panel</td></tr>
                        <tr><td>Arrows in / out</td><td>Minimise the view to just the timeline</td></tr>
                        <tr><td>Calendar</td><td>Open the year view for the timeline's calendar</td></tr>
                        <tr><td>Tag</td><td>Manage tags — rename, recolour, merge, delete</td></tr>
                        <tr><td>List</td><td>Mass add — type many items at once instead of one form at a time</td></tr>
                        <tr><td>Books</td><td>Draw another timeline underneath this one for reference, without changing either <em>(R)</em></td></tr>
                        <tr><td>Export</td><td>Save this timeline, or just the days you worked on it, to a file</td></tr>
                        <tr><td>?</td><td>Help, Shortcuts and About</td></tr>
                        <tr><td>Gear</td><td>Timeline settings — look, layout, calendar overlay, time breaks</td></tr>
                    </tbody>
                </table>
            </section>

            <!-- ADDING ITEMS -->
            <section>
                <h2>Adding items</h2>
                <p>Right-click anywhere on the empty canvas to open the context menu.</p>
                <table>
                    <tbody>
                        <tr><th>Type</th><th>Description</th></tr>
                        <tr><td>Event</td><td>A single point in time — labelled box with a stem</td></tr>
                        <tr><td>Period</td><td>A span of time — horizontal bar</td></tr>
                        <tr><td>Age</td><td>A named era — wide background bar</td></tr>
                        <tr><td>Picture</td><td>An image pinned to a point on the timeline</td></tr>
                        <tr><td>Note</td><td>A text note anchored to a point in time</td></tr>
                        <tr><td>Bookmark</td><td>A quick marker pin with no label</td></tr>
                    </tbody>
                </table>
                <p class="help-tip">To add a <strong>Timeline Start / End</strong> boundary, right-click → Special.</p>
            </section>

            <!-- EDITING -->
            <section>
                <h2>Editing items</h2>
                <table>
                    <tbody>
                        <tr><td>View item</td><td>Left-click the item</td></tr>
                        <tr><td>Open edit form</td><td><kbd>Shift</kbd> + click the item, or right-click → Edit</td></tr>
                        <tr><td>Quick actions</td><td>Right-click the item (edit, delete, distance points)</td></tr>
                        <tr><td>LOD visibility</td><td>Set which zoom levels show this item in the edit form</td></tr>
                        <tr><td>Undo delete</td><td><kbd>{{ MOD }}</kbd> + <kbd>Z</kbd></td></tr>
                    </tbody>
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
                <p>The <strong>Notes panel</strong> (right side) shows notes anchored to the visible time range. Write in the text box and press <kbd>{{ MOD }}</kbd> + <kbd>Enter</kbd> to save.</p>
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
                <p>Everything here lives behind the <strong>database icon</strong> on the project list.</p>
                <table>
                    <tbody>
                        <tr><td>Import database</td><td>Restore a full backup <em>(.sqlite or .stlm)</em> — replaces all data</td></tr>
                        <tr><td>Export database</td><td>Save a full backup of everything. Tick the box to take your pictures along; leave it and you get the database file on its own.</td></tr>
                        <tr><td>Import timeline</td><td>Add a single timeline from a <em>.stlm</em> file</td></tr>
                        <tr><td>Import changes</td><td>Apply a co-writer's <em>.stlc</em> file to your copy — see below</td></tr>
                    </tbody>
                </table>
            </section>

            <!-- SHARING -->
            <section>
                <h2>Working with someone else</h2>
                <p>The <strong>export</strong> button in the activity strip offers two things.</p>
                <table>
                    <tbody>
                        <tr><th>Tab</th><th>What you get</th></tr>
                        <tr><td>This timeline</td><td>The whole timeline as a <em>.stlm</em> archive, with its pictures if you tick the box. Import it with <strong>Import timeline</strong>.</td></tr>
                        <tr><td>My work</td><td>Only the items you changed, as a small <em>.stlc</em> file — see below.</td></tr>
                    </tbody>
                </table>

                <h3>Sending only your own work</h3>
                <p>The <strong>My work</strong> tab lists every day you spent on this timeline, newest first, with what you did on each one. Tick the days you want to send; underneath, the counts and titles show exactly what the file will contain before anything is written.</p>
                <table>
                    <tbody>
                        <tr><td>Everything since the last export</td><td>Picks every day after the one you last sent. The usual button — you never have to remember where you got to.</td></tr>
                        <tr><td>All of it</td><td>Every day on the list.</td></tr>
                        <tr><td>The two date boxes</td><td>Narrow the list to a stretch, for when the last fortnight is finished but this week is not. <em>clear</em> puts the whole list back.</td></tr>
                    </tbody>
                </table>
                <p class="help-tip">Your days are kept, so closing the app loses nothing — last Tuesday is still on the list next week. An item you worked on across several of the ticked days travels once, as you last left it, and something you started and scrapped inside that stretch is not mentioned at all.</p>

                <h3>Taking someone else's changes</h3>
                <p>Open their <em>.stlc</em> file with <strong>Import changes</strong>. The screen turns on two words:</p>
                <table>
                    <tbody>
                        <tr><td>Incoming</td><td>The version in the file you are importing — their work</td></tr>
                        <tr><td>Local</td><td>The version already in this copy — your own</td></tr>
                    </tbody>
                </table>
                <p>Tick one per item, or use <strong>Take incoming for all</strong> / <strong>Keep local for all</strong> at the top. Anything you leave alone takes the incoming version; anything you set to <strong>Local</strong> is not touched at all. Under each item is a plain sentence saying what your current choice will do.</p>
                <p>Items you <em>both</em> edited are marked <strong>Changed on both sides</strong> and show the two versions next to each other, with the fields that differ highlighted — those are the ones worth reading before you decide.</p>
                <p class="help-tip">Only items travel in a <em>.stlc</em> file. Timeline settings, calendars and characters are per-copy and stay as they are. A link to a character or story the other copy does not have is quietly dropped, and the import tells you how many.</p>
            </section>

            <!-- KEYBOARD -->
            <section>
                <h2>Keyboard shortcuts</h2>
                <p>Press <kbd>F2</kbd> (or <strong>?</strong> → <strong>Shortcuts</strong>) for the full list: panning and stepping with the arrow keys, <kbd>N</kbd> for a new item, one key per panel, <kbd>F1</kbd> for this help.</p>
                <table>
                    <tbody>
                        <tr><td><kbd>{{ MOD }}</kbd> + <kbd>Enter</kbd></td><td>Save note</td></tr>
                        <tr><td><kbd>Shift</kbd> + click</td><td>Open the item in the edit window</td></tr>
                        <tr><td><kbd>Esc</kbd></td><td>Leave a text field; close modals and context menus</td></tr>
                    </tbody>
                </table>

                <h3>In any dialog</h3>
                <table>
                    <tbody>
                        <tr><td><kbd>Enter</kbd></td><td>Does the main thing — Save, Import, Select. The button says so.</td></tr>
                        <tr><td><kbd>Esc</kbd></td><td>Backs out without doing it</td></tr>
                        <tr><td><kbd>{{ MOD }}</kbd> + <kbd>Enter</kbd></td><td>Same as <kbd>Enter</kbd>, for when you are inside a multi-line box where <kbd>Enter</kbd> starts a new line</td></tr>
                        <tr><td><kbd>{{ MOD }}</kbd> + <kbd>S</kbd></td><td>Saves in the edit window. That one window ignores <kbd>Enter</kbd> on purpose, so a stray press cannot close it.</td></tr>
                    </tbody>
                </table>

                <h3>Changing a shortcut</h3>
                <p>Press <kbd>F2</kbd>, click <strong>Customise…</strong>, then click any shortcut and press the keys you want it to answer to. <kbd>Backspace</kbd> puts one back to its default, <kbd>Esc</kbd> cancels, and <strong>Reset all</strong> puts everything back. You are warned if another shortcut already owns the combination.</p>
                <p class="help-tip">A handful cannot be changed, because the app would stop making sense without them: <kbd>Esc</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>, <kbd>F1</kbd>, <kbd>F2</kbd>, the function keys, the arrow keys, <kbd>{{ MOD }}</kbd> + <kbd>S</kbd> and <kbd>{{ MOD }}</kbd> + <kbd>Z</kbd>. They are greyed out in the list.</p>
            </section>

            <!-- PERFORMANCE -->
            <section>
                <h2>If the timeline feels slow</h2>
                <p>Turn on <strong>Low resource mode</strong> in <strong>App settings → Performance</strong>. It trades some polish for speed on a busy timeline: the view jumps straight to where it is going instead of gliding there, changing detail level is instant, the marker that follows your cursor is off, the minimap is hidden, and the canvas is drawn at 1:1 rather than at your screen's full pixel density. Items are drawn more simply too — their colour shows on the box border rather than as a separate stripe, and hovering one makes it grow a little instead of glow.</p>
                <p>Reopen the timeline window for it to take effect. The <strong>FPS counter</strong> at the bottom of the window will tell you whether it helped.</p>
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

h3 {
    font-size: 0.95em;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    margin: 6px 0 0;
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

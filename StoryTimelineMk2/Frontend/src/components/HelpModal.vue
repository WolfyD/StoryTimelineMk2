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
                        <tr><td>Tag</td><td>Manage tags — rename, recolor, merge, delete</td></tr>
                        <tr><td>List</td><td>Mass add — type many items at once instead of one form at a time</td></tr>
                        <tr><td>Books</td><td>Draw another timeline underneath this one for reference, without changing either <em>(R)</em></td></tr>
                        <tr><td>Ruler</td><td>The timeline itself — the module you are in, past the separator</td></tr>
                        <tr><td>People</td><td>Open the <strong>Characters</strong> window</td></tr>
                        <tr><td>Graph</td><td>Open the <strong>Relations</strong> window</td></tr>
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

                <h3>Ages and periods that run off the edge</h3>
                <p><strong>Open start</strong> and <strong>Open end</strong> draw a fading arrow instead of a hard edge — for the war that was already old when the story begins, or the dynasty that outlasts it, without stretching the timeline to a year you do not mean. Tick either, or both. <strong>Fade out</strong> beside them trails the open side away instead of ending it flat.</p>
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
                <p>Click the <strong>funnel</strong> icon in the activity strip to open the filter panel. Filter by type, tags, characters, stories, or color. Filtered items can be <em>hidden</em> or <em>dimmed</em>. Save combinations as <strong>presets</strong>.</p>
            </section>

            <!-- NOTES -->
            <section>
                <h2>Notes</h2>
                <p>The <strong>Notes panel</strong> (right side) shows notes anchored to the visible time range. Write in the text box and press <kbd>{{ MOD }}</kbd> + <kbd>Enter</kbd> to save.</p>
            </section>

            <!-- CHARACTERS -->
            <section>
                <h2>Characters</h2>
                <p>The <strong>Characters</strong> button in the activity strip opens a window with everyone in this timeline down one side and a form for whoever you picked. Drag the edge of the list to widen it; the width is remembered.</p>
                <table>
                    <tbody>
                        <tr><th>Field</th><th>What it is for</th></tr>
                        <tr><td>Names</td><td>First and last name, plus nicknames and aliases — any of which the app will recognise in your writing</td></tr>
                        <tr><td>Gender</td><td>Picks the natural English word in every relation — <em>mother of</em>, <em>son of</em>, <em>aunt of</em>. Type past the suggestions if none fit; the wording then reads the neutral way.</td></tr>
                        <tr><td>Faction</td><td>Whatever your world divides itself into — a house, a guild, a cult. Free text, and the box suggests names you have used before, so a cast does not end up split between <em>Night Watch</em> and <em>night watch</em>.</td></tr>
                        <tr><td>Race, state, importance, color</td><td>State is alive, dead, missing — or anything you type</td></tr>
                        <tr><td>Portrait</td><td>Their face shows beside their name, and on the timeline. Replacing it clears the old one out.</td></tr>
                        <tr><td>Birth and death</td><td>Entered exactly the way item dates are, at whatever level of detail you have — a year, a month, a day</td></tr>
                        <tr><td>Shared character</td><td>They join every timeline's cast while staying one person: the same portrait, dates and relations, edited in one place</td></tr>
                    </tbody>
                </table>

                <h3>Putting a character on the timeline</h3>
                <p>Tick <strong>Show on timeline</strong> and their birth and death appear as events in their own color, carrying their portrait. Move a date and the events move with it; untick the box and they go away. They draw as a round portrait rather than a box, and can be filtered as <strong>Character</strong>.</p>
                <p>Right-click one and pick <em>Edit character</em> to come back here. <em>Edit item</em> still edits the event itself.</p>

                <h3>Where they appear</h3>
                <p>Type a character's name, nickname or alias into an item's description and it lights up as you write; click away and they are attached to the item, marked as something the app found rather than something you added. Take one off and it stays off. <strong>+ New</strong> in an item's character picker invents one from whatever you typed into the filter box.</p>
                <p><strong>Appears in</strong> on the character form lists every item they are in with the role you gave them — click one to fly the timeline to it, or the pencil to open it.</p>
                <p><strong>Their timeline</strong>, on that same header or on a right-clicked portrait, reopens the timeline with everything that is not about them left out: ringed in their color, and read-only, because it is a view of their life rather than another place to edit it. A wave in their color runs from birth to death along the middle; a date you never recorded leaves it dashed and running off that edge. The births and deaths of everyone they are related to are drawn there too, smaller and dimmer. Export from inside that window and you get a timeline file of that character alone.</p>

                <h3>Relations</h3>
                <p>The <strong>Relations</strong> section of the form ties a character to another — parent, sibling, grandparent, cousin, spouse, in-law, friend, colleague, rival, twenty kinds in all — and the tie shows on both of their pages, read the right way round from each.</p>
                <table>
                    <tbody>
                        <tr><td>Relate</td><td>Opens a list of everyone else with their portrait, years and state, and a search box over it. The kind you choose is spelled out underneath both ways round, and a button swaps the two if you had them backwards.</td></tr>
                        <tr><td>Kinds</td><td>Add your own — “Sworn enemies”, “Liege / sworn” — and say how each reads in either direction. Removing a kind leaves the relations that used it in place.</td></tr>
                        <tr><td>Dates</td><td>Most need none, since a son is one from birth. Tick <em>From</em> or <em>Until</em> for the ones that do, like an adoption or a marriage that ended.</td></tr>
                        <tr><td>Closeness</td><td>0 to 100. Draws the line thicker in the Relations window, and pulls the two harder together when the web lays itself out.</td></tr>
                        <tr><td>Degree</td><td><em>half-sister of</em>, <em>cousin once removed of</em> — it reads into the wording everywhere the relation is named</td></tr>
                        <tr><td>State</td><td>Estranged, secret, adoptive, former, alleged. It leads the wording and changes the line: secret and alleged draw as long dashes, estranged and former as short ones.</td></tr>
                    </tbody>
                </table>
                <p class="help-tip">When somebody shares a last name with characters you have not related them to, the section offers to sort it out: every pair listed with a guess from their birth years — sixteen years or more apart reads as parent and child, closer than that as siblings. The guesses are only the dates talking, so every row can be re-kinded, swapped or unticked, and nothing is written until you press the button.</p>
            </section>

            <!-- RELATIONS -->
            <section>
                <h2>The Relations window</h2>
                <p>The <strong>Relations</strong> button in the activity strip draws the whole cast as one picture — every character a circle with their portrait in it, every relation a line in the colour of its kind. Seven views of the same web; whoever you have selected, the year you have set and the kinds you have ticked carry across all of them.</p>
                <table>
                    <tbody>
                        <tr><th>View</th><th>What it shows</th></tr>
                        <tr><td>Knots</td><td>Everyone loose, pulled together by their ties, with each group of people who mostly know each other shoved clear of the rest and sitting under a soft coloured blob named after whoever in it has the most ties. <strong>Knot distance</strong> decides how hard the groups push apart. Drag somebody and they stay where you put them, next time too.</td></tr>
                        <tr><td>Matrix</td><td>The cast down the side and across the top, with a square wherever two of them are related — brighter the closer they are, grouped by faction so each house is a block on the diagonal. Click a square, or a name down the side and one across the top, to ask about that pair.</td></tr>
                        <tr><td>Genogram</td><td>A family tree around whoever you picked: ancestors above, descendants below, couples joined by a connector their children hang off. Men are squares, women circles, anyone else a diamond, with the portrait inside; a cross through the shape means they are dead. Every tie that is not descent is drawn over it as a curve — dashed if secret or estranged, jagged if hostile. Click a relative to re-centre on them.</td></tr>
                        <tr><td>Arc</td><td>The cast along one axis in birth order, family arching over the line and everything else looping under it. The <strong>spread</strong> slider runs from even spacing to true-to-the-years, and a checkbox stacks the line into rows by generation. Anyone you never gave a birth year waits past a dashed fence at the end.</td></tr>
                        <tr><td>Sociogram</td><td>Every faction in a box of its own, standing in a ring. Ties inside a box fade into the background; ties that cross from one faction to another are drawn full strength. <strong>Crossing ties</strong> turns the crossings down when the middle fills in solid. Anyone without a faction rings the outside.</td></tr>
                        <tr><td>Chord</td><td>Factions round a circle with a ribbon between every pair that has ties, as thick as the number of them — a slice is as wide as its dealings, not its size. Click a slice or ribbon to light it and list who it is made of. Switch to <strong>Kinds</strong> to put your relation categories round the circle instead.</td></tr>
                        <tr><td>Chain</td><td>The route between the two characters in <em>How are they related?</em>, laid out with each step written over its line. Round everybody on the way is a small circle for each of their other relations — up to five, with a <em>+3</em> where there are more. Untick <em>Side circles</em> for the bare route.</td></tr>
                    </tbody>
                </table>

                <h3>How are they related?</h3>
                <p>Pick two characters and the sidebar spells the chain out — <em>Risha is the mother of Adan, who is the wife of Toma</em> — and traces it through the web. If nothing connects them, it says so. It answers from the relations you have recorded, as of the year on the scrubber; unticking a kind changes what the picture draws, not who is related to whom.</p>
                <p>Tick <strong>Show the route</strong> in the <strong>Matrix</strong> or the <strong>Genogram</strong> to see the answer drawn rather than read: numbered rings on the squares where each pair meets with a dotted line between them, or the chart's own lines lit down through the family. The genogram only offers it when both ends are on the chart in front of you.</p>

                <h3>The sidebar</h3>
                <table>
                    <tbody>
                        <tr><td>Search</td><td>Pulls whoever you type to the middle of the window</td></tr>
                        <tr><td>Kinds</td><td>Which categories of relation the picture draws. In the Genogram they start unticked, so you get the bare family tree and add the rest over it when you want them.</td></tr>
                        <tr><td>As of year</td><td>The web as it was that year: relations that had not started or had already ended disappear, characters not yet born fade almost away, the dead are half-lit</td></tr>
                        <tr><td>Unconnected</td><td>The characters no relation mentions at all — usually the ones you meant to get back to</td></tr>
                    </tbody>
                </table>
                <p class="help-tip">Drag the edge beside the sidebar to make it wider; the width is remembered, as are the sliders.</p>

                <h3>Clicking around</h3>
                <p>Click a character and everyone more than one step away fades, so you can read their corner of it. They stay ringed in white in every view, and a re-drawn chart brings them back to the middle only when they have actually gone off the edge. Double-click opens them in the Characters window.</p>
                <p>Right-click anywhere for the app's own menu: on a character, <em>Their timeline</em>, <em>Open in characters</em>, <em>Centre the genogram here</em>, and the two ends of <em>How are they related?</em>; on the background, <em>Fit to window</em> and <em>Unpin all</em>.</p>

                <h3>Taking a picture of it</h3>
                <p>Three small buttons in the top-right corner of the picture: <strong>Copy</strong>, <strong>Save</strong>, and the settings the two share. Both write out <em>everything drawn</em>, with a margin round it — not the window's worth you happen to be looking at.</p>
                <table>
                    <tbody>
                        <tr><td>Behind the picture</td><td>Plain, ruled paper, dotted paper, or transparent for dropping onto a page of your own</td></tr>
                        <tr><td>Size</td><td>1×, 2× or 4×, with the pixel size it will come to shown underneath</td></tr>
                    </tbody>
                </table>
                <p class="help-tip">A picture too large to encode is scaled down to fit rather than saved blank, and the panel says so before you press anything. In the <strong>Chain</strong> view, <strong>Fit the chain on screen</strong> folds a long route into rows that read back and forth like lines of writing — much the better shape to hand to anybody.</p>
            </section>

            <!-- CALENDAR -->
            <section>
                <h2>Calendar &amp; dates</h2>
                <p>Create custom calendars with configurable months, weeks, and days via <strong>Manage Calendars</strong> (calendar icon in the main menu). When a timeline uses a custom calendar, all dates use its month and day names.</p>
                <p>At <strong>Months LOD</strong> the canvas shows season bands; at <strong>Days LOD</strong> it shows week bands — if those divisions exist in the calendar. Toggle and color these in <strong>Timeline Settings → Calendar Overlay</strong>.</p>
            </section>

            <!-- TIME BREAKS -->
            <section>
                <h2>Time breaks</h2>
                <p>Hide large empty gaps with a <strong>hidden range</strong> — the canvas shows a striped break strip instead. Click the strip to temporarily expand it. Colors are set in <strong>Timeline Settings → Time Breaks</strong>.</p>
            </section>

            <!-- REFERENCE TIMELINES -->
            <section>
                <h2>Reference timelines</h2>
                <p>The <strong>books</strong> button in the activity strip draws another timeline underneath this one without changing either, and a year shift lines the two up. The timeline you picked and the shift you gave it come back the next time you open this one; if it can no longer be loaded, it is dropped and the window tells you why.</p>
                <p>Reference items take the rows your own timeline is not using, so they sit beside your events instead of under them. Ages cannot move aside, so an age of yours covering one of theirs is drawn with diagonal slits in the reference age's color — across the stretch where the two actually overlap, so the slits show you where the one behind starts and ends.</p>
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
                <p>Turn on <strong>Low resource mode</strong> in <strong>App settings → Performance</strong>. It trades some polish for speed on a busy timeline: the view jumps straight to where it is going instead of gliding there, changing detail level is instant, the marker that follows your cursor is off, the minimap is hidden, and the canvas is drawn at 1:1 rather than at your screen's full pixel density. Items are drawn more simply too — their color shows on the box border rather than as a separate stripe, and hovering one makes it grow a little instead of glow.</p>
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

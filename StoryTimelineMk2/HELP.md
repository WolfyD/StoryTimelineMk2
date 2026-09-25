# Story Timeline — Quick Reference

The same ground as the in-app help (**?** → **Help**, or `F1`), in one page.

- [Navigation](#navigation)
- [The activity strip](#the-activity-strip)
- [Adding items](#adding-items)
- [Editing items](#editing-items)
- [Distance measurement](#distance-measurement)
- [Filters](#filters)
- [Notes](#notes)
- [Characters](#characters)
- [The Relations window](#the-relations-window)
- [Calendar & dates](#calendar--dates)
- [Time breaks](#time-breaks-hidden-ranges)
- [Themes & layout settings](#themes--layout-settings)
- [Reference timelines](#reference-timelines)
- [Import / export](#import--export)
- [Working with someone else](#working-with-someone-else)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [If the timeline feels slow](#if-the-timeline-feels-slow)
- [Tips](#tips)

---

## Navigation

| Action | How |
|--------|-----|
| Pan left / right | Click and drag the canvas, or scroll horizontally |
| Zoom in / out | Scroll wheel, or the **+** / **−** buttons in the toolbar |
| Jump to a year | Type a year in the year input and press <kbd>Enter</kbd> |
| Change detail level | The LOD buttons (Millennia → Centuries → Decades → Years → Months → Days) |
| Minimise the view | The arrow-in button in the activity strip |
| On-screen scroll buttons | A round button on each side that scrolls while you hold it — turn them on in **App settings → Appearance**. Hold <kbd>Shift</kbd> as well for triple speed. |
| Scroll speed | The number box at the bottom of the window, beside the FPS counter. It is the same setting as the one in Timeline settings. |

The timeline always shows the most appropriate level of detail. Tick marks, item labels and calendar overlays adapt automatically as you zoom.

---

## The activity strip

The row of buttons across the top of the timeline window.

| Button | What it does |
|--------|--------------|
| Funnel | Show or hide the filter panel |
| Arrows in / out | Minimise the view to just the timeline |
| Calendar | Open the year view for the timeline's calendar |
| Tag | Manage tags — rename, recolor, merge, delete |
| List | Mass add — type many items at once instead of one form at a time |
| Books | Draw another timeline underneath this one for reference, without changing either |
| Ruler | The timeline itself — the module you are in, past the separator |
| People | Open the **Characters** window |
| Graph | Open the **Relations** window |
| Export | Save this timeline, or just the days you worked on it, to a file |
| **?** | Help, Shortcuts and About |
| Gear | Timeline settings — look, layout, calendar overlay, time breaks |

---

## Adding Items

**Right-click** anywhere on the empty canvas to open the context menu. Choose the item type:

| Type | Description |
|------|-------------|
| **Event** | A single point in time — shown as a labelled box with a stem |
| **Period** | A span of time — shown as a horizontal bar |
| **Age** | A named era spanning a long range — shown as a wide background bar |
| **Picture** | An image pinned to a point on the timeline |
| **Note** | A text note anchored to a point in time |
| **Bookmark** | A quick marker — no label, just a pin |
| **Character** | A character's birth or death, drawn as a round portrait — created by ticking *Show on timeline* on a character, not from this menu |

To add a **Timeline Start** or **Timeline End** boundary, right-click → Special → Timeline Start / End. These define the hard edges of your story's time range.

---

## Editing Items

- **Left-click** an item to view it; <kbd>Shift</kbd> + click (or right-click → Edit) to open its edit form.
- **Right-click** an item for quick actions (edit, delete, set distance points).
- Items can be assigned **tags**, **character appearances**, and **story / chapter references** in the edit form.
- The **LOD visibility** row in the edit form controls at which zoom levels each item is visible — useful for decluttering at wide zoom levels.
- <kbd>Ctrl</kbd> + <kbd>Z</kbd> undoes the last deletion.

### Ages and periods that run off the edge

**Open start** and **Open end** draw a fading arrow instead of a hard edge — for the war that was already old when the story begins, or the dynasty that outlasts it, without stretching the timeline to a year you do not mean. Tick either, or both.

**Fade out** beside them trails the open side away instead of ending it flat: half see-through at the arrow's point, back to full colour a year in. The arrow's point sits exactly on the date, and the head is the last stretch of the bar rather than a shape laid over it, so a rounded age keeps its round corner on the closed side.

---

## Distance Measurement

1. **Right-click** any point on the canvas → **Distance – From**
2. **Right-click** another point → **Distance – To**
3. Open the **Distance tab** in the Notes panel (ruler icon) to see the computed duration.

For periods and ages you can right-click the item and choose **Calculate Distance** to set both From and To from that item's start and end in one click.

- Toggle **Show in timeline** in the Distance tab to display a dotted bracket on the canvas marking the two points.
- Click the **×** next to the Distance tab label to clear both points.

---

## Filters

Click the **filter icon** in the activity strip to open the filter panel. You can filter by:
- Item type (including **Character**, for births and deaths)
- Tags
- Characters
- Stories
- Color

Filtered items can be **hidden** entirely or shown **dimmed** — toggle with the mode button in the filter panel. Use **filter presets** to save and restore combinations.

---

## Notes

The **Notes panel** (pen icon) displays notes anchored to the current visible range. Write a note in the text box and press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save it. Click a note to view or edit its full text.

---

## Characters

The **Characters** button in the activity strip opens a window with everyone in this timeline down one side and a form for whoever you picked. Drag the edge of the list to widen it; the width is remembered.

| Field | What it is for |
|-------|----------------|
| **Names** | First and last name, plus nicknames and aliases — any of which the app will recognise in your writing |
| **Gender** | Picks the natural English word in every relation — *mother of*, *son of*, *aunt of*. Type past the suggestions if none fit; the wording then reads the neutral way. |
| **Faction** | Whatever your world divides itself into — a house, a guild, a cult. Free text, and the box suggests names you have used before, so a cast does not end up split between *Night Watch* and *night watch*. |
| **Race, state, importance, color** | State is alive, dead, missing — or anything you type |
| **Portrait** | Their face shows beside their name, and on the timeline. Replacing it clears the old one out. |
| **Birth and death** | Entered exactly the way item dates are, at whatever level of detail you have — a year, a month, a day |
| **Shared character** | They join every timeline's cast while staying one person: the same portrait, dates and relations, edited in one place |

### Putting a character on the timeline

Tick **Show on timeline** and their birth and death appear as events in their own color, tagged and attached to them, carrying their portrait. Move a date and the events move with it; untick the box and they go away.

Those events draw as a round portrait rather than a box, fall back to the character's color when there is no portrait, and can be filtered as **Character**. Right-click one and pick *Edit character* to come back to this window; *Edit item* still edits the event itself.

### Where they appear

Type a character's name, nickname or alias into an item's description or content and it lights up as you write. Click away and they are attached to the item, marked as something the app found rather than something you added — take one off and it stays off. **+ New** in an item's character picker invents a character from whatever you typed into the filter box.

**Appears in** on the character form lists every item they are in with the role you gave them: click one to fly the timeline to it, or the pencil to open it.

**Their timeline** — on that same header, or on a right-clicked portrait — reopens the timeline with everything that is not about them left out. It is ringed in their color and read-only, because it is a view of their life rather than another place to edit it.

- A wave in their color runs along the middle of the canvas from their birth to their death. A date you never recorded leaves the wave dashed, carrying on off that edge.
- The births and deaths of everyone they are **related** to are drawn there too, smaller and dimmer — relations, not surnames, so an in-law who shares no name is family and a stranger who happens to share one is not.
- Ages are drawn a little lighter in that window, so the line stays readable where it passes under them.
- Export from inside that window and you get a timeline file containing that character alone — their events, pictures and tags — so you can hand someone a character without handing over your whole world.

### Relations

The **Relations** section of the character form ties a character to another one — parent, sibling, grandparent, cousin, spouse, in-law, friend, colleague, rival, twenty kinds in all, family and social. The tie shows on both of their pages, read the right way round from each: *parent of* on one, *child of* on the other.

| Control | What it does |
|---------|--------------|
| **Relate** | Opens a list of everyone else in the timeline with their portrait, years and state, and a search box over it — so you pick a face rather than a name from a dropdown. The kind you choose is spelled out underneath both ways round (“Mira is daughter of Aldric”), and a button swaps the two if you had them backwards. |
| **Kinds** | Add your own — “Sworn enemies”, “Liege / sworn” — and say how each reads in either direction. It is then offered everywhere. Removing a kind leaves the relations that used it in place. |
| **Dates** | Most relations need none, since a son is one from birth. Tick *From* or *Until* for the ones that do, like an adoption or a marriage that ended. |
| **Closeness** | 0 to 100. Draws the line thicker in the Relations window, and pulls the two harder together when the web lays itself out. New relations start in the middle. |
| **Degree** | *half-sister of*, *cousin once removed of* — it reads into the wording everywhere the relation is named |
| **State** | Estranged, secret, adoptive, former, alleged. It leads the wording (*estranged half-sister of*) and changes the line: secret and alleged draw as long dashes, estranged and former as short ones. |

> **“Five characters share this name — family?”**
> When somebody shares a last name with characters you have not related them to, the section offers to sort it out. It lists every pair with a guess from their birth years — sixteen years or more apart reads as parent and child, closer than that as siblings. The guesses are only the dates talking, so every row can be re-kinded, swapped or unticked, pairs that are already related say so and stay out of it, and nothing is written until you press the button.

---

## The Relations window

The **Relations** button in the activity strip draws the whole cast as one picture — every character a circle with their portrait in it, every relation a line in the colour of its kind. There are seven views of the same web, and whoever you have selected, the year you have set and the kinds you have ticked carry across all of them.

| View | What it shows |
|------|---------------|
| **Knots** | Everyone loose, pulled together by their ties, with each group of people who mostly know each other shoved clear of the rest and sitting under a soft coloured blob named after whoever in it has the most ties — *Bran Grimsby and 25 others*. The **Knot distance** slider decides how hard the groups push each other apart. Drag somebody and they stay where you put them, next time too. |
| **Matrix** | The whole cast down the side and across the top, with a square wherever two of them are related — brighter the closer they are, grouped by faction so each house is a block on the diagonal. Click a square, or a name down the side and one across the top, to ask about that pair. |
| **Genogram** | A family tree around whoever you picked: ancestors above, descendants below, one row per generation, couples joined by a connector their children hang off. Men are squares, women circles, anyone else a diamond, with the portrait still inside; a cross through the shape means they are dead. Every tie that is not descent is drawn over the tree as a curve — thicker the closer, dashed if secret or estranged, jagged if hostile, faint if it reaches right across the family. Click a relative to re-centre on them. |
| **Arc** | The cast along a single axis in birth order, oldest on the left, with family arching over the line and everything else looping under it. The **spread** slider runs from even spacing to true-to-the-years, and a checkbox stacks the line into rows by generation without losing the dates. Anyone you never gave a birth year waits past a dashed fence at the end rather than being dropped or quietly invented. |
| **Sociogram** | Every faction in a box of its own, standing in a ring. Ties inside a box fade into the background; ties that cross from one faction to another are drawn full strength, so what you see at a glance is where the loyalties run across the lines you drew. The **Crossing ties** slider turns the crossings down when the middle fills in solid. Anyone without a faction rings the outside, belonging to nothing. |
| **Chord** | Your factions round a circle with a ribbon between every pair that has ties, as thick as the number of them — a slice is as wide as its dealings, not its size, and a ribbon looping back onto its own slice is a faction that mostly talks to itself. Click a slice or ribbon to light it and list exactly who it is made of. Switch to **Kinds** to put your relation categories round the circle instead. |
| **Chain** | The route between the two characters in *How are they related?*, laid out with each step written over its line — *mother of*, *husband of*, *rival of*. Round everybody on the way is a small circle for each of their other relations, marked with their initials: up to five, with a *+3* where there are more. Drag anyone to tidy the picture up, or untick *Side circles* for the bare route. |

### How are they related?

Pick two characters and the sidebar spells the chain out — *Risha is the mother of Adan, who is the wife of Toma* — and traces it through the web. If nothing connects them, it says so.

It answers from the relations you have recorded, **as of the year on the scrubber**. Unticking a kind changes what the picture draws, not who is related to whom.

Tick **Show the route** in the **Matrix** or the **Genogram** to see the answer drawn rather than read:

- On the **grid**, every step is ringed on the square where those two people meet and numbered in order, with a dotted line running from one step to the next.
- On the **family chart**, everyone on the route is numbered and the chart's own lines between them light up — down into a marriage, along a row of brothers and sisters. It only offers this when both ends are on the chart in front of you: a genogram is one family around one root, and a trail that jumped over people who are not drawn would be worse than no trail.

### The sidebar

| Control | What it does |
|---------|--------------|
| **Search** | Pulls whoever you type to the middle of the window |
| **Kinds** | Which categories of relation the picture draws. In the Genogram they start unticked, so you get the bare family tree and add the friendships and rivalries over it when you want them. |
| **As of year** | The web as it was that year: relations that had not started or had already ended disappear, characters not yet born fade almost away, and the ones who had died are half-lit. Your world in 1204, and then in 1230. |
| **Unconnected** | The characters no relation mentions at all — usually the ones you meant to get back to |

Drag the edge beside the sidebar to make it wider; the width is remembered, as are the sliders.

### Clicking around

Click a character and everyone more than one step away fades, so you can read their corner of it. They stay ringed in white in every view, and a re-drawn chart brings them back into the middle only when they have actually gone off the edge — a chart that already shows them holds still. Double-click opens them in the Characters window.

Right-click anywhere for the app's own menu instead of the browser's:

- On a character: *Their timeline*, *Open in characters*, *Centre the genogram here*, and the two ends of *How are they related?*, so you can pin down somebody you have just spotted and might not find again.
- On the background: *Fit to window* and *Unpin all*.

### Taking a picture of it

Three small buttons sit in the top-right corner of the picture: **Copy**, **Save**, and the settings the two share. Both write out *everything drawn*, with a margin round it — not the window's worth you happen to be looking at.

| Setting | Choices |
|---------|---------|
| **Behind the picture** | Plain, ruled paper, dotted paper, or transparent for dropping it onto a page of your own |
| **Size** | 1×, 2× or 4×, with the pixel size it will come to shown underneath |

A picture too large to encode is scaled down to fit rather than saved blank, and the panel says so before you press anything.

In the **Chain** view, **Fit the chain on screen** folds a long route into rows that read back and forth like lines of writing, sized to the window — much the better shape to export than a chain several screens wide. Press it again to straighten the chain back out.

---

## Calendar & dates

- Story Timeline supports **custom calendars** with configurable months, weeks, and days-per-week.
- Create and manage calendars via **Manage Calendars** (calendar icon in the main menu).
- When a timeline uses a custom calendar, dates are displayed and formatted using that calendar's month and day names.
- The **Calendar panel** shows a month grid. Highlighted days are those that have items.
- Character birth and death dates, and the years a relation held, are stored the same way item dates are — a date picked to the day stays on the day.

### Calendar Overlay

At certain zoom levels the canvas shows a subtle color band overlay:
- **Months LOD** → season bands (if seasons are defined in the calendar)
- **Days LOD** → week bands (if weeks are defined)

Toggle the overlay and set its colors in **Timeline Settings → Overlays → Calendar Bands**.

---

## Time Breaks (Hidden Ranges)

If your story has a large gap (e.g. centuries of nothing), you can **hide** part of the timeline so the canvas doesn't feel empty. Hidden ranges appear as a striped break strip.

- Expand a break strip by clicking it to peek at the hidden range temporarily.
- Break strip colors (fill and border) are set in **Timeline Settings → Overlays → Time Breaks**.

---

## Themes & Layout Settings

Open **Timeline Settings** (gear icon on the timeline toolbar). It has four tabs:

| Tab | What is in it |
|-----|---------------|
| **General** | Navigation and scroll speed, defaults for new items, filtering, animation, window behaviour |
| **Canvas** | The layout preset, canvas background, the axis, ticks and their labels, event boxes, periods and ages, pictures and portraits |
| **Overlays** | Now line, hover line, the data range band, calendar bands, time breaks, the measurement line |
| **Panels** | Colors for the Notes, Gallery, Calendar and Data panels |

The search box at the top filters every tab at once. A few things worth knowing:

- **Pictures & Portraits** — picture captions and portrait captions have separate text sizes, so you can shrink the one without touching the other.
- Colors that can be see-through — the calendar bands, the data range, time break fill, the panel highlights — have a swatch and an **opacity** percentage beside it.
- **Data Range** sets more than a band width: the notes, gallery and data panels all list the items inside it.

Two built-in presets are available: **Default (Light)** and **Dark** — they are the light and dark looks for the canvas and the panels together. Applying a preset resets all layout settings for that timeline.

---

## Reference timelines

The **books** button in the activity strip draws another timeline underneath this one, without changing either. A year shift lines the two up.

- The timeline you picked and the shift you gave it come back the next time you open this one, per timeline. If it can no longer be loaded — you deleted it, say — it is dropped and the Reference window tells you why.
- Reference items take the rows your own timeline is not using, so they sit beside your events instead of disappearing under them.
- Ages sit in the middle of the timeline and cannot move aside, so an age of yours covering one of theirs is drawn with diagonal slits in the reference age's color — across the stretch where the two actually overlap, so the slits themselves show where the one behind starts and ends.

---

## Import / Export

Everything here lives behind the **database icon** on the project list:

| Action | Description |
|--------|-------------|
| **Import database** | Restore a full backup (`.sqlite` or `.stlm`) — replaces all data |
| **Export database** | Save a full backup of everything. Tick the box to take your pictures along; leave it and you get the database file on its own. |
| **Import timeline** | Add a single timeline from a `.stlm` file |
| **Import changes** | Apply a co-writer's `.stlc` file to your copy — see below |

Individual timelines are exported from the **export** button in the activity strip.

---

## Working with someone else

The **export** button in the activity strip offers two things.

| Tab | What you get |
|-----|--------------|
| **This timeline** | The whole timeline as a `.stlm` archive, with its pictures if you tick the box. Import it with **Import timeline**. |
| **My work** | Only the items you changed, as a small `.stlc` file |

### Sending only your own work

The **My work** tab lists every day you spent on this timeline, newest first, with what you did on each. Tick the days you want to send; underneath, the counts and titles show exactly what the file will contain before anything is written.

| Button | What it picks |
|--------|---------------|
| **Everything since the last export** | Every day after the one you last sent — so you never have to remember where you got to |
| **All of it** | Every day on the list |
| The two date boxes | Narrow the list to a stretch, for when the last fortnight is finished but this week is not. *clear* puts the whole list back. |

Your days are kept, so closing the app loses nothing. An item you worked on across several of the ticked days travels once, as you last left it, and something you started and scrapped inside that stretch is not mentioned at all.

### Taking someone else's changes

Open their `.stlc` file with **Import changes**. The screen turns on two words: **Incoming** is the version in the file — their work; **Local** is the version already in this copy — your own.

Tick one per item, or use **Take incoming for all** / **Keep local for all** at the top. Anything you leave alone takes the incoming version; anything you set to **Local** is not touched at all. Under each item is a plain sentence saying what your current choice will do.

Items you *both* edited are marked **Changed on both sides** and show the two versions next to each other, with the differing fields highlighted.

> Only items travel in a `.stlc` file. Timeline settings, calendars and characters are per-copy and stay as they are. A link to a character or story the other copy does not have is quietly dropped, and the import tells you how many.

---

## Keyboard Shortcuts

Press <kbd>F2</kbd> (or **?** → **Shortcuts**) for the full list: panning and stepping with the arrow keys, <kbd>N</kbd> for a new item, one key per panel, <kbd>F1</kbd> for the help.

| Key | Action |
|-----|--------|
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo last item deletion |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Save note (in the Notes panel) |
| <kbd>Shift</kbd> + click | Open the item in the edit window |
| <kbd>Esc</kbd> | Leave a text field; close modals and context menus |

### In any dialog

| Key | Action |
|-----|--------|
| <kbd>Enter</kbd> | Does the main thing — Save, Import, Select. The button says so. |
| <kbd>Esc</kbd> | Backs out without doing it |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Same as <kbd>Enter</kbd>, for when you are inside a multi-line box where <kbd>Enter</kbd> starts a new line |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Saves in the edit window, which ignores <kbd>Enter</kbd> on purpose so a stray press cannot close it |

### Changing a shortcut

Press <kbd>F2</kbd>, click **Customise…**, then click any shortcut and press the keys you want it to answer to. <kbd>Backspace</kbd> puts one back to its default, <kbd>Esc</kbd> cancels, and **Reset all** puts everything back. You are warned if another shortcut already owns the combination.

A handful cannot be changed, because the app would stop making sense without them: <kbd>Esc</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>, <kbd>F1</kbd>, <kbd>F2</kbd>, the function keys, the arrow keys, <kbd>Ctrl</kbd> + <kbd>S</kbd> and <kbd>Ctrl</kbd> + <kbd>Z</kbd>. They are greyed out in the list.

---

## If the timeline feels slow

Turn on **Low resource mode** in **App settings → Performance**. It trades some polish for speed on a busy timeline: the view jumps straight to where it is going instead of gliding there, changing detail level is instant, the cursor marker is off, the minimap is hidden, and the canvas is drawn at 1:1 rather than at your screen's full pixel density. Items are drawn more simply too.

Reopen the timeline window for it to take effect. The **FPS counter** at the bottom of the window will tell you whether it helped.

---

## Tips

- **Zoom all the way out** to get a bird's-eye view of your entire story arc, then zoom in to work on a specific period.
- Use **Ages** to define major story eras (e.g. "The Dark Years"), then layer **Periods** and **Events** on top.
- Assign items to **characters** so you can filter to one character's perspective — or open **Their timeline** and get that perspective on its own.
- The **Unconnected** list in the Relations sidebar is the fastest way to find the characters you meant to tie into the story and never did.
- The **Gallery panel** shows all pictures on the timeline in a scrollable grid.
- The **Data panel** exports a structured text view of your timeline — useful for copying content into a document.

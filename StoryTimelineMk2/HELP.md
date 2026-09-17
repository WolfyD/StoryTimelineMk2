# Story Timeline — Quick Reference

## Navigation

| Action | How |
|--------|-----|
| Pan left / right | Click and drag the canvas, or scroll horizontally |
| Zoom in / out | Scroll wheel, or use the **+** / **−** buttons in the toolbar |
| Jump to a year | Type a year in the year input and press Enter |
| Change detail level | Use the LOD buttons (Millennia → Decades → Years → Months → Days) |

The timeline always shows the most appropriate level of detail. Tick marks, item labels, and calendar overlays adapt automatically as you zoom.

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

To add a **Timeline Start** or **Timeline End** boundary, right-click → Special → Timeline Start / End. These define the hard edges of your story's time range.

---

## Editing Items

- **Left-click** an item to open its edit form.
- **Right-click** an item for quick actions (edit, delete, set distance points).
- Items can be assigned **tags**, **character appearances**, and **story / chapter references** in the edit form.
- The **LOD visibility** row in the edit form controls at which zoom levels each item is visible — useful for decluttering at wide zoom levels.

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

Click the **filter icon** in the toolbar to open the filter panel. You can filter by:
- Item type
- Tags
- Characters
- Stories
- Colour

Filtered items can be **hidden** entirely or shown **dimmed** — toggle with the mode button in the filter panel. Use **filter presets** to save and restore combinations.

---

## Notes

The **Notes panel** (pen icon) displays notes anchored to the current visible range. Write a note in the text box and press **Ctrl + Enter** to save it. Click a note to view or edit its full text.

---

## Calendar & Date System

- Story Timeline supports **custom calendars** with configurable months, weeks, and days-per-week.
- Create and manage calendars via **Manage Calendars** (calendar icon in the main menu).
- When a timeline uses a custom calendar, dates are displayed and formatted using that calendar's month and day names.
- The **Calendar panel** shows a month grid. Highlighted days are those that have items.

### Calendar Overlay

At certain zoom levels the canvas shows a subtle colour band overlay:
- **Months LOD** → season bands (if seasons are defined in the calendar)
- **Days LOD** → week bands (if weeks are defined)

Toggle the overlay and set its colours in **Timeline Settings → Calendar Overlay**.

---

## Time Breaks (Hidden Ranges)

If your story has a large gap (e.g. centuries of nothing), you can **hide** part of the timeline so the canvas doesn't feel empty. Hidden ranges appear as a striped break strip.

- Expand a break strip by clicking it to peek at the hidden range temporarily.
- Break strip colours (fill and border) are set in **Timeline Settings → Time Breaks**.

---

## Themes & Layout Settings

Open **Timeline Settings** (gear icon on the timeline toolbar) to customise:
- Box sizes, fonts, colours for every item type
- Hover line, Now line, axis and tick colours
- Calendar overlay colours
- Time break strip colours
- Measurement overlay line colour
- Panel colours (Notes, Gallery, Calendar, Data)

Two built-in presets are available: **Default** (light) and **Dark Mode**. Applying a preset resets all layout settings for that timeline.

---

## Import / Export

Click the **database icon** in the main menu to expand the DB menu:

| Action | Description |
|--------|-------------|
| **Import Database** | Restore a full backup (`.sqlite`) — replaces all data |
| **Export Database** | Save a full backup of everything |
| **Import Timeline** | Import a single timeline from a `.stlm` file |

Individual timelines can be exported from the timeline's options menu.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + Z` | Undo last item deletion |
| `Ctrl + Enter` | Save note (in Notes panel) |
| `Esc` | Close context menus and modals |

---

## Tips

- **Zoom all the way out** to get a bird's-eye view of your entire story arc, then zoom in to work on a specific period.
- Use **Ages** to define major story eras (e.g. "The Dark Years"), then layer **Periods** and **Events** on top.
- Assign items to **characters** so you can filter to one character's perspective.
- The **Gallery panel** shows all pictures on the timeline in a scrollable grid.
- The **Data panel** exports a structured text view of your timeline — useful for copying content into a document.

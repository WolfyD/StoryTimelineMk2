# Feature Design: World, Locations & Maps

## Overview

Add a geographic dimension to the timeline. Users can define a world containing a hierarchy of locations, link timeline events to those locations, place locations as pins on map images, and visualize things like a character's movements across a map.

---

## New Concepts

### World
A named geographic container scoped to a timeline. A timeline can have multiple worlds (e.g. Earth and the spirit realm coexisting). Worlds are the roots of the location tree.

### Location
A named place within a world, arranged in an unlimited-depth hierarchy via a self-referential parent FK.

```
World: Middle-earth
  └── The Shire
  └── Rohan
  └── Gondor
        └── Minas Tirith
              └── The White Tower
```

Locations are independent of maps — a location exists as a named node in the tree regardless of whether a map image exists for it.

### Map
An image file representing a geographic area. A map is linked to the Location it depicts, which allows drill-down: if "Gondor" has a map, clicking its pin on a parent map can open the Gondor map.

### Map Pin
Positions a Location on a Map image at pixel coordinates (X, Y). A single location can be pinned on multiple maps (e.g. Paris pinned on a France map and a Europe map).

### Item Groups
Named, toggleable groups that events can belong to. An event can belong to multiple groups. The main timeline respects group visibility, so groups can be hidden to avoid clutter (useful for character-specific movement events). Groups have a `ShowByDefault` flag.

---

## Schema

All changes are **additive** — no existing tables are modified. All new columns on existing tables are nullable.

### New Tables

```sql
CREATE TABLE World (
    Id                INTEGER PRIMARY KEY,
    TimelineId        INTEGER NOT NULL REFERENCES Timeline(Id) ON DELETE CASCADE,
    Name              TEXT    NOT NULL,
    Description       TEXT
);

CREATE TABLE Location (
    Id                INTEGER PRIMARY KEY,
    WorldId           INTEGER NOT NULL REFERENCES World(Id) ON DELETE CASCADE,
    ParentLocationId  INTEGER REFERENCES Location(Id),   -- null = top-level in world
    Name              TEXT    NOT NULL,
    Description       TEXT,
    Color             TEXT    -- default pin color on maps
);

CREATE TABLE Map (
    Id                INTEGER PRIMARY KEY,
    WorldId           INTEGER NOT NULL REFERENCES World(Id) ON DELETE CASCADE,
    LocationId        INTEGER REFERENCES Location(Id),  -- the area this map depicts; null = world-level
    Name              TEXT    NOT NULL,
    ImagePath         TEXT    NOT NULL
);

CREATE TABLE MapPin (
    Id                INTEGER PRIMARY KEY,
    MapId             INTEGER NOT NULL REFERENCES Map(Id) ON DELETE CASCADE,
    LocationId        INTEGER NOT NULL REFERENCES Location(Id) ON DELETE CASCADE,
    X                 REAL    NOT NULL,
    Y                 REAL    NOT NULL
);

-- Junction: which locations an event involves, and in what order/role
CREATE TABLE ItemLocation (
    Id                INTEGER PRIMARY KEY,
    ItemId            INTEGER NOT NULL REFERENCES TimelineItem(Id) ON DELETE CASCADE,
    LocationId        INTEGER NOT NULL REFERENCES Location(Id) ON DELETE CASCADE,
    SequenceOrder     INTEGER NOT NULL DEFAULT 0,
    Role              TEXT    -- 'origin' | 'destination' | 'waypoint' | null
);

CREATE TABLE ItemGroup (
    Id                INTEGER PRIMARY KEY,
    TimelineId        INTEGER NOT NULL REFERENCES Timeline(Id) ON DELETE CASCADE,
    Name              TEXT    NOT NULL,
    Color             TEXT,
    ShowByDefault     INTEGER NOT NULL DEFAULT 1  -- boolean
);

-- Many-to-many: events can belong to multiple groups
CREATE TABLE ItemGroupMember (
    ItemId            INTEGER NOT NULL REFERENCES TimelineItem(Id) ON DELETE CASCADE,
    GroupId           INTEGER NOT NULL REFERENCES ItemGroup(Id) ON DELETE CASCADE,
    PRIMARY KEY (ItemId, GroupId)
);
```

### Changes to Existing Tables

```sql
-- Optional: explicit event chaining for named movement sequences
ALTER TABLE TimelineItem ADD COLUMN NextItemId INTEGER REFERENCES TimelineItem(Id);
```

---

## Event Locations — Two Mechanisms

These are complementary, not alternatives:

| Mechanism | Purpose | Example |
|-----------|---------|---------|
| `ItemLocation` junction | Locations *within* a single event | A battle event spanning three sites; a travel event with origin + destination |
| `NextItemId` chain | Linking separate events into a sequence | Aragorn's journey: Rivendell → Moria → Lothlorien as three separate events chained together |

For the map movement visualization, both mechanisms feed the same path renderer: collect all events in a chain (or all events for a character in a group), extract their `ItemLocation` rows in order, and draw the path.

---

## Groups Design

- Groups are per-timeline.
- An event can belong to any number of groups.
- Groups have `ShowByDefault` — the timeline respects this on load but the user can toggle per session.
- Adding an existing event to a group is done via the `ItemGroupMember` junction (no change to the event itself).
- Possible use cases: character journeys, faction events, off-screen events, draft/placeholder events.

---

## Map Drill-Down Logic

1. A `Map` has a `LocationId` pointing to the area it depicts.
2. Any Location that is a child of that Location can be pinned on that map via `MapPin`.
3. When the user clicks a pin, if a `Map` exists whose `LocationId` matches the pinned location, offer to open it.
4. This creates a natural hierarchy: World map → Country map → City map → Building map, etc., without any extra schema.

---

## Cross-Window Communication (Map ↔ Timeline)

The map screen will be a separate WinForms window with its own WebView2 and Vite entry point (`map.html`), following the existing pattern.

Proposed interactions:
- **Timeline → Map**: Clicking an event with a location fires a bridge message to C# (`FocusMapLocation`), which forwards to the map window, which zooms/highlights the relevant pin.
- **Map → Timeline**: Clicking a pin on the map could filter the timeline to events at that location.
- C# holds references to both window instances and routes messages between them.

---

## Open Questions

- **Location picker UX in EditItem**: Inline search + create, or a separate location manager screen?
- **Movement visualization scope**: First pass could be "show path for a character" only, using their character-linked events with locations. Full arbitrary group paths can come later.
- **Map image storage**: Files stored in a subfolder of the existing app data directory (`%LOCALAPPDATA%\StoryTimelineMk2_Data\maps\`).
- **Event chaining UI**: How does the user create and edit chains? A dedicated "journey" editor, or linking events from the edit-item screen?
- **Groups and the main timeline UI**: The visibility toggle needs a home — a collapsible sidebar panel or a toolbar dropdown.

# Data Model

## Database tables

The SQLite schema is created by `Database/DbInitializer.cs` on first launch.

### Core tables

| Table | Description |
| --- | --- |
| `timelines` | Timeline projects (id, title, author, description, start_year) |
| `items` | All timeline content — events, periods, ages, characters, notes |
| `characters` | Character entities with birth/death dates and importance |
| `calendars` | Custom calendar system definitions |
| `lod_profiles` | Level-of-detail zoom configurations (profile stored as JSON string) |
| `layout_settings` | Visual appearance profiles |
| `settings` | Per-timeline user preferences (font, scaling, window size, custom CSS) |
| `notes` | Rich-text annotations attached to items |
| `pictures` | File path references to image assets |
| `tags` | Label definitions |
| `stories` | Story groupings that items can belong to |
| `item_types` | Lookup table for the 9 built-in item types (seeded on init) |
| `relationship_types` | Named relationship kinds between characters |

### Join tables

| Table | Connects |
| --- | --- |
| `timeline_calendars` | timelines ↔ calendars (with per-timeline year_0 offset) |
| `item_tags` | items ↔ tags (many-to-many) |
| `item_pictures` | items ↔ pictures (many-to-many) |
| `item_characters` | items ↔ characters (many-to-many, with relationship_type) |

### Item types (seeded)

| id | Name | Description |
| --- | --- | --- |
| 1 | Event | A specific point in time |
| 2 | Period | A span of time |
| 3 | Age | A significant era or period |
| 4 | Picture | An image or visual record |
| 5 | Note | A text note or annotation |
| 6 | Bookmark | A marked point of interest |
| 7 | Character | A person or entity |
| 8 | Timeline_start | The start point of the timeline |
| 9 | Timeline_end | The end point of the timeline |

### Default LOD profile (seeded)

The default profile `lod_default` ("Standard Gregorian Scale") defines 8 zoom levels:

| index | formatKey | stepFraction |
| --- | --- | --- |
| 0 | MILLENNIA | 1000 |
| 1 | CENTURIES | 100 |
| 2 | DECADES | 10 |
| 3 | YEARS | 1 (default) |
| 4 | SEASONS | 0.25 |
| 5 | MONTHS | 0.0833 |
| 6 | WEEKS | 0.0192 |
| 7 | DAYS | 0.00274 |

### Performance indexes

```sql
idx_items_timeline_id      ON items(timeline_id)
idx_items_year_subtick     ON items(year, subtick)
idx_item_pictures_combined ON item_pictures(item_id, picture_id)
idx_tags_name              ON tags(name)
```

## TypeScript interfaces

Defined in `Frontend/src/types/models.ts`. These mirror the C# data classes and are used throughout the Vue app.

### `TimelineProject`

Top-level project record.

```ts
interface TimelineProject {
    Id: number;
    Title: string;
    Author: string;
    Description: string;
    StartYear: number;
    Calendar: Calendar;
    Settings: TimelineSettings;
    LayoutSettings: LayoutSettings;
}
```

### `TimelineItem`

Represents a single item on the timeline (event, period, age, character, or note). Position is stored as both year-relative values and precomputed absolute pixel offsets.

```ts
interface TimelineItem {
    Id: string;             // UUID
    Title: string;
    Description: string;
    Content: string;
    TypeId: number;         // item type enum
    Year: number;           // start year
    AbsoluteStart: number;  // precomputed canvas x position
    Subtick: number;        // sub-year granularity
    EndYear: number;
    AbsoluteEnd: number;
    EndSubtick: number;
    Color: string;
    CreationGranularity: number;
    TimelineId: number;
    Importance: number;
    MinLodLevel: number;    // minimum zoom level at which item appears
    ShowInNotes: boolean;
    // book-tracking fields
    BookTitle: string;
    Chapter: string;
    Page: string;
}
```

### `Calendar`

Defines a custom calendar system attached to a project. The `LodProfile` drives how dates are formatted at each zoom level.

```ts
interface Calendar {
    Id: string;
    Name: string;
    ShortName: string;
    AlternateName: string;
    NameBefore0: string;   // label for years before epoch (e.g. "BCE")
    NameAfter0: string;    // label for years after epoch (e.g. "CE")
    DefaultCalendar: boolean;
    Year0AtDefault: number;
    LodProfile: LodProfile;
}
```

### `LodProfile` and `LodLevel`

A profile is a named collection of zoom levels. Each level has a format key and a step fraction. The `Profile` field is stored in the database as a JSON string and parsed by the store at load time.

```ts
interface LodProfile {
    Id: string;
    Name: string;
    Profile: LodLevel[];
}

interface LodLevel {
    index: number;
    formatKey: string;    // e.g. "MILLENNIA", "CENTURIES", "YEARS", "DAYS"
    stepFraction: number;
}
```

### `LayoutSettings`

~50 visual configuration properties controlling every aspect of timeline rendering. A project references one `LayoutSettings` record by id.

Key groups:

| Group | Properties |
| --- | --- |
| Event boxes | width, height, border, padding, font, colors, hover highlight |
| Ages / periods | height, corner rounding, y-margin, y-offset |
| Box types (character/note/image) | show-as-box flag, dimensions, image visibility |
| Canvas | background color, now-line, tick marks, hover line, edge margin |
| Animations | LOD transition duration, jump-to-year animation |
| Data range | visibility, width, color |

### `TimelineSettings`

Per-project user preferences (separate from `LayoutSettings`):

```ts
interface TimelineSettings {
    Font: string;
    FontSizeScale: number;
    PixelsPerSubtick: number;
    CustomCss: string;
    UseCustomCss: boolean;
    IsFullscreen: boolean;
    ShowGuides: boolean;
    WindowSizeX: number;
    WindowSizeY: number;
    WindowPositionX: number;
    WindowPositionY: number;
    UseCustomScaling: boolean;
    CustomScale: number;
    DisplayRadius: number;
    CanvasSettings: CanvasSettingsObject;
}
```

### `FullTimelineProject`

Aggregate sent as a single response when a timeline is opened. Avoids multiple round-trips.

```ts
interface FullTimelineProject {
    Project: TimelineProject;
    Items: TimelineItem[];
    Notes: TimelineNote[];
}
```

### `TimelineNote`

```ts
interface TimelineNote {
    Id: string;           // UUID
    NoteContents: string;
    ConnectedItemId: string;
    TimelineId: number;
    UpdatedAt: Date;
}
```

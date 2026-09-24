# Database Layer

StoryTimelineMk2 persists everything in a single SQLite database accessed via [Dapper](https://github.com/DapperLib/Dapper) (`Microsoft.Data.Sqlite`). All database code lives in `StoryTimeline.Data/Database/`, organized as one repository class per aggregate (`*Repo.cs`) plus plain POCO domain models (`*Item.cs`). There is no ORM change tracking — every repo opens a short-lived `SqliteConnection` per call.

All repos set `DefaultTypeMap.MatchNamesWithUnderscores = true` in their constructor so `snake_case` columns map to `PascalCase` properties automatically.

---

## 1. Database Location and Initialization Flow

### Location

Resolved by `AppConfig` (`AppConfig.cs`):

| Item | Path | Source |
|---|---|---|
| Config file | `%APPDATA%\StoryTimelineMk2\config.json` | `AppConfig.cs:8-12` |
| Default data root | `%LOCALAPPDATA%\StoryTimelineMk2_Data` | `AppConfig.cs:20-22` |
| Database file | `<DataRoot>\timeline.sqlite` | `AppConfig.cs:63` |
| Media folder | `<DataRoot>\Media` | `AppConfig.cs:64` |
| Connection string | `Data Source=<DataRoot>\timeline.sqlite` | `AppConfig.cs:65` |

Data-root resolution order (`AppConfig.cs:35-54`):

1. **Environment variable `STORYTIMELINE_DATA_ROOT`** — always wins; used by the test launcher to point at an isolated DB.
2. **`config.json`** (`dataRoot` property), if present and non-blank.
3. **Default** `%LOCALAPPDATA%\StoryTimelineMk2_Data`.

### Initialization flow

`DbInitializer.Initialize()` (`StoryTimeline.Data/Database/DbInitializer.cs`) runs at startup and after a data-folder change:

1. Creates the data-root directory and opens `timeline.sqlite`.
2. `SchemaMigrator.Migrate(db, path, MainDbMigrations.Steps, "timeline", backupFirst: true)` refuses a
   file stamped by a newer app version, runs `PRAGMA quick_check`, writes and verifies a
   `backups/pre v{fromApp}-v{toApp} migration backup - {yyyy-MM-dd HH-mm-ss}.sqlite` snapshot
   (`BackupService.CreatePreMigrationBackup`) if the file has tables and is behind, then applies every
   missing numbered step (see [10-migrations.md](10-migrations.md)). Any failure is a
   `MigrationException`, shown by `Program.cs` in the `f_ErrorReport` dialog.

Step 1 (`MainDbMigrations.V1_Baseline`, `StoryTimeline.Data/Database/Migrations/MainDbMigrations.cs`) is the 1.0.1 initializer:

1. One large `CREATE TABLE IF NOT EXISTS ...` batch creating all 27 tables.
2. `ApplyColumnMigrations(db)` — adds columns missing from pre-1.0.1 databases (see §7).
3. `CreateIndexes(db)` — `CREATE INDEX IF NOT EXISTS` for all hot lookup paths (items/settings/characters/notes by `timeline_id`, junction table columns, `tags.name`, `misc_settings.key`, etc.).
4. `SeedDefaultData(db)` — idempotent `INSERT OR IGNORE` seeding:
   - The 9 base `item_types` rows.
   - `lod_default` LOD profile ("Standard Gregorian Scale", 8 levels Millennia→Days as JSON).
   - `cal_default_gregorian` calendar with full Gregorian `year_definition` JSON.
   - `ls_default` layout settings preset, plus the `ls_dark` "Dark Mode" preset via `InsertDarkPreset()`.
   - Data-fix migrations and late-added columns (see §7).
5. `NormaliseLegacyRows(db)` — NULL `timelines.calendar_id` → `cal_default_gregorian`, NULL calendar era names → `''`, NULL `items.min_lod_level` → 3 (this used to live in `DatabaseImporter.ApplyLegacyMigrations`).

`DbInitializer.Initialize(string dbPath, bool backupFirst, string dbLabel = "timeline")` is the same routine for an arbitrary file; the importer uses it to migrate a scratch copy of a backup before merging it.

`DbInitializer` also exposes `ResetBuiltinPreset(string id)` which restores `ls_default` / `ls_dark` layout presets to factory values via `UPDATE` (deliberately not DELETE+INSERT, to avoid breaking FK references from `timelines.layout_settings_id`).

---

## 2. Full Schema Reference

All tables are created in `StoryTimeline.Data/Database/Migrations/MainDbMigrations.cs` (step 1; per-table refs below point at that file). Column types below are exactly as declared. SQLite booleans are stored as `INTEGER` 0/1; entity IDs are `TEXT` GUIDs except where noted.

### `timelines` — owner: `TimelineRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `title` | TEXT | NOT NULL, UNIQUE(title, author) |
| `author` | TEXT | NOT NULL |
| `description` | TEXT | |
| `start_year` | INTEGER | DEFAULT 0 |
| `calendar_id` | TEXT | NOT NULL DEFAULT `'cal_default_gregorian'`, FK → `calendars(id)` |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `layout_settings_id` | TEXT | NOT NULL DEFAULT `'ls_default'`, FK → `layout_settings(id)` |
| `color` | TEXT | DEFAULT NULL *(added by migration, `MainDbMigrations.cs`)* |

### `timeline_calendars` — no repo owner; only copied by `DatabaseImporter` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `calendar_id` | TEXT | NOT NULL, FK → `calendars(id)` |
| `timeline_id` | INTEGER | FK → `timelines(id)` ON DELETE CASCADE |
| `year_0_at_default` | INTEGER | NOT NULL DEFAULT 0 |

### `calendars` — owner: `CalendarRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `short_name` | TEXT | NOT NULL DEFAULT `''` |
| `alternate_name` | TEXT | NOT NULL DEFAULT `''` |
| `name_before_0` | TEXT | NOT NULL DEFAULT `''` (e.g. "BCE") |
| `name_after_0` | TEXT | NOT NULL DEFAULT `''` (e.g. "CE") |
| `year_definition` | TEXT | NOT NULL — JSON describing year length, weeks, months, seasons |
| `lod_profile_id` | TEXT | NOT NULL DEFAULT `'lod_default'`, FK → `lod_profiles(id)` |

### `lod_profiles` — owner: `LodRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `profile` | TEXT | NOT NULL — JSON array of `{index, formatKey, stepFraction}` levels |

### `stories` — owner: `StoryRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `item_types` — seeded lookup table, no repo; written only by `DbInitializer.SeedDefaultData` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY |
| `name` | TEXT | UNIQUE |
| `description` | TEXT | |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Seeded rows (`MainDbMigrations.cs`): 1=Event, 2=Period, 3=Age, 4=Picture, 5=Note, 6=Bookmark, 7=Character, 8=Timeline_start, 9=Timeline_end.

### `items` — owner: `ItemRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (GUID) |
| `title` | TEXT | |
| `description` | TEXT | |
| `content` | TEXT | |
| `story_id` | TEXT | FK → `stories(id)` (primary story; extra refs in `item_story_refs`) |
| `type_id` | INTEGER | DEFAULT 1, FK → `item_types(id)` |
| `year` | INTEGER | |
| `end_year` | INTEGER | |
| `absolute_start` | REAL | pre-computed fractional-year position for canvas math |
| `absolute_end` | REAL | |
| `book_title` | TEXT | legacy freetext book reference |
| `chapter` | TEXT | legacy freetext |
| `page` | TEXT | |
| `color` | TEXT | |
| `creation_granularity` | INTEGER | |
| `timeline_id` | INTEGER | FK → `timelines(id)` ON DELETE CASCADE |
| `item_index` | INTEGER | DEFAULT 0 |
| `show_in_notes` | INTEGER | DEFAULT 1 |
| `importance` | INTEGER | DEFAULT 5 |
| `min_lod_level` | INTEGER | DEFAULT 3 — legacy threshold, superseded by mask |
| `lod_visibility_mask` | INTEGER | DEFAULT 255 — bit *i* set = visible at LOD index *i* |
| `placement` | INTEGER | DEFAULT 0 — side of the line: `0` unassigned, `1` above, `2` below (migration 2). `SaveItemFull` picks a side whenever it is saved as `0` (`PickSide`: balance against the 6 nearest neighbours of the same kind, periods and non-periods separately; tie → opposite of the nearest) — "Auto" in the edit window sends `0` to re-pick. Full-width types (3, 6, 7, 8, 9) stay `0`. Migration 2 backfills existing rows with the parity the canvas used to compute. |
| `centered` | INTEGER | NOT NULL DEFAULT 0 — box centered on its stem instead of the sideways `TimelineEventBoxStemOffset` offset; only drawn for events and notes (migration 4) |
| `show_title` | INTEGER | NOT NULL DEFAULT 0 — draw the title as a caption strip along the bottom of the picture; only read for pictures (migration 5) |
| `open_start` | INTEGER | NOT NULL DEFAULT 0 — the span reaches back past its start year; drawn as a fading arrowhead off the left instead of a hard edge. Only read for ages and periods (migration 15) |
| `open_end` | INTEGER | NOT NULL DEFAULT 0 — the span carries on past its end year, same treatment to the right. Independent of `open_start`: both may be set (migration 15) |
| `open_fade` | INTEGER | NOT NULL DEFAULT 0 — soften whichever side is open: half alpha at the arrow's point, full colour a year in, across both the head and the bar. Ignored unless one of the two above is set (migration 18) |
| `item_notes` | TEXT | nullable — writer's private notes; saved, duplicated and exported with the item, never rendered (migration 6) |
| `location_id` | TEXT | BL-16 groundwork: where it happened. No FK and nothing reads it yet (migration 17) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Note: the old `subtick`/`end_subtick` columns were removed from the schema (commit BL-02); migrations still read them from legacy DBs (see §7).

### `notes` — owner: `NoteRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `note_contents` | TEXT | |
| `timeline_id` | INTEGER | FK → `timelines(id)` ON DELETE CASCADE |
| `connected_item_id` | INTEGER | FK → `items(id)` ON DELETE CASCADE *(declared INTEGER, but item IDs are TEXT GUIDs; SQLite's dynamic typing tolerates this — code writes string IDs, `NoteRepo.cs:36`)* |
| `nearest_year` | INTEGER | |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `absolute_time` | REAL | NOT NULL DEFAULT 0 *(added by migration, `MainDbMigrations.cs`)* |

### `pictures` — owner: `MediaRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (GUID) |
| `file_path` | TEXT | filename only for new media; may be a legacy absolute path |
| `file_name` | TEXT | original source filename |
| `file_size` | INTEGER | bytes |
| `file_type` | TEXT | extension without dot |
| `width` | INTEGER | |
| `height` | INTEGER | |
| `title` | TEXT | |
| `description` | TEXT | |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `item_pictures` — junction, owner: `MediaRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `item_id` | TEXT | NOT NULL, FK → `items(id)` ON DELETE CASCADE |
| `picture_id` | TEXT | NOT NULL, FK → `pictures(id)` ON DELETE CASCADE |
| | | UNIQUE(item_id, picture_id) |

### `settings` — owner: `SettingsRepo` (`MainDbMigrations.cs`)

One row per timeline plus one app-level row with `timeline_id IS NULL`.

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY |
| `timeline_id` | INTEGER | FK → `timelines(id)` ON DELETE CASCADE; NULL = app-level settings |
| `font` | TEXT | DEFAULT 'Arial' |
| `font_size_scale` | REAL | DEFAULT 1.0 |
| `pixels_per_subtick` | INTEGER | DEFAULT 20 |
| `custom_css` | TEXT | |
| `use_custom_css` | INTEGER | DEFAULT 0 |
| `is_fullscreen` | INTEGER | DEFAULT 0 |
| `show_guides` | INTEGER | DEFAULT 1 |
| `window_size_x` / `window_size_y` | INTEGER | DEFAULT 1000 / 700 |
| `window_position_x` / `window_position_y` | INTEGER | DEFAULT 300 / 100 |
| `use_custom_scaling` | INTEGER | DEFAULT 0 |
| `custom_scale` | REAL | DEFAULT 1.0 |
| `display_radius` | INTEGER | DEFAULT 10 |
| `canvas_settings` | TEXT | JSON blob |
| `header_mode` | INTEGER | NOT NULL DEFAULT 0 — title strip of the timeline window: 0 full, 1 compact (title only), 2 hidden (migration 3) |
| `default_layout_settings_id` | TEXT | NOT NULL DEFAULT 'ls_default' |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `tags` — owner: `TagRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `name` | TEXT | UNIQUE NOT NULL (stored lower-case) |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `item_tags` — junction, owner: `ItemRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `item_id` | TEXT | FK → `items(id)` ON DELETE CASCADE, composite PK |
| `tag_id` | INTEGER | FK → `tags(id)` ON DELETE CASCADE, composite PK |

### `characters` — owner: `CharacterRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (GUID) |
| `name` | TEXT | NOT NULL |
| `nicknames` | TEXT | |
| `aliases` | TEXT | |
| `race` | TEXT | |
| `faction` | TEXT | free text like `race` — house, guild, army, cult; groups the cast in the relations views *(step 17)* |
| `description` | TEXT | |
| `notes` | TEXT | |
| `birth_year` | INTEGER | nullable |
| `birth_date` | TEXT | |
| `birth_alternative_year` | TEXT | |
| `death_year` | INTEGER | nullable |
| `death_date` | TEXT | |
| `death_alternative_year` | TEXT | |
| `importance` | INTEGER | DEFAULT 5 |
| `color` | TEXT | |
| `timeline_id` | INTEGER | NOT NULL, FK → `timelines(id)` ON DELETE CASCADE |
| `created_at` / `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| **Migration-added** (`MainDbMigrations.cs`) | | |
| `first_name` / `last_name` | TEXT | NOT NULL DEFAULT '' *(step 9)* |
| `portrait_picture_id` | TEXT | `pictures(id)`, no FK *(step 9)* |
| `state` | TEXT | alive / dead / missing, or the writer's own word *(step 9)* |
| `show_on_timeline` | INTEGER | NOT NULL DEFAULT 0 *(step 9)* |
| `birth_item_id` / `death_item_id` | TEXT | the generated type-7 items *(step 9)* |
| `birth_granularity` / `death_granularity` | INTEGER | NOT NULL DEFAULT 3 — the LOD each date was picked at *(step 10)* |
| `use_highlight_color` | INTEGER | NOT NULL DEFAULT 0 *(step 11)* |
| `gender` | TEXT | free text; picks the gendered relation wording *(step 14)* |
| `absolute_start` / `absolute_end` | REAL | birth and death as canvas positions, NULL for no date *(step 16)* |
| `shared` | INTEGER | NOT NULL DEFAULT 0 — in every timeline's cast; `timeline_id` stays as their origin *(step 16)* |
| `birth_location_id` / `death_location_id` | TEXT | BL-16 groundwork, no FK and nothing reads them yet *(step 17)* |

Step 16 dropped `birth_subtick` / `death_subtick`: the sub-year part now lives in the absolutes,
and the editor derives a subtick back out of them (`Frontend/src/utils/lodDates.ts`), the same
split items have had since BL-02.

### `relationship_types` — lookup table, no repo owner (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `type` | TEXT | |
| `a_to_b` | TEXT | |
| `b_to_a` | TEXT | |
| `one_way` | INTEGER | |

Has a matching model (`RelationshipTypeItem.cs`) but no repo reads or writes this table yet.

### `item_characters` — legacy junction; written only by `DatabaseImporter` V1 import (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `item_id` | TEXT | NOT NULL, FK → `items(id)` ON DELETE CASCADE |
| `character_id` | TEXT | NOT NULL, FK → `characters(id)` ON DELETE CASCADE |
| `relationship_type` | TEXT | DEFAULT 'appears' |
| `timeline_id` | INTEGER | NOT NULL, FK → `timelines(id)` ON DELETE CASCADE |
| `created_at` / `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| | | UNIQUE(item_id, character_id) |

Superseded by `item_character_appearances` (comment at `MainDbMigrations.cs`).

### `layout_settings` — owner: `LayoutSettingsRepo` (`MainDbMigrations.cs` + migrated columns `MainDbMigrations.cs`)

All columns NOT NULL unless noted. Grouped for readability:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (`ls_default`, `ls_dark`, or user GUIDs) |
| `name` | TEXT | |
| **Event boxes** | | |
| `timeline_event_box_width` / `_height` / `_stem_offset` | INTEGER | |
| `timeline_event_border_color` | TEXT | |
| `timeline_event_border_width` / `_radius` | INTEGER | |
| `timeline_event_padding` | TEXT | JSON array |
| `timeline_event_y_margin` | INTEGER | |
| `timeline_event_text_color` / `_background_color` / `_font_family` | TEXT | |
| `timeline_event_font_size` | INTEGER | |
| `timeline_event_text_use_ellipsis` | INTEGER | DEFAULT 1 |
| `timeline_event_box_show_color` | INTEGER | DEFAULT 1 |
| `timeline_event_box_show_color_on_bottom` | INTEGER | DEFAULT 0 |
| `timeline_event_has_hover_highlight` | INTEGER | DEFAULT 1 |
| `timeline_event_hover_color` | TEXT | |
| **Ages / periods** | | |
| `timeline_age_height` / `_corner_rounding` | INTEGER | |
| `timeline_period_height` / `_corner_rounding` / `_y_margin` / `_y_offset` | INTEGER | |
| **Box types** | | |
| `timeline_box_types_show_as_box` | INTEGER | DEFAULT 1 |
| `timeline_box_types_box_width` | INTEGER | |
| `timeline_box_types_show_image` | INTEGER | DEFAULT 1 |
| **Canvas misc** | | |
| `timeline_canvas_background_color` | TEXT | |
| `timeline_show_now_line` / `_text` | INTEGER | DEFAULT 1 |
| `timeline_now_line_color` / `_style` | TEXT | |
| `timeline_tick_distance` / `_width` | INTEGER | |
| `timeline_non_year_ticks_smaller` | INTEGER | DEFAULT 1 |
| `timeline_tick_marker_font_family` / `_font_style` / `_text_color` | TEXT | |
| `timeline_tick_marker_font_size` | INTEGER | |
| `timeline_tick_marker_text_always_on_top` | INTEGER | DEFAULT 1 |
| `timeline_show_hover_line` | INTEGER | DEFAULT 1 |
| `timeline_hover_line_color` / `_style` | TEXT | |
| `timeline_hover_line_width` | INTEGER | |
| `timeline_edge_margin_width` | INTEGER | |
| `timeline_data_range_width` | INTEGER | |
| `timeline_is_data_range_visible` | INTEGER | DEFAULT 1 |
| `timeline_data_range_color` | TEXT | |
| `timeline_animate_on_jump_to_year` | INTEGER | DEFAULT 1 |
| `timeline_jump_to_year_animation_length` | INTEGER | ms |
| `timeline_animate_lod_change` | INTEGER | DEFAULT 1 |
| `timeline_lod_change_animation_length` | INTEGER | ms |
| **Migration-added** (`MainDbMigrations.cs`) | | |
| `timeline_tick_color` | TEXT | DEFAULT '#c8b9a4' |
| `timeline_axis_color` | TEXT | DEFAULT '#b5a692' |
| `notes_panel_background_color` / `_card_background_color` / `_text_color` / `_heading_color` / `_accent_color` | TEXT | dark defaults |
| `notes_panel_font_size` | INTEGER | DEFAULT 13 |
| `data_panel_background_color` / `_card_background_color` / `_h1_color` / `_h2_color` / `_h3_color` / `_h4_color` / `_font_family` | TEXT | light defaults |
| `data_panel_font_size` | INTEGER | DEFAULT 14 |

### `character_relationships` — owner: `CharacterRepo` (`MainDbMigrations.cs`)

One row per pair, read from whichever end's panel is open. `relationship_type` is a
`relationship_types(id)`; a deleted kind leaves the relation in place, reading by its raw id.

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `character_1_id` | TEXT | NOT NULL, FK → `characters(id)` ON DELETE CASCADE |
| `character_2_id` | TEXT | NOT NULL, FK → `characters(id)` ON DELETE CASCADE |
| `relationship_type` | TEXT | NOT NULL |
| `relationship_degree` | TEXT | genealogical qualifier — `half-`, `step-`, `once removed`; folded into the wording |
| `relationship_modifier` | TEXT | state word — `estranged`, `secret`, `adoptive`, `former`, `alleged`; also the line's dash |
| `relationship_strength` | INTEGER | DEFAULT 50, 0–100 — edge thickness and spring weight |
| `notes` | TEXT | |
| `timeline_id` | INTEGER | NOT NULL, FK → `timelines(id)` ON DELETE CASCADE |
| `created_at` / `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| **Migration-added** (`MainDbMigrations.cs`) | | |
| `start_year` / `end_year` | INTEGER | nullable — when the relation held *(step 13)* |
| `start_granularity` / `end_granularity` | INTEGER | NOT NULL DEFAULT 3 *(step 13)* |
| `absolute_start` / `absolute_end` | REAL | both ends as canvas positions, NULL for no date *(step 16)* |

Step 16 dropped `custom_relationship_type` and `is_bidirectional` — the first was never written
once kinds became rows of their own, the second never meant anything, since a relation is stored
once and read from both ends either way — and `start_subtick` / `end_subtick`, for the reason
given under `characters`.

`GetRelationshipsByTimeline` joins both ends through `characters` rather than filtering on
`timeline_id`, so a shared character brings their web into every timeline they appear in;
`timeline_id` stays as where the relation was made.

### `item_story_refs` — junction, owner: `ItemRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `item_id` | TEXT | NOT NULL, composite PK, FK → `items(id)` ON DELETE CASCADE |
| `story_id` | TEXT | NOT NULL, composite PK, FK → `stories(id)` ON DELETE CASCADE |

### `books` — owner: `BookRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `title` | TEXT | NOT NULL |
| `author` | TEXT | |
| `description` | TEXT | |
| `created_at` / `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `book_stories` — junction, no repo owner; only copied by importer (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `book_id` | TEXT | NOT NULL, composite PK, FK → `books(id)` ON DELETE CASCADE |
| `story_id` | TEXT | NOT NULL, composite PK, FK → `stories(id)` ON DELETE CASCADE |

### `chapters` — owner: `BookRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `book_id` | TEXT | NOT NULL, FK → `books(id)` ON DELETE CASCADE |
| `number` | INTEGER | NOT NULL |
| `title` | TEXT | |

### `item_chapters` — junction, owner: `ItemRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `item_id` | TEXT | NOT NULL, FK → `items(id)` ON DELETE CASCADE |
| `chapter_id` | TEXT | NOT NULL, FK → `chapters(id)` ON DELETE CASCADE |
| | | UNIQUE(item_id, chapter_id) |

### `timeline_hidden_ranges` — owner: `HiddenRangeRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `timeline_id` | INTEGER | NOT NULL, FK → `timelines(id)` ON DELETE CASCADE |
| `start_year` | INTEGER | NOT NULL |
| `end_year` | INTEGER | NOT NULL |
| `label` | TEXT | |

### `item_character_appearances` — junction, owner: `ItemRepo` (`MainDbMigrations.cs`)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `item_id` | TEXT | NOT NULL, FK → `items(id)` ON DELETE CASCADE |
| `character_id` | TEXT | NOT NULL, FK → `characters(id)` ON DELETE CASCADE |
| `role` | TEXT | freetext role for the appearance |
| | | UNIQUE(item_id, character_id) |

### `filter_presets` — owner: `FilterPresetRepo` (`MainDbMigrations.cs`)

Global (not timeline-scoped) named filter presets.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `rules_json` | TEXT | NOT NULL DEFAULT `'[]'` |
| `and_mode` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### `timeline_filter_rules` — owner: `FilterRuleRepo` (`MainDbMigrations.cs`)

Per-timeline active filter rules.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `timeline_id` | INTEGER | NOT NULL, FK → `timelines(id)` ON DELETE CASCADE |
| `dimension` | TEXT | NOT NULL (e.g. tag/character/story dimension key) |
| `params_json` | TEXT | NOT NULL DEFAULT `'{}'` |
| `label` | TEXT | NOT NULL |
| `state` | TEXT | NOT NULL DEFAULT `'neutral'` |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 |

### `misc_settings` — owner: `MiscSettingsRepo` (`MainDbMigrations.cs`)

Key-value store, explicitly **not** exported/imported.

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | NOT NULL, composite PK |
| `timeline_id` | INTEGER | NOT NULL DEFAULT 0, composite PK — `0` means global |
| `value` | TEXT | |

Keys in use: `filter_and_mode`, `filter_panel_open` (per timeline), `filter_display_mode`
(global), `color_swatches` (per timeline, JSON array of 12 hex colors) and `default_lod_mask`
(per timeline, integer bitmask new items start with — also read by `HandleGetItemForEdit`). The
last two are wrapped by `Frontend/src/utils/timelinePrefs.ts`.

---

## 3. Entity-Relationship Overview

```
lod_profiles ──< calendars ──< timelines >── layout_settings
                                  │ (ON DELETE CASCADE on everything below)
        ┌───────────┬─────────────┼──────────────┬───────────────┬──────────────┐
        │           │             │              │               │              │
     items       characters    settings       notes    timeline_hidden_   timeline_filter_
        │           │          (1 row/TL,       │         ranges             rules
        │           │           + NULL row      │
        │           │           = app-level)    └── connected_item_id → items (CASCADE)
        │           │
        │           ├──< character_relationships (char_1, char_2, both CASCADE)
        │           │
        ├───────────┴──< item_character_appearances (item+char, UNIQUE pair, role)
        ├───────────┬──< item_characters (legacy, importer only)
        │
        ├──< item_tags >── tags (global, lower-cased, UNIQUE name)
        ├──< item_pictures >── pictures (files live in <DataRoot>\Media)
        ├──< item_story_refs >── stories (global)   [items.story_id = primary story FK]
        └──< item_chapters >── chapters ──< books
                                             └──< book_stories >── stories

filter_presets   (global, standalone)
misc_settings    (key-value, timeline_id=0 = global, standalone)
item_types       (static lookup, referenced by items.type_id)
relationship_types (lookup, currently unused by code)
timeline_calendars (timeline↔calendar with year-0 offset; schema+import only)
```

Key relationship facts:

- **Timeline is the aggregate root.** `items`, `characters`, `settings`, `notes`, `timeline_hidden_ranges`, `timeline_filter_rules`, `character_relationships`, `item_characters`, and `timeline_calendars` all declare `FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE` — deleting a timeline removes everything under it (relied on by `TimelineRepo.DeleteTimeline`, `TimelineRepo.cs:114-119`).
- **Item junctions cascade from both sides.** `item_tags`, `item_pictures`, `item_story_refs`, `item_chapters`, `item_character_appearances` cascade when either endpoint is deleted, so deleting an item (`ItemRepo.DeleteItem`) automatically cleans its links.
- **Calendar → LOD profile:** each `calendars.lod_profile_id` points at a `lod_profiles` row; `TimelineInfo` composes calendar + LOD in memory (`TimelineRepo.cs:85-96`, `CalendarRepo.cs:17-23`).
- **Layout settings** are shared presets: many timelines can point to the same `layout_settings` row via `timelines.layout_settings_id` (no cascade; presets outlive timelines).
- **Stories, books, tags, pictures, filter presets are global** — not timeline-scoped; they survive timeline deletion.
- **Items reference stories twice:** the single `items.story_id` FK (primary story) plus the many-to-many `item_story_refs` table ported from v1 (`MainDbMigrations.cs`).
- **Characters are not stored in `items`.** `ItemRepo.GetItemsByTimeline` explicitly excludes `type_id = 7` (`ItemRepo.cs:22`); characters live in their own table.

---

## 4. Per-Repo API Reference

Common pattern: each repo holds `_connString = DbInitializer.GetConnectionString()` and opens a fresh connection per method. Writes are single statements unless noted; multi-statement writes use explicit transactions with rollback-and-rethrow.

### `ItemRepo` — `StoryTimeline.Data/Database/ItemRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetItemsByTimeline` | `IEnumerable<TimelineItem> GetItemsByTimeline(int timelineId)` | All items for a timeline **except** characters (`type_id != 7`), ordered by `absolute_start, item_index` (`ItemRepo.cs:18-24`). |
| `SaveItemWithTags` | `void SaveItemWithTags(TimelineItem item, List<int> tagIds)` | Transaction: upsert item (`ON CONFLICT(id) DO UPDATE`, sets `updated_at`), then delete-and-reinsert `item_tags` from tag IDs. Rolls back and rethrows on failure (`ItemRepo.cs:26-86`). Does **not** write `absolute_start/end`. |
| `GetItemById` | `TimelineItem GetItemById(string id)` | Single-row lookup (`ItemRepo.cs:88-92`). |
| `GetAllItemTagsForTimeline` | `IEnumerable<ItemTagLink> (int timelineId)` | Joined item↔tag links for a whole timeline, ordered by tag name (`ItemRepo.cs:94-104`). |
| `GetAllItemCharactersForTimeline` | `IEnumerable<ItemCharacterLink> (int timelineId)` | Item↔character appearance links with character name/color (`ItemRepo.cs:106-116`). |
| `GetItemTags` | `IEnumerable<TagItem> GetItemTags(string itemId)` | Tags for one item (`ItemRepo.cs:118-125`). |
| `GetItemCharacterAppearances` | `IEnumerable<ItemCharacterAppearanceRow> (string itemId)` | Appearances + role for one item (`ItemRepo.cs:135-143`). |
| `GetItemStoryRefs` | `IEnumerable<ItemStoryRefRow> (string itemId)` | Story refs for one item (`ItemRepo.cs:151-159`). |
| `GetItemChapterRefs` | `IEnumerable<ItemChapterRefRow> (string itemId)` | Chapter refs joined to book, ordered by book title + chapter number (`ItemRepo.cs:170-180`). |
| `SaveItemFull` | `string SaveItemFull(TimelineItem item, List<string> tagNames, List<CharacterAppearanceInput> characterAppearances, List<string> storyIds, List<string> chapterIds)` | The full-fidelity save (used by the edit window). Single transaction: upserts the item **including** `absolute_start/end`, `min_lod_level`, `lod_visibility_mask`; then for each junction (tags, character appearances, story refs, chapter refs) does delete-all + reinsert. Tag names are normalized (`ToLowerInvariant().Trim()`) and auto-created via `INSERT OR IGNORE INTO tags`. Returns the item ID; rollback+rethrow on error (`ItemRepo.cs:188-272`). |
| `GetAllItemStoryRefsForTimeline` | `IEnumerable<ItemStoryRefLink> (int timelineId)` | All story-ref links for a timeline (`ItemRepo.cs:274-283`). |
| `GetItemsWithPicturesForTimeline` | `IEnumerable<string> (int timelineId)` | Distinct item IDs that have at least one linked picture (`ItemRepo.cs:285-293`). |
| `DeleteItem` | `void DeleteItem(string id)` | Deletes the item row; junction cleanup relies on FK cascades (`ItemRepo.cs:295-299`). |
| `ShiftItems` | `int ShiftItems(int timelineId, int deltaYears)` | Bulk-shift `year`, `end_year`, `absolute_start`, `absolute_end` for all items of a timeline by a delta; returns affected row count (`ItemRepo.cs:301-313`). |

Nested helper DTOs: `ItemCharacterAppearanceRow` (`ItemRepo.cs:127-133`), `ItemStoryRefRow` (`ItemRepo.cs:145-149`), `ItemChapterRefRow` (`ItemRepo.cs:161-168`), `CharacterAppearanceInput` (`ItemRepo.cs:182-186`).

### `TimelineRepo` — `StoryTimeline.Data/Database/TimelineRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `CheckIfTimelineTitleExists` | `bool (string title)` | COUNT(*) by title (`TimelineRepo.cs:18-23`). |
| `CreateTimeline` | `int CreateTimeline(string title, string author = "", string? calendarId = null)` | Returns **-1 if the title already exists**. Inserts with `start_year = 0`, a random HSL-derived color (`GenerateRandomColor`, `TimelineRepo.cs:50-57`), and calendar defaulting to `cal_default_gregorian`. Returns `SELECT max(id)` as the new ID (`TimelineRepo.cs:25-48`). |
| `GetAll` | `IEnumerable<TimelineInfo> GetAll()` | All timelines ordered by title; flat rows only (`TimelineRepo.cs:79-83`). |
| `GetTimelineById` | `TimelineInfo GetTimelineById(int id)` | Loads the row, then composes the aggregate: `Calendar` (with nested LOD profile) via `CalendarRepo`, `Settings` via `SettingsRepo.GetTimelineSettings`, `LayoutSettings` via `LayoutSettingsRepo.GetById` (`TimelineRepo.cs:85-96`). |
| `SaveTimeline` | `void SaveTimeline(TimelineInfo timeline)` | Upsert of title/author/description/start_year only (`TimelineRepo.cs:98-112`). |
| `DeleteTimeline` | `void DeleteTimeline(int id)` | Single DELETE; all child data removed by `ON DELETE CASCADE` (`TimelineRepo.cs:114-119`). |
| `UpdateTimelineInfo` | `void (int id, string title, string author, string description, int startYear, string? color, string? calendarId = null)` | UPDATE of metadata; `calendar_id = COALESCE(@CalendarId, calendar_id)` so passing null keeps the current calendar (`TimelineRepo.cs:121-135`). |
| `SetLayoutPreset` | `void (int timelineId, string layoutPresetId)` | Points `layout_settings_id` at a preset (`TimelineRepo.cs:137-142`). |
| `DuplicateTimeline` | `int DuplicateTimeline(int originalId, string newTitle)` | Deep copy in one transaction (`TimelineRepo.cs:144-270`): clones the timeline row, settings row, characters (new GUIDs, old→new map), items (new GUIDs, old→new map), all four item junctions (remapping character IDs through the map; tag/story/chapter IDs reused since those are global), and notes (remapping `connected_item_id`; unmapped links become NULL). Returns the new timeline ID; rollback+rethrow on failure. |

### `CharacterRepo` — `StoryTimeline.Data/Database/CharacterRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetCharactersByTimeline` | `IEnumerable<CharacterItem> (int timelineId)` | Ordered by name (`CharacterRepo.cs:18-22`). |
| `SaveCharacter` | `void SaveCharacter(CharacterItem character)` | Upsert; note `timeline_id` is set only on insert, not updated on conflict (`CharacterRepo.cs:24-49`). |
| `GetNetwork` | `IEnumerable<string> GetNetwork(int timelineId, string startCharId, int maxDepth = 2)` | Loads all `character_relationships` edges for the timeline into memory, then runs an in-C# BFS treating edges as undirected; returns the set of reachable character IDs (including the start) within `maxDepth` hops (`CharacterRepo.cs:59-92`). |
| `DeleteCharacter` | `void DeleteCharacter(string id)` | DELETE; appearances/relationships cleaned by cascades (`CharacterRepo.cs:94-98`). |

### `TagRepo` — `StoryTimeline.Data/Database/TagRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetAllTags` | `IEnumerable<TagItem> GetAllTags()` | Ordered by name (`TagRepo.cs:18-22`). |
| `EnsureTagExists` | `void EnsureTagExists(string tagName)` | `INSERT OR IGNORE`, lower-cases the name (`TagRepo.cs:24-29`). |
| `SearchTags` | `IEnumerable<TagItem> SearchTags(string query)` | `LIKE %query%` (lower-cased), LIMIT 10 (`TagRepo.cs:31-36`). |
| `GetAllWithUsage` | `IEnumerable<(int Id, string Name, int UsageCount)> GetAllWithUsage()` | All tags with their `item_tags` count, ordered by name. Backs the Tags manager. |
| `RenameTag` | `void RenameTag(int id, string name)` | Lower-cases and trims; `ArgumentException` when empty, `InvalidOperationException` when another tag already has the name. |
| `DeleteTag` | `int DeleteTag(int id)` | Transactional: deletes `item_tags` rows explicitly (FKs are off in the app, nothing cascades), then the tag. Returns how many items were unlinked. |

### `StoryRepo` — `StoryTimeline.Data/Database/StoryRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetAllStories` | `IEnumerable<StoryItem> GetAllStories()` | Ordered by title (`StoryRepo.cs:18-22`). |
| `SaveStory` | `void SaveStory(StoryItem story)` | Upsert on id; bumps `updated_at` (`StoryRepo.cs:24-36`). |
| `DeleteStory` | `void DeleteStory(string id)` | DELETE; `item_story_refs`/`book_stories` cascade. Note `items.story_id` has **no** cascade — those FKs become dangling references (`StoryRepo.cs:38-42`). |

### `BookRepo` — `StoryTimeline.Data/Database/BookRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `SearchBooks` | `IEnumerable<BookItem> SearchBooks(string query)` | Title `LIKE %query%`, LIMIT 20 (`BookRepo.cs:16-21`). |
| `GetChaptersForBook` | `IEnumerable<ChapterItem> (string bookId)` | Ordered by chapter number (`BookRepo.cs:23-28`). |
| `SaveBook` | `string SaveBook(BookItem book)` | Upsert; returns the ID (`BookRepo.cs:30-41`). |
| `SaveChapter` | `string SaveChapter(ChapterItem chapter)` | Upsert (updates number/title only on conflict); returns the ID (`BookRepo.cs:43-52`). |

### `CalendarRepo` — `StoryTimeline.Data/Database/CalendarRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetCalendarById` | `CalendarItem GetCalendarById(string id)` | `QuerySingle` (throws if missing), then eagerly loads `LodProfile` via `LodRepo` (`CalendarRepo.cs:17-23`). |
| `SaveCalendar` | `void SaveCalendar(CalendarItem calendar)` | Upsert of all calendar fields (`CalendarRepo.cs:25-40`). |
| `SaveCalendarWithLod` | `void SaveCalendarWithLod(CalendarItem calendar)` | Saves the nested `LodProfile` first, syncs `LodProfileId`, then saves the calendar. Not transactional across the two saves (`CalendarRepo.cs:42-47`). |
| `GetAll` | `IEnumerable<CalendarItem> GetAll()` | Ordered by name; LOD profiles **not** loaded (`CalendarRepo.cs:49-53`). |
| `GetUsageCounts` | `Dictionary<string, int> GetUsageCounts()` | Timeline count per `calendar_id`; unused calendars are absent. |
| `DeleteCalendar` | `int DeleteCalendar(string id)` | Refuses `DefaultCalendarId` (`cal_default_gregorian`). Transactional: timelines using the calendar are moved to the default, the calendar is deleted, and its LOD profile goes too unless another calendar still shares it. Returns the number of reassigned timelines. |

### `LodRepo` — `StoryTimeline.Data/Database/LodRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetLodById` | `LodItem GetLodById(string id)` | `QuerySingle` (`LodRepo.cs:17-21`). |
| `GetAll` | `IEnumerable<LodItem> GetAll()` | Ordered by name (`LodRepo.cs:23-27`). |
| `SaveLodProfile` | `void SaveLodProfile(LodItem lod)` | Upsert of name + profile JSON (`LodRepo.cs:29-40`). |
| `DeleteCalendar` | `void DeleteCalendar(string id)` | Misleadingly named — deletes a **LOD profile** row (`LodRepo.cs:42-46`). |

### `SettingsRepo` — `StoryTimeline.Data/Database/SettingsRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetOrCreateSettings` | `SettingsItem GetOrCreateSettings(int timelineId)` | Reads the timeline's settings row; if absent, inserts one with hard-coded defaults and returns it (`SettingsRepo.cs:15-58`). |
| `GetTimelineSettings` | `SettingsItem GetTimelineSettings(int timelineId)` | Alias delegating to `GetOrCreateSettings` (`SettingsRepo.cs:61`). |
| `SaveSettings` | `void SaveSettings(SettingsItem settings)` | UPDATE (not upsert) keyed on `timeline_id` (`SettingsRepo.cs:63-86`). |
| `SaveWindowState` | `void (int timelineId, int x, int y, int width, int height)` | Updates only window position/size (`SettingsRepo.cs:88-100`). |
| `GetOrCreateAppSettings` | `SettingsItem GetOrCreateAppSettings()` | Same get-or-create pattern for the app-level row where `timeline_id IS NULL` (`SettingsRepo.cs:104-141`). |
| `SaveAppWindowState` | `void (int x, int y, int width, int height)` | Window state on the `timeline_id IS NULL` row (`SettingsRepo.cs:143-155`). |
| `DeleteSettings` | `void DeleteSettings(string id)` | DELETE by settings `id` (`SettingsRepo.cs:157-161`). |

### `MediaRepo` — `StoryTimeline.Data/Database/MediaRepo.cs`

Constructor also creates the media folder (`<DataRoot>\Media`) if missing (`MediaRepo.cs:14-22`).

| Method | Signature | Behaviour |
|---|---|---|
| `GetAllMedia` | `IEnumerable<MediaItem> GetAllMedia()` | Newest first (`MediaRepo.cs:24-28`). |
| `ImportAndSaveMedia` | `MediaItem ImportAndSaveMedia(string sourceFilePath, string title, string description)` | Copies the file into the media folder renamed to `<new-GUID><ext>`, then inserts a `pictures` row storing the **filename only** (full path resolved at runtime). Returns the new `MediaItem` (`MediaRepo.cs:30-63`). Throws `FileNotFoundException` if source missing. |
| `GetItemPictures` | `IEnumerable<MediaItem> GetItemPictures(string itemId)` | Pictures linked to an item via `item_pictures`, ordered by creation (`MediaRepo.cs:65-73`). |
| `LinkPictureToItem` | `void (string pictureId, string itemId)` | `INSERT OR IGNORE` into `item_pictures` (`MediaRepo.cs:75-80`). |
| `UnlinkAndPruneImage` | `void (string pictureId, string itemId)` | Removes the link, then if the picture has **zero** remaining links, deletes it entirely (row + physical file) via `DeleteMedia` (`MediaRepo.cs:82-92`). |
| `GetFullPath` | `string GetFullPath(string fileNameOrPath)` | Returns rooted paths as-is (legacy), otherwise joins with the media folder (`MediaRepo.cs:94-99`). |
| `DeleteMedia` | `void DeleteMedia(string id)` | Deletes the DB row (cascade cleans `item_pictures`) and then deletes the physical file (`MediaRepo.cs:101-116`). |

### `NoteRepo` — `StoryTimeline.Data/Database/NoteRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetTimelineNotes` | `IEnumerable<NoteItem> (int timelineId)` | All notes for a timeline (`NoteRepo.cs:15-19`). |
| `SaveNote` | `string SaveNote(NoteItem note)` | Generates a GUID if `Id` is empty; upsert updating contents/`nearest_year`/`absolute_time`/`updated_at`. Empty `ConnectedItemId` is normalized to SQL NULL. Returns the ID (`NoteRepo.cs:21-42`). |
| `DeleteNote` | `void DeleteNote(string id)` | DELETE (`NoteRepo.cs:44-48`). |

### `HiddenRangeRepo` — `StoryTimeline.Data/Database/HiddenRangeRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetByTimeline` | `IEnumerable<HiddenRangeItem> (int timelineId)` | Ordered by `start_year` (`HiddenRangeRepo.cs:16-22`). |
| `Save` | `int Save(HiddenRangeItem item)` | If `Id == 0`: INSERT and return `last_insert_rowid()`; otherwise UPDATE and return the existing ID (`HiddenRangeRepo.cs:24-44`). |
| `Delete` | `void Delete(int id)` | DELETE (`HiddenRangeRepo.cs:46-50`). |

### `LayoutSettingsRepo` — `StoryTimeline.Data/Database/LayoutSettingsRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `CheckIfLayoutNameExists` | `bool (string name)` | COUNT by name (`LayoutSettingsRepo.cs:15-22`). |
| `GetAll` | `IEnumerable<LayoutSettingsItem> GetAll()` | Ordered by name (`LayoutSettingsRepo.cs:24-28`). |
| `GetById` | `LayoutSettingsItem GetById(string id)` | `QueryFirst` (throws if missing) (`LayoutSettingsRepo.cs:30-35`). |
| `SaveLayoutSettings` | `void SaveLayoutSettings(LayoutSettingsItem settings)` | Full ~70-column upsert of every layout field including the notes-panel and data-panel theme columns (`LayoutSettingsRepo.cs:37-301`). |
| `UpdateDisplayFields` | `void (string id, string fontFamily, int fontSize, string tickTextColor, string bgColor)` | Targeted UPDATE of font family/size (applied to both tick markers and event boxes), tick text color, and canvas background (`LayoutSettingsRepo.cs:303-316`). |
| `Delete` | `void Delete(string id)` | DELETE (no guard against deleting a preset still referenced by a timeline) (`LayoutSettingsRepo.cs:318-325`). |

### `FilterRuleRepo` — `StoryTimeline.Data/Database/FilterRuleRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetByTimeline` | `IEnumerable<FilterRuleItem> (int timelineId)` | Ordered by `sort_order` (`FilterRuleRepo.cs:16-22`). |
| `Save` | `void Save(FilterRuleItem rule)` | Upsert (all fields except `timeline_id` updated on conflict) (`FilterRuleRepo.cs:24-36`). |
| `Delete` | `void Delete(string id)` | DELETE one rule (`FilterRuleRepo.cs:38-42`). |
| `DeleteAllForTimeline` | `void DeleteAllForTimeline(int timelineId)` | Clears all rules for a timeline (`FilterRuleRepo.cs:44-49`). |

### `FilterPresetRepo` — `StoryTimeline.Data/Database/FilterPresetRepo.cs`

| Method | Signature | Behaviour |
|---|---|---|
| `GetAll` | `IEnumerable<FilterPresetItem> GetAll()` | Ordered by `created_at` (`FilterPresetRepo.cs:16-20`). |
| `Save` | `void Save(FilterPresetItem preset)` | Upsert of name/`rules_json`/`and_mode` (`FilterPresetRepo.cs:22-32`). |
| `Delete` | `void Delete(string id)` | DELETE (`FilterPresetRepo.cs:34-38`). |

### `MiscSettingsRepo` — `StoryTimeline.Data/Database/MiscSettingsRepo.cs`

The only repo that does **not** set `MatchNamesWithUnderscores` (it only queries scalar strings).

| Method | Signature | Behaviour |
|---|---|---|
| `Get` | `string Get(string key, int timelineId = 0)` | Returns value or null; `timelineId = 0` means global (`MiscSettingsRepo.cs:10-16`). |
| `Set` | `void Set(string key, string value, int timelineId = 0)` | Upsert on the composite `(key, timeline_id)` PK (`MiscSettingsRepo.cs:18-25`). |
| `Delete` | `void Delete(string key, int timelineId = 0)` | DELETE one key (`MiscSettingsRepo.cs:27-32`). |

---

## 5. Domain Model Classes

| Class (file) | Maps to | Properties |
|---|---|---|
| `TimelineItem` (`TimelineItem.cs`) | `items` | `Id` (GUID default), `Title`, `Description`, `Content`, `StoryId`, `TypeId` (=1), `Year`, `EndYear`, `AbsoluteStart`, `AbsoluteEnd`, `BookTitle`, `Chapter`, `Page`, `Color`, `CreationGranularity`, `TimelineId`, `ItemIndex`, `ShowInNotes` (=true), `MinLodLevel`, `LodVisibilityMask` (=255), `Importance` (=5), `CreatedAt`, `UpdatedAt` |
| `TimelineInfo` (`TimelineInfo.cs`) | `timelines` + composed aggregate | `Id`, `Title`, `Author`, `Description`, `StartYear`, `Color?`, `CalendarId` (="cal_default_gregorian"), `Calendar` (`CalendarItem`), `Settings` (`SettingsItem`), `LayoutSettingsId`, `LayoutSettings` (`LayoutSettingsItem`) — the last four are hydrated by `TimelineRepo.GetTimelineById` |
| `CharacterItem` (`CharacterItem.cs`) | `characters` | `Id` (GUID), `Name`, `FirstName`, `LastName`, `Nicknames`, `Aliases`, `Race`, `Gender`, `State`, `Description`, `Notes`, `BirthYear?`, `BirthDate`, `BirthAlternativeYear`, `BirthGranularity` (=3), `DeathYear?`, `DeathDate`, `DeathAlternativeYear`, `DeathGranularity` (=3), `AbsoluteStart?`, `AbsoluteEnd?`, `Importance` (=5), `Color`, `UseHighlightColor`, `PortraitPictureId`, `ShowOnTimeline`, `BirthItemId`, `DeathItemId`, `Shared`, `TimelineId`, `CreatedAt`, `UpdatedAt`, plus the nested `Relationships` / `Appearances` lists |
| `SettingsItem` (`SettingsItem.cs`) | `settings` | `Id` (GUID — note the table PK is INTEGER), `Font`, `FontSizeScale`, `PixelsPerSubtick`, `CustomCss`, `UseCustomCss`, `IsFullscreen`, `ShowGuides`, `WindowSizeX/Y`, `WindowPositionX/Y`, `UseCustomScaling`, `CustomScale`, `DisplayRadius`, `CanvasSettings`, `UpdatedAt`, `TimelineId` |
| `CalendarItem` (`CalendarItem.cs`) | `calendars` | `Id` (GUID), `Name`, `AlternateName`, `ShortName`, `NameBefore0`, `NameAfter0`, `LodProfileId`, `YearDefinition` (JSON string), `LodProfile` (`LodItem`, hydrated by `CalendarRepo.GetCalendarById`) |
| `LodItem` (`LodItem.cs`) | `lod_profiles` | `Id` (GUID), `Name`, `Profile` (JSON string) |
| `StoryItem` (`StoryItem.cs`) | `stories` | `Id` (GUID), `Title`, `Description`, `CreatedAt`, `UpdatedAt` |
| `TagItem` (`TagItem.cs`) | `tags` | `Id` (int), `Name`, `CreatedAt` |
| `BookItem` (`BookItem.cs`) | `books` | `Id` (GUID), `Title`, `Author`, `Description`, `CreatedAt`, `UpdatedAt` |
| `ChapterItem` (`ChapterItem.cs`) | `chapters` | `Id` (GUID), `BookId`, `Number`, `Title` |
| `MediaItem` (`MediaItem.cs`) | `pictures` | `Id`, `FilePath`, `FileName`, `FileSize`, `FileType`, `Width`, `Height`, `Title`, `Description`, `CreatedAt` |
| `NoteItem` (`NoteItem.cs`) | `notes` | `Id` (GUID), `NoteContents`, `TimelineId`, `ConnectedItemId`, `NearestYear`, `AbsoluteTime` (=0.0), `UpdatedAt` |
| `HiddenRangeItem` (`HiddenRangeItem.cs`) | `timeline_hidden_ranges` | `Id` (int), `TimelineId`, `StartYear`, `EndYear`, `Label?` |
| `RelationshipTypeItem` (`RelationshipTypeItem.cs`) | `relationship_types` | `Id` (GUID), `Name`, `Type`, `AToB`, `BToA`, `OneWay` — model exists but no repo uses it |
| `FilterRuleItem` (`FilterRuleItem.cs`) | `timeline_filter_rules` | `Id`, `TimelineId`, `Dimension`, `ParamsJson`, `Label`, `State` (="neutral"), `SortOrder` |
| `FilterPresetItem` (`FilterPresetItem.cs`) | `filter_presets` | `Id`, `Name`, `RulesJson`, `AndMode` (int), `CreatedAt` (string) |
| `LayoutSettingsItem` (`LayoutSettingsItem.cs`) | `layout_settings` | ~70 properties mirroring the table 1:1 — event box styling (`TimelineEventBoxWidth` … `TimelineEventHoverColor`), age/period styling, box-type options, canvas/now-line/tick/hover-line/data-range options, animation options, `TimelineTickColor`/`TimelineAxisColor`, notes-panel theme (`NotesPanelBackgroundColor` … `NotesPanelFontSize`), data-panel theme (`DataPanelBackgroundColor` … `DataPanelFontSize`) |

`FullTimelineProject.cs` additionally defines DTOs used to ship a whole timeline to the frontend in one payload:

- `ItemTagLink` — `ItemId`, `TagId`, `TagName` (`FullTimelineProject.cs:8-12`)
- `ItemCharacterLink` — `ItemId`, `CharacterId`, `CharacterName`, `CharacterColor` (`FullTimelineProject.cs:14-20`)
- `ItemStoryRefLink` — `ItemId`, `StoryId`, `StoryTitle` (`FullTimelineProject.cs:22-27`)
- `FullTimelineProject` — `Project` (`TimelineInfo`), `Items[]`, `Settings`, `Notes[]`, `HiddenRanges[]`, `ItemTags[]`, `ItemCharacters[]`, `Characters[]`, `ItemStoryRefs[]`, `ItemsWithPictures[]` (`FullTimelineProject.cs:29-41`)

---

## 6. DatabaseImporter

`StoryTimeline.Data/Database/DatabaseImporter.cs` merges an external SQLite backup **into** the live database (it never replaces the current DB).

- `HandleDBImport()` (`DatabaseImporter.cs:13-36`) — shows an `OpenFileDialog` (filters `*.sql;*.sqlite;*.sqlite3;*.db;*.db3`), then calls `Import`. Returns false if anything throws.
- `Import(string sourceFilePath)` — detects the source version via `CheckIfV2`: **a `calendars` table means v2**, otherwise v1. Dispatches to the matching importer.

### V2 import — `ImportV2Backup` / `MergeMigratedBackup`

The backup is never read on its original schema. Instead:

1. `VACUUM INTO` a scratch copy (`%TEMP%/stl_import_<guid>.sqlite`) from a read-only, unpooled connection.
2. `DbInitializer.Initialize(scratch, backupFirst: false)` migrates the copy to the current schema — the same code path a live database goes through, so any historical v2 backup ends up with every table, column, default and seed row the app expects. A backup stamped by a newer app version throws here ("newer version of Story Timeline") and nothing is merged.
3. `MergeMigratedBackup` opens the live DB with `PRAGMA foreign_keys = ON`, `ATTACH`es the scratch copy as `BackupDb`, and in one transaction:
   - cascade-deletes every `timelines` row whose id exists in the backup (removing its items, settings, characters, hidden ranges, filter rules and junction rows);
   - copies each table in `V2CopyPlan` (FK-safe order) with the column set common to both sides (`pragma_table_info` intersection, by name). Conflict policy per table: `INSERT OR REPLACE` for global lookups the backup is authoritative for (`lod_profiles`, `calendars`, `stories`, `tags`, `layout_settings`, `filter_presets`); plain `INSERT` for the cascade-cleared timeline-scoped tables (`timelines`, `items`, `characters`); `INSERT OR IGNORE` for everything else (`pictures`, `settings`, all junctions, `books`/`chapters`, `notes`, `timeline_hidden_ranges`, `timeline_filter_rules`, and the reserved `item_characters` / `timeline_calendars`).
   - commits, then `DETACH`es (must happen after commit — SQLite refuses to detach a database still in a read transaction).
4. Deletes the scratch file (`finally`).

Not imported at all: `item_types`, `misc_settings`, `relationship_types`.

### V1 legacy import — `ImportV1Legacy` (`DatabaseImporter.cs:230-449`)

Row-by-row Dapper copy in a single transaction (two connections, source opened read-only):

- Timelines get `calendar_id = 'cal_default_gregorian'` and `layout_settings_id = 'ls_default'` forced (`DatabaseImporter.cs:246-249`).
- Items: `absolute_start/end` computed in C# from v1 `year` + `subtick/10` (`DatabaseImporter.cs:266-295`); per-item failures are swallowed (`catch {}`).
- v1 notes are **not** imported (the merge-into-items code is commented out, `DatabaseImporter.cs:297-305`).
- Characters, `item_characters`, and `character_relationships` are copied only if the v1 DB has a `characters` table; the whole block is wrapped in a swallowed try/catch (`DatabaseImporter.cs:307-355`).
- `item_tags` always copied; `item_story_refs` copied if present (`DatabaseImporter.cs:357-376`).
- Settings upserted by id (`DatabaseImporter.cs:378-403`).
- Pictures: v1 used INTEGER picture IDs — each gets a fresh GUID, and `item_pictures` links are remapped through the id map (`DatabaseImporter.cs:405-439`).

---

## 7. Migration / Versioning Approach

Since 1.0.2 both databases carry a **`PRAGMA user_version`** and are upgraded by numbered C# steps
(`StoryTimeline.Data/Database/Migrations/`). The full procedure, the rules for adding a step and the importer's use of it are in
[10-migrations.md](10-migrations.md). In short:

1. `SchemaMigrator.Migrate` runs every step above the file's version, each in its own transaction with the version stamp; a newer file is refused; a failed step is rolled back and reported with the version the file was left at.
2. **Step 1 is the 1.0.1 initializer** and keeps the pre-versioning defensive behaviour, which is why databases from any earlier build (version 0) upgrade in place:
   - `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for tables and indexes;
   - column probing + `ALTER TABLE ADD COLUMN` (`ApplyColumnMigrations`, `AddCol`/`HasColumn`) for `timelines.calendar_id`/`layout_settings_id`/`color`, the progressively-added `items` columns (incl. `lod_visibility_mask`), `characters`, `settings`, `notes.absolute_time`, and the layout-settings tick/axis/notes-panel/data-panel columns;
   - `absolute_start`/`absolute_end` backfill for NULL rows, branching on whether the legacy `subtick` column still exists (`year + subtick/10`) or not (plain `year`);
   - seed-value fix-ups (`ls_default.timeline_period_height` → 15, tick marker color, dark-preset panel colors);
   - `NormaliseLegacyRows` (NULL calendar ids / era names / `min_lod_level`).
3. **Every later change is a new step** — never an edit to step 1's DDL.
4. `PruneOldBackups` never deletes `pre v…` migration snapshots (timeline or `(usage stats)`).
5. `DatabaseImporter` migrates a scratch copy of the backup through the same chain before copying rows (§6), so backups from any earlier build import without per-column probing.
6. **A step that backfills must probe its source columns.** Pre-1.0.1 files were built column by
   column, so step 1's `CREATE TABLE IF NOT EXISTS characters` never ran on them and a column the
   schema "has always had" may be missing. Step 16 substitutes the literal `NULL` for any absent
   source column (`Col`), which is also the right answer: no date in, no date out.

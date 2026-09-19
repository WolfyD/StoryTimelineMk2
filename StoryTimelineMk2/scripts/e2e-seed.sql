-- Sample rows for the real-E2E database. Start-E2EApp.ps1 applies this on top of the frozen 1.0.1
-- schema (StoryTimelineMk2.Tests/Fixtures/main_schema_v0_1.0.1.sql, schema version 0), so every E2E
-- run starts the app on a genuine pre-versioning database and exercises the upgrade + pre-migration
-- backup for real. Content is generic on purpose: the specs only assume "at least one timeline with
-- a few items around year 0" and use .first() everywhere.

INSERT INTO timelines (id, title, author, description, start_year, color) VALUES
  (1, 'E2E Sample Saga',      'E2E', 'Seed timeline for the real end-to-end suite',        0,   '#4A90D9'),
  (2, 'E2E Second Timeline',  'E2E', 'Extra row so list tests see more than one project', 100, '#D9744A');

-- Window state is fixed here so every timeline opens windowed at a predictable size.
INSERT INTO settings (timeline_id, is_fullscreen, window_size_x, window_size_y, window_position_x, window_position_y, canvas_settings) VALUES
  (1, 0, 1280, 800, 100, 100, '{}'),
  (2, 0, 1280, 800, 100, 100, '{}');

INSERT INTO items (id, title, description, type_id, year, end_year, absolute_start, absolute_end, timeline_id, color, importance) VALUES
  ('e2e-item-01', 'Founding of the Realm', 'Event at year 0',    1, 0,   0,   0.0,   0.0,   1, '#4A90D9', 7),
  ('e2e-item-02', 'The Long Peace',        'Period 1-20',        2, 1,   20,  1.0,   20.0,  1, '#5BAA5B', 5),
  ('e2e-item-03', 'Age of Sail',           'Age 0-50',           3, 0,   50,  0.0,   50.0,  1, '#AA8855', 5),
  ('e2e-item-04', 'Coronation',            'Event at year 5',    1, 5,   5,   5.0,   5.0,   1, NULL,      6),
  ('e2e-item-05', 'Border Skirmish',       'Event at year 12',   1, 12,  12,  12.0,  12.0,  1, NULL,      4),
  ('e2e-item-06', 'Great Fire',            'Event at year 23',   1, 23,  23,  23.0,  23.0,  1, NULL,      8),
  ('e2e-item-07', 'Chapter One',           'Bookmark at year 3', 6, 3,   3,   3.0,   3.0,   1, NULL,      5),
  ('e2e-item-08', 'Reminder',              'Note item at year 8',5, 8,   8,   8.0,   8.0,   1, NULL,      3),
  ('e2e-item-09', 'Treaty Signed',         'Event at year 40',   1, 40,  40,  40.0,  40.0,  1, NULL,      6),
  ('e2e-item-10', 'Second Founding',       'Event at year 100',  1, 100, 100, 100.0, 100.0, 2, NULL,      5);

INSERT INTO characters (id, name, description, birth_year, death_year, timeline_id, color) VALUES
  ('e2e-char-01', 'Aldric', 'First king',       0,  45, 1, '#8855AA'),
  ('e2e-char-02', 'Mira',   'Court chronicler', 10, 70, 1, '#55AAAA');

INSERT INTO notes (id, note_contents, timeline_id, nearest_year, absolute_time) VALUES
  ('e2e-note-01', 'Seed note near year 5', 1, 5, 5.0);

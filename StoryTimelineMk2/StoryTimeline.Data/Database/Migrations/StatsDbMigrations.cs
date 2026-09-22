namespace StoryTimelineMk2.Database.Migrations
{
    /// <summary>
    /// Ordered schema history of usage.sqlite (achievements/statistics). Same rules as
    /// <see cref="MainDbMigrations"/>: never edit a shipped step, add the next number instead.
    /// </summary>
    internal static class StatsDbMigrations
    {
        public static readonly IReadOnlyList<Migration> Steps = new Migration[]
        {
            new(1, "1.0.1 baseline", "1.0.1", db => { CreateTables(db); SeedTestData(db); }),
        };

        public static int LatestVersion => Steps[^1].Version;

        // ── 1: 1.0.1 baseline ─────────────────────────────────────────────────────────────────────

        private static void CreateTables(MigrationDb db)
        {
            db.Execute(@"
                CREATE TABLE IF NOT EXISTS usage_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    duration_seconds INTEGER
                );

                CREATE TABLE IF NOT EXISTS item_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    item_type_id INTEGER NOT NULL,
                    timeline_id INTEGER,
                    occurred_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS activity_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS achievement_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    achievement_key TEXT UNIQUE NOT NULL,
                    title TEXT NOT NULL,
                    flavor_text TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    icon TEXT,
                    image_path TEXT,
                    trigger_type TEXT NOT NULL,
                    trigger_value INTEGER,
                    trigger_param TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS character_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT UNIQUE NOT NULL,
                    character_name TEXT NOT NULL,
                    image_path TEXT,
                    description TEXT
                );

                CREATE TABLE IF NOT EXISTS character_tier_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT NOT NULL,
                    tier_number INTEGER NOT NULL,
                    points_required INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    flavor_text TEXT NOT NULL,
                    image_path TEXT,
                    UNIQUE(character_key, tier_number)
                );

                CREATE TABLE IF NOT EXISTS character_event_contributions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    item_type_id INTEGER,
                    points INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(character_key, event_type, item_type_id)
                );

                CREATE TABLE IF NOT EXISTS character_progress (
                    character_key TEXT PRIMARY KEY,
                    points_total INTEGER NOT NULL DEFAULT 0,
                    highest_tier_reached INTEGER NOT NULL DEFAULT 0,
                    last_updated TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS achievements_earned (
                    achievement_key TEXT PRIMARY KEY,
                    achieved_at TEXT NOT NULL,
                    context_value INTEGER
                );
            ");
        }

        private static void SeedTestData(MigrationDb db)
        {
            db.Execute(@"
                INSERT OR IGNORE INTO achievement_defs
                    (achievement_key, title, flavor_text, tier, trigger_type, sort_order)
                VALUES
                    ('test_achievement', 'Test Achievement',
                     'This is a placeholder achievement for testing the notification system.',
                     'achievement', 'test', 9999),
                    ('test_milestone', 'Test Milestone',
                     'This is a placeholder milestone for testing the notification system.',
                     'milestone', 'test', 9999)");

            db.Execute(@"
                INSERT OR IGNORE INTO character_defs
                    (character_key, character_name, description)
                VALUES
                    ('test_character', 'Test Character',
                     'A placeholder character for testing character progression.')");

            db.Execute(@"
                INSERT OR IGNORE INTO character_tier_defs
                    (character_key, tier_number, points_required, title, flavor_text)
                VALUES
                    ('test_character', 1, 5,
                     'Apprentice Chronicler',
                     'You have taken your first steps on the path of the chronicles.'),
                    ('test_character', 2, 20,
                     'Seasoned Chronicler',
                     'Your dedication to the chronicles grows ever stronger.')");

            // Test character earns 1 point per any item created.
            // item_type_id is NULL here and NULLs never collide in a UNIQUE index, so INSERT OR IGNORE
            // added a fresh row every launch; guard explicitly and drop duplicates from earlier launches.
            db.Execute(@"
                DELETE FROM character_event_contributions
                WHERE id NOT IN (SELECT MIN(id) FROM character_event_contributions
                                 GROUP BY character_key, event_type, IFNULL(item_type_id, -1));
                INSERT INTO character_event_contributions
                    (character_key, event_type, item_type_id, points)
                SELECT 'test_character', 'created', NULL, 1
                WHERE NOT EXISTS (SELECT 1 FROM character_event_contributions
                                  WHERE character_key = 'test_character' AND event_type = 'created' AND item_type_id IS NULL)");
        }
    }
}

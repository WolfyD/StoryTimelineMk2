-- Frozen usage.sqlite as written by Story Timeline 1.0.1 (schema version 0, before PRAGMA user_version).
-- Generated with python sqlite3 iterdump(); do not edit by hand. Used by SchemaMigratorTests.

CREATE TABLE achievement_defs (
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
INSERT INTO "achievement_defs" VALUES(1,'test_achievement','Test Achievement','This is a placeholder achievement for testing the notification system.','achievement',NULL,NULL,'test',NULL,NULL,1,9999);
INSERT INTO "achievement_defs" VALUES(2,'test_milestone','Test Milestone','This is a placeholder milestone for testing the notification system.','milestone',NULL,NULL,'test',NULL,NULL,1,9999);
CREATE TABLE achievements_earned (
                    achievement_key TEXT PRIMARY KEY,
                    achieved_at TEXT NOT NULL,
                    context_value INTEGER
                );
CREATE TABLE activity_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL
                );
CREATE TABLE character_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT UNIQUE NOT NULL,
                    character_name TEXT NOT NULL,
                    image_path TEXT,
                    description TEXT
                );
INSERT INTO "character_defs" VALUES(1,'test_character','Test Character',NULL,'A placeholder character for testing character progression.');
CREATE TABLE character_event_contributions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    item_type_id INTEGER,
                    points INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(character_key, event_type, item_type_id)
                );
INSERT INTO "character_event_contributions" VALUES(1,'test_character','created',NULL,1);
CREATE TABLE character_progress (
                    character_key TEXT PRIMARY KEY,
                    points_total INTEGER NOT NULL DEFAULT 0,
                    highest_tier_reached INTEGER NOT NULL DEFAULT 0,
                    last_updated TEXT NOT NULL
                );
CREATE TABLE character_tier_defs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_key TEXT NOT NULL,
                    tier_number INTEGER NOT NULL,
                    points_required INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    flavor_text TEXT NOT NULL,
                    image_path TEXT,
                    UNIQUE(character_key, tier_number)
                );
INSERT INTO "character_tier_defs" VALUES(1,'test_character',1,5,'Apprentice Chronicler','You have taken your first steps on the path of the chronicles.',NULL);
INSERT INTO "character_tier_defs" VALUES(2,'test_character',2,20,'Seasoned Chronicler','Your dedication to the chronicles grows ever stronger.',NULL);
CREATE TABLE item_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    item_type_id INTEGER NOT NULL,
                    timeline_id INTEGER,
                    occurred_at TEXT NOT NULL
                );
CREATE TABLE usage_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    duration_seconds INTEGER
                );
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('achievement_defs',2);
INSERT INTO "sqlite_sequence" VALUES('character_defs',1);
INSERT INTO "sqlite_sequence" VALUES('character_tier_defs',2);
INSERT INTO "sqlite_sequence" VALUES('character_event_contributions',1);

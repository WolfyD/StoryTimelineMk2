using Microsoft.Data.Sqlite;
using Dapper;

namespace StoryTimelineMk2.Database
{
    // ── Model classes ────────────────────────────────────────────────────────────

    internal class AchievementDef
    {
        public int Id { get; set; }
        public string AchievementKey { get; set; } = "";
        public string Title { get; set; } = "";
        public string FlavorText { get; set; } = "";
        public string Tier { get; set; } = "achievement";
        public string? Icon { get; set; }
        public string? ImagePath { get; set; }
        public string TriggerType { get; set; } = "test";
        public int? TriggerValue { get; set; }
        public string? TriggerParam { get; set; }
        public bool IsActive { get; set; } = true;
        public int SortOrder { get; set; }
    }

    internal class CharacterDef
    {
        public int Id { get; set; }
        public string CharacterKey { get; set; } = "";
        public string CharacterName { get; set; } = "";
        public string? ImagePath { get; set; }
        public string? Description { get; set; }
    }

    internal class CharacterTierDef
    {
        public int Id { get; set; }
        public string CharacterKey { get; set; } = "";
        public int TierNumber { get; set; }
        public int PointsRequired { get; set; }
        public string Title { get; set; } = "";
        public string FlavorText { get; set; } = "";
        public string? ImagePath { get; set; }
    }

    internal class CharacterEventContribution
    {
        public int Id { get; set; }
        public string CharacterKey { get; set; } = "";
        public string EventType { get; set; } = "";
        public int? ItemTypeId { get; set; }
        public int Points { get; set; } = 1;
    }

    internal class CharacterProgress
    {
        public string CharacterKey { get; set; } = "";
        public int PointsTotal { get; set; }
        public int HighestTierReached { get; set; }
        public string LastUpdated { get; set; } = "";
    }

    // ── Repository ───────────────────────────────────────────────────────────────

    internal class StatsRepo
    {
        private static string ConnStr => StatsDbInitializer.GetConnectionString();

        // ── Sessions ──────────────────────────────────────────────────────────────

        public long OpenSession()
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute("INSERT INTO usage_sessions (started_at) VALUES (@now)",
                new { now = DateTime.UtcNow.ToString("O") });
            return db.ExecuteScalar<long>("SELECT last_insert_rowid()");
        }

        public void CloseSession(long sessionId)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                UPDATE usage_sessions
                SET ended_at = @now,
                    duration_seconds = CAST((julianday(@now) - julianday(started_at)) * 86400 AS INTEGER)
                WHERE id = @sessionId",
                new { now = DateTime.UtcNow.ToString("O"), sessionId });
        }

        // ── Events ────────────────────────────────────────────────────────────────

        public void RecordItemEvent(long sessionId, string eventType, int itemTypeId, int? timelineId)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                INSERT INTO item_events (session_id, event_type, item_type_id, timeline_id, occurred_at)
                VALUES (@sessionId, @eventType, @itemTypeId, @timelineId, @now)",
                new { sessionId, eventType, itemTypeId, timelineId, now = DateTime.UtcNow.ToString("O") });
        }

        public void RecordActivityEvent(long sessionId, string eventType)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                INSERT INTO activity_events (session_id, event_type, occurred_at)
                VALUES (@sessionId, @eventType, @now)",
                new { sessionId, eventType, now = DateTime.UtcNow.ToString("O") });
        }

        // ── Achievement definitions ───────────────────────────────────────────────

        public AchievementDef? GetAchievementDef(string key)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.QueryFirstOrDefault<AchievementDef>(@"
                SELECT id             AS Id,
                       achievement_key AS AchievementKey,
                       title          AS Title,
                       flavor_text    AS FlavorText,
                       tier           AS Tier,
                       icon           AS Icon,
                       image_path     AS ImagePath,
                       trigger_type   AS TriggerType,
                       trigger_value  AS TriggerValue,
                       trigger_param  AS TriggerParam,
                       is_active      AS IsActive,
                       sort_order     AS SortOrder
                FROM achievement_defs
                WHERE achievement_key = @key AND is_active = 1",
                new { key });
        }

        public IEnumerable<AchievementDef> GetAllDefs()
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.Query<AchievementDef>(@"
                SELECT id             AS Id,
                       achievement_key AS AchievementKey,
                       title          AS Title,
                       flavor_text    AS FlavorText,
                       tier           AS Tier,
                       icon           AS Icon,
                       image_path     AS ImagePath,
                       trigger_type   AS TriggerType,
                       trigger_value  AS TriggerValue,
                       trigger_param  AS TriggerParam,
                       is_active      AS IsActive,
                       sort_order     AS SortOrder
                FROM achievement_defs
                WHERE is_active = 1
                ORDER BY sort_order, id").ToList();
        }

        public AchievementDef? GetRandomDef(string tier)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.QueryFirstOrDefault<AchievementDef>(@"
                SELECT id             AS Id,
                       achievement_key AS AchievementKey,
                       title          AS Title,
                       flavor_text    AS FlavorText,
                       tier           AS Tier,
                       icon           AS Icon,
                       image_path     AS ImagePath,
                       trigger_type   AS TriggerType,
                       trigger_value  AS TriggerValue,
                       trigger_param  AS TriggerParam,
                       is_active      AS IsActive,
                       sort_order     AS SortOrder
                FROM achievement_defs
                WHERE tier = @tier AND is_active = 1
                ORDER BY RANDOM()
                LIMIT 1",
                new { tier });
        }

        // ── Earned achievements ───────────────────────────────────────────────────

        public bool IsEarned(string key)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.ExecuteScalar<int>(
                "SELECT COUNT(*) FROM achievements_earned WHERE achievement_key = @key",
                new { key }) > 0;
        }

        public void MarkEarned(string key, int? contextValue = null)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                INSERT OR IGNORE INTO achievements_earned (achievement_key, achieved_at, context_value)
                VALUES (@key, @now, @contextValue)",
                new { key, now = DateTime.UtcNow.ToString("O"), contextValue });
        }

        // ── Character definitions ─────────────────────────────────────────────────

        public CharacterDef? GetCharacterDef(string characterKey)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.QueryFirstOrDefault<CharacterDef>(@"
                SELECT id            AS Id,
                       character_key  AS CharacterKey,
                       character_name AS CharacterName,
                       image_path     AS ImagePath,
                       description    AS Description
                FROM character_defs WHERE character_key = @key",
                new { key = characterKey });
        }

        public IEnumerable<CharacterTierDef> GetCharacterTiers(string characterKey)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.Query<CharacterTierDef>(@"
                SELECT id              AS Id,
                       character_key   AS CharacterKey,
                       tier_number     AS TierNumber,
                       points_required AS PointsRequired,
                       title           AS Title,
                       flavor_text     AS FlavorText,
                       image_path      AS ImagePath
                FROM character_tier_defs
                WHERE character_key = @key
                ORDER BY tier_number",
                new { key = characterKey }).ToList();
        }

        public IEnumerable<CharacterEventContribution> GetContributionsForEvent(string eventType, int? itemTypeId)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.Query<CharacterEventContribution>(@"
                SELECT id            AS Id,
                       character_key  AS CharacterKey,
                       event_type     AS EventType,
                       item_type_id   AS ItemTypeId,
                       points         AS Points
                FROM character_event_contributions
                WHERE event_type = @eventType
                  AND (item_type_id IS NULL OR item_type_id = @itemTypeId)",
                new { eventType, itemTypeId }).ToList();
        }

        // ── Character progress ────────────────────────────────────────────────────

        public CharacterProgress? GetCharacterProgress(string characterKey)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            return db.QueryFirstOrDefault<CharacterProgress>(@"
                SELECT character_key        AS CharacterKey,
                       points_total         AS PointsTotal,
                       highest_tier_reached AS HighestTierReached,
                       last_updated         AS LastUpdated
                FROM character_progress WHERE character_key = @key",
                new { key = characterKey });
        }

        public void AddCharacterPoints(string characterKey, int points)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                INSERT INTO character_progress
                    (character_key, points_total, highest_tier_reached, last_updated)
                VALUES (@key, @points, 0, @now)
                ON CONFLICT(character_key) DO UPDATE SET
                    points_total = points_total + @points,
                    last_updated = @now",
                new { key = characterKey, points, now = DateTime.UtcNow.ToString("O") });
        }

        public void UpdateHighestTier(string characterKey, int tier)
        {
            using var db = new SqliteConnection(ConnStr);
            db.Open();
            db.Execute(@"
                UPDATE character_progress
                SET highest_tier_reached = @tier, last_updated = @now
                WHERE character_key = @key",
                new { key = characterKey, tier, now = DateTime.UtcNow.ToString("O") });
        }
    }
}

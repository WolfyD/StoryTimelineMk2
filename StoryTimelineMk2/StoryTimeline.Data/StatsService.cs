using Microsoft.Web.WebView2.Core;
using StoryTimelineMk2.Database;
using System.Text.Json;
using System.Windows.Forms;

namespace StoryTimelineMk2
{
    /// <summary>
    /// Fire-and-forget usage statistics and achievement service.
    /// All writes are non-blocking (Task.Run); callers never await them.
    /// Achievement push messages are broadcast to all open WebView2 instances;
    /// the Vue layer uses document.hasFocus() to avoid duplicate toasts.
    /// </summary>
    internal static class StatsService
    {
        private static long _currentSessionId = -1;
        private static readonly StatsRepo _repo = new();

        // All open WebView2 instances — one per WinForms window.
        private static readonly List<WeakReference<CoreWebView2>> _webViews = new();
        private static readonly object _wvLock = new();

        // ── WebView registration ──────────────────────────────────────────────────

        /// <summary>Called by each MessageRouter on construction.</summary>
        public static void RegisterWebView(CoreWebView2 webView)
        {
            lock (_wvLock)
            {
                _webViews.RemoveAll(r => !r.TryGetTarget(out _));
                _webViews.Add(new WeakReference<CoreWebView2>(webView));
            }
        }

        // ── Session tracking ──────────────────────────────────────────────────────

        public static void OpenSession()
        {
            _ = Task.Run(() =>
            {
                try { _currentSessionId = _repo.OpenSession(); }
                catch (Exception ex) { Logger.Error("StatsService/OpenSession", ex); }
            });
        }

        public static void CloseSession()
        {
            long id = _currentSessionId;
            if (id < 0) return;
            _ = Task.Run(() =>
            {
                try { _repo.CloseSession(id); }
                catch (Exception ex) { Logger.Error("StatsService/CloseSession", ex); }
            });
        }

        // ── Event recording ───────────────────────────────────────────────────────

        public static void RecordItemEvent(string eventType, int itemTypeId, int? timelineId)
        {
            long id = _currentSessionId;
            _ = Task.Run(async () =>
            {
                try
                {
                    _repo.RecordItemEvent(id, eventType, itemTypeId, timelineId);
                    await CheckCharacterProgressAsync(eventType, itemTypeId);
                }
                catch (Exception ex) { Logger.Error("StatsService/RecordItemEvent", ex); }
            });
        }

        public static void RecordActivityEvent(string eventType)
        {
            long id = _currentSessionId;
            _ = Task.Run(() =>
            {
                try { _repo.RecordActivityEvent(id, eventType); }
                catch (Exception ex) { Logger.Error("StatsService/RecordActivityEvent", ex); }
            });
        }

        // ── Dev / test helpers ────────────────────────────────────────────────────

        public static void TriggerTestAchievement(string key)
        {
            _ = Task.Run(() =>
            {
                try
                {
                    var def = _repo.GetAchievementDef(key);
                    if (def == null)
                    {
                        Logger.Warn("StatsService/TriggerTest", $"Achievement key not found: {key}");
                        return;
                    }
                    BroadcastAchievement(def, characterKey: null, characterName: null);
                }
                catch (Exception ex) { Logger.Error("StatsService/TriggerTestAchievement", ex); }
            });
        }

        public static void TriggerRandom(string tier)
        {
            _ = Task.Run(() =>
            {
                try
                {
                    var def = _repo.GetRandomDef(tier);
                    if (def == null) return;
                    BroadcastAchievement(def, characterKey: null, characterName: null);
                }
                catch (Exception ex) { Logger.Error("StatsService/TriggerRandom", ex); }
            });
        }

        public static IEnumerable<object> GetAllKeysSummary() =>
            _repo.GetAllDefs().Select(d => new { key = d.AchievementKey, title = d.Title, tier = d.Tier });

        // ── Internal: character progression ──────────────────────────────────────

        private static async Task CheckCharacterProgressAsync(string eventType, int itemTypeId)
        {
            var contributions = _repo.GetContributionsForEvent(eventType, itemTypeId);
            foreach (var contrib in contributions)
            {
                _repo.AddCharacterPoints(contrib.CharacterKey, contrib.Points);
                var progress = _repo.GetCharacterProgress(contrib.CharacterKey);
                if (progress == null) continue;

                var newTiers = _repo.GetCharacterTiers(contrib.CharacterKey)
                    .Where(t => t.TierNumber > progress.HighestTierReached
                             && t.PointsRequired <= progress.PointsTotal)
                    .OrderBy(t => t.TierNumber);

                foreach (var tier in newTiers)
                {
                    _repo.UpdateHighestTier(contrib.CharacterKey, tier.TierNumber);
                    var charDef = _repo.GetCharacterDef(contrib.CharacterKey);
                    if (charDef == null) continue;

                    var milestoneDef = new AchievementDef
                    {
                        AchievementKey = $"{charDef.CharacterKey}_tier_{tier.TierNumber}",
                        Title          = tier.Title,
                        FlavorText     = tier.FlavorText,
                        Tier           = "milestone",
                        ImagePath      = tier.ImagePath ?? charDef.ImagePath,
                    };
                    BroadcastAchievement(milestoneDef, charDef.CharacterKey, charDef.CharacterName);
                }
            }
            await Task.CompletedTask;
        }

        // ── Internal: push broadcast ──────────────────────────────────────────────

        private static void BroadcastAchievement(AchievementDef def, string? characterKey, string? characterName)
        {
            string? imageBase64 = LoadImageBase64(def.ImagePath);

            var payload = new
            {
                achievementKey = def.AchievementKey,
                title          = def.Title,
                flavorText     = def.FlavorText,
                tier           = def.Tier,
                icon           = def.Icon,
                imageBase64,
                characterKey,
                characterName,
            };
            string json = JsonSerializer.Serialize(new { action = "AchievementUnlocked", payload });

            List<CoreWebView2> active;
            lock (_wvLock)
            {
                active = _webViews
                    .Select(r => r.TryGetTarget(out var t) ? t : null)
                    .Where(t => t != null)
                    .ToList()!;
            }

            // PostWebMessageAsJson must run on the UI thread.
            Application.OpenForms[0]?.BeginInvoke(() =>
            {
                foreach (var wv in active)
                {
                    try { wv.PostWebMessageAsJson(json); }
                    catch { /* window may have closed between snapshot and invoke */ }
                }
            });
        }

        private static string? LoadImageBase64(string? relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;
            try
            {
                string fullPath = Path.Combine(Application.StartupPath, "Resources", relativePath);
                if (!File.Exists(fullPath)) return null;
                byte[] bytes = File.ReadAllBytes(fullPath);
                string ext  = Path.GetExtension(fullPath).TrimStart('.').ToLower();
                string mime = ext is "jpg" or "jpeg" ? "image/jpeg" : "image/png";
                return $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
            }
            catch { return null; }
        }
    }
}

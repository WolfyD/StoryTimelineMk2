using System.Collections.Concurrent;
using SkiaSharp;

namespace StoryTimelineMk2.Database
{
    /// <summary>
    /// BL-16. A map is drawn from derived copies of its picture, never from the upload itself: an
    /// <b>overview</b> to pan around and a <b>detail</b> copy to zoom into, both capped. A 20000px
    /// stitched panorama then costs exactly what a 4000px one costs to display, which is the whole
    /// point — the writer's map can be any size their tool exported and the canvas does not care.
    ///
    /// The files live beside the thumbnails as <c>mapviews/{pictureId}-ov.webp</c> / <c>-dt.webp</c>,
    /// are written lazily, and are served over the same media origin as every other picture, so the
    /// browser's own cache handles eviction and nothing crosses the JSON bridge.
    ///
    /// <para><b>Known ceiling: no zoom past <see cref="DetailCap"/>.</b> Past that the detail copy is
    /// all there is, so text drawn smaller than one detail pixel cannot be read at any zoom. The
    /// upgrade path is a real tile pyramid — the same generator, sliced, written under the same
    /// convention — and the canvas asks for paths rather than computing them so it is one module's
    /// worth of change. Escalate when a writer says they cannot read their own map.</para>
    ///
    /// <para><b>Second ceiling: a PNG has to be opened whole to be reduced</b> — Skia scales only
    /// JPEG and WebP as it reads — so one over about 9800px square is refused and
    /// <see cref="MapItem.ViewError"/> tells the writer to re-export it. WebP and JPEG have no size
    /// limit here at all.</para>
    /// </summary>
    internal static class MapViews
    {
        /// <summary>Long edge of the copy the canvas pans around. 2048² is ~17 MB decoded.</summary>
        internal const int OverviewCap = 2048;

        /// <summary>Long edge of the copy the canvas swaps in when zoomed. 4096² is ~67 MB decoded.</summary>
        internal const int DetailCap = 4096;

        /// <summary>
        /// Lossy, because these are re-derivable copies of a file we still hold, not the archive —
        /// and a 4096² lossless WebP of a detailed map runs to tens of megabytes for a difference
        /// nobody can see on a hand-painted map.
        /// </summary>
        private const int Quality = 90;

        private static readonly ConcurrentDictionary<string, byte> _inFlight = new();

        /// <summary>
        /// Points each map at the views it can be drawn from, and starts writing the ones that are
        /// missing. A null path means "not ready yet, ask for it" — the map screen calls
        /// <c>EnsureMapViews</c> for the one map it is about to display rather than waiting here,
        /// because a read of this repo runs on the bridge's single data pump and blocking it for a
        /// list of maps would freeze every window's traffic behind it (the same reason thumbnails
        /// are warmed off-thread in <see cref="MediaRepo"/>).
        /// </summary>
        internal static void Attach(List<MapItem> maps)
        {
            var pending = maps.Where(m => !Resolve(m, generate: false)).ToList();
            if (pending.Count == 0) return;

            // ponytail: fire and forget, no progress and no push — the map screen asks for the one
            // it needs. Add a MapViewsReady broadcast if a map tree ever shows every map at once.
            _ = Task.Run(() =>
            {
                foreach (var map in pending)
                {
                    if (!_inFlight.TryAdd(map.PictureId!, 0)) continue;
                    try { Resolve(map, generate: true); }
                    finally { _inFlight.TryRemove(map.PictureId!, out _); }
                }
            });
        }

        /// <summary>
        /// The blocking form, for the one map the user is opening and is waiting on. Never throws: a
        /// picture that cannot be reduced leaves its paths null and the screen says so, which is far
        /// better than handing the canvas a 1.6 GB original and losing the tab.
        /// </summary>
        internal static void Ensure(MapItem map)
        {
            if (_inFlight.TryAdd(map.PictureId ?? "", 0))
            {
                try { Resolve(map, generate: true); }
                finally { _inFlight.TryRemove(map.PictureId ?? "", out _); }
                return;
            }
            // Another thread is already on it; take whatever is on disk now.
            Resolve(map, generate: false);
        }

        /// <summary>
        /// Fills <see cref="MapItem.OverviewPath"/> and <see cref="MapItem.DetailPath"/>. Returns
        /// false when something is still missing, which is the caller's cue to generate or to report
        /// "not ready". A picture inside a cap needs no copy at that level and is used directly.
        /// </summary>
        private static bool Resolve(MapItem map, bool generate)
        {
            if (string.IsNullOrEmpty(map.PictureId) || string.IsNullOrEmpty(map.PicturePath)) return true;

            int longEdge = Math.Max(map.PictureWidth ?? 0, map.PictureHeight ?? 0);
            if (longEdge == 0)
            {
                // Pictures imported before the size columns were written. Reading the header is
                // cheap, and getting this wrong would mean drawing the upload whole.
                longEdge = LongEdgeFromHeader(MediaRepo.ResolvePath(map.PicturePath));
            }
            if (longEdge == 0)
            {
                // Undecodable, or a format with no size in its header. Nothing to derive from.
                map.OverviewPath = map.PicturePath;
                map.DetailPath = map.PicturePath;
                return true;
            }

            bool ok = true;
            map.OverviewPath = Level(map, longEdge, OverviewCap, "ov", generate, ref ok);
            map.DetailPath = Level(map, longEdge, DetailCap, "dt", generate, ref ok);
            return ok;
        }

        private static string? Level(MapItem map, int longEdge, int cap, string tag, bool generate, ref bool ok)
        {
            if (longEdge <= cap) return map.PicturePath;    // already small enough to draw as-is

            string relative = $"mapviews/{map.PictureId}-{tag}.webp";
            string full = MediaRepo.ResolvePath(relative);
            if (File.Exists(full)) return relative;

            if (!generate)
            {
                ok = false;
                return null;
            }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(full)!);
                MediaRepo.WriteResized(MediaRepo.ResolvePath(map.PicturePath!), full, cap,
                    SKEncodedImageFormat.Webp, Quality);
                return relative;
            }
            catch (Exception ex)
            {
                Logger.Error("MapViews.Level", new InvalidOperationException(
                    $"Could not build the {cap}px view of map image '{map.PicturePath}'; the map cannot be drawn", ex));
                // The message from WriteResized is written for the writer, not the log — a PNG that is
                // too large to open names its size and says to re-export it. Carry it to the screen.
                map.ViewError = ex.Message;
                ok = false;
                return null;
            }
        }

        private static int LongEdgeFromHeader(string path)
        {
            try
            {
                using var codec = SKCodec.Create(path);
                return codec == null ? 0 : Math.Max(codec.Info.Width, codec.Info.Height);
            }
            catch (Exception ex)
            {
                Logger.Error("MapViews.LongEdgeFromHeader", new InvalidOperationException(
                    $"Could not read the size of map image '{path}'", ex));
                return 0;
            }
        }

        /// <summary>Both views of a picture, for when the picture itself is deleted.</summary>
        internal static IEnumerable<string> FilesFor(string pictureId)
        {
            yield return MediaRepo.ResolvePath($"mapviews/{pictureId}-ov.webp");
            yield return MediaRepo.ResolvePath($"mapviews/{pictureId}-dt.webp");
        }
    }
}

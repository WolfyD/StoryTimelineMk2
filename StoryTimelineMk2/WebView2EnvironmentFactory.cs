using Microsoft.Web.WebView2.Core;
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace StoryTimelineMk2
{
    /// <summary>
    /// Creates CoreWebView2Environment instances.
    ///
    /// When STORYTIMELINE_REMOTE_DEBUG_PORT is set, every window shares a single
    /// environment (same browser process, same CDP port) so Playwright can connect
    /// once and see all pages.  In normal use each window gets its own private
    /// environment (existing behaviour, no change).
    /// </summary>
    internal static class WebView2EnvironmentFactory
    {
        private static CoreWebView2Environment? _sharedEnv;
        private static readonly SemaphoreSlim _lock = new(1, 1);

        /// <param name="privateCacheSubfolder">
        ///   Subfolder name used in normal (non-test) mode, e.g. "main", "timeline", "edit".
        /// </param>
        public static async Task<CoreWebView2Environment> GetAsync(string privateCacheSubfolder)
        {
            string? debugPort = Environment.GetEnvironmentVariable("STORYTIMELINE_REMOTE_DEBUG_PORT");

            if (string.IsNullOrEmpty(debugPort))
            {
                // Normal mode — each window runs in its own isolated browser process.
                string cacheFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "StoryTimelineMk2_Cache",
                    privateCacheSubfolder);
                return await CoreWebView2Environment.CreateAsync(null, cacheFolder);
            }

            // Test mode — all windows share one browser process so Playwright's CDP
            // connection sees every page.  The environment is created once; subsequent
            // calls return the cached instance.
            await _lock.WaitAsync();
            try
            {
                if (_sharedEnv == null)
                {
                    string cacheFolder = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "StoryTimelineMk2_Cache", "test-shared");

                    var options = new CoreWebView2EnvironmentOptions
                    {
                        AdditionalBrowserArguments = $"--remote-debugging-port={debugPort}"
                    };
                    _sharedEnv = await CoreWebView2Environment.CreateAsync(null, cacheFolder, options);
                }
                return _sharedEnv;
            }
            finally
            {
                _lock.Release();
            }
        }
    }
}

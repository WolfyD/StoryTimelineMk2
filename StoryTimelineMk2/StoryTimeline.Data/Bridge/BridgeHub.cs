namespace StoryTimelineMk2.Bridge
{
    /// <summary>
    /// Every page currently connected, for the messages nobody asked for — an achievement
    /// unlocking, a calendar list changing after its editor closes. Replies to a request go
    /// straight back down the channel that carried it and never come through here.
    ///
    /// Channels are held weakly so a registration cannot keep a closed window alive, and a
    /// channel that reports failure is dropped rather than retried.
    /// </summary>
    public static class BridgeHub
    {
        private static readonly List<WeakReference<IBridgeChannel>> _channels = new();
        private static readonly object _lock = new();

        /// <summary>Registering the same channel twice is a no-op, so it never double-delivers.</summary>
        public static void Register(IBridgeChannel channel)
        {
            lock (_lock)
            {
                Prune();
                foreach (var reference in _channels)
                    if (reference.TryGetTarget(out var existing) && ReferenceEquals(existing, channel))
                        return;
                _channels.Add(new WeakReference<IBridgeChannel>(channel));
            }
        }

        public static void Unregister(IBridgeChannel channel)
        {
            lock (_lock)
            {
                _channels.RemoveAll(r => !r.TryGetTarget(out var t) || ReferenceEquals(t, channel));
            }
        }

        /// <summary>Live channel count, after dropping collected ones. Tests and diagnostics.</summary>
        public static int Count
        {
            get { lock (_lock) { Prune(); return _channels.Count; } }
        }

        /// <summary>Drops every channel. Tests only — a real host outlives its pages.</summary>
        public static void Clear()
        {
            lock (_lock) { _channels.Clear(); }
        }

        /// <summary>
        /// Sends <c>{ action, payload }</c> to every connected page.
        /// </summary>
        /// <returns>How many pages took it.</returns>
        public static int Broadcast(string action, object? payload = null)
        {
            List<IBridgeChannel> live = new();
            lock (_lock)
            {
                Prune();
                foreach (var reference in _channels)
                    if (reference.TryGetTarget(out var channel))
                        live.Add(channel);
            }

            // Posting can marshal to a UI thread, which must not happen under our lock.
            var message = new { action, payload };
            var dead = new List<IBridgeChannel>();
            int sent = 0;
            foreach (var channel in live)
            {
                try
                {
                    if (channel.Post(message)) sent++;
                    else dead.Add(channel);
                }
                catch (Exception ex)
                {
                    // One unreachable page must not stop the others. Logged with its stack rather
                    // than swallowed; there is no UI here to show it in, and the page is going away.
                    Logger.Error($"BridgeHub/Broadcast:{action}", ex);
                    dead.Add(channel);
                }
            }

            if (dead.Count > 0)
                lock (_lock)
                    _channels.RemoveAll(r => !r.TryGetTarget(out var t) || dead.Contains(t));

            return sent;
        }

        /// <summary>Caller holds _lock.</summary>
        private static void Prune() => _channels.RemoveAll(r => !r.TryGetTarget(out _));
    }
}

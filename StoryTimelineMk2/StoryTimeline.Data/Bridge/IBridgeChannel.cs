namespace StoryTimelineMk2.Bridge
{
    /// <summary>
    /// One connected page. The WinForms host wraps a WebView2; the local server (BL-68) will wrap
    /// a WebSocket. Implementations serialize the message themselves, because the wire formats
    /// differ (a string for WebView2, bytes for a socket) — the JSON shape must not.
    /// </summary>
    public interface IBridgeChannel
    {
        /// <summary>Deliver one message to this page.</summary>
        /// <returns>false when the page cannot be reached, e.g. its window is already gone.</returns>
        bool Post(object message);
    }
}
